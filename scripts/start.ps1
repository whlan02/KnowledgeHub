$ErrorActionPreference = 'Stop'

$AppRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $AppRoot 'package.json'))) {
  throw 'Cannot find KnowledgeHub package.json'
}

Set-Location $AppRoot

if (-not (Test-Path (Join-Path $AppRoot 'node_modules'))) {
  Write-Host 'Installing dependencies...'
  npm install
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
}

Write-Host 'KnowledgeHub (Tauri dev)'
Write-Host 'The first run compiles the Rust backend and can take a few minutes.'
Write-Host 'Press Ctrl+C to stop.'
Write-Host ''

npm run tauri -- dev
