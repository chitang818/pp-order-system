# PP Order System - Admin Password Reset Tool
# ========================================

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PP Admin Password Reset Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Define paths
$dbPath = "$env:APPDATA\com.pp.ordermanagement\data\erp.sqlite"
$tempDir = "$env:TEMP\sqlite_tools"
$sqliteExe = "$tempDir\sqlite3.exe"
$sqliteZip = "$tempDir\sqlite-tools.zip"
$sqliteUrl = "https://www.sqlite.org/2024/sqlite-tools-win-x64-3450100.zip"
$tempSqlFile = "$tempDir\reset_password.sql"

# Step 1: Check database
Write-Host "[1/5] Checking database..." -ForegroundColor Yellow
if (-not (Test-Path $dbPath)) {
    Write-Host "ERROR: Database file not found" -ForegroundColor Red
    Write-Host "Path: $dbPath" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "OK: Database found" -ForegroundColor Green
Write-Host ""

# Step 2: Backup database
Write-Host "[2/5] Creating backup..." -ForegroundColor Yellow
$backupPath = "$dbPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
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
Write-Host "[3/5] Preparing SQLite tools..." -ForegroundColor Yellow
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

# Step 4: Reset password
Write-Host "[4/5] Resetting password..." -ForegroundColor Yellow
$newPasswordHash = "4cb07fb4f629954aa6cdf6ee8963bbed:2414df5357154c261be4e26fa91934fbd49253d70c4af121138f1303f533fd801d031568fff38823d1e728a309b7566bfd2eba5707cae883e93a404c196e0d8e"

# Create SQL file
$sqlContent = @"
UPDATE users SET password = '$newPasswordHash' WHERE username = 'admin';
SELECT 'OK' as status, username, role FROM users WHERE username = 'admin';
"@
Set-Content -Path $tempSqlFile -Value $sqlContent -Encoding UTF8

try {
    $result = & $sqliteExe $dbPath ".read $tempSqlFile"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: Password reset successful" -ForegroundColor Green
    } else {
        throw "SQL execution failed"
    }
} catch {
    Write-Host "ERROR: Password reset failed - $_" -ForegroundColor Red
    Write-Host "Restoring backup..." -ForegroundColor Yellow
    Copy-Item $backupPath $dbPath -Force
    Write-Host "OK: Backup restored" -ForegroundColor Green
    pause
    exit 1
} finally {
    if (Test-Path $tempSqlFile) {
        Remove-Item $tempSqlFile -Force
    }
}
Write-Host ""

# Step 5: Complete
Write-Host "[5/5] Complete" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Password Reset Successful!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "New credentials:" -ForegroundColor Cyan
Write-Host "  Username: admin" -ForegroundColor White
Write-Host "  Password: admin123" -ForegroundColor White
Write-Host ""
Write-Host "Backup location:" -ForegroundColor Cyan
Write-Host "  $backupPath" -ForegroundColor Gray
Write-Host ""
Write-Host "Please restart the application and login with the new password." -ForegroundColor Yellow
Write-Host ""
pause
