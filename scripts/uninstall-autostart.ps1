$dest = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\AlmereSentinelBot.lnk"
if (Test-Path $dest) {
    Remove-Item $dest -Force
    Write-Host "✅ Auto-start berhasil dicopot dari Windows Startup." -ForegroundColor Green
} else {
    Write-Host "[INFO] Shortcut auto-start tidak ditemukan di Windows Startup." -ForegroundColor Yellow
}
