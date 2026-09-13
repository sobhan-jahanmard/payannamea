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
  # PAGE is evaluated again in this separate Word process. The footer range is
  # explicitly fa-IR/RTL, so context mode renders its digits in Persian form.
  $word.Options.ArabicNumeral = 2 # wdNumeralContext
  $document = $word.Documents.Open($Path, $false, $true, $false)
  $document.Fields.Update()
  $document.Repaginate()
  # PAGE's field update restores its merge-format font. Reapply the local
  # digit-substitution font after updating, immediately before PDF rendering.
  foreach ($section in $document.Sections) {
    foreach ($footer in @($section.Footers(1), $section.Footers(2), $section.Footers(3))) {
      foreach ($field in @($footer.Range.Fields | Where-Object { $_.Type -eq 33 })) {
        $field.Result.Font.Name = 'Persian Pager Number'
        $field.Result.Font.NameBi = 'Persian Pager Number'
      }
    }
  }
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
