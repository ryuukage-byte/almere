$projectDir = Split-Path -Parent $PSScriptRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Almere and Co -- Status Sentinel Bot & Server" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

$nodeProcs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe' AND CommandLine LIKE '%backend%server.js%'" -ErrorAction SilentlyContinue

if ($nodeProcs) {
    Write-Host "[STATUS] Bot & Server: AKTIF / BERJALAN" -ForegroundColor Green
    $nodeProcs | ForEach-Object {
        $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
        Write-Host "  - PID        : $($_.ProcessId)"
        if ($p) {
            $memMb = [math]::Round($p.WorkingSet64 / 1MB, 2)
            Write-Host "  - Memory     : $memMb MB"
            Write-Host "  - Start Time : $($p.StartTime)"
        }
    }

    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:4173/api/health" -TimeoutSec 3 -ErrorAction Stop
        $uptimeSec = [math]::Floor($health.uptime)
        $mins = [math]::Floor($uptimeSec / 60)
        $hrs = [math]::Floor($mins / 60)
        Write-Host "  - HTTP API   : Respon OK (Uptime: ${hrs}j $($mins % 60)m $($uptimeSec % 60)d)" -ForegroundColor Green
    } catch {
        Write-Host "  - HTTP API   : Sedang inisialisasi / port dialihkan" -ForegroundColor Yellow
    }

    $wd = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' AND CommandLine LIKE '%background-runner.ps1%'" -ErrorAction SilentlyContinue
    if ($wd) {
        Write-Host "  - Watchdog   : Aktif (Auto-restart jika crash)" -ForegroundColor Green
    } else {
        Write-Host "  - Watchdog   : Manual / Standalone" -ForegroundColor Gray
    }
} else {
    Write-Host "[STATUS] Bot & Server: TIDAK AKTIF / MATI" -ForegroundColor Red
}

$logFile = Join-Path $projectDir "logs\bot.log"
if (Test-Path $logFile) {
    Write-Host ""
    Write-Host "[5 Baris Log Terakhir dari logs\bot.log]:" -ForegroundColor DarkGray
    Write-Host "---------------------------------------------------" -ForegroundColor DarkGray
    Get-Content $logFile -Tail 5 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
    Write-Host "---------------------------------------------------" -ForegroundColor DarkGray
}

Write-Host ""
