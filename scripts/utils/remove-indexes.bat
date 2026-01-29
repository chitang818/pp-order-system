@echo off
chcp 65001 > nul
REM ================================================================
REM 移除数据库索引（回滚优化）
REM 
REM 用途：移除由 apply-indexes.bat 创建的索引
REM 使用场景：索引导致问题需要回滚
REM ================================================================

setlocal enabledelayedexpansion

echo.
echo ================================================================
echo            数据库索引回滚工具
echo ================================================================
echo.

REM 检查Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js
    pause
    exit /b 1
)

REM 切换到项目根目录
cd /d "%~dp0..\.."

echo [信息] 项目目录: %CD%
echo.

echo ================================================================
echo                  警告
echo ================================================================
echo.
echo 此操作将会：
echo   1. 移除所有优化索引（约37个）
echo   2. 查询性能将恢复到优化前状态
echo   3. 不会影响数据本身
echo.
echo 仅在以下情况使用：
echo   - 索引导致应用异常
echo   - 需要调试性能问题
echo   - 测试索引效果
echo.
set /p confirm="确认移除所有索引? (y/n): "
if /i not "%confirm%"=="y" (
    echo.
    echo 操作已取消
    pause
    exit /b 0
)

echo.
echo 开始移除索引...
echo.

REM 使用sqlite3命令行工具执行SQL
where sqlite3 >nul 2>&1
if %errorlevel% equ 0 (
    REM 如果有sqlite3命令行工具
    sqlite3 data\erp.sqlite < backend\db\migrations\remove-indexes.sql
    if %errorlevel% equ 0 (
        echo [成功] 索引已移除
    ) else (
        echo [失败] 移除索引失败
    )
) else (
    REM 使用Node.js执行
    echo [信息] 使用Node.js执行回滚...
    node -e "const fs = require('fs'); const sqlite3 = require('sqlite3').verbose(); const sql = fs.readFileSync('backend/db/migrations/remove-indexes.sql', 'utf8'); const db = new sqlite3.Database('data/erp.sqlite'); db.exec(sql, (err) => { if (err) { console.error('[失败]', err.message); process.exit(1); } else { console.log('[成功] 索引已移除'); db.close(); }})"
)

echo.
echo ================================================================
echo 回滚完成
echo ================================================================
echo.
echo 建议：
echo   1. 重启应用
echo   2. 验证功能正常
echo   3. 如需重新优化，运行 apply-indexes.bat
echo.

pause
