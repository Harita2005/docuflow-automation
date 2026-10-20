param (
    [string]$OutputFile = "tests/reports/capacity/system_resources_capacity.csv",
    [int]$IntervalSeconds = 2,
    [int]$MaxSamples = 0,
    [int]$BackendPort = 3000
)

$OutputDir = Split-Path -Parent $OutputFile
if ($OutputDir -and -not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$Headers = @(
    "Timestamp",
    "System_CPU_Pct",
    "System_Total_RAM_MB",
    "System_Available_RAM_MB",
    "System_RAM_Used_Pct",
    "Backend_PID",
    "Backend_CPU_Pct",
    "Backend_RAM_WorkingSet_MB",
    "Backend_RAM_Private_MB",
    "Node_PID",
    "Node_RAM_WorkingSet_MB",
    "SQL_PID",
    "SQL_RAM_WorkingSet_MB",
    "SQL_Active_Connections"
)

$HeaderLine = $Headers -join ","
Set-Content -Path $OutputFile -Value $HeaderLine -Encoding UTF8

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Capacity Resource Monitor Started" -ForegroundColor Green
Write-Host "Output File: $OutputFile"
Write-Host "Sampling Interval: ${IntervalSeconds}s"

$SampleCount = 0

function Get-SQLConnections {
    try {
        $connStr = "Driver={ODBC Driver 17 for SQL Server};Server=localhost,1433;Database=DocuFlowDB;Trusted_Connection=yes;TrustServerCertificate=yes;"
        $conn = New-Object System.Data.Odbc.OdbcConnection($connStr)
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "SELECT COUNT(*) FROM sys.dm_exec_connections"
        $count = $cmd.ExecuteScalar()
        $conn.Close()
        return $count
    } catch {
        return "N/A"
    }
}

while ($MaxSamples -eq 0 -or $SampleCount -lt $MaxSamples) {
    try {
        $SampleCount++
        $Now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

        # System CPU
        $SysCpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average

        # System RAM
        $Os = Get-CimInstance Win32_OperatingSystem
        $TotalRamMB = [math]::Round($Os.TotalVisibleMemorySize / 1024, 0)
        $FreeRamMB  = [math]::Round($Os.FreePhysicalMemory / 1024, 0)
        $UsedRamMB  = $TotalRamMB - $FreeRamMB
        $RamUsedPct = [math]::Round(($UsedRamMB / $TotalRamMB) * 100, 1)

        # Backend Python
        $BackendProcess = $null
        try {
            $tcp = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($tcp) {
                $BackendProcess = Get-Process -Id $tcp.OwningProcess -ErrorAction SilentlyContinue
            }
        } catch {}
        if (-not $BackendProcess) {
            $BackendProcess = Get-Process -Name "python" -ErrorAction SilentlyContinue | Sort-Object WorkingSet64 -Descending | Select-Object -First 1
        }

        $BackPid = if ($BackendProcess) { $BackendProcess.Id } else { "N/A" }
        $BackCpu = if ($BackendProcess) { [math]::Round(($BackendProcess.CPU), 1) } else { "N/A" }
        $BackWS  = if ($BackendProcess) { [math]::Round($BackendProcess.WorkingSet64 / 1MB, 1) } else { "N/A" }
        $BackPM  = if ($BackendProcess) { [math]::Round($BackendProcess.PrivateMemorySize64 / 1MB, 1) } else { "N/A" }

        # Node / Vite
        $NodeProc = Get-Process -Name "node" -ErrorAction SilentlyContinue | Sort-Object WorkingSet64 -Descending | Select-Object -First 1
        $NodePid = if ($NodeProc) { $NodeProc.Id } else { "N/A" }
        $NodeWS  = if ($NodeProc) { [math]::Round($NodeProc.WorkingSet64 / 1MB, 1) } else { "N/A" }

        # SQL Server
        $SqlProc = Get-Process -Name "sqlservr" -ErrorAction SilentlyContinue | Select-Object -First 1
        $SqlPid = if ($SqlProc) { $SqlProc.Id } else { "N/A" }
        $SqlWS  = if ($SqlProc) { [math]::Round($SqlProc.WorkingSet64 / 1MB, 1) } else { "N/A" }

        # SQL Connections
        $SqlConn = Get-SQLConnections

        $Row = @(
            $Now,
            $SysCpu,
            $TotalRamMB,
            $FreeRamMB,
            $RamUsedPct,
            $BackPid,
            $BackCpu,
            $BackWS,
            $BackPM,
            $NodePid,
            $NodeWS,
            $SqlPid,
            $SqlWS,
            $SqlConn
        ) -join ","

        Add-Content -Path $OutputFile -Value $Row -Encoding UTF8
    } catch {
        # Continue monitoring on transient errors
    }

    Start-Sleep -Seconds $IntervalSeconds
}
