const testContext = require('./inbox-test-context.cjs');
'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const Inbox=require('../recording-inbox.js');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const block=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const clone=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(r=>setImmediate(r));
const state=()=>({shows:[{id:'show'}],songs:[{id:'live',lines:[{t:'kept live lyric'}]}],notes:[{id:'unsent',memo:'unsent note'}],draws:{x:[1]},futureField:{keep:true},ghToken:'synthetic-gist-token',groups:[{id:'old-group',src:'unchanged'}],members:[{id:'existing-member',name:'Synthetic Member'}],rsongs:[{id:'old-song',title:'Old',lines:[{t:'existing recording'}]}],rosters:{Old:['Keep']},plan:{slots:[{id:'oldslot',day:'10/1',at:600,min:90,a0:610,secLog:{a:1}}]}});
const packet=()=>({app:'utacheck-recording-addition',version:1,group:{id:'new-group',name:'Synthetic Group',nopub:1},members:[{id:'m',name:'Synthetic Member'}],roster:['Synthetic Member'],songs:[{id:'new-song',title:'New',groupId:'new-group',roster:['m'],blocks:{A:['m']},lines:[{t:'Added',parts:['m'],main:['m'],extra:[]},{t:'Unassigned',parts:[],main:[],extra:[]}]}],plan:{year:2026,timezone:'Asia/Tokyo',slots:[{id:'newslot',day:'10/8',date:'2026-10-08',at:600,min:90}]}});
async function operation(id='synthetic-operation'){const p=packet();return {operationId:id,hash:await Inbox.packetHash(p,webcrypto),packet:p,approval:{source:'authenticated-submit'}};}
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};}
function local(){
 const writes=[],records=new Map(),disk=storage();let rejectSave=false,rejectIdb=false,hold;
 const c=testContext({S:state(),preview:null,saveErr:false,booted:true,touched:false,KEY:'synthetic-state',Date,setTimeout,clearTimeout,
  localStorage:{...disk,setItem(k,v){if(rejectSave)throw Error('quota');disk.setItem(k,v);}},freeSpace:()=>0,
  idbPut:async(key,value)=>{if(hold)await hold;if(rejectSave||rejectIdb)throw Error('quota');writes.push(clone(value));records.set(key,clone(value));},idbGet:async key=>records.get(key),});
 vm.runInContext(block('function packState(', '// 保存に失敗したら'),c);
 vm.runInContext(block('let idbOK = false;', 'const REC_SHOW ='),c);
 vm.runInContext(block('function recordingAdditionScopedMembers(', 'function chooseRecordingAddition()'),c);
 vm.runInContext(block('async function loadRaw()', 'let booted = false;'),c);
 vm.runInContext('idbOK=true',c);
 const gate=Inbox.createGate();let commits=0;
 const adapter=Inbox.createLocalAdapter({getState:()=>c.S,acquire:()=>gate.acquire(),commitFields(){commits++;},merge:c.mergeRecordingAddition,save:c.save,saveNow:c.saveNow,hasSaveError:()=>c.saveErr,verifySaved:async operation=>JSON.parse(await c.loadRaw()||'null')?.cloudAdditions?.[operation.operationId]?.hash===operation.hash,render(){}});
 return {c,gate,adapter,writes,commits:()=>commits,failSave:x=>rejectSave=x,failIdbWrite:x=>rejectIdb=x,hold:p=>hold=p};
}
function client(local,op,fetchOverride){const configs=storage(),calls=[],statuses=[];
 const fetch=fetchOverride||(async(url,opts)=>{calls.push({url,opts});const body=url.endsWith('/ack')?{operationId:op.operationId,hash:op.hash,status:'applied-local'}:{operation:op};return{ok:true,text:async()=>JSON.stringify(body)};});
 const api=Inbox.create({local:local.adapter,storage:configs,crypto:webcrypto,fetch,onStatus:x=>statuses.push(x)});
 return {api,configs,calls,statuses,enroll(){api.enroll({endpoint:'https://inbox.example.test',token:'synthetic-device-token'});}};
}
test('disabled by default; explicit enrollment stores scoped credential outside state and backups',async()=>{
 const l=local(),op=await operation(),x=client(l,op);assert.equal(x.api.enrolled,false);assert.equal((await x.api.receive()).status,'not-enrolled');assert.equal(x.calls.length,0);
 x.enroll();assert.equal(x.api.enrolled,true);await x.api.receive();assert(!JSON.stringify(l.c.S).includes('synthetic-device-token'));assert(!l.writes.at(-1).txt.includes('synthetic-device-token'));
 assert.equal(x.calls[0].opts.headers.Authorization,'Bearer synthetic-device-token');assert.equal(x.calls[0].opts.redirect,'error');assert.equal(x.calls[0].opts.credentials,'omit');
 x.api.disconnect();assert.equal(x.api.enrolled,false);assert.equal(x.configs.data.size,0);
});
test('real merger and real save atomically retain all unsent and unknown state with receipt before ACK',async()=>{
 const l=local(),op=await operation(),before=clone(l.c.S);let acked=false;
 const x=client(l,op,async(url,opts)=>{if(url.endsWith('/ack')){assert(l.writes.length);const saved=JSON.parse(l.writes.at(-1).txt);assert.equal(saved.cloudAdditions[op.operationId].hash,op.hash);assert.equal(saved.rsongs.length,2);assert.equal(saved.notes[0].memo,'unsent note');acked=true;return{ok:true,text:async()=>JSON.stringify({operationId:op.operationId,hash:op.hash,status:'applied-local'})};}return{ok:true,text:async()=>JSON.stringify({operation:op})};});x.enroll();
 const result=await x.api.receive();assert(acked);assert.equal(result.status,'applied-local');assert.equal(result.cloudStatus,'not-confirmed');assert.equal(result.memberStatus,'not-requested');
 for(const k of ['shows','songs','notes','draws','futureField','ghToken'])assert.deepEqual(clone(l.c.S[k]),before[k]);
 assert.deepEqual(clone(l.c.S.plan.slots[0]),before.plan.slots[0]);assert.equal(l.c.S.rsongs[1].lines[1].parts.length,0);assert.equal(l.commits(),1);
 vm.runInContext(block('function backupState()', '// 受け取った側で元に戻す'),l.c);assert.equal(l.c.backupState().cloudAdditions[op.operationId].hash,op.hash);
});
test('network wait never captures stale local state; latest edits merge on consumption',async()=>{
 const l=local(),op=await operation();let finish;
 const x=client(l,op,async url=>{if(!url.endsWith('/ack'))await new Promise(r=>finish=r);return{ok:true,text:async()=>JSON.stringify(url.endsWith('/ack')?{operationId:op.operationId,hash:op.hash,status:'applied-local'}:{operation:op})};});x.enroll();
 const request=x.api.receive();await tick();l.c.S.notes.push({id:'during-fetch',memo:'new unsent edit'});finish();await request;assert.equal(l.c.S.notes.length,2);assert.equal(JSON.parse(l.writes.at(-1).txt).notes.length,2);
});
test('edits while IndexedDB saves are flushed and never rolled back',async()=>{
 const l=local(),op=await operation();let finish;l.hold(new Promise(r=>finish=r));const applying=l.adapter.apply(op);await tick();
 l.c.S.notes.push({id:'during-save'});l.c.S.plan.slots[0].a1=700;l.c.save();finish();await applying;
 const saved=JSON.parse(l.writes.at(-1).txt);assert.equal(saved.notes.length,2);assert.equal(saved.plan.slots[0].a1,700);assert.equal(saved.cloudAdditions[op.operationId].hash,op.hash);
});
test('lost acknowledgement and restart retry durable receipt without duplicate additions',async()=>{
 const l=local(),op=await operation();let fail=true,acks=0;
 const x=client(l,op,async url=>{if(url.endsWith('/ack')){acks++;if(fail)throw Error('secret transport details');}return{ok:true,text:async()=>JSON.stringify(url.endsWith('/ack')?{operationId:op.operationId,hash:op.hash,status:'applied-local'}:{operation:op})};});x.enroll();
 assert.equal((await x.api.receive()).status,'local-saved-ack-pending');l.c.S=l.c.unpackState(JSON.parse(l.writes.at(-1).txt));fail=false;
 assert.equal((await x.api.receive()).status,'already-applied-local');assert.equal(l.c.S.rsongs.length,2);assert.equal(l.c.S.plan.slots.length,2);assert.equal(acks,2);
});
test('failed local save never acknowledges; retry persists existing in-memory receipt',async()=>{
 const l=local(),op=await operation(),x=client(l,op);x.enroll();l.failSave(true);
 assert.equal((await x.api.receive()).status,'local-save-unconfirmed');assert.equal(x.calls.length,1);assert.equal(l.c.S.rsongs.length,2);assert.equal(l.writes.length,0);
 l.c.S.notes.push({id:'newer'});l.failSave(false);assert.equal((await x.api.receive()).status,'already-applied-local');assert.equal(l.c.S.rsongs.length,2);assert.equal(l.c.S.notes.length,2);assert.equal(x.calls.length,3);
});
for(const change of ['hash','approval','same-id','conflict'])test(change+' failure never acknowledges or destroys current state',async()=>{
 const l=local(),op=await operation();if(change==='hash')op.packet.songs[0].title='tampered';if(change==='approval')op.approval={approved:true};if(change==='same-id')l.c.S.cloudAdditions={[op.operationId]:{hash:'different'}};if(change==='conflict')l.c.S.rsongs[0].title='New';const before=clone(l.c.S),x=client(l,op);x.enroll();
 const r=await x.api.receive();assert(['invalid-operation','operation-id-reused','addition-conflict'].includes(r.status));assert.equal(x.calls.length,1);assert.deepEqual(clone(l.c.S),before);
});
test('sync/restore gate blocks inbox during async replacement and blocks new replacement during save',async()=>{
 const l=local(),op=await operation();let finish;let edits=0;
 const replace=l.gate.wrapEditor(async()=>{await new Promise(r=>finish=r);edits++;});const active=replace();await assert.rejects(l.adapter.apply(op),/EDITOR_BUSY/);finish();await active;assert.equal(edits,1);
 l.hold(new Promise(r=>finish=r));const adding=l.adapter.apply(op);await tick();assert.equal(await replace(),false);assert.equal(edits,1);finish();await adding;assert.equal(l.gate.applying,false);
});
test('enrollment change while waiting discards old endpoint response without local application',async()=>{
 const l=local(),op=await operation();let finish;
 const x=client(l,op,async()=>{await new Promise(r=>finish=r);return{ok:true,text:async()=>JSON.stringify({operation:op})};});x.enroll();const pending=x.api.receive();await tick();x.api.disconnect();finish();assert.equal((await pending).status,'enrollment-changed');assert.equal(l.c.S.rsongs.length,1);
});
for(const endpoint of ['http://inbox.example.test','https://user:pass@inbox.example.test','https://inbox.example.test/path','https://inbox.example.test/?token=x'])test('rejects unsafe enrollment endpoint '+endpoint,()=>{
 assert.throws(()=>Inbox.configuration({endpoint,token:'synthetic'}),/INVALID_ENDPOINT/);
});
test('inbox errors are fixed codes with no endpoint response body or token echo',async()=>{
 const l=local(),op=await operation(),x=client(l,op,async()=>{throw Error('synthetic-device-token private packet');});x.enroll();assert.deepEqual(await x.api.receive(),{status:'inbox-unavailable'});assert(!JSON.stringify(x.statuses).includes('synthetic-device-token'));
});
test('duplicate polling coalesces and empty inbox never saves',async()=>{
 const l=local(),op=await operation();let finish,reads=0;const x=client(l,op,async()=>{reads++;await new Promise(r=>finish=r);return{ok:true,text:async()=>'{"operation":null}'};});x.enroll();const first=x.api.receive();assert.equal((await x.api.receive()).status,'busy');finish();assert.equal((await first).status,'idle');assert.equal(reads,1);assert.equal(l.writes.length,0);
});

test('IDB-only failure with successful localStorage fallback cannot ACK older restart snapshot',async()=>{
 const l=local(),op=await operation(),x=client(l,op);l.c.save();await l.c.saveNow();x.enroll();l.failIdbWrite(true);
 const result=await x.api.receive();assert.equal(result.status,'local-save-unconfirmed');assert.equal(l.c.saveErr,false);assert.equal(x.calls.length,1);
 const restarting=JSON.parse(await l.c.loadRaw());assert.equal(restarting.rsongs.length,1);assert.equal(restarting.cloudAdditions,undefined);
 l.c.S=l.c.unpackState(restarting);l.failIdbWrite(false);
 assert.equal((await x.api.receive()).status,'applied-local');assert.equal(l.c.S.rsongs.length,2);assert.equal(JSON.parse(await l.c.loadRaw()).cloudAdditions[op.operationId].hash,op.hash);
});
