'use strict';
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),XLSX=require('../vendor/xlsx.full.min.js');
const {snapshot}=require('../recording-preparation-update.js');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function wordFixture(){
 const body=Array.from({length:63},(_,i)=>'合成の原文'+i+'をそのまま保持します');
 const xml='<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body.map((t,i)=>'<w:p><w:r><w:t>'+t+'</w:t></w:r></w:p>'+([8,16,24,32,40,48,54,58,61].includes(i)?'<w:p/>':'')).join('')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:cols w:num="2" w:space="425"/></w:sectPr></w:body></w:document>';
 const book=XLSX.CFB.utils.cfb_new();XLSX.CFB.utils.cfb_add(book,'word/document.xml',Buffer.from(xml));XLSX.CFB.utils.cfb_add(book,'word/header1.xml',Buffer.from('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>「合成Word曲」検証用</w:t></w:r></w:p></w:hdr>'));
 return Buffer.from(XLSX.CFB.write(book,{type:'buffer',fileType:'zip',compression:true}));
}
async function checkRecordingWordPlan(page,width,{screenshot,wordBytes=null,sourceManifest=null,importAt='2031-05-05T00:00:00Z',artist='合成アーティスト'}){
 let reply=null;const onDialog=async dialog=>{if(dialog.type()==='prompt'&&reply!==null){const value=reply;reply=null;await dialog.accept(value);}else await dialog.dismiss();};page.on('dialog',onDialog);
 try{
  await page.evaluate(async()=>{S=Object.assign(structuredClone(S0),{viewer:false,recMode:true,ghToken:'',src:'',bkGistId:'',autoPub:false,rsongs:[],groups:[],members:[],notes:[],recs:{},plan:{slots:[]}});startupRecoveryNetworkHold=true;Object.assign(U,{view:'setup',menu:null,sheet:null,picker:false,recArtistFilter:'合成アーティスト',secView:'',overview:false,recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);});
  const bytes=wordBytes||wordFixture(),chooser=page.waitForEvent('filechooser');await page.locator('[data-act="rpick"]').click();await(await chooser).setFiles({name:'合成Word曲.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:bytes});
  await page.waitForFunction(()=>S.rsongs.length===1&&!U.busy&&U.view==='live');
  const imported=await page.evaluate(()=>structuredClone(recSong())),manualId=imported.id;
  assert.equal(imported.cols,2);assert.equal(imported.lines.filter(l=>!l.gap).length,63);
  if(imported.recordingSource)assert.equal(imported.recordingSource.sha256,createHash('sha256').update(bytes).digest('hex'));
  // Reproduce the existing phone import, which predates byte provenance. Keep
  // its original source rows and add three cues via the actual number menu.
  await page.evaluate(({importAt,artist})=>{delete recSong().recordingSource;recSong().at=Date.parse(importAt);recSong().recArtist=artist;},{importAt,artist});
  for(const text of ['煽り','合成追加二','合成追加三']){
   const index=await page.evaluate(()=>recSong().lines.length-1);await page.locator('[data-lyric-line="'+index+'"] [data-act="rbar"]').click();
   if(!await page.locator('.mask [data-act="raddfree"]').count())await page.locator('.mask [data-act="rmore"]').click();reply=text;await page.locator('.mask [data-act="raddfree"]').click();
  }
  const preserved=await page.evaluate(async bytes=>{
   const so=recSong();Object.assign(so.lines[0],{sec:'本人の区切り',bars:1,at:61,lyricBreaks:[2]});Object.assign(so.lines[1],{cut:1,sourceCut:false});
   S.notes=[{id:'word-note',songId:so.id,showId:'rec',lineIdx:2,from:0,to:1,memberIds:[],tags:['rhythm'],memo:'手元の指摘'}];S.recs={kept:{size:4,dur:2}};
   await putClip('word-original-kept',new Blob([new Uint8Array(bytes)]));await putClip('kept',new Blob([new Uint8Array([1,2,3,4])]));
   Object.assign(U,{view:'setup',menu:null,sheet:null,secView:'',overview:false,recArtistFilter:''});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
   return JSON.stringify({song:so,notes:S.notes,recs:S.recs});
  },Array.from(bytes));
  const selected=page.locator('[data-rec-song="'+manualId+'"]');assert.match(await selected.innerText(),/66行.*2段/);assert.match(await selected.innerText(),/日付未設定/);
  const proof={app:'utacheck-word-import',version:1,parser:'utacheck-word-v1',sha256:createHash('sha256').update(bytes).digest('hex'),title:imported.title,cols:imported.cols,perLine:imported.perLine,rowsPerCol:imported.rowsPerCol,lines:imported.lines.filter(l=>!l.gap&&l.t.trim()).map(l=>l.t)};
  let targetId='word-received-fixed';const groupId='word-source-private',sessionId='word-source-session';
  const received={id:targetId,title:imported.title,groupId,recArtist:'合成アーティスト',recSession:{id:sessionId,label:'2031/5/8・9'},roster:[],blocks:{},lines:[...Array.from({length:18},(_,i)=>({t:'配信側だけの見出し'+i,parts:[],main:[],extra:[]})),...proof.lines.map(t=>({t,parts:[],main:[],extra:[]}))]};
  const slots=Array.from({length:8},(_,i)=>({id:'word-slot-'+i,name:'検証担当'+i,kind:'member',memberId:'word-member-'+i,songId:targetId,date:i<4?'2031-05-08':'2031-05-09',day:i<4?'5/8':'5/9',place:'合成会場',at:720+(i%4)*90,min:90}));
  const packet={app:'utacheck-recording-addition',version:1,group:{id:groupId,name:'合成Wordの非公開REC',nopub:true},members:slots.map(s=>({id:s.memberId,name:s.name})),roster:slots.map(s=>s.name),songs:[received],plan:{year:2031,timezone:'Asia/Tokyo',songIds:[targetId],slots}};
  const anchor={id:'word-source-addition',type:'recording-addition',packet,sha256:digest(packet)},before=snapshot(anchor),after=structuredClone(before);after.songs[0].recSession.sourceImport=proof;
  const update={app:'utacheck-recording-update',version:1,sessionId,revision:1,groupId,timezone:'Asia/Tokyo',anchor:{id:anchor.id,sha256:anchor.sha256},previous:{id:anchor.id,sha256:anchor.sha256},before,after,source:{revision:'synthetic-word-source',files:[{name:'合成Word曲.docx',sha256:proof.sha256}]}};
  const operation={id:'word-source-proof',type:'recording-update',packet:update,sha256:digest(update)};let manifest={app:'utacheck-private-preparation',version:1,owner:'gogojoe312-max',revision:'word-proof-1',createdAt:'2031-05-05T00:00:00Z',operations:[anchor,operation]};
  if(sourceManifest){manifest=sourceManifest;targetId=manifest.operations.at(-1).packet.after.songs[0].id;assert.deepEqual(manifest.operations.at(-1).packet.after.songs[0].recSession.sourceImport,proof);}
  const proofId=manifest.operations.at(-1).id,expectedSlots=manifest.operations.at(-1).packet.after.slots,days=[...new Set(expectedSlots.map(s=>s.day))];
  const raw=JSON.stringify(manifest),sourceSha=createHash('sha1').update('blob '+Buffer.byteLength(raw)+'\0').update(raw).digest('hex');let release,held=false;const responseReady=new Promise(r=>{release=r;});
  await page.route('https://api.github.com/**',async route=>{
   const u=new URL(route.request().url());let body,status=200;
   if(u.pathname==='/user')body={login:'gogojoe312-max'};
   else if(u.pathname==='/repos/gogojoe312-max/shinkou-data')body={private:true,full_name:'gogojoe312-max/shinkou-data',owner:{login:'gogojoe312-max'}};
   else if(u.pathname.endsWith('/contents/utacheck/prepared.json')){held=true;await responseReady;body={type:'file',path:'utacheck/prepared.json',name:'prepared.json',sha:sourceSha,size:Buffer.byteLength(raw),encoding:Buffer.byteLength(raw)>1048576?'none':'base64',content:Buffer.byteLength(raw)>1048576?'':Buffer.from(raw).toString('base64')};}
   else if(u.pathname.endsWith('/git/blobs/'+sourceSha))body={sha:sourceSha,size:Buffer.byteLength(raw),encoding:'base64',content:Buffer.from(raw).toString('base64')};
   else{status=503;body={message:'Synthetic result writer unavailable'};}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.route('https://shinkou-secure.onrender.com/utacheck/results',r=>r.fulfill({status:503,contentType:'application/json',body:'{"status":"pending","code":"RESULT_WRITER_UNAVAILABLE"}'}));
  await page.evaluate(()=>{S.ghToken='qa-word-plan-only';recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:true};recordingInboxIntegration=setupRecordingInboxIntegration();document.activeElement?.blur();save();renderPointers.clear();scrollingUntil=0;});
  const pending=page.evaluate(()=>PrivatePreparationUI.receive(true));
  await page.waitForFunction(()=>PrivatePreparationUI.getStatus().kind==='checking');for(let i=0;!held&&i<100;i++)await page.waitForTimeout(25);assert(held);
  await page.evaluate(()=>{renderPointers.clear();scrollingUntil=0;render(true);});await screenshot(page,width,'word-import-66-lines-waiting-for-source');
  release();await pending;await page.waitForFunction(()=>!PrivatePreparationUI.isReceiving());
  if(!await page.evaluate(id=>!!S.privatePreparations?.[id],proofId))await page.evaluate(()=>PrivatePreparationUI.receive(true));await page.waitForFunction(()=>!PrivatePreparationUI.isReceiving());
  assert.equal(await page.evaluate(()=>S.rsongId),manualId);
  const resolved=await page.evaluate(id=>recordingPlanSourceId(id),manualId);
  if(resolved!==targetId)console.error('Word source apply error',await page.evaluate(operation=>{try{PrivatePreparation.apply(S,operation,{recording:(state,packet)=>mergeRecordingAddition(state,packet,{strictMemberIdentity:true}),recordingUpdate:RecordingPreparationUpdate.apply,operations:[operation]});return 'no error';}catch(error){return {message:error.message,code:error.preparationCode};}},manifest.operations[0]));
  if(resolved!==targetId)console.error('Word link diagnostics',await page.evaluate(id=>({status:PrivatePreparationUI.getStatus(),manual:S.rsongs.filter(s=>s.id===id).map(s=>({title:s.title,artist:s.recArtist,folder:s.folder,session:s.recSession,cols:s.cols,perLine:s.perLine,rowsPerCol:s.rowsPerCol,source:s.recordingSource,at:s.at,body:s.lines.filter(l=>!l.add&&!l.gap&&l.t.trim()).length})),heads:Object.values(S.recordingUpdateHeads||{}).map(h=>({group:h.groupId,operation:h.operationId,receipt:S.privatePreparations?.[h.operationId],proof:h.snapshot.songs.map(s=>({id:s.id,session:s.recSession?.id,proofRows:s.recSession?.sourceImport?.lines?.length,cols:s.recSession?.sourceImport?.cols,perLine:s.recSession?.sourceImport?.perLine,rowsPerCol:s.recSession?.sourceImport?.rowsPerCol}))})),slots:S.plan.slots.length}),manualId));
  assert.equal(resolved,targetId,'The selected 66-line manual Word copy, not the received 81-line copy, must open the schedule');
  await page.evaluate(()=>{U.view='setup';renderPointers.clear();scrollingUntil=0;render(true);});
  assert(!/日付未設定/.test(await selected.innerText()));assert((await selected.innerText()).includes(expectedSlots[0].date.replace(/-/g,'/')));assert.match(await selected.innerText(),/66行.*2段/);
  assert.equal(await page.locator('[data-rec-song="'+targetId+'"]').count(),0,'Keep the verified manual document as the visible settings entry');
  const bottomPlan=page.locator('.card').filter({has:page.locator('[data-act="goplan"]')});assert(!/連携した進行表はありません/.test(await bottomPlan.innerText()));
  await screenshot(page,width,'word-import-selected-settings-linked');await bottomPlan.locator('[data-act="goplan"]').click();
  for(const day of days){await page.locator('[data-act="planday"][data-id="'+day+'"]').click();const expected=expectedSlots.filter(s=>s.day===day);assert.equal(await page.locator('.plan-row').count(),expected.length);for(let i=0;i<expected.length;i++){const hm=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');const text=await page.locator('.plan-row').nth(i).innerText();assert(text.includes(expected[i].name));assert(text.includes(hm(expected[i].at)+'–'+hm(expected[i].at+expected[i].min)));}await screenshot(page,width,'word-import-plan-'+day.replace('/','-'));}
  const next=expectedSlots.find(s=>s.day===days.at(-1)&&s.kind==='member');await page.locator('[data-act="psecgo"][data-id="'+next.id+'"]').click();assert.equal(await page.evaluate(()=>S.rsongId),manualId);assert.equal(await page.locator('.sectabs [data-id="本人の区切り"]').count(),1);
  assert.equal(await page.evaluate(id=>JSON.stringify({song:S.rsongs.find(s=>s.id===id),notes:S.notes,recs:S.recs}),manualId),preserved);
  await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);
  await page.evaluate(id=>{S.recMode=true;S.rsongId=id;Object.assign(U,{view:'setup',menu:null,sheet:null,recArtistFilter:'',recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;render(true);},manualId);
  assert.equal(await page.locator('[data-rec-song="'+targetId+'"]').count(),0);
  await page.locator('.card').filter({has:page.locator('[data-act="goplan"]')}).locator('[data-act="goplan"]').click();await page.locator('[data-act="planday"][data-id="'+days.at(-1)+'"]').click();assert.equal(await page.locator('.plan-row').count(),expectedSlots.filter(s=>s.day===days.at(-1)).length);await screenshot(page,width,'word-import-plan-native-reload');
  assert.equal(await page.evaluate(id=>JSON.stringify({song:S.rsongs.find(s=>s.id===id),notes:S.notes,recs:S.recs}),manualId),preserved);
  assert.deepEqual(await page.evaluate(async()=>Array.from(new Uint8Array(await(await getClip('kept')).arrayBuffer()))),[1,2,3,4]);
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await(await getClip('word-original-kept')).arrayBuffer())))),bytes);
  return {wordManual66LineTwoColumnSourceLinked:true,wordReceived81LineCopyKeptSeparate:true,wordActualSettingsPlanControl:true,wordBothDaysAndNativeReload:true,wordManualCuesBarsNotesAndMediaPreserved:true};
 }catch(error){await screenshot(page,width,'word-import-plan-failure');throw error;}
 finally{page.off('dialog',onDialog);}
}
module.exports={checkRecordingWordPlan,wordFixture};
