const testContext = require('./inbox-test-context.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const XLSX=require('../vendor/xlsx.full.min.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function fn(name){const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(source.lastIndexOf('\n',i)+1,source.indexOf('\n}',i)+2);}
function setup(extra={}){
 const c=testContext({XLSX,Uint8Array,Uint32Array,DataView,TextEncoder,TextDecoder,Blob,File,Response,setTimeout,clearTimeout,console,
 U:{},S:{songs:[]},names:ids=>ids.join("・"),absentIds:()=>[],showName:()=>"公演",songMemo:()=>"",gsubOf:()=>null,splitAssign:()=>({main:[],extra:[]}),subOf:()=>null,labelOf:(so,i)=>so.lines[i].label||"",covers:(n,i)=>n.lineIdx===i,tagName:x=>x,pitchLabel:x=>x,inspectOriginalExcel:async()=>true,startupExcelDigest:async blob=>Buffer.from(await blob.arrayBuffer()).toString("base64"),storedOriginalExcelEntries:async()=>[],originalExcelSourceGroupAllowed:()=>true,save(){},render(){},renderSheet(){},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},...extra});
 vm.runInContext(source.slice(source.indexOf('const CRCT ='),source.indexOf('\n\n',source.indexOf('  return { data: await zip(files, names), changed };'))),c);
 for(const n of ['fileFailureReason','showFileReport','importTimeout','closeExcelExport','presentExcelExport','excelSourceCandidates','getOriginalExcel','hasAbsentExportChanges','lyricBreakOffsets','excelNoteText','savedExcelAssignment','savedSongWorkbook','exportCheckXlsx','buildAbsentWorkbook','absentExportFilename','runAbsentExport','shareExcelExport'])vm.runInContext(fn(n),c);
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

test('missing originals export saved lyrics, assignment changes and line breaks without rebinding',async()=>{
 const song={id:'song',title:'曲',blocks:{A:['甲']},lines:[{t:'合成😀歌詞',label:'甲',lyricBreaks:[3]},{gap:true,t:''},{t:'カット部分',label:'A',cut:1}]};
 const c=setup({S:{songs:[song]},getClip:async()=>null,labelOf:(so,i)=>i===0?'乙':so.lines[i].label||'',gsubOf:()=>['乙'],songMemo:()=> '総括を保持'});
 const before=JSON.stringify(c.S),rebuilt=[];
 const data=await c.buildAbsentWorkbook(song,'欠席ver',{},rebuilt),wb=XLSX.read(data,{type:'array'});
 const rows=XLSX.utils.sheet_to_json(wb.Sheets['欠席ver'],{header:1,defval:''});
 assert.deepEqual(rebuilt,['song']);assert.equal(JSON.stringify(c.S),before);
 assert(rows.some(r=>String(r[0]).includes('元Excelの体裁は含みません')));
 assert(rows.some(r=>r[0]==='A'&&r[1]==='乙'));
 assert(rows.some(r=>r[0]===1&&r[2]==='乙'&&r[3]==='合成😀\n歌詞'));
 assert(rows.some(r=>r[0]===3&&r[1]==='カット'&&r[3]==='カット部分'));
 assert(!rows.some(r=>r[0]===2));assert(rows.some(r=>r[0]==='総括'&&r[1]==='総括を保持'));
});
test('missing originals and original-format workbooks can be saved together in one batch',async()=>{
 const c=setup({getClip:async key=>key==='xls:good'?new Blob([fixture()]):null,alert:m=>{throw Error(m);},absentIds:()=>['a'],absentTab:()=> '欠席ver',showName:()=> '公演',absentEdits:()=>({A1:'橋田'})});
 await c.runAbsentExport([{id:'missing',title:'元なし',lines:[{t:'保存済み歌詞',label:'橋田'}]},{id:'good',title:'元あり',sheetName:'歌割'}],true);
 assert.equal(c.U.excelExport.count,2);assert.equal(c.U.excelExport.failures.length,0);
 assert.deepEqual(Array.from(c.U.excelExport.rebuiltExcelIds),['missing']);
 const zip=await c.unzip(await c.U.excelExport.blob.arrayBuffer());const wb=XLSX.read(zip.files[zip.order[1]],{type:'array'});
 assert.equal(wb.Sheets['歌割'].A1.v,'相馬');assert.equal(wb.Sheets['欠席ver'].A1.v,'橋田');assert(wb.Sheets['表紙']);
 const rebuilt=XLSX.read(zip.files[zip.order[0]],{type:'array'});
 assert(XLSX.utils.sheet_to_json(rebuilt.Sheets['欠席ver'],{header:1}).some(r=>r[3]==='保存済み歌詞'));
});
test('failed source reads also export saved rows, while genuinely missing lyrics report that specific failure',async()=>{
 const c=setup({getClip:async()=>{throw Error('source read failure');}}),rebuilt=[];
 const data=await c.buildAbsentWorkbook({id:'saved',title:'曲',lines:[{t:'保存済み歌詞'}]},'欠席ver',{},rebuilt);
 assert(XLSX.read(data,{type:'array'}).Sheets['欠席ver']);assert.deepEqual(rebuilt,['saved']);
 await assert.rejects(c.buildAbsentWorkbook({id:'empty',lines:[]},'欠席ver',{},rebuilt),/歌詞が保存されていない/);
 assert.deepEqual(rebuilt,['saved']);
});
test('check export keeps annotation text and its lyric range even without the source workbook',async()=>{
 const so={id:'check',title:'記録の曲',lines:[{label:'甲',t:'合成😀歌詞'}]};
 const c=setup({S:{songs:[so],showId:'show'},getClip:async()=>null,NOTES:()=>[{songId:'check',showId:'show',lineIdx:0,from:2,to:2,tags:['音程'],memo:'確認',hand:{text:'手書き内容',state:'draft'}}],alert:m=>{throw Error(m);}});
 await c.exportCheckXlsx('check');assert.equal(c.U.excelExport.count,1);
 const wb=XLSX.read(await c.U.excelExport.blob.arrayBuffer(),{type:'array'});
 const row=XLSX.utils.sheet_to_json(wb.Sheets['チェック'],{header:1}).find(r=>r[0]===1);
 assert.equal(row[2],'甲');assert.equal(row[3],'合成😀歌詞');assert.match(row[4],/「😀」音程 確認 手書き：手書き内容（自動認識・未確認）/);
});

test('previously duplicated shows locate the original workbook and preserve its original sheets',async()=>{
 const original={id:'original',title:'曲',showId:'first',sheetName:'歌割',xls:1,lines:[{t:'歌詞です',cell:'A1',lcell:'B1',raw:'相馬'}]};
 const copy={...original,id:'copy',showId:'second',xls:undefined};
 const c=setup({S:{songs:[original,copy],shows:[{id:'first'},{id:'second',from:'first'}]},getClip:async key=>key==='xls:original'?new Blob([fixture()]):null});
 const warnings=[];const data=await c.buildAbsentWorkbook(copy,'欠席ver',{A1:'橋田'},warnings);
 const wb=XLSX.read(data,{type:'array'});assert.equal(wb.Sheets['欠席ver'].A1.v,'橋田');assert.equal(wb.Sheets['歌割'].A1.v,'相馬');assert.equal(wb.Sheets['表紙'].A1.v,'表紙');
 assert.equal(warnings.length,0);assert.equal(copy.xlsSourceId,undefined);
});
test('original references survive multiple duplicates and do not select a different arrangement by title',async()=>{
 const original={id:'original',title:'曲',showId:'first',sheetName:'歌割',xls:1,lines:[{t:'別の歌詞',cell:'A1',lcell:'B1'}]};
 const copy={id:'copy',title:'曲',showId:'second',sheetName:'歌割',lines:[{t:'今回の歌詞',cell:'A1',lcell:'B1'}]};
 const c=setup({S:{songs:[original,copy],shows:[{id:'first'},{id:'second',from:'first'}]},getClip:async key=>key==='xls:original'?new Blob([fixture()]):null});
 assert.equal(await c.getOriginalExcel(copy),null);
 copy.xlsSourceId='original';c.inspectOriginalExcel=async()=>false;assert.equal(await c.getOriginalExcel(copy),null);
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

test('explicit worksheet names are decoded exactly and never fall back to the first sheet',async()=>{
 const c=setup(),wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['cover']]),'表紙');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['original']]),'歌割 & 声');
 const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx',compression:true});
 const data=(await c.addVersionTab(new Uint8Array(bytes),'欠席ver',{A1:'変更'},'歌割 & 声')).data;
 const read=XLSX.read(data,{type:'array'});assert.equal(read.Sheets['欠席ver'].A1.v,'変更');
 assert.equal(read.Sheets['歌割 & 声'].A1.v,'original');assert.equal(read.Sheets['表紙'].A1.v,'cover');
 await assert.rejects(c.addVersionTab(new Uint8Array(bytes),'欠席ver',{A1:'変更'},'存在しない歌割'),/対象シート/);
});

test('saved export resolves continuation harmony substitutions and member-ID-only assignments',()=>{
 const so={id:'song',title:'歌割を保持',lines:[
  {t:'継続の歌詞',cont:true,label:'ハモ 乙',parts:['甲','乙'],main:['甲'],extra:['乙']},
  {t:'名札なしの歌詞',parts:['甲','丙'],main:['甲'],extra:['丙']}
 ]};
 const c=setup({S:{songs:[so],showId:'show',shows:[{id:'show',absent:['乙']}],subs:{'show|song':{0:['甲','丙']}},gsubs:{}}});
 vm.runInContext(source.slice(source.indexOf('const absentIds ='),source.indexOf('// その曲の指摘の中身')),c);
 vm.runInContext(fn('labelOf'),c);
 const before=JSON.stringify(c.S),wb=XLSX.read(c.savedSongWorkbook(so,'欠席ver'),{type:'array'});
 const rows=XLSX.utils.sheet_to_json(wb.Sheets['欠席ver'],{header:1});
 assert(rows.some(r=>r[0]===1&&r[2]==='甲　ハモ 丙'));assert(rows.some(r=>r[0]===2&&r[2]==='甲　ハモ 丙'));
 assert.equal(JSON.stringify(c.S),before);
});
