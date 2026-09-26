const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const XLSX=require('../vendor/xlsx.full.min.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function fn(name){const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(source.lastIndexOf('\n',i)+1,source.indexOf('\n}',i)+2);}
function setup(extra={}){
 const c=vm.createContext({XLSX,Uint8Array,Uint32Array,DataView,TextEncoder,TextDecoder,Blob,File,Response,setTimeout,clearTimeout,console,
 U:{},S:{songs:[]},save(){},render(){},renderSheet(){},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},...extra});
 vm.runInContext(source.slice(source.indexOf('const CRCT ='),source.indexOf('\n\n',source.indexOf('  return { data: await zip(files, names), changed };'))),c);
 for(const n of ['fileFailureReason','showFileReport','importTimeout','closeExcelExport','presentExcelExport','excelSourceCandidates','getOriginalExcel','hasAbsentExportChanges','buildAbsentWorkbook','absentExportFilename','runAbsentExport','shareExcelExport'])vm.runInContext(fn(n),c);
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

test('missing originals never silently generate a different workbook layout',async()=>{
 const c=setup({getClip:async()=>null});
 await assert.rejects(c.buildAbsentWorkbook({id:'song',title:'曲',lines:[{t:'歌詞'}]},'欠席ver',{}),/元の書式を保つため/);
});
test('missing original in a batch is reported while the available original keeps its worksheets',async()=>{
 const c=setup({getClip:async key=>key==='xls:good'?new Blob([fixture()]):null,alert:m=>{throw Error(m);},absentIds:()=>['a'],absentTab:()=> '欠席ver',showName:()=> '公演',absentEdits:()=>({A1:'橋田'})});
 await c.runAbsentExport([{id:'missing',title:'元なし',lines:[]},{id:'good',title:'元あり',sheetName:'歌割'}],true);
 assert.equal(c.U.excelExport.count,1);assert.match(c.U.excelExport.failures[0],/元なし/);assert.match(c.U.excelExport.failures[0],/元の書式/);
 const zip=await c.unzip(await c.U.excelExport.blob.arrayBuffer());const wb=XLSX.read(zip.files[zip.order[0]],{type:'array'});
 assert.equal(wb.Sheets['歌割'].A1.v,'相馬');assert.equal(wb.Sheets['欠席ver'].A1.v,'橋田');assert(wb.Sheets['表紙']);
});

test('previously duplicated shows locate the original workbook and preserve its original sheets',async()=>{
 const original={id:'original',title:'曲',showId:'first',sheetName:'歌割',xls:1,lines:[{t:'歌詞です',cell:'A1',lcell:'B1',raw:'相馬'}]};
 const copy={...original,id:'copy',showId:'second',xls:undefined};
 const c=setup({S:{songs:[original,copy],shows:[{id:'first'},{id:'second',from:'first'}]},getClip:async key=>key==='xls:original'?new Blob([fixture()]):null});
 const warnings=[];const data=await c.buildAbsentWorkbook(copy,'欠席ver',{A1:'橋田'},warnings);
 const wb=XLSX.read(data,{type:'array'});assert.equal(wb.Sheets['欠席ver'].A1.v,'橋田');assert.equal(wb.Sheets['歌割'].A1.v,'相馬');assert.equal(wb.Sheets['表紙'].A1.v,'表紙');
 assert.equal(warnings.length,0);assert.equal(copy.xlsSourceId,'original');
});
test('original references survive multiple duplicates and do not select a different arrangement by title',async()=>{
 const original={id:'original',title:'曲',showId:'first',sheetName:'歌割',xls:1,lines:[{t:'別の歌詞',cell:'A1',lcell:'B1'}]};
 const copy={id:'copy',title:'曲',showId:'second',sheetName:'歌割',lines:[{t:'今回の歌詞',cell:'A1',lcell:'B1'}]};
 const c=setup({S:{songs:[original,copy],shows:[{id:'first'},{id:'second',from:'first'}]},getClip:async key=>key==='xls:original'?new Blob([fixture()]):null});
 assert.equal(await c.getOriginalExcel(copy),null);
 copy.xlsSourceId='original';assert(await c.getOriginalExcel(copy));
});

test('new show duplicates keep the original-file reference and worksheet metadata',()=>{
 let seq=0;const song={id:'original',showId:'show',title:'曲',groupId:'g',xls:1,sheetName:'歌割',micSheet:'マイク',lines:[{t:'歌詞',parts:[]}],blocks:{}};
 const c=setup({S:{songs:[song],shows:[{id:'show',name:'公演',groupId:'g'}]},VIEW:()=>false,prompt:()=> '次の公演',uid:()=> 'new'+(++seq),folderOf:()=>'',autoShowGroupId:()=> 'g',impOf:()=>1,selectShow(){},autoSubs(){},schedulePush(){}});
 vm.runInContext(fn('dupShow'),c);c.dupShow('show');assert.equal(c.S.songs[1].xlsSourceId,'original');assert.equal(c.S.songs[1].sheetName,'歌割');assert.equal(c.S.songs[1].micSheet,'マイク');
 c.dupShow(c.S.shows[1].id);assert.equal(c.S.songs[2].xlsSourceId,'original');
});
test('deleting an original cannot delete a workbook referenced by another show',()=>{
 let removed=0;const c=setup({S:{songs:[{id:'copy',xlsSourceId:'original'}]},db:()=>{removed++;return Promise.resolve({transaction:()=>({objectStore:()=>({delete(){}})})});}});
 vm.runInContext(fn('delClip'),c);c.delClip('xls:original');assert.equal(removed,0);
 c.S.songs=[];c.delClip('xls:original');assert.equal(removed,1);
});
