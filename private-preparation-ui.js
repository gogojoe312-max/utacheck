/* Private preparation reads use a verified, device-local credential or the existing login. */
(function(root){
 'use strict';
 const config=Object.freeze({owner:'gogojoe312-max',repo:'shinkou-data'});
 const credentialKey='private-preparation:read-credential:v1';
 let credentialLoaded=false,dedicatedToken=null,connectionBlocked=false,connectionPending=false;
 const sourceToken=()=>dedicatedToken||S.ghToken;
 const validReadToken=token=>typeof token==='string'&&/^github_pat_[A-Za-z0-9_]{20,300}$/.test(token);
 async function loadCredential(){
  if(credentialLoaded)return;
  const record=await idbGet(credentialKey);
  if(record!==undefined&&record!==null){
   if(record.version!==1||record.owner!==config.owner||record.repo!==config.repo||!validReadToken(record.token))throw failure('CREDENTIAL_UNREADABLE');
   dedicatedToken=record.token;
  }
  credentialLoaded=true;
 }
 let running=false,applying=false,lastAttempt=0,status={kind:'waiting'},started=false,manualPending=false,interactionRetry=null;
 const failure=code=>Object.assign(new Error(code),{preparationCode:code});
 function waitingReason(){
  if(connectionBlocked)return 'connection';
  if(typeof S==='undefined'||startupPhase!=='ready'||!booted||bootErr)return 'startup';
  if(!recordingInboxCanWrite())return 'readonly';
  if(document.hidden)return 'hidden';
  if(VIEW()||preview||previewLoading)return 'preview';
  if(REC||recordingStartPending||recordingFinalizePending)return 'recording';
  if(pitchStartPending||PT.on||micStream)return 'microphone';
  if(saving||syncing||manualSync||backupInFlight||publishInFlight||recordingInboxWriters)return 'saving';
  if(U.importing||U.busy)return 'importing';
  if(U.sheet||typingNow())return 'editing';
  if(U.menu)return 'menu';
  if(U.showRecovery)return 'recovery';
  if(renderPointers.size||Date.now()<scrollingUntil)return 'interaction';
  if(recordingInboxIntegration?.gate?.activeEditors||recordingInboxIntegration?.gate?.applying)return 'editor';
  if(typeof RecordingScheduleUI!=='undefined'&&RecordingScheduleUI.isApplying())return 'schedule';
  return '';
 }
 function ready(){return !waitingReason();}
 function waitingText(reason){
  const messages={
   connection:'接続の保存結果を確認できません。アプリを開き直してください。',
   startup:'アプリの起動と保存確認を待っています。',readonly:'この画面の編集権限を確認できず、更新を待っています。',
   hidden:'アプリを開いているときに更新を確認します。',preview:'本人用の編集画面に戻ると更新を確認します。',
   recording:'録音が終わると更新を確認します。',microphone:'マイクを使用する機能が終わると更新を確認します。',
   saving:'保存・配信処理が終わると更新を確認します。',importing:'ファイルの取り込み・処理が終わると更新を確認します。',
   editing:'入力中の画面を保存して閉じると更新を確認します。',menu:'開いているメニューを閉じると更新を確認します。',
   recovery:'復旧画面を閉じると更新を確認します。',interaction:'画面の操作が落ち着くと更新を確認します。',
   editor:'編集中の処理が終わると更新を確認します。',schedule:'進行表の保存が終わると更新を確認します。'
  };
  return messages[reason]||'更新を反映できる状態になるのを待っています。';
 }
 function sourceFailureText(){
  const stage={identity:'GitHubの本人確認',repository:'非公開の保存先の確認',contents:'更新ファイルの確認',blob:'更新ファイル本体の読取'}[status.stage];
  const reasons={
   HTTP_401:'保存済みのGitHub接続を受け付けてもらえませんでした（401）。',
   HTTP_403:'GitHubに拒否されました（403）。アクセスの条件または一時的な制限を確認できません。',
   HTTP_404:'対象が見つからないか、この接続からは読み取れません（404）。',
   HTTP_429:'GitHubの利用制限により停止しました（429）。',
   OWNER_MISMATCH:'保存済みの接続が、予定された本人アカウントと一致しません。',
   REPOSITORY_NOT_PRIVATE:'予定された非公開の保存先であることを確認できません。',
   REPOSITORY_MISMATCH:'保存先の識別情報が予定と一致しません。',
   INVALID_CONFIG:'この端末に保存された接続設定の形式を確認できません。',
   TIMEOUT:'応答を待つ時間を超えました。接続が戻ってから再確認してください。',
   FETCH_FAILED:'通信が完了しませんでした。ネットワークまたはブラウザ側で止まった可能性があります。',
   ABORTED:'確認が中断されました。',
   INACTIVE:'確認中に端末の状態が変わったため停止しました。'
  };
  const reason=Object.prototype.hasOwnProperty.call(reasons,status.code)?reasons[status.code]:(/^HTTP_5[0-9]{2}$/.test(status.code||'')?'GitHub側でエラーが発生しました。時間をおいて再確認してください。':'受信内容を安全に確認できなかったため停止しました。');
  return 'dot経由の更新をまだ受信できません。'+(stage?stage+'：':'')+reason+' 現在の記録と接続情報は保持しています。';
 }
 function statusText(){
  if(status.kind==='connected')return 'dotの読み取り接続を保存しました。更新を自動で確認します。';
  if(status.kind==='connection-error')return '接続を保存できませんでした。アプリを開き直して確認してください。';
  if(status.kind==='invalid-read-token')return 'GitHubで作成した読み取り専用の fine-grained token を入力してください。';
  if(status.kind==='applied')return 'dot経由の更新をこの端末へ保存しました。クラウドバックアップ・メンバー配信は別に確認してください。';
  if(status.kind==='current')return 'dot経由の更新は、この端末に反映済みです。';
  if(status.kind==='checking')return 'dot経由の更新を確認しています…';
  if(status.kind==='active-plan')return '進行中の枠が残っているため、予定の反映を待っています。実際には未開始なら、その枠の「その他」から開始状態だけ解除できます。';
  if(status.kind==='deferred')return waitingText(status.reason);
  if(status.kind==='missing-token')return '本人用の自動受信は未接続です。この端末のGitHub接続を確認する必要があります。';
  if(status.kind==='access')return sourceFailureText();
  if(status.kind==='conflict')return '更新内容と現在の曲・予定の対応を確認できず、反映を止めています。現在の記録は保持しています。';
  if(status.kind==='owner-required')return '安全な編集状態を確認するため、ほかの歌チェックを閉じて、この画面を開き直してください。';
  if(status.kind==='multiple-windows')return 'ほかの歌チェックの画面を閉じてから、この画面を開き直してください。現在の記録は保持しています。';
  if(status.kind==='unsupported')return 'このブラウザでは安全な自動反映を確認できません。現在の記録は保持しています。';
  if(status.kind==='unverified')return '更新内容の保存後確認が必要です。アプリを開き直してください。';
  if(status.kind==='offline')return sourceFailureText();
  return 'dot経由の更新を、録音・入力をしていないときに自動で確認します。';
 }
 function setStatus(value){
  status=value;document.querySelectorAll?.('[data-private-preparation-status]').forEach(el=>el.textContent=statusText());
 }
 function settingsHTML(){
  return '<button class="ghost" data-act="private-preparation-check">dot経由で更新する</button><p class="note" data-private-preparation-status role="status">'+h(statusText())+'</p>'
   +'<button class="ghost" data-act="private-preparation-setup">dotの接続設定</button>';
 }
 function openConnection(){
  if(document.querySelector('[data-private-preparation-connection]'))return;
  const dialog=document.createElement('dialog');
  dialog.setAttribute('data-private-preparation-connection','');dialog.setAttribute('aria-label','dotの接続設定');
  dialog.style.cssText='width:440px;max-width:calc(100vw - 24px);box-sizing:border-box;max-height:90dvh;overflow:auto;background:#1e1f23;color:#eee;border:1px solid #40434b;border-radius:18px;padding:20px;';
  const tokenURL='https://github.com/settings/personal-access-tokens/new?name=utacheck-dot-read&target_name=gogojoe312-max&contents=read&expires_in=90';
  dialog.innerHTML='<h3>dotの接続設定</h3><button class="ghost" data-private-preparation-close>閉じる</button>'
   +'<p class="note">読み取り先：gogojoe312-max / shinkou-data</p>'
   +'<p class="note"><a href="'+tokenURL+'" target="_blank" rel="noopener noreferrer">GitHubで読み取り用キーを作る</a></p>'
   +'<p class="note">Repository access は「Only select repositories」で shinkou-data だけを選び、Contents は「Read-only」にしてください。</p>'
   +'<label>読み取り用キー<input type="password" data-private-preparation-token autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="github_pat_…" style="display:block;width:100%;box-sizing:border-box"></label>'
   +'<button class="ghost" data-act="private-preparation-connect">接続を確認して保存</button>'
   +'<p class="note" data-private-preparation-status role="status"></p>'
   +'<p class="note">キーはこの端末に保存します。メンバー配信の接続は保持します。</p>';
  dialog.querySelector('[data-private-preparation-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.querySelector('[data-private-preparation-token]').value='';dialog.remove();});
  document.body.append(dialog);dialog.showModal();
 }
 async function connectReadCredential(candidate,isOpen=()=>true){
  if(running)return {status:'busy'};
  const token=typeof candidate==='string'?candidate.trim():'';
  if(!validReadToken(token)){setStatus({kind:'invalid-read-token'});return {status:'invalid-read-token'};}
  if(!ready()){setStatus({kind:'deferred',reason:waitingReason()});return {status:'deferred'};}
  running=true;let release,releaseGate,writeAttempted=false;
  try{
   await loadCredential();
   const before=JSON.stringify(S),previous=sourceToken();
   const active=()=>isOpen()&&ready()&&JSON.stringify(S)===before&&sourceToken()===previous;
   setStatus({kind:'checking'});
   const result=await PrivatePreparationSource.read({...config,token,isActive:active});
   if(result.status!=='ready'){
    const code=result.code,stage=['identity','repository','contents','blob'].includes(result.stage)?result.stage:undefined;
    setStatus({kind:'access',code,stage});return {status:'access',code};
   }
   await PrivatePreparation.validate(result.manifest,config.owner);
   if(!active())throw failure('DEFERRED');
   await establishOwner();
   if(!active())throw failure('DEFERRED');
   releaseGate=recordingInboxIntegration?.gate?.acquire();
   if(!releaseGate)throw failure('DEFERRED');
   release=recordingInboxAdmitWriter();applying=true;
   const record={version:1,owner:config.owner,repo:config.repo,token};
   writeAttempted=true;
   await idbPut(credentialKey,record);
   const saved=await idbGet(credentialKey);
   if(JSON.stringify(saved)!==JSON.stringify(record))throw failure('CREDENTIAL_UNVERIFIED');
   dedicatedToken=token;credentialLoaded=true;lastAttempt=0;
   setStatus({kind:'connected'});return {status:'connected'};
  }catch(error){
   if(writeAttempted)connectionBlocked=true;
   const code=error?.preparationCode;
   setStatus({kind:writeAttempted?'connection-error':code==='CREDENTIAL_UNREADABLE'?'connection-error':code==='DEFERRED'?'deferred':code==='MULTIPLE_WINDOWS'?'multiple-windows':code==='OWNER_REQUIRED'?'owner-required':code==='UNSUPPORTED'?'unsupported':'connection-error',reason:waitingReason()});
   return {status:status.kind};
  }finally{release?.();releaseGate?.();applying=false;running=false;}
 }

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
  const durableBefore=await loadRaw();
  if(saveErr||!ready()||JSON.stringify(S)!==original||typeof durableBefore!=='string')throw failure('LOCAL_SAVE_UNCONFIRMED');
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
   if(await loadRaw()!==durableBefore||JSON.stringify(S)!==original)throw failure('LOCAL_SAVE_UNCONFIRMED');
   if(durableBefore!==packed){
    // Boot may add defaults to an older state. Persist them only after acquiring
    // the exclusive writer and verifying a recoverable pre-edit checkpoint.
    if(!await automaticBackupBeforeEdit('private-preparation-owner'))throw failure('LOCAL_SAVE_UNCONFIRMED');
    if(!ready()||JSON.stringify(S)!==original)throw failure('DEFERRED');
    save();await saveNow();
    if(saveErr||JSON.stringify(S)!==original||await loadRaw()!==packed)throw failure('LOCAL_SAVE_UNCONFIRMED');
   }
   return true;
  }catch(error){
   if(marked&&!recordingInboxOwner?.canWrite){recordingInboxStale=true;recordingInboxOwnerUI();if(error.preparationCode!=='MULTIPLE_WINDOWS')throw failure('OWNER_REQUIRED');}
   throw error;
  }finally{if(app)app.inert=!recordingInboxCanWrite();}
 }
 async function applyOne(operation,token,sourceSha,localSource){
  if(!ready()||sourceToken()!==token)throw failure('DEFERRED');
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
   const active=()=>startupPhase==='ready'&&recordingInboxCanWrite()&&recordingInboxOwner?.canWrite&&!document.hidden&&sourceToken()===token&&stateRevision===revision&&JSON.stringify(S)===original&&JSON.stringify(U)===view&&!REC&&!recordingStartPending&&!recordingFinalizePending&&!pitchStartPending&&!saving&&!syncing&&!manualSync&&!backupInFlight&&!publishInFlight&&!U.busy&&!U.importing&&!U.sheet&&!U.menu&&!U.showRecovery;
   const slots=await Promise.all([idbGet('state:0'),idbGet('state:1')]),hold=await idbGet('recovery:network-hold:v1'),legacy=localStorage.getItem(KEY);
   if(!active())throw failure('DEFERRED');
   if(localSource){
    // Keep the immutable, selected bytes as the source of truth. Never read a
    // remote source or acquire credentials for an explicitly local import.
    if(operation.type!=='recording-song'||await PrivatePreparation.digest(localSource.raw)!==localSource.sha256)throw failure('PREPARATION_SOURCE_CHANGED');
    const fresh=await PrivatePreparation.validate(JSON.parse(localSource.raw),config.owner);
    const matched=fresh.operations.find(op=>op.id===operation.id);
    if(!matched||JSON.stringify(matched)!==JSON.stringify(operation))throw failure('PREPARATION_SOURCE_CHANGED');
    if(!active())throw failure('DEFERRED');
   }else if(operation.type==='material-update'||operation.type==='recording-song'){
    const fresh=await PrivatePreparationSource.read({...config,token,isActive:active});
    if(fresh.status!=='ready'||fresh.sourceSha!==sourceSha)throw failure('PREPARATION_SOURCE_CHANGED');
    await PrivatePreparation.validate(fresh.manifest,config.owner);
    if(!active())throw failure('DEFERRED');
   }
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
  if(connectionPending)return {status:'busy'};
  if(force)manualPending=true;
  if(running)return {status:'busy'};
  const reason=waitingReason();
  if(reason){
   if(manualPending){
    setStatus({kind:'deferred',reason});
    if(reason==='interaction'&&!interactionRetry)interactionRetry=setTimeout(()=>{interactionRetry=null;void receive();},180);
   }
   return {status:'deferred',reason};
  }
  if(!manualPending&&Date.now()-lastAttempt<60000)return {status:'throttled'};
  manualPending=false;lastAttempt=Date.now();running=true;let token;
  try{
   await loadCredential();token=sourceToken();
   if(!token){setStatus({kind:'missing-token'});return {status:'missing-token'};}
   setStatus({kind:'checking'});
   const source=await PrivatePreparationSource.read({...config,token,isActive:()=>startupPhase==='ready'&&!document.hidden&&recordingInboxCanWrite()&&sourceToken()===token});
   if(source.status!=='ready'){
    const code=source.code,stage=['identity','repository','contents','blob'].includes(source.stage)?source.stage:undefined;setStatus({kind:code==='MISSING_TOKEN'?'missing-token':['OWNER_MISMATCH','REPOSITORY_NOT_PRIVATE','REPOSITORY_MISMATCH','HTTP_401','HTTP_403','HTTP_404'].includes(code)?'access':code==='UNSUPPORTED'?'unsupported':'offline',code,stage});
    return {status:status.kind,code};
   }
   const manifest=await PrivatePreparation.validate(source.manifest,config.owner);
   if(!ready()||sourceToken()!==token)throw failure('DEFERRED');
   const activePlan=(S.plan?.slots||[]).some(x=>x.a0!=null&&x.a1==null);
   const unapplied=manifest.operations.filter(op=>!S.privatePreparations?.[op.id]||S.privatePreparations[op.id].sha256!==op.sha256||S.privatePreparations[op.id].type!==op.type);
   // Lyrics-only additions preserve the active plan, selected song and recordings.
   // All older operations retain their existing active-plan deferral.
   const eligible=unapplied.filter(op=>!activePlan||op.type==='recording-song');
   const additions=eligible.filter(op=>op.type==='recording-song');
   const pending=additions.length?additions:eligible;
   if(unapplied.length&&!pending.length){setStatus({kind:'active-plan'});return {status:'deferred'};}
   if(!pending.length){setStatus({kind:'current',sourceSha:source.sourceSha});return {status:'current'};}
   await establishOwner();if(sourceToken()!==token)throw failure('DEFERRED');
   let count=0;
   for(const operation of pending){if(await applyOne(operation,token,source.sourceSha))count++;}
   setStatus({kind:count?'applied':'current',count,sourceSha:source.sourceSha});return {status:status.kind,count};
  }catch(error){const code=error.preparationCode||error.code||'PREPARATION_CONFLICT';
   setStatus({kind:code==='CREDENTIAL_UNREADABLE'?'connection-error':code==='DEFERRED'?'deferred':code==='MULTIPLE_WINDOWS'?'multiple-windows':code==='OWNER_REQUIRED'?'owner-required':code==='UNSUPPORTED'?'unsupported':code==='SAVE_UNVERIFIED'?'unverified':'conflict',code,reason:code==='DEFERRED'?waitingReason():undefined});return {status:status.kind,code};
  }finally{running=false;}
 }
 async function importFile(file){
  if(running)return {status:'busy'};
  if(!ready()){setStatus({kind:'deferred',reason:waitingReason()});return {status:'deferred'};}
  running=true;const token=sourceToken();
  try{
   if(!file||typeof file.text!=='function'||!Number.isSafeInteger(file.size)||file.size<1||file.size>20*1024*1024)throw failure('INVALID_MANIFEST');
   const raw=await file.text();
   if(typeof raw!=='string'||new TextEncoder().encode(raw).byteLength>20*1024*1024)throw failure('INVALID_MANIFEST');
   const manifest=await PrivatePreparation.validate(JSON.parse(raw),config.owner);
   // This entry point is deliberately lyrics-only: old schedules and LIVE
   // operations in an exported manifest must not run as a side effect.
   const operations=manifest.operations.filter(op=>op.type==='recording-song');
   if(!operations.length)throw failure('NO_RECORDING_SONGS');
   if(!ready()||sourceToken()!==token)throw failure('DEFERRED');
   let candidate=S;const pending=[];
   for(const op of operations){const result=PrivatePreparation.apply(candidate,op);candidate=result.state;if(result.status!=='already-applied')pending.push(op);}
   if(!pending.length){setStatus({kind:'current'});return {status:'current'};}
   const titles=pending.map(op=>op.packet.song.title).join('、');
   if(!root.confirm('REC曲 '+pending.length+'曲（'+titles+'）をこの端末に追加します。\n既存の曲・録音・予定は保持し、ファイルは送信しません。\n追加しますか？'))return {status:'cancelled'};
   if(!ready()||sourceToken()!==token)throw failure('DEFERRED');
   const localSource=Object.freeze({raw,sha256:await PrivatePreparation.digest(raw)});
   await establishOwner();if(!ready()||sourceToken()!==token)throw failure('DEFERRED');
   let count=0;for(const op of pending)if(await applyOne(op,token,null,localSource))count++;
   // Reveal newly added artists without changing the current song or take.
   U.recArtistFilter='';render();
   setStatus({kind:'applied',count});return {status:'applied',count};
  }catch(error){const code=error.preparationCode||error.code||'PREPARATION_CONFLICT';
   setStatus({kind:code==='CREDENTIAL_UNREADABLE'?'connection-error':code==='DEFERRED'?'deferred':code==='MULTIPLE_WINDOWS'?'multiple-windows':code==='OWNER_REQUIRED'?'owner-required':code==='UNSUPPORTED'?'unsupported':code==='SAVE_UNVERIFIED'?'unverified':'conflict',code,reason:code==='DEFERRED'?waitingReason():undefined});return {status:status.kind,code};
  }finally{running=false;}
 }
 function chooseFile(){
  if(running)return;
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=()=>{if(input.files?.[0])void importFile(input.files[0]);};input.click();
 }
 // Inert blocks ordinary input; the capture guard also covers programmatic
 // clicks during the short state-only transaction without altering app handlers.
 for(const name of ['click','input','change','keydown','submit','pointerdown','drop'])document.addEventListener(name,event=>{if(applying){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('click',event=>{if(!event.target.closest?.('[data-act="private-preparation-check"]'))return;event.preventDefault();event.stopImmediatePropagation();void receive(true);},true);
 document.addEventListener('click',event=>{if(!event.target.closest?.('[data-act="private-preparation-file"]'))return;event.preventDefault();event.stopImmediatePropagation();chooseFile();},true);
 document.addEventListener('click',event=>{if(!event.target.closest?.('[data-act="private-preparation-setup"]'))return;event.preventDefault();event.stopImmediatePropagation();openConnection();},true);
 // Keep the password field focused until click captures its value. Blurring on
 // pointerdown can flush a pending app render and replace the field beforehand.
 const keepConnectionTarget=event=>{
  if(event.button!==0||event.isPrimary===false)return;
  if(event.target.closest?.('[data-act="private-preparation-connect"]')&&document.activeElement?.matches?.('[data-private-preparation-token]'))event.preventDefault();
 };
 document.addEventListener('pointerdown',keepConnectionTarget,{capture:true,passive:false});
 document.addEventListener('mousedown',keepConnectionTarget,{capture:true,passive:false});
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-act="private-preparation-connect"]');if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(connectionPending)return;
  const field=button.closest('[data-private-preparation-connection]')?.querySelector('[data-private-preparation-token]');
  const dialog=button.closest('[data-private-preparation-connection]');
  const value=field?.value||'';if(field){field.value='';field.blur();}
  // Keep the candidate only in this short-lived closure while a click, scroll
  // or preceding save settles. Do not lose it to the automatic polling timer.
  connectionPending=true;button.disabled=true;
  const tryConnect=async attempt=>{
   if(!dialog?.isConnected||!dialog.open){connectionPending=false;return;}
   const reason=waitingReason();
   if((running||reason)&&attempt<60&&!['readonly','connection','startup','preview'].includes(reason)){
    setStatus({kind:'deferred',reason:reason||'saving'});setTimeout(()=>{void tryConnect(attempt+1);},180);return;
   }
   connectionPending=false;
   try{const result=await connectReadCredential(value,()=>dialog.isConnected&&dialog.open);if(result.status==='connected')dialog.close();}finally{button.disabled=false;}
  };
  void tryConnect(0);
 },true);
 function start(){if(started)return;started=true;setInterval(()=>{void receive();},10000);setTimeout(()=>{void receive();},1200);navigator.serviceWorker?.addEventListener?.('controllerchange',()=>{lastAttempt=0;void receive();});window.addEventListener('online',()=>{lastAttempt=0;void receive();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastAttempt=0;void receive();}});}
 root.PrivatePreparationUI=Object.freeze({settingsHTML,receive,importFile,connectReadCredential,start,isApplying:()=>applying,getStatus:()=>({...status})});start();
})(globalThis);


