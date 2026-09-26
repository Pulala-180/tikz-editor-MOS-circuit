@echo off
set "PYTHON=python"
where python >nul 2>nul || if exist "D:\python-libs\Scripts\python.exe" set "PYTHON=D:\python-libs\Scripts\python.exe"
"%PYTHON%" "%~dp0generator_v2.py" --spec "%~dp0netlists\slew_rate_enhancer_v2.json"
pause
