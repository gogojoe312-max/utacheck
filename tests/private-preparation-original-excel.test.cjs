'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash,webcrypto}=require('node:crypto');
const P=require('../private-preparation.js');
const OWNER='synthetic-owner',NOW=1925078400000;
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
const bytes=Buffer.from([0x50,0x4b,0x03,0x04]);
const file=(name='synthetic.xlsx')=>({name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64')});
const packet=(name='synthetic.xlsx')=>({app:'utacheck-original-excel',version:1,...file(name)});
const operation=async(p=packet())=>({id:'synthetic-original',type:'original-excel',sha256:await P.digest(p,webcrypto),packet:p});
const manifest=op=>({app:'utacheck-private-preparation',version:1,owner:OWNER,revision:'synthetic-originals-v1',createdAt:'2031-01-01T00:00:00Z',operations:[op]});
const current=()=>({groups:[{id:'private',name:'Synthetic private group',nopub:true}],shows:[{id:'show',groupId:'private',nopub:true}],
 songs:[{id:'song',groupId:'private',showId:'show',title:'Synthetic song',lines:[{t:'Keep lyric',parts:['person']}]}],
 rsongs:[],members:[{id:'person',name:'Synthetic person'}],notes:[{id:'note',songId:'song',text:'Keep note'}],
 draws:{'show|song':[1,2]},recs:{'show|song':{clipId:'keep-clip'}},plan:{slots:[{id:'keep-slot',a0:600,a1:640}]},unrelated:{keep:true}});
const attachment=(state,p,counts={linked:1,stored:p.exportFile?2:1,unmatched:0})=>({state:{...state,songs:state.songs.map(song=>({...song,xls:1,xlsSourceId:'sha256-'+p.sha256}))},...counts});
const rejects=(code,fn)=>assert.throws(fn,error=>error.preparationCode===code);

test('original Excel manifest accepts each supported source and an optional converted legacy export without mutating inputs',async()=>{
 for(const name of ['synthetic.xlsx','synthetic.xls','synthetic.xlsb']){
  const p=packet(name);if(name!=='synthetic.xlsx')p.exportFile=file('synthetic-export.xlsx');
  const input=manifest(await operation(p)),before=clone(input);freeze(input);
  assert.doesNotThrow(()=>P.checkOriginalExcel(input.operations[0].packet));
  const checked=await P.validate(input,OWNER,webcrypto);
  assert.deepEqual(checked,before);assert.deepEqual(input,before);assert.notEqual(checked,input);assert.notEqual(checked.operations[0].packet,input.operations[0].packet);
 }
});

test('original packet validation rejects wrong schema, unsafe filenames, invalid byte sizes and noncanonical base64',async()=>{
 const edits=[
  p=>p.app='different-app',p=>p.version=2,p=>delete p.name,p=>p.extra=true,p=>p.name='',p=>p.name='../original.xlsx',p=>p.name='folder\\original.xlsx',
  p=>p.name='original\u0000.xlsx',p=>p.name='original.xlsm',p=>p.name='original.csv',p=>p.size=0,p=>p.size=-1,p=>p.size=1.5,
  p=>p.size=16*1024*1024+1,p=>p.size=Number.MAX_SAFE_INTEGER+1,p=>p.size++,p=>p.sha256='short',p=>p.sha256='A'.repeat(64),
  p=>p.base64='',p=>p.base64+='\n',p=>p.base64='UEsD BA==',p=>p.base64='UEsDBA',p=>p.base64='UEsDBA=!',
  p=>p.base64='UEsDBB==',p=>p.base64='UEsD=A==',p=>p.base64=123,p=>p.exportFile=file(),
  p=>{p.name='original.xls';p.exportFile={...file(),extra:true};},
  p=>{p.name='original.xlsb';p.exportFile=file('export.xls');},
  p=>{p.name='original.xls';p.exportFile={...file(),size:0};},
  p=>{p.name='original.xls';p.exportFile={...file(),base64:'UEsDBB=='};}
 ];
 for(const edit of edits){
  const p=packet();edit(p);const before=clone(p);
  assert.throws(()=>P.checkOriginalExcel(p),error=>typeof error.preparationCode==='string');
  await assert.rejects(P.validate(manifest(await operation(p)),OWNER,webcrypto),error=>typeof error.preparationCode==='string');
  assert.deepEqual(p,before);
 }
});

test('source and export file credentials are rejected before any adapter runs',async()=>{
 for(const key of ['ghToken','bkKey','bkGistId','editPass','token','password','secret','credentials','gistId','src','key','deliveryGroupId','deliveryMode']){
  for(const nested of [false,true]){
   const p=packet(nested?'synthetic.xls':'synthetic.xlsx');if(nested)p.exportFile=file();
   (nested?p.exportFile:p)[key]='synthetic-credential';const op=await operation(p);let calls=0;
   rejects('PRIVATE_CONNECTION_FIELD',()=>P.checkOriginalExcel(p));
   await assert.rejects(P.validate(manifest(op),OWNER,webcrypto),error=>error.preparationCode==='PRIVATE_CONNECTION_FIELD');
   rejects('PRIVATE_CONNECTION_FIELD',()=>P.apply(current(),op,{originalExcel(){calls++;}},NOW));assert.equal(calls,0);
  }
 }
});

test('manifest verifies the immutable packet hash while binary digest verification remains the attachment preparer responsibility',async()=>{
 const p=packet();p.sha256='a'.repeat(64);const op=await operation(p);
 assert.doesNotThrow(()=>P.checkOriginalExcel(p));await P.validate(manifest(op),OWNER,webcrypto);
 const changed=clone(op);changed.packet.name='changed.xlsx';
 await assert.rejects(P.validate(manifest(changed),OWNER,webcrypto),error=>error.preparationCode==='HASH_MISMATCH');
});

test('applying an original requires the synchronous prepared adapter and records counts without changing original data',async()=>{
 const state=freeze(current()),before=clone(state),op=freeze(await operation());
 rejects('ORIGINAL_EXCEL_NOT_PREPARED',()=>P.apply(state,op,{},NOW));let calls=0;
 const result=P.apply(state,op,{originalExcel(s,p){calls++;assert.equal(s,state);assert.equal(p,op.packet);return attachment(s,p);}},NOW);
 assert.equal(calls,1);assert.equal(result.status,'applied');assert.deepEqual(state,before);
 assert.equal(result.state.songs[0].xlsSourceId,'sha256-'+op.packet.sha256);
 assert.deepEqual(result.state.songs[0].lines,before.songs[0].lines);
 for(const key of Object.keys(state).filter(key=>key!=='songs'))assert.deepEqual(result.state[key],before[key],key);
 assert.deepEqual(result.state.privatePreparations[op.id],{sha256:op.sha256,type:op.type,at:NOW,linked:1,stored:1,unmatched:0});
});

test('a stored but unmatched original and its optional export are receipted without inventing song links',async()=>{
 const state=freeze(current()),p=packet('synthetic.xlsb');p.exportFile=file('synthetic-export.xlsx');const op=await operation(p);
 const result=P.apply(state,op,{originalExcel:s=>({state:s,linked:0,stored:2,unmatched:1})},NOW);
 assert.equal(result.state.songs,state.songs);assert.equal(state.privatePreparations,undefined);
 assert.deepEqual(result.state.privatePreparations[op.id],{sha256:op.sha256,type:op.type,at:NOW,linked:0,stored:2,unmatched:1});
});

test('invalid or asynchronous prepared results cannot create a receipt',async()=>{
 const state=freeze(current()),op=await operation(),good=attachment(state,op.packet);
 const invalid=[null,{},Promise.resolve(good),{...good,state:null},{...good,state:[]},
  {...good,linked:-1},{...good,linked:0.5},{...good,linked:Number.MAX_SAFE_INTEGER+1},
  {...good,stored:0},{...good,stored:2},{...good,stored:1.5},{...good,unmatched:2},{...good,unmatched:1},
  {...good,linked:0,unmatched:0}];
 for(const result of invalid){rejects('INVALID_OPERATION',()=>P.apply(state,op,{originalExcel:()=>result},NOW));assert.equal(state.privatePreparations,undefined);}
});

test('receipt-only restoration still runs the adapter and adopts repaired state while retaining the original receipt and counts',async()=>{
 const op=await operation(),state=current(),old={sha256:op.sha256,type:op.type,at:NOW,linked:3,stored:1,unmatched:0};
 state.privatePreparations={[op.id]:old,unrelated:{sha256:'b'.repeat(64),type:'live-addition',at:NOW-1}};
 const before=clone(state);freeze(state);let calls=0;
 const result=P.apply(state,op,{originalExcel(s,p){calls++;return attachment(s,p);}},NOW+1000);
 assert.equal(calls,1);assert.equal(result.status,'applied');assert.equal(result.state.songs[0].xlsSourceId,'sha256-'+op.packet.sha256);
 assert.deepEqual(result.state.privatePreparations,before.privatePreparations);assert.equal(result.state.privatePreparations[op.id],old);
 assert.equal(result.linked,1);assert.deepEqual(state,before);
 rejects('ORIGINAL_EXCEL_NOT_PREPARED',()=>P.apply(state,op,{},NOW+1000));
});

test('an already linked original still verifies availability through the adapter and returns identical state when unchanged',async()=>{
 const op=await operation(),first=P.apply(current(),op,{originalExcel:attachment},NOW);let calls=0;
 const result=P.apply(first.state,op,{originalExcel(s){calls++;return {state:clone(s),linked:1,stored:1,unmatched:0};}},NOW+1);
 assert.equal(calls,1);assert.equal(result.status,'already-applied');assert.equal(result.state,first.state);
 assert.equal(result.state.privatePreparations[op.id].at,NOW);
});

test('reusing an original receipt ID with changed hash or operation type is refused before preparation',async()=>{
 const op=await operation(),state=P.apply(current(),op,{originalExcel:attachment},NOW).state,before=clone(state);let calls=0;
 const adapters={originalExcel(){calls++;throw Error('must not prepare a conflicting operation');}};
 rejects('OPERATION_ID_REUSED',()=>P.apply(state,{...op,sha256:'f'.repeat(64)},adapters,NOW+1));
 rejects('OPERATION_ID_REUSED',()=>P.apply(state,{...op,type:'live-addition'},adapters,NOW+1));
 assert.equal(calls,0);assert.deepEqual(state,before);
});

test('ordinary receipted operations retain the existing no-adapter replay behavior',()=>{
 const op={id:'ordinary',type:'recording-schedule',sha256:'c'.repeat(64),packet:{}};
 const state=freeze({...current(),privatePreparations:{ordinary:{type:op.type,sha256:op.sha256,at:NOW}}});
 const result=P.apply(state,op,{schedule(){throw Error('ordinary receipt must short-circuit');},originalExcel(){throw Error('wrong adapter');}},NOW+1);
 assert.equal(result.status,'already-applied');assert.equal(result.state,state);
});

test('a new original receipt records the prepared target fingerprint',async()=>{
 const state=freeze(current()),op=await operation(),targetSha256='d'.repeat(64);
 const result=P.apply(state,op,{originalExcel:(s,p)=>({...attachment(s,p),targetSha256})},NOW);
 assert.deepEqual(result.state.privatePreparations[op.id],{sha256:op.sha256,type:op.type,at:NOW,linked:1,stored:1,unmatched:0,targetSha256});
 assert.equal(state.privatePreparations,undefined);
});

test('changed or newly available target fingerprints refresh counts while preserving receipt identity and original time',async()=>{
 const op=await operation(),targetSha256='e'.repeat(64);
 for(const previousFingerprint of ['d'.repeat(64),undefined])for(const changesState of [false,true]){
  const state=current(),old={sha256:op.sha256,type:op.type,at:NOW,linked:0,stored:1,unmatched:1};
  if(previousFingerprint!==undefined)old.targetSha256=previousFingerprint;
  state.privatePreparations={[op.id]:old,unrelated:{sha256:'b'.repeat(64),type:'live-addition',at:NOW-1}};
  const before=clone(state);freeze(state);
  const result=P.apply(state,op,{originalExcel:(s,p)=>changesState?{...attachment(s,p),targetSha256}:{state:clone(s),linked:1,stored:1,unmatched:0,targetSha256}},NOW+1000);
  assert.equal(result.status,'applied');assert.notEqual(result.state,state);
  assert.deepEqual(result.state.privatePreparations[op.id],{sha256:op.sha256,type:op.type,at:NOW,linked:1,stored:1,unmatched:0,targetSha256});
  assert.deepEqual(result.state.privatePreparations.unrelated,before.privatePreparations.unrelated);
  assert.deepEqual(state,before);assert.deepEqual(result.state.songs[0].lines,state.songs[0].lines);
  if(!changesState)assert.deepEqual(result.state.songs,state.songs);
 }
});

test('the same target fingerprint preserves old receipt counts during blob-only recovery and repaired-state adoption',async()=>{
 const op=await operation(),targetSha256='d'.repeat(64);
 for(const changesState of [false,true]){
  const state=current(),old={sha256:op.sha256,type:op.type,at:NOW,linked:3,stored:1,unmatched:0,targetSha256};
  state.privatePreparations={[op.id]:old};const before=clone(state);freeze(state);
  const result=P.apply(state,op,{originalExcel:(s,p)=>changesState?{...attachment(s,p),targetSha256}:{state:clone(s),linked:1,stored:1,unmatched:0,targetSha256}},NOW+1000);
  assert.equal(result.linked,1);assert.equal(result.state.privatePreparations[op.id],old);
  assert.deepEqual(result.state.privatePreparations,before.privatePreparations);assert.deepEqual(state,before);
  if(changesState){assert.equal(result.status,'applied');assert.equal(result.state.songs[0].xlsSourceId,'sha256-'+op.packet.sha256);}
  else {assert.equal(result.status,'already-applied');assert.equal(result.state,state);}
 }
});

test('invalid prepared target fingerprints cannot create or replace receipts',async()=>{
 const op=await operation();
 for(const targetSha256 of [null,'','a'.repeat(63),'a'.repeat(65),'A'.repeat(64),'g'.repeat(64),'a'.repeat(64)+'\n',123,[],['a'.repeat(64)],{}]){
  for(const withReceipt of [false,true]){
   const state=current();if(withReceipt)state.privatePreparations={[op.id]:{sha256:op.sha256,type:op.type,at:NOW,linked:1,stored:1,unmatched:0,targetSha256:'d'.repeat(64)}};
   const before=clone(state);freeze(state);
   rejects('INVALID_OPERATION',()=>P.apply(state,op,{originalExcel:(s,p)=>({...attachment(s,p),targetSha256})},NOW+1000));
   assert.deepEqual(state,before);
  }
 }
});
