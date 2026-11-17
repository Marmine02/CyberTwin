@echo off
rem Updated: 2026-11-17
rem Double-click to start CyberTwin as a desktop app (see scripts\CyberTwin.ps1).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\CyberTwin.ps1" %*
