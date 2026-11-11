@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Первая установка, подождите...
  call npm install
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
