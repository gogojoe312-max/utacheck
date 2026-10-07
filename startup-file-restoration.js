/* Explicit restoration of one checked file, with atomic original preservation. */
(function(root){
  'use strict';
  const HOLD='recovery:network-hold:v1';
  const fail=code=>{const error=new Error(code);error.recoveryCode=code;throw error;};
  const codes=['cancelled','storage-read','storage-changed','legacy-present','recovery-held','candidate-invalid','preservation-failed','verify-failed'];
  function create(options){
    let plan=null,busy=false,epoch=0,transaction=null;
    function cancel(){epoch++;plan=null;try{transaction?.abort();}catch(_){} }
    const active=(turn,context)=>turn===epoch&&options.isActive()&&!context.signal?.aborted&&context.isActive();
    function read(database,keys){return new Promise((resolve,reject)=>{
      const tx=database.transaction('state','readonly'),store=tx.objectStore('state'),requests=keys.map(key=>store.get(key));
      tx.oncomplete=()=>resolve(requests.map(request=>request.result));tx.onerror=tx.onabort=()=>reject(new Error('storage-read'));
    });}
    async function prepare(packet,context){
      cancel();const turn=epoch;
      try{
        if(!active(turn,context)||busy)return false;
        const state=JSON.parse(JSON.stringify(packet.state));
        // A file never creates token access; the original export excludes this field.
        delete state.ghToken;
        options.validate(state);if(!options.hasWork(state))fail('candidate-invalid');
        const txt=JSON.stringify(state);if(new TextEncoder().encode(txt).byteLength>20*1024*1024)fail('candidate-invalid');
        const database=options.database();if(!database)fail('storage-read');
        const values=await read(database,['state:0','state:1',HOLD]);
        if(!active(turn,context))return false;if(values[2]!==undefined)fail('recovery-held');
        const legacy=options.readLegacy();if(legacy!==null)fail('legacy-present');
        const slots=values.slice(0,2).map(value=>value===undefined?{present:false}:{present:true,value});
        let seq=0;
        for(const slot of slots)if(slot.present){if(!slot.value||typeof slot.value.txt!=='string'||!Number.isSafeInteger(slot.value.seq)||slot.value.seq<0)fail('storage-read');seq=Math.max(seq,slot.value.seq);}
        if(!Number.isSafeInteger(seq+1))fail('candidate-invalid');seq++;
        const slot=seq%2,envelope={seq,at:Date.now(),txt},original={slots,legacy},originalRaw=JSON.stringify(original);
        if(context.expectedOriginalRaw!==undefined&&context.expectedOriginalRaw!==originalRaw)fail('storage-changed');
        const copyKey='preserved:recovery:v1:'+await options.hash(originalRaw);
        const after={slots:JSON.parse(JSON.stringify(slots)),legacy};after.slots[slot]={present:true,value:envelope};
        const afterRaw=JSON.stringify(after),startupKey='preserved:startup:v1:'+await options.hash(afterRaw);
        const hold={v:1,seq,slot,copyKey,startupKey,sourceAt:packet.sourceDateUnknown===true?null:packet.at,candidateDigest:await options.hash(txt)};
        if(packet.sourceDateUnknown===true){hold.sourceDateUnknown=true;hold.sourceKind='local-publication';}
        if(!active(turn,context))return false;
        plan={database,slots,legacy,envelope,slot,copyKey,original,originalRaw,startupKey,after,afterRaw,hold};return true;
      }catch(_){if(turn===epoch)plan=null;return false;}
    }
    async function commit(context){
      if(busy||!plan)return {status:'candidate-invalid'};
      const current=plan,turn=epoch;busy=true;
      try{
        if(!active(turn,context))fail('cancelled');
        await new Promise((resolve,reject)=>{
          const tx=current.database.transaction('state','readwrite'),store=tx.objectStore('state');transaction=tx;
          let failure,remaining=5;
          const abort=code=>{failure=code;try{tx.abort();}catch(_){} };
          const signalAbort=()=>abort('cancelled');context.signal?.addEventListener('abort',signalAbort,{once:true});
          const cleanup=()=>{context.signal?.removeEventListener('abort',signalAbort);if(transaction===tx)transaction=null;};
          tx.oncomplete=()=>{cleanup();failure?reject(Object.assign(new Error(failure),{recoveryCode:failure})):resolve();};
          tx.onerror=tx.onabort=()=>{cleanup();reject(Object.assign(new Error('preservation-failed'),{recoveryCode:failure||'preservation-failed'}));};
          const requests=['state:0','state:1',HOLD,current.copyKey,current.startupKey].map(key=>store.get(key));
          for(const request of requests)request.onsuccess=()=>{
            if(--remaining)return;
            try{
              if(!active(turn,context))return abort('cancelled');
              const snapshot={slots:requests.slice(0,2).map(q=>q.result===undefined?{present:false}:{present:true,value:q.result}),legacy:options.readLegacy()};
              if(JSON.stringify(snapshot)!==current.originalRaw)return abort('storage-changed');
              if(requests[2].result!==undefined)return abort('recovery-held');
              for(const [index,key,value,raw] of [[3,current.copyKey,current.original,current.originalRaw],[4,current.startupKey,current.after,current.afterRaw]]){
                if(requests[index].result!==undefined){if(JSON.stringify(requests[index].result)!==raw)return abort('storage-changed');}
                else store.add(value,key);
              }
              store.add(current.hold,HOLD);store.put(current.envelope,'state:'+current.slot);
            }catch(_){abort('preservation-failed');}
          };
        });
        // Never change S or reopen the editor until every committed record is reread.
        const checked=await read(current.database,['state:0','state:1',current.copyKey,current.startupKey,HOLD]);
        if(!active(turn,context))fail('cancelled');
        const after={slots:checked.slice(0,2).map(value=>value===undefined?{present:false}:{present:true,value}),legacy:options.readLegacy()};
        if(JSON.stringify(after)!==current.afterRaw||JSON.stringify(checked[2])!==current.originalRaw
          ||JSON.stringify(checked[3])!==current.afterRaw||JSON.stringify(checked[4])!==JSON.stringify(current.hold))fail('verify-failed');
        plan=null;return {status:'restored'};
      }catch(error){return {status:codes.includes(error?.recoveryCode)?error.recoveryCode:'preservation-failed'};}
      finally{busy=false;}
    }
    return Object.freeze({prepare,commit,cancel,get busy(){return busy;}});
  }
  const api=Object.freeze({create,HOLD});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupFileRestoration=api;
})(typeof globalThis!=='undefined'?globalThis:this);
