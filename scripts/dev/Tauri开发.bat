@echo off
chcp 65001 >nul 2>&1
REM ========================================
REM PP订单管理系统 - Tauri 桌面应用开发模式
REM ========================================
REM 开发模式: 桌面应用开发
REM 启动速度: 15-30秒，首次启动
REM 端口: 3000 后端 + Tauri窗口
REM 
REM 适合场景:
REM   - 测试系统原生功能
REM   - 文件对话框、托盘图标
REM   - 开机自启、单实例检查
REM   - 完整功能验证
REM   - 发布前最终测试
REM 
REM 完整功能:
REM   - 文件保存对话框，原生
REM   - 系统托盘图标
REM   - 开机自启动
REM   - 单实例运行
REM   - 窗口管理
REM   - 后端API完整支持
REM 
REM 对应命令: npm run tauri:dev
REM ========================================
setlocal enabledelayedexpansion

REM 缓解 Windows 杀软在并发编译时拦截 build-script（getrandom 等报「拒绝访问 os error 5」）
set CARGO_BUILD_JOBS=1

REM 切换到项目根目录
cd /d "%~dp0\..\.."
if errorlevel 1 (
    echo [错误] 无法切换到项目根目录！
    pause
    exit /b 1
)

echo.
echo ========================================
echo   PP订单管理系统 - Tauri 开发模式
echo ========================================
echo.
echo [模式] 桌面应用开发
echo [速度] 首次 15-30 秒，后续 5-10 秒
echo [适合] 测试原生功能、完整功能验证
echo.
echo [完整功能] 文件对话框、托盘图标、开机自启、单实例运行、窗口管理、后端API
echo.
echo [注意] 首次启动需要编译 Rust 代码
echo        请耐心等待 15-30 秒
echo.
echo ========================================

REM 检查 Node.js
echo.
echo [1/5] 检查 Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [错误] 未找到 Node.js
    echo   下载地址: https://nodejs.org
    pause
    exit /b 1
)
echo   [OK] Node.js 已安装

REM 检查 Rust
echo.
echo [2/5] 检查 Rust 工具链...
where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo   [错误] 未找到 Rust 工具链
    echo   Tauri 需要 Rust 才能编译桌面应用
    echo.
    echo   安装步骤：
    echo   1. 访问: https://rustup.rs
    echo   2. 下载并安装 rustup-init.exe
    echo   3. 重启终端后重新运行此脚本
    echo.
    pause
    exit /b 1
)
echo   [OK] Rust 工具链已安装

REM 检查依赖
echo.
echo [3/5] 检查 Node.js 依赖包...
if not exist "node_modules" (
    echo   [提示] 正在安装依赖包...
    call npm install
    if errorlevel 1 (
        echo   [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo   [OK] 依赖包安装完成
) else (
    echo   [OK] 依赖包已存在
)

REM 检查 Tauri CLI
echo.
echo [4/5] 检查 Tauri CLI...
call npm list @tauri-apps/cli >nul 2>&1
if errorlevel 1 (
    echo   [警告] 未找到 Tauri CLI，正在安装...
    call npm install --save-dev @tauri-apps/cli
    if errorlevel 1 (
        echo   [错误] Tauri CLI 安装失败
        pause
        exit /b 1
    )
    echo   [OK] Tauri CLI 安装完成
) else (
    echo   [OK] Tauri CLI 已安装
)

REM 检查配置（项目现在使用 AppData 目录的配置文件）
echo.
echo [5/5] 检查配置...
echo   [OK] 将使用 AppData 目录的配置文件

echo.
echo ========================================
echo   启动 Tauri 开发环境
echo ========================================
echo.
echo   后端: http://localhost:3000
echo   前端: Tauri 桌面窗口
echo.
echo   特性: 系统原生功能、文件对话框、托盘图标、开机自启、单实例运行
echo.
echo   提示: 首次启动需要编译 Rust（15-30秒），后续启动会更快（5-10秒）
echo.
echo   按 Ctrl+C 停止所有服务
echo ========================================
echo.
echo [启动中] 正在启动后端和 Tauri...
echo.
echo   提示: 请勿同时运行多个本脚本或其它 cargo/tauri dev。
echo   若长时间停在「Blocking waiting for file lock」: 任务管理器结束多余的 cargo.exe 后重试。
echo   已配置 rust-analyzer 使用独立 target 目录，减少与 Tauri 抢锁（见 .vscode\settings.json）。
echo.

REM 设置数据库路径环境变量（使用 AppData 目录，与 Tauri 生产环境一致）
REM 获取 AppData 目录
set "APPDATA_DIR=%APPDATA%"
if not defined APPDATA_DIR (
    echo   [警告] 无法获取 APPDATA 目录，使用默认路径
    set "APPDATA_DIR=%USERPROFILE%\AppData\Roaming"
)

REM 设置数据库路径为 AppData 目录
set "DB_PATH=%APPDATA_DIR%\com.pp.ordermanagement\data\erp.sqlite"
set "DATA_ROOT=%APPDATA_DIR%\com.pp.ordermanagement\data"
set "CONFIG_ROOT=%APPDATA_DIR%\com.pp.ordermanagement\config"

echo   [配置] 数据库路径: %DB_PATH%
echo   [配置] 数据目录: %DATA_ROOT%
echo   [配置] 配置目录: %CONFIG_ROOT%
echo.

REM 确保目录存在
if not exist "%DATA_ROOT%" (
    echo   [创建] 正在创建数据目录...
    mkdir "%DATA_ROOT%" 2>nul
)
if not exist "%CONFIG_ROOT%" (
    echo   [创建] 正在创建配置目录...
    mkdir "%CONFIG_ROOT%" 2>nul
)

REM 验证环境变量已设置
if not defined DB_PATH (
    echo   [错误] DB_PATH 环境变量未设置
    pause
    exit /b 1
)

REM 显示环境变量配置（用于调试）
echo   [验证] 环境变量配置:
echo          DB_PATH=%DB_PATH%
echo          DATA_ROOT=%DATA_ROOT%
echo          CONFIG_ROOT=%CONFIG_ROOT%
echo.

REM 检查是否安装了 cross-env
call npm list cross-env >nul 2>&1
if errorlevel 1 (
    echo   [安装] 正在安装 cross-env（用于传递环境变量）...
    call npm install --save-dev cross-env --silent
    if errorlevel 1 (
        echo   [警告] cross-env 安装失败，将尝试直接使用环境变量
    ) else (
        echo   [OK] cross-env 安装完成
    )
)

REM 使用 cross-env 确保环境变量正确传递给 concurrently 的子进程
call npm list cross-env >nul 2>&1
if not errorlevel 1 (
    echo   [启动] 使用 cross-env 传递环境变量...
    call npx cross-env DB_PATH="%DB_PATH%" DATA_ROOT="%DATA_ROOT%" CONFIG_ROOT="%CONFIG_ROOT%" npm run tauri:dev
) else (
    echo   [启动] 直接启动（环境变量已设置）...
    call npm run tauri:dev
)

if errorlevel 1 (
    echo.
    echo ========================================
    echo   启动失败
    echo ========================================
    echo.
    echo 常见问题: Rust工具链过旧、Tauri依赖缺失、端口3000被占用、编译缓存损坏
    echo.
    echo 若报错含「拒绝访问」「os error 5」「build-script-build」:
    echo   多为杀毒软件拦截 target\debug\build 下刚生成的程序。
    echo   请将本仓库的 src-tauri\target 加入 Windows 安全中心排除项，
    echo   或对 rustup 工具链目录添加排除，然后重新运行本脚本。
    echo.
    echo 其他方案: rustup update / scripts\utils\clear-cache.bat / netstat -ano
    echo.
    echo 详细文档: https://tauri.app
    echo.
    pause
    exit /b 1
)
