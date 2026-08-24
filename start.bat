@echo off
cd /d "%~dp0"
title TikZ Editor MOS Circuit - 一键启动

echo =======================================================
echo    欢迎使用 TikZ Editor [MOS 电路与高性能定制版]
echo =======================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js 环境！
    echo 请前往官网下载安装 Node.js LTS: https://nodejs.org/
    echo 安装完成后请重新双击运行此脚本。
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [提示] 首次运行，正在自动安装项目依赖包 [npm install]...
    echo 请保持网络通畅，稍候片刻...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [错误] 依赖安装失败，请检查网络连接后重试！
        pause
        exit /b 1
    )
    echo.
    echo [成功] 依赖包安装完成！
    echo.
)

echo [正在启动] 正在启动 TikZ MOS 电路编辑器...
echo [本地地址] http://localhost:8888/
echo.
echo 提示：服务启动后将自动弹出浏览器窗口，请勿关闭本黑框！
echo =======================================================
echo.

call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo [提示] 服务已停止。
    pause
)
