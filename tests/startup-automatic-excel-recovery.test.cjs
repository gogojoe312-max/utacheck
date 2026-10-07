'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const {appContext,settle,until,XLSX}=require('./startup-excel-recovery-fixture.cjs');
const Restoration=require('../startup-file-restoration.js');

const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const originalId=n=>'PRIVATE_ORIGINAL_'+String(n).padStart(3,'0');
const lyric=n=>'PRIVATE_LYRIC_'+String(n).padStart(3,'0')+' 渡る風、とても遠い空。';
function emptyState(extra={}){
  return {deviceId:'PRIVATE_DEVICE',groups:[{id:'PRIVATE_GROUP',name:'PRIVATE_GROUP_NAME',src:'',key:'PRIVATE_GROUP_KEY'}],
    groupId:'PRIVATE_GROUP',shows:[{id:'PRIVATE_SHOW_0',name:'PRIVATE_SHOW_NAME_0',privateMemo:'PRIVATE_SHOW_MEMO',hidden:true},
      {id:'PRIVATE_SHOW_1',name:'PRIVATE_SHOW_NAME_1',from:'PRIVATE_SHOW_0',absent:['PRIVATE_MEMBER']}],showId:'PRIVATE_SHOW_1',
    songs:[],rsongs:[],notes:[],pubNotes:[],members:[{id:'PRIVATE_MEMBER',name:'既存担当'}],trash:[],memos:{},staffMemos:{},draws:{},recs:{},
    subs:{'PRIVATE_OLD_SHOW|PRIVATE_OLD_SONG':{0:['PRIVATE_MEMBER']}},gsubs:{'PRIVATE_OLD_SHOW|PRIVATE_OLD_SONG':{A:['PRIVATE_MEMBER']}},
    subsMan:{PRIVATE_OLD:[]},subLib:{PRIVATE_OLD:{text:'PRIVATE_LIBRARY_SETTING'}},plan:{start:'10:00',slots:[]},
    rosters:{PRIVATE_GROUP_NAME:['既存担当']},folders:{PRIVATE_OLD_SHOW:{PRIVATE_OLD_SONG:'PRIVATE_FOLDER'}},rfolders:{PRIVATE_OLD:'PRIVATE_REC_FOLDER'},
    ghToken:'PRIVATE_TOKEN',bkKey:'PRIVATE_BACKUP_KEY',viewer:true,recMode:true,
    unknown:{preserved:'PRIVATE_UNKNOWN',nested:{sources:[1,2,3]}},...extra};
}
function workbook(n,options={}){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(options.rows||[
    ['佐藤',lyric(n)],['','続きの歌詞をそのまま残します。'],['鈴木','最後の歌詞をそのまま残します。'],['全','全員で歌う歌詞をそのまま残します。']
  ]),options.sheetName||'歌割');
  if(options.title)wb.Props={Title:options.title};
  if(options.secondSheet)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(options.secondSheet),'PRIVATE_OTHER_SHEET');
  return Buffer.from(XLSX.write(wb,{type:'buffer',bookType:options.bookType||'xlsx',compression:true}));
}
function excessiveExpansion(bytes){
  const out=Buffer.from(bytes),entry=out.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  assert(entry>=0);out.writeUInt32LE(32*1024*1024+1,entry+24);return out;
}
function sparseHugeGrid(){
  // Patch the actual zip XML, avoiding an expensive 20,000 x 512 writer scan.
  const archive=XLSX.CFB.read(workbook(0),{type:'buffer'}),entry=XLSX.CFB.find(archive,'/xl/worksheets/sheet1.xml');
  const xml=Buffer.from(entry.content).toString()
    .replace(/<dimension ref="[^"]*"\/>/,'<dimension ref="A1:SR20000"/>')
    .replace('</sheetData>','<row r="20000"><c r="SR20000" t="str"><v>PRIVATE_REMOTE_CELL</v></c></row></sheetData>');
  XLSX.CFB.utils.cfb_add(archive,'/xl/worksheets/sheet1.xml',Buffer.from(xml));
  return Buffer.from(XLSX.CFB.write(archive,{type:'buffer',fileType:'zip',compression:true}));
}
function database(count=3,options={}){
  const state=emptyState(options.state),clips={};
  for(let n=0;n<count;n++)clips['xls:'+originalId(n)]=new Blob([workbook(n)],{type:MIME});
  Object.assign(clips,options.clips||{});
  const values={'state:0':{seq:11648,at:1000,txt:JSON.stringify(state)},'state:1':{seq:11647,at:900,txt:JSON.stringify(state)}};
  return indexedFixture({state:values,clips},options.idb||{});
}
async function digest(blob){return createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex');}
async function clipDigests(idb){
  return Promise.all([...idb.stores.get('clips')].map(async([key,blob])=>[key,blob.type,blob.size,await digest(blob)]));
}
function savedState(idb){const hold=idb.record(Restoration.HOLD);return JSON.parse(idb.record('state:'+hold.slot).txt);}
function protectionOutput(f){
  const text=f.elements.get('startup-local-recovery-result').textContent;
  assert.doesNotMatch(text,/PRIVATE_|https?:\/\/|ghToken|bkKey|完全復旧|最新/);
  assert.doesNotMatch(f.app.innerHTML,/PRIVATE_|https?:\/\/|ghToken|bkKey/);return text;
}
function assertStopped(f,idb,before,sharedBefore){
  assert.equal(idb.writeCount(),0);assert.deepEqual(idb.snapshot(),before);
  assert.equal(f.calls.reloads,0);assert.equal(f.calls.saves,0);assert.equal(f.calls.network.length,0);
  assert.equal(f.run('JSON.stringify(S)'),sharedBefore);assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);
  assert.equal(idb.record(Restoration.HOLD),undefined);protectionOutput(f);
}
function assertRecoveredParts(state,song,n){
  assert.equal(song.id,originalId(n));assert.equal(song.xls,1);assert.equal(song.xlsSourceId,undefined);
  assert.equal(song.xlsAt,undefined);assert.equal(song.from,undefined);assert.equal(song.recoveredFromOriginalExcel,true);
  assert.equal(song.lines[0].t,lyric(n));assert.equal(song.lines[0].cell,'A1');assert.equal(song.lines[0].lcell,'B1');
  assert.equal(song.lines[1].t,'続きの歌詞をそのまま残します。');assert.equal(song.lines[1].cont,true);
  assert.deepEqual(song.lines[1].parts,song.lines[0].parts);
  const names=line=>line.parts.map(id=>state.members.find(member=>member.id===id)?.name);
  assert.deepEqual(names(song.lines[0]),['佐藤']);assert.deepEqual(names(song.lines[2]),['鈴木']);
  assert.deepEqual(new Set(names(song.lines[3])),new Set(['佐藤','鈴木']));
}

test('124 actual compressed originals recover automatically, preserve every key/type/byte and reopen through load, migration and rendering',async()=>{
  const idb=database(124),before=idb.snapshot(),clipsBefore=await clipDigests(idb),f=appContext(idb),sharedBefore=f.run('JSON.stringify(S)');
  await settle(f);
  assert.equal(f.run('startupDiagnostic.failure.code'),'empty-saved-state');assert.equal(f.calls.inventory,1);
  assert.equal(f.calls.parse,124);assert.equal(f.calls.excelBuild,1);assert.equal(f.calls.reloads,1);
  assert.equal(f.calls.saves,0);assert.equal(f.calls.network.length,0);assert.equal(f.run('JSON.stringify(S)'),sharedBefore);
  assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);protectionOutput(f);
  const hold=idb.record(Restoration.HOLD);assert.equal(hold.sourceKind,'local-excel');assert.equal(hold.sourceAt,null);
  assert.equal(hold.sourceDateUnknown,true);assert.equal(hold.seq,11649);assert.equal(hold.slot,1);
  assert.deepEqual(hold.excelSummary,{total:124,read:124,failed:0});
  assert.deepEqual(hold.excelSources,clipsBefore.map(([key,,bytes,digest])=>({key,bytes,digest})));
  assert.deepEqual(idb.record('state:0'),Object.fromEntries(before.state)['state:0']);
  assert.deepEqual(idb.record(hold.copyKey),{slots:['state:0','state:1'].map(key=>({present:true,value:Object.fromEntries(before.state)[key]})),legacy:null});
  assert.deepEqual(idb.record(hold.startupKey),{slots:['state:0','state:1'].map(key=>({present:true,value:idb.record(key)})),legacy:null});
  const writes=idb.events.filter(event=>['add','put','delete'].includes(event.op));
  assert.equal(new Set(writes.map(event=>event.tx)).size,1);assert(writes.every(event=>event.store==='state'));
  assert.equal(writes.filter(event=>event.op==='put').length,1);assert.equal(writes.filter(event=>event.op==='delete').length,0);
  assert.equal(idb.writeCount(),128);
  const preserved=[...idb.stores.get('state')].filter(([key])=>key.startsWith('preserved:excel:v1:'));
  assert.equal(preserved.length,124);
  for(const [key,blob] of preserved){assert(blob instanceof Blob);assert.equal(key,'preserved:excel:v1:'+await digest(blob));}
  assert.deepEqual(await clipDigests(idb),clipsBefore);
  const stored=savedState(idb),original=JSON.parse(Object.fromEntries(before.state)['state:0'].txt);
  assert.equal(stored.songs.length,124);assert.equal(stored.shows.length,3);assert.equal(stored.groups.length,2);
  assert.deepEqual(stored.shows.slice(0,2),original.shows);assert.deepEqual(stored.groups.slice(0,1),original.groups);
  assert.equal(stored.showId,stored.shows[2].id);assert.equal(stored.viewer,false);assert.equal(stored.recMode,false);assert.equal(stored.ghToken,undefined);
  for(const field of ['unknown','subs','gsubs','subsMan','subLib','staffMemos','recs','draws','rosters','folders','rfolders','plan'])assert.deepEqual(stored[field],original[field],field);
  assert.deepEqual(stored.notes,[]);assert.deepEqual(stored.pubNotes,[]);assert.deepEqual(stored.memos,{});
  stored.songs.forEach((song,n)=>{assertRecoveredParts(stored,song,n);assert.match(song.title,/^復旧資料\d{3}$/);assert.equal(song.showId,stored.showId);});
  const after=idb.snapshot(),reopened=appContext(idb);await settle(reopened);
  assert.equal(reopened.run('startupPhase'),'ready');assert.equal(reopened.run('booted'),true);assert.equal(reopened.app.inert,false);
  assert.equal(reopened.run('startupRecoverySourceKind'),'local-excel');assert.equal(reopened.run('startupRecoveryNetworkHold'),true);
  assert.equal(reopened.run('startupCanCommunicate()'),false);assert.equal(reopened.calls.inventory,0);assert.equal(reopened.calls.parse,0);
  assert.equal(reopened.calls.reloads,0);assert.equal(reopened.calls.saves,0);assert.equal(reopened.calls.network.length,0);
  assert.deepEqual(idb.snapshot(),after);assert.deepEqual(await clipDigests(idb),clipsBefore);
  assert.match(reopened.app.innerHTML,/復旧資料001/);
  assert(reopened.messages.some(node=>node.textContent.includes('元Excel')&&/同期停止中|自動送受信は停止中/.test(node.textContent)));
  assert(!reopened.messages.some(node=>/完全復旧|最新/.test(node.textContent)));
  const songs=JSON.parse(reopened.run('JSON.stringify(S.songs)'));
  for(let n=0;n<songs.length;n++){
    assertRecoveredParts(JSON.parse(reopened.run('JSON.stringify(S)')),songs[n],n);
    reopened.c.syntheticSong=songs[n];const own=await reopened.run('getOriginalExcel(syntheticSong)');
    assert(own instanceof Blob);assert.equal(await digest(own),clipsBefore[n][3]);assert.equal(own.type,clipsBefore[n][1]);
  }
  for(const expression of ['gistPush("PRIVATE_GROUP",false)','doPush(true)','doBackup(true)','fetchSetlist()','syncSetlist(false)','checkOther(false)','importFromLink()'])await reopened.run(expression);
  assert.equal(reopened.calls.saves,0);assert.equal(reopened.calls.network.length,0);assert.deepEqual(idb.snapshot(),after);
});

test('actual malformed, header-only, ambiguous and excessive-expansion workbooks are kept while valid originals on both sides restore',async()=>{
  const clips={
    'xls:PRIVATE_MALFORMED':new Blob([new Uint8Array([0x50,0x4b,3,4]),'PRIVATE_BAD_ZIP'],{type:MIME}),
    'xls:PRIVATE_HEADER_ONLY':new Blob([workbook(50,{rows:[['','作詞：資料'],['','作曲：資料']]})],{type:MIME}),
    'xls:PRIVATE_WRONG_SHEET':new Blob([workbook(51,{sheetName:'PRIVATE_REFERENCE',secondSheet:[['佐藤','別資料の歌詞です']]})],{type:MIME}),
    'xls:PRIVATE_EXCESSIVE_EXPANSION':new Blob([excessiveExpansion(workbook(52))],{type:MIME}),
    'xls:PRIVATE_SPARSE_HUGE_GRID':new Blob([sparseHugeGrid()],{type:MIME}),
    ['xls:'+originalId(2)]:new Blob([workbook(2)],{type:MIME})
  };
  const idb=database(2,{clips}),clipsBefore=await clipDigests(idb),f=appContext(idb);await settle(f);
  assert.equal(f.calls.reloads,1);assert.equal(f.calls.network.length,0);assert.equal(f.calls.saves,0);
  const state=savedState(idb);assert.equal(state.songs.length,3);
  state.songs.forEach((song,n)=>assertRecoveredParts(state,song,n));
  assert.equal(f.calls.excelPackets[0].sourceDateUnknown,true);assert.deepEqual(await clipDigests(idb),clipsBefore);
  assert.deepEqual(idb.record(Restoration.HOLD).excelSummary,{total:8,read:3,failed:5});
  const reopened=appContext(idb);await settle(reopened);assert.equal(reopened.run('startupPhase'),'ready');assert.equal(reopened.calls.network.length,0);
  assert(reopened.messages.some(node=>node.textContent.includes('元Excel')&&/未|一部|部分/.test(node.textContent)));
});

test('a genuine embedded title is retained and absent titles stay explicitly provisional',async()=>{
  const clips={['xls:'+originalId(1)]:new Blob([workbook(1,{title:'PRIVATE_CONFIRMED_WORKBOOK_TITLE'})],{type:MIME})};
  const idb=database(1,{clips}),f=appContext(idb);await settle(f);assert.equal(f.calls.reloads,1);
  const state=savedState(idb);assert.match(state.songs[0].title,/^復旧資料\d{3}$/);
  assert.equal(state.songs[1].title,'PRIVATE_CONFIRMED_WORKBOOK_TITLE');assert.notEqual(state.songs[0].title,originalId(0));
});

test('actual binary, legacy and macro workbook formats keep original bytes and song-source links',async()=>{
  const types=['biff8','xlsb','xlsm'],clips={};
  types.forEach((bookType,n)=>{clips['xls:'+originalId(n)]=new Blob([workbook(n,{bookType})],{type:bookType==='biff8'?'application/vnd.ms-excel':MIME});});
  const idb=database(0,{clips}),before=await clipDigests(idb),f=appContext(idb);await settle(f);
  assert.equal(f.calls.reloads,1);assert.equal(f.calls.parse,3);assert.equal(f.calls.saves,0);assert.equal(f.calls.network.length,0);
  const state=savedState(idb);state.songs.forEach((song,n)=>assertRecoveredParts(state,song,n));
  assert.deepEqual(await clipDigests(idb),before);
});

for(const mode of ['hidden','cancel','pagehide','owner-denied','stale','state-race','legacy-race','source-race']){
  test('while the actual parser is waiting, '+mode+' stops all writes and retains the live shared state',async()=>{
    let entered=false,release;const gate=new Promise(resolve=>release=resolve),idb=database();
    const f=appContext(idb,{beforeParse:async({calls})=>{if(calls.parse===1){entered=true;await gate;}}}),sharedBefore=f.run('JSON.stringify(S)');
    await until(()=>entered);
    if(mode==='hidden')f.document.hidden=true;
    else if(mode==='cancel')f.c.startupCancelAutomaticRecovery();
    else if(mode==='pagehide')for(const handler of f.windowHandlers.get('pagehide')||[])handler();
    else if(mode==='owner-denied')f.run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');
    else if(mode==='stale')f.run('recordingInboxStale=true');
    else if(mode==='state-race'){
      const envelope=idb.record('state:0'),state=JSON.parse(envelope.txt);state.notes=[{id:'PRIVATE_NEW_NOTE',memo:'PRIVATE_CONCURRENT_NOTE'}];
      idb.replace('state:0',{...envelope,seq:envelope.seq+1,txt:JSON.stringify(state)});
    }else if(mode==='legacy-race')f.localValues.set('utacheck.v1',JSON.stringify(emptyState({notes:[{id:'PRIVATE_NEW_NOTE'}]})));
    else idb.replace('xls:'+originalId(0),new Blob([workbook(99)],{type:MIME}),'clips');
    const before=idb.snapshot();release();await settle(f);assertStopped(f,idb,before,sharedBefore);
  });
}

for(const mode of ['hidden','owner-denied','stale']){
  test('initial '+mode+' skips original-Excel work without changing storage',async()=>{
    const idb=database(),before=idb.snapshot(),f=appContext(idb,{configure:({document,run})=>{
      if(mode==='hidden')document.hidden=true;
      else if(mode==='stale')run('recordingInboxStale=true');
      else run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');
    }}),sharedBefore=f.run('JSON.stringify(S)');
    await settle(f);assertStopped(f,idb,before,sharedBefore);assert.equal(f.calls.inventory,0);assert.equal(f.calls.parse,0);
  });
}

test('an original song ID colliding with an existing member stops the complete candidate',async()=>{
  const idb=database(2,{state:{members:[{id:originalId(0),name:'既存担当'}]}}),before=idb.snapshot(),f=appContext(idb),sharedBefore=f.run('JSON.stringify(S)');
  await settle(f);assertStopped(f,idb,before,sharedBefore);assert.equal(f.calls.excelBuild,1);
});

test('no readable original lyrics leaves the application blocked and all malformed sources intact',async()=>{
  const idb=database(0,{clips:{'xls:PRIVATE_ONLY_HEADERS':new Blob([workbook(0,{rows:[['','作詞：資料'],['','作曲：資料']]})],{type:MIME})}});
  const before=idb.snapshot(),f=appContext(idb),sharedBefore=f.run('JSON.stringify(S)');await settle(f);
  assertStopped(f,idb,before,sharedBefore);assert.equal(f.calls.parse,1);
});

test('a non-lyric numerical account workbook cannot turn a broken startup into recovered work',async()=>{
  const clips={'xls:PRIVATE_WRONG_ACCOUNT_WORKBOOK':new Blob([workbook(0,{sheetName:'取引一覧',rows:[
    ['氏名','金額'],['佐藤',100000],['鈴木',200000],['合計',300000]
  ]})],{type:MIME})};
  const idb=database(0,{clips}),before=idb.snapshot(),f=appContext(idb),sharedBefore=f.run('JSON.stringify(S)');
  await settle(f);assertStopped(f,idb,before,sharedBefore);
});

for(const mode of ['failWrite','throwWrite']){
  test('quota failure on the first archived workbook rolls back slots, original copies and network hold atomically ('+mode+')',async()=>{
    const idb=database(3,{idb:{[mode]:5}}),before=idb.snapshot(),clipsBefore=await clipDigests(idb),f=appContext(idb),sharedBefore=f.run('JSON.stringify(S)');
    await settle(f);assert.equal(f.calls.reloads,0);assert.equal(f.calls.network.length,0);assert.equal(f.calls.saves,0);
    assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.run('JSON.stringify(S)'),sharedBefore);
    assert.deepEqual(idb.snapshot(),before);assert.deepEqual(await clipDigests(idb),clipsBefore);assert.equal(idb.record(Restoration.HOLD),undefined);
    assert(idb.events.some(event=>event.op==='abort'&&event.mode==='readwrite'));protectionOutput(f);
  });
}

test('an original replaced during committed-state rereading prevents reload and retains immutable archived bytes',async()=>{
  let idb,replaced=false;
  idb=database(3,{idb:{afterRequest:({mode,key,op})=>{
    if(!replaced&&idb.writeCount()>0&&mode==='readonly'&&op==='get'&&key==='state:0'){
      replaced=true;idb.replace('xls:'+originalId(0),new Blob([workbook(99)],{type:MIME}),'clips');
    }
  }}});
  const original=idb.record('xls:'+originalId(0),'clips'),before=idb.snapshot(),f=appContext(idb),sharedBefore=f.run('JSON.stringify(S)');
  await settle(f);assert.equal(replaced,true);assert.equal(f.calls.reloads,0);assert.equal(f.calls.network.length,0);assert.equal(f.calls.saves,0);
  assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.run('JSON.stringify(S)'),sharedBefore);assert.equal(f.app.inert,true);
  const hold=idb.record(Restoration.HOLD);assert(hold);assert.equal(hold.sourceKind,'local-excel');
  assert.deepEqual(idb.record(hold.copyKey),{slots:['state:0','state:1'].map(key=>({present:true,value:Object.fromEntries(before.state)[key]})),legacy:null});
  const archive=idb.record('preserved:excel:v1:'+await digest(original));assert(archive instanceof Blob);
  assert.equal(archive.type,original.type);assert.equal(archive.size,original.size);assert.equal(await digest(archive),await digest(original));
  assert.notEqual(await digest(idb.record('xls:'+originalId(0),'clips')),await digest(original));
  assert(idb.events.filter(event=>['add','put','delete'].includes(event.op)).every(event=>event.store==='state'));protectionOutput(f);
  const after=idb.snapshot(),reopened=appContext(idb),reopenedShared=reopened.run('JSON.stringify(S)');await settle(reopened);
  assert.equal(reopened.run('startupPhase'),'blocked');assert.equal(reopened.run('JSON.stringify(S)'),reopenedShared);
  assert.equal(reopened.app.inert,true);assert.equal(reopened.calls.inventory,0);assert.equal(reopened.calls.reloads,0);
  assert.equal(reopened.calls.saves,0);assert.equal(reopened.calls.network.length,0);assert.deepEqual(idb.snapshot(),after);
});

test('a later genuine local-edit generation reopens normally after an authorized original-workbook replacement',async()=>{
  const idb=database(3),f=appContext(idb);await settle(f);assert.equal(f.calls.reloads,1);
  const hold=idb.record(Restoration.HOLD),previous=idb.record('state:'+hold.slot),state=JSON.parse(previous.txt);
  state.songs[0].title='PRIVATE_UPDATED_LOCAL_TITLE';
  state.notes.push({id:'PRIVATE_LOCAL_NOTE',songId:state.songs[0].id,showId:state.showId,lineIdx:0,memo:'PRIVATE_LOCAL_EDIT',tags:[],memberIds:[]});
  const nextSeq=hold.seq+1;idb.replace('state:'+nextSeq%2,{...previous,seq:nextSeq,at:previous.at+1,txt:JSON.stringify(state)});
  idb.replace('xls:'+originalId(0),new Blob([workbook(99)],{type:MIME}),'clips');
  const reopened=appContext(idb);await settle(reopened);
  assert.equal(reopened.run('startupPhase'),'ready');assert.equal(reopened.run('booted'),true);assert.equal(reopened.app.inert,false);
  assert.equal(reopened.run('S.songs[0].title'),'PRIVATE_UPDATED_LOCAL_TITLE');assert.equal(reopened.run('S.notes[0].memo'),'PRIVATE_LOCAL_EDIT');
  assert.equal(reopened.run('startupRecoveryNetworkHold'),true);assert.equal(reopened.run('startupRecoverySourceKind'),'local-excel');
  assert.equal(reopened.calls.inventory,0);assert.equal(reopened.calls.reloads,0);assert.equal(reopened.calls.saves,0);assert.equal(reopened.calls.network.length,0);
});

test('a conflicting preexisting content-addressed workbook archive is retained and denies the commit',async()=>{
  const idb=database(3),blob=idb.record('xls:'+originalId(0),'clips'),key='preserved:excel:v1:'+await digest(blob);
  idb.replace(key,new Blob(['PRIVATE_CONFLICTING_ARCHIVE'],{type:MIME}));
  const before=idb.snapshot(),f=appContext(idb),sharedBefore=f.run('JSON.stringify(S)');await settle(f);
  assertStopped(f,idb,before,sharedBefore);
});
