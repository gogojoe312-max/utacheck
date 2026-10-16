'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PrivatePreparationSource = require('../private-preparation-source.js');
const source = fs.readFileSync(path.join(__dirname, '../progress-preparation-source.js'), 'utf8');
const OWNER = 'gogojoe312-max', REPO = 'shinkou-data';
const PROGRESS_TOKEN = 'synthetic-progress-token', LEGACY_TOKEN = 'synthetic-gist-token';
const manifest = {app:'synthetic-preparations', version:1, operations:[]};
const ready = () => ({status:'ready',manifest,sourceSha:'a'.repeat(40),sourcePath:'utacheck/prepared.json'});
const linked = patch => ({songs:[{id:'synthetic-song'}],settings:{sync:{on:true,owner:OWNER,repo:REPO,path:'data.json',branch:'main',token:PROGRESS_TOKEN,...patch}}});
function eventTarget() {
  const listeners=new Map();
  return {
    addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener);},
    emit(type){const event={type,target:this};for(const listener of listeners.get(type)||[])listener(event);this['on'+type]?.(event);}
  };
}
// Only the IndexedDB behavior used by this reader is modeled. Fixture setup and
// snapshots use direct helpers; the app-facing database supports readonly get.
class ReadonlyDatabaseFixture {
  constructor(){this.records=null;}
  async databases(){return this.records===null?[]:[{name:'shinkou',version:2}];}
  open(name){
    assert.equal(name,'shinkou');
    const open=eventTarget();
    setImmediate(()=>{
      let closed=false;
      open.result={
        objectStoreNames:{contains:store=>store==='kv'},
        close(){closed=true;},
        transaction:(scope,mode)=>{
          assert.equal(closed,false);assert.equal(scope,'kv');assert.equal(mode,'readonly');
          const transaction=eventTarget();let pending=0;
          transaction.objectStore=store=>{
            assert.equal(store,'kv');
            return {get:key=>{
              pending++;const read=eventTarget();
              setImmediate(()=>{
                read.result=structuredClone(this.records.get(key));read.emit('success');pending--;
                setImmediate(()=>{if(!pending)transaction.emit('complete');});
              });
              return read;
            }};
          };
          return transaction;
        }
      };
      if(this.records===null){
        let aborted=false;
        open.transaction={abort(){aborted=true;}};
        open.emit('upgradeneeded');
        if(aborted){open.error=new Error('AbortError');open.emit('error');return;}
        // Deliberately persist an un-aborted upgrade so the absence assertion
        // detects accidental database creation by the production reader.
        this.records=new Map();
      }
      open.emit('success');
    });
    return open;
  }
}
async function seed(factory, state, extra = {}) {
  if(factory.records===null)factory.records=new Map();
  if(state!==undefined)factory.records.set('state',structuredClone(state));
  for(const [key,value]of Object.entries(extra))factory.records.set(key,structuredClone(value));
}
async function saved(factory) {
  return structuredClone([...factory.records.values()]);
}
function fixture(factory = new ReadonlyDatabaseFixture(), delegate = {read:async()=>ready()}) {
  const events=[];
  const indexedDB={open(...args){
    events.push({op:'open',args});const open=factory.open(...args);
    open.addEventListener('success',()=>{
      const db=open.result,close=db.close.bind(db),transaction=db.transaction.bind(db);
      db.close=()=>{events.push({op:'close'});return close();};
      db.transaction=(scope,mode)=>{
        events.push({op:'transaction',scope,mode});const tx=transaction(scope,mode),objectStore=tx.objectStore.bind(tx);
        tx.objectStore=name=>{
          events.push({op:'store',name});const store=objectStore(name),get=store.get.bind(store);
          store.get=key=>{events.push({op:'get',key});return get(key);};
          for(const method of ['getAll','getAllKeys','openCursor','openKeyCursor','put','add','delete','clear'])store[method]=()=>{throw Error('Unexpected storage operation: '+method);};
          return store;
        };
        return tx;
      };
    });
    return open;
  }};
  const context=vm.createContext({indexedDB,PrivatePreparationSource:delegate,setTimeout,clearTimeout});
  vm.runInContext(source,context);
  const read=options=>context.ProgressPreparationSource.read({owner:OWNER,repo:REPO,...options});
  return {read,events,factory,context};
}
function safe(result){assert.doesNotMatch(JSON.stringify(result),/synthetic-progress-token|synthetic-gist-token|settings|snapshot/);}
function exactReads(f,count){
  assert.equal(f.events.filter(e=>e.op==='get').length,count);
  assert(f.events.filter(e=>e.op==='get').every(e=>e.key==='state'));
  assert(f.events.filter(e=>e.op==='open').every(e=>e.args.length===1&&e.args[0]==='shinkou'));
  assert(f.events.filter(e=>e.op==='transaction').every(e=>e.scope==='kv'&&e.mode==='readonly'));
  assert(f.events.filter(e=>e.op==='store').every(e=>e.name==='kv'));
  assert.equal(f.events.filter(e=>e.op==='close').length,f.events.filter(e=>e.op==='transaction').length);
}

test('saved 進行 connection reads the private manifest when the legacy gist credential cannot',async()=>{
  const factory=new ReadonlyDatabaseFixture();await seed(factory,linked(),{state_prev:linked({token:'unused-previous-token'}),'bk:old':{private:'untouched'}});
  const before=await saved(factory),calls=[],json=(value,status=200)=>new Response(JSON.stringify(value),{status});
  const fetch=async(url,init)=>{
    calls.push({url,authorization:init.headers.Authorization});
    assert.equal(init.method,'GET');assert.equal(init.body,undefined);
    if(url.endsWith('/user'))return json({login:OWNER});
    if(init.headers.Authorization==='Bearer '+LEGACY_TOKEN)return json({},404);
    assert.equal(init.headers.Authorization,'Bearer '+PROGRESS_TOKEN);
    if(url.endsWith('/'+REPO))return json({private:true,full_name:OWNER+'/'+REPO,owner:{login:OWNER}});
    assert.equal(url,'https://api.github.com/repos/'+OWNER+'/'+REPO+'/contents/utacheck/prepared.json');
    const text=JSON.stringify(manifest);
    return json({type:'file',path:'utacheck/prepared.json',name:'prepared.json',encoding:'base64',size:Buffer.byteLength(text),sha:'a'.repeat(40),content:Buffer.from(text).toString('base64')});
  };
  assert.equal((await PrivatePreparationSource.read({owner:OWNER,repo:REPO,token:LEGACY_TOKEN,fetch})).code,'HTTP_404');
  calls.length=0;
  const f=fixture(factory,PrivatePreparationSource),result=await f.read({token:LEGACY_TOKEN,fetch,isActive:()=>true});
  assert.deepEqual(result,ready());assert.equal(calls.length,3);
  assert(calls.every(c=>c.authorization==='Bearer '+PROGRESS_TOKEN));safe(result);exactReads(f,2);
  assert.deepEqual(await saved(factory),before,'no state, previous state or backup is modified');
});

test('absent database is not created, and can retain a valid existing source',async()=>{
  const factory=new ReadonlyDatabaseFixture(),tokens=[],f=fixture(factory,{read:async o=>{tokens.push(o.token);return ready();}});
  const missing=await f.read();assert.equal(missing.code,'PROGRESS_UNLINKED');safe(missing);
  assert.deepEqual(await factory.databases(),[]);
  const result=await f.read({token:LEGACY_TOKEN});assert.equal(result.status,'ready');safe(result);
  assert.deepEqual(tokens,[LEGACY_TOKEN]);assert.deepEqual(await factory.databases(),[]);
  assert.equal(f.events.filter(e=>e.op==='get').length,0);
});

test('missing state or settings never scans previous states or backup keys',async()=>{
  for(const state of [undefined,{}, {settings:{}}]){
    const factory=new ReadonlyDatabaseFixture();await seed(factory,state,{state_prev:linked(),'bk:old':linked()});
    let calls=0;const f=fixture(factory,{read:async()=>{calls++;return ready();}});
    const result=await f.read();assert.equal(result.code,'PROGRESS_UNLINKED');assert.equal(calls,0);safe(result);exactReads(f,1);
    const fallback=await f.read({token:LEGACY_TOKEN});assert.equal(fallback.status,'ready');assert.equal(calls,1);safe(fallback);exactReads(f,3);
  }
});

test('encrypted state reports locked without decryption, fallback or secondary key reads',async()=>{
  const factory=new ReadonlyDatabaseFixture();await seed(factory,{enc:1,iv:'synthetic',data:'synthetic',settings:{sync:linked().settings.sync}},{state_prev:linked()});
  const before=await saved(factory);let calls=0;
  const f=fixture(factory,{read:async()=>{calls++;throw Error(PROGRESS_TOKEN);}});
  const result=await f.read({token:LEGACY_TOKEN});assert.equal(result.code,'PROGRESS_LOCKED');assert.equal(calls,0);safe(result);exactReads(f,1);
  assert.deepEqual(await saved(factory),before);
});

test('disabled, other owner/repository/path/branch and malformed saved connections fail closed',async()=>{
  for(const patch of [{on:false},{on:'true'},{owner:'other-owner'},{repo:'other-data'},{path:'other.json'},{branch:'dev'},{token:''},{token:'invalid\nheader'}]){
    const factory=new ReadonlyDatabaseFixture();await seed(factory,linked(patch));let calls=0;
    const f=fixture(factory,{read:async()=>{calls++;return ready();}}),result=await f.read({token:LEGACY_TOKEN});
    assert.equal(result.code,'PROGRESS_UNLINKED',JSON.stringify(patch));assert.equal(calls,0);safe(result);exactReads(f,1);
  }
});

test('an omitted or empty branch uses the same main default as the progress connection',async()=>{
  for(const branch of [undefined,'']){
    const factory=new ReadonlyDatabaseFixture();await seed(factory,linked({branch}));
    const f=fixture(factory,{read:async()=>{await seed(factory,linked());return ready();}});
    const result=await f.read();assert.equal(result.status,'ready');safe(result);exactReads(f,2);
  }
});

test('invalid caller configuration is rejected before opening storage or using a token',async()=>{
  const f=fixture();
  for(const patch of [{owner:'other'},{repo:'other'},{isActive:true}])assert.equal((await f.read(patch)).code,'INVALID_CONFIG');
  assert.equal(f.events.length,0);
  const g=fixture();assert.equal((await g.read({token:'invalid\nheader'})).code,'PROGRESS_UNLINKED');assert.deepEqual(await g.factory.databases(),[]);
});

test('connection changes, deletion or encryption during network discard the completed manifest',async()=>{
  for(const change of [linked({token:'synthetic-replacement-token'}),linked({on:false}),linked({branch:'dev'}),{}, {enc:1,data:'synthetic'}]){
    const factory=new ReadonlyDatabaseFixture();await seed(factory,linked());
    const f=fixture(factory,{read:async options=>{assert.equal(options.isActive(),true);await seed(factory,change);return ready();}});
    const result=await f.read();assert.equal(result.code,'INACTIVE');safe(result);exactReads(f,2);
    assert.deepEqual((await saved(factory))[0],change,'the other app’s changed state is preserved');
  }
});

test('a newly connected progress source invalidates a legacy fallback already in flight',async()=>{
  const factory=new ReadonlyDatabaseFixture();await seed(factory,{});
  const f=fixture(factory,{read:async options=>{assert.equal(options.token,LEGACY_TOKEN);await seed(factory,linked());return ready();}});
  const result=await f.read({token:LEGACY_TOKEN});assert.equal(result.code,'INACTIVE');safe(result);exactReads(f,2);
});

test('unrelated progress song edits preserve the same authorized connection',async()=>{
  const factory=new ReadonlyDatabaseFixture();await seed(factory,linked());
  const f=fixture(factory,{read:async()=>{const state=linked();state.songs.push({id:'second'});await seed(factory,state);return ready();}});
  const result=await f.read();assert.equal(result.status,'ready');safe(result);exactReads(f,2);
});

test('caller activity and cancellation remain live throughout the delegated read',async()=>{
  const factory=new ReadonlyDatabaseFixture();await seed(factory,linked());let active=true;
  const f=fixture(factory,{read:async options=>{assert.equal(options.isActive(),true);active=false;assert.equal(options.isActive(),false);return ready();}});
  const result=await f.read({isActive:()=>active});assert.equal(result.code,'INACTIVE');safe(result);exactReads(f,1);
  const controller=new AbortController();controller.abort();
  const g=fixture(factory);assert.equal((await g.read({signal:controller.signal})).code,'ABORTED');assert.equal(g.events.length,0);
  assert.equal((await g.read({isActive:()=>false})).code,'INACTIVE');assert.equal(g.events.length,0);
});

test('storage and delegated exceptions do not expose errors or credentials',async()=>{
  const factory=new ReadonlyDatabaseFixture();await seed(factory,linked());
  const f=fixture(factory,{read:async()=>{throw Error(PROGRESS_TOKEN);}}),result=await f.read();
  assert.equal(result.code,'FETCH_FAILED');safe(result);
  const g=fixture();g.context.indexedDB={open(){throw Error(LEGACY_TOKEN);}};
  const failed=await g.read({token:LEGACY_TOKEN});assert.equal(failed.code,'PROGRESS_STORAGE_UNAVAILABLE');safe(failed);
});

test('network validation failures keep the original stage without trying the legacy token',async()=>{
  const factory=new ReadonlyDatabaseFixture();await seed(factory,linked());const tokens=[];
  const failure={status:'unavailable',code:'OWNER_MISMATCH',stage:'identity'};
  const f=fixture(factory,{read:async options=>{tokens.push(options.token);return failure;}});
  const result=await f.read({token:LEGACY_TOKEN});assert.deepEqual(result,failure);assert.deepEqual(tokens,[PROGRESS_TOKEN]);safe(result);exactReads(f,2);
});
