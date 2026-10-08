'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const {appContext,settle,clone}=require('./startup-excel-recovery-fixture.cjs');
const Store=require('../recovery-delivery-store.js');
async function setup({store=Store,confirm=true}={}){
 const hold={v:1,seq:1,slot:1,copyKey:'preserved:recovery:v1:'+'a'.repeat(64),sourceKind:'cloud-publication'};
 const idb=indexedFixture({state:{'recovery:network-hold:v1':hold},clips:{'audio':new Blob(['preserved'])}});
 const f=appContext(idb),state=clone(f.run('S0'));
 Object.assign(state,{deviceId:'test-editor',groups:[{id:'g',name:'Synthetic'}],groupId:'g',showId:'show',shows:[{id:'show',groupId:'g',name:'Show'}],
 songs:[{id:'song',showId:'show',groupId:'g',title:'Song',roster:[],lines:[{t:'Lyric',parts:[]}],blocks:{}}],
 notes:[{id:'note',songId:'song',showId:'show',memo:'Keep',tags:[],memberIds:[]}],staffMemos:{private:'Keep'},recs:{audio:{dur:40}},
 plan:{year:2026,timezone:'Asia/Tokyo',start:'11:00',slots:[
 {id:'a',name:'Singer A',kind:'member',date:'2026-10-08',day:'10/8',place:'Studio',at:660,min:120,a0:661,a1:750,takes:{'1A':3},secLog:{'1A':4}},
 {id:'b',name:'Singer B',kind:'member',date:'2026-10-08',day:'10/8',place:'Studio',at:810,min:120},
 {id:'break',name:'Old break',kind:'break',date:'2026-10-08',day:'10/8',place:'Studio',at:950,min:30}]}});
 idb.replace('state:0',{seq:2,at:1,txt:JSON.stringify(state)});idb.replace('state:1',{seq:1,at:1,txt:JSON.stringify(state)});
 await settle(f);assert.equal(f.run('startupPhase'),'ready');
 const fields=['name','kind','date','day','place','at','min'],item=s=>({id:s.id,expected:Object.fromEntries(fields.map(k=>[k,s[k]]))});
 const packet={app:'utacheck-recording-schedule-update',version:1,id:'synthetic-update',year:2026,timezone:'Asia/Tokyo',updates:state.plan.slots.slice(0,2).map(s=>({...item(s),next:{at:s.at,min:75}})),unconfirmed:[item(state.plan.slots[2])]};
 const alerts=[],confirms=[];f.c.alert=x=>alerts.push(x);f.c.confirm=x=>{confirms.push(x);return confirm;};f.c.RecoveryDeliveryStore=store;
 f.run('saveNow=async()=>{}');
 vm.runInContext(fs.readFileSync(__dirname+'/../recording-schedule-update.js','utf8'),f.c);
 vm.runInContext(fs.readFileSync(__dirname+'/../recording-schedule-ui.js','utf8'),f.c);
 const raw=JSON.stringify(packet),file={size:Buffer.byteLength(raw),text:async()=>raw};return {...f,idb,state,packet,file,alerts,confirms};
}
test('schedule update preserves originals, notes, clips, actual timing and stable IDs and rereads saved result',async()=>{
 const f=await setup(),before=clone(f.run('S')),oldDb=f.idb.snapshot(),oldView=f.run('U.view');
 assert.equal(await f.c.RecordingScheduleUI.applyFile(f.file),true,f.alerts.join(' | '));
 const after=clone(f.run('S'));assert.equal(after.plan.slots[0].min,75);assert.equal(after.plan.slots[1].min,75);assert.equal(after.plan.slots[2].scheduleTimeUnconfirmed,true);
 for(const i of [0,1]){const row=clone(after.plan.slots[i]);row.min=before.plan.slots[i].min;assert.deepEqual(row,before.plan.slots[i]);}
 for(const key of Object.keys(before).filter(k=>k!=='plan'))assert.deepEqual(after[key],before[key]);
 assert.equal(f.run('U.view'),oldView);assert.deepEqual(f.idb.snapshot().clips,oldDb.clips);assert.deepEqual(f.idb.record('recovery:network-hold:v1'),new Map(oldDb.state).get('recovery:network-hold:v1'));
 const saved=f.idb.record('state:'+(f.run('saveSeq')%2));assert.equal(JSON.parse(saved.txt).plan.slots[0].min,75);
 assert(f.idb.snapshot().state.some(([k])=>k.startsWith(Store.PREFIX+'editor:')));
 assert.match(f.confirms[0],/時刻未確認/);assert.equal(f.calls.network.length,0);assert.equal(f.calls.saves,0);
 const stored=f.idb.snapshot();assert.equal(await f.c.RecordingScheduleUI.applyFile(f.file),false);assert.deepEqual(f.idb.snapshot(),stored);
});
test('cancel, recording and pending recording-save refuse without changing editor or database',async()=>{
 for(const guard of ['cancel','REC','recordingStartPending','recordingFinalizePending','pitchStartPending']){
  const f=await setup({confirm:guard!=='cancel'});if(guard!=='cancel')f.run(guard+'='+ (guard==='REC'?'{}':'true'));
  const before=f.run('JSON.stringify(S)'),db=f.idb.snapshot();assert.equal(await f.c.RecordingScheduleUI.applyFile(f.file),false);
  assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.calls.network.length,0);
 }
});
test('rejected storage leaves state unchanged; committed-unverified blocks further editing',async()=>{
 for(const committed of [false,true]){
  const f=await setup({store:{commit:async()=>({status:committed?'unverified':'rejected',committed})}}),before=f.run('JSON.stringify(S)');
  assert.equal(await f.c.RecordingScheduleUI.applyFile(f.file),false);assert.equal(f.run('JSON.stringify(S)'),before);
  assert.equal(f.run('startupPhase'),committed?'blocked':'ready');
 }
});
test('user edits while reading are kept and prevent applying the old plan',async()=>{
 const f=await setup();f.file.text=async()=>{f.run('S.notes[0].memo="new edit"');return JSON.stringify(f.packet);};const db=f.idb.snapshot();
 assert.equal(await f.c.RecordingScheduleUI.applyFile(f.file),false);assert.equal(f.run('S.notes[0].memo'),'new edit');assert.deepEqual(f.idb.snapshot(),db);
});
