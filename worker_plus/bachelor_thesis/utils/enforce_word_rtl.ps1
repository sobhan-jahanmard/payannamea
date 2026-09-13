param(
  [Parameter(Mandatory = $true)][string]$Path,
  [switch]$AuditOnly
)

# python-docx writes the correct OOXML flags, but some Word installations inherit
# an LTR direct format when opening a generated file.  This final pass uses Word's
# own object model so the toolbar state is truly RTL/Align Right in Word itself.
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  # Context uses Persian-shaped digits inside an RTL Persian footer while leaving
  # English content elsewhere in Word unchanged.
  $word.Options.ArabicNumeral = 2
  $document = $word.Documents.Open($Path, $false, $false)

  $right = 0
  $center = 0
  $left = 0
  # Snapshot paragraph ranges first.  Word's live Paragraphs collection can skip
  # most entries while its format is being changed.
  $paragraphs = @()
  foreach ($paragraph in $document.Paragraphs) {
    $text = $paragraph.Range.Text.Trim([char]13, [char]7, ' ')
    if ($text -notmatch '\p{IsArabic}') { continue }
    $paragraphs += [PSCustomObject]@{
      Start = $paragraph.Range.Start
      End = $paragraph.Range.End
      Centered = ($paragraph.Alignment -eq 1)
      Justified = ($paragraph.Alignment -eq 3)
    }
  }

  foreach ($saved in $paragraphs) {
    # Existing centred title/table-header paragraphs stay centred and body
    # prose stays justified. Word constants: RTL = 0, right = 2, justify = 3.
    if (-not $AuditOnly) {
      $range = $document.Range($saved.Start, $saved.End)
      $range.ParagraphFormat.ReadingOrder = 0
      $range.ParagraphFormat.Alignment = if ($saved.Centered) { 1 } elseif ($saved.Justified) { 3 } else { 2 }
    }
  }
  if (-not $AuditOnly) {
    foreach ($section in $document.Sections) {
      foreach ($footer in @($section.Footers(1), $section.Footers(2), $section.Footers(3))) {
        if ($footer.Exists) {
          $footer.Range.ParagraphFormat.ReadingOrder = 0
          $footer.Range.ParagraphFormat.Alignment = 1
          # Keep the field's document style neutral.  Persian glyph selection
          # comes from Word's Numerals preference, set above to wdNumeralHindi.
          $footer.Range.LanguageID = 1065
          [void]$footer.Range.Fields.Update()
        }
      }
    }
    $document.Save()
    $document.Repaginate()
  }

  foreach ($saved in $paragraphs) {
    $range = $document.Range($saved.Start, $saved.End)
    if ($range.ParagraphFormat.Alignment -in @(2, 3) -and $range.ParagraphFormat.ReadingOrder -eq 0) { $right++ }
    elseif ($range.ParagraphFormat.Alignment -eq 1 -and $range.ParagraphFormat.ReadingOrder -eq 0) { $center++ }
    else { $left++ }
  }
  [Console]::WriteLine("$right,$center,$left")
} finally {
  if ($document) { $document.Close($false); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
  if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
