'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
function read(name){const at=source.indexOf('function '+name+'(');return at<0?'':source.slice(at,source.indexOf('\n}',at)+2);}
function setup(){
 const original='sha256-'+'a'.repeat(64),manual={id:'manual',xlsSourceId:original,at:Date.parse('2026-10-24'),lines:[{t:'unison',sec:'1C',parts:['one','two']},{t:'solo',parts:['one'],cell:'A2'},{t:'next solo',parts:['two'],cell:'A3'},{t:'continuation',parts:['two'],cell:'A3',cont:true}]},received={...structuredClone(manual),id:'received',lines:manual.lines.map(l=>({t:l.t,parts:l.parts})),recSession:{id:'session'}};
 const slot={id:'person-one',songId:'received',kind:'member',name:'担当一人目',date:'2031-10-27',day:'10/27',at:720,min:90,secLog:{'1C':4},takes:{'1C':7}};
 const c={S:{recMode:true,rsongId:'manual',rsongs:[manual,received],planFocus:slot.id,plan:{slots:[slot,{...structuredClone(slot),id:'person-two',name:'担当二人目',at:810}]}},U:{view:'live',secView:'1C'},VIEW:()=>false,preview:null,recordingInboxCanWrite:()=>true,REC:null,PT:{on:false},recordingStartPending:false,recordingFinalizePending:false,pitchStartPending:false,micStream:null,
  recSong:()=>c.S.rsongs.find(s=>s.id===c.S.rsongId),focusSec:()=>c.U.secView,focusRow:()=>({s:c.S.plan.slots.find(s=>s.id===c.S.planFocus)}),linesInSec:(so,s)=>s==='1C'?so.lines.map((_,i)=>i):[],secOfLine:()=> '1C',partsOf:(so,i)=>so.lines[i].parts||[],recordingSingerKind:(so,i)=>so.lines[i].parts.length===1?'solo':'unison',
  pushUndo(){},save(){},render(){},renderSheet(){},SONGS:()=>c.S.rsongs,Date,Intl};vm.createContext(c);
 for(const name of ['recordingPlanSourceId','recordingPlanSongCanSelect','recScheduleClock','chooseRecordingSongPlanDay','openRecordingSongPlan','recordingSectionContext','recordingSectionRecord','recordingSectionSummary','updatedRecordingSectionState','changeRecordingSectionProgress','recordingAssignmentBoundary']){const code=read(name);if(code)vm.runInContext(code,c);}
 const action=kind=>{const ctx=c.recordingSectionContext();return c.changeRecordingSectionProgress(kind,{dataset:{song:ctx.so.id,slot:ctx.slot.id,section:ctx.section}});};return {c,action};
}
test('opening an exact-original received plan preserves the manually created sections, selected song and section',()=>{
 const {c}=setup(),before=JSON.stringify(c.S);assert.equal(c.openRecordingSongPlan('manual',true),true);assert.equal(c.S.rsongId,'manual');assert.equal(c.U.secView,'1C');assert.equal(c.U.planSongId,'received');assert.equal(JSON.stringify(c.S),before);
});
test('normal completion is unified; optional separation saves each part, supports merge/restore and stays isolated per member',()=>{
 const {c,action}=setup(),before=JSON.stringify([c.S.rsongs,c.S.plan.slots.map(s=>[s.secLog,s.takes])]);
 assert.equal(c.recordingSectionSummary(c.recordingSectionContext()).done,false,'legacy elapsed time is not a confirmed recording');
 assert.equal(action('whole'),true);assert.equal(c.recordingSectionSummary(c.recordingSectionContext()).done,true);action('whole');action('split');action('unison');
 let state=c.recordingSectionSummary(c.recordingSectionContext());assert.equal(state.done,false);assert.equal(state.partial,true);assert.equal(state.value.solo,false);
 action('merge');assert.equal(c.recordingSectionRecord(c.recordingSectionContext()).whole,false);action('split');assert.equal(c.recordingSectionRecord(c.recordingSectionContext()).unison,true);action('solo');assert.equal(c.recordingSectionSummary(c.recordingSectionContext()).done,true);
 c.S.planFocus='person-two';assert.equal(c.recordingSectionSummary(c.recordingSectionContext()).done,false);assert.equal(c.recordingSectionRecord(c.recordingSectionContext()).split,false);
 c.S.planFocus='person-one';assert.equal(c.recordingSectionSummary(c.recordingSectionContext()).done,true);assert.equal(JSON.stringify([c.S.rsongs,c.S.plan.slots.map(s=>[s.secLog,s.takes])]),before);
});
test('stale controls, unrelated plans, readonly profiles and malformed saved progress cannot write completion',()=>{
 for(const mode of ['stale','song','readonly','malformed']){
  const {c,action}=setup();let before;
  if(mode==='song')c.S.plan.slots[0].songId='another';if(mode==='readonly')c.recordingInboxCanWrite=()=>false;if(mode==='malformed')c.S.plan.slots[0].sectionChecks=[];before=JSON.stringify(c.S);
  const ctx=c.recordingSectionContext();const result=mode==='stale'?c.changeRecordingSectionProgress('whole',{dataset:{song:'manual',slot:'person-two',section:'1C'}}):ctx?action('whole'):false;
  assert.equal(result,false,mode);assert.equal(JSON.stringify(c.S),before,mode);
 }
});
test('solo assignment boundaries remain separate, while a true continuation remains grouped',()=>{
 const {c}=setup(),so=c.S.rsongs[0];assert.equal(c.recordingAssignmentBoundary(so,1),true);assert.equal(c.recordingAssignmentBoundary(so,2),true);assert.equal(c.recordingAssignmentBoundary(so,3),false);
});

test('splitting from the all-lyrics view selects the current section before filtering',()=>{
 const {c,action}=setup();c.S.plan.slots[0].secCur='1C';c.U.secView='';assert.equal(action('split'),true);assert.equal(c.U.secView,'1C');
});
