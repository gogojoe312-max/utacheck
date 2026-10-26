'use strict';
const assert=require('node:assert/strict');
async function checkNoteNavigationDelivery(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,url:location.href};});
 const restoreDate=await require('./browser-date.cjs').withBrowserDate(page,'2026-10-26T09:40:00Z');
 const gistId='e'.repeat(32),sourceURL='https://gist.githubusercontent.com/qa/'+gistId+'/raw/utacheck.json',apiURL='https://api.github.com/gists/'+gistId;
 let remote,patches=0,holdPatch=false,releasePatch,patchWaiting=false;
 const api=async route=>{
  if(route.request().method()==='PATCH'){
   if(holdPatch){patchWaiting=true;await new Promise(resolve=>{releasePatch=resolve;});}
   remote=JSON.parse(route.request().postDataJSON().files['utacheck.json'].content);patches++;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:gistId,files:{'utacheck.json':{content:JSON.stringify(remote),raw_url:sourceURL}}})});
 };
 const raw=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(remote)});
 try{
  remote=await page.evaluate(async({gistId,src})=>{
   const group={id:'nav-delivery',name:'OCHA NORMA',gistId,src,key:''};
   S=Object.assign(structuredClone(S0),{viewer:false,recMode:false,ghToken:'synthetic-test-token',bkGistId:'',autoPub:true,deviceId:'nav-owner',deliveryOwnerDeviceId:'nav-owner',src:'',linkSrc:'',groups:[group],groupId:group.id,showId:'nav-show',shows:[{id:'nav-show',name:'10/26リハ',groupId:group.id,absent:[]}],songs:[{id:'nav-song',title:'合成の配信確認曲',showId:'nav-show',groupId:group.id,roster:['nav-member'],blocks:{},lines:[{t:'画面を移動しても保存される合成歌詞',label:'斉藤',parts:['nav-member']}]}],rsongs:[{id:'nav-rec',title:'保持するREC',recArtist:'OCHA NORMA',lines:[{t:'保持するREC歌詞'}]}],members:[{id:'nav-member',name:'斉藤'}],rosters:{'OCHA NORMA':['斉藤','広本','米村','窪田','中山','西﨑','北原','筒井']},notes:[],pubNotes:[],memos:{},subs:{},gsubs:{},plan:{slots:[]}});
   startupRecoveryNetworkHold=false;clearTimeout(pushTimer);pushTimer=null;lastPushAt=0;Object.assign(U,{view:'live',songIdx:0,menu:null,sheet:null,picker:false,overview:false,showFilter:group.id,memberShowChosen:false,summaryReturn:null,memberName:'',sumOpen:'',allShows:false});
   const wire=publicationData(group.id);group.lastKey=payloadKey(wire);window.__navSongs=JSON.stringify(S.songs);window.__navRec=JSON.stringify(S.rsongs);renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);return wire;
  },{gistId,src:sourceURL});
  await page.route(apiURL,api);await page.route(sourceURL+'*',raw);
  const note=async memo=>{await page.locator('[data-lyric-line="0"] .txt [data-c="1"]').click();await page.locator('#memo').fill(memo);await page.locator('.note-close').click();await page.waitForFunction(()=>!U.sheet);};
  const advance=async()=>{await page.clock.runFor(8500);await page.waitForFunction(()=>!publishInFlight);};
  await note('設定へ移っても配信する指摘');await page.locator('[data-act="go-setup"]').click();await advance();assert.equal(patches,1);assert.equal(remote.notes.length,1);assert.equal(remote.notes[0].memo,'設定へ移っても配信する指摘');
  await page.locator('[data-act="go-live"]').click();await note('RECへ移っても配信する指摘');await page.locator('[data-act="go-setup"]').click();await page.locator('[data-act="recon"]').click();await advance();assert.equal(patches,2);assert.equal(remote.notes.length,2);assert.equal(remote.notes[1].showId,'nav-show');assert.equal(await page.evaluate(()=>S.recMode),true);await screenshot(page,width,'note-delivery-after-rec-navigation');
  await page.locator('[data-act="recon"]').click();await page.locator('[data-act="go-live"]').click();await note('メンバー画面へ移っても配信する指摘');await page.locator('[data-act="go-setup"]').click();
  holdPatch=true;await page.locator('[data-act="pvnow"][data-id="nav-delivery"]').click();
  await page.waitForFunction(()=>previewLoading||!!preview);assert.equal(await page.evaluate(()=>!!preview),false,'Opening the member screen must wait for the pending note publication, rather than showing stale remote feedback');
  for(let i=0;i<40&&!patchWaiting;i++)await page.waitForTimeout(50);assert(patchWaiting,'A pending note starts delivery before replacing the editor state');assert.equal(await page.locator('#operation-progress').isVisible(),true);await screenshot(page,width,'note-delivery-preview-waits-for-patch');
  releasePatch();await page.waitForFunction(()=>!!preview&&U.view==='summary');await page.waitForSelector('.member-note');assert.equal(patches,3);assert.equal(remote.notes.length,3);assert.equal(await page.locator('.member-note').count(),3);assert.match(await page.locator('#app').innerText(),/メンバー画面へ移っても配信する指摘/);await screenshot(page,width,'note-delivery-preview-received-after-navigation');
  await page.locator('[data-act="endpv"]').click();assert.equal(await page.evaluate(()=>S.notes.length),3);assert.equal(await page.evaluate(()=>JSON.stringify(S.songs)===__navSongs&&JSON.stringify(S.rsongs)===__navRec),true);
  await page.evaluate(async wire=>{
   S.autoPub=false;S.ghToken='';S.groups[0].gistId='';S.viewer=true;S.deviceId='nav-separate-member';S.notes=[];S.src=S.linkSrc=S.groups[0].src;U.view='summary';U.memberShowChosen=false;applySetlist(wire);U.view='summary';startupRecoveryNetworkHold=true;renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
  },remote);
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);assert.equal(await page.locator('.member-note').count(),3);await page.locator('#summary-member').click();await page.keyboard.press('Escape');await page.locator('.member-note').last().click();await page.waitForSelector('[data-lyric-line="0"]');await page.locator('[data-act="summary-back"]').click();assert.equal(await page.locator('.member-note').count(),3);await screenshot(page,width,'note-delivery-member-save-reload');
 }catch(error){await screenshot(page,width,'note-navigation-delivery-failure');throw error;}finally{
  if(releasePatch)releasePatch();await page.unroute(apiURL,api);await page.unroute(sourceURL+'*',raw);
  await page.evaluate(async saved=>{document.activeElement?.blur();clearTimeout(pushTimer);pushTimer=null;preview=null;previewLoading=false;history.replaceState(null,'',saved.url);S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();renderSheet();render(true);},saved);await restoreDate();
 }
 return {noteDeliveryAfterSettingsNavigation:true,noteDeliveryAfterRECNavigation:true,noteDeliveryBeforeMemberPreview:true,noteDeliveryWaitVisible:true,noteDeliveryMemberReceiveSaveReload:true};
}
module.exports={checkNoteNavigationDelivery};
