'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const {appContext,settle,clone}=require('./startup-excel-recovery-fixture.cjs');
const Store=require('../recovery-delivery-store.js'),Preparation=require('../private-preparation.js');
const rawDigest=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
async function setup({hold=true,store=Store,owner=true,source,token='synthetic-token',idbOptions={}}={}){
 const held={v:1,seq:1,slot:1,copyKey:'preserved:recovery:v1:'+'a'.repeat(64),sourceKind:'cloud-publication'};
 const idb=indexedFixture({state:hold?{'recovery:network-hold:v1':held}:{},clips:{audio:new Blob(['original audio'])}},idbOptions);
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
async function originalOperation(name='original.xlsx',contents='synthetic original bytes'){
 const bytes=Buffer.from(contents),packet={app:'utacheck-original-excel',version:1,name,size:bytes.length,sha256:rawDigest(bytes),base64:bytes.toString('base64')};
 return {id:'original-'+packet.sha256,type:'original-excel',packet,sha256:await Preparation.digest(packet,webcrypto)};
}
function prepareOriginalFixture(f,options={}){
 let calls=0;
 f.c.prepareOriginalExcelAttachment=async(current,packet,{isActive})=>{
  calls++;assert.equal(f.run('recordingInboxIntegration.gate.applying'),false);assert.equal(f.app.inert,false);assert.equal(isActive(),true);
  await options.before?.({current,packet,isActive});
  for(const file of [packet,...(packet.exportFile?[packet.exportFile]:[])]){
   const blob=new Blob([Buffer.from(file.base64,'base64')]);await f.c.putClip('xls:sha256-'+file.sha256,blob);
   assert.equal(rawDigest(Buffer.from(await(await f.c.getClip('xls:sha256-'+file.sha256)).arrayBuffer())),file.sha256);
  }
  await options.after?.({current,packet,isActive});
  const state=clone(current),sourceId='sha256-'+(packet.exportFile||packet).sha256,unmatched=typeof options.unmatched==='function'?options.unmatched():options.unmatched;
  const targets=unmatched?[]:state.songs.filter(song=>!song.xlsSourceId||song.xlsSourceId===sourceId);
  for(const song of targets)Object.assign(song,{xls:1,xlsSourceId:sourceId});
  return {state,linked:targets.length,stored:packet.exportFile?2:1,unmatched:targets.length?0:1};
 };
 return {get calls(){return calls;}};
}
test('original reception prepares files before the short writer transaction and reuses one confirmed source snapshot',async()=>{
 let commits=0;const f=await setup({store:{commit:options=>{commits++;return Store.commit(options);}}}),first=await originalOperation(),second=await originalOperation('other.xlsx','other synthetic bytes');f.manifest.operations=[first,second];
 f.run('S.plan.slots[0].a1=null');const before=clone(f.run('S')),prepared=prepareOriginalFixture(f);
 const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.status,'applied',JSON.stringify(result));assert.equal(result.count,2);assert.equal(prepared.calls,2);assert.equal(f.reads,2);
 const after=clone(f.run('S'));for(const key of Object.keys(before).filter(key=>!['songs','privatePreparations'].includes(key)))assert.deepEqual(after[key],before[key],key);
 assert.deepEqual(after.songs[0].lines,before.songs[0].lines);assert.equal(after.privatePreparations[first.id].stored,1);assert.equal(commits,1);
 assert.equal(after.privatePreparations[first.id].targetSha256,after.privatePreparations[second.id].targetSha256);
 const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');assert.equal(prepared.calls,2);assert.deepEqual(f.idb.snapshot(),db);
});
test('a multi-original batch interruption or quota failure leaves no partial links, receipts or durable state',async()=>{
 for(const mode of ['input','quota']){
  const idbOptions={};let commits=0;
  const f=await setup({idbOptions,store:{commit:options=>{commits++;if(mode==='quota')idbOptions.failWrite=f.idb.writeCount()+2;return Store.commit(options);}}});
  f.manifest.operations=[await originalOperation(),await originalOperation('second.xlsx','second synthetic bytes')];
  const before=clone(f.run('S')),durable=f.idb.snapshot().state;let prepared=0;
  prepareOriginalFixture(f,{after:()=>{if(++prepared===2&&mode==='input')f.run('U.menu={kind:"person-selection"}');}});
  const result=await f.c.PrivatePreparationUI.receive(true);
  assert.equal(result.status,mode==='input'?'deferred':'conflict');assert.equal(prepared,2);assert.equal(commits,mode==='input'?0:1);
  assert.deepEqual(clone(f.run('S')),before);assert.deepEqual(f.idb.snapshot().state,durable);assert.equal(f.run('S.privatePreparations'),undefined);assert.equal(f.app.inert,false);
  for(const op of f.manifest.operations)assert(await f.c.getClip('xls:sha256-'+op.packet.sha256),'verified immutable blobs may remain for retry');
 }
});
test('a restored original receipt with missing export bytes restores both files and retains its prior counts and timestamp',async()=>{
 const f=await setup(),op=await originalOperation('legacy.xls'),converted=await originalOperation('converted.xlsx','converted synthetic bytes');
 op.packet.exportFile=Object.fromEntries(['name','size','sha256','base64'].map(key=>[key,converted.packet[key]]));op.sha256=await Preparation.digest(op.packet,webcrypto);f.manifest.operations=[op];
 const prepared=prepareOriginalFixture(f);assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');
 const before=clone(f.run('S')),receipt=before.privatePreparations[op.id];f.idb.stores.get('clips').delete('xls:sha256-'+op.packet.exportFile.sha256);
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');assert.equal(prepared.calls,2);assert.deepEqual(clone(f.run('S')),before);
 assert.deepEqual(clone(f.run('S.privatePreparations'))[op.id],receipt);assert(await f.c.getClip('xls:sha256-'+op.packet.exportFile.sha256));
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');assert.equal(prepared.calls,2);
});
test('same-size corrupted original bytes are detected despite an existing matching receipt',async()=>{
 const f=await setup(),op=await originalOperation();f.manifest.operations=[op];const prepared=prepareOriginalFixture(f);
 await f.c.PrivatePreparationUI.receive(true);f.idb.replace('xls:sha256-'+op.packet.sha256,new Blob(['x'.repeat(op.packet.size)]),'clips');
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');assert.equal(prepared.calls,2);
 assert.equal(rawDigest(Buffer.from(await(await f.c.getClip('xls:sha256-'+op.packet.sha256)).arrayBuffer())),op.packet.sha256);
});
test('unmatched original receipt and settings preserve honest stored and unlinked counts',async()=>{
 const f=await setup(),op=await originalOperation();f.manifest.operations=[op];prepareOriginalFixture(f,{unmatched:true});const before=clone(f.run('S.songs'));
 const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.status,'applied');assert.equal(result.originals.unmatched,1);assert.equal(result.originals.linked,0);
 assert.deepEqual(clone(f.run('S.songs')),before);assert.match(f.c.PrivatePreparationUI.settingsHTML(),/1件は一致する曲がなく/);
});
test('cancelled preparation and a failed state transaction leave no original receipt or song link',async()=>{
 for(const mode of ['cancelled','rejected']){
  const f=await setup(mode==='rejected'?{store:{commit:async()=>({status:'rejected',committed:false})}}:{}),op=await originalOperation();f.manifest.operations=[op];
  const before=clone(f.run('S'));prepareOriginalFixture(f,{after:()=>{if(mode==='cancelled')f.c.document.hidden=true;}});
  const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.status,mode==='cancelled'?'deferred':'conflict');assert.deepEqual(clone(f.run('S')),before);
  assert(await f.c.getClip('xls:sha256-'+op.packet.sha256),'only the verified immutable blob can remain');
 }
});
test('original preparation leaves navigation responsive and complete snapshots reject even an unversioned edit',async()=>{
 for(const mode of ['menu','edit']){
  const f=await setup(),op=await originalOperation();f.manifest.operations=[op];
  prepareOriginalFixture(f,{before:()=>{assert.equal(f.c.PrivatePreparationUI.isApplying(),false);assert.equal(f.app.inert,false);if(mode==='menu')f.run('U.menu={kind:"person-selection"}');else f.run('S.notes[0].memo="Owner edit during matching"');}});
  const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.status,'deferred');assert.equal(f.run('S.privatePreparations'),undefined);assert.equal(f.run('S.songs[0].xlsSourceId'),undefined);
  if(mode==='menu')assert.equal(f.run('U.menu.kind'),'person-selection');else assert.equal(f.run('S.notes[0].memo'),'Owner edit during matching');
 }
});
test('a changed confirmation source prevents original receipts even after immutable blob storage',async()=>{
 let reads=0;const f=await setup({source:async({manifest})=>({status:'ready',manifest,sourceSha:(++reads>1?'b':'a').repeat(40)})}),op=await originalOperation();
 f.manifest.operations=[op];prepareOriginalFixture(f);const before=clone(f.run('S'));
 const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.code,'PREPARATION_SOURCE_CHANGED');assert.deepEqual(clone(f.run('S')),before);assert.equal(reads,2);
});
test('an unmatched stored original is retried after matching data changes and its receipt identity is retained',async()=>{
 const f=await setup(),op=await originalOperation();f.manifest.operations=[op];f.run('S.songs[0].xls=1');let unmatched=true;
 const prepared=prepareOriginalFixture(f,{unmatched:()=>unmatched});assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');
 const old=clone(f.run('S.privatePreparations'))[op.id];assert.equal(old.unmatched,1);assert.match(old.targetSha256,/^[a-f0-9]{64}$/);
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');assert.equal(prepared.calls,1);
 unmatched=false;f.run('S.songs[0].lines[0].t="Revised matching lyric"');
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');const next=clone(f.run('S.privatePreparations'))[op.id];
 for(const key of ['sha256','type','at'])assert.equal(next[key],old[key]);assert.equal(next.linked,1);assert.equal(next.unmatched,0);assert.notEqual(next.targetSha256,old.targetSha256);
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');assert.equal(prepared.calls,2);
});
test('new performance copies relink after receiver reload while note edits and attachment timestamps do not reparse workbooks',async()=>{
 const f=await setup(),op=await originalOperation();f.manifest.operations=[op];const prepared=prepareOriginalFixture(f);
 await f.c.PrivatePreparationUI.receive(true);const old=clone(f.run('S.privatePreparations'))[op.id];
 f.run('S.notes[0].memo="New note";S.songs[0].xlsAt=999;S.recs.audio.dur=35');
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');assert.equal(prepared.calls,1);
 f.run('S.songs.push({...JSON.parse(JSON.stringify(S.songs[0])),id:"new-performance-copy",showId:"other-show"})');
 vm.runInContext(fs.readFileSync(__dirname+'/../private-preparation-ui.js','utf8'),f.c);
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');const receipt=clone(f.run('S.privatePreparations'))[op.id];
 assert.equal(prepared.calls,2);assert.equal(receipt.linked,2);assert.equal(receipt.at,old.at);assert.equal(receipt.sha256,old.sha256);
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');assert.equal(prepared.calls,2);
});
test('member names, assignments and exact cell metadata invalidate original matching fingerprints',async()=>{
 const f=await setup(),op=await originalOperation();f.manifest.operations=[op];const prepared=prepareOriginalFixture(f);
 await f.c.PrivatePreparationUI.receive(true);
 for(const change of ['S.members.push({id:"new-person",name:"New singer"})','S.songs[0].lines[0].parts=["new-person"]','S.songs[0].lines[0].lcell="B5"']){
  f.run(change);assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');
 }
 assert.equal(prepared.calls,4);
});
test('export-only original reads work during a busy export and open menu without applying state or receipts',async()=>{
 const f=await setup(),op=await originalOperation();f.manifest.operations.push(op);f.run('U.busy="exporting";U.menu={kind:"export-result"};U.sheet={kind:"selected-source"}');
 const before=f.run('JSON.stringify(S)'),view=f.run('JSON.stringify(U)'),db=f.idb.snapshot(),status=clone(f.c.PrivatePreparationUI.getStatus());
 const result=await f.c.PrivatePreparationUI.readOriginalExcelPackets({isActive:()=>true});assert.equal(result.status,'ready');assert.equal(result.operations.length,1);assert.equal(result.operations[0].id,op.id);assert.equal(result.sourceSha,'a'.repeat(40));
 assert.equal(f.run('JSON.stringify(S)'),before);assert.equal(f.run('JSON.stringify(U)'),view);assert.deepEqual(f.idb.snapshot(),db);assert.deepEqual(clone(f.c.PrivatePreparationUI.getStatus()),status);assert.equal(f.reads,1);
});
test('export-only original reads reject an obsolete export or changed login and invalid packet hashes',async()=>{
 for(const mode of ['inactive','token','hash']){
  let active=true;const f=await setup({source:async({f,manifest})=>{if(mode==='inactive')active=false;if(mode==='token')f.run('S.ghToken="changed-token"');if(mode==='hash')manifest.operations[0].sha256='0'.repeat(64);return {status:'ready',manifest,sourceSha:'a'.repeat(40)};}});
  const op=await originalOperation();f.manifest.operations=[op];const db=f.idb.snapshot();
  const result=await f.c.PrivatePreparationUI.readOriginalExcelPackets({isActive:()=>active});assert.equal(result.status,'unavailable');assert.equal(result.code,mode==='hash'?'HASH_MISMATCH':'DEFERRED');assert.equal(result.operations,undefined);assert.deepEqual(f.idb.snapshot(),db);
 }
});
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
 for(const guard of ['REC={}','recordingStartPending=true','recordingFinalizePending=true','pitchStartPending=true','U.sheet={}','preview="{}"','syncing=true','manualSync=true','backupInFlight=true','publishInFlight=true','micStream={}','PT.on=true']){
  const f=await setup();f.run(guard);const before=f.run('JSON.stringify(S)'),db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'deferred',guard);assert.equal(f.reads,0);assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);
 }
});
test('active plan still defers schedule, but lyrics-only addition commits without modifying plan or clips',async()=>{
 const f=await setup();f.run('S.plan.slots[0].a1=null');const before=clone(f.run('S')),clips=f.idb.snapshot().clips;
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'deferred');assert.equal(f.reads,1);assert.deepEqual(clone(f.run('S')),before);
 const packet={app:'utacheck-recording-song',version:1,group:{id:'private-rec',name:'配信しない',nopub:true},song:{id:'new-song',title:'Synthetic',artist:'Synthetic',credit:'Synthetic',lines:[{t:'Synthetic lyric',parts:[]}]},source:{file:'synthetic.docx'}};
 f.manifest.operations.push({id:'new-song-op',type:'recording-song',packet,sha256:await Preparation.digest(packet,webcrypto)});
 const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.status,'applied',JSON.stringify(result));assert.equal(result.count,1);
 const next=clone(f.run('S'));for(const k of Object.keys(before).filter(k=>!['groups','rsongs','privatePreparations'].includes(k)))assert.deepEqual(next[k],before[k],k);assert.equal(next.rsongs.at(-1).id,'new-song');assert.deepEqual(f.idb.snapshot().clips,clips);assert.equal(next.privatePreparations['schedule-example'],undefined);assert.equal(f.reads,3);
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
test('normal settings hook exposes honest source state without auth material',async()=>{const f=await setup({token:''});await f.c.PrivatePreparationUI.receive(true);const html=f.c.PrivatePreparationUI.settingsHTML();assert.match(html,/未接続/);assert.doesNotMatch(html,/private-preparation-check|private-preparation-setup|dot/);assert.doesNotMatch(html,/value="[^\"]*synthetic|synthetic-token/);});
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
for(const changed of [false,true])test('material operation rechecks prepared source SHA before any atomic replacement: changed='+changed,async()=>{
 let reads=0,baseline;
 const f=await setup({hold:false,source:async({f,manifest})=>{
  reads++;if(reads===1){const s=f.run('S');s.groups[0].nopub=true;s.shows[0].nopub=true;baseline=clone(s);
   const packet={app:'utacheck-material-update',version:1,scope:'live',groupId:s.groups[0].id,showId:s.shows[0].id,songId:s.songs[0].id,expectedTitle:s.songs[0].title,beforeLines:clone(s.songs[0].lines),afterLines:clone(s.songs[0].lines),source:{revision:'original-file-version',files:[{name:'original.xlsx',sha256:'b'.repeat(64)}]}};
   manifest.operations=[{id:'new-material',type:'material-update',sha256:await Preparation.digest(packet,webcrypto),packet}];
  }
  return {status:'ready',manifest,sourceSha:(changed&&reads>1?'b':'a').repeat(40)};
 }});
 const clips=f.idb.snapshot().clips,result=await f.c.PrivatePreparationUI.receive(true);
 assert.equal(reads,2);assert.deepEqual(f.idb.snapshot().clips,clips);
 if(changed){assert.equal(result.status,'conflict');assert.equal(result.code,'PREPARATION_SOURCE_CHANGED');assert.deepEqual(clone(f.run('S')),baseline);}
 else{assert.equal(result.status,'applied');assert.equal(f.run("S.privatePreparations['new-material'].type"),'material-update');}
});

test('private source failure shows a fixed stage and reason while state and credentials stay unchanged',async()=>{
 const cases=[
  ['HTTP_401','identity','GitHubの本人確認','401'],
  ['HTTP_403','repository','非公開の保存先の確認','403'],
  ['HTTP_404','contents','更新ファイルの確認','404'],
  ['HTTP_404','blob','更新ファイル本体の読取','404'],
  ['OWNER_MISMATCH','identity','GitHubの本人確認','本人アカウントと一致しません'],
  ['REPOSITORY_NOT_PRIVATE','repository','非公開の保存先の確認','非公開の保存先であることを確認できません'],
  ['HTTP_429','repository','非公開の保存先の確認','429'],
  ['HTTP_503','contents','更新ファイルの確認','GitHub側でエラー'],
  ['TIMEOUT','identity','GitHubの本人確認','時間を超えました'],
  ['FETCH_FAILED','repository','非公開の保存先の確認','通信が完了しませんでした']
 ];
 for(const [code,stage,label,reason]of cases){
  const f=await setup({source:async()=>({status:'unavailable',code,stage,message:'synthetic-private-error-details'})});
  const before=f.run('JSON.stringify(S)'),db=f.idb.snapshot();
  await f.c.PrivatePreparationUI.receive(true);
  const html=f.c.PrivatePreparationUI.settingsHTML();
  assert(html.includes(label),stage);assert(html.includes(reason),code);
  assert.doesNotMatch(html,/synthetic-token|synthetic-private-error-details|https:\/\/api\.github\.com/);
  assert.equal(f.c.PrivatePreparationUI.getStatus().stage,stage);
  assert.equal(f.reads,1);assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);
  assert.equal(f.localWrites.length,0);assert.equal(f.calls.network.length,0);
 }
});
test('unrecognized source diagnostics never expose arbitrary server strings or inherited property values',async()=>{
 for(const code of ['synthetic-secret-error','constructor','toString','__proto__']){
  const f=await setup({source:async()=>({status:'unavailable',code,stage:'synthetic-secret-stage',message:'synthetic-private-error-details'})});
  const before=f.run('JSON.stringify(S)'),db=f.idb.snapshot();
  await f.c.PrivatePreparationUI.receive(true);
  const html=f.c.PrivatePreparationUI.settingsHTML();
  assert(html.includes('受信内容を安全に確認できなかったため停止しました'));
  assert.doesNotMatch(html,/synthetic-secret|synthetic-private|native code|function|synthetic-token/);
  assert.equal(f.c.PrivatePreparationUI.getStatus().stage,undefined);
  assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.localWrites.length,0);
 }
});

test('manual update names the actual waiting reason and automatically resumes the queued request',async()=>{
 const reasons=[['U.menu={}', 'U.menu=null','menu',/メニュー/],['backupInFlight=true','backupInFlight=false','saving',/保存・配信/],['U.sheet={}','U.sheet=null','editing',/入力中/],['micStream={}','micStream=null','microphone',/マイク/]];
 for(const [block,release,reason,message] of reasons){
  const f=await setup();f.run(block);const before=f.run('JSON.stringify(S)');
  const wait=await f.c.PrivatePreparationUI.receive(true);assert.equal(wait.status,'deferred');assert.equal(wait.reason,reason);
  assert.match(f.c.PrivatePreparationUI.settingsHTML(),message);assert.equal(f.reads,0);assert.equal(f.run('JSON.stringify(S)'),before);
  f.run(release);const resumed=await f.c.PrivatePreparationUI.receive();assert.equal(resumed.status,'applied');assert.equal(f.run('S.plan.slots[0].min'),75);
 }
});
test('manual retry after an access failure retains a queued check through interaction throttling',async()=>{
 let fail=true;const f=await setup({source:async({manifest})=>fail?{status:'unavailable',code:'HTTP_404',stage:'repository'}:{status:'ready',manifest,sourceSha:'a'.repeat(40)}});
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'access');
 f.run('U.menu={}');assert.equal((await f.c.PrivatePreparationUI.receive(true)).reason,'menu');fail=false;f.run('U.menu=null');
 assert.equal((await f.c.PrivatePreparationUI.receive()).status,'applied');
});

test('automatic reception interrupted by interaction resumes before the polling cooldown',async()=>{
 let interrupt=true;
 const f=await setup({source:async({f,manifest})=>{
  if(interrupt){interrupt=false;f.run('scrollingUntil=Date.now()+500');}
  return {status:'ready',manifest,sourceSha:'a'.repeat(40)};
 }});
 const before=f.run('JSON.stringify(S)');
 assert.equal((await f.c.PrivatePreparationUI.receive()).status,'deferred');
 assert.equal(f.c.PrivatePreparationUI.getStatus().reason,'interaction');
 assert.equal(f.run('JSON.stringify(S)'),before);
 f.run('scrollingUntil=0');
 assert.equal((await f.c.PrivatePreparationUI.receive()).status,'applied');
 assert.equal(f.run('S.plan.slots[0].min'),75);
});

test('queued automatic reception keeps recording and editing guards and then resumes',async()=>{
 for(const [block,release,reason] of [['REC={}','REC=null','recording'],['U.sheet={}','U.sheet=null','editing']]){
  let interrupt=true;
  const f=await setup({source:async({f,manifest})=>{
   if(interrupt){interrupt=false;f.run(block);}
   return {status:'ready',manifest,sourceSha:'a'.repeat(40)};
  }});
  assert.equal((await f.c.PrivatePreparationUI.receive()).status,'deferred');
  assert.equal((await f.c.PrivatePreparationUI.receive()).reason,reason);
  assert.equal(f.reads,1);assert.equal(f.run('S.plan.slots[0].min'),90);
  f.run(release);assert.equal((await f.c.PrivatePreparationUI.receive()).status,'applied');
 }
});

test('interaction after an access failure does not bypass network retry cooldown',async()=>{
 const f=await setup({source:async()=>({status:'unavailable',code:'HTTP_404',stage:'repository'})});
 assert.equal((await f.c.PrivatePreparationUI.receive()).status,'access');
 f.run('scrollingUntil=Date.now()+500');
 assert.equal((await f.c.PrivatePreparationUI.receive()).status,'deferred');
 f.run('scrollingUntil=0');
 assert.equal((await f.c.PrivatePreparationUI.receive()).status,'throttled');
 assert.equal(f.reads,1);assert.equal(f.c.PrivatePreparationUI.getStatus().kind,'access');
});

const READ_TOKEN='github_pat_'+'q'.repeat(40),AUTH_KEY='private-preparation:read-credential:v1';
test('progress connection can deliver without a separate token and the obsolete update controls are absent',async()=>{
 const f=await setup({token:''});let calls=0;
 f.c.ProgressPreparationSource={read:async()=>{calls++;return {status:'ready',manifest:f.manifest,sourceSha:'a'.repeat(40)};}};
 const result=await f.c.PrivatePreparationUI.receive(true);
 assert.equal(result.status,'applied');assert.equal(f.run('S.plan.slots[0].min'),75);assert.equal(calls,2);
 const html=f.c.PrivatePreparationUI.settingsHTML();
 assert.doesNotMatch(html,/dot|<button|private-preparation-setup|private-preparation-check/);
 assert.match(html,/進行アプリ/);assert.equal(f.run('S.ghToken'),'');
});
test('an older conflicting addition does not prevent an unrelated next scheduled session',async()=>{
 const f=await setup();
 const packet={app:'utacheck-recording-song',version:1,group:{id:'private',name:'配信しない',nopub:true},song:{id:'already-existing',title:'Existing REC',artist:'Original',credit:'',lines:[{t:'Original lyric',parts:[]}]},source:{file:'old.docx',revision:'v1'}};
 const old={id:'older-addition',type:'recording-song',packet,sha256:await Preparation.digest(packet,webcrypto)};
 f.run('S.rsongs=[{id:"already-existing",title:"Owner corrected title",groupId:"original-group",lines:[{t:"Owner corrected lyric",parts:[]}]}];U.recArtistFilter="Original"');
 f.manifest.operations.unshift(old);const original=clone(f.run('S.rsongs'));
 const next=clone(packet);next.song.id='next-rec';next.song.title='Upcoming REC';
 f.manifest.operations.push({id:'next-addition',type:'recording-song',packet:next,sha256:await Preparation.digest(next,webcrypto)});
 const result=await f.c.PrivatePreparationUI.receive(true);
 assert.equal(result.status,'applied');assert.equal(result.count,2);assert.equal(result.conflicts,1);
 assert.equal(f.run('S.plan.slots[0].min'),75);assert.deepEqual(clone(f.run('S.rsongs[0]')),original[0]);assert.equal(f.run('S.rsongs[1].title'),'Upcoming REC');assert.equal(f.run('U.recArtistFilter'),'');
 assert.equal(f.run('S.privatePreparations["older-addition"]'),undefined);
});
test('separate dot credential validates the source and persists outside state and backups',async()=>{
 const tokens=[];const f=await setup({source:async({options,manifest})=>{tokens.push(options.token);return {status:'ready',manifest,sourceSha:'a'.repeat(40)};}});
 const before=f.run('JSON.stringify(S)'),slots=[f.idb.record('state:0'),f.idb.record('state:1')],clips=f.idb.snapshot().clips;
 assert.equal((await f.c.PrivatePreparationUI.connectReadCredential(READ_TOKEN)).status,'connected');
 assert.deepEqual(tokens,[READ_TOKEN]);assert.equal(f.run('JSON.stringify(S)'),before);
 assert.deepEqual([f.idb.record('state:0'),f.idb.record('state:1')],slots);assert.deepEqual(f.idb.snapshot().clips,clips);
 assert.equal(f.idb.record(AUTH_KEY).token,READ_TOKEN);assert.equal(f.run('S.ghToken'),'synthetic-token');
 assert(!f.run('JSON.stringify(backupState())').includes(READ_TOKEN));
 assert(!f.c.PrivatePreparationUI.settingsHTML().includes(READ_TOKEN));
 assert(!JSON.stringify(f.c.PrivatePreparationUI.getStatus()).includes(READ_TOKEN));
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');
 assert.equal(tokens.at(-1),READ_TOKEN);assert.equal(f.run('S.ghToken'),'synthetic-token');assert.equal(f.run('S.plan.slots[0].min'),75);
 assert.equal(f.calls.network.length,0);
});
test('saved read credential is used on fresh startup even without a delivery token',async()=>{
 const seen=[];const f=await setup({token:'',source:async({options,manifest})=>{seen.push(options.token);return {status:'ready',manifest,sourceSha:'a'.repeat(40)};}});
 f.idb.replace(AUTH_KEY,{version:1,owner:'gogojoe312-max',repo:'shinkou-data',token:READ_TOKEN});
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');
 assert.deepEqual(seen,[READ_TOKEN]);assert.equal(f.run('S.ghToken'),'');
});
test('bad or inaccessible replacement keeps the earlier dot credential and delivery token',async()=>{
 let denied=false;const f=await setup({source:async({manifest})=>denied?{status:'unavailable',stage:'repository',code:'HTTP_404'}:{status:'ready',manifest,sourceSha:'a'.repeat(40)}});
 assert.equal((await f.c.PrivatePreparationUI.connectReadCredential(READ_TOKEN)).status,'connected');
 const db=f.idb.snapshot(),before=f.run('JSON.stringify(S)');denied=true;
 assert.equal((await f.c.PrivatePreparationUI.connectReadCredential('github_pat_'+'r'.repeat(40))).status,'access');
 assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.run('JSON.stringify(S)'),before);
 for(const invalid of ['ghp_'+'s'.repeat(40),'',READ_TOKEN+'\nsecret']){
  assert.equal((await f.c.PrivatePreparationUI.connectReadCredential(invalid)).status,'invalid-read-token');assert.deepEqual(f.idb.snapshot(),db);
 }
});
test('invalid stored credential stops without silently trying the member token',async()=>{
 const f=await setup();f.idb.replace(AUTH_KEY,{version:1,owner:'other',repo:'shinkou-data',token:READ_TOKEN});
 const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'connection-error');
 assert.equal(f.reads,0);assert.deepEqual(f.idb.snapshot(),db);
});
test('owner change and malformed manifest cannot save a new credential',async()=>{
 for(const wrong of ['owner','manifest']){
  const f=await setup({source:async({manifest})=>wrong==='owner'?{status:'unavailable',code:'OWNER_MISMATCH',stage:'identity'}:{status:'ready',manifest:{...manifest,owner:'another'},sourceSha:'a'.repeat(40)}});
  const db=f.idb.snapshot(),before=f.run('JSON.stringify(S)');const result=await f.c.PrivatePreparationUI.connectReadCredential(READ_TOKEN);
  assert.notEqual(result.status,'connected');assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.run('JSON.stringify(S)'),before);
 }
});
test('connection saving stops on concurrent edits or active recording',async()=>{
 const f=await setup({source:async({f,manifest})=>{f.run('S.notes[0].memo="Concurrent edit";stateRevision++');return {status:'ready',manifest,sourceSha:'a'.repeat(40)};}});
 assert.equal((await f.c.PrivatePreparationUI.connectReadCredential(READ_TOKEN)).status,'deferred');assert.equal(f.idb.record(AUTH_KEY),undefined);
 assert.equal(f.run('S.notes[0].memo'),'Concurrent edit');f.run('REC={}');
 assert.equal((await f.c.PrivatePreparationUI.connectReadCredential(READ_TOKEN)).status,'deferred');assert.equal(f.reads,1);
});
test('unverified credential write blocks reception until reopening and never claims connected',async()=>{
 const f=await setup();const get=f.c.idbGet;f.c.idbGet=async key=>key===AUTH_KEY?undefined:get(key);
 assert.equal((await f.c.PrivatePreparationUI.connectReadCredential(READ_TOKEN)).status,'connection-error');
 assert.equal(f.run('S.ghToken'),'synthetic-token');const reads=f.reads;
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'deferred');assert.equal(f.reads,reads);
});

test('closing connection form during source validation leaves saved credentials unchanged',async()=>{
 let open=true;const f=await setup({source:async({manifest})=>{open=false;return {status:'ready',manifest,sourceSha:'a'.repeat(40)};}});
 const db=f.idb.snapshot();assert.equal((await f.c.PrivatePreparationUI.connectReadCredential(READ_TOKEN,()=>open)).status,'deferred');assert.deepEqual(f.idb.snapshot(),db);
});

test('repository 404 with no shared progress storage uses the owner relay and rechecks it before saving',async()=>{
 const f=await setup({source:async()=>({status:'unavailable',code:'HTTP_404',stage:'repository'})});
 const before=clone(f.run('S'));let localReads=0,relayReads=0;
 f.c.ProgressPreparationSource={read:async()=>{localReads++;return {status:'unavailable',code:'HTTP_404',stage:'repository'};}};
 f.c.PreparationRelaySource={read:async options=>{relayReads++;assert.equal(options.token,before.ghToken);return {status:'ready',manifest:f.manifest,sourceSha:'a'.repeat(40),sourcePath:'utacheck/prepared.json'};}};
 const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.status,'applied');assert.equal(localReads,1);assert.equal(relayReads,2);
 assert.equal(f.run('S.plan.slots[0].min'),75);assert.deepEqual(clone(f.run('S.notes')),before.notes);assert.deepEqual(clone(f.run('S.recs')),before.recs);
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');assert.equal(localReads,1);assert.equal(relayReads,3);
 assert.equal(f.run('S.ghToken'),before.ghToken);
});
test('unconfigured relay exposes the actual delivery blocker without changing state',async()=>{
 const f=await setup({source:async()=>({status:'unavailable',code:'HTTP_404',stage:'repository'})}),before=f.run('JSON.stringify(S)');
 f.c.PreparationRelaySource={read:async()=>({status:'unavailable',code:'RELAY_NOT_CONFIGURED',stage:'relay'})};
 const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.code,'RELAY_NOT_CONFIGURED');assert.equal(f.run('JSON.stringify(S)'),before);
 assert(f.c.PrivatePreparationUI.settingsHTML().includes('サーバーの接続設定が未完了'));assert(!f.c.PrivatePreparationUI.settingsHTML().includes('404'));
});
test('source owner mismatch and cancellation never fall back to the relay',async()=>{
 for(const code of ['OWNER_MISMATCH','INACTIVE','ABORTED']){
  const f=await setup({source:async()=>({status:'unavailable',code})});let calls=0;f.c.PreparationRelaySource={read:async()=>{calls++;}};
  await f.c.PrivatePreparationUI.receive(true);assert.equal(calls,0);
 }
});
test('an unfinished past slot does not block a separate future REC session, and same-day/unknown dates still wait',async()=>{
 for(const mode of ['future','same-day','unknown']){
  const f=await setup();f.run('S.plan.slots[0].a1=null;S.rsongId="existing-selection";S.planFocus="slot"');
  if(mode==='unknown')f.run('delete S.plan.slots[0].date');
  const before=clone(f.run('S')),date=mode==='same-day'?'2031-02-03':'2031-02-04',day=mode==='same-day'?'2/3':'2/4';
  const packet={app:'utacheck-recording-addition',version:1,group:{id:'future-private',name:'Synthetic future REC',nopub:true},members:[],roster:[],
   songs:[{id:'future-song',groupId:'future-private',title:'Synthetic future song',roster:[],blocks:{},lines:[{t:'Future lyric',parts:[],main:[],extra:[]}]}],
   plan:{year:2031,timezone:'Asia/Tokyo',start:'11:00',slots:[{id:'future-slot',songId:'future-song',date,day,at:660,min:75,kind:'member',name:'Synthetic upcoming singer',place:'Synthetic studio'}]}};
  f.manifest.operations=[{id:'future-op',type:'recording-addition',packet,sha256:await Preparation.digest(packet,webcrypto)}];
  const result=await f.c.PrivatePreparationUI.receive(true),after=clone(f.run('S'));
  if(mode==='future'){
   assert.equal(result.status,'applied',JSON.stringify(result));assert.equal(after.plan.slots.length,2);assert.deepEqual(after.plan.slots[0],before.plan.slots[0]);
   for(const key of ['rsongId','planFocus','notes','recs'])assert.deepEqual(after[key],before[key],key);
  }else{assert.equal(result.status,'deferred');assert.deepEqual(after,before);}
 }
});

test('later input preserves earlier committed original batches and resumes without replaying them',async()=>{
 const f=await setup(),ops=[];for(let i=0;i<5;i++)ops.push(await originalOperation('source'+i+'.xlsx','synthetic original '+i));
 f.manifest.operations=ops;let calls=0;
 prepareOriginalFixture(f,{before:()=>{calls++;if(calls===4)f.run('U.menu={kind:"person-selection"}');}});
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'deferred');
 assert.equal(Object.keys(f.run('S.privatePreparations')).length,3);
 const durable=JSON.stringify(f.idb.snapshot().state);assert(durable.includes(ops[0].id));assert(!durable.includes(ops[3].id));
 f.run('U.menu=null');assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');
 assert.equal(Object.keys(f.run('S.privatePreparations')).length,5);assert.equal(calls,6);
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');assert.equal(calls,6);
});
test('original fingerprint excludes unrelated songs once this source has identified targets',async()=>{
 const f=await setup(),op=await originalOperation();f.manifest.operations=[op];
 f.run('S.songs[0].title="original";S.songs.push({...JSON.parse(JSON.stringify(S.songs[0])),id:"unrelated",title:"Another original",xls:1})');
 const prepared=prepareOriginalFixture(f);assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'applied');
 // The fixture links every initially unlinked song; give the unrelated song its real other source.
 f.run('S.songs[1].xlsSourceId="sha256-"+"f".repeat(64)');
 await f.c.PrivatePreparationUI.receive(true);const calls=prepared.calls;
 f.run('S.songs[1].lines[0].t="Unrelated workbook change"');
 assert.equal((await f.c.PrivatePreparationUI.receive(true)).status,'current');assert.equal(prepared.calls,calls);
});

test('relay waiting, slow and receiving phases remain visible on settings until the schedule is actually saved',async()=>{
 const f=await setup(),before=f.run('JSON.stringify(S)');
 f.c.ProgressPreparationSource={read:async options=>{if(options.onProgress)for(const [phase,text] of [['waiting','応答を待'],['slow','時間がかか'],['retrying','自動で再確認'],['receiving','受信しています']]){options.onProgress?.({phase});assert(f.c.PrivatePreparationUI.settingsHTML().includes(text));assert.equal(f.run('JSON.stringify(S)'),before);}return {status:'ready',manifest:f.manifest,sourceSha:'a'.repeat(40)};}};
 const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.status,'applied');assert.equal(f.run('S.plan.slots[0].min'),75);assert(f.c.PrivatePreparationUI.settingsHTML().includes('取り込みました'));
});
test('an exhausted progress relay never repeats the same timeout with an unrelated Gist credential',async()=>{
 const f=await setup(),before=f.run('JSON.stringify(S)');let reads=0;
 f.c.ProgressPreparationSource={read:async()=>({status:'unavailable',code:'TIMEOUT',stage:'relay'})};f.c.PreparationRelaySource={read:async()=>{reads++;throw Error('wrong fallback');}};
 const result=await f.c.PrivatePreparationUI.receive(true);assert.equal(result.code,'TIMEOUT');assert.equal(reads,0);assert.equal(f.run('JSON.stringify(S)'),before);
});
