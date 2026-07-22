param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$AppRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $AppRoot 'package.json'))) {
  throw 'Cannot find KnowledgeHub package.json'
}

$Port = 5173
$Url = "http://localhost:$Port/"

Set-Location $AppRoot

if (-not (Test-Path (Join-Path $AppRoot 'node_modules'))) {
  Write-Host 'Installing dependencies...'
  npm install
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
}

try {
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($l in $listeners) {
    if ($l.OwningProcess) {
      Write-Host "Port $Port is busy. Stopping PID $($l.OwningProcess)..."
      Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500
    }
  }
} catch {}

if (-not $NoBrowser) {
  Start-Job -ScriptBlock {
    param($TargetUrl)
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Milliseconds 500
      try {
        $res = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 1
        if ($res.StatusCode -ge 200) {
          Start-Process $TargetUrl
          return
        }
      } catch {}
    }
  } -ArgumentList $Url | Out-Null
}

Write-Host 'KnowledgeHub'
Write-Host "Opening $Url"
Write-Host 'Press Ctrl+C to stop.'
Write-Host ''

npm run dev
