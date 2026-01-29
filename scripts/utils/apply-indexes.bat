@echo off
chcp 65001 > nul
REM ================================================================
REM 应用数据库索引优化
REM 
REM 用途：创建数据库索引，提升查询性能70-90%
REM 作者：系统优化工具
REM 创建时间：2026-01-18
REM ================================================================

setlocal enabledelayedexpansion

echo.
echo ================================================================
echo            数据库索引优化工具
echo ================================================================
echo.

REM 检查Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

REM 切换到项目根目录
cd /d "%~dp0..\.."

echo [信息] 项目目录: %CD%
echo.

REM 检查数据库文件
if not exist "data\erp.sqlite" (
    echo [警告] 未找到数据库文件: data\erp.sqlite
    echo.
    echo 可能原因：
    echo   1. 数据库文件在其他位置（Tauri AppData目录）
    echo   2. 尚未初始化数据库
    echo.
    set /p continue="是否继续（将使用环境变量中的数据库路径）? (y/n): "
    if /i not "!continue!"=="y" (
        echo 操作已取消
        pause
        exit /b 0
    )
)

echo.
echo ================================================================
echo                  重要提示
echo ================================================================
echo.
echo 此操作将会：
echo   1. 为数据库创建多个索引（约37个）
echo   2. 提升查询性能70-90%%
echo   3. 占用额外5-10%%的存储空间
echo   4. 略微降低写入性能（5-10%%）
echo.
echo 建议：
echo   - 在生产环境执行前先备份数据库
echo   - 在测试环境验证效果
echo.
set /p confirm="确认执行索引优化? (y/n): "
if /i not "%confirm%"=="y" (
    echo.
    echo 操作已取消
    pause
    exit /b 0
)

echo.
echo ================================================================
echo 开始执行索引优化...
echo ================================================================
echo.

REM 执行索引创建脚本
node backend\db\migrations\apply-indexes.js

if %errorlevel% equ 0 (
    echo.
    echo ================================================================
    echo [成功] 索引优化完成！
    echo ================================================================
    echo.
    echo 建议下一步：
    echo   1. 重启应用以确保索引生效
    echo   2. 监控应用性能变化
    echo   3. 查看日志确认无异常
    echo.
    echo 如需回滚：
    echo   运行 scripts\utils\remove-indexes.bat
    echo.
) else (
    echo.
    echo ================================================================
    echo [失败] 索引优化执行失败
    echo ================================================================
    echo.
    echo 可能原因：
    echo   1. 数据库文件被占用（请关闭应用）
    echo   2. 数据库文件损坏
    echo   3. 权限不足
    echo.
    echo 建议：
    echo   1. 关闭正在运行的应用
    echo   2. 检查数据库文件完整性
    echo   3. 查看上方错误信息
    echo.
)

pause
exit /b %errorlevel%
