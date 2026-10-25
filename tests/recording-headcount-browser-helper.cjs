'use strict';
const assert=require('node:assert/strict'),fixture=require('./recording-headcount-fixture.cjs'),XLSX=require('../vendor/xlsx.full.min.js');
const {checkProgressPreparation}=require('./progress-preparation-browser-helper.cjs');
async function checkRecordingHeadcounts(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold};});
 try{
  await page.evaluate(async()=>{S=Object.assign(structuredClone(S0),{pt:structuredClone(S.pt||{}),viewer:false,recMode:true,ghToken:'',bkGistId:'',src:'',autoPub:false,groups:[{id:'count-existing-group',name:'既存の合成グループ'}],shows:[{id:'count-existing-show',groupId:'count-existing-group',name:'既存の合成公演'}],groupId:'count-existing-group',showId:'count-existing-show',members:[{id:'count-existing-person',name:'既存担当'}],songs:[{id:'count-existing-song',groupId:'count-existing-group',showId:'count-existing-show',title:'保持する合成曲',lines:[{t:'保持する歌詞',parts:['count-existing-person']}]}],rsongs:[],notes:[],recs:{},plan:{slots:[]}});startupRecoveryNetworkHold=true;Object.assign(U,{view:'setup',songIdx:0,recArtistFilter:'OCHA NORMA',menu:null,sheet:null,picker:false,overview:false,draw:false,secView:'',recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;save();await saveNow();render();});
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-act="rpick"]').click();await (await chooser).setFiles({name:'暫定合成曲_歌割.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(fixture(XLSX),{type:'array',bookType:'xlsx'}))});
  await page.waitForFunction(()=>!U.importing&&S.rsongs.length===1&&U.view==='live').catch(async e=>{throw Error('REC import state: '+JSON.stringify(await page.evaluate(()=>({songs:S.rsongs.length,view:U.view,importing:U.importing,busy:U.busy,report:U.fileReport,canWrite:recordingInboxCanWrite(),readonly:recordingInboxProfileRequired,code:U.backupFailureCode,fields:U.backupChangedFields})))+' '+e.message);});
  const check=async()=>{
   const labels=await page.locator('[data-lyric-line] .lbl').allTextContents();assert(labels.some(t=>t.includes('ソロ')));assert(labels.some(t=>t.includes('ユニゾン・2人')));assert(labels.some(t=>t.includes('ユニゾン・3人')));assert(labels.some(t=>t.includes('ユニゾン・A')));assert(labels.some(t=>t.includes('ユニゾン・B')));
   assert.equal(await page.locator('[data-lyric-line] .txt').count(),8);assert(!(await page.locator('[data-lyric-line] .txt').allTextContents()).some(t=>/^[1-9AB]$/.test(t.trim())));
   assert.equal(await page.evaluate(()=>recSong().lines.some(l=>l.parts?.length)),false,'A number never becomes a person ID');
  };
  await check();assert.equal(await page.locator('[data-lyric-line="1"] .rec-assignment-hint').count(),0);assert.equal(await page.locator('[data-recording-text="ユニゾン・2人"]').nth(1).locator('.rec-assignment-hint').count(),0);
  const colors=await page.evaluate(()=>[...document.querySelectorAll('[data-lyric-line="0"],[data-lyric-line="2"]')].map(el=>getComputedStyle(el).borderInlineStartColor));assert.notEqual(colors[0],colors[1]);
  const originalViewport=page.viewportSize();await page.setViewportSize({width,height:400});
  await page.evaluate(()=>{window.__cueRow=app.querySelector('[data-lyric-line="1"]');const sc=app.querySelector('#app > .scroll');sc.scrollTop=__cueRow.offsetTop-sc.offsetTop+12;});
  await page.waitForFunction(()=>{const el=app.querySelector('[data-recording-current]');return el&&!el.hidden&&el.textContent==='ソロ';});
  assert.equal(await page.evaluate(()=>app.querySelector('[data-lyric-line="1"]')===__cueRow),true);
  await screenshot(page,width,'rec-solo-scrolled-cue');
  await page.evaluate(()=>{const sc=app.querySelector('#app > .scroll'),row=app.querySelectorAll('[data-recording-text="ユニゾン・2人"]')[1];sc.scrollTop=row.offsetTop-sc.offsetTop+12;});
  await page.waitForFunction(()=>{const el=app.querySelector('[data-recording-current]');return el&&!el.hidden&&el.textContent==='ユニゾン・2人';});
  await screenshot(page,width,'rec-unison-scrolled-cue');await page.setViewportSize(originalViewport);await page.evaluate(()=>{app.querySelector('#app > .scroll').scrollTop=0;});
  await screenshot(page,width,'rec-predicted-headcounts');
  await page.locator('[data-act="go-setup"]').click();assert.match(await page.locator('.rec-member-focus .note').innerText(),/暫定のソロ・ユニゾン.*担当メンバーは未確定/);
  await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('save');});await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  await page.evaluate(()=>{S.recMode=true;Object.assign(U,{view:'live',songIdx:0,secView:'',menu:null,sheet:null,overview:false});renderPointers.clear();scrollingUntil=0;render();});await check();
  const originalBytes=await page.evaluate(async()=>{const blob=await getClip('xls:'+recSong().xlsSourceId);return blob?.size;});assert(originalBytes>0);
  const manualId=await page.evaluate(()=>recSong().id);
  const manifest=await page.evaluate(async()=>{
   const song={...structuredClone(recSong()),id:'qa-rec-count-received',title:'受信する暫定合成曲',groupId:'qa-rec-count-group',recArtist:'OCHA NORMA',roster:[],blocks:{}};song.lines.forEach(l=>Object.assign(l,{parts:[],main:[],extra:[]}));
   const packet={app:'utacheck-recording-addition',version:1,group:{id:song.groupId,name:'受信する非公開REC',nopub:true},members:[],roster:[],songs:[song],plan:{year:2031,timezone:'Asia/Tokyo',slots:[{id:'qa-rec-count-slot',songId:song.id,name:'検証担当',day:'10/27',date:'2031-10-27',at:720,min:90,kind:'member',place:'検証スタジオ'}]}};
   return {app:'utacheck-private-preparation',version:1,owner:'gogojoe312-max',revision:'qa-recording-headcounts',createdAt:'2031-01-01T00:00:00Z',operations:[{id:'qa-recording-headcounts-addition',type:'recording-addition',packet,sha256:await PrivatePreparation.digest(packet)}]};
  });
  const reception=checkProgressPreparation(page,{manifest,progressRelay:true,slowRelay:width===320?'slow':'timeout'});reception.catch(()=>{});
  let received;
  try{
   await page.waitForFunction(()=>window.__qaSlowRelayStarted);
   await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
   await page.clock.runFor(31000);
   const delayed=await page.evaluate(()=>({status:PrivatePreparationUI.getStatus(),text:document.querySelector('[data-private-preparation-status]')?.textContent,missing:document.getElementById('app').textContent.includes('この曲に連携した進行表はありません。'),rows:S.plan.slots.length,inert:document.getElementById('app').inert}));
   assert.equal(delayed.status.kind,'checking');assert.match(delayed.text,/応答.*時間|応答を待/);assert.equal(delayed.missing,true);assert.equal(delayed.rows,0);assert.equal(delayed.inert,false);
   await screenshot(page,width,'rec-schedule-response-waiting');
   await page.clock.runFor(width===320?5000:61000);
  }finally{await page.clock.resume();}
  received=await reception;assert.equal(received.received.status,'applied');assert.equal(received.slotCount,1);assert.equal(received.receipt,true);assert.equal(received.preserved,true);
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  assert.equal(await page.evaluate(()=>S.plan.slots.filter(s=>s.songId==='qa-rec-count-received').length),1);
  await page.evaluate(()=>{S.recMode=true;Object.assign(U,{view:'setup',menu:null,sheet:null,recArtistFilter:''});renderPointers.clear();scrollingUntil=0;render();});
  await page.locator('[data-act="ruse"][data-id="'+manualId+'"]').click();
  const beforePlan=await page.evaluate(()=>JSON.stringify([S.rsongs,S.notes,S.recs,S.plan]));
  await page.locator('[data-act="goplan"]').first().click();await page.waitForSelector('.plan-row');
  assert.equal(await page.locator('.plan-row').count(),1);assert.match(await page.locator('.plan-row').innerText(),/12:00.*13:30/s);assert.match(await page.locator('.plan-row').innerText(),/検証担当/);
  assert.equal(await page.evaluate(()=>S.rsongId),'qa-rec-count-received');assert.equal(await page.evaluate(()=>JSON.stringify([S.rsongs,S.notes,S.recs,S.plan])),beforePlan);
  await screenshot(page,width,'rec-original-schedule-linked');
  await page.evaluate(()=>{U.view='live';U.secView='';renderPointers.clear();scrollingUntil=0;render();});await check();await screenshot(page,width,'rec-predicted-headcounts-received');
  await page.locator('[data-act="overview"]').first().click();assert.equal(await page.locator('#app .rec-assignment-hint,#app [data-recording-current],#app .ovw[data-recording-kind]').count(),0);assert.equal(await page.locator('#app .song-heading .t1').innerText(),'REC ・ 全体表示');assert.equal(await page.locator('#app .ovw').count(),8);await screenshot(page,width,'rec-overview-without-singer-cues');await page.locator('[data-act="overview"]').first().click();await check();
  await page.evaluate(()=>{U.view='recprint';renderPointers.clear();scrollingUntil=0;render();});assert.match(await page.locator('#prpage').innerText(),/ソロ/);assert.match(await page.locator('#prpage').innerText(),/ユニゾン・A/);
  await screenshot(page,width,'rec-predicted-headcounts-print');
 }finally{await page.evaluate(async saved=>{S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render();},saved);

 }
 return {recPredictedHeadcountsImported:true,recPredictedCountsSeparateFromMembers:true,recPredictedHeadcountsReloadAndPrint:true,recPredictedHeadcountsScheduleReceive:true,recSparseSoloUnisonCues:true,recCueScrollWithoutRedraw:true,recManualOriginalOpensReceivedSchedule:true,recScheduleReceivedWithProgressLoginOnly:true,recSlowResponseRecoveredOnSettings:true,recDeadlineRetryOpenedPlan:true,recOverviewHidesAssignmentCues:true};
}
module.exports={checkRecordingHeadcounts};
