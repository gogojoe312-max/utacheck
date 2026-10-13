'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const {appContext,settle,clone}=require('./startup-excel-recovery-fixture.cjs');
const Store=require('../recovery-delivery-store.js'),Preparation=require('../private-preparation.js');
async function setup({hold=true,store=Store,owner=true,source,token='synthetic-token'}={}){
 const held={v:1,seq:1,slot:1,copyKey:'preserved:recovery:v1:'+'a'.repeat(64),sourceKind:'cloud-publication'};
 const idb=indexedFixture({state:hold?{'recovery:network-hold:v1':held}:{},clips:{audio:new Blob(['original audio'])}});
 const f=appContext(idb),state=clone(f.run('S0'));
 Object.assign(state,{deviceId:'test-private-owner',ghToken:token,groups:[{id:'original-group',name:'Original'}],groupId:'original-group',showId:'show',shows:[{id:'show',groupId:'original-group',name:'Original'}],songs:[{id:'song',showId:'show',groupId:'original-group',title:'Existing song',roster:[],lines:[{t:'Existing lyric',parts:[]}],blocks:{}}],notes:[{id:'note',songId:'song',showId:'show',memo:'Keep original note',tags:[],memberIds:[]}],recs:{audio:{dur:30}},plan:{year:2031,timezone:'Asia/Tokyo',start:'10:00',slots:[{id:'slot',name:'Synthetic singer',kind:'member',date:'2031-02-03',day:'2/3',place:'Synthetic studio',at:600,min:90,a0:601,a1:691,takes:{A:2}}]}});
 idb.replace('state:0',{seq:2,at:1,txt:JSON.stringify(state)});idb.replace('state:1',{seq:1,at:1,txt:JSON.stringify(state)});
 await settle(f);assert.equal(f.run('startupPhase'),'ready');vm.runInContext(fs.readFileSync(__dirname+'/../recording-inbox.js','utf8'),f.c);f.run('saveNow=async()=>{};recordingInboxIntegration=setupRecordingInboxIntegration()');
 if(owner)f.run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:true}');
 const expected=Object.fromEntries(['name','kind','date','day','place','at','min'].map(k=>[k,state.plan.slots[0][k]]));
 const packet={app:'utacheck-recording-schedule-update',version:1,id:'schedule-example',year:2031,timezone:'Asia/Tokyo',updates:[{id:'slot',expected,next:{at:600,min:75}}]};
 const operation={id:'schedule-example',type:'recording-schedule',sha256:await Preparation.digest(packet,webcrypto),packet};
 const manifest={app:'utacheck-private-preparation',version:1,owner:'gogojoe312-max',revision:'synthetic-v1',createdAt:'2031-02-01T00:00:00Z',operations:[operation]};
 f.c.RecoveryDeliveryStore=store;let reads=0;
 f.c.PrivatePreparationSource={read:async options=>{reads++;return source?source({options,f,manifest}):{status:'ready',manifest,sourceSha:'a'.repeat(40)};}};
 for(const path of ['private-preparation.js','recording-schedule-update.js','private-preparation-ui.js'])vm.runInContext(fs.readFileSync(__dirname+'/../'+path,'utf8'),f.c);
 f.localWrites.length=0;return {...f,idb,state,packet,operation,manifest,get reads(){return reads;}};
}
async function fixture(options={}){
 const f=await setup({token:'',...options});f.c.confirm=()=>true;
 const packet={app:'utacheck-recording-song',version:1,group:{id:'private-rec',name:'配信しない',nopub:true},song:{id:'synthetic-song',title:'Synthetic title',artist:'Synthetic artist',credit:'',lines:[{t:'Synthetic text',parts:[]}]},source:{file:'synthetic.docx'}};
 const operation={id:'synthetic-song-op',type:'recording-song',packet,sha256:await Preparation.digest(packet,webcrypto)};
 f.manifest.operations.push(operation);
 f.file=()=>{const raw=JSON.stringify(f.manifest);return {size:Buffer.byteLength(raw),text:async()=>raw};};return f;
}
test('local preparation adds lyrics without credentials or network and retains active plan, clips and existing data',async()=>{
 const f=await fixture();f.run('S.plan.slots[0].a1=null');const before=clone(f.run('S')),clips=f.idb.snapshot().clips;
 const result=await f.c.PrivatePreparationUI.importFile(f.file());assert.equal(result.status,'applied',JSON.stringify(result));assert.equal(result.count,1);
 const after=clone(f.run('S'));for(const key of Object.keys(before).filter(k=>!['groups','rsongs','privatePreparations'].includes(k)))assert.deepEqual(after[key],before[key],key);
 assert.equal(after.rsongs.at(-1).id,'synthetic-song');assert.equal(after.privatePreparations['schedule-example'],undefined);assert.deepEqual(f.idb.snapshot().clips,clips);
 assert.equal(f.reads,0);assert.equal(f.calls.network.length,0);assert(f.idb.snapshot().state.some(([k])=>k.startsWith(Store.PREFIX+'editor:')));
 const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.importFile(f.file())).status,'current');assert.deepEqual(f.idb.snapshot(),db);
});
test('local file requires confirmation, valid manifest hash and correct owner before any storage change',async()=>{
 for(const kind of ['cancel','hash','owner','backup','oversize']){
  const f=await fixture();if(kind==='cancel')f.c.confirm=()=>false;if(kind==='hash')f.manifest.operations.at(-1).sha256='0'.repeat(64);if(kind==='owner')f.manifest.owner='other';
  let file=f.file();if(kind==='backup')file={size:10,text:async()=>JSON.stringify({bk:1,state:{}})};if(kind==='oversize')file={size:21*1024*1024,text:async()=>{throw Error('must not read')}};
  const db=f.idb.snapshot(),before=f.run('JSON.stringify(S)');assert.equal((await f.c.PrivatePreparationUI.importFile(file)).status,kind==='cancel'?'cancelled':'conflict',kind);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.run('JSON.stringify(S)'),before);assert.equal(f.reads,0);
 }
});
test('local preparation rejects operation reuse, duplicate song and nonlyrics manifests',async()=>{
 for(const kind of ['receipt','duplicate','no-song']){
  const f=await fixture();if(kind==='receipt')f.run('S.privatePreparations={"synthetic-song-op":{sha256:"wrong",type:"recording-song"}}');if(kind==='duplicate')f.run('S.rsongs=[{id:"synthetic-song",title:"Existing"}]');if(kind==='no-song')f.manifest.operations.pop();
  const before=f.run('JSON.stringify(S)'),db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.importFile(f.file())).status,'conflict');assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.reads,0);
 }
});
test('local import defers recording, editor and visibility conflicts without reading file',async()=>{
 for(const guard of ['REC={}','U.sheet={}','document.hidden=true','manualSync=true']){
  const f=await fixture();f.run(guard);const db=f.idb.snapshot();let reads=0;const file={size:1,text:async()=>{reads++;return '{}'}};assert.equal((await f.c.PrivatePreparationUI.importFile(file)).status,'deferred');assert.equal(reads,0);assert.deepEqual(f.idb.snapshot(),db);
 }
});
test('local file changing state while read is checked against current target and never overwrites newer data',async()=>{
 const f=await fixture(),file=f.file(),raw=await file.text();file.text=async()=>{f.run('S.rsongs=[{id:"synthetic-song",title:"Newer existing"}];stateRevision++');return raw;};
 const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.importFile(file)).status,'conflict');assert.equal(f.run('S.rsongs[0].title'),'Newer existing');assert.deepEqual(f.idb.snapshot(),db);
});
test('local transaction fails safely before commit and blocks writes after uncertain commit',async()=>{
 for(const committed of [false,true]){
  const f=await fixture({store:{commit:async()=>({status:committed?'unverified':'rejected',committed})}}),before=f.run('JSON.stringify(S)');
  assert.equal((await f.c.PrivatePreparationUI.importFile(f.file())).status,committed?'unverified':'conflict');assert.equal(f.run('JSON.stringify(S)'),before);assert.equal(f.run('startupPhase'),committed?'blocked':'ready');assert.equal(f.reads,0);
 }
});
test('all local songs are preflighted before any partial addition',async()=>{
 const f=await fixture(),packet=clone(f.manifest.operations.at(-1).packet);packet.song.id='existing-song';
 f.manifest.operations.push({id:'other-operation',type:'recording-song',packet,sha256:await Preparation.digest(packet,webcrypto)});
 f.run('S.rsongs=[{id:"existing-song",title:"Keep me"}]');const before=f.run('JSON.stringify(S)'),db=f.idb.snapshot();
 assert.equal((await f.c.PrivatePreparationUI.importFile(f.file())).status,'conflict');assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);
});
test('owner interruption while confirmation is open prevents applying',async()=>{
 const f=await fixture();f.c.confirm=()=>{f.run('REC={}');return true;};const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.importFile(f.file())).status,'deferred');assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.reads,0);
});
test('successful local addition reveals all artists while preserving the selected song',async()=>{
 const f=await fixture();f.run('S.recMode=true;S.rsongs=[{id:"selected-rec",title:"Existing REC",artist:"Original artist",groupId:"original-group",lines:[{t:"Original lyric",parts:[]}]}];S.rsongId="selected-rec";U.songIdx=0;U.recArtistFilter="Original artist"');
 const result=await f.c.PrivatePreparationUI.importFile(f.file());assert.equal(result.status,'applied',JSON.stringify(result));assert.equal(f.run('U.recArtistFilter'),'');assert.equal(f.run('S.rsongId'),'selected-rec');assert.equal(f.run('U.songIdx'),0);assert.equal(f.run('S.rsongs[0].title'),'Existing REC');
});
