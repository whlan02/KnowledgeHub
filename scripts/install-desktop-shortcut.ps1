$ErrorActionPreference = 'Stop'

$AppRoot = Split-Path -Parent $PSScriptRoot
$IconPath = Join-Path $AppRoot 'assets\knowledgehub.ico'

# Prefer Desktop\myapp if it exists (user app-shortcut folder); otherwise Desktop.
$Desktop = [Environment]::GetFolderPath('Desktop')
$MyApps = Join-Path $Desktop 'myapp'
$ShortcutDir = if (Test-Path $MyApps) { $MyApps } else { $Desktop }

$Wsh = New-Object -ComObject WScript.Shell

$bat = Join-Path $AppRoot 'Start-KnowledgeHub.bat'
$lnkPath = Join-Path $ShortcutDir 'KnowledgeHub.lnk'
$sc = $Wsh.CreateShortcut($lnkPath)
$sc.TargetPath = $bat
$sc.WorkingDirectory = $AppRoot
$sc.WindowStyle = 1
$sc.Description = 'Start KnowledgeHub markdown viewer'
if (Test-Path $IconPath) {
  $sc.IconLocation = "$IconPath,0"
} else {
  $sc.IconLocation = '%SystemRoot%\System32\shell32.dll,71'
}
$sc.Save()

# Also refresh a Desktop-root copy if present
$desktopLnk = Join-Path $Desktop 'KnowledgeHub.lnk'
if ((Test-Path $desktopLnk) -and ($desktopLnk -ne $lnkPath)) {
  $sc2 = $Wsh.CreateShortcut($desktopLnk)
  $sc2.TargetPath = $bat
  $sc2.WorkingDirectory = $AppRoot
  $sc2.WindowStyle = 1
  $sc2.Description = 'Start KnowledgeHub markdown viewer'
  if (Test-Path $IconPath) {
    $sc2.IconLocation = "$IconPath,0"
  }
  $sc2.Save()
}

# Remove old choose-folder shortcut if present
$old = Join-Path $Desktop 'KnowledgeHub (Choose Folder).lnk'
if (Test-Path $old) { Remove-Item $old -Force }

Write-Host "Created: $lnkPath"
if (Test-Path $IconPath) {
  Write-Host "Icon:    $IconPath"
}
