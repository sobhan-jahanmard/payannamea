param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$FontName
)

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class RunningWordDocuments {
  [DllImport("ole32.dll")] private static extern int GetRunningObjectTable(int reserved, out IRunningObjectTable table);
  [DllImport("ole32.dll")] private static extern int CreateBindCtx(int reserved, out IBindCtx context);
  public static object[] FindByPath(string path) {
    IRunningObjectTable table; IBindCtx context;
    if (GetRunningObjectTable(0, out table) != 0 || CreateBindCtx(0, out context) != 0) return new object[0];
    IEnumMoniker enumerator; table.EnumRunning(out enumerator);
    var matches = new List<object>(); var monikers = new IMoniker[1];
    while (enumerator.Next(1, monikers, IntPtr.Zero) == 0) {
      try {
        string name; monikers[0].GetDisplayName(context, null, out name);
        if (name != null && name.IndexOf(path, StringComparison.OrdinalIgnoreCase) >= 0) {
          object value; table.GetObject(monikers[0], out value); if (value != null) matches.Add(value);
        }
      } catch { } finally { monikers[0] = null; }
    }
    return matches.ToArray();
  }
}
'@

function Close-PreviousDocumentInstance([string]$DocumentPath) {
  $normalizedPath = [IO.Path]::GetFullPath($DocumentPath)
  foreach ($existingDocument in [RunningWordDocuments]::FindByPath($normalizedPath)) {
    try {
      $application = $existingDocument.Application
      # The runner owns prior instances of this exact artifact. Discarding their
      # unsaved in-memory state prevents Word's File In Use UI from surfacing.
      $existingDocument.Saved = $true
      $existingDocument.Close(0)
      if ($application.Documents.Count -eq 0) { $application.Quit() }
    } finally {
      [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($existingDocument)
    }
  }
}

function Set-DocumentDigitLanguageToPersian($Document) {
  # This is the Word UI equivalent of Home > Replace > Special > Any Digit,
  # then Replace formatting > Language > Persian > Replace All. It changes only
  # the language formatting of digit characters, leaving PAGE fields dynamic.
  # Document.Content intentionally covers every text range, just like Select All.
  $find = $Document.Content.Duplicate.Find
  $find.ClearFormatting()
  $find.Replacement.ClearFormatting()
  $find.Text = '^#' # Word's "Any Digit" special-find token
  # Empty "Replace with" plus a replacement format is Word's formatting-only
  # Replace All mode (the exact setting used in the Word dialog).
  $find.Replacement.Text = ''
  $find.Replacement.LanguageID = 1065 # Persian (fa-IR)
  $find.Forward = $true
  $find.Wrap = 1 # wdFindContinue: search the entire document
  $find.Format = $true
  $find.MatchWildcards = $false
  [void]$find.Execute($null, $null, $null, $null, $null, $null, $true, 0, $false, $null, 2) # wdReplaceAll
}

function Set-PageFieldFont($Document, [string]$FontName) {
  # PAGE updates restore MERGEFORMAT's original B Nazanin font. Apply the
  # digit-substitution font only after the final update, so ASCII PAGE values
  # are painted with Persian glyphs in both DOCX and PDF.
  foreach ($section in $Document.Sections) {
    foreach ($footer in @($section.Footers(1), $section.Footers(2), $section.Footers(3))) {
      foreach ($field in @($footer.Range.Fields | Where-Object { $_.Type -eq 33 })) {
        $field.Result.Font.Name = $FontName
        $field.Result.Font.NameBi = $FontName
        $field.Result.Font.Size = 12
        $field.Result.Font.SizeBi = 12
      }
    }
  }
}

Close-PreviousDocumentInstance $Path

$word = $null; $document = $null
try {
  $word = New-Object -ComObject Word.Application; $word.Visible = $false; $word.DisplayAlerts = 0
  $word.ScreenUpdating = $false
  # Use contextual numerals only after assigning fa-IR directly to the rebuilt
  # footer and PAGE range below. This preserves Persian glyphs without changing
  # Latin numbers in a DOI/URL elsewhere in the document.
  $word.Options.ArabicNumeral = 2 # wdNumeralContext
  $word.Options.UpdateFieldsAtPrint = $true
  # Word stays invisible at the application level. The targeted ROT cleanup
  # above removes only a prior instance of this document before opening it.
  # Passing the long optional-argument form causes a NullReferenceException
  # in some installed Word COM versions, so use the compatible core overload.
  $document = $word.Documents.Open($Path, $false, $false, $false)
  # Field-code visibility is sticky in Word and can otherwise make the footer
  # display `{ PAGE \* MERGEFORMAT }` instead of the computed page number.
  if ($document.ActiveWindow) { $document.ActiveWindow.View.ShowFieldCodes = $false }
  $document.EmbedTrueTypeFonts = $true
  # Embedding every complete font can push the multipart publish request above
  # Vercel's function payload limit. Keep the document portable while embedding
  # only the glyphs that the generated thesis actually uses.
  $document.SaveSubsetFonts = $true
  $pageNumberFont = 'Persian Pager Number'
  # Word chooses the shape of a PAGE result from its character style, not
  # reliably from direct font formatting alone. This mirrors the manual Word
  # fix: make a character style whose Latin and complex-script fonts are both
  # Persian, then assign it to every PAGE field.
  $pageNumberStyleName = 'Persian Page Number'
  try { $pageNumberStyle = $document.Styles.Item($pageNumberStyleName) }
  catch { $pageNumberStyle = $document.Styles.Add($pageNumberStyleName, 2) } # wdStyleTypeCharacter
  $pageNumberStyle.Font.Name = $pageNumberFont
  $pageNumberStyle.Font.NameBi = $pageNumberFont
  foreach ($section in $document.Sections) {
    foreach ($footer in @($section.Footers(1), $section.Footers(2), $section.Footers(3))) {
      $footer.LinkToPrevious = $false
      $range = $footer.Range; $range.Text = ''
      $insertAt = $footer.Range.Duplicate; $insertAt.SetRange($footer.Range.End - 1, $footer.Range.End - 1)
      $pageField = $insertAt.Fields.Add($insertAt, 33) # wdFieldPage
      $pageField.Result.Style = $pageNumberStyleName
      $pageField.Result.Font.Name = $pageNumberFont; $pageField.Result.Font.NameBi = $pageNumberFont
      $pageField.Result.Font.Size = 12; $pageField.Result.Font.SizeBi = 12
      $pageField.Result.LanguageID = 1065 # Persian (fa-IR)
      $footer.Range.Font.Name = $FontName; $footer.Range.Font.NameBi = $FontName
      $footer.Range.LanguageID = 1065 # Persian (fa-IR)
      $footer.Range.ParagraphFormat.ReadingOrder = 0; $footer.Range.ParagraphFormat.Alignment = 1
      $pageField.ShowCodes = $false
    }
  }
  $document.Fields.Update(); $document.Repaginate()
  Set-DocumentDigitLanguageToPersian $document
  Set-PageFieldFont $document $pageNumberFont
  foreach ($field in $document.Fields) { $field.ShowCodes = $false }
  $document.Save()
  [Console]::WriteLine("pages=$($document.ComputeStatistics(2));sections=$($document.Sections.Count);mode=dynamic_persian_page_field")
} finally {
  if ($document) { $document.Close($false); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
  if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
