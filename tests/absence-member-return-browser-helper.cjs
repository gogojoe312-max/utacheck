'use strict';
const assert=require('node:assert/strict');
async function checkAbsenceMemberReturn(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,url:location.href};});
 const restoreDate=await require('./browser-date.cjs').withBrowserDate(page,'2026-11-01T01:23:00Z');
 const sourceURL='https://gist.githubusercontent.com/qa/'+'e'.repeat(32)+'/raw/utacheck.json';let transport;
 try{
  const seed=await page.evaluate(async src=>{
   const roster=['北原','米村','斉藤','窪田','筒井','西﨑','広本','中山','西崎','斉','広','間奏','お客さん','A','B'];
   const make=(id,title)=>({id,title,showId:'member-absence-show',groupId:'member-absence-group',roster:roster.slice(),blocks:{},lines:Array.from({length:24},(_,i)=>({t:i===2||i===7?'同じ合成歌詞':'メンバーが見る合成歌詞 '+i,label:i%2?'米村・窪田':'米村',parts:i%2?['米村','窪田']:['米村'],main:i%2?['米村','窪田']:['米村'],extra:[]}))});
   S={...structuredClone(S0),viewer:false,recMode:false,ghToken:'',src:'',bkGistId:'',autoPub:false,deviceId:'absence-return-owner',showId:'member-absence-show',groupId:'member-absence-group',groups:[{id:'member-absence-group',name:'OCHA NORMA',src},{id:'private',name:'配信しない',nopub:true}],shows:[{id:'member-absence-show',groupId:'member-absence-group',name:'11/1米村欠席',absent:['米村']}],songs:[make('member-absence-first','先の合成曲'),make('member-absence-target','欠席変更の合成曲')],members:roster.map(name=>({id:name,name})),rosters:{'OCHA NORMA':roster.slice()},notes:[{id:'kept-note',showId:'member-absence-show',songId:'member-absence-target',lineIdx:7,memberIds:['斉藤'],tags:[],memo:'既存の指摘を保持'}],pubNotes:[],subs:{},subsMan:{},gsubs:{},draws:{keep:[1]},recs:{keep:{dur:8,size:10}},plan:{slots:[]}};
   for(const so of S.songs){so.sig=songSig(so);S.subs[S.showId+'|'+so.id]=Object.fromEntries(so.lines.map((l,i)=>[i,i%2?['斉藤','窪田']:['斉藤']]));}
   startupRecoveryNetworkHold=false;Object.assign(U,{view:'setup',songIdx:0,menu:null,sheet:null,picker:false,overview:false,draw:false,showFilter:'',memberShowChosen:false,memberName:'',allShows:false,summaryReturn:{view:'summary',showId:S.showId,allShows:false,mode:'member',scrollTop:0}});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
   return {wire:publicationData('member-absence-group'),owner:JSON.stringify(S)};
  },sourceURL);
  transport=route=>route.request().method()==='GET'?route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(seed.wire)}):route.abort();await page.route(sourceURL+'*',transport);
  const roundTrip=async suffix=>{
   await page.locator('[data-act="goabsent"]').click();await page.locator('.member-absence-change').first().waitFor({state:'visible'});if(suffix==='native-reload')await page.locator('#summary-member').selectOption({label:'斉藤'});
   const id=await page.evaluate(()=>S.songs.find(s=>s.title==='欠席変更の合成曲').id),link=page.locator('.member-absence-change[data-id="'+id+'"][data-i="7"]');
   await link.scrollIntoViewIfNeeded();const scroll=await page.locator('#app > .scroll').evaluate(el=>el.scrollTop),selection=await page.locator('#summary-member').inputValue();assert(scroll>300,'Keep the supplied scrolled second-song condition');
   await screenshot(page,width,'member-absence-list-before-'+suffix);await link.click();await page.locator('[data-lyric-line="7"]').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>song().id),id);assert(await page.locator('[data-lyric-line="7"]').evaluate(el=>el.classList.contains('member-lyric-target')));await screenshot(page,width,'member-absence-lyric-'+suffix);
   await page.locator('[data-act="summary-back"]').click();await page.waitForFunction(()=>U.view!=='live');await screenshot(page,width,'member-absence-back-result-'+suffix);assert.equal(await page.evaluate(()=>U.view),'absent','戻る must restore 歌割変更, not the initial 指摘 screen');
   await link.waitFor({state:'visible'});assert.equal(await page.locator('#summary-member').inputValue(),selection);assert(Math.abs(await page.locator('#app > .scroll').evaluate(el=>el.scrollTop)-scroll)<=2,'Return restores the exact absence-list scroll position');assert.equal(await page.locator('[data-act="setassign"]').count(),0);await screenshot(page,width,'member-absence-restored-position-'+suffix);
  };
  await page.locator('[data-act="pvnow"][data-id="member-absence-group"]').click();await page.waitForFunction(()=>!!preview&&U.view==='summary');await page.locator('#summary-show').waitFor({state:'visible'});await roundTrip('owner-preview');
  await page.locator('[data-act="go-live"]').click();await page.locator('[data-act="endpv"]').waitFor({state:'visible'});await page.locator('[data-act="endpv"]').click();assert.equal(await page.evaluate(()=>JSON.stringify(S)),seed.owner,'Preview round-trip must not change owner data or mark owner records read');
  await page.evaluate(async src=>{S.viewer=true;S.deviceId='absence-return-member';S.src=S.linkSrc=src;S.srcGroup='OCHA NORMA';S.setlistVer=0;U.view='summary';U.memberShowChosen=false;history.replaceState(null,'',location.pathname+'#g='+b64e(new TextEncoder().encode(JSON.stringify({src}))));await importFromLink();save();await saveNow();renderPointers.clear();scrollingUntil=0;render(true);},sourceURL);
  const content=()=>page.evaluate(()=>{const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;return JSON.stringify(ordered([S.shows,S.songs,S.members,S.rosters,S.notes,S.pubNotes,S.subs,S.gsubs]));});const before=await content();
  await roundTrip('received-member');assert.equal(await content(),before);
  await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);await roundTrip('native-reload');assert.equal(await content(),before);
  return {memberAbsenceBackRestoresListAndScroll:true,memberAbsenceBackOwnerPreviewExactScreen:true,memberAbsenceBackRealLinkReceiveAndNativeReload:true,memberAbsenceBackPreservesOwnerAndReceivedData:true};
 }catch(error){await screenshot(page,width,'member-absence-return-failure');throw error;}finally{
  await page.evaluate(async s=>{document.activeElement?.blur();preview=null;previewLoading=false;history.replaceState(null,'',s.url);S=JSON.parse(s.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(s.ui));startupRecoveryNetworkHold=s.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();renderSheet();render(true);},saved);
  if(transport)await page.unroute(sourceURL+'*',transport);await restoreDate();
 }
}
module.exports={checkAbsenceMemberReturn};
