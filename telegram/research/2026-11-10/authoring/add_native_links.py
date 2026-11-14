"""Attach native Excel links after the artifact-tool export.

The bundled renderer cannot evaluate HYPERLINK formulas. Keep the rendered
cell values and add standard external hyperlink relationships to the file.
"""
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile

SHEET = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
OFFICE_RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PACKAGE_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'

def tag(namespace, name):
    return f'{{{namespace}}}{name}'

def links_for(records):
    for row, rec in enumerate(records, 9):
        fields = [('C', rec['url']), ('P', rec['source_url']), ('T', rec['discovery_url'])]
        if not rec['exclusion_reason']:
            fields.append(('H', rec['contact_url']))
        for column, url in fields:
            if url and urlsplit(url).scheme == 'https':
                yield f'{column}{row}', url

def patch_links(xlsx, directory):
    replacements = {}
    buckets = ['استعلام تبلیغ', 'نیازمند بررسی', 'کنارگذاشته']
    counts = []
    with ZipFile(xlsx) as original:
        for index, bucket in enumerate(buckets, 1):
            entries = [r for r in directory['records'] if r['bucket'] == bucket]
            sheet_path = f'xl/worksheets/sheet{index}.xml'
            rel_path = f'xl/worksheets/_rels/sheet{index}.xml.rels'
            sheet = ET.fromstring(original.read(sheet_path))
            rels = ET.fromstring(original.read(rel_path))
            hyperlink_block = ET.Element(tag(SHEET, 'hyperlinks'))
            before = {'printOptions','pageMargins','pageSetup','headerFooter','rowBreaks',
                      'colBreaks','customProperties','cellWatches','ignoredErrors','smartTags',
                      'drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects',
                      'controls','webPublishItems','tableParts','extLst'}
            position = next((i for i,c in enumerate(sheet) if c.tag.split('}')[-1] in before), len(sheet))
            sheet.insert(position, hyperlink_block)
            for serial, (cell, url) in enumerate(links_for(entries), 1):
                rel_id = f'rIdDaneshyarWeb{serial}'
                ET.SubElement(hyperlink_block, tag(SHEET, 'hyperlink'),
                              {'ref':cell,tag(OFFICE_RELS,'id'):rel_id})
                ET.SubElement(rels, tag(PACKAGE_RELS, 'Relationship'),
                              {'Id':rel_id,'Type':OFFICE_RELS+'/hyperlink',
                               'Target':url,'TargetMode':'External'})
            counts.append(len(hyperlink_block))
            ET.register_namespace('', SHEET)
            ET.register_namespace('r', OFFICE_RELS)
            replacements[sheet_path] = ET.tostring(sheet, encoding='utf-8', xml_declaration=True)
            ET.register_namespace('', PACKAGE_RELS)
            replacements[rel_path] = ET.tostring(rels, encoding='utf-8', xml_declaration=True)
        temporary = xlsx.with_suffix('.tmp.xlsx')
        with ZipFile(temporary, 'w') as output:
            for info in original.infolist():
                output.writestr(info, replacements.get(info.filename, original.read(info.filename)))
    temporary.replace(xlsx)
    return counts

if __name__ == '__main__':
    xlsx = Path(sys.argv[1])
    data = json.loads((Path(__file__).resolve().parents[1]/'advertising-directory.json').read_text(encoding='utf-8'))
    print('Native hyperlinks per sheet:', patch_links(xlsx, data))
