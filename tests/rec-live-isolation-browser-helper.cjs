'use strict';
const assert=require('node:assert/strict');
const {clone,digest}=require('./recording-preparation-fixture.cjs');
async function checkRecLiveIsolation(page,width,{screenshot,receive,append,anchor}){
 // A real fresh receive, then the two restored sources that used to promote a
 // REC group: an empty LIVE row and a hidden recording row/song. Do not clean
 // either source to obtain a passing selector. Shared roster members stay too.
 await page.evaluate(()=>{recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:true};recordingInboxIntegration=setupRecordingInboxIntegration();});
 const packet=clone(anchor.packet),groupId='qa-rec-only-fresh';
 packet.group={id:groupId,name:'合成REC専用 リバイバル検証',nopub:true};
 packet.songs.forEach((s,i)=>{s.id='qa-rec-only-song-'+i;s.groupId=groupId;s.title='合成REC専用曲';s.recArtist='合成歌手';});
 const year=await page.evaluate(()=>S.plan.year);
 packet.plan.year=year;packet.plan.slots.forEach((s,i)=>{s.id='qa-rec-only-slot-'+i;s.songId=packet.songs[0].id;s.date=year+'-10-20';s.day='10/20';});
 const operation={id:'qa-rec-only-addition',type:'recording-addition',packet,sha256:digest(packet)};
 if(await page.locator('[data-act="recback"]').count())await page.locator('[data-act="recback"]').click();
 if(await page.locator('[data-act="go-setup"]').count())await page.locator('[data-act="go-setup"]').click();
 append(operation);const got=await receive();assert(['applied','current'].includes(got.status),JSON.stringify({got,status:await page.evaluate(()=>PrivatePreparationUI.getStatus())}));
 await page.waitForFunction(()=>!PrivatePreparationUI.isReceiving());
 assert.equal(await page.evaluate(()=>!!S.privatePreparations['qa-rec-only-addition']),true);
 await page.evaluate(({groupId})=>{
  if(!S.groups.some(g=>g.name==='配信しない'))S.groups.push({id:'qa-private-storage',name:'配信しない',nopub:true});
  S.shows.push({id:'qa-hidden-rec-show',groupId,name:'レコーディング',hidden:1,ts:0},{id:'qa-empty-rec-show',groupId,name:'合成RECの空行',ts:0});
  const hidden={id:'qa-hidden-rec-song',showId:'qa-hidden-rec-show',groupId,title:'保持する旧REC曲',take:1,roster:['p1'],blocks:{},lines:[{t:'旧RECの歌詞と履歴を保持',parts:['p1']}]};hidden.sig=songSig(hidden);S.songs.push(hidden);
  S.rosters={...S.rosters,'公開':['甲','乙']};
  S.notes.push({id:'qa-live-isolation-note',showId:'live-show',songId:'live-song',lineIdx:0,lineEnd:null,from:0,to:1,memberIds:['p1'],tags:[],memo:'LIVEの指摘を保持',ts:1});
  // A normal roster must still win over a REC roster containing the SAME IDs.
  S.songs.find(s=>s.id==='live-song').groupId='live-group';
  if(!S.shows.some(s=>s.id===REC_SHOW))S.shows.push({id:REC_SHOW,name:'レコーディング',ts:0,hidden:1});
  S.liveShow='live-show';S.recMode=true;Object.assign(U,{view:'setup',menu:null,sheet:null,picker:false,showRecovery:false});renderPointers.clear();scrollingUntil=0;render(true);
 },{groupId});
 const snapshot=()=>page.evaluate(()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','rosters','notes','recs','plan','privatePreparations','recordingUpdateHeads'].map(k=>[k,S[k]]))));
 const before=JSON.parse(await snapshot());
 const checkLive=async suffix=>{
  await page.locator('[data-act="recon"]').click();await page.waitForSelector('[data-settings-panel="live-materials"]');
  await screenshot(page,width,'rec-only-live-settings-'+suffix);
  assert.equal(await page.locator('[data-act="useshow"][data-id="qa-empty-rec-show"]').count(),0,'An empty restored REC row is not a LIVE performance');
  assert(!(await page.locator('[data-act="showfilter"]').allTextContents()).some(t=>/合成REC/.test(t)),'REC-only groups must not appear in the actual LIVE artist controls');
  await page.locator('[data-act="go-live"]').first().click();await page.locator('[data-act="picker"]').click();
  assert.equal(await page.locator('.mask [data-act="showfilter"][data-id="qa-rec-only-fresh"]').count(),0);
  assert.equal(await page.locator('.mask [data-act="showfilter"][data-id="dot-group"]').count(),0);
  await screenshot(page,width,'rec-only-live-performance-picker-'+suffix);
  await page.locator('.mask [data-act="cancel"]').click();await page.locator('[data-act="go-setup"]').click();
  await page.locator('[data-act="show-actions"][data-id="live-show"]').click();await page.locator('[data-act="show-delivery"]').click();
  assert(!(await page.locator('.show-delivery-option').allTextContents()).some(t=>/合成REC/.test(t)));
  await page.locator('.mask [data-act="closemenu"]').first().click();
  await page.locator('[data-act="show-actions"][data-id="live-show"]').click();await page.locator('[data-act="editshow"]').click();
  assert(!(await page.locator('#org-group option').allTextContents()).some(t=>/合成REC/.test(t)));
  await page.locator('.mask [data-act="org-close"]').first().click();
  await page.evaluate(()=>{U.view='summary';U.mode='song';U.allShows=false;renderPointers.clear();scrollingUntil=0;render(true);});
  await page.locator('[data-act="mode"][data-id="member"]').click();
  await page.locator('[data-act="sumopen"][data-id="p1"]').first().click();
  const summary=await page.locator('#app').innerText();assert(summary.includes('LIVEの指摘を保持'));assert(!summary.includes('合成REC'),'REC rosters sharing real LIVE members must not form LIVE feedback headings');
  await screenshot(page,width,'rec-only-live-member-feedback-'+suffix);
  await page.locator('[data-act="go-live"]').click();await page.locator('[data-act="go-setup"]').click();await page.locator('[data-act="recon"]').click();await page.waitForSelector('[data-act="ruse"][data-id="qa-rec-only-song-0"]');
  await screenshot(page,width,'rec-only-rec-materials-preserved-'+suffix);
 };
 await checkLive('received');
 assert.equal(await page.evaluate(()=>S.groups.find(g=>g.id==='qa-rec-only-fresh').recordingOnly),true,'Fresh REC additions retain their import provenance even when songs are later moved');
 assert.deepEqual(JSON.parse(await snapshot()),before,'Navigation must not rewrite either mode, assignments, notes, history, source or sharing');
 await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('native save');});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);
 assert.deepEqual(JSON.parse(await snapshot()),before,'Native reload retains the original failure sources and all personal data');
 await page.evaluate(()=>{S.viewer=false;S.recMode=true;recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:true};recordingInboxIntegration=setupRecordingInboxIntegration();startupRecoveryNetworkHold=true;Object.assign(U,{view:'setup',menu:null,sheet:null,picker:false});renderPointers.clear();scrollingUntil=0;render(true);});
 await checkLive('native-reload');assert.deepEqual(JSON.parse(await snapshot()),before);
 await page.locator('[data-act="ruse"][data-id="qa-rec-only-song-0"]').click();await page.locator('[data-act="goplan"]').first().click();await page.waitForSelector('.plan-row');assert.equal(await page.locator('.plan-row').count(),3);
 await screenshot(page,width,'rec-only-progression-preserved');
 return {recOnlyFreshReceiveStaysOutOfLive:true,recOnlyHiddenAndEmptyShowsRetained:true,recOnlyLiveSelectorsAndMemberFeedbackChecked:true,recOnlyRecLyricsPlanHistorySaveReloadPreserved:true};
}
module.exports={checkRecLiveIsolation};
