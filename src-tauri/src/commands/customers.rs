use tauri::{State, AppHandle};
use crate::db::pool::DbPoolHolder;
use crate::commands::auth::{require_user, require_admin};
use crate::models::customer::*;
use crate::utils::common::*;

#[tauri::command]
pub fn customers_list(holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    
    // 查询客户列表，包含交易额统计（通过 LEFT JOIN 订单表）
    // 只统计未删除的订单（deletedAt IS NULL OR deletedAt = ''）
    let mut stmt = conn
        .prepare(
            "SELECT 
                COALESCE(c.id, c.rowid) AS id, 
                c.name, 
                c.address, 
                c.tel, 
                c.fax, 
                c.contact,
                COALESCE(SUM(COALESCE(o.totalUSD, 0)), 0) AS totalUSD
            FROM customers c
            LEFT JOIN orders o ON o.customerId = COALESCE(c.id, c.rowid)
                AND o.customerId IS NOT NULL
                AND (o.deletedAt IS NULL OR o.deletedAt = '')
            GROUP BY c.id, c.rowid, c.name, c.address, c.tel, c.fax, c.contact
            ORDER BY COALESCE(c.id, c.rowid) DESC"
        )
        .map_err(|e| format!("查询客户失败：{:?}", e))?;
    
    let rows = stmt
        .query_map([], |r| {
            Ok(CustomerRow {
                id: r.get(0)?,
                name: r.get(1)?,
                address: r.get(2).ok(),
                tel: r.get(3).ok(),
                fax: r.get(4).ok(),
                contact: r.get(5).ok(),
                total_usd: Some(r.get::<_, f64>(6).unwrap_or(0.0)),
                created_at: None,
                updated_at: None,
            })
        })
        .map_err(|e| format!("读取客户失败：{:?}", e))?;
    
    let mut data: Vec<CustomerRow> = Vec::new();
    for r in rows {
        data.push(r.map_err(|e| format!("{:?}", e))?);
    }
    
    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub fn customers_get(holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    
    // 查询单个客户，包含交易额统计
    let mut stmt = conn
        .prepare(
            "SELECT 
                COALESCE(c.id, c.rowid) AS id, 
                c.name, 
                c.address, 
                c.tel, 
                c.fax, 
                c.contact,
                COALESCE(SUM(COALESCE(o.totalUSD, 0)), 0) AS totalUSD
            FROM customers c
            LEFT JOIN orders o ON o.customerId = COALESCE(c.id, c.rowid)
                AND o.customerId IS NOT NULL
                AND (o.deletedAt IS NULL OR o.deletedAt = '')
            WHERE COALESCE(c.id, c.rowid) = ?
            GROUP BY c.id, c.rowid, c.name, c.address, c.tel, c.fax, c.contact"
        )
        .map_err(|e| format!("查询客户失败：{:?}", e))?;
    
    let customer = stmt
        .query_row([id], |r| {
            Ok(CustomerRow {
                id: r.get(0)?,
                name: r.get(1)?,
                address: r.get(2).ok(),
                tel: r.get(3).ok(),
                fax: r.get(4).ok(),
                contact: r.get(5).ok(),
                total_usd: Some(r.get::<_, f64>(6).unwrap_or(0.0)),
                created_at: None,
                updated_at: None,
            })
        })
        .map_err(|_| "客户不存在".to_string())?;
    
    Ok(serde_json::json!({ "success": true, "data": customer }))
}

#[tauri::command]
pub fn customers_create(app_handle: AppHandle, holder: State<DbPoolHolder>, payload: CustomerCreatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &payload.token)?;
    
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err("客户名称不能为空".to_string());
    }
    
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM customers WHERE name = ?", [&name], |r| r.get(0))
        .unwrap_or(0);
    if count > 0 {
        return Err("该客户名称已存在，请使用其他名称".to_string());
    }
    
    let now = now_iso_utc();
    
    conn.execute(
        "INSERT INTO customers (name, address, tel, fax, contact) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            name,
            payload.address.as_ref().map(|s| s.trim()),
            payload.tel.as_ref().map(|s| s.trim()),
            payload.fax.as_ref().map(|s| s.trim()),
            payload.contact.as_ref().map(|s| s.trim())
        ],
    )
    .map_err(|e| {
        if format!("{:?}", e).contains("UNIQUE") {
            "该客户名称已存在，请使用其他名称".to_string()
        } else {
            format!("创建客户失败：{:?}", e)
        }
    })?;
    
    let id = conn.last_insert_rowid();
    append_app_log(&app_handle, "INFO", &format!("用户 {} 创建客户: {} (ID: {})", user.username, name, id));
    
    Ok(serde_json::json!({
        "success": true,
        "data": {
            "id": id,
            "name": name,
            "address": payload.address,
            "tel": payload.tel,
            "fax": payload.fax,
            "contact": payload.contact,
            "totalUSD": 0.0,
            "createdAt": now,
            "updatedAt": now
        }
    }))
}

#[tauri::command]
pub fn customers_update(app_handle: AppHandle, holder: State<DbPoolHolder>, payload: CustomerUpdatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &payload.token)?;
    
    let current: (String, Option<String>, Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT name, address, tel, fax, contact FROM customers WHERE id = ?",
            [payload.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        )
        .map_err(|_| "客户不存在".to_string())?;
    
    let name = payload.name.unwrap_or(current.0).trim().to_string();
    if name.is_empty() {
        return Err("客户名称不能为空".to_string());
    }
    
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM customers WHERE name = ? AND id != ?",
            rusqlite::params![&name, payload.id],
            |r| r.get(0)
        )
        .unwrap_or(0);
    if count > 0 {
        return Err("该客户名称已存在，请使用其他名称".to_string());
    }
    
    let now = now_iso_utc();
    let address = payload.address.or(current.1);
    let tel = payload.tel.or(current.2);
    let fax = payload.fax.or(current.3);
    let contact = payload.contact.or(current.4);
    
    let changes = conn
        .execute(
            "UPDATE customers SET name = ?1, address = ?2, tel = ?3, fax = ?4, contact = ?5 WHERE id = ?6",
            rusqlite::params![name, address, tel, fax, contact, payload.id],
        )
        .map_err(|e| format!("更新客户失败：{:?}", e))?;
    
    append_app_log(&app_handle, "INFO", &format!("用户 {} 更新客户: {} (ID: {})", user.username, name, payload.id));
    
    // 获取更新后的客户信息（包含交易额）
    let mut get_stmt = conn
        .prepare(
            "SELECT 
                COALESCE(c.id, c.rowid) AS id, 
                c.name, 
                c.address, 
                c.tel, 
                c.fax, 
                c.contact,
                COALESCE(SUM(COALESCE(o.totalUSD, 0)), 0) AS totalUSD
            FROM customers c
            LEFT JOIN orders o ON o.customerId = COALESCE(c.id, c.rowid)
                AND o.customerId IS NOT NULL
                AND (o.deletedAt IS NULL OR o.deletedAt = '')
            WHERE COALESCE(c.id, c.rowid) = ?
            GROUP BY c.id, c.rowid, c.name, c.address, c.tel, c.fax, c.contact"
        )
        .map_err(|e| format!("查询更新后的客户失败：{:?}", e))?;
    
    let updated_customer = get_stmt
        .query_row([payload.id], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, String>(1)?,
                "address": r.get::<_, Option<String>>(2).ok(),
                "tel": r.get::<_, Option<String>>(3).ok(),
                "fax": r.get::<_, Option<String>>(4).ok(),
                "contact": r.get::<_, Option<String>>(5).ok(),
                "totalUSD": r.get::<_, f64>(6).unwrap_or(0.0),
                "updatedAt": now
            }))
        })
        .unwrap_or_else(|_| serde_json::json!({
            "id": payload.id,
            "name": name,
            "address": address,
            "tel": tel,
            "fax": fax,
            "contact": contact,
            "totalUSD": 0.0,
            "updatedAt": now
        }));
    
    Ok(serde_json::json!({
        "success": true,
        "data": updated_customer,
        "changes": changes
    }))
}

#[tauri::command]
pub fn customers_delete(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;
    
    let name: String = conn
        .query_row("SELECT name FROM customers WHERE id = ?", [id], |r| r.get(0))
        .map_err(|_| "客户不存在".to_string())?;
    
    let changes = conn
        .execute("DELETE FROM customers WHERE id = ?", [id])
        .map_err(|e| format!("删除客户失败：{:?}", e))?;
    
    append_app_log(&app_handle, "INFO", &format!("用户 {} 删除客户: {} (ID: {})", user.username, name, id));
    
    Ok(serde_json::json!({
        "success": true,
        "message": "删除成功",
        "changes": changes
    }))
}

#[tauri::command]
pub fn customers_clear(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_admin(&conn, &token)?;
    
    let changes = conn
        .execute("DELETE FROM customers", [])
        .map_err(|e| format!("清空客户失败：{:?}", e))?;
    
    append_app_log(&app_handle, "WARN", &format!("用户 {} 清空所有客户，共删除 {} 条记录", user.username, changes));
    
    Ok(serde_json::json!({
        "success": true,
        "ok": true,
        "message": format!("已清空所有客户，共删除 {} 条记录", changes),
        "changes": changes
    }))
}
