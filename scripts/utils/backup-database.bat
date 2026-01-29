@echo off
chcp 65001 >nul 2>&1
REM ========================================
REM PP订单管理系统 - 数据库备份工具
REM ========================================
REM 功能：自动备份 SQLite 数据库
REM 备份位置：data/backups/
REM 命名格式：erp_backup_YYYYMMDD_HHMMSS.sqlite
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
echo   数据库备份工具
echo ========================================
echo.

REM 检查数据库文件是否存在
if not exist "data\erp.sqlite" (
    echo [错误] 数据库文件不存在: data\erp.sqlite
    echo.
    pause
    exit /b 1
)

REM 创建备份目录
if not exist "data\backups" (
    mkdir "data\backups" 2>nul
    echo [创建] 备份目录: data\backups
)

REM 生成备份文件名（时间戳）
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=%datetime:~0,4%%datetime:~4,2%%datetime:~6,2%_%datetime:~8,2%%datetime:~10,2%%datetime:~12,2%
set BACKUP_FILE=data\backups\erp_backup_%TIMESTAMP%.sqlite

echo [备份] 正在备份数据库...
echo   源文件: data\erp.sqlite
echo   目标文件: %BACKUP_FILE%
echo.

REM 复制数据库文件
copy "data\erp.sqlite" "%BACKUP_FILE%" >nul 2>&1
if errorlevel 1 (
    echo [错误] 备份失败！
    echo.
    pause
    exit /b 1
)

REM 获取备份文件大小
for %%A in ("%BACKUP_FILE%") do set BACKUP_SIZE=%%~zA
set /a BACKUP_SIZE_KB=%BACKUP_SIZE%/1024

echo [成功] 备份完成！
echo   备份文件: %BACKUP_FILE%
echo   文件大小: %BACKUP_SIZE_KB% KB
echo.

REM 清理旧备份（保留最近10个）
echo [清理] 检查旧备份文件...
set COUNT=0
for /f "delims=" %%F in ('dir /b /o-d "data\backups\erp_backup_*.sqlite" 2^>nul') do (
    set /a COUNT+=1
    if !COUNT! gtr 10 (
        echo   删除旧备份: %%F
        del "data\backups\%%F" 2>nul
    )
)

if %COUNT% gtr 10 (
    echo [清理] 已删除 %COUNT% 个旧备份文件（保留最近10个）
) else (
    echo [提示] 当前备份数量: %COUNT% 个
)

echo.
echo ========================================
echo   备份完成
echo ========================================
echo.
echo 备份文件位置: %BACKUP_FILE%
echo.
echo 提示：
echo   - 备份文件可以直接复制到其他位置保存
echo   - 恢复数据库：将备份文件复制为 data\erp.sqlite
echo   - 建议定期备份重要数据
echo.

pause
