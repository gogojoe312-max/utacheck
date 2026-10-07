'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const API=require('../startup-saved-publication-reader.js');
const ID='abcde12345',OWNER='PRIVATE_OWNER',CURRENT='a'.repeat(40),OLD='b'.repeat(40),FILE_HASH='c'.repeat(40);
const endpoint=extra=>({id:ID,url:`https://gist.githubusercontent.com/${OWNER}/${ID}/raw/utacheck.json`,...extra});
const apiURL=(rev='',id=ID)=>`https://api.github.com/gists/${id}${rev?'/'+rev:''}`;
const rawURL=(rev=FILE_HASH,owner=OWNER,id=ID)=>`https://gist.githubusercontent.com/${owner}/${id}/raw/${rev}/utacheck.json`;
const clone=x=>JSON.parse(JSON.stringify(x));
function publication(extra={}){
  return {groupName:'PRIVATE_GROUP',authorId:'PRIVATE_AUTHOR',version:1791350000000,
    shows:[{id:'PRIVATE_SHOW',name:'PRIVATE_SHOW_NAME',absent:['PRIVATE_MEMBER']}],
    lib:[{title:'PRIVATE_TITLE',credit:'PRIVATE_CREDIT',lines:[['A','PRIVATE_LYRIC'],['→','PRIVATE_LYRIC_2']],
      groups:{A:['PRIVATE_MEMBER']},order:['PRIVATE_MEMBER'],sections:[{lineIdx:0,name:'PRIVATE_SECTION'}],groupRows:[{b:'A',ncell:'',lcell:''}]}],
    songs:[{libIdx:0,showId:'PRIVATE_SHOW',take:1,fromIdx:null}],focusShow:'PRIVATE_SHOW',
    members:[{name:'PRIVATE_MEMBER'}],rosters:{PRIVATE_GROUP:['PRIVATE_MEMBER']},groupOrder:['PRIVATE_GROUP'],folderOrder:['PRIVATE_FOLDER'],
    notes:[{songIdx:0,lineIdx:0,lineEnd:1,memberNames:['PRIVATE_MEMBER'],tags:['pitch'],memo:'PRIVATE_NOTE',pitch:'1',from:0,to:2,at:1}],
    memos:[{songIdx:0,text:'PRIVATE_MEMO'}],subs:[{songIdx:0,lineIdx:1,names:['PRIVATE_MEMBER']}],
    gsubs:[{songIdx:0,block:'A',names:['PRIVATE_MEMBER']}],...extra};
}
const empty=()=>publication({lib:[],songs:[],notes:[],memos:[],subs:[],gsubs:[]});
const encrypted=()=>({enc:1,salt:Buffer.alloc(16).toString('base64'),iv:Buffer.alloc(12).toString('base64'),data:Buffer.alloc(20).toString('base64')});
function gist({id=ID,owner=OWNER,rev=CURRENT,history=[rev],body=publication(),file={},extra={}}={}){
  return {id,owner:{login:owner},history:history.map(version=>({version,committed_at:'2099-01-01T00:00:00Z'})),
    updated_at:'2099-01-02T00:00:00Z',files:{'utacheck.json':{filename:'utacheck.json',truncated:false,
      content:typeof body==='string'?body:JSON.stringify(body),raw_url:rawURL(FILE_HASH,owner,id),...file}},...extra};
}
function response(value,extra={}){
  return {ok:true,status:200,redirected:false,headers:{get:()=>null},text:async()=>typeof value==='string'?value:JSON.stringify(value),...extra};
}
function network(routes){
  const calls=[];
  const fetch=async(url,options)=>{
    calls.push({url,options});
    assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
    assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.deepEqual(Object.keys(options.headers),['Accept']);
    assert(!JSON.stringify(options).includes('PRIVATE_KEY'));assert(!JSON.stringify(options).includes('PRIVATE_TOKEN'));
    assert(Object.prototype.hasOwnProperty.call(routes,url),'Unexpected request');
    const value=routes[url];return typeof value==='function'?value(url,options):value;
  };
  return {fetch,calls};
}
function safe(answer){
  const summary=JSON.stringify(answer.summary);
  for(const fragment of ['PRIVATE_','https://',ID,CURRENT,OLD,FILE_HASH,'Authorization','password','token','raw_url','groupName','authorId'])assert(!summary.includes(fragment),fragment);
}
async function run(routes,endpoints=[endpoint()],options={}){
  const net=network(routes),answer=await API.read(endpoints,{fetch:net.fetch,isActive:()=>true,...options});safe(answer);return {...answer,calls:net.calls};
}
const currentRoutes=body=>({[apiURL()]:response(gist()),[apiURL(CURRENT)]:response(gist({body}))});

test('only fixed unauthenticated GETs return detached validated publication and safe counts',async()=>{
  const input=[endpoint({keys:['PRIVATE_KEY'],token:'PRIVATE_TOKEN'})],before=JSON.stringify(input),body=publication();
  const result=await run(currentRoutes(body),input);
  assert.equal(result.summary.status,'checked');assert.equal(result.summary.publications,1);assert.equal(result.summary.limited,false);
  assert.deepEqual(result.calls.map(x=>x.url),[apiURL(),apiURL(CURRENT)]);
  assert.deepEqual(result.publications,[{id:ID,payload:body,revision:CURRENT,isHistorical:false}]);
  assert.deepEqual(result.summary.candidates[0].counts,{shows:1,songs:1,library:1,notes:1,memos:1,subs:1,gsubs:1});
  assert.equal(result.summary.candidates[0].publicationVersion,body.version);assert(!JSON.stringify(result.summary).includes('2099'));
  result.publications[0].payload.songs.length=0;assert.equal(body.songs.length,1);assert.equal(JSON.stringify(input),before);
});

test('truncated content uses only the fixed response raw URL, including its independent storage hash',async()=>{
  const latest=rawURL(CURRENT),routes={
    [apiURL()]:response(gist({file:{truncated:true,raw_url:latest}})),
    [apiURL(CURRENT)]:response(gist({file:{truncated:true,content:'PRIVATE_TRUNCATED',raw_url:rawURL()}})),
    [rawURL()]:response(JSON.stringify(publication()))};
  const result=await run(routes);assert.equal(result.publications.length,1);
  assert.deepEqual(result.calls.map(c=>c.url),[apiURL(),apiURL(CURRENT),rawURL()]);
  assert.equal(result.calls[2].options.headers.Accept,'application/json');
});

test('malicious endpoint URLs cause no request and no private URL leak',async()=>{
  const base=endpoint().url;
  for(const url of [base+'?x=PRIVATE_TOKEN',base+'#PRIVATE_KEY',base.replace('https:','http:'),
    base.replace('gist.githubusercontent.com','gist.githubusercontent.com.evil.example'),base.replace('https://','https://user:PRIVATE_KEY@'),
    base.replace('gist.githubusercontent.com','gist.githubusercontent.com:443'),base.replace('utacheck.json','other.json'),
    base.replace(ID,'fffff'),base.replace('/raw/','/%72aw/'),base.replace('/raw/','/x/../raw/'),base.replace('utacheck.json','UTACHECK.JSON'),
    base.replace('/raw/','/raw/'+CURRENT.slice(0,7)+'/')]){
    const result=await run({},[endpoint({url})]);assert.equal(result.calls.length,0);assert.equal(result.summary.status,'source-invalid');
  }
});

test('fixed raw URLs reject owner, ID, filename, port, query, fragment, short hash and traversal mismatches',async()=>{
  const base=rawURL();
  for(const url of [rawURL(FILE_HASH,'OTHER_OWNER'),rawURL(FILE_HASH,OWNER,'fffff'),base.replace('utacheck.json','other.json'),
    base.replace(FILE_HASH,CURRENT.slice(0,7)),base.replace('/'+FILE_HASH,''),base+'?PRIVATE_KEY',base+'#PRIVATE_KEY',
    base.replace('gist.githubusercontent.com','gist.githubusercontent.com:443'),base.replace('https://','https://user:pass@'),
    base.replace('/raw/','/x/../raw/'),base.replace('https:','http:'),base.replace(FILE_HASH,'NOT_A_HASH')]){
    const result=await run({[apiURL()]:response(gist()),[apiURL(CURRENT)]:response(gist({file:{truncated:true,raw_url:url}}))});
    assert.equal(result.publications.length,0);assert.equal(result.calls.length,2);assert.equal(result.summary.candidates[0].status,'source-invalid');
  }
});

test('strict metadata and fixed revision validation reject malformed histories and identities',async()=>{
  const badMetadata=[gist({id:'fffff'}),gist({owner:'OTHER_OWNER'}),gist({extra:{history:[]}}),gist({extra:{history:{}}}),
    gist({extra:{history:[{version:CURRENT},{version:'bad'}]}}),gist({history:[CURRENT,CURRENT]}),gist({extra:{owner:null}}),gist({extra:{files:[]}})];
  for(const metadata of badMetadata){const result=await run({[apiURL()]:response(metadata)});
    assert.equal(result.calls.length,1);assert.equal(result.summary.candidates[0].status,'response-format');assert.equal(result.publications.length,0);}
  for(const fixed of [gist({id:'fffff'}),gist({owner:'OTHER_OWNER'}),gist({rev:OLD}),gist({extra:{history:[{version:CURRENT},{version:'bad'}]}}),
    gist({file:{filename:'wrong.json'}}),gist({file:{truncated:undefined}}),gist({file:{content:null}})]){
    const result=await run({[apiURL()]:response(gist({history:[CURRENT,OLD]})),[apiURL(CURRENT)]:response(fixed)});
    assert.equal(result.calls.length,2);assert.equal(result.summary.candidates[0].status,'response-format');assert.equal(result.publications.length,0);
  }
});

test('only empty or corrupt current publication enables bounded older revision reads',async()=>{
  for(const body of [empty(),'PRIVATE_BAD_JSON',publication({songs:[{libIdx:900,showId:'PRIVATE_SHOW'}]})]){
    const routes={[apiURL()]:response(gist({history:[CURRENT,OLD]})),[apiURL(CURRENT)]:response(gist({body})),
      [apiURL(OLD)]:response(gist({rev:OLD,body:publication({version:1700000000000})}))};
    const result=await run(routes);assert.equal(result.publications.length,1);assert.equal(result.publications[0].isHistorical,true);
    assert.equal(result.publications[0].revision,OLD);assert.equal(result.summary.candidates.length,2);
  }
  const result=await run({[apiURL()]:response(gist({history:[CURRENT,OLD]})),[apiURL(CURRENT)]:response(gist())});
  assert.equal(result.calls.length,2);assert.equal(result.publications[0].isHistorical,false);
});

test('HTTP, quota, redirect and encrypted uncertainty never imply old data is current or missing',async()=>{
  for(const status of [401,403,404,429,500]){
    const result=await run({[apiURL()]:response(gist({history:[CURRENT,OLD]})),[apiURL(CURRENT)]:response('PRIVATE_ERROR',{ok:false,status})});
    assert.equal(result.calls.length,2);assert.equal(result.publications.length,0);
    assert.equal(result.summary.candidates[0].status,status===500?'http-error':'http-'+status);
  }
  for(const extra of [{redirected:true},{url:'https://evil.example/PRIVATE_KEY'}]){
    const result=await run({[apiURL()]:response(gist(),extra)});assert.equal(result.calls.length,1);assert.equal(result.summary.candidates[0].status,'redirect-denied');
  }
  const result=await run({[apiURL()]:response(gist({history:[CURRENT,OLD]})),[apiURL(CURRENT)]:response(gist({body:encrypted()}))});
  assert.equal(result.calls.length,2);assert.equal(result.summary.candidates[0].status,'encrypted-unconfirmed');
});

test('saved keys are tried exactly, locally, without transformations, mutation, prompts or key transmission',async()=>{
  const keys=['PRIVATE_WRONG',' PRIVATE_KEY '],input=[endpoint({keys})],before=JSON.stringify(input),tried=[];
  const result=await run(currentRoutes(encrypted()),input,{openJSON:async(raw,key)=>{
    tried.push(key);assert.equal(raw.enc,1);raw.enc=0;if(key===' PRIVATE_KEY ')return publication();throw Error('PRIVATE_CRYPTO_ERROR');
  }});
  assert.deepEqual(tried,keys);assert.equal(result.publications.length,1);assert.equal(JSON.stringify(input),before);
  const failed=await run(currentRoutes(encrypted()),input,{openJSON:async()=>{throw Error('PRIVATE_SECRET_FAILURE');}});
  assert.equal(failed.summary.candidates[0].status,'encrypted-unconfirmed');assert.equal(failed.publications.length,0);
  for(const input of [[endpoint()],[endpoint({keys:['']})]]){
    let attempts=0;const absent=await run(currentRoutes(encrypted()),input,{openJSON:async()=>{attempts++;return publication();}});
    assert.equal(attempts,0);assert.equal(absent.summary.candidates[0].status,'encrypted-unconfirmed');
  }
});

test('encrypted headers and decrypted payloads reject unknown fields, malformed bytes and invalid schema',async()=>{
  for(const body of [{...encrypted(),other:'PRIVATE_FIELD'},{...encrypted(),enc:2},{...encrypted(),iv:'!!!'},
    {...encrypted(),salt:Buffer.alloc(12).toString('base64')},{...encrypted(),data:'YQ=='}]){
    let attempts=0;const result=await run(currentRoutes(body),[endpoint({keys:['PRIVATE_KEY']})],{openJSON:async()=>{attempts++;return publication();}});
    assert.equal(attempts,0);assert.equal(result.summary.candidates[0].status,'publication-invalid');
  }
  const result=await run(currentRoutes(encrypted()),[endpoint({keys:['PRIVATE_KEY']})],{openJSON:async()=>({private:'PRIVATE_BAD'})});
  assert.equal(result.publications.length,0);assert.equal(result.summary.candidates[0].status,'publication-invalid');
  const malformed=publication();malformed.notes[0].at=Infinity;
  const coerced=await run(currentRoutes(encrypted()),[endpoint({keys:['PRIVATE_KEY']})],{openJSON:async()=>malformed});
  assert.equal(coerced.publications.length,0);assert.equal(coerced.summary.candidates[0].status,'publication-invalid');
});

test('strict library, show, alias, note, memo and substitution references reject corruption',async()=>{
  const changes=[b=>{b.authorId=undefined;},b=>{b.groupName=' ';},b=>{b.shows.push(clone(b.shows[0]));},b=>{b.shows[0].id='__proto__';},
    b=>{b.lib[0].lines[0]=['A',null];},b=>{b.songs[0].libIdx=-1;},b=>{b.songs[0].showId='OTHER_SHOW';},b=>{b.songs[0].take=0;},
    b=>{b.songs[0].fromIdx=0;},b=>{b.songs[0].fromIdx=1;b.songs.push({libIdx:0,showId:'PRIVATE_SHOW',fromIdx:0});},
    b=>{b.notes[0].songIdx=1;},b=>{b.notes[0].lineIdx=2;},b=>{b.notes[0].lineEnd=2;},b=>{b.notes[0].from=9;},
    b=>{b.notes[0].to=null;},b=>{b.notes[0].memberNames={};},b=>{b.notes[0].showId='OTHER_SHOW';},b=>{b.memos[0].text={};},
    b=>{b.subs[0].lineIdx=-1;},b=>{b.gsubs[0].block='BAD';},b=>{b.gsubs[0].names={};},b=>{b.focusShow='OTHER_SHOW';},
    b=>{b.lib[0].sections[0].lineIdx=10;},b=>{b.version='PRIVATE_BAD_VERSION';},b=>{b.memos.push({songIdx:0,text:'PRIVATE_CONFLICT'});}];
  for(const change of changes){const body=publication();change(body);const result=await run(currentRoutes(body));
    assert.equal(result.publications.length,0);assert.equal(result.summary.candidates[0].status,'publication-invalid');}
  const poisoned=JSON.stringify(publication()).replace('"lib":','"__proto__":{"polluted":true},"lib":');
  assert.equal((await run(currentRoutes(poisoned))).summary.candidates[0].status,'publication-invalid');assert.equal({}.polluted,undefined);
});

test('four endpoint, ten older revision and twenty-four exact key limits are explicit',async()=>{
  const ids=['abcde','abcdf','abcd0','abcd1','abcd2'],routes={};
  for(const id of ids.slice(0,4)){routes[apiURL('',id)]=response(gist({id}));routes[apiURL(CURRENT,id)]=response(gist({id}));}
  const result=await run(routes,ids.map(id=>({id})));assert.equal(result.summary.endpoints,4);assert.equal(result.publications.length,4);assert.equal(result.summary.limited,true);
  const versions=Array.from({length:12},(_,i)=>(i+1).toString(16).padStart(40,'0')),olderRoutes={};
  olderRoutes[apiURL()]=response(gist({history:versions}));
  for(const rev of versions.slice(0,11))olderRoutes[apiURL(rev)]=response(gist({rev,body:empty()}));
  const history=await run(olderRoutes);assert.equal(history.calls.length,12);assert.equal(history.summary.candidates.length,11);assert.equal(history.summary.limited,true);
  const keys=Array.from({length:25},(_,i)=>'PRIVATE_KEY_'+i),tried=[];
  const encryptedResult=await run(currentRoutes(encrypted()),[endpoint({keys})],{openJSON:async(raw,key)=>{tried.push(key);throw Error('PRIVATE_BAD_KEY');}});
  assert.deepEqual(tried,keys.slice(0,24));assert.equal(encryptedResult.summary.limited,true);assert.equal(encryptedResult.summary.candidates[0].status,'encrypted-unconfirmed');
});

test('duplicates merge known keys without duplicate requests and repeated reads remain isolated',async()=>{
  const input=[endpoint({keys:['PRIVATE_WRONG']}),endpoint({id:ID.toUpperCase(),keys:['PRIVATE_KEY']})],before=JSON.stringify(input),tried=[];
  const opts={openJSON:async(raw,key)=>{tried.push(key);if(key==='PRIVATE_KEY')return publication();throw Error('PRIVATE_CRYPTO');}};
  const first=await run(currentRoutes(encrypted()),input,opts),second=await run(currentRoutes(encrypted()),input,opts);
  assert.equal(first.calls.length,2);assert.equal(first.summary.duplicates,1);assert.equal(first.summary.endpoints,1);
  assert.deepEqual(first.publications,second.publications);assert.equal(JSON.stringify(input),before);
  assert.deepEqual(tried,['PRIVATE_WRONG','PRIVATE_KEY','PRIVATE_WRONG','PRIVATE_KEY']);
});

test('body size enforcement applies before reads and during API or raw streams',async()=>{
  let read=false;const huge=response('PRIVATE_TOO_BIG',{headers:{get:()=>String(32*1024*1024+1)},text:async()=>{read=true;return 'PRIVATE_BODY';}});
  const rejected=await run({[apiURL()]:huge});assert.equal(read,false);assert.equal(rejected.summary.candidates[0].status,'response-limit');assert.equal(rejected.summary.limited,true);
  const streaming=(bytes)=>{let i=0,cancelled=false;return {response:response('',{body:{getReader:()=>({read:async()=>i++<3?{done:false,value:new Uint8Array(bytes)}:{done:true},
    cancel:async()=>{cancelled=true;},releaseLock(){}})}}),cancelled:()=>cancelled};};
  const api=streaming(12*1024*1024),apiResult=await run({[apiURL()]:api.response});
  assert.equal(apiResult.summary.candidates[0].status,'response-limit');assert.equal(api.cancelled(),true);
  const raw=streaming(8*1024*1024),rawResult=await run({[apiURL()]:response(gist()),[apiURL(CURRENT)]:response(gist({file:{truncated:true}})),[rawURL()]:raw.response});
  assert.equal(rawResult.summary.candidates[0].status,'response-limit');assert.equal(raw.cancelled(),true);assert.equal(rawResult.summary.limited,true);
  const textResult=await run(currentRoutes('あ'.repeat(Math.floor(20*1024*1024/3)+1)));
  assert.equal(textResult.summary.candidates[0].status,'response-limit');
});

test('abort and stale state discard all accumulated publications and stop further requests',async()=>{
  const controller=new AbortController();controller.abort();const initial=await run({},[endpoint()],{signal:controller.signal});
  assert.equal(initial.calls.length,0);assert.equal(initial.summary.status,'cancelled');
  let active=true;
  const stale=await run({[apiURL()]:()=>{active=false;return response(gist());}},[endpoint()],{isActive:()=>active});
  assert.equal(stale.summary.status,'stale');assert.deepEqual(stale.publications,[]);assert.deepEqual(stale.summary.candidates,[]);
  const later=new AbortController(),routes=currentRoutes(publication());routes[apiURL('','abcdf')]=()=>{later.abort();return response(gist({id:'abcdf'}));};
  const after=await run(routes,[endpoint(),{id:'abcdf'}],{signal:later.signal});assert.equal(after.summary.status,'cancelled');assert.deepEqual(after.publications,[]);
  assert.deepEqual(after.summary.candidates,[]);assert.equal(after.calls.length,3);
});

test('aborting an unresponsive fetch returns without waiting for it to honor the signal',async()=>{
  const controller=new AbortController();let admitted;
  const started=new Promise(resolve=>{admitted=resolve;});
  const pending=API.read([endpoint()],{signal:controller.signal,fetch:async()=>{admitted();return await new Promise(()=>{});}});
  await started;controller.abort();const result=await pending;safe(result);assert.equal(result.summary.status,'cancelled');assert.equal(result.publications.length,0);
});

test('20 second timeout covers an unresponsive response body and module touches no global network or storage',async()=>{
  const source=fs.readFileSync(__dirname+'/../startup-saved-publication-reader.js','utf8');let touches=0,timeout;
  const deny=new Proxy({},{get(){touches++;throw Error('PRIVATE_FORBIDDEN');},set(){touches++;throw Error('PRIVATE_FORBIDDEN');}});
  const context=vm.createContext({module:{exports:{}},AbortController,TextEncoder,TextDecoder,Uint8Array,URL,atob,clearTimeout,
    setTimeout:(callback,ms)=>{timeout=ms;return setTimeout(callback,0);},fetch:()=>{touches++;throw Error('PRIVATE_NETWORK');},
    S:deny,localStorage:deny,sessionStorage:deny,indexedDB:deny});
  vm.runInContext(source,context);
  const result=await context.module.exports.read([endpoint()],{fetch:async()=>response('',{text:async()=>await new Promise(()=>{})})});
  safe(result);assert.equal(result.summary.candidates[0].status,'network-timeout');assert.equal(timeout,20000);assert.equal(touches,0);
  assert.doesNotMatch(source,/\b(?:XMLHttpRequest|prompt|alert|save|idbPut|localStorage|sessionStorage|indexedDB)\s*\(/);
});

test('unavailable reader, invalid inputs and network failures are safe and never throw private errors',async()=>{
  const missing=await API.read([endpoint()]);safe(missing);assert.equal(missing.summary.status,'reader-unavailable');
  for(const input of [null,{},'PRIVATE_SOURCE']){const result=await run({},input);assert.equal(result.summary.status,'source-invalid');}
  const emptyResult=await run({},[]);assert.equal(emptyResult.summary.status,'no-existing-publication');
  const result=await run({[apiURL()]:()=>{throw Error('PRIVATE_NETWORK_FAILURE');}});assert.equal(result.summary.candidates[0].status,'network-failed');
});
