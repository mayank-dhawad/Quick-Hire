# ============================================================================
# QUICKHIRE TWO-SESSION CONCURRENCY TEST RUNNER (PowerShell)
# File: supabase/tests/concurrency_runner.ps1
# Description:
#   Spawns two independent psql sessions for:
#   Scenario 1: Concurrent Job Capacity & Overbooking
#   Scenario 2: Concurrent Payment Overpayment Cap
#   Scenario 3: Concurrent Child Refund Cap
# ============================================================================

param(
  [string]$DbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)

function Run-ConcurrencyScenario {
  param(
    [string]$ScenarioName,
    [string]$Session1File,
    [string]$Session2File
  )

  Write-Host "`n================================================================" -ForegroundColor Cyan
  Write-Host "SCENARIO: $ScenarioName" -ForegroundColor Cyan
  Write-Host "================================================================" -ForegroundColor Cyan

  Write-Host "[1/3] Starting Session 1 (acquiring lock and holding in-flight)..." -ForegroundColor Yellow
  $job1 = Start-Job -ScriptBlock {
    param($url, $file)
    & psql $url -f $file 2>&1
  } -ArgumentList $DbUrl, $Session1File

  Start-Sleep -Seconds 1.5

  Write-Host "[2/3] Starting Session 2 (attempting concurrent mutation; should block)..." -ForegroundColor Yellow
  $s2Out = & psql $DbUrl -f $Session2File 2>&1

  $s1Out = Receive-Job -Job $job1 -Wait
  Remove-Job -Job $job1

  Write-Host "---------------- Session 1 Output ----------------" -ForegroundColor Gray
  $s1Out | ForEach-Object { Write-Host $_ }
  Write-Host "---------------- Session 2 Output ----------------" -ForegroundColor Gray
  $s2Out | ForEach-Object { Write-Host $_ }
  Write-Host "--------------------------------------------------" -ForegroundColor Gray

  $s1Ok = $s1Out -match "COMMITTED SUCCESSFULLY"
  $s2BlockedOk = $s2Out -match "23514" -or $s2Out -match "Capacity Exceeded" -or $s2Out -match "Overpayment Violation" -or $s2Out -match "Refund Violation"

  if ($s1Ok -and $s2BlockedOk) {
    Write-Host "[SUCCESS] $ScenarioName PASSED! Session 1 serialized; Session 2 blocked and aborted with 23514." -ForegroundColor Green
  } else {
    Write-Host "[FAILURE] $ScenarioName FAILED!" -ForegroundColor Red
    exit 1
  }
}

# Run Scenario 1: Capacity
Run-ConcurrencyScenario -ScenarioName "Job Capacity & Simultaneous Hiring" `
  -Session1File "$PSScriptRoot\03_concurrency_session1.sql" `
  -Session2File "$PSScriptRoot\03_concurrency_session2.sql"

# Run Scenario 2: Overpayment
Run-ConcurrencyScenario -ScenarioName "Payment Overpayment Prevention" `
  -Session1File "$PSScriptRoot\04_concurrency_payments_s1.sql" `
  -Session2File "$PSScriptRoot\04_concurrency_payments_s2.sql"

# Run Scenario 3: Refunds
Run-ConcurrencyScenario -ScenarioName "Child Refund Limits" `
  -Session1File "$PSScriptRoot\05_concurrency_refunds_s1.sql" `
  -Session2File "$PSScriptRoot\05_concurrency_refunds_s2.sql"

Write-Host "`n================================================================" -ForegroundColor Green
Write-Host "ALL 3 CONCURRENCY SUITES PASSED CLEANLY UNDER PARALLEL SESSIONS" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
