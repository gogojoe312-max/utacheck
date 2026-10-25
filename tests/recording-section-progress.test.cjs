'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const XLSX=require('../vendor/xlsx.full.min.js');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
function read(name){const at=source.indexOf('function '+name+'(');return at<0?'':source.slice(at,source.indexOf('\n}',at)+2);}
function setup(){
 const original='sha256-'+'a'.repeat(64),manual={id:'manual',xlsSourceId:original,at:Date.parse('2026-10-24'),lines:[{t:'unison',sec:'1C',parts:['one','two']},{t:'solo',parts:['one'],cell:'A2'},{t:'next solo',parts:['two'],cell:'A3'},{t:'continuation',parts:['two'],cell:'A3',cont:true}]},received={...structuredClone(manual),id:'received',lines:manual.lines.map(l=>({t:l.t,parts:l.parts})),recSession:{id:'session'}};
 const slot={id:'person-one',songId:'received',kind:'member',name:'担当一人目',date:'2031-10-27',day:'10/27',at:720,min:90,secLog:{'1C':4},takes:{'1C':7}};
 const c={XLSX,recordingAssignmentWorkbookCache:new Map(),softText:v=>String(v||''),S:{recMode:true,rsongId:'manual',rsongs:[manual,received],planFocus:slot.id,plan:{slots:[slot,{...structuredClone(slot),id:'person-two',name:'担当二人目',at:810}]}},U:{view:'live',secView:'1C'},VIEW:()=>false,preview:null,recordingInboxCanWrite:()=>true,REC:null,PT:{on:false},recordingStartPending:false,recordingFinalizePending:false,pitchStartPending:false,micStream:null,
  recSong:()=>c.S.rsongs.find(s=>s.id===c.S.rsongId),focusSec:()=>c.U.secView,focusRow:()=>({s:c.S.plan.slots.find(s=>s.id===c.S.planFocus),live:true}),linesInSec:(so,s)=>s==='1C'?so.lines.map((_,i)=>i):[],secOfLine:()=> '1C',partsOf:(so,i)=>so.lines[i].parts||[],recordingSingerKind:(so,i)=>so.lines[i].parts.length===1?'solo':'unison',
  sectionsOf:()=>[{name:'1C',done:c.recordingSectionSummary(c.recordingSectionContext()).done}],finishSlot:s=>{s.a1=800;delete s.secCur;},setTimeout:()=>0,document:{getElementById:()=>null},pushUndo(){},save(){},render(){},renderSheet(){},SONGS:()=>c.S.rsongs,Date,Intl};vm.createContext(c);
 for(const name of ['recordingPlanSourceId','recordingPlanSongCanSelect','recScheduleClock','chooseRecordingSongPlanDay','openRecordingSongPlan','recordingSourceAssignmentGroup','recordingSectionKinds','recordingSectionContext','recordingSectionRecord','recordingSectionSummary','updatedRecordingSectionState','changeRecordingSectionProgress','completeRecordingSection','recordingSingerFilter','recordingAssignmentBoundary']){const code=read(name);if(code)vm.runInContext(code,c);}
 const action=kind=>{const ctx=c.recordingSectionContext();return c.changeRecordingSectionProgress(kind,{dataset:{song:ctx.so.id,slot:ctx.slot.id,section:ctx.section}});};return {c,action};
}
test('opening an exact-original received plan preserves the manually created sections, selected song and section',()=>{
 const {c}=setup(),before=JSON.stringify(c.S);assert.equal(c.openRecordingSongPlan('manual',true),true);assert.equal(c.S.rsongId,'manual');assert.equal(c.U.secView,'1C');assert.equal(c.U.planSongId,'received');assert.equal(JSON.stringify(c.S),before);
});
test('legacy OK records remain completed and the existing OK action records the whole section',()=>{
 const {c}=setup(),slot=c.S.plan.slots[0];slot.secCur='1C';assert.equal(c.recordingSectionSummary(c.recordingSectionContext()).done,true);
 delete slot.secLog['1C'];assert.equal(c.recordingSectionSummary(c.recordingSectionContext()).done,false);
 assert.equal(c.completeRecordingSection(),true);assert.equal(c.recordingSectionSummary(c.recordingSectionContext()).done,true);assert.equal(slot.secLog['1C'],0);assert.equal(slot.a1,800);assert.equal(slot.takes['1C'],7);
});
test('optional split is completed with OK, keeps the remaining kind on screen and stays isolated per member',()=>{
 const {c,action}=setup(),slot=c.S.plan.slots[0],before=JSON.stringify(c.S.rsongs);slot.secLog={};slot.secCur='1C';
 assert.equal(action('split'),true);assert.equal(c.completeRecordingSection(),true);
 let state=c.recordingSectionSummary(c.recordingSectionContext());assert.equal(state.done,false);assert.equal(state.partial,true);assert.equal(state.value.solo,false);assert.equal(c.U.recSingerFilter,'solo');assert.equal(slot.secLog['1C'],undefined);assert.equal(slot.a1,undefined);
 action('merge');assert.equal(c.recordingSectionRecord(c.recordingSectionContext()).whole,false);action('split');assert.equal(c.recordingSectionRecord(c.recordingSectionContext()).unison,true);
 c.U.recSingerFilter='solo';assert.equal(c.completeRecordingSection(),true);assert.equal(c.recordingSectionSummary(c.recordingSectionContext()).done,true);assert.equal(slot.a1,800);
 c.S.planFocus='person-two';c.S.plan.slots[1].secLog={};assert.equal(c.recordingSectionRecord(c.recordingSectionContext()).split,false);assert.equal(c.recordingSectionSummary(c.recordingSectionContext()).done,false);
 assert.equal(JSON.stringify(c.S.rsongs),before);assert.equal(slot.takes['1C'],7);
});
test('a solo-only section cannot be split, including a stale split control',()=>{
 const {c,action}=setup();c.S.rsongs[0].lines.forEach(l=>l.parts=['one']);assert.equal(action('split'),false);assert.equal(c.recordingSectionRecord(c.recordingSectionContext()).split,false);
});
test('stale controls, unrelated plans, readonly profiles and malformed saved progress cannot write completion',()=>{
 for(const mode of ['stale','song','readonly','malformed']){
  const {c,action}=setup();let before;
  if(mode==='song')c.S.plan.slots[0].songId='another';if(mode==='readonly')c.recordingInboxCanWrite=()=>false;if(mode==='malformed')c.S.plan.slots[0].sectionChecks=[];before=JSON.stringify(c.S);
  const ctx=c.recordingSectionContext();const result=mode==='stale'?c.changeRecordingSectionProgress('split',{dataset:{song:'manual',slot:'person-two',section:'1C'}}):ctx?action('split'):false;
  assert.equal(result,false,mode);assert.equal(JSON.stringify(c.S),before,mode);
 }
});
test('solo assignment boundaries remain separate, while a true continuation remains grouped',()=>{
 const {c}=setup(),so=c.S.rsongs[0];assert.equal(c.recordingAssignmentBoundary(so,1),true);assert.equal(c.recordingAssignmentBoundary(so,2),true);assert.equal(c.recordingAssignmentBoundary(so,3),false);
});

test('splitting from the all-lyrics view selects the current section before filtering',()=>{
 const {c,action}=setup();c.S.plan.slots[0].secCur='1C';c.U.secView='';assert.equal(action('split'),true);assert.equal(c.U.secView,'1C');
});

test('legacy restored numeric rows use the original merged assignment cells, with no artificial line between phrase continuations',()=>{
 const {c}=setup(),wb=require('./recording-original-groups-fixture.cjs')(XLSX),so={xlsSourceId:'original',sheetName:'歌割',lines:Array.from({length:5},(_,i)=>({t:'ソロの合成歌詞'+i,cell:'A'+(10+i),lcell:'C'+(10+i),parts:[]}))};
 c.recordingAssignmentWorkbookCache.set('original',{wb});assert.deepEqual(Array.from(so.lines,(_,i)=>c.recordingSourceAssignmentGroup(so,so.lines[i])),['A10','A10','A10','A13','A13']);assert.deepEqual(Array.from(so.lines,(_,i)=>c.recordingAssignmentBoundary(so,i)),[false,false,false,true,false]);
});
