'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Ownership=require('../recording-inbox-ownership.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fakeLocks(){
  let held=false,requests=0;
  return {get held(){return held;},get requests(){return requests;},
    async request(name,options,callback){
      assert.equal(name,Ownership.LOCK_NAME);assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});requests++;
      if(held)return callback(null);
      held=true;
      try{return await callback({name,mode:'exclusive'});}finally{held=false;}
    }};
}
test('two tab contexts deny pending/reloading/secondary writes and retain lifetime ownership',async()=>{
  const locks=fakeLocks(),loaded=deferred();let disk={notes:['latest on disk']},aState={notes:['stale A']},bState={notes:['stale B']};
  const a=Ownership.create({locks,reloadLatest:async()=>{await loaded.promise;aState=structuredClone(disk);return true;}});
  const b=Ownership.create({locks,reloadLatest:async()=>{bState=structuredClone(disk);return true;}});
  assert.equal(a.canWrite,false);assert.equal(b.canWrite,false);
  const ready=a.acquire();assert.equal(a.status,'reloading');assert.equal(a.canWrite,false);
  assert.equal(await b.acquire(),false);assert.equal(b.status,'secondary');assert.equal(b.canWrite,false);
  loaded.resolve();assert.equal(await ready,true);assert.equal(a.canWrite,true);assert.deepEqual(aState,disk);assert.equal(locks.held,true);
  const edit=(owner,state,note)=>{if(!owner.canWrite)return false;state.notes.push(note);disk=structuredClone(state);return true;};
  assert.equal(edit(b,bState,'must not persist stale tab'),false);
  assert.equal(edit(a,aState,'new owner edit'),true);
  a.release();assert.equal(a.canWrite,false);assert.equal(b.canWrite,false);await tick();
  assert.equal(await b.acquire(),true);assert.deepEqual(bState,disk);assert.equal(edit(b,bState,'fresh handoff edit'),true);
  assert.deepEqual(disk.notes,['latest on disk','new owner edit','fresh handoff edit']);b.release();await tick();
});
test('every takeover reloads durable state before granting writes',async()=>{
  const locks=fakeLocks();let reloads=0;const wait=deferred();
  const a=Ownership.create({locks,reloadLatest:async()=>true});await a.acquire();a.release();await tick();
  const b=Ownership.create({locks,reloadLatest:async()=>{reloads++;await wait.promise;return true;}});
  const ready=b.acquire();assert.equal(b.canWrite,false);assert.equal(reloads,1);wait.resolve();assert.equal(await ready,true);
  b.release();await tick();assert.equal(await b.acquire(),true);assert.equal(reloads,2);b.release();await tick();
});
test('unsupported or unverified reload never grants enrolled writer authority',async()=>{
  for(const options of [{},{locks:fakeLocks()},{locks:fakeLocks(),reloadLatest:async()=>false},{locks:fakeLocks(),reloadLatest:async()=>{throw Error('private failure');}}]){
    const owner=Ownership.create(options);assert.equal(await owner.acquire(),false);assert.equal(owner.canWrite,false);assert(!owner.status.includes('private'));owner.release();await tick();
  }
});
test('disconnect/enrollment change during reload cancels acquisition without stale reenable',async()=>{
  const locks=fakeLocks(),wait=deferred();let stillCurrent;
  const a=Ownership.create({locks,reloadLatest:async({isCurrent})=>{await wait.promise;stillCurrent=isCurrent();return true;}});
  const ready=a.acquire();a.release();assert.equal(await ready,false);assert.equal(a.canWrite,false);wait.resolve();await tick();
  assert.equal(stillCurrent,false);assert.equal(a.canWrite,false);assert.equal(a.status,'released');assert.equal(locks.held,false);
});
test('concurrent acquire coalesces and release requires explicit fresh claim',async()=>{
  const locks=fakeLocks(),wait=deferred();let reloads=0;
  const a=Ownership.create({locks,reloadLatest:async()=>{reloads++;await wait.promise;return true;}});
  const first=a.acquire(),second=a.acquire();assert.equal(first,second);assert.equal(locks.requests,1);wait.resolve();await first;
  assert.equal(await a.acquire(),true);assert.equal(reloads,1);a.release();await tick();assert.equal(a.canWrite,false);assert.equal(locks.requests,1);
  await a.acquire();assert.equal(reloads,2);a.release();await tick();
});
test('lock request rejection and UI exception fail safely without leaking errors',async()=>{
  const rejected=Ownership.create({locks:{request:async()=>{throw Error('synthetic private token');}},reloadLatest:async()=>true});
  assert.equal(await rejected.acquire(),false);assert.equal(rejected.status,'unavailable');assert.equal(rejected.canWrite,false);
  const locks=fakeLocks(),owner=Ownership.create({locks,reloadLatest:async()=>true,onChange(){throw Error('UI error');}});
  assert.equal(await owner.acquire(),true);owner.release();await tick();assert.equal(owner.canWrite,false);assert.equal(locks.held,false);
});
