'use strict';
// The whole app reads a synthetic encrypted backup using synthetic saved
// settings, preserves an existing 82/124 Excel recovery, and reopens normally.
// No real user data, device, credential, file or network service is accessed.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash,webcrypto}=require('node:crypto');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const {appContext,settle,until,clone}=require('./startup-excel-recovery-fixture.cjs');
const Preserved=require('../startup-preserved-backup-inspection.js');
const Bounded=require('../startup-backup-inspection.js');
const Restoration=require('../startup-file-restoration.js');

const HOLD='recovery:network-hold:v1';
const TOKEN='PRIVATE_SYNTHETIC_REOPEN_TOKEN',KEY='PRIVATE_SYNTHETIC_REOPEN_KEY';
const ID='a'.repeat(32),OTHER_ID='c'.repeat(32),REV='b'.repeat(40);
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const sha=value=>createHash('sha256').update(value).digest('hex');
const present=value=>({present:true,value});
const snapshot=slots=>({slots:slots.map(present),legacy:null});
const startupKey=value=>'preserved:startup:v1:'+sha(JSON.stringify(value));

function state(extra={}){
  return {deviceId:'PRIVATE_SYNTHETIC_DEVICE',groups:[{id:'PRIVATE_GROUP',name:'既存グループ',src:'',key:''}],groupId:'PRIVATE_GROUP',
    shows:[{id:'PRIVATE_EMPTY_SHOW',name:'既存公演',groupId:'PRIVATE_GROUP'}],showId:'PRIVATE_EMPTY_SHOW',
    songs:[],rsongs:[],notes:[],pubNotes:[],members:[{id:'PRIVATE_MEMBER',name:'既存担当'}],trash:[],
    memos:{},staffMemos:{},draws:{},recs:{},subs:{},gsubs:{},subsMan:{},subLib:{},folders:{},rfolders:{},rosters:{},
    plan:{start:'10:00',slots:[]},unknown:{preserved:'PRIVATE_ORIGINAL_UNKNOWN'},...extra};
}
function recovered(){
  const value=state({shows:[{id:'PRIVATE_EXCEL_SHOW',name:'元Excel救出資料',groupId:'PRIVATE_GROUP'}],showId:'PRIVATE_EXCEL_SHOW',
    bkGistId:'',bkKey:'',viewer:false,recMode:false});
  value.songs=Array.from({length:82},(_,n)=>({id:'PRIVATE_EXCEL_'+n,title:'復旧資料'+String(n+1).padStart(3,'0'),
    groupId:value.groupId,showId:value.showId,xls:1,recoveredFromOriginalExcel:true,
    roster:['PRIVATE_MEMBER'],sig:1000+n,lines:[{t:'端末に残っていた歌詞 '+n,parts:['PRIVATE_MEMBER'],cell:'A1',lcell:'B1'}]}));
  return value;
}
function fullPacket(extra={}){
  const value=state({shows:Array.from({length:5},(_,n)=>({id:'PRIVATE_ORIGINAL_SHOW_'+n,name:'元公演 '+(n+1),groupId:'PRIVATE_GROUP'})),
    showId:'PRIVATE_ORIGINAL_SHOW_0',ghToken:'PRIVATE_REMOTE_TOKEN_MUST_NOT_BE_ADOPTED',bkGistId:ID,bkKey:KEY});
  value.songs=Array.from({length:5},(_,n)=>({id:'PRIVATE_ORIGINAL_SONG_'+n,title:'元の曲名 '+(n+1),
    groupId:value.groupId,showId:value.shows[n].id,lines:[{t:'元の歌詞 '+(n+1),parts:['PRIVATE_MEMBER'],tag:'ガヤ'}]}));
  value.notes=[{id:'PRIVATE_ORIGINAL_NOTE',songId:value.songs[0].id,showId:value.showId,lineIdx:0,memberIds:['PRIVATE_MEMBER'],tags:[],ts:1700000000000,memo:'元の指摘を残す'}];
  value.pubNotes=[{id:'PRIVATE_ORIGINAL_PUBLIC_NOTE',songId:value.songs[0].id,showId:value.showId,lineIdx:0,memberIds:['PRIVATE_MEMBER'],tags:[],ts:1700000000000,memo:'配信側の指摘を残す'}];
  value.memos={[value.showId]:'元の公演総括を残す'};value.staffMemos={[value.showId]:'元の管理メモを残す'};
  value.draws={PRIVATE_DRAW:{strokes:[]}};value.recs={PRIVATE_REC:{memo:'元の録音管理を残す'}};
  value.plan.slots=[{songId:value.songs[0].id,memo:'元の進行メモ'}];
  // Exercise the application's real packed-lyrics reader and migration.
  value.songLib=value.songs.map(song=>song.lines);
  value.songs=value.songs.map((song,n)=>{const packed={...song,L:n};delete packed.lines;return packed;});
  return {app:'utacheck',at:1700000000000,state:value,...extra};
}
function wrapped(packet){return {bk:1,data:Buffer.from(JSON.stringify(packet)).toString('base64')};}
async function encrypted(value){
  const salt=new Uint8Array(16).fill(21),iv=new Uint8Array(12).fill(22);
  const base=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(KEY),'PBKDF2',false,['deriveKey']);
  const key=await webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:200000,hash:'SHA-256'},base,
    {name:'AES-GCM',length:256},false,['encrypt']);
  const data=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)));
  return {enc:1,salt:Buffer.from(salt).toString('base64'),iv:Buffer.from(iv).toString('base64'),data:Buffer.from(data).toString('base64')};
}
async function fixture(options={}){
  const original=state({ghToken:TOKEN,bkKey:KEY,bkGistId:ID,...options.originalSettings});
  const originalOther=options.originalOther?state({ghToken:TOKEN,bkKey:KEY,bkGistId:OTHER_ID}):original;
  const originalSlots=[{seq:6,at:600,txt:JSON.stringify(original)},{seq:7,at:700,txt:JSON.stringify(originalOther)}];
  const originals=snapshot(originalSlots),copyKey='preserved:recovery:v1:'+sha(JSON.stringify(originals));
  const initial=recovered(),initialEnvelope={seq:8,at:800,txt:JSON.stringify(initial)};
  const initialCopy=snapshot([initialEnvelope,originalSlots[1]]),initialKey=startupKey(initialCopy);
  const current=clone(initial);options.editBeforeInspection?.(current);
  const laterLocalGeneration=options.editBeforeInspection||options.missingInitialCopy||options.changedInitialCopy;
  const slots=laterLocalGeneration?[initialEnvelope,{seq:9,at:900,txt:JSON.stringify(current)}]:[initialEnvelope,originalSlots[1]];
  const liveCopy=snapshot(slots),clips={},archives={},excelSources=[];
  for(let n=0;n<124;n++){
    const bytes=Buffer.from('PRIVATE_SYNTHETIC_IMMUTABLE_EXCEL_BYTES_'+n),digest=sha(bytes),key='xls:PRIVATE_EXCEL_'+n;
    const blob=new Blob([bytes],{type:MIME});clips[key]=blob;archives['preserved:excel:v1:'+digest]=blob;
    excelSources.push({key,bytes:blob.size,digest});
  }
  const hold={v:1,seq:8,slot:0,copyKey,startupKey:initialKey,sourceAt:null,sourceDateUnknown:true,
    sourceKind:'local-excel',candidateDigest:sha(initialEnvelope.txt),excelSources,excelSummary:{total:124,read:82,failed:42}};
  const stored={'state:0':slots[0],'state:1':slots[1],[copyKey]:originals,[initialKey]:initialCopy,
    [startupKey(liveCopy)]:liveCopy,[HOLD]:hold,...archives};
  if(options.missingInitialCopy)delete stored[initialKey];
  if(options.changedInitialCopy)stored[initialKey]=clone({...initialCopy,unexpected:'PRIVATE_CHANGED_INITIAL'});
  const idb=indexedFixture({state:stored,clips},options.idb||{});idb.database.name='utacheck';
  const before=idb.snapshot(),packet=options.packet||fullPacket(),packetOther=options.packetOther||fullPacket();
  const raw=options.raw||await encrypted(wrapped(packet)),rawOther=await encrypted(wrapped(packetOther));
  const responses=new Map([[ID,{id:ID,history:[{version:REV}],files:{'utacheck-backup.json':{truncated:false,content:JSON.stringify(raw)}}}],
    [OTHER_ID,{id:OTHER_ID,history:[{version:REV}],files:{'utacheck-backup.json':{truncated:false,content:JSON.stringify(rawOther)}}}]]);
  const summaries=[],keys=[],commits=[];let creates=0,f;
  const restorer={create:deps=>{
    const real=Restoration.create(deps);
    return {prepare:(...args)=>real.prepare(...args),cancel:()=>real.cancel(),get busy(){return real.busy;},
      commit:async context=>{
        commits.push({phase:f.run('startupPhase'),inert:f.app.inert,editor:f.run('JSON.stringify(S)'),draft:f.run('JSON.stringify(U.sheet)')});
        await options.beforeCommit?.(f,context);return real.commit(context);
      }};
  }};
  f=appContext(idb,{restorer,fetch:async(url,input)=>{
    const match=/^https:\/\/api\.github\.com\/gists\/([a-f0-9]{32})(?:\/([a-f0-9]{40}))?$/.exec(url);
    assert(match&&responses.has(match[1]),'inspection must read only a preserved original saved target');
    const response=responses.get(match[1]);
    if(options.fetch)return options.fetch(url,input,response);
    return {ok:true,status:200,url,text:async()=>JSON.stringify(response)};
  },configure:({c,document,run})=>{
    for(const [id,tag] of [['recovery-original-backup-check','button'],['recovery-original-backup-output','pre']]){
      const node=document.createElement(tag);node.id=id;document.body.appendChild(node);
    }
    c.StartupBackupInspection={...Bounded,decodeBackup:(raw,key,context)=>{keys.push(key);return Bounded.decodeBackup(raw,key,context);}};
    c.StartupPreservedBackupInspection={create:deps=>{
      creates++;return Preserved.create({...deps,onUpdate:result=>{summaries.push(clone(result));deps.onUpdate(result);}});
    }};
    options.configure?.({c,document,run});
  }});
  return {...f,idb,before,packet,initial,current,originals,copyKey,initialKey,hold,summaries,keys,commits,creates:()=>creates};
}
async function completed(f){
  await settle(f);
  await until(()=>f.creates()>0&&f.run('!!recoveryOriginalBackupInspector&&!recoveryOriginalBackupInspector.busy')
    &&!f.elements.get('recovery-original-backup-check').disabled);
}
function assertReads(f){
  for(const request of f.calls.network){
    assert.equal(request.input.method,'GET');assert.equal(request.input.body,undefined);
    assert.equal(request.input.credentials,'omit');assert.equal(request.input.referrerPolicy,'no-referrer');assert.equal(request.input.redirect,'error');
    assert.equal(request.input.headers.Authorization,'Bearer '+TOKEN);
  }
  assert.equal(f.calls.saves,0);assert.equal(f.calls.inventory,0);assert.equal(f.calls.parse,0);
  assert.equal(f.run('startupCanCommunicate()'),false);
  assert(!f.run('JSON.stringify(S)').includes(TOKEN));
}
async function assertFiles(f){
  assert.equal(f.idb.stores.get('clips').size,124);
  for(const source of f.hold.excelSources){
    for(const [key,store] of [[source.key,'clips'],['preserved:excel:v1:'+source.digest,'state']]){
      const blob=f.idb.record(key,store);assert(blob instanceof Blob);assert.equal(blob.type,MIME);assert.equal(blob.size,source.bytes);
      assert.equal(sha(new Uint8Array(await blob.arrayBuffer())),source.digest);
    }
  }
  assert(f.idb.events.filter(event=>['add','put','delete'].includes(event.op)).every(event=>event.store==='state'));
}
async function assertHeldNetwork(f){
  const requests=f.calls.network.length,before=f.idb.snapshot();
  for(const expression of ['gistPush("PRIVATE_GROUP",false)','doPush(true)','doBackup(true)','fetchSetlist()',
    'syncSetlist(false)','checkOther(false)','importFromLink()'])await f.run(expression);
  assert.equal(f.calls.network.length,requests);assert.equal(f.calls.saves,0);assert.deepEqual(f.idb.snapshot(),before);
}
async function assertStopped(f,before=f.before){
  assert.equal(f.calls.reloads,0);assert.equal(f.commits.length,0);assert.equal(f.idb.writeCount(),0);
  assert.deepEqual(f.idb.snapshot(),before);assert.equal(f.run('startupPhase'),'ready');assert.equal(f.app.inert,false);
  assert.equal(f.run('startupRecoverySourceKind'),'local-excel');assert.equal(f.run('S.songs.length'),82);
  assertReads(f);await assertFiles(f);await assertHeldNetwork(f);
}

test('encrypted original backup automatically preserves the 82/124 editor, restores five original shows, and reopens through real load/migration/render',async()=>{
  let entered=false,release;const gate=new Promise(resolve=>release=resolve);
  const f=await fixture({beforeCommit:async()=>{entered=true;await gate;}});
  await until(()=>entered);
  assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);assert.equal(f.calls.reloads,0);
  assert.equal(f.run('S.songs.length'),82);assert.equal(f.idb.writeCount(),0);
  const editor=f.run('JSON.stringify(S)'),draft=f.run('JSON.stringify(U.sheet)');
  await assertHeldNetwork(f);release();await completed(f);
  assert.equal(f.creates(),1);assert.equal(f.calls.network.length,2);assert.deepEqual(f.keys,[KEY]);
  assert.equal(f.calls.reloads,1);assert.equal(f.commits.length,1);assert.equal(f.commits[0].phase,'blocked');assert.equal(f.commits[0].inert,true);
  assert.equal(f.run('JSON.stringify(S)'),editor);assert.equal(f.run('JSON.stringify(U.sheet)'),draft);
  assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);assertReads(f);await assertFiles(f);
  const hold=f.idb.record(HOLD),before=Object.fromEntries(f.before.state),stored=JSON.parse(f.idb.record('state:'+hold.slot).txt);
  assert.equal(hold.sourceKind,'cloud-backup');assert.equal(hold.seq,9);assert.equal(hold.slot,1);
  assert.equal(hold.originalConnectionCopyKey,f.copyKey);assert.equal(hold.sourceAt,f.packet.at);
  assert.equal(stored.shows.length,5);assert.equal(stored.songs.length,5);assert.equal(stored.notes[0].memo,'元の指摘を残す');
  assert.equal(stored.memos[stored.showId],'元の公演総括を残す');assert.equal(stored.staffMemos[stored.showId],'元の管理メモを残す');
  assert.equal(stored.ghToken,undefined);assert.equal(f.idb.record('state:0').txt,before['state:0'].txt);
  assert.deepEqual(f.idb.record(f.copyKey),f.originals);assert.deepEqual(f.idb.record(f.initialKey),before[f.initialKey]);
  assert.deepEqual(f.idb.record(hold.copyKey),snapshot([before['state:0'],before['state:1']]));
  assert.deepEqual(f.idb.record(hold.startupKey),snapshot([f.idb.record('state:0'),f.idb.record('state:1')]));
  assert.deepEqual(f.idb.record('preserved:recovery-hold:v1:'+sha(JSON.stringify(f.hold))),f.hold);
  assert.equal(f.idb.record('preserved:editor:v1:'+sha(editor)),editor);
  const writes=f.idb.events.filter(event=>['add','put','delete'].includes(event.op));
  assert.equal(writes.length,6);assert.equal(new Set(writes.map(event=>event.tx)).size,1);assert(writes.every(event=>event.store==='state'));
  assert.equal(writes.filter(event=>event.op==='delete').length,0);
  const after=f.idb.snapshot(),reopened={...appContext(f.idb),idb:f.idb};await settle(reopened);
  assert.equal(reopened.run('startupPhase'),'ready');assert.equal(reopened.run('booted'),true);assert.equal(reopened.app.inert,false);
  assert.equal(reopened.run('startupRecoverySourceKind'),'cloud-backup');assert.equal(reopened.run('startupRecoveryNetworkHold'),true);
  assert.equal(reopened.run('S.ghToken'),'');assert.equal(reopened.run('S.shows.length'),5);assert.equal(reopened.run('S.songs.length'),5);
  assert.equal(reopened.run('S.songs[0].title'),'元の曲名 1');assert.equal(reopened.run('S.songs[0].lines[0].t'),'元の歌詞 1');
  assert.equal(reopened.run('S.songs[0].lines[0].tag'),'Gaya1');assert.equal(reopened.run('S.notes[0].memo'),'元の指摘を残す');
  assert.match(reopened.app.innerHTML,/元の曲名 1/);
  reopened.run('U.view="summary";U.sumOpen="PRIVATE_MEMBER";render()');assert.match(reopened.app.innerHTML,/元の指摘を残す/);
  assert.equal(reopened.calls.reloads,0);assert.equal(reopened.calls.network.length,0);assert.equal(reopened.calls.saves,0);
  assert.equal(reopened.calls.inventory,0);assert.equal(reopened.calls.parse,0);assert.deepEqual(f.idb.snapshot(),after);
  await assertHeldNetwork(reopened);await assertFiles(f);
});

for(const edit of ['notes','lyrics','management']){
  test('persisted additional '+edit+' before inspection keeps the local editor and does not adopt the backup',async()=>{
    const f=await fixture({editBeforeInspection:current=>{
      if(edit==='notes')current.notes.push({id:'PRIVATE_NEW_NOTE',memo:'追加した指摘'});
      else if(edit==='lyrics')current.songs[0].lines[0].t='自分で直した歌詞';
      else current.staffMemos[current.showId]='追加した管理メモ';
    }});await completed(f);await assertStopped(f);
    assert.match(f.run('recoveryOriginalBackupReport'),/追加・変更/);assert.equal(f.calls.network.length,2);
    if(edit==='notes')assert.equal(f.run('S.notes[0].memo'),'追加した指摘');
    if(edit==='lyrics')assert.equal(f.run('S.songs[0].lines[0].t'),'自分で直した歌詞');
    if(edit==='management')assert.equal(f.run('S.staffMemos[S.showId]'),'追加した管理メモ');
  });
}

for(const mode of ['memory-state','draft','state:0','state:1','hold','state-revision','legacy']){
  test('a concurrent '+mode+' change during the original GET stops adoption and preserves exact current work',async()=>{
    let entered=false,release;const gate=new Promise(resolve=>release=resolve);
    const f=await fixture({fetch:async(url,input,response)=>{if(!entered){entered=true;await gate;}
      return {ok:true,status:200,url,text:async()=>JSON.stringify(response)};}});
    await until(()=>entered);
    if(mode==='memory-state')f.run('S.notes.push({id:"PRIVATE_NEW_NOTE",memo:"検査中の追加指摘"})');
    else if(mode==='draft')f.run('U.sheet={memo:"未確定の指摘",lineIdx:0}');
    else if(mode==='state-revision')f.run('stateRevision++');
    else if(mode==='hold')f.idb.replace(HOLD,{...f.idb.record(HOLD),changed:'PRIVATE_CONCURRENT_HOLD'});
    else if(mode==='legacy')f.localValues.set('utacheck.v1','PRIVATE_CONCURRENT_LEGACY');
    else {const envelope=f.idb.record(mode),value=JSON.parse(envelope.txt);value.unknown.concurrent='PRIVATE_NEW_WORK';
      f.idb.replace(mode,{...envelope,txt:JSON.stringify(value)});}
    const before=f.idb.snapshot(),editor=f.run('JSON.stringify(S)'),draft=f.run('JSON.stringify(U.sheet)');
    release();await completed(f);await assertStopped(f,before);
    assert.equal(f.run('JSON.stringify(S)'),editor);assert.equal(f.run('JSON.stringify(U.sheet)'),draft);
    assert.match(f.run('recoveryOriginalBackupReport'),/変わったため中止/);
  });
}

test('different complete backups from the two preserved original connections stop automatic selection',async()=>{
  const other=fullPacket();other.state.notes[0].memo='別の保存先にだけある指摘';
  const f=await fixture({originalOther:true,packetOther:other});await completed(f);await assertStopped(f);
  assert.equal(f.calls.network.length,4);assert.equal(f.run('recoveryOriginalBackupCandidates.length'),2);
  assert.match(f.run('recoveryOriginalBackupReport'),/異なるバックアップ候補/);
});

test('a valid previous backup cannot be adopted when the real inspector reaches its history limit',async()=>{
  const history=[{version:REV},...Array.from({length:11},(_,n)=>({version:(n+1).toString(16).padStart(40,'0')}))];
  const f=await fixture({fetch:async(url,input,response)=>{
    const value=clone(response);
    if(url==='https://api.github.com/gists/'+ID)value.history=history;
    else if(url.endsWith('/'+REV))value.files['utacheck-backup.json'].content='{}';
    return {ok:true,status:200,url,text:async()=>JSON.stringify(value)};
  }});await completed(f);await assertStopped(f);
  assert.equal(f.summaries.at(-1).limited,true);assert(f.run('recoveryOriginalBackupCandidates.length')>0);
  assert.equal(f.calls.network.length,12);
});

for(const write of [1,2,3,4,5,6]){
  test('quota failure at preservation/replacement write '+write+' atomically retains both original generations, old hold and all clips',async()=>{
    const f=await fixture({idb:{failWrite:write}});await completed(f);
    assert.equal(f.calls.reloads,0);assert.equal(f.commits.length,1);assert.deepEqual(f.idb.snapshot(),f.before);
    assert.equal(f.run('startupPhase'),'ready');assert.equal(f.app.inert,false);assert.equal(f.run('S.songs.length'),82);
    assert.equal(f.commits[0].editor,f.run('JSON.stringify(S)'));assert.equal(f.commits[0].draft,f.run('JSON.stringify(U.sheet)'));
    assert.match(f.run('recoveryOriginalBackupReport'),/再読確認を完了できません/);assertReads(f);await assertFiles(f);await assertHeldNetwork(f);
  });
}

test('a failed final reread after a committed replacement stays protected and never reloads or saves the live editor',async()=>{
  let committed=false;
  const f=await fixture({idb:{afterRequest:({op,key,mode})=>{if(mode==='readwrite'&&op==='put'&&key.startsWith('state:'))committed=true;},
    failRead:({op,key,mode})=>committed&&mode==='readonly'&&op==='get'&&key==='state:0'}});
  await completed(f);assert.equal(f.commits.length,1);assert.equal(f.calls.reloads,0);
  assert.equal(f.idb.record(HOLD).sourceKind,'cloud-backup');assert.equal(f.run('S.songs.length'),82);
  assert.equal(f.run('JSON.stringify(S)'),f.commits[0].editor);assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);
  assertReads(f);await assertFiles(f);await assertHeldNetwork(f);
});

for(const mode of ['unsigned','wrong-app','invalid-date','malformed-lyrics','missing-note-tags','invalid-note-members','invalid-song-parts','missing-song-title','unsafe-root','unsafe-nested']){
  test(mode+' whole-backup candidate cannot replace the recovered editor',async()=>{
    const packet=fullPacket();
    if(mode==='unsigned')delete packet.app;
    else if(mode==='wrong-app')packet.app='other-app';
    else if(mode==='invalid-date')packet.at=0;
    else if(mode==='malformed-lyrics')packet.state.songLib[0]='PRIVATE_INVALID_LYRICS';
    else if(mode==='missing-note-tags')delete packet.state.notes[0].tags;
    else if(mode==='invalid-note-members')packet.state.pubNotes[0].memberIds='PRIVATE_INVALID_MEMBERS';
    else if(mode==='invalid-song-parts')packet.state.songLib[0][0].parts='PRIVATE_INVALID_PARTS';
    else if(mode==='missing-song-title')delete packet.state.songs[0].title;
    else if(mode==='unsafe-root')Object.defineProperty(packet.state,'__proto__',{enumerable:true,value:{polluted:true}});
    else packet.state.memos[packet.state.showId]=JSON.parse('{"constructor":{"prototype":{"polluted":true}}}');
    const f=await fixture({packet});await completed(f);await assertStopped(f);
    assert.equal(f.run('({}).polluted'),undefined);
  });
}

for(const mode of ['wrong-key','unreadable','missing-id','missing-key','invalid-id']){
  test(mode+' original saved connection never restores or adopts credentials',async()=>{
    const options={};
    if(mode==='wrong-key')options.originalSettings={bkKey:'PRIVATE_WRONG_SAVED_KEY'};
    else if(mode==='missing-id')options.originalSettings={bkGistId:''};
    else if(mode==='missing-key')options.originalSettings={bkKey:''};
    else if(mode==='invalid-id')options.originalSettings={bkGistId:'PRIVATE_INVALID_ID'};
    else options.fetch=async url=>({ok:false,status:404,url,text:async()=>''});
    const f=await fixture(options);await completed(f);await assertStopped(f);
    if(mode==='missing-id'||mode==='invalid-id')assert.equal(f.calls.network.length,0);
    else assert(f.calls.network.length>0);
  });
}

for(const mode of ['missingInitialCopy','changedInitialCopy']){
  test(mode+' cannot substitute an unconfirmed Excel baseline for the original saved recovery',async()=>{
    const f=await fixture({[mode]:true});await completed(f);await assertStopped(f);
  });
}
