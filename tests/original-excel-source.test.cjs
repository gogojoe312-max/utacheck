'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
const XLSX=require('../vendor/xlsx.full.min.js'),source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function fn(name){const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(source.lastIndexOf('\n',i)+1,source.indexOf('\n}',i)+2);}
const copy=value=>JSON.parse(JSON.stringify(value));
function song(){return {id:'song',showId:'show',groupId:'rosy',title:'合成曲',sheetName:'歌割',micSheet:'',micMap:null,blocks:{},blockCells:{},blockRows:[],
 lines:[{t:'合成歌詞',raw:'甲',labelRaw:'甲',label:'甲',cell:'A1',lcell:'B1',parts:['member-a']}],roster:['member-a']};}
function fixture({text='合成歌詞',who='甲',sheet='歌割',cover='表紙'}={}){
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[cover]]),'表紙');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[who,text]]),sheet);
 return new Blob([XLSX.write(wb,{type:'buffer',bookType:'xlsx',compression:true})]);
}
function setup(extra={}){
 const clips=new Map(),alerts=[],stats={save:0,backup:0,writes:0,release:0};
 const so=song(),S={songs:[so],shows:[{id:'show',groupId:'rosy'}],rsongs:[],trash:[],members:[{id:'member-a',name:'甲'}],notes:[{id:'note',songId:'song',lineIdx:0,memo:'保持'}],memos:{song:'保持'}};
 const c=vm.createContext({S,U:{},Blob,setTimeout,clearTimeout,typingNow:()=>false,Uint8Array,DataView,TextEncoder,TextDecoder,crypto,XLSX,console,atob,btoa,preview:false,saveErr:false,XLOOK:{song:{cached:true}},
  member:id=>S.members.find(m=>m.id===id),VIEW:()=>false,recordingInboxCanWrite:()=>true,
  enterRecordingInboxEditor:()=>()=>stats.release++,automaticBackupBeforeEdit:async()=>{stats.backup++;return true;},
  save(){stats.save++;},saveNow:async()=>{},packState:s=>copy(s),loadRaw:async()=>JSON.stringify(S),render(){},alert:m=>alerts.push(m),h:String,songName:s=>s.title,
  trimExcelRange(){},
  // Parsing integration is covered by the isolated browser test; here the XLSX bytes
  // supply exact row values while the production matcher validates every stored field.
  parseXLSX:async(file,bytes,local)=>{
   const row=local.workbook.Sheets[local.sheetName],s=song();
   s.lines[0]={...s.lines[0],t:row.B1?.v||'',raw:row.A1?.v||'',labelRaw:row.A1?.v||'',label:row.A1?.v||'',parts:[row.A1?.v||'']};
   s.sheetName=local.sheetName;return s;
  },
  buildSong:parsed=>parsed,getClip:async key=>clips.get(key),putClip:async(key,blob)=>{stats.writes++;clips.set(key,blob);},
  storedOriginalExcelEntries:async()=>[...clips].map(([key,blob])=>({key,blob})),importTimeout:async p=>p,fileFailureReason:e=>e.message,showFileReport:(title,succeeded,failed,warnings)=>{c.report={title,succeeded,failed,warnings};},...extra});
 for(const name of ['startupExcelDigest','startupExcelWithinBudget','excelSourceCandidates','originalExcelLayout','originalExcelSourceGroupAllowed','readOriginalExcel','originalExcelSheet','inspectOriginalExcel','originalExcelAttachment','attachOriginalExcelMetadata','getOriginalExcel','storeOriginalExcel','originalExcelRepairHTML','reattachOriginalExcel','originalExcelGroupTargets','reattachOriginalExcelBatch','prepareOriginalExcelAttachment'])vm.runInContext(fn(name),c);
 return {c,clips,alerts,stats,so:c.S.songs[0]};
}
test('same-sheet exact original passes without modifying IDs, lyrics, members or notes',async()=>{
 const {c,so}=setup();const before=JSON.stringify(c.S);
 assert.equal(await c.inspectOriginalExcel(so,fixture()),true);assert.equal(JSON.stringify(c.S),before);
 for(const input of [fixture({text:'別の歌詞'}),fixture({who:'乙'}),fixture({sheet:'別歌割'})])assert.equal(await c.inspectOriginalExcel(so,input),false);
 assert.equal(JSON.stringify(c.S),before);
});
test('matching rejects shifted rows, group definitions and continuation changes',async()=>{
 for(const change of [
  s=>s.lines[0].lcell='B2',s=>s.lines[0].extraCell='C1',s=>s.lines[0].cont=true,
  s=>s.lines[0].cut=1,s=>s.blockCells={A:'D1'},s=>s.blockRows=[{b:'A',ncell:'C1',lcell:'D1'}],
  s=>s.blocks={A:['member-a']},s=>{s.micSheet='マイク';s.micMap={'甲':'1'};}
 ]){
  const {c,so}=setup();change(so);assert.equal(await c.inspectOriginalExcel(so,fixture()),false);
 }
});
test('missing coordinates and missing member identities fail closed',async()=>{
 const {c,so}=setup();so.lines[0].lcell='';assert.equal(await c.inspectOriginalExcel(so,fixture()),false);
 so.lines[0].lcell='B1';so.lines[0].parts=['unknown'];await assert.rejects(c.inspectOriginalExcel(so,fixture()),/担当名/);
});
test('immutable archive uses verified bytes, deduplicates, and leaves old song-key files untouched',async()=>{
 const {c,clips,stats}=setup();const old=fixture({text:'前の歌詞'});clips.set('xls:song',old);
 const blob=fixture(),id=await c.storeOriginalExcel(blob);
 assert.match(id,/^sha256-[a-f0-9]{64}$/);assert.equal(await c.startupExcelDigest(clips.get('xls:'+id)),id.slice(7));
 assert.equal(await c.storeOriginalExcel(blob),id);assert.equal(stats.writes,1);assert.equal(clips.get('xls:song'),old);
});
test('archive rejects corrupted existing address and failed independent readback',async()=>{
 const {c,clips,stats}=setup(),blob=fixture(),id='sha256-'+await c.startupExcelDigest(blob);
 clips.set('xls:'+id,fixture({text:'別の歌詞'}));await assert.rejects(c.storeOriginalExcel(blob),/上書きしていません/);assert.equal(stats.writes,0);
 clips.clear();c.putClip=async key=>clips.set(key,fixture({text:'保存破損'}));await assert.rejects(c.storeOriginalExcel(blob),/保存後確認/);
});
test('pinned original beats a stale own-song file and does not mutate state on read',async()=>{
 const {c,clips,so,stats}=setup(),blob=fixture();const id=await c.storeOriginalExcel(blob);so.xlsSourceId=id;
 clips.set('xls:song',fixture({text:'古い別歌詞'}));const before=JSON.stringify(c.S);
 assert.equal(await c.getOriginalExcel(so),blob);assert.equal(JSON.stringify(c.S),before);assert.equal(stats.save,0);
});
test('read-only recovery searches existing retained files and refuses differing matching originals',async()=>{
 const {c,clips,so}=setup(),original=fixture();clips.set('xls:orphan',original);const before=JSON.stringify(c.S);
 assert.equal(await c.getOriginalExcel(so,true),original);assert.equal(JSON.stringify(c.S),before);
 clips.set('xls:other',fixture({cover:'別の表紙'}));assert.equal(await c.getOriginalExcel(so,true),null);
 clips.set('xls:other',original);assert.equal(await c.getOriginalExcel(so,true),original);
});
test('retained recovery archives must match their content-addressed key',async()=>{
 const {c,so}=setup(),blob=fixture(),hash=await c.startupExcelDigest(blob);
 c.storedOriginalExcelEntries=async()=>[{key:'preserved:excel:v1:'+hash,blob}];assert.equal(await c.getOriginalExcel(so,true),blob);
 c.storedOriginalExcelEntries=async()=>[{key:'preserved:excel:v1:'+'0'.repeat(64),blob}];assert.equal(await c.getOriginalExcel(so,true),null);
});
test('source discovery traverses ancestors independently and excludes hidden other-group matches',()=>{
 const {c,so}=setup();so.from='parent';so.xlsSourceId='parent';
 c.S.songs.push({...copy(so),id:'parent',from:'grand',xlsSourceId:''},{...copy(so),id:'grand',from:'',xlsSourceId:'immutable'},{...copy(so),id:'ocha',groupId:'ocha',from:'',xlsSourceId:'',xls:1});
 const ids=Array.from(c.excelSourceCandidates(so));assert(ids.includes('grand'));assert(ids.includes('immutable'));assert(!ids.includes('ocha'));
 const only=setup();only.c.S.songs.push({...copy(only.so),id:'ocha',groupId:'ocha',xls:1});assert.deepEqual(Array.from(only.c.excelSourceCandidates(only.so)),[]);
});
test('reattachment changes only source metadata after backup and readback, retaining old originals',async()=>{
 const {c,so,clips,alerts,stats}=setup();const before=copy(c.S),old=fixture({text:'old'});clips.set('xls:song',old);
 const blob=fixture();assert.equal(await c.reattachOriginalExcel(so.id,{name:'原本.xlsx',size:blob.size,arrayBuffer:()=>blob.arrayBuffer()}),true);
 assert.match(so.xlsSourceId,/^sha256-/);assert.equal(so.xls,1);assert(so.xlsAt);
 const after=copy(c.S);for(const k of ['xlsSourceId','xls','xlsAt'])delete after.songs[0][k];
 assert.deepEqual(after,before);assert.equal(clips.get('xls:song'),old);assert.equal(stats.backup,1);assert.equal(stats.save,1);
 assert.equal(c.XLOOK.song,undefined);assert.match(alerts[0],/保存後の一致/);assert.equal(stats.release,1);
});
test('wrong reattachment and denied local backup preserve all existing state and sources',async()=>{
 for(const deny of [false,true]){
  const {c,so,clips,stats}=setup();const before=JSON.stringify(c.S);
  if(deny)c.automaticBackupBeforeEdit=async()=>false;
  const blob=fixture(deny?{}:{text:'別の歌詞'}),file={name:'原本.xlsx',size:blob.size,arrayBuffer:()=>blob.arrayBuffer()};
  if(deny)assert.equal(await c.reattachOriginalExcel(so.id,file),false);
  else await assert.rejects(c.reattachOriginalExcel(so.id,file),/一致しません/);
  assert.equal(JSON.stringify(c.S),before);assert.equal(clips.size,0);assert.equal(stats.save,0);
 }
});
test('a song changed during backup is not rebound',async()=>{
 const {c,so,clips,stats}=setup(),blob=fixture();c.automaticBackupBeforeEdit=async()=>{so.lines[0].t='new edit';return true;};
 await assert.rejects(c.reattachOriginalExcel(so.id,{name:'原本.xlsx',arrayBuffer:()=>blob.arrayBuffer()}),/曲が変わりました/);
 assert.equal(so.lines[0].t,'new edit');assert.equal(so.xlsSourceId,undefined);assert.equal(clips.size,0);assert.equal(stats.save,0);
});
test('failed state save is never presented as successful reattachment',async()=>{
 const {c,so,alerts}=setup(),blob=fixture();c.saveNow=async()=>{c.saveErr=true;};
 await assert.rejects(c.reattachOriginalExcel(so.id,{name:'原本.xlsx',arrayBuffer:()=>blob.arrayBuffer()}),/紐付けを保存できません/);
 assert.equal(alerts.length,0);
});
test('original replacement is archived before any lyric remapping and never overwrites the old song key',()=>{
 const swap=fn('swapSong');assert(swap.indexOf('storeOriginalExcel')<swap.indexOf('pushUndo'));
 assert.doesNotMatch(swap,/putClip\("xls:"/);assert.match(swap,/delete XLOOK\[so.id\]/);
 assert(swap.indexOf('swapUnchanged()',swap.indexOf('storeOriginalExcel'))<swap.indexOf('pushUndo'));
 assert(swap.indexOf('S.members.push(...pendingMembers)')>swap.indexOf('pushUndo'));
 assert.match(fn('handleFiles'),/storeOriginalExcel/);assert.doesNotMatch(fn('handleFiles'),/再取り込みが必要/);
 assert.match(source,/case "excel-reattach": originalExcelFileInput\(id\)/);
 assert.match(fn('importSelection'),/input.id === "exceloriginalfile"/);
});

test('missing or corrupted pinned bytes cannot fall back to a differently formatted workbook',async()=>{
 for(const corrupt of [false,true]){
  const {c,clips,so}=setup(),a=fixture(),b=fixture({cover:'別の表紙'});
  so.xlsSourceId='sha256-'+await c.startupExcelDigest(a);
  clips.set('xls:song',b);clips.set('xls:other',b);
  if(corrupt)clips.set('xls:'+so.xlsSourceId,b);
  assert.equal(await c.getOriginalExcel(so,true),null);
  clips.set('xls:lost-alias',a);assert.equal(await c.getOriginalExcel(so,true),a);
 }
});
test('state readback mismatch never reports a successful reattachment',async()=>{
 const {c,so,alerts}=setup(),blob=fixture();c.loadRaw=async()=>'{}';
 await assert.rejects(c.reattachOriginalExcel(so.id,{name:'原本.xlsx',arrayBuffer:()=>blob.arrayBuffer()}),/紐付けを保存できません/);
 assert.equal(alerts.length,0);
});

test('stored-file search cannot reintroduce a known other-group source',async()=>{
 const {c,so,clips}=setup(),blob=fixture();c.S.songs.push({...copy(so),id:'other',groupId:'ocha',xls:1});
 clips.set('xls:other',blob);assert.equal(await c.getOriginalExcel(so,true),null);
});
test('cancelled source search stops before reading further preserved originals',async()=>{
 const {c,so,clips}=setup();clips.set('xls:one',fixture({text:'other'}));clips.set('xls:two',fixture());
 let active=true,inspected=0;c.inspectOriginalExcel=async()=>{inspected++;active=false;return false;};
 assert.equal(await c.getOriginalExcel(so,true,()=>active),null);assert.equal(inspected,1);
});
test('pending draft changes stop attachment before source storage',async()=>{
 const {c,so,clips}=setup(),blob=fixture();c.automaticBackupBeforeEdit=async()=>{c.U.sheet={memo:'unsaved typing'};return true;};
 await assert.rejects(c.reattachOriginalExcel(so.id,{name:'原本.xlsx',arrayBuffer:()=>blob.arrayBuffer()}),/曲が変わりました/);
 assert.equal(so.xlsSourceId,undefined);assert.equal(clips.size,0);
});

test('replacement cancellation and archive-time edits cannot remap existing records or create members',async()=>{
 for(const change of ['cancel','notes','selection','typing']){
  const {c,so,stats}=setup(),beforeLines=JSON.stringify(so.lines);let undo=0,saved=0;
  c.parseXLSX=async()=>({title:'new title',lines:copy(so.lines)});
  c.buildSong=(parsed,local)=>{local.addMember('new member');return {...copy(so),...parsed};};
  c.uid=()=> 'new-id';c.cleanName=x=>x;c.lineMap=()=>new Map([[0,0]]);
  c.confirm=()=>change!=='cancel';c.pushUndo=()=>undo++;c.save=()=>saved++;
  c.storeOriginalExcel=async()=>{if(change==='notes')c.S.notes[0].memo='new edit';if(change==='selection')c.U.songIdx=5;if(change==='typing')c.typingNow=()=>true;return 'sha256-'+'a'.repeat(64);};
  vm.runInContext(fn('swapSong'),c);
  await c.swapSong(so.id,{name:'new.xlsx',arrayBuffer:async()=>new Uint8Array([1]).buffer});
  assert.equal(JSON.stringify(so.lines),beforeLines);assert.equal(so.title,'合成曲');assert.equal(undo,0);assert.equal(saved,0);assert.equal(c.S.members.length,1);
  if(change==='notes')assert.equal(c.S.notes[0].memo,'new edit');
 }
});

const inputFile=(blob,name='元Excel.xlsx')=>({name,size:blob.size,arrayBuffer:()=>blob.arrayBuffer()});
test('batch repair reuses one verified original across shows in the selected group only',async()=>{
 const {c,so,clips,stats}=setup(),other={...copy(so),id:'other-group',groupId:'ocha'},duplicate={...copy(so),id:'duplicate',showId:'show2'};
 c.S.shows.push({id:'show2',groupId:'rosy'});c.S.songs.push(duplicate,other);const before=copy(c.S);
 const result=await c.reattachOriginalExcelBatch(so.id,[inputFile(fixture()),inputFile(fixture({text:'unrelated'}),'元Excel.xlsx')]);
 assert.equal(result.restored,2);assert.equal(result.files,1);assert.equal(stats.backup,1);assert.equal(stats.save,1);
 assert.equal(c.S.songs[0].xlsSourceId,c.S.songs[1].xlsSourceId);assert.deepEqual(c.S.songs[2],before.songs[2]);assert.equal(clips.size,1);
 const next=copy(c.S);for(const song of next.songs.slice(0,2))for(const k of ['xlsSourceId','xls','xlsAt'])delete song[k];
 assert.deepEqual(next,before);assert.equal(c.report.succeeded.length,2);assert.equal(c.report.warnings.length,1);
});
test('batch repair keeps ambiguous files unbound and explicitly rebinds a reselected matching original',async()=>{
 const first=setup(),a=fixture(),b=fixture({cover:'re-saved original'});
 const before=JSON.stringify(first.c.S),result=await first.c.reattachOriginalExcelBatch(first.so.id,[inputFile(a),inputFile(b)]);
 assert.equal(result.restored,0);assert.equal(JSON.stringify(first.c.S),before);assert.equal(first.clips.size,0);
 const second=setup(),oldId=await second.c.storeOriginalExcel(a);second.so.xlsSourceId=oldId;
 assert.equal((await second.c.reattachOriginalExcelBatch(second.so.id,[inputFile(b)])).restored,1);
 assert.notEqual(second.so.xlsSourceId,oldId);assert.equal(second.clips.get('xls:'+oldId),a);
 assert.equal(await second.c.inspectOriginalExcel(second.so,await second.c.getOriginalExcel(second.so)),true);
});
test('batch repair prefers the already pinned original when both identical layouts are supplied',async()=>{
 const {c,so}=setup(),a=fixture(),b=fixture({cover:'different original'}),id=await c.storeOriginalExcel(a);so.xlsSourceId=id;
 assert.equal((await c.reattachOriginalExcelBatch(so.id,[inputFile(b),inputFile(a)])).restored,1);assert.equal(so.xlsSourceId,id);
});
test('batch repair uses content and not filenames, and caches parsing for duplicated shows',async()=>{
 const {c,so}=setup();for(let i=0;i<20;i++)c.S.songs.push({...copy(so),id:'copy'+i});
 let parses=0;const real=c.parseXLSX;c.parseXLSX=async(...args)=>{parses++;return real(...args);};
 const result=await c.reattachOriginalExcelBatch(so.id,[inputFile(fixture(),'unrelated filename.xlsx')]);
 assert.equal(result.restored,21);assert.equal(parses,1);
});
test('batch repair refuses edits during checkpoint and cannot report failed readback as success',async()=>{
 for(const during of ['checkpoint','readback']){
  const {c,so,clips}=setup();
  if(during==='checkpoint')c.automaticBackupBeforeEdit=async()=>{c.S.notes[0].memo='new edit';return true;};
  else c.loadRaw=async()=>'{}';
  await assert.rejects(c.reattachOriginalExcelBatch(so.id,[inputFile(fixture())]),during==='checkpoint'?/編集内容が変わり/:/保存後確認/);
  assert.equal(c.report,undefined);
  if(during==='checkpoint'){assert.equal(so.xlsSourceId,undefined);assert.equal(c.S.notes[0].memo,'new edit');assert.equal(clips.size,0);}
 }
});
test('batch repair is bounded and rejects unknown group without writing',async()=>{
 const {c,so,clips}=setup(),file=inputFile(fixture());
 await assert.rejects(c.reattachOriginalExcelBatch(so.id,Array(101).fill(file)),/100ファイル/);
 so.groupId='';c.S.shows=[];await assert.rejects(c.reattachOriginalExcelBatch(so.id,[file]),/対象グループ/);assert.equal(clips.size,0);
});

test('reattachment restores omitted sheet and cell metadata without remapping any annotations',async()=>{
 const {c,so}=setup(),blob=fixture();so.xls=1;so.sheetName='';so.lines[0].cell='';so.lines[0].lcell='';
 const lyric=JSON.stringify([so.lines[0].t,so.lines[0].parts,c.S.notes,c.S.memos]);
 assert.equal(await c.reattachOriginalExcel(so.id,inputFile(blob)),true);
 assert.equal(so.sheetName,'歌割');assert.equal(so.lines[0].cell,'A1');assert.equal(so.lines[0].lcell,'B1');
 assert.equal(JSON.stringify([so.lines[0].t,so.lines[0].parts,c.S.notes,c.S.memos]),lyric);
 assert.equal(await c.inspectOriginalExcel(so,blob),true);
});
test('missing metadata recovery refuses ambiguous sheets and supplied conflicting coordinates',async()=>{
 const {c,so}=setup();so.sheetName='';
 const wb=XLSX.read(await fixture().arrayBuffer(),{type:'array'});XLSX.utils.book_append_sheet(wb,copy(wb.Sheets['歌割']),'同じ歌割');
 assert.equal(await c.originalExcelAttachment(so,new Blob([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})])),null);
 so.sheetName='歌割';so.lines[0].lcell='B2';assert.equal(await c.originalExcelAttachment(so,fixture()),null);
});
test('all-original linking covers existing copies across artists and REC without adding songs',async()=>{
 const {c,so}=setup();const other={...copy(so),id:'other',groupId:'ocha'},rec={...copy(so),id:'rec',groupId:'rec'};
 c.S.songs.push(other);c.S.rsongs.push(rec);const before=copy(c.S);
 assert.equal((await c.reattachOriginalExcelBatch('__all__',[inputFile(fixture())])).restored,3);
 const after=copy(c.S);for(const song of [...after.songs,...after.rsongs])for(const key of ['xlsSourceId','xls','xlsAt'])delete song[key];
 assert.deepEqual(after,before);
});
async function packetFor(c,blob,name='原本.xlsx') {return {app:'utacheck-original-excel',version:1,name,size:blob.size,sha256:await c.startupExcelDigest(blob),base64:Buffer.from(await blob.arrayBuffer()).toString('base64')};}
test('private original delivery preserves current state until transaction and links every matching copy',async()=>{
 const {c,so,clips}=setup();c.S.songs.push({...copy(so),id:'copy'});const before=JSON.stringify(c.S),packet=await packetFor(c,fixture());
 const result=await c.prepareOriginalExcelAttachment(c.S,packet);
 assert.equal(result.linked,2);assert.equal(result.stored,1);assert.equal(result.unmatched,0);assert.equal(JSON.stringify(c.S),before);
 assert.equal(result.state.songs[0].xlsSourceId,'sha256-'+packet.sha256);assert.equal(result.state.songs[1].xlsSourceId,'sha256-'+packet.sha256);
 assert(clips.has('xls:sha256-'+packet.sha256));assert.deepEqual(copy(result.state.notes),copy(c.S.notes));
 const different=await c.prepareOriginalExcelAttachment(c.S,await packetFor(c,fixture({text:'別の歌詞'})));
 assert.equal(different.linked,0);assert.equal(different.unmatched,1);assert.equal(JSON.stringify(different.state),before);
});
test('private original delivery verifies bytes and stops changed sessions before linking',async()=>{
 const {c,clips}=setup(),packet=await packetFor(c,fixture()),before=JSON.stringify(c.S);
 await assert.rejects(c.prepareOriginalExcelAttachment(c.S,{...packet,sha256:'0'.repeat(64)}),/原本と一致/);assert.equal(clips.size,0);
 await assert.rejects(c.prepareOriginalExcelAttachment(c.S,packet,{isActive:()=>false}),error=>error.code==='DEFERRED');
 assert.equal(JSON.stringify(c.S),before);assert.equal(clips.size,0);
});
test('legacy delivery stores both originals and only links a matching layout-preserving export copy',async()=>{
 const {c,clips}=setup(),original=fixture(),converted=fixture({cover:'converted styling'}),packet=await packetFor(c,original,'元原稿.xls');
 const render=await packetFor(c,converted,'元原稿.xlsx');delete render.app;delete render.version;packet.exportFile=render;
 const before=JSON.stringify(c.S),result=await c.prepareOriginalExcelAttachment(c.S,packet);
 assert.equal(result.linked,1);assert.equal(result.stored,2);assert.equal(result.state.songs[0].xlsSourceId,'sha256-'+render.sha256);
 assert(clips.has('xls:sha256-'+packet.sha256));assert(clips.has('xls:sha256-'+render.sha256));assert.equal(JSON.stringify(c.S),before);
 const wrong=await packetFor(c,fixture({text:'違う曲'}),'元原稿.xlsx');delete wrong.app;delete wrong.version;
 assert.equal((await c.prepareOriginalExcelAttachment(c.S,{...packet,exportFile:wrong})).linked,0);
});
test('automatic originals preserve a verified existing format while repairing missing stored bytes',async()=>{
 for(const present of [true,false]){
  const {c,so,clips}=setup(),a=fixture(),b=fixture({cover:'another format'}),oldId=await c.storeOriginalExcel(a);so.xlsSourceId=oldId;
  if(!present)clips.delete('xls:'+oldId);
  const packet=await packetFor(c,b),result=await c.prepareOriginalExcelAttachment(c.S,packet);
  assert.equal(result.state.songs[0].xlsSourceId,present?oldId:'sha256-'+packet.sha256);
  assert.equal(result.linked,present?0:1);
 }
});
