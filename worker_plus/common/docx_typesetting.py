"""Opt-in native equations and readable bibliography for academic Word output."""
from copy import deepcopy
import re
import hashlib
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

ASCII = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')

def elem(name, text=None):
    item = OxmlElement(name)
    if text is not None:
        item.text = text
    return item

def math_run(text):
    run = elem('m:r')
    props = elem('w:rPr')
    fonts = elem('w:rFonts')
    for name in ['ascii','hAnsi','cs']:
        fonts.set(qn('w:'+name),'Cambria Math')
    props.append(fonts)
    rtl = elem('w:rtl'); rtl.set(qn('w:val'),'0'); props.append(rtl)
    run.append(props)
    t = elem('m:t',text)
    t.set(qn('xml:space'),'preserve')
    run.append(t)
    return run

class MathParser:
    """Small explicit TeX subset used by the report; unsupported commands fail."""
    def __init__(self,text): self.text=text.translate(ASCII); self.i=0
    def group(self):
        while self.i<len(self.text) and self.text[self.i].isspace(): self.i+=1
        if self.i>=len(self.text): raise ValueError('Missing math argument')
        if self.text[self.i]=='{':
            self.i+=1
            out=self.sequence('}')
            return out
        return [self.atom()]
    def atom(self):
        c=self.text[self.i]; self.i+=1
        if c=='\\':
            match=re.match(r'[A-Za-z]+|.',self.text[self.i:])
            if not match: raise ValueError('Incomplete math command')
            cmd=match[0]; self.i+=len(cmd)
            if cmd=='bar':
                accent=elem('m:acc'); props=elem('m:accPr'); char=elem('m:chr'); char.set(qn('m:val'),'̅'); props.append(char); accent.append(props)
                base=elem('m:e'); base.extend(self.group()); accent.append(base); return accent
            if cmd=='frac':
                fraction=elem('m:f')
                for tag in ['m:num','m:den']:
                    node=elem(tag); node.extend(self.group()); fraction.append(node)
                return fraction
            mapping={'sum':'∑','max':'max','min':'min','alpha':'α','Delta':'Δ','times':'×','%':'%','cdot':'·','le':'≤','ge':'≥'}
            if cmd not in mapping: raise ValueError('Unsupported math command: '+cmd)
            return math_run(mapping[cmd])
        return math_run(c)
    def sequence(self,end=None):
        result=[]
        while self.i<len(self.text):
            c=self.text[self.i]
            if end and c==end:
                self.i+=1; return result
            if c in '_^':
                if not result: raise ValueError('Missing math script base')
                self.i+=1
                base=result.pop(); node=elem('m:sSub' if c=='_' else 'm:sSup')
                base_node=elem('m:e'); base_node.append(base); node.append(base_node)
                script=elem('m:sub' if c=='_' else 'm:sup'); script.extend(self.group()); node.append(script); result.append(node)
            elif c=='{':
                self.i+=1; result.extend(self.sequence('}'))
            else: result.append(self.atom())
        if end: raise ValueError('Unclosed math group')
        return result

def replace_inline_math(paragraph):
    # Packaging emits each ordinary paragraph as a single run. Do not rewrite
    # index hyperlinks/fields or other structured paragraphs.
    text=paragraph.text
    if r'\(' not in text: return
    if len(paragraph.runs)!=1: raise ValueError('Inline math needs an unstructured source paragraph')
    original=paragraph.runs[0]
    template=deepcopy(original._r.rPr)
    pieces=re.split(r'(\\\(.*?\\\))',text)
    original._r.getparent().remove(original._r)
    for piece in pieces:
        if not piece: continue
        if piece.startswith(r'\(') and piece.endswith(r'\)'):
            math=elem('m:oMath')
            box=elem('m:box'); props=elem('m:boxPr')
            no_break=elem('m:noBreak'); no_break.set(qn('m:val'),'1'); props.append(no_break); box.append(props)
            body=elem('m:e'); body.extend(MathParser(piece[2:-2]).sequence()); box.append(body); math.append(box)
            paragraph._p.append(math)
        else:
            run=paragraph.add_run(piece)
            if template is not None: run._r.insert(0,deepcopy(template))

def apply_typesetting(document,rules):
    settings=rules.get('native_typesetting',{})
    if not settings:
        apply_url_directions(document, rules)
        return
    from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
    references=False
    for p in document.paragraphs:
        if settings.get('math'): replace_inline_math(p)
        if p.text.strip() in ['منابع','References']: references=True; continue
        text=p.text
        if references and re.match(r'^\[\d+\]\s*[A-Za-z]',text.translate(ASCII)):
            # Keep English bibliographic identifiers and URLs in ASCII/LTR.
            text=text.translate(ASCII)
            p.clear(); p.alignment=WD_ALIGN_PARAGRAPH.LEFT
            props=p._p.get_or_add_pPr(); bidi=props.find(qn('w:bidi'))
            if bidi is None: bidi=elem('w:bidi'); props.append(bidi)
            bidi.set(qn('w:val'),'0')
            p.paragraph_format.first_line_indent=Cm(-0.55)
            p.paragraph_format.left_indent=Cm(0.55)
            p.paragraph_format.line_spacing=1.15
            p.paragraph_format.space_after=Pt(10)
            for i,part in enumerate(re.split(r'\*([^*]+)\*',text)):
                run=p.add_run(part); run.italic=bool(i%2)
                run.font.name=rules['font']['latin']; run.font.size=Pt(11)
                rpr=run._r.get_or_add_rPr(); rtl=elem('w:rtl'); rtl.set(qn('w:val'),'0'); rpr.append(rtl)
        elif '*' in text and r'\(' not in text and not p._p.xpath('.//m:oMath') and not p._p.xpath('.//w:hyperlink'):
            # Actual emphasis, rather than raw Markdown stars.
            if len(p.runs)==1:
                template=deepcopy(p.runs[0]._r.rPr); p.clear()
                for i,part in enumerate(re.split(r'\*\*([^*]+)\*\*|\*([^*]+)\*',text)):
                    if part is None: continue
                    run=p.add_run(part)
                    if template is not None: run._r.insert(0,deepcopy(template))
                    if i%3==1: run.bold=True
                    elif i%3==2: run.italic=True
    for table in document.tables:
        if not table.rows or not table.rows[0].cells or table.rows[0].cells[0].paragraphs[0].style.name=='TOC Entry': continue
        table.autofit=False
        width=15/len(table.columns)
        for column in table.columns: column.width=Cm(width)
        repeat=elem('w:tblHeader'); table.rows[0]._tr.get_or_add_trPr().append(repeat)
        for ri,row in enumerate(table.rows):
            cannot=elem('w:cantSplit'); row._tr.get_or_add_trPr().append(cannot)
            for cell in row.cells:
                cell.width=Cm(width); cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
                tcpr=cell._tc.get_or_add_tcPr()
                shading=elem('w:shd'); shading.set(qn('w:fill'),'DCE6EF' if ri==0 else ('F4F6F8' if ri%2==0 else 'FFFFFF')); tcpr.append(shading)
                borders=elem('w:tcBorders')
                for edge in ['top','left','bottom','right']:
                    b=elem('w:'+edge)
                    for key,val in [('val','single'),('sz','4'),('color','D9D9D9')]: b.set(qn('w:'+key),val)
                    borders.append(b)
                tcpr.append(borders)
                for p in cell.paragraphs:
                    p.alignment=WD_ALIGN_PARAGRAPH.CENTER
                    p.paragraph_format.first_line_indent=Cm(0)
                    p.paragraph_format.space_before=Pt(4); p.paragraph_format.space_after=Pt(4)
                    p.paragraph_format.line_spacing=1.15
    apply_url_directions(document, rules)

def apply_url_directions(document, rules):
    from urllib.parse import quote
    # A URL inside a Persian paragraph needs its own LTR run; otherwise its
    # slash, digits and punctuation can be visually reordered in the PDF.
    for p in document.paragraphs:
        for original in list(p.runs):
            if not re.search(r'https?://\S+',original.text): continue
            parts=re.split(r'(https?://\S+)',original.text)
            previous=original._r
            for part in parts:
                if not part: continue
                run=p.add_run(part)
                if original._r.rPr is not None: run._r.insert(0,deepcopy(original._r.rPr))
                previous.addnext(run._r); previous=run._r
                if part.startswith(('https://','http://')):
                    # Percent-encode a Persian URL path so the complete link
                    # stays a single machine-readable LTR string in Word.
                    link=quote(part.translate(ASCII), safe=":/?#[]@!$&'()*+,;=%-._~")
                    run.text='\u200e'+link+'\u200e'
                    props=run._r.get_or_add_rPr()
                    rtl=props.find(qn('w:rtl'))
                    if rtl is None: rtl=elem('w:rtl'); props.append(rtl)
                    rtl.set(qn('w:val'),'0')
                    lang=props.find(qn('w:lang'))
                    if lang is None: lang=elem('w:lang'); props.append(lang)
                    lang.set(qn('w:val'),'en-US'); lang.set(qn('w:bidi'),'en-US')
                    run.font.name=rules['font']['latin']; run.font.size=Pt(11)
            original._r.getparent().remove(original._r)

def optimize_package(path):
    """Deduplicate equal decoded embedded fonts and restore explicit Latin runs.

    Word may embed identical regular/italic fonts twice using different
    obfuscation keys. Compare decoded bytes, then share the original part/key.
    Equations, text, fields and embedded font bytes remain intact.
    """
    with ZipFile(path) as source:
        entries={i.filename:(i,source.read(i)) for i in source.infolist()}
    if 'word/fontTable.xml' in entries and 'word/_rels/fontTable.xml.rels' in entries:
        fonts=etree.fromstring(entries['word/fontTable.xml'][1])
        rels=etree.fromstring(entries['word/_rels/fontTable.xml.rels'][1])
        by_id={r.get('Id'):r for r in rels}
        seen={}; removed=set()
        for font in fonts:
            for embedding in font:
                rid=embedding.get(qn('r:id')); key=embedding.get(qn('w:fontKey'))
                if not rid or not key or rid not in by_id: continue
                part='word/'+by_id[rid].get('Target')
                if part not in entries: continue
                decoded=bytearray(entries[part][1])
                mask=bytes.fromhex(key.strip('{}').replace('-',''))[::-1]
                for i in range(min(32,len(decoded))): decoded[i]^=mask[i%16]
                fingerprint=hashlib.sha256(decoded).hexdigest()
                if fingerprint in seen:
                    previous_rid,previous_key,previous_part=seen[fingerprint]
                    embedding.set(qn('r:id'),previous_rid); embedding.set(qn('w:fontKey'),previous_key)
                    if part!=previous_part: removed.add(part)
                else: seen[fingerprint]=(rid,key,part)
        used={e.get(qn('r:id')) for e in fonts.iter() if e.get(qn('r:id'))}
        for relationship in list(rels):
            if relationship.get('Id') not in used: rels.remove(relationship)
        entries['word/fontTable.xml']=(entries['word/fontTable.xml'][0],etree.tostring(fonts,xml_declaration=True,encoding='UTF-8',standalone=True))
        entries['word/_rels/fontTable.xml.rels']=(entries['word/_rels/fontTable.xml.rels'][0],etree.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True))
        for part in removed: entries.pop(part,None)
    body=etree.fromstring(entries['word/document.xml'][1])
    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    for p in body.xpath('//w:p',namespaces=ns):
        text=''.join(p.xpath('.//w:t/text()',namespaces=ns))
        if re.match(r'^\[\d+\]\s*[A-Za-z]',text.translate(ASCII)):
            for run in p.xpath('.//w:r',namespaces=ns):
                props=run.find(qn('w:rPr'))
                if props is None: props=elem('w:rPr'); run.insert(0,props)
                lang=props.find(qn('w:lang'))
                if lang is None: lang=elem('w:lang'); props.append(lang)
                lang.set(qn('w:val'),'en-US'); lang.set(qn('w:bidi'),'en-US')
    entries['word/document.xml']=(entries['word/document.xml'][0],etree.tostring(body,xml_declaration=True,encoding='UTF-8',standalone=True))
    temp=path.with_suffix('.optimized.docx')
    with ZipFile(temp,'w',compression=ZIP_DEFLATED,compresslevel=9) as output:
        for info,data in entries.values(): output.writestr(info,data)
    temp.replace(path)
