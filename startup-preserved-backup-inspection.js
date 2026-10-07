/* Explicit, read-only inspection of backup connections in preserved originals.
 * Public results contain summaries only. No database is opened and no value is
 * written, adopted, or sent to any endpoint other than the existing backup. */
(function(root){
  'use strict';
  const HOLD='recovery:network-hold:v1',PREFIX='preserved:recovery:v1:';
  const COPY=/^preserved:recovery:v1:[a-f0-9]{64}$/,ID=/^[a-f0-9]{5,40}$/i;
  const MAX_TEXT=20*1024*1024,FLAGS=['tokenStored','backupTargetStored','savedKeyStored','backupKeyStored','groupTargetStored'];
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const copy=value=>JSON.parse(JSON.stringify(value));
  const fail=code=>{const error=new Error(code);error.preservedInspectionCode=code;throw error;};
  const CODES=['cancelled','storage-read','storage-changed','preserved-source-missing','preserved-source-invalid',
    'preserved-source-integrity','preserved-source-limit','inspection-unavailable','inspection-failed'];
  const safe=error=>CODES.includes(error?.preservedInspectionCode)?error.preservedInspectionCode:'inspection-failed';
  const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>own(value,key));
  const stored=value=>value===undefined||value===null||value===''?false:typeof value==='string'?true:null;
  const keyStored=value=>value===undefined||value===null||value===''?false:typeof value==='string'&&value.length<=4096?true:null;
  const aggregate=values=>values.includes(true)?true:values.includes(null)?null:false;
  const unknown=()=>Object.fromEntries(FLAGS.map(key=>[key,null]));
  function snapshot(raw){
    if(!exact(raw,['slots','legacy'])||raw.legacy!==null||!Array.isArray(raw.slots)||raw.slots.length!==2)fail('preserved-source-invalid');
    for(const slot of raw.slots){
      if(!object(slot)||typeof slot.present!=='boolean')fail('preserved-source-invalid');
      if(!slot.present){if(!exact(slot,['present']))fail('preserved-source-invalid');continue;}
      if(!exact(slot,['present','value'])||!object(slot.value)||!own(slot.value,'seq')||!own(slot.value,'txt')
          ||Object.keys(slot.value).some(key=>!['seq','at','txt'].includes(key))
          ||!Number.isSafeInteger(slot.value.seq)||slot.value.seq<0
          ||(own(slot.value,'at')&&(!Number.isSafeInteger(slot.value.at)||slot.value.at<0))
          ||typeof slot.value.txt!=='string')fail('preserved-source-invalid');
    }
    return raw;
  }
  function localSummary(slots){
    return slots.map((slot,generation)=>{
      if(!slot.present)return {generation,status:'absent',...Object.fromEntries(FLAGS.map(key=>[key,false]))};
      let state;try{state=JSON.parse(slot.value.txt);}catch(_){return {generation,status:'format-failed',...unknown()};}
      if(!object(state))return {generation,status:'format-failed',...unknown()};
      let groupTargetStored=false,groupKeys=[false];
      if(state.groups!==undefined&&state.groups!==null){
        if(!Array.isArray(state.groups)||state.groups.some(group=>!object(group))){groupTargetStored=null;groupKeys=[null];}
        else{
          const targets=state.groups.flatMap(group=>[stored(group.gistId),stored(group.src)]);
          groupTargetStored=aggregate(targets);groupKeys=state.groups.map(group=>keyStored(group.key));
        }
      }
      return {generation,status:'read',tokenStored:stored(state.ghToken),backupTargetStored:stored(state.bkGistId),
        savedKeyStored:aggregate([keyStored(state.bkKey),keyStored(state.key),...groupKeys]),backupKeyStored:keyStored(state.bkKey),groupTargetStored};
    });
  }
  function create(options){
    let busy=false,epoch=0,transaction=null,inspection=null,rejectRead=null;
    const active=turn=>{try{return turn===epoch&&options.isActive()===true;}catch(_){return false;}};
    const check=turn=>{if(!active(turn))fail('cancelled');};
    function cancel(){epoch++;inspection?.cancel();if(transaction){try{transaction.abort();}catch(_){}}
      rejectRead?.(Object.assign(new Error('cancelled'),{preservedInspectionCode:'cancelled'}));}
    async function readSource(turn,database){
      check(turn);
      try{if(options.database()!==database||!database||database.name!=='utacheck'||!database.objectStoreNames.contains('state'))fail('storage-read');}
      catch(error){if(error?.preservedInspectionCode)throw error;fail('storage-read');}
      return new Promise((resolve,reject)=>{
        let tx,store,hold,original,holdRaw,originalRaw,failure=null,settled=false;
        const finish=(error,value)=>{if(settled)return;settled=true;if(transaction===tx)transaction=null;if(rejectRead===stop)rejectRead=null;
          if(error)reject(error);else resolve(value);};
        const stop=error=>{failure=error;try{tx?.abort();}catch(_){}finish(error);};
        rejectRead=stop;
        try{
          tx=database.transaction('state','readonly');transaction=tx;store=tx.objectStore('state');
          tx.onabort=tx.onerror=()=>finish(failure||Object.assign(new Error('storage-read'),{preservedInspectionCode:'storage-read'}));
          tx.oncomplete=()=>{
            try{check(turn);if(failure)throw failure;if(!holdRaw||!originalRaw)fail('preserved-source-missing');
              finish(null,{hold,original,holdRaw,originalRaw});}catch(error){finish(error);}
          };
          const request=store.get(HOLD);
          request.onerror=()=>stop(Object.assign(new Error('storage-read'),{preservedInspectionCode:'storage-read'}));
          request.onsuccess=()=>{
            try{
              check(turn);hold=request.result;
              if(hold===undefined)fail('preserved-source-missing');
              if(!object(hold)||!own(hold,'copyKey')||typeof hold.copyKey!=='string'||!COPY.test(hold.copyKey))fail('preserved-source-invalid');
              const sourceKey=hold.originalConnectionCopyKey===undefined?hold.copyKey:hold.originalConnectionCopyKey;
              if(typeof sourceKey!=='string'||!COPY.test(sourceKey))fail('preserved-source-invalid');
              holdRaw=JSON.stringify(hold);
              if(typeof holdRaw!=='string'||holdRaw.length>MAX_TEXT||new TextEncoder().encode(holdRaw).byteLength>MAX_TEXT)fail('preserved-source-limit');
              const preserved=store.get(sourceKey);
              preserved.onerror=()=>stop(Object.assign(new Error('storage-read'),{preservedInspectionCode:'storage-read'}));
              preserved.onsuccess=()=>{
                try{
                  check(turn);original=preserved.result;if(original===undefined)fail('preserved-source-missing');
                  originalRaw=JSON.stringify(original);
                  if(typeof originalRaw!=='string')fail('preserved-source-invalid');
                  if(originalRaw.length>MAX_TEXT||new TextEncoder().encode(originalRaw).byteLength>MAX_TEXT)fail('preserved-source-limit');
                  snapshot(original);
                }catch(error){stop(error?.preservedInspectionCode?error:Object.assign(new Error('preserved-source-invalid'),{preservedInspectionCode:'preserved-source-invalid'}));}
              };
            }catch(error){stop(error?.preservedInspectionCode?error:Object.assign(new Error('preserved-source-invalid'),{preservedInspectionCode:'preserved-source-invalid'}));}
          };
        }catch(error){stop(error?.preservedInspectionCode?error:Object.assign(new Error('storage-read'),{preservedInspectionCode:'storage-read'}));}
      });
    }
    async function run(){
      if(busy||!active(epoch))return null;
      busy=true;const turn=++epoch;
      let result={status:'checking',local:[0,1].map(generation=>({generation,status:'not-read',...unknown()})),
        ...unknown(),connections:0,candidates:[],limited:false};
      const emit=()=>{if(active(turn)&&typeof options.onUpdate==='function'){
        try{Promise.resolve(options.onUpdate(copy(result))).catch(()=>{});}catch(_){}
      }};
      let database,source,inner=null,sourceFailure=null;
      const candidates=[];
      try{
        emit();check(turn);
        try{database=options.database();}catch(_){fail('storage-read');}
        source=await readSource(turn,database);check(turn);
        if(typeof options.digest!=='function')fail('preserved-source-integrity');
        let digest;try{digest=await options.digest(source.originalRaw);}catch(_){check(turn);fail('preserved-source-integrity');}
        check(turn);if(digest!==(source.hold.originalConnectionCopyKey||source.hold.copyKey).slice(PREFIX.length))fail('preserved-source-integrity');
        result.local=localSummary(source.original.slots);
        for(const flag of FLAGS)result[flag]=aggregate(result.local.map(local=>local[flag]));
        async function unchanged(){
          if(sourceFailure)throw sourceFailure;
          try{
            const current=await readSource(turn,database);check(turn);
            if(current.holdRaw!==source.holdRaw||current.originalRaw!==source.originalRaw)fail('storage-changed');
          }catch(error){
            sourceFailure=['preserved-source-missing','preserved-source-invalid','preserved-source-limit'].includes(error?.preservedInspectionCode)
              ?Object.assign(new Error('storage-changed'),{preservedInspectionCode:'storage-changed'}):error;
            throw sourceFailure;
          }
        }
        const readSlots=async()=>{
          await unchanged();
          return source.original.slots.map(slot=>({status:'fulfilled',value:slot.present?copy(slot.value):undefined}));
        };
        if(!options.inspection||typeof options.inspection.create!=='function')fail('inspection-unavailable');
        inner=options.inspection.create({readSlots,digest:options.digest,fetch:async(url,settings)=>{await unchanged();check(turn);return options.fetch(url,settings);},
          unpackBackup:(raw,key,context)=>options.unpackBackup(raw,key,context),isActive:()=>active(turn),
          onCandidate:typeof options.onCandidate==='function'?(...values)=>{check(turn);candidates.push(values);}:undefined,
          onUpdate:summary=>{
            if(!active(turn))return;
            result.status=summary.status;result.connections=summary.connections;result.candidates=copy(summary.candidates);result.limited=summary.limited===true;
            // Original setting presence and read status stay independent of
            // full backup payload validation in the shared inspector.
            emit();
          }});
        inspection=inner;
        const inspected=await inner.run();check(turn);
        // A recheck error inside the shared inspector is intentionally reduced
        // there to a network status. Check here to retain its storage meaning.
        await unchanged();check(turn);
        if(!inspected||typeof inspected.status!=='string')fail('inspection-failed');
        result.status=inspected.status;
        if(inspected.candidates)result.candidates=copy(inspected.candidates);
        if(inspected.connections!==undefined)result.connections=inspected.connections;
        if(inspected.limited!==undefined)result.limited=inspected.limited===true;
        if(result.status==='checked'&&typeof options.onCandidate==='function'){
          for(const values of candidates){check(turn);await options.onCandidate(...values);check(turn);}
        }
        emit();return copy(result);
      }catch(error){
        result.status=safe(error);result.candidates=[];
        if(['storage-read','storage-changed','preserved-source-missing','preserved-source-invalid','preserved-source-integrity','preserved-source-limit'].includes(result.status)){
          result.local=[0,1].map(generation=>({generation,status:result.status==='storage-read'?'read-failed':'unconfirmed',...unknown()}));
          Object.assign(result,unknown());result.connections=0;
        }
        emit();return copy(result);
      }finally{if(inspection===inner)inspection=null;transaction=null;rejectRead=null;busy=false;candidates.length=0;source=null;}
    }
    return Object.freeze({run,cancel,get busy(){return busy;}});
  }
  const api=Object.freeze({create});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupPreservedBackupInspection=api;
})(typeof globalThis!=='undefined'?globalThis:this);
