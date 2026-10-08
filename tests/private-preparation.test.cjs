'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const P=require('../private-preparation.js');
const Schedule=require('../recording-schedule-update.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const OWNER='synthetic-owner',NOW=1925078400000;
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze)}return value};
const current=()=>({groups:[{id:'old-group',name:'Original',gistId:'synthetic-existing-destination',key:'synthetic-existing-pass'}],
 shows:[{id:'old-show',groupId:'old-group',name:'Original Show'}],songs:[{id:'old-song',title:'Original Song',lines:[{t:'Keep lyrics',parts:['old-member']}]}],
 rsongs:[{id:'old-rec-song',title:'Original Recording',lines:[{t:'Keep recording text',parts:[]}]}],members:[{id:'old-member',name:'Original Person'}],
 notes:[{id:'old-note',t:'Keep note'}],draws:{sheet:[1,2,3]},recs:{clip:{id:'existing-local-clip'}},
 ghToken:'synthetic-existing-token',bkKey:'synthetic-existing-backup-pass',bkGistId:'synthetic-existing-backup-id',autoPub:true,
 groupId:'old-group',showId:'old-show',plan:{year:2031,timezone:'UTC',slots:[{id:'old-slot',name:'Original Person',day:'2/3',date:'2031-02-03',at:600,min:60,kind:'member',place:'Synthetic studio',a0:601,a1:663,takes:{intro:4},done:true}]},
 rosters:{Original:['Original Person']},cloudAdditions:{old:{hash:'prior',at:1}},unrelated:{keep:'exact'}});
const livePacket=()=>({app:'utacheck-live-addition',version:1,group:{id:'private-group',name:'Prepared rehearsal',nopub:true},
 show:{id:'private-show',name:'Synthetic Rehearsal',date:'2031-02-05',ts:0,folder:'Prepared'},members:[{id:'private-member',name:'Original Person'}],
 songs:[{id:'private-song',title:'Prepared Song',roster:['private-member'],blocks:{intro:['private-member']},credit:'Synthetic credit',
 lines:[{t:'Synthetic lyric',parts:['private-member'],main:['private-member'],extra:[],sec:'intro',label:'A'}]}]});
const schedulePacket=state=>({app:'utacheck-recording-schedule-update',version:1,id:'synthetic-schedule-packet',year:2031,timezone:'UTC',
 updates:[{id:'old-slot',expected:Object.fromEntries(['name','day','date','at','min','kind','place'].map(k=>[k,state.plan.slots[0][k]])),next:{at:660,min:75}}]});
const recordingPacket=()=>({app:'utacheck-recording-addition',version:1,group:{id:'private-rec-group',name:'Prepared Recording',nopub:true},
 members:[{id:'private-rec-member',name:'New Synthetic Person'}],roster:['New Synthetic Person'],songs:[{id:'private-rec-song',title:'Prepared Recording Song',groupId:'private-rec-group',roster:['private-rec-member'],blocks:{intro:['private-rec-member']},
 lines:[{t:'Synthetic recording lyric',parts:['private-rec-member'],main:['private-rec-member'],extra:[]}]}],
 plan:{year:2031,timezone:'UTC',start:'11:00',source:'Synthetic source',slots:[{id:'private-rec-slot',name:'New Synthetic Person',day:'2/4',date:'2031-02-04',at:660,min:75,kind:'member',place:'Synthetic studio'}]}});
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function mergeRecordingAddition('),end=source.indexOf('\nfunction chooseRecordingAddition()',start);
assert.ok(start>=0&&end>start);const context={};vm.runInNewContext(source.slice(start,end),context);
const adapters={schedule:Schedule.apply,recording:context.mergeRecordingAddition};
async function operation(type,packet,id='synthetic-operation'){return {id,type,sha256:await P.digest(packet,webcrypto),packet}}
const manifest=operations=>({app:'utacheck-private-preparation',version:1,owner:OWNER,revision:'synthetic-revision',createdAt:'2031-01-01T00:00:00Z',operations});
const rejects=(code,fn)=>assert.throws(fn,error=>error.preparationCode===code);
test('strict manifest validation verifies owner and exact immutable content hashes without mutating input',async()=>{
 const input=manifest([await operation('live-addition',livePacket())]),before=clone(input);freeze(input);
 const checked=await P.validate(input,OWNER,webcrypto);assert.deepEqual(checked,before);assert.notEqual(checked,input);assert.notEqual(checked.operations[0].packet,input.operations[0].packet);
 checked.operations[0].packet.show.name='Changed independently';assert.deepEqual(input,before);
});
test('wrong owner, unexpected schema keys, unsupported types, duplicate IDs and bad hashes are rejected',async()=>{
 const good=manifest([await operation('live-addition',livePacket())]);
 for(const [edit,code]of [[m=>m.owner='other','INVALID_MANIFEST'],[m=>m.extra=true,'INVALID_MANIFEST'],[m=>m.version=2,'INVALID_MANIFEST'],
  [m=>m.createdAt='invalid','INVALID_MANIFEST'],[m=>m.revision='../escape','INVALID_MANIFEST'],[m=>m.operations[0].type='publish','INVALID_OPERATION'],
  [m=>m.operations.push(clone(m.operations[0])),'INVALID_OPERATION'],[m=>m.operations[0].sha256='invalid','INVALID_OPERATION'],
  [m=>m.operations[0].packet.show.name='Tampered','HASH_MISMATCH'],[m=>m.operations[0].extra=true,'INVALID_MANIFEST']]){
  const bad=clone(good);edit(bad);await assert.rejects(P.validate(bad,OWNER,webcrypto),e=>e.preparationCode===code);
 }
});
test('manifest rejects getters, dangerous keys, cycles and non-JSON data without invoking getters',async()=>{
 const good=manifest([await operation('live-addition',livePacket())]);let calls=0;
 const getter=clone(good);Object.defineProperty(getter,'owner',{enumerable:true,get(){calls++;return OWNER}});
 await assert.rejects(P.validate(getter,OWNER,webcrypto));assert.equal(calls,0);
 for(const mutate of [m=>Object.defineProperty(m,'__proto__',{value:{polluted:true},enumerable:true}),m=>m.operations[0].packet.bad=undefined,
  m=>m.operations[0].packet.bad=()=>{},m=>m.operations[0].packet.bad=Infinity,m=>m.operations[0].packet.bad=m]){
  const bad=clone(good);mutate(bad);await assert.rejects(P.validate(bad,OWNER,webcrypto));
 }
 assert.equal({}.polluted,undefined);
});
test('strict validation rejects sparse arrays and non-index properties instead of silently dropping them',async()=>{
 const good=manifest([await operation('live-addition',livePacket())]);
 for(const mutate of [m=>{m.operations.extra='silently lost';},m=>{delete m.operations[0];},m=>{m.operations[0].packet.members.extra=true;},m=>{delete m.operations[0].packet.songs[0].lines[0];}]){
  const bad=clone(good);mutate(bad);await assert.rejects(P.validate(bad,OWNER,webcrypto),e=>e.preparationCode==='INVALID_MANIFEST');
 }
});
test('live additions accept actual leap dates and refuse impossible dates without modifying state',async()=>{
 for(const date of ['2031-02-31','2031-02-29','2031-13-01','2031-00-01','2031-04-31','2031-2-3']){
  const state=current(),before=clone(state),packet=livePacket();packet.show.date=date;
  rejects('INVALID_OPERATION',()=>P.apply(state,{id:'synthetic-date',type:'live-addition',sha256:'a'.repeat(64),packet},adapters,NOW));assert.deepEqual(state,before);
 }
 const packet=livePacket();packet.show.date='2032-02-29';assert.equal(P.apply(current(),await operation('live-addition',packet),adapters,NOW).state.shows.at(-1).date,'2032-02-29');
});
test('private packets reject credential, publication and delivery fields at every nesting depth',async()=>{
 for(const key of ['ghToken','bkKey','bkGistId','editPass','token','password','secret','credentials','gistId','src','key','deliveryGroupId','deliveryMode']){
  const packet=livePacket();packet.source={nested:{[key]:'synthetic-value'}};
  const input=manifest([await operation('live-addition',packet)]);
  await assert.rejects(P.validate(input,OWNER,webcrypto),e=>e.preparationCode==='PRIVATE_CONNECTION_FIELD',key);
 }
});
test('all three operation types validate together',async()=>{
 const input=manifest([await operation('live-addition',livePacket(),'live'),await operation('recording-schedule',schedulePacket(current()),'schedule'),await operation('recording-addition',recordingPacket(),'recording')]);
 assert.deepEqual(await P.validate(input,OWNER,webcrypto),input);
});
test('live addition appends new private identities and preserves every original record and setting',async()=>{
 const state=current(),before=clone(state),packet=livePacket(),op=await operation('live-addition',packet);freeze(state);freeze(op);
 const result=P.apply(state,op,adapters,NOW);assert.equal(result.status,'applied');assert.deepEqual(state,before);
 for(const key of Object.keys(before).filter(k=>!['groups','shows','songs','members'].includes(k)))assert.deepEqual(result.state[key],before[key],key);
 for(const key of ['groups','shows','songs','members'])assert.deepEqual(result.state[key].slice(0,before[key].length),before[key],key);
 assert.deepEqual(result.state.privatePreparations[op.id],{sha256:op.sha256,type:op.type,at:NOW});
 assert.equal(result.state.groups.at(-1).nopub,true);assert.equal(result.state.shows.at(-1).nopub,true);
 assert.equal(result.state.songs.at(-1).groupId,'private-group');assert.equal(result.state.songs.at(-1).showId,'private-show');
 assert.deepEqual(result.state.songs.at(-1).roster,['private-member']);assert.equal(result.state.members.at(-1).id,'private-member');
 assert.equal(result.state.members.at(-1).name,state.members[0].name,'matching names are not silently merged');
});
test('applied operation repeat is identity-preserving and never calls an adapter',async()=>{
 const op=await operation('live-addition',livePacket()),first=P.apply(current(),op,adapters,NOW);
 const second=P.apply(first.state,op,{schedule(){throw Error('unexpected')},recording(){throw Error('unexpected')}},NOW+1);
 assert.equal(second.status,'already-applied');assert.equal(second.state,first.state);
});
test('reuse of a receipt operation ID with new content or type is rejected without changes',async()=>{
 const op=await operation('live-addition',livePacket()),state=P.apply(current(),op,adapters,NOW).state,before=clone(state);
 rejects('OPERATION_ID_REUSED',()=>P.apply(state,{...op,sha256:'b'.repeat(64)},adapters,NOW));
 rejects('OPERATION_ID_REUSED',()=>P.apply(state,{...op,type:'recording-schedule'},adapters,NOW));assert.deepEqual(state,before);
});
test('live addition refuses identity collisions and missing member references atomically',async()=>{
 for(const [mutate,code]of [[p=>p.group.id='old-group','ADDITION_CONFLICT'],[p=>p.show.id='old-show','ADDITION_CONFLICT'],[p=>p.members[0].id='old-member','ADDITION_CONFLICT'],
  [p=>p.songs[0].id='old-song','ADDITION_CONFLICT'],[p=>p.songs[0].id='old-rec-song','ADDITION_CONFLICT'],[p=>p.songs[0].roster=['missing'],'UNKNOWN_MEMBER'],
  [p=>p.songs[0].lines[0].parts=['missing'],'UNKNOWN_MEMBER'],[p=>p.songs[0].blocks.intro=['missing'],'UNKNOWN_MEMBER'],[p=>p.group.nopub=false,'INVALID_OPERATION']]){
  const state=current(),before=clone(state),packet=livePacket();mutate(packet);const op=await operation('live-addition',packet);
  rejects(code,()=>P.apply(state,op,adapters,NOW));assert.deepEqual(state,before);
 }
});
test('schedule update preserves recordings, actuals, all unrelated records and creates a receipt',async()=>{
 const state=current(),before=clone(state),op=await operation('recording-schedule',schedulePacket(state));
 const result=P.apply(state,op,adapters,NOW);assert.deepEqual(state,before);
 for(const key of Object.keys(before).filter(k=>k!=='plan'))assert.deepEqual(result.state[key],before[key],key);
 const expected=clone(before.plan);Object.assign(expected.slots[0],{at:660,min:75});assert.deepEqual(result.state.plan,expected);
 assert.equal(result.state.privatePreparations[op.id].sha256,op.sha256);
});
test('partial missing schedule targets prevent every update and receipt',async()=>{
 const state=current(),before=clone(state),packet=schedulePacket(state);packet.updates.push({...clone(packet.updates[0]),id:'absent-slot'});
 const op=await operation('recording-schedule',packet);rejects('SCHEDULE_TARGET_MISSING',()=>P.apply(state,op,adapters,NOW));assert.deepEqual(state,before);assert.equal(state.privatePreparations,undefined);
});
test('an already-matching schedule can receive its first durable receipt without changing its rows',async()=>{
 const state=current(),packet=schedulePacket(state);packet.updates[0].next={at:600,min:60};const op=await operation('recording-schedule',packet);
 const result=P.apply(state,op,adapters,NOW);assert.deepEqual(result.state.plan,state.plan);assert.equal(result.status,'applied');assert.ok(result.state.privatePreparations[op.id]);
});
test('recording addition uses the real existing append-only merger and retains all original work',async()=>{
 const state=current(),before=clone(state),packet=recordingPacket(),op=await operation('recording-addition',packet),result=P.apply(state,op,adapters,NOW);
 assert.deepEqual(state,before);for(const key of ['shows','songs','notes','draws','recs','ghToken','bkKey','bkGistId','cloudAdditions'])assert.deepEqual(clone(result.state[key]),before[key],key);
 for(const key of ['groups','rsongs','members'])assert.deepEqual(clone(result.state[key].slice(0,before[key].length)),before[key],key);
 assert.deepEqual(clone(result.state.plan.slots[0]),before.plan.slots[0]);assert.equal(result.state.groups.at(-1).nopub,true);assert.ok(result.state.privatePreparations[op.id]);
});
test('recording adapter returning a publishable new group is refused without changing input',async()=>{
 const state=current(),before=clone(state),op=await operation('recording-addition',recordingPacket());
 rejects('PRIVATE_CONNECTION_FIELD',()=>P.apply(state,op,{recording:s=>({state:{...s,groups:[...s.groups,{id:'unsafe',nopub:false}]}})},NOW));assert.deepEqual(state,before);
});
test('existing recording addition can be adopted by stable IDs without duplicates or losing later local work',async()=>{
 const packet=recordingPacket(),state=clone(adapters.recording(current(),packet).state),op=await operation('recording-addition',packet);
 state.rsongs.at(-1).lines[0].parts=[];state.rsongs.at(-1).take=7;
 state.plan.slots.at(-1).at=780;state.plan.slots.at(-1).min=60;state.plan.slots.at(-1).a0=781;state.plan.slots.at(-1).a1=842;
 state.plan.slots.at(-1).takes={intro:9};state.notes.push({id:'later-local-note',t:'Keep newer note'});
 const before=clone(state);const result=P.apply(state,op,{recording(){throw Error('must not duplicate existing recording addition')}},NOW);
 assert.deepEqual(state,before);for(const key of Object.keys(before))assert.deepEqual(result.state[key],before[key],key);
 assert.equal(result.songs,0);assert.equal(result.slots,0);assert.ok(result.state.privatePreparations[op.id]);
});
test('existing recording adoption rejects a changed title, lyric, group or schedule identity',async()=>{
 const packet=recordingPacket(),op=await operation('recording-addition',packet);
 for(const mutate of [s=>s.rsongs.at(-1).title='Changed title',s=>s.rsongs.at(-1).lines[0].t='Changed lyric',s=>s.rsongs.at(-1).groupId='wrong-group',
  s=>s.plan.slots.at(-1).name='Wrong person',s=>s.plan.slots.at(-1).date='2031-02-06',s=>s.plan.slots.at(-1).place='Another studio',
  s=>s.rsongs.pop(),s=>s.plan.slots.pop(),s=>s.rsongs.push(clone(s.rsongs.at(-1))),s=>s.plan.slots.push(clone(s.plan.slots.at(-1)))]){
  const state=clone(adapters.recording(current(),packet).state);mutate(state);const before=clone(state);
  rejects('ADDITION_CONFLICT',()=>P.apply(state,op,adapters,NOW));assert.deepEqual(state,before);
 }
});
test('the pure module has no network, storage, publishing, or credential acquisition',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../private-preparation.js'),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|console\.|\bgh\s*\(|schedulePush\s*\(/);
});
test('fresh private recording uses exact person IDs and never a matching surname prefix',async()=>{
 const state=current(),packet=recordingPacket();state.members.push({id:'unrelated-family',name:'New Synthetic Person Other'});const op=await operation('recording-addition',packet);const result=P.apply(state,op,adapters,NOW);assert.equal(result.state.rsongs.at(-1).roster[0],'private-rec-member');assert(result.state.members.some(m=>m.id==='private-rec-member'));assert.equal(result.state.members.find(m=>m.id==='unrelated-family').name,'New Synthetic Person Other');
});
test('fresh private recording rejects public name-indexed roster collision without modifying the public group',async()=>{
 const state=current(),packet=recordingPacket();packet.group.name='Original';state.rosters={};const before=clone(state),op=await operation('recording-addition',packet);assert.throws(()=>P.apply(state,op,adapters,NOW));assert.deepEqual(state,before);assert.deepEqual(state.rosters,{});
});
test('recording preparation refuses impossible dates and out-of-range planned times',async()=>{
 for(const edit of [p=>p.plan.slots[0].date='2031-02-31',p=>p.plan.slots[0].at=3000,p=>p.plan.slots[0].min=0,p=>p.plan.slots[0].at=60.5]){const state=current(),packet=recordingPacket();edit(packet);const op=await operation('recording-addition',packet);rejects('INVALID_OPERATION',()=>P.apply(state,op,adapters,NOW));}
});
test('recording preparation rejects cross-mode song IDs, date/day/year mismatch, and malformed identities',async()=>{
 for(const edit of [p=>p.songs[0].id='old-song',p=>p.plan.slots[0].day='2/5',p=>p.plan.year=2032,p=>p.plan.timezone='Unknown/Zone',p=>p.songs[0].title={},p=>p.group.name=4,p=>p.members[0].id='__proto__']){const state=current(),packet=recordingPacket();edit(packet);const before=clone(state),op=await operation('recording-addition',packet);assert.throws(()=>P.apply(state,op,adapters,NOW));assert.deepEqual(state,before);}
});
