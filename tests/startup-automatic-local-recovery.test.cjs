'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const Inventory=require('../startup-local-storage-inventory.js');
const Recovery=require('../startup-local-publication-recovery.js');
const Reader=require('../startup-saved-publication-reader.js');
const Restoration=require('../startup-file-restoration.js');
const Inspection=require('../startup-file-inspection.js');
const Bounded=require('../startup-backup-inspection.js');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
// A full-suite run shares the crypto worker pool. Count elapsed time instead
// of fast setImmediate turns so asynchronous digests can finish under load.
const yieldIO=()=>new Promise(resolve=>setTimeout(resolve,5));
const clone=value=>JSON.parse(JSON.stringify(value));
const PRIVATE='PRIVATE_AUTOMATIC_RECOVERY';
const GIST='abcde12345',SOURCE_URL='https://gist.githubusercontent.com/owner/'+GIST+'/raw/utacheck.json';
function publication(extra={}){
  const shows=Array.from({length:5},(_,i)=>({id:'PRIVATE_SHOW_'+i,name:'PRIVATE_SHOW_NAME_'+i,absent:['PRIVATE_MEMBER']}));
  const lib=shows.map((_,i)=>({title:'PRIVATE_TITLE_'+i,credit:'PRIVATE_CREDIT',groups:{A:['PRIVATE_MEMBER']},order:['PRIVATE_MEMBER'],
    lines:[['A','  PRIVATE_LYRIC_'+i+'  ','A3','C3'],['→','PRIVATE_SECOND_'+i,'A4','C4'],['','   ']]}));
  const songs=shows.map((sh,i)=>({showId:sh.id,libIdx:i,take:1,fromIdx:null}));
  return {authorId:'PRIVATE_DEVICE',groupName:'PRIVATE_GROUP_NAME',src:SOURCE_URL,version:1,members:[{name:'PRIVATE_MEMBER'}],
    rosters:{PRIVATE_GROUP_NAME:['PRIVATE_MEMBER']},shows,lib,songs,focusShow:shows[3].id,
    notes:shows.map((sh,i)=>({showId:sh.id,songIdx:i,lineIdx:0,lineEnd:1,memberNames:['PRIVATE_MEMBER'],tags:['pitch'],
      memo:'PRIVATE_NOTE_'+i,from:2,to:lib[i].lines[0][1].length-2,pitch:'1-2',hand:{points:[[0.1,0.2]]},at:100+i})),
    memos:shows.map((sh,i)=>({showId:sh.id,songIdx:i,text:'PRIVATE_MEMO_'+i})),
    subs:[{showId:shows[0].id,songIdx:0,lineIdx:1,names:['PRIVATE_MEMBER']}],
    gsubs:[{showId:shows[0].id,songIdx:0,block:'A',names:['PRIVATE_MEMBER']}],...extra};
}
function emptyState(body=publication(),extra={}){
  return {deviceId:'PRIVATE_DEVICE',groups:[{id:'PRIVATE_GROUP_ID',name:'PRIVATE_GROUP_NAME',gistId:GIST,src:SOURCE_URL,key:'PRIVATE_GROUP_KEY',...(body?{lastKey:JSON.stringify(body)}:{})}],
    groupId:'PRIVATE_GROUP_ID',shows:[{id:'PRIVATE_EMPTY_SHOW',name:'PRIVATE_EMPTY_SHOW_NAME',hidden:true,privateMemo:'PRIVATE_SHOW_MEMO'}],showId:'PRIVATE_EMPTY_SHOW',
    songs:[],rsongs:[],notes:[],pubNotes:[],members:[],trash:[],memos:{},staffMemos:{},draws:{},recs:{},
    subs:{'PRIVATE_OLD_SHOW|PRIVATE_OLD_SONG':{0:['PRIVATE_OLD_MEMBER']}},gsubs:{'PRIVATE_OLD_SHOW|PRIVATE_OLD_SONG':{A:['PRIVATE_OLD_MEMBER']}},
    subsMan:{PRIVATE_OLD:[]},subLib:{PRIVATE_OLD:{text:'PRIVATE_LIBRARY_SETTING'}},plan:{start:'10:00',slots:[]},
    ghToken:'PRIVATE_TOKEN',bkKey:'PRIVATE_BACKUP_KEY',viewer:true,recMode:true,unknown:{preserved:'PRIVATE_UNKNOWN'},...extra};
}
function database(extra={},options={}){
  const state=emptyState(),clips={};
  for(let i=0;i<100;i++)clips['xls:PRIVATE_WORKBOOK_'+i]=new Blob([new Uint8Array([0x50,0x4b,3,4]),'PRIVATE_WORKBOOK_BYTES_'+i],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  for(let i=0;i<20;i++)clips['PRIVATE_OLD_SHOW|PRIVATE_OLD_SONG|'+i]=new Blob([new Uint8Array([0,0,0,20]),'ftyp','PRIVATE_AUDIO_BYTES_'+i],{type:'audio/mp4'});
  for(let i=0;i<4;i++)clips['PRIVATE_OTHER_'+i]=new Blob(['PRIVATE_BINARY_'+i],{type:'application/octet-stream'});
  return indexedFixture({state:{'state:0':{seq:2048,at:1000,txt:JSON.stringify(state)},'state:1':{seq:2047,at:900,txt:JSON.stringify(state)},...extra},clips},options);
}
function documentFixture(){
  const elements=new Map(),messages=[],handlers=new Map();
  const element=tag=>({tagName:tag.toUpperCase(),id:'',value:'',type:'password',dataset:{},disabled:false,hidden:false,inert:false,
    textContent:'',innerHTML:'',style:{setProperty(){},removeProperty(){}},children:[],
    classList:{add(){},remove(){},contains(){return false;},toggle(){}},setAttribute(name,value){this[name]=value;},getAttribute(name){return this[name];},
    append(...nodes){this.children.push(...nodes);},appendChild(node){this.children.push(node);if(node.id)elements.set(node.id,node);messages.push(node);return node;},
    remove(){if(this.id)elements.delete(this.id);},querySelector(){return null;},querySelectorAll(){return [];},closest(){return null;},
    addEventListener(){},removeEventListener(){},blur(){},focus(){},setSelectionRange(){},
    getBoundingClientRect(){return {x:0,y:0,top:0,left:0,right:390,bottom:844,width:390,height:844};}});
  const app=element('main');app.id='app';elements.set(app.id,app);const body=element('body');
  const document={hidden:false,body,activeElement:body,title:'',documentElement:element('html'),getElementById:id=>elements.get(id)||null,
    createElement:element,querySelector(){return null;},querySelectorAll(){return [];},
    addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},removeEventListener(){}};
  for(const name of ['input','password','label','visibility','visible-notice','check','cancel','restore','result']){
    const node=element(['input','password'].includes(name)?'input':'button');node.id='startup-file-'+name;node.hidden=name==='restore';node.disabled=['check','restore'].includes(name);elements.set(node.id,node);
  }
  for(const id of ['startup-local-recovery-result','startup-backup-check','startup-backup-result']){const node=element('pre');node.id=id;elements.set(id,node);}
  return {document,app,elements,messages,handlers};
}
function appContext(idb,options={}){
  const dom=documentFixture(),localValues=new Map(Object.entries(options.localValues||{})),localWrites=[],windowHandlers=new Map();
  const calls={network:[],saves:0,reloads:0,inventory:0,build:0,packets:[]};
  const localStorage={get length(){return localValues.size;},key:i=>[...localValues.keys()][i]??null,getItem:key=>localValues.get(key)??null,
    setItem(key,value){localWrites.push([key,value]);localValues.set(key,String(value));},removeItem(){throw Error(PRIVATE+'_DELETE_FORBIDDEN');}};
  class FileReader{readAsArrayBuffer(file){file.arrayBuffer().then(bytes=>{this.result=bytes;this.onload?.();});}abort(){this.onabort?.();}}
  const window={addEventListener(name,fn){if(!windowHandlers.has(name))windowHandlers.set(name,[]);windowHandlers.get(name).push(fn);},
    removeEventListener(){},innerWidth:390,innerHeight:844,scrollY:0,visualViewport:null,indexedDB:{databases:async()=>[{name:'utacheck',version:1}]}};
  const inventory=options.inventory||{inspect:async input=>{calls.inventory++;return Inventory.inspect(input);}};
  const recovery={build:(...args)=>{calls.build++;const result=Recovery.build(...args);if(result.packet)calls.packets.push(clone(result.packet));return result;}};
  const c=vm.createContext({window,document:dom.document,navigator:{},location:{hash:'',origin:'https://synthetic.invalid',pathname:'/',reload:()=>calls.reloads++},
    localStorage,sessionStorage:localStorage,indexedDB:{open(){throw Error(PRIVATE+'_NEW_DATABASE_FORBIDDEN');}},syntheticDatabase:idb.database,
    StartupLocalStorageInventory:inventory,StartupLocalPublicationRecovery:recovery,StartupSavedPublicationReader:options.reader||Reader,
    StartupFileRestoration:options.restorer||Restoration,StartupFileInspection:Inspection,StartupBackupInspection:Bounded,...(options.cacheStorage?{caches:options.cacheStorage}:{}),
    crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,File,FileReader,AbortController,
    btoa,atob,structuredClone,URL,URLSearchParams,performance:{now:()=>0},innerWidth:390,innerHeight:844,
    setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
    fetch:(url,input)=>{calls.network.push({url,input});if(options.fetch)return options.fetch(url,input);throw Error(PRIVATE+'_NETWORK_FORBIDDEN');},
    alert(){throw Error(PRIVATE+'_UNEXPECTED_ALERT');},prompt(){throw Error(PRIVATE+'_UNEXPECTED_PROMPT');},confirm(){throw Error(PRIVATE+'_UNEXPECTED_CONFIRM');},callsForQA:calls});
  vm.runInContext(source,c);vm.runInContext('DB=syntheticDatabase;save=()=>{callsForQA.saves++;throw Error("PRIVATE_NORMAL_SAVE_FORBIDDEN");};saveNow=save;',c);
  options.configure?.({c,document:dom.document,run:text=>vm.runInContext(text,c)});
  return {c,...dom,calls,localWrites,localValues,windowHandlers,run:text=>vm.runInContext(text,c)};
}
async function settle(f){
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
    await yieldIO();
    if(f.run('startupPhase')!=='loading'&&!f.run('startupAutomaticRecoveryActive')){await flush();return;}
  }
  throw Error('synthetic startup did not settle');
}
async function until(f,predicate){const deadline=Date.now()+5000;while(Date.now()<deadline){if(predicate())return;await yieldIO();}throw Error('synthetic operation did not reach gate');}
async function clipDigest(idb){return Promise.all([...idb.stores.get('clips')].map(async([key,value])=>[key,value.type,value.size,createHash('sha256').update(new Uint8Array(await value.arrayBuffer())).digest('hex')]));}
function safeProtectionOutput(f){
  const output=f.elements.get('startup-local-recovery-result').textContent;
  assert.doesNotMatch(output,/PRIVATE_|https?:\/\/|abcde12345|ghToken|bkKey|lastKey|authorId|完全復旧|最新/);
  assert.doesNotMatch(f.app.innerHTML,/PRIVATE_|https?:\/\/|abcde12345|ghToken|bkKey|lastKey|authorId/);
}
function assertNoActions(f,idb,before,sharedBefore){
  assert.equal(idb.writeCount(),0);assert.deepEqual(idb.snapshot(),before);assert.equal(f.calls.reloads,0);assert.equal(f.calls.saves,0);
  assert.equal(f.run('JSON.stringify(S)'),sharedBefore);assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);safeProtectionOutput(f);
}
test('actual app automatically recovers five-show lastKey work, atomically preserves both originals, verifies, reloads and renders while all 124 clip hashes stay unchanged',async()=>{
  const idb=database(),before=idb.snapshot(),clipsBefore=await clipDigest(idb),f=appContext(idb),sharedBefore=f.run('JSON.stringify(S)');
  await settle(f);assert.equal(f.run('startupDiagnostic.failure.code'),'empty-saved-state');assert.equal(f.calls.inventory,1);assert.equal(f.calls.build,1);
  assert.equal(f.calls.reloads,1);assert.equal(f.calls.network.length,0);assert.equal(f.calls.saves,0);assert.equal(idb.writeCount(),4);
  assert.equal(f.run('JSON.stringify(S)'),sharedBefore);assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.app.inert,true);safeProtectionOutput(f);
  assert.match(f.elements.get('startup-local-recovery-result').textContent,/部分復旧/);
  const hold=idb.record(Restoration.HOLD);assert.equal(hold.sourceKind,'local-publication');assert.equal(hold.sourceDateUnknown,true);assert.equal(hold.sourceAt,null);
  assert.equal(hold.seq,2049);assert.equal(hold.slot,1);assert.equal(f.calls.packets[0].sourceDateUnknown,true);
  assert.deepEqual(idb.record('state:0'),Object.fromEntries(before.state)['state:0']);
  assert.deepEqual(idb.record(hold.copyKey),{slots:['state:0','state:1'].map(key=>({present:true,value:Object.fromEntries(before.state)[key]})),legacy:null});
  assert.deepEqual(idb.record(hold.startupKey),{slots:['state:0','state:1'].map(key=>({present:true,value:idb.record(key)})),legacy:null});
  const writes=idb.events.filter(event=>['add','put','delete'].includes(event.op));assert.equal(new Set(writes.map(event=>event.tx)).size,1);
  assert.deepEqual(writes.map(event=>event.op),['add','add','add','put']);assert(writes.every(event=>event.store==='state'));
  const transactionId=writes[0].tx;assert(idb.events.some(event=>event.tx>transactionId&&event.mode==='readonly'&&event.key===hold.copyKey));
  assert.deepEqual(await clipDigest(idb),clipsBefore);
  const stored=JSON.parse(idb.record('state:1').txt);assert.equal(stored.songs.length,5);assert.equal(stored.notes.length,5);assert.equal(stored.ghToken,undefined);
  assert.equal(stored.shows.length,6);assert.equal(stored.shows[0].privateMemo,'PRIVATE_SHOW_MEMO');assert.equal(stored.showId,'PRIVATE_SHOW_3');
  assert.equal(stored.viewer,false);assert.equal(stored.recMode,false);assert.deepEqual(stored.unknown,{preserved:'PRIVATE_UNKNOWN'});
  assert.deepEqual(stored.subs['PRIVATE_OLD_SHOW|PRIVATE_OLD_SONG'],{0:['PRIVATE_OLD_MEMBER']});assert.deepEqual(stored.gsubs['PRIVATE_OLD_SHOW|PRIVATE_OLD_SONG'],{A:['PRIVATE_OLD_MEMBER']});
  assert.deepEqual(stored.subsMan,{PRIVATE_OLD:[]});assert.deepEqual(stored.subLib,{PRIVATE_OLD:{text:'PRIVATE_LIBRARY_SETTING'}});
  assert.deepEqual(stored.staffMemos,{});assert.deepEqual(stored.recs,{});assert.deepEqual(stored.draws,{});
  for(const [i,note] of stored.notes.entries()){
    const song=stored.songs[i];assert.equal(song.title,'PRIVATE_TITLE_'+i);assert.equal(song.lines[0].t,'  PRIVATE_LYRIC_'+i+'  ');
    assert.equal(song.lines[2].t,'   ');assert.equal(!!song.lines[2].gap,false);assert.equal(note.songId,song.id);assert.equal(note.showId,song.showId);
    assert.equal(note.from,2);assert.equal(note.to,song.lines[0].t.length-2);assert.equal(note.lineEnd,1);assert.equal(note.memo,'PRIVATE_NOTE_'+i);
    assert.deepEqual(note.hand,{points:[[0.1,0.2]]});assert.equal(stored.memos[song.showId+'|'+song.id],'PRIVATE_MEMO_'+i);
    assert.deepEqual(note.memberIds,[stored.members[0].id]);assert.deepEqual(note.tags,['pitch']);assert.equal(note.pitch,'1-2');
    assert(!Object.keys(stored.recs).some(key=>key.includes(song.id)),'old recording keys must not attach to same-title recovered songs');
  }
  assert.deepEqual(stored.subs[stored.songs[0].showId+'|'+stored.songs[0].id][1],[stored.members[0].id]);
  assert.deepEqual(stored.gsubs[stored.songs[0].showId+'|'+stored.songs[0].id].A,[stored.members[0].id]);
  const after=idb.snapshot(),reopened=appContext(idb);await settle(reopened);
  assert.equal(reopened.run('startupPhase'),'ready');assert.equal(reopened.run('booted'),true);assert.equal(reopened.app.inert,false);
  assert.equal(reopened.run('startupRecoveryNetworkHold'),true);assert.equal(reopened.run('startupRecoverySourceKind'),'local-publication');
  assert.equal(reopened.run('startupCanCommunicate()'),false);assert.equal(reopened.calls.network.length,0);assert.equal(reopened.calls.saves,0);
  assert.equal(reopened.calls.inventory,0);assert.equal(reopened.calls.reloads,0);assert.equal(idb.writeCount(),4);assert.deepEqual(idb.snapshot(),after);
  assert.deepEqual(await clipDigest(idb),clipsBefore);assert.match(reopened.app.innerHTML,/PRIVATE_TITLE_3/);
  const state=JSON.parse(reopened.run('JSON.stringify(S)'));assert.equal(state.notes[3].memo,'PRIVATE_NOTE_3');assert.equal(state.showId,'PRIVATE_SHOW_3');
  assert(reopened.messages.some(node=>node.textContent.includes('部分復旧')&&node.textContent.includes('自動送受信は停止中')));
  assert(!reopened.messages.some(node=>/完全復旧|最新/.test(node.textContent)));
  for(const expression of ['gistPush("PRIVATE_GROUP_ID",false)','doPush(true)','doBackup(true)','fetchSetlist()','syncSetlist(false)','checkOther(false)','importFromLink()'])await reopened.run(expression);
  assert.equal(reopened.calls.network.length,0);assert.equal(reopened.calls.saves,0);assert.equal(idb.writeCount(),4);assert.deepEqual(idb.snapshot(),after);
});
for(const mode of ['hidden','owner-denied','stale'])test('automatic '+mode+' guard leaves original storage and shared state unchanged',async()=>{
  const idb=database(),before=idb.snapshot(),f=appContext(idb,{configure:({document,run})=>{
    if(mode==='hidden')document.hidden=true;else if(mode==='stale')run('recordingInboxStale=true');else run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');
  }}),sharedBefore=f.run('JSON.stringify(S)');await settle(f);assertNoActions(f,idb,before,sharedBefore);assert.equal(f.calls.inventory,0);assert.equal(f.calls.network.length,0);
});
for(const mode of ['cancel','hidden','owner-denied','stale','new-slot','new-legacy'])test('during actual read-only inventory '+mode+' prevents recovery writes and reload',async()=>{
  let release,entered=false;
  const gate=new Promise(resolve=>release=resolve),idb=database(),f=appContext(idb,{inventory:{inspect:async options=>{
    const result=await Inventory.inspect(options);entered=true;await gate;return result;
  }}}),sharedBefore=f.run('JSON.stringify(S)');await until(f,()=>entered);
  if(mode==='cancel')f.c.startupCancelAutomaticRecovery();else if(mode==='hidden')f.document.hidden=true;
  else if(mode==='owner-denied')f.run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');else if(mode==='stale')f.run('recordingInboxStale=true');
  else if(mode==='new-slot'){const value=idb.record('state:0'),s=JSON.parse(value.txt);s.notes.push({id:'PRIVATE_CONCURRENT_NOTE',memo:'PRIVATE_CONCURRENT_MEMO'});idb.replace('state:0',{...value,seq:value.seq+1,txt:JSON.stringify(s)});}
  else f.localValues.set('utacheck.v1',JSON.stringify(emptyState(null,{notes:[{id:'PRIVATE_CONCURRENT_NOTE'}]})));
  const before=idb.snapshot();release();await settle(f);assertNoActions(f,idb,before,sharedBefore);assert.equal(f.calls.network.length,0);
});
for(const mode of ['author-mismatch','author-missing','device-missing','group-mismatch','different-lastKey','malformed-lastKey','invalid-state','invalid-json','partial','limit'])test('automatic '+mode+' source cannot select or write a recovery candidate',async()=>{
  const body=publication(),s=emptyState(body),options={};
  if(mode==='author-mismatch')body.authorId='PRIVATE_OTHER_DEVICE';else if(mode==='author-missing')delete body.authorId;
  else if(mode==='device-missing')s.deviceId='';else if(mode==='group-mismatch')body.groupName='PRIVATE_OTHER_GROUP';
  s.groups[0].lastKey=JSON.stringify(body);
  if(mode==='malformed-lastKey')s.groups[0].lastKey='PRIVATE_INVALID_JSON';
  const extra={'state:0':{seq:2048,at:1000,txt:JSON.stringify(s)},'state:1':{seq:2047,at:900,txt:JSON.stringify(s)}};
  if(mode==='different-lastKey'){const other=clone(s),different=clone(body);different.notes[0].memo='PRIVATE_DIFFERENT_NOTE';other.groups[0].lastKey=JSON.stringify(different);extra['state:1'].txt=JSON.stringify(other);}
  else if(mode==='invalid-state')extra['private-invalid-state']={groups:[],shows:[],songs:[{lines:'PRIVATE_INVALID_LINES'}]};
  else if(mode==='invalid-json')extra['private-invalid-json']='PRIVATE_INVALID_JSON';
  else if(mode==='partial')options.failRead=({op,key})=>op==='get'&&key==='never';
  const idb=database(extra,options),before=idb.snapshot();
  const inventory=['partial','limit'].includes(mode)?{inspect:async input=>{const result=await Inventory.inspect(input);result.summary.partial=true;result.summary[mode==='limit'?'limitHits':'readFailures']++;return result;}}:undefined;
  const f=appContext(idb,{inventory}),sharedBefore=f.run('JSON.stringify(S)');await settle(f);assertNoActions(f,idb,before,sharedBefore);assert.equal(f.calls.network.length,0);
});
test('a nonempty current state boots normally without starting automatic recovery or a network hold',async()=>{
  const s=emptyState(null,{viewer:false,recMode:false,songs:[{id:'PRIVATE_EXISTING_SONG',title:'PRIVATE_EXISTING_TITLE',showId:'PRIVATE_EMPTY_SHOW',groupId:'PRIVATE_GROUP_ID',lines:[{t:'PRIVATE_EXISTING_LYRIC',parts:[]}],roster:[]}],
    notes:[{id:'PRIVATE_EXISTING_NOTE',songId:'PRIVATE_EXISTING_SONG',showId:'PRIVATE_EMPTY_SHOW',lineIdx:0,memo:'PRIVATE_EXISTING_MEMO',tags:[],memberIds:[]}],src:'',groups:[]});
  const idb=database({'state:0':{seq:2048,at:1000,txt:JSON.stringify(s)},'state:1':{seq:2047,at:900,txt:JSON.stringify(s)}}),f=appContext(idb);await settle(f);
  assert.equal(f.run('startupPhase'),'ready');assert.equal(f.run('booted'),true);assert.equal(f.app.inert,false);assert.equal(f.calls.inventory,0);assert.equal(f.calls.build,0);
  assert.equal(f.run('startupRecoveryNetworkHold'),false);assert.equal(f.run('startupAutomaticRecoveryStarted'),false);assert.equal(idb.record(Restoration.HOLD),undefined);
  assert.equal(f.calls.reloads,0);assert.equal(f.calls.saves,0);assert.match(f.app.innerHTML,/PRIVATE_EXISTING_TITLE/);assert.equal(idb.writeCount(),1);
});
for(const mode of ['ambiguous-generation','ambiguous-legacy','nonempty-newer-invalid'])test(mode+' startup failure does not begin automatic recovery',async()=>{
  const s=emptyState(),other=clone(s);other.unknown.preserved='PRIVATE_DIFFERENT';let localValues={};
  const extra={'state:0':{seq:2048,at:1000,txt:JSON.stringify(s)},'state:1':{seq:2047,at:900,txt:JSON.stringify(s)}};
  if(mode==='ambiguous-generation')extra['state:1']={seq:2048,at:900,txt:JSON.stringify(other)};
  else if(mode==='ambiguous-legacy')localValues={'utacheck.v1':JSON.stringify(other)};
  else {s.songs=[{id:'PRIVATE_EXISTING',lines:[]}];extra['state:0'].txt='PRIVATE_BROKEN_NEWER';extra['state:1'].txt=JSON.stringify(s);}
  const idb=database(extra),before=idb.snapshot(),f=appContext(idb,{localValues}),sharedBefore=f.run('JSON.stringify(S)');await settle(f);
  assertNoActions(f,idb,before,sharedBefore);assert.equal(f.calls.inventory,0);assert.equal(f.calls.network.length,0);assert.notEqual(f.run('startupDiagnostic.failure.code'),'empty-saved-state');
});
const REVISION='a'.repeat(40),OLD_REVISION='b'.repeat(40);
function gistResponse(body=publication(),revision=REVISION,history=[REVISION]){
  return {id:GIST,owner:{login:'owner'},history:history.map(version=>({version})),
    files:{'utacheck.json':{filename:'utacheck.json',truncated:false,content:JSON.stringify(body)}}};
}
const response=value=>({ok:true,status:200,redirected:false,headers:{get:()=>null},text:async()=>JSON.stringify(value)});
function remoteDatabase(){const s=emptyState(null);return database({'state:0':{seq:2048,at:1000,txt:JSON.stringify(s)},'state:1':{seq:2047,at:900,txt:JSON.stringify(s)}});}
function onlyExistingGET(f){
  for(const {url,input} of f.calls.network){
    assert.match(url,new RegExp('^https://api\\.github\\.com/gists/'+GIST+'(?:/[a-f0-9]{40})?$'));
    assert.equal(input.method,'GET');assert.equal(input.credentials,'omit');assert.equal(input.referrerPolicy,'no-referrer');
    assert.equal(input.redirect,'error');assert.equal(input.cache,'no-store');assert.equal(input.body,undefined);
    assert(!Object.keys(input.headers).some(key=>/authorization|token/i.test(key)));assert(!JSON.stringify(input).includes('PRIVATE_'));
  }
}
test('actual existing-source reader uses only two unauthenticated GETs and restores verified owner publication without manual input',async()=>{
  const idb=remoteDatabase(),clipsBefore=await clipDigest(idb),f=appContext(idb,{fetch:(url)=>{
    assert(['https://api.github.com/gists/'+GIST,'https://api.github.com/gists/'+GIST+'/'+REVISION].includes(url));return response(gistResponse());
  }}),sharedBefore=f.run('JSON.stringify(S)');await settle(f);
  assert.equal(f.calls.network.length,2);onlyExistingGET(f);assert.equal(f.calls.reloads,1);assert.equal(idb.writeCount(),4);
  assert.equal(f.run('JSON.stringify(S)'),sharedBefore);assert.equal(JSON.parse(idb.record('state:1').txt).songs.length,5);
  assert.equal(idb.record(Restoration.HOLD).sourceKind,'local-publication');safeProtectionOutput(f);assert.deepEqual(await clipDigest(idb),clipsBefore);
  const reopened=appContext(idb);await settle(reopened);assert.equal(reopened.run('startupPhase'),'ready');assert.equal(reopened.calls.network.length,0);
  assert.equal(reopened.run('startupCanCommunicate()'),false);assert.equal(reopened.run('S.notes.length'),5);
});
test('actual existing-source reader can inspect one fixed older revision after the current publication is empty',async()=>{
  const idb=remoteDatabase(),old=publication({version:2}),empty=publication({lib:[],songs:[],shows:[],notes:[],memos:[],subs:[],gsubs:[],focusShow:''});
  const f=appContext(idb,{fetch:url=>response(gistResponse(url.endsWith('/'+OLD_REVISION)?old:empty,url.endsWith('/'+OLD_REVISION)?OLD_REVISION:REVISION,
    url.endsWith('/'+OLD_REVISION)?[OLD_REVISION]:[REVISION,OLD_REVISION]))});await settle(f);
  assert.equal(f.calls.network.length,3);onlyExistingGET(f);assert.equal(f.calls.reloads,1);assert.equal(idb.writeCount(),4);
  const hold=idb.record(Restoration.HOLD);assert.equal(hold.sourceAt,null);assert.equal(hold.sourceDateUnknown,true);safeProtectionOutput(f);
});
for(const mode of ['cancel','hidden','owner-denied','stale','new-slot','new-legacy'])test('during actual remote GET '+mode+' prevents automatic recovery writes',async()=>{
  let release,entered=false;const gate=new Promise(resolve=>release=resolve),idb=remoteDatabase();
  const f=appContext(idb,{fetch:async()=>{entered=true;await gate;return response(gistResponse());}}),sharedBefore=f.run('JSON.stringify(S)');await until(f,()=>entered);
  if(mode==='cancel')f.c.startupCancelAutomaticRecovery();else if(mode==='hidden')f.document.hidden=true;
  else if(mode==='owner-denied')f.run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');else if(mode==='stale')f.run('recordingInboxStale=true');
  else if(mode==='new-slot'){const current=idb.record('state:0'),s=JSON.parse(current.txt);s.notes=[{id:'PRIVATE_REMOTE_WAIT_NOTE',memo:'PRIVATE_NEW_NOTE'}];idb.replace('state:0',{...current,seq:current.seq+1,txt:JSON.stringify(s)});}
  else f.localValues.set('utacheck.v1',JSON.stringify(emptyState(null,{notes:[{id:'PRIVATE_REMOTE_WAIT_NOTE'}]})));
  const before=idb.snapshot();release();await settle(f);assertNoActions(f,idb,before,sharedBefore);onlyExistingGET(f);
});
for(const mode of ['author-mismatch','author-missing','group-mismatch'])test('actual remote '+mode+' remains blocked after read-only source check',async()=>{
  const body=publication();if(mode==='author-mismatch')body.authorId='PRIVATE_OTHER_DEVICE';else if(mode==='author-missing')delete body.authorId;else body.groupName='PRIVATE_OTHER_GROUP';
  const idb=remoteDatabase(),before=idb.snapshot(),f=appContext(idb,{fetch:()=>response(gistResponse(body))}),sharedBefore=f.run('JSON.stringify(S)');await settle(f);
  assertNoActions(f,idb,before,sharedBefore);onlyExistingGET(f);
});
for(const mode of ['same-payload-version','different-payload'])test('actual cache scan '+mode+' is compared by source identity before automatic selection',async()=>{
  const body=publication(),other=publication({version:99});if(mode==='different-payload')other.notes[0].memo='PRIVATE_DIFFERENT_CACHE_NOTE';
  let seenInventory;const idb=remoteDatabase(),before=idb.snapshot(),f=appContext(idb,{inventory:{inspect:async input=>seenInventory=await Inventory.inspect(input)},reader:{read:async()=>({publications:[],summary:{requests:0,publications:0}})},
    localValues:{['utacheck.selection:viewer:'+SOURCE_URL]:'PRIVATE_VIEWER_SETTING'},cacheStorage:{
      keys:async()=>['utacheck-v36'],match:async url=>url==='./setlist.json'?new Response(JSON.stringify(body)):url===SOURCE_URL?new Response(JSON.stringify(other)):undefined
    }}),sharedBefore=f.run('JSON.stringify(S)');await settle(f);
  assert.equal(seenInventory.publications.length,2,JSON.stringify(seenInventory.summary));
  if(mode==='different-payload'){
    assert.notEqual(seenInventory.publications[0].data.notes[0].memo,seenInventory.publications[1].data.notes[0].memo);
    f.c.privateCachePublications=seenInventory.publications;f.c.privateCacheRecords=seenInventory.records;
    assert.equal(f.run('startupRecordsWithPublications(privateCacheRecords,privateCachePublications)===null'),true);
  }
  if(mode==='different-payload')assertNoActions(f,idb,before,sharedBefore);
  else {assert.equal(f.calls.reloads,1);assert.equal(idb.writeCount(),4);assert.equal(JSON.parse(idb.record('state:1').txt).songs.length,5);safeProtectionOutput(f);}
  assert.equal(f.calls.network.length,0);
});
test('actual automatic commit rechecks both original envelopes and refuses a third writer after preparation',async()=>{
  const idb=database();let concurrent;
  const restorer={create:options=>{
    const actual=Restoration.create(options);return {...actual,prepare:async(...args)=>{
      const prepared=await actual.prepare(...args);assert.equal(prepared,true);const current=idb.record('state:0'),state=JSON.parse(current.txt);
      state.notes.push({id:'PRIVATE_CONCURRENT_NOTE',memo:'PRIVATE_CONCURRENT_MEMO'});idb.replace('state:0',{...current,seq:current.seq+1,txt:JSON.stringify(state)});concurrent=idb.snapshot();return prepared;
    }};
  }};
  const f=appContext(idb,{restorer}),sharedBefore=f.run('JSON.stringify(S)');await settle(f);assert(concurrent);
  assertNoActions(f,idb,concurrent,sharedBefore);assert.equal(f.calls.network.length,0);assert(idb.events.some(event=>event.mode==='readwrite'&&event.op==='abort'));
});
for(const mode of ['quota','failed-write','verify'])test('actual automatic '+mode+' failure retains protection, original copies and every clip',async()=>{
  const idb=database({},mode==='quota'?{throwWrite:2}:mode==='failed-write'?{failWrite:2}:{transformRead:({key,mode,value})=>
    mode==='readonly'&&key===Restoration.HOLD&&value?.v===1?{v:9}:value}),before=idb.snapshot(),clipsBefore=await clipDigest(idb),f=appContext(idb),sharedBefore=f.run('JSON.stringify(S)');
  await settle(f);assert.equal(f.run('startupPhase'),'blocked');assert.equal(f.run('JSON.stringify(S)'),sharedBefore);assert.equal(f.app.inert,true);
  assert.equal(f.calls.reloads,0);assert.equal(f.calls.network.length,0);assert.equal(f.calls.saves,0);safeProtectionOutput(f);assert.deepEqual(await clipDigest(idb),clipsBefore);
  assert.match(f.elements.get('startup-local-recovery-result').textContent,/保護停止を維持/);
  if(mode==='verify'){
    const hold=idb.record(Restoration.HOLD);assert.equal(hold.v,1);assert.deepEqual(idb.record(hold.copyKey),{slots:['state:0','state:1'].map(key=>({present:true,value:Object.fromEntries(before.state)[key]})),legacy:null});
  }else assert.deepEqual(idb.snapshot(),before);
});
test('a limited remote reader cannot write a ready-looking candidate from its partial publication list',async()=>{
  const idb=remoteDatabase(),before=idb.snapshot(),f=appContext(idb,{reader:{read:async()=>({publications:[{id:GIST,payload:publication()}],
    summary:{requests:1,publications:1,limited:true}})}}),sharedBefore=f.run('JSON.stringify(S)');await settle(f);
  assertNoActions(f,idb,before,sharedBefore);assert.equal(f.calls.network.length,0);
});
