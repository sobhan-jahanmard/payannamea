"""Invoked in a bounded subprocess by deck.render_powerpoint."""
from pathlib import Path
import sys


def main():
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    app, document, owns_app = None, None, False
    try:
        try:
            # PowerPoint can be a singleton despite DispatchEx. Never quit an
            # existing instance or change its global alert/visibility settings.
            app = win32com.client.GetActiveObject("PowerPoint.Application")
        except pythoncom.com_error:
            app = win32com.client.DispatchEx("PowerPoint.Application")
            owns_app = True
        document = app.Presentations.Open(str(Path(sys.argv[1]).resolve()), ReadOnly=True, Untitled=False, WithWindow=False)
        # SaveAs(ppSaveAsPDF=32) avoids pywin32's ambiguous optional PrintRange.
        document.SaveAs(str(Path(sys.argv[2]).resolve()), 32)
    finally:
        if document is not None:
            document.Close()
        if app is not None and owns_app:
            app.Quit()
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    main()
