use crate::utils::paths::{DatabaseConfig, get_default_db_path};
use crate::db::pool::{init_pool, DbPoolHolder};
use rusqlite::Connection;
use std::fs;
use std::path::{PathBuf};
use crate::db::backup::{self, BackupConfig};
use crate::db::restore::{self, RestoreConfig};
use crate::backend::BackendProcess;
use tauri::{AppHandle, Manager, command, State};
use crate::utils::fs::append_app_log;
use std::sync::Arc;
use chrono;
use serde_json;

#[command]
pub async fn db_init_connection(app_handle: AppHandle, holder: State<'_, DbPoolHolder>) -> Result<String, String> {
    // 如果已经初始化过了，直接返回路径
    if holder.is_initialized() {
        let config = DatabaseConfig::load(&app_handle)?;
        return Ok(config.db_path);
    }

    let db_path_res = crate::db::connection::get_db_path(&app_handle);
    let db_path = match db_path_res {
        Ok(p) => p,
        Err(e) => {
            let err = format!("获取数据库路径失败: {}", e);
            append_app_log(&app_handle, "ERROR", &err);
            return Err(err);
        }
    };

    // ====== 关键修复：检查是否有待处理的数据库操作标记 ======
    // 如果存在 delete_pending 或 restore_pending 标记，说明后台线程正在/即将处理
    // 此时不应该初始化连接池，否则会锁定文件导致删除/恢复失败
    let delete_pending_path = db_path.with_file_name("erp.sqlite.delete_pending");
    
    if delete_pending_path.exists() {
        append_app_log(&app_handle, "INFO", "检测到数据库删除标记，等待后台处理完成...");
        
        // 等待后台线程处理完成（最多等待 5 秒）
        for i in 0..10 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if !delete_pending_path.exists() {
                append_app_log(&app_handle, "INFO", &format!("删除标记已清除，等待了 {}ms", (i + 1) * 500));
                break;
            }
        }
        
        // 如果标记仍然存在，说明后台线程处理失败或未运行
        if delete_pending_path.exists() {
            append_app_log(&app_handle, "WARN", "删除标记等待超时，尝试主动删除数据库文件...");
            // 主动尝试删除
            let _ = std::fs::remove_file(&db_path);
            let _ = std::fs::remove_file(format!("{}-wal", db_path.to_string_lossy()));
            let _ = std::fs::remove_file(format!("{}-shm", db_path.to_string_lossy()));
            let _ = std::fs::remove_file(&delete_pending_path);
        }
        
        // 删除后数据库不存在了，返回空路径等待初始化向导
        if !db_path.exists() {
            append_app_log(&app_handle, "INFO", "数据库已删除，等待初始化向导...");
            return Ok("".to_string());
        }
    }
    
    append_app_log(&app_handle, "INFO", "开始异步初始化数据库连接...");

    if !db_path.exists() {
        append_app_log(&app_handle, "INFO", "数据库文件不存在，等待初始化向导...");
        return Ok("".to_string());
    }

    // 执行初始化
    match init_pool(&db_path.to_string_lossy()) {
        Ok(pool) => {
            holder.set(pool);
            append_app_log(&app_handle, "INFO", "✅ 数据库连接池已建立");
            Ok(db_path.to_string_lossy().to_string())
        },
        Err(e) => {
            append_app_log(&app_handle, "ERROR", &format!("数据库连接池建立失败: {}", e));
            
            // 尝试损坏恢复逻辑 (原本在 main.rs)
            if e.contains("malformed") || e.contains("is not a database") {
                append_app_log(&app_handle, "WARN", "检测到数据库损坏，尝试恢复...");
                // 这里可以执行恢复逻辑... 暂时返回错误
                Err(format!("数据库文件损坏: {}", e))
            } else {
                Err(e)
            }
        }
    }
}

#[command]
pub fn db_get_connection_info(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    let db_path = crate::db::connection::get_db_path(&app_handle)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "未知".to_string());
    
    Ok(serde_json::json!({
        "path": db_path,
        "exists": PathBuf::from(&db_path).exists()
    }))
}

#[command]
pub fn db_get_backup_config(app_handle: AppHandle) -> Result<BackupConfig, String> {
    backup::get_backup_config(&app_handle)
}

#[command]
pub fn db_save_backup_config(app_handle: AppHandle, config: BackupConfig) -> Result<(), String> {
    backup::save_backup_config(&app_handle, &config)
}

#[command]
pub fn db_validate_backup_path(path: String) -> Result<bool, String> {
    backup::validate_backup_path(&path)
}

#[command]
pub fn db_perform_backup_now(app_handle: AppHandle) -> Result<String, String> {
    backup::perform_backup(&app_handle)
}

#[command]
pub fn check_first_run(app_handle: AppHandle) -> Result<bool, String> {
    let config = DatabaseConfig::load(&app_handle)?;
    if config.db_path.is_empty() {
        return Ok(true);
    }
    
    let p = PathBuf::from(&config.db_path);
    if !p.exists() {
        return Ok(true);
    }

    // New logic: Check if "users" table exists
    // If the file exists but has no tables (e.g. from init_pool recovery), we should consider it a first run
    match Connection::open(&p) {
        Ok(conn) => {
            let table_exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='users')", 
                [], 
                |row| row.get(0)
            ).unwrap_or(false);
            
            // If table doesn't exist, it's a first run (needs init)
            Ok(!table_exists)
        },
        Err(_) => {
            // If we can't open the DB, assume it needs setup
            Ok(true)
        }
    }
}

#[command]
pub fn get_database_path(app_handle: AppHandle) -> Result<String, String> {
    let config = DatabaseConfig::load(&app_handle)?;
    Ok(config.db_path)
}

#[command]
pub fn setup_database_new(app_handle: AppHandle, custom_path: Option<String>) -> Result<(), String> {
    let target_path = if let Some(path) = custom_path {
        PathBuf::from(path)
    } else {
        get_default_db_path(&app_handle)
    };

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Initialize database file
    {
        let conn = Connection::open(&target_path).map_err(|e| e.to_string())?;
        
        // Load init.sql with multiple fallbacks
        let resource_path = app_handle.path().resolve("resources/init.sql", tauri::path::BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve init.sql: {}", e))?;
        
        let init_sql = if resource_path.exists() {
            fs::read_to_string(&resource_path).map_err(|e| format!("Failed to read init.sql from {:?}: {}", resource_path, e))?
        } else {
            // Fallback for development: try multiple relative paths
            let cwd = std::env::current_dir().unwrap_or_default();
            let mut fallback_path = cwd.join("resources/init.sql");
            if !fallback_path.exists() {
                fallback_path = cwd.join("src-tauri/resources/init.sql");
            }
            
            if fallback_path.exists() {
                fs::read_to_string(&fallback_path).map_err(|e| format!("Failed to read init.sql from fallback {:?}: {}", fallback_path, e))?
            } else {
                // Secondary fallback: try relative to executable
                let exe_path = std::env::current_exe().unwrap_or_default();
                let exe_dir = exe_path.parent().unwrap_or(&exe_path);
                let mut fallback_path2 = exe_dir.join("resources/init.sql");
                if !fallback_path2.exists() {
                    fallback_path2 = exe_dir.join("../resources/init.sql");
                }
                
                if fallback_path2.exists() {
                    fs::read_to_string(&fallback_path2).map_err(|e| format!("Failed to read init.sql from fallback2 {:?}: {}", fallback_path2, e))?
                } else {
                    return Err(format!("Could not find init.sql. Res: {:?}, Fallback: {:?}, Fallback2: {:?}", resource_path, fallback_path, fallback_path2));
                }
            }
        };
        
        conn.execute_batch(&init_sql).map_err(|e| format!("Failed to execute init.sql: {}", e))?;
    }

    // Save config
    let mut config = DatabaseConfig::load(&app_handle)?;
    let db_path_str = target_path.to_string_lossy().to_string();
    config.db_path = db_path_str.clone();
    config.is_custom_path = false; 
    config.save(&app_handle)?;

    // 重要：初始化或重置全局连接池
    let pool = init_pool(&db_path_str)?;
    let holder = app_handle.state::<DbPoolHolder>();
    holder.set(pool);

    Ok(())
}

#[command]
pub fn setup_database_import(app_handle: AppHandle, holder: State<'_, DbPoolHolder>, source_path: String) -> Result<(), String> {
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err("Source file does not exist".to_string());
    }

    let target_path = get_default_db_path(&app_handle);
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::copy(&source, &target_path).map_err(|e| format!("Failed to copy database: {}", e))?;

    let mut config = DatabaseConfig::load(&app_handle)?;
    let db_path_str = target_path.to_string_lossy().to_string();
    config.db_path = db_path_str.clone();
    config.is_custom_path = false;
    config.save(&app_handle)?;

    // 初始化连接池
    let pool = init_pool(&db_path_str)?;
    holder.set(pool);

    Ok(())
}

#[command]
pub fn db_prepare_restore(
    app_handle: AppHandle, 
    source_path: String,
    auto_backup: bool
) -> Result<serde_json::Value, String> {
    let source = std::path::PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("备份文件不存在: {}", source_path));
    }

    // 1. 获取文件大小
    let metadata = fs::metadata(&source).map_err(|e| format!("无法读取文件信息: {}", e))?;
    let source_size = metadata.len();

    // 2. 检查磁盘空间
    let target_path = get_default_db_path(&app_handle);
    if !restore::check_disk_space(&target_path, source_size)? {
        return Err("磁盘空间不足，至少需要备份文件大小 2 倍的空闲空间。".to_string());
    }

    // 3. 验证文件有效性（基础检查）
    {
        let conn = Connection::open(&source).map_err(|e| format!("无效的数据库文件: {}", e))?;
        let table_exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='users')", 
            [], 
            |row| row.get(0)
        ).unwrap_or(false);
        if !table_exists {
            return Err("备份文件无效：缺少必要的系统表（users）。".to_string());
        }
    }

    // 4. 执行自动备份（如果需要）
    let mut auto_backup_path = None;
    if auto_backup && target_path.exists() {
        match backup::perform_backup(&app_handle) {
            Ok(path) => {
                auto_backup_path = Some(path);
                append_app_log(&app_handle, "INFO", &format!("db_prepare_restore: 已自动备份当前数据: {}", auto_backup_path.as_ref().unwrap()));
            },
            Err(e) => {
                append_app_log(&app_handle, "WARN", &format!("db_prepare_restore: 自动备份失败，但将继续恢复流程: {}", e));
            }
        }
    }

    // 5. 保存恢复配置
    let now = chrono::Local::now().timestamp_millis();
    let config = RestoreConfig {
        source_path: source_path.clone(),
        source_size,
        source_hash: None, // 暂不实现哈希校验
        auto_backup_path,
        created_at: now,
        expires_at: now + 24 * 60 * 60 * 1000, // 24小时过期
        version: "1.0".to_string(),
        app_version: app_handle.package_info().version.to_string(),
    };
    restore::save_restore_config(&app_handle, &config)?;

    // 6. 清除当前数据库路径配置，标记为"未就绪"，触发重启后进入向导
    let mut db_config = DatabaseConfig::load(&app_handle)?;
    db_config.db_path = "".to_string();
    db_config.save(&app_handle)?;

    append_app_log(&app_handle, "INFO", &format!("db_prepare_restore: 恢复配置已保存，源文件: {}", source_path));

    Ok(serde_json::json!({
        "success": true,
        "message": "恢复环境已准备就绪，应用将重启完成恢复。"
    }))
}

#[command]
pub async fn db_execute_restore(
    app_handle: AppHandle,
    holder: State<'_, DbPoolHolder>,
    backend: State<'_, Arc<BackendProcess>>
) -> Result<serde_json::Value, String> {
    // 1. 获取恢复配置
    let config = restore::get_restore_config(&app_handle)?
        .ok_or_else(|| "未找到待处理的恢复配置".to_string())?;

    let source = std::path::Path::new(&config.source_path);
    if !source.exists() {
        return Err(format!("备份源文件已不存在: {}", config.source_path));
    }

    let target = get_default_db_path(&app_handle);
    
    // 2. 彻底清理环境：强制关闭后端 + 清理连接池
    append_app_log(&app_handle, "INFO", "db_execute_restore: 正在清理环境以释放文件锁...");
    
    // 强制终止可能残留的后端进程（这是最可能占用文件的地方）
    backend.cleanup();
    
    // 清理 Rust 端的连接池
    if holder.is_initialized() {
        holder.clear();
    }
    
    // 给系统时间释放所有文件句柄
    std::thread::sleep(std::time::Duration::from_millis(500));

    append_app_log(&app_handle, "INFO", "db_execute_restore: 开始执行数据文件替换...");

    // 3. 清理旧文件
    if target.exists() {
        // 增加重试次数到 10 次，总计等待约 3 秒
        let mut deleted = false;
        for i in 0..10 {
            if std::fs::remove_file(&target).is_ok() {
                deleted = true;
                append_app_log(&app_handle, "INFO", &format!("db_execute_restore: 旧数据库文件在第 {} 次尝试时删除成功", i + 1));
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
        
        if !deleted {
            append_app_log(&app_handle, "ERROR", "db_execute_restore: 无法删除旧数据库文件，已被其他程序永久占用");
            return Err("无法删除旧数据库文件，它可能正被其他程序（如残留的 Node 后端或防病毒软件）占用。请尝试手动关闭任务管理器中的 node 进程后重试。".to_string());
        }

        // 清理 WAL 模式文件
        let _ = fs::remove_file(format!("{}-wal", target.to_string_lossy()));
        let _ = fs::remove_file(format!("{}-shm", target.to_string_lossy()));
    }

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建目标目录: {}", e))?;
    }

    // 4. 复制文件（直接复制）
    fs::copy(source, &target).map_err(|e| format!("复制文件失败: {}", e))?;

    // 5. 验证新文件
    {
        let conn = Connection::open(&target).map_err(|e| format!("恢复后的数据库无法打开: {}", e))?;
        conn.execute("PRAGMA integrity_check;", []).map_err(|e| format!("数据库完整性检查失败: {}", e))?;
    }

    // 6. 更新数据库配置
    let mut db_config = DatabaseConfig::load(&app_handle)?;
    db_config.db_path = target.to_string_lossy().to_string();
    db_config.save(&app_handle)?;

    // 7. 初始化新连接池
    let pool = init_pool(&db_config.db_path)?;
    holder.set(pool);

    // 8. 清理恢复配置
    restore::clear_restore_config(&app_handle)?;

    append_app_log(&app_handle, "INFO", "db_execute_restore: 数据库恢复成功完成");

    Ok(serde_json::json!({
        "success": true,
        "message": "数据库恢复成功"
    }))
}

#[command]
pub fn db_check_restore_pending(app_handle: AppHandle) -> Result<Option<RestoreConfig>, String> {
    restore::get_restore_config(&app_handle)
}

#[command]
pub fn db_cancel_restore(app_handle: AppHandle) -> Result<(), String> {
    restore::clear_restore_config(&app_handle)
}

#[command]
pub fn db_validate_backup_file(source_path: String) -> Result<serde_json::Value, String> {
    let source = std::path::Path::new(&source_path);
    if !source.exists() {
        return Err("文件不存在".to_string());
    }

    let metadata = fs::metadata(source).map_err(|e| e.to_string())?;
    
    match Connection::open(source) {
        Ok(conn) => {
            let table_exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='users')", 
                [], 
                |row| row.get(0)
            ).unwrap_or(false);

            Ok(serde_json::json!({
                "valid": table_exists,
                "size": metadata.len(),
                "tables_check": table_exists
            }))
        },
        Err(e) => Err(format!("不是有效的数据库文件: {}", e))
    }
}
