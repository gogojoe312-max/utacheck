/* Private preparation reception uses the existing GitHub login only. */
(function(root){
 'use strict';
 const config=Object.freeze({owner:'gogojoe312-max',repo:'shinkou-data'});
 let running=false,applying=false,lastAttempt=0,status={kind:'waiting'},started=false;
 const failure=code=>Object.assign(new Error(code),{preparationCode:code});
 function ready(){return typeof S!=='undefined'&&startupPhase==='ready'&&booted&&!bootErr&&recordingInboxCanWrite()&&!document.hidden&&!VIEW()&&!preview&&!previewLoading&&!REC&&!recordingStartPending&&!recordingFinalizePending&&!pitchStartPending&&!PT.on&&!micStream
  &&!(S.plan?.slots||[]).some(x=>x.a0!=null&&x.a1==null)&&!saving&&!syncing&&!manualSync&&!backupInFlight&&!publishInFlight&&!recordingInboxWriters&&!U.busy&&!U.importing&&!U.sheet&&!U.menu&&!U.showRecovery&&!typingNow()&&!renderPointers.size&&Date.now()>=scrollingUntil
  &&!(recordingInboxIntegration?.gate?.activeEditors||recordingInboxIntegration?.gate?.applying)
  &&!(typeof RecordingScheduleUI!=='undefined'&&RecordingScheduleUI.isApplying());}
 function statusText(){
  if(status.kind==='applied')return '本人用の準備を受信し、この端末への保存を確認しました。';
  if(status.kind==='current')return '本人用の準備は、この端末に反映済みです。';
  if(status.kind==='checking')return '本人用の準備を確認しています…';
  if(status.kind==='deferred')return '録音・入力が終わってから、本人用の準備を自動で反映します。';
  if(status.kind==='missing-token')return '本人用の自動受信は未接続です。この端末のGitHub接続を確認する必要があります。';
  if(status.kind==='access')return '本人用の準備をまだ受信できません。既存のGitHub接続では非公開の保存先を確認できませんでした。';
  if(status.kind==='conflict')return '準備資料と現在の曲・予定の対応を確認できず、反映を止めています。現在の記録は保持しています。';
  if(status.kind==='owner-required')return '安全な編集状態を確認するため、ほかの歌チェックを閉じて、この画面を開き直してください。';
  if(status.kind==='multiple-windows')return 'ほかの歌チェックの画面を閉じてから、この画面を開き直してください。現在の記録は保持しています。';
  if(status.kind==='unsupported')return 'このブラウザでは安全な自動反映を確認できません。現在の記録は保持しています。';
  if(status.kind==='unverified')return '準備資料の保存後確認が必要です。アプリを開き直してください。';
  if(status.kind==='offline')return '本人用の準備を受信できません。接続が戻ったら再確認します。';
  return '本人用の準備を、録音・入力をしていないときに自動で確認します。';
 }
 function setStatus(value){status=value;document.querySelectorAll?.('[data-private-preparation-status]').forEach(el=>el.textContent=statusText());}
 function settingsHTML(){return '<p class="note" data-private-preparation-status role="status">'+h(statusText())+'</p><button class="ghost" data-act="private-preparation-check">本人用の準備を確認</button>';}
 async function singleEditorClient(){
  const controller=navigator.serviceWorker?.controller;
  if(!controller||typeof MessageChannel!=='function')throw failure('DEFERRED');
  const url=new URL(controller.scriptURL),expected=new URL('./sw.js',location.href);
  if(url.origin!==expected.origin||url.pathname!==expected.pathname)throw failure('UNSUPPORTED');
  const nonce=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const channel=new MessageChannel();
  try{return await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{reject(failure('DEFERRED'));},5000);
   channel.port1.onmessage=event=>{const value=event.data;if(value?.type!=='utacheck-private-preparation-client-check-v1'||value.nonce!==nonce)return;
    clearTimeout(timer);if(navigator.serviceWorker.controller!==controller)return reject(failure('DEFERRED'));resolve(value.single===true);};
   try{controller.postMessage({type:'utacheck-private-preparation-client-check-v1',nonce},[channel.port2]);}catch(_){clearTimeout(timer);reject(failure('DEFERRED'));}
  });}finally{channel.port1.close();channel.port2.close();}
 }
 async function establishOwner(){
  if(recordingInboxProfileRequired)return !!recordingInboxOwner?.canWrite;
  if(!navigator.locks||typeof navigator.locks.request!=='function')throw failure('UNSUPPORTED');
  if(!ready())throw failure('DEFERRED');
  if(!await singleEditorClient())throw failure('MULTIPLE_WINDOWS');
  if(!ready())throw failure('DEFERRED');
  const original=JSON.stringify(S),packed=JSON.stringify(packState(S));
  const prior=await Promise.all([idbGet('state:0'),idbGet('state:1')]);
  if(!ready()||JSON.stringify(S)!==original||Math.max(...prior.map(x=>x?.seq||0))>saveSeq)throw failure('LOCAL_SAVE_UNCONFIRMED');
  await saveNow();
  if(saveErr||!ready()||JSON.stringify(S)!==original||await loadRaw()!==packed)throw failure('LOCAL_SAVE_UNCONFIRMED');
  if(!ready()||JSON.stringify(S)!==original)throw failure('DEFERRED');
  const app=document.getElementById('app');if(app)app.inert=true;
  // Existing tabs already understand this durable writer marker and deny writes
  // on storage notification. Acquire the same lifetime lock before any merge.
  let marked=false;
  try{
   localStorage.setItem(recordingInboxWriterKey,'1');marked=true;recordingInboxProfileRequired=true;
   if(!await singleEditorClient())throw failure('MULTIPLE_WINDOWS');
   await initializeRecordingInboxOwner();
   if(!recordingInboxOwner?.canWrite)throw failure('OWNER_REQUIRED');
   return true;
  }catch(error){
   if(marked&&!recordingInboxOwner?.canWrite){recordingInboxStale=true;recordingInboxOwnerUI();if(error.preparationCode!=='MULTIPLE_WINDOWS')throw failure('OWNER_REQUIRED');}
   throw error;
  }finally{if(app)app.inert=!recordingInboxCanWrite();}
 }
 async function applyOne(operation,token){
  if(!ready()||S.ghToken!==token)throw failure('DEFERRED');
  const receipt=S.privatePreparations?.[operation.id];
  if(receipt){if(receipt.sha256!==operation.sha256||receipt.type!==operation.type)throw failure('OPERATION_ID_REUSED');return false;}
  const gate=recordingInboxIntegration?.gate,releaseGate=gate?.acquire();if(!releaseGate)throw failure('DEFERRED');
  let release,committed=false;applying=true;const app=document.getElementById('app');if(app)app.inert=true;
  try{
   // ready() checks for no admitted writers before this operation is admitted.
   release=recordingInboxAdmitWriter();
   await saveNow();if(saveErr)throw failure('LOCAL_SAVE_UNCONFIRMED');
   const original=JSON.stringify(S),revision=stateRevision,view=JSON.stringify(U);
   const selectedSongId=!S.recMode && typeof song==='function' ? song()?.id : null;
   const next=PrivatePreparation.apply(S,operation,{schedule:RecordingScheduleUpdate.apply,recording:mergeRecordingAddition}).state;
   const active=()=>startupPhase==='ready'&&recordingInboxCanWrite()&&recordingInboxOwner?.canWrite&&!document.hidden&&S.ghToken===token&&stateRevision===revision&&JSON.stringify(S)===original&&JSON.stringify(U)===view&&!REC&&!recordingStartPending&&!recordingFinalizePending&&!pitchStartPending&&!saving&&!syncing&&!manualSync&&!backupInFlight&&!publishInFlight&&!U.busy&&!U.importing&&!U.sheet&&!U.menu&&!U.showRecovery;
   const slots=await Promise.all([idbGet('state:0'),idbGet('state:1')]),hold=await idbGet('recovery:network-hold:v1'),legacy=localStorage.getItem(KEY);
   if(!active())throw failure('DEFERRED');
   const nextRaw=JSON.stringify(packState(next));recoveryValidateCloudState(JSON.parse(nextRaw));
   const stored=await RecoveryDeliveryStore.commit({database:()=>DB,hash:backupDigest,isActive:active,readLegacy:()=>localStorage.getItem(KEY),expectedLegacyRaw:legacy,
    expectedSlotsRaw:JSON.stringify(slots),expectedHoldRaw:JSON.stringify(hold),allowMissingHold:true,originalStateRaw:original,nextStateRaw:nextRaw,remoteCopies:[]});
   committed=stored.committed===true;
   if(stored.status!=='committed'||!active())throw failure(committed?'SAVE_UNVERIFIED':'LOCAL_SAVE_UNCONFIRMED');
   S=next;saveSeq=stored.seq;stateRevision++;saveDirty=false;savePend=null;
   if(selectedSongId && typeof SONGS==='function'){const selectedIndex=SONGS().findIndex(x=>x.id===selectedSongId);if(selectedIndex>=0)U.songIdx=selectedIndex;}
   U.recScheduleInputUntil=Date.now()+2000;render();return true;
  }catch(error){if(committed){startupPhase='blocked';setStatus({kind:'unverified'});throw failure('SAVE_UNVERIFIED');}throw error;}
  finally{release?.();releaseGate();applying=false;if(app)app.inert=!recordingInboxCanWrite();}
 }
 async function receive(force=false){
  if(running)return {status:'busy'};
  if(!ready()){if(force)setStatus({kind:'deferred'});return {status:'deferred'};}
  if(!force&&Date.now()-lastAttempt<60000)return {status:'throttled'};
  lastAttempt=Date.now();running=true;const token=S.ghToken;
  try{
   if(!token){setStatus({kind:'missing-token'});return {status:'missing-token'};}
   setStatus({kind:'checking'});
   const source=await PrivatePreparationSource.read({...config,token,isActive:()=>startupPhase==='ready'&&!document.hidden&&recordingInboxCanWrite()&&S.ghToken===token});
   if(source.status!=='ready'){
    const code=source.code;setStatus({kind:code==='MISSING_TOKEN'?'missing-token':['OWNER_MISMATCH','REPOSITORY_NOT_PRIVATE','REPOSITORY_MISMATCH','HTTP_401','HTTP_403','HTTP_404'].includes(code)?'access':code==='UNSUPPORTED'?'unsupported':'offline',code});
    return {status:status.kind,code};
   }
   const manifest=await PrivatePreparation.validate(source.manifest,config.owner);
   if(!ready()||S.ghToken!==token)throw failure('DEFERRED');
   const pending=manifest.operations.filter(op=>!S.privatePreparations?.[op.id]||S.privatePreparations[op.id].sha256!==op.sha256||S.privatePreparations[op.id].type!==op.type);
   if(!pending.length){setStatus({kind:'current',sourceSha:source.sourceSha});return {status:'current'};}
   await establishOwner();if(S.ghToken!==token)throw failure('DEFERRED');
   let count=0;
   for(const operation of pending){if(await applyOne(operation,token))count++;}
   setStatus({kind:count?'applied':'current',count,sourceSha:source.sourceSha});return {status:status.kind,count};
  }catch(error){const code=error.preparationCode||error.code||'PREPARATION_CONFLICT';
   setStatus({kind:code==='DEFERRED'?'deferred':code==='MULTIPLE_WINDOWS'?'multiple-windows':code==='OWNER_REQUIRED'?'owner-required':code==='UNSUPPORTED'?'unsupported':code==='SAVE_UNVERIFIED'?'unverified':'conflict',code});return {status:status.kind,code};
  }finally{running=false;}
 }
 // Inert blocks ordinary input; the capture guard also covers programmatic
 // clicks during the short state-only transaction without altering app handlers.
 for(const name of ['click','input','change','keydown','submit','pointerdown','drop'])document.addEventListener(name,event=>{if(applying){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('click',event=>{if(!event.target.closest?.('[data-act="private-preparation-check"]'))return;event.preventDefault();event.stopImmediatePropagation();void receive(true);},true);
 function start(){if(started)return;started=true;setInterval(()=>{void receive();},10000);setTimeout(()=>{void receive();},1200);navigator.serviceWorker?.addEventListener?.('controllerchange',()=>{lastAttempt=0;void receive();});window.addEventListener('online',()=>{lastAttempt=0;void receive();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastAttempt=0;void receive();}});}
 root.PrivatePreparationUI=Object.freeze({settingsHTML,receive,start,isApplying:()=>applying,getStatus:()=>({...status})});start();
})(globalThis);

