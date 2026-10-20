param (
    [string]$BaseUrl = "http://127.0.0.1:3000",
    [string]$FrontendUrl = "http://127.0.0.1:8085"
)

$RootDir = "c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation"
Set-Location $RootDir

$ReportDir = "$RootDir\tests\reports\capacity"
if (-not (Test-Path $ReportDir)) {
    New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
}

$MonitorLog = "$ReportDir\system_resources_capacity.csv"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "DOCUFLOW AUTOMATION CAPACITY AND CONCURRENCY BENCHMARK" -ForegroundColor Cyan
Write-Host "Base Backend URL:  $BaseUrl"
Write-Host "Frontend Base URL: $FrontendUrl"
Write-Host "Reports Directory: $ReportDir"
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Start Resource Monitor in Background Job
Write-Host "[1/7] Launching System Resource Monitor..." -ForegroundColor Yellow
$MonitorJob = Start-Job -ScriptBlock {
    param($ScriptPath, $OutFile)
    & powershell.exe -ExecutionPolicy Bypass -File $ScriptPath -OutputFile $OutFile -IntervalSeconds 2
} -ArgumentList "$RootDir\tests\monitoring\monitor_capacity.ps1", $MonitorLog

Start-Sleep -Seconds 3

function Run-K6Test {
    param(
        [string]$TestFile,
        [string]$OutputJson,
        [hashtable]$EnvVars
    )

    $envArgs = @()
    foreach ($k in $EnvVars.Keys) {
        $v = $EnvVars[$k]
        $envArgs += "-e"
        $envArgs += "$k=$v"
    }

    Write-Host "`n>>> Running: $TestFile" -ForegroundColor Green
    & k6.exe run @envArgs --summary-export $OutputJson $TestFile
    Write-Host ">>> Finished: $TestFile (Exit Code: $LASTEXITCODE)" -ForegroundColor Yellow
}

try {
    # 2. Scenario A: Frontend Baseline
    Write-Host "`n[2/7] Executing Scenario A: Frontend Baseline..." -ForegroundColor Cyan
    Run-K6Test -TestFile "$RootDir\tests\performance\capacity_suite\01_frontend_baseline.js" -OutputJson "$ReportDir\01_frontend_baseline.json" -EnvVars @{ "FRONTEND_URL" = $FrontendUrl; "STAGE_DURATION" = "15s" }

    Start-Sleep -Seconds 3

    # 3. Scenario B: Authenticated Backend Workload
    Write-Host "`n[3/7] Executing Scenario B: Authenticated Backend Workload..." -ForegroundColor Cyan
    Run-K6Test -TestFile "$RootDir\tests\performance\capacity_suite\02_authenticated_backend.js" -OutputJson "$ReportDir\02_authenticated_backend.json" -EnvVars @{ "BASE_URL" = $BaseUrl; "STAGE_DURATION" = "15s" }

    Start-Sleep -Seconds 3

    # 4. Scenario C: Mixed Business Workload
    Write-Host "`n[4/7] Executing Scenario C: Mixed Business Workload..." -ForegroundColor Cyan
    Run-K6Test -TestFile "$RootDir\tests\performance\capacity_suite\03_mixed_workload.js" -OutputJson "$ReportDir\03_mixed_workload.json" -EnvVars @{ "BASE_URL" = $BaseUrl; "STAGE_DURATION" = "15s" }

    Start-Sleep -Seconds 3

    # 5. Scenario D: Gradual Concurrency Stress
    Write-Host "`n[5/7] Executing Scenario D: Gradual Concurrency Stress Ramp..." -ForegroundColor Cyan
    Run-K6Test -TestFile "$RootDir\tests\performance\capacity_suite\04_gradual_concurrency_stress.js" -OutputJson "$ReportDir\04_gradual_concurrency_stress.json" -EnvVars @{ "BASE_URL" = $BaseUrl; "STAGE_DURATION" = "15s" }

    Start-Sleep -Seconds 3

    # 6. Scenario E: Sustained Endurance Test
    Write-Host "`n[6/7] Executing Scenario E: Sustained Endurance Test..." -ForegroundColor Cyan
    Run-K6Test -TestFile "$RootDir\tests\performance\capacity_suite\05_endurance_test.js" -OutputJson "$ReportDir\05_endurance_test.json" -EnvVars @{ "BASE_URL" = $BaseUrl; "DURATION" = "3m"; "VUS" = "50" }

    Start-Sleep -Seconds 3

    # 7. Scenario F: Controlled AI and OCR Processing
    Write-Host "`n[7/7] Executing Scenario F: Controlled AI and OCR Processing..." -ForegroundColor Cyan
    Run-K6Test -TestFile "$RootDir\tests\performance\capacity_suite\06_ai_ocr_controlled.js" -OutputJson "$ReportDir\06_ai_ocr_controlled.json" -EnvVars @{ "BASE_URL" = $BaseUrl }

} finally {
    Write-Host "`nStopping Resource Monitor Job..." -ForegroundColor Yellow
    Stop-Job $MonitorJob -ErrorAction SilentlyContinue | Out-Null
    Receive-Job $MonitorJob -ErrorAction SilentlyContinue | Out-Null
    Remove-Job $MonitorJob -Force -ErrorAction SilentlyContinue | Out-Null
    Write-Host "Resource Monitor Stopped. Resource CSV logged to $MonitorLog" -ForegroundColor Green
}

# Compile final JSON and Markdown summary
Write-Host "`nCompiling test reports..." -ForegroundColor Cyan
& python "$RootDir\tests\performance\capacity_suite\compile_capacity_report.py"

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "All Capacity Test Scenarios Completed Successfully!" -ForegroundColor Green
Write-Host "Reports generated under: $ReportDir" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
