param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$FontName
)

$ErrorActionPreference = "Stop"
$word = $null
$document = $null
$stage = "start"
try {
  $stage = "create Word application"
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.ScreenUpdating = $false
  # A PAGE field is a standalone number, so context mode can render it as 4.
  # Hindi numeral mode makes Word paint it as ۴ during this final PDF export.
  $word.Options.ArabicNumeral = 1 # wdNumeralHindi
  $stage = "open DOCX"
  # Open writable in memory. Word may reject Font.NameBi on the main story of a
  # read-only document, silently leaving Calibri/Cambria in the exported PDF.
  # Close(false) below guarantees the source DOCX is not overwritten.
  $document = $word.Documents.Open($Path, $false, $false, $false)
  # The exporter runs in a separate Word process. Reapply the DOCX's intended
  # complex-script font to every story (body, headers, footers, notes, and text
  # boxes) immediately before fixed-format conversion. NameBi is what Word uses
  # for Persian glyphs; leaving it inherited is why the PDF could differ while
  # the opened DOCX looked correct.
  $stage = "apply story fonts"
  foreach ($initialStory in @($document.StoryRanges)) {
    $story = $initialStory
    while ($null -ne $story) {
      $nextStory = $null
      try { $nextStory = $story.NextStoryRange } catch { $nextStory = $null }
      try {
        $story.Font.NameBi = $FontName
        $story.Font.NameFarEast = $FontName
      } catch {
        # Word exposes a few generated/protected story ranges that reject font
        # mutation with 0x800A16D4. Their underlying paragraph/run formatting
        # was already applied while packaging; skip only that inaccessible range.
        Write-Output ("Skipped inaccessible story range type {0}: {1}" -f $story.StoryType, $_.Exception.Message)
      }
      $story = $nextStory
    }
  }
  $stage = "update fields"
  $document.Fields.Update()
  $stage = "repaginate"
  $document.Repaginate()
  # PAGE's field update restores its merge-format font. Reapply the required
  # Persian font after updating, immediately before PDF rendering.
  $stage = "apply page-number font"
  foreach ($section in $document.Sections) {
    foreach ($footer in @($section.Footers(1), $section.Footers(2), $section.Footers(3))) {
      foreach ($field in @($footer.Range.Fields | Where-Object { $_.Type -eq 33 })) {
        $field.Result.Font.Name = $FontName
        $field.Result.Font.NameBi = $FontName
      }
    }
  }
  # BitmapMissingFonts must remain false: a raster fallback hides the missing
  # font problem and produces a PDF whose typography differs from the DOCX.
  try {
    $stage = "ExportAsFixedFormat"
    $document.ExportAsFixedFormat($OutputPath, 17, $false, 0, 0, 0, 0, 0, $true, $true, 1, $true, $false, $false) # wdExportFormatPDF
  } catch {
    # Some Word builds intermittently reject ExportAsFixedFormat with
    # 0x800A16D4 even though the document can be converted normally.  Saving a
    # read-only in-memory document as a PDF is an independent Word conversion
    # path and avoids turning that transient COM state into an order failure.
    if (Test-Path -LiteralPath $OutputPath) {
      Remove-Item -LiteralPath $OutputPath -Force
    }
    $stage = "SaveAs2 PDF fallback"
    $document.SaveAs2($OutputPath, 17) # wdFormatPDF
  }
} catch {
  Write-Error ("Word PDF stage '{0}' failed: {1}" -f $stage, $_.Exception.Message)
  throw
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
