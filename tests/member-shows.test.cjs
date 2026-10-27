const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(process.env.QA_APP_SOURCE||require('node:path').join(__dirname,'..','app.js'),'utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
test('summary changes day while keeping member open and excludes other groups',()=>{
 const c=vm.createContext({rememberViewSelection(){},restoreViewSelection(){},S:{groupId:'g',showId:'today',shows:[{id:'today',name:'今日'},{id:'yesterday',name:'昨日'},{id:'other',name:'別グループ'}],songs:[{showId:'today',groupId:'g'},{showId:'yesterday',groupId:'g'},{showId:'other',groupId:'other'}]},U:{view:'summary',mode:'member',sumOpen:'member1'},VIEW:()=>true,save(){},render(){},h:x=>x});
 c.showsNewestFirst=()=>c.S.shows;
 vm.runInContext(src.slice(src.indexOf('function performanceDateOrder('),src.indexOf('function groupedPerformanceHTML(')),c);
 vm.runInContext(block('function memberPerformanceGroups(', 'function viewSummary()'),c);
 vm.runInContext("selectSummaryShow('yesterday')",c);
 assert.equal(c.S.showId,'yesterday');assert.equal(c.U.sumOpen,'member1');assert.equal(c.U.view,'summary');assert.equal(c.U.mode,'member');
 assert(!vm.runInContext('summaryShowPicker()',c).includes('別グループ'));
 vm.runInContext("selectSummaryShow('other')",c);assert.equal(c.S.showId,'yesterday');
 vm.runInContext("selectSummaryShow('')",c);assert.equal(c.U.allShows,true);assert.equal(c.U.sumOpen,'member1');
});
for(const reviewView of ['summary','absent'])test('new received notes preserve selected day and member on '+reviewView,()=>{
 let next=0;
 const c=vm.createContext({rememberViewSelection(){},restoreViewSelection(){},S:{recMode:true,rsongs:[{id:'private-rec',title:'Keep recording'}],plan:{slots:[{id:'keep-slot'}]},recs:{'private-rec':{clip:'keep'}},groups:[],groupId:'g',showId:'yesterday',srcGroup:'group',members:[{id:'m',name:'山田'}],songs:[{id:'old',showId:'yesterday'}],notes:[],shows:[]},U:{view:reviewView,mode:'member',sumOpen:'m',memberShowChosen:true},VIEW:()=>true,Date,
  member:id=>c.S.members.find(m=>m.id===id),addMember:name=>c.S.members.find(m=>m.name===name),group:()=>({id:'g'}),uid:()=>String(++next),
  buildSong:sg=>({...sg,id:String(++next),lines:[],blocks:{},roster:[]}),songSig:()=>'',save(){},render(){},NOTES:()=>c.S.pubNotes||[],showsNewestFirst:()=>c.S.shows,latestPerformance:()=>c.S.shows[0],memberCanReviewAssignments:()=>true,memberPerformanceIsToday:()=>true});
 vm.runInContext(block('function gistRawSource(', '// 入れたトークン'),c);
 vm.runInContext(block('function memberPerformanceGroups(', 'function summaryShowPicker('),c);
 vm.runInContext(block('function applySetlist(d)', 'async function syncSetlist'),c);
 c.data={version:2,groupName:'group',members:[{name:'山田'}],songs:[{showId:'today'},{showId:'yesterday'}],shows:[{id:'today'},{id:'yesterday'}],notes:[],focusShow:'today'};
 const privateRecording=JSON.stringify([c.S.rsongs,c.S.plan,c.S.recs]);
 vm.runInContext('applySetlist(data)',c);
 assert.equal(c.S.recMode,false);assert.equal(JSON.stringify([c.S.rsongs,c.S.plan,c.S.recs]),privateRecording);
 assert.equal(c.S.showId,'yesterday');assert.equal(c.U.view,reviewView);assert.equal(c.U.sumOpen,'m');
 c.data.songs=[{showId:'today'}];c.data.shows=[{id:'today'}];c.justUpdated=0;
 vm.runInContext('applySetlist(data)',c);assert.equal(c.S.showId,'today');assert.equal(c.U.view,reviewView);
});
