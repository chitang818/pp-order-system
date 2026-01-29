use rusqlite::Connection;
use tauri::AppHandle;
use std::path::PathBuf;
use crate::utils::paths::{DatabaseConfig, get_default_db_path};

pub fn get_db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let config = DatabaseConfig::load(app_handle).map_err(|e| e.to_string())?;
    
    if config.db_path.is_empty() {
        Ok(get_default_db_path(app_handle))
    } else {
        Ok(PathBuf::from(config.db_path))
    }
}

pub fn open_db(app_handle: &AppHandle) -> Result<Connection, String> {
    let db_path = get_db_path(app_handle)?;
    
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("无法打开数据库 {:?}: {}", db_path, e))?;
        
    // 启用外键约束（每次连接都需要设置）
    conn.execute("PRAGMA foreign_keys = ON;", [])
        .map_err(|e| format!("设置 PRAGMA 失败: {}", e))?;
    conn.execute("PRAGMA busy_timeout = 5000;", [])
        .ok();
        
    Ok(conn)
}
