param([string]$SkillRoot)
$ErrorActionPreference = 'Stop'
if (-not $SkillRoot) {
    $codexBase = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
    $SkillRoot = Join-Path $codexBase 'skills'
}
New-Item -ItemType Directory -Path $SkillRoot -Force | Out-Null
$skillNames = Get-ChildItem -LiteralPath $PSScriptRoot -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') } |
    Select-Object -ExpandProperty Name
foreach ($name in $skillNames) {
    $source = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot $name)).Path
    $destination = Join-Path $SkillRoot $name
    if (Test-Path -LiteralPath $destination) {
        $item = Get-Item -LiteralPath $destination -Force
        if ($item.LinkType -ne 'Junction' -or [string]$item.Target -ne $source) {
            throw "An existing skill occupies $destination; it was not changed."
        }
        Write-Output "Already installed: $destination"
    } else {
        New-Item -ItemType Junction -Path $destination -Target $source | Out-Null
        Write-Output "Installed: $destination -> $source"
    }
}
