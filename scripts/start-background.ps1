$projectDir = Split-Path -Parent $PSScriptRoot

# Periksa apakah bot sudah berjalan
$existing = Get-CimInstance Win32_Process -Filter "Name = 'node.exe' AND CommandLine LIKE '%backend%server.js%'" -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[INFO] Bot sudah berjalan dengan PID $($existing.ProcessId)." -ForegroundColor Yellow
    exit 0
}

# Hapus stop flag lama jika ada
$stopFlag = Join-Path $projectDir ".stop_flag"
if (Test-Path $stopFlag) { Remove-Item $stopFlag -Force -ErrorAction SilentlyContinue }

$runnerScript = Join-Path $projectDir "scripts\background-runner.ps1"
$cmdLine = "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$runnerScript`""

# Luncurkan via WMI Win32_Process agar terlepas sepenuhnya (detached) dari terminal saat ini
$res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmdLine }

if ($res.ReturnValue -eq 0) {
    Write-Host "[OK] Almere Sentinel Bot berhasil diluncurkan di background." -ForegroundColor Green
    Write-Host "     Watchdog PID: $($res.ProcessId)"
    Write-Host ""
    Write-Host "Cek status kapan saja dengan: status-bot.bat"
} else {
    Write-Host "[ERROR] Gagal meluncurkan proses. Return code: $($res.ReturnValue)" -ForegroundColor Red
}
