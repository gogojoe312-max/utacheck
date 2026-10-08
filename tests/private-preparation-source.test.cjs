'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {read} = require('../private-preparation-source.js');
const OWNER = 'synthetic-owner', REPO = 'private-data', TOKEN = 'synthetic-already-saved-token';
const PREFIX = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
const MANIFEST = {app:'synthetic-preparations', version:1, items:[{id:'test-item', text:'架空の準備資料'}]};
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status, headers:{'content-type':'application/json', ...headers}});
function fixture(change = {}) {
  const text = JSON.stringify(MANIFEST);
  const file = {type:'file', path:'utacheck/prepared.json', name:'prepared.json', encoding:'base64', size:Buffer.byteLength(text),
    sha:'a'.repeat(40), content:Buffer.from(text).toString('base64'), download_url:'https://forbidden.example/never-follow'};
  const calls = [];
  const responses = [() => json({login:OWNER}), () => json({private:true, full_name:OWNER+'/'+REPO, owner:{login:OWNER}}), () => json({...file, ...change.file}),
    () => json({sha:file.sha, size:file.size, content:file.content, encoding:'base64', ...change.blob})];
  if (change.responses) change.responses.forEach((r, i) => { if (r) responses[i] = r; });
  const options = {owner:OWNER, repo:REPO, token:TOKEN, fetch:async(url, init) => {
    calls.push({url, init});
    if (change.beforeResponse) await change.beforeResponse(calls.length);
    assert.ok(calls.length <= 4, 'no retries, writes, or unbounded secondary downloads');
    return responses[calls.length - 1]();
  }};
  return {options, calls, file};
}
test('existing owner identity reads only the fixed private file and returns its exact manifest', async () => {
  const f = fixture(), result = await read(f.options);
  assert.deepEqual(result, {status:'ready', manifest:MANIFEST, sourceSha:'a'.repeat(40), sourcePath:'utacheck/prepared.json'});
  assert.deepEqual(f.calls.map(c => c.url), ['https://api.github.com/user', PREFIX, PREFIX+'/contents/utacheck/prepared.json']);
  for (const {url, init} of f.calls) {
    assert.equal(new URL(url).origin, 'https://api.github.com');
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'omit'); assert.equal(init.headers.Authorization, 'Bearer '+TOKEN);
    assert.equal(init.headers['X-GitHub-Api-Version'], '2022-11-28'); assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.body, undefined);
  }
  assert.ok(!JSON.stringify(result).includes(TOKEN));
});
test('missing token performs no network access', async () => {
  for (const token of ['', undefined, null]) { const f = fixture(); const result = await read({...f.options, token});
    assert.equal(result.code, 'MISSING_TOKEN'); assert.equal(f.calls.length, 0); }
});
test('invalid configuration, traversal, injected headers, and malformed signals fail closed', async () => {
  for (const patch of [{owner:'other/owner'}, {owner:'https://evil.example'}, {repo:'../data'}, {repo:'..'}, {repo:'data?ref=evil'},
    {token:'injected\nheader'}, {token:5}, {signal:{addEventListener:3, removeEventListener:3}}, {isActive:true}]) {
    const f = fixture(); const result = await read({...f.options, ...patch}); assert.equal(result.code, 'INVALID_CONFIG'); assert.equal(f.calls.length, 0);
  }
  assert.equal((await read(null)).code, 'INVALID_CONFIG');
});
test('wrong authenticated owner is refused before any repository access', async () => {
  const f = fixture({responses:[() => json({login:'someone-else'})]});
  assert.equal((await read(f.options)).code, 'OWNER_MISMATCH'); assert.equal(f.calls.length, 1);
});
test('public and mismatched repositories are refused before contents access', async () => {
  for (const [repo, code] of [[{private:false, full_name:OWNER+'/'+REPO, owner:{login:OWNER}}, 'REPOSITORY_NOT_PRIVATE'],
    [{private:true, full_name:'other/private', owner:{login:OWNER}}, 'REPOSITORY_MISMATCH'],
    [{private:true, full_name:OWNER+'/'+REPO, owner:{login:'other'}}, 'REPOSITORY_MISMATCH']]) {
    const f = fixture({responses:[null, () => json(repo)]}); assert.equal((await read(f.options)).code, code); assert.equal(f.calls.length, 2);
  }
});
test('repository privacy and owner identity are rechecked on each read', async () => {
  const a = fixture(); assert.equal((await read(a.options)).status, 'ready');
  const b = fixture({responses:[null, () => json({private:false})]}); assert.equal((await read(b.options)).code, 'REPOSITORY_NOT_PRIVATE');
});
test('identity matching respects GitHub case-insensitive logins', async () => {
  const f = fixture({responses:[() => json({login:OWNER.toUpperCase()}), () => json({private:true, full_name:(OWNER+'/'+REPO).toUpperCase(), owner:{login:OWNER.toUpperCase()}})]});
  assert.equal((await read(f.options)).status, 'ready');
});
test('HTTP failures do not retry or leak GitHub response/error/token details', async () => {
  for (const [stage, status] of [[0,401], [1,403], [2,404], [2,429], [2,500]]) {
    const responses = []; responses[stage] = () => json({error:TOKEN, message:'private server details'}, status);
    const f = fixture({responses}); const result = await read(f.options);
    assert.deepEqual(result, {status:'unavailable', code:'HTTP_'+status}); assert.equal(f.calls.length, stage+1);
  }
  const f = fixture(); f.options.fetch = async() => {throw Error(TOKEN)};
  assert.deepEqual(await read(f.options), {status:'unavailable', code:'FETCH_FAILED'});
});
test('unexpected redirects are rejected even if a nonstandard fetch follows them', async () => {
  for (const extra of [{redirected:true}, {url:'https://evil.example/path'}]) {
    const f = fixture({responses:[() => {const r=json({login:OWNER});for(const [key,value]of Object.entries(extra))Object.defineProperty(r,key,{value});return r}]});
    assert.equal((await read(f.options)).code, 'REDIRECTED'); assert.equal(f.calls.length, 1);
  }
});
test('file path, encoding, truncation, symlink, SHA and file size checks fail closed', async () => {
  for (const [file, code] of [[{path:'other.json'},'INVALID_FILE'], [{name:'other.json'},'INVALID_FILE'], [{encoding:'utf-8'},'INVALID_FILE'],
    [{truncated:true},'INVALID_FILE'], [{type:'symlink'},'INVALID_FILE'], [{target:'other.json'},'INVALID_FILE'],
    [{submodule_git_url:'https://evil.example'},'INVALID_FILE'], [{size:0},'INVALID_FILE_SIZE'], [{size:20*1024*1024+1},'INVALID_FILE_SIZE'],
    [{size:0.5},'INVALID_FILE_SIZE'], [{sha:'bad'},'INVALID_FILE_SHA'], [{content:'@@=='},'INVALID_BASE64'], [{content:'YWJjZ'},'INVALID_BASE64'],
    [{content:5},'INVALID_FILE_CONTENT'], [{size:1},'FILE_SIZE_MISMATCH']]) {
    const f = fixture({file}); const result=await read(f.options); assert.equal(result.code, code, JSON.stringify(file)); assert.equal(f.calls.length,3);
  }
});
test('metadata-only contents fetch only the exact immutable same-repository blob', async () => {
  const f=fixture({file:{encoding:'none',content:''}});const result=await read(f.options);
  assert.deepEqual(result,{status:'ready',manifest:MANIFEST,sourceSha:'a'.repeat(40),sourcePath:'utacheck/prepared.json'});
  assert.equal(f.calls.length,4);assert.equal(f.calls[2].init.headers.Accept,'application/vnd.github.object+json');
  assert.equal(f.calls[3].url,PREFIX+'/git/blobs/'+'a'.repeat(40));assert.equal(f.calls[3].init.redirect,'error');
  assert.equal(f.calls[3].init.method,'GET');assert.equal(f.calls[3].init.headers.Authorization,'Bearer '+TOKEN);
});
test('blob fallback rejects identity, size, truncation and encoding mismatches', async () => {
  for(const blob of [{sha:'b'.repeat(40)},{size:1},{encoding:'none'},{truncated:true}]) {
    const f=fixture({file:{encoding:'none',content:''},blob});assert.equal((await read(f.options)).code,'BLOB_MISMATCH');assert.equal(f.calls.length,4);
  }
  const f=fixture({file:{encoding:'none',content:'unexpected'}});assert.equal((await read(f.options)).code,'INVALID_FILE_CONTENT');assert.equal(f.calls.length,3);
  const g=fixture({file:{encoding:'none',content:'',size:15*1024*1024+1}});assert.equal((await read(g.options)).code,'INVALID_FILE_SIZE');assert.equal(g.calls.length,3);
});
test('blob fallback HTTP, redirects and caller cancellation do not try another endpoint', async () => {
  for(const [response,code]of [[()=>json({},404),'HTTP_404'],[()=>{const r=json({});Object.defineProperty(r,'redirected',{value:true});return r},'REDIRECTED']]) {
    const f=fixture({file:{encoding:'none',content:''},responses:[null,null,null,response]});assert.equal((await read(f.options)).code,code);assert.equal(f.calls.length,4);
  }
  let active=true;const f=fixture({file:{encoding:'none',content:''},beforeResponse:count=>{if(count===3)active=false}});
  assert.equal((await read({...f.options,isActive:()=>active})).code,'INACTIVE');assert.equal(f.calls.length,3);
});
test('base64 line breaks work; invalid JSON, UTF-8, and non-object manifests are refused', async () => {
  const f = fixture(); f.options.fetch = (original => async(url,init)=>{const r=await original(url,init);if(!url.includes('/contents/'))return r;const x=await r.json();x.content=x.content.match(/.{1,12}/g).join('\r\n');return json(x)})(f.options.fetch);
  assert.deepEqual((await read(f.options)).manifest, MANIFEST);
  for (const [raw, code] of [[Buffer.from('null'),'INVALID_MANIFEST'],[Buffer.from('[]'),'INVALID_MANIFEST'],[Buffer.from('3'),'INVALID_MANIFEST'],
    [Buffer.from('{'),'INVALID_MANIFEST_JSON'],[Buffer.from([0xff]),'INVALID_MANIFEST_JSON']]) {
    const g=fixture({file:{content:raw.toString('base64'),size:raw.length}});assert.equal((await read(g.options)).code,code);
  }
});
test('malformed JSON and excessive metadata responses stop immediately', async () => {
  for (const [response, code] of [[()=>new Response('{'),'INVALID_JSON'], [()=>json([]),'INVALID_RESPONSE']]) {
    const f=fixture({responses:[response]});assert.equal((await read(f.options)).code,code);assert.equal(f.calls.length,1);
  }
  const f=fixture({responses:[()=>json({login:OWNER},200,{'content-length':'65537'})]});
  assert.equal((await read(f.options)).code,'RESPONSE_TOO_LARGE');assert.equal(f.calls.length,1);
  const g=fixture({responses:[()=>json({login:OWNER,padding:'x'.repeat(65536)})]});
  assert.equal((await read(g.options)).code,'RESPONSE_TOO_LARGE');assert.equal(g.calls.length,1);
});
test('a lying content-length cannot bypass the streaming 20 MiB contents limit', async () => {
  const response=()=>new Response(new ReadableStream({start(controller){for(let i=0;i<21;i++)controller.enqueue(new Uint8Array(1024*1024));controller.close()}}),{headers:{'content-length':'10'}});
  const f=fixture({responses:[null,null,response]});assert.equal((await read(f.options)).code,'RESPONSE_TOO_LARGE');assert.equal(f.calls.length,3);
});
test('caller cancellation and changing app state stop further network access', async () => {
  const c=new AbortController();c.abort();const f=fixture();assert.equal((await read({...f.options,signal:c.signal})).code,'ABORTED');assert.equal(f.calls.length,0);
  const g=fixture();assert.equal((await read({...g.options,isActive:()=>false})).code,'INACTIVE');assert.equal(g.calls.length,0);
  let live=true;const h=fixture({beforeResponse:count=>{if(count===2)live=false}});assert.equal((await read({...h.options,isActive:()=>live})).code,'INACTIVE');assert.equal(h.calls.length,2);
  const mid=new AbortController(),i=fixture({beforeResponse:count=>{if(count===1)mid.abort()}});assert.equal((await read({...i.options,signal:mid.signal})).code,'ABORTED');assert.equal(i.calls.length,1);
});
test('no source storage, credential creation, logging, public fallback or private production data', () => {
  const source=fs.readFileSync(path.join(__dirname,'../private-preparation-source.js'),'utf8');
  for(const forbidden of ['localStorage','sessionStorage','indexedDB','console.','download_url','gogojoe','北原','OCHA','shinkou-data'])assert.ok(!source.includes(forbidden),forbidden);
  assert.equal((source.match(/https:\/\//g)||[]).length,1);
  assert.doesNotMatch(source,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
});
