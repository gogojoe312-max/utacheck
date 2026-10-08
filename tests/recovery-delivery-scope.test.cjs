'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const API=require('../recovery-delivery-scope.js');
const clone=value=>structuredClone(value);
const SHA='a'.repeat(64),REMOTE='b'.repeat(64),GIST='c'.repeat(32);
const SRC='https://gist.githubusercontent.com/fixture-owner/'+GIST+'/raw/utacheck.json';
function state(){return {
  groups:[{id:'GROUP',name:'Fixture group',nopub:true,gistId:'',src:'',key:'',unknown:'keep'},
    {id:'KEEP_GROUP',name:'Other fixture',nopub:false,gistId:'OTHER_EXISTING',src:'unchanged',key:'unchanged'}],
  shows:[{id:'LOCAL_ONE',name:'First fixture show',groupId:'GROUP',recoveredSourceShowId:'SOURCE_ONE',nopub:true,folder:'Fixture folder',ts:0,absent:[]},
    {id:'LOCAL_TWO',name:'Second fixture show',recoveredSourceShowId:'SOURCE_TWO',nopub:true,ts:1},
    {id:'MATERIAL',name:'Original workbook',groupId:'GROUP',recoveredSourceShowId:'SOURCE_ONE',hidden:true,nopub:true,recoverySource:'original-workbooks'},
    {id:'KEEP_SHOW',name:'Unrelated show',groupId:'KEEP_GROUP'},
    {id:'REC_SHOW',name:'Recording',hidden:1}],
  songs:[{id:'SONG_ONE',showId:'LOCAL_ONE',groupId:'GROUP',title:'Same fixture title',lines:[{t:'Fixture lyrics',parts:[]}]},
    {id:'SONG_TWO',showId:'LOCAL_TWO',groupId:'GROUP',title:'Same fixture title',lines:[{t:'Fixture lyrics',parts:[]}]},
    {id:'MATERIAL_SONG',showId:'MATERIAL',groupId:'GROUP',recoveredFromOriginalExcel:true,title:'Material',xls:1},
    {id:'KEEP_SONG',showId:'KEEP_SHOW',groupId:'KEEP_GROUP',title:'Same fixture title'}],
  notes:[{id:'NOTE',songId:'SONG_ONE',showId:'LOCAL_ONE',memo:'Fixture note',memberIds:[],tags:[]}],
  staffMemos:{'LOCAL_ONE|SONG_ONE':'Fixture staff memo'},memos:{'LOCAL_ONE|SONG_ONE':'Fixture public memo'},
  rsongs:[{id:'REC_SONG',title:'Fixture recording song'}],recs:{take:{at:0}},trash:[{id:'TRASH'}],
  plan:{slots:[{id:'SLOT',unknown:1}]},draws:{fixture:[0]},ghToken:'FIXTURE_TOKEN',bkKey:'FIXTURE_KEY',
  originalMaterials:{value:'FIXTURE_WORKBOOK'},unknown:{undefinedValue:undefined,array:[0,false,null,'fixture']},
  recMode:true,rsongId:'REC_SONG',showId:'KEEP_SHOW',groupId:'KEEP_GROUP',autoPub:false,
  recoveredShowSources:{[SHA]:{version:1,source:{kind:'gist-publication',sha256:SHA},focusGroupId:'GROUP',counts:{shows:2},unknown:'keep'}}
};}
function packet(){return {app:'utacheck-existing-delivery',version:2,targets:[{
  sourceSha256:SHA,expectedRemoteSha256:REMOTE,groupName:'Fixture group',gistId:GIST,src:SRC,sourceShowIds:['SOURCE_TWO','SOURCE_ONE']
}]};}
const target=()=>API.plan(state(),packet()).targets[0];
const fails=(code,fn)=>assert.throws(fn,error=>error.recoveryDeliveryCode===code&&error.code===code&&error.message===code);
function publication(local=false){
  const ids=local?['LOCAL_ONE','LOCAL_TWO']:['SOURCE_ONE','SOURCE_TWO'];
  return {version:1,authorId:'FIXTURE_DEVICE',src:SRC,groupName:'Fixture group',members:[{name:'Fixture singer'}],
    rosters:{'Fixture group':['Fixture singer']},alert:null,groupOrder:['Fixture group'],folderOrder:['Fixture folder'],focusShow:ids[0],
    lib:[{title:'Fixture song',credit:'Fixture credit',groups:{A:['Fixture singer']},order:['Fixture singer'],
      lines:[['A','😀 fixture lyrics','','','','','','']],sections:[{lineIdx:0,name:'Fixture section'}],groupRows:[{b:'A',ncell:'A1',lcell:'B1'}]}],
    songs:[{showId:ids[0],libIdx:0,take:1,fromIdx:null},{showId:ids[1],libIdx:0,take:2,fromIdx:0}],
    shows:ids.map((id,i)=>({id,name:'Fixture show '+i,ts:i,folder:'Fixture folder',absent:[],...(local?{nopub:false,recoveredSourceShowId:'SOURCE_'+(i?'TWO':'ONE'),groupId:undefined,deliveryGroupId:undefined,deliveryMode:undefined}:{})})),
    gsubs:[{showId:ids[0],songIdx:0,block:'A',names:['Fixture singer']}],subs:[{showId:ids[0],songIdx:0,lineIdx:0,names:['Fixture singer']}],
    notes:[{showId:ids[0],songIdx:0,lineIdx:0,memberNames:['Fixture singer'],tags:['fixture'],memo:'Fixture public note',
      hand:{text:'Fixture handwritten note',paths:[{x:0,y:1}],points:[[0,0]],state:'draft'},pitch:null,lineEnd:null,from:0,to:2,at:0}],
    memos:[{showId:ids[0],songIdx:0,text:'Fixture public memo'}]};
}
function frozen(value){if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
function addSecond(s,p){
  const sha='d'.repeat(64),gist='e'.repeat(32),src='https://gist.githubusercontent.com/fixture-two/'+gist+'/raw/utacheck.json';
  s.groups.push({id:'GROUP_TWO',name:'Second group',nopub:true});
  s.shows.push({id:'LOCAL_THREE',name:'Third show',groupId:'GROUP_TWO',recoveredSourceShowId:'SOURCE_THREE',nopub:true});
  s.songs.push({id:'SONG_THREE',showId:'LOCAL_THREE',groupId:'GROUP_TWO'});
  s.recoveredShowSources[sha]={source:{sha256:sha},focusGroupId:'GROUP_TWO'};
  p.targets.push({sourceSha256:sha,expectedRemoteSha256:REMOTE,groupName:'Second group',gistId:gist,src,sourceShowIds:['SOURCE_THREE']});
}
test('plan is a pure immutable copy and changes only approved group connection and flags',()=>{
  const s=state(),p=packet(),before=clone(s),beforePacket=clone(p),expected=clone(s);
  expected.groups[0].nopub=false;expected.groups[0].gistId=GIST;expected.groups[0].src=SRC;
  expected.shows[0].nopub=false;expected.shows[1].nopub=false;
  const result=API.plan(frozen(s),frozen(p));
  assert.deepEqual(result.state,expected);assert.deepEqual(s,before);assert.deepEqual(p,beforePacket);
  assert.notEqual(result.state.unknown,s.unknown);assert.equal(result.state.autoPub,false);
  assert.deepEqual(result.changes,{groups:1,shows:2,songs:2,connections:1,groupFlags:1,showFlags:2});
  assert.deepEqual(result.targets,[{groupId:'GROUP',groupName:'Fixture group',gistId:GIST,src:SRC,
    showIds:['LOCAL_TWO','LOCAL_ONE'],sourceShowIds:['SOURCE_TWO','SOURCE_ONE'],sourceSha256:SHA,expectedRemoteSha256:REMOTE}]);
  assert.deepEqual(result.state.rsongs,before.rsongs);assert.deepEqual(result.state.staffMemos,before.staffMemos);
});
test('multiple explicit destinations are independent and preserve all unrelated rows',()=>{
  const s=state(),p=packet();addSecond(s,p);const result=API.plan(s,p);
  assert.equal(result.targets.length,2);assert.deepEqual(result.changes,{groups:2,shows:3,songs:3,connections:2,groupFlags:2,showFlags:3});
  assert.deepEqual(result.state.groups[1],s.groups[1]);assert.deepEqual(result.state.shows[2],s.shows[2]);
});
test('identical reconnection is idempotent and never resumes automatic delivery',()=>{
  const first=API.plan(state(),packet()),second=API.plan(first.state,packet());
  assert.deepEqual(second.state,first.state);assert.deepEqual(second.changes,{groups:1,shows:2,songs:2,connections:0,groupFlags:0,showFlags:0});
  assert.equal(second.state.autoPub,false);
});
test('packet and target schema are exact and cannot carry new credentials or state',()=>{
  for(const extra of ['state','creds','key','ghToken','autoPub','unknown']){
    const p=packet();p[extra]='FIXTURE';fails('packet-invalid',()=>API.plan(state(),p));
    const q=packet();q.targets[0][extra]='FIXTURE';fails('target-invalid',()=>API.plan(state(),q));
  }
  for(const change of [p=>delete p.app,p=>p.version=3,p=>p.app='other',p=>p.targets=[],p=>p.targets={}]){
    const p=packet();change(p);fails('packet-invalid',()=>API.plan(state(),p));
  }
  const p=packet();delete p.targets[0].expectedRemoteSha256;fails('target-invalid',()=>API.plan(state(),p));
});
test('receipt and expected-remote digests must be complete lowercase hashes',()=>{
  for(const field of ['sourceSha256','expectedRemoteSha256'])for(const value of ['',null,1,'a'.repeat(63),'A'.repeat(64),'g'.repeat(64)]){
    const p=packet();p.targets[0][field]=value;fails('source-hash-invalid',()=>API.plan(state(),p));
  }
});
test('only exact canonical Gist raw destinations are accepted',()=>{
  for(const src of [SRC+'?x=1',SRC+'#x',SRC.replace('https:','http:'),SRC.replace('.com/','.com:443/'),
    SRC.replace('/raw/','/raw/'+'a'.repeat(40)+'/'),SRC.replace('utacheck.json','other.json'),SRC.replace('fixture-owner','x/../fixture-owner'),
    SRC.replace('/raw/','/%72aw/'),SRC.replace('gist.githubusercontent.com','gist.githubusercontent.com.evil.invalid'),SRC.replace('fixture-owner','a@fixture-owner'),
    SRC.replace(GIST,'d'.repeat(32)),SRC.replace('https:','HTTPS:'),SRC+'/',SRC.replace('/raw/','/raw//')]){
    const p=packet();p.targets[0].src=src;fails('destination-invalid',()=>API.plan(state(),p));
  }
  const p=packet();p.targets[0].gistId='a'.repeat(31);fails('destination-invalid',()=>API.plan(state(),p));
});
test('source receipt exact digest and resolved group identity are mandatory',()=>{
  for(const change of [s=>delete s.recoveredShowSources[SHA],s=>s.recoveredShowSources[SHA].source.sha256=REMOTE,
    s=>s.recoveredShowSources[SHA].focusGroupId='MISSING',s=>s.recoveredShowSources[SHA].focusGroupId='KEEP_GROUP',
    s=>s.recoveredShowSources[SHA].source=null]){
    const s=state();change(s);assert.throws(()=>API.plan(s,packet()),error=>['source-receipt-mismatch','group-name-mismatch'].includes(error.code));
  }
  const s=state();delete s.recoveredShowSources;fails('source-receipt-missing',()=>API.plan(s,packet()));
});
test('group names are exact and titles never infer or repair an ownership relationship',()=>{
  const p=packet();p.targets[0].groupName='Fixture group ';fails('group-name-mismatch',()=>API.plan(state(),p));
  const s=state();s.shows[0].name='Fixture group';s.shows[0].groupId='MISSING';fails('source-show-set-mismatch',()=>API.plan(s,packet()));
  const s2=state();delete s2.shows[1].groupId;s2.songs[1].groupId='KEEP_GROUP';s2.shows[1].name='Fixture group';fails('source-show-set-mismatch',()=>API.plan(s2,packet()));
});
test('missing show group resolves only from unanimous existing song group IDs',()=>{
  const s=state();delete s.shows[0].groupId;assert.equal(API.plan(s,packet()).targets[0].showIds.length,2);
  s.songs.push({id:'OTHER_ROUTE',showId:'LOCAL_ONE',groupId:'KEEP_GROUP'});fails('source-show-set-mismatch',()=>API.plan(s,packet()));
});
test('packet must include every nonhidden recovered show in the resolved group exactly once',()=>{
  for(const refs of [['SOURCE_ONE'],['SOURCE_ONE','SOURCE_TWO','EXTRA'],['SOURCE_ONE','SOURCE_ONE'],[]]){
    const p=packet();p.targets[0].sourceShowIds=refs;
    fails(new Set(refs).size!==refs.length||!refs.length?'source-show-identity':'source-show-set-mismatch',()=>API.plan(state(),p));
  }
  const s=state();s.shows.push({id:'ANOTHER_LOCAL',name:'Extra recovered show',groupId:'GROUP',recoveredSourceShowId:'SOURCE_THREE'});
  fails('source-show-set-mismatch',()=>API.plan(s,packet()));
});
test('hidden, archived and original-workbook rows cannot be selected or unhidden',()=>{
  for(const change of [s=>s.shows[0].hidden=true,s=>s.shows[0].recoverySource='original-workbooks',s=>s.shows[0].archived=true]){
    const s=state();change(s);const before=clone(s);fails('source-show-set-mismatch',()=>API.plan(s,packet()));assert.deepEqual(s,before);
  }
  const s=state();s.shows[2].hidden=false;const result=API.plan(s,packet());assert.deepEqual(result.state.shows[2],s.shows[2]);
});
test('duplicate recovered locators and entity ID collisions fail closed',()=>{
  const s=state();s.shows.push({...s.shows[0],id:'COLLIDING_SOURCE'});fails('source-show-collision',()=>API.plan(s,packet()));
  for(const field of ['groups','shows','songs']){const s=state();s[field].push({...s[field][0]});fails('state-identity-collision',()=>API.plan(s,packet()));}
  const s2=state();s2.songs[0].id='GROUP';fails('state-identity-collision',()=>API.plan(s2,packet()));
});
test('one group cannot receive multiple target bindings, even from another receipt',()=>{
  const s=state(),p=packet();p.targets.push({...p.targets[0]});fails('duplicate-target-group',()=>API.plan(s,p));
  const sha='f'.repeat(64);s.recoveredShowSources[sha]={source:{sha256:sha},focusGroupId:'GROUP'};p.targets[1].sourceSha256=sha;
  fails('duplicate-target-group',()=>API.plan(s,p));
});
test('a Gist cannot be assigned to multiple selected groups or existing other groups',()=>{
  const s=state(),p=packet();addSecond(s,p);p.targets[1].gistId=GIST;p.targets[1].src=SRC;fails('duplicate-target-destination',()=>API.plan(s,p));
  for(const change of [s=>s.groups[1].gistId=GIST,s=>s.groups[1].src=SRC,s=>s.groups[1].src=SRC.replace('/raw/','/raw/'+'a'.repeat(40)+'/')]){
    const s=state();change(s);fails('destination-collision',()=>API.plan(s,packet()));
  }
});
test('existing conflicting connections or encrypted destinations are never replaced or cleared',()=>{
  for(const field of ['gistId','src']){const s=state();s.groups[0][field]='OTHER';fails('existing-destination-conflict',()=>API.plan(s,packet()));assert.equal(s.groups[0][field],'OTHER');}
  for(const [field,value] of [['key','FIXTURE_SECRET'],['key',false],['enc',1],['encrypted',true]]){
    const s=state();s.groups[0][field]=value;fails('encrypted-destination-unsupported',()=>API.plan(s,packet()));assert.equal(s.groups[0][field],value);
  }
});
test('show-level split or delivery overrides fail instead of being normalized',()=>{
  for(const [field,value] of [['deliveryMode','song'],['deliveryMode','unknown'],['deliveryGroupId',''],['deliveryGroupId','KEEP_GROUP'],['deliveryGroupId','MISSING']]){
    const s=state();s.shows[0][field]=value;fails('show-delivery-conflict',()=>API.plan(s,packet()));assert.equal(s.shows[0][field],value);
  }
  const s=state();s.shows[0].deliveryGroupId='GROUP';s.shows[0].deliveryMode='show';assert.equal(API.plan(s,packet()).targets.length,1);
});
test('song opt-outs, delivery overrides and private-group routing are preserved by stopping',()=>{
  for(const [field,value] of [['deliveryMode','song'],['deliveryMode','unknown'],['deliveryGroupId',''],['deliveryGroupId','KEEP_GROUP'],['deliveryGroupId','MISSING']]){
    const s=state();s.songs[0][field]=value;fails('song-delivery-conflict',()=>API.plan(s,packet()));assert.equal(s.songs[0][field],value);
  }
  const s=state();s.groups[1].nopub=true;s.songs[0].groupId='KEEP_GROUP';fails('song-delivery-conflict',()=>API.plan(s,packet()));
  const s2=state();s2.songs[0].groupId='MISSING';fails('song-group-unresolved',()=>API.plan(s2,packet()));
});
test('explicit show route allows an active legacy import group without rewriting it',()=>{
  const s=state();s.songs[0].groupId='KEEP_GROUP';const out=API.plan(s,packet()).state;
  assert.equal(out.songs[0].groupId,'KEEP_GROUP');assert.deepEqual(out.songs,s.songs);
});
test('every selected show needs a song and original-material songs stay private',()=>{
  const s=state();s.songs=s.songs.filter(song=>song.id!=='SONG_ONE');fails('show-has-no-songs',()=>API.plan(s,packet()));
  for(const field of ['recoveredFromOriginalExcel','hidden','archived','archive']){
    const s=state();s.songs[0][field]=true;fails('song-not-public',()=>API.plan(s,packet()));
  }
});
test('unsafe keys, getters, cycles, sparse arrays, non-plain objects and symbols never execute',()=>{
  for(const key of ['__proto__','prototype','constructor']){
    const p=packet();Object.defineProperty(p.targets[0],key,{value:{polluted:true},enumerable:true});fails('unsafe-key',()=>API.plan(state(),p));
  }
  let reads=0;const p=packet();Object.defineProperty(p.targets[0],'src',{get(){reads++;throw new Error('secret');},enumerable:true});
  fails('unsafe-data',()=>API.plan(state(),p));assert.equal(reads,0);
  const s=state();s.unknown.self=s;fails('unsafe-data',()=>API.plan(s,packet()));
  const sparse=packet();sparse.targets.length=2;fails('unsafe-data',()=>API.plan(state(),sparse));
  const date=state();date.unknown.date=new Date();fails('unsafe-data',()=>API.plan(date,packet()));
  const inherited=state();inherited.unknown=Object.create({secret:true});fails('unsafe-data',()=>API.plan(inherited,packet()));
  const symbol=state();symbol[Symbol('secret')]=true;fails('unsafe-key',()=>API.plan(symbol,packet()));
  const fn=state();fn.unknown.toJSON=()=>{reads++;return {};};fails('unsafe-data',()=>API.plan(fn,packet()));assert.equal(reads,0);
});
test('safe null-prototype unknown state survives without prototype pollution',()=>{
  const s=state();s.unknown=Object.assign(Object.create(null),{value:'keep'});const out=API.plan(s,packet()).state;
  assert.equal(Object.getPrototypeOf(out.unknown),null);assert.equal(out.unknown.value,'keep');assert.equal({}.polluted,undefined);
});
test('browser global and CommonJS share a frozen API and cross-realm plain state works',()=>{
  const context={TextEncoder,URL};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../recovery-delivery-scope.js'),'utf8'),context);
  assert.equal(typeof context.RecoveryDeliveryScope.plan,'function');assert(Object.isFrozen(context.RecoveryDeliveryScope));
  const result=context.RecoveryDeliveryScope.plan(state(),packet());assert.equal(result.targets[0].groupId,'GROUP');
  assert.equal(global.RecoveryDeliveryScope,API);
});
test('publication verification is immutable, whitelisted and positionally maps local source IDs',()=>{
  const t=target(),remote=publication(),payload=publication(true),before=clone(remote),after=clone(payload);
  assert.deepEqual(API.verifyPublication(frozen(t),frozen(remote),frozen(payload)),{
    ok:true,remote:{shows:2,songs:2,notes:1,memos:1},payload:{shows:2,songs:2,notes:1,memos:1}});
  assert.deepEqual(remote,before);assert.deepEqual(payload,after);assert.equal(payload.shows[0].groupId,undefined);
});
test('a previous remote subset is allowed while payload must include every targeted show',()=>{
  const remote=publication();remote.shows.pop();remote.songs.pop();
  assert.equal(API.verifyPublication(target(),remote,publication(true)).remote.shows,1);
  const payload=publication(true);payload.shows.pop();payload.songs.pop();fails('payload-show-set-mismatch',()=>API.verifyPublication(target(),remote,payload));
});
test('a verified subsequent publication may contain remapped IDs with exact source locators',()=>{
  const remote=publication(true);assert.equal(API.verifyPublication(target(),remote,publication(true)).ok,true);
  remote.shows[0].id='UNRELATED_LOCAL';fails('remote-show-out-of-scope',()=>API.verifyPublication(target(),remote,publication(true)));
});
test('extra remote shows and foreign recovered locators cannot pass by matching a title',()=>{
  for(const change of [d=>d.shows[0].id='EXTRA',d=>d.shows[0].recoveredSourceShowId='EXTRA',d=>d.shows[0].recoveredSourceShowId='SOURCE_TWO']){
    const remote=publication();change(remote);fails('remote-show-out-of-scope',()=>API.verifyPublication(target(),remote,publication(true)));
  }
});
test('extra payload shows, source locators and missing local mappings are rejected',()=>{
  for(const change of [d=>d.shows[0].id='EXTRA',d=>d.shows[0].recoveredSourceShowId='SOURCE_TWO']){
    const payload=publication(true);change(payload);fails('payload-show-out-of-scope',()=>API.verifyPublication(target(),publication(),payload));
  }
  const t=target();t.sourceShowIds.pop();fails('target-invalid',()=>API.verifyPublication(t,publication(),publication(true)));
});
test('group and destination identity are checked on both remote and payload',()=>{
  for(const remote of [true,false])for(const field of ['groupName','src']){
    const prior=publication(),payload=publication(true);(remote?prior:payload)[field]='OTHER';
    fails((remote?'remote-':'payload-')+(field==='src'?'source-mismatch':'group-mismatch'),()=>API.verifyPublication(target(),prior,payload));
  }
});
test('malformed missing show, song and library arrays or empty publications fail',()=>{
  for(const remote of [true,false])for(const field of ['shows','songs','lib'])for(const value of [null,{},undefined,[]]){
    const prior=publication(),payload=publication(true);(remote?prior:payload)[field]=value;
    assert.throws(()=>API.verifyPublication(target(),prior,payload),error=>[remote?'remote-publication-invalid':'payload-publication-invalid',remote?'remote-publication-empty':'payload-publication-empty'].includes(error.code));
  }
});
test('hidden or nonpublic shows and original workbooks never appear on either side',()=>{
  for(const remote of [true,false])for(const [field,value] of [['hidden',1],['nopub',true],['recoverySource','original-workbooks']]){
    const prior=publication(),payload=publication(true);(remote?prior:payload).shows[0][field]=value;
    fails(remote?'remote-publication-invalid':'payload-publication-invalid',()=>API.verifyPublication(target(),prior,payload));
  }
});
test('private REC, archive, staff memo and credential fields fail at every nesting level',()=>{
  for(const field of ['staffMemos','rsongs','recs','plan','trash','draws','key','ghToken','bkKey','xlsSourceId','originalText','archive','archived']){
    for(const row of ['top','show','hand']){
      const payload=publication(true),at=row==='top'?payload:row==='show'?payload.shows[0]:payload.notes[0].hand;at[field]='FIXTURE_PRIVATE';
      fails('publication-private-field',()=>API.verifyPublication(target(),publication(),payload));
    }
    const remote=publication();remote[field]={};fails('publication-private-field',()=>API.verifyPublication(target(),remote,publication(true)));
  }
});
test('unknown publication fields and unrecognized nested row fields fail closed',()=>{
  for(const field of ['shows','songs','lib','notes','memos','gsubs','subs','members']){
    const payload=publication(true);payload[field][0].unknown='FIXTURE_PRIVATE';fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),payload));
  }
  const payload=publication(true);payload.extra={};fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),payload));
});
test('defined routing fields on published shows are rejected rather than transmitted',()=>{
  for(const key of ['groupId','deliveryGroupId','deliveryMode']){const p=publication(true);p.shows[0][key]='GROUP';fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),p));}
});
test('every note, memo and substitution song reference must be an in-range integer',()=>{
  for(const field of ['notes','memos','subs','gsubs'])for(const songIdx of [-1,2,0.5,'0',null,undefined]){
    const p=publication(true);p[field][0].songIdx=songIdx;fails('publication-song-reference',()=>API.verifyPublication(target(),publication(),p));
  }
});
test('notes and substitutions must point to their song show and existing lyric line',()=>{
  for(const field of ['notes','memos','subs','gsubs']){const p=publication(true);p[field][0].showId='LOCAL_TWO';fails('publication-show-reference',()=>API.verifyPublication(target(),publication(),p));}
  for(const field of ['notes','subs'])for(const lineIdx of [-1,1,'0',null,0.5]){
    const p=publication(true);p[field][0].lineIdx=lineIdx;fails('publication-line-reference',()=>API.verifyPublication(target(),publication(),p));
  }
});
test('malformed lyric, library, song and take relationships fail',()=>{
  const changes=[p=>p.songs[0].showId='EXTRA',p=>p.songs[0].libIdx=1,p=>p.songs[0].libIdx='0',p=>p.songs[0].take=0,
    p=>p.songs[0].fromIdx=0,p=>p.songs[0].fromIdx=2,p=>p.lib[0].lines[0][0]=1,p=>p.lib[0].lines[0]=['A'],
    p=>p.lib[0].groups.A=[null],p=>p.lib[0].sections[0].lineIdx=1,p=>p.lib[0].groupRows[0].b=1];
  for(const change of changes){const p=publication(true);change(p);fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),p));}
});
test('song ancestry cycles, unreferenced library rows and empty shows are rejected',()=>{
  const p=publication(true);p.songs[0].fromIdx=1;fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),p));
  const p2=publication(true);p2.lib.push(clone(p2.lib[0]));fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),p2));
  const p3=publication(true);p3.songs[1].showId='LOCAL_ONE';fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),p3));
});
test('conflicting duplicate memo or substitution references are rejected',()=>{
  for(const field of ['memos','subs','gsubs']){const p=publication(true);p[field].push(clone(p[field][0]));fails('publication-reference-collision',()=>API.verifyPublication(target(),publication(),p));}
});
test('note zero offsets and Unicode ranges survive; invalid endpoints and formats fail',()=>{
  assert(API.verifyPublication(target(),publication(),publication(true)).ok);
  for(const change of [p=>p.notes[0].from=-1,p=>p.notes[0].to=100,p=>p.notes[0].from=3,p=>p.notes[0].to=null,
    p=>p.notes[0].lineEnd=1,p=>p.notes[0].at=-1,p=>p.notes[0].tags='invalid',p=>p.notes[0].hand='invalid']){
    const p=publication(true);change(p);fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),p));
  }
});
test('roster, group order, focus, and announcement shapes are restricted',()=>{
  for(const change of [p=>p.rosters.Other=['Fixture singer'],p=>p.groupOrder.push('Other'),p=>p.focusShow='EXTRA',
    p=>p.alert={id:'ALERT',text:'Fixture alert',at:0,to:[],extra:true},p=>p.members[0].name='',p=>p.folderOrder=[{}]]){
    const p=publication(true);change(p);fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),p));
  }
  const p=publication(true);p.alert={id:'ALERT',text:'Fixture alert',at:0,to:['GROUP']};assert(API.verifyPublication(target(),publication(),p).ok);
});
test('publication getters, dangerous JSON and cycles are rejected with no leaked error contents',()=>{
  let calls=0;const remote=publication();Object.defineProperty(remote,'groupName',{get(){calls++;throw new Error('FIXTURE_SECRET');},enumerable:true});
  fails('unsafe-data',()=>API.verifyPublication(target(),remote,publication(true)));assert.equal(calls,0);
  const payload=publication(true);payload.notes[0].hand.self=payload;fails('unsafe-data',()=>API.verifyPublication(target(),publication(),payload));
  const p=publication(true);p.notes[0].hand=JSON.parse('{"__proto__":{"leak":true}}');fails('unsafe-key',()=>API.verifyPublication(target(),publication(),p));
});
test('failed multi-target plans do not leave even first-target changes in caller state',()=>{
  const s=state(),p=packet();addSecond(s,p);p.targets[1].groupName='Wrong';const before=clone(s);
  fails('group-name-mismatch',()=>API.plan(s,p));assert.deepEqual(s,before);
});
function actualPublicationFixture(){
  const initial=state();
  initial.deviceId='FIXTURE_DEVICE';initial.members=[{id:'MEMBER',name:'Fixture singer'}];
  initial.subs={'LOCAL_ONE|SONG_ONE':{0:['MEMBER']}};initial.gsubs={'LOCAL_ONE|SONG_ONE':{A:['MEMBER']}};
  initial.rosters={'Fixture group':['Fixture singer']};initial.folderOrder=['Fixture folder','UNRELATED_PRIVATE_FOLDER'];
  initial.notes[0].lineIdx=0;initial.notes[0].memberIds=['MEMBER'];
  initial.notes[0].hand={text:'Fixture handwritten note',points:[[0,0],[1,1]]};
  initial.notes[0].from=0;initial.notes[0].to=2;initial.notes[0].at=0;
  initial.songs[0].lines=[{t:'😀 fixture lyrics',parts:['MEMBER'],sec:'Section A'},
    {t:'Second fixture line',label:'A',parts:['MEMBER']},{gap:true,t:'',parts:[]}];
  initial.songs[1].lines=[{t:'Another fixture lyric',parts:[],cont:true,extra:['MEMBER']}];
  for(const song of initial.songs.slice(0,2)){song.blocks={A:['MEMBER']};song.roster=['MEMBER'];song.blockRows=[{b:'A'}];}
  const result=API.plan(initial,packet()),S=result.state;
  const c=vm.createContext({S,Date,JSON,Map,Set,group:id=>S.groups.find(g=>g.id===id),member:id=>S.members.find(m=>m.id===id),showsNewestFirst:()=>S.shows});
  const app=fs.readFileSync(__dirname+'/../app.js','utf8');
  for(const [start,end] of [['function autoShowGroupId(','function setCurrentShowGroup('],['function publicationData(','async function gh(']]){
    const a=app.indexOf(start),b=app.indexOf(end,a);assert(a>=0&&b>a);vm.runInContext(app.slice(a,b),c);
  }
  const value=c.publicationData('GROUP');
  value.folderOrder=value.folderOrder.filter(folder=>value.shows.some(show=>show.folder===folder));
  return {result,S,context:c,value,wire:JSON.parse(JSON.stringify(value))};
}
test('actual app publicationData wire shape passes with null optional labels and no unrelated private state',()=>{
  const f=actualPublicationFixture(),before=clone(f.S);
  assert.equal(f.wire.lib[0].lines[0][0],null);assert.equal(f.wire.lib[0].lines[1][0],'A');
  assert.equal(f.wire.lib[1].lines[0][0],'→');assert.equal(f.wire.lib[0].groupRows[0].ncell,'');
  assert.equal(API.verifyPublication(f.result.targets[0],publication(),f.wire).ok,true);
  assert.deepEqual(f.S,before);
  for(const privateValue of ['FIXTURE_TOKEN','FIXTURE_KEY','Fixture staff memo','Fixture recording song','Original workbook','UNRELATED_PRIVATE_FOLDER'])assert(!JSON.stringify(f.wire).includes(privateValue));
});
test('actual in-memory publicationData validates using safe JSON-equivalent undefined handling',()=>{
  const f=actualPublicationFixture();assert.equal(f.value.lib[0].lines[0][0],undefined);
  assert.equal(API.verifyPublication(f.result.targets[0],publication(),f.value).ok,true);
});
test('null optional lyric labels are safe but null text cells and object labels remain invalid',()=>{
  const remote=publication();remote.lib[0].lines[0][0]=null;assert(API.verifyPublication(target(),remote,publication(true)).ok);
  for(const change of [p=>p.lib[0].lines[0][0]={memo:'no'},p=>p.lib[0].lines[0][1]=null]){
    const p=publication(true);change(p);fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),p));
  }
});
test('unexpected reflection errors cannot spoof a trusted code or leak raw private data',()=>{
  const hostile=new Proxy({}, {getPrototypeOf(){throw {recoveryDeliveryCode:'FIXTURE_PRIVATE',code:'FIXTURE_PRIVATE',message:'FIXTURE_PRIVATE'};}});
  fails('unsafe-data',()=>API.plan(hostile,packet()));
  fails('unsafe-data',()=>API.verifyPublication(target(),hostile,publication(true)));
});
test('payload metadata cannot disclose unrelated folder, show-ancestry or announcement target IDs',()=>{
  const p=publication(true);p.folderOrder.push('UNRELATED_PRIVATE_FOLDER');fails('payload-folder-out-of-scope',()=>API.verifyPublication(target(),publication(),p));
  const p2=publication(true);p2.shows[0].from='UNRELATED_PRIVATE_SHOW';fails('payload-show-reference-out-of-scope',()=>API.verifyPublication(target(),publication(),p2));
  const p3=publication(true);p3.alert={id:'ALERT',text:'Fixture notice',at:1,to:['GROUP','OTHER_GROUP']};fails('payload-alert-out-of-scope',()=>API.verifyPublication(target(),publication(),p3));
  const p4=publication(true);p4.shows[1].from='LOCAL_ONE';assert(API.verifyPublication(target(),publication(),p4).ok);
});
test('already-published remote metadata is inspected without requiring it to be sent again',()=>{
  const remote=publication();remote.folderOrder.push('OLD_PUBLIC_FOLDER');remote.shows[0].from='OLD_PUBLIC_SHOW';
  remote.alert={id:'OLD_ALERT',text:'Old public notice',at:1,to:['OLD_GROUP']};
  assert(API.verifyPublication(target(),remote,publication(true)).ok);
});
test('blank optional metadata remains compatible without relaxing identities or lyric text',()=>{
  const remote=publication(),payload=publication(true);
  for(const p of [remote,payload]){
    p.lib[0].credit=null;p.shows[0].ts=null;p.shows[0].folder=null;p.shows[0].from=null;p.shows[0].recoverySource=null;
    p.shows[0].hidden=null;p.shows[0].nopub=null;
  }
  remote.shows[0].recoveredSourceShowId=null;
  assert(API.verifyPublication(target(),remote,payload).ok);
});
test('equivalent old source URLs cannot conceal an existing destination collision',()=>{
  for(const src of [SRC+'?cache=1',SRC+'#viewer',SRC.replace('.com/','.com:443/'),SRC.replace('/raw/','/%72aw/'),
    SRC.replace('fixture-owner','fixture%2Downer'),SRC.replace('fixture-owner','old/../fixture-owner'),
    SRC.replace('/raw/','/raw/'+'a'.repeat(40)+'/')+'?cache=2#old',SRC.replace('https:','http:')]){
    const s=state();s.groups[1].gistId='';s.groups[1].src=src;fails('destination-collision',()=>API.plan(s,packet()));
  }
});
test('only evidence-backed legacy handwriting shapes pass without altering the originals',()=>{
  const forms=[{v:1,cells:[[[[20,30],[30,40]]]]},{text:'Fixture text',state:'draft'},
    {strokes:[[1,2]]},{points:[[0.1,0.2]]},{paths:[{x:0,y:1}]},{x:[1,2]},
    {text:null,state:null,v:null,cells:null,paths:null,points:null,strokes:null,x:null},{}];
  for(const hand of forms){const p=publication(true);p.notes[0].hand=hand;const before=clone(p);assert(API.verifyPublication(target(),publication(),p).ok);assert.deepEqual(p,before);}
});
test('handwriting cannot smuggle arbitrary nested private objects through a publication',()=>{
  for(const hand of [{nonPublicBackup:{privateNotes:'FIXTURE_PRIVATE'}},{points:[{x:1,y:2,privateNotes:'FIXTURE_PRIVATE'}]},
    {paths:[{nonPublicBackup:{memo:'FIXTURE_PRIVATE'}}]},{cells:[[['FIXTURE_PRIVATE']]]},{v:'1'},{text:{memo:'FIXTURE_PRIVATE'}}]){
    const p=publication(true);p.notes[0].hand=hand;fails('payload-publication-invalid',()=>API.verifyPublication(target(),publication(),p));
  }
});
function mergeFixture(){
  const remote=publication(),local=publication(true);
  remote.version=7;remote.authorId='REMOTE_DEVICE';remote.focusShow='REMOTE_EXTRA';
  remote.shows[0].name='Current shared fixture';remote.shows[0].folder='Current remote folder';
  remote.shows[1]={id:'REMOTE_EXTRA',name:'Current remote-only fixture',folder:'Remote-only folder',ts:7,absent:['Remote singer']};
  remote.folderOrder=['Old unused public folder','Remote-only folder','Current remote folder'];
  remote.lib=[clone(remote.lib[0]),clone(remote.lib[0])];
  remote.lib[0].title='Remote-only song';remote.lib[0].order=['Remote singer','Current order'];
  remote.lib[1].title='Current shared song';remote.lib[1].order=['Current order','Remote singer'];
  remote.songs=[{showId:'REMOTE_EXTRA',libIdx:0,take:1,fromIdx:null},{showId:'SOURCE_ONE',libIdx:1,take:1,fromIdx:null},
    {showId:'REMOTE_EXTRA',libIdx:0,take:2,fromIdx:0}];
  remote.notes=[{...remote.notes[0],showId:'SOURCE_ONE',songIdx:1,memo:'Current remote note',memberNames:['Remote singer']}];
  remote.memos=[{showId:'REMOTE_EXTRA',songIdx:0,text:'Current remote memo'}];
  remote.subs=[{showId:'REMOTE_EXTRA',songIdx:0,lineIdx:0,names:['Remote singer']}];
  remote.gsub_unused=undefined;delete remote.gsub_unused;
  remote.gsubs=[{showId:'SOURCE_ONE',songIdx:1,block:'A',names:['Remote singer']}];
  remote.members=[{name:'Remote singer'},{name:'Current order'}];remote.rosters={'Fixture group':['Current order','Remote singer']};
  remote.alert={id:'REMOTE_ALERT',text:'Current remote alert',at:1,to:['HISTORIC_GROUP']};
  local.version=8;local.authorId='LOCAL_DEVICE';local.focusShow='LOCAL_TWO';
  local.shows[0].name='HELD_LOCAL_NAME';local.shows[0].folder='HELD_LOCAL_FOLDER';
  local.shows[1].name='New managed fixture';local.shows[1].folder='Managed folder';local.shows[1].from='LOCAL_ONE';
  local.folderOrder=['HELD_LOCAL_FOLDER','Managed folder'];
  local.lib=[clone(local.lib[0]),clone(local.lib[0])];
  local.lib[0].title='HELD_LOCAL_TITLE';local.lib[0].lines[0][1]='HELD_LOCAL_LYRIC';local.lib[0].order=['HELD_LOCAL_MEMBER'];
  local.lib[1].title='Managed fixture song';local.lib[1].order=['Managed singer'];local.lib[1].groups={A:['Managed singer']};
  local.lib[1].lines[0][0]='Direct singer';
  local.songs=[{showId:'LOCAL_ONE',libIdx:0,take:1,fromIdx:null},{showId:'LOCAL_TWO',libIdx:1,take:1,fromIdx:null},
    {showId:'LOCAL_TWO',libIdx:1,take:2,fromIdx:1},{showId:'LOCAL_TWO',libIdx:1,take:3,fromIdx:0}];
  local.notes=[{...local.notes[0],memo:'HELD_LOCAL_NOTE',memberNames:['HELD_LOCAL_MEMBER']},
    {...local.notes[0],songIdx:1,showId:'LOCAL_TWO',memo:'Managed fixture note',memberNames:['Managed note singer']}];
  local.memos=[{showId:'LOCAL_ONE',songIdx:0,text:'HELD_LOCAL_MEMO'},{showId:'LOCAL_TWO',songIdx:1,text:'Managed fixture memo'}];
  local.subs=[{showId:'LOCAL_TWO',songIdx:2,lineIdx:0,names:['Managed substitute']}];
  local.gsubs=[{showId:'LOCAL_TWO',songIdx:3,block:'A',names:['Managed substitute']}];
  local.members=['Remote singer','HELD_LOCAL_MEMBER','Managed singer','Direct singer','Managed note singer','Managed substitute'].map(name=>({name}));
  local.rosters={'Fixture group':['HELD_LOCAL_MEMBER','Managed singer','Direct singer','Managed note singer','Managed substitute']};
  local.alert={id:'LOCAL_ALERT',text:'HELD_LOCAL_ALERT',at:2,to:['GROUP']};
  return {target:target(),remote,local};
}
test('merge protects every current remote show and appends only missing local sources',()=>{
  const f=mergeFixture(),beforeRemote=clone(f.remote),beforeLocal=clone(f.local),result=API.mergePublication(frozen(f.target),frozen(f.remote),frozen(f.local));
  assert.deepEqual(f.remote,beforeRemote);assert.deepEqual(f.local,beforeLocal);
  assert.deepEqual(result.preservedShowIds,['SOURCE_ONE','REMOTE_EXTRA']);assert.deepEqual(result.preservedShowNames,['Current shared fixture','Current remote-only fixture']);
  assert.deepEqual(result.heldLocalShowIds,['LOCAL_ONE']);assert.deepEqual(result.managedLocalShowIds,['LOCAL_TWO']);
  assert.deepEqual(result.payload.shows.slice(0,2),beforeRemote.shows);
  assert.deepEqual(result.payload.lib.slice(0,2),beforeRemote.lib);
  assert.deepEqual(result.payload.songs.slice(0,3),beforeRemote.songs);
  for(const field of ['notes','memos','subs','gsubs'])assert.deepEqual(result.payload[field].slice(0,beforeRemote[field].length),beforeRemote[field],field);
  assert.equal(result.payload.shows[2].id,'LOCAL_TWO');assert.equal(result.payload.shows[2].from,'SOURCE_ONE');
  assert.equal(result.payload.lib[2].title,'Managed fixture song');assert.equal(result.payload.shows.length,3);assert.equal(result.payload.songs.length,6);
  assert(!JSON.stringify(result.payload).includes('HELD_LOCAL'));
  assert.deepEqual(result.payload.alert,beforeRemote.alert);assert.equal(result.payload.focusShow,'REMOTE_EXTRA');
  assert.deepEqual(result.payload.folderOrder,['Remote-only folder','Current remote folder','Managed folder']);
  assert.deepEqual(result.payload.groupOrder,['Fixture group']);
});
test('merge correctly remaps every song, lyric library, note, memo, substitution and ancestry index',()=>{
  const f=mergeFixture(),out=API.mergePublication(f.target,f.remote,f.local).payload;
  assert.deepEqual(out.songs.slice(3),[{showId:'LOCAL_TWO',libIdx:2,take:1,fromIdx:null},{showId:'LOCAL_TWO',libIdx:2,take:2,fromIdx:3},
    {showId:'LOCAL_TWO',libIdx:2,take:3,fromIdx:null}]);
  assert.equal(out.notes.at(-1).songIdx,3);assert.equal(out.memos.at(-1).songIdx,3);
  assert.equal(out.subs.at(-1).songIdx,4);assert.equal(out.gsubs.at(-1).songIdx,5);
  for(const field of ['notes','memos','subs','gsubs'])for(const row of out[field])assert.equal(row.showId,out.songs[row.songIdx].showId);
});
test('merge preserves remote roster order and adds only managed-required local names',()=>{
  const f=mergeFixture(),out=API.mergePublication(f.target,f.remote,f.local).payload;
  assert.deepEqual(out.members.slice(0,f.remote.members.length),f.remote.members);
  assert.deepEqual(out.rosters['Fixture group'].slice(0,2),f.remote.rosters['Fixture group']);
  for(const name of ['Managed singer','Direct singer','Managed note singer','Managed substitute']){
    assert(out.members.some(member=>member.name===name));assert(out.rosters['Fixture group'].includes(name));
  }
  assert(!out.members.some(member=>member.name==='HELD_LOCAL_MEMBER'));assert(!out.rosters['Fixture group'].includes('HELD_LOCAL_MEMBER'));
});
test('subsequent merge replaces previously managed content while original protections remain exact',()=>{
  const f=mergeFixture(),first=API.mergePublication(f.target,f.remote,f.local),current=clone(first.payload),changed=clone(f.local);
  changed.version=9;changed.lib[1].title='Updated managed fixture';changed.notes[1].memo='Updated managed note';
  changed.lib[0].title='HELD_LOCAL_NEW_EDIT';changed.shows[0].name='HELD_LOCAL_NEW_NAME';
  const second=API.mergePublication(f.target,current,changed,first.preservedShowIds);
  assert.equal(second.payload.shows.length,3);assert.equal(second.payload.songs.length,6);assert.equal(second.payload.lib.length,3);
  assert.equal(second.payload.lib[2].title,'Updated managed fixture');assert.equal(second.payload.notes.at(-1).memo,'Updated managed note');
  assert.deepEqual(second.payload.shows.slice(0,2),f.remote.shows);assert.deepEqual(second.payload.lib.slice(0,2),f.remote.lib);
  assert.deepEqual(second.payload.songs.slice(0,3),f.remote.songs);assert.deepEqual(second.payload.alert,f.remote.alert);
  assert(!JSON.stringify(second.payload).includes('HELD_LOCAL'));assert.deepEqual(second.preservedShowIds,first.preservedShowIds);
});
test('omitting protection ledger on a later merge conservatively protects all currently published shows',()=>{
  const f=mergeFixture(),first=API.mergePublication(f.target,f.remote,f.local),changed=clone(f.local);changed.lib[1].title='NEW_LOCAL_ONLY_CHANGE';
  const held=API.mergePublication(f.target,first.payload,changed);
  assert.deepEqual(held.heldLocalShowIds,['LOCAL_TWO','LOCAL_ONE']);assert.deepEqual(held.managedLocalShowIds,[]);
  assert.equal(held.payload.lib[2].title,'Managed fixture song');assert(!JSON.stringify(held.payload).includes('NEW_LOCAL_ONLY_CHANGE'));
});
test('previously managed shows can be re-added if absent, but missing protected shows always stop',()=>{
  const f=mergeFixture(),first=API.mergePublication(f.target,f.remote,f.local);
  const again=API.mergePublication(f.target,f.remote,f.local,first.preservedShowIds);assert.equal(again.payload.shows.length,3);
  fails('merge-protected-show-missing',()=>API.mergePublication(f.target,f.remote,f.local,[...first.preservedShowIds,'MISSING']));
});
test('new unprotected remote additions cannot silently become managed even with matching titles',()=>{
  const f=mergeFixture(),first=API.mergePublication(f.target,f.remote,f.local),unexpected=clone(first.payload);
  unexpected.shows.push({id:'UNEXPECTED_SHOW',name:'New managed fixture',ts:0});
  unexpected.songs.push({showId:'UNEXPECTED_SHOW',libIdx:0,take:1,fromIdx:null});
  fails('merge-unidentified-remote-show',()=>API.mergePublication(f.target,unexpected,f.local,first.preservedShowIds));
  const spoof=clone(first.payload);spoof.shows.find(show=>show.id==='LOCAL_TWO').id='UNKNOWN_LOCAL_ID';
  spoof.songs.forEach(song=>{if(song.showId==='LOCAL_TWO')song.showId='UNKNOWN_LOCAL_ID';});
  for(const field of ['notes','memos','subs','gsubs'])spoof[field].forEach(row=>{if(row.showId==='LOCAL_TWO')row.showId='UNKNOWN_LOCAL_ID';});
  fails('merge-unidentified-remote-show',()=>API.mergePublication(f.target,spoof,f.local,first.preservedShowIds));
});
test('protected song ancestry cannot be silently nulled when it crosses into a replaced subset',()=>{
  const f=mergeFixture(),first=API.mergePublication(f.target,f.remote,f.local),remote=clone(first.payload);
  remote.songs[1].fromIdx=3;fails('merge-protected-song-reference',()=>API.mergePublication(f.target,remote,f.local,first.preservedShowIds));
});
test('protected remote index references remain correct when original indexes are compacted',()=>{
  const f=mergeFixture(),first=API.mergePublication(f.target,f.remote,f.local),remote=clone(first.payload);
  // Move one managed song before the protected subset, adjusting every old index.
  const order=[3,0,1,2,4,5],map=new Map(order.map((old,index)=>[old,index]));
  remote.songs=order.map(index=>({...remote.songs[index],fromIdx:remote.songs[index].fromIdx==null?null:map.get(remote.songs[index].fromIdx)}));
  for(const field of ['notes','memos','subs','gsubs'])remote[field].forEach(row=>{row.songIdx=map.get(row.songIdx);});
  // Move managed library first as well.
  remote.lib=[remote.lib[2],remote.lib[0],remote.lib[1]];remote.songs.forEach(song=>{song.libIdx=[1,2,0][song.libIdx];});
  const next=API.mergePublication(f.target,remote,f.local,first.preservedShowIds).payload;
  assert.deepEqual(next.songs.slice(0,3),f.remote.songs);assert.deepEqual(next.lib.slice(0,2),f.remote.lib);
  for(const field of ['notes','memos','subs','gsubs'])assert.deepEqual(next[field].slice(0,f.remote[field].length),f.remote[field]);
});
test('output identity collisions and source locator mismatches never infer a replacement',()=>{
  const f=mergeFixture();f.remote.shows[1].id='LOCAL_TWO';f.remote.focusShow='LOCAL_TWO';
  for(const song of f.remote.songs)if(song.showId==='REMOTE_EXTRA')song.showId='LOCAL_TWO';
  for(const field of ['notes','memos','subs','gsubs'])for(const row of f.remote[field])if(row.showId==='REMOTE_EXTRA')row.showId='LOCAL_TWO';
  fails('merge-show-identity-collision',()=>API.mergePublication(f.target,f.remote,f.local));
  const f2=mergeFixture();delete f2.local.shows[0].recoveredSourceShowId;fails('merge-local-source-mismatch',()=>API.mergePublication(f2.target,f2.remote,f2.local));
});
test('merge rejects invalid protection lists and duplicate remote source identities',()=>{
  for(const ids of [null,{},['SOURCE_ONE','SOURCE_ONE'],[''],['__proto__']]){const f=mergeFixture();fails('merge-protection-invalid',()=>API.mergePublication(f.target,f.remote,f.local,ids));}
  const f=mergeFixture();f.remote.shows[1].recoveredSourceShowId='SOURCE_ONE';fails('merge-remote-identity-collision',()=>API.mergePublication(f.target,f.remote,f.local));
});
test('current remote null and absent alerts cannot be replaced by a local alert',()=>{
  for(const absent of [false,true]){const f=mergeFixture();if(absent)delete f.remote.alert;else f.remote.alert=null;
    const out=API.mergePublication(f.target,f.remote,f.local).payload;assert.equal(Object.hasOwn(out,'alert'),!absent);assert.equal(out.alert,absent?undefined:null);}
});
test('merge reuses all strict shape, identity and private-field validation',()=>{
  for(const side of ['remote','local'])for(const mutation of [p=>p.staffMemos={},p=>p.lib[0].privateBackup={},p=>p.notes[0].songIdx=100,p=>p.shows[0].hidden=true,
    p=>p.groupName='OTHER_GROUP',p=>p.src='https://other.invalid/',p=>p.notes[0].hand={privateBackup:{memo:'PRIVATE'}}]){
    const f=mergeFixture();mutation(f[side]);assert.throws(()=>API.mergePublication(f.target,f.remote,f.local),error=>typeof error.recoveryDeliveryCode==='string');
  }
  const f=mergeFixture();let reads=0;Object.defineProperty(f.remote,'songs',{get(){reads++;throw Error('PRIVATE');},enumerable:true});
  fails('unsafe-data',()=>API.mergePublication(f.target,f.remote,f.local));assert.equal(reads,0);
});
test('strict verification still rejects the extra snapshot shows accepted only by bounded merge',()=>{
  const f=mergeFixture();fails('remote-show-out-of-scope',()=>API.verifyPublication(f.target,f.remote,f.local));
  assert.equal(API.mergePublication(f.target,f.remote,f.local).payload.shows.length,3);
});
test('held-only singer names cannot leak through substring matches in managed raw labels',()=>{
  const f=mergeFixture();f.local.members.push({name:'Prefix'});f.local.rosters['Fixture group'].push('Prefix');
  f.local.lib[1].lines[0][4]='ハモ PrefixFull';f.local.members.push({name:'PrefixFull'});
  const out=API.mergePublication(f.target,f.remote,f.local).payload;
  assert(!out.members.some(member=>member.name==='Prefix'));assert(!out.rosters['Fixture group'].includes('Prefix'));
  assert(out.members.some(member=>member.name==='PrefixFull'));
});
test('a managed block label does not publish a held-only person with the same name',()=>{
  const f=mergeFixture();f.local.members.push({name:'A'});f.local.rosters['Fixture group'].push('A');
  f.local.lib[1].lines[0][0]='A';
  const out=API.mergePublication(f.target,f.remote,f.local).payload;
  assert(!out.members.some(member=>member.name==='A'));assert(!out.rosters['Fixture group'].includes('A'));
});
test('an intentionally blank current remote focus is retained',()=>{
  const f=mergeFixture();f.remote.focusShow='';assert.equal(API.mergePublication(f.target,f.remote,f.local).payload.focusShow,'');
});
test('a local library alias spanning held and managed shows cannot disclose held metadata',()=>{
  const f=mergeFixture();f.local.lib=f.local.lib.slice(0,1);for(const song of f.local.songs)song.libIdx=0;
  fails('merge-shared-local-library',()=>API.mergePublication(f.target,f.remote,f.local));
});
test('actual compact publicationData alias is refused when it inherits held credit and roster metadata',()=>{
  const f=actualPublicationFixture(),first=f.S.songs[0],second=f.S.songs[1];
  f.S.members.push({id:'HELD_MEMBER',name:'Held singer'},{id:'MANAGED_MEMBER',name:'Managed singer'});
  first.credit='HELD_ONLY_CREDIT';first.blocks={A:['HELD_MEMBER']};first.roster=['HELD_MEMBER'];
  second.title=first.title;second.lines=clone(first.lines);second.credit='MANAGED_ONLY_CREDIT';second.blocks={A:['MANAGED_MEMBER']};second.roster=['MANAGED_MEMBER'];
  const local=JSON.parse(JSON.stringify(f.context.publicationData('GROUP')));
  local.folderOrder=local.folderOrder.filter(folder=>local.shows.some(show=>show.folder===folder));
  assert.equal(local.lib.length,1);assert.equal(local.lib[0].credit,'HELD_ONLY_CREDIT');assert.equal(local.songs[0].libIdx,local.songs[1].libIdx);
  const remote=publication();remote.shows.pop();remote.songs.pop();
  fails('merge-shared-local-library',()=>API.mergePublication(f.result.targets[0],remote,local));
  const isolated=JSON.parse(JSON.stringify(f.context.publicationData('GROUP',undefined,true)));
  isolated.folderOrder=isolated.folderOrder.filter(folder=>isolated.shows.some(show=>show.folder===folder));
  assert.equal(isolated.lib.length,2);assert.notEqual(isolated.songs[0].libIdx,isolated.songs[1].libIdx);
  const merged=API.mergePublication(f.result.targets[0],remote,isolated);
  assert.equal(merged.payload.lib.at(-1).credit,'MANAGED_ONLY_CREDIT');
  assert(!JSON.stringify(merged.payload).includes('HELD_ONLY_CREDIT'));
  assert(!JSON.stringify(merged.payload).includes('Held singer'));
});
test('independent but identical local library objects remain safe across held and managed shows',()=>{
  const f=mergeFixture();f.local.lib[1]=clone(f.local.lib[0]);f.local.lib[1].credit='MANAGED_CREDIT';
  const out=API.mergePublication(f.target,f.remote,f.local).payload;
  assert.equal(out.lib.at(-1).credit,'MANAGED_CREDIT');assert.equal(out.lib[0].title,f.remote.lib[0].title);
});

test('WebKit multiline native formatting accepts ordinary state without weakening prototype checks',()=>{
  const c=vm.createContext({TextEncoder,URL});
  vm.runInContext(`const intrinsic=Function.prototype.toString;
    Function.prototype.toString=function(){return intrinsic.call(this).replace(/ \\{ \\[native code\\] \\}$/, ' {\\n    [native code]\\n}');};`,c);
  vm.runInContext(fs.readFileSync(__dirname+'/../recovery-delivery-scope.js','utf8'),c);
  const api=c.RecoveryDeliveryScope,s=state(),p=packet();
  const result=api.plan(s,p);assert.equal(result.targets.length,1);assert.equal(result.targets[0].groupId,'GROUP');
  const nullProto=Object.create(null);nullProto.safe='kept';s.unknown=nullProto;assert.equal(api.plan(s,p).state.unknown.safe,'kept');
  for(const bad of [new Date(),new(class Example{constructor(){this.x=1;}})(),Object.create({x:1}),Object.assign(Object.create({constructor:Object}),{x:1})]){
    s.unknown=bad;assert.throws(()=>api.plan(s,p),e=>e.code==='unsafe-data');
  }
  let calls=0;const badProto={};Object.defineProperty(badProto,'constructor',{get(){calls++;return Object;}});s.unknown=Object.create(badProto);
  assert.throws(()=>api.plan(s,p),e=>e.code==='unsafe-data');assert.equal(calls,0);
});
test('old reconnection files stop before target resolution',()=>{
  const p=packet();p.version=1;fails('packet-version',()=>API.plan(state(),p));
});
test('missing recovery receipt reports only a bounded target ordinal',()=>{
  const s=state();s.recoveredShowSources={};assert.throws(()=>API.plan(s,packet()),e=>e.code==='source-receipt-mismatch'&&e.targetNumber===1&&e.message==='source-receipt-mismatch');
});
