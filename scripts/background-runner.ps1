$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location $projectDir

$logDir = Join-Path $projectDir "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$stdoutLog = Join-Path $logDir "bot.log"
$stderrLog = Join-Path $logDir "bot-error.log"

while ($true) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $stdoutLog -Value "[$timestamp] [WATCHDOG] Memulai node backend/server.js..."
    
    try {
        $p = Start-Process -FilePath "node.exe" `
            -ArgumentList "backend/server.js" `
            -WorkingDirectory $projectDir `
            -WindowStyle Hidden `
            -PassThru `
            -Wait `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog
    } catch {
        Add-Content -Path $stderrLog -Value "[$timestamp] [ERROR] Gagal menjalankan node: $_"
    }
    
    # Jika .stop_flag ada, hentikan loop watchdog
    $stopFlag = Join-Path $projectDir ".stop_flag"
    if (Test-Path $stopFlag) {
        Remove-Item $stopFlag -Force -ErrorAction SilentlyContinue
        break
    }
    
    Start-Sleep -Seconds 3
}
