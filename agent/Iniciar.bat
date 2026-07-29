@echo off
title Jurandir - Impressora
echo Iniciando o agente de impressao Jurandir...
echo (deixe esta janela aberta enquanto o bar estiver funcionando)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agent.ps1"
echo.
echo O agente parou. Feche esta janela ou rode o Iniciar.bat de novo.
pause
