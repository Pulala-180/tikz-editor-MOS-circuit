@echo off
setlocal
set PYTHON=D:\python-libs\Scripts\python.exe
set DIR=%~dp0
set ORIG=%~1
set NODE=D:\Program Files\nodejs\node.exe
if not exist "%NODE%" set NODE=node

if "%ORIG%"=="" (
  echo usage: run_verify.cmd "D:\path\to\original_circuit.png"
  exit /b 2
)
if not exist "%ORIG%" (
  echo original image not found: %ORIG%
  exit /b 2
)

echo [1/5] generate v2 slidable TikZ...
"%PYTHON%" "%DIR%generator_v2.py" --spec "%DIR%netlists\slew_rate_enhancer_v2.json"
if errorlevel 1 goto :err

echo [2/5] compile preview...
cd /d "%DIR%"
pdflatex -interaction=nonstopmode preview.tex
if errorlevel 1 goto :err

echo [3/5] export PNG...
pdftoppm -png -r 150 preview.pdf v2-preview
if errorlevel 1 goto :err

echo [4/5] copy original image for Gemini...
copy /Y "%ORIG%" "%DIR%original_circuit.png" >nul
if errorlevel 1 goto :err

echo [5/5] Gemini diff original vs generated...
"%NODE%" "%DIR%compare_images.mjs" "%DIR%original_circuit.png" "%DIR%v2-preview-1.png" "%DIR%gemini_diff_v2.md"
if errorlevel 1 goto :err

echo.
echo done:
echo   original : %DIR%original_circuit.png
echo   generated: %DIR%v2-preview-1.png
echo   diff     : %DIR%gemini_diff_v2.md
exit /b 0

:err
echo.
echo workflow failed; see log above.
exit /b 1
