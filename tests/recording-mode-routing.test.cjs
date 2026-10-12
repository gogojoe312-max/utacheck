'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
function fixture(mode, mixed=false){
  const state={recMode:mode,showId:mode?'__rec':'rose-show',liveShow:'rose-show',groupId:'private',groups:[{id:'rose',name:'ロージークロニクル'},{id:'private',name:'配信しない',nopub:true}],shows:[{id:'rose-show',name:'リリイベ',groupId:'rose',...(mixed?{deliveryMode:'song'}:{})},{id:'__rec',name:'REC',hidden:1}],songs:[{id:'song',showId:'rose-show',groupId:'rose',lines:[]}],notes:[{id:'note',songId:'song',memo:'本人編集'}],recs:{audio:{blob:'fixture'}},rsongs:[{id:'rec-song',groupId:'private'}]};
  const writes=[];const c=vm.createContext({S:state,U:{},REC_SHOW:'__rec',VIEW:()=>false,save(){writes.push('save');},render(){},rememberViewSelection(){writes.push('selection');},showsNewestFirst:()=>state.shows});
  vm.runInContext(source.slice(source.indexOf('function autoShowGroupId('),source.indexOf('// Navigation belongs to this device')),c);
  const a=source.indexOf('case "recon":'),b=source.indexOf('case "recback":',a);
  vm.runInContext('function toggle(){switch("recon"){'+source.slice(a,b)+'}}',c);
  return {state,writes,toggle:()=>c.toggle()};
}
test('leaving REC restores the live import group without changing songs, notes, audio or sharing',()=>{
  const f=fixture(true),preserved=JSON.stringify([f.state.shows,f.state.songs,f.state.notes,f.state.recs,f.state.rsongs,f.state.groups]);
  f.toggle();assert.equal(f.state.recMode,false);assert.equal(f.state.showId,'rose-show');assert.equal(f.state.groupId,'rose');
  assert.equal(JSON.stringify([f.state.shows,f.state.songs,f.state.notes,f.state.recs,f.state.rsongs,f.state.groups]),preserved);
  assert.deepEqual(f.writes,['selection','save']);
});
test('mixed concerts retain deliberate per-song import selection without changing routing',()=>{
  const f=fixture(true,true),before=JSON.stringify(f.state.shows);f.toggle();assert.equal(f.state.groupId,'private');assert.equal(JSON.stringify(f.state.shows),before);
});
test('entering REC preserves the live performance and does not publish or rewrite its group',()=>{
  const f=fixture(false),before=JSON.stringify([f.state.shows,f.state.songs,f.state.notes,f.state.recs]);f.toggle();assert.equal(f.state.showId,'__rec');assert.equal(f.state.liveShow,'rose-show');assert.equal(f.state.recMode,true);assert.equal(JSON.stringify([f.state.shows,f.state.songs,f.state.notes,f.state.recs]),before);assert.deepEqual(f.writes,['save']);
});
