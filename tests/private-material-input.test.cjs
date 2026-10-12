'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const Input=require('../private-material-input.js'),P=require('../private-preparation.js');
const clone=x=>JSON.parse(JSON.stringify(x)),freeze=x=>{if(x&&typeof x==='object'){Object.freeze(x);Object.values(x).forEach(freeze);}return x;};
function state(scope='live'){return {groups:[{id:'private',name:'配信しない',nopub:true}],shows:[{id:'show',groupId:'private',nopub:true}],members:[{id:'m1',name:'本人'},{id:'m2',name:'担当'}],songs:scope==='live'?[song()]:[],rsongs:scope==='recording'?[song()]:[],notes:[{id:'keep-note',songId:'other',memo:'keep'}],recs:{'other|clip':{dur:30}},draws:{},subs:{},gsubs:{},plan:{slots:[{id:'slot',songId:'song',takes:{A:2}}]},privatePreparations:{old:{type:'live-update',sha256:'b'.repeat(64)}},staffMemos:{private:'keep'},unrelated:{keep:1}};}
function song(){return {id:'song',groupId:'private',showId:'show',title:'曲',roster:['m1','m2'],blocks:{},lines:[{id:'stable-line',t:'before',parts:['m1'],label:'本人',labelRaw:'本人'}]};}
async function prepare(s,binding={scope:'live',groupId:'private',showId:'show',songId:'song'},parsed={title:'曲',lines:[['本人','after']]}){return Input.prepare({current:s,file:{name:'曲.xlsx',arrayBuffer:async()=>new TextEncoder().encode('exact source bytes').buffer},binding,parse:async()=>parsed,digest:P.digest,sourceRevision:'original-file-v2',expectedSourceSha:'a'.repeat(40),cryptoProvider:webcrypto});}
for(const scope of ['live','recording'])test(scope+' material update preserves all identities, notes, recordings, plan and prior receipts',async()=>{
 const s=state(scope),before=clone(s),binding={scope,groupId:'private',songId:'song',...(scope==='live'?{showId:'show'}:{})},candidate=await prepare(freeze(s),binding),op=candidate.operation;
 assert.equal(candidate.expectedSourceSha,'a'.repeat(40));assert.match(op.packet.source.files[0].sha256,/^[a-f0-9]{64}$/);
 const manifest={app:'utacheck-private-preparation',version:1,owner:'owner',revision:'rev-v2',createdAt:'2031-02-01T00:00:00Z',operations:[op]};await P.validate(manifest,'owner',webcrypto);
 const next=P.apply(s,op).state,key=scope==='live'?'songs':'rsongs';assert.equal(next[key][0].lines[0].id,'stable-line');assert.equal(next[key][0].lines[0].t,'after');
 for(const k of Object.keys(before).filter(k=>![key,'privatePreparations'].includes(k)))assert.deepEqual(next[k],before[k]);
 assert.equal(P.apply(next,op).status,'already-applied');assert.throws(()=>P.apply(next,{...op,sha256:'f'.repeat(64)}),e=>e.preparationCode==='OPERATION_ID_REUSED');assert.deepEqual(s,before);
});
test('explicit assignment keeps 全 as written and only existing roster IDs are used',async()=>{const s=state(),c=await prepare(s,undefined,{title:'曲',lines:[['全','after']]});const next=P.apply(s,c.operation).state;assert.equal(next.songs[0].lines[0].label,'全');assert.deepEqual(next.songs[0].lines[0].parts,['m1','m2']);});
test('ambiguous title, line count, assignment and preparation source SHA require concrete confirmation',async()=>{
 for(const [parsed,code] of [[{title:'different version',lines:[['本人','after']]},'VERSION_CONFIRMATION_REQUIRED'],[{title:'曲',lines:[]},'LINE_IDENTITY_CONFIRMATION_REQUIRED'],[{title:'曲',lines:[['略名','after']]},'ASSIGNMENT_CONFIRMATION_REQUIRED']])await assert.rejects(prepare(state(),undefined,parsed),e=>e.preparationCode===code);
 const s=state();s.songs.push(clone(s.songs[0]));await assert.rejects(prepare(s),e=>e.preparationCode==='TARGET_REQUIRED');
});
test('current edits, line ID changes, outsider assignments, affected annotations and audio stop without mutation',async()=>{
 for(const kind of ['edited','id','member','note','audio','public']){
  const s=state(),c=await prepare(s);if(kind==='edited')s.songs[0].lines[0].t='owner edit';if(kind==='id')c.operation.packet.afterLines[0].id='replacement';if(kind==='member')c.operation.packet.afterLines[0].parts=['invented'];if(kind==='note')s.notes.push({songId:'song',lineIdx:0,memo:'owner note'});if(kind==='audio')s.recs['show|song|take']={dur:1};if(kind==='public'){s.groups[0].nopub=false;s.groups[0].name='public';}
  const before=clone(s);assert.throws(()=>P.apply(freeze(s),c.operation));assert.deepEqual(s,before);
 }
});
test('changed file hash fails manifest validation and changed block definitions are not silently ignored',async()=>{
 const s=state(),c=await prepare(s);c.operation.packet.source.files[0].sha256='f'.repeat(64);
 await assert.rejects(P.validate({app:'utacheck-private-preparation',version:1,owner:'owner',revision:'rev',createdAt:'2031-02-01',operations:[c.operation]},'owner',webcrypto),e=>e.preparationCode==='HASH_MISMATCH');
 await assert.rejects(prepare(s,undefined,{title:'曲',groups:{A:['本人']},lines:[['本人','after']]}),e=>e.preparationCode==='ASSIGNMENT_GROUP_CONFIRMATION_REQUIRED');
});
test('append retains every old operation byte-for-byte and cannot change or duplicate an existing operation',async()=>{
 const c=await prepare(state()),existing={app:'utacheck-private-preparation',version:1,owner:'owner',revision:'old-revision',createdAt:'2031-02-01',operations:[{id:'old-operation',type:'live-update',sha256:'b'.repeat(64),packet:{original:true}}]},before=JSON.stringify(existing);
 const out=Input.append(freeze(existing),c);assert.equal(JSON.stringify(existing),before);assert.deepEqual(out.manifest.operations[0],existing.operations[0]);assert.equal(out.manifest.operations.length,2);assert.equal(out.expectedSourceSha,c.expectedSourceSha);
 assert.equal(Input.append(out.manifest,c).status,'already-present');assert.throws(()=>Input.append(out.manifest,{...c,operation:{...c.operation,sha256:'c'.repeat(64)}}),e=>e.preparationCode==='OPERATION_ID_REUSED');
});
