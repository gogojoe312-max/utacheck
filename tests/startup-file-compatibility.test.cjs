'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const {deflateRawSync}=require('node:zlib');
const root=process.env.UTA_QA_ROOT||path.resolve(__dirname,'..');
const API=require(path.join(root,'startup-file-inspection.js'));
const bounded=require(path.join(root,'startup-backup-inspection.js'));
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const block=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start);return source.slice(start,end);};
const packet=()=>({app:'utacheck',ver:'16.41.23',at:1791305640000,state:{shows:[{id:'SYNTHETIC_COMPAT_SHOW'}],songs:[{id:'SYNTHETIC_COMPAT_SONG',lines:[{t:'SYNTHETIC_COMPAT_LYRIC'}]}],notes:[{memo:'SYNTHETIC_COMPAT_NOTE'}],recs:{SYNTHETIC_COMPAT_REC:{name:'SYNTHETIC_COMPAT_AUDIO'}}}});
const b64e=bytes=>Buffer.from(bytes).toString('base64url');
// Pure replica of the v16.41.23 exporter in commit c8f1bba285a80991ee3189c094d758f014f1b918.
// Inputs are synthetic; no application state, real password, file, or storage is read.
async function legacySeal(body,password){
 const salt=webcrypto.getRandomValues(new Uint8Array(16)),iv=webcrypto.getRandomValues(new Uint8Array(12));
 const base=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 const key=await webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:200000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const ct=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(body)));
 return{enc:1,salt:b64e(salt),iv:b64e(iv),data:b64e(ct)};
}
async function legacyBackup(password,compressed=true){
 const raw=Buffer.from(JSON.stringify(packet()));
 return legacySeal({bk:1,z:compressed,data:b64e(compressed?deflateRawSync(raw):raw)},password);
}
const encryptedStub=()=>({enc:1,salt:b64e(Buffer.alloc(16)),iv:b64e(Buffer.alloc(12)),data:b64e(Buffer.alloc(32))});
const localFile=raw=>new File([JSON.stringify(raw)],'SYNTHETIC_COMPAT_BACKUP.json',{type:'application/json'});
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(extra={}){
 let forbidden=0;const deny=()=>{forbidden++;throw Error('forbidden storage/network/shared-state action');};
 const c=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,
  S:new Proxy({},{get:deny,set:deny}),U:new Proxy({},{get:deny,set:deny}),fetch:deny,save:deny,saveNow:deny,
  localStorage:new Proxy({},{get:deny,set:deny}),sessionStorage:new Proxy({},{get:deny,set:deny}),indexedDB:new Proxy({},{get:deny,set:deny})});
 vm.runInContext(block('const b64e = (u8) => {','function connectLink(')+block('async function deriveKey(','async function wrap('),c);
 const updates=[],attempts=[];let ancillary=0;
 const api=API.create({readFile:file=>file.arrayBuffer(),
  decodeBackup:async(raw,password,context)=>{attempts.push(password);return extra.decodeBackup?extra.decodeBackup(raw,password,context):bounded.decodeBackup(raw,password,{...context,openJSON:c.openJSON,base64Decode:vm.runInContext('b64d',c)});},
  counts:bounded.counts,isActive:()=>true,onUpdate:value=>updates.push(clone(value)),
  readAncillary:async()=>{ancillary++;return{total:124,audio:20,workbooks:100,other:4,unclassified:0,bytes:1234567,matchedRecordings:1};}});
 return{api,updates,attempts,ancillary:()=>ancillary,safe(...passwords){assert.equal(forbidden,0);const rendered=JSON.stringify(updates);assert(!rendered.includes('SYNTHETIC_COMPAT_'));for(const password of passwords)assert(!rendered.includes(password));}};
}
for(const compressed of [false,true])for(const sample of [
 {name:'NFC encrypted to NFD input',stored:'SYNTHETIC_COMPAT_が確認',typed:'SYNTHETIC_COMPAT_か\u3099確認'},
 {name:'NFD encrypted to NFC input',stored:'SYNTHETIC_COMPAT_か\u3099確認',typed:'SYNTHETIC_COMPAT_が確認'},
 {name:'trimmed legacy input',stored:'SYNTHETIC_COMPAT_前後空白',typed:' \tSYNTHETIC_COMPAT_前後空白\u3000 '},
 {name:'legacy internal whitespace removal',stored:'SYNTHETIC_COMPAT_内部空白',typed:'SYNTHETIC_COMPAT_内 部\u3000空白'}
])test('old exporter '+(compressed?'compressed ':'uncompressed ')+sample.name+' is inspected with bounded local legacy candidates',async()=>{
 const raw=await legacyBackup(sample.stored,compressed),before=JSON.stringify(raw),file=localFile(raw),bytes=Buffer.from(await file.arrayBuffer()),f=fixture();
 f.api.select(file);const result=await f.api.check(sample.typed);assert.equal(result.status,'checked');assert.equal(result.counts.songs,1);assert.equal(result.counts.recs,1);assert.equal(result.ancillary.total,124);assert.equal(f.ancillary(),1);
 assert.equal(f.attempts[0],sample.typed);assert(f.attempts.includes(sample.stored));assert(f.attempts.length<=9);assert.equal(new Set(f.attempts).size,f.attempts.length);
 assert.equal(JSON.stringify(raw),before);assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);f.safe(sample.stored,sample.typed);
});
test('exact Japanese spelling, full/half width, and surrounding spaces remain the first successful candidate',async()=>{
 const password=' \tSYNTHETIC_COMPAT_ＡＢＣｶﾀｶﾅか\u3099🎵\u3000 ',f=fixture();f.api.select(localFile(await legacyBackup(password)));
 assert.equal((await f.api.check(password)).status,'checked');assert.deepEqual(f.attempts,[password]);f.safe(password);
});
test('all invalid variants stop at nine unique candidates and retain no successful packet or ancillary result',async()=>{
 const password=' \tSYNTHETIC_COMPAT_が e\u0301\u3000 ',f=fixture({decodeBackup:async()=>{throw Object.assign(Error('private crypto detail'),{inspectionCode:'decrypt-failed'});}});
 f.api.select(localFile(encryptedStub()));assert.equal((await f.api.check(password)).status,'decrypt-failed');assert.equal(f.attempts[0],password);assert.equal(f.attempts.length,9);assert.equal(new Set(f.attempts).size,9);assert.equal(f.ancillary(),0);
 const final=f.updates.at(-1);assert.equal(final.counts,null);assert.equal(final.at,null);assert.equal(final.ancillary,null);f.safe(password);
});
for(const status of ['backup-format','backup-limit','compression-unavailable','state-format','cancelled'])test(status+' after decryption must stop without trying another candidate',async()=>{
 const password=' \tSYNTHETIC_COMPAT_か\u3099\u3000 ',f=fixture({decodeBackup:async()=>{throw Object.assign(Error('private non-key detail'),{inspectionCode:status});}});
 f.api.select(localFile(encryptedStub()));assert.equal((await f.api.check(password)).status,status);assert.deepEqual(f.attempts,[password]);assert.equal(f.ancillary(),0);f.safe(password);
});
test('unclassified decoder exceptions stop immediately without enumerating further secret variants',async()=>{
 const password=' \tSYNTHETIC_COMPAT_か\u3099\u3000 ',f=fixture({decodeBackup:async()=>{throw Error('private runtime detail');}});
 f.api.select(localFile(encryptedStub()));const result=await f.api.check(password);assert.notEqual(result.status,'checked');assert.deepEqual(f.attempts,[password]);assert.equal(f.ancillary(),0);f.safe(password);
});
test('legacy explicit badKey exceptions allow only the bounded old-password fallback',async()=>{
 const password=' \tSYNTHETIC_COMPAT_か\u3099\u3000 ',stored=password.trim(),f=fixture({decodeBackup:async(raw,key)=>{if(key!==stored)throw Object.assign(Error('private bad-key detail'),{badKey:1});return packet();}});
 f.api.select(localFile(encryptedStub()));assert.equal((await f.api.check(password)).status,'checked');assert.equal(f.attempts[0],password);assert.equal(f.attempts.at(-1),stored);assert(f.attempts.length<=9);f.safe(password,stored);
});
test('successful decrypt followed by malformed packet stops without trying another candidate',async()=>{
 const password=' \tSYNTHETIC_COMPAT_か\u3099\u3000 ',f=fixture({decodeBackup:async()=>({app:'other',at:1,state:{}})});
 f.api.select(localFile(encryptedStub()));assert.equal((await f.api.check(password)).status,'backup-format');assert.deepEqual(f.attempts,[password]);assert.equal(f.ancillary(),0);f.safe(password);
});
test('unencrypted old backup needs one decode and does not enumerate legacy password candidates',async()=>{
 const password=' \tSYNTHETIC_COMPAT_か\u3099\u3000 ',f=fixture();f.api.select(localFile({bk:1,z:false,data:b64e(Buffer.from(JSON.stringify(packet())))}));
 assert.equal((await f.api.check(password)).status,'checked');assert.deepEqual(f.attempts,[password]);f.safe(password);
});
test('cancelled pending decrypt cannot trigger fallback or inspect ancillary state',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),password=' \tSYNTHETIC_COMPAT_か\u3099\u3000 ',f=fixture({decodeBackup:async()=>{await pending;throw Object.assign(Error('private crypto detail'),{inspectionCode:'decrypt-failed'});}});
 f.api.select(localFile(encryptedStub()));const check=f.api.check(password);await new Promise(resolve=>setImmediate(resolve));f.api.cancel();release();assert.equal((await check).status,'cancelled');assert.deepEqual(f.attempts,[password]);assert.equal(f.ancillary(),0);f.safe(password);
});
