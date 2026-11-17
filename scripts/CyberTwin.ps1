<#
.SYNOPSIS
  Starts CyberTwin as a desktop-style app: one backend process (API + built UI) and an Edge/Chrome app window.

.DESCRIPTION
  1. Builds frontend/dist if it is missing (needs Node/npm) and creates backend/.venv if missing (needs uv).
  2. Starts uvicorn on a free 127.0.0.1 port with FRONTEND_DIST set, so the backend serves the UI itself.
  3. Waits for /api/v1/health, then opens Edge (fallback: Chrome) with --app=<url> and its own profile under
     %LOCALAPPDATA%\CyberTwin\browser-profile.
  4. When that window closes, stops the backend.
  Data (SQLite), logs and the browser profile live in %LOCALAPPDATA%\CyberTwin. AI settings come from backend\.env.

.PARAMETER Port
  Fixed port instead of a free one picked by the OS. Fails with a clear message when the port is taken.
.PARAMETER Rebuild
  Rebuild the frontend even if frontend\dist exists.
.PARAMETER NoBrowser
  Start the backend only and print the URL (Enter stops it).
.PARAMETER DebugPort
  Adds --remote-debugging-port to the app window so an automated check can drive it (Playwright connectOverCDP).
#>
[CmdletBinding()]
param(
  [int]$Port = 0,
  [switch]$Rebuild,
  [switch]$NoBrowser,
  [int]$DebugPort = 0
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Dist = Join-Path $Frontend "dist"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Home_ = Join-Path $env:LOCALAPPDATA "CyberTwin"
$Logs = Join-Path $Home_ "logs"
$Profile_ = Join-Path $Home_ "browser-profile"
$StateFile = Join-Path $Home_ "backend.json"
$BackendLog = Join-Path $Logs "backend.log"
$BackendErr = Join-Path $Logs "backend.err.log"
New-Item -ItemType Directory -Force -Path $Logs, $Profile_ | Out-Null

function Show-Error([string]$Message) {
  Write-Host "CyberTwin: $Message" -ForegroundColor Red
  if ($env:CYBERTWIN_NO_DIALOG -eq "1") { return }  # automated checks: console message only
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($Message, "CyberTwin", "OK", "Error")
  } catch { }
}

function Fail([string]$Message) { Show-Error $Message; exit 1 }

function Test-Command([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Get-Listener([int]$P) {
  # uvicorn on Windows binds with SO_REUSEADDR and does NOT fail on a taken port, so check explicitly.
  return Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Get-FreePort {
  $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $l.Start(); $p = $l.LocalEndpoint.Port; $l.Stop()
  return $p
}

function Stop-Tree([int]$ProcessId) {
  if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
  }
}

function Test-Health([string]$Url) {
  try { return (Invoke-RestMethod -Uri "$Url/api/v1/health" -TimeoutSec 2).status -eq "ok" } catch { return $false }
}

function Find-Browser {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  foreach ($exe in "msedge.exe", "chrome.exe") {
    $reg = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$exe" -ErrorAction SilentlyContinue
    if ($reg -and $reg.'(default)' -and (Test-Path $reg.'(default)')) { return $reg.'(default)' }
  }
  return $null
}

function Get-AppWindows {
  # every Edge/Chrome process that uses our private profile (the app window and its helpers)
  $needle = $Profile_.ToLowerInvariant()
  return @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle) })
}

function Open-AppWindow([string]$BrowserExe, [string]$Url) {
  $browserArgs = @(
    "--app=$Url", "--user-data-dir=`"$Profile_`"", "--no-first-run", "--no-default-browser-check",
    "--window-size=1440,900"
  )
  if ($DebugPort -gt 0) { $browserArgs += "--remote-debugging-port=$DebugPort" }
  Start-Process -FilePath $BrowserExe -ArgumentList $browserArgs | Out-Null
}

# ---- another CyberTwin already running? reuse it; a stale backend from a killed launcher is stopped
if (Test-Path $StateFile) {
  $state = Get-Content $StateFile -Raw | ConvertFrom-Json
  $alive = Get-Process -Id $state.launcher -ErrorAction SilentlyContinue
  if ($alive -and (Test-Health $state.url)) {
    $browser = Find-Browser
    if ($browser) { Open-AppWindow $browser $state.url } else { Start-Process $state.url }
    exit 0
  }
  if ($state.backend) { Stop-Tree ([int]$state.backend) }
  Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
}

# ---- prerequisites (only the tools that are actually needed are required)
if (-not (Test-Path $Python)) {
  if (-not (Test-Command "uv")) {
    Fail "backend\.venv is missing and 'uv' was not found on PATH. Install uv (https://docs.astral.sh/uv/), then run 'uv sync' in $Backend."
  }
  Write-Host "Creating backend\.venv (uv sync)..."
  Push-Location $Backend
  try { & uv sync --frozen *> (Join-Path $Logs "uv-sync.log") } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Python)) { Fail "uv sync failed. Log: $(Join-Path $Logs 'uv-sync.log')" }
}

function Test-DistStale {
  # dist older than any frontend source (src, public, index.html, package files) -> rebuild
  $built = Get-Item (Join-Path $Dist "index.html") -ErrorAction SilentlyContinue
  if (-not $built) { return $true }
  $sources = @(Get-ChildItem (Join-Path $Frontend "src"), (Join-Path $Frontend "public") -Recurse -File -ErrorAction SilentlyContinue) +
    @(Get-Item (Join-Path $Frontend "index.html"), (Join-Path $Frontend "package.json"), (Join-Path $Frontend "vite.config.ts") -ErrorAction SilentlyContinue)
  $newest = ($sources | Measure-Object -Property LastWriteTime -Maximum).Maximum
  return $newest -gt $built.LastWriteTime
}

$missing = -not (Test-Path (Join-Path $Dist "index.html"))
if ($Rebuild -or $missing -or (Test-DistStale)) {
  if (-not $missing -and -not $Rebuild -and -not (Test-Command "npm")) {
    Write-Host "frontend\dist is older than the sources, but npm was not found; using the existing build." -ForegroundColor Yellow
  } elseif (-not (Test-Command "npm")) {
    Fail "frontend\dist is missing and Node.js/npm was not found on PATH. Install Node 24 (https://nodejs.org/), or build the frontend once with 'npm install' and 'npm run build' in $Frontend."
  } else {
    $buildLog = Join-Path $Logs "frontend-build.log"
    Write-Host "Building the frontend... log: $buildLog"
    Push-Location $Frontend
    $ok = $true
    try {
      # through cmd.exe: npm/vite write warnings to stderr, and Windows PowerShell 5.1 turns native stderr into a
      # terminating NativeCommandError under $ErrorActionPreference = "Stop" (the launcher then died mid-build)
      if (-not (Test-Path (Join-Path $Frontend "node_modules"))) { & cmd.exe /d /c "npm ci > `"$buildLog`" 2>&1"; $ok = ($LASTEXITCODE -eq 0) }
      if ($ok) { & cmd.exe /d /c "npm run build >> `"$buildLog`" 2>&1"; $ok = ($LASTEXITCODE -eq 0) }
    } finally { Pop-Location }
    if (-not $ok -or -not (Test-Path (Join-Path $Dist "index.html"))) { Fail "Frontend build failed. Log: $buildLog" }
  }
}

# ---- port
if ($Port -gt 0) {
  $owner = Get-Listener $Port
  if ($owner) {
    $p = Get-Process -Id $owner.OwningProcess -ErrorAction SilentlyContinue
    Fail "Port $Port is already in use by $($p.ProcessName) (PID $($owner.OwningProcess)). Close it or start without -Port to use a free port."
  }
} else {
  $Port = Get-FreePort
}
$Url = "http://127.0.0.1:$Port"

# ---- backend: one process serves /api and the UI
$env:FRONTEND_DIST = $Dist
$env:DATABASE_URL = "sqlite+aiosqlite:///" + ((Join-Path $Home_ "cybertwin.db") -replace "\\", "/")
$env:CORS_ORIGINS = $Url
$env:LOG_LEVEL = "INFO"
$uvicornArgs = @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$Port", "--app-dir", "`"$Backend`"")
$proc = Start-Process -FilePath $Python -ArgumentList $uvicornArgs -WorkingDirectory $Backend -WindowStyle Hidden `
  -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendErr -PassThru
$null = $proc.Handle  # Windows PowerShell 5.1: keep the handle so ExitCode is readable after the process ends
@{ launcher = $PID; backend = $proc.Id; url = $Url } | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8

try {
  $deadline = (Get-Date).AddSeconds(90)
  while (-not (Test-Health $Url)) {
    if ($proc.HasExited) {
      $tail = (Get-Content $BackendErr -Tail 15 -ErrorAction SilentlyContinue) -join "`n"
      Fail "The backend stopped during start (exit code $($proc.ExitCode)).`nLog: $BackendErr`n`n$tail"
    }
    if ((Get-Date) -gt $deadline) { Fail "The backend did not answer on $Url within 90 s. Log: $BackendErr" }
    Start-Sleep -Milliseconds 400
  }
  Write-Host "CyberTwin is running at $Url (log: $BackendErr)"

  if ($NoBrowser) {
    Read-Host "Press Enter to stop CyberTwin" | Out-Null
  } else {
    $browser = Find-Browser
    if (-not $browser) {
      Show-Error "Neither Microsoft Edge nor Google Chrome was found. CyberTwin opens in your default browser instead; close this window to stop it."
      Start-Process $Url
      Read-Host "Press Enter to stop CyberTwin" | Out-Null
    } else {
      Open-AppWindow $browser $Url
      # the window may need a moment to appear; then wait until every process of our profile is gone
      $seen = $false
      for ($i = 0; $i -lt 40 -and -not $seen; $i++) { Start-Sleep -Milliseconds 250; $seen = (Get-AppWindows).Count -gt 0 }
      if (-not $seen) { Fail "The browser window did not start ($browser)." }
      while ((Get-AppWindows).Count -gt 0) { Start-Sleep -Milliseconds 1500 }
    }
  }
} finally {
  Stop-Tree $proc.Id
  Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
  Remove-Item Env:FRONTEND_DIST, Env:DATABASE_URL, Env:CORS_ORIGINS, Env:LOG_LEVEL -ErrorAction SilentlyContinue
}
