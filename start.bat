@echo off
setlocal
chcp 65001 >nul

echo ==========================================
echo       Start Bilibili Study Room Live
echo ==========================================

REM Switch to the directory where this script is located
cd /d "%~dp0"

if not exist "node_modules" (
    echo [Check] node_modules not found. Installing dependencies...
    call npm install
)

echo [Start] Launching server...
echo.

:: Open Admin Dashboard
start http://localhost:3000/admin.html

:: Run in development mode (ts-node)
call npm run dev

pause
