"""Read bookmarks' physical pages and render one owned source document in Word."""
from __future__ import annotations

import json
from pathlib import Path
import sys


def paginate(docx: Path, pdf: Path, output: Path):
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    owned = False
    document = None
    try:
        try:
            word = win32com.client.GetActiveObject("Word.Application")
        except Exception:
            word = win32com.client.DispatchEx("Word.Application")
            owned = True
        alerts = word.DisplayAlerts
        try:
            word.DisplayAlerts = 0
            document = word.Documents.Open(str(docx.resolve()), ReadOnly=True, AddToRecentFiles=False, Visible=False)
            document.Repaginate()
            pages = {}
            for bookmark in document.Bookmarks:
                if not bookmark.Name.startswith("WPSource_"):
                    continue
                span = bookmark.Range
                start, end = span.Duplicate, span.Duplicate
                start.Collapse(1)
                end.End = max(span.Start, span.End - 1)
                end.Collapse(0)
                first, last = int(start.Information(3)), int(end.Information(3))
                if first < 1 or last < first:
                    raise ValueError(f"Invalid physical page range for {bookmark.Name}")
                pages[bookmark.Name] = list(range(first, last + 1))
            document.ExportAsFixedFormat(str(pdf.resolve()), 17, OpenAfterExport=False)
            output.write_text(json.dumps({"bookmarks": pages, "page_count": int(document.ComputeStatistics(2)),
                                         "engine": "Microsoft Word", "page_numbering": "physical_from_file_start"}), encoding="utf-8")
        finally:
            if document is not None:
                document.Close(False)
            word.DisplayAlerts = alerts
            if owned:
                word.Quit()
    finally:
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    paginate(*(Path(value) for value in sys.argv[1:4]))
