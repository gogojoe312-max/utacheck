const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const recovery=fs.readFileSync(path.join(__dirname,'../show-recovery.js'),'utf8');
const block=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
function fixture(){
 const c=vm.createContext({document:{addEventListener(){}},JSON,Map,Set});vm.runInContext(recovery,c);
 const old={shows:[{id:'release',name:'リリイベ',folder:'ロージー',groupId:'g',absent:['m']}],
   groups:[{id:'g',name:'ロージークロニクル',gistId:'old-private',key:'DO_NOT_COPY'}],members:[{id:'m',name:'橋田'}],
   songs:[{id:'same',title:'本気ボンバー',showId:'release',groupId:'g',roster:['m'],blocks:{A:['m']},lines:[{t:'歌詞',parts:['m'],main:['m'],extra:[]}]}],
   notes:[{id:'n',showId:'release',songId:'same',memberIds:['m'],memo:'当日の指摘'}],memos:{'release|same':'総括'},staffMemos:{'release|same':'スタッフだけ'},
   subs:{'release|same':{0:['m']}},gsubs:{'release|same':{A:['m']}},draws:{'release|same':[{p:[1,2]}]},ghToken:'DO_NOT_COPY',bkKey:'DO_NOT_COPY'};
 const current={shows:[{id:'now',name:'リハ9/26',groupId:'g'}],groups:[{id:'g',name:'OCHA NORMA',gistId:'keep-gist'}],members:[{id:'m',name:'斉藤'}],
   songs:[{id:'same',showId:'now',title:'現在の曲',lines:[]}],notes:[{id:'n',showId:'now',songId:'same',memo:'新しい指摘'}],memos:{'now|same':'新しい総括'},
   ghToken:'KEEP_TOKEN',bkKey:'KEEP_PASS',bkGistId:'keep-backup',staffMemos:{'now|same':'最新のスタッフメモ'},folders:{},folderOrder:[]};
 let n=0;c.makeId=()=> 'new'+ ++n;c.current=current;c.old=old;
 return {c,current,old,run:s=>vm.runInContext(s,c)};
}
test('search covers all saved groups and folders, independent of the selected filter',()=>{
 const {run}=fixture();assert.equal(run("ShowRecovery.find(old,' リリイベ ').length"),1);assert.equal(run("ShowRecovery.find(old,'ロージー').length"),1);assert.equal(run("ShowRecovery.find(old,'missing').length"),0);
});
test('a one-show snapshot excludes credentials and every unrelated performance',()=>{
 const {old,run}=fixture();old.shows.push({id:'other',name:'別公演'});old.songs.push({id:'other-song',showId:'other'});old.notes.push({id:'other-note',showId:'other',songId:'other-song'});
 old.staffMemos['other|other-song']='OTHER_PRIVATE';
 const snap=run("ShowRecovery.snapshot(old,'release')");assert.equal(snap.shows.length,1);assert.equal(snap.songs.length,1);assert.equal(snap.notes.length,1);
 assert(!JSON.stringify(snap).includes('DO_NOT_COPY'));assert(!JSON.stringify(snap).includes('OTHER_PRIVATE'));assert.equal(snap.staffMemos['release|same'],'スタッフだけ');
});
test('partial restoration preserves current work and connections while remapping colliding IDs and keeping delivery off',()=>{
 const {current,old,run}=fixture();const before=JSON.stringify(current),previous=JSON.stringify(old);
 const next=run("ShowRecovery.restore(current,old,'release',makeId)");assert.equal(JSON.stringify(current),before);assert.equal(JSON.stringify(old),previous);
 assert.equal(next.ghToken,'KEEP_TOKEN');assert.equal(next.bkKey,'KEEP_PASS');assert.equal(next.bkGistId,'keep-backup');assert.equal(next.groups[0].gistId,'keep-gist');
 assert.equal(next.shows.length,2);assert.equal(next.shows[1].nopub,true);assert.equal(next.notes[0].memo,'新しい指摘');
 const restored=next.songs[1],person=next.members.find(x=>x.name==='橋田'),group=next.groups.find(x=>x.name==='ロージークロニクル');
 assert.notEqual(restored.id,'same');assert.notEqual(person.id,'m');assert.notEqual(group.id,'g');assert.equal(restored.groupId,group.id);assert.equal(next.shows[1].groupId,group.id);
 assert.equal(restored.lines[0].parts[0],person.id);assert.equal(restored.blocks.A[0],person.id);assert.equal(next.notes[1].songId,restored.id);assert.equal(next.notes[1].memberIds[0],person.id);
 assert.equal(next.subs['release|'+restored.id][0][0],person.id);assert.equal(next.gsubs['release|'+restored.id].A[0],person.id);
 assert.equal(next.staffMemos['release|'+restored.id],'スタッフだけ');assert.equal(next.memos['now|same'],'新しい総括');assert.equal(next.folders.ロージー,true);
});
test('duplicate restoration and broken member references cannot mutate existing work',()=>{
 const {current,old,run}=fixture();current.shows.push({id:'release'});let before=JSON.stringify(current);
 assert.throws(()=>run("ShowRecovery.restore(current,old,'release',makeId)"),/すでにあります/);assert.equal(JSON.stringify(current),before);
 current.shows.pop();old.members=[];before=JSON.stringify(current);assert.throws(()=>run("ShowRecovery.restore(current,old,'release',makeId)"),/担当メンバー/);assert.equal(JSON.stringify(current),before);
});
test('editor receive paths do not fetch or replace saved performances with member publications',async()=>{
 let fetches=0;const c=vm.createContext({VIEW:()=>false,S:{shows:[{id:'release',name:'リリイベ'}],songs:[{id:'song',showId:'release'}]},fetchSetlist:async()=>{fetches++;return {songs:[]};}});
 vm.runInContext(block('function applySetlist(d)','/* ---- 共有リンク'),c);const before=JSON.stringify(c.S);
 await vm.runInContext('syncSetlist(false)',c);vm.runInContext('applySetlist({shows:[],songs:[]})',c);
 assert.equal(fetches,0);assert.equal(JSON.stringify(c.S),before);
});
test('automatic cross-device sync cannot remove a saved show even when the local backup is clean',async()=>{
 const c=vm.createContext({syncing:false,backupInFlight:false,preview:null,otherAt:0,U:{},S:{ghToken:'token',bkGistId:'backup',bkSeen:1,bkHash:'clean',shows:[{id:'release',name:'リリイベ'}],songs:[]},
   gh:async()=>({files:{}}),backupIndexFile:()=>true,readCloudBackup:async()=>({}),unpackBackup:async()=>({at:2,state:{shows:[],songs:[]}}),bkSignature:()=> 'clean',render(){},save(){throw Error('must not overwrite');}});
 vm.runInContext(block('async function checkOther()', 'async function takeOther()'),c);const before=JSON.stringify(c.S);
 await vm.runInContext('checkOther()',c);assert.equal(JSON.stringify(c.S),before);assert.equal(c.otherAt,2);
});
