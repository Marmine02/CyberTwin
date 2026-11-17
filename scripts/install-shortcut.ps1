<#
.SYNOPSIS
  Creates a Desktop shortcut "CyberTwin" (custom icon) that starts scripts\CyberTwin.ps1 without a console window.

.PARAMETER Remove
  Delete the shortcut instead.
#>
[CmdletBinding()]
param([switch]$Remove)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Launcher = Join-Path $PSScriptRoot "CyberTwin.ps1"
$Icon = Join-Path $PSScriptRoot "assets\cybertwin.ico"
$Desktop = [Environment]::GetFolderPath("Desktop")   # follows OneDrive desktop redirection
$Link = Join-Path $Desktop "CyberTwin.lnk"

if ($Remove) {
  Remove-Item $Link -Force -ErrorAction SilentlyContinue
  Write-Host "Removed $Link"
  exit 0
}
if (-not (Test-Path $Launcher)) { throw "Launcher not found: $Launcher" }
if (-not (Test-Path $Icon)) { throw "Icon not found: $Icon (generate it: cd e2e; node scripts/make-icon.ts)" }

$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($Link)
$sc.TargetPath = $powershell
$sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
$sc.WorkingDirectory = $Root
$sc.IconLocation = "$Icon,0"
$sc.Description = "CyberTwin: cybersecurity digital twin (simulation only)"
$sc.WindowStyle = 7  # minimized: no console flash before -WindowStyle Hidden applies
$sc.Save()
Write-Host "Created $Link"
