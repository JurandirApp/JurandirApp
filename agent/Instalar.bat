@echo off
title Jurandir - Instalar impressora
setlocal
set "DEST=%LOCALAPPDATA%\JurandirImpressora"

echo.
echo   Instalando o agente de impressao Jurandir...
echo.

if not exist "%~dp0config.json" (
  echo   ERRO: nao achei o config.json nesta pasta.
  echo   Baixe o agente de novo no painel e EXTRAIA o zip antes de rodar.
  echo.
  pause
  exit /b 1
)

rem 1) Copia pra uma pasta fixa (nao depende mais do Downloads)
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%~dp0agent.ps1" "%DEST%\agent.ps1" >nul
copy /y "%~dp0config.json" "%DEST%\config.json" >nul

rem 2) Fecha qualquer agente que ja esteja rodando (evita imprimir em duplicado)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

rem 3) Registra pra iniciar junto com o Windows (sem precisar de administrador)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "JurandirImpressora" /t REG_SZ /d "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%DEST%\agent.ps1\"" /f >nul

rem 4) Inicia agora, em segundo plano (sem janela)
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%DEST%\agent.ps1"

echo   ============================================
echo    Pronto! A impressora ja esta funcionando.
echo.
echo     - Inicia sozinha quando o PC liga
echo     - Roda em segundo plano (sem janela)
echo     - Nao precisa abrir nada toda vez
echo   ============================================
echo.
echo   Agora va no painel e clique em "Imprimir teste".
echo   Se sair papel, esta tudo certo. Pode fechar esta janela.
echo.
pause
endlocal
