'use strict';
// Whole-app QA uses synthetic publications, storage, credentials and files only.
// No real history, keys, user device, browser or network service is accessed.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const {appContext,settle,until,clone}=require('./startup-excel-recovery-fixture.cjs');
const Restoration=require('../startup-file-restoration.js');
const HOLD='recovery:network-hold:v1';
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const sha=value=>createHash('sha256').update(value).digest('hex');
const present=value=>({present:true,value});
const saved=slots=>({slots:slots.map(present),legacy:null});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const appSource=fs.readFileSync(__dirname+'/../app.js','utf8');
const saveNowStart=appSource.indexOf('async function saveNow()');
const actualSaveNow=appSource.slice(saveNowStart,appSource.indexOf('\n}',saveNowStart)+2);

function currentWork(){
  const groupId='PRIVATE_SYNTHETIC_GROUP',showId='PRIVATE_SYNTHETIC_EXCEL_SHOW',member='PRIVATE_SYNTHETIC_MEMBER';
  return {deviceId:'PRIVATE_SYNTHETIC_DEVICE',groups:[{id:groupId,name:'合成グループ',src:'',key:'',privateSetting:'PRIVATE_KEEP_GROUP'}],groupId,
    shows:[{id:showId,name:'合成Excel救出資料',groupId,hidden:false,privateMemo:'PRIVATE_KEEP_SHOW'}],showId,
    songs:Array.from({length:82},(_,n)=>({id:'PRIVATE_SYNTHETIC_EXCEL_'+n,title:'合成復旧資料 '+(n+1),groupId,showId,xls:1,
      recoveredFromOriginalExcel:true,roster:[member],sig:1000+n,
      lines:[{t:'合成の歌詞 '+n,parts:[member],tag:'A1',cell:'A3',lcell:'C3'}]})),
    rsongs:Array.from({length:3},(_,n)=>({id:'PRIVATE_SYNTHETIC_REC_'+n,title:'合成REC曲 '+(n+1),groupId,showId,
      roster:[member],sig:2000+n,take:3+n,recPrivate:{keep:'PRIVATE_KEEP_REC_'+n},
      lines:[{t:'合成録音歌詞 '+n,parts:[member],tag:'A1',vt:'ソロ',bar:'1'}]})),
    rsongId:'PRIVATE_SYNTHETIC_REC_2',recMode:false,recEdit:true,liveShow:showId,
    notes:[{id:'PRIVATE_SYNTHETIC_LATER_NOTE',songId:'PRIVATE_SYNTHETIC_EXCEL_0',showId,lineIdx:0,from:0,to:0,
      tags:['pitch'],memberIds:[member],memo:'合成の後追加指摘',ts:1700000000001}],
    pubNotes:[{id:'PRIVATE_SYNTHETIC_LATER_PUB_NOTE',songId:'PRIVATE_SYNTHETIC_EXCEL_1',showId,lineIdx:0,
      tags:[],memberIds:[member],memo:'合成の後追加配信指摘',ts:1700000000002}],
    members:[{id:member,name:'合成担当',privateSetting:'PRIVATE_KEEP_MEMBER'}],trash:[{id:'PRIVATE_SYNTHETIC_TRASH',at:12,songs:[]}],
    memos:{[showId+'|PRIVATE_SYNTHETIC_EXCEL_0']:'合成の後追加総括'},
    staffMemos:{[showId+'|PRIVATE_SYNTHETIC_EXCEL_0']:'PRIVATE_KEEP_STAFF'},
    draws:{[showId+'|PRIVATE_SYNTHETIC_EXCEL_0']:[{pts:[[0,0],[1,1]],private:'PRIVATE_KEEP_DRAW'}]},
    recs:{[showId+'|PRIVATE_SYNTHETIC_REC_2|0']:{name:'PRIVATE_KEEP_REC_METADATA',at:125,mime:'audio/mp4',take:4}},
    subs:{[showId+'|PRIVATE_SYNTHETIC_EXCEL_0']:{0:[member]}},subsMan:{PRIVATE_KEEP_SUBS:[member]},
    gsubs:{[showId+'|PRIVATE_SYNTHETIC_EXCEL_0']:{A:[member]}},subLib:{PRIVATE_KEEP_LIB:{memo:'PRIVATE_KEEP_LIBRARY'}},
    folders:{PRIVATE_KEEP_FOLDER:{name:'PRIVATE_KEEP_FOLDER_NAME'}},rfolders:{PRIVATE_SYNTHETIC_REC_2:'PRIVATE_KEEP_REC_FOLDER'},
    rosters:{'合成グループ':[member]},folderOrder:['PRIVATE_KEEP_FOLDER'],rfolderOrder:['PRIVATE_KEEP_REC_FOLDER'],
    plan:{start:'10:00',date:'2026-11-10',unknown:'PRIVATE_KEEP_PLAN',slots:Array.from({length:10},(_,n)=>({
      id:'PRIVATE_SYNTHETIC_SLOT_'+n,kind:n===3?'break':'member',name:'合成枠 '+n,min:20+n,songId:'PRIVATE_SYNTHETIC_REC_'+n%3,
      at:600+n*30,secCur:'A1',takes:{A1:n+1,B1:n+2},secState:{A1:{done:true,private:'PRIVATE_KEEP_SECTION'}},
      ...(n===0?{a0:600,a1:625}:n===1?{a0:630}:{}),privateSetting:'PRIVATE_KEEP_SLOT_'+n}))},
    planFocus:'PRIVATE_SYNTHETIC_SLOT_1',planMin:90,planPrep:10,planAuto:false,viewer:false,bkGistId:'',bkKey:'',ghToken:'',
    unknown:{nested:{preserved:'PRIVATE_KEEP_UNKNOWN',zero:0,no:false,list:[0,null,'']}}};
}

async function fixture(options={}){
  const initial=currentWork();options.editInitial?.(initial);
  const originals=saved([{seq:6,at:600,txt:JSON.stringify({...initial,ghToken:'PRIVATE_SYNTHETIC_ORIGINAL_TOKEN'})},
    {seq:7,at:700,txt:JSON.stringify({...initial,ghToken:'PRIVATE_SYNTHETIC_ORIGINAL_TOKEN'})}]);
  const copyKey='preserved:recovery:v1:'+sha(JSON.stringify(originals));
  const slots=[{seq:8,at:800,txt:JSON.stringify(initial)},{seq:9,at:900,txt:JSON.stringify(initial)}];
  const startupCopy=saved(slots),startupKey='preserved:startup:v1:'+sha(JSON.stringify(startupCopy));
  const clips={},archives={},excelSources=[];
  for(let n=0;n<124;n++){
    const bytes=Buffer.from('PRIVATE_SYNTHETIC_IMMUTABLE_WORKBOOK_'+n),digest=sha(bytes),key='xls:PRIVATE_SYNTHETIC_EXCEL_'+n;
    const blob=new Blob([bytes],{type:MIME});clips[key]=blob;archives['preserved:excel:v1:'+digest]=blob;
    excelSources.push({key,bytes:blob.size,digest});
  }
  const hold={v:1,seq:9,slot:1,copyKey,startupKey,sourceAt:null,sourceDateUnknown:true,sourceKind:'local-excel',
    candidateDigest:sha(slots[1].txt),excelSources,excelSummary:{total:124,read:82,failed:42}};
  const idb=indexedFixture({state:{'state:0':slots[0],'state:1':slots[1],[copyKey]:originals,[startupKey]:startupCopy,[HOLD]:hold,
    'PRIVATE_SYNTHETIC_UNRELATED_RECORD':{keep:'PRIVATE_KEEP_UNRELATED'},...archives},clips},options.idb||{});
  idb.database.name='utacheck';
  const commits=[],prepares=[],alerts=[];let f,filePicker,fileRestorePending;
  const restorer={create:deps=>{
    const real=Restoration.create(deps);
    return {prepare:async(...args)=>{prepares.push(args);await options.beforePrepare?.(f,args);return real.prepare(...args);},
      cancel:()=>real.cancel(),get busy(){return real.busy;},commit:async context=>{
        commits.push({phase:f.run('startupPhase'),inert:f.app.inert,editor:f.run('JSON.stringify(S)'),draft:f.run('JSON.stringify(U.sheet)')});
        await options.beforeCommit?.(f,context);return real.commit(context);
      }};
  }};
  f=appContext(idb,{restorer,localValues:options.localValues,configure:({c,document,run})=>{
    // The shared harness forbids ordinary saves. This entry point flushes
    // already-pending saves, so exercise the actual no-pending flush here.
    run(actualSaveNow);
    c.alert=text=>alerts.push(text);
    const createElement=document.createElement;
    document.createElement=tag=>{const node=createElement(tag);node.click=()=>{if(node.type==='file')filePicker=node;};return node;};
    const restoreFile=c.restoreBackupFile;c.restoreBackupFile=(...args)=>{fileRestorePending=restoreFile(...args);return fileRestorePending;};
    if(!options.missingModule)c.StartupRecoveredShowAddition=require('../startup-recovered-show-addition.js');
    options.configure?.({c,document,run});
  }});
  f.idb=idb;
  await settle(f);
  assert.equal(f.run('startupPhase'),'ready');assert.equal(f.app.inert,false);assert.equal(f.run('startupRecoveryNetworkHold'),true);
  return {...f,idb,initial,originals,copyKey,startupKey,hold,slots,commits,prepares,alerts,
    filePicker:()=>filePicker,fileRestorePending:()=>fileRestorePending,before:idb.snapshot(),editor:f.run('JSON.stringify(S)')};
}

async function assertClips(f){
  assert.equal(f.idb.stores.get('clips').size,124);
  for(const source of f.hold.excelSources)for(const [key,store] of [[source.key,'clips'],['preserved:excel:v1:'+source.digest,'state']]){
    const blob=f.idb.record(key,store);assert(blob instanceof Blob);assert.equal(blob.size,source.bytes);assert.equal(blob.type,MIME);
    assert.equal(sha(new Uint8Array(await blob.arrayBuffer())),source.digest);
  }
}
function assertNoNetwork(f){
  assert.equal(f.calls.network.length,0);assert.equal(f.calls.saves,0);assert.equal(f.calls.inventory,0);assert.equal(f.calls.parse,0);
  assert.equal(f.run('startupCanCommunicate()'),false);
}
async function assertStopped(f,before=f.before,editor=f.editor){
  assert.equal(f.calls.reloads,0);assert.equal(f.idb.writeCount(),0);assert.deepEqual(f.idb.snapshot(),before);
  assert.equal(f.run('JSON.stringify(S)'),editor);assert.equal(f.run('startupPhase'),'ready');assert.equal(f.app.inert,false);
  assertNoNetwork(f);await assertClips(f);
}

function artifact(){
  // Deliberate collisions prove original IDs, orphan map references, character
  // position zero and the current production data survive this append.
  const group='PRIVATE_SYNTHETIC_GROUP',member='PRIVATE_SYNTHETIC_MEMBER';
  const shows=Array.from({length:18},(_,n)=>({id:n===0?'PRIVATE_SYNTHETIC_EXCEL_SHOW':'PRIVATE_SYNTHETIC_ORIGINAL_SHOW_'+n,
    name:'合成の元公演 '+(n+1),groupId:group,absent:[member],hidden:n===17}));
  const songs=Array.from({length:339},(_,n)=>({id:n===0?'PRIVATE_SYNTHETIC_EXCEL_0':'PRIVATE_SYNTHETIC_ORIGINAL_SONG_'+n,
    title:'合成の元曲 '+(n+1),showId:shows[n%18].id,groupId:group,take:1,from:null,roster:[member],sig:4000+n,
    lines:[{t:'😀合成の元歌詞 '+n,parts:[member],tag:'A1',cell:'A3',lcell:'C3',vt:'ソロ'}]}));
  const notes=Array.from({length:1529},(_,n)=>({id:n===0?'PRIVATE_SYNTHETIC_LATER_NOTE':'PRIVATE_SYNTHETIC_ORIGINAL_NOTE_'+n,
    songId:songs[n%339].id,showId:songs[n%339].showId,lineIdx:0,lineEnd:null,from:0,to:0,
    tags:['pitch'],memberIds:[member],memo:'合成の元指摘 '+n,pitch:'1-2',at:n===0?0:n,ts:n===0?0:n,
    hand:{text:'合成の旧手書き '+n,points:[[0,0],[0.5,0.5]]}}));
  const memos=Object.fromEntries(songs.slice(0,65).map((song,n)=>[song.showId+'|'+song.id,'合成の元総括 '+n]));
  const state={members:[{id:member,name:'合成担当'}],groups:[{id:group,name:'合成グループ'}],shows,songs,notes,
    pubNotes:[],memos,subs:{[songs[0].showId+'|'+songs[0].id]:{0:[member]}},
    gsubs:{[songs[0].showId+'|'+songs[0].id]:{A:[member]}},rosters:{'合成グループ':['合成担当']},
    folderOrder:['合成の元資料'],groupOrder:['合成グループ'],showId:shows[0].id,groupId:group};
  const publication={authorId:'PRIVATE_SYNTHETIC_DEVICE',groupName:'合成グループ',version:1700000000000,
    members:[{name:'合成担当'}],shows:shows.map(({groupId,...show})=>show),
    lib:songs.map(song=>({title:song.title,lines:[['合成担当',song.lines[0].t,'A3','C3']],order:['合成担当'],groups:{}})),
    songs:songs.map((song,n)=>({showId:song.showId,libIdx:n,take:1,fromIdx:null})),
    notes:notes.map((note,n)=>{const {songId,memberIds,id,ts,...rest}=note;return {...rest,songIdx:n%339,memberNames:['合成担当']};}),
    memos:songs.slice(0,65).map((song,n)=>({showId:song.showId,songIdx:n,text:'合成の元総括 '+n})),focusShow:shows[0].id};
  const originalText=JSON.stringify(publication);
  const addition={app:'utacheck-recovered-shows-addition',version:1,
    source:{kind:'gist-publication',at:publication.version,revision:'b'.repeat(40),sha256:sha(originalText)},originalText,state};
  const rawText=JSON.stringify(addition),file=new File([rawText],'PRIVATE_SYNTHETIC_ORIGINAL_HISTORY.json',{type:'application/json'});
  return {addition,rawText,file,publication};
}
async function selected(f,a=artifact()){
  f.c.chooseBackupFile();assert(f.filePicker());f.filePicker().files=[a.file];f.filePicker().onchange();
  return a;
}
function unpacked(f,packed){
  f.c.PRIVATE_SYNTHETIC_STATE_FOR_QA=packed;
  const result=JSON.parse(f.run('JSON.stringify(unpackState(PRIVATE_SYNTHETIC_STATE_FOR_QA))'));
  delete f.c.PRIVATE_SYNTHETIC_STATE_FOR_QA;return result;
}
function committedState(f){const hold=f.idb.record(HOLD);return {hold,state:unpacked(f,JSON.parse(f.idb.record('state:'+hold.slot).txt))};}
function assertCurrentPreserved(before,after){
  const appendedArrays=new Set(['shows','songs','notes','pubNotes','members','groups','folderOrder','groupOrder']);
  const appendedMaps=new Set(['memos','subs','gsubs','subsMan','seen','rosters','recoveredShowSources']);
  const displaySelection=new Set(['showId','groupId','viewer','recMode']);
  for(const [key,value] of Object.entries(before)){
    if(displaySelection.has(key))continue;
    if(appendedArrays.has(key))assert.deepEqual(after[key].slice(0,value.length),value,'current '+key+' changed');
    else if(appendedMaps.has(key))for(const [id,row] of Object.entries(value))assert.deepEqual(after[key][id],row,'current '+key+'/'+id+' changed');
    else assert.deepEqual(after[key],value,'current '+key+' changed');
  }
}

async function supersededImportFixture(options={}){
  const previous=artifact(),addition=clone(previous.addition),publication=clone(previous.publication);
  publication.version++;addition.version=2;addition.originalText=JSON.stringify(publication);
  addition.source={...addition.source,at:publication.version,revision:'e'.repeat(40),sha256:sha(addition.originalText)};
  addition.supersedes=[{sourceSha256:previous.addition.source.sha256,groupName:'合成グループ',
    sourceShowIds:previous.addition.state.shows.map(show=>show.id)}];
  const rawText=JSON.stringify(addition);
  const f=await fixture({...options,editInitial:initial=>{
    initial.groups[0].name='合成Excel保管';initial.rosters['合成Excel保管']=initial.rosters['合成グループ'];delete initial.rosters['合成グループ'];
    const prior=require('../startup-recovered-show-addition.js').merge(initial,previous.addition);
    Object.assign(initial,prior.state);
    initial.shows.push({id:'PRIVATE_SYNTHETIC_MANUAL_AFTER_RECOVERY',name:'合成の復旧後追加公演',groupId:prior.focusGroupId,hidden:false,nopub:false});
    initial.notes.push({...clone(initial.notes.at(-1)),id:'PRIVATE_SYNTHETIC_NOTE_AFTER_RECOVERY',memo:'合成の復旧後手入力指摘'});
    options.editInitial?.(initial,previous.addition.source.sha256);
  }});
  return {f,previous,addition,rawText};
}

test('v2 archives a prior recovery atomically, preserves subsequent notes and manual shows, and reopens the latest canonical group',async()=>{
  const {f,previous,addition,rawText}=await supersededImportFixture(),beforeEditor=JSON.parse(f.editor);
  const priorReceipt=beforeEditor.recoveredShowSources[previous.addition.source.sha256],priorGroupId=priorReceipt.focusGroupId;
  await f.c.recoveryImportShowAddition(rawText,addition);
  assert.equal(f.calls.reloads,1);assert.equal(f.commits.length,1);assert.equal(f.run('JSON.stringify(S)'),f.editor);
  const {hold,state}=committedState(f),expected=clone(beforeEditor),archiveName='合成グループ（旧資料）';
  expected.groups.find(group=>group.id===priorGroupId).name=archiveName;
  for(const show of expected.shows)if(show.groupId===priorGroupId&&addition.supersedes[0].sourceShowIds.includes(show.recoveredSourceShowId))show.hidden=true;
  expected.rosters[archiveName]=expected.rosters['合成グループ'];delete expected.rosters['合成グループ'];
  expected.groupOrder=expected.groupOrder.map(name=>name==='合成グループ'?archiveName:name);
  assertCurrentPreserved(expected,state);
  assert.equal(state.shows.find(show=>show.id==='PRIVATE_SYNTHETIC_MANUAL_AFTER_RECOVERY').hidden,false);
  assert.deepEqual(state.notes.find(note=>note.id==='PRIVATE_SYNTHETIC_NOTE_AFTER_RECOVERY'),beforeEditor.notes.at(-1));
  assert.equal(state.groups.at(-1).name,'合成グループ');assert.equal(state.groupId,state.groups.at(-1).id);
  assert.notEqual(state.groupId,priorGroupId);assert.equal(state.shows.find(show=>show.id===state.showId).hidden,false);
  assert.deepEqual(state.recoveredShowSources[addition.source.sha256].archiveChanges,{groups:1,shows:18,showFlags:17,rosters:1,groupOrder:1});
  assert.equal(f.idb.record('preserved:editor:v1:'+sha(f.editor)),f.editor);
  assert.equal(f.idb.record(hold.sourceCopyKey),rawText);assert.deepEqual(f.idb.record(hold.copyKey),saved(f.slots));
  assert.deepEqual(f.idb.record(f.copyKey),f.originals);
  const writes=f.idb.events.filter(event=>['put','add','delete'].includes(event.op));
  assert.equal(new Set(writes.map(event=>event.tx)).size,1);assert(!writes.some(event=>event.op==='delete'));
  assertNoNetwork(f);await assertClips(f);
  const reopened=appContext(f.idb,{configure:({c,run})=>{run(actualSaveNow);c.StartupRecoveredShowAddition=require('../startup-recovered-show-addition.js');}});
  await settle(reopened);assert.equal(reopened.run('startupPhase'),'ready');
  assert.equal(reopened.run('S.groups.find(g=>g.id===S.groupId).name'),'合成グループ');
  assert.equal(reopened.run('S.shows.find(h=>h.id==="PRIVATE_SYNTHETIC_MANUAL_AFTER_RECOVERY").hidden'),false);
  const snapshot=f.idb.snapshot(),writeCount=f.idb.writeCount();
  await assert.rejects(reopened.c.recoveryImportShowAddition(rawText,addition),/追加済み/);
  assert.equal(f.idb.writeCount(),writeCount);assert.deepEqual(f.idb.snapshot(),snapshot);assertNoNetwork(reopened);
});
test('v2 missing predecessor receipt is rejected before preservation with no archival or storage writes',async()=>{
  const {f,addition,rawText}=await supersededImportFixture({editInitial:(initial,hash)=>delete initial.recoveredShowSources[hash]});
  await assert.rejects(f.c.recoveryImportShowAddition(rawText,addition));assert.equal(f.prepares.length,0);await assertStopped(f);
});
test('v2 quota failure rolls back archival, latest import and backups together',async()=>{
  const {f,addition,rawText}=await supersededImportFixture({idb:{failWrite:3}});
  await assert.rejects(f.c.recoveryImportShowAddition(rawText,addition));
  assert.equal(f.commits.length,1);assert.equal(f.calls.reloads,0);assert.equal(f.run('startupPhase'),'ready');
  assert.equal(f.run('JSON.stringify(S)'),f.editor);assert.deepEqual(f.idb.snapshot(),f.before);assertNoNetwork(f);await assertClips(f);
  assert(f.idb.events.some(event=>event.op==='abort'&&event.mode==='readwrite'));
});

test('ready held editor adds 18/339/1529/65 history atomically and reopens actual load/migration/render with all current REC work',async()=>{
  let entered=false,release;const gate=new Promise(resolve=>release=resolve);
  const f=await fixture({beforeCommit:async()=>{entered=true;await gate;}}),a=await selected(f),beforeEditor=JSON.parse(f.editor);
  assert.equal(f.idb.writeCount(),0);assert.deepEqual(f.idb.snapshot(),f.before);assert.equal(f.run('JSON.stringify(S)'),f.editor);
  const pending=f.fileRestorePending();await until(()=>entered);
  assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);assert.equal(f.idb.writeCount(),0);
  assertNoNetwork(f);release();await pending;
  assert.equal(f.calls.reloads,1);assert.equal(f.commits.length,1);assert.equal(f.commits[0].phase,'blocked');assert.equal(f.commits[0].inert,true);
  assert.deepEqual(f.alerts,[]);
  assert.equal(f.run('JSON.stringify(S)'),f.editor);assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);
  const {hold,state}=committedState(f);assert.equal(hold.sourceKind,'cloud-publication');assert.equal(hold.seq,10);assert.equal(hold.slot,0);
  assertCurrentPreserved(beforeEditor,state);
  assert.equal(state.shows.length,beforeEditor.shows.length+18);assert.equal(state.songs.length,82+339);
  assert.equal(state.notes.length,beforeEditor.notes.length+1529);assert.equal(Object.keys(state.memos).length,Object.keys(beforeEditor.memos).length+65);
  assert.equal(state.rsongs.length,3);assert.equal(state.plan.slots.length,10);
  const sourceNote=state.notes.find(note=>note.memo==='合成の元指摘 0');
  assert.equal(sourceNote.from,0);assert.equal(sourceNote.to,0);assert.equal(sourceNote.at,0);assert.equal(sourceNote.ts,0);
  assert.deepEqual(sourceNote.hand,a.addition.state.notes[0].hand);
  assert.notEqual(sourceNote.id,'PRIVATE_SYNTHETIC_LATER_NOTE');assert.notEqual(sourceNote.songId,'PRIVATE_SYNTHETIC_EXCEL_0');
  assert.notEqual(sourceNote.showId,'PRIVATE_SYNTHETIC_EXCEL_SHOW');assert.notEqual(sourceNote.memberIds[0],'PRIVATE_SYNTHETIC_MEMBER');
  assert.equal(hold.sourceCopyKey,'preserved:recovery-source:v1:'+sha(a.rawText));assert.equal(f.idb.record(hold.sourceCopyKey),a.rawText);
  assert.equal(f.idb.record('preserved:editor:v1:'+sha(f.editor)),f.editor);
  assert.deepEqual(f.idb.record('preserved:recovery-hold:v1:'+sha(JSON.stringify(f.hold))),f.hold);
  assert.deepEqual(f.idb.record(hold.copyKey),saved(f.slots));assert.deepEqual(f.idb.record(f.copyKey),f.originals);
  const beforeRecords=Object.fromEntries(f.before.state);
  for(const [key,value] of f.before.state)if(!['state:0',HOLD].includes(key))assert.deepEqual(f.idb.record(key),value,'original record '+key+' changed');
  assert.equal(f.idb.record('state:1').txt,beforeRecords['state:1'].txt);
  const writes=f.idb.events.filter(event=>['put','add','delete'].includes(event.op));
  assert(writes.length>=7);assert.equal(new Set(writes.map(event=>event.tx)).size,1);
  assert(writes.every(event=>event.store==='state'));assert(!writes.some(event=>event.op==='delete'));
  const commitTx=f.idb.transactions[writes[0].tx];assert.deepEqual(commitTx.scope,['state']);assert.equal(commitTx.completed,true);
  const after=f.idb.snapshot(),reopened={...appContext(f.idb,{configure:({c})=>{c.StartupRecoveredShowAddition=require('../startup-recovered-show-addition.js');}}),idb:f.idb};
  await settle(reopened);assert.equal(reopened.run('startupPhase'),'ready');assert.equal(reopened.app.inert,false);
  assert.equal(reopened.run('startupRecoverySourceKind'),'cloud-publication');assert.equal(reopened.run('startupRecoveryNetworkHold'),true);
  assert.equal(reopened.run('S.showId'),state.showId);reopened.run('U.view="live";render()');
  assert.match(reopened.app.innerHTML,/合成の元曲/);
  reopened.run('U.view="summary";U.mode="song";render()');assert.match(reopened.app.innerHTML,/合成の元指摘/);
  assert.match(reopened.run('memberLyricHTML(S.notes.find(n=>n.memo==="合成の元指摘 0"))'),/<mark class="member-target">😀<\/mark>/);
  reopened.run('S.recMode=true;U.view="live";render()');
  assert.equal(reopened.run('S.rsongs.length'),3);assert.equal(reopened.run('S.rsongId'),'PRIVATE_SYNTHETIC_REC_2');
  assert.equal(reopened.run('song().id'),'PRIVATE_SYNTHETIC_REC_2');assert.equal(reopened.run('S.plan.slots.length'),10);
  assert.match(reopened.app.innerHTML,/合成REC曲/);assert.equal(reopened.calls.reloads,0);assertNoNetwork(reopened);
  assert.deepEqual(f.idb.snapshot(),after);await assertClips(f);
});

test('original publication hash mismatch rejects the artifact before preservation and changes no current data',async()=>{
  const f=await fixture(),a=artifact();a.addition.originalText+=' ';
  await assert.rejects(f.c.recoveryImportShowAddition(JSON.stringify(a.addition),a.addition));
  assert.equal(f.prepares.length,0);await assertStopped(f);
});
for(const field of ['kind','at','revision','sha256'])test('invalid source '+field+' stays closed without writes',async()=>{
  const f=await fixture(),a=artifact();a.addition.source[field]=field==='at'?0:'PRIVATE_INVALID_SOURCE_METADATA';
  await assert.rejects(f.c.recoveryImportShowAddition(JSON.stringify(a.addition),a.addition));
  assert.equal(f.prepares.length,0);await assertStopped(f);
});
test('missing addition module rejects the dedicated import without entering ordinary replacement',async()=>{
  const f=await fixture({missingModule:true}),a=artifact();
  await assert.rejects(f.c.recoveryImportShowAddition(a.rawText,a.addition));
  assert.equal(f.prepares.length,0);await assertStopped(f);
});
for(const mode of ['recording','draft','hidden','stale','owner'])test('initial '+mode+' guard cannot start the append',async()=>{
  const f=await fixture(),a=artifact();
  if(mode==='recording')f.run('REC={state:"recording"}');
  else if(mode==='draft')f.run('U.sheet={memo:"合成の書きかけ指摘",from:0,to:0}');
  else if(mode==='hidden')f.document.hidden=true;
  else if(mode==='stale')f.run('recordingInboxStale=true');
  else f.run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');
  const draft=f.run('JSON.stringify(U.sheet)');
  await assert.rejects(f.c.recoveryImportShowAddition(a.rawText,a.addition));
  assert.equal(f.prepares.length,0);assert.equal(f.run('JSON.stringify(U.sheet)'),draft);await assertStopped(f);
});

for(const mode of ['state:0','state:1','hold','memory','draft','revision','legacy','hidden','stale','owner'])
test('concurrent '+mode+' change during async preparation yields zero write attempts',async()=>{
  let entered=false,release;const gate=new Promise(resolve=>release=resolve);
  const f=await fixture({beforePrepare:async()=>{entered=true;await gate;}}),a=artifact();
  const pending=f.c.recoveryImportShowAddition(a.rawText,a.addition),rejected=assert.rejects(pending);await until(()=>entered);
  if(mode==='state:0'||mode==='state:1'){const old=f.idb.record(mode);f.idb.replace(mode,{...old,txt:old.txt+' '});}
  else if(mode==='hold')f.idb.replace(HOLD,{...f.hold,unknownConcurrent:'PRIVATE_KEEP_CONCURRENT_HOLD'});
  else if(mode==='memory')f.run('S.notes.push({id:"PRIVATE_CONCURRENT_NOTE",songId:"PRIVATE_SYNTHETIC_EXCEL_0",showId:S.showId,lineIdx:0,tags:[],memberIds:[],memo:"合成の検査中追記"})');
  else if(mode==='draft')f.run('U.sheet={memo:"合成の検査中新規draft"}');
  else if(mode==='revision')f.run('stateRevision++');
  else if(mode==='legacy')f.localValues.set('utacheck.v1','PRIVATE_CONCURRENT_LEGACY');
  else if(mode==='hidden')f.document.hidden=true;
  else if(mode==='stale')f.run('recordingInboxStale=true');
  else f.run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');
  const before=f.idb.snapshot(),editor=f.run('JSON.stringify(S)'),draft=f.run('JSON.stringify(U.sheet)');
  release();await rejected;assert.equal(f.commits.length,0);assert.equal(f.run('JSON.stringify(U.sheet)'),draft);
  await assertStopped(f,before,editor);
});

for(const mode of ['quota-request','quota-throw','slot-race'])test(mode+' rolls back the atomic state-only transaction',async()=>{
  let f;
  f=await fixture({idb:mode==='quota-request'?{failWrite:3}:mode==='quota-throw'?{throwWrite:3}:{},
    beforeCommit:mode==='slot-race'?async f=>{const old=f.idb.record('state:1');f.idb.replace('state:1',{...old,txt:old.txt+' '});}:undefined});
  const a=artifact(),beforeEditor=f.editor;
  await assert.rejects(f.c.recoveryImportShowAddition(a.rawText,a.addition));
  assert.equal(f.calls.reloads,0);assert.equal(f.run('startupPhase'),'ready');assert.equal(f.app.inert,false);
  assert.equal(f.run('JSON.stringify(S)'),beforeEditor);assert.equal(f.commits.length,1);assertNoNetwork(f);await assertClips(f);
  if(mode==='slot-race')assert.equal(f.idb.writeCount(),0);
  else{assert(f.idb.writeCount()>0);assert.deepEqual(f.idb.snapshot(),f.before);}
  assert(f.idb.events.some(event=>event.op==='abort'&&event.mode==='readwrite'));
});

for(const target of ['state:0','state:1','hold','source'])test('postcommit '+target+' reread failure blocks old editor saves and reload',async()=>{
  const a=artifact(),sourceKey='preserved:recovery-source:v1:'+sha(a.rawText);let committed=false,f;
  f=await fixture({idb:{afterRequest:({tx,key,op})=>{
    if(tx.mode==='readwrite'&&op==='put'&&key==='state:0')committed=true;
  },failRead:({mode,key,op})=>committed&&mode==='readonly'&&op==='get'&&key===(target==='hold'?HOLD:target==='source'?sourceKey:target)}});
  await assert.rejects(f.c.recoveryImportShowAddition(a.rawText,a.addition));
  assert.equal(f.calls.reloads,0);assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);
  assert.equal(f.run('JSON.stringify(S)'),f.editor);assert.equal(f.run('recordingInboxCanWrite()'),false);
  assert.equal(f.run('recoveryOriginalWriteCommitted'),true);assertNoNetwork(f);await assertClips(f);
  assert.equal(f.idb.record(HOLD).sourceKind,'cloud-publication');assert.equal(f.idb.record(sourceKey),a.rawText);
  const {state}=committedState(f);assertCurrentPreserved(JSON.parse(f.editor),state);assert.equal(state.songs.length,421);
});

test('visibility cancellation after transaction completion keeps committed originals protected and does not reload',async()=>{
  let f;const a=artifact();
  f=await fixture({idb:{afterRequest:({tx,key,op})=>{
    if(tx.mode==='readwrite'&&op==='put'&&key==='state:0')setImmediate(()=>{f.document.hidden=true;});
  }}});
  await assert.rejects(f.c.recoveryImportShowAddition(a.rawText,a.addition));
  assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);assert.equal(f.calls.reloads,0);
  assert.equal(f.run('JSON.stringify(S)'),f.editor);assert.equal(f.run('recordingInboxCanWrite()'),false);
  assert.equal(f.idb.record(HOLD).sourceKind,'cloud-publication');assertNoNetwork(f);await assertClips(f);
});

test('a repeated source after reopen is rejected by its receipt with zero additional writes',async()=>{
  const f=await fixture(),a=artifact();await f.c.recoveryImportShowAddition(a.rawText,a.addition);
  assert.equal(f.calls.reloads,1);const before=f.idb.snapshot(),writes=f.idb.writeCount();
  const reopened=appContext(f.idb,{configure:({c,run})=>{run(actualSaveNow);c.StartupRecoveredShowAddition=require('../startup-recovered-show-addition.js');}});
  await settle(reopened);assert.equal(reopened.run('startupPhase'),'ready');
  const editor=reopened.run('JSON.stringify(S)');
  await assert.rejects(reopened.c.recoveryImportShowAddition(a.rawText,a.addition),/追加済み/);
  assert.equal(reopened.calls.reloads,0);assert.equal(f.idb.writeCount(),writes);assert.deepEqual(f.idb.snapshot(),before);
  assert.equal(reopened.run('JSON.stringify(S)'),editor);assertNoNetwork(reopened);await assertClips(f);
});

test('old Excel navigation yields to the added show once, then a REC edit/save/reboot follows normal selection',async()=>{
  const oldSelection=JSON.stringify({version:1,showId:'PRIVATE_SYNTHETIC_EXCEL_SHOW',groupId:'PRIVATE_SYNTHETIC_GROUP',showFilter:'PRIVATE_SYNTHETIC_GROUP'});
  const f=await fixture({localValues:{'utacheck.selection:editor':oldSelection}}),a=artifact();
  await f.c.recoveryImportShowAddition(a.rawText,a.addition);const committed=committedState(f);
  const restored=appContext(f.idb,{localValues:Object.fromEntries(f.localValues),configure:({c,run})=>{
    c.StartupRecoveredShowAddition=require('../startup-recovered-show-addition.js');
    const begin=appSource.indexOf('function save()');run(appSource.slice(begin,appSource.indexOf('\nconst REC_SHOW',begin)));
  }});
  await settle(restored);
  assert.equal(restored.run('startupRecoveryRestoredView'),true);assert.equal(restored.run('U.view'),'setup');
  assert.equal(restored.run('S.showId'),committed.state.showId);assert.equal(restored.run('S.groupId'),committed.state.groupId);
  assert.equal(restored.run('U.showFilter'),'');
  assert.notEqual(restored.localValues.get('utacheck.selection:editor'),oldSelection);
  const storedEditor=JSON.parse(restored.run('JSON.stringify(S)')),writes=f.idb.writeCount();
  restored.run('S.recMode=true;S.rsongs[2].recPrivate.afterLocalEdit="PRIVATE_SYNTHETIC_REC_EDIT";U.view="live";render();save()');
  await restored.c.saveNow();assert.equal(f.idb.writeCount(),writes+1);assert.equal(restored.run('saveErr'),false);
  assert.equal(restored.run('S.rsongId'),'PRIVATE_SYNTHETIC_REC_2');assert.equal(restored.run('song().id'),'PRIVATE_SYNTHETIC_REC_2');
  const currentHold=f.idb.record(HOLD);
  const next=appContext(f.idb,{localValues:Object.fromEntries(restored.localValues)});await settle(next);
  assert.equal(next.run('startupPhase'),'ready');assert.equal(next.run('startupRecoveryRestoredView'),false);
  assert.equal(next.run('S.recMode'),true);assert.equal(next.run('S.rsongId'),'PRIVATE_SYNTHETIC_REC_2');
  assert.equal(next.run('S.rsongs[2].recPrivate.afterLocalEdit'),'PRIVATE_SYNTHETIC_REC_EDIT');
  assert.equal(next.run('S.plan.slots.length'),10);assert.equal(next.run('U.view'),'live');
  assert.equal(next.run('S.songs.length'),421);assert.equal(next.run('S.notes.length'),1530);
  assert.deepEqual(f.idb.record(HOLD),currentHold);assert.deepEqual(JSON.parse(next.run('JSON.stringify(S.plan)')),storedEditor.plan);
  assertNoNetwork(restored);assertNoNetwork(next);await assertClips(f);
});

test('a held settings file import rejects an ordinary replacement backup and never calls its decoder',async()=>{
  const f=await fixture();let decoded=0;
  f.c.unpackWithPass=()=>{decoded++;throw Error('PRIVATE_ORDINARY_REPLACE_FORBIDDEN');};
  const file=new File([JSON.stringify({bk:1,data:Buffer.from(JSON.stringify({app:'utacheck',at:1700000000000,state:currentWork()})).toString('base64')})],
    'PRIVATE_SYNTHETIC_REPLACEMENT_BACKUP.json');
  await f.c.restoreBackupFile(file);assert.equal(decoded,0);assert.equal(f.commits.length,0);assert.equal(f.prepares.length,0);
  assert.equal(f.alerts.length,1);assert.match(f.alerts[0],/追加ファイル/);assert.doesNotMatch(f.alerts[0],/PRIVATE_/);await assertStopped(f);
});

test('held settings file import never commits generic fields or changes an existing draft',async()=>{
  const f=await fixture(),a=artifact();f.run('U.sheet={memo:"合成書きかけメモ",from:0,to:0};callsForQA.commits=0;commitFields=()=>{callsForQA.commits++;throw Error("PRIVATE_GENERIC_COMMIT_FORBIDDEN")};');
  const draft=f.run('JSON.stringify(U.sheet)');await f.c.restoreBackupFile(a.file);
  assert.equal(f.calls.commits,0);assert.equal(f.run('JSON.stringify(U.sheet)'),draft);assert.equal(f.alerts.length,1);
  assert.doesNotMatch(f.alerts[0],/PRIVATE_/);await assertStopped(f);
});

for(const mode of ['state:0','state:1','hold','memory','draft','revision','legacy','hidden','stale','owner'])
test('held file read '+mode+' race does not import after the file becomes readable',async()=>{
  let entered=false,release;const gate=new Promise(resolve=>release=resolve),f=await fixture(),a=artifact();
  Object.defineProperty(a.file,'text',{value:async()=>{entered=true;await gate;return a.rawText;}});
  const pending=f.c.restoreBackupFile(a.file);await until(()=>entered);
  if(mode==='state:0'||mode==='state:1'){const old=f.idb.record(mode);f.idb.replace(mode,{...old,txt:old.txt+' '});}
  else if(mode==='hold')f.idb.replace(HOLD,{...f.hold,privateConcurrent:'PRIVATE_KEEP_CONCURRENT_HOLD'});
  else if(mode==='memory')f.run('S.notes.push({id:"PRIVATE_FILE_READ_NOTE",songId:"PRIVATE_SYNTHETIC_EXCEL_0",showId:S.showId,lineIdx:0,tags:[],memberIds:[],memo:"合成の読込中追記"})');
  else if(mode==='draft')f.run('U.sheet={memo:"合成の読込中新規draft"}');
  else if(mode==='revision')f.run('stateRevision++');
  else if(mode==='legacy')f.localValues.set('utacheck.v1','PRIVATE_FILE_READ_LEGACY');
  else if(mode==='hidden')f.document.hidden=true;
  else if(mode==='stale')f.run('recordingInboxStale=true');
  else f.run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');
  const before=f.idb.snapshot(),editor=f.run('JSON.stringify(S)'),draft=f.run('JSON.stringify(U.sheet)');
  release();await pending;assert.equal(f.prepares.length,0);assert.equal(f.commits.length,0);
  assert.equal(f.run('JSON.stringify(U.sheet)'),draft);assert.equal(f.alerts.length,1);assert.doesNotMatch(f.alerts[0],/PRIVATE_/);
  await assertStopped(f,before,editor);
});

test('ready held editor keeps blocked-startup file controls inert instead of starting ordinary replacement',async()=>{
  const f=await fixture(),a=artifact();f.c.startupSelectLocalFile(a.file);await f.c.startupCheckLocalFile();await f.c.startupRestoreLocalFile();
  assert.equal(f.prepares.length,0);assert.equal(f.commits.length,0);await assertStopped(f);
});

test('three file selections retain the first read lock, reject later reads, and commit once',async()=>{
  let entered=false,release;const gate=new Promise(resolve=>release=resolve),f=await fixture(),a=artifact();
  let reads=0;Object.defineProperty(a.file,'text',{value:async()=>{reads++;entered=true;await gate;return a.rawText;}});
  const first=f.c.restoreBackupFile(a.file);await until(()=>entered);
  await f.c.restoreBackupFile(a.file);await f.c.restoreBackupFile(a.file);
  assert.equal(reads,1);assert.equal(f.run('recoveryShowFileReading'),true);assert.equal(f.idb.writeCount(),0);
  assert.equal(f.alerts.length,2);assert(f.alerts.every(text=>!text.includes('PRIVATE_')));
  release();await first;assert.equal(f.calls.reloads,1);assert.equal(f.commits.length,1);
  assert.equal(f.run('recoveryShowFileReading'),false);assertNoNetwork(f);await assertClips(f);
});

test('file text read rejection releases its lock, keeps current work, and never decodes a replacement',async()=>{
  const f=await fixture(),a=artifact();let decoded=0;
  f.c.unpackWithPass=()=>{decoded++;throw Error('PRIVATE_REPLACEMENT_FORBIDDEN');};
  Object.defineProperty(a.file,'text',{value:async()=>{throw Object.assign(new Error('PRIVATE_SYNTHETIC_FILE_READ_ERROR'),{name:'NotReadableError'});}});
  await f.c.restoreBackupFile(a.file);assert.equal(f.run('recoveryShowFileReading'),false);assert.equal(decoded,0);
  assert.equal(f.alerts.length,1);assert.doesNotMatch(f.alerts[0],/PRIVATE_/);assert.equal(f.prepares.length,0);assert.equal(f.commits.length,0);await assertStopped(f);
});

test('a visibility event keeps its normal current-state save and cancels the pending history import',async()=>{
  let entered=false,release;const gate=new Promise(resolve=>release=resolve),f=await fixture(),a=artifact();
  Object.defineProperty(a.file,'text',{value:async()=>{entered=true;await gate;return a.rawText;}});
  const bytes=Buffer.from(await a.file.arrayBuffer()),pending=f.c.restoreBackupFile(a.file);await until(()=>entered);
  const begin=appSource.indexOf('function save()');f.run(appSource.slice(begin,appSource.indexOf('\nconst REC_SHOW',begin)));
  f.document.hidden=true;
  for(const handler of f.handlers.get('visibilitychange')||[])handler();
  await until(()=>!f.run('saving'));const writes=f.idb.writeCount();assert.equal(writes,1);
  const before=f.idb.snapshot(),editor=f.run('JSON.stringify(S)'),draft=f.run('JSON.stringify(U.sheet)');
  release();await pending;
  assert.deepEqual(Buffer.from(await a.file.arrayBuffer()),bytes);assert.equal(f.run('JSON.stringify(U.sheet)'),draft);
  assert.equal(f.run('recoveryShowFileReading'),false);assert.equal(f.prepares.length,0);assert.equal(f.commits.length,0);
  assert.equal(f.idb.writeCount(),writes);assert.deepEqual(f.idb.snapshot(),before);assert.equal(f.run('JSON.stringify(S)'),editor);
  assert.equal(f.calls.reloads,0);assert.equal(f.run('startupPhase'),'ready');assert.equal(f.app.inert,false);assertNoNetwork(f);await assertClips(f);
});
