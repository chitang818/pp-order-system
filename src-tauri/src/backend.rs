use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::net::TcpStream;
use std::io::{Error, ErrorKind};
use crate::utils::fs::{ensure_dir, copy_dir_recursive};
use tauri::path::BaseDirectory;
use crate::utils::paths::DatabaseConfig;

// 后端进程管理的状态结构体
pub struct BackendProcess(pub Mutex<Option<Child>>);

/// 调用后端的 shutdown API，让 Node.js 优雅关闭（包括关闭 Puppeteer 浏览器）
/// 采用"发送即忘"策略，不等待响应，快速返回
fn request_graceful_shutdown() -> bool {
    use std::io::Write;
    use std::time::Duration;
    
    println!("发送优雅关闭请求到后端服务...");
    
    // 快速尝试连接（超时 300ms）
    match TcpStream::connect_timeout(
        &"127.0.0.1:3000".parse().unwrap(),
        Duration::from_millis(300)
    ) {
        Ok(mut stream) => {
            let _ = stream.set_write_timeout(Some(Duration::from_millis(200)));
            
            // 发送 HTTP POST 请求（发送即忘，不等响应）
            let request = "POST /api/shutdown HTTP/1.1\r\n\
                          Host: 127.0.0.1:3000\r\n\
                          Content-Length: 0\r\n\
                          Connection: close\r\n\r\n";
            
            if stream.write_all(request.as_bytes()).is_ok() {
                println!("✓ 已发送关闭请求");
                return true;
            }
            println!("发送关闭请求失败");
            false
        }
        Err(_) => {
            println!("后端服务未运行，无需关闭");
            true // 返回 true，因为目标已达成（没有需要关闭的后端）
        }
    }
}

impl BackendProcess {
    pub fn cleanup(&self) {
        // 1. 发送优雅关闭请求（快速，不等待响应）
        let graceful_sent = request_graceful_shutdown();
        
        // 2. 给后端一点时间处理关闭请求（仅 100ms）
        if graceful_sent {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        
        if let Ok(mut process) = self.0.lock() {
            if let Some(mut child) = process.take() {
                let pid = child.id();
                
                // 快速检查进程是否已经退出
                if let Ok(Some(_)) = child.try_wait() {
                    println!("✓ 后端服务器已退出 (PID: {})", pid);
                    return;
                }
                
                println!("正在终止后端进程 (PID: {})...", pid);
                
                // Windows 上使用 taskkill 终止整个进程树
                #[cfg(target_os = "windows")]
                {
                    // 使用 taskkill /F /T /PID 强制终止进程及其所有子进程
                    // 在后台线程中执行，不阻塞主退出流程
                    let pid_str = pid.to_string();
                    std::thread::spawn(move || {
                        let _ = Command::new("taskkill")
                            .args(["/F", "/T", "/PID", &pid_str])
                            .creation_flags(0x08000000) // CREATE_NO_WINDOW
                            .output();
                    });
                    println!("✓ 已发送终止命令 (PID: {})", pid);
                }
                
                // 非 Windows 平台使用标准方式
                #[cfg(not(target_os = "windows"))]
                {
                    let _ = child.kill();
                    println!("✓ 已发送终止信号 (PID: {})", pid);
                }
            } else {
                // 没有进程句柄时，快速检查并终止端口占用进程
                #[cfg(target_os = "windows")]
                {
                    // 快速检查端口是否被占用，如果是则异步终止
                    if TcpStream::connect_timeout(
                        &"127.0.0.1:3000".parse().unwrap(),
                        std::time::Duration::from_millis(50)
                    ).is_ok() {
                        println!("检测到端口 3000 仍在使用，异步终止...");
                        std::thread::spawn(|| {
                            // 使用 netstat 快速查找 PID（比 PowerShell 快）
                            if let Ok(output) = Command::new("cmd")
                                .args(["/C", "netstat -ano | findstr :3000 | findstr LISTENING"])
                                .creation_flags(0x08000000)
                                .output()
                            {
                                let stdout = String::from_utf8_lossy(&output.stdout);
                                // 解析最后一列的 PID
                                if let Some(line) = stdout.lines().next() {
                                    if let Some(pid_str) = line.split_whitespace().last() {
                                        if let Ok(port_pid) = pid_str.parse::<u32>() {
                                            if port_pid > 0 {
                                                let _ = Command::new("taskkill")
                                                    .args(["/F", "/T", "/PID", &port_pid.to_string()])
                                                    .creation_flags(0x08000000)
                                                    .output();
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }
        println!("✓ 清理完成");
    }
}

// 获取 Node.js 可执行文件路径
fn get_node_executable(_app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, std::io::Error> {
    if cfg!(debug_assertions) {
        println!("[开发模式] 使用系统 Node.js");
        Ok(std::path::PathBuf::from("node"))
    } else {
        println!("[生产模式] 查找 sidecar Node.js");
        
        // 获取当前可执行文件所在目录
        let exe_path = std::env::current_exe()?;
        let exe_dir = exe_path.parent().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "无法获取可执行文件目录"))?;
        
        // Tauri externalBin 会添加目标三元组后缀
        // 对于 Windows x64，通常是 node-x86_64-pc-windows-msvc.exe
        // 为了稳健，我们可以尝试构建带后缀的路径，也可以尝试直接查找
        // 这里我们优先匹配标准的 Tauri sidecar 命名规则
        
        let target_triple = "x86_64-pc-windows-msvc";
        let sidecar_name = format!("node-{}.exe", target_triple);
        let sidecar_path = exe_dir.join(&sidecar_name);
        
        if sidecar_path.exists() {
             println!("[生产模式] 找到 sidecar: {:?}", sidecar_path);
             return Ok(sidecar_path);
        }

        // 如果找不到带后缀的，尝试找 "node.exe" (用户可能手动重命名过或配置不同)
        let fallback_path = exe_dir.join("node.exe");
        if fallback_path.exists() {
            println!("[生产模式] 找到 fallback sidecar: {:?}", fallback_path);
            return Ok(fallback_path);
        }
        
        Err(std::io::Error::new(std::io::ErrorKind::NotFound, format!("在 {:?} 未找到 sidecar (期望: {} 或 node.exe)", exe_dir, sidecar_name)))
    }
}

fn prepare_writable_paths(app_handle: &tauri::AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), Error> {
    let app_data_dir = app_handle
        .path()
        .resolve("", BaseDirectory::AppData)
        .map_err(|e| Error::new(ErrorKind::NotFound, format!("无法获取 AppData 目录: {:?}", e)))?;

    let data_dir = app_data_dir.join("data");
    let config_dir = app_data_dir.join("config");
    let logs_dir = app_data_dir.join("logs");

    println!("[Path] Resolved AppData: {:?}", app_data_dir);

    ensure_dir(&data_dir)?;
    ensure_dir(&config_dir)?;
    ensure_dir(&logs_dir)?;

    let resource_dir = app_handle.path().resource_dir().map_err(|e| Error::new(ErrorKind::NotFound, format!("无法获取资源目录: {:?}", e)))?;
    let bundled_config_dir = resource_dir.join("config");
    if bundled_config_dir.exists() {
        let _ = copy_dir_recursive(&bundled_config_dir, &config_dir);
    }

    let data_dir = data_dir.to_path_buf();
    let config_dir = config_dir.to_path_buf();
    let db_path = data_dir.join("erp.sqlite");

    println!("[Path] App Data Dir: {:?}", app_data_dir);
    println!("[Path] Data Dir: {:?}", data_dir);
    println!("[Path] DB Path: {:?}", db_path);

    Ok((data_dir, config_dir, db_path))
}

pub fn start_backend_server(app_handle: &tauri::AppHandle) -> Result<Option<Child>, Error> {
    println!("正在启动后端服务器...");
    
    // 0. 检查端口是否已被占用（开发模式下可能已通过 concurrently 启动）
    if TcpStream::connect("127.0.0.1:3000").is_ok() {
        println!("ℹ️ 检测到后端服务已在运行 (Port 3000 is open)");
        // 如果后端是由外部启动的 (如 concurrently)，我们此时无需管理它的生命周期
        return Ok(None);
    }
    
    let node_exe = get_node_executable(app_handle)?;
    
    let backend_path = if cfg!(debug_assertions) {
        let current_dir = std::env::current_dir()?;
        let project_root = if current_dir.file_name().and_then(|n| n.to_str()).map(|n| n.eq("src-tauri")).unwrap_or(false) {
            current_dir.parent().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "无法找到项目根目录"))?.to_path_buf()
        } else {
            current_dir
        };
        project_root.join("backend")
    } else {
        let resource_dir = app_handle.path().resource_dir().map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, format!("无法获取资源目录: {:?}", e)))?;
        resource_dir.join("backend")
    };
    
    if !backend_path.exists() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, format!("后端目录不存在: {:?}", backend_path)));
    }
    
    let app_js_path = backend_path.join("app.js");
    if !app_js_path.exists() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, format!("后端文件不存在: {:?}", app_js_path)));
    }
    
    let (data_dir, config_dir, default_db_path) = prepare_writable_paths(app_handle)?;
    let db_path = match DatabaseConfig::load(app_handle) {
        Ok(config) if !config.db_path.is_empty() => PathBuf::from(config.db_path),
        _ => default_db_path
    };

    println!("[Backend] DATA_ROOT: {}", data_dir.display());
    println!("[Backend] CONFIG_ROOT: {}", config_dir.display());
    println!("[Backend] DB_PATH: {}", db_path.display());

    #[cfg(target_os = "windows")]
    let child = if cfg!(debug_assertions) {
        Command::new(&node_exe)
            .arg("app.js")
            .current_dir(&backend_path)
            .env("NODE_ENV", "development")
            .env("DATA_ROOT", data_dir.display().to_string())
            .env("CONFIG_ROOT", config_dir.display().to_string())
            .env("DB_PATH", db_path.display().to_string())
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit())
            .spawn()?
    } else {
        // 生产模式：需要传递系统环境变量给 Node.js 进程
        // 特别是 LOCALAPPDATA, PROGRAMFILES 等，用于查找 Chrome/Edge 浏览器
        let mut cmd = Command::new(&node_exe);
        cmd.arg("app.js")
            .current_dir(&backend_path)
            .env("NODE_ENV", "production")
            .env("DATA_ROOT", data_dir.display().to_string())
            .env("CONFIG_ROOT", config_dir.display().to_string())
            .env("DB_PATH", db_path.display().to_string())
            .creation_flags(0x08000000); // CREATE_NO_WINDOW
        
        // 传递关键的系统环境变量（用于浏览器查找）
        if let Ok(val) = std::env::var("LOCALAPPDATA") {
            cmd.env("LOCALAPPDATA", val);
        }
        if let Ok(val) = std::env::var("APPDATA") {
            cmd.env("APPDATA", val);
        }
        if let Ok(val) = std::env::var("USERPROFILE") {
            cmd.env("USERPROFILE", val);
        }
        if let Ok(val) = std::env::var("HOMEDRIVE") {
            cmd.env("HOMEDRIVE", val);
        }
        if let Ok(val) = std::env::var("HOMEPATH") {
            cmd.env("HOMEPATH", val);
        }
        if let Ok(val) = std::env::var("TEMP") {
            cmd.env("TEMP", val);
        }
        if let Ok(val) = std::env::var("TMP") {
            cmd.env("TMP", val);
        }
        if let Ok(val) = std::env::var("PROGRAMFILES") {
            cmd.env("PROGRAMFILES", val);
        }
        if let Ok(val) = std::env::var("PROGRAMFILES(X86)") {
            cmd.env("PROGRAMFILES(X86)", val);
        }
        if let Ok(val) = std::env::var("SYSTEMROOT") {
            cmd.env("SYSTEMROOT", val);
        }
        if let Ok(val) = std::env::var("PATH") {
            cmd.env("PATH", val);
        }
        
        // 捕获 stderr 以便诊断启动失败问题
        // 将错误输出重定向到日志文件
        let logs_dir = app_handle
            .path()
            .resolve("logs", BaseDirectory::AppData)
            .unwrap_or_else(|_| data_dir.join("logs"));
        let _ = std::fs::create_dir_all(&logs_dir);
        let stderr_file = logs_dir.join("backend-stderr.log");
        let stdout_file = logs_dir.join("backend-stdout.log");
        
        // 打开文件用于追加（如果文件不存在则创建）
        match (std::fs::OpenOptions::new().create(true).append(true).open(&stderr_file),
               std::fs::OpenOptions::new().create(true).append(true).open(&stdout_file)) {
            (Ok(stderr), Ok(stdout)) => {
                cmd.stdout(stdout);
                cmd.stderr(stderr);
                println!("[Backend] 错误日志将写入: {:?}", stderr_file);
                println!("[Backend] 标准输出将写入: {:?}", stdout_file);
            }
            _ => {
                // 如果无法创建日志文件，仍然尝试启动（但会丢失错误信息）
                eprintln!("警告: 无法创建日志文件，错误信息可能丢失");
            }
        }
        
        cmd.spawn()?
    };
    
    #[cfg(not(target_os = "windows"))]
    let child = Command::new(&node_exe)
        .arg("app.js")
        .current_dir(&backend_path)
        .env("NODE_ENV", if cfg!(debug_assertions) { "development" } else { "production" })
        .env("DATA_ROOT", data_dir.display().to_string())
        .env("CONFIG_ROOT", config_dir.display().to_string())
        .env("DB_PATH", db_path.display().to_string())
        .spawn()?;
    
    let mut child = child;
    let pid = child.id();
    println!("✓ 后端服务器进程已启动，PID: {}", pid);
    
    // 记录日志文件路径（如果已设置）
    let logs_dir = app_handle
        .path()
        .resolve("logs", BaseDirectory::AppData)
        .unwrap_or_else(|_| {
            let (data_dir, _, _) = prepare_writable_paths(app_handle).unwrap_or_else(|_| {
                (PathBuf::from("."), PathBuf::from("."), PathBuf::from("."))
            });
            data_dir.join("logs")
        });
    let stderr_file = logs_dir.join("backend-stderr.log");
    let stdout_file = logs_dir.join("backend-stdout.log");
    
    let max_retries = 60;
    let mut retries = 0;
    while retries < max_retries {
        if let Ok(Some(status)) = child.try_wait() {
            let exit_code = status.code().unwrap_or(-1);
            let error_msg = format!(
                "后端服务器进程意外退出，退出码: {}\n\n\
                请检查日志文件以获取详细错误信息：\n\
                - 标准错误: {:?}\n\
                - 标准输出: {:?}\n\n\
                常见原因：\n\
                1. Node.js sidecar 未找到或无法执行\n\
                2. backend/app.js 启动时出错（依赖缺失、语法错误等）\n\
                3. 端口 3000 被占用\n\
                4. 环境变量或路径配置错误",
                exit_code,
                stderr_file,
                stdout_file
            );
            return Err(std::io::Error::new(std::io::ErrorKind::Other, error_msg));
        }
        if TcpStream::connect("127.0.0.1:3000").is_ok() {
            println!("✓ 后端服务器端口已开放，服务器已就绪");
            return Ok(Some(child));
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
        retries += 1;
    }
    
    // 超时但进程仍在运行
    println!("⚠️ 后端服务器启动超时（30秒），但进程仍在运行。可能正在初始化...");
    Ok(Some(child))
}
