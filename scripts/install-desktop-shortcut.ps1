$ErrorActionPreference = 'Stop'

$AppRoot = Split-Path -Parent $PSScriptRoot
$Desktop = [Environment]::GetFolderPath('Desktop')
$Wsh = New-Object -ComObject WScript.Shell

$bat = Join-Path $AppRoot 'Start-KnowledgeHub.bat'
$lnkPath = Join-Path $Desktop 'KnowledgeHub.lnk'
$sc = $Wsh.CreateShortcut($lnkPath)
$sc.TargetPath = $bat
$sc.WorkingDirectory = $AppRoot
$sc.WindowStyle = 1
$sc.Description = 'Start KnowledgeHub markdown viewer'
$sc.IconLocation = '%SystemRoot%\System32\shell32.dll,71'
$sc.Save()

# Remove old choose-folder shortcut if present
$old = Join-Path $Desktop 'KnowledgeHub (Choose Folder).lnk'
if (Test-Path $old) { Remove-Item $old -Force }

Write-Host "Created: $lnkPath"
