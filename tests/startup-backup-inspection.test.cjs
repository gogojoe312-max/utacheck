'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash,webcrypto}=require('node:crypto');
const ROOT=process.env.UTA_CANDIDATE || path.join(__dirname,'..');
const API=require(path.join(ROOT,'startup-backup-inspection.js'));
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const ID='0123456789abcdef0123456789abcdef', ID2='fedcba9876543210fedcba9876543210';
const SHA='1'.repeat(40),OLD='2'.repeat(40),RAW='3'.repeat(40),PART='utacheck-backup-part-'+'4'.repeat(32)+'-0001.txt';
const TOKEN='PRIVATE_SYNTHETIC_TOKEN',TOKEN2='PRIVATE_SECOND_TOKEN',KEY='PRIVATE_SYNTHETIC_KEY';
const sha=x=>createHash('sha256').update(x).digest('hex');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const work=(extra={})=>({shows:[{id:'show',name:'PRIVATE_SHOW'}],songs:[{id:'song',lines:[{t:'PRIVATE_LYRIC'}]}],
  rsongs:[],notes:[{id:'note',memo:'PRIVATE_NOTE'}],pubNotes:[],trash:[{id:'trash',memo:'PRIVATE_TRASH'}],
  members:[{id:'member',name:'PRIVATE_MEMBER'}],groups:[],staffMemos:{a:'PRIVATE_STAFF_MEMO'},memos:{a:'PRIVATE_MEMO'},
  draws:{a:[1]},recs:{a:{name:'PRIVATE_RECORDING'}},...extra});
const settled=(state,seq=5)=>({status:'fulfilled',value:{seq,at:1234,txt:JSON.stringify(state)}});
const absent=()=>({status:'fulfilled',value:undefined});
const raw=(obj,extra={})=>({bk:1,data:Buffer.from(JSON.stringify(obj)).toString('base64'),...extra});
const backup=(state=work())=>raw({app:'utacheck',ver:'synthetic',at:4567,state});
const encMock=inner=>({enc:1,salt:Buffer.alloc(16).toString('base64url'),iv:Buffer.alloc(12).toString('base64url'),data:Buffer.alloc(32).toString('base64url'),...(inner?{inner}:{})});
const filesFor=(value,name='utacheck-backup.json')=>({[name]:{filename:name,truncated:false,content:JSON.stringify(value),raw_url:`https://gist.githubusercontent.com/synthetic/${ID}/raw/${RAW}/${name}`}});
const remote=(value=backup(),versions=[SHA,OLD],id=ID)=>({id,files:filesFor(value),history:versions.map((version,i)=>({version,committed_at:new Date(1700000000000-i*1000).toISOString()}))});
function fixture(opts={}){
  let active=true,reads=0,ancillaryReads=0;
  const slots=opts.slots || [settled(work({ghToken:TOKEN,bkKey:KEY,bkGistId:ID})),absent()];
  const ancillary=opts.ancillary || {};
  const before=JSON.stringify({slots,ancillary});
  const requests=[],updates=[],unpacks=[];
  const current=opts.current || remote();
  const routes=new Map([[`https://api.github.com/gists/${ID}`,current],[`https://api.github.com/gists/${ID}/${SHA}`,current]]);
  if(opts.routes)for(const [url,response]of opts.routes)routes.set(url,response);
  const remoteBefore=JSON.stringify(Array.from(routes.entries()));
  const deps={
    readSlots:async()=>{reads++;return opts.readSlots?await opts.readSlots(reads,slots):clone(slots);},
    readAncillary:async()=>{ancillaryReads++;return opts.readAncillary?await opts.readAncillary(ancillaryReads,ancillary):clone(ancillary);},
    fetch:async(url,options={})=>{
      url=String(url);requests.push({url,options});
      assert.equal(options.method,'GET');assert.equal(options.body,undefined);
      assert(options.signal && typeof options.signal.aborted==='boolean');
      if(opts.fetch)return await opts.fetch(url,options,routes);
      assert(routes.has(url),'unexpected GET outside synthetic routes: '+url.replace(ID,'<gist>'));
      const data=routes.get(url);if(data instanceof Error)throw data;
      return {ok:true,status:200,url,json:async()=>clone(data),text:async()=>typeof data==='string'?data:JSON.stringify(data)};
    },
    unpackBackup:async(value,pass,context)=>{
      unpacks.push({value:clone(value),pass});
      if(opts.unpackBackup)return await opts.unpackBackup(value,pass,context);
      if(value?.enc){if(pass!==KEY)throw Object.assign(new Error('PRIVATE_DECRYPTION_DETAIL'),{badKey:1});value=value.inner;}
      if(!value || value.bk!==1)throw new Error('PRIVATE_BAD_BACKUP');
      return JSON.parse(Buffer.from(value.data,'base64').toString());
    },
    digest:async text=>opts.digest?await opts.digest(text):sha(text),
    isActive:()=>active,
    onUpdate:value=>{updates.push(clone(value));opts.onUpdate?.(value);}
  };
  const api=API.create(deps);
  const safe=result=>{
    assert.equal(JSON.stringify({slots,ancillary}),before,'original local raw records must remain byte-identical');
    assert.equal(JSON.stringify(Array.from(routes.entries())),remoteBefore,'synthetic remote originals must remain byte-identical');
    const serialized=JSON.stringify({updates,result});
    for(const secret of ['PRIVATE_',ID,ID2,SHA,OLD,RAW,PART,'https://','raw_url','ghToken','bkKey','bkGistId'])
      assert(!serialized.includes(secret),'safe summaries must not expose '+(secret.startsWith('PRIVATE')?'private payload':secret));
    for(const {url,options}of requests){
      const parsed=new URL(url);
      assert.equal(parsed.username,'');assert.equal(parsed.password,'');assert.equal(parsed.search,'');assert.equal(parsed.hash,'');
      assert(['https://api.github.com','https://gist.githubusercontent.com'].includes(parsed.origin));
      assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.redirect,'error');
      if(parsed.origin==='https://api.github.com'){
        assert(/^\/gists\/[a-f0-9]{20,40}(?:\/[a-f0-9]{40})?$/.test(parsed.pathname));
        assert.equal(options.headers?.Authorization,`Bearer ${url.includes(ID2)?TOKEN2:TOKEN}`);
      }else{
        assert.equal(options.headers?.Authorization,undefined);assert(Object.keys(options.headers || {}).every(key=>key==='Accept'));assert(!JSON.stringify(options.headers || {}).includes('PRIVATE_'));
      }
    }
  };
  return {api,slots,ancillary,before,requests,updates,unpacks,routes,readCount:()=>reads,ancillaryCount:()=>ancillaryReads,
    deactivate:()=>{active=false;},safe,run:()=>api.run()};
}
function findCounts(value){
  if(!value || typeof value!=='object')return [];
  return (value.counts?[value.counts]:[]).concat(Object.values(value).flatMap(findCounts));
}
function hasCounts(value,want){return findCounts(value).some(c=>Object.entries(want).every(([key,n])=>c[key]===n));}
function statuses(value){
  if(!value || typeof value!=='object')return [];
  return (typeof value.status==='string'?[value.status]:[]).concat(Object.values(value).flatMap(statuses));
}

test('startup backup create is lazy and healthy fixed-revision GET has only numeric safe summaries',async()=>{
  const f=fixture();assert.equal(f.readCount(),0);assert.equal(f.requests.length,0);assert.equal(f.updates.length,0);
  const result=await f.run();assert(f.requests.length>=1);assert(f.requests.every(r=>r.url.startsWith(`https://api.github.com/gists/${ID}`)));
  assert(hasCounts(result,{shows:1,songs:1,notes:1}));assert(f.readCount()>=2);assert.equal(f.unpacks[0].pass,KEY);f.safe(result);
});

test('encrypted backup explicitly uses saved key without changing state or prompting',async()=>{
  const f=fixture({current:remote(encMock(backup()))});const result=await f.run();
  assert.equal(f.unpacks.length,1);assert.equal(f.unpacks[0].pass,KEY);assert(hasCounts(result,{notes:1}));f.safe(result);
});

for(const field of [
  {bkGistId:'https://api.github.com/gists/'+ID}, {bkGistId:ID+'/../'+ID2}, {bkGistId:ID+'?secret='+TOKEN},
  {bkGistId:'../'+ID}, {bkGistId:'user/'+ID}, {bkGistId:'not-a-gist'}, {bkGistId:ID,ghToken:TOKEN+'\r\nX-Injected: '+KEY},
  {bkGistId:ID,ghToken:{}}, {bkGistId:ID,bkKey:{}}, {bkGistId:ID,bkKey:'x'.repeat(4097)}
])test('invalid existing connection cannot expand network scope '+Object.keys(field).join(','),async()=>{
  const f=fixture({slots:[settled(work({ghToken:TOKEN,bkKey:KEY,...field})),absent()]});const result=await f.run();
  assert.equal(f.requests.length,0);assert.equal(result.status,'connection-invalid');f.safe(result);
});

test('missing existing target never searches or lists the account',async()=>{
  const f=fixture({slots:[settled(work({ghToken:TOKEN,bkKey:KEY})),absent()]});const result=await f.run();
  assert.equal(f.requests.length,0);assert.equal(result.connections,0);f.safe(result);
});

test('both conflicting generations are candidates and their target/token/key tuples never mix',async()=>{
  const target2=remote(backup(work({notes:[{},{}]})),[SHA],ID2);
  const f=fixture({slots:[settled(work({ghToken:TOKEN,bkKey:KEY,bkGistId:ID}),10),settled(work({ghToken:TOKEN2,bkKey:'PRIVATE_SECOND_KEY',bkGistId:ID2}),9)],
    routes:[[`https://api.github.com/gists/${ID2}`,target2],[`https://api.github.com/gists/${ID2}/${SHA}`,target2]]});
  const result=await f.run();assert.equal(result.connections,2);assert.equal(result.candidates.length,2);
  assert.deepEqual(f.unpacks.map(x=>x.pass),[KEY,'PRIVATE_SECOND_KEY']);assert.equal(result.local[0].generation,0);assert.equal(result.local[1].generation,1);
  assert(hasCounts(result,{notes:2}));f.safe(result);
});

test('same tuple in both generations does not duplicate target reads',async()=>{
  const state=work({ghToken:TOKEN,bkKey:KEY,bkGistId:ID});
  const f=fixture({slots:[settled(state,10),settled(state,9)]});const result=await f.run();
  assert.equal(result.connections,1);assert.equal(f.requests.length,2);f.safe(result);
});

for(const failed of [0,1])test('failed generation '+failed+' remains unknown while healthy-side counts and existing connection remain available',async()=>{
  const slots=[settled(work({ghToken:TOKEN,bkKey:KEY,bkGistId:ID}),10),settled(work({ghToken:TOKEN,bkKey:KEY,bkGistId:ID}),9)];
  slots[failed]={status:'rejected',reason:{name:'PRIVATE_EXCEPTION_NAME',message:'PRIVATE_EXCEPTION_MESSAGE'}};
  const f=fixture({slots});const result=await f.run();assert.equal(result.local[failed].status,'read-failed');
  assert.equal(result.local[1-failed].counts.notes,1);assert.equal(result.connections,1);f.safe(result);
});

test('ancillary output accepts safe nonnegative count fields only, never provider secrets or IDs',async()=>{
  const f=fixture({ancillary:{status:'read',clips:2,preserved:3,token:TOKEN,raw:JSON.stringify(work()),url:'https://private.invalid/'+ID}});
  const result=await f.run();assert.deepEqual(result.ancillary,{status:'read',clips:2,preserved:3});f.safe(result);
});

for(const ancillary of [{status:'PRIVATE_STATUS',clips:Infinity,preserved:-1},{status:'read',clips:'PRIVATE_COUNT',preserved:{private:KEY}}])
  test('unsafe ancillary metadata is replaced by fixed unknown values',async()=>{
    const f=fixture({ancillary});const result=await f.run();
    assert([null,undefined].includes(result.ancillary.clips));assert([null,undefined].includes(result.ancillary.preserved));f.safe(result);
  });

test('ancillary read failure stays unknown and never discloses error text',async()=>{
  const f=fixture({readAncillary:async()=>{throw new Error(TOKEN+' '+KEY);}});const result=await f.run();
  assert.equal(result.ancillary.status,'read-failed');f.safe(result);
});

for(const status of [401,403,404,429,500])test('HTTP '+status+' is safely distinguished and never triggers search/write',async()=>{
  const f=fixture({fetch:async(url)=>({ok:false,status,url,text:async()=>TOKEN})});const result=await f.run();
  assert.equal(result.candidates[0].status,[401,403,404,429].includes(status)?'http-'+status:'http-error');assert.equal(f.requests.length,1);f.safe(result);
});

test('arbitrary network error details are fully redacted',async()=>{
  const f=fixture({fetch:async()=>{throw Object.assign(new Error(TOKEN+' '+KEY+' https://private.invalid/'+ID),{name:'PRIVATE_ERROR_NAME'});}});
  const result=await f.run();assert.equal(result.candidates[0].status,'network-failed');f.safe(result);
});

test('healthy current work skips all prior revisions',async()=>{
  const f=fixture();const result=await f.run();assert.deepEqual(f.requests.map(r=>r.url),[
    `https://api.github.com/gists/${ID}`,`https://api.github.com/gists/${ID}/${SHA}`]);
  assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].status,'work-present');f.safe(result);
});

const empty=()=>work({songs:[],rsongs:[],notes:[],pubNotes:[],trash:[],memos:{},staffMemos:{},draws:{},recs:{},plan:{slots:[]}});

test('show-only current metadata does not claim recoverable work and prior work stays comparison-only',async()=>{
  const f=fixture({current:remote(backup(empty())),routes:[[ `https://api.github.com/gists/${ID}/${OLD}`,remote(backup(work({notes:[{},{}]})),[OLD]) ]]});
  const result=await f.run();assert.equal(result.candidates[0].status,'empty');assert.equal(result.candidates[1].current,false);
  assert.equal(result.candidates[1].status,'work-present');assert(hasCounts(result.candidates[1],{notes:2}));f.safe(result);
});

test('empty current checks at most ten previous revisions and reports truncated inspection honestly',async()=>{
  const versions=[SHA,...Array.from({length:19},(_,i)=>(i+16).toString(16).padStart(40,'0'))];
  const current=remote(backup(empty()),versions),routes=versions.slice(1).map(v=>[`https://api.github.com/gists/${ID}/${v}`,remote(backup(empty()),[v])]);
  const f=fixture({current,routes});const result=await f.run();
  assert.equal(f.requests.length,12);assert.equal(result.candidates.length,11);assert.equal(result.limited,true);
  assert(result.candidates.every(x=>x.status==='empty'));f.safe(result);
});

test('malformed current backup remains unconfirmed and prior revision is still compared safely',async()=>{
  const current=remote();current.files['utacheck-backup.json'].content='{PRIVATE_BROKEN_JSON';
  const f=fixture({current,routes:[[ `https://api.github.com/gists/${ID}/${OLD}`,remote(backup(),[OLD]) ]]});
  const result=await f.run();assert.equal(result.candidates[0].status,'backup-format');assert.equal(result.candidates[1].status,'work-present');f.safe(result);
});

test('no backup file is unconfirmed, distinct from a decoded empty backup',async()=>{
  const current=remote();current.files={};const f=fixture({current,routes:[[ `https://api.github.com/gists/${ID}/${OLD}`,current ]]});
  const result=await f.run();assert(result.candidates.every(x=>x.status==='backup-missing'));assert(!statuses(result).includes('empty'));f.safe(result);
});

for(const invalid of [raw({app:'wrong-app',at:1,state:work()}),raw({app:'utacheck',at:'PRIVATE_AT',state:work()})])
  test('invalid backup envelope cannot display confirmed recovery counts',async()=>{
    const f=fixture({current:remote(invalid,[SHA])});const result=await f.run();
    assert.equal(result.candidates[0].status,'backup-format');f.safe(result);
  });

test('decryption failure only uses safe status and never changes the saved key',async()=>{
  const f=fixture({current:remote(encMock(),[SHA]),unpackBackup:async()=>{throw Object.assign(new Error(TOKEN+' '+KEY),{badKey:1});}});
  const result=await f.run();assert.equal(result.candidates[0].status,'decrypt-failed');assert.equal(f.unpacks[0].pass,KEY);f.safe(result);
});

function splitFixture(change=()=>{}){
  const body=JSON.stringify(backup()),index={bk:2,format:'utacheck-parts',parts:[{name:PART}],length:body.length,sha256:sha(body)};
  const current=remote(index,[SHA]);current.files[PART]={filename:PART,truncated:false,content:body,raw_url:`https://gist.githubusercontent.com/synthetic/${ID}/raw/${RAW}/${PART}`};
  change(current,index,body);current.files['utacheck-backup.json'].content=JSON.stringify(index);
  return fixture({current});
}

test('split backup verifies ordered length and digest before pure decode',async()=>{
  const f=splitFixture();
  const result=await f.run();assert.equal(f.unpacks.length,1);assert.equal(result.candidates[0].status,'work-present');f.safe(result);
});

for(const [label,change,status]of [
  ['wrong digest',(c,i)=>{i.sha256='0'.repeat(64);},'part-integrity'],
  ['wrong length',(c,i)=>{i.length++;},'part-integrity'],
  ['missing part',(c)=>{delete c.files[PART];},'part-missing'],
  ['duplicate parts',(c,i)=>{i.parts.push({name:PART});},'part-integrity'],
  ['malicious part name',(c,i)=>{i.parts[0].name='../'+PART;},'part-integrity'],
  ['untrusted embedded fallback URL',(c,i)=>{delete c.files[PART];i.parts[0].raw_url=`https://gist.githubusercontent.com/synthetic/${ID}/raw/${RAW}/${PART}`;},'part-missing']
])test('split '+label+' remains unconfirmed and never decodes',async()=>{
  const f=splitFixture(change);const result=await f.run();assert.equal(result.candidates[0].status,status);assert.equal(f.unpacks.length,0);f.safe(result);
});

for(const url of [
  `https://example.invalid/synthetic/${ID}/raw/${SHA}/utacheck-backup.json`,
  `https://gist.githubusercontent.com.evil.invalid/synthetic/${ID}/raw/${SHA}/utacheck-backup.json`,
  `http://gist.githubusercontent.com/synthetic/${ID}/raw/${SHA}/utacheck-backup.json`,
  `https://${TOKEN}@gist.githubusercontent.com/synthetic/${ID}/raw/${SHA}/utacheck-backup.json`,
  `https://gist.githubusercontent.com/synthetic/${ID2}/raw/${SHA}/utacheck-backup.json`,
  `https://gist.githubusercontent.com/synthetic/${ID}/raw/latest/utacheck-backup.json`,
  `https://gist.githubusercontent.com/synthetic/${ID}/raw/${SHA}/unrelated-private.json`,
  `https://gist.githubusercontent.com/synthetic/${ID}/raw/${SHA}/utacheck-backup.json?secret=${TOKEN}`,
  `https://gist.githubusercontent.com/synthetic/${ID}/raw/${SHA}/utacheck-backup.json#${KEY}`,
  `https://gist.githubusercontent.com:8443/synthetic/${ID}/raw/${SHA}/utacheck-backup.json`
])test('untrusted raw URL is rejected before any raw request',async()=>{
  const current=remote(backup(),[SHA]);current.files['utacheck-backup.json']={truncated:true,raw_url:url};
  const f=fixture({current});const result=await f.run();assert.equal(result.candidates[0].status,'part-url');assert.equal(f.requests.length,2);f.safe(result);
});

test('trusted versioned raw URL from pinned metadata allows its own 40hex file hash without leaking auth',async()=>{
  const url=`https://gist.githubusercontent.com/synthetic/${ID}/raw/${RAW}/utacheck-backup.json`,current=remote(backup(),[SHA]);
  current.files['utacheck-backup.json']={truncated:true,raw_url:url};
  const f=fixture({current,routes:[[url,JSON.stringify(backup())]]});const result=await f.run();
  assert.equal(result.candidates[0].status,'work-present');const request=f.requests.find(r=>r.url===url);assert(request);assert.equal(request.options.headers?.Authorization,undefined);f.safe(result);
});

test('concurrent local raw-byte change cancels final comparisons and never alters the new original',async()=>{
  const f=fixture({readSlots:async(n,slots)=>{const current=clone(slots);if(n>1)current[0].value.txt+=' ';return current;}});
  const result=await f.run();assert.equal(result.status,'storage-changed');assert(!result.candidates?.length);f.safe(result);
});

test('busy repeat runs are ignored; explicit later retry runs once again',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const f=fixture({readSlots:async(n,slots)=>{if(n===1)await gate;return clone(slots);}});
  const first=f.run();await flush();assert.equal(f.api.busy,true);assert.equal(await f.run(),null);assert.equal(f.readCount(),1);assert.equal(f.requests.length,0);
  release();const result=await first;assert.equal(f.api.busy,false);await f.run();assert.equal(f.requests.length,4);f.safe(result);
});

test('cancelled GET aborts signal and never emits a stale checked result',async()=>{
  let pendingRequest;const f=fixture({fetch:async(url,options)=>await new Promise((resolve,reject)=>{
    pendingRequest={url,options,resolve};options.signal.addEventListener('abort',()=>reject(new Error(TOKEN)),{once:true});
  })});
  const pending=f.run();await flush();assert(pendingRequest);const emits=f.updates.length;f.api.cancel();assert.equal(pendingRequest.options.signal.aborted,true);
  const result=await pending;assert.equal(result.status,'cancelled');assert.equal(f.updates.length,emits);assert.equal(f.requests.length,1);assert.equal(f.api.busy,false);f.safe(result);
});

test('page hidden/inactive during local read blocks all GETs and later report emission',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const f=fixture({readSlots:async(n,slots)=>{await gate;return clone(slots);}});const pending=f.run();await flush();const emits=f.updates.length;
  f.deactivate();f.api.cancel();release();const result=await pending;assert.equal(result.status,'cancelled');assert.equal(f.requests.length,0);assert.equal(f.updates.length,emits);f.safe(result);
});

test('inactive initial page cannot start an inspection',async()=>{
  const f=fixture();f.deactivate();assert.equal(await f.run(),null);assert.equal(f.requests.length,0);assert.equal(f.readCount(),0);assert.equal(f.updates.length,0);
});

for(const badState of [{songs:[null]},{songs:[{lines:'PRIVATE_BAD_LINES'}]},{songs:[{L:3}],songLib:[]},{songs:[{L:-1,lines:[{}]}]},{songs:[{L:'PRIVATE_BAD_INDEX',lines:[{}]}]},{notes:[null]},{plan:{slots:[null]}},{plan:'PRIVATE_BAD_PLAN'}])
  test('malformed remote work shape '+Object.keys(badState).join(',')+' is not marked confirmed work-present',async()=>{
    const f=fixture({current:remote(backup(work(badState)),[SHA])});const result=await f.run();
    assert.equal(result.candidates[0].status,'state-format');f.safe(result);
  });

test('readSlots contract violation cannot create a third target',async()=>{
  const f=fixture({slots:[settled(work({ghToken:TOKEN,bkKey:KEY,bkGistId:ID})),absent(),settled(work({ghToken:TOKEN2,bkGistId:ID2}))]});
  const result=await f.run();assert.equal(result.status,'connection-unconfirmed');assert.equal(f.requests.length,0);f.safe(result);
});

test('read-failed only side with no known target is unconfirmed, never no-existing-connection',async()=>{
  const f=fixture({slots:[{status:'rejected',reason:{message:TOKEN}},absent()]});const result=await f.run();
  assert.equal(result.status,'connection-unconfirmed');assert.equal(result.local[0].status,'read-failed');assert.equal(f.requests.length,0);f.safe(result);
});

test('encrypted backup with missing saved key does not prompt, decode, or invent another key',async()=>{
  const f=fixture({slots:[settled(work({ghToken:TOKEN,bkGistId:ID})),absent()],current:remote(encMock(),[SHA])});
  const result=await f.run();assert.equal(result.candidates[0].status,'saved-key-missing');assert.equal(f.unpacks.length,0);f.safe(result);
});

test('declared oversized API response is limited without body decoding',async()=>{
  let bodies=0;const f=fixture({fetch:async(url)=>({ok:true,status:200,url,headers:{get:()=>String(33*1024*1024)},text:async()=>{bodies++;return TOKEN;}})});
  const result=await f.run();assert.equal(result.candidates[0].status,'response-limit');assert.equal(bodies,0);f.safe(result);
});

test('API stream over limit is cancelled before any JSON or backup decoding',async()=>{
  let cancelled=0,reads=0;const chunk=new Uint8Array(33*1024*1024);
  const f=fixture({fetch:async(url)=>({ok:true,status:200,url,body:{getReader:()=>({read:async()=>{reads++;return{done:false,value:chunk};},cancel:async()=>{cancelled++;}})}})});
  const result=await f.run();assert.equal(result.candidates[0].status,'response-limit');assert.equal(cancelled,1);assert.equal(reads,1);assert.equal(f.unpacks.length,0);f.safe(result);
});

test('split manifest above bounded inspection parts is unconfirmed without part reads',async()=>{
  const current=remote({bk:2,format:'utacheck-parts',parts:Array.from({length:25},(_,i)=>({name:'utacheck-backup-part-'+'4'.repeat(32)+'-'+String(i).padStart(4,'0')+'.txt'})),length:50,sha256:sha('x')},[SHA]);
  const f=fixture({current});const result=await f.run();assert.equal(result.candidates[0].status,'backup-limit');assert.equal(result.limited,true);assert.equal(f.requests.length,2);assert.equal(f.unpacks.length,0);f.safe(result);
});

test('mutating a safe onUpdate snapshot cannot contaminate internal result or later summaries',async()=>{
  const f=fixture({onUpdate:value=>{value.extra=TOKEN;if(value.local)value.local.push({raw:KEY});}});
  const result=await f.run();assert(!Object.hasOwn(result,'extra'));assert.equal(result.local.length,2);f.safe(result);
});

test('truncated raw part uses only pinned metadata URL and retains integrity validation',async()=>{
  const body=JSON.stringify(backup()),url=`https://gist.githubusercontent.com/synthetic/${ID}/raw/${RAW}/${PART}`;
  const current=remote({bk:2,format:'utacheck-parts',parts:[{name:PART,raw_url:'https://untrusted.invalid/'+TOKEN}],length:body.length,sha256:sha(body)},[SHA]);
  current.files[PART]={truncated:true,raw_url:url,content:'ignored API truncated prefix'};
  const f=fixture({current,routes:[[url,body]]});const result=await f.run();assert.equal(result.candidates[0].status,'work-present');assert.equal(f.requests.length,3);f.safe(result);
});

for(const value of [null,[],3,{}, {enc:1,data:'synthetic-but-missing-iv-salt'}, {bk:1,data:3}])
  test('malformed backup transport envelope stays unconfirmed before pure unpack',async()=>{
    const f=fixture({current:remote(value,[SHA])});const result=await f.run();
    assert.equal(result.candidates[0].status,'backup-format');assert.equal(f.unpacks.length,0);f.safe(result);
  });

function appCrypto(){
  const source=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
  const block=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
  const shared={bkKey:'PRIVATE_WRONG_SHARED_STATE_KEY',notes:[{memo:'PRIVATE_SHARED_STATE_NOTE'}]},before=JSON.stringify(shared);let touched=0;
  const c=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,
    S:new Proxy(shared,{get(){touched++;throw new Error('pure unpack must not read shared state');},set(){touched++;throw new Error('pure unpack must not mutate shared state');}})});
  vm.runInContext(block('const b64e = (u8) => {','function connectLink('),c);
  vm.runInContext(block('async function deriveKey(', 'async function wrap('),c);
  vm.runInContext(block('async function unpackBackup(', '// バックアップの置き場所'),c);
  return{c,assertUntouched(){assert.equal(touched,0);assert.equal(JSON.stringify(shared),before);}};
}

test('real app PBKDF2/AES-GCM seal and explicit-key pure unpack interoperate without shared state or original mutation',async()=>{
  const crypto=appCrypto(),body=backup(),encrypted=await crypto.c.sealJSON(body,KEY),before=JSON.stringify(encrypted);
  const f=fixture({current:remote(encrypted,[SHA]),unpackBackup:(value,pass)=>crypto.c.unpackBackup(value,pass)});
  const result=await f.run();assert.equal(result.candidates[0].status,'work-present');assert(hasCounts(result,{notes:1,songs:1}));
  assert.equal(JSON.stringify(encrypted),before);crypto.assertUntouched();f.safe(result);
});

test('real app crypto with mismatched saved key remains unconfirmed without replacing keys or shared state',async()=>{
  const crypto=appCrypto(),encrypted=await crypto.c.sealJSON(backup(),'PRIVATE_OTHER_ENCRYPTION_KEY'),before=JSON.stringify(encrypted);
  const f=fixture({current:remote(encrypted,[SHA]),unpackBackup:(value,pass)=>crypto.c.unpackBackup(value,pass)});
  const result=await f.run();assert.equal(result.candidates[0].status,'decrypt-failed');assert.equal(result.candidates[0].counts,null);
  assert.equal(JSON.stringify(encrypted),before);crypto.assertUntouched();f.safe(result);
});

for(const field of [{bkGistId:0},{bkGistId:false},{bkGistId:ID,ghToken:false},{bkGistId:ID,bkKey:0}])
  test('falsy malformed connection is invalid instead of silently absent '+Object.keys(field).join(','),async()=>{
    const f=fixture({slots:[settled(work({ghToken:TOKEN,bkKey:KEY,...field})),absent()]});const result=await f.run();
    assert.equal(result.status,'connection-invalid');assert.equal(f.requests.length,0);f.safe(result);
  });

test('invalid newest revision metadata never silently relabels an older revision as current',async()=>{
  const current=remote(backup(),[SHA,OLD]);current.history[0].version='PRIVATE_INVALID_NEWEST_REVISION';
  const f=fixture({current,routes:[[`https://api.github.com/gists/${ID}/${OLD}`,remote(backup(),[OLD])]]});const result=await f.run();
  assert.equal(result.candidates[0].status,'response-format');assert.equal(f.requests.length,1);assert.equal(f.unpacks.length,0);f.safe(result);
});

test('cancel during part digest never starts a new unpack or emits a stale result',async()=>{
  let release,entered=false;const gate=new Promise(resolve=>release=resolve),body=JSON.stringify(backup());
  const current=remote({bk:2,format:'utacheck-parts',parts:[{name:PART}],length:body.length,sha256:sha(body)},[SHA]);
  current.files[PART]={truncated:false,content:body};
  const f=fixture({current,digest:async value=>{entered=true;await gate;return sha(value);}});const pending=f.run();await flush();assert(entered);
  const updates=f.updates.length;f.api.cancel();release();const result=await pending;assert.equal(result.status,'cancelled');
  assert.equal(f.unpacks.length,0);assert.equal(f.updates.length,updates);f.safe(result);
});

test('inspection passes cancellation context into bounded decoder for real compressed current work',async()=>{
  const object={app:'utacheck',at:1234,state:work()},raw={bk:1,z:true,data:require('node:zlib').deflateRawSync(Buffer.from(JSON.stringify(object))).toString('base64url')};
  let seenContext=false;
  const f=fixture({current:remote(raw,[SHA]),unpackBackup:(value,key,context)=>{
    assert(context.signal && !context.signal.aborted);assert.equal(context.isActive(),true);seenContext=true;
    return API.decodeBackup(value,key,{...context,base64Decode:x=>new Uint8Array(Buffer.from(x,'base64url')),openJSON:()=>{throw new Error('unexpected decrypt');}});
  }});
  const result=await f.run();assert(seenContext);assert.equal(result.candidates[0].status,'work-present');f.safe(result);
});

test('inspection retains bounded compression-bomb limit status and never labels it empty or key mismatch',async()=>{
  const object={app:'utacheck',at:1234,state:{notes:[{memo:'x'.repeat(22*1024*1024)}]}},raw={bk:1,z:true,data:require('node:zlib').deflateRawSync(Buffer.from(JSON.stringify(object))).toString('base64url')};
  const f=fixture({current:remote(raw,[SHA]),unpackBackup:(value,key,context)=>API.decodeBackup(value,key,{...context,base64Decode:x=>new Uint8Array(Buffer.from(x,'base64url')),openJSON:()=>{throw new Error('unexpected decrypt');}})});
  const result=await f.run();assert.equal(result.candidates[0].status,'backup-limit');assert.equal(result.candidates[0].counts,null);
  assert(!statuses(result).includes('empty'));assert(!statuses(result).includes('decrypt-failed'));f.safe(result);
});
