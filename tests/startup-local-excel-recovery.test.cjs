'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const API=require('../startup-local-excel-recovery.js');
const clone=value=>JSON.parse(JSON.stringify(value)),NOW=1791350000000;
const defaults=()=>({deviceId:'PRIVATE_DEVICE',members:[],groups:[],shows:[],songs:[],rsongs:[],notes:[],pubNotes:[],trash:[],
  memos:{},staffMemos:{},draws:{},recs:{},subs:{},subsMan:{},subLib:{},gsubs:{},rosters:{},plan:{slots:[]},viewer:false,recMode:false});
const record=(extra={},seq=10,ordinal=0)=>({state:{...defaults(),...extra},seq,ordinal});
const entry=(id='OLD_SONG',index=0,extra={})=>({key:'xls:'+id,index,bytes:123,digest:'a'.repeat(64),parsed:{title:'PRIVATE_TITLE',credit:'PRIVATE_CREDIT',
  groups:{A:['PRIVATE_MEMBER']},order:['PRIVATE_MEMBER'],lines:[['A','PRIVATE_LYRIC','A3','C3'],['→','PRIVATE_NEXT','A4','C4']],
  sheetName:'歌割',groupCells:{A:'C9'},groupRows:[{b:'A',ncell:'A9',lcell:'C9'}],micSheet:'マイク',micMap:{PRIVATE_MEMBER:'1'}},...extra});
const app=fs.readFileSync(__dirname+'/../app.js','utf8');
function block(a,b){const start=app.indexOf(a),end=app.indexOf(b,start);assert(start>=0&&end>start,a);return app.slice(start,end);}
function fn(name){const i=app.indexOf('function '+name+'(');assert(i>=0,name);return app.slice(app.lastIndexOf('\n',i)+1,app.indexOf('\n}',i)+2);}
function actual(){
  let touches=0;const forbidden=()=>{touches++;throw Error('PRIVATE_GLOBAL_TOUCH');};
  const deny=new Proxy({},{get:forbidden,set:forbidden});
  const context=vm.createContext({S:deny,U:deny,addMember:forbidden,uid:forbidden});
  vm.runInContext(app.match(/^const hash32 = .*$/m)[0],context);
  vm.runInContext(block('function songSig(so) {','const sigOf'),context);
  vm.runInContext(block('const NAMESEP =','const cleanName'),context);
  vm.runInContext(block('function buildSong(parsed, local) {','// 拡張子が二重'),context);
  vm.runInContext(fn('startupStateObject')+'\n'+fn('validateStartupState'),context);
  return {buildSong:context.buildSong,validateState:context.validateStartupState,touches:()=>touches};
}
function run(records=[record()],entries=[entry()],extra={}){return API.build(records,defaults(),entries,{...actual(),now:NOW,...extra});}
function safe(result){assert(!JSON.stringify(result.summary).includes('PRIVATE'));if(result.status!=='ready')assert.equal(result.packet,undefined);}
test('actual builder recovers exact original IDs and source workbook metadata without global mutation',()=>{
  const a=actual(),records=[record({viewer:true,recMode:true})],entries=[entry()],before=JSON.stringify({records,entries});
  const answer=run(records,entries,a);assert.equal(answer.status,'ready');const state=answer.packet.state,song=state.songs[0];
  assert.equal(song.id,'OLD_SONG');assert.equal(song.xls,1);assert.equal(song.xlsSourceId,undefined);assert.equal(song.from,undefined);
  assert.equal(song.sheetName,'歌割');assert.equal(song.micSheet,'マイク');assert.deepEqual(song.micMap,{PRIVATE_MEMBER:'1'});
  assert.equal(song.lines[0].cell,'A3');assert.equal(song.lines[0].lcell,'C3');assert.equal(song.lines[1].cont,true);
  assert.deepEqual(song.lines[0].parts,[state.members[0].id]);assert.equal(a.touches(),0);
  assert.equal(state.viewer,false);assert.equal(state.recMode,false);assert.equal(state.showId,song.showId);assert.equal(state.groupId,song.groupId);
  assert.equal(state.shows.find(show=>show.id===state.showId).nopub,true);assert.equal(state.groups.find(group=>group.id===state.groupId).nopub,true);
  assert.equal(answer.packet.sourceKind,'local-excel');assert.equal(answer.packet.sourceDateUnknown,true);assert.equal(answer.packet.at,NOW);
  assert.equal(JSON.stringify({records,entries}),before);safe(answer);
});
test('124 parsed workbooks remain 124 distinct original IDs even with identical titles and lyrics',()=>{
  const entries=Array.from({length:124},(_,i)=>entry('old'+i,i)).reverse(),answer=run(undefined,entries);
  assert.equal(answer.status,'ready');assert.equal(answer.summary.counts.songs,124);assert.equal(new Set(answer.packet.state.songs.map(s=>s.id)).size,124);
  assert.deepEqual(answer.packet.state.songs.map(s=>s.id),Array.from({length:124},(_,i)=>'old'+i));assert.equal(answer.packet.state.notes.length,0);safe(answer);
});
test('existing two shows and unknown settings survive while a separate recovery show is selected',()=>{
  const extra={shows:[{id:'SHOW1',name:'PRIVATE_SHOW1',hidden:true},{id:'SHOW2',name:'PRIVATE_SHOW2',absent:['PRIVATE_MEMBER']}],showId:'SHOW1',
    groups:[{id:'GROUP',name:'PRIVATE_GROUP',key:'PRIVATE_KEY'}],groupId:'GROUP',unknown:{nested:{private:'PRIVATE_UNKNOWN'}},
    ghToken:'PRIVATE_TOKEN',bkKey:'PRIVATE_BACKUP_KEY',subs:{'SHOW1|OLD_SONG':{0:['OLD_MEMBER']}},subLib:{OLD_SONG:{value:'PRIVATE_SUB'}}};
  const original=record(extra),before=JSON.stringify(original),answer=run([original]);assert.equal(answer.status,'ready');
  const state=answer.packet.state;assert.deepEqual(state.shows.slice(0,2),extra.shows);assert.equal(state.shows.length,3);
  assert.notEqual(state.showId,'SHOW1');assert.notEqual(state.showId,'SHOW2');assert.deepEqual(state.groups[0],extra.groups[0]);
  for(const field of ['unknown','ghToken','bkKey','subs','subLib'])assert.deepEqual(state[field],extra[field]);
  assert.equal(JSON.stringify(original),before);safe(answer);
});
test('highest sequence is used, equal-sequence differing settings stop and object ordering alone does not conflict',()=>{
  let answer=run([record({unknown:'older'},1,0),record({unknown:'newer'},2,1)]);assert.equal(answer.packet.state.unknown,'newer');
  answer=run([record({unknown:'a'},2,0),record({unknown:'b'},2,1)]);assert.equal(answer.status,'base-conflict');safe(answer);
  const a=record(),b=clone(a);b.ordinal=1;b.state=Object.fromEntries(Object.entries(b.state).reverse());assert.equal(run([a,b]).status,'ready');
});
test('any nonempty original, including an older generation, blocks reconstruction',()=>{
  for(const work of [{songs:[{id:'s',lines:[]}]},{rsongs:[{id:'r',lines:[]}]},{notes:[{id:'n'}]},{pubNotes:[{id:'p'}]},
    {trash:[{id:'t'}]},{memos:{k:'PRIVATE'}},{staffMemos:{k:'PRIVATE'}},{draws:{k:[]}},{recs:{k:{}}},{plan:{slots:[{}]}}]){
    const answer=run([record(work,1,0),record({},2,1)]);assert.equal(answer.status,'original-nonempty');safe(answer);
  }
});
test('different original device IDs stop without leaking identifiers',()=>{
  const answer=run([record({deviceId:'PRIVATE_OTHER'},1),record({},2,1)]);assert.equal(answer.status,'identity-conflict');safe(answer);
});
test('source key identity rejects non-xls, empty, pipe, dangerous and duplicate suffixes',()=>{
  for(const key of ['other:OLD_SONG','xls:','xls:bad|id','xls:__proto__','xls:constructor','xls:bad\n']){
    const answer=run(undefined,[entry('x',0,{key})]);assert.equal(answer.status,'source-identity-conflict');safe(answer);
  }
  const answer=run(undefined,[entry(),entry()]);assert.equal(answer.status,'source-identity-conflict');safe(answer);
});
test('original song ID collision with a different existing object stops instead of reallocating it',()=>{
  for(const extra of [{shows:[{id:'OLD_SONG'}]},{groups:[{id:'OLD_SONG',name:'g'}]},{members:[{id:'OLD_SONG',name:'m'}]}]){
    const answer=run([record(extra)]);assert.equal(answer.status,'source-identity-conflict');safe(answer);
  }
});
test('new generated identities avoid orphan dictionary components and retained lists',()=>{
  const extra={shows:[{id:'local-workbook-show'}],groups:[{id:'local-workbook-group',name:'old'}],
    subs:{'PRIVATE_OLD_SHOW|local-workbook-member-0':{0:[]}}};
  const answer=run([record(extra)]);assert.equal(answer.status,'ready');const state=answer.packet.state;
  assert.equal(state.showId,'local-workbook-show-1');assert.equal(state.groupId,'local-workbook-group-1');assert.equal(state.members[0].id,'local-workbook-member-0-1');
  assert.deepEqual(state.subs,extra.subs);safe(answer);
});
test('a recovery group name cannot inherit an unrelated existing name-keyed roster',()=>{
  const name='元Excelから復旧した資料',extra={groups:[{id:'PRIVATE_OLD_GROUP',name}],rosters:{[name]:['PRIVATE_OLD_MEMBER'],[name+' (2)']:['PRIVATE_ANOTHER']}};
  const answer=run([record(extra)]);assert.equal(answer.status,'ready');const state=answer.packet.state;
  assert.equal(state.groups.at(-1).name,name+' (3)');assert.equal(state.shows.at(-1).name,name+' (3)');
  assert.equal(state.rosters[state.groups.at(-1).name],undefined);assert.deepEqual(state.rosters,extra.rosters);safe(answer);
});
test('member names reuse an unambiguous existing identity while conflicting names stop',()=>{
  let answer=run([record({members:[{id:'EXISTING',name:'PRIVATE_MEMBER'}]})]);assert.equal(answer.status,'ready');assert.equal(answer.packet.state.members.length,1);
  assert.deepEqual(answer.packet.state.songs[0].lines[0].parts,['EXISTING']);
  for(const members of [[{id:'A',name:'same'},{id:'B',name:'same'}],[{id:'A',name:'one'},{id:'A',name:'two'}]]){
    answer=run([record({members})]);assert.equal(answer.status,'member-conflict');safe(answer);
  }
});
test('malformed parsed bodies, blank title and empty lyrics cannot become usable songs',()=>{
  for(const parsed of [null,{}, {title:'x',lines:[]},{title:'x',lines:[['A','   ']]},{title:'',lines:[['A','lyric']]},
    {title:'x',lines:[['A',42]]},{title:'x',lines:[['A','lyric',{}]]}]){
    const answer=run(undefined,[entry('x',0,{parsed})]);assert.notEqual(answer.status,'ready');safe(answer);
  }
});
test('unsafe JSON, invalid record shape and missing build contract fail closed',()=>{
  const poison=JSON.parse('{"__proto__":{"PRIVATE":"bad"}}');
  for(const records of [[],[{}],[record({},-1)],[record({unknown:poison})],[record({songs:{}})]]){
    const answer=run(records);assert.notEqual(answer.status,'ready');safe(answer);
  }
  for(const extra of [{now:0},{buildSong:null},{validateState:null},{buildSong:()=>({lines:[]})},{buildSong:()=>{throw Error('PRIVATE');}}]){
    const answer=run(undefined,undefined,extra);assert.notEqual(answer.status,'ready');safe(answer);
  }
  assert.equal({}.PRIVATE,undefined);
});
test('caps oversized final state and does not expose private error strings',()=>{
  const answer=run([record({unknown:'x'.repeat(21*1024*1024)})]);assert.equal(answer.status,'candidate-too-large');safe(answer);
});
test('module has no network, storage, shared state or DOM access under browser entry',()=>{
  let calls=0;const deny=new Proxy({},{get(){calls++;throw Error('PRIVATE_FORBIDDEN');}});
  const context=vm.createContext({TextEncoder,fetch:deny,localStorage:deny,indexedDB:deny,document:deny,S:deny,U:deny});
  vm.runInContext(fs.readFileSync(__dirname+'/../startup-local-excel-recovery.js','utf8'),context);
  const answer=context.StartupLocalExcelRecovery.build([record()],defaults(),[entry()],{...actual(),now:NOW});
  assert.equal(answer.status,'ready');assert.equal(calls,0);safe(answer);
});
