'use strict';
const assert=require('node:assert/strict');
const {checkRecLiveIsolation}=require('./rec-live-isolation-browser-helper.cjs');
const {fixture,clone,digest}=require('./recording-preparation-fixture.cjs');
async function checkRecordingPreparation(page,width,{screenshot}){
 const dedicated=width===390,token=dedicated?'github_pat_'+'q'.repeat(40):'qa-dot-private-connection';
 const f=fixture(),reports=new Map(),calls=[];let manifest=clone(f.manifest),sourceSha='a'.repeat(40);
 const base='https://api.github.com/repos/gogojoe312-max/shinkou-data';
 await page.route('https://api.github.com/**',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();calls.push({path:url.pathname,method});
  assert.equal(request.headers().authorization,'Bearer '+token);let body,status=200;
  if(url.href==='https://api.github.com/user')body={login:'gogojoe312-max'};
  else if(url.href===base)body={private:true,full_name:'gogojoe312-max/shinkou-data',owner:{login:'gogojoe312-max'}};
  else if(url.pathname.endsWith('/contents/utacheck/prepared.json')){const text=JSON.stringify(manifest);body={type:'file',path:'utacheck/prepared.json',name:'prepared.json',sha:sourceSha,encoding:'base64',size:Buffer.byteLength(text),content:Buffer.from(text).toString('base64')};}
  else if(/\/contents\/utacheck\/results\/device-[a-f0-9]{32}\.json$/.test(url.pathname)){
   const path=url.pathname.split('/contents/')[1];
   if(method==='PUT'){const data=request.postDataJSON();assert.equal(data.branch,'main');if(reports.has(path))assert.equal(data.sha,'b'.repeat(40));reports.set(path,JSON.parse(Buffer.from(data.content,'base64').toString()));body={content:{sha:'b'.repeat(40)}};status=201;}
   else if(!reports.has(path)){status=404;body={message:'Not Found'};}
   else {const text=JSON.stringify(reports.get(path));body={type:'file',path,sha:'b'.repeat(40),encoding:'base64',size:Buffer.byteLength(text),content:Buffer.from(text).toString('base64')};}
  }else throw Error('Unexpected private preparation URL: '+url.pathname);
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.route('https://shinkou-secure.onrender.com/utacheck/results',async route=>{
  assert.equal(dedicated,true);const request=route.request(),report=request.postDataJSON();assert.equal(request.method(),'POST');assert.equal(request.headers().authorization,'Bearer '+token);require('../preparation-results.js').validate(report);
  const path='utacheck/results/'+report.clientId+'.json';calls.push({path:'/utacheck/results',method:'POST'});reports.set(path,report);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'confirmed',path,sequence:report.sequence})});
 });
 await page.clock.install({time:new Date('2026-10-26T00:00:00Z')});
 await page.evaluate(async({state,dedicated,token})=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('shinkou',2);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put({settings:{sync:{on:true,owner:'gogojoe312-max',repo:'shinkou-data',path:'data.json',branch:'main',token:'qa-dot-private-connection'}}},'state');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  S={...structuredClone(S0),...state,deviceId:S.deviceId,viewer:dedicated,recMode:true,rsongId:'dot-song',ghToken:''};
  recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:true};recordingInboxIntegration=setupRecordingInboxIntegration();startupRecoveryNetworkHold=true;saveErr=false;
  Object.assign(U,{view:'setup',menu:null,sheet:null,picker:false,showRecovery:false,busy:false,importing:false,recArtistFilter:''});renderPointers.clear();scrollingUntil=0;render(true);save();await saveNow();if(saveErr)throw Error('seed save');
  if(dedicated)await idbPut('private-preparation:read-credential:v1',{version:1,owner:'gogojoe312-max',repo:'shinkou-data',token});
 },{state:f.state,dedicated,token});
 if(dedicated){await page.reload();await page.waitForFunction(()=>normalStartupInitialized);await page.evaluate(()=>{S.viewer=false;recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:true};recordingInboxIntegration=setupRecordingInboxIntegration();startupRecoveryNetworkHold=true;Object.assign(U,{view:'setup',menu:null,sheet:null,picker:false,showRecovery:false,busy:false,importing:false,recArtistFilter:''});renderPointers.clear();scrollingUntil=0;render(true);});}
 const preserved=await page.evaluate(()=>JSON.stringify({notes:S.notes,recs:S.recs,songs:S.songs,shows:S.shows,groups:S.groups,autoPub:S.autoPub,bkGistId:S.bkGistId,manual:S.rsongs[0].lines[1],intro:S.rsongs[0].intro,history:{...S.plan.slots[0],at:undefined,min:undefined,day:undefined,date:undefined}}));
 const receive=async()=>{
  await page.evaluate(()=>{document.activeElement?.blur();renderPointers.clear();scrollingUntil=0;U.recScheduleInputUntil=0;});
  await page.waitForFunction(()=>!saving&&!syncing&&!manualSync&&!backupInFlight&&!publishInFlight&&recordingInboxCanWrite());
  let result=await page.evaluate(()=>PrivatePreparationUI.receive(true));
  if(result.status==='busy'){await page.waitForFunction(()=>!PrivatePreparationUI.isApplying()&&PrivatePreparationUI.getStatus().kind!=='checking');result=await page.evaluate(()=>PrivatePreparationUI.receive(true));}
  for(let i=0;['busy','deferred'].includes(result.status)&&i<10;i++){await page.waitForTimeout(500);await page.evaluate(()=>{document.activeElement?.blur();renderPointers.clear();scrollingUntil=0;});result=await page.evaluate(()=>PrivatePreparationUI.receive(true));}
  return result;
 };
 const got=await receive();assert(['applied','current'].includes(got.status),JSON.stringify({got,reports:[...reports.values()],state:await page.evaluate(()=>({songs:S.rsongs,slots:S.plan.slots,status:PrivatePreparationUI.getStatus()}))}));
 assert.equal(await page.evaluate(()=>PrivatePreparationUI.getResultStatus().status),'confirmed');assert.equal(reports.size,1);
 let report=[...reports.values()][0];assert.equal(report.sessions[0].revision,1);assert(report.operations.every(o=>o.status==='applied'));assert.doesNotMatch(JSON.stringify(report),/差し替えた歌詞|指摘を保持|qa-dot-private|keep-gist|keep-key/);
 await page.locator('[data-act="ruse"][data-id="dot-song"]').click();await page.waitForSelector('[data-lyric-line]');
 assert((await page.locator('[data-lyric-line] .txt').allTextContents()).includes('差し替えた歌詞😀'));
 await screenshot(page,width,'dot-rec-updated-lyrics');
 await page.locator('[data-act="goplan"]').first().click();await page.waitForSelector('.plan-row');
 assert.deepEqual(await page.locator('.plan-row [data-act="psecgo"] .trunc').allTextContents(),['乙','休憩','甲']);
 assert.match(await page.locator('#app').innerText(),/10\/28/);assert.match(await page.locator('.plan-row').nth(0).innerText(),/12:00–13:30/);assert.match(await page.locator('.plan-row').nth(1).innerText(),/13:30–14:30/);
 // The completed slot keeps its historical actual clock; planned clock is
 // checked in persisted state, never rewritten to make a screenshot match.
 assert.match(await page.locator('.plan-row').nth(2).innerText(),/14:30–15:15/);assert.match(await page.locator('.plan-row').nth(2).innerText(),/2026-10-27.*10:01–10:59/);assert(!(await page.locator('#app').innerText()).includes('-256分'));
 assert.equal(await page.evaluate(()=>S.plan.slots[2].at),870);assert.equal(await page.evaluate(()=>S.plan.slots[2].min),45);
 await screenshot(page,width,'dot-rec-updated-plan');
 const unchanged=await page.evaluate(()=>JSON.stringify({notes:S.notes,recs:S.recs,songs:S.songs,shows:S.shows,groups:S.groups,autoPub:S.autoPub,bkGistId:S.bkGistId,manual:S.rsongs[0].lines[1],intro:S.rsongs[0].intro,history:{...S.plan.slots.find(s=>s.id==='slot-1'),at:undefined,min:undefined,day:undefined,date:undefined,recActualSchedule:undefined}}));assert.equal(unchanged,preserved);assert.equal(await page.evaluate(()=>S.plan.slots.find(s=>s.id==='slot-1').recActualSchedule.date),'2026-10-27');
 const writes=calls.filter(c=>['PUT','POST'].includes(c.method)).length;assert.equal((await receive()).status,'current');assert.equal(calls.filter(c=>['PUT','POST'].includes(c.method)).length,writes);
 await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('save');});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);
 assert.equal(await page.evaluate(()=>S.recordingUpdateHeads['dot-session'].revision),1);assert.equal(await page.evaluate(()=>S.plan.slots.filter(s=>s.id==='break-2').length),1);assert.equal(await page.evaluate(()=>S.plan.slots.some(s=>s.id==='break-1')),false);
 await page.evaluate(()=>{S.recMode=true;S.rsongId='dot-song';Object.assign(U,{view:'live',menu:null,sheet:null,secView:'',overview:false});renderPointers.clear();scrollingUntil=0;render(true);});await page.locator('[data-act="goplan"]').first().click();await page.waitForSelector('.plan-row');assert.equal(await page.locator('.plan-row').count(),3);await screenshot(page,width,'dot-rec-plan-after-native-reload');
 // A later conflicting lyric edit must be retained and explicitly held in the
 // privately reread report, while independent slot/history data stays intact.
 await page.evaluate(async()=>{recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:true};recordingInboxIntegration=setupRecordingInboxIntegration();S.rsongs.find(s=>s.id==='dot-song').lines[0].t='本人が直した歌詞';save();await saveNow();});
 const prior=manifest.operations[1],packet=clone(prior.packet);packet.revision=2;packet.previous={id:prior.id,sha256:prior.sha256};packet.before=clone(prior.packet.after);packet.after=clone(prior.packet.after);packet.after.songs[0].lines[0].t='dotの次の歌詞';
 manifest.operations.push({id:'dot-update-2',type:'recording-update',packet,sha256:digest(packet)});manifest.revision='qa-dot-3';sourceSha='c'.repeat(40);
 let held=await receive();for(let i=0;held.status==='deferred'&&i<10;i++){await page.waitForTimeout(500);held=await receive();}assert.equal(held.status,'conflict',JSON.stringify(held));report=[...reports.values()][0];assert.equal(report.operations.at(-1).status,'held');assert.equal(report.operations.at(-1).code,'REC_UPDATE_LOCAL_EDIT');assert.equal(report.sessions[0].revision,1);assert.equal(await page.evaluate(()=>S.rsongs.find(s=>s.id==='dot-song').lines[0].t),'本人が直した歌詞');
 await page.locator('[data-act="recback"]').click();await page.locator('[data-act="go-setup"]').click();await screenshot(page,width,'dot-rec-conflict-and-private-result');
 await page.reload();await page.waitForFunction(()=>normalStartupInitialized);assert.equal(await page.evaluate(()=>S.rsongs.find(s=>s.id==='dot-song').lines[0].t),'本人が直した歌詞');assert.equal(await page.evaluate(()=>!!S.privatePreparations['dot-update-2']),false);
 // Explicitly replace only the held operation. Preserve its immutable queue
 // entry and accept the user's local text as the reviewed new source value.
 const corrected=clone(manifest.operations.at(-1));corrected.id='dot-update-2-corrected';corrected.packet.supersedes={id:manifest.operations.at(-1).id,sha256:manifest.operations.at(-1).sha256};corrected.packet.after.songs[0].lines[0].t='本人が直した歌詞';corrected.sha256=digest(corrected.packet);manifest.operations.push(corrected);manifest.revision='qa-dot-4';sourceSha='d'.repeat(40);
 await page.evaluate(()=>{recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:true};recordingInboxIntegration=setupRecordingInboxIntegration();});
 if(await page.locator('[data-act="go-setup"]').count())await page.locator('[data-act="go-setup"]').click();
 const correctedResult=await receive();assert(['applied','current'].includes(correctedResult.status),JSON.stringify(correctedResult));assert.equal((await receive()).status,'current','A durably superseded operation must not make the actual owner UI return to conflict');await screenshot(page,width,'dot-rec-corrected-status-current');report=[...reports.values()][0];assert.equal(report.sessions[0].revision,2);assert.equal(report.sessions[0].operationId,corrected.id);assert.equal(report.operations.at(-1).status,'applied');assert.equal(report.operations.at(-2).code,'REC_UPDATE_SUPERSEDED');
 await page.evaluate(()=>{S.recMode=true;S.rsongId='dot-song';Object.assign(U,{view:'live',menu:null,sheet:null,secView:'',overview:false});renderPointers.clear();scrollingUntil=0;render(true);});await page.waitForSelector('[data-lyric-line]');assert((await page.locator('[data-lyric-line] .txt').allTextContents()).includes('本人が直した歌詞'));await screenshot(page,width,'dot-rec-held-correction-applied');
 await page.reload();await page.waitForFunction(()=>normalStartupInitialized);assert.equal(await page.evaluate(()=>S.recordingUpdateHeads['dot-session'].operationId),corrected.id);assert.equal(await page.evaluate(()=>S.plan.slots.length),3);
 const yearPacket=clone(corrected.packet);delete yearPacket.supersedes;yearPacket.revision=3;yearPacket.previous={id:corrected.id,sha256:corrected.sha256};yearPacket.before=clone(corrected.packet.after);yearPacket.after=clone(corrected.packet.after);
 yearPacket.after.slots.forEach((slot,i)=>Object.assign(slot,i===0?{date:'2026-12-31',day:'12/31'}:{date:'2027-01-02',day:'1/2'}));
 const nextYear={id:'dot-update-next-year',type:'recording-update',packet:yearPacket,sha256:digest(yearPacket)};manifest.operations.push(nextYear);manifest.revision='qa-dot-next-year';sourceSha='e'.repeat(40);
 await page.evaluate(()=>{recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:true};recordingInboxIntegration=setupRecordingInboxIntegration();});const yearResult=await receive();assert(['applied','current'].includes(yearResult.status),JSON.stringify(yearResult));
 await page.evaluate(()=>{S.recMode=true;S.rsongId='dot-song';Object.assign(U,{view:'live',menu:null,sheet:null,secView:'',overview:false});renderPointers.clear();scrollingUntil=0;render(true);});await page.locator('[data-act="goplan"]').first().click();await page.waitForSelector('.plan-row');
 await page.locator('[data-act="planday"][data-id=""]').click();assert.deepEqual(await page.locator('.plan-day').allTextContents(),['12/31 · 合成会場','1/2 · 合成会場']);await page.locator('[data-act="planday"][data-id="12/31"]').click();assert.equal(await page.locator('.plan-row').count(),1);await page.locator('[data-act="planday"][data-id="1/2"]').click();assert.equal(await page.locator('.plan-row').count(),2);await screenshot(page,width,'dot-rec-moved-dates-across-year');
 await page.reload();await page.waitForFunction(()=>normalStartupInitialized);assert.equal(await page.evaluate(()=>S.recordingUpdateHeads['dot-session'].revision),3);assert.equal(await page.evaluate(()=>S.plan.slots.find(s=>s.id==='slot-1').recActualSchedule.date),'2026-10-27');
 const isolation=await checkRecLiveIsolation(page,width,{screenshot,receive,anchor:f.anchor,append:op=>{manifest.operations.push(op);manifest.revision='qa-dot-rec-only';sourceSha='f'.repeat(40);}});
 if(dedicated)assert.equal(calls.filter(c=>c.method==='PUT').length,0,'The read-only credential only proves ownership to the server');
 return {...isolation,dotRecResultCredentialMode:dedicated?'read-only-source-owner-relay':'saved-progress-private-writer',dotRecVersionedScheduleAndLyrics:true,dotRecDateOrderTimesBreaksExactScreen:true,dotRecPreservedManualNotesMediaAndPublicSharing:true,dotRecRealReceiveSaveReload:true,dotRecPrivateResultSaveAndReread:true,dotRecConflictsHeldAndReported:true,dotRecDuplicateNoExtraWrites:true,dotRecHeldCorrectionAppliedAndReloaded:true,dotRecCrossYearDateControlsAndHistory:true};
}
module.exports={checkRecordingPreparation};
