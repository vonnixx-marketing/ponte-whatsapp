@echo off
cd /d "%~dp0"
echo Instalando dependencias da ponte...
call npm install --no-audit --no-fund
echo.
echo Pronto. Agora rode iniciar-ponte.bat
pause
