import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Workbook,SpreadsheetFile,FileBlob} from '@oai/artifact-tool';
const folder=new URL('../../../outputs/01a1c4dd-0f74-7500-a258-6ae9b4374957/',import.meta.url);
const xlsxPath=fileURLToPath(new URL('daneshyar-advertising-outreach.xlsx',folder));
const csvPath=new URL('daneshyar-advertising-outreach.csv',folder);
const receipt=JSON.parse(await fs.readFile(new URL('advertising-inquiries-2026-11-12.json',folder),'utf8'));
assert.ok(receipt.finished_at_utc,'Wait until sending has finished');
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(xlsxPath));
const sheet=wb.worksheets.getItemAt(0);
const before=sheet.getRange('A1:F11').values;
const csvWb=await Workbook.fromCSV((await fs.readFile(csvPath,'utf8')).replace(/^\uFEFF/,''),{sheetName:'CSV'});
const csvRows=csvWb.worksheets.getItemAt(0).getRange('A1:F11').values;
const pre=await wb.render({sheetName:sheet.name,range:'A1:F4',scale:1,format:'png'});
await fs.writeFile(new URL('inquiries-before.png',import.meta.url),new Uint8Array(await pre.arrayBuffer()));
for(const result of receipt.results){
 const index=before.findIndex(r=>r[1]==='https://t.me/'+result.channel);
 assert.ok(index>=1);
 const row=index+1;
 if(result.admin!==before[index][2]){
  sheet.getRange('C'+row).values=[[result.admin]];
  csvRows[index][2]=result.admin;
 }
 if(result.sent_at_utc){
  const localSerial=(new Date(result.sent_at_utc).getTime()+3.5*3600000)/86400000+25569;
  sheet.getRange('D'+row).values=[[localSerial]];
  csvRows[index][3]=result.sent_at_tehran;
 }
 let note=result.status==='sent_and_verified'
  ? 'استعلام و تبلیغ تصویری ارسال و بررسی شد؛ در انتظار پاسخ'
  : result.inquiry_message_id?'استعلام ارسال شد؛ ارسال بنر کامل نشد':'ارسال کامل نشد';
 if(result.error_type && result.status!=='sent_and_verified')note+='؛ '+result.error_type;
 if(result.contact_source)note+='؛ منبع آیدی ادمین: '+result.contact_source;
 note=before[index][5].split(' | پیگیری ارسال: ')[0]+' | پیگیری ارسال: '+note;
 sheet.getRange('F'+row).values=[[note]];
 csvRows[index][5]=note;
}
sheet.getRange('D2:D11').setNumberFormat('yyyy-mm-dd hh:mm');
wb.recalculate();
const after=sheet.getRange('A1:F11').values;
for(let i=0;i<11;i++)for(const col of [0,1,4])assert.equal(after[i][col],before[i][col]);
console.log((await wb.inspect({kind:'table',range:sheet.name+'!A1:F3',include:'values',tableMaxRows:3,tableMaxCols:6,maxChars:1200})).ndjson);
const post=await wb.render({sheetName:sheet.name,range:'A1:F4',scale:1,format:'png'});
await fs.writeFile(new URL('inquiries-after.png',import.meta.url),new Uint8Array(await post.arrayBuffer()));
const xlsx=await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(xlsxPath);
const escape=v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
await fs.writeFile(csvPath,'\uFEFF'+csvRows.map(r=>r.map(escape).join(',')).join('\r\n')+'\r\n','utf8');
console.log('Recorded actual sends in XLSX and CSV. Reply-status fields preserved.');
