'use strict';
const assert=require('node:assert/strict');
async function checkRecordingSegmentSections(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,catalog:ArrangementCatalog};});
 try{
  await page.evaluate(async()=>{
   S=Object.assign(JSON.parse(JSON.stringify(S0)),{recMode:true,viewer:false,ghToken:'',src:'',autoPub:false,
    rsongs:[{id:'segment-rec',title:'REC改行と区切りの確認',intro:74,lines:[{t:'前のフレーズ😀次のフレーズ',lyricBreaks:[7],bars:1,sec:'2B'},{t:'後続のフレーズ',bars:1},{t:'終わり',sec:'D',bars:1}]}],rsongId:'segment-rec',notes:[],plan:{slots:[]}});
   S.secWords=['2B','Rap','D'];S.recBars=true;startupRecoveryNetworkHold=true;
   Object.assign(U,{view:'live',songIdx:0,secView:'',recFocusId:'',menu:null,sheet:null,picker:false,overview:false,draw:false,recSchedulePaused:true});
   renderPointers.clear();scrollingUntil=0;save();await saveNow();render();
  });
  const row=()=>page.locator('[data-lyric-line="0"]');
  await row().locator('[data-act="rbar"][data-segment="1"]').click();
  await page.locator('.mask [data-act="rsecq"][data-id="Rap"]').click();
  const check=async()=>{
   assert.deepEqual(await page.evaluate(()=>({root:recSong().lines[0].sec,next:recSong().lines[0].recBarOverrides?.[7]?.sec})),{root:'2B',next:'Rap'});
   assert.deepEqual(await row().locator('[data-act="rbar"]').allTextContents(),['2B 75','Rap 76']);
   assert.equal(await row().locator('#sec-Rap').evaluate(el=>el.previousElementSibling.dataset.c),'6');
   assert.equal(await row().locator('#sec-Rap').evaluate(el=>el.nextElementSibling.nextElementSibling.dataset.c),'7');
  };
  await check();await screenshot(page,width,'rec-segment-section');
  await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('save');});
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  await page.evaluate(()=>{S.recMode=true;S.rsongId='segment-rec';Object.assign(U,{view:'live',songIdx:0,secView:'',overview:false,recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;render();});
  await check();
  await page.locator('[data-act="jumpsec"][data-id="Rap"]').click();
  assert.equal(await row().locator('[data-c="0"]').count(),0);
  assert.equal(await row().locator('[data-c="7"]').count(),1);
  assert.deepEqual(await row().locator('[data-act="rbar"]').allTextContents(),['Rap 76']);
  await screenshot(page,width,'rec-rap-filter');
  await row().locator('[data-act="rbar"]').click();
  assert.match(await page.locator('.mask .sheet').innerText(),/^次のフレーズ/);
  await page.locator('.mask [data-act="closemenu"]').last().click();
  await page.evaluate(()=>{U.secView='';U.overview=true;renderPointers.clear();scrollingUntil=0;render();});
  assert.equal(await page.locator('#sec-Rap').evaluate(el=>el.nextElementSibling.dataset.segment),'1');
  await page.evaluate(()=>{U.view='recprint';U.overview=false;renderPointers.clear();scrollingUntil=0;render();});
  assert.equal(await page.locator('tr[data-line="0"][data-segment="1"] .prn').innerText(),'Rap 76');
  // Unrelated restored LIVE cuts used to replace the REC lyric DOM after opening.
  await page.evaluate(async()=>{
   const live={id:'unrelated-arrangement',title:'合成LIVE曲',sheetName:'Jank',lines:[{t:'KEEP',lcell:'B1'},{t:'CUT',lcell:'B2'}]};
   S.songs=[live];ArrangementCatalog=[{id:'rec-no-redraw',sheetName:'Jank',rowCount:2,fingerprint:await ArrangementVerification.digest(ArrangementVerification.canonical(live)),cutCells:['B2'],sourceCutCells:[]}];
   save();await saveNow();U.view='live';U.secView='';renderPointers.clear();scrollingUntil=0;render();
   window.__recStableNode=app.querySelector('[data-lyric-line="0"]');const sc=app.querySelector('.scroll');sc.scrollTop=80;window.__recStableScroll=sc.scrollTop;
   await ArrangementVerificationUI.check();
  });
  await page.waitForFunction(()=>ArrangementVerificationUI.getStatus('unrelated-arrangement')?.saved);
  assert.equal(await page.evaluate(()=>app.querySelector('[data-lyric-line="0"]')===__recStableNode),true,'Unrelated background repair must preserve the actual REC lyric DOM');
  assert.equal(await page.evaluate(()=>app.querySelector('.scroll').scrollTop===__recStableScroll),true);
  assert.equal(await page.evaluate(async()=>unpackState(JSON.parse(await loadRaw())).songs[0].lines[1].cut),1,'Background repair still saves its actual correction');
  await page.waitForTimeout(5100);
  assert.equal(await page.evaluate(()=>app.querySelector('[data-lyric-line="0"]')===__recStableNode),true,'Periodic audit must preserve REC DOM');
  await screenshot(page,width,'rec-background-stable');
 }finally{
  await page.evaluate(async saved=>{S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));ArrangementCatalog=saved.catalog;startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render();},saved);
 }
 return {recSegmentSectionSavedReloaded:true,recSectionFilterAndPrint:true,recBackgroundDOMStable:true};
}
module.exports={checkRecordingSegmentSections};
