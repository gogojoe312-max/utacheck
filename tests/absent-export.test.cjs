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
 for(const n of ['importTimeout','closeExcelExport','presentExcelExport','buildAbsentWorkbook','absentExportFilename','runAbsentExport','shareExcelExport'])vm.runInContext(fn(n),c);
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
 const c=setup({getClip:async()=>new Blob([fixture(type)]),micEdits:()=>({})});
 const data=await c.buildAbsentWorkbook({id:'one',sheetName:'歌割'},'欠席ver',{A1:'橋田'});
 assert.equal(XLSX.read(data,{type:'array'}).Sheets['欠席ver'].A1.v,'橋田');
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
