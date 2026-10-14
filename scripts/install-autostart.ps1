$ws = New-Object -ComObject WScript.Shell
$projectDir = Split-Path -Parent $PSScriptRoot
$dest = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\AlmereSentinelBot.lnk"
$scriptPath = Join-Path $projectDir "scripts\background-runner.ps1"

$sc = $ws.CreateShortcut($dest)
$sc.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$sc.Arguments = "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$sc.WorkingDirectory = $projectDir
$sc.Description = "Almere Sentinel Bot Background Runner"
$sc.Save()

Write-Host "[OK] Auto-start berhasil dipasang di:" -ForegroundColor Green
Write-Host "     $dest"
Write-Host ""
Write-Host "Bot akan otomatis berjalan di latar belakang setiap kali laptop menyala & login."
