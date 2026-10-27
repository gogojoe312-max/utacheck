/* Owner-only private application receipts. Never carry lyrics, notes, audio,
 * source bytes, login material or member delivery settings. */
(function(root){
 'use strict';
 const OWNER='gogojoe312-max',REPO='shinkou-data',BASE='https://api.github.com/repos/'+OWNER+'/'+REPO;
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(v),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const only=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
 const fail=code=>{throw Object.assign(Error(code),{resultCode:code});};
 function validate(v){
  if(!only(v,['app','version','owner','clientId','sequence','observedAt','appVersion','source','operations','sessions'])||v.app!=='utacheck-preparation-results'||v.version!==1||v.owner!==OWNER||!/^device-[a-f0-9]{32}$/.test(v.clientId)||!Number.isSafeInteger(v.sequence)||v.sequence<1||!Number.isFinite(Date.parse(v.observedAt))||!/^\d+(\.\d+){2,5}$/.test(v.appVersion))fail('INVALID_RESULTS');
  if(!only(v.source,['sha','revision','createdAt'])||!/^[a-f0-9]{40}$/.test(v.source.sha)||!id(v.source.revision)||!Number.isFinite(Date.parse(v.source.createdAt)))fail('INVALID_RESULTS');
  if(!Array.isArray(v.operations)||v.operations.length>100||!Array.isArray(v.sessions)||v.sessions.length>100)fail('INVALID_RESULTS');
  const seen=new Set();for(const op of v.operations){if(!only(op,['id','type','sha256','status','code','appliedAt'])||!id(op.id)||seen.has(op.id)||!['recording-addition','recording-song','recording-schedule','recording-update','live-addition','live-update','material-update','original-excel'].includes(op.type)||!hash(op.sha256)||!['applied','held','deferred'].includes(op.status)||op.code!==undefined&&!/^[A-Z][A-Z_0-9]{0,79}$/.test(op.code)||op.appliedAt!==undefined&&(!Number.isFinite(op.appliedAt)||op.appliedAt<0))fail('INVALID_RESULTS');seen.add(op.id);}
  for(const s of v.sessions){if(!only(s,['id','revision','operationId','sha256','localOverrides'])||!id(s.id)||!Number.isSafeInteger(s.revision)||s.revision<1||!id(s.operationId)||!hash(s.sha256)||!Array.isArray(s.localOverrides)||s.localOverrides.length>2000)fail('INVALID_RESULTS');for(const o of s.localOverrides)if(!only(o,['targetId','field'])||!id(o.targetId)||!['title','credit','artist','recArtist','recSession','roster','blocks','lines','intro','order','sections','xlsSourceId','xlsName','xlsSheet','xls','name','kind','date','day','at','min','place','songId','memberId','scheduleTimeUnconfirmed'].includes(o.field))fail('INVALID_RESULTS');}
  if(new TextEncoder().encode(JSON.stringify(v)).byteLength>256*1024)fail('RESULTS_TOO_LARGE');return v;
 }
 function build({state,manifest,sourceSha,clientId,sequence,appVersion,outcomes={},observedAt=new Date().toISOString()}){
  const operations=manifest.operations.map(op=>{const r=state.privatePreparations?.[op.id],replacement=manifest.operations.find(next=>next.packet?.supersedes?.id===op.id&&next.packet.supersedes.sha256===op.sha256&&state.privatePreparations?.[next.id]?.sha256===next.sha256);return {id:op.id,type:op.type,sha256:op.sha256,...(r&&r.sha256===op.sha256&&r.type===op.type?{status:'applied',appliedAt:r.at}:replacement?{status:'held',code:'REC_UPDATE_SUPERSEDED'}:{status:outcomes[op.id]?.status||'deferred',code:outcomes[op.id]?.code||'WAITING'})};});
  const sessions=Object.entries(state.recordingUpdateHeads||{}).map(([id,h])=>{const localOverrides=[];for(const type of ['songs','slots'])for(const before of h.snapshot[type]){const local=(type==='songs'?state.rsongs:state.plan.slots).find(x=>x.id===before.id);for(const field of Object.keys(before))if(field!=='id'&&JSON.stringify(local?.[field])!==JSON.stringify(before[field]))localOverrides.push({targetId:before.id,field});}return {id,revision:h.revision,operationId:h.operationId,sha256:h.sha256,localOverrides};});
  return validate({app:'utacheck-preparation-results',version:1,owner:OWNER,clientId,sequence,observedAt,appVersion,source:{sha:sourceSha,revision:manifest.revision,createdAt:manifest.createdAt},operations,sessions});
 }
 async function bounded(response,active){
  if(!response.body?.getReader)fail('INVALID_RESPONSE');const reader=response.body.getReader();let size=0,parts=[];
  try{while(true){if(!active())fail('INACTIVE');const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>512*1024)fail('RESULTS_TOO_LARGE');parts.push(value);}}catch(e){try{await reader.cancel();}catch(_){}throw e;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){fail('INVALID_RESPONSE');}
 }
 async function write({report,token,fetch:http=root.fetch,isActive=()=>true,signal,beforeWrite=async()=>true}={}){
  let timer;const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();timer=setTimeout(abort,30000);
  const active=()=>!controller.signal.aborted&&isActive()===true;
  try{
   validate(report);if(typeof token!=='string'||!token||token.length>8192||/[\x00-\x20\x7f]/.test(token))fail('NO_RESULT_CREDENTIAL');
   const request=async(url,method='GET',body,missing=false)=>{if(!active())fail('INACTIVE');const r=await http(url,{method,redirect:'error',cache:'no-store',credentials:'omit',signal:controller.signal,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!active())fail('INACTIVE');if(r.redirected||r.url&&r.url!==url)fail('INVALID_RESPONSE');if(missing&&r.status===404)return null;if(!r.ok)fail('HTTP_'+r.status);return bounded(r,active);};
   const user=await request('https://api.github.com/user');if(user.login!==OWNER)fail('OWNER_MISMATCH');
   const repo=await request(BASE);if(repo.private!==true||repo.full_name!==OWNER+'/'+REPO||repo.owner?.login!==OWNER)fail('REPOSITORY_MISMATCH');
   const path='utacheck/results/'+report.clientId+'.json',url=BASE+'/contents/'+path;
   const decode=file=>{if(!file||file.type!=='file'||file.path!==path||file.encoding!=='base64'||!/^[a-f0-9]{40}$/.test(file.sha)||file.size>256*1024)fail('INVALID_RESPONSE');try{return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0)))));}catch(_){fail('INVALID_RESULTS');}};
   const old=await request(url+'?ref=main','GET',undefined,true),oldReport=old?decode(old):null;
   if(oldReport&&oldReport.sequence>=report.sequence){if(JSON.stringify(oldReport)!==JSON.stringify(report))fail('RESULT_SEQUENCE_CONFLICT');return {status:'confirmed',path,sequence:report.sequence};}
   const bytes=new TextEncoder().encode(JSON.stringify(report)),content=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
   if(!await beforeWrite()||!active())fail('INACTIVE');
   await request(url,'PUT',{message:'Record private REC application result',branch:'main',content,...(old?{sha:old.sha}:{})});
   const verified=decode(await request(url+'?ref=main'));if(JSON.stringify(verified)!==JSON.stringify(report))fail('RESULT_SAVE_UNVERIFIED');
   return {status:'confirmed',path,sequence:report.sequence};
  }catch(e){return {status:'pending',code:e.resultCode||(controller.signal.aborted?'TIMEOUT':'FETCH_FAILED')};}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 async function relayReport({report,token,fetch:http=root.fetch,isActive=()=>true,signal}={}){
  const url='https://shinkou-secure.onrender.com/utacheck/results',controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,30000),active=()=>!controller.signal.aborted&&isActive()===true;
  try{
   validate(report);if(!active()||typeof token!=='string'||!token||token.length>8192||/[\x00-\x20\x7f]/.test(token))fail('INACTIVE');
   const r=await http(url,{method:'POST',redirect:'error',cache:'no-store',credentials:'omit',signal:controller.signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(report)});
   if(!active()||r.redirected||r.url&&r.url!==url)fail('INACTIVE');const result=await bounded(r,active);
   if(!r.ok||result.status!=='confirmed')return {status:'pending',code:/^[A-Z][A-Z_0-9]{0,79}$/.test(result.code||'')?result.code:'RESULT_RELAY_UNAVAILABLE'};
   const path='utacheck/results/'+report.clientId+'.json';if(result.path!==path||result.sequence!==report.sequence)fail('RESULT_SAVE_UNVERIFIED');
   return {status:'confirmed',path,sequence:report.sequence};
  }catch(e){return {status:'pending',code:e.resultCode||(controller.signal.aborted?'TIMEOUT':'FETCH_FAILED')};}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 const api=Object.freeze({validate,build,write,relayReport});if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PreparationResults=api;
})(typeof globalThis!=='undefined'?globalThis:this);
