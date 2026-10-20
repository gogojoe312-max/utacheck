'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function read(name){let a=source.indexOf('function '+name+'(');assert(a>=0,name);return source.slice(a,source.indexOf('\n}',a)+2);}
function setup(){let now=Date.parse('2026-10-20T01:00:00Z'),saves=0,renders=0;const songs=[{id:'one',lines:[]},{id:'two',lines:[]}],slots=[{id:'first',songId:'one',name:'担当A',day:'10/20',date:'2026-10-20',at:600,min:10,takes:{'1A':3}},{id:'second',songId:'two',name:'担当B',day:'10/20',date:'2026-10-20',at:610,min:10}];
 const c={S:{recMode:true,rsongs:songs,rsongId:'one',plan:{slots}},U:{view:'recplan'},VIEW:()=>false,preview:null,document:{hidden:false,activeElement:null},RecordingScheduleUI:undefined,REC:null,recordingStartPending:false,recordingFinalizePending:false,pitchStartPending:false,PT:{on:false},micStream:null,recordingInboxCanWrite:()=>true,recordingPlanExpired:()=>false,recSong:()=>songs.find(s=>s.id===c.S.rsongId),SONGS:()=>songs,nowMin:()=>999,min2hm:v=>String(v),sectionsOf:()=>[{name:'RH',prep:true}],save:()=>saves++,render:()=>renders++,autoMsg:'',Date:class extends Date{static now(){return now}},planRows:()=>slots.map(s=>({s,pS:s.at,pE:s.at+s.min,live:s.a0!=null&&s.a1==null,done:s.a1!=null}))};vm.createContext(c);
 for(const name of ['recScheduleClock','recScheduledRow','recScheduleEditing','pauseRecSchedule','startSlot','finishSlot','autoPlan'])vm.runInContext(read(name),c);
 return {c,slots,tick:()=>c.autoPlan(),at:t=>now=Date.parse(t),counts:()=>({saves,renders})};
}
test('the exact scheduled boundary starts the slot and timer once, preserving stored takes and the progression screen',()=>{const f=setup();f.at('2026-10-20T00:59:59Z');f.tick();assert.equal(f.slots[0].a0,undefined);f.at('2026-10-20T01:00:00Z');f.tick();assert.equal(f.slots[0].a0,600);assert.equal(f.slots[0].startAt,Date.parse('2026-10-20T01:00:00Z'));assert.equal(f.slots[0].secCur,'RH');assert.equal(f.slots[0].takes['1A'],3);assert.equal(f.c.U.view,'recplan');f.tick();assert.equal(f.counts().saves,1);});
test('late opening uses scheduled time, then completes and starts the next slot without resetting on every tick',()=>{const f=setup();f.at('2026-10-20T01:03:00Z');f.tick();assert.equal(f.slots[0].startAt,Date.parse('2026-10-20T01:00:00Z'));f.at('2026-10-20T01:10:00Z');f.tick();assert.equal(f.slots[0].a1,610);assert.equal(f.slots[1].a0,610);assert.equal(f.c.S.rsongId,'two');assert.equal(f.c.S.planFocus,'second');f.at('2026-10-20T01:20:00Z');f.tick();assert.equal(f.slots[1].a1,620);assert.equal(f.counts().saves,3);});
test('editing, manual takes, microphone use, stale dates and overlapping slots cannot start or replace a take',()=>{
 for(const change of [f=>f.c.U.sheet={},f=>f.c.document.hidden=true,f=>f.c.REC={},f=>{f.slots[0].a0=599},f=>f.c.U.recSchedulePaused=true,f=>f.slots.forEach(s=>s.date='2026-10-19'),f=>f.slots[1].at=600]){const f=setup();change(f);const before=JSON.stringify(f.c.S);f.tick();assert.equal(JSON.stringify(f.c.S),before);assert.equal(f.counts().saves,0);}
});

test('an explicitly cancelled automatic start stays cancelled for that timestamp, while a changed schedule may start',()=>{
 const f=setup();f.slots[0].autoStartSuppressedAt=Date.parse('2026-10-20T01:00:00Z');f.tick();assert.equal(f.slots[0].a0,undefined);
 f.slots[0].at=601;f.at('2026-10-20T01:01:00Z');f.tick();assert.equal(f.slots[0].a0,601);assert.equal(f.slots[0].autoStartSuppressedAt,undefined);
});
