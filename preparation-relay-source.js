/* Owner-only preparation delivery through the owned 進行 server. The caller's
 * existing GitHub login proves identity; it is never persisted by this reader. */
(function(root){
 'use strict';
 const ENDPOINT='https://shinkou-secure.onrender.com/utacheck/prepared';
 const OWNER='gogojoe312-max',REPO='shinkou-data',PATH='utacheck/prepared.json';
 const MAX_BYTES=20*1024*1024,RESPONSE_MS=90000,IDLE_MS=30000,TOTAL_MS=180000;
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const unavailable=code=>({status:'unavailable',code,stage:'relay'});
 const failure=code=>Object.assign(new Error(code),{relayCode:code});
 function abortable(promise,signal){
  return new Promise((resolve,reject)=>{
   const abort=()=>{signal.removeEventListener('abort',abort);reject(failure('ABORTED'));};
   if(signal.aborted){abort();Promise.resolve(promise).catch(()=>{});return;}
   signal.addEventListener('abort',abort,{once:true});
   Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
 }
 async function read(options={}){
  if(!object(options)||options.owner!==OWNER||options.repo!==REPO||options.isActive!==undefined&&typeof options.isActive!=='function'
   ||options.onProgress!==undefined&&typeof options.onProgress!=='function')return unavailable('INVALID_CONFIG');
  const {token,signal}=options;
  if(!token)return unavailable('MISSING_TOKEN');
  if(typeof token!=='string'||token.length>8192||/[\x00-\x20\x7f]/.test(token))return unavailable('INVALID_CONFIG');
  const request=options.fetch||root.fetch;
  if(typeof request!=='function'||typeof AbortController!=='function')return unavailable('UNSUPPORTED');
  const deadline=Date.now()+TOTAL_MS;
  const active=()=>{if(signal?.aborted)throw failure('ABORTED');if(options.isActive&&!options.isActive())throw failure('INACTIVE');};
  const progress=phase=>{try{active();options.onProgress?.({phase});}catch(_){} };
  const retryable=new Set(['TIMEOUT','FETCH_FAILED','HTTP_502','HTTP_503','HTTP_504','SOURCE_UNAVAILABLE']);
  for(let attempt=0;attempt<2;attempt++){
   const controller=new AbortController();let timedOut=false,timer,slowTimer,reader;
   const abort=()=>controller.abort();
   const check=()=>{active();if(timedOut||Date.now()>=deadline)throw failure('TIMEOUT');};
   const arm=ms=>{clearTimeout(timer);const left=Math.min(ms,deadline-Date.now());if(left<=0){timedOut=true;controller.abort();return;}timer=setTimeout(()=>{timedOut=true;controller.abort();},left);};
   let problem;
   try{
    active();signal?.addEventListener('abort',abort,{once:true});
    if(attempt){
     progress('retrying');arm(1000);
     // A retry delay is cancellable and counts toward the one overall limit.
     await abortable(new Promise(resolve=>{slowTimer=setTimeout(resolve,500);}),controller.signal);
     clearTimeout(slowTimer);slowTimer=null;check();
    }
    progress('waiting');arm(RESPONSE_MS);
    slowTimer=setTimeout(()=>progress('slow'),15000);
    const response=await abortable(request(ENDPOINT,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json',Authorization:'Bearer '+token}}),controller.signal);
    clearTimeout(slowTimer);slowTimer=null;check();
    if(response.redirected||response.url&&response.url!==ENDPOINT)throw failure('REDIRECTED');
    const maximum=response.status===200?MAX_BYTES:4096,header=response.headers?.get('content-length');
    if(header!=null&&(!/^\d+$/.test(header)||Number(header)>maximum))throw failure('RESPONSE_TOO_LARGE');
    if(typeof response.body?.getReader!=='function')throw failure('BODY_UNREADABLE');
    reader=response.body.getReader();const chunks=[];let length=0;
    if(response.status===200)progress('receiving');
    while(true){
     check();arm(IDLE_MS);const chunk=await abortable(reader.read(),controller.signal);check();if(chunk.done)break;
     if(!(chunk.value instanceof Uint8Array))throw failure('BODY_UNREADABLE');length+=chunk.value.byteLength;if(length>maximum)throw failure('RESPONSE_TOO_LARGE');chunks.push(chunk.value);
    }
    clearTimeout(timer);
    const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){throw failure([502,503,504].includes(response.status)?'HTTP_'+response.status:'INVALID_RESPONSE');}
    if(response.status!==200){
     const codes=['RELAY_NOT_CONFIGURED','OWNER_MISMATCH','HTTP_401','SOURCE_UNAVAILABLE','TIMEOUT'];
     throw failure(codes.includes(value?.code)?value.code:'HTTP_'+response.status);
    }
    if(!object(value)||value.status!=='ready'||value.sourcePath!==PATH||!/^[a-f0-9]{40}$/.test(value.sourceSha||'')||!object(value.manifest))throw failure('INVALID_RESPONSE');
    const manifest=value.manifest;
    if(manifest.app!=='utacheck-private-preparation'||manifest.version!==1||manifest.owner!==OWNER||!Array.isArray(manifest.operations))throw failure('INVALID_MANIFEST');
    check();return {status:'ready',manifest,sourceSha:value.sourceSha,sourcePath:PATH};
   }catch(error){problem=signal?.aborted?'ABORTED':timedOut?'TIMEOUT':error?.relayCode||'FETCH_FAILED';}
   finally{
    clearTimeout(timer);clearTimeout(slowTimer);signal?.removeEventListener('abort',abort);controller.abort();
    if(reader){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch(_){}try{reader.releaseLock();}catch(_){} }
   }
   try{active();}catch(error){return unavailable(error?.relayCode||'INACTIVE');}
   if(attempt||!retryable.has(problem)||Date.now()>=deadline)return unavailable(problem);
  }
  return unavailable('TIMEOUT');
 }
 const api=Object.freeze({read});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PreparationRelaySource=api;
})(typeof globalThis!=='undefined'?globalThis:this);
