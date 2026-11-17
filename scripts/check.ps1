# Runs every static check and unit test suite. Full output goes to logs/check-*.log;
# the console shows only a pass/fail line per step.
#   powershell -ExecutionPolicy Bypass -File scripts\check.ps1 [-Backend] [-Frontend]
param([switch]$Backend, [switch]$Frontend)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
if (-not $Backend -and -not $Frontend) { $Backend = $true; $Frontend = $true }

$failed = @()
function Step([string]$name, [string]$dir, [string]$cmd) {
    $log = Join-Path $logs "check-$name.log"
    Push-Location (Join-Path $root $dir)
    cmd /c "($cmd) > `"$log`" 2>&1"
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -eq 0) { Write-Host ("PASS  {0}" -f $name) }
    else { Write-Host ("FAIL  {0}  (exit {1}, see {2})" -f $name, $code, $log); $script:failed += $name }
}

if ($Backend) {
    Step 'ruff' 'backend' 'uv run python -m ruff check . && uv run python -m ruff format --check .'
    Step 'mypy' 'backend' 'uv run python -m mypy'
    Step 'pytest' 'backend' 'uv run python -m pytest --cov --cov-report=term'
}
if ($Frontend) {
    Step 'tsc' 'frontend' 'npx tsc -b --noEmit'
    Step 'eslint' 'frontend' 'npx eslint . --max-warnings 0'
    Step 'vitest' 'frontend' 'npx vitest run'
}
if ($failed.Count -gt 0) { Write-Host "FAILED: $($failed -join ', ')"; exit 1 }
Write-Host 'ALL GREEN'
