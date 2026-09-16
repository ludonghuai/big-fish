@echo off
title Bigfish Pet Debug
cd /d "%~dp0"

echo ============================================================
echo  [1] Displays
echo ============================================================
powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { '  ' + $_.DeviceName + '   Bounds=' + $_.Bounds.ToString() + '   Primary=' + $_.Primary }"
echo.

echo ============================================================
echo  [2] Clearing old diagnostic logs
echo ============================================================
if exist "%APPDATA%\bigfish\pet-drag.log" del /q "%APPDATA%\bigfish\pet-drag.log"
if exist "%APPDATA%\bigfish\pet-geometry.log" del /q "%APPDATA%\bigfish\pet-geometry.log"
echo   done
echo.

echo ============================================================
echo  [3] Starting Bigfish  (pet debug log ON)
echo ============================================================
echo   Logs will be written to:  %APPDATA%\bigfish\
echo   Close this window to quit the app.
echo ============================================================
echo.

set BIGFISH_PET_DEBUG=1
call npm start

echo.
echo ============================================================
echo  Exited. Logs written.
echo ============================================================
pause
