@echo off
chcp 65001 >nul 2>&1
REM ========================================
REM 数据库路径诊断工具
REM ========================================
setlocal enabledelayedexpansion

cd /d "%~dp0\..\.."

echo.
echo ========================================
echo   数据库路径诊断工具
echo ========================================
echo.

set "PROJECT_DB=data\erp.sqlite"
set "APPDATA_DB=%APPDATA%\com.pp.ordermanagement\data\erp.sqlite"

echo [检查 1] 项目目录数据库
echo --------------------
if exist "%PROJECT_DB%" (
    echo   状态: [✓] 存在
    echo   路径: %PROJECT_DB%
    for %%I in ("%PROJECT_DB%") do (
        echo   大小: %%~zI 字节
        echo   修改: %%~tI
    )
) else (
    echo   状态: [✗] 不存在
    echo   路径: %PROJECT_DB%
)

echo.
echo [检查 2] AppData 目录数据库
echo --------------------
if exist "%APPDATA_DB%" (
    echo   状态: [✓] 存在
    echo   路径: %APPDATA_DB%
    for %%I in ("%APPDATA_DB%") do (
        echo   大小: %%~zI 字节
        echo   修改: %%~tI
    )
) else (
    echo   状态: [✗] 不存在
    echo   路径: %APPDATA_DB%
)

echo.
echo [检查 3] 环境变量
echo --------------------
if defined DB_PATH (
    echo   DB_PATH: %DB_PATH%
    if exist "%DB_PATH%" (
        echo   状态: [✓] 文件存在
    ) else (
        echo   状态: [✗] 文件不存在
    )
) else (
    echo   DB_PATH: (未设置)
)

echo.
echo [分析] 当前配置状态
echo ========================================

set "PROJECT_EXISTS=0"
set "APPDATA_EXISTS=0"

if exist "%PROJECT_DB%" set "PROJECT_EXISTS=1"
if exist "%APPDATA_DB%" set "APPDATA_EXISTS=1"

if %PROJECT_EXISTS%==1 if %APPDATA_EXISTS%==1 (
    echo   [状态] 两个位置都存在数据库
    echo.
    echo   [问题] 可能导致数据不一致
    echo.
    echo   [建议] 
    echo     1. 备份两个数据库文件
    echo     2. 决定使用哪个数据库（通常是 AppData 版本）
    echo     3. 运行迁移工具：scripts\utils\migrate-database-to-appdata.bat
    echo     4. 删除或重命名项目目录的数据库文件
) else if %PROJECT_EXISTS%==1 if %APPDATA_EXISTS%==0 (
    echo   [状态] 仅项目目录存在数据库
    echo.
    echo   [说明] 旧版本配置，建议迁移
    echo.
    echo   [建议] 
    echo     - 运行迁移工具：scripts\utils\migrate-database-to-appdata.bat
    echo     - 迁移后两种开发模式将使用相同数据库
) else if %PROJECT_EXISTS%==0 if %APPDATA_EXISTS%==1 (
    echo   [状态] 仅 AppData 目录存在数据库
    echo.
    echo   [说明] 配置正确！
    echo.
    echo   [提示] 
    echo     - 当前配置符合推荐方案
    echo     - Web 开发模式和 Tauri 模式使用相同数据库
    echo     - 数据将在两种模式间保持一致
) else (
    echo   [状态] 两个位置都不存在数据库
    echo.
    echo   [说明] 首次使用或数据库已被删除
    echo.
    echo   [提示] 
    echo     - 首次启动开发模式时会自动创建数据库
    echo     - 数据库将创建在 AppData 目录
    echo     - 如需导入数据，可使用系统的导入功能
)

echo.
echo [检查 4] 文件大小对比
echo --------------------
if %PROJECT_EXISTS%==1 if %APPDATA_EXISTS%==1 (
    for %%I in ("%PROJECT_DB%") do set "PROJECT_SIZE=%%~zI"
    for %%I in ("%APPDATA_DB%") do set "APPDATA_SIZE=%%~zI"
    
    echo   项目数据库: !PROJECT_SIZE! 字节
    echo   AppData数据库: !APPDATA_SIZE! 字节
    
    if !PROJECT_SIZE! == !APPDATA_SIZE! (
        echo.
        echo   [提示] 两个数据库大小相同，可能是同一版本
    ) else (
        echo.
        echo   [警告] 两个数据库大小不同，内容可能不一致
    )
)

echo.
echo [工具] 可用的管理工具
echo ========================================
echo   - 迁移数据库：scripts\utils\migrate-database-to-appdata.bat
echo   - 备份数据库：scripts\utils\backup-database.bat
echo   - 重置密码：scripts\utils\修复管理员密码.ps1
echo.

pause
