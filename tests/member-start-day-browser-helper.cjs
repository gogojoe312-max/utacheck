'use strict';
const assert=require('node:assert/strict');
async function checkMemberStartDay(page,width,{screenshot,dayOnly=false}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,url:location.href};});
 const restoreDate=await require('./browser-date.cjs').withBrowserDate(page,'2026-10-25T15:10:00Z');
 const sourceURL='https://gist.githubusercontent.com/qa/'+'c'.repeat(32)+'/raw/utacheck.json';
 let transport;
 const selected=()=>page.locator('#summary-show').inputValue();
 const nav=()=>page.locator('.member-review-nav [data-act="goabsent"]');
 try{
  const seed=await page.evaluate(async()=>{
   const formal=['斉藤','広本','米村','窪田','中山','西﨑','北原','筒井'],junk=['上窪田','下斉藤','中窪','広西','広西米','お客さん','間奏','A','B','北','斉','広'];
   const group={id:'member-day-group',name:'OCHA NORMA',src:'https://gist.githubusercontent.com/qa/'+'c'.repeat(32)+'/raw/utacheck.json'};
   const shows=[{id:'day-old',name:'2026/10/25 夜公演',ts:9000},{id:'day-today',name:'2026/10/26 夜公演',ts:2},{id:'day-next',name:'2026/10/27 夜公演',ts:3},{id:'day-latest',name:'2026/10/28 夜公演',ts:1},{id:'day-rh',name:'2026/10/30 通しリハ',ts:10000},{id:'day-unknown',name:'日付未設定の公演',ts:8000},{id:'day-multi',name:'2026/10/24.25',ts:4},{id:'day-manual',name:'2026/10/26 手動変更',ts:1}].map((sw,i)=>({...sw,groupId:'legacy-owner-group',deliveryGroupId:group.id,folder:i%2?'新しい公演':'過去の公演',absent:sw.id==='day-manual'?[]:['person-6'],...(sw.id==='day-latest'?{recoverySource:'original-workbooks'}:{})}));
   const make=sw=>({id:'song-'+sw.id,groupId:group.id,showId:sw.id,title:'合成曲 '+sw.id,roster:formal.map((_,i)=>'person-'+i),blocks:{},lines:[{t:'保持する合成歌詞 '+sw.id,label:'北原',labelRaw:'北原',raw:'北原',parts:['person-6']}]});
   S=Object.assign(structuredClone(S0),{viewer:false,recMode:false,ghToken:'',bkGistId:'',src:'',linkSrc:'',autoPub:false,deviceId:'day-owner',groups:[group],groupId:group.id,showId:'day-old',shows,songs:shows.map(make),members:[...formal,...junk].map((name,i)=>({id:'person-'+i,name})),rosters:{'OCHA NORMA':[...formal,...junk]},notes:shows.map(sw=>({id:'note-'+sw.id,songId:'song-'+sw.id,showId:sw.id,lineIdx:0,memberIds:['person-0'],memo:'指摘 '+sw.id,tags:[]})),memos:{},staffMemos:{},subs:{},subsMan:{},gsubs:{},assignmentEdits:{},rsongs:[{id:'keep-rec',title:'保持するREC',lines:[{t:'保持するREC歌詞'}]}],recs:{keep:{dur:2,size:3}},plan:{slots:[{id:'keep-slot',songId:'keep-rec',name:'保持する予定'}]}});
   S.shows.push({id:'foreign-new',name:'2026/11/1 別グループ公演',groupId:'foreign',ts:100000},{id:'hidden-new',name:'2026/11/2 非表示公演',hidden:1,ts:100001});S.songs.push({...make(S.shows.at(-2)),id:'foreign-song',groupId:'foreign'});
   for(const so of S.songs.filter(so=>so.groupId===group.id)){S.subs[so.showId+'|'+so.id]={0:['person-0']};recordAssignmentChange(so,'lines',0,['person-0']);}
   startupRecoveryNetworkHold=false;Object.assign(U,{view:'setup',songIdx:0,menu:null,sheet:null,picker:false,overview:false,showFilter:'',memberShowChosen:false,summaryReturn:null,memberName:'',sumOpen:''});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
   const wire=publicationData(group.id);wire.members.push(...junk.map(name=>({name})));window.__dayWire=wire;
   return {wire,owner:JSON.stringify(S),src:group.src};
  });
  transport=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(seed.wire)});await page.route(sourceURL+'*',transport);
  // Real settings button and preview receive/render, with the transport returning
  // the exact synthetic publication, including contaminated old labels/roster.
  await page.locator('[data-act="pvnow"][data-id="member-day-group"]').click();await page.waitForFunction(()=>!!preview&&U.view==='summary');
  if(dayOnly){await page.locator('#summary-show').selectOption('day-latest');await screenshot(page,width,'member-day-only-existing-source');assert.equal(await nav().innerText(),'欠席歌割\n北原が欠席','An explicitly selected active absence is reviewable on its performance');return {memberActiveAbsencePerPerformance:true};}
  assert.equal(await selected(),'day-rh','Member preview must open by performance date, not owner focus or creation ts');
  await page.locator('#summary-show').click();await page.keyboard.press('Escape');
  assert.equal(await nav().count(),1);assert.equal(await nav().getAttribute('data-id'),'day-rh');assert.equal(await nav().innerText(),'欠席歌割\n北原が欠席');
  await screenshot(page,width,'member-initial-latest-publication-preview');
  await page.locator('[data-act="endpv"]').click();await page.waitForFunction(()=>!preview);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(S))),JSON.parse(seed.owner),'Preview preserves the complete owner state, including other groups and REC data');
  await page.evaluate(async seed=>{
   startupRecoveryNetworkHold=true;
   S.viewer=true;S.deviceId='day-member';S.src=S.linkSrc=seed.src;S.srcGroup='OCHA NORMA';S.showId='day-old';U.view='summary';U.memberShowChosen=false;U.summaryReturn=null;U.showFilter='';rememberViewSelection();
   // Cached old songs, old showId, saved preference and old published focus all
   // coexist here. Do not clear them to manufacture an initial-source success.
   applySetlist(seed.wire);U.view='summary';renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
  },seed);
  assert.equal(await selected(),'day-rh');assert.match(await page.locator('.member-song').innerText(),/指摘 day-rh/);
  await page.locator('#summary-show').selectOption('day-old');assert.equal(await selected(),'day-old');assert.match(await page.locator('.member-song').innerText(),/指摘 day-old/);
  seed.wire.version+=1;await page.evaluate(wire=>{applySetlist(wire);renderPointers.clear();scrollingUntil=0;render(true);},seed.wire);assert.equal(await selected(),'day-old','An explicit historical selection stays put during a running-session receive');
  await page.locator('[data-act="summary-lyrics"]').click();await page.waitForSelector('[data-lyric-line="0"]');
  assert.equal(await page.locator('.member-change-badge').count(),1,'A selected active absence retains its changed-assignment badge on historical lyrics');assert.match(await page.locator('[data-lyric-line="0"] .lbl').innerText(),/斉藤/,'Hiding a notice keeps the effective changed assignment');
  await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  assert.equal(await selected(),'day-rh','Native reload must override the persisted historical preference on the first actual member screen');
  await screenshot(page,width,'member-latest-first-screen-after-reload');
  await page.evaluate(async()=>{localStorage.removeItem(viewSelectionKey());viewSelections.clear();S.showId='day-old';S.recMode=true;save();await saveNow();});await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);assert.equal(await selected(),'day-rh','A restored state without a separate device preference also opens latest');
  await page.clock.setSystemTime(new Date('2026-10-25T14:59:58Z'));await page.evaluate(()=>refreshMemberPresentation());assert.equal(await nav().getAttribute('data-id'),'day-rh','No other performance replaces the selected absence notice');await nav().click();await page.waitForFunction(()=>U.view==='absent');await page.locator('#summary-show').selectOption('day-multi');assert.equal(await page.locator('.member-absence-change').count(),1);await screenshot(page,width,'member-multiple-dates-selected-absence');await page.clock.runFor(2300);assert.equal(await page.evaluate(()=>U.view),'absent');assert.equal(await page.evaluate(()=>S.showId),'day-multi','An active absence remains accessible after Tokyo midnight');
  await page.locator('#summary-show').selectOption('day-today');assert.equal(await page.locator('.member-absence-change').count(),1);
  const options=await page.locator('#summary-member option').allTextContents();assert.deepEqual(options,['全員','斉藤','広本','米村','窪田','中山','西﨑','北原','筒井']);await page.locator('#summary-member').click();await page.keyboard.press('Escape');await page.locator('#summary-member').selectOption({label:'斉藤'});assert.equal(await page.locator('.member-absence-change').count(),1);
  seed.wire.version+=1;await page.evaluate(wire=>{applySetlist(wire);renderPointers.clear();scrollingUntil=0;render(true);},seed.wire);assert.equal(await page.evaluate(()=>U.view),'absent','Receiving another version must keep the active same-day change screen');assert.equal(await page.locator('#summary-member').inputValue(),await page.evaluate(()=>restoreViewerMember().id));assert.equal(await page.locator('.member-absence-change').count(),1);
  await screenshot(page,width,'member-changes-today-only');
  const content=await page.evaluate(()=>JSON.stringify([S.shows,S.songs,S.notes,S.pubNotes,S.subs,S.gsubs,S.assignmentEdits,S.rsongs,S.recs,S.plan]));
  await page.clock.setSystemTime(new Date('2026-10-26T14:59:59Z'));await page.clock.runFor(1200);assert.equal(await page.evaluate(()=>U.view),'absent');assert.equal(await page.locator('.member-absence-change').count(),1,'Active absence does not disappear after midnight');assert.equal(await page.locator('.member-absence-roster').innerText(),'北原が欠席');
  await page.evaluate(()=>{U.view='summary';renderPointers.clear();scrollingUntil=0;render(true);});await page.locator('#summary-show').selectOption('day-manual');assert.equal(await nav().count(),0,'Historical manual-only changes keep the previous same-day rule');
  await page.clock.setSystemTime(new Date('2026-10-26T14:59:58Z'));await page.evaluate(()=>{renderPointers.clear();scrollingUntil=0;refreshMemberPresentation();render(true);});assert.equal(await nav().innerText(),'歌割変更');await nav().click();await page.waitForFunction(()=>U.view==='absent');await page.clock.runFor(2300);await page.waitForFunction(()=>U.view==='summary');assert.equal(await nav().count(),0,'Manual-only notices expire at Tokyo midnight without switching to another show');
  assert.equal(await page.evaluate(()=>JSON.stringify([S.shows,S.songs,S.notes,S.pubNotes,S.subs,S.gsubs,S.assignmentEdits,S.rsongs,S.recs,S.plan])),content,'Date visibility never deletes received changes, assignments or notes');
  await screenshot(page,width,'member-manual-only-hidden-after-tokyo-midnight');
  await page.locator('#summary-show').selectOption('day-old');await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForFunction(()=>S.showId==='day-rh');assert.equal(await selected(),'day-rh','Resume handler also opens latest rather than a stale historical selection');
 }catch(error){console.error(await page.evaluate(()=>({show:S.showId,view:U.view,today:memberPerformanceIsToday(),date:memberDayKey(),visibleDay:memberVisibleDay,manualChanges:SONGS().map(so=>memberAbsenceChanges(so).length),pending:pendingRender,scrollingUntil,now:Date.now()})));await screenshot(page,width,'member-start-day-failure');throw error;}finally{
  await page.evaluate(async saved=>{preview=null;previewLoading=false;history.replaceState(null,'',saved.url);S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();renderSheet();render(true);},saved);
  if(transport)await page.unroute(sourceURL+'*',transport);
  await restoreDate();
 }
 return {memberLatestActualPreview:true,memberLatestCachedReceiveAndReload:true,memberLatestWithoutPreference:true,memberManualHistorySurvivesReceive:true,memberActiveReviewSurvivesReceive:true,memberActiveAbsencePerPerformance:true,memberManualChangesTodayOnly:true,memberMultipleDateAbsenceAccessible:true,memberAbsencePersistsAfterTokyoMidnight:true,memberTokyoMidnightRefresh:true,memberHistoryAssignmentsAndNotesPreserved:true,memberResumeSelectsLatest:true};
}
module.exports={checkMemberStartDay};
