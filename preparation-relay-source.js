/* Owner-only preparation delivery through the owned 進行 server. The caller's
 * existing GitHub login proves identity; it is never persisted by this reader. */
(function(root){
 'use strict';
 const ENDPOINT='https://shinkou-secure.onrender.com/utacheck/prepared';
 const OWNER='gogojoe312-max',REPO='shinkou-data',PATH='utacheck/prepared.json';
 const MAX_BYTES=20*1024*1024,TIMEOUT_MS=30000;
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const unavailable=code=>({status:'unavailable',code,stage:'relay'});
 async function read(options={}){
  if(!object(options)||options.owner!==OWNER||options.repo!==REPO||options.isActive!==undefined&&typeof options.isActive!=='function')return unavailable('INVALID_CONFIG');
  const {token,signal}=options;
  if(!token)return unavailable('MISSING_TOKEN');
  if(typeof token!=='string'||token.length>8192||/[\x00-\x20\x7f]/.test(token))return unavailable('INVALID_CONFIG');
  const request=options.fetch||root.fetch;
  if(typeof request!=='function'||typeof AbortController!=='function')return unavailable('UNSUPPORTED');
  const controller=new AbortController();let timedOut=false,timer;
  const fail=code=>{throw Object.assign(new Error(code),{relayCode:code});};
  const active=()=>{if(timedOut)fail('TIMEOUT');if(signal?.aborted||controller.signal.aborted)fail('ABORTED');if(options.isActive&&!options.isActive())fail('INACTIVE');};
  const abort=()=>controller.abort();
  try{
   signal?.addEventListener('abort',abort,{once:true});active();
   timer=setTimeout(()=>{timedOut=true;controller.abort();},TIMEOUT_MS);
   const response=await request(ENDPOINT,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json',Authorization:'Bearer '+token}});
   active();if(response.redirected||response.url&&response.url!==ENDPOINT)fail('REDIRECTED');
   const maximum=response.status===200?MAX_BYTES:4096,header=response.headers?.get('content-length');
   if(header!=null&&(!/^\d+$/.test(header)||Number(header)>maximum))fail('RESPONSE_TOO_LARGE');
   if(typeof response.body?.getReader!=='function')fail('BODY_UNREADABLE');
   const reader=response.body.getReader(),chunks=[];let length=0;
   try{while(true){active();const chunk=await reader.read();active();if(chunk.done)break;
    if(!(chunk.value instanceof Uint8Array))fail('BODY_UNREADABLE');length+=chunk.value.byteLength;if(length>maximum)fail('RESPONSE_TOO_LARGE');chunks.push(chunk.value);
   }}catch(error){try{await reader.cancel();}catch(_){}throw error;}finally{reader.releaseLock();}
   const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
   let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){fail('INVALID_RESPONSE');}
   if(response.status!==200){
    const codes=['RELAY_NOT_CONFIGURED','OWNER_MISMATCH','HTTP_401','SOURCE_UNAVAILABLE'];
    fail(codes.includes(value?.code)?value.code:'HTTP_'+response.status);
   }
   if(!object(value)||value.status!=='ready'||value.sourcePath!==PATH||!/^[a-f0-9]{40}$/.test(value.sourceSha||'')||!object(value.manifest))fail('INVALID_RESPONSE');
   const manifest=value.manifest;
   if(manifest.app!=='utacheck-private-preparation'||manifest.version!==1||manifest.owner!==OWNER||!Array.isArray(manifest.operations))fail('INVALID_MANIFEST');
   active();return {status:'ready',manifest,sourceSha:value.sourceSha,sourcePath:PATH};
  }catch(error){return unavailable(timedOut?'TIMEOUT':signal?.aborted?'ABORTED':error?.relayCode||'FETCH_FAILED');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
 }
 const api=Object.freeze({read});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PreparationRelaySource=api;
})(typeof globalThis!=='undefined'?globalThis:this);
