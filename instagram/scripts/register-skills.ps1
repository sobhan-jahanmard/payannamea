$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $repoRoot 'instagram/skills')).Path
$discoveryRoot = Join-Path $repoRoot '.agents/skills'
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'instagram/research/skill-upstream.json') -Raw | ConvertFrom-Json
$names = @($manifest.skill_paths | ForEach-Object { Split-Path -Leaf $_ })
if ($names.Count -ne 13) { throw 'Expected 13 pinned Instagram skill folders.' }
New-Item -ItemType Directory -Path $discoveryRoot -Force | Out-Null
foreach ($name in $names) {
    if ($name -notmatch '^ig-[a-z-]+$') { throw "Unexpected skill name: $name" }
    $source = (Resolve-Path -LiteralPath (Join-Path $sourceRoot $name)).Path
    if (-not $source.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Skill path escapes Instagram folder: $name"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $source 'SKILL.md'))) { throw "Missing SKILL.md: $name" }
    $linkPath = Join-Path $discoveryRoot $name
    if (Test-Path -LiteralPath $linkPath) {
        $existing = Get-Item -LiteralPath $linkPath -Force
        if ($existing.LinkType -ne 'Junction' -or @($existing.Target).Count -ne 1 -or
            -not [String]::Equals([IO.Path]::GetFullPath($existing.Target[0]), $source, [StringComparison]::OrdinalIgnoreCase)) {
            throw "An unrelated entry already exists: $linkPath"
        }
    } else {
        New-Item -ItemType Junction -Path $linkPath -Target $source | Out-Null
    }
    Write-Output "Registered $name"
}
