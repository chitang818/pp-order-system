// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;
mod utils;
use utils::fs::append_app_log;
mod commands;
mod models;
mod db;
mod backend;

use db::pool::DbPoolHolder;
use backend::BackendProcess;

/// 显示/唤醒主窗口：已可见时只做 unminimize + focus，避免重复 maximize 导致闪动
#[tauri::command]
fn app_show_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let visible = window.is_visible().unwrap_or(false);
        if !visible {
            let _ = window.maximize();
            let _ = window.show();
        }
        let _ = window.set_focus();
        Ok(())
    } else {
        Err("主窗口未找到".to_string())
    }
}

#[tauri::command]
fn app_open_external(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(["/C", "start", &url]).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Command::new("xdg-open").arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
}


// utils::paths::DatabaseConfig is used in start_backend_server which is moved.
// Clean up unused imports if any.
// We still use utils in main probably?
// Let's keep utils mod.


use tauri::menu::{Menu, MenuItem, Submenu, CheckMenuItem, PredefinedMenuItem, ContextMenu};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_autostart::MacosLauncher;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.show();
                let _ = window.unminimize();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::app::app_http_get,
            commands::app::app_paths,
            commands::app::app_health,
            commands::app::app_diagnostics_export,
            commands::app::app_open_logs_dir,
            commands::app::app_open_app_data_dir,
            commands::app::app_open_dir,
            commands::app::app_restart,
            app_open_external,
            app_show_window,
            commands::database::db_init_connection,
            commands::database::db_get_connection_info,
            commands::storage::db_get_path,
            commands::storage::db_stats,
            commands::storage::storage_open_dir,
            commands::storage::db_backup,
            commands::storage::db_restore,
            commands::storage::db_reset,
            commands::database::check_first_run,
            commands::database::setup_database_new,
            commands::database::setup_database_import,
            commands::database::get_database_path,
            commands::database::db_get_backup_config,
            commands::database::db_save_backup_config,
            commands::database::db_validate_backup_path,
            commands::database::db_perform_backup_now,
            commands::database::db_prepare_restore,
            commands::database::db_execute_restore,
            commands::database::db_check_restore_pending,
            commands::database::db_cancel_restore,
            commands::database::db_validate_backup_file,
            commands::auth::auth_login,
            commands::auth::auth_me,
            commands::auth::auth_logout,
            commands::auth::auth_change_password,
            commands::auth::auth_update_me,
            commands::customers::customers_list,
            commands::customers::customers_get,
            commands::customers::customers_create,
            commands::customers::customers_update,
            commands::customers::customers_delete,
            commands::customers::customers_clear,
            commands::products::products_list,
            commands::products::products_search,
            commands::products::products_create,
            commands::products::products_update,
            commands::products::products_delete,
            commands::products::products_clear,
            commands::users::users_list,
            commands::users::users_create,
            commands::users::users_update,
            commands::users::users_reset_password,
            commands::users::users_delete,
            commands::orders::orders_list,
            commands::orders::orders_get,
            commands::orders::orders_create,
            commands::orders::orders_update,
            commands::orders::orders_delete,
            commands::orders::orders_restore,
            commands::orders::orders_delete_permanent,
            commands::orders::orders_list_deleted,
            commands::orders::orders_next_contract_no,
            commands::company::company_get,
            commands::company::company_update,
            commands::company::company_reset,
            commands::company::order_configs_list,
            commands::company::order_configs_batch,
            commands::company::order_config_create,
            commands::company::order_config_update,
            commands::company::order_config_delete,
            commands::document_center::document_templates_list,
            commands::document_center::document_templates_get,
            commands::document_center::document_templates_create,
            commands::document_center::document_templates_update,
            commands::document_center::document_templates_delete,
            commands::document_center::document_templates_delete_all,
            commands::document_center::document_templates_get_default,
            commands::backend::start_backend,
            commands::backend::check_backend_status,
            commands::dashboard::dashboard_stats,
            commands::dashboard::dashboard_trends,
            commands::dashboard::dashboard_status_distribution,
            commands::dashboard::dashboard_customer_ranking,
            commands::dashboard::dashboard_monthly_comparison,
            commands::dashboard::dashboard_yearly_comparison,
            commands::dashboard::dashboard_recent_activities,
            commands::dashboard::dashboard_destination_distribution,
            commands::dashboard::dashboard_product_quantity_ranking,
            commands::dashboard::dashboard_box_type_stats,
            commands::dashboard::dashboard_batch,
            commands::reminders::reminders_get_shipment_settings,
            commands::reminders::reminders_save_shipment_settings,
            commands::reminders::reminders_get_shipment_list,
            commands::reminders::reminders_get_payment_list,
            commands::logs::logs_list,
            commands::logs::logs_delete,
            commands::logs::logs_clear,
            commands::logs::logs_clean,
            commands::forwarders::forwarders_list,
            commands::forwarders::forwarders_get,
            commands::forwarders::forwarders_create,
            commands::forwarders::forwarders_update,
            commands::forwarders::forwarders_delete,
            commands::forwarders::forwarders_clear
        ])
        .setup(|app| {
            append_app_log(app.handle(), "INFO", "应用启动（setup）");
            
            // 1. 【重要】在初始化数据库之前，同步处理删除/恢复标记
            // 必须在 DbPoolHolder 初始化之前执行，否则数据库文件会被锁定
            if let Ok(db_path) = db::connection::get_db_path(app.handle()) {
                // 处理删除标记 (erp.sqlite.delete_pending)
                let delete_pending_path = db_path.with_file_name("erp.sqlite.delete_pending");
                
                if delete_pending_path.exists() {
                    append_app_log(app.handle(), "INFO", "启动时发现数据库删除标记，正在删除数据库...");
                    
                    // 同步删除数据库文件
                    let mut deleted = false;
                    
                    // 先尝试直接删除
                    match std::fs::remove_file(&db_path) {
                        Ok(_) => {
                            append_app_log(app.handle(), "INFO", "数据库主文件删除成功");
                            deleted = true;
                        }
                        Err(e) => {
                            append_app_log(app.handle(), "WARN", &format!("首次删除失败: {}，将重试...", e));
                            // 短暂等待后重试
                            for attempt in 1..=3 {
                                std::thread::sleep(std::time::Duration::from_millis(300));
                                if std::fs::remove_file(&db_path).is_ok() {
                                    append_app_log(app.handle(), "INFO", &format!("数据库删除成功（第{}次重试）", attempt));
                                    deleted = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if deleted {
                        // 清理 WAL 和 SHM 文件
                        let _ = std::fs::remove_file(format!("{}-wal", db_path.to_string_lossy()));
                        let _ = std::fs::remove_file(format!("{}-shm", db_path.to_string_lossy()));
                        
                        // 删除标记文件
                        if let Err(e) = std::fs::remove_file(&delete_pending_path) {
                            append_app_log(app.handle(), "WARN", &format!("删除标记文件清理失败: {}", e));
                        } else {
                            append_app_log(app.handle(), "INFO", "数据库删除完成，系统将显示初始化界面");
                        }
                    } else {
                        append_app_log(app.handle(), "ERROR", "数据库删除失败，文件可能被其他程序占用");
                        // 即使删除失败也要移除标记，避免无限循环
                        let _ = std::fs::remove_file(&delete_pending_path);
                    }
                }

                // 清理旧版本遗留的恢复标记文件（兼容处理）
                let old_restore_pending = db_path.with_file_name("erp.sqlite.restore_pending");
                if old_restore_pending.exists() {
                    append_app_log(app.handle(), "INFO", "清理旧版本遗留的恢复标记文件");
                    let _ = std::fs::remove_file(&old_restore_pending);
                }
            }
            
            // 2. 初始化数据库持有者（此时池为空，数据库文件已处理完毕）
            let db_holder = DbPoolHolder::new();
            app.manage(db_holder);

            // 3. 主窗口启动即显示（与任务栏对齐），避免仅托盘可见、晚几秒再闪窗
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
                let _ = window.show();
            }

            // 优化：Node.js 后端不会自动启动，将按需加载
            println!("ℹ️ 优化模式：Node.js 后端不会自动启动，将按需加载");
            let backend_process = Arc::new(BackendProcess(Mutex::new(None)));
            
            // ... (原本的菜单逻辑) ...

            
            let show_i = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let new_order_i = MenuItem::with_id(app, "new_order", "📝 新建订单", true, None::<&str>)?;
            let today_stats_i = MenuItem::with_id(app, "today_stats", "📊 今日统计", true, None::<&str>)?;
            let about_i = MenuItem::with_id(app, "about", "ℹ️ 关于", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "🚪 退出", true, None::<&str>)?;
            
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let sep3 = PredefinedMenuItem::separator(app)?;
            
            let autostart_manager = app.autolaunch();
            let is_autostart_enabled = autostart_manager.is_enabled().unwrap_or(false);
            let auto_start_i = CheckMenuItem::with_id(app, "auto_start", "开机自启动", true, is_autostart_enabled, None::<&str>)?;
            let minimize_to_tray_i = CheckMenuItem::with_id(app, "minimize_to_tray", "最小化到托盘", true, true, None::<&str>)?;
            minimize_to_tray_i.set_enabled(false)?;
            
            let settings_submenu = Submenu::with_items(app, "⚙️ 设置", true, &[&auto_start_i, &minimize_to_tray_i])?;
            let menu = Menu::with_items(app, &[&show_i, &sep1, &new_order_i, &today_stats_i, &sep2, &settings_submenu, &sep3, &about_i, &quit_i])?;

            let backend_process_for_quit = Arc::clone(&backend_process);
            let app_handle = app.handle().clone();
            let auto_start_i_clone = auto_start_i.clone();
            
            // 克隆菜单用于手动弹出
            let menu_for_popup = menu.clone();
            
            let mut tray_builder = TrayIconBuilder::new();
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            
            let _tray = tray_builder
                .tooltip("PP订单管理系统")  // 添加提示文字，帮助用户识别图标
                // 不绑定自动菜单，手动控制弹出时机和焦点
                .on_tray_icon_event(move |_tray, event| {
                    use tauri::tray::{TrayIconEvent, MouseButton, MouseButtonState};
                    
                    match event {
                        TrayIconEvent::Click { button, button_state, .. } => {
                            match (button, button_state) {
                                (MouseButton::Right, MouseButtonState::Up) => {
                                    // 右键释放时弹出菜单
                                    #[cfg(target_os = "windows")]
                                    {
                                        use windows_sys::Win32::UI::WindowsAndMessaging::{SetForegroundWindow, PostMessageW, WM_NULL, IsWindowVisible};
                                        
                                        if let Some(webview_window) = app_handle.get_webview_window("main") {
                                            let window = webview_window.as_ref().window();
                                            
                                            if let Ok(hwnd) = window.hwnd() {
                                                unsafe {
                                                    // 只有当窗口可见时才调用 SetForegroundWindow
                                                    // 这样可以避免隐藏的窗口被意外显示出来
                                                    let hwnd_ptr = hwnd.0 as *mut std::ffi::c_void;
                                                    if IsWindowVisible(hwnd_ptr) != 0 {
                                                        SetForegroundWindow(hwnd_ptr);
                                                    }
                                                }
                                            }
                                            
                                            // 弹出菜单（让 Windows 自动处理位置）
                                            let _ = menu_for_popup.popup(window.clone());
                                            
                                            if let Ok(hwnd) = window.hwnd() {
                                                unsafe {
                                                    // 发送 WM_NULL 消息（确保菜单正确关闭）
                                                    PostMessageW(hwnd.0 as *mut std::ffi::c_void, WM_NULL, 0, 0);
                                                }
                                            }
                                        }
                                    }
                                    
                                    // 非 Windows 平台
                                    #[cfg(not(target_os = "windows"))]
                                    {
                                        if let Some(webview_window) = app_handle.get_webview_window("main") {
                                            let window = webview_window.as_ref().window();
                                            let _ = menu_for_popup.popup(window.clone());
                                        }
                                    }
                                }
                                (MouseButton::Left, MouseButtonState::Up) => {
                                    // 左键点击：显示主窗口
                                    #[cfg(target_os = "windows")]
                                    {
                                        use windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
                                        if let Some(webview_window) = app_handle.get_webview_window("main") {
                                            if let Ok(hwnd) = webview_window.as_ref().window().hwnd() {
                                                unsafe {
                                                    let _ = SetForegroundWindow(hwnd.0 as *mut std::ffi::c_void);
                                                }
                                            }
                                        }
                                    }
                                    
                                    if let Some(window) = app_handle.get_webview_window("main") {
                                        let _ = window.unminimize();
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                                _ => {}
                            }
                        }
                        _ => {}
                    }
                })
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            // 快速清理后端进程并退出
                            append_app_log(app, "INFO", "用户点击托盘退出按钮，正在退出...");
                            backend_process_for_quit.cleanup();
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "new_order" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.eval("window.location.hash = '#/orders/edit';");
                            }
                        }
                        "today_stats" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.eval("window.location.hash = '#/analytics/summary';");
                            }
                        }
                        "about" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.eval("alert('PP订单管理系统\\n版本: 2.0.0\\n\\n高效、智能的订单管理解决方案');");
                            }
                        }
                        "auto_start" => {
                            let autostart_manager = app.autolaunch();
                            let current_state = autostart_manager.is_enabled().unwrap_or(false);
                            let result = if current_state {
                                match autostart_manager.disable() {
                                    Ok(_) => { let _ = auto_start_i_clone.set_checked(false); Ok("已禁用开机自启动") }
                                    Err(e) => Err(format!("禁用失败: {:?}", e))
                                }
                            } else {
                                match autostart_manager.enable() {
                                    Ok(_) => { let _ = auto_start_i_clone.set_checked(true); Ok("已启用开机自启动") }
                                    Err(e) => Err(format!("启用失败: {:?}", e))
                                }
                            };
                            if let Some(window) = app.get_webview_window("main") {
                                match result {
                                    Ok(msg) => { let escaped = msg.replace("'", "\\'"); let _ = window.eval(&format!("window.NotificationSystem?.toast('{}', 'success', 2000);", escaped)); }
                                    Err(err) => { let escaped = err.replace("'", "\\'"); let _ = window.eval(&format!("alert('{}');", escaped)); }
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            
            // 启动自动备份管理器
            db::backup::start_backup_manager(app.handle().clone());
            
            app.manage(backend_process);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Err(e) = window.hide() {
                    eprintln!("failed to hide window: {}", e);
                }
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // 应用退出时清理后端进程
                if let Some(backend) = app_handle.try_state::<Arc<BackendProcess>>() {
                    append_app_log(app_handle, "INFO", "应用退出，正在清理后端进程...");
                    backend.cleanup();
                    append_app_log(app_handle, "INFO", "后端进程已清理");
                }
            }
        });
}
