use tauri::{State, AppHandle};
use crate::db::pool::DbPoolHolder;
use crate::commands::auth::{require_user, require_admin};
use crate::models::forwarder::*;
use crate::utils::common::*;

/// 获取货代列表（支持分页）
#[tauri::command]
pub fn forwarders_list(holder: State<DbPoolHolder>, token: String, page: Option<i64>, page_size: Option<i64>) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    
    // 计算分页参数
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(20).max(1).min(100);
    let offset = (page - 1) * page_size;
    
    // 查询总数
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM forwarders", [], |r| r.get(0))
        .unwrap_or(0);
    
    // 查询货代列表（使用数据库实际列名：tel, fax, remarks）
    let mut stmt = conn
        .prepare(
            "SELECT 
                COALESCE(id, rowid) AS id, 
                name, 
                address, 
                tel, 
                fax,
                contact,
                email,
                remarks
            FROM forwarders
            ORDER BY COALESCE(id, rowid) DESC
            LIMIT ? OFFSET ?"
        )
        .map_err(|e| format!("查询货代失败：{:?}", e))?;
    
    let rows = stmt
        .query_map([page_size, offset], |r| {
            Ok(ForwarderRow {
                id: r.get(0)?,
                name: r.get(1)?,
                address: r.get(2).ok(),
                tel: r.get(3).ok(),
                fax: r.get(4).ok(),
                contact: r.get(5).ok(),
                email: r.get(6).ok(),
                remarks: r.get(7).ok(),
            })
        })
        .map_err(|e| format!("读取货代失败：{:?}", e))?;
    
    let mut data: Vec<ForwarderRow> = Vec::new();
    for r in rows {
        data.push(r.map_err(|e| format!("{:?}", e))?);
    }
    
    let total_pages = (total as f64 / page_size as f64).ceil() as i64;
    
    Ok(serde_json::json!({
        "success": true,
        "data": data,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": total_pages
    }))
}

/// 获取单个货代详情
#[tauri::command]
pub fn forwarders_get(holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    
    let mut stmt = conn
        .prepare(
            "SELECT 
                COALESCE(id, rowid) AS id, 
                name, 
                address, 
                tel, 
                fax,
                contact,
                email,
                remarks
            FROM forwarders
            WHERE COALESCE(id, rowid) = ?"
        )
        .map_err(|e| format!("查询货代失败：{:?}", e))?;
    
    let forwarder = stmt
        .query_row([id], |r| {
            Ok(ForwarderRow {
                id: r.get(0)?,
                name: r.get(1)?,
                address: r.get(2).ok(),
                tel: r.get(3).ok(),
                fax: r.get(4).ok(),
                contact: r.get(5).ok(),
                email: r.get(6).ok(),
                remarks: r.get(7).ok(),
            })
        })
        .map_err(|_| "货代不存在".to_string())?;
    
    Ok(serde_json::json!({ "success": true, "data": forwarder }))
}

/// 创建货代
#[tauri::command]
pub fn forwarders_create(app_handle: AppHandle, holder: State<DbPoolHolder>, payload: ForwarderCreatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &payload.token)?;
    
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err("货代名称不能为空".to_string());
    }
    
    // 检查重名
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM forwarders WHERE name = ?", [&name], |r| r.get(0))
        .unwrap_or(0);
    if count > 0 {
        return Err("该货代名称已存在，请使用其他名称".to_string());
    }
    
    // 使用数据库实际列名：tel, fax, remarks（无 createdAt/updatedAt/status 列）
    conn.execute(
        "INSERT INTO forwarders (name, address, tel, fax, contact, email, remarks) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            name,
            payload.address.as_ref().map(|s| s.trim()),
            payload.tel.as_ref().map(|s| s.trim()),
            payload.fax.as_ref().map(|s| s.trim()),
            payload.contact.as_ref().map(|s| s.trim()),
            payload.email.as_ref().map(|s| s.trim()),
            payload.remarks.as_ref().map(|s| s.trim())
        ],
    )
    .map_err(|e| {
        if format!("{:?}", e).contains("UNIQUE") {
            "该货代名称已存在，请使用其他名称".to_string()
        } else {
            format!("创建货代失败：{:?}", e)
        }
    })?;
    
    let id = conn.last_insert_rowid();
    append_app_log(&app_handle, "INFO", &format!("用户 {} 创建货代: {} (ID: {})", user.username, name, id));
    
    Ok(serde_json::json!({
        "success": true,
        "data": {
            "id": id,
            "name": name,
            "address": payload.address,
            "tel": payload.tel,
            "fax": payload.fax,
            "contact": payload.contact,
            "email": payload.email,
            "remarks": payload.remarks
        }
    }))
}

/// 更新货代
#[tauri::command]
pub fn forwarders_update(app_handle: AppHandle, holder: State<DbPoolHolder>, payload: ForwarderUpdatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &payload.token)?;
    
    // 获取当前值（使用实际列名：tel, fax）
    let current: (String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT name, address, tel, fax, contact, email, remarks FROM forwarders WHERE id = ?",
            [payload.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?))
        )
        .map_err(|_| "货代不存在".to_string())?;
    
    let name = payload.name.unwrap_or(current.0).trim().to_string();
    if name.is_empty() {
        return Err("货代名称不能为空".to_string());
    }
    
    // 检查重名（排除自身）
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM forwarders WHERE name = ? AND id != ?",
            rusqlite::params![&name, payload.id],
            |r| r.get(0)
        )
        .unwrap_or(0);
    if count > 0 {
        return Err("该货代名称已存在，请使用其他名称".to_string());
    }
    
    let address = payload.address.or(current.1);
    let tel = payload.tel.or(current.2);
    let fax = payload.fax.or(current.3);
    let contact = payload.contact.or(current.4);
    let email = payload.email.or(current.5);
    let remarks = payload.remarks.or(current.6);
    
    conn.execute(
        "UPDATE forwarders SET name = ?1, address = ?2, tel = ?3, fax = ?4, contact = ?5, email = ?6, remarks = ?7 WHERE id = ?8",
        rusqlite::params![name, address, tel, fax, contact, email, remarks, payload.id],
    )
    .map_err(|e| format!("更新货代失败：{:?}", e))?;
    
    append_app_log(&app_handle, "INFO", &format!("用户 {} 更新货代: {} (ID: {})", user.username, name, payload.id));
    
    Ok(serde_json::json!({
        "success": true,
        "data": {
            "id": payload.id,
            "name": name,
            "address": address,
            "tel": tel,
            "fax": fax,
            "contact": contact,
            "email": email,
            "remarks": remarks
        }
    }))
}

/// 删除货代
#[tauri::command]
pub fn forwarders_delete(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;
    
    let name: String = conn
        .query_row("SELECT name FROM forwarders WHERE id = ?", [id], |r| r.get(0))
        .map_err(|_| "货代不存在".to_string())?;
    
    let changes = conn
        .execute("DELETE FROM forwarders WHERE id = ?", [id])
        .map_err(|e| format!("删除货代失败：{:?}", e))?;
    
    append_app_log(&app_handle, "INFO", &format!("用户 {} 删除货代: {} (ID: {})", user.username, name, id));
    
    Ok(serde_json::json!({
        "success": true,
        "message": "删除成功",
        "changes": changes
    }))
}

/// 清空所有货代（仅管理员）
#[tauri::command]
pub fn forwarders_clear(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_admin(&conn, &token)?;
    
    let changes = conn
        .execute("DELETE FROM forwarders", [])
        .map_err(|e| format!("清空货代失败：{:?}", e))?;
    
    append_app_log(&app_handle, "WARN", &format!("用户 {} 清空所有货代，共删除 {} 条记录", user.username, changes));
    
    Ok(serde_json::json!({
        "success": true,
        "ok": true,
        "message": format!("已清空所有货代，共删除 {} 条记录", changes),
        "changes": changes
    }))
}
