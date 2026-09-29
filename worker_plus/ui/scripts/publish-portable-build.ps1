param(
    [Parameter(Mandatory = $true)]
    [string]$StagingDirectory
)

$ErrorActionPreference = "Stop"

$uiRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$stagingDir = [System.IO.Path]::GetFullPath($StagingDirectory)
$stagingExe = [System.IO.Path]::GetFullPath((Join-Path $stagingDir "Worker Plus 0.1.0.exe"))
$finalDir = [System.IO.Path]::GetFullPath((Join-Path $uiRoot "release-portable-final"))
$finalExe = Join-Path $finalDir "Worker Plus 0.1.0.exe"
$expectedPrefix = $uiRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

foreach ($path in @($stagingExe, $finalDir)) {
    if (-not $path.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to publish outside the UI project: $path"
    }
}
if (-not (Test-Path -LiteralPath $stagingExe -PathType Leaf)) {
    throw "Portable build artifact was not created: $stagingExe"
}

New-Item -ItemType Directory -Path $finalDir -Force | Out-Null
$deadline = [DateTime]::UtcNow.AddSeconds(15)
do {
    try {
        Copy-Item -LiteralPath $stagingExe -Destination $finalExe -Force
        break
    }
    catch [System.IO.IOException] {
        if ([DateTime]::UtcNow -ge $deadline) {
            throw "The existing portable EXE is still locked: $finalExe"
        }
        Start-Sleep -Milliseconds 250
    }
} while ($true)

Write-Host "Published portable EXE: $finalExe"
