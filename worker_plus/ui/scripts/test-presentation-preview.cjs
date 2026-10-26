const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { presentationPreview } = require('../dist-electron/presentation-preview.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'presentation-preview-'));
try {
 fs.mkdirSync(path.join(root,'reports/rendered_slides'),{recursive:true});fs.mkdirSync(path.join(root,'final'));
 fs.writeFileSync(path.join(root,'order_context.json'),JSON.stringify({order_id:'fixture'}));
 const digest = data => crypto.createHash('sha256').update(data).digest('hex');
 for(const name of ['final.pptx','final.pdf'])fs.writeFileSync(path.join(root,'final',name),name);
 fs.writeFileSync(path.join(root,'reports/rendered_slides/slide-001.png'),'fixture png');
 const data={order_id:'fixture',slides:[{number:1,title:'Slide',notes:'source.pdf pages 2-3'}],rendered:{pptx_sha256:digest('final.pptx'),pdf_sha256:digest('final.pdf'),slides:[{sha256:digest('fixture png')} ]}};
 fs.writeFileSync(path.join(root,'reports/presentation_preview.json'),JSON.stringify(data));
 assert.equal(presentationPreview(root,'fixture').slides.length,1);
 assert(presentationPreview(root,'fixture',1).image.startsWith('data:image/png;base64,'));
 assert.throws(()=>presentationPreview(root,'other',1));assert.throws(()=>presentationPreview(root,'fixture',0));assert.throws(()=>presentationPreview(root,'fixture',2));
 fs.writeFileSync(path.join(root,'final/final.pptx'),'changed');assert.throws(()=>presentationPreview(root,'fixture',1),/تغییر/);
 console.log('Preview IPC: exact order, index bounds and stale image protection passed.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
