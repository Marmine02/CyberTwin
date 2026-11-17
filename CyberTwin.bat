@echo off
rem CyberTwin desktop launcher: builds the frontend if needed, starts the backend, opens the app window
rem and stops the backend when the window is closed. See scripts\CyberTwin.ps1.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\CyberTwin.ps1" %*
