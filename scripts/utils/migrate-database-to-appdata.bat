@echo off
chcp 65001 >nul 2>&1
REM ========================================
REM 数据库迁移到 AppData 目录
REM ========================================
setlocal enabledelayedexpansion

cd /d "%~dp0\..\.."

echo.
echo ========================================
echo   数据库迁移到 AppData 目录
echo ========================================
echo.

set "OLD_DB=data\erp.sqlite"
set "NEW_DB=%APPDATA%\com.pp.ordermanagement\data\erp.sqlite"

REM 检查源数据库
if not exist "%OLD_DB%" (
    echo [提示] 项目目录没有数据库文件
    echo [路径] %OLD_DB%
    echo.
    echo [提示] 无需迁移
    pause
    exit /b 0
)

REM 显示数据库信息
echo [源数据库]
echo   路径: %OLD_DB%
for %%I in ("%OLD_DB%") do echo   大小: %%~zI 字节
for %%I in ("%OLD_DB%") do echo   修改时间: %%~tI
echo.

REM 检查目标数据库
if exist "%NEW_DB%" (
    echo [目标数据库] 已存在
    echo   路径: %NEW_DB%
    for %%I in ("%NEW_DB%") do echo   大小: %%~zI 字节
    for %%I in ("%NEW_DB%") do echo   修改时间: %%~tI
    echo.
    echo [警告] AppData 目录已存在数据库文件
    echo.
    set /p OVERWRITE="是否覆盖现有数据库？(Y/N): "
    if /i not "!OVERWRITE!"=="Y" (
        echo.
        echo [取消] 已取消迁移
        pause
        exit /b 0
    )
    echo.
) else (
    echo [目标数据库] 不存在，将创建新文件
    echo   路径: %NEW_DB%
    echo.
)

echo [开始] 正在迁移数据库...
echo.

REM 创建目标目录
if not exist "%APPDATA%\com.pp.ordermanagement\data" (
    echo [1/3] 创建目标目录...
    mkdir "%APPDATA%\com.pp.ordermanagement\data" 2>nul
    if !errorlevel! == 0 (
        echo       [OK] 目录已创建
    ) else (
        echo       [失败] 无法创建目录
        pause
        exit /b 1
    )
)

REM 备份现有文件
if exist "%NEW_DB%" (
    echo [2/3] 备份现有数据库...
    set "BACKUP_NAME=erp.sqlite.backup-%date:~0,4%%date:~5,2%%date:~8,2%-%time:~0,2%%time:~3,2%%time:~6,2%"
    set "BACKUP_NAME=!BACKUP_NAME: =0!"
    copy "%NEW_DB%" "%APPDATA%\com.pp.ordermanagement\data\!BACKUP_NAME!" >nul 2>&1
    if !errorlevel! == 0 (
        echo       [OK] 备份已保存
        echo       [位置] %APPDATA%\com.pp.ordermanagement\data\!BACKUP_NAME!
    ) else (
        echo       [警告] 备份失败，但将继续迁移
    )
) else (
    echo [2/3] 无需备份（目标文件不存在）
)

REM 复制数据库
echo [3/3] 复制数据库文件...
copy "%OLD_DB%" "%NEW_DB%" >nul 2>&1

if !errorlevel! == 0 (
    echo       [OK] 数据库已复制
    echo.
    echo ========================================
    echo   迁移完成！
    echo ========================================
    echo.
    echo [成功] 数据库已迁移到 AppData 目录
    echo.
    echo [新路径] %NEW_DB%
    echo.
    echo [提示] 
    echo   - 现在两种开发模式都将使用 AppData 目录的数据库
    echo   - 原数据库文件保留在项目目录中
    echo   - 可以安全删除 data\erp.sqlite（建议先测试确认）
    echo.
) else (
    echo       [失败] 数据库复制失败
    echo.
    echo ========================================
    echo   迁移失败
    echo ========================================
    echo.
    echo [错误] 错误代码: !errorlevel!
    echo.
    echo [可能原因]
    echo   - 磁盘空间不足
    echo   - 文件被占用
    echo   - 权限不足
    echo.
    echo [解决方案]
    echo   1. 关闭所有使用数据库的程序
    echo   2. 检查磁盘空间
    echo   3. 以管理员身份运行此脚本
    echo.
)

pause
