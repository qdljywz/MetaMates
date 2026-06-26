@echo off
chcp 65001 >nul 2>&1
set "APP_ROOT=%~dp0metamates-app"
set "SCRIPT=%APP_ROOT%\scripts\cleanup-build-artifacts.ps1"

echo Stopping Metamates / Electron...
taskkill /F /IM electron.exe 2>nul
taskkill /F /IM Metamates.exe 2>nul
echo.

if not exist "%SCRIPT%" (
  echo ERROR: cleanup script not found:
  echo   %SCRIPT%
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo [clean-repo] All targets removed.
) else (
  echo [clean-repo] Some paths locked. Close Cursor completely and run this again.
)
echo.
pause
exit /b %RC%
