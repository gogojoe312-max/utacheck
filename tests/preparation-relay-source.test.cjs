'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {read}=require('../preparation-relay-source.js');
const token='synthetic-gist-token',owner='gogojoe312-max',repo='shinkou-data';
const manifest={app:'utacheck-private-preparation',version:1,owner,revision:'test',createdAt:'2031-01-01T00:00:00Z',operations:[]};
const ready={status:'ready',manifest,sourceSha:'a'.repeat(40),sourcePath:'utacheck/prepared.json'};
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers});
const options=fetch=>({owner,repo,token,fetch});
test('one fixed owned endpoint receives the existing login, without cookies, storage or redirects',async()=>{
 let count=0;const result=await read(options(async(url,init)=>{count++;assert.equal(url,'https://shinkou-secure.onrender.com/utacheck/prepared');assert.equal(init.method,'GET');assert.equal(init.headers.Authorization,'Bearer '+token);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.body,undefined);return json(ready);}));
 assert.deepEqual(result,ready);assert.equal(count,1);assert(!JSON.stringify(result).includes(token));
});
test('absent or malformed login/scope never sends a request',async()=>{
 for(const patch of [{token:''},{token:'a b'},{token:12},{owner:'other'},{repo:'other'},{isActive:true}]){
  let calls=0;const result=await read({...options(()=>{calls++;}),...patch});assert.equal(result.status,'unavailable');assert.equal(calls,0);
 }
});
test('only known server errors are returned; raw bodies and secrets never escape',async()=>{
 for(const [status,code]of [[503,'RELAY_NOT_CONFIGURED'],[403,'OWNER_MISMATCH'],[401,'HTTP_401'],[502,'SOURCE_UNAVAILABLE'],[500,'arbitrary-'+token]]){
  const result=await read(options(async()=>json({status:'unavailable',code,message:token},status)));
  assert.deepEqual(result,{status:'unavailable',code:code.includes(token)?'HTTP_500':code,stage:'relay'});
 }
 const result=await read(options(async()=>{throw Error(token);}));assert.equal(result.code,'FETCH_FAILED');assert(!JSON.stringify(result).includes(token));
});
test('mismatched endpoint responses and manifest envelopes fail closed',async()=>{
 for(const patch of [{sourcePath:'data.json'},{sourceSha:'bad'},{status:'other'},{manifest:{...manifest,owner:'other'}},{manifest:{...manifest,app:'other'}},{manifest:null}])assert.equal((await read(options(async()=>json({...ready,...patch})))).status,'unavailable');
 for(const patch of [{url:'https://other.example/'},{redirected:true}]){
  const response=json(ready);for(const [key,value]of Object.entries(patch))Object.defineProperty(response,key,{value});
  assert.equal((await read(options(async()=>response))).code,'REDIRECTED');
 }
});
test('error and success bodies are streamed within strict limits',async()=>{
 assert.equal((await read(options(async()=>json(ready,200,{'content-length':String(20*1024*1024+1)})))).code,'RESPONSE_TOO_LARGE');
 assert.equal((await read(options(async()=>json({error:'x'.repeat(4097)},503)))).code,'RESPONSE_TOO_LARGE');
 const response=new Response(new ReadableStream({start(c){for(let i=0;i<21;i++)c.enqueue(new Uint8Array(1024*1024));c.close();}}),{headers:{'content-length':'10'}});
 assert.equal((await read(options(async()=>response))).code,'RESPONSE_TOO_LARGE');
});
test('cancellation and changed app state discard the response',async()=>{
 const c=new AbortController();c.abort();let calls=0;
 assert.equal((await read({...options(async()=>{calls++;return json(ready);}),signal:c.signal})).code,'ABORTED');assert.equal(calls,0);
 let active=true;assert.equal((await read({...options(async()=>{active=false;return json(ready);}),isActive:()=>active})).code,'INACTIVE');
});
