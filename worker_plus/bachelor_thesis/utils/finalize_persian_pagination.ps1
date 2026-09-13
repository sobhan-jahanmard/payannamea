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

Close-PreviousDocumentInstance $Path

$word = $null; $document = $null
try {
  $word = New-Object -ComObject Word.Application; $word.Visible = $false; $word.DisplayAlerts = 0
  $word.ScreenUpdating = $false
  $word.Options.ArabicNumeral = 2
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
  foreach ($section in $document.Sections) {
    foreach ($footer in @($section.Footers(1), $section.Footers(2), $section.Footers(3))) {
      $footer.LinkToPrevious = $false
      $range = $footer.Range; $range.Text = ''
      $insertAt = $footer.Range.Duplicate; $insertAt.SetRange($footer.Range.End - 1, $footer.Range.End - 1)
      $pageField = $insertAt.Fields.Add($insertAt, 33) # wdFieldPage
      $pageField.ShowCodes = $false
      $pageField.Result.Font.Name = $FontName; $pageField.Result.Font.NameBi = $FontName
      $pageField.Result.Font.Size = 12; $pageField.Result.Font.SizeBi = 12
      $footer.Range.Font.Name = $FontName; $footer.Range.Font.NameBi = $FontName
      $footer.Range.ParagraphFormat.ReadingOrder = 0; $footer.Range.ParagraphFormat.Alignment = 1
    }
  }
  $document.Fields.Update(); $document.Repaginate()
  foreach ($field in $document.Fields) { $field.ShowCodes = $false }
  $document.Save()
  [Console]::WriteLine("pages=$($document.ComputeStatistics(2));sections=$($document.Sections.Count);mode=dynamic_persian_page_field")
} finally {
  if ($document) { $document.Close($false); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
  if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
