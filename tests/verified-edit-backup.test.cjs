'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),API=require('../verified-edit-backup.js');
const hash=async raw=>createHash('sha256').update(raw).digest('hex');
function fixture(overrides={}){let raw=JSON.stringify({songs:[{id:'song',lines:[{id:'line',t:'original'}]}],notes:[{id:'note',memo:'keep'}],recs:{clip:{size:123}}});const entries=new Map(),writes=[];const deps={active:()=>true,snapshot:()=>raw,hash,read:async key=>entries.get(key),encode:async raw=>({encoded:raw}),decode:async value=>value.encoded,add:async(key,value)=>{assert(!entries.has(key));entries.set(key,value);writes.push(key);},...overrides};return {api:API.create(deps),entries,writes,change:()=>{raw+=' ';},raw:()=>raw};}
test('restore point retains song/line identities, notes and clip references, then verifies reread before edit',async()=>{const f=fixture(),before=f.raw();const result=await f.api.checkpoint('lyrics');assert.equal(f.entries.get(result.key).backup.encoded,before);assert.equal(f.raw(),before);await f.api.checkpoint();assert.equal(f.writes.length,1);});
test('quota failure stops without overwriting or deleting existing originals',async()=>{const f=fixture({add:async()=>{throw Object.assign(Error('full'),{name:'QuotaExceededError'});}});f.entries.set('older',{original:true});await assert.rejects(f.api.checkpoint());assert.deepEqual([...f.entries.keys()],['older']);});
test('corrupted reread stops the operation',async()=>{let reads=0;const f=fixture({read:async()=>++reads===1?undefined:{digest:'wrong',backup:{encoded:'wrong'}}});await assert.rejects(f.api.checkpoint(),e=>e.backupCode==='BACKUP_UNVERIFIED');});
test('same digest with different content is a conflict and never replaced',async()=>{const f=fixture();const key=API.PREFIX+await hash(f.raw());f.entries.set(key,{digest:key.slice(API.PREFIX.length),backup:{encoded:'different'}});await assert.rejects(f.api.checkpoint(),e=>e.backupCode==='BACKUP_CONFLICT');assert.equal(f.writes.length,0);});
test('concurrent checkpoint callers share a verified restore point',async()=>{
 let release;const wait=new Promise(r=>release=r),f=fixture({hash:async raw=>{await wait;return hash(raw);}});
 const first=f.api.checkpoint(),second=f.api.checkpoint();release();
 assert.deepEqual(await first,await second);assert.equal(f.writes.length,1);
});
test('a real concurrent edit still rejects every waiting caller',async()=>{
 let release;const wait=new Promise(r=>release=r),f=fixture({hash:async raw=>{await wait;return hash(raw);}});
 const first=f.api.checkpoint(),second=f.api.checkpoint();f.change();release();
 const results=await Promise.allSettled([first,second]);assert(results.every(r=>r.status==='rejected'&&r.reason.backupCode==='BACKUP_CHANGED'));assert.equal(f.writes.length,0);
});
test('unchanged verified content avoids repeated hashing and decoding',async()=>{
 let hashes=0,decodes=0;const f=fixture({hash:async raw=>{hashes++;return hash(raw);},decode:async value=>{decodes++;return value.encoded;}});
 await f.api.checkpoint();await f.api.checkpoint();assert.equal(hashes,1);assert.equal(decodes,1);
 f.change();await f.api.checkpoint();assert.equal(hashes,2);assert.equal(f.writes.length,2);
});

test('checkpoint comparison ignores send bookkeeping but retains content, recipients and credentials',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(__dirname+'/../app.js','utf8');
 const at=source.indexOf('function editCheckpointContent('),c={};vm.createContext(c);vm.runInContext(source.slice(at,source.indexOf('\n}',at)+2),c);
 const original={songs:[{id:'song',lines:[{t:'lyric'}]}],notes:[{memo:'keep'}],groups:[{id:'g',src:'original',key:'existing',lastKey:'old'}],recoveryDelivery:{targets:[{gistId:'same',src:'original',status:'sending',expectedRemoteSha256:'old'}]}};
 const sent=JSON.parse(JSON.stringify(original));sent.bkAt=123;sent.groups[0].lastKey='new';sent.groups[0].publishKeyPending=false;sent.recoveryDelivery.targets[0].status='ready';sent.recoveryDelivery.targets[0].expectedRemoteSha256='new';
 assert.equal(c.editCheckpointContent(sent),c.editCheckpointContent(original));
 for(const mutate of [v=>v.notes[0].memo='new',v=>v.songs[0].lines[0].t='new',v=>v.groups[0].src='other',v=>v.groups[0].key='other',v=>v.recoveryDelivery.targets[0].gistId='other']){
  const edited=JSON.parse(JSON.stringify(sent));mutate(edited);assert.notEqual(c.editCheckpointContent(edited),c.editCheckpointContent(original));
 }
});
