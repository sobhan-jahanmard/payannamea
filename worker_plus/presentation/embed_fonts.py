"""Embed fonts through PowerPoint in a separate owned document."""
from pathlib import Path
import sys
import zipfile


def embed(path, family):
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    owned, document = False, None
    temporary = path.with_name(path.stem + ".embedded.pptx")
    try:
        try:
            app = win32com.client.GetActiveObject("PowerPoint.Application")
        except Exception:
            app = win32com.client.DispatchEx("PowerPoint.Application")
            owned = True
        try:
            document = app.Presentations.Open(str(path.resolve()), ReadOnly=True, Untitled=False, WithWindow=False)
            document.SaveAs(str(temporary.resolve()), 24, -1)
        finally:
            if document is not None:
                document.Close()
            if owned:
                app.Quit()
        with zipfile.ZipFile(temporary) as package:
            from lxml import etree
            root = etree.fromstring(package.read("ppt/presentation.xml"))
            fonts = root.xpath('//*[local-name()="embeddedFont"]')
            if not any(node.xpath('./*[local-name()="font"]/@typeface') == [family] and node.xpath('./*[local-name()="regular"]') for node in fonts):
                raise RuntimeError("PowerPoint did not embed the selected presentation font")
        temporary.replace(path)
    finally:
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    embed(Path(sys.argv[1]), sys.argv[2])
