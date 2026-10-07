/* Explicit restoration of one checked candidate, with atomic original preservation. */
(function(root){
  'use strict';
  const HOLD='recovery:network-hold:v1';
  const MAX_JSON_BYTES=20*1024*1024;
  const fail=code=>{const error=new Error(code);error.recoveryCode=code;throw error;};
  const codes=['cancelled','storage-read','storage-changed','legacy-present','recovery-held','candidate-invalid','preservation-failed','verify-failed'];
  function checkedObject(raw,code){
    if(typeof raw!=='string'||new TextEncoder().encode(raw).byteLength>MAX_JSON_BYTES)fail(code);
    const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))fail(code);return value;
  }
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
        if(context.verifySources&&!await context.verifySources())fail('storage-changed');
        const archives=[];
        for(const source of context.sourceSnapshots||[]){
          if(typeof source.key!=='string'||!source.key.startsWith('xls:')||! /^[a-f0-9]{64}$/.test(source.digest)
            ||!(source.blob instanceof Blob)||source.blob.size!==source.bytes)fail('candidate-invalid');
          const archiveKey='preserved:excel:v1:'+source.digest;
          if(!archives.some(value=>value.key===archiveKey))archives.push({key:archiveKey,blob:source.blob,bytes:source.bytes,digest:source.digest});
        }
        const state=JSON.parse(JSON.stringify(packet.state));
        // Restoration never creates token access; credentials stay in originals.
        if(context.preserveEditorCredentials===true){
          const editor=checkedObject(context.editorOriginalRaw,'candidate-invalid');
          if(editor.ghToken!==undefined&&typeof editor.ghToken!=='string')fail('candidate-invalid');
          if(state.ghToken!==editor.ghToken)fail('candidate-invalid');
        }else delete state.ghToken;
        options.validate(state);if(!options.hasWork(state))fail('candidate-invalid');
        const txt=JSON.stringify(state);if(new TextEncoder().encode(txt).byteLength>MAX_JSON_BYTES)fail('candidate-invalid');
        const replaceHold=context.expectedHoldRaw!==undefined;
        if(replaceHold&&typeof context.expectedHoldRaw!=='string')fail('candidate-invalid');
        const editorOriginalRaw=context.editorOriginalRaw;
        if(editorOriginalRaw!==undefined)checkedObject(editorOriginalRaw,'candidate-invalid');
        const database=options.database();if(!database)fail('storage-read');
        const values=await read(database,['state:0','state:1',HOLD]);
        if(!active(turn,context))return false;
        let oldHold,oldHoldRaw;
        if(values[2]!==undefined){
          if(!replaceHold)fail('recovery-held');
          oldHoldRaw=JSON.stringify(values[2]);oldHold=checkedObject(oldHoldRaw,'storage-read');
          if(context.expectedHoldRaw!==oldHoldRaw)fail('storage-changed');
        }else if(replaceHold)fail('storage-changed');
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
        if(packet.sourceDateUnknown===true){hold.sourceDateUnknown=true;hold.sourceKind=packet.sourceKind==='local-excel'?'local-excel':'local-publication';}
        if(packet.sourceKind==='cloud-backup')hold.sourceKind='cloud-backup';
        if(packet.sourceKind==='cloud-publication')hold.sourceKind='cloud-publication';
        const immutable=[{key:copyKey,value:original,raw:originalRaw},{key:startupKey,value:after,raw:afterRaw}];
        if(oldHold){
          hold.originalConnectionCopyKey=oldHold.originalConnectionCopyKey||oldHold.copyKey;
          immutable.push({key:'preserved:recovery-hold:v1:'+await options.hash(oldHoldRaw),value:oldHold,raw:oldHoldRaw});
        }
        if(editorOriginalRaw!==undefined){
          // Keep the exact editor bytes, including JSON whitespace and key order.
          immutable.push({key:'preserved:editor:v1:'+await options.hash(editorOriginalRaw),value:editorOriginalRaw,raw:JSON.stringify(editorOriginalRaw)});
        }
        if(context.sourceOriginalRaw!==undefined){
          checkedObject(context.sourceOriginalRaw,'candidate-invalid');
          immutable.push({key:'preserved:recovery-source:v1:'+await options.hash(context.sourceOriginalRaw),
            value:context.sourceOriginalRaw,raw:JSON.stringify(context.sourceOriginalRaw)});
          hold.sourceCopyKey=immutable.at(-1).key;
        }
        if(oldHold?.excelSources)hold.excelSources=JSON.parse(JSON.stringify(oldHold.excelSources));
        if(oldHold?.excelSummary)hold.excelSummary=JSON.parse(JSON.stringify(oldHold.excelSummary));
        if(archives.length)hold.excelSources=(context.sourceSnapshots||[]).map(source=>({key:source.key,bytes:source.bytes,digest:source.digest}));
        if(packet.excelSummary)hold.excelSummary=JSON.parse(JSON.stringify(packet.excelSummary));
        if(!active(turn,context))return false;
        plan={database,slots,legacy,envelope,slot,copyKey,original,originalRaw,startupKey,after,afterRaw,hold,archives,oldHoldRaw,replaceHold,immutable};return true;
      }catch(_){if(turn===epoch)plan=null;return false;}
    }
    async function commit(context){
      if(busy||!plan)return {status:'candidate-invalid'};
      const current=plan,turn=epoch;let committed=false;busy=true;
      try{
        if(!active(turn,context))fail('cancelled');
        if(context.verifySources&&!await context.verifySources())fail('storage-changed');
        if(!active(turn,context))fail('cancelled');
        // Immutable workbook originals are preserved in the state-only commit.
        // Existing clips are never put or deleted by restoration.
        const previousArchives=current.archives.length?await read(current.database,current.archives.map(value=>value.key)):[];
        for(let i=0;i<previousArchives.length;i++)if(previousArchives[i]!==undefined){
          const previous=previousArchives[i],wanted=current.archives[i];
          if(!(previous instanceof Blob)||previous.size!==wanted.bytes||!context.hashBlob
            ||await context.hashBlob(previous)!==wanted.digest)fail('storage-changed');
        }
        if(!active(turn,context))fail('cancelled');
        await new Promise((resolve,reject)=>{
          const tx=current.database.transaction('state','readwrite'),store=tx.objectStore('state');transaction=tx;
          let failure,remaining=3+current.immutable.length;
          const abort=code=>{failure=code;try{tx.abort();}catch(_){} };
          const guardedWrite=request=>{
            if(current.replaceHold)request.onsuccess=()=>{try{if(!active(turn,context))abort('cancelled');}catch(_){abort('cancelled');}};
          };
          const signalAbort=()=>abort('cancelled');context.signal?.addEventListener('abort',signalAbort,{once:true});
          const cleanup=()=>{context.signal?.removeEventListener('abort',signalAbort);if(transaction===tx)transaction=null;};
          tx.oncomplete=()=>{cleanup();failure?reject(Object.assign(new Error(failure),{recoveryCode:failure})):resolve();};
          tx.onerror=tx.onabort=()=>{cleanup();reject(Object.assign(new Error('preservation-failed'),{recoveryCode:failure||'preservation-failed'}));};
          const requests=['state:0','state:1',HOLD,...current.immutable.map(value=>value.key)].map(key=>store.get(key));
          for(const request of requests)request.onsuccess=()=>{
            if(--remaining)return;
            try{
              if(!active(turn,context))return abort('cancelled');
              const snapshot={slots:requests.slice(0,2).map(q=>q.result===undefined?{present:false}:{present:true,value:q.result}),legacy:options.readLegacy()};
              if(JSON.stringify(snapshot)!==current.originalRaw)return abort('storage-changed');
              if(current.replaceHold){if(JSON.stringify(requests[2].result)!==current.oldHoldRaw)return abort('storage-changed');}
              else if(requests[2].result!==undefined)return abort('recovery-held');
              // Validate every immutable address before queueing any write.
              for(let index=0;index<current.immutable.length;index++){
                if(requests[index+3].result!==undefined&&JSON.stringify(requests[index+3].result)!==current.immutable[index].raw)return abort('storage-changed');
              }
              current.immutable.forEach((value,index)=>{if(requests[index+3].result===undefined)guardedWrite(store.add(value.value,value.key));});
              if(current.replaceHold)guardedWrite(store.put(current.hold,HOLD));else store.add(current.hold,HOLD);
              guardedWrite(store.put(current.envelope,'state:'+current.slot));
              current.archives.forEach((archive,index)=>{if(previousArchives[index]===undefined)guardedWrite(store.add(archive.blob,archive.key));});
            }catch(_){abort('preservation-failed');}
          };
        });
        committed=true;
        // Never change S or reopen the editor until every committed record is reread.
        const checked=await read(current.database,['state:0','state:1',current.copyKey,current.startupKey,HOLD,...current.immutable.slice(2).map(value=>value.key)]);
        if(!active(turn,context))fail('cancelled');
        const after={slots:checked.slice(0,2).map(value=>value===undefined?{present:false}:{present:true,value}),legacy:options.readLegacy()};
        if(JSON.stringify(after)!==current.afterRaw||JSON.stringify(checked[2])!==current.originalRaw
          ||JSON.stringify(checked[3])!==current.afterRaw||JSON.stringify(checked[4])!==JSON.stringify(current.hold))fail('verify-failed');
        for(let index=2;index<current.immutable.length;index++)if(JSON.stringify(checked[index+3])!==current.immutable[index].raw)fail('verify-failed');
        const checkedArchives=current.archives.length?await read(current.database,current.archives.map(value=>value.key)):[];
        for(let i=0;i<checkedArchives.length;i++)if(!(checkedArchives[i] instanceof Blob)||checkedArchives[i].size!==current.archives[i].bytes
          ||!context.hashBlob||await context.hashBlob(checkedArchives[i])!==current.archives[i].digest)fail('verify-failed');
        if(context.verifySources&&!await context.verifySources())fail('verify-failed');
        if(!active(turn,context))fail('cancelled');
        plan=null;return {status:'restored'};
      }catch(error){
        const result={status:codes.includes(error?.recoveryCode)?error.recoveryCode:'preservation-failed'};
        if(current.replaceHold)result.committed=committed;
        return result;
      }
      finally{busy=false;}
    }
    return Object.freeze({prepare,commit,cancel,get busy(){return busy;}});
  }
  const api=Object.freeze({create,HOLD});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupFileRestoration=api;
})(typeof globalThis!=='undefined'?globalThis:this);
