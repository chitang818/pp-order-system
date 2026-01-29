use tauri::{State, AppHandle};
use crate::db::pool::DbPoolHolder;
use crate::commands::auth::{require_user, require_admin};
use crate::models::company::*;
use crate::utils::common::*;

#[tauri::command]
pub fn company_get(_app_handle: AppHandle, holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    
    // 显式列出字段，防止 SELECT * 导致的索引错位
    let sql = "SELECT id, companyNameCN, companyNameEN, companyAddressCN, companyAddressEN, companyTel, companyFax, signAt, logoUrl, themeColor, fontSize, headerProduction, headerInvoice, headerPacking, headerSales FROM company LIMIT 1";
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    
    let company_result = stmt.query_row([], |r| {
        Ok(CompanyRow {
            id: r.get(0)?,
            company_name_cn: r.get(1).ok(),
            company_name_en: r.get(2).ok(),
            company_address_cn: r.get(3).ok(),
            company_address_en: r.get(4).ok(),
            company_tel: r.get(5).ok(),
            company_fax: r.get(6).ok(),
            sign_at: r.get(7).ok(),
            logo_url: r.get(8).ok(),
            theme_color: r.get(9).ok(),
            font_size: r.get(10).ok(),
            header_production: r.get(11).ok(),
            header_invoice: r.get(12).ok(),
            header_packing: r.get(13).ok(),
            header_sales: r.get(14).ok(),
        })
    });
    
    match company_result {
        Ok(company) => Ok(serde_json::json!({
            "success": true,
            "data": company
        })),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(serde_json::json!({
            "success": true,
            "data": null
        })),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn company_update(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;
    
    // 确保存在公司记录并获取ID
    let company_id: i64 = conn.query_row("SELECT id FROM company LIMIT 1", [], |r| r.get(0))
        .unwrap_or_else(|_| {
            let _ = conn.execute("INSERT INTO company (companyNameCn) VALUES ('')", []);
            conn.last_insert_rowid()
        });
    
    println!("[Company] Updating company info (ID: {}) for user: {}", company_id, user.username);

    // 动态构建更新语句
    if let serde_json::Value::Object(map) = payload {
        for (k, v) in map {
            if k == "id" || k == "token" { continue; }
            
            let sql = format!("UPDATE company SET {} = ? WHERE id = ?", k);
            let val_str = match v {
                serde_json::Value::String(s) => s,
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                serde_json::Value::Null => "".to_string(),
                _ => continue,
            };
            
            match conn.execute(&sql, rusqlite::params![val_str, company_id]) {
                Ok(_) => {},
                Err(e) => {
                    let err_msg = format!("数据库更新失败 (字段: {}): {}", k, e);
                    eprintln!("[Company] Error: {}", err_msg);
                    return Err(err_msg);
                }
            }
        }
    }
    
    append_app_log(&app_handle, "INFO", &format!("用户 {} 更新了公司信息", user.username));
    
    company_get(app_handle, holder, token)
}

#[tauri::command]
pub fn company_reset(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_admin(&conn, &token)?;
    
    conn.execute("DELETE FROM company", []).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO company (id, companyNameCn) VALUES (1, '')", []).map_err(|e| e.to_string())?;
    
    append_app_log(&app_handle, "WARN", &format!("用户 {} 重置了公司信息", user.username));
    
    company_get(app_handle, holder, token)
}

// Order configs
fn map_order_config_row(row: &rusqlite::Row) -> Result<OrderConfigRow, rusqlite::Error> {
    Ok(OrderConfigRow {
        id: row.get(0)?,
        category: row.get(1)?,
        value: row.get(2)?,
        sort_index: row.get(3)?,
    })
}

fn load_order_configs(conn: &rusqlite::Connection, category: Option<&str>) -> Result<Vec<OrderConfigRow>, rusqlite::Error> {
    let (sql, params) = match category {
        Some(cat) => ("SELECT id, category, value, sortIndex FROM order_configs WHERE category = ? ORDER BY sortIndex ASC, id ASC", vec![cat]),
        None => ("SELECT id, category, value, sortIndex FROM order_configs ORDER BY category ASC, sortIndex ASC, id ASC", vec![]),
    };
    
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params), map_order_config_row)?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

#[tauri::command]
pub fn order_configs_list(_app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, category: Option<String>) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    
    let configs = load_order_configs(&conn, category.as_deref()).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "success": true,
        "data": configs
    }))
}

#[tauri::command]
pub fn order_configs_batch(_app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, categories: Vec<String>) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    
    let mut result = serde_json::Map::new();
    for cat in categories {
        let configs = load_order_configs(&conn, Some(&cat)).map_err(|e| e.to_string())?;
        result.insert(cat, serde_json::json!(configs));
    }
    
    Ok(serde_json::json!({
        "success": true,
        "data": result
    }))
}

#[tauri::command]
pub fn order_config_create(app_handle: AppHandle, holder: State<DbPoolHolder>, payload: OrderConfigCreatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &payload.token)?;  // 修改：允许普通用户创建订单参数配置
    
    let now = now_iso_utc();
    conn.execute(
        "INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![
            payload.category,
            payload.value,
            payload.sort_index.unwrap_or(0),
            now,
            now
        ]
    ).map_err(|e| e.to_string())?;
    
    let id = conn.last_insert_rowid();
    append_app_log(&app_handle, "INFO", &format!("用户 {} 创建了配置项 ID: {}", user.username, id));
    
    Ok(serde_json::json!({
        "success": true,
        "data": {
            "id": id,
            "category": payload.category,
            "value": payload.value,
            "sortIndex": payload.sort_index.unwrap_or(0),
            "createdAt": now,
            "updatedAt": now
        }
    }))
}

#[tauri::command]
pub fn order_config_update(app_handle: AppHandle, holder: State<DbPoolHolder>, payload: OrderConfigUpdatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &payload.token)?;  // 修改：允许普通用户更新订单参数配置
    
    let now = now_iso_utc();
    conn.execute(
        "UPDATE order_configs SET value = ?, sortIndex = ?, updatedAt = ? WHERE id = ?",
        rusqlite::params![
            payload.value,
            payload.sort_index,
            now,
            payload.id
        ]
    ).map_err(|e| e.to_string())?;
    
    append_app_log(&app_handle, "INFO", &format!("用户 {} 更新了配置项 ID: {}", user.username, payload.id));
    
    Ok(serde_json::json!({
        "success": true,
        "message": "更新成功"
    }))
}

#[tauri::command]
pub fn order_config_delete(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;  // 修改：允许普通用户删除订单参数配置
    
    // (No restriction on system config since it's not in schema currently)
    
    conn.execute("DELETE FROM order_configs WHERE id = ?", [id]).map_err(|e| e.to_string())?;
    
    append_app_log(&app_handle, "WARN", &format!("用户 {} 删除了配置项 ID: {}", user.username, id));
    
    Ok(serde_json::json!({
        "success": true,
        "message": "删除成功"
    }))
}
