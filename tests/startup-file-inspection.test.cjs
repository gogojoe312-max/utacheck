'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createHash,webcrypto}=require('node:crypto');
const {deflateRawSync}=require('node:zlib');
const API=require('../startup-file-inspection.js');
const bounded=require('../startup-backup-inspection.js');
const MAX=32*1024*1024;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const clone=x=>JSON.parse(JSON.stringify(x));
const state=(extra={})=>({shows:[{id:'PRIVATE_SHOW',name:'PRIVATE_NAME'}],songs:[{id:'PRIVATE_SONG',lines:[{t:'PRIVATE_LYRIC'}]}],
 rsongs:[{id:'PRIVATE_RECORDING',lines:[]}],notes:[{memo:'PRIVATE_NOTE'}],pubNotes:[],trash:[],
 memos:{one:'PRIVATE_MEMO'},staffMemos:{one:'PRIVATE_STAFF'},draws:{one:[1]},recs:{PRIVATE_RECORDING:{name:'PRIVATE_AUDIO'}},
 plan:{slots:[{name:'PRIVATE_PLAN'}]},ghToken:'PRIVATE_TOKEN',bkKey:'PRIVATE_SAVED_KEY',bkGistId:'0123456789abcdef0123456789abcdef',...extra});
const packet=(extra={})=>({app:'utacheck',at:1791300000000,state:state(),...extra});
const plain=value=>({bk:1,z:false,data:Buffer.from(JSON.stringify(value)).toString('base64url')});
const compressed=value=>({bk:1,z:true,data:deflateRawSync(Buffer.from(JSON.stringify(value))).toString('base64url')});
const encrypted=()=>({enc:1,salt:Buffer.alloc(16).toString('base64url'),iv:Buffer.alloc(12).toString('base64url'),data:Buffer.alloc(32).toString('base64url')});
const mockFile=(value=plain(packet()))=>new File([JSON.stringify(value)],'PRIVATE_FILENAME_BACKUP.json',{type:'application/json'});
function fixture(extra={}){
 let active=true,reads=0,decoded=0,ancillary=0;
 const updates=[],passes=[],files=[];
 const deps={...extra,isActive:()=>active,onUpdate:v=>updates.push(clone(v)),
  readFile:async(file,signal)=>{reads++;files.push({file,signal});return extra.readFile?extra.readFile(file,signal):file.arrayBuffer();},
  decodeBackup:async(raw,key,context)=>{decoded++;passes.push(key);return extra.decodeBackup?extra.decodeBackup(raw,key,context):bounded.decodeBackup(raw,key,{...context,openJSON:async()=>plain(packet()),base64Decode:x=>new Uint8Array(Buffer.from(x,'base64url'))});},
  counts:bounded.counts,
  readAncillary:async keys=>{ancillary++;return extra.readAncillary?extra.readAncillary(keys):{total:124,audio:20,workbooks:100,other:4,unclassified:0,bytes:1234567,matchedRecordings:1};}};
 const api=API.create(deps);
 const safe=result=>{
  const serialized=JSON.stringify({updates,result});
  for(const secret of ['PRIVATE_','https://','ghToken','bkKey','bkGistId','0123456789abcdef0123456789abcdef','salt','raw_url'])
   assert(!serialized.includes(secret),'public summaries must not expose '+secret);
 };
 return {api,updates,passes,files,deps,safe,readCount:()=>reads,decodeCount:()=>decoded,ancillaryCount:()=>ancillary,deactivate:()=>{active=false;},activate:()=>{active=true;}};
}
test('local selection is lazy, ephemeral, filename-free, and shows only size',async()=>{
 const f=fixture(),file=mockFile(),before=Buffer.from(await file.arrayBuffer());
 assert.deepEqual(f.api.select(file),{status:'selected',bytes:file.size});assert.equal(f.readCount(),0);assert.equal(f.decodeCount(),0);
 f.safe();f.api.cancel();assert.equal(await f.api.check('PRIVATE_KEY'),null);assert.deepEqual(Buffer.from(await file.arrayBuffer()),before);
});
test('plain local backup returns one safe date/count candidate without adopting any payload',async()=>{
 const f=fixture(),file=mockFile(),before=Buffer.from(await file.arrayBuffer());f.api.select(file);const result=await f.api.check('');
 assert.equal(result.status,'checked');assert.equal(result.at,1791300000000);assert.equal(result.bytes,file.size);assert.equal(result.knownFile,undefined);
 assert.deepEqual(result.counts,{shows:1,songs:1,rsongs:1,notes:1,pubNotes:0,trash:0,memos:1,staffMemos:1,draws:1,recs:1,planSlots:1});
 assert.equal(result.backupIdPresent,true);assert.deepEqual(result.ancillary,{total:124,audio:20,workbooks:100,other:4,unclassified:0,bytes:1234567,matchedRecordings:1});
 assert.equal(f.readCount(),1);assert.equal(f.decodeCount(),1);assert.equal(f.api.busy,false);assert.equal(await f.api.check(''),null);
 assert.deepEqual(Buffer.from(await file.arrayBuffer()),before);f.safe(result);
});
test('local checker never calls an unneeded fingerprint capability or exposes a file identity',async()=>{
 let calls=0;const f=fixture({digest:async()=>{calls++;return 'a'.repeat(64);}}),file=mockFile();f.api.select(file);const result=await f.api.check('');
 assert.equal(result.status,'checked');assert.equal(result.knownFile,undefined);assert.equal(calls,0);f.safe(result);
});
test('selected encrypted backup requires a local password before any decoder invocation',async()=>{
 const f=fixture(),file=mockFile(encrypted());f.api.select(file);const result=await f.api.check('');
 assert.equal(result.status,'saved-key-missing');assert.equal(f.decodeCount(),0);assert.equal(f.ancillaryCount(),0);f.safe(result);
});
test('the password is used exactly, with spaces preserved, and is absent from summaries',async()=>{
 const key='  PRIVATE_EXACT_PASSWORD  ',f=fixture({decodeBackup:async(raw,password)=>{assert.equal(password,key);return packet();}});
 f.api.select(mockFile(encrypted()));const result=await f.api.check(key);assert.equal(result.status,'checked');assert.deepEqual(f.passes,[key]);f.safe(result);
});
test('password type and maximum length are checked before file bytes are read',async()=>{
 for(const password of [undefined,null,123,{},'x'.repeat(4097)]){const f=fixture();f.api.select(mockFile(encrypted()));const result=await f.api.check(password);
  assert.equal(result.status,'password-format');assert.equal(f.readCount(),0);assert.equal(f.decodeCount(),0);f.safe(result);}
 const f=fixture();f.api.select(mockFile(encrypted()));assert.equal((await f.api.check('x'.repeat(4096))).status,'checked');
});
test('empty, invalid and larger-than-32MiB file selections never read bytes',async()=>{
 for(const file of [null,{}, {size:0},{size:-1},{size:NaN},{size:MAX+1},{size:1.5}]){
  const f=fixture();assert.equal(f.api.select(file).status,'file-limit');assert.equal(await f.api.check('PRIVATE_KEY'),null);assert.equal(f.readCount(),0);f.safe();}
});
test('raw byte size must match the selected file, and invalid UTF8 is rejected safely',async()=>{
 for(const bytes of [new Uint8Array(0),new Uint8Array([255])]){const f=fixture({readFile:async()=>bytes}),file=bytes.length?{size:1}:mockFile();f.api.select(file);
  const result=await f.api.check('');assert.equal(result.status,bytes.length?'backup-format':'file-read-failed');assert.equal(f.decodeCount(),0);f.safe(result);}
});
test('local read errors, malformed JSON and non-byte results reveal only fixed failure codes',async()=>{
 for(const readFile of [async()=>{throw Error('PRIVATE_FILE_READ');},async()=> 'PRIVATE_RAW_STRING',async()=>new TextEncoder().encode('{')]){
  const f=fixture({readFile}),file={size:1};f.api.select(file);const result=await f.api.check('');
  assert(['file-read-failed','backup-format'].includes(result.status));assert.equal(f.decodeCount(),0);f.safe(result);}
});
test('unsupported envelope shapes are rejected without private decoder details',async()=>{
 for(const raw of [null,[],{}, {bk:2,data:'eA'}, {bk:1,data:123}, {enc:1}, {...encrypted(),salt:'PRIVATE!'}]){
  const f=fixture();f.api.select(mockFile(raw));const result=await f.api.check('PRIVATE_KEY');assert.equal(result.status,'backup-format');assert.equal(f.decodeCount(),0);f.safe(result);}
});
test('unsupported encryption flags and malformed salt/IV/ciphertext stop before decryption',async()=>{
 const raw=encrypted(),values=[{...raw,enc:2},{...raw,enc:'1'},{...raw,enc:true},{...raw,enc:0},
  {...raw,salt:Buffer.alloc(15).toString('base64url')},{...raw,iv:Buffer.alloc(11).toString('base64url')},
  {...raw,data:Buffer.alloc(15).toString('base64url')},{...raw,salt:'a'},{...raw,iv:'=PRIVATE_BAD'},
  {...raw,data:'a===='},{...raw,data:'PRIVATE!DATA'},{...raw,salt:'a'.repeat(65)}];
 for(const value of values){const f=fixture();f.api.select(mockFile(value));const result=await f.api.check('PRIVATE_KEY');
  assert.equal(result.status,'backup-format');assert.equal(f.decodeCount(),0);f.safe(result);}
});
test('byte views and the decoded full packet remain unchanged after count-only inspection',async()=>{
 const value=packet(),packetBefore=JSON.stringify(value),text=JSON.stringify(plain(value));
 const bytes=Buffer.concat([Buffer.from('PRIVATE_PREFIX'),Buffer.from(text),Buffer.from('PRIVATE_SUFFIX')]);
 const prefix=Buffer.byteLength('PRIVATE_PREFIX'),source=new Uint8Array(bytes.buffer,bytes.byteOffset+prefix,Buffer.byteLength(text)),before=Buffer.from(bytes);
 const f=fixture({readFile:async()=>source,decodeBackup:async()=>value});f.api.select({size:source.byteLength});const result=await f.api.check('');
 assert.equal(result.status,'checked');assert.deepEqual(bytes,before);assert.equal(JSON.stringify(value),packetBefore);f.safe(result);
});
test('wrong password is safe, leaves file unchanged, and permits an explicit retry',async()=>{
 const file=mockFile(encrypted()),before=Buffer.from(await file.arrayBuffer());let decode=0;
 const f=fixture({decodeBackup:async(raw,key)=>{decode++;if(key!=='PRIVATE_RIGHT')throw Object.assign(Error('PRIVATE_CRYPTO_DETAIL'),{inspectionCode:'decrypt-failed'});return packet();}});
 f.api.select(file);assert.equal((await f.api.check('PRIVATE_WRONG')).status,'decrypt-failed');assert.equal((await f.api.check('PRIVATE_RIGHT')).status,'checked');
 assert.equal(decode,2);assert.deepEqual(Buffer.from(await file.arrayBuffer()),before);f.safe();
});
test('foreign app, missing schema, invalid dates and malformed state cannot form a candidate',async()=>{
 const invalid=[packet({app:'PRIVATE_OTHER_APP'}),packet({app:undefined}),packet({at:0}),packet({at:-1}),packet({at:1.5}),packet({at:8640000000000001}),
  packet({at:'1791300000000'}),packet({state:null}),packet({state:[]}),packet({state:state({songs:{}})}),packet({state:state({songs:[{lines:'PRIVATE_LYRIC'}]})}),packet({state:state({plan:{slots:[null]}})})];
 for(const value of invalid){const f=fixture({decodeBackup:async()=>value});f.api.select(mockFile());const result=await f.api.check('');
  assert(['backup-format','state-format'].includes(result.status));assert.equal(f.ancillaryCount(),0);f.safe(result);}
});
test('empty work is a valid zero-count candidate and never triggers restore',async()=>{
 const f=fixture({decodeBackup:async()=>packet({state:{}})});f.api.select(mockFile());const result=await f.api.check('');
 assert.equal(result.status,'checked');assert(Object.values(result.counts).every(n=>n===0));assert.equal(result.backupIdPresent,false);f.safe(result);
});
test('invalid backup-id metadata stays absent rather than exposing a URL or credential',async()=>{
 for(const bkGistId of [null,123,'https://PRIVATE_URL','PRIVATE_BAD_ID','']){const f=fixture({decodeBackup:async()=>packet({state:state({bkGistId})})});
  f.api.select(mockFile());const result=await f.api.check('');assert.equal(result.status,'checked');assert.equal(result.backupIdPresent,false);f.safe(result);}
});
test('legacy recording keys are handed to readonly ancillary inspection but never returned',async()=>{
 let keys;const f=fixture({readAncillary:async value=>{keys=value;return{total:124,matchedRecordings:1};}});f.api.select(mockFile());const result=await f.api.check('');
 assert.deepEqual(keys,['PRIVATE_RECORDING']);assert.equal(result.ancillary.total,124);assert.equal(result.ancillary.matchedRecordings,1);f.safe(result);
});
test('ancillary failures stay unknown without invalidating a safely decoded candidate',async()=>{
 for(const readAncillary of [async()=>{throw Error('PRIVATE_DB_FAILURE');},async()=>({total:-1,audio:NaN,bytes:'PRIVATE_SIZE',matchedRecordings:0})]){
  const f=fixture({readAncillary});f.api.select(mockFile());const result=await f.api.check('');assert.equal(result.status,'checked');assert.equal(result.ancillary.total,null);
  assert.equal(result.ancillary.audio,null);assert.equal(result.ancillary.bytes,null);f.safe(result);}
});
test('repeated checks while reading are ignored and cannot launch duplicate decryption',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const f=fixture({readFile:async file=>{await gate;return file.arrayBuffer();}});f.api.select(mockFile());
 const pending=f.api.check('PRIVATE_FIRST');await flush();assert.equal(f.api.busy,true);assert.equal(await f.api.check('PRIVATE_SECOND'),null);release();
 assert.equal((await pending).status,'checked');assert.equal(f.readCount(),1);assert.equal(f.decodeCount(),1);f.safe();
});
test('cancel aborts the active local read, drops selection, and prevents stale result or decoding',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const f=fixture({readFile:async file=>{await gate;return file.arrayBuffer();}});f.api.select(mockFile());
 const pending=f.api.check('PRIVATE_KEY');await flush();const length=f.updates.length;f.api.cancel();assert.equal(f.files[0].signal.aborted,true);release();
 assert.equal((await pending).status,'cancelled');assert.equal(f.decodeCount(),0);assert.equal(f.updates.length,length);assert.equal(await f.api.check('PRIVATE_KEY'),null);f.safe();
});
test('a newer file selection cancels the old candidate without overwriting its new selection',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const f=fixture({readFile:async file=>{if(file.name==='PRIVATE_FILENAME_BACKUP.json')await gate;return file.arrayBuffer();}});
 const old=mockFile(),newer=new File([JSON.stringify(plain(packet({at:1791400000000})))],'PRIVATE_NEWER.json');f.api.select(old);
 const pending=f.api.check('PRIVATE_KEY');await flush();f.api.select(newer);const count=f.updates.length;release();assert.equal((await pending).status,'cancelled');
 assert.equal(f.updates.length,count);const result=await f.api.check('');assert.equal(result.at,1791400000000);assert.equal(f.readCount(),2);f.safe(result);
});
test('hidden/inactive selection and checks are inert, and in-flight decryption cannot emit a candidate',async()=>{
 const inactive=fixture();inactive.deactivate();assert.equal(inactive.api.select(mockFile()),null);assert.equal(await inactive.api.check('PRIVATE_KEY'),null);assert.equal(inactive.updates.length,0);
 let release;const gate=new Promise(resolve=>release=resolve);const f=fixture({decodeBackup:async()=>{await gate;return packet();}});f.api.select(mockFile());const pending=f.api.check('PRIVATE_KEY');
 await flush();const count=f.updates.length;f.deactivate();f.api.cancel();release();assert.equal((await pending).status,'cancelled');assert.equal(f.updates.length,count);f.safe();
});
test('cancellation during ancillary reads cannot expose a finished candidate',async()=>{
 for(const operation of ['readAncillary']){let release;const gate=new Promise(resolve=>release=resolve);const extra={};extra[operation]=async()=>{await gate;return {total:124};};
  const f=fixture(extra);f.api.select(mockFile());const pending=f.api.check('PRIVATE_KEY');await flush();const count=f.updates.length;f.api.cancel();release();
  assert.equal((await pending).status,'cancelled');assert.equal(f.updates.length,count);f.safe();}
});
function cryptoFixture(){
 const source=fs.readFileSync(__dirname+'/../app.js','utf8'),block=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
 let touched=0;const shared={bkKey:'PRIVATE_SAVED_KEY',notes:[{memo:'PRIVATE_NOTE'}]},before=JSON.stringify(shared);
 const c=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,S:new Proxy(shared,{get(){touched++;throw Error('no shared reads');},set(){touched++;throw Error('no shared writes');}})});
 vm.runInContext(block('const b64e = (u8) => {','function connectLink('),c);vm.runInContext(block('async function deriveKey(','async function wrap('),c);
 return {c,decodeBackup:(raw,key,context)=>bounded.decodeBackup(raw,key,{...context,openJSON:c.openJSON,base64Decode:vm.runInContext('b64d',c)}),safe:()=>{assert.equal(touched,0);assert.equal(JSON.stringify(shared),before);}};
}
test('real PBKDF2/AES-GCM plus deflate backup uses exact local password without reading S',async()=>{
 const crypt=cryptoFixture(),key=' PRIVATE_LOCAL_CRYPTO_KEY ',raw=await crypt.c.sealJSON(compressed(packet()),key),file=mockFile(raw),before=Buffer.from(await file.arrayBuffer());
 const f=fixture({decodeBackup:crypt.decodeBackup});f.api.select(file);const result=await f.api.check(key);assert.equal(result.status,'checked');assert.equal(result.counts.songs,1);
 assert.deepEqual(Buffer.from(await file.arrayBuffer()),before);crypt.safe();f.safe(result);
});
test('real crypto wrong password fails safely without changing source bytes or shared credentials',async()=>{
 const crypt=cryptoFixture(),raw=await crypt.c.sealJSON(compressed(packet()),'PRIVATE_RIGHT'),file=mockFile(raw),before=Buffer.from(await file.arrayBuffer());
 const f=fixture({decodeBackup:crypt.decodeBackup});f.api.select(file);assert.equal((await f.api.check('PRIVATE_WRONG')).status,'decrypt-failed');assert.equal(f.ancillaryCount(),0);
 assert.deepEqual(Buffer.from(await file.arrayBuffer()),before);crypt.safe();f.safe();
});
test('22MiB compression bomb remains bounded through the local file path',async()=>{
 const file=mockFile(compressed(packet({state:{notes:[{memo:'x'.repeat(22*1024*1024)}]}}))),before=Buffer.from(await file.arrayBuffer());assert(file.size<100000);
 const f=fixture();f.api.select(file);assert.equal((await f.api.check('')).status,'backup-limit');assert.equal(f.ancillaryCount(),0);assert.deepEqual(Buffer.from(await file.arrayBuffer()),before);f.safe();
});
test('uncompressed 22MiB payload also remains bounded below the 32MiB local-file transport cap',async()=>{
 const file=mockFile(plain(packet({state:{notes:[{memo:'x'.repeat(22*1024*1024)}]}})));assert(file.size<MAX);
 const f=fixture();f.api.select(file);assert.equal((await f.api.check('')).status,'backup-limit');assert.equal(f.ancillaryCount(),0);f.safe();
});
test('local checker module requires no network, storage, shared state, download or restore capability',()=>{
 const source=fs.readFileSync(__dirname+'/../startup-file-inspection.js','utf8');
 assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|indexedDB|localStorage|sessionStorage|restoreBackupFile|save|idbPut|delClip|createObjectURL)\s*\(/);
 let touches=0;const deny=new Proxy({},{get(){touches++;throw Error('forbidden access');},set(){touches++;throw Error('forbidden write');}});
 const c=vm.createContext({S:deny,U:deny,indexedDB:deny,localStorage:deny,sessionStorage:deny,fetch:()=>{touches++;throw Error('no network');},TextDecoder,Uint8Array,ArrayBuffer,AbortController});
 vm.runInContext(source,c);assert.equal(typeof c.StartupFileInspection.create,'function');const f=c.StartupFileInspection.create({isActive:()=>true,onUpdate:()=>{}});f.select({size:1});f.cancel();assert.equal(touches,0);
});
