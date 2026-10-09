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
for(const hold of [true,false])test('private schedule automatic atomic save works with hold '+hold+' and is idempotent',async()=>{
 const f=await setup({hold}),before=clone(f.run('S')),clips=f.idb.snapshot().clips;
 const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.status,'applied',JSON.stringify(result));assert.equal(result.count,1);
 const after=clone(f.run('S'));assert.equal(after.plan.slots[0].min,75);assert.equal(after.plan.slots[0].a0,601);assert.deepEqual(after.plan.slots[0].takes,{A:2});
 for(const k of Object.keys(before).filter(k=>!['plan','privatePreparations'].includes(k)))assert.deepEqual(after[k],before[k]);
 assert.deepEqual(f.idb.snapshot().clips,clips);assert.equal(JSON.parse(f.idb.record('state:'+f.run('saveSeq%2')).txt).privatePreparations['schedule-example'].sha256,f.operation.sha256);
 assert(f.idb.snapshot().state.some(([k])=>k.startsWith(Store.PREFIX+'editor:')));assert.equal(f.calls.network.length,0);assert.equal(f.calls.saves,0);
 const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');assert.deepEqual(f.idb.snapshot(),db);
});
test('missing auth never reads and does not create credentials or alter state',async()=>{const f=await setup({token:''}),before=f.run('JSON.stringify(S)'),db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'missing-token');assert.equal(f.reads,0);assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.localWrites.length,0);});
test('active/pending recordings, sheet input, preview and live slot defer before network',async()=>{
 for(const guard of ['REC={}','recordingStartPending=true','recordingFinalizePending=true','pitchStartPending=true','U.sheet={}','preview="{}"','S.plan.slots[0].a1=null','syncing=true','manualSync=true','backupInFlight=true','publishInFlight=true','micStream={}','PT.on=true']){
  const f=await setup();f.run(guard);const before=f.run('JSON.stringify(S)'),db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'deferred',guard);assert.equal(f.reads,0);assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);
 }
});
test('network/auth failure never falls back to public/member sources or changes state',async()=>{
 for(const code of ['HTTP_401','HTTP_403','HTTP_404','REPOSITORY_NOT_PRIVATE','FETCH_FAILED']){const f=await setup({source:async()=>({status:'unavailable',code})}),before=f.run('JSON.stringify(S)'),db=f.idb.snapshot();const result=await f.c.PrivatePreparationUI.receive(true);assert(['access','offline'].includes(result.status));assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.calls.network.length,0);}
});
test('token changes during source read stop before applying',async()=>{const f=await setup({source:async({f,manifest})=>{f.run('S.ghToken="another-synthetic-token"');return{status:'ready',manifest,sourceSha:'b'.repeat(40)};}}),db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'deferred');assert.equal(f.run('S.plan.slots[0].min'),90);assert.deepEqual(f.idb.snapshot(),db);});
test('source edits to existing target are not overwritten',async()=>{const f=await setup({source:async({f,manifest})=>{f.run('S.plan.slots[0].at=620');return{status:'ready',manifest,sourceSha:'b'.repeat(40)};}}),db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'conflict');assert.equal(f.run('S.plan.slots[0].at'),620);assert.deepEqual(f.idb.snapshot(),db);});
test('missing target cannot receive a receipt or apply a partial schedule',async()=>{const f=await setup();f.run('S.plan.slots=[]');const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'conflict');assert.equal(f.run('S.privatePreparations'),undefined);assert.deepEqual(f.idb.snapshot(),db);});
test('immutable operation id reuse is visible and never rolls schedule back',async()=>{const f=await setup();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');f.packet.updates[0].next.min=60;f.operation.sha256=await Preparation.digest(f.packet,webcrypto);const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'conflict');assert.equal(f.run('S.plan.slots[0].min'),75);assert.deepEqual(f.idb.snapshot(),db);});
test('storage failed before commit preserves editor; uncertain committed save blocks writes',async()=>{
 for(const committed of [false,true]){const f=await setup({store:{commit:async()=>({status:committed?'unverified':'rejected',committed})}}),before=f.run('JSON.stringify(S)');const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.status,committed?'unverified':'conflict');assert.equal(f.run('JSON.stringify(S)'),before);assert.equal(f.run('startupPhase'),committed?'blocked':'ready');}
});
test('unsupported writer ownership never creates a marker, credential, or local change',async()=>{const f=await setup({owner:false}),before=f.run('JSON.stringify(S)'),db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'unsupported');assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.localWrites.length,0);});
test('normal settings hook exposes honest source state without auth material',async()=>{const f=await setup({token:''});await f.c.PrivatePreparationUI.receive(true);const html=f.c.PrivatePreparationUI.settingsHTML();assert.match(html,/未接続/);assert.match(html,/private-preparation-check/);assert.doesNotMatch(html,/password|type="password"|synthetic-token/);});
function serviceWorkerFixture(f,replies){
 let count=0;
 f.c.location.href='https://synthetic.invalid/utacheck/';
 f.c.MessageChannel=class{constructor(){const a={onmessage:null,close(){}},b={close(){},reply(data){queueMicrotask(()=>a.onmessage?.({data}));}};this.port1=a;this.port2=b;}};
 const controller={scriptURL:'https://synthetic.invalid/utacheck/sw.js',postMessage(data,ports){const single=replies[Math.min(count++,replies.length-1)];ports[0].reply({type:data.type,nonce:data.nonce,single});}};
 f.c.navigator.serviceWorker={controller,addEventListener(){}};f.c.navigator.locks={request(){throw Error('real initialization is stubbed below')}};
 f.c.initializeRecordingInboxOwner=async()=>f.run('recordingInboxOwner={canWrite:true};recordingInboxStale=false');
 const txt=f.run('JSON.stringify(packState(S))');f.idb.replace('state:0',{seq:2,at:1,txt});f.idb.replace('state:1',{seq:1,at:1,txt});
 return {get count(){return count;}};
}
test('first private reception verifies a single page before and after writer marker, then applies without reloading',async()=>{
 const f=await setup({owner:false}),sw=serviceWorkerFixture(f,[true,true]);assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');assert.equal(sw.count,2);assert.equal(f.localValues.get('utacheck:recording-inbox:writer-required-v1'),'1');assert.equal(f.calls.reloads,0);assert.equal(f.run('S.plan.slots[0].min'),75);
});
test('a hidden or legacy second page blocks before creating a writer marker or saving the preparation',async()=>{
 const f=await setup({owner:false}),sw=serviceWorkerFixture(f,[false]),db=f.idb.snapshot(),before=f.run('JSON.stringify(S)');assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'multiple-windows');assert.equal(sw.count,1);assert.equal(f.localValues.get('utacheck:recording-inbox:writer-required-v1'),undefined);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.run('JSON.stringify(S)'),before);
});
test('a page appearing during first ownership transition blocks without any preparation write',async()=>{
 const f=await setup({owner:false}),sw=serviceWorkerFixture(f,[true,false]),db=f.idb.snapshot(),before=f.run('JSON.stringify(S)');assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'multiple-windows');assert.equal(sw.count,2);assert.equal(f.localValues.get('utacheck:recording-inbox:writer-required-v1'),'1');assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.run('JSON.stringify(S)'),before);assert.equal(f.run('recordingInboxCanWrite()'),false);
});
test('newer durable editor revision prevents flushing or replacing the old in-memory editor',async()=>{
 const f=await setup({owner:false});serviceWorkerFixture(f,[true,true]);const txt=f.run('JSON.stringify(packState(S))');f.idb.replace('state:1',{seq:9,at:2,txt});let flushes=0;f.c.saveNow=async()=>flushes++;const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'conflict');assert.equal(flushes,0);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.localValues.get('utacheck:recording-inbox:writer-required-v1'),undefined);
});
test('service worker client check includes hidden/uncontrolled windows and binds the requesting client',async()=>{
 const handlers={};let windows=[],options,reply;
 const c={URL,Response,self:{registration:{scope:'https://synthetic.invalid/utacheck/'},location:{origin:'https://synthetic.invalid'},clients:{matchAll:async o=>{options=o;return windows;}},addEventListener:(n,fn)=>handlers[n]=fn}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../sw.js','utf8'),c);
 async function check(list,source='self'){windows=list;reply=null;let pending;handlers.message({data:{type:'utacheck-private-preparation-client-check-v1',nonce:'a'.repeat(32)},source:{id:source},ports:[{postMessage:v=>reply=v,close(){}}],waitUntil:p=>pending=p});await pending;return reply.single;}
 const self={id:'self',url:'https://synthetic.invalid/utacheck/'},other={id:'other',url:'https://synthetic.invalid/utacheck/?old=1',visibilityState:'hidden'};
 assert.equal(await check([self]),true);assert.equal(await check([self,other]),false);assert.equal(await check([self],'other'),false);assert.equal(await check([self,{id:'different-app',url:'https://synthetic.invalid/shinkou/'}]),true);assert.equal(options.includeUncontrolled,true);assert.equal(options.type,'window');
});
test('pending whole-state restore/import in the existing shared gate blocks source read and applying',async()=>{
 const f=await setup();const release=f.run('enterRecordingInboxEditor()');assert.equal(f.run('recordingInboxIntegration.gate.activeEditors'),1);const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'deferred');assert.equal(f.reads,0);assert.deepEqual(f.idb.snapshot(),db);release();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');
});
test('an import starting while source fetch waits postpones receipt until that import ends',async()=>{
 let release;const f=await setup({source:async({f,manifest})=>{release=f.run('enterRecordingInboxEditor()');return {status:'ready',manifest,sourceSha:'a'.repeat(40)};}});const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'deferred');assert.deepEqual(f.idb.snapshot(),db);release();
});
test('the private commit holds the existing shared gate throughout all asynchronous storage work',async()=>{
 let f,attempt;
 const store={commit:async options=>{assert.equal(f.run('recordingInboxIntegration.gate.applying'),true);attempt=f.run('enterRecordingInboxEditor()');return Store.commit(options);}};
 f=await setup({store});assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');assert.equal(attempt,null);assert.equal(f.run('recordingInboxIntegration.gate.applying'),false);assert.equal(f.run('recordingInboxWriters'),0);
});
test('an owner note edited after fetch is retained with the narrow schedule update',async()=>{
 const f=await setup({source:async({f,manifest})=>{f.run('S.notes[0].memo="New owner text after fetch";stateRevision++');return {status:'ready',manifest,sourceSha:'a'.repeat(40)};}});
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');assert.equal(f.run('S.notes[0].memo'),'New owner text after fetch');
});
test('a late edit during commit preparation cancels the transaction and preserves the edit',async()=>{
 let f;const store={commit:async options=>{f.run('S.notes[0].memo="Late owner edit";stateRevision++');return Store.commit(options);}};f=await setup({store});const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'conflict');assert.equal(f.run('S.notes[0].memo'),'Late owner edit');assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.run('S.plan.slots[0].min'),90);
});
test('quota failure before writer marker leaves the current editor usable and unchanged',async()=>{
 const f=await setup({owner:false});serviceWorkerFixture(f,[true,true]);f.c.localStorage.setItem=()=>{throw Error('QuotaExceededError')};const db=f.idb.snapshot(),before=f.run('JSON.stringify(S)');assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'conflict');assert.equal(f.app.inert,false);assert.equal(f.run('recordingInboxCanWrite()'),true);assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);
});
test('second service-worker check interruption requires reload and keeps editing denied without committing data',async()=>{
 const f=await setup({owner:false});serviceWorkerFixture(f,[true,true]);const original=f.c.navigator.serviceWorker.controller.postMessage;let count=0;f.c.navigator.serviceWorker.controller.postMessage=(...args)=>{if(++count===2)throw Error('Worker changed');return original(...args);};const db=f.idb.snapshot(),before=f.run('JSON.stringify(S)');assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'owner-required');assert.equal(f.app.inert,true);assert.equal(f.run('recordingInboxCanWrite()'),false);assert(f.elements.has('recording-inbox-readonly'));assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);
});
test('second service-worker response timeout requires reload without leaving an unexplained frozen editor',async()=>{
 const f=await setup({owner:false});serviceWorkerFixture(f,[true,true]);f.c.setTimeout=(fn,ms)=>ms===5000?setTimeout(fn,5):0;const original=f.c.navigator.serviceWorker.controller.postMessage;let count=0;f.c.navigator.serviceWorker.controller.postMessage=(...args)=>{if(++count!==2)return original(...args);};const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'owner-required');assert.equal(f.run('recordingInboxCanWrite()'),false);assert(f.elements.has('recording-inbox-readonly'));assert.deepEqual(f.idb.snapshot(),db);
});

test('private LIVE reorder keeps selected song identity and original annotations',async()=>{
 const f=await setup();f.run("S.groups[0].nopub=true;S.shows[0].nopub=true;S.songs.push({...JSON.parse(JSON.stringify(S.songs[0])),id:'second',title:'Second'});S.recMode=false;U.songIdx=0");
 const packet={app:'utacheck-live-update',version:1,groupId:'original-group',showId:'show',order:{before:['song','second'],after:['second','song']}};
 const op={id:'live-reorder',type:'live-update',packet,sha256:await Preparation.digest(packet,webcrypto)};f.manifest.operations=[op];
 const before=clone(f.run('S.notes')),result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.status,'applied',JSON.stringify(result));assert.equal(f.run('song().id'),'song');assert.equal(f.run('U.songIdx'),1);assert.deepEqual(clone(f.run('S.notes')),before);
});
