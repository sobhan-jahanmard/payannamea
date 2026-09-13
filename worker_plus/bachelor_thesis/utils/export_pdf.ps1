param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.ScreenUpdating = $false
  $document = $word.Documents.Open($Path, $false, $true, $false)
  $document.Fields.Update()
  $document.Repaginate()
  $document.ExportAsFixedFormat($OutputPath, 17) # wdExportFormatPDF
} finally {
  if ($document) {
    $document.Close($false)
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
  }
  if ($word) {
    $word.Quit()
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
