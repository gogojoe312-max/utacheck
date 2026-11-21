'use strict';
const assert=require('node:assert/strict');
async function checkPublicationStatus(page,width,{screenshot}){
 await page.evaluate(async()=>{
  document.activeElement?.blur();
  S=Object.assign(structuredClone(S0),{viewer:false,recMode:false,deviceId:'status-owner',deliveryOwnerDeviceId:'status-owner',ghToken:'synthetic-only',autoPub:false,bkGistId:'',bkAt:Date.now(),src:'',groupId:'ocha',showId:'ocha-show',groups:[
   {id:'ocha',name:'OCHA NORMA',gistId:'11111111111111111111111111111111',src:'https://gist.githubusercontent.com/synthetic/11111111111111111111111111111111/raw/utacheck.json'},
   {id:'rosy',name:'ロージークロニクル',gistId:'22222222222222222222222222222222',src:'https://gist.githubusercontent.com/synthetic/22222222222222222222222222222222/raw/utacheck.json'}],
   members:[{id:'ocha-member',name:'斉藤'},{id:'rosy-member',name:'橋田'}],rosters:{'OCHA NORMA':['斉藤'],'ロージークロニクル':['橋田']},
   shows:[{id:'ocha-show',groupId:'ocha',name:'OCHA 合成LIVE',ts:2,absent:[]},{id:'rosy-show',groupId:'rosy',name:'ロージー 合成LIVE',ts:1,absent:[]}],songs:[],rsongs:[],notes:[],pubNotes:[],memos:{},staffMemos:{keep:'本人メモ'},recs:{keep:{dur:3}},plan:{slots:[]}});
  const make=(id,gid)=>Object.assign(buildSong({title:gid+' 合成曲',order:[gid==='ocha'?'斉藤':'橋田'],lines:[[gid==='ocha'?'斉藤':'橋田','保持する合成歌詞','A1','B1','','','','']]}),{id,groupId:gid,showId:gid+'-show',take:1});
  S.songs=[make('ocha-song','ocha'),make('rosy-song','rosy')];S.notes=[{id:'keep-note',songId:'ocha-song',showId:'ocha-show',lineIdx:0,memberIds:['ocha-member'],tags:['rhythm'],memo:'保存済みの指摘'}];
  S.recoveryDelivery={version:2,targets:S.groups.map(g=>({groupId:g.id,groupName:g.name,gistId:g.gistId,src:g.src,status:g.id==='ocha'?'ready':'blocked',sourceSha256:'a'.repeat(64),expectedRemoteSha256:'b'.repeat(64),sourceShowIds:[g.id+'-show'],preservedShowIds:[],heldLocalShowIds:[]}))};
  const data=publicationData('ocha',undefined,true);data.folderOrder=(data.folderOrder||[]).filter(name=>data.shows.some(sw=>sw.folder===name));S.groups[0].lastKey=payloadKey(data);S.groups[0].publishKeyPending=false;
  startupRecoveryNetworkHold=true;publishIssues=[];pushState='配信保留（1件）';Object.assign(U,{view:'live',showFilter:'',songIdx:0,menu:null,sheet:null,picker:false,overview:false,focus:'',draw:false});
  save();await saveNow();await idbPut('recovery:network-hold:v1',{sourceKind:'cloud-publication',seq:0});renderPointers.clear();scrollingUntil=0;render(true);
 });
 const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 const snapshot=async()=>stable(await page.evaluate(()=>JSON.parse(JSON.stringify({songs:S.songs,shows:S.shows,members:S.members,notes:S.notes,memos:S.memos,staffMemos:S.staffMemos,recs:S.recs,plan:S.plan}))));
 const before=await snapshot(),status=page.locator('[data-push-state]');
 await screenshot(page,width,'ocha-live-confirmed-other-group-held');
 assert.equal(await status.textContent(),' ・ 配信内容を確認済み');
 assert.equal(await page.evaluate(()=>publicationStatusText()),'配信保留（1件）');
 for(const gid of ['rosy','ocha']){
  await page.locator('[data-act="picker"]').click();await page.locator('.mask [data-act="jumpshow"][data-id="'+gid+'-show"]').click();await page.locator('.mask [data-act="cancel"]').click();
  assert.equal(await page.locator('[data-push-state]').textContent(),gid==='ocha'?' ・ 配信内容を確認済み':' ・ 配信保留（1件）');
 }
 await page.evaluate(()=>{window.keptStatusLyric=document.querySelector('.scroll');S.groups[0].publishKeyPending=true;renderPublishStatus();});
 assert.equal(await status.textContent(),' ・ 未送信');assert(await page.evaluate(()=>window.keptStatusLyric===document.querySelector('.scroll')));
 await page.evaluate(()=>{S.groups[0].publishKeyPending=false;S.recoveryDelivery.targets[0].status='uncertain';renderPublishStatus();});
 assert.match(await status.textContent(),/配信結果の確認待ち（1件）/);await screenshot(page,width,'ocha-own-unconfirmed-publication-stays-visible');
 await page.evaluate(async()=>{S.recoveryDelivery.targets[0].status='ready';save();await saveNow();renderPublishStatus();});
 assert.deepEqual(await snapshot(),before);await page.reload();await page.waitForFunction(()=>normalStartupInitialized);assert.equal(await page.evaluate(()=>startupRecoveryNetworkHold),true,'The persisted recovery hold remains active after native reload');
 await page.evaluate(()=>{U.view='live';U.songIdx=0;U.picker=false;renderPointers.clear();scrollingUntil=0;render(true);});
 assert.equal(await page.locator('[data-push-state]').textContent(),' ・ 配信内容を確認済み');
 assert.equal(await page.evaluate(()=>S.recoveryDelivery.targets.find(t=>t.groupId==='rosy').status),'blocked');
 assert.deepEqual(await snapshot(),before);await screenshot(page,width,'ocha-live-status-after-reload');
 return {livePublicationStatusScopedToDeliveryGroup:true,otherGroupHoldPreserved:true,ownPendingAndUnknownRemainVisible:true,livePublicationStatusReload:true};
}
module.exports={checkPublicationStatus};
