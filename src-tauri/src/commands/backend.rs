use tauri::{AppHandle, State};
use std::net::TcpStream;
use std::sync::Arc;
use crate::backend::{BackendProcess, start_backend_server};

#[tauri::command]
pub async fn start_backend(
    app: AppHandle,
    state: State<'_, Arc<BackendProcess>>,
) -> Result<bool, String> {
    // 1. Check if already running
    {
        // lock scope
        let mut process_guard = state.0.lock().map_err(|e| e.to_string())?;
        if process_guard.is_some() {
            // Check if port 3000 is open
            if TcpStream::connect_timeout(&"127.0.0.1:3000".parse().unwrap(), std::time::Duration::from_secs(2)).is_ok() {
                return Ok(true);
            }
            // If process handle exists but port not open? 
            // Maybe it died or is stuck. Let's assume if handle exists we trust it for now unless we add more complex check.
            // But user might want to retry if it died.
            
            // Check if process is still alive
            if let Some(child) = process_guard.as_mut() {
                 if let Ok(Some(_)) = child.try_wait() {
                     // Process has exited
                     *process_guard = None;
                 } else {
                     // Process is running
                     if TcpStream::connect_timeout(&"127.0.0.1:3000".parse().unwrap(), std::time::Duration::from_secs(2)).is_ok() {
                        return Ok(true);
                     }
                     // Running but port not open implies starting or hung.
                     // We can try to wait or just return true and let frontend retry?
                     // Let's assume it's running.
                     return Ok(true);
                 }
            }
        }
    }

    // 2. Start if not running
    match start_backend_server(&app) {
        Ok(child_opt) => {
             let mut process_guard = state.0.lock().map_err(|e| e.to_string())?;
             // 如果返回 Some(child)，则接管其生命周期
             // 如果返回 None，说明是外部管理的（如开发模式并行启动），process_guard 保持为 None 即可
             // 但我们需要确保不会覆盖可能已存在的（虽然上面 check 逻辑涵盖了）
             // 简单赋值即可，如果是 external, None 会覆盖原本的 None
             *process_guard = child_opt;
             Ok(true)
        },
        Err(e) => Err(format!("后端启动失败: {}", e))
    }
}

#[tauri::command]
pub async fn check_backend_status() -> Result<bool, String> {
    let addr = "127.0.0.1:3000".parse().map_err(|e| format!("解析地址失败: {}", e))?;
    Ok(TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(2)).is_ok())
}
