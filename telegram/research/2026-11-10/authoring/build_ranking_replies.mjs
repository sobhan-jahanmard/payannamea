import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Workbook, SpreadsheetFile} from '@oai/artifact-tool';

const entries=JSON.parse(await fs.readFile(new URL('ranking-reply-source.json',import.meta.url),'utf8'));
const comparisons=[
 ['daneshjo_report',9.3,600000,'۲۴ساعته',17500],
 ['uttweet',8.8,690000,'دائم',26600],
 ['Daneshjoo',8.2,1100000,'تعرفهٔ مهر',33300],
 ['ketabkhaneh_daneshjoyan',7.2,580000,'۲۴ساعته در ۴ کانال',3700],
 ['Azaadnews',6.5,1260000,'عادی',13500],
 ['IauAmozeshyar',6,3363000,'۲۴ساعته',21600],
 ['amozesh_daneshjo',5.5,null,'در انتظار تعرفه',11800],
 ['azadtnb1',5,2390000,'۲۴ساعتهٔ عادی',14100],
 ['pnudaneshjuy',4.5,350000,'۲۴ساعته',1450],
 ['twitterjoo',2.8,400000,'۲۴ساعته',680],
];
const buttons=[
 '🔰شرایط درج | 🔰تعرفه(هزارتوان) | 🔰زمان ماندگاری',
 'توضیحات | 1572 | 4 ساعته','توضیحات | 2189 | 8 ساعته',
 'توضیحات | 2965 | 16 ساعته','توضیحات | 3363 | 24 ساعته',
 'توضیحات | 2886 | شبانه','توضیحات | 219 | بازدیدی',
 '📉تخفیف می‌خواهید؟📉','🐢تبلیغات ارزان‌تر🐢',' بازگشت به لیست کانال‌ها ◀️',
].join('\n');

const workbook=Workbook.create();
const sheet=workbook.worksheets.add('رتبه‌بندی و پاسخ‌ها');
sheet.showGridLines=false;
sheet.tabColor='#23485F';
const rows=[];
const records=[];
const limit=14;
for (const [index,[channel,score,price,plan,views]] of comparisons.entries()) {
 const entry=entries.find(x=>x.channel===channel);
 assert.ok(entry);
 const start=rows.length;
 const addReply=(label,message,isNote=false)=>{
  const lines=message.split('\n');
  const pieces=[];
  for(let i=0;i<lines.length;i+=limit)pieces.push(lines.slice(i,i+limit).join('\n'));
  assert.equal(pieces.join('\n'),message);
  pieces.forEach((piece,i)=>{
   const first=rows.length===start;
   rows.push([
    ...(first?[index+1,'@'+channel,entry.admin,score,price,plan,views]:[null,null,null,null,null,null,null]),
    pieces.length===1?label:`${label} · ${i+1}/${pieces.length}`,
    piece,
   ]);
   records.push({index,first,isNote,lines:piece.split('\n')});
  });
 };
 if(entry.replies.length===0)addReply('—','تا زمان بررسی، پاسخی دریافت نشده.',true);
 for(const msg of entry.replies){
  addReply(String(msg.id)+(msg.has_media?' · کپشن':''),msg.text);
  if(channel==='IauAmozeshyar'&&msg.id===46)addReply('دکمه‌های ۴۶',buttons,true);
 }
}
const last=rows.length+3;
sheet.getRange('I1').values=[['رتبه‌بندی تبلیغات دانشیار']];
sheet.getRange('I2').values=[['آمار ۲۱ آبان ۱۴۰۵ · بازدید اخیر، میانهٔ پست‌های ۱ تا ۳ روزه است']];
sheet.getRange('A3:I3').values=[['رتبه','آیدی کانال','آیدی ادمین','امتیاز از ۱۰','تعرفه','پلن','بازدید اخیر','پیام تلگرام','عین پاسخ ادمین']];
sheet.getRange(`A4:I${last}`).values=rows;
const widths=[55,224,159,93,154,151,99,123,688];
widths.forEach((width,i)=>sheet.getRangeByIndexes(0,i,last,1).format.columnWidthPx=width);
const all=sheet.getRange(`A1:I${last}`);
all.format.font={name:'Arial',size:11,color:'#203849'};
sheet.getRange('A1:I1').format.rowHeightPx=34;
sheet.getRange('I1').format={font:{name:'Arial',size:17,bold:true,color:'#23485F'},horizontalAlignment:'right'};
sheet.getRange('I2').format={font:{name:'Arial',size:10,color:'#526778'},horizontalAlignment:'right',rowHeightPx:25};
sheet.getRange('A3:I3').format={fill:'#23485F',font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',rowHeightPx:36};
const body=sheet.getRange(`A4:I${last}`);
body.format.verticalAlignment='top';
body.format.wrapText=true;
body.format.horizontalAlignment='right';
sheet.getRange(`B4:C${last}`).format.horizontalAlignment='left';
sheet.getRange(`B4:C${last}`).format.font.color='#175F90';
sheet.getRange(`D4:D${last}`).setNumberFormat('0.0');
sheet.getRange(`E4:E${last}`).setNumberFormat('#,##0" تومان"');
sheet.getRange(`G4:G${last}`).setNumberFormat('#,##0');
sheet.getRange(`H4:H${last}`).format.horizontalAlignment='center';
sheet.getRange(`H4:H${last}`).format.font.color='#526778';
for(const [i,item] of records.entries()){
 const row=i+4;
 const rowRange=sheet.getRange(`A${row}:I${row}`);
 rowRange.format.fill=item.index%2?'#F0F5F8':'#FFFFFF';
 if(item.first){
  sheet.getRange(`A${row}:G${row}`).format.font.bold=true;
  rowRange.format.borders={top:{style:'thin',color:'#C5D5DF'}};
 }
 if(item.isNote)sheet.getRange('I'+row).format.font.color='#526778';
 const lines=item.lines.reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/88)),0);
 rowRange.format.rowHeightPx=Math.max(item.first?46:27,lines*19+12);
}
sheet.freezePanes.freezeRows(3);
workbook.recalculate();
assert.deepEqual(sheet.getRange(`A4:I${last}`).values.map(r=>r.map(v=>v??null)),rows);
console.log(`Verified ${comparisons.length} ranks, ${entries.flatMap(e=>e.replies).length} messages, ${rows.length} visible table rows.`);
const ranges=[['A1:I9','ranking-replies-top.png'],['H10:I15','ranking-replies-long.png']];
for(const [range,name] of ranges){
 const preview=await workbook.render({sheetName:sheet.name,range,scale:0.85,format:'png'});
 await fs.writeFile(new URL(name,import.meta.url),new Uint8Array(await preview.arrayBuffer()));
}
const output=fileURLToPath(new URL('../../../outputs/01a1c4dd-0f74-7500-a258-6ae9b4374957/daneshyar-advertising-ranking-with-replies.xlsx',import.meta.url));
await (await SpreadsheetFile.exportXlsx(workbook)).save(output);
