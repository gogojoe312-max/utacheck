'use strict';
const assert=require('node:assert/strict');
async function checkAbsenceNavigation(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold};});
 try{
  await page.evaluate(async()=>{
   const roster=['北原','米村','斉藤','窪田','筒井','西﨑','広本','中山','西崎'];
   const make=(id,title,count)=>({id,title,showId:'jump-show',groupId:'jump-group',roster,blocks:{A:['米村']},blockRows:[],lines:Array.from({length:count},(_,i)=>({t:i===2||i===7?'重複する合成フレーズ':'合成の確認対象 '+id+' '+i,parts:i%2?['米村','窪田']:['米村'],main:i%2?['米村','窪田']:['米村'],extra:[],label:'米村',cell:'A'+(i+1),lcell:'B'+(i+1)}))});
   S={...structuredClone(S0),viewer:false,recMode:false,autoPub:false,ghToken:'',src:'',bkGistId:'',groupId:'jump-group',showId:'jump-show',groups:[{id:'jump-group',name:'OCHA NORMA'},{id:'private',name:'配信しない',nopub:true}],rosters:{'OCHA NORMA':roster.slice()},members:roster.map(name=>({id:name,name})),shows:[{id:'jump-show',groupId:'jump-group',name:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date()).replace(/-/g,'/')+' 合成公演',absent:['米村']}],songs:[make('jump-first','前の合成曲',24),make('jump-target','対象の合成曲',22)],rsongs:[],subs:{},subsMan:{},gsubs:{'jump-show|jump-target':{A:['斉藤']}},notes:[{id:'jump-kept-note',songId:'jump-target',showId:'jump-show',lineIdx:7,memberIds:['斉藤'],tags:[],memo:'元からある指摘を保持'}],pubNotes:[],draws:{kept:[1,2]},recs:{kept:{dur:8,size:10}},plan:{slots:[]}};
   S.songs[1].lines[12].label='A';S.songs[1].lines[12].parts=['米村'];
   for(const so of S.songs){const key='jump-show|'+so.id;S.subs[key]={};S.subsMan[key]={};so.lines.forEach((l,i)=>{if(l.label!=='A'){S.subs[key][i]=i%2?['斉藤','窪田']:['斉藤'];S.subsMan[key][i]=1;}});}
   S.songs.forEach(so=>so.sig=songSig(so));startupRecoveryNetworkHold=true;Object.assign(U,{view:'absent',songIdx:0,showFilter:'jump-group',menu:null,sheet:null,picker:false,focus:'北原',draw:true,overview:true,allShows:false});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
  });
  const fingerprint=()=>page.evaluate(()=>JSON.parse(JSON.stringify({songs:S.songs,members:S.members,rosters:S.rosters,notes:S.notes,draws:S.draws,recs:S.recs,subs:S.subs,gsubs:S.gsubs,shows:S.shows,groups:S.groups})));
  const before=await fingerprint();
  const jump=async suffix=>{
   const card=page.locator('.card').filter({has:page.locator('b', {hasText:/^対象の合成曲$/})});
   const text=card.getByText('重複する合成フレーズ',{exact:true}).nth(1);await text.scrollIntoViewIfNeeded();
   const scroll=await page.locator('#app > .scroll').evaluate(el=>el.scrollTop);assert(scroll>300,'Keep the actual two-song list scrolled, as in the supplied screenshot');
   await text.click();await screenshot(page,width,'absence-lyric-click-'+suffix);
   assert.equal(await page.evaluate(()=>U.view),'live','Pressing the lyric text navigates to the main lyric screen, not assignment editing');
   assert.equal(await page.locator('.mask').count(),0);assert.equal(await page.evaluate(()=>song().id),'jump-target');
   const row=page.locator('[data-lyric-line="7"]');await row.waitFor({state:'visible'});assert(await row.evaluate(el=>el.classList.contains('absence-lyric-target')));
   const rect=await row.boundingBox();assert(rect.y>=0&&rect.y+rect.height<=844,'The exact second duplicate phrase is scrolled into view');
   await screenshot(page,width,'absence-exact-main-lyric-'+suffix);
   await row.locator('.txt [data-c="0"]').first().click();await screenshot(page,width,'absence-lyric-tap-assignment-'+suffix);
   assert.deepEqual(await page.evaluate(()=>({kind:U.menu?.kind||null,sheet:!!U.sheet,songId:U.menu?.id||null,index:U.menu?.i??null})),{kind:'assign',sheet:false,songId:'jump-target',index:7},'A lyric tap in absence context opens assignment editing, not pitch/rhythm feedback');
   assert.equal(await page.locator('.quick-four').count(),0);assert.equal(await page.locator('.mask [data-act="setassign"]').count(),8);assert.deepEqual(await fingerprint(),before,'The opening gesture must not accidentally select a replacement through the new popup');
   await page.locator('.mask [data-act="closemenu"]').first().click();

   await page.locator('[data-act="overview"]').click();await page.locator('[data-act="ovsize"]').waitFor({state:'visible'});await screenshot(page,width,'absence-overview-with-return-'+suffix);assert.equal(await page.locator('[data-act="absence-return"]').count(),1);await page.locator('[data-act="absence-return"]').click();
   await page.locator('.owner-absence-row').first().waitFor({state:'visible'});assert.equal(await page.evaluate(()=>U.view),'absent');assert(Math.abs(await page.locator('#app > .scroll').evaluate(el=>el.scrollTop)-scroll)<=2,'Back restores the original scroll position');
   assert.equal(await page.locator('.mask').count(),0);await screenshot(page,width,'absence-return-same-position-'+suffix);
  };
  await jump('first');assert.deepEqual(await fingerprint(),before);
  // Names keep their editing action after the row is split into two controls.
  await page.locator('[data-act="assign"][data-id="jump-target"][data-i="7"]').click();assert.equal(await page.locator('.mask [data-act="setassign"]').count(),8);await page.locator('.mask [data-act="closemenu"]').first().click();
  const block=page.locator('[data-act="absence-lyrics"][data-id="jump-target"][data-block="A"]');await block.click();await page.locator('[data-lyric-line="12"]').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>song().id),'jump-target');assert(await page.locator('[data-lyric-line="12"]').evaluate(el=>el.classList.contains('absence-lyric-target')));await page.locator('[data-lyric-line="12"] .txt [data-c="0"]').first().click();assert.deepEqual(await page.evaluate(()=>({kind:U.menu?.kind,sheet:!!U.sheet,b:U.menu?.b})),{kind:'block',sheet:false,b:'A'});await page.locator('.mask [data-act="closemenu"]').first().click();await page.locator('[data-act="absence-return"]').click();await page.locator('.owner-absence-row').first().waitFor({state:'visible'});
  await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('Native save');});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);await page.locator('[data-act="picker"]').click();await page.locator('.mask [data-act="goabsent"]').click();await jump('native-reload');assert.deepEqual(await fingerprint(),before);
  // Edit through the reported lyric control, then traverse save/reload and member receive.
  await page.locator('[data-act="absence-lyrics"][data-id="jump-target"][data-i="7"]').click();await page.locator('[data-lyric-line="7"] .txt [data-c="0"]').first().click();
  await page.locator('.mask [data-act="setassign"][data-id="広本"]').click();await page.waitForFunction(()=>partsOf(song(),7).includes('広本'));
  assert.deepEqual(await page.evaluate(()=>partsOf(song(),7)),['斉藤','窪田','広本']);assert.deepEqual((await fingerprint()).notes,before.notes);
  await screenshot(page,width,'absence-lyric-tap-replacement-saved');await page.locator('.mask [data-act="closemenu"]').first().click();await page.locator('[data-act="absence-return"]').click();await page.locator('.owner-absence-row').first().waitFor({state:'visible'});
  assert.match(await page.locator('[data-act="assign"][data-id="jump-target"][data-i="7"]').innerText(),/広本/);
  const afterEdit=await fingerprint();for(const key of Object.keys(before).filter(k=>k!=='subs'))assert.deepEqual(afterEdit[key],before[key],key+' preserved while changing assignment');
  await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('Assignment save');});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);
  await page.locator('[data-act="picker"]').click();await page.locator('.mask [data-act="goabsent"]').click();await page.locator('[data-act="absence-lyrics"][data-id="jump-target"][data-i="7"]').click();await page.locator('[data-lyric-line="7"] .txt [data-c="0"]').first().click();
  assert.equal(await page.locator('.mask [data-act="setassign"][data-id="広本"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.quick-four').count(),0);await screenshot(page,width,'absence-lyric-edit-after-native-reload');await page.locator('.mask [data-act="closemenu"]').first().click();await page.locator('[data-act="absence-return"]').click();await page.locator('.owner-absence-row').first().waitFor({state:'visible'});
  // Leaving absence context restores the original feedback interaction.
  await page.locator('[data-act="go-live"]').click();await page.locator('[data-lyric-line="7"] .txt [data-c="0"]').first().click();await page.locator('.quick-four').waitFor({state:'visible'});assert.equal(await page.locator('.mask [data-act="setassign"]').count(),0);await screenshot(page,width,'ordinary-live-feedback-still-opens');await page.locator('.note-close[data-act="cancel"]').click();assert.deepEqual(await fingerprint(),afterEdit);
  const receivedId=await page.evaluate(()=>{const wire=publicationData('jump-group');S.viewer=true;S.deviceId='jump-member-device';applySetlist(wire);Object.assign(U,{view:'absent',memberName:'',menu:null,sheet:null,picker:false,overview:false});renderPointers.clear();scrollingUntil=0;save();render(true);return S.songs.find(s=>s.title==='対象の合成曲').id;});
  const memberChange=page.locator('.member-absence-change[data-id="'+receivedId+'"][data-i="7"]');await memberChange.waitFor({state:'visible'});assert.match(await memberChange.innerText(),/広本/);await screenshot(page,width,'absence-lyric-edit-received-member');await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);await page.evaluate(()=>{U.view='absent';renderPointers.clear();scrollingUntil=0;render(true);});await memberChange.waitFor({state:'visible'});assert.match(await memberChange.innerText(),/広本/);assert.equal(await page.locator('[data-act="setassign"]').count(),0);
  return {absenceOwnerExactLyricJumpAndReturn:true,absenceOwnerDuplicateTextAndOtherSongKept:true,absenceOwnerReturnScrollAndOverview:true,absenceOwnerBlockLyricNavigation:true,absenceOwnerNamesStillEdit:true,absenceOwnerNavigationNativeReloadDataPreserved:true,absenceLyricTapEditsAssignments:true,absenceLyricTapBlocksAndNoAccidentalNote:true,absenceLyricEditSaveReloadAndMemberReceive:true,absenceContextExitRestoresFeedback:true};
 }finally{await page.evaluate(async s=>{document.activeElement?.blur();S=JSON.parse(s.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(s.ui));startupRecoveryNetworkHold=s.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render(true);},saved);}
}
module.exports={checkAbsenceNavigation};
