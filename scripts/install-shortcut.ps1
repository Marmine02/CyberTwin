<#
  Creates the Desktop shortcut "CyberTwin" with the app icon (assets\cybertwin.ico).
  The shortcut runs scripts\CyberTwin.ps1 with a hidden console, so double-clicking it only shows
  the app window. Run:  powershell -ExecutionPolicy Bypass -File scripts\install-shortcut.ps1
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Icon = Join-Path $Root 'assets\cybertwin.ico'
$Launcher = Join-Path $Root 'scripts\CyberTwin.ps1'
if (-not (Test-Path $Icon)) { throw "Icon not found: $Icon" }
if (-not (Test-Path $Launcher)) { throw "Launcher not found: $Launcher" }

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'CyberTwin.lnk'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $powershell
$lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
$lnk.WorkingDirectory = $Root
$lnk.IconLocation = "$Icon,0"
$lnk.Description = 'CyberTwin - digital twin security lab (simulation only)'
$lnk.WindowStyle = 7   # minimized: the console is hidden by -WindowStyle Hidden anyway
$lnk.Save()
Write-Host "Shortcut created: $lnkPath"
