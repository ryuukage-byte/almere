$projectDir = Split-Path -Parent $PSScriptRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Almere and Co -- Menghentikan Sentinel Bot" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

# 1. Pasang stop flag agar background runner tidak loop restart
$stopFlag = Join-Path $projectDir ".stop_flag"
Set-Content -Path $stopFlag -Value "stop"

# 2. Hentikan watchdog powershell jika ada
$wdProcs = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' AND CommandLine LIKE '%background-runner.ps1%'" -ErrorAction SilentlyContinue
if ($wdProcs) {
    $wdProcs | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "[STOP] Watchdog PowerShell PID $($_.ProcessId) dihentikan." -ForegroundColor Yellow
    }
}

# 3. Hentikan proses Node.js backend/server.js
$nodeProcs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe' AND CommandLine LIKE '%backend%server.js%'" -ErrorAction SilentlyContinue
if ($nodeProcs) {
    $nodeProcs | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "[STOP] Node Bot PID $($_.ProcessId) berhasil dihentikan." -ForegroundColor Green
    }
} else {
    Write-Host "[INFO] Tidak ada proses bot aktif yang ditemukan." -ForegroundColor Gray
}

# 4. Hapus file PID dan stop flag
$pidFile = Join-Path $projectDir ".bot.pid"
if (Test-Path $pidFile) { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue }
if (Test-Path $stopFlag) { Remove-Item $stopFlag -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "[SELESAI] Sentinel Bot dan watchdog telah dihentikan sepenuhnya." -ForegroundColor Green
