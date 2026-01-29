@echo off
chcp 65001 >nul 2>&1
REM ========================================
REM PP订单管理系统 - 项目健康检查
REM ========================================
REM 功能：检查项目配置和环境是否正常
REM ========================================

setlocal enabledelayedexpansion

cd /d "%~dp0\..\.."

echo.
echo ========================================
echo   项目健康检查
echo ========================================
echo.

set "ERRORS=0"
set "WARNINGS=0"

REM ========================================
REM 1. 检查 Node.js 环境
REM ========================================
echo [1/8] 检查 Node.js 环境...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   ❌ Node.js 未安装
    set /a ERRORS+=1
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo   ✅ Node.js 已安装: !NODE_VERSION!
)

REM ========================================
REM 2. 检查 Rust 环境（Tauri 需要）
REM ========================================
echo.
echo [2/8] 检查 Rust 环境...
where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo   ⚠️  Rust 未安装（Tauri 开发需要）
    set /a WARNINGS+=1
) else (
    for /f "tokens=*" %%i in ('cargo --version') do set CARGO_VERSION=%%i
    echo   ✅ Rust 已安装: !CARGO_VERSION!
)

REM ========================================
REM 3. 检查依赖包
REM ========================================
echo.
echo [3/8] 检查依赖包...
if not exist "node_modules" (
    echo   ❌ node_modules 不存在，请运行: npm install
    set /a ERRORS+=1
) else (
    echo   ✅ node_modules 存在
)

if not exist "backend\node_modules" (
    echo   ⚠️  backend/node_modules 不存在
    set /a WARNINGS+=1
) else (
    echo   ✅ backend/node_modules 存在
)

REM ========================================
REM 4. 检查配置文件
REM ========================================
echo.
echo [4/8] 检查配置文件...
REM 注意：项目现在使用 AppData 目录的配置文件，不再检查项目根目录的 config/config.json
echo   [提示] 配置文件现在位于 AppData 目录（不再检查项目目录的配置文件）

if not exist ".env" (
    echo   ⚠️  .env 文件不存在（可选）
    echo      提示: 复制 .env.example 为 .env
    set /a WARNINGS+=1
) else (
    echo   ✅ .env 文件存在
)

REM ========================================
REM 5. 检查数据库
REM ========================================
echo.
echo [5/8] 检查数据库...
if not exist "data" (
    echo   ❌ data 目录不存在
    set /a ERRORS+=1
) else (
    echo   ✅ data 目录存在
)

if not exist "data\erp.sqlite" (
    echo   ⚠️  数据库文件不存在（首次运行会自动创建）
    set /a WARNINGS+=1
) else (
    for %%A in ("data\erp.sqlite") do set DB_SIZE=%%~zA
    set /a DB_SIZE_KB=!DB_SIZE!/1024
    echo   ✅ 数据库文件存在 (!DB_SIZE_KB! KB)
)

if not exist "data\backups" (
    echo   ⚠️  备份目录不存在
    set /a WARNINGS+=1
) else (
    echo   ✅ 备份目录存在
)

REM ========================================
REM 6. 检查端口占用
REM ========================================
echo.
echo [6/8] 检查端口占用...
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel% == 0 (
    echo   ⚠️  端口 3000 已被占用
    set /a WARNINGS+=1
) else (
    echo   ✅ 端口 3000 可用
)

netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>&1
if %errorlevel% == 0 (
    echo   ⚠️  端口 5173 已被占用
    set /a WARNINGS+=1
) else (
    echo   ✅ 端口 5173 可用
)

REM ========================================
REM 7. 检查脚本文件
REM ========================================
echo.
echo [7/8] 检查开发脚本...
if not exist "scripts\dev\快速启动.bat" (
    echo   ❌ 快速启动脚本不存在
    set /a ERRORS+=1
) else (
    echo   ✅ 快速启动脚本存在
)

if not exist "scripts\dev\Tauri开发.bat" (
    echo   ❌ Tauri开发脚本不存在
    set /a ERRORS+=1
) else (
    echo   ✅ Tauri开发脚本存在
)

if not exist "scripts\utils\clear-cache.bat" (
    echo   ❌ 清理缓存脚本不存在
    set /a ERRORS+=1
) else (
    echo   ✅ 清理缓存脚本存在
)

REM ========================================
REM 8. 检查文档
REM ========================================
echo.
echo [8/8] 检查文档...
if not exist "README.md" (
    echo   ⚠️  README.md 不存在
    set /a WARNINGS+=1
) else (
    echo   ✅ README.md 存在
)

if not exist "docs\开发指南.md" (
    echo   ⚠️  开发指南不存在
    set /a WARNINGS+=1
) else (
    echo   ✅ 开发指南存在
)

REM ========================================
REM 总结
REM ========================================
echo.
echo ========================================
echo   检查完成
echo ========================================
echo.
echo 错误: %ERRORS% 个
echo 警告: %WARNINGS% 个
echo.

if %ERRORS% gtr 0 (
    echo ❌ 发现 %ERRORS% 个错误，请先解决这些问题
    echo.
    echo 常见解决方案:
    echo   1. 安装 Node.js: https://nodejs.org
    echo   2. 安装依赖: npm install
    echo   3. 创建配置: 运行快速启动脚本会自动创建
    echo.
) else if %WARNINGS% gtr 0 (
    echo ⚠️  发现 %WARNINGS% 个警告，建议处理
    echo.
    echo 建议:
    echo   1. 安装 Rust（如需 Tauri 开发）: https://rustup.rs
    echo   2. 创建 .env 文件: copy .env.example .env
    echo   3. 创建备份目录: mkdir data\backups
    echo.
) else (
    echo ✅ 项目状态良好，可以开始开发！
    echo.
    echo 快速开始:
    echo   scripts\dev\快速启动.bat
    echo.
)

pause
