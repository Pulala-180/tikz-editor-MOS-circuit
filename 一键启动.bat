@echo off
cd /d "%~dp0"
title TikZ Editor MOS Circuit - Quick Start

echo =======================================================
echo    TikZ Editor - MOS Circuit Edition
echo =======================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found!
    echo Please install Node.js LTS from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

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