use rusqlite::{Result, params, OptionalExtension, Connection};
use serde::{Deserialize, Serialize};

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
    pub advance_days: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaymentReminderItem {
    pub id: i64,
    pub contract_no: String,
    pub shipment_date: String,
    pub days_since_shipment: i64,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaymentRemindersResult {
    pub data: Vec<PaymentReminderItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReminderSettings {
    pub advance_days: i32,
}

pub fn get_shipment_reminder_settings(conn: &Connection) -> Result<ReminderSettings, String> {
    // Ensure settings table exists?
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
        [],
    ).map_err(|e| e.to_string())?;
    
    let val: Option<String> = conn.query_row(
        "SELECT value FROM settings WHERE key = 'shipment_reminder_advance_days'",
        [],
        |row| row.get(0),
    ).optional().map_err(|e| e.to_string())?;
    
    let advance_days = val.and_then(|v| v.parse::<i32>().ok()).unwrap_or(5);
    
    Ok(ReminderSettings { advance_days })
}

pub fn save_shipment_reminder_settings(conn: &Connection, advance_days: i32) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
        [],
    ).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
        params!["shipment_reminder_advance_days", advance_days.to_string()],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

pub fn get_shipment_reminders(conn: &Connection, advance_days: i32, limit: i32) -> Result<ShipmentRemindersResult, String> {
    let now = chrono::Local::now();
    let target = now + chrono::Duration::days(advance_days as i64);
    let target_date = target.format("%Y-%m-%d").to_string();
    
    let query = "
        SELECT 
            id, contractNo, shipmentDate, status
        FROM orders
        WHERE deletedAt IS NULL
          AND status != '已发货' 
          AND status != '已完成'
          AND shipmentDate IS NOT NULL 
          AND shipmentDate != ''
          AND shipmentDate <= ?
        ORDER BY shipmentDate ASC
        LIMIT ?
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![target_date, limit], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut data = Vec::new();
    
    for row in rows {
        if let Ok((id, contract_no_opt, shipment_date_opt, status_opt)) = row {
            let contract_no = contract_no_opt.unwrap_or_default();
            let shipment_date = shipment_date_opt.unwrap_or_default();
            let status = status_opt.unwrap_or_default();
            
            // Calculate days remaining
            let mut days_remaining = 0;
            if let Ok(sd) = chrono::NaiveDate::parse_from_str(&shipment_date, "%Y-%m-%d") {
                 let today_naive = now.date_naive();
                 days_remaining = (sd - today_naive).num_days();
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

pub fn get_payment_reminders(conn: &Connection, limit: i32) -> Result<PaymentRemindersResult, String> {
    // Logic: Order shipped (status = '已发货') and paymentDate is not set
    let query = "
        SELECT 
            id, contractNo, shipmentDate, status
        FROM orders
        WHERE deletedAt IS NULL
          AND status = '已发货'
          AND (paymentDate IS NULL OR paymentDate = '')
        ORDER BY shipmentDate ASC
        LIMIT ?
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([limit], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut data = Vec::new();
    let now = chrono::Local::now().date_naive();
    
    for row in rows {
        if let Ok((id, contract_no_opt, shipment_date_opt, status_opt)) = row {
            let contract_no = contract_no_opt.unwrap_or_default();
            let shipment_date = shipment_date_opt.unwrap_or_default();
            let status = status_opt.unwrap_or_default();
            
            let mut days_since_shipment = 0;
             if let Ok(sd) = chrono::NaiveDate::parse_from_str(&shipment_date, "%Y-%m-%d") {
                 days_since_shipment = (now - sd).num_days();
            }
            
            data.push(PaymentReminderItem {
                id,
                contract_no,
                shipment_date,
                days_since_shipment,
                status,
            });
        }
    }
    
    Ok(PaymentRemindersResult {
        data,
    })
}
