@echo off
setlocal
set PYTHON=D:\python-libs\Scripts\python.exe
set DIR=%~dp0

"%PYTHON%" "%DIR%generator_v2.py" --spec "%DIR%netlists\slew_rate_enhancer_v2.json"
if errorlevel 1 goto :err

cd /d "%DIR%"
pdflatex -interaction=nonstopmode preview.tex
if errorlevel 1 goto :err

pdftoppm -png -r 150 preview.pdf v2-preview
if errorlevel 1 goto :err

echo.
echo done: v2-preview-1.png
goto :eof

:err
echo.
echo render failed; check log above.
exit /b 1
