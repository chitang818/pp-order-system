use tauri::{AppHandle, Manager};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::fs;
use crate::utils::common::*;
use crate::utils::fs::*;

#[derive(Debug, Clone, serde::Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AppHealth {
    pub success: bool,
    pub timestamp: String,
    pub backend_port_3000_open: bool,
    pub db_file_exists: bool,
    pub db_path: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiagnosticsExportResult {
    pub success: bool,
    pub diagnostics_dir: String,
    pub files_written: Vec<String>,
    pub message: String,
}

#[tauri::command]
pub fn app_info(app_handle: AppHandle) -> AppInfo {
    let pkg = app_handle.package_info();
    AppInfo {
        name: pkg.name.to_string(),
        version: pkg.version.to_string(),
    }
}

#[tauri::command]
pub fn app_paths(app_handle: AppHandle) -> Result<AppPathsInfo, String> {
    get_paths_info(&app_handle).map_err(|e| format!("{:?}", e))
}

#[tauri::command]
pub fn app_health(app_handle: AppHandle) -> Result<AppHealth, String> {
    let paths = get_paths_info(&app_handle).map_err(|e| format!("{:?}", e))?;

    // 目前仍保留 Node 后端：用端口是否可连接作为健康参考
    let addr = "127.0.0.1:3000".parse().map_err(|e| format!("解析地址失败: {}", e))?;
    let backend_port_3000_open = TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(2)).is_ok();

    let db_file_exists = Path::new(&paths.db_path).exists();

    Ok(AppHealth {
        success: true,
        timestamp: iso_timestamp(),
        backend_port_3000_open,
        db_file_exists,
        db_path: paths.db_path,
    })
}

#[tauri::command]
pub fn app_diagnostics_export(app_handle: AppHandle) -> Result<DiagnosticsExportResult, String> {
    let paths = get_paths_info(&app_handle).map_err(|e| format!("{:?}", e))?;

    // 诊断目录：AppData/diagnostics/diag-YYYYMMDD-HHMMSS
    let diag_dir = PathBuf::from(&paths.diagnostics_dir).join(format!("diag-{}", iso_timestamp_compact()));
    ensure_dir(&diag_dir).map_err(|e| format!("创建诊断目录失败: {:?}", e))?;

    let mut files_written: Vec<String> = Vec::new();

    // 写入 info.json
    let info_path = diag_dir.join("info.json");
    let info = serde_json::json!({
        "timestamp": iso_timestamp(),
        "app": app_info(app_handle.clone()),
        "paths": paths,
        "health": app_health(app_handle.clone()).ok(),
    });
    fs::write(&info_path, serde_json::to_string_pretty(&info).unwrap_or_else(|_| "{}".into()))
        .map_err(|e| format!("写入 info.json 失败: {:?}", e))?;
    files_written.push(info_path.to_string_lossy().to_string());

    // 拷贝 logs（限制数量/总大小，避免诊断包过大）
    let logs_src = PathBuf::from(&paths.logs_dir);
    let logs_dest = diag_dir.join("logs");
    let copied_logs = copy_dir_limited(&logs_src, &logs_dest, 50, 20 * 1024 * 1024)
        .unwrap_or_else(|_| Vec::new());
    files_written.extend(copied_logs);

    // 拷贝 config
    let config_src = PathBuf::from(&paths.config_dir);
    let config_dest = diag_dir.join("config");
    let copied_cfg = copy_dir_limited(&config_src, &config_dest, 100, 10 * 1024 * 1024)
        .unwrap_or_else(|_| Vec::new());
    files_written.extend(copied_cfg);

    append_app_log(&app_handle, "INFO", &format!("导出诊断包成功: {:?}", diag_dir));

    Ok(DiagnosticsExportResult {
        success: true,
        diagnostics_dir: diag_dir.to_string_lossy().to_string(),
        files_written,
        message: "诊断包已生成（目录形式）。".to_string(),
    })
}

#[tauri::command]
pub async fn app_http_get(url: String, response_type: Option<String>) -> Result<serde_json::Value, String> {
    // 注意：此命令用于在 Tauri WebView 场景代理请求以规避 CORS。
    // 网络/TLS 波动在客户端很常见（如 unexpected EOF during handshake），
    // 为避免前端看到 invoke 抛错，这里统一返回结构化结果（尽量不返回 Err）。
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_err: Option<String> = None;
    let mut last_status: u16 = 0;
    let mut last_text: String = String::new();

    // 简单重试 2 次，缓解偶发 TLS 握手/网络抖动
    for attempt in 0..2 {
        let resp = client
            .get(&url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .send()
            .await;

        match resp {
            Ok(response) => {
                let status = response.status();
                last_status = status.as_u16();
                // 统一读取为文本：避免 response.json() 因非 JSON/空响应导致命令直接 Err
                match response.text().await {
                    Ok(t) => {
                        last_text = t;
                        last_err = None;
                        break;
                    }
                    Err(e) => {
                        last_err = Some(e.to_string());
                    }
                }
            }
            Err(e) => {
                last_err = Some(e.to_string());
            }
        }

        // 轻微退避
        if attempt == 0 {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
    }

    // 如果请求最终仍失败：返回结构化错误（不抛 Err）
    if let Some(err) = last_err {
        return Ok(serde_json::json!({
            "ok": false,
            "status": last_status,
            "url": url,
            "error": err
        }));
    }

    // 成功拿到内容
    let ok = (200..400).contains(&last_status);
    let text = last_text;

    if response_type.as_deref() == Some("text") {
        return Ok(serde_json::json!({
            "ok": ok,
            "status": last_status,
            "text": text
        }));
    }

    // 默认 json：尝试解析；失败则返回 text + parse_error（不抛错）
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(data) => Ok(serde_json::json!({
            "ok": ok,
            "status": last_status,
            "data": data
        })),
        Err(e) => Ok(serde_json::json!({
            "ok": false,
            "status": last_status,
            "text": text,
            "parse_error": e.to_string()
        })),
    }
}

#[tauri::command]
pub fn app_open_logs_dir(app_handle: AppHandle) -> Result<bool, String> {
    let paths = get_paths_info(&app_handle).map_err(|e| format!("{:?}", e))?;
    open_dir_in_file_manager(Path::new(&paths.logs_dir)).map_err(|e| format!("{:?}", e))?;
    Ok(true)
}

#[tauri::command]
pub fn app_open_app_data_dir(app_handle: AppHandle) -> Result<bool, String> {
    let paths = get_paths_info(&app_handle).map_err(|e| format!("{:?}", e))?;
    open_dir_in_file_manager(Path::new(&paths.app_data_dir)).map_err(|e| format!("{:?}", e))?;
    Ok(true)
}

#[tauri::command]
pub fn app_open_dir(app_handle: AppHandle, dir: String) -> Result<bool, String> {
    let paths = get_paths_info(&app_handle).map_err(|e| format!("{:?}", e))?;
    // 只允许打开 AppData 下的目录，避免任意路径执行
    let base = PathBuf::from(paths.app_data_dir);
    let target = PathBuf::from(dir);
    if !target.starts_with(&base) {
        return Err("只允许打开 AppData 目录下的路径".to_string());
    }
    open_dir_in_file_manager(&target).map_err(|e| format!("{:?}", e))?;
    Ok(true)
}

#[tauri::command]
pub fn app_restart(app_handle: AppHandle) {
    tauri::process::restart(&app_handle.env());
}
