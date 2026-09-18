const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
test('summary changes day while keeping member open and excludes other groups',()=>{
 const c=vm.createContext({S:{groupId:'g',showId:'today',shows:[{id:'today',name:'今日'},{id:'yesterday',name:'昨日'},{id:'other',name:'別グループ'}],songs:[{showId:'today',groupId:'g'},{showId:'yesterday',groupId:'g'},{showId:'other',groupId:'other'}]},U:{view:'summary',mode:'member',sumOpen:'member1'},save(){},render(){},h:x=>x});
 c.showsNewestFirst=()=>c.S.shows;
 vm.runInContext(block('function summaryShows()', 'function viewSummary()'),c);
 vm.runInContext("selectSummaryShow('yesterday')",c);
 assert.equal(c.S.showId,'yesterday');assert.equal(c.U.sumOpen,'member1');assert.equal(c.U.view,'summary');assert.equal(c.U.mode,'member');
 assert(!vm.runInContext('summaryShowPicker()',c).includes('別グループ'));
 vm.runInContext("selectSummaryShow('other')",c);assert.equal(c.S.showId,'yesterday');
 vm.runInContext("selectSummaryShow('')",c);assert.equal(c.U.allShows,true);assert.equal(c.U.sumOpen,'member1');
});
test('new received notes preserve the selected summary day and member',()=>{
 let next=0;
 const c=vm.createContext({S:{groups:[],groupId:'g',showId:'yesterday',srcGroup:'group',members:[{id:'m',name:'山田'}],songs:[{id:'old',showId:'yesterday'}],notes:[],shows:[]},U:{view:'summary',mode:'member',sumOpen:'m'},VIEW:()=>true,Date,
  member:id=>c.S.members.find(m=>m.id===id),addMember:name=>c.S.members.find(m=>m.name===name),group:()=>({id:'g'}),uid:()=>String(++next),
  buildSong:sg=>({...sg,id:String(++next),lines:[],blocks:{},roster:[]}),songSig:()=>'',save(){},render(){},NOTES:()=>c.S.pubNotes||[],showsNewestFirst:()=>c.S.shows});
 vm.runInContext(block('function applySetlist(d)', 'async function syncSetlist'),c);
 c.data={version:2,groupName:'group',members:[{name:'山田'}],songs:[{showId:'today'},{showId:'yesterday'}],shows:[{id:'today'},{id:'yesterday'}],notes:[],focusShow:'today'};
 vm.runInContext('applySetlist(data)',c);
 assert.equal(c.S.showId,'yesterday');assert.equal(c.U.view,'summary');assert.equal(c.U.sumOpen,'m');
 c.data.songs=[{showId:'today'}];c.data.shows=[{id:'today'}];c.justUpdated=0;
 vm.runInContext('applySetlist(data)',c);assert.equal(c.S.showId,'today');assert.equal(c.U.view,'summary');
});
