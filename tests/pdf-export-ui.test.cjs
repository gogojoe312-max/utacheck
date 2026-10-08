'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const fn=name=>{const i=source.indexOf('function '+name+'(');return source.slice(source.lastIndexOf('\n',i)+1,source.indexOf('\n}',i)+2);};
function fixture(options={}){
 const alerts=[],downloads=[],revoked=[],page={id:'prpage'},button={disabled:false,textContent:'PDFで保存'};let shares=0,prints=0;
 const c=vm.createContext({S:{recMode:false,notes:[{memo:'Keep'}]},U:{view:'print',printPick:null},Blob,File,
 document:{fonts:{ready:Promise.resolve()},querySelectorAll:()=>[button],getElementById:()=>page},
 URL:{createObjectURL:()=> 'blob:pdf-test',revokeObjectURL:x=>revoked.push(x)},window:{print:()=>prints++},
 navigator:{canShare:()=>true,share:async()=>{shares++;if(options.shareError)throw Object.assign(Error('test'),{name:options.shareError});}},
 showName:()=> 'Synthetic show',songName:s=>s.title,SONGS:()=>[],fitPrintDOM(){},renderSheet(){},
 alert:x=>alerts.push(x),downloadBlob:(...args)=>downloads.push(args),
 PrintPDF:{create:async()=>{await options.build?.(c);if(options.error)throw Error('render failure');return {blob:new Blob(['%PDF-1.4 test'],{type:'application/pdf'}),filename:'Synthetic.pdf',pages:2};}}
 });
 for(const name of ['closePdfExport','sharePdfExport','savePrintPDF','autoPrint'])vm.runInContext(fn(name),c);
 return {c,alerts,downloads,revoked,button,shares:()=>shares,prints:()=>prints};
}
test('PDF button creates a real file-ready UI without printing, saving app data or auto-sharing',async()=>{
 const f=fixture(),before=JSON.stringify(f.c.S);f.c.autoPrint();await f.c.savePrintPDF();
 assert.equal(f.prints(),0);assert.equal(f.shares(),0);assert.equal(f.c.U.pdfExport.blob.type,'application/pdf');assert.equal(f.c.U.pdfExport.pages,2);assert.equal(f.c.U.menu.kind,'pdf-export');
 assert.equal(JSON.stringify(f.c.S),before);assert.equal(f.button.disabled,false);assert.equal(f.c.U.pdfBuilding,false);
 await f.c.sharePdfExport();assert.equal(f.shares(),1);assert.equal(f.c.U.pdfExport.url,'blob:pdf-test');f.c.closePdfExport();assert.deepEqual(f.revoked,['blob:pdf-test']);
});
test('share cancellation keeps the PDF and download fallback available',async()=>{
 for(const name of ['AbortError','NotAllowedError']){const f=fixture({shareError:name});await f.c.savePrintPDF();await f.c.sharePdfExport();assert(f.c.U.pdfExport.blob);assert.equal(f.c.U.sharingPdf,false);assert.equal(f.alerts.length,name==='AbortError'?0:1);}
 const f=fixture();f.c.navigator.canShare=()=>false;await f.c.savePrintPDF();await f.c.sharePdfExport();assert.equal(f.downloads.length,1);assert.equal(f.downloads[0][1].type,'application/pdf');
});
test('render failure or changing content never replaces the last successfully prepared PDF',async()=>{
 for(const options of [{error:true},{build:c=>{c.S.notes.push({memo:'New edit'});}},{build:c=>{c.U.view='live';}}]){
  const f=fixture(options),old={url:'blob:old',blob:new Blob(['old']),name:'old.pdf'};f.c.U.pdfExport=old;await f.c.savePrintPDF();assert.equal(f.c.U.pdfExport,old);assert.equal(f.c.U.pdfBuilding,false);assert.equal(f.button.disabled,false);assert.equal(f.alerts.length,1);
 }
});
