/* Immutable restore points in the existing private IndexedDB. No remote target,
 * credential, sharing setting, clip or old restore point is created/deleted. */
(function(root){
 'use strict';
 const PREFIX='preserved:before-edit:v1:';
 const failure=code=>Object.assign(new Error(code),{backupCode:code});
 function create(deps){
  let running=null,last=null;
  const unchanged=original=>deps.unchanged ? deps.unchanged(original) : deps.snapshot()===original;
  async function preserve(reason){
   if(!deps.active())throw failure('BACKUP_BUSY');
   const original=deps.snapshot();
   if(last&&unchanged(last.original))return last.result;
   const digest=await deps.hash(original),key=PREFIX+digest;
   if(!deps.active()||!unchanged(original))throw failure('BACKUP_CHANGED');
   const existing=await deps.read(key);
   if(existing!==undefined){
    if(existing?.digest!==digest||await deps.decode(existing.backup)!==original)throw failure('BACKUP_CONFLICT');
   }else{
    const backup=await deps.encode(original);
    if(!deps.active()||!unchanged(original))throw failure('BACKUP_CHANGED');
    const value={app:'utacheck-before-edit',version:1,digest,at:Date.now(),reason,backup};
    // The store adapter must use add, never put, so concurrent originals survive.
    await deps.add(key,value);
    const saved=await deps.read(key);
    if(saved?.digest!==digest||await deps.decode(saved.backup)!==original)throw failure('BACKUP_UNVERIFIED');
   }
   if(!deps.active()||!unchanged(original))throw failure('BACKUP_CHANGED');
   const result={key,digest};last={original,result};return result;
  }
  return Object.freeze({checkpoint(reason='edit'){
   if(running)return running;
   running=preserve(reason);return running.finally(()=>{running=null;});
  }});
 }
 const api=Object.freeze({create,PREFIX});
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.VerifiedEditBackup=api;
})(typeof globalThis==='object'?globalThis:this);
