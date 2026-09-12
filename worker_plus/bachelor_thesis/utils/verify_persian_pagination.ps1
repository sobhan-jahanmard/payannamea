param([Parameter(Mandatory = $true)][string]$Path)

$fontPath = Join-Path $PSScriptRoot "..\assets\fonts\PersianPagerNumber-Regular.ttf"
if (-not (Test-Path -LiteralPath $fontPath)) { throw "Persian page-number font is missing" }
Add-Type @'
using System.Runtime.InteropServices;
public static class PersianPageNumberVerifierFont {
  [DllImport("gdi32.dll", SetLastError=true)] public static extern int AddFontResource(string path);
}
'@
[void][PersianPageNumberVerifierFont]::AddFontResource($fontPath)

$word = $null; $document = $null
try {
  $word = New-Object -ComObject Word.Application; $word.Visible = $false; $word.DisplayAlerts = 0
  $document = $word.Documents.Open($Path, $false, $true); $document.Fields.Update(); $document.Repaginate()
  $pageCount = $document.ComputeStatistics(2); $sections = @($document.Sections); $errors = @()
  if (-not $document.EmbedTrueTypeFonts) { $errors += 'The Persian page-number font is not embedded in the DOCX.' }
  foreach ($section in $sections) {
    $footer = $section.Footers(1)
    $pageField = @($footer.Range.Fields | Where-Object { $_.Type -eq 33 }) | Select-Object -First 1
    if ($null -eq $pageField) { $errors += "section $($section.Index) has no dynamic PAGE field"; continue }
    if ($pageField.ShowCodes) { $errors += "section $($section.Index) PAGE field displays its code instead of its result" }
    if ($pageField.Result.Font.Name -ne 'Persian Pager Number' -or $pageField.Result.Font.NameBi -ne 'Persian Pager Number') {
      $errors += "section $($section.Index) PAGE field does not use the embedded Persian-digit font"
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
  [Console]::WriteLine("pages=$pageCount;sections=$($sections.Count);errors=$($errors.Count);mode=dynamic_persian_page_field")
  if ($errors.Count) { $errors | Select-Object -First 20 | ForEach-Object { [Console]::WriteLine($_) }; exit 2 }
} finally { if ($document) { $document.Close($false) }; if ($word) { $word.Quit() } }
