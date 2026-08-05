@echo off
REM Close Cursor completely first, then double-click this file.
cd /d "%~dp0.."
echo.
echo Close Cursor first if you have not already.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cleanup-stale-green-builds.ps1"
exit /b %ERRORLEVEL%
