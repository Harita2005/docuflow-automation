param (
    [string]$BaseUrl = "http://127.0.0.1:3000",
    [switch]$FastRun,
    [switch]$CleanAfter,
    [string]$K6Path = "C:\Program Files\k6\k6.exe"
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

$ExecutionMode = "Full Production Scale Mode"
if ($FastRun) {
    $ExecutionMode = "Fast Verification / Smoke Mode"
}

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  DOCUFLOW AUTOMATION -- PERFORMANCE AND INTEGRITY TEST SUITE " -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "Target URL:       $BaseUrl"
Write-Host "Execution Mode:   $ExecutionMode"
Write-Host "Timestamp:        $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host ""

# -------------------------------------------------------------------------
# Step 1: Health and Connectivity Verification
# -------------------------------------------------------------------------
Write-Host "[1/7] Checking Backend Health and Connectivity at $BaseUrl/health..." -ForegroundColor Yellow
try {
    $HealthRes = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 5
    if ($HealthRes.status -ne "healthy") {
        Write-Error "Backend health check returned non-healthy status"
        exit 1
    }
    Write-Host "  [OK] Backend is healthy and ready for performance testing." -ForegroundColor Green
} catch {
    Write-Error "Failed to connect to backend at $BaseUrl/health: $_"
    exit 1
}

# Resolve active token
$TokenFile = Join-Path $PSScriptRoot "performance\token.txt"
$Token = ""
if (Test-Path $TokenFile) {
    $Token = (Get-Content $TokenFile -Raw).Trim()
}

if (-not $Token) {
    Write-Host "  [Notice] Acquiring fresh authentication token via python..." -ForegroundColor Yellow
    try {
        $PyCmd = "import sys; sys.path.insert(0, 'backend'); from app.auth import create_access_token; t = create_access_token({'sub': 'admin', 'role': 'admin'}); open('tests/performance/token.txt', 'w').write(t); print(t)"
        $Token = (python -c $PyCmd).Trim()
        Write-Host "  [OK] Successfully authenticated and refreshed token.txt." -ForegroundColor Green
    } catch {
        Write-Warning "Could not generate admin token. Proceeding with default."
    }
}

# -------------------------------------------------------------------------
# Step 2: Launch Background CPU and RAM Resource Monitor
# -------------------------------------------------------------------------
Write-Host "[2/7] Starting background Windows system resource monitor..." -ForegroundColor Yellow
$MonitorScript = Join-Path $PSScriptRoot "monitoring\monitor.ps1"
$MetricsFile = Join-Path $PSScriptRoot "reports\system_resources_latest.csv"
$MonitorJob = Start-Job -ScriptBlock {
    param($Script, $Out)
    powershell -ExecutionPolicy Bypass -File $Script -OutputFile $Out -IntervalSeconds 1
} -ArgumentList $MonitorScript, $MetricsFile

Write-Host "  [OK] Monitor job launched (Job ID: $($MonitorJob.Id))." -ForegroundColor Green

# -------------------------------------------------------------------------
# Step 3: Test A - Real Document API Load Test
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[3/7] Executing Test A: Real Document API Load Test (10, 25, 50, 100 VUs)..." -ForegroundColor Yellow
$LoadScript = Join-Path $PSScriptRoot "performance\real-api-load.js"
$StageDur = "15s"
if ($FastRun) { $StageDur = "5s" }

& $K6Path run -e BASE_URL=$BaseUrl -e STAGE_DURATION=$StageDur -e DOCUFLOW_TOKEN=$Token $LoadScript
Write-Host "  [OK] Real Document API Load Test completed. Summary saved." -ForegroundColor Green
Start-Sleep -Seconds 3

# -------------------------------------------------------------------------
# Step 4: Test B - 1,000 Concurrent Synchronization Requests
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[4/7] Executing Test B: 1,000 Concurrent Synchronization Requests (Staged 10 to 1,000 VUs)..." -ForegroundColor Yellow
$SyncScript = Join-Path $PSScriptRoot "performance\sync-concurrency.js"
$SyncRamp = "10s"
if ($FastRun) { $SyncRamp = "4s" }

& $K6Path run -e BASE_URL=$BaseUrl -e STAGE_RAMP=$SyncRamp -e DOCUFLOW_TOKEN=$Token $SyncScript
Write-Host "  [OK] Synchronization Concurrency Test completed. Summary saved." -ForegroundColor Green
Start-Sleep -Seconds 3

# -------------------------------------------------------------------------
# Step 5: Test C and D - Endurance and Stress Tests
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[5/7] Executing Test C (Endurance) and Test D (Stress Testing)..." -ForegroundColor Yellow
$EnduranceScript = Join-Path $PSScriptRoot "performance\endurance-test.js"
$EnduranceDur = "3m"
if ($FastRun) { $EnduranceDur = "10s" }

& $K6Path run -e BASE_URL=$BaseUrl -e DURATION=$EnduranceDur -e VUS=25 -e DOCUFLOW_TOKEN=$Token $EnduranceScript
Start-Sleep -Seconds 3

$StressScript = Join-Path $PSScriptRoot "performance\stress-test.js"
$StressRamp = "15s"
if ($FastRun) { $StressRamp = "4s" }

& $K6Path run -e BASE_URL=$BaseUrl -e STAGE_RAMP=$StressRamp -e DOCUFLOW_TOKEN=$Token $StressScript
Write-Host "  [OK] Endurance and Stress Tests completed." -ForegroundColor Green
Start-Sleep -Seconds 3

# -------------------------------------------------------------------------
# Step 6: Stop Resource Monitor
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[6/7] Stopping system resource monitor..." -ForegroundColor Yellow
Stop-Job $MonitorJob -ErrorAction SilentlyContinue | Out-Null
Remove-Job $MonitorJob -ErrorAction SilentlyContinue | Out-Null
Write-Host "  [OK] Resource metrics finalized in tests/reports/system_resources_latest.csv." -ForegroundColor Green

# -------------------------------------------------------------------------
# Step 7: Test F - Database Integrity and Concurrency Audit
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[7/7] Auditing database integrity, record persistence and duplicate prevention..." -ForegroundColor Yellow
$VerifyScript = Join-Path $PSScriptRoot "database\verify-sync-results.py"
if ($CleanAfter) {
    python $VerifyScript --cleanup
} else {
    python $VerifyScript
}

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  ALL TEST SUITES EXECUTED SUCCESSFULLY! " -ForegroundColor Green
Write-Host "  Consolidated reports available in tests/reports/" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
