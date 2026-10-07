'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const API=require('../startup-recovered-show-addition.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const source=()=>({kind:'gist-publication',at:1791111111111,revision:'b'.repeat(40),sha256:'a'.repeat(64)});
function current(){return {
  members:[{id:'KEEP_MEMBER',name:'同じ名前',unknown:{value:'keep'}}],groups:[{id:'KEEP_GROUP',name:'既存',gistId:'KEEP_GIST',key:'KEEP_KEY',src:'KEEP_SOURCE'}],
  shows:[{id:'KEEP_SHOW',name:'既存公演',groupId:'KEEP_GROUP',absent:['KEEP_MEMBER']}],
  songs:[{id:'KEEP_SONG',showId:'KEEP_SHOW',groupId:'KEEP_GROUP',title:'同じ曲',lines:[{t:'😀あいう',parts:['KEEP_MEMBER']}],xls:1,xlsSourceId:'ORIGINAL_EXCEL'}],
  notes:[{id:'KEEP_NOTE',songId:'KEEP_SONG',showId:'KEEP_SHOW',lineIdx:0,memberIds:['KEEP_MEMBER'],tags:['pitch'],memo:'後で追加した指摘'}],
  pubNotes:[{id:'KEEP_PUB_NOTE',songId:'KEEP_SONG',showId:'KEEP_SHOW',memberIds:[],tags:[]}],
  rsongs:[{id:'REC_SONG',showId:'rec',groupId:'REC_GROUP',roster:['REC_MEMBER'],title:'REC曲',lines:[{t:'REC歌詞',parts:['REC_MEMBER']}]}],
  recs:{'rec|REC_SONG|take':{key:'KEEP_AUDIO',at:0}},memos:{'KEEP_SHOW|KEEP_SONG':'本人メモ'},subs:{'KEEP_SHOW|KEEP_SONG':{0:['KEEP_MEMBER']}},
  subsMan:{'KEEP_SHOW|KEEP_SONG':{0:1}},gsubs:{'KEEP_SHOW|KEEP_SONG':{A:['KEEP_MEMBER']}},
  staffMemos:{'KEEP_SHOW|KEEP_SONG':'非配信メモ'},draws:{'KEEP_SHOW|KEEP_SONG':[{x:0,y:0}]},subLib:{KEEP:{from:'keep',to:[]}},
  rosters:{'既存':['同じ名前']},seen:{'KEEP_SHOW|KEEP_SONG':'KEEP_SIGNATURE'},folders:{'既存フォルダ':true},folderOrder:['既存フォルダ'],groupOrder:['既存'],
  plan:{start:'10:00',slots:[{id:'SLOT',songId:'REC_SONG',at:0,unknown:'本人メモ'}]},trash:[{id:'TRASH',songs:[{id:'TRASH_SONG'}]}],
  recMode:true,rsongId:'REC_SONG',showId:'KEEP_SHOW',groupId:'KEEP_GROUP',viewer:false,ghToken:'KEEP_TOKEN',bkKey:'KEEP_PASSPHRASE',
  unknown:{nested:{array:[0,false,null,'本人の未知設定']}},recoveredShowSources:{['c'.repeat(64)]:{source:{kind:'other'},unknown:'keep'}}
};}
function packet(){return {app:'utacheck-recovered-shows-addition',version:1,source:source(),originalText:'{"synthetic":true}',state:{
  members:[{id:'M',name:'同じ名前'},{id:'M2',name:'別の人'}],groups:[{id:'G',name:'復旧対象'}],
  shows:[{id:'H',name:'初回',groupId:'G',absent:['M'],ts:0},{id:'H2',name:'次回',groupId:'G',from:'H',absent:[],ts:1}],
  songs:[{id:'T',showId:'H',groupId:'G',title:'同じ曲',credit:'元クレジット',roster:['M','M2'],blocks:{A:['M'],B:['M2']},
    lines:[{t:'😀あいう',label:'A',parts:['M','M2'],main:['M'],extra:['M2'],cell:'A1',lcell:'C1'}]},
    {id:'T2',showId:'H2',groupId:'G',deliveryGroupId:'G',from:'T',title:'同じ曲',roster:['M'],blocks:{A:['M']},lines:[{t:'😀あいう',parts:['M']}]}],
  notes:[{id:'N',songId:'T',showId:'H',memberIds:['M'],tags:['pitch'],memo:'原文',pitch:'up',hand:{text:'手書き原文',paths:[{x:0,y:0}]},
    lineIdx:0,lineEnd:0,from:0,to:1,at:0,ts:0}],memos:{'H|T':'総括原文'},subs:{'H|T':{0:['M2']}},subsMan:{'H|T':{0:1}},gsubs:{'H|T':{A:['M2']}},
  seen:{'H|T':'元signature'},rosters:{'復旧対象':['同じ名前','別の人']},folderOrder:['復旧フォルダ'],groupOrder:['復旧対象'],showId:'H2',groupId:'G'
}};}
const fails=(code,fn)=>assert.throws(fn,error=>error?.recoveryCode===code&&error.message===code);
function assertPreserved(before,after){
  for(const [field,value] of Object.entries(before)){
    if(Array.isArray(value))assert.deepEqual(after[field].slice(0,value.length),value,field);
    else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))assert.deepEqual(after[field][key],item,field+'.'+key);
    else assert.deepEqual(after[field],value,field);
  }
}
test('append-only merge preserves all current work, credentials, REC, plan, unknown fields and selection',()=>{
  const old=current(),p=packet(),before=clone(old),packetBefore=clone(p),calls=[];
  const result=API.merge(old,p,{validateState:state=>{calls.push(clone(state));state.ghToken='validator mutation';}});
  assertPreserved(before,result.state);assert.deepEqual(old,before);assert.deepEqual(p,packetBefore);
  assert.equal(calls.length,1);assert.equal(result.state.ghToken,'KEEP_TOKEN');
  assert.equal(result.state.songs.length,3);assert.equal(result.state.members.length,3);
  assert.deepEqual(result.counts,{members:2,groups:1,shows:2,songs:2,notes:1,pubNotes:0,memos:1,subs:1,subsMan:1,gsubs:1,seen:1,rosters:1,folderOrder:1,groupOrder:1});
  assert(!JSON.stringify(result.counts).includes('KEEP'));assert.equal(result.focusShowId,'H2');assert.equal(result.focusGroupId,'G');
  assert.equal(result.state.shows.at(-1).nopub,true);assert.equal(result.state.groups.at(-1).nopub,true);
  assert.equal(result.state.originalText,undefined);assert.equal(result.state.songs.at(-2).xlsSourceId,undefined);
  assert.equal(result.state.members[1].name,'同じ名前');assert.notEqual(result.state.members[1].id,result.state.members[0].id);
});
test('collision reallocates only candidate IDs and maps every typed reference without name/lyric merging',()=>{
  const old=current(),p=packet();
  old.members.push({id:'M',name:'旧メンバー'});old.groups.push({id:'G',name:'別グループ'});
  old.shows.push({id:'H',name:'旧初回'});old.shows.push({id:'H2',name:'旧次回'});
  old.songs.push({id:'T',title:'旧曲',showId:'H',lines:[]});old.songs.push({id:'T2',title:'旧別曲',showId:'H2',lines:[]});
  p.state.groups[0].roster=['M','M2'];p.state.members[0].groupId='G';
  old.notes.push({id:'N',memo:'旧指摘'});const before=clone(old),result=API.merge(old,p),state=result.state;
  assertPreserved(before,state);const [h,h2]=state.shows.slice(-2),[t,t2]=state.songs.slice(-2),n=state.notes.at(-1),m=state.members.at(-2),m2=state.members.at(-1),g=state.groups.at(-1);
  for(const id of [h.id,h2.id,t.id,t2.id,n.id,m.id,g.id])assert(!['H','H2','T','T2','N','M','G'].includes(id));
  assert.equal(m2.id,'M2');assert.equal(h.recoveredSourceShowId,'H');assert.equal(h2.from,h.id);assert.equal(t2.from,t.id);
  assert.deepEqual(g.roster,[m.id,m2.id]);assert.equal(m.groupId,g.id);
  assert.equal(h.groupId,g.id);assert.deepEqual(h.absent,[m.id]);assert.equal(t.groupId,g.id);assert.equal(t.showId,h.id);assert.equal(t2.deliveryGroupId,g.id);
  assert.deepEqual(t.roster,[m.id,m2.id]);assert.deepEqual(t.blocks,{A:[m.id],B:[m2.id]});assert.deepEqual(t.lines[0].parts,[m.id,m2.id]);
  assert.deepEqual(t.lines[0].main,[m.id]);assert.deepEqual(t.lines[0].extra,[m2.id]);assert.equal(n.songId,t.id);assert.equal(n.showId,h.id);assert.deepEqual(n.memberIds,[m.id]);
  const key=h.id+'|'+t.id;assert.equal(state.memos[key],'総括原文');assert.deepEqual(state.subs[key],{0:[m2.id]});assert.deepEqual(state.gsubs[key],{A:[m2.id]});
  assert.deepEqual(state.subsMan[key],{0:1});assert.equal(state.seen[key],'元signature');assert.equal(result.focusShowId,h2.id);assert.equal(result.focusGroupId,g.id);
});
test('same show ID with same name is still appended as an independent unpublished show',()=>{
  const old=current(),p=packet();old.shows.push(clone(p.state.shows[0]));const result=API.merge(old,p);
  const recovered=result.state.shows.at(-2);assert.equal(recovered.name,'初回');assert.notEqual(recovered.id,'H');assert.equal(recovered.nopub,true);
  assert.deepEqual(result.state.shows[1],p.state.shows[0]);
});
test('group/roster name collisions rename only new group and its name-keyed references',()=>{
  const old=current(),p=packet();old.groups.push({id:'OTHER_GROUP',name:'復旧対象'});
  old.rosters['復旧対象（配信履歴）']=['旧人'];old.groupOrder.push('復旧対象（配信履歴2）');
  const result=API.merge(old,p),name=result.state.groups.at(-1).name;
  assert.equal(name,'復旧対象（配信履歴3）');assert.deepEqual(result.state.rosters[name],p.state.rosters['復旧対象']);
  assert.equal(result.state.groupOrder.at(-1),name);assert.equal(result.state.groups[1].name,'復旧対象');assert.deepEqual(result.state.rosters['復旧対象（配信履歴）'],['旧人']);
});
test('zero timestamps, Unicode character ranges, original line positions and legacy hand stay exact',()=>{
  const p=packet(),result=API.merge(current(),p),note=result.state.notes.at(-1),song=result.state.songs.at(-2);
  for(const key of ['memo','pitch','hand','lineIdx','lineEnd','from','to','at','ts'])assert.deepEqual(note[key],p.state.notes[0][key],key);
  assert.equal(Array.from(song.lines[0].t).slice(note.from,note.to+1).join(''),'😀あ');assert.equal(song.lines[0].cell,'A1');assert.equal(song.lines[0].lcell,'C1');
});
test('same source receipt stops a second addition and conflicting receipts never get overwritten',()=>{
  const first=API.merge(current(),packet()),before=clone(first.state);
  fails('source-already-added',()=>API.merge(first.state,packet()));assert.deepEqual(first.state,before);
  const old=current();old.recoveredShowSources[source().sha256]={source:{...source(),at:1},unknown:'keep'};
  fails('source-receipt-conflict',()=>API.merge(old,packet()));assert.equal(old.recoveredShowSources[source().sha256].unknown,'keep');
});
test('public-note copies remain distinct, appended records with correctly mapped references',()=>{
  const old=current(),p=packet();p.state.pubNotes=[clone(p.state.notes[0])];const before=clone(old),result=API.merge(old,p);
  assertPreserved(before,result.state);const note=result.state.notes.at(-1),publicNote=result.state.pubNotes.at(-1);
  assert.notEqual(publicNote.id,note.id);for(const key of Object.keys(note))if(key!=='id')assert.deepEqual(publicNote[key],note[key]);
  assert.equal(result.counts.notes,1);assert.equal(result.counts.pubNotes,1);
});
test('current orphan references, dictionaries, REC and trash IDs reserve candidate identities',()=>{
  const old=current(),p=packet();old.memos['H|T']='orphan memo';old.unknown.parent={from:'T2'};old.plan.slots.push({id:'M'});
  const result=API.merge(old,p);assert.equal(result.state.memos['H|T'],'orphan memo');
  assert.notEqual(result.state.shows.at(-2).id,'H');assert.notEqual(result.state.songs.at(-2).id,'T');assert.notEqual(result.state.songs.at(-1).id,'T2');assert.notEqual(result.state.members.at(-2).id,'M');
});
test('generated IDs cannot capture a later candidate original ID',()=>{
  const old=current(),p=packet(),generated='recovered-'+source().sha256.slice(0,12)+'-members-0';
  old.members.push({id:'M',name:'旧人'});p.state.members[1].id=generated;
  const change=list=>list.map(id=>id==='M2'?generated:id);
  for(const song of p.state.songs){song.roster=change(song.roster);for(const key of Object.keys(song.blocks))song.blocks[key]=change(song.blocks[key]);for(const line of song.lines)for(const key of ['parts','main','extra'])if(line[key])line[key]=change(line[key]);}
  p.state.subs['H|T'][0]=[generated];p.state.gsubs['H|T'].A=[generated];
  const result=API.merge(old,p);assert.equal(result.state.members.at(-1).id,generated);assert.notEqual(result.state.members.at(-2).id,generated);
});
test('candidate secrets and non-public top-level fields are rejected, including empty values',()=>{
  for(const field of ['creds','src','gist','key','ghToken','rsongs','recs','plan','trash','staffMemos','draws','subLib','unknown']){
    const p=packet();p.state[field]={};assert.throws(()=>API.merge(current(),p),error=>['candidate-private-field','candidate-invalid'].includes(error.recoveryCode));
  }
  for(const field of ['src','gistId','key','lastKey']){
    const p=packet();p.state.groups[0][field]='';fails('candidate-private-field',()=>API.merge(current(),p));
  }
  for(const field of ['members','groups','shows','songs','notes']){
    const p=packet();p.state[field][0].unrecognized={hiddenProductionData:true};fails('candidate-invalid',()=>API.merge(current(),p));
  }
  const p=packet();p.state.songs[0].lines[0].unrecognized=true;fails('candidate-invalid',()=>API.merge(current(),p));
});
test('unsafe keys are rejected before any prototype or accessor can alter the result',()=>{
  for(const key of ['__proto__','constructor','prototype']){
    const p=packet();p.state.notes[0].hand=JSON.parse('{"'+key+'":{"polluted":true}}');fails('unsafe-key',()=>API.merge(current(),p));
  }
  let touched=0;const old=current();Object.defineProperty(old,'accessor',{enumerable:true,get(){touched++;return 'unsafe';}});
  fails('candidate-invalid',()=>API.merge(old,packet()));assert.equal(touched,0);assert.equal({}.polluted,undefined);
});
test('duplicate identities and missing typed references fail without mutating current or packet',()=>{
  const edits=[p=>p.state.members.push(clone(p.state.members[0])),p=>p.state.shows.push(clone(p.state.shows[0])),
    p=>p.state.songs[1].from='NOT_IN_PACKET',p=>p.state.shows[1].from='NOT_IN_PACKET',p=>p.state.notes[0].memberIds=['NOT_IN_PACKET'],
    p=>p.state.songs[0].showId='KEEP_SHOW',p=>p.state.songs[0].lines[0].main=['KEEP_MEMBER'],p=>p.state.subs['H|T'][0]=['KEEP_MEMBER'],
    p=>p.state.memos['H|NOT_IN_PACKET']='bad',p=>p.state.rosters.other=[],p=>p.state.groupOrder.push('not a group')];
  for(const edit of edits){const old=current(),p=packet();edit(p);const a=clone(old),b=clone(p);assert.throws(()=>API.merge(old,p));assert.deepEqual(old,a);assert.deepEqual(p,b);}
});
test('packet shape, source metadata, unsafe IDs and non-JSON current values fail closed',()=>{
  const edits=[p=>p.app='utacheck',p=>p.version=2,p=>p.extra=true,p=>p.source.kind='backup',p=>p.source.at=0,p=>p.source.at=1.2,
    p=>p.source.revision='b'.repeat(39),p=>p.source.sha256='a'.repeat(63),p=>p.source.extra=true,p=>p.state.members[0].id='bad|id',
    p=>p.state.shows=[],p=>p.state.songs={},p=>p.state.songs[0].L=0,p=>p.state.songs[0].xlsSourceId='EXCEL'];
  for(const edit of edits){const p=packet();edit(p);assert.throws(()=>API.merge(current(),p));}
  const old=current();old.unknown.created=new Date(0);fails('candidate-invalid',()=>API.merge(old,packet()));
});
test('a validator failure is private, has no mutation and never produces a candidate state',()=>{
  const old=current(),before=clone(old);fails('state-invalid',()=>API.merge(old,packet(),{validateState(){throw Error('PRIVATE_CAUSE');}}));assert.deepEqual(old,before);
  fails('state-invalid',()=>API.merge(old,packet(),{validateState:()=>false}));
});
test('20 MiB cap covers input packet and final appended state',()=>{
  const p=packet();p.originalText='x'.repeat(API.MAX_BYTES);fails('candidate-too-large',()=>API.merge(current(),p));
  const old=current();old.unknown.padding='x'.repeat(API.MAX_BYTES-16000);const small=packet();small.state.notes[0].memo='y'.repeat(20000);
  fails('candidate-too-large',()=>API.merge(old,small));
});
test('packed publication lyrics become independent fresh lines while existing packed lyrics stay exact',()=>{
  const old=current(),p=packet(),before=clone(old),originalLines=clone(p.state.songs[0].lines);
  old.songLib=[[{t:'現在の共有歌詞',parts:['KEEP_MEMBER']}]];delete old.songs[0].lines;old.songs[0].L=0;
  p.state.songLib=[originalLines];for(const song of p.state.songs){delete song.lines;song.L=0;}
  const packedBefore=clone(p),result=API.merge(old,p),[a,b]=result.state.songs.slice(-2);
  assert.deepEqual(result.state.songLib,old.songLib);assert.equal(result.state.songs[0].L,0);assert.equal(result.state.songs[0].lines,undefined);
  assert.deepEqual(a.lines,originalLines);assert.deepEqual(b.lines,originalLines);assert.notEqual(a.lines,b.lines);assert.equal(a.L,undefined);assert.equal(b.L,undefined);
  a.lines[0].t='変更';assert.equal(b.lines[0].t,'😀あいう');assert.deepEqual(p,packedBefore);assert.deepEqual(result.state.rsongs,before.rsongs);
});
test('invalid, ambiguous and oversized packed lyric references fail closed',()=>{
  for(const value of [-1,0.5,1,'0',Number.MAX_SAFE_INTEGER]){
    const p=packet();p.state.songLib=[clone(p.state.songs[0].lines)];delete p.state.songs[0].lines;p.state.songs[0].L=value;
    fails('candidate-song',()=>API.merge(current(),p));
  }
  const p=packet();p.state.songLib=[clone(p.state.songs[0].lines)];p.state.songs[0].L=0;fails('candidate-song',()=>API.merge(current(),p));
  const oversized=packet();oversized.state.songLib=[Array.from({length:100001},()=>({t:'合成',parts:['M']}))];
  for(const song of oversized.state.songs){delete song.lines;song.L=0;}
  fails('candidate-too-large',()=>API.merge(current(),oversized));
});
test('optional packing checks persisted size without mutating the raw merged state',()=>{
  let calls=0;const old=current(),p=packet(),result=API.merge(old,p,{packState:state=>{calls++;state.unknown.padding='packed';return state;}});
  assert.equal(calls,1);assert.equal(result.state.unknown.padding,undefined);
  fails('state-invalid',()=>API.merge(old,p,{packState:()=>{throw Error('PRIVATE');}}));
});
test('browser module touches no storage, network, DOM or shared app state',()=>{
  let calls=0;const deny=new Proxy({},{get(){calls++;throw Error('forbidden');},set(){calls++;throw Error('forbidden');}});
  const context=vm.createContext({TextEncoder,fetch:deny,localStorage:deny,indexedDB:deny,document:deny,S:deny,U:deny});
  vm.runInContext(fs.readFileSync(__dirname+'/../startup-recovered-show-addition.js','utf8'),context);
  const result=context.StartupRecoveredShowAddition.merge(current(),packet());assert.equal(result.counts.songs,2);assert.equal(calls,0);
});
