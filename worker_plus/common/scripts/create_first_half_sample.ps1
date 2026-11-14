param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\user_fonts.ps1"
$loadedFonts = @(Register-WorkerUserFonts)
$word = $null
$source = $null
$sample = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $source = $word.Documents.Open($Path, $false, $true, $false)
  $source.Repaginate()
  $pages = [int]$source.ComputeStatistics(2) # wdStatisticPages
  if ($pages -lt 2) { throw "A first-half sample requires at least two pages." }
  $samplePages = [math]::Ceiling($pages / 2.0)
  $end = if ($samplePages -ge $pages) { $source.Content.End } else { $source.GoTo(1, 1, $samplePages + 1).Start }

  # Do not paste the excerpt into a blank LTR Word document. A blank document
  # loses the source's styles, section settings, RTL defaults, headers, footers,
  # numbering, and document-level layout. Start with an exact Word copy, then
  # remove only the content after the selected excerpt.
  if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }
  # SaveCopyAs fails on some customer documents with Word COM error 0x800A1704.
  # A filesystem copy is byte-for-byte identical and avoids that unsupported
  # save path; Word is only needed to trim the copied document afterward.
  Copy-Item -LiteralPath $Path -Destination $OutputPath -Force
  $sample = $word.Documents.Open($OutputPath, $false, $false, $false)
  # Preserve the rendered page references before trimming their targets.
  # Updating live PAGEREF fields after trimming prints Bookmark errors and
  # changes the excerpt's pagination. The original remains fully dynamic.
  for ($i = $sample.Fields.Count; $i -ge 1; $i--) {
    $field = $sample.Fields.Item($i)
    if ($field.Type -eq 37) { $field.Unlink() } # wdFieldPageRef
  }
  # Unlinking fields changes character positions even though the visible
  # layout is unchanged. Locate the page boundary in the copied document.
  $sample.Repaginate()
  $end = if ($samplePages -ge $pages) { $sample.Content.End } else { $sample.GoTo(1, 1, $samplePages + 1).Start }
  if ($end -lt $sample.Content.End) {
    $sample.Range($end, $sample.Content.End).Delete()
  }
  # An index entry for a later full-document section keeps its printed page
  # number, but cannot remain a broken clickable link in this excerpt.
  for ($i = $sample.Hyperlinks.Count; $i -ge 1; $i--) {
    $link = $sample.Hyperlinks.Item($i)
    if ($link.SubAddress -and -not $sample.Bookmarks.Exists($link.SubAddress)) {
      $link.Delete()
    }
  }
  $sample.Repaginate()
  $sample.Fields.Update()
  $sample.Save()
  Write-Output "$pages,$samplePages"
}
finally {
  if ($sample) { $sample.Close($false) }
  if ($source) { $source.Close($false) }
  if ($word) { $word.Quit() }
  foreach ($object in @($sample, $source, $word)) {
    if ($object) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($object) }
  }
  Unregister-WorkerUserFonts $loadedFonts
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
