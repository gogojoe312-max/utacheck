'use strict';
const assert=require('node:assert/strict'),XLSX=require('../vendor/xlsx.full.min.js'),fixture=require('./recording-original-groups-fixture.cjs');
const {checkProgressPreparation}=require('./progress-preparation-browser-helper.cjs');
async function checkRecordingOKOriginal(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold};});
 try{
  await page.evaluate(async()=>{S=Object.assign(structuredClone(S0),{viewer:false,recMode:true,ghToken:'',bkGistId:'',autoPub:false,groups:[],members:[],rsongs:[],notes:[],plan:{slots:[]},planPrep:0});startupRecoveryNetworkHold=true;Object.assign(U,{view:'setup',menu:null,sheet:null,picker:false,overview:false,recArtistFilter:'',secView:'',recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;save();await saveNow();render();});
  const bytes=Buffer.from(XLSX.write(fixture(XLSX),{type:'array',bookType:'xlsx'})),chooser=page.waitForEvent('filechooser');
  await page.locator('[data-act="rpick"]').click();await (await chooser).setFiles({name:'歌割のまとまり合成.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
  await page.waitForFunction(()=>!U.importing&&S.rsongs.length===1&&U.view==='live');
  const manualId=await page.evaluate(()=>recSong().id);
  const manifest=await page.evaluate(async()=>{
   const song={...structuredClone(recSong()),id:'qa-original-groups-received',title:'受信する合成歌割',groupId:'qa-original-groups-group',recArtist:'OCHA NORMA',roster:[],blocks:{}};song.lines.forEach(l=>{delete l.cont;Object.assign(l,{parts:[],main:[],extra:[]});});
   const packet={app:'utacheck-recording-addition',version:1,group:{id:song.groupId,name:'合成の非公開REC',nopub:true},members:[],roster:[],songs:[song],plan:{year:2031,timezone:'Asia/Tokyo',slots:[{id:'qa-original-person-1',songId:song.id,name:'担当一人目',kind:'member',date:'2031-10-27',day:'10/27',place:'合成',at:720,min:90},{id:'qa-original-person-2',songId:song.id,name:'担当二人目',kind:'member',date:'2031-10-27',day:'10/27',place:'合成',at:810,min:90}]}};
   return {app:'utacheck-private-preparation',version:1,owner:'gogojoe312-max',revision:'qa-original-groups',createdAt:'2031-01-01T00:00:00Z',operations:[{id:'qa-original-groups-addition',type:'recording-addition',packet,sha256:await PrivatePreparation.digest(packet)}]};
  });
  await page.evaluate(manifest=>PrivatePreparation.apply(S,manifest.operations[0],{schedule:RecordingScheduleUpdate.apply,recording:mergeRecordingAddition}),manifest);
  const received=await checkProgressPreparation(page,{manifest,progressRelay:true});assert.equal(received.received.status,'applied');
  await page.evaluate(async manualId=>{
   S.recMode=true;S.rsongId=manualId;S.planPrep=0;const so=recSong();
   // Reproduce the already imported data: the source rows remain intact, but
   // old releases saved no continuation flag, even for merged assignment cells.
   so.lines.forEach(l=>{delete l.cont;if(/^C1[0-4]$/.test(l.lcell||'')){l.bars=l.lcell==='C12'?2:1;if(l.lcell==='C10')l.at=11;}if(l.lcell==='C10')l.sec='1A';if(l.lcell==='F10')l.sec='1B';if(l.lcell==='F13')l.sec='2A';});
   const slot=S.plan.slots.find(s=>s.id==='qa-original-person-1');Object.assign(slot,{a0:720,startAt:Date.now()-60000,secStart:Date.now()-60000,secCur:'1A',secLog:{'2A':3},takes:{'2A':4}});S.planFocus=slot.id;
   S.recs={kept:{dur:12,size:4}};S.pt={on:true,mode:'direct',url:'https://bridge.invalid',token:'synthetic-preserved-bridge-token'};
   if(typeof recordingAssignmentWorkbookCache!=='undefined')recordingAssignmentWorkbookCache.clear();
   Object.assign(U,{view:'setup',recArtistFilter:'',menu:null,sheet:null,secView:'',recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;save();await saveNow();render();
   window.__qaOriginalKept=JSON.stringify([so.lines,S.notes,S.recs,S.pt,slot.takes]);
  },manualId);
  const kept=await page.evaluate(()=>__qaOriginalKept);
  await page.locator('[data-act="ruse"][data-id="'+manualId+'"]').click();await page.locator('.sectabs [data-id="1A"]').click();
  await screenshot(page,width,'rec-original-groups-before-check');
  await page.waitForFunction(()=>{const rows=[...document.querySelectorAll('[data-lyric-line]')];return rows.length===5&&JSON.stringify(rows.map(r=>r.classList.contains('rec-assignment-start')))===JSON.stringify([false,false,false,true,false]);});
  assert.equal(await page.locator('[data-id="split"][data-act="rec-section-progress"],[data-id="merge"][data-act="rec-section-progress"],[data-act="rec-singer-filter"],.rec-recorded-toggle').count(),0,'Solo-only has no splitting controls or second completion button');
  assert(!/録り終わりにする/.test(await page.locator('#app').innerText()));
  const firstNumbers=await page.locator('[data-lyric-line] .lbl').allTextContents();
  await screenshot(page,width,'rec-original-merged-three-plus-two-solo');
  assert.equal(await page.locator('.sectabs [data-id="2A"]').getAttribute('aria-label'),'2A：録り終わり','Existing OK history stays recorded');
  await page.locator('[data-act="pnextsec"]').click();await page.waitForFunction(()=>S.plan.slots.find(s=>s.id==='qa-original-person-1').secCur==='1B'&&document.querySelector('.sectabs [data-id="1A"]')?.getAttribute('aria-label')==='1A：録り終わり');
  assert.equal(await page.locator('[data-act="rec-section-progress"][data-id="split"]').count(),1,'Mixed section offers optional split');
  const splitNumbers=await page.locator('[data-lyric-line]').evaluateAll(rows=>Object.fromEntries(rows.map(r=>[r.dataset.lyricLine,r.querySelector('.lbl').textContent])));
  await page.locator('[data-act="rec-section-progress"][data-id="split"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-lyric-line]').length===1&&recordingSingerFilter(recSong())==='unison');
  await page.locator('[data-act="pnextsec"]').click();await page.waitForFunction(()=>document.querySelector('[data-act="rec-singer-filter"][data-id="unison"]')?.textContent.includes('✓済')&&document.querySelectorAll('[data-lyric-line]').length===2);
  assert.equal(await page.evaluate(()=>S.plan.slots.find(s=>s.id==='qa-original-person-1').secCur),'1B');assert.equal(await page.evaluate(()=>S.plan.slots.find(s=>s.id==='qa-original-person-1').secLog['1B']),undefined);
  assert.equal(await page.locator('.sectabs [data-id="1B"]').getAttribute('aria-label'),'1B：一部済');
  assert.equal(await page.locator('[data-lyric-line]').evaluateAll((rows,numbers)=>rows.every(r=>r.querySelector('.lbl').textContent===numbers[r.dataset.lyricLine]),splitNumbers),true);
  await screenshot(page,width,'rec-existing-ok-unison-done-solo-remaining');
  await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  await page.evaluate(()=>{S.recMode=true;Object.assign(U,{view:'live',secView:'1B',menu:null,sheet:null,recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;render();});
  assert.match(await page.locator('[data-act="rec-singer-filter"][data-id="unison"]').innerText(),/✓済/);assert.doesNotMatch(await page.locator('[data-act="rec-singer-filter"][data-id="solo"]').innerText(),/✓済/);
  await page.locator('[data-act="rec-singer-filter"][data-id="solo"]').click();await page.locator('[data-act="pnextsec"]').click();await page.waitForFunction(()=>S.plan.slots.find(s=>s.id==='qa-original-person-1').a1!=null&&document.querySelector('.sectabs [data-id="1B"]')?.getAttribute('aria-label')==='1B：録り終わり');
  assert.equal(await page.evaluate(()=>S.plan.slots.find(s=>s.id==='qa-original-person-2').a0),undefined,'Finishing does not start the next person');
  assert.equal(await page.evaluate(()=>S.plan.slots.find(s=>s.id==='qa-original-person-1').secLog['2A']),3);
  assert.equal(await page.evaluate(kept=>JSON.stringify([recSong().lines,S.notes,S.recs,S.pt,S.plan.slots.find(s=>s.id==='qa-original-person-1').takes])===kept,kept),true);
  await page.locator('.sectabs [data-id="1A"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-lyric-line]').length===5);
  assert.deepEqual(await page.locator('[data-lyric-line] .lbl').allTextContents(),firstNumbers);
  await screenshot(page,width,'rec-existing-ok-completed-original-grouping-reloaded');
  await page.locator('[data-act="goplan"]').first().click();await page.locator('[data-act="psecgo"][data-id="qa-original-person-2"]').click();
  assert.equal(await page.locator('.sectabs [data-id="1A"]').getAttribute('aria-label'),'1A：未完了');assert.equal(await page.locator('[data-act="rec-section-progress"][data-id="split"]').count(),0);
  const original=await page.evaluate(async()=>{const b=await getClip('xls:'+recSong().xlsSourceId);return [...new Uint8Array(await b.arrayBuffer())];});assert.deepEqual(Buffer.from(original),bytes);
 }catch(e){console.error('REC exact-screen check state',await page.evaluate(()=>({status:PrivatePreparationUI.getStatus(),songs:S.rsongs.map(s=>s.id),filter:U.recArtistFilter,view:U.view,busy:U.busy})));await screenshot(page,width,'rec-original-groups-failure');throw e;
 }finally{await page.evaluate(async saved=>{S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();render();},saved);}
 return {recOriginalMergedAssignmentGroupsRestored:true,recExistingOKCompletesSplitAndWhole:true,recSoloOnlyHidesSplit:true,recLegacyOKHistoryPreserved:true,recSplitOKReloadAndOriginalBytesPreserved:true};
}
module.exports={checkRecordingOKOriginal};
