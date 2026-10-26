'use strict';
const assert=require('node:assert/strict');
async function checkMemberFeedbackStart(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,url:location.href};});
 const restoreDate=await require('./browser-date.cjs').withBrowserDate(page,'2026-10-26T09:40:00Z');
 const sourceURL='https://gist.githubusercontent.com/qa/'+'d'.repeat(32)+'/raw/utacheck.json';let transport;
 try{
  const seed=await page.evaluate(async sourceURL=>{
   const formal=['橋田','吉田','小野田','村越','植村','松原','島川','上村','相馬'],junk=['お客さん','間奏','A','B','上窪田','下斉藤','北','斉','広'];
   const group={id:'feedback-group',name:'ロージークロニクル',src:sourceURL};
   const shows=[{id:'feedback-first',name:'10/26リハ',ts:100},{id:'feedback-second',name:'10/26リハ 2回目',ts:200},{id:'feedback-empty',name:'つばき10/26',ts:300}].map(sw=>({...sw,groupId:group.id,folder:sw.id==='feedback-empty'?'OpAct':'26IdolBattle',absent:[]}));
   const songs=shows.flatMap((sw,i)=>Array.from({length:i===2?2:7},(_,j)=>({id:sw.id+'-song-'+j,groupId:group.id,showId:sw.id,title:'保持する合成曲 '+i+'-'+j,roster:formal.map((_,k)=>'feedback-person-'+k),blocks:{A:['feedback-person-0'],B:['feedback-person-1']},lines:[{t:'保持する合成歌詞 '+i+'-'+j,label:'橋田',parts:['feedback-person-0']}]})));
   const notes=shows.flatMap((sw,i)=>Array.from({length:i===0?43:i===1?17:0},(_,j)=>({id:sw.id+'-note-'+j,songId:sw.id+'-song-'+j%7,showId:sw.id,lineIdx:0,memberIds:['feedback-person-'+j%9],tags:[],memo:'受信する合成指摘 '+i+'-'+j})));
   S=Object.assign(structuredClone(S0),{viewer:false,recMode:false,ghToken:'',bkGistId:'',autoPub:false,deviceId:'feedback-owner',src:'',linkSrc:'',groups:[group],groupId:group.id,showId:'feedback-first',shows,songs,notes,pubNotes:[],members:[...formal,...junk].map((name,i)=>({id:'feedback-person-'+i,name})),rosters:{'ロージークロニクル':[...formal,...junk]},memos:{},staffMemos:{'feedback-empty|feedback-empty-song-0':'非公開のスタッフメモ'},subs:{},gsubs:{},assignmentEdits:{},plan:{slots:[]}});
   startupRecoveryNetworkHold=false;Object.assign(U,{view:'setup',songIdx:0,menu:null,sheet:null,picker:false,overview:false,showFilter:'',memberShowChosen:false,summaryReturn:null,memberName:'',sumOpen:'',allShows:false});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
   return {wire:publicationData(group.id),owner:JSON.stringify(S)};
  },sourceURL);
  assert.equal(seed.wire.focusShow,'feedback-first');assert.equal(seed.wire.notes.length,60);assert(seed.wire.shows.some(sw=>sw.name==='つばき10/26'));
  transport=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(seed.wire)});await page.route(sourceURL+'*',transport);
  await page.locator('[data-act="pvnow"][data-id="feedback-group"]').click();await page.waitForFunction(()=>!!preview&&U.view==='summary');await page.waitForSelector('#summary-show');
  await screenshot(page,width,'member-feedback-received-latest-preview');
  assert.equal(await page.locator('#summary-show').inputValue(),'feedback-empty','The newest show remains the initial selection even before the owner adds feedback');assert.equal(await page.locator('.member-note').count(),0);await page.locator('#summary-show').selectOption('feedback-second');assert.equal(await page.locator('.member-note').count(),17);
  await page.locator('#summary-show').click();await page.keyboard.press('Escape');await page.locator('#summary-member').click();await page.keyboard.press('Escape');assert.deepEqual(await page.locator('#summary-member option').allTextContents(),['全員','橋田','吉田','小野田','村越','植村','松原','島川','上村','相馬']);
  await page.locator('[data-act="endpv"]').click();assert.equal(await page.evaluate(()=>JSON.stringify(S)),seed.owner,'Preview does not change owner data');
  await page.evaluate(async({wire,src})=>{
   S.viewer=true;S.deviceId='feedback-member';S.src=S.linkSrc=src;S.srcGroup='ロージークロニクル';S.showId='feedback-empty';S.notes=[];U.view='summary';U.memberShowChosen=false;rememberViewSelection();
   history.replaceState(null,'',location.pathname+'#g='+b64e(new TextEncoder().encode(JSON.stringify({src}))));
   S.setlistVer=0;await importFromLink();save();await saveNow();renderPointers.clear();scrollingUntil=0;render(true);
  },{wire:seed.wire,src:sourceURL});
  assert.equal(await page.locator('#summary-show').inputValue(),'feedback-empty');assert.equal(await page.locator('.member-note').count(),0);assert.equal(await page.evaluate(()=>S.pubNotes.length),60);
  const content=await page.evaluate(()=>JSON.stringify([S.shows,S.songs.map(({id,...song})=>song),S.notes,S.pubNotes.map(({id,songId,...note})=>note),S.members,S.rosters,S.subs,S.gsubs,S.memos,S.staffMemos]));
  await page.locator('#summary-show').selectOption('feedback-empty');assert.equal(await page.locator('.member-empty').count(),1);await screenshot(page,width,'member-feedback-newer-empty-still-selectable');
  await page.evaluate(async wire=>{applySetlist({...wire,version:wire.version+1});renderPointers.clear();scrollingUntil=0;render(true);save();await saveNow();},seed.wire);assert.equal(await page.locator('#summary-show').inputValue(),'feedback-empty','In-session explicit navigation survives receiving updates');
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);assert.equal(await page.locator('#summary-show').inputValue(),'feedback-empty');assert.equal(await page.locator('.member-note').count(),0);await page.locator('#summary-show').selectOption('feedback-second');assert.equal(await page.locator('.member-note').count(),17);
  await page.locator('#summary-member').selectOption({label:'橋田'});assert.equal(await page.locator('.member-note').count(),2);await page.locator('#summary-member').click();await page.keyboard.press('Escape');await screenshot(page,width,'member-feedback-latest-reloaded-member-picker');
  await page.locator('.member-note').first().click();await page.waitForSelector('[data-lyric-line="0"]');await page.locator('[data-act="summary-back"]').click();assert.equal(await page.locator('#summary-show').inputValue(),'feedback-second');
  await page.locator('#summary-member').selectOption('');await page.locator('#summary-show').selectOption('feedback-first');assert.equal(await page.locator('.member-note').count(),43);await page.locator('#summary-show').selectOption('feedback-empty');assert.equal(await page.locator('.member-note').count(),0);
  // IDs for newly received songs/notes are device-local. Compare source content
  // and counts across the actual receive/save/reload path, without deleting any.
  assert.equal(await page.evaluate(()=>S.songs.length),16);assert.equal(await page.evaluate(()=>S.pubNotes.length),60);assert.equal(await page.evaluate(()=>S.shows.length),3);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForFunction(()=>S.showId==='feedback-empty');assert.equal(await page.locator('.member-note').count(),0);await screenshot(page,width,'member-feedback-latest-on-resume');
  assert.equal(await page.evaluate(()=>JSON.stringify([S.shows,S.songs.map(({id,...song})=>song),S.notes,S.pubNotes.map(({id,songId,...note})=>note),S.members,S.rosters,S.subs,S.gsubs,S.memos,S.staffMemos])),content);
 }catch(error){await screenshot(page,width,'member-feedback-start-failure');throw error;}finally{
  await page.evaluate(async saved=>{preview=null;previewLoading=false;history.replaceState(null,'',saved.url);S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();renderSheet();render(true);},saved);
  if(transport)await page.unroute(sourceURL+'*',transport);await restoreDate();
 }
 return {memberLatestEmptyShowPreserved:true,memberFeedbackRealLinkReceive:true,memberFeedbackOriginalCountsPreserved:true,memberLatestEmptyShowReloadResume:true,memberFeedbackManualEmptyShowAccessible:true,memberFeedbackActualNoteNavigation:true};
}
module.exports={checkMemberFeedbackStart};
