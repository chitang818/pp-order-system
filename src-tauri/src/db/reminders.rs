use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// 与 SQLite `date(shipmentDate)` 常见存库格式对齐：支持 `YYYY-MM-DD` 或 ISO 日期时间前缀
fn parse_order_date_naive(s: &str) -> Result<chrono::NaiveDate, chrono::ParseError> {
    let t = s.trim();
    let head = t.get(..10).unwrap_or(t);
    chrono::NaiveDate::parse_from_str(head, "%Y-%m-%d")
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShipmentReminderItem {
    pub id: i64,
    pub contract_no: String,
    pub shipment_date: String,
    pub status: String,
    pub days_remaining: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShipmentRemindersResult {
    pub data: Vec<ShipmentReminderItem>,
    #[serde(rename = "advanceDays", alias = "advance_days")]
    pub advance_days: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaymentReminderItem {
    pub id: i64,
    pub contract_no: String,
    pub invoice_no: Option<String>,
    pub shipment_date: String,
    pub payment_date: Option<String>,
    pub days_since_shipment: Option<i64>,
    pub total_usd: Option<f64>,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaymentRemindersResult {
    pub data: Vec<PaymentReminderItem>,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReminderSettings {
    /// 序列化给前端时用 camelCase，与 Node 接口一致；反序列化兼容 snake_case
    #[serde(rename = "advanceDays", alias = "advance_days")]
    pub advance_days: i32,
}

pub fn get_shipment_reminder_settings(conn: &Connection) -> Result<ReminderSettings, String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
        [],
    )
    .map_err(|e| e.to_string())?;

    let val: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'shipment_reminder_advance_days'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let advance_days = val
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(5);

    Ok(ReminderSettings { advance_days })
}

pub fn save_shipment_reminder_settings(conn: &Connection, advance_days: i32) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
        params!["shipment_reminder_advance_days", advance_days.to_string()],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// 与 `backend/services/ReminderService.js#getShipmentReminders` 一致：
/// 仅「今天～今天+提前天数」内的待发货日期，不含历史逾期单（避免桌面端整表旧单被当成提醒）。
pub fn get_shipment_reminders(
    conn: &Connection,
    advance_days: i32,
    limit: i32,
) -> Result<ShipmentRemindersResult, String> {
    // 与 Node `ReminderService` 一致：`today = new Date().toISOString().split('T')[0]`（UTC 日期）
    let today_utc = chrono::Utc::now().date_naive();
    let today_str = today_utc.format("%Y-%m-%d").to_string();

    let query = "
        SELECT 
            id, contractNo, shipmentDate, status
        FROM orders
        WHERE (deletedAt IS NULL OR deletedAt = '')
          AND status IS NOT NULL
          AND status != '已发货'
          AND status != '已完成'
          AND shipmentDate IS NOT NULL
          AND shipmentDate != ''
          AND date(shipmentDate) IS NOT NULL
          AND CAST(julianday(date(shipmentDate)) - julianday(date(?1)) AS INTEGER) >= 0
          AND CAST(julianday(date(shipmentDate)) - julianday(date(?2)) AS INTEGER) <= ?3
        ORDER BY date(shipmentDate) ASC
        LIMIT ?4
    ";

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(
            params![today_str, today_str, advance_days, limit],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let mut data = Vec::new();

    for row in rows {
        if let Ok((id, contract_no_opt, shipment_date_opt, status_opt)) = row {
            let contract_no = contract_no_opt.unwrap_or_default();
            let shipment_date = shipment_date_opt.unwrap_or_default();
            let status = status_opt.unwrap_or_default();

            let mut days_remaining = 0;
            if let Ok(sd) = parse_order_date_naive(&shipment_date) {
                days_remaining = (sd - today_utc).num_days();
            }

            data.push(ShipmentReminderItem {
                id,
                contract_no,
                shipment_date,
                status,
                days_remaining,
            });
        }
    }

    Ok(ShipmentRemindersResult {
        data,
        advance_days,
    })
}

/// 与 `backend/services/ReminderService.js#getPaymentReminders` 一致：
/// total_usd、invoice_no、paymentDate；发货后天数优先用 extras.pickupDate（拉货日）。
pub fn get_payment_reminders(conn: &Connection, limit: i32) -> Result<PaymentRemindersResult, String> {
    let today_utc = chrono::Utc::now().date_naive();
    let today_str = today_utc.format("%Y-%m-%d").to_string();

    let query = "
        SELECT 
            o.id,
            o.contractNo,
            o.invoiceNo,
            o.totalUSD,
            o.paymentDate,
            o.shipmentDate,
            o.status,
            CASE 
                WHEN json_extract(o.extras, '$.pickupDate') IS NOT NULL 
                    AND trim(cast(json_extract(o.extras, '$.pickupDate') AS TEXT)) != ''
                    AND date(json_extract(o.extras, '$.pickupDate')) IS NOT NULL
                THEN CAST(
                    julianday(date(?1)) - julianday(date(json_extract(o.extras, '$.pickupDate')))
                    AS INTEGER
                )
                ELSE NULL
            END AS days_since_shipment
        FROM orders o
        WHERE (o.deletedAt IS NULL OR o.deletedAt = '')
          AND o.status = '已发货'
          AND (
              o.paymentDate IS NULL
              OR o.paymentDate = ''
              OR date(o.paymentDate) IS NULL
              OR julianday(date(o.paymentDate)) - julianday(date(?2)) >= 0
          )
        ORDER BY 
            CASE 
                WHEN o.paymentDate IS NOT NULL AND o.paymentDate != '' AND date(o.paymentDate) IS NOT NULL
                THEN date(o.paymentDate)
                ELSE '9999-12-31'
            END ASC,
            o.createdAt DESC
        LIMIT ?3
    ";

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![today_str, today_str, limit], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<f64>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<i64>>(7)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut data = Vec::new();

    for row in rows {
        if let Ok((
            id,
            contract_no_opt,
            invoice_no,
            total_usd,
            payment_date,
            shipment_date_opt,
            status_opt,
            days_since_shipment,
        )) = row
        {
            let contract_no = contract_no_opt.unwrap_or_default();
            let shipment_date = shipment_date_opt.unwrap_or_default();
            let status = status_opt.unwrap_or_default();

            data.push(PaymentReminderItem {
                id,
                contract_no,
                invoice_no,
                shipment_date,
                payment_date,
                days_since_shipment,
                total_usd,
                status,
            });
        }
    }

    let count_query = "
        SELECT COUNT(*)
        FROM orders o
        WHERE (o.deletedAt IS NULL OR o.deletedAt = '')
          AND o.status = '已发货'
          AND (
              o.paymentDate IS NULL
              OR o.paymentDate = ''
              OR date(o.paymentDate) IS NULL
              OR julianday(date(o.paymentDate)) - julianday(date(?1)) >= 0
          )
    ";
    let total: i64 = conn
        .query_row(count_query, params![today_str], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    Ok(PaymentRemindersResult { data, total })
}
