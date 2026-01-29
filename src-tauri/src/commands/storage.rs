use tauri::{AppHandle, State};
use std::fs;
use std::path::{Path, PathBuf};
use crate::db::pool::DbPoolHolder;
use crate::utils::fs::*;
use crate::utils::fs::append_app_log;

#[derive(Debug, Clone, serde::Serialize)]
pub struct DbPathInfo {
    pub db_path: String,
    pub exists: bool,
    pub file_size: u64,
}

#[tauri::command]
pub fn db_get_path(app_handle: AppHandle) -> Result<DbPathInfo, String> {
    let p = crate::db::connection::get_db_path(&app_handle).map_err(|e| e.to_string())?;
    let (exists, file_size) = match fs::metadata(&p) {
        Ok(m) => (true, m.len()),
        Err(_) => (false, 0),
    };
    Ok(DbPathInfo {
        db_path: p.to_string_lossy().to_string(),
        exists,
        file_size,
    })
}

#[tauri::command]
pub fn db_stats(app_handle: AppHandle, holder: State<DbPoolHolder>) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let info = db_get_path(app_handle).map_err(|e| e.to_string())?;
    let _conn = pool.get().map_err(|e| format!("数据库连接池异常: {}", e))?;
    Ok(serde_json::json!({
        "success": true,
        "dbPath": info.db_path,
        "exists": info.exists,
        "fileSize": info.file_size
    }))
}

#[tauri::command]
pub fn storage_open_dir(app_handle: AppHandle) -> Result<bool, String> {
    let info = db_get_path(app_handle).map_err(|e| e.to_string())?;
    let p = PathBuf::from(&info.db_path);
    let dir = p.parent().unwrap_or_else(|| Path::new(&info.db_path));
    open_dir_in_file_manager(dir).map_err(|e| format!("{:?}", e))?;
    Ok(true)
}

#[tauri::command]
pub fn db_backup(app_handle: AppHandle, holder: State<DbPoolHolder>, dest_path: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let info = db_get_path(app_handle.clone()).map_err(|e| e.to_string())?;
    if !info.exists {
        return Err(format!("数据库文件不存在：{}", info.db_path));
    }

    let src = PathBuf::from(&info.db_path);
    let dest = PathBuf::from(&dest_path);
    if let Some(parent) = dest.parent() {
        ensure_dir(parent).map_err(|e| format!("{:?}", e))?;
    }

    let escaped_dest = dest_path.replace("'", "''");
    let conn = pool.get().map_err(|e| format!("获取数据库连接失败: {}", e))?;
    conn.execute(&format!("VACUUM INTO '{}'", escaped_dest), [])
        .map_err(|e| format!("VACUUM INTO 失败：{:?}", e))?;
    drop(conn);

    let size = fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    append_app_log(&app_handle, "INFO", &format!("db_backup: {} -> {} ({} bytes)", src.display(), dest.display(), size));

    Ok(serde_json::json!({
        "success": true,
        "destPath": dest_path,
        "fileSize": size
    }))
}

#[tauri::command]
pub async fn db_restore(app_handle: AppHandle, _holder: State<'_, DbPoolHolder>, src_path: String, auto_backup: Option<bool>) -> Result<serde_json::Value, String> {
    append_app_log(&app_handle, "INFO", &format!("db_restore (legacy): 收到恢复请求，将重定向到新流程，源文件: {}", src_path));
    
    // 调用新的准备恢复命令
    crate::commands::database::db_prepare_restore(
        app_handle, 
        src_path, 
        auto_backup.unwrap_or(true)
    ).map(|mut res| {
        // 为了兼容旧版前端，确保包含 requireRestart
        if let Some(obj) = res.as_object_mut() {
            obj.insert("requireRestart".to_string(), serde_json::Value::Bool(true));
        }
        res
    })
}

#[tauri::command]
pub fn db_reset(app_handle: AppHandle, _holder: State<DbPoolHolder>, password: String) -> Result<serde_json::Value, String> {
    if password.trim() != "pp520" {
        return Err("密码验证失败".to_string());
    }

    let db_path = crate::db::connection::get_db_path(&app_handle).map_err(|e| format!("{:?}", e))?;
    append_app_log(&app_handle, "INFO", &format!("db_reset: 开始系统初始化，路径: {}", db_path.display()));

    let delete_pending_path = db_path.with_file_name("erp.sqlite.delete_pending");
    match fs::write(&delete_pending_path, "DELETE_ON_RESTART") {
        Ok(_) => {
            append_app_log(&app_handle, "INFO", &format!("db_reset: 已创建删除标记文件: {:?}", delete_pending_path));
            Ok(serde_json::json!({
                "success": true,
                "ok": true,
                "message": "系统初始化请求已提交。应用将重启以完成初始化。",
                "requireRestart": true
            }))
        },
        Err(e) => {
            let error_msg = format!("无法创建删除标记文件: {}", e);
            append_app_log(&app_handle, "ERROR", &format!("db_reset: {}", error_msg));
            Err(error_msg)
        }
    }
}
