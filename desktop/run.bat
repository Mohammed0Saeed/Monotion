@echo off
rem Starts Monotion from the source folder, no installer needed. The first run sets everything up (a few minutes).
rem Needs Python 3.11+ and Node 20+ on PATH.
setlocal
cd /d "%~dp0.."
if not exist desktop\.venv (
  python -m venv desktop\.venv || exit /b 1
  call desktop\.venv\Scripts\activate.bat
  python -m pip install -r desktop\requirements.txt || exit /b 1
) else call desktop\.venv\Scripts\activate.bat
if not exist frontend\dist (
  pushd frontend
  call npm install || exit /b 1
  call npm run build || exit /b 1
  popd
)
start "" pythonw desktop\app.py
