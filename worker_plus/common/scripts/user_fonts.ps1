# Word COM does not always discover fonts registered only for the current user.
# Make them available to the Word process for the lifetime of the caller.
Add-Type -MemberDefinition @'
[DllImport("gdi32.dll", CharSet=CharSet.Unicode)]
public static extern int AddFontResource(string path);
[DllImport("gdi32.dll", CharSet=CharSet.Unicode)]
public static extern bool RemoveFontResource(string path);
'@ -Name SessionFonts -Namespace WorkerPlus

function Register-WorkerUserFonts {
  $loaded = @()
  $registry = Get-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts' -ErrorAction SilentlyContinue
  if (-not $registry) { return $loaded }
  foreach ($entry in $registry.PSObject.Properties) {
    if ($entry.Name -notlike '* (TrueType)') { continue }
    $fontPath = [string]$entry.Value
    if (-not [System.IO.Path]::IsPathRooted($fontPath)) {
      $fontPath = Join-Path "$env:LOCALAPPDATA\Microsoft\Windows\Fonts" $fontPath
    }
    if ((Test-Path -LiteralPath $fontPath) -and [WorkerPlus.SessionFonts]::AddFontResource($fontPath) -gt 0) {
      $loaded += $fontPath
    }
  }
  return $loaded
}

function Unregister-WorkerUserFonts($loaded) {
  foreach ($fontPath in $loaded) {
    [void][WorkerPlus.SessionFonts]::RemoveFontResource($fontPath)
  }
}
