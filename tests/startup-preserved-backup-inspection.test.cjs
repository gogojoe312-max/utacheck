'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const ROOT=process.env.UTA_CANDIDATE||path.join(__dirname,'..');
const API=require(path.join(ROOT,'startup-preserved-backup-inspection.js'));
const INSPECTION=require(path.join(ROOT,'startup-backup-inspection.js'));
const HOLD='recovery:network-hold:v1',PREFIX='preserved:recovery:v1:';
const ID='0123456789abcdef0123456789abcdef',ID2='fedcba9876543210fedcba9876543210',REV='a'.repeat(40);
const TOKEN='PRIVATE_ORIGINAL_TOKEN',KEY='PRIVATE_ORIGINAL_KEY',PRIVATE='PRIVATE_ORIGINAL_USER_DATA';
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const sha=value=>createHash('sha256').update(value).digest('hex');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const work=(extra={})=>({groups:[],shows:[{id:'show',name:PRIVATE}],songs:[{id:'song',lines:[{txt:PRIVATE}]}],notes:[{memo:PRIVATE}],...extra});
const present=(state=work({ghToken:TOKEN,bkKey:KEY,bkGistId:ID}),extra={})=>({present:true,value:{seq:5,at:1234,txt:JSON.stringify(state),...extra}});
const absent=()=>({present:false});
const original=()=>({slots:[present(),absent()],legacy:null});
function database(values,opts={}){
  const events=[],transactions=[];let serial=0;
  const db={name:'utacheck',objectStoreNames:{contains:name=>name==='state'},
    transaction(storeName,mode){
      const number=++serial;events.push({op:'transaction',storeName,mode,number});
      assert.equal(storeName,'state');assert.equal(mode,'readonly');
      if(opts.failTransaction)throw new Error(PRIVATE);
      let pending=0,aborted=false,completed=false;
      const finish=()=>setImmediate(()=>{if(!pending&&!aborted&&!completed){completed=true;tx.oncomplete?.();}});
      const tx={abort(){if(aborted)return;aborted=true;events.push({op:'abort',number});setImmediate(()=>tx.onabort?.());},
        objectStore(name){assert.equal(name,'state');return {
          get(key){
            events.push({op:'get',key,number});assert(key===HOLD||/^preserved:recovery:v1:[a-f0-9]{64}$/.test(key));
            const request={};pending++;
            setImmediate(()=>{
              if(aborted||opts.stall?.({key,number}))return;
              if(opts.failGet?.({key,number})){request.onerror?.();return;}
              request.result=clone(values.get(key));
              if(opts.transformRead)request.result=opts.transformRead({key,number,value:request.result});
              request.onsuccess?.();pending--;finish();
            });return request;
          },put(){throw new Error('write forbidden');},add(){throw new Error('write forbidden');},delete(){throw new Error('delete forbidden');},
          clear(){throw new Error('clear forbidden');},openCursor(){throw new Error('scan forbidden');}
        };}};
      transactions.push(tx);finish();return tx;
    },open(){throw new Error('open forbidden');},close(){throw new Error('close forbidden');}};
  return {db,events,transactions,replace:(key,value)=>values.set(key,clone(value)),reads:()=>serial};
}
function fixture(opts={}){
  let active=true;const body=opts.original===undefined?original():opts.original;
  const copyKey=PREFIX+sha(JSON.stringify(body));
  const hold=opts.hold===undefined?{v:1,seq:6,slot:0,copyKey,sourceKind:'local-excel',excelSummary:{read:82,total:124}}:opts.hold;
  const values=new Map([[HOLD,hold],[copyKey,body],['state:0',{seq:6,at:2000,txt:JSON.stringify(work({ghToken:'',bkKey:'',bkGistId:''}))}]]);
  if(opts.missingCopy)values.delete(copyKey);
  const before=JSON.stringify(Array.from(values.entries())),idb=database(values,opts.idb);
  const requests=[],unpacks=[],updates=[],candidatePackets=[];
  const packet={app:'utacheck',at:5678,state:work()};
  const backup={bk:1,data:Buffer.from(JSON.stringify(packet)).toString('base64')};
  const routes=new Map();
  for(const id of [ID,ID2]){
    const response={id,history:[{version:REV}],files:{'utacheck-backup.json':{truncated:false,content:JSON.stringify(backup)}}};
    routes.set('https://api.github.com/gists/'+id,response);routes.set('https://api.github.com/gists/'+id+'/'+REV,response);
  }
  const api=API.create({database:()=>opts.database?opts.database(idb.db):idb.db,
    digest:async text=>opts.digest?opts.digest(text):sha(text),inspection:opts.inspection||INSPECTION,
    fetch:async(url,settings)=>{
      requests.push({url,settings});assert.equal(settings.method,'GET');assert.equal(settings.body,undefined);
      if(opts.fetch)return opts.fetch(url,settings,routes);
      assert(routes.has(url));return {ok:true,status:200,url,text:async()=>JSON.stringify(routes.get(url))};
    },unpackBackup:async(raw,key,context)=>{
      unpacks.push({key,raw:clone(raw)});assert.equal(context.isActive(),true);
      if(opts.unpackBackup)return opts.unpackBackup(raw,key,context);
      return JSON.parse(Buffer.from(raw.data,'base64').toString());
    },isActive:()=>active,onUpdate:value=>{updates.push(clone(value));opts.onUpdate?.(value);},
    onCandidate:opts.onCandidate===false?undefined:async(...args)=>{candidatePackets.push(args);await opts.onCandidate?.(...args);}});
  const safe=result=>{
    assert.equal(JSON.stringify(Array.from(values.entries())),before,'existing data must remain byte-identical');
    assert(idb.events.filter(event=>event.op==='transaction').every(event=>event.mode==='readonly'&&event.storeName==='state'));
    const publicJSON=JSON.stringify({updates,result});
    for(const secret of [TOKEN,KEY,PRIVATE,ID,ID2,REV,copyKey,'https://','ghToken','bkGistId','bkKey','copyKey','raw_url','stack'])
      assert(!publicJSON.includes(secret),'public summary exposed '+secret);
    assert(requests.every(request=>request.settings.credentials==='omit'&&request.settings.referrerPolicy==='no-referrer'
      &&request.settings.redirect==='error'&&request.settings.method==='GET'));
  };
  return {api,idb,values,before,body,hold,copyKey,requests,unpacks,updates,candidatePackets,packet,safe,
    deactivate:()=>{active=false;},run:()=>api.run()};
}

test('a second restoration keeps the exact original connection-copy chain instead of reading token-stripped current work',async()=>{
  const first=original(),originalKey=PREFIX+sha(JSON.stringify(first));
  const current={slots:[present(work({ghToken:'',bkGistId:'',bkKey:''})),absent()],legacy:null};
  const currentKey=PREFIX+sha(JSON.stringify(current));
  const f=fixture({original:first,hold:{v:1,copyKey:currentKey,originalConnectionCopyKey:originalKey,sourceKind:'cloud-backup'}});
  f.values.set(currentKey,current);const before=JSON.stringify([...f.values]);
  const answer=await f.run();assert.equal(answer.status,'checked');assert.equal(answer.tokenStored,true);
  assert.equal(answer.backupTargetStored,true);assert.equal(f.requests.length,2);assert.equal(JSON.stringify([...f.values]),before);
  assert(f.idb.events.filter(event=>event.op==='get'&&event.key!==HOLD).every(event=>event.key===originalKey));
  assert(!JSON.stringify({answer,updates:f.updates}).includes(TOKEN));
});
test('an invalid original connection-copy locator stays unknown without reading another key or requesting a URL',async()=>{
  for(const originalConnectionCopyKey of ['https://synthetic.invalid/source','preserved:recovery:v1:bad','']){
    const first=original(),copyKey=PREFIX+sha(JSON.stringify(first));
    const f=fixture({original:first,hold:{v:1,copyKey,originalConnectionCopyKey}});const answer=await f.run();
    assert.equal(answer.status,'preserved-source-invalid');assert.equal(answer.tokenStored,null);assert.equal(f.requests.length,0);
    assert(f.idb.events.filter(event=>event.op==='get').every(event=>event.key===HOLD));
  }
});

test('creation is lazy and verified original connections are inspected without actual reconstructed slots',async()=>{
  const f=fixture();assert.equal(f.idb.reads(),0);assert.equal(f.requests.length,0);assert.equal(f.updates.length,0);
  const result=await f.run();assert.equal(result.status,'checked');assert.equal(result.connections,1);
  assert.equal(result.tokenStored,true);assert.equal(result.backupTargetStored,true);assert.equal(result.savedKeyStored,true);assert.equal(result.backupKeyStored,true);
  assert.equal(result.local[0].status,'read');assert.equal(result.local[1].status,'absent');
  assert.equal(f.unpacks[0].key,KEY);assert(f.requests.every(request=>request.settings.headers.Authorization==='Bearer '+TOKEN));
  assert(f.idb.reads()>=3);f.safe(result);
});

test('held original token and saved key with empty backup ID report presence without network or a prompt',async()=>{
  const f=fixture({original:{slots:[present(work({ghToken:TOKEN,bkKey:KEY,bkGistId:'',groups:[{gistId:ID2,src:'https://private.invalid/'+PRIVATE}]})),absent()],legacy:null}});
  const result=await f.run();assert.equal(result.status,'no-existing-connection');assert.equal(result.connections,0);
  assert.equal(result.tokenStored,true);assert.equal(result.savedKeyStored,true);assert.equal(result.backupTargetStored,false);assert.equal(result.groupTargetStored,true);
  assert.equal(f.requests.length,0);assert.equal(f.unpacks.length,0);assert.equal(f.candidatePackets.length,0);f.safe(result);
});

test('valid original ID with no saved token uses anonymous GET and explicit empty saved key',async()=>{
  const f=fixture({original:{slots:[present(work({ghToken:'',bkKey:'',bkGistId:ID})),absent()],legacy:null}});
  const result=await f.run();assert.equal(result.status,'checked');assert.equal(result.tokenStored,false);assert.equal(result.savedKeyStored,false);
  assert.equal(result.backupTargetStored,true);assert.equal(result.backupKeyStored,false);assert(f.requests.every(request=>request.settings.headers.Authorization===undefined));
  assert.equal(f.unpacks[0].key,'');f.safe(result);
});

test('two distinct original connection tuples retain their own saved tokens and keys',async()=>{
  const token2=TOKEN+'_SECOND',key2=KEY+'_SECOND';
  const f=fixture({original:{slots:[present(),present(work({ghToken:token2,bkKey:key2,bkGistId:ID2}),{seq:4})],legacy:null}});
  const result=await f.run();assert.equal(result.connections,2);assert.equal(result.candidates.length,2);
  for(const request of f.requests)assert.equal(request.settings.headers.Authorization,'Bearer '+(request.url.includes(ID2)?token2:TOKEN));
  assert.deepEqual(f.unpacks.map(value=>value.key),[KEY,key2]);f.safe(result);
});

test('identical original tuples are de-duplicated and older envelopes may omit at',async()=>{
  const a=present();delete a.value.at;
  const f=fixture({original:{slots:[a,clone(a)],legacy:null}});const result=await f.run();
  assert.equal(result.status,'checked');assert.equal(result.connections,1);assert.equal(f.requests.length,2);f.safe(result);
});

test('confirmed empty originals return false flags distinct from unknown and never fetch',async()=>{
  const f=fixture({original:{slots:[absent(),present(work())],legacy:null}});const result=await f.run();
  assert.equal(result.status,'no-existing-connection');for(const flag of ['tokenStored','backupTargetStored','savedKeyStored','backupKeyStored','groupTargetStored'])assert.equal(result[flag],false);
  assert.equal(f.requests.length,0);f.safe(result);
});

test('malformed original slot JSON is unknown rather than absent',async()=>{
  const f=fixture({original:{slots:[present(work(),{txt:'PRIVATE_BROKEN_JSON'}),absent()],legacy:null}});const result=await f.run();
  assert.equal(result.status,'connection-unconfirmed');assert.equal(result.local[0].status,'format-failed');assert.equal(result.tokenStored,null);
  assert.equal(result.local[1].tokenStored,false);assert.equal(f.requests.length,0);f.safe(result);
});

test('malformed typed settings stay unknown and do not trigger fallback authentication',async()=>{
  const f=fixture({original:{slots:[present(work({ghToken:false,bkKey:{private:PRIVATE},bkGistId:ID,groups:'PRIVATE_GROUPS'})),absent()],legacy:null}});
  const result=await f.run();assert.equal(result.status,'connection-invalid');assert.equal(result.tokenStored,null);assert.equal(result.savedKeyStored,null);
  assert.equal(result.groupTargetStored,null);assert.equal(f.requests.length,0);f.safe(result);
});

for(const extra of [{key:KEY},{groups:[{key:KEY}]},{key:KEY,groups:'PRIVATE_UNKNOWN_GROUP_KEYS'}])
  test('saved key presence includes original publication keys without claiming a backup key '+Object.keys(extra).join(','),async()=>{
    const f=fixture({original:{slots:[present(work({bkGistId:'',...extra})),absent()],legacy:null}});const result=await f.run();
    assert.equal(result.status,'no-existing-connection');assert.equal(result.savedKeyStored,true);assert.equal(result.backupKeyStored,false);
    assert.equal(result.local[0].savedKeyStored,true);assert.equal(f.requests.length,0);f.safe(result);
  });

test('publication saved key presence does not change the explicitly saved backup decode key',async()=>{
  const f=fixture({original:{slots:[present(work({bkGistId:ID,key:KEY,groups:[{key:KEY+'_GROUP'}]})),absent()],legacy:null}});
  const result=await f.run();assert.equal(result.status,'checked');assert.equal(result.savedKeyStored,true);assert.equal(result.backupKeyStored,false);
  assert.equal(f.unpacks[0].key,'');f.safe(result);
});

test('invalid key types or oversize keys remain unknown, and any valid saved key confirms presence',async()=>{
  const f=fixture({original:{slots:[present(work({bkKey:'x'.repeat(4097),key:{private:PRIVATE},groups:[{key:42}]})),absent()],legacy:null}});
  const result=await f.run();assert.equal(result.savedKeyStored,null);assert.equal(result.backupKeyStored,null);assert.equal(f.requests.length,0);f.safe(result);
  const known=fixture({original:{slots:[present(work({bkKey:'x'.repeat(4097),groups:[{key:KEY}]})),absent()],legacy:null}});
  const summary=await known.run();assert.equal(summary.savedKeyStored,true);assert.equal(summary.backupKeyStored,null);known.safe(summary);
});

for(const body of [null,{},[],{slots:[absent()],legacy:null},{slots:[absent(),absent(),absent()],legacy:null},
  {slots:[absent(),absent()],legacy:'PRIVATE_LEGACY'},
  {slots:[{present:false,value:{private:PRIVATE}},absent()],legacy:null},
  {slots:[{present:true,value:{txt:'{}',at:1}},absent()],legacy:null},
  {slots:[present(work(),{seq:-1}),absent()],legacy:null},
  {slots:[present(work(),{at:'PRIVATE_INVALID_AT'}),absent()],legacy:null},
  {slots:[present(work(),{extra:PRIVATE}),absent()],legacy:null},
  {slots:[absent(),absent()],legacy:null,unknown:PRIVATE}])test('strict preserved wrapper refuses unsupported shape '+JSON.stringify(body).slice(0,45),async()=>{
  const f=fixture({original:body});const result=await f.run();assert.equal(result.status,'preserved-source-invalid');
  assert.equal(result.tokenStored,null);assert.equal(result.local[0].status,'unconfirmed');assert.equal(f.requests.length,0);f.safe(result);
});

for(const copyKey of ['preserved:startup:v1:'+'b'.repeat(64),PREFIX+'b'.repeat(63),PREFIX+'B'.repeat(64),'PRIVATE_OTHER_RECORD',null,123])
  test('unconfirmed copy pointer cannot read another record '+String(copyKey).slice(0,30),async()=>{
    const f=fixture({hold:{v:1,copyKey}});const result=await f.run();assert.equal(result.status,'preserved-source-invalid');
    assert(f.idb.events.filter(event=>event.op==='get').every(event=>event.key===HOLD));assert.equal(f.requests.length,0);f.safe(result);
  });

test('absent persistent hold is missing and never reads actual generations',async()=>{
  const f=fixture({hold:undefined});f.values.delete(HOLD);const before=JSON.stringify(Array.from(f.values.entries()));
  const result=await f.run();assert.equal(result.status,'preserved-source-missing');assert.equal(result.tokenStored,null);assert.equal(f.requests.length,0);
  assert.equal(JSON.stringify(Array.from(f.values.entries())),before);assert(f.idb.events.filter(event=>event.op==='get').every(event=>event.key===HOLD));
});

test('missing addressed original is unconfirmed without any network request',async()=>{
  const f=fixture({missingCopy:true});const result=await f.run();assert.equal(result.status,'preserved-source-missing');assert.equal(result.backupTargetStored,null);f.safe(result);
});

test('content address must match SHA-256 of the exact raw wrapper before inspecting',async()=>{
  const f=fixture({digest:async()=> '0'.repeat(64)});const result=await f.run();assert.equal(result.status,'preserved-source-integrity');
  assert.equal(result.tokenStored,null);assert.equal(f.requests.length,0);f.safe(result);
});

test('hash callback failures never expose private error text or assert settings absent',async()=>{
  const f=fixture({digest:async()=>{throw new Error(TOKEN+' '+KEY+' https://private.invalid/'+ID);}});const result=await f.run();
  assert.equal(result.status,'preserved-source-integrity');assert.equal(result.savedKeyStored,null);f.safe(result);
});

test('original JSON is bounded at 20MiB before hashing or parsing settings',async()=>{
  let hashes=0;const f=fixture({original:{slots:[present(work(),{txt:'x'.repeat(20*1024*1024)}),absent()],legacy:null},digest:async()=>{hashes++;return '0'.repeat(64);}});
  const result=await f.run();assert.equal(result.status,'preserved-source-limit');assert.equal(hashes,0);assert.equal(f.requests.length,0);f.safe(result);
});

test('original JSON byte cap includes multibyte content',async()=>{
  let hashes=0;const f=fixture({original:{slots:[present(work(),{txt:'あ'.repeat(8*1024*1024)}),absent()],legacy:null},digest:async()=>{hashes++;return '0'.repeat(64);}});
  const result=await f.run();assert.equal(result.status,'preserved-source-limit');assert.equal(hashes,0);f.safe(result);
});

for(const idb of [{failTransaction:true},{failGet:({key})=>key===HOLD},{failGet:({key})=>key.startsWith(PREFIX)}])
  test('read failure keeps both generations unknown and safely redacts errors',async()=>{
    const f=fixture({idb});const result=await f.run();assert.equal(result.status,'storage-read');assert.equal(result.tokenStored,null);
    assert.equal(result.local[0].status,'read-failed');assert.equal(f.requests.length,0);f.safe(result);
  });

test('database unavailable never opens a database or touches unrelated stores',async()=>{
  const f=fixture({database:()=>null});const result=await f.run();assert.equal(result.status,'storage-read');assert.equal(f.idb.reads(),0);f.safe(result);
});

for(const target of ['hold','copy'])test('raw '+target+' race before first GET is rejected without network or candidate exposure',async()=>{
  const f=fixture({idb:{transformRead:({number,key,value})=>number>1&&((target==='hold'&&key===HOLD)||(target==='copy'&&key.startsWith(PREFIX)))
    ?(target==='hold'?{...value,PRIVATE_CHANGED:true}:{...value,legacy:'PRIVATE_CHANGED'}):value}});
  const result=await f.run();assert.equal(result.status,'storage-changed');assert.equal(result.tokenStored,null);
  assert.equal(f.requests.length,0);assert.equal(f.candidatePackets.length,0);assert.equal(result.candidates.length,0);f.safe(result);
});

test('original raw text changed during network work invalidates all candidate comparisons',async()=>{
  let networkStarted=false;
  const f=fixture({idb:{transformRead:({key,value})=>{if(networkStarted&&key.startsWith(PREFIX)){value.slots[0].value.txt+=' ';}return value;}},
    fetch:async(url,settings,routes)=>{networkStarted=true;return {ok:true,status:200,url,text:async()=>JSON.stringify(routes.get(url))};}});
  const result=await f.run();assert.equal(result.status,'storage-changed');assert.equal(result.candidates.length,0);assert.equal(f.requests.length,1);
  assert.equal(f.candidatePackets.length,0);f.safe(result);
});

test('database replacement between reads cannot continue using a stale database',async()=>{
  let calls=0;const f=fixture({database:db=>++calls<3?db:null});const result=await f.run();
  assert.equal(result.status,'storage-read');assert.equal(f.requests.length,0);assert.equal(f.candidatePackets.length,0);f.safe(result);
});

test('even a transient original reread failure stops the run and remains unknown',async()=>{
  const f=fixture({idb:{failGet:({key,number})=>number===3&&key===HOLD}});const result=await f.run();
  assert.equal(result.status,'storage-read');assert.equal(result.tokenStored,null);assert.equal(f.requests.length,0);
  assert.equal(f.candidatePackets.length,0);f.safe(result);
});

test('update callback errors do not disclose raw errors or discard a verified read-only result',async()=>{
  const f=fixture({onUpdate:()=>{throw new Error(TOKEN+' '+PRIVATE);}});const result=await f.run();
  assert.equal(result.status,'checked');f.safe(result);
});

test('cancel during original hash suppresses fetch and all stale updates',async()=>{
  let release,entered=false;const gate=new Promise(resolve=>release=resolve);
  const f=fixture({digest:async value=>{entered=true;await gate;return sha(value);}});const pending=f.run();await flush();await flush();assert(entered);
  const updates=f.updates.length;f.api.cancel();release();const result=await pending;
  assert.equal(result.status,'cancelled');assert.equal(f.updates.length,updates);assert.equal(f.requests.length,0);assert.equal(f.api.busy,false);f.safe(result);
});

test('cancel aborts a stalled read-only transaction without relying on request completion',async()=>{
  const f=fixture({idb:{stall:()=>true}});const pending=f.run();await flush();assert.equal(f.api.busy,true);
  const updates=f.updates.length;f.api.cancel();const result=await pending;assert.equal(result.status,'cancelled');assert.equal(f.api.busy,false);
  assert(f.idb.events.some(event=>event.op==='abort'));assert.equal(f.updates.length,updates);f.safe(result);
});

test('cancel during GET aborts shared inspector request and never forwards candidates',async()=>{
  let pendingRequest;const f=fixture({fetch:async(url,settings)=>new Promise((resolve,reject)=>{
    pendingRequest={settings};settings.signal.addEventListener('abort',()=>reject(new Error(TOKEN)),{once:true});
  })});const pending=f.run();for(let i=0;i<12&&!pendingRequest;i++)await flush();assert(pendingRequest);
  const updates=f.updates.length;f.api.cancel();assert.equal(pendingRequest.settings.signal.aborted,true);const result=await pending;
  assert.equal(result.status,'cancelled');assert.equal(f.updates.length,updates);assert.equal(f.candidatePackets.length,0);f.safe(result);
});

test('page hidden during hash silently cancels before network',async()=>{
  let release,entered=false;const gate=new Promise(resolve=>release=resolve);
  const f=fixture({digest:async value=>{entered=true;await gate;return sha(value);}});const pending=f.run();await flush();await flush();assert(entered);
  const updates=f.updates.length;f.deactivate();release();const result=await pending;assert.equal(result.status,'cancelled');
  assert.equal(f.updates.length,updates);assert.equal(f.requests.length,0);f.safe(result);
});

test('inactive initial page cannot start and busy duplicate cannot add another inspection',async()=>{
  const inactive=fixture();inactive.deactivate();assert.equal(await inactive.run(),null);assert.equal(inactive.idb.reads(),0);
  const f=fixture({idb:{stall:()=>true}});const pending=f.run();await flush();assert.equal(await f.run(),null);assert.equal(f.idb.reads(),1);
  f.api.cancel();await pending;assert.equal(f.api.busy,false);f.safe();
});

test('safe update snapshot mutation cannot contaminate private state or result',async()=>{
  const f=fixture({onUpdate:value=>{value.unsafe=TOKEN;value.local[0].raw=KEY;}});const result=await f.run();
  assert(!Object.hasOwn(result,'unsafe'));assert(!Object.hasOwn(result.local[0],'raw'));f.safe(result);
});

test('complete decoded candidate remains private and is delivered only after final unchanged source reread',async()=>{
  let f;const observations=[];
  f=fixture({onCandidate:async(packet,metadata)=>{observations.push({reads:f.idb.reads(),packet,metadata});}});const result=await f.run();
  assert.equal(result.status,'checked');assert.equal(observations.length,1);assert.deepEqual(observations[0].packet,f.packet);
  assert.equal(observations[0].metadata.revision,REV);assert.equal(observations[0].reads,f.idb.reads());
  assert(!JSON.stringify(result).includes(PRIVATE));f.safe(result);
});

test('private candidate callback errors are redacted and never publish candidate packets in results',async()=>{
  const f=fixture({onCandidate:async()=>{throw new Error(TOKEN+' '+PRIVATE);}});const result=await f.run();
  assert.equal(result.status,'inspection-failed');assert.equal(result.candidates.length,0);f.safe(result);
});

test('browser module exposes only create and starts without accessing storage globals',()=>{
  const source=fs.readFileSync(path.join(ROOT,'startup-preserved-backup-inspection.js'),'utf8');let accesses=0;
  const context=vm.createContext({TextEncoder,AbortController,setTimeout,clearTimeout,
    get indexedDB(){accesses++;throw new Error('open forbidden');},get localStorage(){accesses++;throw new Error('legacy forbidden');}});
  vm.runInContext(source,context);assert.deepEqual(Object.keys(context.StartupPreservedBackupInspection),['create']);assert.equal(accesses,0);
});
