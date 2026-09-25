const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const XLSX=require('../vendor/xlsx.full.min.js');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function fn(name){const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(source.lastIndexOf('\n',i)+1,source.indexOf('\n}',i)+2);}
function setup(overrides={}){
 let id=0;const alerts=[],captures=[];
 const c=vm.createContext({XLSX,Uint8Array,TextDecoder,Blob,Date,Promise,clearTimeout,
  setTimeout:(f,ms)=>setTimeout(f,ms>=5000?25:ms),
  S:{songs:[],notes:[],groups:[],rosters:{},groupId:'group',showId:'show'},U:{view:'setup'},
  render(){},save(){},autoSubs(){},alert:m=>alerts.push(m),confirm:()=>false,
  sigOf:s=>s.title,songName:s=>s.title,copyRecords:()=>({lost:0}),
  addMember:n=>({name:n,id:n}),buildSong:p=>({...p,id:String(++id)}),
  putClip:async(key,blob)=>captures.push({key,blob}),...overrides});
 vm.runInContext(source.match(/^const NAMESEP = .+$/m)[0]+source.match(/^const HAMO_RE = .+$/m)[0]+source.match(/^const cleanName = .+$/m)[0],c);
 vm.runInContext('const looksName = v => nameScore(v) >= 0.6; const SONGS=()=>S.songs.filter(s=>s.showId===S.showId);',c);
 for(const n of ['cleanText','softText','stripParens','splitNames','nameScore','pickSheet','readBubbles','trimExcelRange','parseXLSX','finalize','sortSongsByTitle','importTimeout','captureImportFiles','handleFiles','importSelection']) vm.runInContext(fn(n),c);
 return {c,alerts,captures};
}
function workbook(n,type='xlsx'){
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([
 ['佐藤',`曲${n}の最初の歌詞です`],['','続きの歌詞です'],['鈴木',`曲${n}の最後の歌詞です`]
 ]),'歌割');return XLSX.write(w,{type:'buffer',bookType:type,compression:true});
}
const file=(name,data)=>({name,arrayBuffer:async()=>new Uint8Array(data).buffer});
test('mixed compressed XLSX and legacy XLS all import with lyrics and original bytes',async()=>{
 const {c,alerts,captures}=setup();const f=[file('M10.xlsx',workbook(10)),file('M2.xls',workbook(2,'biff8')),file('M1.xlsx',workbook(1))];
 await c.handleFiles(f);assert.deepEqual(Array.from(c.S.songs,s=>s.title),['M1','M2','M10']);
 assert.deepEqual(Array.from(c.S.songs,s=>s.lines.filter(r=>r[1]).length),[3,3,3]);assert.equal(c.U.songIdx,2);assert.equal(c.U.view,'live');assert.equal(c.U.busy,'');
 assert.equal(alerts.length,0);assert.equal(captures.length,3);assert(c.S.songs.every(s=>s.xls===1));
 const expected=[f[2],f[1],f[0]];for(let i=0;i<3;i++)assert.deepEqual(Buffer.from(await captures[i].blob.arrayBuffer()),Buffer.from(await expected[i].arrayBuffer()));
});
test('one rejected or stalled source does not prevent later Excel imports',async()=>{
 const {c,alerts}=setup();await c.handleFiles([
 {name:'M1.xlsx',arrayBuffer:()=>Promise.reject(new Error('download failed'))},
 {name:'M2.xlsx',arrayBuffer:()=>new Promise(()=>{})},file('M3.xlsx',workbook(3))]);
 assert.equal(c.S.songs.length,1);assert.equal(c.S.songs[0].title,'M3');assert.equal(c.U.busy,'');
 assert.equal(alerts.length,1);assert.match(alerts[0],/1曲/);assert.match(alerts[0],/M1.xlsx/);assert.match(alerts[0],/M2.xlsx/);
});
test('a stalled original Excel save cannot block the other songs or erase imported lyrics',async()=>{
 let calls=0;const {c,alerts}=setup({putClip:()=>++calls===1?new Promise(()=>{}):Promise.resolve()});
 await c.handleFiles([file('M1.xlsx',workbook(1)),file('M2.xlsx',workbook(2))]);
 assert.equal(calls,2);assert.equal(c.S.songs.length,2);assert.equal(c.S.songs[0].xls,undefined);assert.equal(c.S.songs[1].xls,1);assert.equal(c.U.busy,'');assert.match(alerts[0],/歌詞は読み込み済み/);
});
test('file selection remains intact until all files finish; duplicate starts are ignored',async()=>{
 const {c}=setup();let release;const second=workbook(2),first=workbook(1);let reads=0;
 const input={id:'file',value:'selected',files:[{name:'M1.xlsx',arrayBuffer:()=>{reads++;return new Promise(r=>release=()=>r(new Uint8Array(first).buffer));}},{name:'M2.xlsx',arrayBuffer:()=>{reads++;assert.equal(input.value,'selected');return Promise.resolve(new Uint8Array(second).buffer);}}]};
 const pending=c.importSelection(input);await new Promise(r=>setImmediate(r));assert.equal(reads,2);assert.equal(input.value,'selected');await c.importSelection(input);assert.equal(reads,2);
 release();await pending;assert.equal(input.value,'');assert.equal(c.S.songs.length,2);assert.equal(c.U.importing,false);
});
test('empty workbook fails clearly while the following song still imports',async()=>{
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([]),'歌割');
 const {c,alerts}=setup();await c.handleFiles([file('M1.xlsx',XLSX.write(w,{type:'buffer'})),file('M2.xlsx',workbook(2))]);assert.equal(c.S.songs.length,1);assert.match(alerts[0],/読み取れる歌詞/);
});
test('IndexedDB abort rejects original-file storage instead of leaving the batch pending',async()=>{
 let transaction;const c=vm.createContext({db:async()=>({transaction:()=>{transaction={objectStore:()=>({put(){}})};return transaction;}})});vm.runInContext(fn('putClip'),c);
 const p=c.putClip('id',{});await new Promise(r=>setImmediate(r));transaction.onabort();await assert.rejects(p,/中断/);
});
test('text box lyrics use the workbook files without native decompression',()=>{
 const {c}=setup();const entry=text=>({content:Buffer.from(text)});
 const bubbles=c.readBubbles({'xl/worksheets/_rels/sheet1.xml.rels':entry('<Relationship Target="../drawings/drawing1.xml"/>'),'xl/drawings/drawing1.xml':entry('<xdr:twoCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:row>3</xdr:row></xdr:from><a:t>佐藤：テスト &amp; 確認</a:t></xdr:twoCellAnchor>')},0);
 assert.deepEqual(JSON.parse(JSON.stringify(bubbles)),[{c:2,r:3,t:'佐藤：テスト & 確認'}]);
});
module.exports={setup,file};

test('formatting to the end of a worksheet does not expand the import grid',async()=>{
 const {c}=setup();const sheet={A3:{t:'s',v:'先頭の歌詞'},A4:{t:'s',v:'最後の歌詞'},XFD1048576:{t:'z',s:{}},'!ref':'A1:XFD1048576'};
 c.trimExcelRange(sheet);assert.equal(sheet['!ref'],'A1:A4');
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,sheet,'歌詞');
 const result=await c.parseXLSX(file('歌詞.xlsx',XLSX.write(w,{type:'buffer'})));
 assert.deepEqual(Array.from(result.lines.filter(r=>r[1]),r=>[r[0],r[1],r[3]]),[['','先頭の歌詞','A3'],['','最後の歌詞','A4']]);
});
test('blank first sheet and macro or binary Excel formats still find the lyric sheet',async()=>{
 for(const type of ['xlsx','xlsm','xlsb']){const {c}=setup();const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([]),'Sheet1');XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['佐藤','最初の歌詞です'],['鈴木','最後の歌詞です']]),'歌割');
 const result=await c.parseXLSX(file('歌割.'+type,XLSX.write(w,{type:'buffer',bookType:type,compression:true})));assert.equal(result.sheetName,'歌割');assert.equal(result.lines.filter(r=>r[1]).length,2);}
});
