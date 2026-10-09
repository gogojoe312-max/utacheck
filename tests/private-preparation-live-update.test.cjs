'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const fs=require('node:fs'),vm=require('node:vm');
const P=require('../private-preparation.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
const line=(t,extra={})=>({t,parts:['member-a'],sec:'verse',...extra});
const song=(id,title)=>({id,title,showId:'show-a',groupId:'group-a',take:7,roster:['member-a'],blocks:{verse:['member-a']},lines:[line('First synthetic line'),line('Second synthetic line',{main:['member-a'],extra:[],lcell:'B8'}),line('Third synthetic line')],sig:42,xls:1,xlsAt:5,custom:{keep:true}});
function current(){return {
 groups:[{id:'group-a',name:'Private group',nopub:true,custom:'keep'},{id:'other-group',name:'Other'}],
 shows:[{id:'show-a',name:'Private show',groupId:'group-a',nopub:1,date:'2031-02-03',folder:'Keep folder'},{id:'other-show',name:'Other',groupId:'other-group'}],
 members:[{id:'member-a',name:'Synthetic Member',custom:'keep'}],
 songs:[song('song-a','First song'),{id:'other-song',title:'Unrelated',groupId:'other-group',showId:'other-show',lines:[line('Unrelated text')]},song('song-b','Second song')],
 rsongs:[{id:'recording-song',title:'Recording',lines:[line('Recorded words')],take:4}],
 notes:[{id:'note-a',songId:'song-a',showId:'show-a',lineIdx:0,lineEnd:null,from:1,to:3,memo:'Keep note',tags:['pitch'],memberIds:['member-a'],at:4.2}],
 pubNotes:[{id:'note-b',songId:'song-a',showId:'show-a',lineIdx:2,lineEnd:2,memo:'Keep received note'}],
 draws:{'other-show|other-song':[{c:'blue',p:[1,2,3,4]}]},recs:{'show-a|song-a':{clip:'existing-clip',takes:[1,7]}},
 subs:{'show-a|song-a':{1:['member-a']}},subsMan:{'show-a|song-a':{1:1}},gsubs:{'show-a|song-a':{'member-a':'member-a'}},
 staffMemos:{'show-a|song-a':'Keep private memo'},memos:{'show-a|song-a':'Keep summary'},trash:[{id:'keep-trash'}],
 plan:{slots:[{id:'keep-slot',a0:10,a1:20,takes:{verse:3}}]},groupId:'group-a',showId:'show-a',
 ghToken:'synthetic-existing-token',bkKey:'synthetic-existing-key',bkGistId:'synthetic-existing-destination',autoPub:true,
 unrelated:{keep:'exact'},privatePreparations:{earlier:{sha256:'f'.repeat(64),type:'live-addition',at:1}}
};}
function packet(state=current()){
 const so=state.songs.find(x=>x.id==='song-a');
 return {app:'utacheck-live-update',version:1,groupId:'group-a',showId:'show-a',
 order:{before:['song-a','song-b'],after:['song-b','song-a']},
 songs:[{id:so.id,expectedTitle:so.title,beforeLines:clone(so.lines),afterText:so.lines.map((l,i)=>i===1?'Corrected synthetic line':l.t)}]};
}
async function operation(p,id='synthetic-live-update'){return {id,type:'live-update',sha256:await P.digest(p,webcrypto),packet:p};}
const rejects=(code,fn)=>assert.throws(fn,e=>e.preparationCode===code);
async function rejectsUnchanged(state,p,code){const before=clone(state),op=await operation(p);freeze(state);freeze(op);rejects(code,()=>P.apply(state,op,{},99));assert.deepEqual(state,before);}

test('live-update is accepted by the immutable owner-only manifest contract',async()=>{
 const manifest={app:'utacheck-private-preparation',version:1,owner:'synthetic-owner',revision:'synthetic-revision',createdAt:'2031-01-01T00:00:00Z',operations:[await operation(packet())]};
 assert.deepEqual(await P.validate(manifest,'synthetic-owner',webcrypto),manifest);
 const tampered=clone(manifest);tampered.operations[0].packet.songs[0].afterText[1]='Tampered';
 await assert.rejects(P.validate(tampered,'synthetic-owner',webcrypto),e=>e.preparationCode==='HASH_MISMATCH');
});
test('a combined LIVE correction preserves every existing record, identity and unrelated song slot',async()=>{
 const state=current(),before=clone(state),p=packet(state),op=await operation(p);freeze(state);freeze(op);
 const result=P.apply(state,op,{},99);
 assert.equal(result.status,'applied');assert.equal(result.songs,1);assert.equal(result.orderChanged,true);
 assert.deepEqual(state,before);
 assert.deepEqual(result.state.songs.map(s=>s.id),['song-b','other-song','song-a']);
 assert.equal(result.state.songs[0],state.songs[2]);assert.equal(result.state.songs[1],state.songs[1]);
 for(const key of Object.keys(state).filter(k=>!['songs','privatePreparations'].includes(k)))assert.equal(result.state[key],state[key],key);
 const updated=result.state.songs[2];
 for(const key of Object.keys(state.songs[0]).filter(k=>!['lines','sig'].includes(k)))assert.equal(updated[key],state.songs[0][key],key);
 assert.equal(updated.lines[0],state.songs[0].lines[0]);assert.equal(updated.lines[2],state.songs[0].lines[2]);
 assert.deepEqual(updated.lines[1],{...before.songs[0].lines[1],t:'Corrected synthetic line'});
 assert.deepEqual(result.state.privatePreparations.earlier,before.privatePreparations.earlier);
 assert.deepEqual(result.state.privatePreparations[op.id],{sha256:op.sha256,type:'live-update',at:99});
});
test('a corrected lyric refreshes the exact native song signature, including Unicode and gaps',async()=>{
 const state=current();state.songs[0].lines.push(line('',{gap:true}));const p=packet(state);p.songs[0].afterText[1]='Synthetic \ud83c\udfb5 correction';
 const updated=P.apply(state,await operation(p),{},99).state.songs.find(s=>s.id==='song-a');
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const signature=source.slice(source.indexOf('function songSig(so) {'),source.indexOf('\nconst sigOf ='));
 const hash=source.match(/const hash32 = [^\n]+/)[0];
 const context={song:updated};vm.runInNewContext(signature+'\n'+hash+'\nresult=songSig(song);',context);
 assert.equal(updated.sig,context.result);assert.notEqual(updated.sig,42);
});
test('a receipt makes repeats idempotent and preserves subsequent local work',async()=>{
 const op=await operation(packet()),first=P.apply(current(),op,{},99).state;
 first.songs.find(s=>s.id==='song-a').lines[1].t='Later local edit';first.notes.push({id:'later-note'});
 const second=P.apply(first,op,{},100);assert.equal(second.status,'already-applied');assert.equal(second.state,first);
 rejects('OPERATION_ID_REUSED',()=>P.apply(first,{...op,sha256:'a'.repeat(64)}, {},100));
});
test('the after state without its receipt is not silently adopted as a verified before state',async()=>{
 const state=current(),p=packet(state),after=P.apply(state,await operation(p),{},99).state;delete after.privatePreparations['synthetic-live-update'];
 await rejectsUnchanged(after,p,'LIVE_BEFORE_CONFLICT');
});
test('order-only update is a permutation and leaves all song material and annotations untouched',async()=>{
 const state=current(),p=packet(state);delete p.songs;
 state.draws['show-a|song-a|7']=[{p:[1,2]}];
 const result=P.apply(state,await operation(p),{},99);
 assert.equal(result.songs,0);assert.equal(result.orderChanged,true);
 assert.equal(result.state.songs[2],state.songs[0]);assert.equal(result.state.notes,state.notes);assert.equal(result.state.draws,state.draws);
});
test('lyrics-only update preserves complete setlist order',async()=>{
 const state=current(),p=packet(state);delete p.order;
 const result=P.apply(state,await operation(p),{},99);
 assert.deepEqual(result.state.songs.map(s=>s.id),state.songs.map(s=>s.id));assert.equal(result.orderChanged,false);
});
test('explicit unchanged values can receive a first receipt without replacing song objects',async()=>{
 const state=current(),p=packet(state);p.order.after=p.order.before.slice();p.songs[0].afterText=p.songs[0].beforeLines.map(l=>l.t);
 const result=P.apply(state,await operation(p),{},99);
 assert.equal(result.songs,0);assert.equal(result.orderChanged,false);state.songs.forEach((so,i)=>assert.equal(result.state.songs[i],so));
 assert.ok(result.state.privatePreparations['synthetic-live-update']);
});
test('key ordering in a complete before-line value is irrelevant',async()=>{
 const state=current(),p=packet(state);p.songs[0].beforeLines=p.songs[0].beforeLines.map(l=>Object.fromEntries(Object.entries(l).reverse()));
 assert.equal(P.apply(state,await operation(p),{},99).status,'applied');
});
test('missing, duplicated and cross-mode target identities fail before any modification',async()=>{
 for(const edit of [s=>s.groups.shift(),s=>s.groups.push(clone(s.groups[0])),s=>s.shows.shift(),s=>s.shows.push(clone(s.shows[0])),
  s=>s.songs.push(clone(s.songs[0])),s=>s.rsongs.push(clone(s.songs[0])),s=>s.songs=s.songs.filter(x=>x.showId!=='show-a'),s=>s.songs=null]){
  const state=current(),p=packet(state);edit(state);await rejectsUnchanged(state,p,'LIVE_IDENTITY_CONFLICT');
 }
});
test('group/show/song membership is explicit and mixed or moved identities conflict',async()=>{
 for(const edit of [s=>s.shows[0].groupId='other-group',s=>s.songs[0].groupId='other-group',s=>s.songs[2].groupId='other-group']){
  const state=current(),p=packet(state);edit(state);await rejectsUnchanged(state,p,'LIVE_MEMBERSHIP_CONFLICT');
 }
 const state=current(),p=packet(state);delete p.order;p.songs[0].id='other-song';await rejectsUnchanged(state,p,'LIVE_MEMBERSHIP_CONFLICT');
});
test('both target group and show must already be explicitly private',async()=>{
 for(const edit of [s=>delete s.groups[0].nopub,s=>s.groups[0].nopub=false,s=>delete s.shows[0].nopub,s=>s.shows[0].nopub='true']){
  const state=current(),p=packet(state);edit(state);await rejectsUnchanged(state,p,'LIVE_NOT_PRIVATE');
 }
});
test('local setlist edits, titles, line text, assignments and import metadata cannot be overwritten',async()=>{
 for(const edit of [s=>s.songs.reverse(),s=>s.songs[0].title='Local title',s=>s.songs[0].lines[1].t='Local words',s=>s.songs[0].lines[1].parts=[],
  s=>s.songs[0].lines[1].lcell='B9',s=>s.songs[0].lines.push(line('New local line')),s=>s.songs[0].lines[0].custom='Local metadata']){
  const state=current(),p=packet(state);edit(state);await rejectsUnchanged(state,p,'LIVE_BEFORE_CONFLICT');
 }
});
test('invalid permutations cannot add, omit, duplicate, infer or import song identities',async()=>{
 for(const [edit,code]of [[p=>p.order.after.pop(),'INVALID_OPERATION'],[p=>p.order.after.push('other-song'),'INVALID_OPERATION'],
  [p=>p.order.after=['song-a','song-a'],'INVALID_OPERATION'],[p=>p.order.before.reverse(),'LIVE_BEFORE_CONFLICT'],
  [p=>p.order.after[0]='other-song','LIVE_MEMBERSHIP_CONFLICT'],[p=>p.order.after[0]='missing-song','LIVE_MEMBERSHIP_CONFLICT'],
  [p=>p.order.before[0]='__proto__','INVALID_OPERATION']]){
  const state=current(),p=packet(state);edit(p);await rejectsUnchanged(state,p,code);
 }
});
test('line count changes and unsupported identity, assignment, metadata or deletion fields are refused',async()=>{
 for(const [edit,code]of [[p=>p.songs[0].afterText.push('Inserted line'),'INVALID_OPERATION'],[p=>p.songs[0].afterText.pop(),'INVALID_OPERATION'],
  [p=>p.songs[0].afterText[1]={t:'No new line records'},'INVALID_OPERATION'],[p=>p.songs[0].afterLines=[],'INVALID_MANIFEST'],
  [p=>p.songs[0].roster=[],'INVALID_MANIFEST'],[p=>p.songs[0].title='Changed','INVALID_MANIFEST'],[p=>p.songs[0].remove=true,'INVALID_MANIFEST'],
  [p=>p.songs.push(clone(p.songs[0])),'INVALID_OPERATION'],[p=>p.songs=[],'INVALID_OPERATION'],[p=>{delete p.songs;delete p.order;},'INVALID_OPERATION'],
  [p=>p.group={nopub:true},'INVALID_MANIFEST'],[p=>p.version=2,'INVALID_OPERATION']]){
  const state=current(),p=packet(state);edit(p);await rejectsUnchanged(state,p,code);
 }
});
test('a lyric change to any locally or remotely annotated row or range conflicts',async()=>{
 for(const note of [{lineIdx:1},{lineIdx:0,lineEnd:2},{lineIdx:1,from:0,to:2},{lineIdx:1,hand:{text:'Keep handwriting'}}]){
  for(const key of ['notes','pubNotes']){
   const state=current(),p=packet(state);state[key].push({id:'new-note',songId:'song-a',showId:'show-a',...note});
   await rejectsUnchanged(state,p,'LIVE_ANNOTATION_CONFLICT');
  }
 }
});
test('an unrecognizable existing note address fails closed without inferring its location',async()=>{
 for(const note of [{lineIdx:-1},{lineIdx:999},{lineIdx:'0'},{lineIdx:0,lineEnd:99},{lineIdx:2,lineEnd:0},{lineIdx:0,showId:'other-show'},{}]){
  const state=current(),p=packet(state);state.notes.push({id:'unknown-note',songId:'song-a',showId:'show-a',...note});
  await rejectsUnchanged(state,p,'LIVE_ANNOTATION_CONFLICT');
 }
});
test('existing pixel handwriting blocks lyric changes for any take of the affected song',async()=>{
 for(const key of ['show-a|song-a','show-a|song-a|7','other-show|song-a|1']){
  const state=current(),p=packet(state);state.draws[key]=[{p:[1,2]}];await rejectsUnchanged(state,p,'LIVE_ANNOTATION_CONFLICT');
 }
 const state=current(),p=packet(state);state.draws['show-a|song-a']=[];
 assert.equal(P.apply(state,await operation(p),{},99).status,'applied');
});
test('malformed annotation containers fail closed',async()=>{
 for(const [key,code]of [['notes','LIVE_IDENTITY_CONFLICT'],['pubNotes','LIVE_IDENTITY_CONFLICT'],['draws','LIVE_ANNOTATION_CONFLICT']]){
  const state=current(),p=packet(state);state[key]=null;await rejectsUnchanged(state,p,code);
 }
});
test('referenced people must already exist with unique IDs for every retained assignment',async()=>{
 for(const edit of [s=>s.members=[],s=>s.members.push(clone(s.members[0])),s=>s.songs[0].roster=['missing'],s=>s.songs[0].blocks.verse=['missing'],
  s=>s.songs[0].lines[1].parts=['missing'],s=>s.songs[0].lines[1].main=['missing'],s=>s.songs[0].lines[1].extra=['missing']]){
  const state=current();edit(state);const p=packet(state);await rejectsUnchanged(state,p,'LIVE_IDENTITY_CONFLICT');
 }
});
test('gap placeholders cannot be converted into lyric rows by changing text',async()=>{
 const state=current();state.songs[0].lines[1].gap=true;const p=packet(state);await rejectsUnchanged(state,p,'INVALID_OPERATION');
});
test('a conflict in the last song prevents earlier lyric corrections, order and the receipt',async()=>{
 const state=current(),p=packet(state),second=state.songs[2];p.songs.push({id:second.id,expectedTitle:second.title,beforeLines:clone(second.lines),afterText:second.lines.map(l=>l.t+' correction')});
 state.notes.push({id:'later-conflict',songId:'song-b',showId:'show-a',lineIdx:2});
 await rejectsUnchanged(state,p,'LIVE_ANNOTATION_CONFLICT');
});
test('the packet cannot introduce credentials, publication destinations, getters or prototype payloads',async()=>{
 for(const key of ['token','gistId','deliveryGroupId','key']){
  const state=current(),p=packet(state);p.source={nested:{[key]:'synthetic'}};await rejectsUnchanged(state,p,'PRIVATE_CONNECTION_FIELD');
 }
 let calls=0;const p=packet();Object.defineProperty(p.songs[0],'expectedTitle',{enumerable:true,get(){calls++;return 'First song';}});
 rejects('INVALID_MANIFEST',()=>P.mergeLiveUpdate(current(),p));assert.equal(calls,0);
 const polluted=packet();Object.defineProperty(polluted.songs[0].beforeLines[0],'__proto__',{value:{polluted:true},enumerable:true});
 rejects('INVALID_MANIFEST',()=>P.mergeLiveUpdate(current(),polluted));assert.equal({}.polluted,undefined);
});
test('non-object or incomplete update packets fail predictably without touching the editor',()=>{
 for(const p of [null,undefined,false,12,'update',[],{}]){
  const state=current(),before=clone(state);
  rejects('INVALID_MANIFEST',()=>P.mergeLiveUpdate(state,p));assert.deepEqual(state,before);
 }
});
test('multiple songs can change atomically while newer notes, takes and all recordings are retained',async()=>{
 const state=current(),p=packet(state),other=state.songs[2];
 p.songs.push({id:other.id,expectedTitle:other.title,beforeLines:clone(other.lines),afterText:other.lines.map((l,i)=>i===1?'Second song correction':l.t)});
 state.songs[2].take=11;state.songs[2].localMemo='New personal edit';
 state.notes.push({id:'newer-safe-note',songId:'song-b',showId:'show-a',lineIdx:0,memo:'Later note on unchanged row'});
 const result=P.apply(state,await operation(p),{},99);
 assert.equal(result.songs,2);assert.equal(result.state.songs[0].take,11);assert.equal(result.state.songs[0].localMemo,'New personal edit');
 assert.equal(result.state.songs[0].lines[1].t,'Second song correction');assert.equal(result.state.notes,state.notes);assert.equal(result.state.recs,state.recs);
});
