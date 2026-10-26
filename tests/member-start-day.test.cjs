'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
function fn(name){const a=source.indexOf('function '+name+'(');assert(a>=0,'Missing '+name);return source.slice(a,source.indexOf('\n}',a)+2);}
function fixture(){
 const S={groupId:'member-source',showId:'old',groups:[{id:'member-source'}],shows:[
  {id:'old',name:'2026/10/25 夜公演',ts:900,groupId:'old-owner'},
  {id:'latest',name:'2026/10/26 夜公演',ts:1,groupId:'old-owner',recoverySource:'original-workbooks'},
  {id:'rh',name:'2026/10/30 通しリハ',ts:1000},
  {id:'other',name:'2026/10/31 別グループ',ts:1100},
  {id:'hidden',name:'2026/11/1 公演',ts:2000,hidden:1}
 ],songs:['old','latest','rh','hidden'].map(showId=>({showId,groupId:'member-source'})).concat([{showId:'other',groupId:'other'}])};
 const c={S,U:{songIdx:4,showFilter:'',allShows:true},viewer:true,preview:null,preference:null,
  VIEW:()=>c.viewer,NOTES:()=>[...(S.notes||[]),...(S.pubNotes||[])],showsNewestFirst:()=>S.shows.slice().sort((a,b)=>b.ts-a.ts),liveGroups:()=>S.groups,showGroupIds:sw=>[sw.groupId],recoveryMaterialShow:()=>false,syncShowGroup(){},readViewSelection:()=>c.preference};vm.createContext(c);
 for(const name of ['performanceDateOrder','performanceSelectionOrder','memberPerformanceDates','memberPerformanceDateOrder','noteInArrangement','latestPerformance','restoreViewSelection','memberDayKey','memberPerformanceIsToday'])vm.runInContext(fn(name),c);
 return c;
}
test('member latest means actual performance date, regardless of creation order or old owner/archive metadata',()=>{
 const c=fixture(),before=JSON.stringify(c.S);assert.equal(c.latestPerformance('member-source').id,'rh');assert.equal(JSON.stringify(c.S),before);
});
test('boot chooses latest with no preference and with a persisted older preference, without rewriting shows or songs',()=>{
 for(const saved of [false,true]){const c=fixture(),content=JSON.stringify([c.S.shows,c.S.songs]);if(saved)c.preference={showId:'old',groupId:'member-source',showFilter:''};c.restoreViewSelection('old',true);assert.equal(c.S.showId,'rh');assert.equal(c.U.songIdx,0);assert.equal(c.U.allShows,false);assert.equal(JSON.stringify([c.S.shows,c.S.songs]),content);}
});
test('manual historical browsing remains restorable inside a running session',()=>{
 const c=fixture();c.preference={showId:'old',groupId:'member-source',showFilter:''};c.S.showId='latest';c.restoreViewSelection('latest',false);assert.equal(c.S.showId,'old');
});
test('member change visibility uses Tokyo calendar day, including yearless labels and explicit year rejection',()=>{
 const c=fixture();c.S.shows.push({id:'today',name:'10/26 昼公演'},{id:'last-year',date:'2025-10-26',name:'previous year'},{id:'unknown',name:'公演',ts:Date.parse('2026-10-26T01:00:00Z')},{id:'future',date:'2026-10-27'});
 const before=JSON.stringify(c.S),beforeMidnight=Date.parse('2026-10-25T14:59:59Z'),midnight=Date.parse('2026-10-25T15:00:00Z');
 assert.equal(c.memberPerformanceIsToday('today',beforeMidnight),false);assert.equal(c.memberPerformanceIsToday('today',midnight),true);assert.equal(c.memberPerformanceIsToday('old',midnight),false);for(const id of ['last-year','unknown','future','missing'])assert.equal(c.memberPerformanceIsToday(id,midnight),false,id);
 assert.equal(c.memberPerformanceIsToday('today',Date.parse('2026-10-26T15:00:00Z')),false);assert.equal(JSON.stringify(c.S),before);
});

test('actual 10/24.25 labels include both days, order by the final day, and never expand into unrelated days',()=>{
 const c=fixture();c.S.shows.push({id:'multi',name:'10/24.25'},{id:'multi-year',date:'2026/10/24.25'},{id:'bad-extra',name:'2026/2/28.30'},{id:'part',name:'10/24.1部'});
 for(const id of ['multi','multi-year']){
  assert.deepEqual(Array.from(c.memberPerformanceDates(c.S.shows.find(sw=>sw.id===id)),d=>d.day),[24,25]);
  for(const d of [24,25])assert.equal(c.memberPerformanceIsToday(id,Date.parse('2026-10-'+d+'T03:00:00Z')),true);
  assert.equal(c.memberPerformanceIsToday(id,Date.parse('2026-10-26T03:00:00Z')),false);assert.equal(c.memberPerformanceDateOrder(c.S.shows.find(sw=>sw.id===id)).day,25);
 }
 assert.deepEqual(Array.from(c.memberPerformanceDates(c.S.shows.find(sw=>sw.id==='bad-extra')),d=>d.day),[28]);
 assert.deepEqual(Array.from(c.memberPerformanceDates(c.S.shows.find(sw=>sw.id==='part')),d=>d.day),[24]);
});

test('offline member boot repairs a stale saved REC mode before choosing the first show, without touching REC data',()=>{
 const c=fixture();c.S.recMode=true;c.S.rsongs=[{id:'keep-rec',lines:[{t:'kept'}]}];c.S.plan={slots:[{id:'keep-slot'}]};const kept=JSON.stringify([c.S.rsongs,c.S.plan]);
 c.restoreViewSelection('old',true);assert.equal(c.S.recMode,false);assert.equal(c.S.showId,'rh');assert.equal(JSON.stringify([c.S.rsongs,c.S.plan]),kept);
});

test('member feedback starts at the latest performance with received feedback, retaining a newer empty つばき10/26',()=>{
 const c=fixture();c.S.shows=[{id:'first',name:'10/26リハ',ts:10},{id:'second',name:'10/26リハ 2回目',ts:20},{id:'empty',name:'つばき10/26',ts:30}];c.S.songs=c.S.shows.map(sw=>({id:'song-'+sw.id,showId:sw.id,groupId:'member-source',lines:[{t:'保持する歌詞'}]}));
 c.S.pubNotes=[{songId:'song-first',showId:'first',lineIdx:0},{songId:'song-second',showId:'second',lineIdx:0}];c.S.notes=[];c.S.memos={};
 const content=JSON.stringify(c.S);assert.equal(c.latestPerformance('member-source').id,'second');assert.equal(JSON.stringify(c.S),content);
 c.preference={showId:'empty',groupId:'member-source',showFilter:''};c.restoreViewSelection('empty',true);assert.equal(c.S.showId,'second');
 c.preference={showId:'empty',groupId:'member-source',showFilter:''};c.restoreViewSelection('second',false);assert.equal(c.S.showId,'empty','An explicitly selected no-feedback show remains available');
 c.S.pubNotes=[];assert.equal(c.latestPerformance('member-source').id,'empty','With no received feedback, use the newest performance');
});

test('same-day feedback preference never silently opens an older date or a cut-only note',()=>{
 const c=fixture();c.S.shows=[{id:'old',name:'10/25リハ',ts:100},{id:'current',name:'10/26リハ',ts:200},{id:'empty',name:'つばき10/26',ts:300}];c.S.songs=c.S.shows.map(sw=>({id:'song-'+sw.id,showId:sw.id,groupId:'member-source',lines:[{t:'保持する歌詞',...(sw.id==='current'?{cut:true}:{})}]}));
 c.S.pubNotes=[{songId:'song-old',showId:'old',lineIdx:0},{songId:'song-current',showId:'current',lineIdx:0}];c.S.notes=[];c.S.memos={};assert.equal(c.latestPerformance('member-source').id,'empty');
 c.S.memos['current|song-current']='全員への総括';assert.equal(c.latestPerformance('member-source').id,'current');
 c.S.shows.push({id:'next',name:'10/27',ts:400});c.S.songs.push({id:'song-next',showId:'next',groupId:'member-source',lines:[]});assert.equal(c.latestPerformance('member-source').id,'next');
});
