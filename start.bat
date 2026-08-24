@echo off
cd /d "%~dp0"
title TikZ Editor MOS Circuit - Quick Start

echo =======================================================
echo    TikZ Editor - MOS Circuit Edition
echo =======================================================
echo.

REM 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found!
    echo Please install Node.js LTS from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 2. Register Win+R shortcut commands (tikz / tikz-circuit / tikz circuit)
set "TARGET_BAT=%~dp0start.bat"
if not exist "%TARGET_BAT%" set "TARGET_BAT=%~dp0start.bat"

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\tikz.exe" /ve /d "%TARGET_BAT%" /f >nul 2>nul
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\tikz-circuit.exe" /ve /d "%TARGET_BAT%" /f >nul 2>nul

if defined LOCALAPPDATA (
    if exist "%LOCALAPPDATA%\Microsoft\WindowsApps" (
        (
            echo @echo off
            echo start "" /d "%~dp0" "%TARGET_BAT%"
        ) > "%LOCALAPPDATA%\Microsoft\WindowsApps\tikz.bat" 2>nul
        (
            echo @echo off
            echo start "" /d "%~dp0" "%TARGET_BAT%"
        ) > "%LOCALAPPDATA%\Microsoft\WindowsApps\tikz-circuit.bat" 2>nul
    )
)
echo [SHORTCUT] Win+R shortcut registered: type 'tikz' or 'tikz circuit' to launch anytime.
echo.

REM 3. Check dependencies
if not exist "node_modules\" (
    echo [INFO] First time setup: installing dependencies...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] npm install failed. Please check network.
        pause
        exit /b 1
    )
    echo.
    echo [SUCCESS] Dependencies installed successfully!
    echo.
)

REM 4. Start dev server
echo [STARTING] Launching TikZ MOS Editor at http://localhost:8888/
echo [INFO] Your browser will open automatically. Keep this window open.
echo =======================================================
echo.

call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo [INFO] Server stopped.
    pause
)