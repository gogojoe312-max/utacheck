'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const API=require('../startup-local-publication-recovery.js');
const clone=x=>JSON.parse(JSON.stringify(x)),NOW=1791350000000;
const defaults=()=>({deviceId:'PRIVATE_DEVICE',members:[],groups:[],shows:[],songs:[],rsongs:[],notes:[],pubNotes:[],trash:[],
 memos:{},staffMemos:{},draws:{},recs:{},subs:{},subsMan:{},gsubs:{},subLib:{},rosters:{},groupOrder:[],folderOrder:[],
 plan:{start:'10:00',slots:[]},viewer:false,ghToken:'PRIVATE_TOKEN',bkKey:'PRIVATE_KEY'});
const publication=(extra={})=>({authorId:'PRIVATE_DEVICE',groupName:'PRIVATE_GROUP',src:'https://PRIVATE_SOURCE',
 members:[{name:'PRIVATE_MEMBER'}],rosters:{PRIVATE_GROUP:['PRIVATE_MEMBER']},groupOrder:['PRIVATE_GROUP'],folderOrder:['PRIVATE_FOLDER'],
 shows:[{id:'PRIVATE_SHOW',name:'PRIVATE_SHOW_NAME',folder:'PRIVATE_FOLDER',absent:['PRIVATE_MEMBER']}],
 lib:[{title:'PRIVATE_TITLE',credit:'PRIVATE_CREDIT',groups:{A:['PRIVATE_MEMBER']},order:['PRIVATE_MEMBER'],lines:[['A','PRIVATE_LYRIC'],['→','PRIVATE_LYRIC_2']]}],
 songs:[{showId:'PRIVATE_SHOW',libIdx:0,take:1,fromIdx:null}],focusShow:'PRIVATE_SHOW',
 notes:[{showId:'PRIVATE_SHOW',songIdx:0,lineIdx:0,lineEnd:1,memberNames:['PRIVATE_MEMBER'],tags:['pitch'],memo:'PRIVATE_NOTE',hand:{x:[1,2]},pitch:'1-2',from:null,to:null,at:1}],
 memos:[{showId:'PRIVATE_SHOW',songIdx:0,text:'PRIVATE_MEMO'}],
 subs:[{showId:'PRIVATE_SHOW',songIdx:0,lineIdx:1,names:['PRIVATE_MEMBER']}],
 gsubs:[{showId:'PRIVATE_SHOW',songIdx:0,block:'A',names:['PRIVATE_MEMBER']}],...extra});
const record=(extra={},seq=1,ordinal=0,body=publication())=>({state:{...defaults(),groups:[{id:'PRIVATE_GROUP_ID',name:'PRIVATE_GROUP',lastKey:JSON.stringify(body),key:'PRIVATE_GROUP_KEY'}],...extra},seq,ordinal});
function buildSong(parsed,context){
 const blocks=Object.fromEntries(Object.entries(parsed.groups||{}).map(([b,names])=>[b,names.map(name=>context.addMember(name).id)]));
 return {id:context.uid(),title:parsed.title,credit:parsed.credit,blocks,roster:(parsed.order||[]).map(name=>context.addMember(name).id),
  lines:parsed.lines.map(([label,t])=>({label,t,parts:label==='→'?blocks.A||[]:blocks[label]||[]}))};
}
const options=extra=>({buildSong,now:NOW,...extra});
const run=(records,extra)=>API.build(records,defaults(),options(extra));
function safe(result){
 const text=JSON.stringify({...result,packet:undefined});
 for(const secret of ['PRIVATE_','https://','ghToken','bkKey','lastKey','authorId'])assert(!text.includes(secret),'summary exposes '+secret);
}
test('cached body produces a detached candidate with exact notes, lyric, substitutes and focus bindings',()=>{
 const r=record(),before=JSON.stringify(r),d=defaults(),defaultsBefore=JSON.stringify(d),answer=API.build([r],d,options());
 assert.equal(answer.status,'ready');assert.equal(answer.packet.app,'utacheck');assert.equal(answer.packet.at,NOW);assert.equal(answer.packet.sourceDateUnknown,true);
 const s=answer.packet.state,so=s.songs[0],member=s.members[0];assert.equal(so.title,'PRIVATE_TITLE');assert.equal(so.lines[1].t,'PRIVATE_LYRIC_2');
 assert.equal(so.showId,'PRIVATE_SHOW');assert.equal(so.groupId,'PRIVATE_GROUP_ID');assert.equal(s.shows[0].groupId,'PRIVATE_GROUP_ID');assert.deepEqual(s.shows[0].absent,[member.id]);
 assert.equal(s.notes[0].songId,so.id);assert.deepEqual(s.notes[0].memberIds,[member.id]);assert.equal(s.notes[0].lineIdx,0);assert.equal(s.notes[0].lineEnd,1);
 assert.equal(s.notes[0].memo,'PRIVATE_NOTE');assert.deepEqual(s.notes[0].hand,{x:[1,2]});assert.equal(s.memos['PRIVATE_SHOW|'+so.id],'PRIVATE_MEMO');
 assert.deepEqual(s.subs['PRIVATE_SHOW|'+so.id][1],[member.id]);assert.deepEqual(s.gsubs['PRIVATE_SHOW|'+so.id].A,[member.id]);assert.equal(s.showId,'PRIVATE_SHOW');
 assert.equal(JSON.stringify(r),before);assert.equal(JSON.stringify(d),defaultsBefore);safe(answer);
 so.lines[0].t='changed';assert.equal(JSON.stringify(r),before);
});
test('highest validated sequence supplies original metadata and lower corrupt records are counted safely',()=>{
 const low=record({kbps:64},2,0),high=record({kbps:192,unknown:{value:'PRIVATE_SETTING'}},3,1),bad={seq:4,ordinal:2,state:{songs:'PRIVATE_CORRUPT'}};
 const result=run([low,high,bad]);assert.equal(result.status,'ready');assert.equal(result.packet.state.kbps,192);assert.deepEqual(result.packet.state.unknown,{value:'PRIVATE_SETTING'});
 assert.equal(result.summary.invalidRecords,1);assert.equal(result.summary.duplicates,1);safe(result);
});
test('canonical same-group copies deduplicate independent of object-key order and publication version',()=>{
 const body=publication(),reordered=Object.fromEntries(Object.entries(body).reverse());reordered.version=NOW-1;
 const result=run([record({},1,0,body),record({},2,1,reordered)]);assert.equal(result.status,'ready');assert.equal(result.packet.state.songs.length,1);assert.equal(result.summary.duplicates,1);safe(result);
});
test('equal-sequence differing originals cannot be selected by ordinal or date',()=>{
 const result=run([record({kbps:64},2,0),record({kbps:192},2,1)]);assert.equal(result.status,'base-conflict');assert.equal(result.packet,undefined);safe(result);
});
test('same-group differing body stops instead of picking a newer source',()=>{
 const newer=publication({memos:[{showId:'PRIVATE_SHOW',songIdx:0,text:'PRIVATE_NEW_MEMO'}]});
 const result=run([record({},1,0),record({},10,1,newer)]);assert.equal(result.status,'publication-conflict');assert.equal(result.packet,undefined);safe(result);
});
test('all valid originals are checked for work even when the highest sequence is empty',()=>{
 for(const work of [{songs:[{id:'OLD_SONG',lines:[]}]},{rsongs:[{id:'OLD_AUDIO',lines:[]}]},{notes:[{id:'OLD_NOTE'}]},
  {pubNotes:[{id:'OLD_PUBLIC'}]},{trash:[{id:'OLD_TRASH'}]},{memos:{old:'old'}},{staffMemos:{old:'old'}},{draws:{old:[]}},
  {recs:{old:{}}},{plan:{slots:[{}]}}]){
  const result=run([record(work,1,0),record({},2,1)]);assert.equal(result.status,'original-nonempty');assert.equal(result.packet,undefined);safe(result);
 }
});
test('optional non-work predicate preserves every private map and setting without guessing old IDs',()=>{
 const privateFields={memos:{'OLD_SHOW|OLD_SONG':'PRIVATE_OLD'},staffMemos:{one:'PRIVATE_STAFF'},draws:{one:[1]},recs:{OLD_SONG:{clip:'PRIVATE_CLIP'}},
  rsongs:[{id:'OLD_RECORDING',lines:[]}],trash:[{id:'OLD_DELETED'}],subsMan:{one:[1]},subLib:{one:{value:2}},
  plan:{start:'14:00',slots:[{name:'PRIVATE_PLAN'}]},liveShow:'OLD_SHOW',rosters:{OLD_GROUP:['OLD_NAME']}};
 const source=record(privateFields),before=JSON.stringify(source),result=run([source],{hasWork:s=>!!s.songs?.length||!!s.notes?.length});
 assert.equal(result.status,'ready');for(const field of ['staffMemos','draws','recs','rsongs','trash','subsMan','subLib','plan','liveShow'])assert.deepEqual(result.packet.state[field],privateFields[field]);
 assert.equal(result.packet.state.memos['OLD_SHOW|OLD_SONG'],'PRIVATE_OLD');assert.deepEqual(result.packet.state.rosters.OLD_GROUP,['OLD_NAME']);
 assert(!result.packet.state.songs.some(s=>s.id==='OLD_SONG'));assert.equal(result.packet.state.recs[result.packet.state.songs[0].id],undefined);
 assert.equal(JSON.stringify(source),before);safe(result);
});
test('orphaned private map IDs are reserved so generated songs never overwrite their entries',()=>{
 const songId='local-pub-0-0-0-song',fields=['memos','staffMemos','draws','recs','subs','subsMan','gsubs','subLib'];
 const privateFields=Object.fromEntries(fields.map(field=>[field,{['PRIVATE_SHOW|'+songId]:{PRIVATE_ORPHAN:[1,2]},[songId]:{PRIVATE_SINGLE:[3]}}]));
 const original=record(privateFields),before=JSON.stringify(original),mapBytes=Object.fromEntries(fields.map(field=>[field,JSON.stringify(original.state[field])]));
 const answer=run([original],{hasWork:s=>!!s.songs?.length||!!s.notes?.length});assert.equal(answer.status,'ready');const s=answer.packet.state;
 assert.notEqual(s.songs[0].id,songId);assert.equal(s.songs[0].id,songId+'-1');
 for(const field of fields){
  assert.deepEqual(s[field]['PRIVATE_SHOW|'+songId],privateFields[field]['PRIVATE_SHOW|'+songId]);
  assert.deepEqual(s[field][songId],privateFields[field][songId]);assert.equal(JSON.stringify(original.state[field]),mapBytes[field]);
 }
 assert.equal(s.notes[0].songId,s.songs[0].id);assert.equal(s.memos['PRIVATE_SHOW|'+s.songs[0].id],'PRIVATE_MEMO');
 assert.equal(JSON.stringify(original),before);safe(answer);
});
test('default recovery also protects orphaned subs and gsubs whose IDs collide with the new song prefix',()=>{
 const songId='local-pub-0-0-0-song',oldSubs={['PRIVATE_SHOW|'+songId]:{0:['PRIVATE_OLD_MEMBER']}},oldGsubs={['PRIVATE_SHOW|'+songId]:{A:['PRIVATE_OLD_MEMBER']}};
 const original=record({subs:oldSubs,gsubs:oldGsubs}),before=JSON.stringify(original),answer=run([original]);assert.equal(answer.status,'ready');
 const s=answer.packet.state;assert.notEqual(s.songs[0].id,songId);assert.deepEqual(s.subs['PRIVATE_SHOW|'+songId],oldSubs['PRIVATE_SHOW|'+songId]);
 assert.deepEqual(s.gsubs['PRIVATE_SHOW|'+songId],oldGsubs['PRIVATE_SHOW|'+songId]);assert.equal(JSON.stringify(original),before);safe(answer);
});
test('existing show private metadata, absent IDs, route and opt-out remain authoritative',()=>{
 const show={id:'PRIVATE_SHOW',name:'PRIVATE_LOCAL_NAME',groupId:'OLD_GROUP',deliveryMode:'song',deliveryGroupId:'PRIVATE_PRIVATE_ROUTE',hidden:true,nopub:true,absent:['OLD_MEMBER_ID'],privateMemo:'PRIVATE_SHOW_MEMO'};
 const result=run([record({shows:[show],showId:'PRIVATE_SHOW'})]);assert.equal(result.status,'ready');assert.deepEqual(result.packet.state.shows[0],show);assert.equal(result.packet.state.showId,'PRIVATE_SHOW');safe(result);
});
test('two original empty shows stay intact while recovery selects a show with actual lyrics',()=>{
 const shows=[{id:'OLD_EMPTY_SHOW_1',name:'PRIVATE_EMPTY_1',hidden:true,privateMemo:'PRIVATE_EMPTY_MEMO'},
  {id:'OLD_EMPTY_SHOW_2',name:'PRIVATE_EMPTY_2',groupId:'OLD_GROUP',deliveryMode:'song',nopub:true,absent:['OLD_MEMBER']}];
 const original=record({shows,showId:'OLD_EMPTY_SHOW_2',viewer:true,recMode:true}),before=JSON.stringify(original),result=run([original]);
 assert.equal(result.status,'ready');const s=result.packet.state;
 assert.equal(s.showId,'PRIVATE_SHOW');assert(s.songs.some(so=>so.showId===s.showId));assert.deepEqual(s.shows.slice(0,2),shows);
 assert.deepEqual(s.shows.map(sh=>sh.id),['OLD_EMPTY_SHOW_1','OLD_EMPTY_SHOW_2','PRIVATE_SHOW']);
 assert.equal(s.viewer,false);assert.equal(s.recMode,false);assert.equal(s.songs.length,1);assert.equal(JSON.stringify(original),before);safe(result);
});
function secondPublication(showId='PRIVATE_SECOND_SHOW'){
 const body=publication({groupName:'PRIVATE_SECOND_GROUP',rosters:{},groupOrder:['PRIVATE_SECOND_GROUP']});
 body.shows[0].id=showId;body.shows[0].name=showId==='PRIVATE_SHOW'?'PRIVATE_SHOW_NAME':'PRIVATE_SECOND_NAME';
 for(const list of ['songs','notes','memos','subs','gsubs'])for(const x of body[list])x.showId=showId;
 body.focusShow=showId;return body;
}
function twoPublications(extra={},sameFocus=false){
 const r=record(extra);r.state.groups.push({id:'PRIVATE_SECOND_ID',name:'PRIVATE_SECOND_GROUP',lastKey:JSON.stringify(secondPublication(sameFocus?'PRIVATE_SHOW':undefined))});return r;
}
test('existing group focus selects its recovered show while retaining both publication datasets',()=>{
 const result=run([twoPublications({groupId:'PRIVATE_SECOND_ID',showId:'OLD_EMPTY',shows:[{id:'OLD_EMPTY',name:'PRIVATE_EMPTY'}]})]);
 assert.equal(result.status,'ready');assert.equal(result.packet.state.showId,'PRIVATE_SECOND_SHOW');assert.equal(result.packet.state.songs.length,2);
 assert.equal(result.packet.state.notes.length,2);assert.deepEqual(new Set(result.packet.state.songs.map(s=>s.showId)),new Set(['PRIVATE_SHOW','PRIVATE_SECOND_SHOW']));safe(result);
});
test('different group focuses fall back to an actual first recovered song and shared focus retains all songs',()=>{
 const different=run([twoPublications({showId:'OLD_EMPTY',shows:[{id:'OLD_EMPTY',privateMemo:'PRIVATE_EMPTY'}]})]);
 assert.equal(different.status,'ready');assert.equal(different.packet.state.showId,different.packet.state.songs[0].showId);assert.equal(different.packet.state.songs.length,2);
 const shared=run([twoPublications({showId:'OLD_EMPTY',shows:[{id:'OLD_EMPTY',privateMemo:'PRIVATE_EMPTY'}]},true)]);
 assert.equal(shared.status,'ready');assert.equal(shared.packet.state.showId,'PRIVATE_SHOW');assert.equal(shared.packet.state.songs.length,2);assert.equal(shared.packet.state.notes.length,2);
 assert.equal(shared.packet.state.shows.length,2);assert.equal(shared.packet.state.shows[0].id,'OLD_EMPTY');safe(shared);
});
test('existing selection with recovered songs is retained even if the cached focus names another show',()=>{
 const body=publication(),other={...body.shows[0],id:'PRIVATE_SECOND_SHOW',name:'PRIVATE_SECOND_NAME'};body.shows.push(other);
 body.songs.push({...body.songs[0],showId:other.id});
 const result=run([record({showId:other.id,shows:[{id:other.id,name:'PRIVATE_LOCAL_SECOND'}]},1,0,body)]);
 assert.equal(result.status,'ready');assert.equal(result.packet.state.showId,other.id);assert.equal(result.packet.state.songs.length,2);assert.equal(result.packet.state.shows[0].name,'PRIVATE_LOCAL_SECOND');safe(result);
});
test('existing unique-name member is reused, ambiguous names and reused IDs stop',()=>{
 const member={id:'OLD_MEMBER',name:'PRIVATE_MEMBER',privateFlag:true},good=run([record({members:[member]})]);
 assert.equal(good.status,'ready');assert.equal(good.packet.state.members.length,1);assert.deepEqual(good.packet.state.members[0],member);assert.deepEqual(good.packet.state.notes[0].memberIds,['OLD_MEMBER']);
 for(const members of [[member,{id:'OTHER_MEMBER',name:'PRIVATE_MEMBER'}],[member,{id:'OLD_MEMBER',name:'PRIVATE_DIFFERENT'}]]){
  const result=run([record({members})]);assert.equal(result.status,'member-conflict');assert.equal(result.packet,undefined);safe(result);
 }
});
test('another author/device stops and missing identification offers only safe counts',()=>{
 for(const extra of [{authorId:'PRIVATE_OTHER_DEVICE'},{authorId:undefined}]){
  const result=run([record({},1,0,publication(extra))]);assert.equal(result.status,extra.authorId?'identity-conflict':'identity-unconfirmed');assert.equal(result.packet,undefined);safe(result);
 }
 const result=run([record({deviceId:''})]);assert.equal(result.status,'identity-unconfirmed');assert.equal(result.summary.counts.songs,1);assert.equal(result.packet,undefined);safe(result);
});
test('known publication dates never turn cached payloadKey into a claimed latest date',()=>{
 const result=run([record({},1,0,publication({version:NOW-999,publishedAt:NOW-888}))]);assert.equal(result.status,'ready');assert.equal(result.packet.at,NOW);assert.equal(result.packet.sourceDateUnknown,true);
 assert.equal(run([record()],{now:undefined}).status,'creation-time-required');
});
test('packed originals decode on detached copies and full packed work is never overlaid',()=>{
 const packed=record({songs:[{id:'OLD_SONG',L:0}],songLib:[[{t:'PRIVATE_OLD_LYRIC'}]]}),before=JSON.stringify(packed);
 assert.equal(run([packed]).status,'original-nonempty');assert.equal(JSON.stringify(packed),before);
 const emptyPacked=record({songLib:[]}),result=run([emptyPacked]);assert.equal(result.status,'ready');assert.equal(result.packet.state.songLib,undefined);assert.equal(emptyPacked.state.songLib.length,0);
});
test('different groups sharing consistent show metadata use separate deterministic song IDs and routes',()=>{
 const body=publication({groupName:'PRIVATE_SECOND_GROUP',rosters:{PRIVATE_SECOND_GROUP:['PRIVATE_MEMBER']},groupOrder:['PRIVATE_SECOND_GROUP']}),r=record();
 r.state.groups.push({id:'PRIVATE_SECOND_ID',name:'PRIVATE_SECOND_GROUP',lastKey:JSON.stringify(body)});
 const result=run([r]);assert.equal(result.status,'ready');assert.equal(result.packet.state.shows.length,1);assert.equal(result.packet.state.shows[0].deliveryMode,'song');
 assert.equal(result.packet.state.songs.length,2);assert.notEqual(result.packet.state.songs[0].id,result.packet.state.songs[1].id);
 assert.deepEqual(result.packet.state.songs.map(s=>s.deliveryGroupId),['PRIVATE_GROUP_ID','PRIVATE_SECOND_ID']);
 assert.equal(new Set(result.packet.state.notes.map(n=>n.songId)).size,2);safe(result);
 const repeat=run([clone(r)]);assert.deepEqual(repeat.packet,result.packet);
});
test('different groups with conflicting metadata for the same show stop',()=>{
 const body=publication({groupName:'PRIVATE_SECOND_GROUP',rosters:{},shows:[{id:'PRIVATE_SHOW',name:'PRIVATE_DIFFERENT_NAME',absent:['PRIVATE_MEMBER']}]}),r=record();
 r.state.groups.push({id:'PRIVATE_SECOND_ID',name:'PRIVATE_SECOND_GROUP',lastKey:JSON.stringify(body)});
 const result=run([r]);assert.equal(result.status,'show-conflict');assert.equal(result.packet,undefined);safe(result);
});
test('fromIdx rebinding is local and valid acyclic aliases preserve the exact source song',()=>{
 const body=publication({songs:[{showId:'PRIVATE_SHOW',libIdx:0,take:1,fromIdx:null},{showId:'PRIVATE_SHOW',libIdx:0,take:2,fromIdx:0}]}),result=run([record({},1,5,body)]);
 assert.equal(result.status,'ready');assert.equal(result.packet.state.songs[1].from,result.packet.state.songs[0].id);assert(result.packet.state.songs.every(s=>s.id.startsWith('local-pub-5-0-')));safe(result);
});
test('strict publication references reject missing, out-of-range, self and cyclic indexes',()=>{
 const changes=[b=>{b.songs[0].libIdx=-1;},b=>{b.songs[0].libIdx=1;},b=>{b.songs[0].showId='OTHER_SHOW';},
  b=>{b.songs[0].fromIdx=0;},b=>{b.songs[0].fromIdx=1;},b=>{b.songs[0].fromIdx=1;b.songs.push({showId:'PRIVATE_SHOW',libIdx:0,fromIdx:0});},
  b=>{b.notes[0].songIdx=1;},b=>{b.notes[0].lineIdx=2;},b=>{b.notes[0].lineEnd=2;},b=>{b.notes[0].showId='OTHER_SHOW';},
  b=>{b.memos[0].songIdx=99;},b=>{b.subs[0].lineIdx=-1;},b=>{b.gsubs[0].block='UNKNOWN_BLOCK';},
  b=>{b.gsubs[0].names='PRIVATE_BAD';},b=>{b.memos[0].text={};},b=>{b.focusShow='OTHER_SHOW';},
  b=>{b.lib[0].lines[0]=[{},'lyric'];},b=>{b.notes[0].from=0;b.notes[0].to=999;},b=>{b.notes[0].memberNames={};}];
 for(const change of changes){const body=publication();change(body);const result=run([record({},1,0,body)]);assert.equal(result.status,'publication-invalid');assert.equal(result.packet,undefined);safe(result);}
});
test('malformed cached JSON and wrong enclosing group name stop without leaking payloads',()=>{
 const malformed=record();malformed.state.groups[0].lastKey='PRIVATE_NOT_JSON';assert.equal(run([malformed]).status,'publication-invalid');
 const result=run([record({},1,0,publication({groupName:'PRIVATE_DIFFERENT_GROUP'}))]);assert.equal(result.status,'publication-invalid');safe(result);
});
test('dangerous object keys and identifiers cannot pollute local dictionaries or prototypes',()=>{
 for(const dangerous of ['__proto__','constructor','prototype']){
  const r=record(),body=publication();body.shows[0].id=dangerous;body.songs[0].showId=dangerous;body.notes=[];body.memos=[];body.subs=[];body.gsubs=[];body.focusShow=dangerous;
  r.state.groups[0].lastKey=JSON.stringify(body);assert.equal(run([r]).status,'publication-invalid');
  const poisoned=record();poisoned.state.groups[0].lastKey=JSON.stringify(publication()).replace('"lib":','"'+dangerous+'":{"polluted":true},"lib":');
  const result=run([poisoned]);assert.equal(result.packet,undefined);safe(result);
 }
 assert.equal({}.polluted,undefined);
});
test('callback errors and validation failures return fixed codes without error text',()=>{
 for(const extra of [{buildSong:()=>{throw Error('PRIVATE_BUILDER_ERROR');}},{buildSong:()=>({lines:[]})},
  {validateState:()=>{throw Error('PRIVATE_VALIDATOR_ERROR');}}]){
  const result=run([record()],extra);assert.equal(result.packet,undefined);safe(result);
 }
});
test('module is inert under forbidden global state, storage, network and clock capabilities',()=>{
 const source=fs.readFileSync(__dirname+'/../startup-local-publication-recovery.js','utf8');
 assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|indexedDB|localStorage|sessionStorage|save|idbPut|prompt|alert|console\.log|Date\.now)\s*\(/);
 let touches=0;const deny=new Proxy({},{get(){touches++;throw Error('PRIVATE_FORBIDDEN');},set(){touches++;throw Error('PRIVATE_FORBIDDEN');}});
 const context=vm.createContext({S:deny,U:deny,indexedDB:deny,localStorage:deny,fetch:()=>{touches++;throw Error('PRIVATE_NETWORK');}});
 vm.runInContext(source,context);const answer=context.StartupLocalPublicationRecovery.build([record()],defaults(),options());
 assert.equal(answer.status,'ready');assert.equal(touches,0);safe(answer);
});
test('actual application buildSong uses only injected local names and IDs during recovery',()=>{
 const source=fs.readFileSync(__dirname+'/../app.js','utf8'),block=(a,b)=>{
  const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start);return source.slice(start,end);
 };
 let touches=0;const deny=new Proxy({},{get(){touches++;throw Error('PRIVATE_SHARED_READ');},set(){touches++;throw Error('PRIVATE_SHARED_WRITE');}});
 const forbidden=()=>{touches++;throw Error('PRIVATE_GLOBAL_ALLOCATION');},context=vm.createContext({S:deny,U:deny,addMember:forbidden,uid:forbidden});
 vm.runInContext(source.match(/^const hash32 = .*$/m)[0],context);
 vm.runInContext(block('function songSig(so) {','const sigOf'),context);
 vm.runInContext(block('const NAMESEP =','const cleanName'),context);
 vm.runInContext(block('function buildSong(parsed, local) {','// 拡張子が二重'),context);
 const body=publication();body.lib[0].sections=[{lineIdx:1,name:'PRIVATE_SECTION'}];
 const original=record({shows:[{id:'OLD_EMPTY',privateMemo:'PRIVATE_EMPTY'}],showId:'OLD_EMPTY',viewer:true,recMode:true},1,0,body),before=JSON.stringify(original);
 const answer=run([original],{buildSong:context.buildSong});assert.equal(answer.status,'ready');const s=answer.packet.state,so=s.songs[0];
 assert.equal(s.showId,'PRIVATE_SHOW');assert.equal(so.lines[1].sec,'PRIVATE_SECTION');assert.deepEqual(so.lines[0].parts,[s.members[0].id]);
 assert.deepEqual(so.lines[1].parts,[s.members[0].id]);assert.equal(typeof so.sig,'number');assert.equal(s.viewer,false);assert.equal(s.recMode,false);
 assert.equal(touches,0);assert.equal(JSON.stringify(original),before);assert.equal(so.xls,undefined);assert.equal(so.xlsSourceId,undefined);safe(answer);
});
test('actual trimming importer retains exact recovery text and zero/nonzero note character ranges',()=>{
 const source=fs.readFileSync(__dirname+'/../app.js','utf8'),block=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
 let touches=0;const forbidden=()=>{touches++;throw Error('PRIVATE_GLOBAL_ACCESS');},context=vm.createContext({addMember:forbidden,uid:forbidden});
 vm.runInContext(source.match(/^const hash32 = .*$/m)[0],context);vm.runInContext(block('function songSig(so) {','const sigOf'),context);
 vm.runInContext(block('const NAMESEP =','const cleanName'),context);vm.runInContext(block('function buildSong(parsed, local) {','// 拡張子が二重'),context);
 const body=publication();body.lib[0].lines=[['A','  PRIVATE_LYRIC  '],['','   '],['','']];body.notes=[
  {...body.notes[0],lineIdx:0,lineEnd:null,from:0,to:0},
  {...body.notes[0],lineIdx:0,lineEnd:null,from:2,to:6},
  {...body.notes[0],lineIdx:1,lineEnd:null,from:1,to:3}];
 const original=record({},1,0,body),before=JSON.stringify(original),answer=run([original],{buildSong:context.buildSong});assert.equal(answer.status,'ready');
 const s=answer.packet.state,so=s.songs[0];assert.deepEqual(so.lines.map(line=>line.t),body.lib[0].lines.map(row=>row[1]));
 assert.equal(so.lines[0].t.length,body.lib[0].lines[0][1].length);assert.equal(so.lines[0].gap,undefined);assert.equal(so.lines[1].gap,undefined);assert.equal(so.lines[2].gap,true);
 assert.equal(so.sig,0);assert.notEqual(context.songSig(so),0);
 assert.deepEqual(s.notes.map(n=>[n.lineIdx,n.from,n.to]),[[0,0,0],[0,2,6],[1,1,3]]);
 assert.equal(so.lines[s.notes[1].lineIdx].t.slice(s.notes[1].from,s.notes[1].to),'PRIV');assert.equal(so.lines[1].t.slice(1,3),'  ');
 assert.equal(touches,0);assert.equal(JSON.stringify(original),before);safe(answer);
});
