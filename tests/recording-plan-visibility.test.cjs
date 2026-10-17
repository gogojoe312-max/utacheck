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
  SEC_MIN:5,pushUndo:()=>calls.push('undo'),confirm:()=>true,document:{getElementById:()=>null},
  rememberRecordingSelection(){},save:()=>calls.push('save'),render:()=>calls.push('render'),renderSheet:()=>calls.push('sheet'),pauseRecSchedule:()=>calls.push('pause'),
  alert:message=>calls.push(message)});
 for(const name of ['recScheduleClock','chooseRecordingSongPlanDay','recordingPlanSongCanSelect','recordingPlanEditableSongId','planEditSlot','openRecordingSongPlan','recordingPlanEntryHTML','recSongActionsHTML','planRows','planSlot','secApply','secSum','viewPlan'])vm.runInContext(read(name),c);
 const branch=(name,next)=>{const i=source.indexOf('case "'+name+'":');return source.slice(i,source.indexOf('case "'+next+'":',i));};
 vm.runInContext('function action(a,id){switch(a){'+[
  branch('goplan','takeup'),branch('pskip','prebal'),branch('psecbars','pnextsec'),branch('peditbreak','rlist'),branch('planday','pshift'),branch('ruse','rfolder'),branch('recback','rbars')
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
 assert.match(html,/Upcoming song/);assert.doesNotMatch(html,/すべての進行表|Past member/);
 for(const action of ['psecopen','pastesched','padd','paddm','pbreak','prebal','pshift','pshiftundo'])assert(!html.includes('data-act="'+action+'"'),action);
 assert.doesNotMatch(html,/data-drag="plan:/);
 c.action('planday','');html=c.viewPlan();assert.equal((html.match(/data-drop="p:/g)||[]).length,9);
 for(let i=1;i<=9;i++)assert(html.includes('Member '+i));
 assert.deepEqual(clone([S.plan,S.notes,S.recs]),kept);
 const planDay=c.U.planDay;c.action('plan-all');assert.equal((c.viewPlan().match(/data-drop="p:/g)||[]).length,9);
 assert.equal(c.U.planSongId,'new');assert.equal(c.U.planDay,planDay);
});
test('the general plan entry opens only the current song and leaves saved work and the active day unchanged',()=>{
 const {c,S,calls}=fixture();S.rsongId='new';c.U.planSongId='old';c.U.planSec='finished';c.U.secOrd=true;
 S.plan.slots.push({id:'unlinked',name:'Unlinked past member',day:'10/1',at:700,min:45});
 const before=JSON.stringify(S);c.action('goplan');
 assert.equal(c.U.planSongId,'new');assert.equal(c.U.planDay,'10/1');assert.equal(c.U.planSec,'');assert.equal(c.U.secOrd,false);
 c.action('planday','');let html=c.viewPlan();assert.equal((html.match(/data-drop="p:/g)||[]).length,9);
 assert.doesNotMatch(html,/Past member|Unlinked past member|data-act="plan-all"/);
 c.action('plan-all');assert.equal((c.viewPlan().match(/data-drop="p:/g)||[]).length,9);
 c.action('psecgo','finished');assert.equal(JSON.stringify(S),before);assert.equal(c.U.view,'recplan');
 c.action('psecgo','unlinked');assert.equal(JSON.stringify(S),before);assert.equal(c.U.view,'recplan');
 c.action('recback');assert.equal(c.U.planSongId,'');assert.equal(c.U.planSongDay,'');assert.equal(c.U.planDay,'10/1');
 assert.doesNotMatch(c.viewPlan(),/Past member/);assert.equal(JSON.stringify(S),before);assert(!calls.includes('save'));assert(!calls.includes('pause'));
 assert.equal(Object.hasOwn(S,'planSongId'),false);
});
test('unlinked, absent, deleted or duplicate song selections have an empty table instead of a global fallback',()=>{
 for(const id of ['unscheduled','deleted','']){
  const {c,S}=fixture();S.rsongId=id;const before=JSON.stringify(S);c.action('goplan');
  const html=c.viewPlan();assert.doesNotMatch(html,/data-drop="p:|Past member|Member 1|data-act="pastesched"|data-act="pstart"/);
  assert.match(html,id==='unscheduled'?/この曲に連携した進行表はありません/:/RECの曲を選択してください/);
  c.action('planday','11/2');assert.equal(c.U.planDay,'10/1');assert.equal(c.U.planSongDay,'11/2');
  c.action('plan-all');assert.doesNotMatch(c.viewPlan(),/data-drop="p:/);assert.equal(JSON.stringify(S),before);
 }
 const {c,S}=fixture();c.U.planSongId='deleted';assert.doesNotMatch(c.viewPlan(),/data-drop="p:|Previous song/);
 c.U.planSongId='old';S.rsongs.push({...S.rsongs[0]});assert.doesNotMatch(c.viewPlan(),/data-drop="p:/);
});
test('a valid song with no linked slots can open an explicit empty schedule without changing existing work',()=>{
 const {c,S}=fixture(),before=clone([S.plan,S.notes,S.recs]);
 assert.equal(c.openRecordingSongPlan('unscheduled'),true);assert.equal(S.rsongId,'unscheduled');
 assert.match(c.viewPlan(),/No schedule/);assert.match(c.viewPlan(),/この曲に連携した進行表はありません/);
 assert.doesNotMatch(c.viewPlan(),/data-drop="p:/);assert.deepEqual(clone([S.plan,S.notes,S.recs]),before);
 assert.match(c.recordingPlanEntryHTML(),/この曲に連携した進行表はありません/);assert.doesNotMatch(c.recordingPlanEntryHTML(),/過去の進行表/);
});
test('passive current-song navigation keeps another active recording and its takes intact',()=>{
 const {c,S,calls}=fixture();S.rsongId='new';delete S.plan.slots[0].a1;c.REC={};
 const before=JSON.stringify(S);c.action('goplan');c.action('planday','');
 const html=c.viewPlan();assert.equal((html.match(/data-drop="p:/g)||[]).length,9);
 assert.match(html,/data-act="psecgo" data-id="new-0" disabled/);
 assert.doesNotMatch(html,/data-act="pstart"|data-act="pnext"|data-act="pundo"|Past member/);
 c.action('recback');assert.equal(JSON.stringify(S),before);assert.equal(c.U.planDay,'10/1');assert(!calls.includes('save'));
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
test('the normal current-song entry retains allocation controls and applies all-person changes only to that song',()=>{
 const {c,S}=fixture();S.rsongId='new';
 S.plan.slots.push({id:'unlinked',kind:'member',sec:{A:2},skip:{B:1}},
  {id:'current-break',songId:'new',kind:'break',min:10,day:'11/2',at:840});
 c.sectionsOf=slot=>[{name:'A',min:slot.sec?.A??5,skip:!!slot.skip?.A}];
 c.secSplitByBars=()=>({A:20});
 const beforeOther=JSON.stringify(S.plan.slots.filter(slot=>slot.songId!=='new'));
 const beforeBreak=JSON.stringify(S.plan.slots.at(-1));
 c.action('goplan');c.action('planday','');
 let html=c.viewPlan();assert.match(html,/data-act="psecopen" data-id="new-0"/);assert.match(html,/data-act="peditbreak" data-id="current-break"/);
 assert.doesNotMatch(html,/data-act="pastesched"|data-act="pshift"|data-drag="plan:/);
 c.action('psecopen','new-0');html=c.viewPlan();assert.match(html,/data-act="psec"/);assert.match(html,/この曲のほかの全員/);
 c.action('psecall','new-0');c.action('psec','A|1');
 for(const slot of S.plan.slots.filter(slot=>slot.songId==='new'&&slot.kind!=='break'))assert.equal(slot.sec.A,6);
 c.action('pskip','A');for(const slot of S.plan.slots.filter(slot=>slot.songId==='new'&&slot.kind!=='break'))assert.equal(slot.skip.A,1);
 c.action('pseceven');c.action('psecbars');for(const slot of S.plan.slots.filter(slot=>slot.songId==='new'&&slot.kind!=='break'))assert.equal(slot.sec.A,20);
 c.action('psecall','new-0');S.plan.slots[1].sec={A:9};c.action('pseccopy');
 for(const slot of S.plan.slots.filter(slot=>slot.songId==='new'&&slot.kind!=='break'))assert.equal(slot.sec.A,9);
 assert.equal(JSON.stringify(S.plan.slots.filter(slot=>slot.songId!=='new')),beforeOther);
 assert.equal(JSON.stringify(S.plan.slots.at(-1)),beforeBreak);assert.equal(S.planFocus,'finished');assert.equal(c.U.planDay,'10/1');
});
test('break editing updates only the selected unstarted current-song break and rejects stale foreign targets',()=>{
 const {c,S}=fixture();S.rsongId='new';
 S.plan.slots.push({id:'current-break',songId:'new',kind:'break',min:10,at:840},
  {id:'foreign-break',songId:'old',kind:'break',min:15,at:900});
 const before=JSON.stringify(S.plan.slots.slice(0,-2));c.action('goplan');
 c.action('peditbreak','current-break');c.action('pset','5');assert.equal(S.plan.slots.at(-2).min,15);
 c.document.getElementById=id=>({value:{patv:'14:20',pminv:'18',pnamev:'休憩'}[id]});
 c.action('psetat');assert.equal(S.plan.slots.at(-2).at,860);
 c.action('psetv');assert.equal(S.plan.slots.at(-2).min,18);assert.equal(S.plan.slots.at(-2).name,'休憩');
 c.U.menu={kind:'pedit',id:'foreign-break'};const protectedState=JSON.stringify(S);
 for(const action of ['pset','psetat','psetv','pdel'])c.action(action,'5');assert.equal(JSON.stringify(S),protectedState);
 c.action('psecopen','finished');assert.equal(c.U.planSec,'');assert.equal(JSON.stringify(S.plan.slots.slice(0,-2)),before);
 c.U.menu={kind:'pedit',id:'current-break'};S.plan.slots.at(-2).a0=840;const active=JSON.stringify(S);c.action('pset','5');c.action('pdel');assert.equal(JSON.stringify(S),active);
});
test('recording conflicts and preview entry block both hidden allocation controls and their stale handlers',()=>{
 for(const conflict of ['preview','REC','recordingStartPending','recordingFinalizePending','pitchStartPending','micStream','pitch','foreign-slot']){
  const {c,S}=fixture();S.rsongId='new';c.action('goplan');
  if(conflict==='preview')c.openRecordingSongPlan('new');
  else if(conflict==='pitch')c.PT.on=true;
  else if(conflict==='foreign-slot')delete S.plan.slots[0].a1;
  else c[conflict]=true;
  const before=JSON.stringify(S);assert.doesNotMatch(c.viewPlan(),/data-act="psecopen"|data-act="peditbreak"/,conflict);
  c.U.planSec='new-0';c.action('psec','A|1');c.action('pseccopy');c.action('psecall','new-0');
  assert.equal(JSON.stringify(S),before,conflict);
 }
});
