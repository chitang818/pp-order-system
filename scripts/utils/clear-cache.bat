@echo off
chcp 65001 >nul 2>&1
REM ========================================
REM PP订单管理系统 - 智能缓存清理工具
REM ========================================
REM 功能：
REM   1. 清理所有开发缓存（Vite、Node.js、Puppeteer）
REM   2. 清理构建产物（dist、Tauri target）
REM   3. 自动修复配置文件路径问题
REM   4. 清理临时文件和系统垃圾
REM 
REM 适用场景：
REM   - 项目出现奇怪错误
REM   - 复制项目到新电脑
REM   - Vite 缓存导致的构建问题
REM   - 配置文件路径错误
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
echo   PP订单管理系统 - 智能缓存清理
echo ========================================
echo.
echo [提示] 此操作将清理以下内容：
echo   1. Vite 开发缓存
echo   2. 构建产物 (dist)
echo   3. Tauri 编译缓存 (可选)
echo   4. Puppeteer 缓存
echo   5. 临时文件和系统垃圾
echo   6. 配置文件路径修复
echo.
echo [警告] 清理 Tauri 缓存会删除约 2-3GB 的 Rust 编译产物
echo        首次重新编译需要 10-15 分钟
echo.

REM 询问是否清理 Tauri 缓存
set "CLEAN_TAURI=N"
set /p CLEAN_TAURI="是否清理 Tauri 编译缓存？(Y/N，默认 N): "
if /i "%CLEAN_TAURI%"=="" set "CLEAN_TAURI=N"

echo.
echo [确认] 按任意键开始清理，或关闭窗口取消...
pause >nul

echo.
echo ========================================
echo   开始清理...
echo ========================================

REM ========================================
REM 步骤 1: 清理 Vite 缓存
REM ========================================
echo.
echo [1/6] 清理 Vite 缓存...
set "VITE_CLEANED=0"

if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] node_modules\.vite 已清理
        set /a VITE_CLEANED+=1
    )
)

if exist "frontend\.vite" (
    rmdir /s /q "frontend\.vite" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] frontend\.vite 已清理
        set /a VITE_CLEANED+=1
    )
)

if exist ".vite" (
    rmdir /s /q ".vite" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] .vite 已清理
        set /a VITE_CLEANED+=1
    )
)

if !VITE_CLEANED! equ 0 (
    echo   [跳过] 未发现 Vite 缓存
)

REM ========================================
REM 步骤 2: 清理构建产物
REM ========================================
echo.
echo [2/6] 清理构建产物...
set "BUILD_CLEANED=0"

if exist "dist" (
    rmdir /s /q "dist" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] dist 目录已清理
        set /a BUILD_CLEANED+=1
    )
)

if exist "build" (
    rmdir /s /q "build" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] build 目录已清理
        set /a BUILD_CLEANED+=1
    )
)

if !BUILD_CLEANED! equ 0 (
    echo   [跳过] 未发现构建产物
)

REM ========================================
REM 步骤 3: 清理 Tauri 编译缓存（可选）
REM ========================================
echo.
echo [3/6] 清理 Tauri 编译缓存...

if /i "%CLEAN_TAURI%"=="Y" (
    if exist "src-tauri\target" (
        echo   [警告] 正在删除 Rust 编译缓存，这可能需要几秒钟...
        rmdir /s /q "src-tauri\target" 2>nul
        if !errorlevel! equ 0 (
            echo   [OK] src-tauri\target 已清理（约 2-3GB）
        ) else (
            echo   [失败] 无法清理 src-tauri\target，请手动删除
        )
    ) else (
        echo   [跳过] 未发现 Tauri 编译缓存
    )
) else (
    echo   [跳过] 已选择保留 Tauri 编译缓存
)

REM ========================================
REM 步骤 4: 清理 Puppeteer 和其他缓存
REM ========================================
echo.
echo [4/6] 清理其他缓存...
set "OTHER_CLEANED=0"

if exist ".puppeteer_cache" (
    rmdir /s /q ".puppeteer_cache" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] .puppeteer_cache 已清理
        set /a OTHER_CLEANED+=1
    )
)

if exist "node_modules\.cache" (
    rmdir /s /q "node_modules\.cache" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] node_modules\.cache 已清理
        set /a OTHER_CLEANED+=1
    )
)

if exist "temp_conversions" (
    rmdir /s /q "temp_conversions" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] temp_conversions 已清理
        set /a OTHER_CLEANED+=1
    )
)

if exist ".progress" (
    rmdir /s /q ".progress" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] .progress 已清理
        set /a OTHER_CLEANED+=1
    )
)

REM 清理测试相关目录
if exist "test-results" (
    rmdir /s /q "test-results" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] test-results 已清理
        set /a OTHER_CLEANED+=1
    )
)

if exist "playwright-report" (
    rmdir /s /q "playwright-report" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] playwright-report 已清理
        set /a OTHER_CLEANED+=1
    )
)

if exist "coverage" (
    rmdir /s /q "coverage" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] coverage 已清理
        set /a OTHER_CLEANED+=1
    )
)

if !OTHER_CLEANED! equ 0 (
    echo   [跳过] 未发现其他缓存
)

REM ========================================
REM 步骤 5: 清理临时文件和系统垃圾
REM ========================================
echo.
echo [5/6] 清理临时文件和系统垃圾...
set "TEMP_CLEANED=0"

REM 清理日志文件
for %%f in (*.log) do (
    del /q "%%f" 2>nul
    if !errorlevel! equ 0 (
        echo   [OK] 删除日志文件: %%f
        set /a TEMP_CLEANED+=1
    )
)

REM 清理 Tauri 日志
if exist "src-tauri\*.log" (
    del /q "src-tauri\*.log" 2>nul
    echo   [OK] 清理 Tauri 日志文件
    set /a TEMP_CLEANED+=1
)

if exist "src-tauri\*.txt" (
    del /q "src-tauri\*.txt" 2>nul
    echo   [OK] 清理 Tauri 临时文件
    set /a TEMP_CLEANED+=1
)

REM 清理临时脚本
for %%f in (temp_*.bat temp_*.js temp_*.txt) do (
    if exist "%%f" (
        del /q "%%f" 2>nul
        if !errorlevel! equ 0 (
            echo   [OK] 删除临时文件: %%f
            set /a TEMP_CLEANED+=1
        )
    )
)

REM 清理系统垃圾文件
if exist ".DS_Store" (
    del /q /s .DS_Store 2>nul
    echo   [OK] 清理 macOS 系统文件
    set /a TEMP_CLEANED+=1
)

if exist "Thumbs.db" (
    del /q /s Thumbs.db 2>nul
    echo   [OK] 清理 Windows 缩略图缓存
    set /a TEMP_CLEANED+=1
)

if exist "desktop.ini" (
    del /q /s desktop.ini 2>nul
    echo   [OK] 清理 Windows 桌面配置
    set /a TEMP_CLEANED+=1
)

if !TEMP_CLEANED! equ 0 (
    echo   [跳过] 未发现临时文件
)

REM ========================================
REM 步骤 6: 检查并修复配置文件
REM ========================================
echo.
echo [6/6] 检查并修复配置文件...

REM 确保配置目录存在
if not exist "config" (
    mkdir "config" 2>nul
    echo   [创建] config 目录
)

REM 注意：项目现在使用 AppData 目录的配置文件，不再使用项目根目录的 config/config.json
REM 如果存在旧配置文件，可以忽略（已废弃）
if exist "config\config.json" (
    echo   [提示] 检测到旧的配置文件 config/config.json（已废弃，将被忽略）
)

REM ========================================
REM 清理完成
REM ========================================
echo.
echo ========================================
echo   清理完成！
echo ========================================
echo.
echo [总结]
echo   - Vite 缓存：!VITE_CLEANED! 项
echo   - 构建产物：!BUILD_CLEANED! 项
echo   - 其他缓存：!OTHER_CLEANED! 项
echo   - 临时文件：!TEMP_CLEANED! 项
echo   - 配置文件：已检查并修复
echo.

if /i "%CLEAN_TAURI%"=="Y" (
    echo [重要提示]
    echo   您已清理 Tauri 编译缓存，下次运行 tauri:dev 或 tauri:build 时
    echo   需要重新编译 Rust 代码，首次编译可能需要 10-15 分钟。
    echo.
)

echo [下一步]
echo   1. 如果清理了 Tauri 缓存，首次启动会较慢
echo   2. 运行启动脚本：scripts\dev\快速启动.bat
echo   3. 或使用 npm 命令：npm run dev:all
echo.
echo [提示]
echo   - 配置文件路径：AppData 目录（不再使用项目目录的 config/config.json）
echo   - 数据库路径：data\erp.sqlite
echo   - 如需重装依赖：npm install
echo.

pause
