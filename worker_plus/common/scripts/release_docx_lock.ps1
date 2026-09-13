param([Parameter(Mandatory = $true)][string]$Path)

# Release only a Word document matching this exact generated artifact.  This
# deliberately does not terminate unrelated Word sessions or user documents.
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class WordDocumentLockRelease {
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

$normalizedPath = [IO.Path]::GetFullPath($Path)
foreach ($document in [WordDocumentLockRelease]::FindByPath($normalizedPath)) {
  try {
    $application = $document.Application
    $document.Saved = $true
    $document.Close(0)
    if ($application.Documents.Count -eq 0) { $application.Quit() }
  } finally {
    if ($application) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application) }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
  }
}
