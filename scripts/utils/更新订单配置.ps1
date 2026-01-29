# PP Order System - Update Order Configs Tool
# ========================================

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PP Order Configs Update Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Define paths
$dbPath = "$env:APPDATA\com.pp.ordermanagement\data\erp.sqlite"
$tempDir = "$env:TEMP\sqlite_tools"
$sqliteExe = "$tempDir\sqlite3.exe"
$sqliteZip = "$tempDir\sqlite-tools.zip"
$sqliteUrl = "https://www.sqlite.org/2024/sqlite-tools-win-x64-3450100.zip"
$sqlFile = "$PSScriptRoot\add_order_configs.sql"

# Step 1: Check database
Write-Host "[1/4] Checking database..." -ForegroundColor Yellow
if (-not (Test-Path $dbPath)) {
    Write-Host "ERROR: Database file not found" -ForegroundColor Red
    Write-Host "Path: $dbPath" -ForegroundColor Red
    pause
    exit 1
}
if (-not (Test-Path $sqlFile)) {
    Write-Host "ERROR: SQL file not found" -ForegroundColor Red
    Write-Host "Path: $sqlFile" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "OK: Database and SQL file found" -ForegroundColor Green
Write-Host ""

# Step 2: Backup database
Write-Host "[2/4] Creating backup..." -ForegroundColor Yellow
$backupPath = "$dbPath.backup-configs-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
try {
    Copy-Item $dbPath $backupPath -Force
    Write-Host "OK: Backup created" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Backup failed - $_" -ForegroundColor Red
    pause
    exit 1
}
Write-Host ""

# Step 3: Prepare SQLite tools
Write-Host "[3/4] Preparing SQLite tools..." -ForegroundColor Yellow
if (-not (Test-Path $sqliteExe)) {
    Write-Host "Downloading SQLite tools..." -ForegroundColor Gray
    try {
        if (-not (Test-Path $tempDir)) {
            New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        }
        
        Invoke-WebRequest -Uri $sqliteUrl -OutFile $sqliteZip -UseBasicParsing
        Expand-Archive -Path $sqliteZip -DestinationPath $tempDir -Force
        
        Write-Host "OK: SQLite tools ready" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Download failed - $_" -ForegroundColor Red
        pause
        exit 1
    }
} else {
    Write-Host "OK: SQLite tools already exist" -ForegroundColor Green
}
Write-Host ""

# Step 4: Apply Configs
Write-Host "[4/4] Applying new configurations..." -ForegroundColor Yellow

try {
    # .read doesn't work well with paths with spaces in pure command line sometimes, 
    # but we will try passing the file content or using .read with quotes.
    # Actually, simpler to just pipe content if possible, but PowerShell piping encoding issues.
    # We will use the .read command of sqlite3
    
    # Ensure sql file is UTF8 no BOM preferably, or handled by sqlite.
    # Let's just execute sqlite3 with standard input redirection? No, PowerShell pipe is tricky.
    # We will use the same technique: create a temp script that .reads the absolute path?
    # Or just copy the sql file to temp dir to avoid path issues?
    
    $tempSql = "$tempDir\run_update.sql"
    Copy-Item $sqlFile $tempSql -Force
    
    $result = & $sqliteExe $dbPath ".read $tempSql"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: Configurations applied successfully" -ForegroundColor Green
    } else {
        throw "SQL execution failed"
    }
} catch {
    Write-Host "ERROR: Update failed - $_" -ForegroundColor Red
    Write-Host "Restoring backup..." -ForegroundColor Yellow
    Copy-Item $backupPath $dbPath -Force
    Write-Host "OK: Backup restored" -ForegroundColor Green
    pause
    exit 1
}
Write-Host ""

# Complete
Write-Host "========================================" -ForegroundColor Green
Write-Host "Update Successful!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Please restart the application." -ForegroundColor Yellow
Write-Host ""
pause
