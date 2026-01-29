use crate::db::connection;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use crate::utils::fs::{append_app_log, ensure_dir};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupConfig {
    pub enabled: bool,
    pub path: String,
    pub interval_hours: i32,
    pub last_backup_time: u64, // Timestamp in seconds
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            path: String::new(),
            interval_hours: 24,
            last_backup_time: 0,
        }
    }
}

pub fn get_backup_config(app_handle: &AppHandle) -> Result<BackupConfig, String> {
    let conn = connection::open_db(app_handle).map_err(|e| e.to_string())?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
        [],
    ).map_err(|e| e.to_string())?;
    
    let mut config = BackupConfig::default();
    
    let keys = [
        "auto_backup_enabled",
        "auto_backup_path",
        "auto_backup_interval_hours",
        "auto_backup_last_time",
    ];
    
    for key in keys {
        let val: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = ?",
            [key],
            |row| row.get(0),
        ).optional().map_err(|e| e.to_string())?;
        
        if let Some(v) = val {
            match key {
                "auto_backup_enabled" => {
                    if let Ok(b) = v.parse::<bool>() { config.enabled = b; }
                },
                "auto_backup_path" => {
                    config.path = v;
                },
                "auto_backup_interval_hours" => {
                    if let Ok(i) = v.parse::<i32>() { config.interval_hours = i; }
                },
                "auto_backup_last_time" => {
                    if let Ok(t) = v.parse::<u64>() { config.last_backup_time = t; }
                },
                _ => {}
            }
        }
    }
    
    Ok(config)
}

/// 验证备份路径是否有效
/// 返回 Ok(true) 表示路径有效，Err 表示路径无效并附带错误信息
pub fn validate_backup_path(path: &str) -> Result<bool, String> {
    if path.is_empty() {
        return Err("备份路径不能为空".to_string());
    }
    
    let backup_path = PathBuf::from(path);
    
    // 检查路径的根目录（盘符）是否存在
    if let Some(root) = backup_path.components().next() {
        let root_path = PathBuf::from(root.as_os_str());
        if !root_path.exists() {
            return Err(format!(
                "驱动器 {} 不存在，请选择其他位置",
                root_path.display()
            ));
        }
    }
    
    // 尝试创建备份目录以验证路径有效性
    if let Err(e) = ensure_dir(&backup_path) {
        return Err(format!(
            "无法创建目录：{}",
            e
        ));
    }
    
    Ok(true)
}

pub fn save_backup_config(app_handle: &AppHandle, config: &BackupConfig) -> Result<(), String> {
    // 如果启用了自动备份，需要验证备份路径
    if config.enabled && !config.path.is_empty() {
        validate_backup_path(&config.path)?;
    }
    
    let conn = connection::open_db(app_handle).map_err(|e| e.to_string())?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
        [],
    ).map_err(|e| e.to_string())?;
    
    let settings = [
        ("auto_backup_enabled", config.enabled.to_string()),
        ("auto_backup_path", config.path.clone()),
        ("auto_backup_interval_hours", config.interval_hours.to_string()),
        ("auto_backup_last_time", config.last_backup_time.to_string()),
    ];
    
    for (key, value) in settings {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![key, value],
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

pub fn perform_backup(app_handle: &AppHandle) -> Result<String, String> {
    let config = get_backup_config(app_handle)?;
    if config.path.is_empty() {
        return Err("备份路径未设置".to_string());
    }
    
    let db_path = connection::get_db_path(app_handle)?;
    if !db_path.exists() {
        return Err("数据库文件不存在".to_string());
    }
    
    let backup_dir = PathBuf::from(&config.path);
    ensure_dir(&backup_dir).map_err(|e| format!("无法创建备份目录: {:?}", e))?;
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("erp_backup_{}.sqlite", timestamp);
    let dest_path = backup_dir.join(backup_filename);
    let dest_path_str = dest_path.to_string_lossy().to_string();
    
    // Use VACUUM INTO for a safe online backup
    let escaped_dest = dest_path_str.replace("'", "''");
    let conn = connection::open_db(app_handle)?;
    conn.execute(&format!("VACUUM INTO '{}'", escaped_dest), [])
        .map_err(|e| format!("备份失败 (VACUUM INTO): {:?}", e))?;
    
    // Clean up old backups (keep last 30)
    let _ = cleanup_old_backups(&backup_dir, 30);
    
    // Update last backup time
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let mut updated_config = config;
    updated_config.last_backup_time = now;
    save_backup_config(app_handle, &updated_config)?;
    
    append_app_log(app_handle, "INFO", &format!("自动备份成功: {}", dest_path_str));
    
    Ok(dest_path_str)
}

fn cleanup_old_backups(dir: &Path, keep_count: usize) -> Result<(), String> {
    if !dir.exists() || !dir.is_dir() {
        return Ok(());
    }
    
    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    if filename.starts_with("erp_backup_") && filename.ends_with(".sqlite") {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                backups.push((path, modified));
                            }
                        }
                    }
                }
            }
        }
    }
    
    if backups.len() > keep_count {
        backups.sort_by(|a, b| a.1.cmp(&b.1)); // Oldest first
        let to_delete = backups.len() - keep_count;
        for i in 0..to_delete {
            let _ = fs::remove_file(&backups[i].0);
        }
    }
    
    Ok(())
}

pub fn start_backup_manager(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Initial delay to avoid database busy at startup
        tokio::time::sleep(Duration::from_secs(10)).await;
        
        loop {
            let config_res = get_backup_config(&app_handle);
            if let Ok(config) = config_res {
                if config.enabled && !config.path.is_empty() {
                    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                    let interval_secs = (config.interval_hours as u64) * 3600;
                    
                    if now >= config.last_backup_time + interval_secs || config.last_backup_time == 0 {
                        println!("[Backup] 触发自动备份...");
                        match perform_backup(&app_handle) {
                            Ok(path) => println!("[Backup] 备份成功: {}", path),
                            Err(e) => eprintln!("[Backup] 备份失败: {}", e),
                        }
                    }
                }
            }
            
            // Check every 5 minutes
            tokio::time::sleep(Duration::from_secs(300)).await;
        }
    });
}
