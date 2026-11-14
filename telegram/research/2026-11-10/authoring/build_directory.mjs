import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Workbook, SpreadsheetFile} from '@oai/artifact-tool';

const here=path.dirname(fileURLToPath(import.meta.url));
const research=path.dirname(here);
const pack=JSON.parse(await fs.readFile(path.join(research,'advertising-directory.json'),'utf8'));
const out=path.resolve(research,'../../outputs/01a1c4dd-0f74-7500-a258-6ae9b4374957');
await fs.mkdir(out,{recursive:true});
const wb=Workbook.create();
const configs=[
 {name:'استعلام تبلیغ',bucket:'استعلام تبلیغ',table:'AdRoutes',color:'#164E3B',
  note:'راه عمومی تبلیغ یا آگهی اعلام شده است. پذیرش متن دانشیار و تعرفه باید استعلام شود.'},
 {name:'نیازمند بررسی',bucket:'نیازمند بررسی',table:'FurtherLeads',color:'#775521',
  note:'سرنخ مرتبط است؛ راه تماس، فعالیت فعلی یا پذیرش تبلیغ هنوز نیاز به بررسی دارد.'},
 {name:'کنارگذاشته‌ها',bucket:'کنارگذاشته',table:'ExcludedLeads',color:'#6B7280',
  note:'دلیل کنارگذاشتن در ستون اقدام بعدی ثبت شده است. این موارد در شمار گزینه‌های قابل پیگیری نیستند.'},
];
for(const cfg of configs)cfg.sheet=wb.worksheets.add(cfg.name);
const widths=[54,278,214,186,155,95,250,225,126,184,92,285,370,208,22,380,660,132,670,420];
const headers=['شناسه','نام رسانه','لینک تلگرام','دسته مخاطب','محدوده مخاطب','تعداد اعضا','وضعیت تبلیغات','راه تماس عمومی','آخرین پست قابل مشاهده','بررسی فعالیت','نوع','خدمت مناسب پیشنهادی','اقدام بعدی','تماس مشترک','', 'منبع بررسی','شواهد تماس در معرفی','تاریخ بررسی','یادداشت','منبع کشف اولیه'];
const date=s=>s?new Date(s+'T00:00:00Z'):null;
const checkDate=date(pack.as_of);
const valuesFor=r=>[
 r.id,r.title||'@'+r.username,'@'+r.username,r.segment,r.geography,r.members,r.exclusion_reason||r.advertising_status,
 r.exclusion_reason?'':r.contact||'اعلام نشده',date(r.latest_visible_post),r.activity,
 r.kind==='group'?'گروه':r.kind==='channel'?'کانال':'سایر',
 r.suitable_services,r.next_action,r.shared_contact||'',null,
 r.source_url,r.contact_evidence||'در معرفی عمومی ثبت نشده',checkDate,
 r.notes||'',r.discovery_url||'',
];

for(const cfg of configs){
 const s=cfg.sheet;
 const rows=pack.records.filter(r=>r.bucket===cfg.bucket);
 cfg.rows=rows;cfg.end=8+rows.length;
 s.showGridLines=false;s.tabColor=cfg.color;
 const area=s.getRange(`A1:T${cfg.end}`);
 area.format.font={name:'Arial',size:11,color:'#172B25'};
 area.format.verticalAlignment='center';
 area.format.horizontalAlignment='right';
 area.format.rowHeight=48;
 for(let i=0;i<widths.length;i++)s.getRangeByIndexes(0,i,cfg.end,1).format.columnWidthPx=widths[i];
 s.getRange('A1:T7').format.rowHeight=24;
 s.getRange('A1:T1').format.rowHeight=12;
 s.getRange('A2').values=[['تبلیغات دانشیار — '+cfg.name]];
 s.getRange('A2').format.font={name:'Arial',size:16,bold:true,color:cfg.color};
 s.getRange('A2').format.horizontalAlignment='left';
 s.getRange('A2:T2').format.rowHeight=32;
 s.getRange('A3').values=[['بررسی عمومی در ۱۹ آبان ۱۴۰۵ / 2026-11-10']];
 s.getRange('A3').format.horizontalAlignment='left';
 s.getRange('A3:T3').format.borders={bottom:{style:'thin',color:'#A7B9B1'}};
 s.getRange('B4').values=[['تعداد این فهرست']];
 s.getRange('C4').formulas=[[`=COUNTA(C9:C${cfg.end})`]];
 s.getRange('C4').format.font={name:'Arial',size:14,bold:true,color:cfg.color};
 s.getRange('C4').format.horizontalAlignment='center';
 s.getRange('A5').values=[[cfg.note]];
 s.getRange('A5').format.horizontalAlignment='left';
 s.getRange('A6').values=[['اعضا معیار بازده نیست. برای گروه‌ها فقط معرفی عمومی بررسی شد. قیمت‌ها و پذیرش دانشیار استعلام نشده‌اند.']];
 s.getRange('A6').format.horizontalAlignment='left';
 s.getRange('A6').format.font={name:'Arial',size:11,color:'#5B655F'};
 s.getRange('A8:T8').values=[headers];
 if(cfg.bucket==='کنارگذاشته')s.getRange('G8').values=[['دلیل کنارگذاشتن']];
 s.getRange(`A9:T${cfg.end}`).values=rows.map(valuesFor);
 const table=s.tables.add(`A8:N${cfg.end}`,true,cfg.table);
 table.showFilterButton=true;
 table.style='TableStyleLight1';
 s.getRange('A8:N8').format={fill:cfg.color,font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},rowHeight:46,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center'};
 s.getRange('P8:T8').format={fill:'#E9EFEB',font:{name:'Arial',size:11,bold:true,color:'#172B25'},rowHeight:46,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center'};
 s.getRange(`A9:T${cfg.end}`).format.wrapText=true;
 s.getRange(`A9:A${cfg.end}`).format.horizontalAlignment='center';
 s.getRange(`C9:C${cfg.end}`).format.horizontalAlignment='left';
 s.getRange(`F9:F${cfg.end}`).format.horizontalAlignment='right';
 s.getRange(`F9:F${cfg.end}`).setNumberFormat('#,##0');
 s.getRange(`H9:H${cfg.end}`).format.horizontalAlignment='left';
 for(const c of ['I','R']){
  s.getRange(`${c}9:${c}${cfg.end}`).setNumberFormat('yyyy-mm-dd');
  s.getRange(`${c}9:${c}${cfg.end}`).format.horizontalAlignment='center';
 }
 for(const c of ['P','Q','S','T'])s.getRange(`${c}9:${c}${cfg.end}`).format.horizontalAlignment='left';
 s.getRange(`O8:O${cfg.end}`).format.fill='#FFFFFF';
 for(const c of ['C','P','T'])s.getRange(`${c}9:${c}${cfg.end}`).format.font={name:'Arial',size:11,color:'#175EA8'};
 for(let i=0;i<rows.length;i++)if(rows[i].contact_url&&!rows[i].exclusion_reason){
  s.getRange(`H${i+9}`).format.font={name:'Arial',size:11,color:'#175EA8'};
 }
 s.freezePanes.freezeRows(8);s.freezePanes.freezeColumns(3);
 // Ordinary workflow categories remain text so filtering does not depend on color.
 s.getRange(`J9:J${cfg.end}`).conditionalFormats.add('containsText',{text:'بیش از ۱۸۰',format:{fill:'#FFF0D2',font:{color:'#805700'}}});
 s.getRange(`N9:N${cfg.end}`).conditionalFormats.add('notContainsBlanks',{format:{fill:'#ECF3EF'}});
}

const primary=configs[0].sheet;
primary.getRange('D4').values=[['سرنخ‌های تکمیلی']];
primary.getRange('E4').formulas=[[`=COUNTA('نیازمند بررسی'!C9:C${configs[1].end})`]];
primary.getRange('G4').values=[['موارد کنارگذاشته']];
primary.getRange('H4').formulas=[[`=COUNTA('کنارگذاشته‌ها'!C9:C${configs[2].end})`]];
primary.getRange('D4:H4').format.rowHeight=28;
primary.getRange('A7').values=[['تماس مشترک یعنی مسیر عمومی یکسان؛ مالکیت مشترک یا نبود همپوشانی مخاطب از آن نتیجه نمی‌شود.']];
primary.getRange('A7').format.horizontalAlignment='left';

// A focused recalculation check: count changes when a listed handle is removed.
const original=primary.getRange('C9').values;
const baseline=primary.getRange('C4').values[0][0];
primary.getRange('C9').clear({applyTo:'contents'});
const changed=primary.getRange('C4').values[0][0];
if(changed!==baseline-1)throw new Error(`Count did not recalculate: ${baseline} -> ${changed}`);
primary.getRange('C9').values=original;
wb.recalculate();
const summary=await wb.inspect({kind:'table',range:'استعلام تبلیغ!A4:H4',include:'values,formulas',maxChars:1600,tableMaxRows:1,tableMaxCols:8});
console.log(summary.ndjson);
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},maxChars:1000,summary:'final formula errors'});
console.log(errors.ndjson);
const report={record_count:pack.total_screened,counts:pack.counts,count_recalculation:{before:baseline,after_removal:changed,after_restore:primary.getRange('C4').values[0][0]}};
for(const cfg of configs){
 const preview=await wb.render({sheetName:cfg.name,range:'A1:I15',scale:1,format:'png'});
 const filename=cfg.table+'-preview.png';
 await fs.writeFile(path.join(here,filename),new Uint8Array(await preview.arrayBuffer()));
 report[cfg.name]={count:cfg.rows.length,table_range:`A8:N${cfg.end}`,source_range:`P8:T${cfg.end}`,preview:filename};
}
const sourcePreview=await wb.render({sheetName:configs[0].name,range:'P8:S12',scale:1,format:'png'});
await fs.writeFile(path.join(here,'Sources-preview.png'),new Uint8Array(await sourcePreview.arrayBuffer()));
const file=await SpreadsheetFile.exportXlsx(wb);
const filePath=path.join(out,'daneshyar-advertising-directory-2026-11-10.xlsx');
await file.save(filePath);
await fs.writeFile(path.join(here,'workbook-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({filePath,...report}));
