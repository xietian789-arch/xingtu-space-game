@echo off
rem ============================================================
rem  XingTu Launcher - starts a local HTTP server and opens browser
rem  (ES Modules require http:// ; file:// is blocked by browsers)
rem ============================================================
title XingTu Local Server
rem NOTE: "%~dp0." (with trailing dot) avoids the "\" + quote escape pitfall:
rem   %~dp0 ends with a backslash, and "...星途\" would be parsed by
rem   PowerShell as an escaped quote, corrupting the path. The dot prevents
rem   this and GetFullPath normalizes the trailing \. away automatically.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Root "%~dp0."
pause
