# ============================================================================
#  Agente de Impressao Jurandir  —  roda direto no Windows, SEM instalar nada.
#  (O PowerShell ja vem no Windows. Nao precisa de Node, nem de internet extra.)
#
#  NAO rode este arquivo direto. De 2 cliques no "Iniciar.bat".
# ============================================================================

$ErrorActionPreference = "Stop"
# Vercel/HTTPS exige TLS 1.2 — PowerShell antigo nao usa por padrao.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# --- Impressao RAW no Windows (envia bytes crus pra impressora pelo nome) ------
$rawCode = @"
using System;
using System.Runtime.InteropServices;

public static class JurandirRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
  static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

  public static void Send(string printerName, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printerName, out h, IntPtr.Zero))
      throw new Exception("Impressora nao encontrada: '" + printerName + "' (confira o nome exato em Dispositivos e Impressoras)");
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "Jurandir Comanda";
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter: " + Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter: " + Marshal.GetLastWin32Error());
        int written;
        if (!WritePrinter(h, bytes, bytes.Length, out written))
          throw new Exception("WritePrinter: " + Marshal.GetLastWin32Error());
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
Add-Type -TypeDefinition $rawCode -Language CSharp

# --- Config -------------------------------------------------------------------
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfgPath = Join-Path $here "config.json"
if (-not (Test-Path $cfgPath)) {
  Write-Host "ERRO: nao achei o config.json nesta pasta." -ForegroundColor Red
  Write-Host "Copie o config.example.json para config.json e cole o token do painel."
  Read-Host "Pressione Enter para sair"; exit 1
}
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$baseUrl = ([string]$cfg.url).TrimEnd('/')
$token = [string]$cfg.token
$pollMs = if ($cfg.pollMs) { [int]$cfg.pollMs } else { 4000 }
if (-not $token -or $token -like "*COLE*") {
  Write-Host "ERRO: configure o 'token' no config.json (gere no painel)." -ForegroundColor Red
  Read-Host "Pressione Enter para sair"; exit 1
}
$headers = @{ "x-print-token" = $token }

function Send-Job($job) {
  $bytes = [Convert]::FromBase64String($job.payloadB64)
  if (-not $job.target) { throw "comanda sem impressora (cadastre uma no painel)" }
  if ($job.connection -eq "NETWORK") {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect([string]$job.target, [int]$job.port)
    $stream = $client.GetStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush(); $stream.Close(); $client.Close()
  } else {
    [JurandirRawPrinter]::Send([string]$job.target, $bytes)
  }
}

function Confirm-Job($id, $ok, $err) {
  try {
    $body = @{ jobId = $id; ok = $ok; error = $err } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri "$baseUrl/api/print/ack" -Method Post -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 15 | Out-Null
  } catch {
    Write-Host "  (nao consegui confirmar a comanda $id)" -ForegroundColor DarkYellow
  }
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Agente de Impressao Jurandir iniciado" -ForegroundColor Cyan
Write-Host "  Nuvem: $baseUrl" -ForegroundColor Cyan
Write-Host "  Deixe esta janela ABERTA. Buscando comandas..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

while ($true) {
  try {
    $res = Invoke-RestMethod -Uri "$baseUrl/api/print/jobs" -Headers $headers -TimeoutSec 15
    foreach ($job in $res.jobs) {
      try {
        Send-Job $job
        Write-Host ("{0}  OK    -> {1}" -f (Get-Date -Format "HH:mm:ss"), $job.target) -ForegroundColor Green
        Confirm-Job $job.id $true $null
      } catch {
        $m = $_.Exception.Message
        Write-Host ("{0}  ERRO  -> {1}: {2}" -f (Get-Date -Format "HH:mm:ss"), $job.target, $m) -ForegroundColor Red
        Confirm-Job $job.id $false $m
      }
    }
  } catch {
    $status = $null
    try { $status = $_.Exception.Response.StatusCode.value__ } catch {}
    if ($status -eq 401) {
      Write-Host "Token invalido (401). Confira o token no painel e no config.json." -ForegroundColor Red
    } else {
      Write-Host ("{0}  sem conexao com a nuvem: {1}" -f (Get-Date -Format "HH:mm:ss"), $_.Exception.Message) -ForegroundColor DarkYellow
    }
  }
  Start-Sleep -Milliseconds $pollMs
}
