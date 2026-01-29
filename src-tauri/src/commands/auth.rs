use tauri::State;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use uuid::Uuid;
use crate::db::pool::DbPoolHolder;
use crate::db::users;
use crate::db::sessions;
use crate::utils::crypto::{hash_password_pbkdf2, verify_password_pbkdf2};
use crate::models::user::{AuthLoginPayload, AuthChangePasswordPayload, AuthUpdateMePayload, LoginResponse, AuthUser};

// Helper: 获取当前 ISO 时间
fn now_iso_utc() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

// Helper: 验证 Token 并返回用户
pub fn require_user(conn: &rusqlite::Connection, token: &str) -> Result<AuthUser, String> {
    let (user, expires_at) = sessions::get_user_by_token(conn, token)
        .map_err(|e| format!("数据库错误: {:?}", e))?
        .ok_or_else(|| "会话不存在或已过期".to_string())?;

    if user.status != "active" {
        return Err("用户已被禁用".to_string());
    }

    let now = now_iso_utc();
    if expires_at < now {
        return Err("会话已过期，请重新登录".to_string());
    }

    Ok(user)
}

// Helper: 验证 Admin 权限并返回用户
pub fn require_admin(conn: &rusqlite::Connection, token: &str) -> Result<AuthUser, String> {
    let u = require_user(conn, token)?;
    if u.role != "admin" {
        return Err("权限不足：需要管理员权限".to_string());
    }
    Ok(u)
}

#[tauri::command]
pub fn auth_login(app_handle: tauri::AppHandle, holder: State<DbPoolHolder>, payload: AuthLoginPayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| format!("获取数据库连接失败: {}", e))?;
    
    let username = payload.username.trim();
    if username.is_empty() {
        return Err("用户名不能为空".to_string());
    }
    if payload.password.trim().is_empty() {
        return Err("密码不能为空".to_string());
    }

    // 查找用户
    let (user, password_hash) = users::find_by_username(&conn, username)
        .map_err(|e| format!("查询用户失败: {:?}", e))?
        .ok_or_else(|| "用户名或密码错误".to_string())?;

    if user.status != "active" {
        return Err("用户已被禁用".to_string());
    }

    // 验证密码
    if !verify_password_pbkdf2(payload.password.trim(), &password_hash) {
        use crate::utils::fs::append_app_log;
        append_app_log(&app_handle, "WARN", &format!("用户登录失败(密码错误): {}", username));
        return Err("用户名或密码错误".to_string());
    }

    // 生成 Token
    let token = Uuid::new_v4().to_string();
    let now = now_iso_utc();
    
    // 有效期 30 天
    let expires_at = {
        use time::Duration;
        let offset_now = OffsetDateTime::now_utc();
        let expires = offset_now + Duration::days(30);
        expires.format(&Rfc3339).unwrap_or_else(|_| now.clone())
    };

    // 创建会话
    sessions::create_session(&conn, &token, user.id, &expires_at, &now)
        .map_err(|e| format!("创建会话失败: {:?}", e))?;

    // 更新最后登录时间
    users::update_last_login(&conn, user.id, &now).ok();

    use crate::utils::fs::append_app_log;
    append_app_log(&app_handle, "INFO", &format!("用户登录成功: {} (ID: {})", user.username, user.id));

    let response = LoginResponse {
        id: user.id,
        username: user.username.clone(),
        display_name: user.display_name.unwrap_or_else(|| user.username.clone()),
        avatar: user.avatar,
        role: user.role,
        token,
    };

    Ok(serde_json::json!({
        "success": true,
        "data": response
    }))
}

#[tauri::command]
pub fn auth_me(holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| format!("获取数据库连接失败: {}", e))?;
    let auth_user = require_user(&conn, &token)?;
    
    let user = users::find_by_id(&conn, auth_user.id)
        .map_err(|e| format!("查询用户失败: {:?}", e))?
        .ok_or_else(|| "用户不存在".to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "data": user
    }))
}

#[tauri::command]
pub fn auth_logout(app_handle: tauri::AppHandle, holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| format!("获取数据库连接失败: {}", e))?;
    
    // 尽量获取用户名用于日志（忽略错误）
    let _username = sessions::get_username_by_token(&conn, &token).ok().flatten();
    
    sessions::delete_session(&conn, &token)
        .map_err(|e| format!("登出失败: {:?}", e))?;
    
    if let Some(u) = _username {
        use crate::utils::fs::append_app_log;
        append_app_log(&app_handle, "INFO", &format!("用户登出: {}", u));
    }

    Ok(serde_json::json!({
        "success": true,
        "message": "登出成功"
    }))
}

#[tauri::command]
pub fn auth_change_password(holder: State<DbPoolHolder>, payload: AuthChangePasswordPayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| format!("获取数据库连接失败: {}", e))?;
    let user = require_user(&conn, &payload.token)?;

    if payload.new_password.trim().len() < 6 {
        return Err("新密码长度不能少于6位".to_string());
    }

    let current_hash = users::get_password_hash(&conn, user.id)
        .map_err(|_| "用户不存在".to_string())?;

    if !verify_password_pbkdf2(payload.old_password.trim(), &current_hash) {
        return Err("旧密码错误".to_string());
    }

    let new_hash = hash_password_pbkdf2(payload.new_password.trim());
    let now = now_iso_utc();

    users::update_password(&conn, user.id, &new_hash, &now)
        .map_err(|e| format!("更新密码失败: {:?}", e))?;

    // 强制登出所有设备
    sessions::delete_user_sessions(&conn, user.id).ok();

    Ok(serde_json::json!({
        "success": true,
        "message": "密码修改成功，请重新登录"
    }))
}

#[tauri::command]
pub fn auth_update_me(holder: State<DbPoolHolder>, payload: AuthUpdateMePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| format!("获取数据库连接失败: {}", e))?;
    let user = require_user(&conn, &payload.token)?; // 验证 Token 有效性

    let now = now_iso_utc();
    
    users::update_me(&conn, user.id, payload.display_name, payload.avatar, &now)
        .map_err(|e| format!("更新资料失败: {:?}", e))?;

    Ok(serde_json::json!({
        "success": true,
        "message": "资料更新成功"
    }))
}
