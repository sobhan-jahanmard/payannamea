param([Parameter(Mandatory = $true)][string]$Path)

$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($Path, $false, $true)
  [Console]::WriteLine($document.ComputeStatistics(2))
} finally {
  if ($document) { $document.Close($false); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
  if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
