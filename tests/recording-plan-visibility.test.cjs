'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(i,source.indexOf('\n}',i)+2);};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const calls=[],S={recMode:true,rsongId:'old',planFocus:'finished',groups:[],rosters:{},planMin:60,planPrep:0,
  rsongs:[{id:'old',title:'Previous song',lines:[]},{id:'new',title:'Upcoming song',lines:[]},{id:'unscheduled',title:'No schedule',lines:[]}],
  notes:[{id:'note',memo:'Keep'}],recs:{take:{size:12}},plan:{start:'10:00',slots:[
   {id:'finished',songId:'old',date:'2026-10-01',day:'10/1',name:'Past member',at:600,min:60,a0:603,a1:665,takes:{A:3}},
   ...Array.from({length:9},(_,i)=>({id:'new-'+i,songId:'new',date:i<4?'2026-11-02':'2026-11-03',day:i<4?'11/2':'11/3',name:'Member '+(i+1),at:600+(i<4?i:i-4)*60,min:60,place:'Test studio'}))
  ]}};
 const c=vm.createContext({S,U:{view:'setup',planDay:'10/1',planSec:'',songIdx:0},Date,Intl,JSON,preview:null,VIEW:()=>false,
  REC:null,recordingStartPending:false,recordingFinalizePending:false,pitchStartPending:false,PT:{on:false},micStream:null,
  h:x=>String(x??''),hm2min:x=>Number(x.split(':')[0])*60+Number(x.split(':')[1]),nowMin:()=>600,
  min2hm:x=>Math.floor(x/60)+':'+String(x%60).padStart(2,'0'),dmin:x=>String(x),compactMemberLabel:x=>x,
  sectionsOf:()=>[],SONGS:()=>S.rsongs,recSong:()=>S.rsongs.find(x=>x.id===S.rsongId),
  rememberRecordingSelection(){},save:()=>calls.push('save'),render:()=>calls.push('render'),renderSheet:()=>calls.push('sheet'),pauseRecSchedule:()=>calls.push('pause'),
  alert:message=>calls.push(message)});
 for(const name of ['recScheduleClock','chooseRecordingSongPlanDay','recordingPlanSongCanSelect','openRecordingSongPlan','recSongActionsHTML','planRows','viewPlan'])vm.runInContext(read(name),c);
 const branch=(name,next)=>{const i=source.indexOf('case "'+name+'":');return source.slice(i,source.indexOf('case "'+next+'":',i));};
 vm.runInContext('function action(a,id){switch(a){'+[
  branch('goplan','psec'),branch('psecgo','psecopen'),branch('planday','pshift'),branch('ruse','rfolder'),branch('recback','rbars')
 ].join('\n')+'}}',c);
 return {c,S,calls};
}
test('a newly selected song opens its nearest upcoming explicit Tokyo date and preserves recorded work',()=>{
 const {c,S}=fixture(),before=JSON.stringify(S);
 assert.equal(c.chooseRecordingSongPlanDay('new',Date.parse('2026-11-01T15:30:00Z')),true);
 assert.equal(c.U.planDay,'11/2');assert.equal(JSON.stringify(S),before);
 c.U.planDay='10/1';c.chooseRecordingSongPlanDay('new',Date.parse('2026-11-02T15:30:00Z'));assert.equal(c.U.planDay,'11/3');
 c.U.planDay='10/1';c.chooseRecordingSongPlanDay('new',Date.parse('2026-12-01T00:00:00Z'));assert.equal(c.U.planDay,'11/3');
 c.U.planDay='10/1';c.action('ruse','new');assert.notEqual(c.U.planDay,'10/1');assert.equal(S.rsongId,'new');
 assert.equal(JSON.stringify(S.plan),JSON.stringify(JSON.parse(before).plan));
});
test('matching chosen date, unlinked schedules, invalid dates and an active slot never jump days',()=>{
 const {c,S}=fixture();c.U.planDay='11/3';
 assert.equal(c.chooseRecordingSongPlanDay('new'),false);assert.equal(c.U.planDay,'11/3');
 c.U.planDay='10/1';assert.equal(c.chooseRecordingSongPlanDay('unscheduled'),false);
 S.plan.slots.push({id:'invalid',songId:'unscheduled',date:'2026-02-30',day:'2/30'});
 assert.equal(c.chooseRecordingSongPlanDay('unscheduled'),false);assert.equal(c.U.planDay,'10/1');
 delete S.plan.slots[0].a1;const before=JSON.stringify(S);
 assert.equal(c.chooseRecordingSongPlanDay('new'),false);assert.equal(c.U.planDay,'10/1');assert.equal(JSON.stringify(S),before);
});
test('the song action opens only its linked members, and all dates show all nine exact saved names',()=>{
 const {c,S}=fixture(),kept=clone([S.plan,S.notes,S.recs]);
 assert.match(c.recSongActionsHTML('new'),/data-act="rec-song-plan" data-id="new"/);
 assert.doesNotMatch(c.recSongActionsHTML('unscheduled'),/data-act="rec-song-plan"/);
 assert.equal(c.openRecordingSongPlan('new'),true);assert.equal(c.U.view,'recplan');assert.equal(c.U.planSongId,'new');assert.equal(S.rsongId,'new');
 c.U.planSongDay='11/2';let html=c.viewPlan();assert.equal((html.match(/data-drop="p:/g)||[]).length,4);
 assert.match(html,/Upcoming song/);assert.match(html,/すべての進行表/);assert.doesNotMatch(html,/Past member/);
 for(const action of ['psecopen','pastesched','padd','paddm','pbreak','prebal','pshift','pshiftundo'])assert(!html.includes('data-act="'+action+'"'),action);
 assert.doesNotMatch(html,/data-drag="plan:/);
 c.action('planday','');html=c.viewPlan();assert.equal((html.match(/data-drop="p:/g)||[]).length,9);
 for(let i=1;i<=9;i++)assert(html.includes('Member '+i));
 assert.deepEqual(clone([S.plan,S.notes,S.recs]),kept);
 c.action('plan-all');assert.equal((c.viewPlan().match(/data-drop="p:/g)||[]).length,10);
 assert.equal(c.U.planSongId,'');assert.equal(c.U.planDay,'');
});
test('leaving a song-specific table restores the global day without persistent filter data',()=>{
 for(const action of ['recback','goplan']){
  const {c,S}=fixture();c.openRecordingSongPlan('new');c.U.planDay='10/1';c.U.planSongDay='11/2';c.action(action);
  assert.equal(c.U.planSongId,'');assert.equal(c.U.planSongDay,'');assert.equal(c.U.planDay,'10/1');assert.match(c.viewPlan(),/Past member/);
  c.action('planday','');assert.equal((c.viewPlan().match(/data-drop="p:/g)||[]).length,10);
  assert.equal(Object.hasOwn(S,'planSongId'),false);
 }
});
test('an active recording can preview future members without changing the song, active day or actual slots',()=>{
 for(const flag of ['REC','recordingStartPending','recordingFinalizePending','pitchStartPending','micStream','slot','pitch']){
  const {c,S}=fixture();
  if(flag==='slot')delete S.plan.slots[0].a1;else if(flag==='pitch')c.PT.on=true;else c[flag]=true;
  const before=JSON.stringify(S);assert.equal(c.openRecordingSongPlan('new'),true,flag);
  assert.equal(JSON.stringify(S),before,flag);assert.equal(c.U.planDay,'10/1');assert.equal(c.U.view,'recplan');
  c.action('planday','');const html=c.viewPlan();assert.equal((html.match(/data-drop="p:/g)||[]).length,9);
  assert.match(html,/録音画面は切り替えず/);assert.match(html,/data-act="psecgo" data-id="new-0" disabled/);
  for(const action of ['pstart','pnext','pundo','psecopen','pcancel','pretry','pastesched'])assert(!html.includes('data-act="'+action+'"'),action);
  c.action('psecgo','new-0');assert.equal(JSON.stringify(S),before);assert.equal(c.U.planDay,'10/1');
  c.action('recback');assert.equal(c.U.planDay,'10/1');assert.equal(JSON.stringify(S),before);
 }
});
test('finishing a pending recording keeps the existing preview read-only until explicit song selection',()=>{
 const {c,S}=fixture();c.recordingFinalizePending=true;const before=JSON.stringify(S);
 c.openRecordingSongPlan('new');c.recordingFinalizePending=false;
 let html=c.viewPlan();assert.match(html,/data-act="psecgo" data-id="new-0" disabled/);assert.doesNotMatch(html,/data-act="pstart"/);
 assert.equal(JSON.stringify(S),before);assert.equal(c.U.planDay,'10/1');
 c.openRecordingSongPlan('new');assert.equal(S.rsongId,'new');html=c.viewPlan();assert.match(html,/data-act="pstart"/);
});
test('member entry follows an exact linked song ID and leaves actual takes untouched',()=>{
 const {c,S}=fixture(),kept=JSON.stringify(S.plan);
 c.action('psecgo','new-0');assert.equal(S.rsongId,'new');assert.equal(S.planFocus,'new-0');assert.equal(c.U.view,'live');assert.equal(JSON.stringify(S.plan),kept);
 S.rsongId='old';delete S.plan.slots[0].a1;const before=JSON.stringify(S);
 c.action('psecgo','new-1');assert.equal(JSON.stringify(S),before);
});
