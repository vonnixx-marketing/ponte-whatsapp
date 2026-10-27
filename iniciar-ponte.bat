@echo off
cd /d "%~dp0"
title Ponte WhatsApp - Central MKT (nao feche esta janela)
start "" http://localhost:3777
node ponte.js
pause
