'use strict';
const assert=require('node:assert/strict');
async function checkAbsenceNavigation(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold};});
 try{
  await page.evaluate(async()=>{
   const roster=['北原','米村','斉藤','窪田','筒井','西﨑','広本','中山','西崎'];
   const make=(id,title,count)=>({id,title,showId:'jump-show',groupId:'jump-group',roster,blocks:{A:['米村']},blockRows:[],lines:Array.from({length:count},(_,i)=>({t:i===2||i===7?'重複する合成フレーズ':'合成の確認対象 '+id+' '+i,parts:i%2?['米村','窪田']:['米村'],main:i%2?['米村','窪田']:['米村'],extra:[],label:'米村',cell:'A'+(i+1),lcell:'B'+(i+1)}))});
   S={...structuredClone(S0),viewer:false,recMode:false,autoPub:false,ghToken:'',src:'',bkGistId:'',groupId:'jump-group',showId:'jump-show',groups:[{id:'jump-group',name:'OCHA NORMA'},{id:'private',name:'配信しない',nopub:true}],rosters:{'OCHA NORMA':roster.slice()},members:roster.map(name=>({id:name,name})),shows:[{id:'jump-show',groupId:'jump-group',name:'2026/11/1 合成公演',absent:['米村']}],songs:[make('jump-first','前の合成曲',24),make('jump-target','対象の合成曲',22)],rsongs:[],subs:{},subsMan:{},gsubs:{'jump-show|jump-target':{A:['斉藤']}},notes:[{id:'jump-kept-note',songId:'jump-target',showId:'jump-show',lineIdx:7,memberIds:['斉藤'],tags:[],memo:'元からある指摘を保持'}],pubNotes:[],draws:{kept:[1,2]},recs:{kept:{dur:8,size:10}},plan:{slots:[]}};
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
   await page.locator('[data-act="overview"]').click();await page.waitForFunction(()=>U.overview&&!!document.querySelector('.absence-back'));assert.equal(await page.locator('[data-act="absence-return"]').count(),1);await page.locator('[data-act="absence-return"]').click();
   await page.locator('.owner-absence-row').first().waitFor({state:'visible'});assert.equal(await page.evaluate(()=>U.view),'absent');assert(Math.abs(await page.locator('#app > .scroll').evaluate(el=>el.scrollTop)-scroll)<=2,'Back restores the original scroll position');
   assert.equal(await page.locator('.mask').count(),0);await screenshot(page,width,'absence-return-same-position-'+suffix);
  };
  await jump('first');assert.deepEqual(await fingerprint(),before);
  // Names keep their editing action after the row is split into two controls.
  await page.locator('[data-act="assign"][data-id="jump-target"][data-i="7"]').click();assert.equal(await page.locator('.mask [data-act="setassign"]').count(),8);await page.locator('.mask [data-act="closemenu"]').first().click();
  const block=page.locator('[data-act="absence-lyrics"][data-id="jump-target"][data-block="A"]');await block.click();await page.locator('[data-lyric-line="12"]').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>song().id),'jump-target');assert(await page.locator('[data-lyric-line="12"]').evaluate(el=>el.classList.contains('absence-lyric-target')));await page.locator('[data-act="absence-return"]').click();await page.locator('.owner-absence-row').first().waitFor({state:'visible'});
  await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('Native save');});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);await page.locator('[data-act="picker"]').click();await page.locator('.mask [data-act="goabsent"]').click();await jump('native-reload');assert.deepEqual(await fingerprint(),before);
  return {absenceOwnerExactLyricJumpAndReturn:true,absenceOwnerDuplicateTextAndOtherSongKept:true,absenceOwnerReturnScrollAndOverview:true,absenceOwnerBlockLyricNavigation:true,absenceOwnerNamesStillEdit:true,absenceOwnerNavigationNativeReloadDataPreserved:true};
 }finally{await page.evaluate(async s=>{document.activeElement?.blur();S=JSON.parse(s.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(s.ui));startupRecoveryNetworkHold=s.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render(true);},saved);}
}
module.exports={checkAbsenceNavigation};
