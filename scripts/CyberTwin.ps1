<#
  CyberTwin desktop launcher.

  1. Checks uv and Node.js, prepares the backend environment if needed.
  2. Builds the frontend if dist/ is missing or older than the sources (npm runs through cmd.exe so
     Vite's warnings on stderr cannot break Windows PowerShell 5.1).
  3. Starts the backend (python -m cybertwin, which also serves the built frontend) on a free port.
  4. Waits for /api/v1/health, then opens Microsoft Edge (fallback: Chrome) in --app mode with its
     own profile under %LOCALAPPDATA%\CyberTwin.
  5. When the window is closed, stops the backend. No uvicorn process is left behind.

  Works under Windows Smart App Control: it only runs signed executables (powershell, cmd, node,
  the python.org venv launcher, Edge/Chrome). Errors are shown in a message box because the desktop
  shortcut starts this script with a hidden console.

  Optional: $env:CYBERTWIN_PORT = 8765 forces a port (error if it is taken).
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Dist = Join-Path $Frontend 'dist'
$AppData = Join-Path $env:LOCALAPPDATA 'CyberTwin'
$LogDir = Join-Path $AppData 'logs'
$DataDir = Join-Path $AppData 'data'
$BrowserProfile = Join-Path $AppData 'browser-profile'
New-Item -ItemType Directory -Force $LogDir, $DataDir, $BrowserProfile | Out-Null
$LauncherLog = Join-Path $LogDir 'launcher.log'
$BackendLog = Join-Path $LogDir 'backend.log'
$BackendErr = Join-Path $LogDir 'backend.err.log'
$BuildLog = Join-Path $LogDir 'frontend-build.log'

function Log([string]$msg) {
    $line = "{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $msg
    Add-Content -Path $LauncherLog -Value $line -Encoding UTF8
    Write-Host $line
}

function Fail([string]$en, [string]$tr) {
    Log "ERROR: $en"
    if ($env:CYBERTWIN_NO_DIALOG) { Write-Host $tr; exit 1 }   # automated tests of the error paths
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [void][System.Windows.Forms.MessageBox]::Show("$en`n`n$tr`n`nLog: $LauncherLog", 'CyberTwin',
            [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)
    } catch { Write-Host $tr }
    exit 1
}

function Find-Exe([string]$name, [string[]]$extra) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in $extra) { if ($p -and (Test-Path $p)) { return $p } }
    return $null
}

function Test-PortFree([int]$port) {
    try {
        $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
        $l.Start(); $l.Stop(); return $true
    } catch { return $false }
}

function Port-Owner([int]$port) {
    try {
        $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        return "$($p.ProcessName) (PID $($c.OwningProcess))"
    } catch { return 'unknown process' }
}

function Newest-Write([string[]]$paths) {
    $latest = [datetime]::MinValue
    foreach ($p in $paths) {
        if (-not (Test-Path $p)) { continue }
        $item = Get-Item $p
        if ($item.PSIsContainer) {
            $f = Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($f -and $f.LastWriteTime -gt $latest) { $latest = $f.LastWriteTime }
        } elseif ($item.LastWriteTime -gt $latest) { $latest = $item.LastWriteTime }
    }
    return $latest
}

Log "---- CyberTwin launcher start (root: $Root)"

# ---- prerequisites --------------------------------------------------------------------------
$uv = Find-Exe 'uv' @("$env:USERPROFILE\.local\bin\uv.exe", "$env:LOCALAPPDATA\Programs\uv\uv.exe")
$node = Find-Exe 'node' @("$env:ProgramFiles\nodejs\node.exe")
$python = Join-Path $Backend '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    if (-not $uv) {
        Fail 'uv was not found. Install it: powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex" (see README).' `
             'uv bulunamadı. Kurulum için README''deki "Setting up a fresh Windows PC" bölümüne bak.'
    }
    Log "Backend environment missing: running uv sync"
    Push-Location $Backend
    & cmd /c "`"$uv`" sync > `"$LogDir\uv-sync.log`" 2>&1"
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0 -or -not (Test-Path $python)) {
        Fail "uv sync failed (exit $code). See $LogDir\uv-sync.log" "Backend ortamı hazırlanamadı. Günlük: $LogDir\uv-sync.log"
    }
}

# ---- frontend build (if missing or stale) -------------------------------------------------------
$index = Join-Path $Dist 'index.html'
$srcTime = Newest-Write @((Join-Path $Frontend 'src'), (Join-Path $Frontend 'public'), (Join-Path $Frontend 'index.html'),
    (Join-Path $Frontend 'package.json'), (Join-Path $Frontend 'vite.config.ts'), (Join-Path $Root 'shared\i18n'))
$distTime = if (Test-Path $index) { (Get-Item $index).LastWriteTime } else { [datetime]::MinValue }
if ($srcTime -gt $distTime) {
    if (-not $node) {
        Fail 'Node.js was not found, and the frontend must be built. Install Node.js LTS (see README).' `
             'Node.js bulunamadı; arayüzün derlenmesi gerekiyor. Node.js LTS kur (README).'
    }
    Log "Frontend build needed (sources $srcTime > dist $distTime)"
    Push-Location $Frontend
    if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
        & cmd /c "npm ci > `"$BuildLog`" 2>&1"
        if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm ci failed. See $BuildLog" "npm ci başarısız. Günlük: $BuildLog" }
    }
    & cmd /c "npm run build >> `"$BuildLog`" 2>&1"
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0 -or -not (Test-Path $index)) { Fail "Frontend build failed (exit $code). See $BuildLog" "Arayüz derlenemedi. Günlük: $BuildLog" }
    Log "Frontend built"
}

# ---- port ---------------------------------------------------------------------------------------
if ($env:CYBERTWIN_PORT) {
    $port = [int]$env:CYBERTWIN_PORT
    if (-not (Test-PortFree $port)) {
        Fail "Port $port is already in use by $(Port-Owner $port). Close it or unset CYBERTWIN_PORT." `
             "$port portu kullanımda: $(Port-Owner $port). O programı kapat ya da CYBERTWIN_PORT ayarını kaldır."
    }
} else {
    $port = $null
    foreach ($p in 8765..8799) { if (Test-PortFree $p) { $port = $p; break } }
    if (-not $port) { Fail 'No free port between 8765 and 8799.' '8765-8799 arasında boş port yok.' }
}

# ---- backend --------------------------------------------------------------------------------------
$db = 'sqlite+aiosqlite:///' + ((Join-Path $DataDir 'cybertwin.db') -replace '\\', '/')
Log "Starting backend on 127.0.0.1:$port"
$backendProc = Start-Process -FilePath $python -WorkingDirectory $Backend -WindowStyle Hidden -PassThru `
    -ArgumentList @('-m', 'cybertwin', '--host', '127.0.0.1', '--port', "$port", '--frontend-dist', "`"$Dist`"", '--database-url', $db) `
    -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendErr

$url = "http://127.0.0.1:$port"
$healthy = $false
for ($i = 0; $i -lt 120; $i++) {
    if ($backendProc.HasExited) {
        $tail = (Get-Content $BackendErr -Tail 8 -ErrorAction SilentlyContinue) -join "`n"
        Fail "The backend stopped during start-up (exit $($backendProc.ExitCode)). Log: $BackendErr`n$tail" `
             "Backend açılırken kapandı. Günlük: $BackendErr"
    }
    try {
        $h = Invoke-RestMethod "$url/api/v1/health" -TimeoutSec 2
        if ($h.status -eq 'ok') { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
}
if (-not $healthy) {
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    Fail "The backend did not answer on $url within 60 s. Log: $BackendErr" "Backend 60 sn içinde yanıt vermedi. Günlük: $BackendErr"
}
Log "Backend healthy (PID $($backendProc.Id))"

# ---- app window -----------------------------------------------------------------------------------
$browsers = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $browsers | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) {
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    Fail 'Neither Microsoft Edge nor Google Chrome was found.' 'Microsoft Edge ya da Google Chrome bulunamadı.'
}
Log "Opening $browser in app mode"
$browserArgs = @("--app=$url/", "--user-data-dir=`"$BrowserProfile`"", '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,900', '--disable-features=Translate')
# Verification only: lets an automated check drive the real window over CDP (off by default).
if ($env:CYBERTWIN_CDP_PORT) { $browserArgs += "--remote-debugging-port=$($env:CYBERTWIN_CDP_PORT)" }
$win = Start-Process -FilePath $browser -ArgumentList $browserArgs -PassThru

# The app window may hand off to a child process; wait until no browser process uses our profile.
function Profile-Procs {
    $needle = $BrowserProfile.ToLowerInvariant()
    Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle) }
}
Start-Sleep -Seconds 2
try { Wait-Process -Id $win.Id -ErrorAction SilentlyContinue } catch { }
Log "Browser start process $($win.Id) exited; watching processes that use the app profile"
# Edge may briefly restart its main process; only treat the window as closed after the profile
# has had no browser process for 3 consecutive checks.
$gone = 0
while ($gone -lt 3) {
    $n = @(Profile-Procs).Count
    if ($n -gt 0) { $gone = 0 } else { $gone++ }
    if ($backendProc.HasExited) { Log "Backend exited while the window was open (exit $($backendProc.ExitCode)); see $BackendErr"; break }
    Start-Sleep -Seconds 1
}
Log "App window closed"

# ---- shutdown -----------------------------------------------------------------------------------
# The venv python.exe is a launcher that starts the real interpreter as a child process, so stop the
# whole process tree, then sweep any remaining "python -m cybertwin --port <port>" process.
if (-not $backendProc.HasExited) {
    & taskkill.exe /PID $backendProc.Id /T /F 2>&1 | ForEach-Object { Log "taskkill: $_" }
}
Start-Sleep -Milliseconds 500
$left = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match '-m cybertwin' -and $_.CommandLine -match "--port $port\b" })
foreach ($p in $left) {
    Log "Stopping leftover backend process $($p.ProcessId)"
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
$still = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match '-m cybertwin' -and $_.CommandLine -match "--port $port\b" })
Log "Backend stopped (remaining backend processes: $($still.Count)); launcher done"
exit 0
