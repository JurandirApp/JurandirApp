@echo off
title Jurandir - Desinstalar impressora
setlocal
set "DEST=%LOCALAPPDATA%\JurandirImpressora"

echo.
echo   Removendo o agente de impressao Jurandir...
echo.

rem 1) Tira do inicio automatico do Windows
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "JurandirImpressora" /f >nul 2>&1

rem 2) Fecha o agente que estiver rodando
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

rem 3) Apaga os arquivos copiados
if exist "%DEST%" rmdir /s /q "%DEST%"

echo   Pronto. O agente foi removido e nao inicia mais sozinho.
echo   (As impressoras continuam instaladas no Windows, sem problema.)
echo.
pause
endlocal
