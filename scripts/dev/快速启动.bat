@echo off
chcp 65001 >nul 2>&1
REM ========================================
REM PP订单管理系统 - 全栈开发模式
REM ========================================
REM 开发模式：🌐 全栈开发（推荐）
REM 启动速度：5-10 秒
REM 端口：5173（前端）+ 3000（后端）
REM 
REM 适合场景：
REM   ✅ API 对接和功能开发（20%的开发时间）
REM   ✅ 前后端联调
REM   ✅ 完整业务流程测试
REM   ✅ 日常开发（推荐）
REM 
REM 完整功能：
REM   ✅ 前端热重载
REM   ✅ 后端 API 完整支持
REM   ✅ 数据库操作
REM   ✅ 浏览器调试
REM 
REM 功能限制：
REM   ⚠️  文件保存功能降级为浏览器下载
REM   ⚠️  无系统原生功能（需要 Tauri 模式）
REM 
REM 对应命令：npm run dev:all
REM ========================================

setlocal enabledelayedexpansion

REM 切换到项目根目录
cd /d "%~dp0\..\.."
if errorlevel 1 (
    echo [错误] 无法切换到项目根目录！
    pause
    exit /b 1
)

echo.
echo ========================================
echo   PP订单管理系统 - 全栈开发模式
echo ========================================
echo.
echo [模式] 🌐 全栈开发（推荐）
echo [速度] 5-10 秒启动
echo [适合] API开发、功能开发、日常开发
echo.
echo [完整功能]
echo   ✅ 前端热重载
echo   ✅ 后端 API 支持
echo   ✅ 数据库操作
echo   ✅ 浏览器调试
echo.
echo [其他开发模式]
echo   ⚡ 仅前端：前端开发.bat（UI调整）
echo   🖥️  桌面应用：Tauri开发.bat（原生功能）
echo.
echo ========================================

REM 检查 Node.js
echo.
echo [1/4] 检查 Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [错误] 未找到 Node.js
    echo   下载地址: https://nodejs.org
    pause
    exit /b 1
)
echo   [OK] Node.js 已安装

REM 检查依赖
echo.
echo [2/4] 检查依赖包...
if not exist "node_modules" (
    echo   [提示] 正在安装依赖包，这可能需要几分钟...
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

REM 检查配置文件
echo.
echo [3/4] 检查配置文件...
if not exist "config" (
    mkdir "config" 2>nul
    echo   [创建] config 目录
)

REM 注意：项目现在使用 AppData 目录的配置文件，不再使用项目根目录的 config/config.json
REM 如果存在旧配置文件，可以忽略（已废弃）
if exist "config\config.json" (
    echo   [提示] 检测到旧的配置文件 config/config.json（已废弃，将被忽略）
)

REM 检查数据库目录
if not exist "data" (
    mkdir "data" 2>nul
    echo   [创建] data 目录
)

REM 检查端口占用
echo.
echo [4/4] 检查端口占用...
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel% == 0 (
    echo   [警告] 端口 3000 已被占用
    echo   提示：可能已有后端服务器在运行
    echo.
    set /p CONTINUE="是否继续启动？(Y/N): "
    if /i not "!CONTINUE!"=="Y" (
        echo   [取消] 已取消启动
        pause
        exit /b 0
    )
)

netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>&1
if %errorlevel% == 0 (
    echo   [警告] 端口 5173 已被占用
    echo   提示：可能已有前端服务器在运行
)

if %errorlevel% == 0 (
    echo.
    echo   [提示] 如需停止现有服务器，按 Ctrl+C 取消
    echo          然后在相应终端窗口按 Ctrl+C 停止服务
    echo.
    timeout /t 3 /nobreak >nul 2>&1
) else (
    echo   [OK] 端口可用
)

echo.
echo ========================================
echo   启动全栈开发服务器
echo ========================================
echo.
echo   前端: http://localhost:5173
echo   后端: http://localhost:3000
echo   健康检查: http://localhost:3000/api/health
echo.
echo   🌐 特性：
echo     - 前端热重载（修改即生效）
echo     - 后端自动重启（监听文件变化）
echo     - API 完整支持
echo     - 浏览器调试工具
echo.
echo   💡 提示：
echo     - 前端需要等待后端启动（约3秒）
echo     - 浏览器会自动打开
echo     - 日志会显示在终端
echo.
echo   按 Ctrl+C 停止所有服务
echo ========================================
REM ========================================
REM 统一数据库路径配置
REM ========================================

echo.
echo [配置] 统一数据库路径...

REM 设置数据库路径为 AppData 目录（与 Tauri 开发模式保持一致）
set "DB_PATH=%APPDATA%\com.pp.ordermanagement\data\erp.sqlite"

REM 确保 AppData 目录存在
if not exist "%APPDATA%\com.pp.ordermanagement\data" (
    mkdir "%APPDATA%\com.pp.ordermanagement\data" 2>nul
    echo   [创建] 数据目录: %APPDATA%\com.pp.ordermanagement\data
)

REM 检查数据库文件
if exist "%DB_PATH%" (
    echo   [OK] 数据库文件已存在
) else (
    echo   [提示] 数据库文件不存在，首次启动将自动创建
    echo.
    
    REM 检查项目目录是否有旧数据库
    if exist "data\erp.sqlite" (
        echo   [发现] 项目目录存在旧数据库: data\erp.sqlite
        echo.
        set /p MIGRATE="  是否迁移到 AppData 目录？(Y/N): "
        if /i "!MIGRATE!"=="Y" (
            echo   [迁移] 正在复制数据库...
            copy "data\erp.sqlite" "%DB_PATH%" >nul 2>&1
            if !errorlevel! == 0 (
                echo   [成功] 数据库已迁移到 AppData 目录
                echo   [提示] 原数据库文件保留在 data\erp.sqlite（可手动删除）
            ) else (
                echo   [失败] 数据库迁移失败，将创建新数据库
            )
        )
        echo.
    )
)

echo   [路径] %DB_PATH%
echo.

REM ========================================

echo [启动中] 正在启动后端和前端服务器...
echo           浏览器将在 3 秒后自动打开
echo.

REM 延迟3秒后在后台打开浏览器
start /B cmd /c "timeout /t 5 /nobreak >nul 2>&1 && start http://localhost:5173"

REM 使用 npm 脚本启动前后端
call npm run dev:all

if errorlevel 1 (
    echo.
    echo ========================================
    echo   启动失败
    echo ========================================
    echo.
    echo 常见问题：
    echo   1. 端口 3000 或 5173 被占用
    echo   2. 依赖包未正确安装
    echo   3. 配置文件损坏
    echo   4. 数据库文件损坏或路径错误
    echo.
    echo 解决方案：
    echo   1. 停止占用端口的进程：
    echo      - 查看进程：netstat -ano ^| findstr :3000
    echo      - 结束进程：taskkill /F /PID [进程ID]
    echo.
    echo   2. 清理缓存并重启：
    echo      - 运行：scripts\utils\clear-cache.bat
    echo      - 然后重新运行此脚本
    echo.
    echo   3. 重新安装依赖：
    echo      - 删除 node_modules 文件夹
    echo      - 运行：npm install
    echo.
    echo   4. 检查配置文件：
    echo      - 配置文件：AppData 目录（不再使用项目目录的 config/config.json）
    echo      - 数据库路径：data\erp.sqlite
    echo.
    echo 详细文档：
    echo   - 开发指南：docs\开发指南.md
    echo   - 脚本说明：scripts\README.md
    echo.
    pause
    exit /b 1
)
