@echo off
title Almere Sentinel Bot & Server
cd /d "%~dp0"
echo ===================================================
echo   Almere & Co -- Sentinel Bot Watchdog Runner
echo ===================================================
echo [INFO] Memulai server dan Telegram bot...

:restart_loop
node backend/server.js
echo.
echo [WARNING] Proses server/bot berhenti pada %date% %time%.
echo [WATCHDOG] Me-restart otomatis dalam 3 detik...
timeout /t 3 /nobreak >nul
goto restart_loop
