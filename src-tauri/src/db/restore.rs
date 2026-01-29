use tauri::AppHandle;
use tauri::Manager;
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use tauri::path::BaseDirectory;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreConfig {
    pub source_path: String,              // 备份文件路径
    pub source_size: u64,                 // 备份文件大小（字节）
    pub source_hash: Option<String>,      // 文件哈希（可选）
    pub auto_backup_path: Option<String>, // 自动备份路径（如果有）
    pub created_at: i64,                  // 创建时间戳
    pub expires_at: i64,                  // 过期时间戳
    pub version: String,                  // 配置版本
    pub app_version: String,              // 应用版本
}

fn get_restore_config_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    app_handle.path().resolve("config/restore_config.json", BaseDirectory::AppData)
        .map_err(|e| format!("无法解析恢复配置文件路径: {}", e))
}

pub fn save_restore_config(app_handle: &AppHandle, config: &RestoreConfig) -> Result<(), String> {
    let path = get_restore_config_path(app_handle)?;
    
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建配置目录: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    
    fs::write(path, content).map_err(|e| format!("写入配置文件失败: {}", e))?;
    
    Ok(())
}

pub fn get_restore_config(app_handle: &AppHandle) -> Result<Option<RestoreConfig>, String> {
    let path = get_restore_config_path(app_handle)?;
    
    if !path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(path).map_err(|e| format!("读取配置文件失败: {}", e))?;
    let config: RestoreConfig = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))?;
    
    Ok(Some(config))
}

pub fn clear_restore_config(app_handle: &AppHandle) -> Result<(), String> {
    let path = get_restore_config_path(app_handle)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("删除配置文件失败: {}", e))?;
    }
    Ok(())
}

/// 检查磁盘空间是否充足
#[cfg(target_os = "windows")]
pub fn check_disk_space(target_path: &Path, required_bytes: u64) -> Result<bool, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let root = target_path.ancestors().last().unwrap_or(Path::new("C:\\"));
    let mut root_wide: Vec<u16> = root.as_os_str().encode_wide().collect();
    root_wide.push(0);

    let mut free_bytes_available: u64 = 0;
    let mut total_number_of_bytes: u64 = 0;
    let mut total_number_of_free_bytes: u64 = 0;

    unsafe {
        if GetDiskFreeSpaceExW(
            root_wide.as_ptr(),
            &mut free_bytes_available,
            &mut total_number_of_bytes,
            &mut total_number_of_free_bytes,
        ) != 0 {
            // 至少需要 2 倍备份文件大小的空间（备份文件本身 + 恢复后的文件）
            Ok(free_bytes_available >= required_bytes * 2)
        } else {
            Err("无法获取磁盘空间信息".to_string())
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn check_disk_space(_target_path: &Path, _required_bytes: u64) -> Result<bool, String> {
    // 非 Windows 平台暂不实现，默认返回 true
    Ok(true)
}

/// 带进度的文件复制
#[allow(dead_code)]  // 预留函数，未来可能使用
pub fn copy_file_with_progress<F>(
    src: &Path, 
    dest: &Path, 
    progress_callback: F
) -> Result<(), String>
where
    F: Fn(u64, u64), // (已复制字节, 总字节)
{
    use std::io::{Read, Write};
    
    let mut src_file = fs::File::open(src).map_err(|e| format!("无法打开源文件: {}", e))?;
    let total_size = src_file.metadata().map_err(|e| format!("无法获取文件信息: {}", e))?.len();
    
    let mut dest_file = fs::File::create(dest).map_err(|e| format!("无法创建目标文件: {}", e))?;
    
    let mut buffer = [0; 65536]; // 64KB 缓冲区
    let mut copied_size: u64 = 0;
    
    loop {
        let bytes_read = src_file.read(&mut buffer).map_err(|e| format!("读取源文件失败: {}", e))?;
        if bytes_read == 0 {
            break;
        }
        
        dest_file.write_all(&buffer[..bytes_read]).map_err(|e| format!("写入目标文件失败: {}", e))?;
        copied_size += bytes_read as u64;
        
        progress_callback(copied_size, total_size);
    }
    
    dest_file.flush().map_err(|e| format!("刷新目标文件失败: {}", e))?;
    Ok(())
}
