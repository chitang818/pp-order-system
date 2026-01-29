use tauri::State;
use crate::db::pool::DbPoolHolder;
use crate::commands::auth::{require_user, require_admin};
use crate::models::user::*;
use crate::utils::common::*;
use crate::utils::crypto::hash_password_pbkdf2;

#[tauri::command]
pub fn users_list(holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;

    let mut stmt = conn
        .prepare("SELECT id, username, displayName, avatar, role, status, lastLoginAt, createdAt, updatedAt FROM users ORDER BY createdAt DESC")
        .map_err(|e| format!("查询用户失败：{:?}", e))?;

    let rows = stmt
        .query_map([], |r| {
            Ok(UserRow {
                id: r.get(0)?,
                username: r.get(1)?,
                display_name: r.get(2).ok(),
                avatar: r.get(3).ok(),
                role: r.get(4).ok(),
                status: r.get(5).ok(),
                last_login_at: r.get(6).ok(),
                created_at: r.get(7).ok(),
                updated_at: r.get(8).ok(),
            })
        })
        .map_err(|e| format!("读取用户失败：{:?}", e))?;

    let mut data: Vec<UserRow> = Vec::new();
    for r in rows {
        data.push(r.map_err(|e| format!("{:?}", e))?);
    }
    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub fn users_create(holder: State<DbPoolHolder>, payload: UsersCreatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let admin = require_admin(&conn, &payload.token)?;

    let username = payload.username.trim().to_string();
    if username.is_empty() {
        return Err("用户名不能为空".to_string());
    }
    if payload.password.trim().len() < 6 {
        return Err("密码不能为空且长度不能少于6位".to_string());
    }

    let now = now_iso_utc();
    let password_hash = hash_password_pbkdf2(payload.password.trim());
    let display_name = payload.display_name.clone().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| username.clone());
    let role = payload.role.clone().unwrap_or_else(|| "user".to_string());

    let res = conn.execute(
        "INSERT INTO users (username, password, displayName, avatar, role, status, createdAt, updatedAt, createdBy)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?7, ?8)",
        rusqlite::params![username, password_hash, display_name, payload.avatar, role, now, now, admin.id],
    );

    match res {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            Ok(serde_json::json!({ "success": true, "message": "创建成功", "data": { "id": id, "username": username } }))
        }
        Err(e) => {
            if format!("{:?}", e).contains("UNIQUE") {
                Err("用户名已存在".to_string())
            } else {
                Err(format!("创建用户失败：{:?}", e))
            }
        }
    }
}

#[tauri::command]
pub fn users_update(holder: State<DbPoolHolder>, payload: UsersUpdatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _admin = require_admin(&conn, &payload.token)?;

    let now = now_iso_utc();
    
    // 获取当前用户资料
    let current_role: String = conn
        .query_row("SELECT role FROM users WHERE id = ?", [payload.id], |r| r.get(0))
        .map_err(|_| "用户不存在".to_string())?;

    // 如果尝试更改角色
    let role = payload.role.unwrap_or(current_role);

    let changes = conn.execute(
        "UPDATE users SET displayName = COALESCE(?, displayName), avatar = COALESCE(?, avatar), role = ?, status = COALESCE(?, status), updatedAt = ? WHERE id = ?",
        rusqlite::params![payload.display_name, payload.avatar, role, payload.status, now, payload.id],
    ).map_err(|e| format!("更新用户失败：{:?}", e))?;

    Ok(serde_json::json!({ "success": true, "result": { "changes": changes } }))
}

#[tauri::command]
pub fn users_reset_password(holder: State<DbPoolHolder>, payload: UsersResetPasswordPayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _admin = require_admin(&conn, &payload.token)?;

    if payload.new_password.trim().len() < 6 {
        return Err("新密码长度不能少于6位".to_string());
    }
    let now = now_iso_utc();
    let password_hash = hash_password_pbkdf2(payload.new_password.trim());

    let changes = conn
        .execute(
            "UPDATE users SET password = ?1, updatedAt = ?2 WHERE id = ?3",
            rusqlite::params![password_hash, now, payload.id],
        )
        .map_err(|e| format!("重置密码失败：{:?}", e))?;

    if changes == 0 {
        return Err("用户不存在".to_string());
    }

    // 删除该用户所有会话（强制重新登录）
    let _ = conn.execute("DELETE FROM sessions WHERE userId = ?1", [payload.id]);

    Ok(serde_json::json!({ "success": true, "message": "密码重置成功" }))
}

#[tauri::command]
pub fn users_delete(holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let admin = require_admin(&conn, &token)?;

    if id == admin.id {
        return Err("不能删除自己".to_string());
    }
    let username: String = conn
        .query_row("SELECT username FROM users WHERE id = ?1", [id], |r| r.get(0))
        .map_err(|_| "用户不存在".to_string())?;
    if username == "admin" {
        return Err("不能删除默认管理员账户".to_string());
    }

    let changes = conn
        .execute("DELETE FROM users WHERE id = ?1", [id])
        .map_err(|e| format!("删除用户失败：{:?}", e))?;

    Ok(serde_json::json!({ "success": true, "message": "删除成功", "data": { "changes": changes } }))
}
