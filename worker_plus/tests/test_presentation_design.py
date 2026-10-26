import copy,json,sys,hashlib,tempfile,unittest
from types import SimpleNamespace
from unittest.mock import Mock
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from presentation.design import catalog,resolve_design,semantic_contract,semantic_spec,content_inputs
from presentation.source_pages import merge_pages,slide_source_notes,format_source_notes

class PresentationDesignTests(unittest.TestCase):
 def setUp(self):
  self.sources={'sources':[{'id':'S1','name':'source.pdf','pagination':{'method':'original_pdf'},'images':[{'id':'S1:figure-1','pages':[9]}],'segments':[{'id':'S1:page-2','text':'Evidence 10','pages':[2]},{'id':'S1:page-5','text':'Evidence 20','pages':[5,6]}]}]}
 def test_shared_catalog_and_strict_choices(self):
  self.assertEqual(len(catalog()['styles']),4)
  self.assertEqual(resolve_design({})['font'],'Vazirmatn')
  for style in catalog()['styles']: self.assertEqual(resolve_design({'presentation_style':style['id']})['id'],style['id'])
  for field in ['presentation_style','presentation_font']:
   with self.assertRaises(ValueError):resolve_design({field:'unknown'})
 def test_pdf_images_keep_their_real_source_page(self):
  import fitz
  from PIL import Image
  from common.source_extract import extract_source
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);Image.new('RGB',(120,60),'red').save(root/'figure.png')
   with fitz.open() as document:
    document.new_page().insert_text((72,72),'First source page')
    page=document.new_page();page.insert_text((72,72),'Second source page');page.insert_image(fitz.Rect(72,100,192,160),filename=str(root/'figure.png'))
    document.save(root/'source.pdf')
   source=extract_source(root/'source.pdf','S1',root/'media')
   self.assertEqual(source['images'][0]['pages'],[2]);self.assertEqual(source['images'][0]['source_locator'],'S1:page-2')
   self.assertTrue(Path(source['images'][0]['path']).is_file())
 def test_disjoint_source_ranges_and_image_pages(self):
  row={'evidence':[{'locator':'S1:page-2'},{'locator':'S1:page-5'}],'image_id':'S1:figure-1'}
  note=slide_source_notes(row,self.sources)[0]
  self.assertEqual(note['ranges'],[[2,2],[5,6],[9,9]])
  self.assertIn('2, 5–6, 9',format_source_notes([note]))
  self.assertEqual(merge_pages([6,2,5,2]),[[2,2],[5,6]])
 def test_missing_or_unknown_page_is_rejected(self):
  row={'evidence':[{'locator':'S1:page-2'}]}
  self.sources['sources'][0]['segments'][0].pop('pages')
  with self.assertRaises(ValueError):slide_source_notes(row,self.sources)
  with self.assertRaises(ValueError):slide_source_notes({'evidence':[{'locator':'S1:unknown'}]},self.sources)
 def test_cover_orientation_honest_and_source_slides_labelled(self):
  note=slide_source_notes({},self.sources)[0];self.assertEqual(note['purpose'],'orientation')
  note['pagination']['method']='original_slides'
  self.assertIn('slides',format_source_notes([note],False))
 def test_design_changes_preserve_semantics_but_not_facts(self):
  a={'title':'Topic','font':'Vazirmatn','design':{'id':'academic-modern'},'layout_version':2,'slide_count':20}
  b={**a,'font':'Tahoma','design':{'id':'academic-formal'}}
  self.assertEqual(semantic_contract(a),semantic_contract(b))
  self.assertNotEqual(semantic_contract(a),semantic_contract({**b,'slide_count':21}))
  a={'slides':[{'layout':'statement','title':'Claim','points':['10']} ]}
  b=copy.deepcopy(a);b['slides'][0]['layout']='key_metric'
  self.assertEqual(semantic_spec(a),semantic_spec(b))
  b['slides'][0]['points']=['20'];self.assertNotEqual(semantic_spec(a),semantic_spec(b))
 def test_page_reindex_does_not_invalidate_audited_facts(self):
  self.sources['sources'][0]['images']=[]
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   for folder in ['final','planning','extracted']: (root/folder).mkdir()
   write=lambda path,data:(root/path).write_text(json.dumps(data),encoding='utf-8')
   write('final/presentation.json',{'slides':[{'title':'Claim','points':['10'],'layout':'statement'}]})
   write('planning/presentation_contract.json',{'font':'Vazirmatn','slide_count':1})
   write('extracted/presentation_sources.json',self.sources)
   initial=content_inputs(root)
   self.sources['sources'][0]['segments'][0]['pages']=[3]
   write('extracted/presentation_sources.json',self.sources)
   self.assertEqual(initial,content_inputs(root))
   self.sources['sources'][0]['segments'][0]['text']='Changed fact'
   write('extracted/presentation_sources.json',self.sources)
   self.assertNotEqual(initial,content_inputs(root))
 def test_style_only_rebuild_keeps_current_actual_content_audits(self):
  from presentation import workflow
  from presentation.recovery import PresentationRenderingRecoveryRequired
  from common.helpers import write_json,write_text
  from test_presentation import fixture
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   service=SimpleNamespace(workspace=root,run_codex=Mock(side_effect=AssertionError('No model call for style-only change')))
   context={'order_id':'isolated-style-change','artifacts':{},'order':{'title':'Topic','quantity_value':7,'course_name':'Course','language':'فارسی'}}
   workflow.build_contract(context,service)
   model,_,sources=fixture()
   sources['sources'][0]['segments'][0]['pages']=[2]
   sources['sources'][0]['segments'].insert(0,{'id':'S1:block-2','pages':[2],
    'text':'روش پژوهش با مقایسه زمان اجرای روش الف 10 و روش ب 20 دقیقه و ثبت زمان‌ها در این مقایسه انجام شد.'})
   sources['sources'][0]['pagination']={'method':'word_physical_pages','page_count':2}
   for slide in model['slides'][1:5]:
    slide['claim_ids']=['C1']
    slide['evidence'].append({'locator':'S1:block-2','quote':'روش پژوهش با مقایسه زمان اجرای روش الف 10 و روش ب 20 دقیقه'})
   write_json(root/'final/presentation.json',model);write_json(root/'extracted/presentation_sources.json',sources)
   write_json(root/'planning/presentation_claims.json',{'version':2,'topics':{'method':['S1:block-2']},'claims':[
    {'id':'C1','topic':'method','kind':'observed','statement':'زمان اجرای روش الف 10 و روش ب 20 دقیقه است.',
     'evidence':{'locator':'S1:block-2','quote':'مقایسه زمان اجرای روش الف 10 و روش ب 20 دقیقه'},
     'confidence':'medium','assumptions':[]}]})
   write_json(root/'planning/presentation_analysis.json',{'version':1,'items':[],'required_categories':[]})
   write_json(root/'planning/presentation_outline.json',{'slides':[{}]*7})
   paths=['final/presentation.json','planning/presentation_contract.json','extracted/presentation_sources.json']
   for name in ['presentation_content_audit','presentation_source_audit']:
    write_text(root/f'reports/{name}.md','STATUS: PASS\nISSUES_JSON: {"issues":[]}')
    write_json(root/f'reports/{name}.json',{'passed':True,'inputs':workflow.fingerprints(service,paths),'semantic_inputs':content_inputs(root)})
   before=(root/'final/presentation.json').read_bytes()
   context['order']['presentation_style']='academic-formal'
   workflow.build_contract(context,service)
   self.assertTrue(context['presentation_design_only_change'])
   workflow.plan(context,service)
   with self.assertRaises(PresentationRenderingRecoveryRequired):workflow.generate(context,service)
   service.run_codex.assert_not_called()
   self.assertEqual(before,(root/'final/presentation.json').read_bytes())
 def test_native_table_xml_opens_in_office_and_keeps_rtl_order(self):
  import os,shutil,subprocess,zipfile
  from lxml import etree
  from presentation.compose import apply_script_fonts
  from presentation.design import ROOT
  node=shutil.which('node')
  if not node or not (ROOT/'runtime/node_modules/pptxgenjs').exists():self.skipTest('Run npm ci in presentation/runtime for renderer integration tests')
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);target=root/'table.pptx'
   data={'layout':'table','section':'results','title':'Table example','table':[['Method','Time'],['A','10'],['B','20']], 'points':[], 'speaker_notes':'Synthetic source page 1', 'source_notes':[{'ranges':[[1,1]]}], 'citations':[]}
   payload={'slides':[data],'contract':{'rtl':True,'title':'Fixture'},'design':resolve_design({}),'target':str(target),'content_sha256':'fixture','design_sha256':'fixture'}
   (root/'payload.json').write_text(json.dumps(payload),encoding='utf-8')
   subprocess.run([node,str(ROOT/'runtime/render.mjs'),str(root/'payload.json')],check=True,capture_output=True,timeout=30,env={**os.environ,'ELECTRON_RUN_AS_NODE':'1'})
   apply_script_fonts(target,'Vazirmatn',True)
   with zipfile.ZipFile(target) as package:
    xml=etree.fromstring(package.read('ppt/slides/slide1.xml'))
   cells=xml.xpath('//*[local-name()="tcPr"]')
   self.assertTrue(cells);self.assertTrue(all(cell.get('anchor')=='ctr' for cell in cells))
   first=xml.xpath('//*[local-name()="tr"][1]/*[local-name()="tc"][1]//*[local-name()="t"]/text()')
   self.assertEqual(['\u202aTime\u202c\u200f'],first)
   self.assertTrue(all(node.get('rtl')=='1' for node in xml.xpath('//*[local-name()="tc"]//*[local-name()="pPr"]')))
 def test_long_metric_units_and_reference_tables_keep_their_native_layout(self):
  import os,shutil,subprocess,zipfile
  from lxml import etree
  from presentation.design import ROOT
  node=shutil.which('node')
  if not node or not (ROOT/'runtime/node_modules/pptxgenjs').exists():self.skipTest('Presentation npm runtime is required')
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);target=root/'layout.pptx'
   common={'title':'Native layout fixture','speaker_notes':'Synthetic source page 1','source_notes':[{'ranges':[[1,1]]}],'citations':[],'points':[]}
   slides=[{**common,'layout':'key_metric','section':'results','visual':{'metrics':[{'value':'70,097,700 kilograms','label':'Total supply','detail':'A clearly disclosed scenario assumption'},{'value':'5783 tonnes/year','label':'Scenario market'},{'value':'3500 tonnes','label':'Minimum sales'}]}},
           {**common,'layout':'table','section':'references','table':[['Source','Use'],['customer-original.docx','Primary source'],['Study A','Technical evidence']],'caption':'Original filename: customer-original.docx'}]
   payload={'slides':slides,'contract':{'rtl':True,'title':'Fixture'},'design':resolve_design({}),'target':str(target),'content_sha256':'fixture','design_sha256':'fixture'}
   (root/'payload.json').write_text(json.dumps(payload),encoding='utf-8')
   subprocess.run([node,str(ROOT/'runtime/render.mjs'),str(root/'payload.json')],check=True,capture_output=True,timeout=30,env={**os.environ,'ELECTRON_RUN_AS_NODE':'1'})
   manifest=json.loads(target.with_suffix('.layout.json').read_text(encoding='utf-8'))
   objects=manifest['slides'][0]['objects']
   self.assertIn('70,097,700',[obj['text'] for obj in objects if obj['role']=='metric-value'])
   self.assertIn('kilograms',[obj['text'] for obj in objects if obj['role']=='metric-unit'])
   table=next(obj for obj in manifest['slides'][1]['objects'] if obj['role']=='table')
   caption=next(obj for obj in manifest['slides'][1]['objects'] if obj['role']=='caption')
   self.assertGreaterEqual(caption['bbox'][1],table['bbox'][3])
   with zipfile.ZipFile(target) as package:
    xml=etree.fromstring(package.read('ppt/slides/slide2.xml'))
   self.assertEqual(1,len(xml.xpath('//*[local-name()="tbl"]')))
 def test_desktop_electron_node_can_load_the_presentation_renderer(self):
  import os,subprocess
  from presentation.design import ROOT
  electron=ROOT.parent/'ui/node_modules/electron/dist/electron.exe'
  if os.name!='nt' or not electron.is_file():self.skipTest('Desktop Electron runtime is required')
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);target=root/'desktop.pptx'
   slide={'layout':'title','section':'title','title':'Desktop runtime fixture','points':['Existing Electron runtime'], 'speaker_notes':'Synthetic fixture','source_notes':[{'ranges':[[1,1]]}],'citations':[]}
   payload={'slides':[slide],'contract':{'rtl':False,'title':'Fixture'},'design':resolve_design({}),'target':str(target),'content_sha256':'fixture','design_sha256':'fixture'}
   (root/'payload.json').write_text(json.dumps(payload),encoding='utf-8')
   subprocess.run([str(electron),str(ROOT/'runtime/render.mjs'),str(root/'payload.json')],check=True,capture_output=True,timeout=30,env={**os.environ,'ELECTRON_RUN_AS_NODE':'1'})
   self.assertTrue(target.is_file())

if __name__=='__main__':unittest.main()
