$ErrorActionPreference = "Stop"

$uiRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$lockPath = Join-Path $uiRoot ".portable-build.lock"
try {
    $buildLock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
}
catch [System.IO.IOException] {
    throw "Another Worker Plus portable build is already running. Wait for it to finish before starting a new build."
}

$stagingName = "release-portable-staging-{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $PID
$stagingDir = [System.IO.Path]::GetFullPath((Join-Path $uiRoot $stagingName))
$expectedPrefix = $uiRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

if (-not $stagingDir.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to build outside the UI project: $stagingDir"
}

try {
    & (Join-Path $PSScriptRoot "prepare-portable-build.ps1")

    Push-Location $uiRoot
    try {
        & npx.cmd tsc -p tsconfig.electron.json
        if ($LASTEXITCODE -ne 0) { throw "Electron TypeScript compilation failed with exit code $LASTEXITCODE" }

        & npx.cmd vite build
        if ($LASTEXITCODE -ne 0) { throw "Vite build failed with exit code $LASTEXITCODE" }

        & npx.cmd electron-builder --win portable "--config.directories.output=$stagingName" --config.win.signAndEditExecutable=false
        if ($LASTEXITCODE -ne 0) { throw "electron-builder failed with exit code $LASTEXITCODE" }

        & (Join-Path $PSScriptRoot "publish-portable-build.ps1") -StagingDirectory $stagingDir
    }
    finally {
        Pop-Location
    }

    try {
        Remove-Item -LiteralPath $stagingDir -Recurse -Force -ErrorAction Stop
    }
    catch {
        Write-Warning "The staging directory is temporarily locked and was left in place: $stagingDir"
    }
}
finally {
    $buildLock.Dispose()
}
