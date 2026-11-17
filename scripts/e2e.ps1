<#
  Builds the frontend once, then runs the whole Playwright suite N times in a row against the real
  backend (fresh SQLite file per run) and vite preview, with Microsoft Edge.
  Full output: logs\e2e-run<N>.log ; console: one summary line per run.
    powershell -ExecutionPolicy Bypass -File scripts\e2e.ps1 [-Runs 3]
#>
param([int]$Runs = 3)
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force $Logs | Out-Null
Push-Location (Join-Path $Root 'frontend')
cmd /c "npm run build > `"$Logs\e2e-build.log`" 2>&1"
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "FAIL  build (see $Logs\e2e-build.log)"; exit 1 }
$failed = 0
for ($i = 1; $i -le $Runs; $i++) {
    Remove-Item (Join-Path $Logs 'e2e.db') -ErrorAction SilentlyContinue
    $log = Join-Path $Logs "e2e-run$i.log"
    $t0 = Get-Date
    cmd /c "npx playwright test --reporter=line > `"$log`" 2>&1"
    $code = $LASTEXITCODE
    $summary = (Select-String -Path $log -Pattern '^\s+\d+ (passed|failed|flaky|skipped)' | ForEach-Object { $_.Line.Trim() }) -join ', '
    $secs = [int]((Get-Date) - $t0).TotalSeconds
    if ($code -eq 0) { Write-Host "PASS  run $i/$Runs  $summary  (${secs}s)" } else { Write-Host "FAIL  run $i/$Runs  $summary  (${secs}s, see $log)"; $failed++ }
}
Pop-Location
if ($failed) { Write-Host "$failed of $Runs runs failed"; exit 1 }
Write-Host "ALL $Runs RUNS GREEN"
