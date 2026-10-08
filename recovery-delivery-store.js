/* Explicit delivery reconnection: preserve every original before adopting state.
 * The network hold is only read. No clip, legacy, remote, or original is changed. */
(function(root){
  'use strict';
  const HOLD='recovery:network-hold:v1';
  const PREFIX='preserved:delivery-reconnect:v1:';
  const MAX_BYTES=20*1024*1024,MAX_EDITOR_BYTES=100*1024*1024;
  const unsafe=new Set(['__proto__','prototype','constructor']);
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const error=code=>Object.assign(new Error(code),{deliveryStoreCode:code});
  const fail=code=>{throw error(code);};
  const codes=new Set(['candidate-invalid','cancelled','storage-read','storage-changed',
    'hold-invalid','hash-invalid','immutable-conflict','preservation-failed','verify-failed']);
  const reason=value=>codes.has(value?.deliveryStoreCode)?value.deliveryStoreCode:'preservation-failed';
  const json=value=>JSON.stringify(value);
  function bounded(raw,limit=MAX_BYTES){
    return typeof raw==='string'&&raw.length<=limit&&new TextEncoder().encode(raw).byteLength<=limit;
  }
  function checkedObject(raw,code,checkKeys,limit=MAX_BYTES){
    if(!bounded(raw,limit))fail(code);
    let value;try{value=JSON.parse(raw);}catch(_){fail(code);}
    if(!object(value))fail(code);
    if(checkKeys){
      // An iterative walk also handles deeply nested JSON without a recursive copy.
      const pending=[value];
      while(pending.length){
        const item=pending.pop();
        for(const key of Object.keys(item)){
          if(unsafe.has(key))fail(code);
          if(item[key]&&typeof item[key]==='object')pending.push(item[key]);
        }
      }
    }
    return value;
  }
  function checkedHold(raw){
    const hold=checkedObject(raw,'hold-invalid',true);
    if(hold.v!==1||!Number.isSafeInteger(hold.seq)||hold.seq<0||![0,1].includes(hold.slot)
      ||typeof hold.copyKey!=='string'||!/^preserved:recovery:v1:[a-f0-9]{64}$/.test(hold.copyKey))fail('hold-invalid');
    if(own(hold,'startupKey')&&(typeof hold.startupKey!=='string'||!/^preserved:startup:v1:[a-f0-9]{64}$/.test(hold.startupKey)))fail('hold-invalid');
    if(own(hold,'originalConnectionCopyKey')&&(typeof hold.originalConnectionCopyKey!=='string'
      ||!/^preserved:recovery:v1:[a-f0-9]{64}$/.test(hold.originalConnectionCopyKey)))fail('hold-invalid');
    if(own(hold,'candidateDigest')&&(typeof hold.candidateDigest!=='string'||!/^[a-f0-9]{64}$/.test(hold.candidateDigest)))fail('hold-invalid');
    return hold;
  }
  function checkedSequence(slots){
    let seq=0;
    for(const value of slots){
      if(value===undefined)continue;
      if(!object(value)||!Number.isSafeInteger(value.seq)||value.seq<0||typeof value.txt!=='string'
        ||(own(value,'at')&&(!Number.isSafeInteger(value.at)||value.at<0)))fail('storage-read');
      seq=Math.max(seq,value.seq);
    }
    if(!Number.isSafeInteger(seq+1))fail('candidate-invalid');
    return seq+1;
  }
  function read(database,keys){
    return new Promise((resolve,reject)=>{
      try{
        const tx=database.transaction('state','readonly'),store=tx.objectStore('state');
        const requests=keys.map(key=>store.get(key));
        tx.onabort=tx.onerror=()=>reject(error('storage-read'));
        tx.oncomplete=()=>{try{resolve(requests.map(request=>request.result));}catch(_){reject(error('storage-read'));}};
      }catch(_){reject(error('storage-read'));}
    });
  }
  async function commit(options){
    let committed=false,seq,slot;
    try{
      if(!object(options)||['database','hash','isActive','readLegacy'].some(key=>typeof options[key]!=='function'))fail('candidate-invalid');
      // Capture inputs before the first asynchronous boundary. The caller's objects
      // are never edited, and later caller edits cannot replace the approved bytes.
      const {database:getDatabase,hash,isActive,readLegacy,expectedSlotsRaw,expectedHoldRaw,
        originalStateRaw,nextStateRaw,expectedLegacyRaw}=options;
      const allowMissingHold=options.allowMissingHold===true;
      if(typeof expectedSlotsRaw!=='string'||(typeof expectedHoldRaw!=='string'&&!(allowMissingHold&&expectedHoldRaw===undefined))
        ||(expectedLegacyRaw!==undefined&&expectedLegacyRaw!==null&&typeof expectedLegacyRaw!=='string')
        ||!Array.isArray(options.remoteCopies))fail('candidate-invalid');
      checkedObject(nextStateRaw,'candidate-invalid',true);
      checkedObject(originalStateRaw,'candidate-invalid',false,MAX_EDITOR_BYTES);
      if(expectedHoldRaw!==undefined)checkedHold(expectedHoldRaw);
      const remoteCopies=options.remoteCopies.map(value=>{
        if(!object(value)||typeof value.gistId!=='string'||!/^[a-f0-9]{32}$/i.test(value.gistId)
          ||typeof value.raw!=='string')fail('candidate-invalid');
        return {gistId:value.gistId,raw:value.raw};
      });
      const active=()=>{try{return isActive()===true;}catch(_){return false;}};
      const checkActive=()=>{if(!active())fail('cancelled');};
      const getLegacy=()=>{
        let raw;try{raw=readLegacy();}catch(_){fail('storage-read');}
        if(raw!==null&&typeof raw!=='string')fail('storage-read');return raw;
      };
      checkActive();
      let database;try{database=getDatabase();}catch(_){fail('storage-read');}
      if(!database||typeof database.transaction!=='function')fail('storage-read');
      const checkDatabase=()=>{let current;try{current=getDatabase();}catch(_){fail('storage-read');}
        if(current!==database)fail('storage-changed');};
      const legacy=getLegacy();
      if(expectedLegacyRaw!==undefined&&legacy!==expectedLegacyRaw)fail('storage-changed');
      const before=await read(database,['state:0','state:1',HOLD]);
      checkActive();checkDatabase();
      if(getLegacy()!==legacy||json(before.slice(0,2))!==expectedSlotsRaw||json(before[2])!==expectedHoldRaw)fail('storage-changed');
      if(before[2]===undefined){if(!allowMissingHold)fail('hold-invalid');}
      else checkedHold(json(before[2]));
      seq=checkedSequence(before.slice(0,2));slot=seq%2;
      const envelope={seq,at:Date.now(),txt:nextStateRaw};
      const envelopeRaw=json(envelope),after=before.slice(0,2);after[slot]=envelope;
      const afterRaw=json(after),immutable=[],addresses=new Map();
      async function preserve(kind,value,digestRaw){
        let digest;try{digest=await hash(digestRaw);}catch(_){fail('hash-invalid');}
        checkActive();checkDatabase();
        if(typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))fail('hash-invalid');
        const key=PREFIX+kind+':'+digest,raw=json(value),prior=addresses.get(key);
        if(prior){if(prior.raw!==raw)fail('immutable-conflict');return;}
        const record={key,value,raw};addresses.set(key,record);immutable.push(record);
      }
      await preserve('slots',before.slice(0,2).map(value=>value===undefined?null:value),expectedSlotsRaw);
      await preserve('legacy',legacy,json(legacy));
      if(before[2]!==undefined)await preserve('hold',before[2],expectedHoldRaw);
      await preserve('editor',originalStateRaw,originalStateRaw);
      for(const value of remoteCopies)await preserve('remote',value,json(value));
      checkActive();checkDatabase();
      if(getLegacy()!==legacy)fail('storage-changed');
      // All hashing is complete. No asynchronous work is performed while this
      // state-only readwrite transaction is active.
      await new Promise((resolve,reject)=>{
        let tx,store,failure=null,settled=false;
        const finish=(problem)=>{if(settled)return;settled=true;problem?reject(problem):resolve();};
        const abort=problem=>{failure=failure||problem;try{tx.abort();}catch(_){} };
        const guard=()=>{checkActive();checkDatabase();if(getLegacy()!==legacy)fail('storage-changed');};
        const guarded=request=>{request.onsuccess=()=>{try{guard();}catch(problem){abort(problem);}};};
        try{
          tx=database.transaction('state','readwrite');
          tx.onabort=()=>finish(failure||error('preservation-failed'));
          tx.onerror=()=>abort(error('preservation-failed'));
          tx.oncomplete=()=>{
            // A late cancellation cannot undo an already committed transaction.
            // Mark it committed first so the caller will never retry blindly.
            committed=true;
            try{guard();if(failure)throw failure;finish();}catch(problem){finish(problem);}
          };
          store=tx.objectStore('state');
          const requests=['state:0','state:1',HOLD,...immutable.map(value=>value.key)].map(key=>store.get(key));
          let remaining=requests.length;
          for(const request of requests)request.onsuccess=()=>{
            try{
              guard();if(--remaining)return;
              if(json(requests.slice(0,2).map(value=>value.result))!==expectedSlotsRaw
                ||json(requests[2].result)!==expectedHoldRaw)return abort(error('storage-changed'));
              // Check all addresses before even queueing the first write.
              for(let index=0;index<immutable.length;index++){
                const existing=requests[index+3].result;
                if(existing!==undefined&&json(existing)!==immutable[index].raw)return abort(error('immutable-conflict'));
              }
              guard();
              for(let index=0;index<immutable.length;index++)if(requests[index+3].result===undefined){
                const record=immutable[index];guarded(store.add(record.value,record.key));
              }
              guarded(store.put(envelope,'state:'+slot));
              // Final request creates an abortable finish boundary after writes.
              const last=store.get(HOLD);last.onsuccess=()=>{try{
                guard();if(json(last.result)!==expectedHoldRaw)fail('storage-changed');
              }catch(problem){abort(problem);}};
            }catch(problem){abort(problem?.deliveryStoreCode?problem:error('preservation-failed'));}
          };
        }catch(problem){
          if(tx)abort(problem?.deliveryStoreCode?problem:error('preservation-failed'));
          else finish(error('preservation-failed'));
        }
      });
      // Reread the slot pair, unchanged hold, and every immutable copy together.
      const verified=await read(database,['state:0','state:1',HOLD,...immutable.map(value=>value.key)]);
      checkActive();checkDatabase();
      if(getLegacy()!==legacy||json(verified.slice(0,2))!==afterRaw||json(verified[slot])!==envelopeRaw
        ||json(verified[2])!==expectedHoldRaw)fail('verify-failed');
      for(let index=0;index<immutable.length;index++)if(json(verified[index+3])!==immutable[index].raw)fail('verify-failed');
      checkActive();
      return {status:'committed',committed:true,seq,slot};
    }catch(problem){
      return committed?{status:'unverified',committed:true,seq,slot,reason:reason(problem)}
        :{status:'rejected',committed:false,reason:reason(problem)};
    }
  }
  const api=Object.freeze({commit,HOLD,PREFIX});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RecoveryDeliveryStore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
