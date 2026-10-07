'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {deflateRawSync}=require('node:zlib');
const {webcrypto}=require('node:crypto');
const API=require('../startup-backup-inspection.js');
const limit=20*1024*1024;
const payload={app:'utacheck',at:1234,state:{songs:[{id:'PRIVATE_SONG',lines:[{t:'PRIVATE_LYRIC'}]}],notes:[{memo:'PRIVATE_NOTE'}]}};
const clone=x=>JSON.parse(JSON.stringify(x));
const base64Decode=x=>new Uint8Array(Buffer.from(x,'base64url'));
const plain=obj=>({bk:1,z:false,data:Buffer.from(JSON.stringify(obj)).toString('base64url')});
const compressed=obj=>({bk:1,z:true,data:deflateRawSync(Buffer.from(JSON.stringify(obj))).toString('base64url')});
const context=(extra={})=>({signal:new AbortController().signal,isActive:()=>true,base64Decode,
  openJSON:()=>{throw new Error('unexpected decryption');},...extra});
const cancelled=error=>error?.inspectionCode==='cancelled';
const limited=error=>error?.inspectionCode==='backup-limit';
const formatted=error=>error?.inspectionCode==='backup-format';
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('bounded decoder real deflate-raw round-trip preserves complete payload and source bytes',async()=>{
  const raw=compressed(payload),before=JSON.stringify(raw);const result=await API.decodeBackup(raw,'',context());
  assert.deepEqual(result,payload);assert.equal(JSON.stringify(raw),before);
});

test('bounded decoder rejects a 22MiB decoded compression bomb despite tiny compressed transport',async()=>{
  const obj={app:'utacheck',at:1,state:{notes:[{memo:'x'.repeat(22*1024*1024)}]}},raw=compressed(obj),before=JSON.stringify(raw);
  assert(base64Decode(raw.data).length<100000);
  await assert.rejects(API.decodeBackup(raw,'',context()),limited);assert.equal(JSON.stringify(raw),before);
});

test('bounded decoder enforces uncompressed byte cap before UTF8/JSON decoding',async()=>{
  const raw={bk:1,z:false,data:'synthetic'},bytes=new Uint8Array(limit+1);
  await assert.rejects(API.decodeBackup(raw,'',context({base64Decode:()=>bytes})),limited);
});

test('bounded decoder rejects invalid UTF8, malformed JSON, nonbyte decode and unsupported compressed format safely',async()=>{
  for(const bytes of [new Uint8Array([255]),new Uint8Array(Buffer.from('{PRIVATE_INVALID')),new Uint16Array([1])])
    await assert.rejects(API.decodeBackup({bk:1,data:'synthetic'},'',context({base64Decode:()=>bytes})),formatted);
  const raw={bk:1,z:true,data:Buffer.from('not a deflate stream').toString('base64url')};
  await assert.rejects(API.decodeBackup(raw,'',context()),formatted);
});

test('bounded decoder initial cancellation/inactivity prevents all decryption and byte decoding',async()=>{
  let calls=0;const controller=new AbortController();controller.abort();
  const ctx=context({signal:controller.signal,openJSON:()=>{calls++;},base64Decode:()=>{calls++;}});
  await assert.rejects(API.decodeBackup({enc:1},'PRIVATE_KEY',ctx),cancelled);
  await assert.rejects(API.decodeBackup(plain(payload),'',context({isActive:()=>false,base64Decode:()=>{calls++;}})),cancelled);
  assert.equal(calls,0);
});

test('bounded decoder cancellation after decryption prevents subsequent byte decoding',async()=>{
  let release,decoded=0;const gate=new Promise(resolve=>release=resolve),controller=new AbortController();
  const pending=API.decodeBackup({enc:1},'PRIVATE_KEY',context({signal:controller.signal,openJSON:async()=>{await gate;return plain(payload);},base64Decode:()=>{decoded++;}}));
  await flush();controller.abort();release();await assert.rejects(pending,cancelled);assert.equal(decoded,0);
});

async function syntheticStream({oversize=false,abort=false,inactive=false}){
  const Native=global.DecompressionStream;
  let stream,cancelledCount=0,started=0;let current=true;
  const controller=new AbortController();
  global.DecompressionStream=class{
    constructor(format){assert.equal(format,'deflate-raw');started++;
      this.writable=new WritableStream({write(){},close(){}});
      this.readable=stream=new ReadableStream({start(output){if(oversize)output.enqueue(new Uint8Array(limit+1));},cancel(){cancelledCount++;}});
    }
  };
  try{
    const pending=API.decodeBackup({bk:1,z:true,data:'eA'},'',context({signal:controller.signal,isActive:()=>current}));
    const rejection=assert.rejects(pending,oversize?limited:cancelled);
    await flush();assert.equal(started,1);
    if(abort)controller.abort();
    if(inactive){current=false;controller.abort();}
    await rejection;
    assert.equal(cancelledCount,1);assert.equal(stream.locked,false);
  }finally{global.DecompressionStream=Native;}
}

test('bounded decoder cancels and releases oversize decompression output reader',async()=>{await syntheticStream({oversize:true});});
test('bounded decoder abort cancels a pending decompression read and releases its lock',async()=>{await syntheticStream({abort:true});});
test('bounded decoder hidden/inactive abort cancels the stream and never produces payload',async()=>{await syntheticStream({inactive:true});});

function appCrypto(){
  const source=fs.readFileSync(__dirname+'/../app.js','utf8');
  const block=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
  const shared={bkKey:'PRIVATE_SHARED_KEY',notes:[{memo:'PRIVATE_SHARED_NOTE'}]},before=JSON.stringify(shared);let touches=0;
  const c=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,
    S:new Proxy(shared,{get(){touches++;throw new Error('no shared reads');},set(){touches++;throw new Error('no shared writes');}})});
  vm.runInContext(block('const b64e = (u8) => {','function connectLink('),c);
  vm.runInContext(block('async function deriveKey(', 'async function wrap('),c);
  return{c,base64Decode:vm.runInContext('b64d',c),safe(){assert.equal(touches,0);assert.equal(JSON.stringify(shared),before);}};
}

test('bounded real encrypted+compressed app interoperability uses explicit saved key with zero shared-state accesses',async()=>{
  const crypto=appCrypto(),key='PRIVATE_SAVED_KEY',raw=await crypto.c.sealJSON(compressed(payload),key),before=JSON.stringify(raw);
  const result=await API.decodeBackup(raw,key,context({openJSON:crypto.c.openJSON,base64Decode:crypto.base64Decode}));
  assert.deepEqual(result,payload);assert.equal(JSON.stringify(raw),before);crypto.safe();
});

test('bounded real encrypted compression bomb remains limited after decryption without source/shared mutation',async()=>{
  const crypto=appCrypto(),key='PRIVATE_SAVED_KEY',raw=await crypto.c.sealJSON(compressed({notes:[{memo:'x'.repeat(22*1024*1024)}]}),key),before=JSON.stringify(raw);
  await assert.rejects(API.decodeBackup(raw,key,context({openJSON:crypto.c.openJSON,base64Decode:crypto.base64Decode})),limited);
  assert.equal(JSON.stringify(raw),before);crypto.safe();
});

test('bounded encrypted wrong-key failure is safe and cannot replace existing credentials',async()=>{
  const crypto=appCrypto(),raw=await crypto.c.sealJSON(compressed(payload),'PRIVATE_RIGHT_KEY'),before=JSON.stringify(raw);
  await assert.rejects(API.decodeBackup(raw,'PRIVATE_WRONG_KEY',context({openJSON:crypto.c.openJSON,base64Decode:crypto.base64Decode})),e=>e.inspectionCode==='decrypt-failed');
  assert.equal(JSON.stringify(raw),before);crypto.safe();
});
