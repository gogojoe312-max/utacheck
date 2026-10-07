'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const inventory=require('../startup-local-storage-inventory.js');
const PRIVATE='PRIVATE_LYRIC_MEMBER_TOKEN_EXCEPTION';
const URL='https://gist.githubusercontent.com/owner/abcde12345/raw/utacheck.json';
const PINNED=URL.replace('/raw/','/raw/'+'a'.repeat(40)+'/');
const state=(extra={})=>({groups:[{id:'g',name:PRIVATE,lastKey:JSON.stringify({lib:[],songs:[],shows:[],groupName:PRIVATE})}],
  shows:[{id:'show'}],songs:[{id:'song',lines:[{txt:PRIVATE}]}],members:[{id:'m',name:PRIVATE}],ghToken:PRIVATE,...extra});
const envelope=(seq=7,value=state())=>({seq,txt:JSON.stringify(value)});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function local(values={},extra={}){
  const keys=Object.keys(values),reads=[];
  return {length:keys.length,key:index=>keys[index]??null,getItem:key=>{reads.push(key);if(extra.fail?.(key))throw Error(PRIVATE);return values[key]??null;},reads,...extra};
}
function database(values={state:{},clips:{}},extra={}){
  const events=[],rowsSeen=[],transactions=[];
  const db={name:'utacheck',objectStoreNames:{contains:name=>Object.hasOwn(values,name)},
    transaction(name,mode){
      events.push({op:'transaction',name,mode});assert.equal(mode,'readonly');if(extra.failTransaction?.(name))throw Error(PRIVATE);
      let aborted=false,position=0;const rows=Object.entries(values[name]),tx={
        abort(){aborted=true;events.push({op:'abort',name});setImmediate(()=>tx.onabort?.());},
        objectStore(store){assert.equal(store,name);return {openCursor(){
          const request={};
          const next=()=>setImmediate(()=>{
            if(aborted)return;if(extra.stall?.(name))return;
            if(extra.failAt?.[name]===position){tx.onerror?.();return;}
            const row=rows[position++];
            if(!row){request.result=null;request.onsuccess?.();setImmediate(()=>{if(!aborted)tx.oncomplete?.();});return;}
            rowsSeen.push(row);request.result={key:row[0],value:row[1],continue:next};request.onsuccess?.();extra.afterRow?.({name,position,tx});
          });next();return request;
        },put(){throw Error('write forbidden');},delete(){throw Error('write forbidden');},add(){throw Error('write forbidden');}};}
      };transactions.push(tx);return tx;
    },...extra.override};
  return {db,events,rowsSeen,transactions};
}
const inspect=extra=>inventory.inspect({database:database().db,storage:local(),...extra});
function safe(result){
  const encoded=JSON.stringify(result.summary);assert(!encoded.includes(PRIVATE));assert(!encoded.includes('http'));assert(!encoded.includes('abcde'));
  for(const [key,value] of Object.entries(result.summary)){
    assert(!/key$|url|token|body|lyric|message/i.test(key));
    assert(typeof value==='number'||typeof value==='boolean'||typeof value==='string');
    if(typeof value==='string')assert(['checking','checked','partial','cancelled','unavailable','read','failed','limited'].includes(value));
    if(typeof value==='number')assert(Number.isSafeInteger(value)&&value>=0);
  }
}
test('all existing state keys are scanned read-only, including preserved wrappers and actual generations',async()=>{
  const s=state(),original=JSON.stringify(s),db=database({state:{'state:0':envelope(10,s),'state:1':envelope(11,s),
    'preserved:startup:v1:PRIVATE':{slots:[{present:true,value:envelope(4,s)},{present:false}],legacy:JSON.stringify(s)},
    'preserved:recovery:v1:PRIVATE':{app:'utacheck',state:s},'metadata':{v:1,hold:PRIVATE}},clips:{}});
  const result=await inspect({database:db.db});
  assert.equal(result.summary.stateKeys,5);assert.equal(result.summary.records,5);assert.equal(result.summary.lastKeyCopies,5);
  assert.equal(result.summary.fullWorkCandidates,5);assert.deepEqual(result.records.map(x=>x.seq),[10,11,4,0,0]);
  assert.deepEqual(result.records.map(x=>x.seqKnown),[true,true,true,false,false]);assert.deepEqual(result.records.map(x=>x.ordinal),[0,1,2,3,4]);
  assert.equal(JSON.stringify(s),original);assert(db.events.filter(x=>x.op==='transaction').every(x=>x.mode==='readonly'));safe(result);
});
test('validation and unpacking never receive original nested values or discard packed lyric libraries',async()=>{
  const s=state({songs:[{id:'song',L:0}],songLib:[[{txt:PRIVATE}]]}),original=JSON.stringify(s);
  const result=await inspect({database:database({state:{x:s},clips:{}}).db,
    validateState:copy=>{copy.groups[0].name='PRIVATE_MUTATED_VALIDATION';},
    unpackState:copy=>{copy.songs[0].lines=copy.songLib[0];delete copy.songs[0].L;delete copy.songLib;return copy;}});
  assert.equal(JSON.stringify(s),original);assert.equal(result.records[0].state.groups[0].name,PRIVATE);
  assert.equal(result.records[0].state.songs[0].lines[0].txt,PRIVATE);assert.equal(result.summary.songLibEntries,1);safe(result);
});
test('invalid or asynchronous validator/unpacker results cannot create a state candidate',async()=>{
  for(const extra of [{validateState:()=>false},{validateState:()=>Promise.resolve(true)},
    {unpackState:()=>({})},{unpackState:()=>Promise.resolve(state())},{unpackState:()=>undefined}]){
    const result=await inspect({database:database({state:{x:state()},clips:{}}).db,...extra});
    assert.equal(result.records.length,0);assert.equal(result.summary.invalidState,1);safe(result);
  }
});
test('only recognized structures unwrap, at most two wrapper layers, without guessing generation numbers',async()=>{
  const s=state(),values={a:{txt:JSON.stringify(s)},b:{seq:-1,txt:JSON.stringify(s)},c:{seq:1.5,txt:JSON.stringify(s)},
    d:{seq:Number.MAX_SAFE_INTEGER+1,txt:JSON.stringify(s)},e:{foo:s},
    f:{txt:JSON.stringify({app:'utacheck',state:s})},g:{txt:JSON.stringify({txt:JSON.stringify({app:'utacheck',state:s})})},
    h:{app:'another',state:s},i:{slots:[{present:true,value:envelope()}],legacy:null}};
  const result=await inspect({database:database({state:values,clips:{}}).db});
  assert.equal(result.records.length,3);assert.equal(result.records[0].seq,0);assert.equal(result.records[0].seqKnown,false);
  assert.equal(result.records[2].seq,7);assert.equal(result.summary.invalidState,3);assert(result.summary.unsupportedValues>=3);safe(result);
});
test('malformed JSON, foreign payloads, invalid state and failed callbacks stay distinct from absence',async()=>{
  const db=database({state:{bad:'PRIVATE not json',foreign:{app:'foreign',state:state()},invalid:state({songs:[{lines:PRIVATE}]}),
    nonJSON:null,raw:42,good:state()},clips:{}});
  const result=await inspect({database:db.db,validateState:()=>{throw Error(PRIVATE);}});
  assert.equal(result.summary.stateKeys,6);assert.equal(result.records.length,0);assert.equal(result.summary.invalidJSON,1);
  assert.equal(result.summary.invalidState,2);assert.equal(result.summary.unsupportedValues,3);safe(result);
  const empty=await inspect();assert.equal(empty.summary.stateKeys,0);assert.equal(empty.summary.stateStatus,'read');safe(empty);
});
test('direct state requires own groups/songs/shows arrays and publication remains a separate private candidate',async()=>{
  const inherited=Object.create({groups:[],songs:[],shows:[]});inherited.secret=PRIVATE;
  const packet={lib:[{title:PRIVATE}],songs:[],shows:[],groupName:PRIVATE};
  const result=await inspect({database:database({state:{inherited,missing:{songs:[],shows:[]},publication:packet},clips:{}}).db});
  assert.equal(result.records.length,0);assert.equal(result.publications.length,1);assert.equal(result.publications[0].data.lib[0].title,PRIVATE);
  assert.equal(result.summary.publications,1);safe(result);
});
test('localStorage enumerates metadata but reads only confirmed own body keys, never member names or other app data',async()=>{
  const values={'other-app:PRIVATE':'PRIVATE_OTHER_APP_VALUE','utacheck.v1':JSON.stringify(state()),
    'utacheck.v1:broken:PRIVATE':JSON.stringify(envelope(5)),['utacheck.member:'+URL]:PRIVATE,['utacheck.selection:viewer:'+PINNED]:PRIVATE};
  const storage=local(values,{fail:key=>key!=='utacheck.v1'&&!key.startsWith('utacheck.v1:broken:')});
  const result=await inspect({storage});
  assert.deepEqual(storage.reads,['utacheck.v1','utacheck.v1:broken:PRIVATE']);assert.equal(result.records.length,2);
  assert.equal(result.summary.memberRecords,1);assert.equal(result.summary.viewerSelections,1);assert.equal(result.endpoints.length,2);
  assert.deepEqual(result.endpoints[1],{id:'abcde12345',url:URL,pinnedUrl:PINNED});safe(result);
});
test('endpoint validation rejects credentials, query, fragment, port, unsafe paths and other hosts',async()=>{
  const bad=[URL+'?token='+PRIVATE,URL+'#'+PRIVATE,URL.replace('https://','https://user:password@'),URL.replace('.com/','.com:443/'),
    URL.replace('gist.githubusercontent.com','evil.example'),URL.replace('https:','http:'),URL.replace('/owner/','/../'),
    URL.replace('abcde12345','xyz'),URL.replace('/raw/','/raw/short/'),URL.replace('utacheck.json','other.json'),URL+'/',
    URL.replace('/owner/','/owner%2fpath/'),URL.replace('/raw/','/RAW/')];
  // Letter case in exact GitHub paths is meaningful; uppercase RAW is invalid.
  const values=Object.fromEntries(bad.map(url=>['utacheck.member:'+url,PRIVATE]));
  const result=await inspect({storage:local(values)});
  assert.equal(result.endpoints.length,0);assert.equal(result.summary.invalidEndpointKeys,bad.length);safe(result);
});
test('localStorage individual failures and key enumeration races retain successful candidates as partial',async()=>{
  const storage=local({'utacheck.v1':JSON.stringify(state()),'utacheck.v1:broken:bad':PRIVATE},{fail:key=>key.endsWith(':bad')});
  const result=await inspect({storage});assert.equal(result.records.length,1);assert.equal(result.summary.partial,true);assert.equal(result.summary.localStorageStatus,'partial');safe(result);
  const missing=local({'utacheck.v1':JSON.stringify(state())},{getItem:()=>null});const race=await inspect({storage:missing});
  assert.equal(race.summary.partial,true);assert.equal(race.summary.readFailures,1);safe(race);
});
test('localStorage key-enumeration failure retains earlier known bodies and never reads unrelated values',async()=>{
  const storage=local({'utacheck.v1':JSON.stringify(state()),'other:PRIVATE':PRIVATE},{key:index=>{if(index===1)throw Error(PRIVATE);return 'utacheck.v1';}});
  const result=await inspect({storage});assert.equal(result.records.length,1);assert.equal(result.summary.localStorageStatus,'partial');assert.deepEqual(storage.reads,['utacheck.v1']);safe(result);
});
test('localStorage metadata scan has an explicit bound without expanding values outside that bound',async()=>{
  let reads=0,keys=0;const storage={length:4097,key:index=>{keys++;return 'other:'+index;},getItem(){reads++;throw Error(PRIVATE);}};
  const result=await inspect({storage});assert.equal(keys,4096);assert.equal(reads,0);assert.equal(result.summary.localStorageKeys,4096);
  assert.equal(result.summary.localStorageStatus,'partial');assert.equal(result.summary.limitHits,1);safe(result);
});
test('only existing known database is read; unknown databases are listed as metadata without open or upgrade',async()=>{
  let opens=0,listed=0;const idb={databases:async()=>{listed++;return[{name:'utacheck'},{name:'PRIVATE_OTHER_DB'}];},open(){opens++;throw Error(PRIVATE);},deleteDatabase(){throw Error('delete forbidden');}};
  const result=await inspect({indexedDB:idb});assert.equal(listed,1);assert.equal(opens,0);assert.equal(result.summary.databases,2);safe(result);
  let touched=0;const foreign={name:'PRIVATE_OTHER_DB',transaction(){touched++;throw Error(PRIVATE);}};
  const skipped=await inspect({database:foreign,indexedDB:idb});assert.equal(touched,0);assert.equal(skipped.summary.stateStatus,'unavailable');assert.equal(skipped.summary.partial,true);safe(skipped);
});
test('unavailable database enumeration and failed enumeration never assert databases absent',async()=>{
  const unavailable=await inspect({indexedDB:{open(){throw Error('never');}}});assert.equal(unavailable.summary.databaseEnumerationStatus,'unavailable');safe(unavailable);
  const failed=await inspect({indexedDB:{databases:async()=>{throw Error(PRIVATE);}}});assert.equal(failed.summary.databaseEnumerationStatus,'failed');assert.equal(failed.summary.partial,true);safe(failed);
});
test('real Excel/audio/JSON headers classify existing clips while preserving original references and byte hashes',async()=>{
  const wav=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVE'),Buffer.from(PRIVATE)]),
    ole=Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]),zip=Buffer.from([0x50,0x4b,3,4]),
    ogg=Buffer.from('OggS'+PRIVATE),mp4=Buffer.concat([Buffer.alloc(4),Buffer.from('ftyp'+PRIVATE)]),webm=Buffer.from([0x1a,0x45,0xdf,0xa3]),
    mpeg=Buffer.from([0xff,0xfb,0]),json=Buffer.from(JSON.stringify({app:'utacheck',state:state()}));
  const values={'xls:one':ole,'xls:two':zip,'rec:wave':wav,'rec:ogg':ogg,'rec:mp4':mp4,'rec:webm':webm,'rec:mpeg':mpeg,
    'json:PRIVATE':json,'xls:wrong':Buffer.from(PRIVATE),'unknown:PRIVATE':{secret:PRIVATE}};
  const hashes=Object.fromEntries(Object.entries(values).filter(([,value])=>Buffer.isBuffer(value)).map(([key,value])=>[key,hash(value)]));
  const result=await inspect({database:database({state:{},clips:values}).db});
  assert.equal(result.summary.clipsTotal,10);assert.equal(result.summary.workbookClips,2);assert.equal(result.summary.audioClips,5);
  assert.equal(result.summary.jsonClips,1);assert.equal(result.summary.otherClips,1);assert.equal(result.summary.unclassifiedClips,1);assert.equal(result.records.length,1);
  for(const clip of result.clips){assert.strictEqual(clip.value,values[clip.key]);if(hashes[clip.key])assert.equal(hash(clip.value),hashes[clip.key]);}
  safe(result);
});
test('audio/Excel Blob classification reads at most a 512-byte header without full binary reads',async()=>{
  let fullReads=0;const headers=[];
  class OriginalBlob extends Blob{
    arrayBuffer(){fullReads++;return super.arrayBuffer();}
    slice(start,end){headers.push(end-start);return super.slice(start,end);}
  }
  const audio=new OriginalBlob(['OggS'+PRIVATE+'x'.repeat(4096)],{type:'audio/ogg'}),
    excel=new OriginalBlob([Buffer.from([0x50,0x4b,3,4]),PRIVATE],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const result=await inspect({database:database({state:{},clips:{audio,excel}}).db});
  assert.equal(fullReads,0);assert.deepEqual(headers,[512,512]);assert.equal(result.summary.audioClips,1);assert.equal(result.summary.workbookClips,1);
  assert.strictEqual(result.clips[0].value,audio);assert.strictEqual(result.clips[1].value,excel);safe(result);
});
test('JSON Blob larger than 20MiB is bounded before a full read and remains retained privately',async()=>{
  let fullReads=0;class BigBlob extends Blob{arrayBuffer(){fullReads++;return super.arrayBuffer();}}
  const value=new BigBlob(['{"private":"','x'.repeat(20*1024*1024),'"}']);
  const result=await inspect({database:database({state:{},clips:{original:value}}).db});
  assert.equal(fullReads,0);assert.equal(result.summary.partial,true);assert.equal(result.summary.limitHits,1);assert.strictEqual(result.clips[0].value,value);safe(result);
});
test('clip header failures become unconfirmed while later originals and state candidates remain available',async()=>{
  class BrokenBlob extends Blob{slice(){throw Error(PRIVATE);}}
  const result=await inspect({database:database({state:{valid:state()},clips:{bad:new BrokenBlob([PRIVATE]),good:Buffer.from('OggS')}}).db});
  assert.equal(result.records.length,1);assert.equal(result.clips.length,2);assert.equal(result.summary.unclassifiedClips,1);assert.equal(result.summary.audioClips,1);
  assert.equal(result.summary.partial,true);safe(result);
});
test('CacheStorage lookup uses only utacheck cache names and known local/validated endpoint URLs without opening caches',async()=>{
  const calls=[],body=JSON.stringify({app:'utacheck',state:state()}),original=new Response(body),publication=new Response(JSON.stringify({lib:[],songs:[],shows:[],groupName:PRIVATE}));
  const cache={keys:async()=>['utacheck-v36','OTHER_PRIVATE_CACHE'],match:async(url,options)=>{calls.push({url,options});
    assert.equal(options.cacheName,'utacheck-v36');assert.equal(options.ignoreSearch,true);if(url===PINNED)return original;if(url==='./setlist.json')return publication;},
    open(){throw Error('cache open forbidden');},delete(){throw Error('cache delete forbidden');},put(){throw Error('cache write forbidden');}};
  const result=await inspect({cacheStorage:cache,storage:local({['utacheck.member:'+PINNED]:PRIVATE})});
  assert.deepEqual(calls.map(x=>x.url),['./index.html','./setlist.json',PINNED,'https://api.github.com/gists/abcde12345']);assert.equal(result.summary.cacheNames,1);
  assert.equal(result.summary.cacheEnumeration,'partial');assert.equal(result.summary.partial,false);assert.equal(result.records.length,1);assert.equal(result.publications.length,1);
  assert.equal(await original.text(),body);safe(result);
});
test('cache lookup finds old timestamp-query variants without accepting queried source locators',async()=>{
  const cachedURL=URL+'?t=1700000000000',calls=[],cacheStorage={keys:async()=>['utacheck-old'],match:async(url,options)=>{
    calls.push(url);assert.equal(options.ignoreSearch,true);
    if(url===cachedURL.split('?')[0])return new Response(JSON.stringify({lib:[],songs:[],shows:[],groupName:PRIVATE}));
  }};
  const result=await inspect({cacheStorage,storage:local({['utacheck.member:'+URL]:PRIVATE,['utacheck.member:'+cachedURL]:PRIVATE})});
  assert.equal(result.endpoints.length,1);assert.equal(result.summary.invalidEndpointKeys,1);assert.equal(result.publications.length,1);
  assert.equal(result.publications[0].id,'abcde12345');assert.equal(result.summary.cacheEnumeration,'partial');assert(!calls.includes(cachedURL));safe(result);
});
test('known cached Gist API response reads only complete established file content and keeps a verified private locator',async()=>{
  let headerReads=0;const calls=[],apiURL='https://api.github.com/gists/abcde12345',body={id:'abcde12345',owner:{login:PRIVATE},
    files:{'utacheck.json':{truncated:false,content:JSON.stringify({lib:[],songs:[],shows:[],groupName:PRIVATE}),raw_url:'https://evil.example/'+PRIVATE},
      'utacheck-backup.json':{truncated:false,content:JSON.stringify({app:'utacheck',state:state()})},
      'other.json':{truncated:false,content:JSON.stringify(state({notes:[{memo:'PRIVATE_OTHER_FILE'}]}))}},description:PRIVATE};
  const response={get headers(){headerReads++;throw Error(PRIVATE);},clone:()=>({body:new Response(JSON.stringify(body)).body})},
    cacheStorage={keys:async()=>['utacheck-old'],match:async(url,options)=>{calls.push(url);assert.equal(options.ignoreSearch,true);return url===apiURL?response:undefined;}};
  const result=await inspect({cacheStorage,storage:local({['utacheck.member:'+URL]:PRIVATE})});
  assert.equal(headerReads,0);assert.equal(result.records.length,1);assert.equal(result.records[0].state.notes,undefined);
  assert.equal(result.publications.length,1);assert.equal(result.publications[0].id,'abcde12345');assert.deepEqual(calls,['./index.html','./setlist.json',URL,apiURL]);safe(result);
});
test('cached Gist response id mismatch or missing id cannot supply candidate content or a new endpoint',async()=>{
  for(const id of ['fffff12345',PRIVATE,undefined,null]){
    const body={id,files:{'utacheck.json':{truncated:false,content:JSON.stringify(state())}}},
      cacheStorage={keys:async()=>['utacheck-old'],match:async url=>url.startsWith('https://api.github.com/')?new Response(JSON.stringify(body)):undefined};
    const result=await inspect({cacheStorage,storage:local({['utacheck.member:'+URL]:PRIVATE})});
    assert.equal(result.records.length,0);assert.equal(result.publications.length,0);assert.equal(result.endpoints.length,1);assert.equal(result.summary.invalidState,1);safe(result);
  }
});
test('cached Gist files with truncated, absent-truncation or non-string content remain unconfirmed',async()=>{
  for(const file of [{truncated:true,content:JSON.stringify(state())},{content:JSON.stringify(state())},
    {truncated:false,content:state()},{truncated:false,content:null}]){
    const body={id:'abcde12345',files:{'utacheck.json':file}},cacheStorage={keys:async()=>['utacheck-old'],
      match:async url=>url.startsWith('https://api.github.com/')?new Response(JSON.stringify(body)):undefined};
    const result=await inspect({cacheStorage,storage:local({['utacheck.member:'+URL]:PRIVATE})});
    assert.equal(result.records.length,0);assert.equal(result.summary.invalidState,1);safe(result);
  }
});
test('cache unavailable/failure status distinguishes unknown contents and preserves successful state reads',async()=>{
  const unavailable=await inspect();assert.equal(unavailable.summary.cacheEnumeration,'unavailable');safe(unavailable);
  for(const cacheStorage of [{keys:async()=>{throw Error(PRIVATE);},match:async()=>{}},
    {keys:async()=>['utacheck-old'],match:async()=>{throw Error(PRIVATE);}}]){
    const result=await inspect({database:database({state:{valid:state()},clips:{}}).db,cacheStorage});
    assert.equal(result.records.length,1);assert.equal(result.summary.partial,true);assert(['failed','partial'].includes(result.summary.cacheLookupStatus));safe(result);
  }
});
test('cached non-JSON index body is never read and invalid JSON setlist has only a fixed count',async()=>{
  let cloneReads=0;const html={clone(){cloneReads++;throw Error(PRIVATE);}},cacheStorage={keys:async()=>['utacheck-old'],match:async url=>url==='./index.html'?html:new Response('{'+PRIVATE)};
  const result=await inspect({cacheStorage});assert.equal(cloneReads,0);assert.equal(result.summary.invalidJSON,1);assert.equal(result.summary.cachedResponses,2);safe(result);
});
test('cached stream has a 20MiB cap independent of forged headers and cancels its reader',async()=>{
  let cancelled=0,pulls=0;const stream={read:async()=>{pulls++;return {done:false,value:new Uint8Array(1024*1024)};},cancel:async()=>{cancelled++;},releaseLock(){}};
  const response={clone:()=>({body:{getReader:()=>stream}})},cacheStorage={keys:async()=>['utacheck-old'],match:async url=>url==='./setlist.json'?response:undefined};
  const result=await inspect({cacheStorage});assert.equal(pulls,21);assert.equal(cancelled,1);assert.equal(result.records.length,0);assert.equal(result.summary.limitHits,1);assert.equal(result.summary.partial,true);safe(result);
});
test('a failure after successful cursor rows retains their candidates and marks the store partial',async()=>{
  const db=database({state:{one:envelope(2),two:envelope(3)},clips:{}},{failAt:{state:1}}),result=await inspect({database:db.db});
  assert.equal(result.records.length,1);assert.equal(result.records[0].seq,2);assert.equal(result.summary.stateStatus,'failed');assert.equal(result.summary.partial,true);safe(result);
});
test('missing stores and failed transactions do not masquerade as empty successful stores',async()=>{
  const missing=await inspect({database:database({state:{}}).db});assert.equal(missing.summary.clipsStatus,'unavailable');assert.equal(missing.summary.partial,true);safe(missing);
  const failed=await inspect({database:database(undefined,{failTransaction:()=>true}).db});assert.equal(failed.summary.stateStatus,'failed');assert.equal(failed.summary.clipsStatus,'failed');assert.equal(failed.summary.readFailures,2);safe(failed);
});
test('state and clip cursor bounds are explicit partial results and only abort read-only transactions',async()=>{
  const db=database({state:Object.fromEntries(Array.from({length:513},(_,i)=>['k'+i,{v:1}])),
    clips:Object.fromEntries(Array.from({length:1025},(_,i)=>['clip'+i,new Uint8Array(0)]))});
  const result=await inspect({database:db.db});assert.equal(result.summary.stateKeys,512);assert.equal(result.summary.clipsTotal,1024);assert.equal(result.summary.limitHits,2);
  assert.equal(result.summary.stateStatus,'limited');assert.equal(result.summary.clipsStatus,'limited');assert.equal(db.events.filter(x=>x.op==='abort').length,2);safe(result);
});
test('a body larger than 20MiB never invokes parser callbacks',async()=>{
  let validated=0;const body=JSON.stringify(state({private:'x'.repeat(20*1024*1024)}));
  const result=await inspect({storage:local({'utacheck.v1':body}),validateState:()=>validated++});
  assert.equal(validated,0);assert.equal(result.records.length,0);assert.equal(result.summary.limitHits,1);assert.equal(result.summary.partial,true);safe(result);
});
test('the total JSON byte budget bounds many individually valid local originals',async()=>{
  const body=JSON.stringify(state({private:'x'.repeat(17*1024*1024)})),values=Object.fromEntries(Array.from({length:4},(_,i)=>['utacheck.v1:broken:'+i,body]));
  const result=await inspect({storage:local(values)});assert.equal(result.records.length,3);assert.equal(result.summary.limitHits,1);assert.equal(result.summary.partial,true);safe(result);
});
test('cancellation aborts a stalled read-only transaction and suppresses all private candidate results',async()=>{
  const controller=new AbortController(),db=database(undefined,{stall:name=>name==='state'});
  const pending=inspect({database:db.db,signal:controller.signal});await flush();controller.abort();const result=await pending;
  assert.equal(result.summary.status,'cancelled');assert.equal(result.records.length,0);assert.equal(result.endpoints.length,0);assert.equal(result.clips.length,0);
  assert.equal(db.events.filter(x=>x.op==='abort').length,1);safe(result);
});
test('hidden in-flight cache lookup cannot produce a stale candidate, including already scanned records',async()=>{
  let active=true,release,started;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>started=resolve),
    cacheStorage={keys:async()=>['utacheck-old'],match:async()=>{started();await gate;return new Response(JSON.stringify(state()));}};
  const pending=inspect({database:database({state:{valid:state()},clips:{}}).db,cacheStorage,isActive:()=>active});
  await ready;active=false;const result=await pending;release();
  assert.equal(result.summary.status,'cancelled');assert.equal(result.records.length,0);assert.equal(result.publications.length,0);safe(result);
});
test('a timed-out read-only cursor aborts without waiting for a response or treating it as an empty store',async()=>{
  let now=0;const source=fs.readFileSync(__dirname+'/../startup-local-storage-inventory.js','utf8'),context=vm.createContext({
    Date:{now:()=>now},setTimeout,clearTimeout,TextEncoder,TextDecoder,ArrayBuffer,Uint8Array,Blob});
  vm.runInContext(source,context);const db=database(undefined,{stall:name=>name==='state'}),pending=context.StartupLocalStorageInventory.inspect({database:db.db,storage:local()});
  await flush();now=20001;const result=await pending;assert.equal(result.summary.status,'partial');assert.equal(result.summary.partial,true);
  assert.equal(result.summary.limitHits,1);assert.equal(result.summary.stateStatus,'unavailable');assert.equal(db.events.filter(x=>x.op==='abort').length,1);safe(result);
});
test('inactive or already aborted inventory has no storage, database, cache or network effects',async()=>{
  const deny=new Proxy({},{get(){throw Error('forbidden');}}),controller=new AbortController();controller.abort();
  for(const extra of [{isActive:()=>false},{signal:controller.signal}]){
    const result=await inventory.inspect({database:deny,storage:deny,cacheStorage:deny,indexedDB:deny,...extra});assert.equal(result.summary.status,'cancelled');safe(result);
  }
});
test('module loading needs no global storage/network, never opens or mutates any storage source',()=>{
  const source=fs.readFileSync(__dirname+'/../startup-local-storage-inventory.js','utf8');
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|createObjectURL|createObjectStore|deleteDatabase)\s*\(/);
  assert.doesNotMatch(source,/\.(?:open|addAll|put|delete|setItem|removeItem|clear)\s*\(/);
  assert.doesNotMatch(source,/\b(?:cache|storage|database|store)\.add\s*\(/);
  const deny=new Proxy({},{get(){throw Error(PRIVATE);},set(){throw Error(PRIVATE);}}),context=vm.createContext({S:deny,indexedDB:deny,localStorage:deny,caches:deny,fetch:deny});
  vm.runInContext(source,context);assert.equal(typeof context.StartupLocalStorageInventory.inspect,'function');
});
