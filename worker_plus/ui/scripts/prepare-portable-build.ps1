$ErrorActionPreference = "Stop"

$uiRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$outputDir = [System.IO.Path]::GetFullPath((Join-Path $uiRoot "release-portable-final"))
$expectedPrefix = $uiRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

foreach ($directory in @($outputDir)) {
    if (-not $directory.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to prepare an output directory outside the UI project: $directory"
    }
}

$portableExe = Join-Path $outputDir "Daneshyar 0.1.0.exe"
$workerUserData = Join-Path $env:APPDATA "worker-plus-desktop"
$processes = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -like "Daneshyar*.exe" -and (
        ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($outputDir, [System.StringComparison]::OrdinalIgnoreCase)) -or
        ($_.CommandLine -and $_.CommandLine.Contains($portableExe)) -or
        ($_.CommandLine -and $_.CommandLine.Contains($workerUserData))
    )
}

foreach ($process in $processes) {
    Write-Host "Stopping Daneshyar process $($process.ProcessId) before packaging..."
    & taskkill.exe /PID $process.ProcessId /T /F 2>$null | Out-Null
}

$stagingMarker = $uiRoot + [System.IO.Path]::DirectorySeparatorChar + "release-portable-staging-"
$staleBuilders = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in @("7za.exe", "app-builder.exe") -and
    $_.CommandLine -and
    $_.CommandLine.Contains($stagingMarker)
}
foreach ($process in $staleBuilders) {
    Write-Host "Stopping stale $($process.Name) process $($process.ProcessId)..."
    & taskkill.exe /PID $process.ProcessId /T /F 2>$null | Out-Null
}
