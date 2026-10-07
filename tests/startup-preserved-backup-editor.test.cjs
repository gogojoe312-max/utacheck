'use strict';
// Whole-app tests use synthetic preserved generations, recovered work and IDB.
// There are no real credentials, user files, devices or network requests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash,webcrypto}=require('node:crypto');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const {appContext,settle,until,clone}=require('./startup-excel-recovery-fixture.cjs');
const Preserved=require('../startup-preserved-backup-inspection.js');
const Bounded=require('../startup-backup-inspection.js');

const HOLD='recovery:network-hold:v1',PREFIX='preserved:recovery:v1:';
const TOKEN='PRIVATE_SYNTHETIC_ORIGINAL_TOKEN_NEVER_REAL';
const KEY='PRIVATE_SYNTHETIC_元の保存済み合言葉';
const ID='a'.repeat(32),REV='b'.repeat(40);
const ORIGINAL='PRIVATE_ORIGINAL_METADATA_NOT_FOR_UI',REMOTE='PRIVATE_REMOTE_BACKUP_NOT_FOR_UI';
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const sha=value=>createHash('sha256').update(value).digest('hex');
const present=value=>({present:true,value});

function work(extra={}){
  return {deviceId:'PRIVATE_SYNTHETIC_DEVICE',groups:[{id:'PRIVATE_GROUP',name:'既存グループ',src:'',key:''}],groupId:'PRIVATE_GROUP',
    shows:[{id:'PRIVATE_OLD_SHOW',name:'既存公演',privateMemo:ORIGINAL}],showId:'PRIVATE_OLD_SHOW',
    songs:[],rsongs:[],notes:[],pubNotes:[],members:[{id:'PRIVATE_MEMBER',name:'既存担当'}],trash:[],
    memos:{},staffMemos:{},draws:{},recs:{},subs:{},gsubs:{},subsMan:{},subLib:{},folders:{},rfolders:{},rosters:{},
    plan:{start:'10:00',slots:[]},unknown:{original:ORIGINAL},...extra};
}
function recovered(){
  const state=work({shows:[{id:'PRIVATE_RECOVERED_SHOW',name:'元Excel救出資料',groupId:'PRIVATE_GROUP'}],showId:'PRIVATE_RECOVERED_SHOW',
    bkGistId:'',bkKey:'',viewer:false,recMode:false});
  state.songs=Array.from({length:82},(_,n)=>({id:'PRIVATE_ORIGINAL_'+String(n).padStart(3,'0'),title:'復旧資料'+String(n+1).padStart(3,'0'),
    groupId:state.groupId,showId:state.showId,xls:1,recoveredFromOriginalExcel:true,
    lines:[{t:'端末に残っていた歌詞 '+n,parts:['PRIVATE_MEMBER'],cell:'A1',lcell:'B1'}]}));
  delete state.ghToken;return state;
}
function remotePacket(){
  return {app:'utacheck',at:1700000000000,state:work({songs:[{id:'PRIVATE_REMOTE_SONG',title:REMOTE,showId:'PRIVATE_OLD_SHOW',
    lines:[{t:REMOTE,parts:['PRIVATE_MEMBER']}]}],notes:[{id:'PRIVATE_REMOTE_NOTE',songId:'PRIVATE_REMOTE_SONG',showId:'PRIVATE_OLD_SHOW',lineIdx:0,tags:[],memberIds:['PRIVATE_MEMBER'],memo:REMOTE}],
    staffMemos:{private:REMOTE},memos:{private:REMOTE},recs:{private:{memo:REMOTE}},plan:{start:'10:00',slots:[{memo:REMOTE}]}})};
}
async function encrypted(raw){
  const salt=new Uint8Array(16).fill(21),iv=new Uint8Array(12).fill(22);
  const base=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(KEY),'PBKDF2',false,['deriveKey']);
  const key=await webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:200000,hash:'SHA-256'},base,
    {name:'AES-GCM',length:256},false,['encrypt']);
  const data=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(raw)));
  return {enc:1,salt:Buffer.from(salt).toString('base64'),iv:Buffer.from(iv).toString('base64'),data:Buffer.from(data).toString('base64')};
}
async function database(options={}){
  const originalState=work({ghToken:TOKEN,bkKey:KEY,bkGistId:'',...options.originalSettings});
  const originals={slots:[present({seq:6,at:600,txt:JSON.stringify(originalState)}),
    present({seq:7,at:700,txt:JSON.stringify(originalState)})],legacy:null};
  if(options.originalSlots)originals.slots=options.originalSlots;
  const copyKey=PREFIX+sha(JSON.stringify(originals));
  const current=options.current||recovered(),values={'state:0':{seq:8,at:800,txt:JSON.stringify(current)},
    'state:1':clone(originals.slots[1].present?originals.slots[1].value:{seq:7,at:700,txt:JSON.stringify(originalState)})};
  const after={slots:[present(values['state:0']),present(values['state:1'])],legacy:null};
  const startupKey='preserved:startup:v1:'+sha(JSON.stringify(after));
  const clips={},archives={},excelSources=[];
  for(let n=0;n<124;n++){
    // The actual Excel/parser is exercised elsewhere. These distinct immutable
    // blobs make every original key, MIME type and byte part of this contract.
    const key='xls:PRIVATE_ORIGINAL_'+String(n).padStart(3,'0'),bytes=Buffer.from('PRIVATE_SYNTHETIC_ORIGINAL_BYTES_'+n);
    const blob=new Blob([bytes],{type:MIME}),digest=sha(bytes);
    clips[key]=blob;archives['preserved:excel:v1:'+digest]=blob;excelSources.push({key,bytes:blob.size,digest});
  }
  const hold={v:1,seq:8,slot:0,copyKey,startupKey,sourceAt:null,sourceDateUnknown:true,sourceKind:'local-excel',
    candidateDigest:sha(JSON.stringify(current)),excelSources,excelSummary:{total:124,read:82,failed:42},...options.hold};
  const state={...values,...archives,[copyKey]:originals,[startupKey]:after,[HOLD]:hold};
  if(options.missingCopy)delete state[copyKey];
  if(options.changedCopy)state[copyKey].slots[0].value.txt+=' ';
  const idb=indexedFixture({state,clips},options.idb||{});idb.database.name='utacheck';
  return {idb,copyKey,startupKey,originals,current,hold};
}
async function fixture(options={}){
  const data=await database(options),summaries=[],keys=[],createdStates=[],createdDrafts=[];
  const packet=remotePacket(),plain={bk:1,data:Buffer.from(JSON.stringify(packet)).toString('base64')};
  const raw=options.encrypted?await encrypted(plain):plain;
  const response={id:ID,history:[{version:REV}],files:{'utacheck-backup.json':{truncated:false,content:JSON.stringify(raw)}}};
  const routes=new Map(['https://api.github.com/gists/'+ID,'https://api.github.com/gists/'+ID+'/'+REV].map(url=>[url,response]));
  const before=data.idb.snapshot();
  let creates=0;
  const f=appContext(data.idb,{fetch:async(url,input)=>{
    assert(routes.has(url),'only the original saved GitHub target may be read');
    if(options.fetch)return options.fetch(url,input,response);
    return {ok:true,status:200,url,text:async()=>JSON.stringify(routes.get(url))};
  },configure:({c,document,run})=>{
    for(const [id,tag] of [['recovery-original-backup-check','button'],['recovery-original-backup-output','pre']]){
      const node=document.createElement(tag);node.id=id;document.body.appendChild(node);
    }
    c.StartupBackupInspection={...Bounded,decodeBackup:(raw,key,context)=>{keys.push(key);return Bounded.decodeBackup(raw,key,context);}};
    if(!options.missingModule)c.StartupPreservedBackupInspection={create:deps=>{
      creates++;createdStates.push(run('JSON.stringify(S)'));createdDrafts.push(run('JSON.stringify(U.sheet)'));
      return Preserved.create({...deps,onUpdate:result=>{summaries.push(clone(result));deps.onUpdate(result);}});
    }};
    options.configure?.({c,document,run});
  }});
  return {...f,...data,before,packet,summaries,keys,createdStates,createdDrafts,creates:()=>creates};
}
async function inspected(f){
  await settle(f);
  await until(()=>f.creates()>0&&f.run('!!recoveryOriginalBackupInspector&&!recoveryOriginalBackupInspector.busy'));
  // The editor performs its own final storage/draft reread after module work.
  await until(()=>!f.elements.get('recovery-original-backup-check').disabled);
}
function assertHeld(f){
  assert.equal(f.run('startupPhase'),'ready');assert.equal(f.run('booted'),true);assert.equal(f.app.inert,false);
  assert.equal(f.run('startupRecoverySourceKind'),'local-excel');assert.equal(f.run('startupRecoveryNetworkHold'),true);
  assert.equal(f.run('startupCanCommunicate()'),false);assert.equal(f.run('S.songs.length'),82);
  assert.equal(f.run('S.ghToken'),'');assert.equal(f.calls.saves,0);assert.equal(f.calls.reloads,0);
  assert.equal(f.calls.inventory,0);assert.equal(f.calls.parse,0);assert.equal(f.idb.writeCount(),0);
  assert(!f.run('JSON.stringify(S)').includes(TOKEN));
}
async function assertReadOnly(f,expected=f.before){
  assertHeld(f);assert.deepEqual(f.idb.snapshot(),expected);
  const mutations=f.idb.events.filter(event=>['add','put','delete'].includes(event.op));assert.deepEqual(mutations,[]);
  assert.equal(f.idb.stores.get('clips').size,124);
  for(const source of f.hold.excelSources)for(const [key,store] of [[source.key,'clips'],['preserved:excel:v1:'+source.digest,'state']]){
    const blob=f.idb.record(key,store);assert(blob instanceof Blob);assert.equal(blob.type,MIME);assert.equal(blob.size,source.bytes);
    assert.equal(sha(new Uint8Array(await blob.arrayBuffer())),source.digest,'preserved original bytes changed');
  }
  for(const request of f.calls.network){
    assert.equal(request.input.method,'GET');assert.equal(request.input.body,undefined);
    assert.equal(request.input.credentials,'omit');assert.equal(request.input.referrerPolicy,'no-referrer');assert.equal(request.input.redirect,'error');
    assert.match(request.url,new RegExp('^https://api\\.github\\.com/gists/'+ID+'(?:/'+REV+')?$'));
    assert.equal(request.input.headers.Authorization,'Bearer '+TOKEN);
  }
}
function assertPrivateUI(f){
  const report=f.run('recoveryOriginalBackupReport'),html=f.run('recoveryOriginalBackupHTML()');
  const publicSummaries=JSON.stringify(f.summaries);
  for(const value of [TOKEN,KEY,ID,REV,f.copyKey,ORIGINAL,REMOTE,'ghToken','bkGistId','copyKey','Authorization','https://']){
    assert(!report.includes(value),'report exposed '+value);assert(!html.includes(value),'dedicated UI exposed '+value);
    assert(!publicSummaries.includes(value),'public summary exposed '+value);
  }
  assert(!f.app.innerHTML.includes(TOKEN));assert(!f.app.innerHTML.includes(REMOTE));
  assert.doesNotMatch(report,/完全復旧|最新|復元しました|再設定しました/);
  assert.match(html,/復旧（送信なし）/);assert.doesNotMatch(html,/data-act=|startup-file-restore|この日時の内容に戻す/);
}
async function assertNormalNetworkHeld(f){
  const network=f.calls.network.length,saves=f.calls.saves,before=f.idb.snapshot();
  for(const expression of ['gistPush("PRIVATE_GROUP",false)','doPush(true)','doBackup(true)','fetchSetlist()',
    'syncSetlist(false)','checkOther(false)','importFromLink()'])await f.run(expression);
  assert.equal(f.calls.network.length,network);assert.equal(f.calls.saves,saves);assert.deepEqual(f.idb.snapshot(),before);
}

test('next boot of the 82/124 recovered editor automatically inspects preserved settings without reopening communication',async()=>{
  const f=await fixture();await inspected(f);
  assert.equal(f.creates(),1);assert.equal(f.summaries.at(-1).status,'no-existing-connection');
  assert.equal(f.summaries.at(-1).tokenStored,true);assert.equal(f.summaries.at(-1).savedKeyStored,true);
  assert.equal(f.summaries.at(-1).backupTargetStored,false);assert.equal(f.calls.network.length,0);
  assert.equal(f.run('JSON.stringify(S)'),f.createdStates[0]);assert.equal(f.run('recoveryOriginalBackupCandidates.length'),0);
  assert.match(f.run('recoveryOriginalBackupReport'),/GitHub認証情報：あり/);
  assert.match(f.run('recoveryOriginalBackupReport'),/全体バックアップの保存先：なし/);
  assert.match(f.run('recoveryOriginalBackupReport'),/トークンだけでは復旧先を確定できません/);
  await assertReadOnly(f);assertPrivateUI(f);await assertNormalNetworkHeld(f);
});

for(const settings of [{ghToken:'',bkKey:'',bkGistId:''},{ghToken:TOKEN,bkKey:'',bkGistId:''},
  {ghToken:'',bkKey:KEY,bkGistId:''},{ghToken:TOKEN,bkKey:KEY,bkGistId:''}]){
  test('missing original target reports confirmed setting presence accurately: token='+!!settings.ghToken+', key='+!!settings.bkKey,async()=>{
    const f=await fixture({originalSettings:settings});await inspected(f);const result=f.summaries.at(-1);
    assert.equal(result.status,'no-existing-connection');assert.equal(result.backupTargetStored,false);
    assert.equal(result.tokenStored,!!settings.ghToken);assert.equal(result.savedKeyStored,!!settings.bkKey);
    assert.equal(result.backupKeyStored,!!settings.bkKey);assert.equal(f.calls.network.length,0);
    await assertReadOnly(f);assertPrivateUI(f);
  });
}

for(const options of [{missingCopy:true},{changedCopy:true}]){
  test('unconfirmed original source remains unknown in the editor, rather than falsely absent: '+Object.keys(options)[0],async()=>{
    const f=await fixture(options);await inspected(f);const result=f.summaries.at(-1);
    assert.equal(result.status,options.missingCopy?'preserved-source-missing':'preserved-source-integrity');
    assert.equal(result.tokenStored,null);assert.equal(result.savedKeyStored,null);assert.equal(result.backupTargetStored,null);
    assert.match(f.run('recoveryOriginalBackupReport'),/GitHub認証情報：未確認/);assert.equal(f.calls.network.length,0);
    await assertReadOnly(f);assertPrivateUI(f);
  });
}

test('saved original ID, token and encrypted key read only the fixed original GitHub revision and keep full candidate private',async()=>{
  const f=await fixture({originalSettings:{bkGistId:ID},encrypted:true,hold:{startupKey:'preserved:startup:v1:'+'0'.repeat(64)}});await inspected(f);
  assert.equal(f.summaries.at(-1).status,'checked');assert.equal(f.summaries.at(-1).connections,1);
  assert.equal(f.summaries.at(-1).candidates[0].status,'work-present');assert.equal(f.calls.network.length,2);
  assert.deepEqual(f.keys,[KEY]);assert.equal(f.run('recoveryOriginalBackupCandidates.length'),1);
  const candidate=JSON.parse(f.run('JSON.stringify(recoveryOriginalBackupCandidates[0])'));
  assert.deepEqual(candidate.packet,f.packet);assert.equal(candidate.metadata.revision,REV);
  assert.equal(f.run('JSON.stringify(S)'),f.createdStates[0]);assert.equal(f.run('JSON.stringify(U.sheet)'),f.createdDrafts[0]);
  assert.equal(f.run('S.notes.length'),0);assert.deepEqual(JSON.parse(f.run('JSON.stringify(S.staffMemos)')),{});
  await assertReadOnly(f);assertPrivateUI(f);await assertNormalNetworkHeld(f);
});

test('original publication source presence cannot substitute for a missing whole-backup target',async()=>{
  const f=await fixture({originalSettings:{bkGistId:'',bkKey:'',key:KEY,groups:[{id:'PRIVATE_GROUP',name:'既存グループ',
    gistId:ID,src:'https://private.invalid/'+ORIGINAL,key:KEY}]}});await inspected(f);
  const result=f.summaries.at(-1);assert.equal(result.groupTargetStored,true);assert.equal(result.savedKeyStored,true);
  assert.equal(result.backupKeyStored,false);assert.equal(result.backupTargetStored,false);assert.equal(f.calls.network.length,0);
  await assertReadOnly(f);assertPrivateUI(f);
});

test('a dedicated settings click is captured before generic field commits, blur, saves and rendering',async()=>{
  const f=await fixture();await inspected(f);const stored=f.idb.snapshot(),editor=f.run('JSON.stringify(S)'),writes=clone(f.localWrites);
  f.run('U.sheet={memo:"PRIVATE_UNSAVED_DRAFT",privateFields:{memo:"PRIVATE_KEEP_DRAFT"}};callsForQA.commits=0;callsForQA.renders=0;'+
    'commitFields=()=>{callsForQA.commits++;throw Error("PRIVATE_GENERIC_COMMIT_FORBIDDEN")};'+
    'render=()=>{callsForQA.renders++;throw Error("PRIVATE_GENERIC_RENDER_FORBIDDEN")};');
  const draft=f.run('JSON.stringify(U.sheet)'),button=f.elements.get('recovery-original-backup-check');
  button.dataset.act='gopush';let blurred=0;
  f.document.activeElement={tagName:'INPUT',id:'memo',blur(){blurred++;}};
  let stopped=false,prevented=false;
  const target={closest:selector=>selector==='#recovery-original-backup-check'||selector==='[data-act]'?button:null};
  const event={target,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}};
  for(const handler of f.handlers.get('click')||[]){handler(event);if(stopped)break;}
  await until(()=>f.creates()===2);await inspected(f);
  assert(stopped);assert(prevented);assert.equal(f.calls.commits,0);assert.equal(f.calls.renders,0);assert.equal(blurred,0);
  assert.equal(f.run('JSON.stringify(S)'),editor);assert.equal(f.run('JSON.stringify(U.sheet)'),draft);
  assert.deepEqual(f.localWrites,writes);await assertReadOnly(f,stored);assertPrivateUI(f);
  button.disabled=true;for(const handler of f.handlers.get('click')||[]){handler(event);if(stopped)break;}
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.creates(),2);
});

for(const mode of ['state:0','state:1','hold','memory-state','draft','state-revision','legacy']){
  test('a concurrent '+mode+' change during GET rejects private candidates and retains current work',async()=>{
    let entered=false,release;const gate=new Promise(resolve=>release=resolve);
    const f=await fixture({originalSettings:{bkGistId:ID},fetch:async(url,input,response)=>{
      if(!entered){entered=true;await gate;}return {ok:true,status:200,url,text:async()=>JSON.stringify(response)};
    }});
    await until(()=>entered);assertHeld(f);
    if(mode==='state:0'||mode==='state:1'){
      const previous=f.idb.record(mode),state=JSON.parse(previous.txt);state.unknown.concurrent='PRIVATE_NEW_LOCAL_WORK';
      f.idb.replace(mode,{...previous,at:previous.at+1,txt:JSON.stringify(state)});
    }else if(mode==='hold')f.idb.replace(HOLD,{...f.idb.record(HOLD),privateConcurrent:'PRIVATE_CHANGED_HOLD'});
    else if(mode==='memory-state')f.run('S.notes.push({id:"PRIVATE_NEW_LOCAL_NOTE",memo:"PRIVATE_NEW_LOCAL_WORK"})');
    else if(mode==='draft')f.run('U.sheet={memo:"PRIVATE_NEW_LOCAL_DRAFT",lineIdx:0}');
    else if(mode==='state-revision')f.run('stateRevision++');
    else f.localValues.set('utacheck.v1','PRIVATE_CONCURRENT_LEGACY_BYTES');
    const before=f.idb.snapshot(),editor=f.run('JSON.stringify(S)'),draft=f.run('JSON.stringify(U.sheet)');
    release();await inspected(f);
    assert.equal(f.run('recoveryOriginalBackupCandidates.length'),0);assert.match(f.run('recoveryOriginalBackupReport'),/変わったため中止/);
    assert.equal(f.run('JSON.stringify(S)'),editor);assert.equal(f.run('JSON.stringify(U.sheet)'),draft);
    await assertReadOnly(f,before);assertPrivateUI(f);await assertNormalNetworkHeld(f);
  });
}

for(const mode of ['hidden','pagehide','owner-denied','stale']){
  test(mode+' during GET cancels the inspection without adopting credentials or a backup',async()=>{
    let entered=false,release,signal;const gate=new Promise(resolve=>release=resolve);
    const f=await fixture({originalSettings:{bkGistId:ID},fetch:async(url,input,response)=>{
      entered=true;signal=input.signal;await gate;return {ok:true,status:200,url,text:async()=>JSON.stringify(response)};
    }});
    await until(()=>entered);const editor=f.run('JSON.stringify(S)'),before=f.idb.snapshot();
    if(mode==='hidden'){
      f.document.hidden=true;
      // The first visibility listener owns read-only inspection cancellation;
      // later lifecycle listeners independently save ordinary editor drafts.
      f.handlers.get('visibilitychange')[0]();assert.equal(signal.aborted,true);
    }else if(mode==='pagehide'){
      f.windowHandlers.get('pagehide')[0]();assert.equal(signal.aborted,true);
    }else if(mode==='owner-denied')f.run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');
    else f.run('recordingInboxStale=true');
    release();await inspected(f);
    assert.equal(f.run('recoveryOriginalBackupCandidates.length'),0);assert.equal(f.run('JSON.stringify(S)'),editor);
    assert.equal(f.calls.network.length,1);await assertReadOnly(f,before);assertPrivateUI(f);
  });
}

test('busy repeats cannot create parallel inspectors or unblock ordinary network methods',async()=>{
  let entered=false,release;const gate=new Promise(resolve=>release=resolve);
  const f=await fixture({originalSettings:{bkGistId:ID},hold:{startupKey:'preserved:startup:v1:'+'0'.repeat(64)},fetch:async(url,input,response)=>{
    if(!entered){entered=true;await gate;}return {ok:true,status:200,url,text:async()=>JSON.stringify(response)};
  }});
  await until(()=>entered);assert.equal(f.creates(),1);assert.equal(f.elements.get('recovery-original-backup-check').disabled,true);
  await Promise.all([f.c.recoveryInspectOriginalBackup(),f.c.recoveryInspectOriginalBackup()]);
  assert.equal(f.creates(),1);assert.equal(f.calls.network.length,1);await assertNormalNetworkHeld(f);
  release();await inspected(f);await assertReadOnly(f);assertPrivateUI(f);
});

for(const mode of ['hidden','owner-denied','stale','no-hold','loading','blocked']){
  test('explicit inspection with '+mode+' cannot bypass the ready owner/visibility/hold gate',async()=>{
    const f=await fixture();await inspected(f);const creates=f.creates(),before=f.idb.snapshot(),editor=f.run('JSON.stringify(S)');
    if(mode==='hidden')f.document.hidden=true;
    else if(mode==='owner-denied')f.run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');
    else if(mode==='stale')f.run('recordingInboxStale=true');
    else if(mode==='no-hold')f.run('startupRecoveryNetworkHold=false');
    else f.c.syntheticPhase=mode,f.run('startupPhase=syntheticPhase');
    await f.c.recoveryInspectOriginalBackup();assert.equal(f.creates(),creates);assert.equal(f.calls.network.length,0);
    assert.equal(f.calls.saves,0);assert.equal(f.calls.reloads,0);assert.deepEqual(f.idb.snapshot(),before);
    assert.equal(f.run('JSON.stringify(S)'),editor);assert.equal(f.run('recoveryOriginalBackupCandidates.length'),0);
  });
}

test('missing optional preserved module leaves recovered editing available and all ordinary network paths held',async()=>{
  const f=await fixture({missingModule:true});await settle(f);
  await f.c.recoveryInspectOriginalBackup();assert.equal(f.creates(),0);assert.equal(f.calls.network.length,0);
  await assertReadOnly(f);await assertNormalNetworkHeld(f);assertPrivateUI(f);
});
