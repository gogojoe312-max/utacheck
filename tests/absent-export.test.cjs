const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const XLSX=require('../vendor/xlsx.full.min.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function fn(name){const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(source.lastIndexOf('\n',i)+1,source.indexOf('\n}',i)+2);}
function setup(extra={}){
 const c=vm.createContext({XLSX,Uint8Array,Uint32Array,DataView,TextEncoder,TextDecoder,Blob,File,Response,setTimeout,clearTimeout,console,
 U:{},S:{songs:[]},render(){},renderSheet(){},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},...extra});
 vm.runInContext(source.slice(source.indexOf('const CRCT ='),source.indexOf('\n\n',source.indexOf('  return { data: await zip(files, names), changed };'))),c);
 for(const n of ['fileFailureReason','showFileReport','importTimeout','closeExcelExport','presentExcelExport','savedAbsentWorkbook','hasAbsentExportChanges','buildAbsentWorkbook','absentExportFilename','runAbsentExport','shareExcelExport'])vm.runInContext(fn(n),c);
 return c;
}
function fixture(type='xlsx'){
 const wb=XLSX.utils.book_new();
 for(const [name,who] of [['表紙','表紙'],['歌割','相馬'],['マイク','2']])XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[who,'歌詞です']]),name);
 return XLSX.write(wb,{type:'buffer',bookType:type,compression:true});
}
test('portable ZIP roundtrip and original-sheet edits work without CompressionStream',async()=>{
 const c=setup({getClip:async()=>new Blob([fixture()]),micEdits:()=>({A1:'3'})});
 const data=await c.buildAbsentWorkbook({id:'one',sheetName:'歌割',micSheet:'マイク'},'相馬欠席ver',{A1:'橋田'});
 const wb=XLSX.read(data,{type:'array'});
 assert.equal(wb.Sheets['相馬欠席ver'].A1.v,'橋田');assert.equal(wb.Sheets['相馬欠席ver マイク'].A1.v,'3');
 assert.equal(wb.Sheets['歌割'].A1.v,'相馬');assert.equal(wb.Sheets['表紙'].A1.v,'表紙');
 const archive=await c.zip({'日本語.xlsx':data},null,false);const unpacked=await c.unzip(archive);
 assert.deepEqual(Buffer.from(unpacked.files['日本語.xlsx']),Buffer.from(data));
});
test('legacy XLS and XLSB also produce a readable version workbook',async()=>{
 for(const type of ['biff8','xlsb']){
 const legacy=XLSX.read(fixture(type),{type:'buffer'});legacy.Sheets['歌割']['!cols']=[{wch:20,level:1}];
 const c=setup({getClip:async()=>new Blob([XLSX.write(legacy,{type:'buffer',bookType:type})]),micEdits:()=>({})});
 const data=await c.buildAbsentWorkbook({id:'one',sheetName:'歌割'},'欠席ver',{A1:'橋田'});
 assert.equal(XLSX.read(data,{type:'array'}).Sheets['欠席ver'].A1.v,'橋田');
 const z=await c.unzip(data);for(const [name,bytes] of Object.entries(z.files))if(name.startsWith('xl/worksheets/'))assert.doesNotMatch(new TextDecoder().decode(bytes),/\slevel=/);
 }
});
test('batch continues after a broken song and preserves duplicate titles with explicit save',async()=>{
 const alerts=[];
 const c=setup({alert:m=>alerts.push(m),absentIds:()=>['a'],absentTab:()=> '相馬欠席ver',showName:()=> '公演',absentEdits:()=>({A1:'橋田'}),
 getClip:async key=>{if(key==='xls:broken')throw Error('壊れたファイル');return new Blob([fixture()]);},micEdits:()=>({})});
 await c.runAbsentExport([{id:'one',title:'同名/曲',sheetName:'歌割'},{id:'broken',title:'失敗曲'},{id:'two',title:'同名/曲',sheetName:'歌割'}],true);
 assert.equal(alerts.length,0);assert.equal(c.U.excelExport.count,2);assert.match(c.U.excelExport.failures[0],/失敗曲/);
 const zip=await c.unzip(await c.U.excelExport.blob.arrayBuffer());assert.deepEqual(Array.from(zip.order),['同名_曲_相馬欠席ver.xlsx','同名_曲_相馬欠席ver (2).xlsx']);
 assert.equal(c.U.busy,'');assert.equal(c.U.exportingExcel,false);assert.equal(c.U.menu.kind,'excel-export');
});
test('share happens immediately on the explicit click and cancel keeps the download available',async()=>{
 let shared=false;const c=setup({navigator:{canShare:()=>true,share:()=>{shared=true;return Promise.reject(Object.assign(new Error(),{name:'AbortError'}));}},alert(){throw Error('cancel must not alert');}});
 c.presentExcelExport('公演.zip',new Blob(['abc'],{type:'application/zip'}),1,[]);
 const promise=c.shareExcelExport();assert.equal(shared,true);await promise;assert(c.U.excelExport.url);assert.equal(c.U.sharingExcel,false);
});

test('repeated exports preserve existing version tabs and use unique worksheet names',async()=>{
 const c=setup();let data=fixture();
 for(let i=0;i<2;i++)data=(await c.addVersionTab(new Uint8Array(data),'相馬欠席ver',{A1:'橋田'},'歌割')).data;
 const wb=XLSX.read(data,{type:'array'});
 assert(wb.SheetNames.includes('相馬欠席ver'));assert(wb.SheetNames.includes('相馬欠席ver (2)'));
 assert.equal(wb.Sheets['相馬欠席ver (2)'].A1.v,'橋田');assert.equal(wb.Sheets['歌割'].A1.v,'相馬');
});
test('a failure preparing one song cannot stop later exports; all-failed reports remain visible',async()=>{
 const c=setup({alert(){throw Error('unexpected alert');},absentIds:()=>['a'],absentTab:()=> '欠席ver',showName:()=> '公演',
 absentEdits:so=>{if(so.id==='bad')throw new TypeError('Cannot read properties of undefined');return {A1:'橋田'};},getClip:async()=>new Blob([fixture()]),micEdits:()=>({})});
 await c.runAbsentExport([{id:'bad',title:'準備失敗'},{id:'good',title:'成功曲',sheetName:'歌割'}],true);
 assert.equal(c.U.excelExport.count,1);assert.match(c.U.excelExport.failures[0],/準備失敗/);assert.match(c.U.excelExport.failures[0],/原因の特定/);
 await c.runAbsentExport([{id:'bad',title:'準備失敗'}],true);
 assert.equal(c.U.excelExport,null);assert.equal(c.U.fileReport.succeeded.length,0);assert.equal(c.U.fileReport.failed.length,1);assert.equal(c.U.menu.kind,'file-result');assert.equal(c.U.exportingExcel,false);
});

test('missing originals still export saved lyrics with changed main and harmony parts',async()=>{
 const c=setup({getClip:async()=>null,member:id=>({name:{a:'相馬',b:'橋田',c:'島川'}[id]}),
 splitAssign:()=>({main:['b'],extra:['c']}),subOf:()=>['b','c'],blockOf:()=>null});
 const so={id:'song',title:'歌割',lines:[{t:'保存済み歌詞',parts:['a','c'],main:['a'],extra:['c']}]};
 const warnings=[];const bytes=await c.buildAbsentWorkbook(so,'相馬欠席ver',{},warnings);
 const wb=XLSX.read(bytes,{type:'array'});const sh=wb.Sheets['相馬欠席ver'];
 assert.equal(sh.A4.v,'橋田');assert.equal(sh.B4.v,'保存済み歌詞');assert.equal(sh.C4.v,'島川');
 assert.equal(wb.Sheets['元の歌割（保存データ）'].A4.v,'相馬');assert.equal(warnings.length,1);assert.match(warnings[0],/元の書式/);
});
test('fourteen songs with no original files produce fourteen Excel files rather than fourteen failures',async()=>{
 const c=setup({getClip:async()=>null,alert:m=>{throw Error(m);},absentIds:()=>['a'],absentTab:()=> '相馬欠席ver',showName:()=> '公演',
 absentEdits:()=>({}),partsOf:()=>['b'],splitAssign:()=>({main:['b'],extra:[]}),subOf:()=>['b'],blockOf:()=>null,member:id=>({name:id==='a'?'相馬':'橋田'})});
 const songs=Array.from({length:14},(_,i)=>({id:'s'+i,title:'M'+i,lines:[{t:'歌詞'+i,parts:['a']}]}));
 await c.runAbsentExport(songs,true);assert.equal(c.U.excelExport.count,14);assert.equal(c.U.excelExport.failures.length,0);assert.equal(c.U.excelExport.warnings.length,14);
 const z=await c.unzip(await c.U.excelExport.blob.arrayBuffer());assert.equal(z.order.length,14);
 for(const name of z.order){const w=XLSX.read(z.files[name],{type:'array'});assert.equal(w.Sheets['相馬欠席ver'].A4.v,'橋田');}
});
