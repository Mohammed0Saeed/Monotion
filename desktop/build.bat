@echo off
rem Builds dist\Monotion\Monotion.exe and, if Inno Setup is installed, dist\Monotion-Setup.exe. Run from anywhere.
rem Needs Python 3.11+ and Node 20+ on PATH.
setlocal
cd /d "%~dp0.."
if not exist desktop\.venv python -m venv desktop\.venv || exit /b 1
call desktop\.venv\Scripts\activate.bat
python -m pip install -r desktop\requirements.txt || exit /b 1
pushd frontend
call npm install || exit /b 1
call npm run build || exit /b 1
popd
pyinstaller desktop\monotion.spec --noconfirm --distpath dist --workpath build || exit /b 1
where iscc >nul 2>nul && iscc desktop\installer.iss
echo.
echo Done: dist\Monotion\Monotion.exe
