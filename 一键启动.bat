@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TikZ Editor MOS Circuit - Quick Start

echo =======================================================
echo    TikZ Editor - MOS Circuit Edition
echo =======================================================
echo.

REM 1. Check Node.js and version (>=18 required)
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found!
    echo Please install Node.js LTS - v20 or v22 recommended - from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -v 2^>nul') do set NODE_RAW=%%v
set NODE_VER=%NODE_RAW:~1%
if %NODE_VER% lss 18 (
    echo [WARNING] Detected Node.js %NODE_RAW%. TikZ Editor requires Node.js 18 or higher!
    echo Please upgrade Node.js to v20 or v22 LTS.
    pause
    exit /b 1
)

REM 2. Register Win+R shortcut commands (tikz / tikz-circuit / tikz circuit)
set "CURRENT_DIR=%~dp0"
if "%CURRENT_DIR:~-1%"=="\" set "CURRENT_DIR=%CURRENT_DIR:~0,-1%"
set "TARGET_BAT=%CURRENT_DIR%\start.bat"
if not exist "%TARGET_BAT%" set "TARGET_BAT=%CURRENT_DIR%\start.bat"

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\tikz.exe" /ve /d "%TARGET_BAT%" /f >nul 2>nul
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\tikz-circuit.exe" /ve /d "%TARGET_BAT%" /f >nul 2>nul
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\tikz-editor.exe" /ve /d "%TARGET_BAT%" /f >nul 2>nul

if defined LOCALAPPDATA (
    if exist "%LOCALAPPDATA%\Microsoft\WindowsApps" (
        (
            echo @echo off
            echo start "" /d "%CURRENT_DIR%" "%TARGET_BAT%"
        ) > "%LOCALAPPDATA%\Microsoft\WindowsApps\tikz.bat" 2>nul
        (
            echo @echo off
            echo start "" /d "%CURRENT_DIR%" "%TARGET_BAT%"
        ) > "%LOCALAPPDATA%\Microsoft\WindowsApps\tikz-circuit.bat" 2>nul
        (
            echo @echo off
            echo start "" /d "%CURRENT_DIR%" "%TARGET_BAT%"
        ) > "%LOCALAPPDATA%\Microsoft\WindowsApps\tikz-editor.bat" 2>nul
        (
            echo @echo off
            echo start "" /d "%CURRENT_DIR%" "%TARGET_BAT%"
        ) > "%LOCALAPPDATA%\Microsoft\WindowsApps\tikz editor.bat" 2>nul
    )
)

if exist "%USERPROFILE%\bin" (
    (
        echo @echo off
        echo start "" /d "%CURRENT_DIR%" "%TARGET_BAT%"
    ) > "%USERPROFILE%\bin\tikz.bat" 2>nul
    (
        echo @echo off
        echo start "" /d "%CURRENT_DIR%" "%TARGET_BAT%"
    ) > "%USERPROFILE%\bin\tikz-circuit.bat" 2>nul
    (
        echo @echo off
        echo start "" /d "%CURRENT_DIR%" "%TARGET_BAT%"
    ) > "%USERPROFILE%\bin\tikz-editor.bat" 2>nul
    (
        echo @echo off
        echo start "" /d "%CURRENT_DIR%" "%TARGET_BAT%"
    ) > "%USERPROFILE%\bin\tikz editor.bat" 2>nul
)
echo [SHORTCUT] Win+R shortcut registered: type 'tikz', 'tikz-editor', or 'tikz editor' to launch anytime.
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

REM 4. Start Antigravity Bridge Server (Optional Python Service)
where python >nul 2>nul
if %errorlevel% equ 0 (
    python -c "import websockets" >nul 2>nul
    if %errorlevel% neq 0 (
        echo [INFO] Installing required Python websockets library for AI Bridge...
        python -m pip install websockets -q >nul 2>nul
    )
    REM Kill any lingering stale process on port 3100
    for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3100" ^| findstr "LISTENING"') do (
        taskkill /f /pid %%a >nul 2>nul
    )
    echo [STARTING] Starting Antigravity AI Bridge on ws://localhost:3100...
    start "" /b python "%~dp0scripts\mcp-bridge-server\server.py"
) else (
    echo [WARN] Python is not found. Antigravity AI Bridge will be skipped - editor remains fully functional.
)

REM 5. Start dev server
echo [STARTING] Launching TikZ MOS Editor (default: http://localhost:8888/)...
echo [INFO] Your browser will open automatically. Keep this window open.
echo =======================================================
echo.

REM Kill any lingering stale process on port 8888
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8888" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>nul
)

call npm run dev

echo.
echo [INFO] Server stopped.
pause