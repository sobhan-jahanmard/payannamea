param([Parameter(Mandatory = $true)][string]$Path)

. "$PSScriptRoot\user_fonts.ps1"
$loadedFonts = @(Register-WorkerUserFonts)
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.Options.ArabicNumeral = 1
  $document = $word.Documents.Open($Path, $false, $true)
  $document.Repaginate()
  [Console]::WriteLine($document.ComputeStatistics(2))
} finally {
  if ($document) { $document.Close($false); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
  if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
  Unregister-WorkerUserFonts $loadedFonts
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
