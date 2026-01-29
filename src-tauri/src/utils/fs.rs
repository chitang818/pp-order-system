use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use crate::utils::common::*;

pub fn ensure_dir(path: &Path) -> io::Result<()> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AppPathsInfo {
    pub exe_path: String,
    pub resource_dir: Option<String>,
    pub app_data_dir: String,
    pub data_dir: String,
    pub config_dir: String,
    pub logs_dir: String,
    pub diagnostics_dir: String,
    pub db_path: String,
}

pub fn open_dir_in_file_manager(dir: &Path) -> io::Result<()> {
    if cfg!(target_os = "windows") {
        Command::new("explorer").arg(dir).spawn().map(|_| ())?;
        Ok(())
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(dir).spawn().map(|_| ())?;
        Ok(())
    } else {
        Command::new("xdg-open").arg(dir).spawn().map(|_| ())?;
        Ok(())
    }
}

pub fn get_paths_info(app_handle: &tauri::AppHandle) -> Result<AppPathsInfo, io::Error> {
    use tauri::Manager;
    let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("unknown"));

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| io::Error::new(io::ErrorKind::NotFound, format!("无法获取 app_data_dir: {:?}", e)))?;

    let data_dir = app_data_dir.join("data");
    let config_dir = app_data_dir.join("config");
    let logs_dir = app_data_dir.join("logs");
    let diagnostics_dir = app_data_dir.join("diagnostics");
    let db_path = data_dir.join("erp.sqlite");

    // 确保目录存在
    let _ = ensure_dir(&data_dir);
    let _ = ensure_dir(&config_dir);
    let _ = ensure_dir(&logs_dir);
    let _ = ensure_dir(&diagnostics_dir);

    let resource_dir = app_handle.path().resource_dir().ok().map(|p| p.to_string_lossy().to_string());

    Ok(AppPathsInfo {
        exe_path: exe_path.to_string_lossy().to_string(),
        resource_dir,
        app_data_dir: app_data_dir.to_string_lossy().to_string(),
        data_dir: data_dir.to_string_lossy().to_string(),
        config_dir: config_dir.to_string_lossy().to_string(),
        logs_dir: logs_dir.to_string_lossy().to_string(),
        diagnostics_dir: diagnostics_dir.to_string_lossy().to_string(),
        db_path: db_path.to_string_lossy().to_string(),
    })
}

pub fn append_app_log(app_handle: &tauri::AppHandle, level: &str, message: &str) {
    let paths = match get_paths_info(app_handle) {
        Ok(p) => p,
        Err(_) => return,
    };

    let timestamp = iso_timestamp();
    let line = format!("{} [{}] {}\n", timestamp, level, message);

    // 在开发模式下输出到控制台（带颜色）
    #[cfg(debug_assertions)]
    {
        let color_code = match level {
            "INFO" => "\x1b[32m", // Green
            "WARN" => "\x1b[33m", // Yellow
            "ERROR" => "\x1b[31m", // Red
            _ => "\x1b[37m",      // White
        };
        let reset_code = "\x1b[0m";
        // 格式: [TIME] [LEVEL] MESSAGE
        println!("{}[{}] [{}] {}{}", color_code, timestamp, level, message, reset_code);
    }

    let log_path = PathBuf::from(paths.logs_dir).join("app.log");
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        use std::io::Write;
        let _ = f.write_all(line.as_bytes());
    }
}

pub fn copy_dir_limited(src: &Path, dest: &Path, max_files: usize, max_total_bytes: u64) -> io::Result<Vec<String>> {
    let mut copied: Vec<String> = Vec::new();
    let mut total: u64 = 0;
    if !src.exists() {
        return Ok(copied);
    }
    ensure_dir(dest)?;

    fn walk(src: &Path, dest: &Path, copied: &mut Vec<String>, total: &mut u64, max_files: usize, max_total_bytes: u64) -> io::Result<()> {
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            if copied.len() >= max_files || *total >= max_total_bytes {
                break;
            }
            let ty = entry.file_type()?;
            let src_path = entry.path();
            let dest_path = dest.join(entry.file_name());

            if ty.is_dir() {
                ensure_dir(&dest_path)?;
                walk(&src_path, &dest_path, copied, total, max_files, max_total_bytes)?;
            } else if ty.is_file() {
                let meta = fs::metadata(&src_path).ok();
                let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                if *total + size > max_total_bytes {
                    continue;
                }
                if let Some(parent) = dest_path.parent() {
                    ensure_dir(parent)?;
                }
                if fs::copy(&src_path, &dest_path).is_ok() {
                    *total += size;
                    copied.push(dest_path.to_string_lossy().to_string());
                }
            }
        }
        Ok(())
    }

    walk(src, dest, &mut copied, &mut total, max_files, max_total_bytes)?;
    Ok(copied)
}

pub fn copy_dir_recursive(src: &Path, dest: &Path) -> io::Result<()> {
    if !src.exists() {
        return Ok(());
    }
    ensure_dir(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else if ty.is_file() {
            if let Some(parent) = dest_path.parent() {
                ensure_dir(parent)?;
            }
            fs::copy(&src_path, &dest_path)?;
        }
    }
    Ok(())
}
