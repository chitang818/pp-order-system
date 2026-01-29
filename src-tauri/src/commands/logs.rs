use crate::db::logs;
use crate::db::pool::DbPoolHolder;
use crate::commands::auth::require_user;
use tauri::{command, State};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsListPayload {
    token: String,
    page: Option<i32>,
    page_size: Option<i32>,
    module: Option<String>,
    user_id: Option<i64>,
    operation: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct LogsActionPayload {
    token: String,
    id: Option<i64>, // For delete
    days: Option<i32>, // For clean
}

#[command]
pub fn logs_list(holder: State<DbPoolHolder>, payload: LogsListPayload) -> Result<logs::LogsListResult, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _user = require_user(&conn, &payload.token)?;
    
    logs::list_operation_logs(
        &conn,
        payload.page.unwrap_or(1),
        payload.page_size.unwrap_or(50),
        payload.module,
        payload.user_id,
        payload.operation,
        payload.start_date,
        payload.end_date
    ).map_err(|e| e.to_string())
}

#[command]
pub fn logs_delete(holder: State<DbPoolHolder>, payload: LogsActionPayload) -> Result<logs::ChangesResult, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &payload.token)?;
    
    if user.role != "admin" {
        return Err("权限不足：需要管理员权限".to_string());
    }
    
    let id = payload.id.ok_or("缺少参数 id".to_string())?;
    let changes = logs::delete_operation_log(&conn, id).map_err(|e| e.to_string())?;
    
    let _ = logs::create_operation_log(
        &conn,
        Some(user.id),
        Some(user.username),
        "删除日志",
        "操作日志",
        Some(id.to_string()),
        Some("删除单条日志".to_string()),
        None,
        None,
        Some("success".to_string()),
        None
    );
    
    Ok(logs::ChangesResult { changes: changes as usize })
}

#[command]
pub fn logs_clear(holder: State<DbPoolHolder>, token: String) -> Result<logs::ChangesResult, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;
    
    if user.role != "admin" {
        return Err("权限不足：需要管理员权限".to_string());
    }
    
    let changes = logs::clear_operation_logs(&conn).map_err(|e| e.to_string())?;
    
    let _ = logs::create_operation_log(
        &conn,
        Some(user.id),
        Some(user.username),
        "清空日志",
        "操作日志",
        None,
        Some(format!("清空了 {} 条日志", changes)),
        None,
        None,
        Some("success".to_string()),
        None
    );

    Ok(logs::ChangesResult { changes: changes as usize })
}

#[command]
pub fn logs_clean(holder: State<DbPoolHolder>, payload: LogsActionPayload) -> Result<logs::ChangesResult, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &payload.token)?;
    
    if user.role != "admin" {
        return Err("权限不足：需要管理员权限".to_string());
    }
    
    let days = payload.days.unwrap_or(90);
    let changes = logs::clean_old_operation_logs(&conn, days).map_err(|e| e.to_string())?;
    
    let _ = logs::create_operation_log(
        &conn,
        Some(user.id),
        Some(user.username),
        "清理旧日志",
        "操作日志",
        Some(format!("保留 {} 天", days)),
        Some(format!("清理了 {} 条日志", changes)),
        None,
        None,
        Some("success".to_string()),
        None
    );

    Ok(logs::ChangesResult { changes: changes as usize })
}
