/* Private preparation reads use a verified, device-local credential or the existing login. */
(function(root){
 'use strict';
 const config=Object.freeze({owner:'gogojoe312-max',repo:'shinkou-data'});
 const credentialKey='private-preparation:read-credential:v1';
 let credentialLoaded=false,dedicatedToken=null,connectionBlocked=false,connectionPending=false;
 const sourceToken=()=>dedicatedToken||S.ghToken;
 let relayToken=null;
 const readSource=async options=>{
  // Once this login has reached the owned relay, avoid repeating a known
  // repository-permission failure for every operation and refresh.
  if(root.PreparationRelaySource&&options.token&&relayToken===options.token){
   const relayed=await root.PreparationRelaySource.read(options);if(relayed.status==='ready')return relayed;
   relayToken=null;return relayed;
  }
  if(dedicatedToken){const direct=await PrivatePreparationSource.read(options);if(direct.status==='ready'||!root.ProgressPreparationSource)return direct;}
  const direct=await (root.ProgressPreparationSource||PrivatePreparationSource).read(options);
  if(direct.status==='ready'||!root.PreparationRelaySource||!options.token||['ABORTED','INACTIVE','OWNER_MISMATCH','INVALID_CONFIG'].includes(direct.code))return direct;
  const relayed=await root.PreparationRelaySource.read(options);
  if(relayed.status==='ready')relayToken=options.token;
  return relayed;
 };
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
 let running=false,applying=false,lastAttempt=0,status={kind:'waiting'},started=false,manualPending=false,resumePending=false,interactionRetry=null;
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
 function queueResume(reason){
  // A local interruption has not finished this check. Resume it after the
  // interaction settles instead of applying the network polling cooldown.
  resumePending=true;
  if(!['interaction','saving','editor','schedule',''].includes(reason)||interactionRetry!==null)return;
  interactionRetry=setTimeout(()=>{interactionRetry=null;void receive();},250);
 }
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
  const stage={identity:'GitHubの本人確認',repository:'非公開の保存先の確認',contents:'更新ファイルの確認',blob:'更新ファイル本体の読取',relay:'進行アプリからの受信'}[status.stage];
  const reasons={
   PROGRESS_LOCKED:'進行アプリの保存データがロックされています。進行アプリで接続状態を確認してください。',
   PROGRESS_STORAGE_UNAVAILABLE:'進行アプリの保存内容を読めません。進行アプリと同じブラウザで開いてください。',
   PROGRESS_UNLINKED:'この端末で進行アプリの接続を確認できません。進行アプリを開いて同期してください。',
   PROGRESS_MISMATCH:'進行アプリの接続先が準備資料の保存先と一致しません。',
   RELAY_NOT_CONFIGURED:'資料を届けるサーバーの接続設定が未完了です。端末での入れ直しは不要です。',
   SOURCE_UNAVAILABLE:'資料を届けるサーバーが保存先を読み取れていません。現在の記録は保持しています。',
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
  return '進行アプリの資料をまだ受信できません。'+(stage?stage+'：':'')+reason+' 現在の記録と接続情報は保持しています。';
 }
 function statusText(){
  if(status.kind==='connected')return '進行アプリの読み取り接続を保存しました。更新を自動で確認します。';
  if(status.kind==='connection-error')return '接続を保存できませんでした。アプリを開き直して確認してください。';
  if(status.kind==='invalid-read-token')return 'GitHubで作成した読み取り専用の fine-grained token を入力してください。';
  const originals=status.originals,originalText=originals?.files?' 元Excel '+originals.files+'件を保存、'+originals.linked+'曲にリンクしました。'+(originals.unmatched?' '+originals.unmatched+'件は一致する曲がなく、原本を保管しています。':''):'';
  if(status.kind==='applied')return '進行アプリから資料を取り込みました。'+originalText+(status.conflicts?'既存の内容と重なる資料は保留しています。':'');
  if(status.kind==='current')return '進行アプリの資料は、この端末に反映済みです。'+originalText;
  if(status.kind==='checking')return '進行アプリの資料を確認しています…';
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
  return '進行アプリの資料を、録音・入力をしていないときに自動で確認します。';
 }
 function setStatus(value){
  status=value;document.querySelectorAll?.('[data-private-preparation-status]').forEach(el=>el.textContent=statusText());
 }
 function settingsHTML(){
  return '<p class="note" data-private-preparation-status role="status">'+h(statusText())+'</p>';
 }
 function openConnection(){
  if(document.querySelector('[data-private-preparation-connection]'))return;
  const dialog=document.createElement('dialog');
  dialog.setAttribute('data-private-preparation-connection','');dialog.setAttribute('aria-label','進行アプリの接続設定');
  dialog.style.cssText='width:440px;max-width:calc(100vw - 24px);box-sizing:border-box;max-height:90dvh;overflow:auto;background:#1e1f23;color:#eee;border:1px solid #40434b;border-radius:18px;padding:20px;';
  const tokenURL='https://github.com/settings/personal-access-tokens/new?name=utacheck-preparation-read&target_name=gogojoe312-max&contents=read&expires_in=90';
  dialog.innerHTML='<h3>進行アプリの接続設定</h3><button class="ghost" data-private-preparation-close>閉じる</button>'
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
 async function originalExcelPresent(packet){
  PrivatePreparation.checkOriginalExcel(packet);
  for(const file of [packet,...(packet.exportFile?[packet.exportFile]:[])]){
   const blob=await getClip('xls:sha256-'+file.sha256);
   if(!(blob instanceof Blob)||blob.size!==file.size||await startupExcelDigest(blob)!==file.sha256)return false;
  }
  return true;
 }
 async function originalTargetFingerprint(current){
  // Track matching inputs across reloads, including deliberate cell edits and
  // new performance/take copies. Notes, recordings and attachment timestamps
  // cannot change which workbook belongs to a song and do not trigger parsing.
  const keys=['id','title','artist','groupId','showId','take','xlsSourceId','sheetName','micSheet','micMap','blocks','blockCells','blockRows','roster','lines'];
  const songs=items=>(items||[]).filter(so=>!so.hidden&&Array.isArray(so.lines)&&(so.xls||so.xlsSourceId||so.sheetName||so.lines.some(line=>line.cell||line.lcell)))
   .map(so=>Object.fromEntries(keys.filter(key=>Object.prototype.hasOwnProperty.call(so,key)).map(key=>[key,so[key]])));
  return PrivatePreparation.digest({songs:songs(current.songs),rsongs:songs(current.rsongs),members:(current.members||[]).map(member=>[member.id,member.name])});
 }
 function originalSummary(manifest){
  const result={files:0,linked:0,stored:0,unmatched:0};
  for(const op of manifest.operations){const receipt=S.privatePreparations?.[op.id];
   if(op.type!=='original-excel'||receipt?.type!==op.type||receipt.sha256!==op.sha256)continue;
   result.files++;for(const key of ['linked','stored','unmatched'])if(Number.isSafeInteger(receipt[key])&&receipt[key]>=0)result[key]+=receipt[key];
  }
  return result;
 }
 async function readOriginalExcelPackets(options={}){
  const unavailable=(code,stage)=>({status:'unavailable',code,...(stage?{stage}:{})});
  if(!options||typeof options!=='object'||options.isActive!==undefined&&typeof options.isActive!=='function')return unavailable('INVALID_CONFIG');
  try{
   if(connectionBlocked)throw failure('CREDENTIAL_UNREADABLE');
   await loadCredential();const token=sourceToken();
   const active=()=>startupPhase==='ready'&&!document.hidden&&!VIEW()&&!preview&&!previewLoading&&sourceToken()===token&&(!options.isActive||options.isActive());
   if(!active())throw failure('DEFERRED');
   if(!token&&!root.ProgressPreparationSource)return unavailable('MISSING_TOKEN');
   // Exports may already own the editor gate or display a result menu. This
   // path only verifies and returns owner-only bytes; it never applies a state
   // operation, saves a receipt, closes a menu, or changes an export selection.
   const source=await readSource({...config,token,isActive:active});
   if(source.status!=='ready')return unavailable(source.code,source.stage);
   const manifest=await PrivatePreparation.validate(source.manifest,config.owner);
   if(!active())throw failure('DEFERRED');
   return {status:'ready',operations:manifest.operations.filter(op=>op.type==='original-excel'),sourceSha:source.sourceSha,sourcePath:source.sourcePath||'utacheck/prepared.json'};
  }catch(error){return unavailable(error?.preparationCode||'PREPARATION_CONFLICT');}
 }
 async function confirmOriginalSource(operation,token,sourceSha,batch,isActive){
  if(batch?.confirmed?.get(operation.id)!==JSON.stringify(operation)){
   const fresh=await readSource({...config,token,isActive});
   if(!isActive())throw failure('DEFERRED');
   if(fresh.status!=='ready'||fresh.sourceSha!==sourceSha)throw failure('PREPARATION_SOURCE_CHANGED');
   const checked=await PrivatePreparation.validate(fresh.manifest,config.owner);
   const confirmed=new Map(checked.operations.filter(op=>op.type==='original-excel').map(op=>[op.id,JSON.stringify(op)]));
   if(confirmed.get(operation.id)!==JSON.stringify(operation))throw failure('PREPARATION_SOURCE_CHANGED');
   if(batch)batch.confirmed=confirmed;
  }
  if(!isActive())throw failure('DEFERRED');
 }
 async function applyOriginalBatch(operations,token,sourceSha){
  if(!ready()||sourceToken()!==token||!operations.length)throw failure('DEFERRED');
   if(typeof prepareOriginalExcelAttachment!=='function')throw failure('UNSUPPORTED');
   const state=S,revision=stateRevision,viewState=U,original=JSON.stringify(S),view=JSON.stringify(U);
   // Parsing and immutable blob storage do not modify the editor. Let a click,
   // input or another edit interrupt this work instead of freezing the page.
   // Cheap checks run inside the song loop; complete snapshots are checked at
   // its boundaries and again under the exclusive gate before committing.
   const responsive=()=>ready()&&sourceToken()===token&&S===state&&stateRevision===revision&&U===viewState;
   const unchanged=()=>responsive()&&JSON.stringify(S)===original&&JSON.stringify(U)===view;
  let next=state;const preparedResults=[];
  for(const operation of operations){
   if(!responsive())throw failure('DEFERRED');
   const prepared=await prepareOriginalExcelAttachment(next,operation.packet,{isActive:responsive});
   next=PrivatePreparation.apply(next,operation,{originalExcel:()=>prepared}).state;
   preparedResults.push({operation,prepared});
   // Give pending pointer/input events a turn between workbooks. An input
   // invalidates the whole staged state, while verified blobs remain reusable.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!unchanged())throw failure('DEFERRED');
  const targetSha256=await originalTargetFingerprint(next);
  for(const {operation,prepared}of preparedResults)next=PrivatePreparation.apply(next,operation,{originalExcel:()=>({...prepared,state:next,targetSha256})}).state;
  const batch={};await confirmOriginalSource(operations[0],token,sourceSha,batch,responsive);
  for(const operation of operations)if(batch.confirmed.get(operation.id)!==JSON.stringify(operation))throw failure('PREPARATION_SOURCE_CHANGED');
  if(!unchanged())throw failure('DEFERRED');
  const gate=recordingInboxIntegration?.gate,releaseGate=gate?.acquire();if(!releaseGate)throw failure('DEFERRED');
  let release,committed=false;applying=true;const app=document.getElementById('app');if(app)app.inert=true;
  try{
   release=recordingInboxAdmitWriter();await saveNow();if(saveErr)throw failure('LOCAL_SAVE_UNCONFIRMED');
   const active=()=>startupPhase==='ready'&&recordingInboxCanWrite()&&recordingInboxOwner?.canWrite&&!document.hidden&&sourceToken()===token&&S===state&&stateRevision===revision&&JSON.stringify(S)===original&&JSON.stringify(U)===view&&!REC&&!recordingStartPending&&!recordingFinalizePending&&!pitchStartPending&&!saving&&!syncing&&!manualSync&&!backupInFlight&&!publishInFlight&&!U.busy&&!U.importing&&!U.sheet&&!U.menu&&!U.showRecovery;
   if(!active())throw failure('DEFERRED');
   // Recheck originals after acquiring the gate: a cleanup could run during
   // the responsive phase. The one transaction owns all links and receipts.
   for(const operation of operations)if(!await originalExcelPresent(operation.packet))throw failure('ORIGINAL_EXCEL_NOT_SAVED');
   if(!active())throw failure('DEFERRED');
   if(JSON.stringify(next)===original)return operations.length;
   const selectedSongId=!S.recMode&&typeof song==='function'?song()?.id:null;
   const slots=await Promise.all([idbGet('state:0'),idbGet('state:1')]),hold=await idbGet('recovery:network-hold:v1'),legacy=localStorage.getItem(KEY);
   const nextRaw=JSON.stringify(packState(next));recoveryValidateCloudState(JSON.parse(nextRaw));
   const stored=await RecoveryDeliveryStore.commit({database:()=>DB,hash:backupDigest,isActive:active,readLegacy:()=>localStorage.getItem(KEY),expectedLegacyRaw:legacy,
    expectedSlotsRaw:JSON.stringify(slots),expectedHoldRaw:JSON.stringify(hold),allowMissingHold:true,originalStateRaw:original,nextStateRaw:nextRaw,remoteCopies:[]});
   committed=stored.committed===true;
   if(stored.status!=='committed'||!active())throw failure(committed?'SAVE_UNVERIFIED':'LOCAL_SAVE_UNCONFIRMED');
   S=next;saveSeq=stored.seq;stateRevision++;saveDirty=false;savePend=null;
   if(selectedSongId&&typeof SONGS==='function'){const selectedIndex=SONGS().findIndex(x=>x.id===selectedSongId);if(selectedIndex>=0)U.songIdx=selectedIndex;}
   U.recScheduleInputUntil=Date.now()+2000;render();return operations.length;
  }catch(error){if(committed){startupPhase='blocked';setStatus({kind:'unverified'});throw failure('SAVE_UNVERIFIED');}throw error;}
  finally{release?.();releaseGate();applying=false;if(app)app.inert=!recordingInboxCanWrite();}
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
   const active=()=>startupPhase==='ready'&&recordingInboxCanWrite()&&recordingInboxOwner?.canWrite&&!document.hidden&&sourceToken()===token&&stateRevision===revision&&JSON.stringify(S)===original&&JSON.stringify(U)===view&&!REC&&!recordingStartPending&&!recordingFinalizePending&&!pitchStartPending&&!saving&&!syncing&&!manualSync&&!backupInFlight&&!publishInFlight&&!U.busy&&!U.importing&&!U.sheet&&!U.menu&&!U.showRecovery;
   const next=PrivatePreparation.apply(S,operation,{schedule:RecordingScheduleUpdate.apply,recording:mergeRecordingAddition}).state;
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
   }else if(root.ProgressPreparationSource||['material-update','recording-song'].includes(operation.type)){
    const fresh=await readSource({...config,token,isActive:active});
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
   if(manualPending||resumePending||Date.now()-lastAttempt>=60000){
    setStatus({kind:'deferred',reason});
    queueResume(reason);
   }
   return {status:'deferred',reason};
  }
  if(!manualPending&&!resumePending&&Date.now()-lastAttempt<60000)return {status:'throttled'};
  clearTimeout(interactionRetry);interactionRetry=null;
  manualPending=false;resumePending=false;lastAttempt=Date.now();running=true;let token;
  try{
   await loadCredential();token=sourceToken();
   if(!token&&!root.ProgressPreparationSource){setStatus({kind:'missing-token'});return {status:'missing-token'};}
   setStatus({kind:'checking'});
   const source=await readSource({...config,token,isActive:()=>startupPhase==='ready'&&!document.hidden&&recordingInboxCanWrite()&&sourceToken()===token});
   if(source.status!=='ready'){
    const code=source.code,stage=['identity','repository','contents','blob','relay'].includes(source.stage)?source.stage:undefined;setStatus({kind:code==='MISSING_TOKEN'?'missing-token':['OWNER_MISMATCH','REPOSITORY_NOT_PRIVATE','REPOSITORY_MISMATCH','HTTP_401','HTTP_403','HTTP_404'].includes(code)?'access':code==='UNSUPPORTED'?'unsupported':'offline',code,stage});
    return {status:status.kind,code};
   }
   const manifest=await PrivatePreparation.validate(source.manifest,config.owner);
   if(!ready()||sourceToken()!==token)throw failure('DEFERRED');
   const activeSlots=(S.plan?.slots||[]).filter(x=>x.a0!=null&&x.a1==null),activePlan=activeSlots.length>0;
   const unapplied=[],targetSha256=manifest.operations.some(op=>op.type==='original-excel')?await originalTargetFingerprint(S):null;
   for(const op of manifest.operations){
    const receipt=S.privatePreparations?.[op.id];
    if(!receipt||receipt.sha256!==op.sha256||receipt.type!==op.type||op.type==='original-excel'&&(receipt.targetSha256!==targetSha256||!await originalExcelPresent(op.packet)))unapplied.push(op);
    if(!ready()||sourceToken()!==token)throw failure('DEFERRED');
   }
   // A past slot left started must not hide an independent future session.
   // Append-only future dates preserve every existing slot and selected song.
   // Same-day corrections and dates we cannot compare still wait.
   const futureAddition=op=>op.type==='recording-addition'&&Array.isArray(op.packet.plan?.slots)&&op.packet.plan.slots.length>0
    &&activeSlots.every(current=>/^\d{4}-\d{2}-\d{2}$/.test(current.date||'')&&op.packet.plan.slots.every(next=>/^\d{4}-\d{2}-\d{2}$/.test(next.date||'')&&next.date>current.date));
   const eligible=unapplied.filter(op=>!activePlan||['recording-song','original-excel'].includes(op.type)||futureAddition(op));
   const pending=eligible;
   if(unapplied.length&&!pending.length){setStatus({kind:'active-plan'});return {status:'deferred'};}
   if(!pending.length){setStatus({kind:'current',sourceSha:source.sourceSha,originals:originalSummary(manifest)});return {status:'current'};}
   await establishOwner();if(sourceToken()!==token)throw failure('DEFERRED');
   let count=0,conflicts=0,addedRecording=false;
   for(const operation of pending.filter(op=>op.type!=='original-excel')){
    // Check each independent addition against the current device. An older
    // conflicting packet must not keep a later, unrelated session out forever.
    try{PrivatePreparation.apply(S,operation,{schedule:RecordingScheduleUpdate.apply,recording:mergeRecordingAddition});}
    catch(error){if(error.preparationCode==='OPERATION_ID_REUSED')throw error;conflicts++;continue;}
    if(await applyOne(operation,token,source.sourceSha)){count++;if(['recording-song','recording-addition'].includes(operation.type))addedRecording=true;}
   }
   const originalOperations=pending.filter(op=>op.type==='original-excel');
   if(originalOperations.length)count+=await applyOriginalBatch(originalOperations,token,source.sourceSha);
   if(addedRecording){U.recArtistFilter='';render();}
   const originals=originalSummary(manifest);setStatus({kind:count?'applied':conflicts?'conflict':'current',count,conflicts,sourceSha:source.sourceSha,originals});return {status:status.kind,count,conflicts,originals};
  }catch(error){const code=error.preparationCode||error.code||'PREPARATION_CONFLICT';
   const reason=code==='DEFERRED'?waitingReason():undefined;
   setStatus({kind:code==='CREDENTIAL_UNREADABLE'?'connection-error':code==='DEFERRED'?'deferred':code==='MULTIPLE_WINDOWS'?'multiple-windows':code==='OWNER_REQUIRED'?'owner-required':code==='UNSUPPORTED'?'unsupported':code==='SAVE_UNVERIFIED'?'unverified':'conflict',code,reason});
   if(code==='DEFERRED')queueResume(reason);
   return {status:status.kind,code};
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
 root.PrivatePreparationUI=Object.freeze({settingsHTML,receive,readOriginalExcelPackets,importFile,connectReadCredential,start,isApplying:()=>applying,getStatus:()=>({...status})});start();
})(globalThis);


