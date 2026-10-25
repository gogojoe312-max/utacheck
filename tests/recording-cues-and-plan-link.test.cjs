'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
function read(name){const a=source.indexOf('function '+name+'(');return a<0?'':source.slice(a,source.indexOf('\n}',a)+2);}
function setup(){const sha='sha256-'+'a'.repeat(64),lines=[{t:'保持する合成歌詞',recAssignmentHint:{type:'count',count:1}}],manual={id:'manual-random',title:'歌手_曲名_歌割',groupId:'private',xlsSourceId:sha,at:Date.parse('2026-10-24T00:00:00Z'),lines},delivered={id:'received-fixed',title:'曲名',groupId:'private',xlsSourceId:sha,lines:structuredClone(lines),recSession:{id:'confirmed'}};
 const c={S:{rsongId:manual.id,recMode:true,rsongs:[manual,delivered],plan:{slots:[{id:'new-slot',songId:delivered.id,day:'10/27',date:'2026-10-27',at:720,min:90}]}},U:{view:'live'},VIEW:()=>false,preview:null,recordingPlanSongCanSelect:()=>true,SONGS:()=>c.S.rsongs,save(){},render(){},renderSheet(){},Date};vm.createContext(c);
 for(const name of ['recordingAssignmentHintText','recordingAssignmentCue','recordingSingerKind','recordingSingerFilter','recordingPlanSourceId','recordingPlanEntryHTML','recScheduleClock','chooseRecordingSongPlanDay','openRecordingSongPlan']){const code=read(name);if(code)vm.runInContext(code,c);}return c;}
test('REC uses Solo and Unison wording without repeating labels on each continuation',()=>{
 const c=setup();assert.equal(c.recordingAssignmentHintText({type:'count',count:1}),'ソロ');assert.equal(c.recordingAssignmentHintText({type:'count',count:3}),'ユニゾン・3人');assert.equal(c.recordingAssignmentHintText({type:'group',label:'A'}),'ユニゾン・A');
 const so={lines:[{t:'first',recAssignmentHint:{type:'count',count:1}},{t:'next',recAssignmentHint:{type:'count',count:1}},{gap:true,t:''},{t:'next verse',recAssignmentHint:{type:'count',count:1}},{t:'group',recAssignmentHint:{type:'count',count:3}}]};
 assert.equal(c.recordingAssignmentCue(so,0).start,true);assert.equal(c.recordingAssignmentCue(so,1).start,false);assert.equal(c.recordingAssignmentCue(so,3).start,false);assert.equal(c.recordingAssignmentCue(so,4).start,true);
});
test('manual Excel import opens the unique received schedule for the exact same original, preserving both song IDs and data',()=>{
 const c=setup(),before=JSON.stringify(c.S.rsongs);assert(!c.recordingPlanEntryHTML().includes('連携した進行表はありません'));
 c.openRecordingSongPlan('manual-random');assert.equal(c.U.planSongId,'received-fixed');assert.equal(c.U.planSongDay,'10/27');assert.equal(c.S.rsongId,'received-fixed');assert.equal(JSON.stringify(c.S.rsongs),before);
});
test('a matching title cannot borrow a different original, modified lyrics, a past schedule or an ambiguous second session',()=>{
 for(const change of [c=>c.S.rsongs[1].xlsSourceId='sha256-'+'b'.repeat(64),c=>c.S.rsongs[1].lines[0].t='different source words',c=>c.S.plan.slots[0].date='2026-10-08',c=>{c.S.rsongs.push({...c.S.rsongs[1],id:'another'});c.S.plan.slots.push({...c.S.plan.slots[0],id:'other-slot',songId:'another'});},c=>c.S.rsongs[0].recSession={id:'different-explicit-session'}]){
  const c=setup();change(c);assert(c.recordingPlanEntryHTML().includes('連携した進行表はありません'));
 }
});

test('REC singer filters distinguish tentative counts/groups, confirmed singers and unknown assignments without editing source rows',()=>{
 const c=setup();c.S.members=[{id:'one',name:'担当一人目'},{id:'two',name:'担当二人目'},{id:'placeholder',name:'A'}];c.partsOf=(so,i)=>so.lines[i].parts||[];c.member=id=>c.S.members.find(m=>m.id===id);
 const so={id:'filter-song',lines:[{t:'solo',recAssignmentHint:{type:'count',count:1}},{t:'unison',recAssignmentHint:{type:'count',count:3}},{t:'tentative group',recAssignmentHint:{type:'group',label:'A'}},{t:'confirmed solo',parts:['one']},{t:'confirmed unison',parts:['one','two']},{t:'unresolved group',parts:['placeholder']},{t:'unknown',parts:[]}]},before=JSON.stringify(so);
 assert.deepEqual(Array.from(so.lines,(_,i)=>c.recordingSingerKind(so,i)),['solo','unison','unison','solo','unison','','']);assert.equal(JSON.stringify(so),before);c.U.recSingerSongId=so.id;c.U.recSingerFilter='solo';assert.equal(c.recordingSingerFilter(so),'solo');assert.equal(c.recordingSingerFilter({id:'another-song'}),'');
});
