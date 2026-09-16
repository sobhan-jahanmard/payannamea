param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$FontName
)

$word = $null; $document = $null
try {
  $word = New-Object -ComObject Word.Application; $word.Visible = $false; $word.DisplayAlerts = 0
  # PAGE is a standalone field and needs an explicit numeral mode; contextual
  # mode is insufficient and was the reason a structurally valid footer could
  # still render a Western digit in the final PDF.
  $word.Options.ArabicNumeral = 1 # wdNumeralHindi
  $document = $word.Documents.Open($Path, $false, $true); $document.Fields.Update(); $document.Repaginate()
  $pageCount = $document.ComputeStatistics(2); $sections = @($document.Sections); $errors = @()
  if (-not $document.EmbedTrueTypeFonts) { $errors += 'The document font is not embedded in the DOCX.' }
  foreach ($section in $sections) {
    $footer = $section.Footers(1)
    $pageField = @($footer.Range.Fields | Where-Object { $_.Type -eq 33 }) | Select-Object -First 1
    if ($null -eq $pageField) { $errors += "section $($section.Index) has no dynamic PAGE field"; continue }
    if ($pageField.ShowCodes) { $errors += "section $($section.Index) PAGE field displays its code instead of its result" }
    if ($pageField.Result.Font.Name -ne $FontName -or $pageField.Result.Font.NameBi -ne $FontName) {
      $errors += "section $($section.Index) PAGE field does not use the required Persian font"
    }
    if ($footer.Range.ParagraphFormat.ReadingOrder -ne 0 -or $footer.Range.ParagraphFormat.Alignment -ne 1) {
      $errors += "section $($section.Index) footer is not centred RTL"
    }
  }
  # Confirm that every rendered physical page belongs to a section carrying
  # the same dynamic field; edits can reflow pages without invalidating it.
  for ($page = 2; $page -le $pageCount; $page++) {
    $pageRange = $document.GoTo(1, 1, $page)
    $owner = $sections | Where-Object { $_.Range.Start -le $pageRange.Start } | Sort-Object { $_.Range.Start } -Descending | Select-Object -First 1
    if ($null -eq $owner -or @($owner.Footers(1).Range.Fields | Where-Object { $_.Type -eq 33 }).Count -ne 1) { $errors += "page $page has no dynamic PAGE footer" }
  }
  [Console]::WriteLine("pages=$pageCount;sections=$($sections.Count);errors=$($errors.Count);mode=dynamic_persian_page_field_hindi_numerals")
  if ($errors.Count) { $errors | Select-Object -First 20 | ForEach-Object { [Console]::WriteLine($_) }; exit 2 }
} finally {
  if ($document) { $document.Close($false); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
  if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
