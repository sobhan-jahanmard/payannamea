param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
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
  $start = $source.GoTo(1, 1, 1).Start # wdGoToPage, wdGoToAbsolute
  $end = if ($samplePages -ge $pages) { $source.Content.End } else { $source.GoTo(1, 1, $samplePages + 1).Start }
  $sample = $word.Documents.Add()
  $sourceRange = $source.Range($start, $end)
  $sample.Range(0, 0).FormattedText = $sourceRange.FormattedText

  # Retain the thesis page geometry and footer/header behavior for the excerpt.
  $from = $source.Sections.Item(1)
  $to = $sample.Sections.Item(1)
  $to.PageSetup.TopMargin = $from.PageSetup.TopMargin
  $to.PageSetup.BottomMargin = $from.PageSetup.BottomMargin
  $to.PageSetup.LeftMargin = $from.PageSetup.LeftMargin
  $to.PageSetup.RightMargin = $from.PageSetup.RightMargin
  $to.PageSetup.HeaderDistance = $from.PageSetup.HeaderDistance
  $to.PageSetup.FooterDistance = $from.PageSetup.FooterDistance
  $to.Headers.Item(1).Range.FormattedText = $from.Headers.Item(1).Range.FormattedText
  $to.Footers.Item(1).Range.FormattedText = $from.Footers.Item(1).Range.FormattedText
  $sample.Fields.Update()
  $sample.SaveAs2($OutputPath, 16) # wdFormatDocumentDefault (.docx)
  Write-Output "$pages,$samplePages"
}
finally {
  if ($sample) { $sample.Close($false) }
  if ($source) { $source.Close($false) }
  if ($word) { $word.Quit() }
  foreach ($object in @($sample, $source, $word)) {
    if ($object) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($object) }
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
