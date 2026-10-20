<#
.SYNOPSIS
    Windows Process and System Resource Monitor for DocuFlow Automation.
.DESCRIPTION
    Collects timestamped samples of Backend Python, Frontend Node, and overall
    system CPU and RAM usage, exporting directly to a CSV file.
.PARAMETER OutputFile
    Destination path for the CSV metrics log. Defaults to tests/reports/system_resources.csv.
.PARAMETER IntervalSeconds
    Sampling interval in seconds. Defaults to 2.
.PARAMETER MaxSamples
    Maximum number of samples before stopping. Defaults to 0 (runs indefinitely until stopped).
#>

param (
    [string]$OutputFile = "tests/reports/system_resources.csv",
    [int]$IntervalSeconds = 2,
    [int]$MaxSamples = 0,
    [int]$BackendPort = 3000
)

# Ensure output directory exists
$OutputDir = Split-Path -Parent $OutputFile
if ($OutputDir -and -not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Resolve target backend process by port
$BackendProcess = $null
try {
    $Conn = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Conn) {
        $BackendProcess = Get-Process -Id $Conn.OwningProcess -ErrorAction SilentlyContinue
    }
} catch {}

if (-not $BackendProcess) {
    $BackendProcess = Get-Process -Name "python" -ErrorAction SilentlyContinue | Sort-Object WorkingSet64 -Descending | Select-Object -First 1
}

# CSV Header
$Headers = @(
    "Timestamp",
    "System_CPU_Pct",
    "System_Total_RAM_MB",
    "System_Available_RAM_MB",
    "System_RAM_Used_Pct",
    "Backend_PID",
    "Backend_Process_Name",
    "Backend_CPU_Pct",
    "Backend_RAM_WorkingSet_MB",
    "Backend_RAM_Private_MB",
    "Node_PID",
    "Node_RAM_WorkingSet_MB"
)

$HeaderLine = $Headers -join ","
try {
    Set-Content -Path $OutputFile -Value $HeaderLine -Encoding UTF8 -ErrorAction Stop
} catch {
    $OutputFile = Join-Path (Split-Path -Parent $OutputFile) "system_resources_latest.csv"
    Set-Content -Path $OutputFile -Value $HeaderLine -Encoding UTF8
    Write-Warning "Target file was locked by an external application (e.g. Excel). Using $OutputFile"
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "DocuFlow Resource Monitor Started" -ForegroundColor Green
Write-Host "Output File: $OutputFile"
Write-Host "Sampling Interval: ${IntervalSeconds}s"
if ($BackendProcess) {
    Write-Host "Target Backend Process: $($BackendProcess.ProcessName) (PID: $($BackendProcess.Id))" -ForegroundColor Yellow
} else {
    Write-Host "Target Backend Process: Not detected on port $BackendPort" -ForegroundColor DarkYellow
}
Write-Host "Press Ctrl+C to terminate sampling..."
Write-Host "============================================================" -ForegroundColor Cyan

$SampleCount = 0
$PrevSystemCpu = 0

try {
    while ($true) {
        $Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

        # System Metrics
        $OS = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
        $TotalRAM_MB = if ($OS) { [math]::Round($OS.TotalVisibleMemorySize / 1024, 2) } else { 0 }
        $FreeRAM_MB = if ($OS) { [math]::Round($OS.FreePhysicalMemory / 1024, 2) } else { 0 }
        $UsedRAM_Pct = if ($TotalRAM_MB -gt 0) { [math]::Round((($TotalRAM_MB - $FreeRAM_MB) / $TotalRAM_MB) * 100, 2) } else { 0 }

        # System CPU
        $Proc = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Measure-Object -Property LoadPercentage -Average
        $SystemCpuPct = if ($Proc) { $Proc.Average } else { 0 }

        # Backend Python Metrics
        $BackendPID = ""
        $BackendName = ""
        $BackendWS_MB = 0
        $BackendPM_MB = 0
        $BackendCPU = 0

        if ($BackendProcess) {
            try {
                $p = Get-Process -Id $BackendProcess.Id -ErrorAction SilentlyContinue
                if ($p) {
                    $BackendPID = $p.Id
                    $BackendName = $p.ProcessName
                    $BackendWS_MB = [math]::Round($p.WorkingSet64 / 1MB, 2)
                    $BackendPM_MB = [math]::Round($p.PrivateMemorySize64 / 1MB, 2)
                    $BackendCPU = [math]::Round($p.CPU, 2)
                }
            } catch {}
        }

        # Node / Frontend Process Metrics
        $NodeProc = Get-Process -Name "node" -ErrorAction SilentlyContinue | Sort-Object WorkingSet64 -Descending | Select-Object -First 1
        $NodePID = if ($NodeProc) { $NodeProc.Id } else { "" }
        $NodeWS_MB = if ($NodeProc) { [math]::Round($NodeProc.WorkingSet64 / 1MB, 2) } else { 0 }

        # Construct CSV row
        $Row = @(
            $Timestamp,
            $SystemCpuPct,
            $TotalRAM_MB,
            $FreeRAM_MB,
            $UsedRAM_Pct,
            $BackendPID,
            $BackendName,
            $BackendCPU,
            $BackendWS_MB,
            $BackendPM_MB,
            $NodePID,
            $NodeWS_MB
        ) -join ","

        try {
            Add-Content -Path $OutputFile -Value $Row -Encoding UTF8 -ErrorAction Stop
        } catch {
            # Retry or skip sample gracefully if locked
        }

        $SampleCount++
        if ($MaxSamples -gt 0 -and $SampleCount -ge $MaxSamples) {
            break
        }

        Start-Sleep -Seconds $IntervalSeconds
    }
} finally {
    Write-Host "`nMonitoring complete. $SampleCount samples recorded to $OutputFile" -ForegroundColor Green
}
