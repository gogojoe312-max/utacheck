'use strict';
const assert=require('node:assert/strict');
// Called inside the existing isolated settings browser context; synthetic data only.
async function checkAbsence(page,width,{mode,assertFits,screenshot}){
 const expectLines=async expected=>{
  await page.waitForFunction(ids=>JSON.stringify(
   [...document.querySelectorAll('.member-absence-change')]
    .map(el=>Number(el.dataset.i)).sort((a,b)=>a-b)
  )===JSON.stringify(ids),expected);
 };
 try{
  await page.evaluate(async()=>{
   document.activeElement?.blur();await saveNow();
   window.__absenceQA={state:S,ui:U,hold:startupRecoveryNetworkHold,original:JSON.stringify(S)};
   const members=[
    {id:'m1',name:'検証甲'},{id:'m2',name:'検証乙'},
    {id:'m3',name:'検証丙'},{id:'m4',name:'検証丁'},{id:'ph',name:'回替わり'}
   ];
   const before=[
    ['m1','m2','m3'],['m1','m2'],['m1'],
    ['m1','m2','m3'],['m2','m3'],['m1','m2','m3']
   ],after=[
    ['m2','m3'],['m2'],['m4'],
    ['m2','m3','m4'],['m3','m2'],['m2']
   ];
   const names=ids=>ids.map(id=>members.find(m=>m.id===id).name).join('・');
   S=Object.assign(structuredClone(S0),{
    viewer:true,recMode:false,autoPub:false,ghToken:'',bkGistId:'',src:'',linkSrc:'',groupId:'qa-absence',showId:'show',
    groups:[{id:'qa-absence',name:'欠席検証',nopub:true}],
    members,rosters:{'欠席検証':members.slice(0,4).map(m=>m.name)},
    shows:[{id:'show',groupId:'qa-absence',name:'2026/10/15 検証公演',absent:['m1'],nopub:true}],
    songs:[{id:'song',showId:'show',groupId:'qa-absence',title:'歌割変更だけの合成曲',
     roster:members.map(m=>m.id),take:1,blocks:{},lines:before.map((parts,i)=>({
      t:'検証歌詞 '+i,parts:parts.slice(),main:parts.slice(),extra:[],raw:names(parts),label:names(parts),labelRaw:names(parts)
     }))}],
    notes:[],pubNotes:[],memos:{},gsubs:{},subs:{'show|song':Object.fromEntries(after.map((ids,i)=>[i,ids]))},
    staffMemos:{'show|song':'保持する本人メモ'},recs:{'synthetic-audio-reference':{dur:1}},plan:{slots:[]}
   });
   U=Object.assign(structuredClone(U),{
    view:'summary',mode:'song',songIdx:0,allShows:false,sheet:null,menu:null,picker:false,overview:false,pick:[],focus:'',
    showFilter:'',memberName:'',sumOpen:'',summaryReturn:null,lyricTarget:null,memberScope:viewerMemberKey()
   });
   window.__absenceQA.memberKey=viewerMemberKey();
   window.__absenceQA.memberValue=localStorage.getItem(viewerMemberKey());
   startupRecoveryNetworkHold=true;
   renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
   window.__absenceQA.content=()=>JSON.stringify(Object.fromEntries(
    ['groups','members','rosters','shows','songs','notes','pubNotes','memos','subs','gsubs','staffMemos','recs','plan'].map(k=>[k,S[k]])));
   window.__absenceQA.before=window.__absenceQA.content();
  });
  await expectLines([0,1,2,3,5]);
  assert.equal(await page.locator('.member-song').count(),1);
  const row1=await page.locator('.member-absence-change[data-i="1"]').innerText();
  assert(row1.includes('検証甲')&&row1.includes('検証乙'));
  const row2=await page.locator('.member-absence-change[data-i="2"]').innerText();
  assert(row2.includes('検証甲')&&row2.includes('検証丁'));
  assert.deepEqual(await page.evaluate(()=>[0,1,2,3,4,5].map(i=>lineStatus(S.songs[0],i))),['','changed','changed','changed','','']);
  assert.equal(await page.locator('[data-act="toggleabsent"],[data-act="setassign"],[data-act="setblock"]').count(),0);
  await assertFits(page);await screenshot(page,width,'absence-summary-all');
  assert.equal(await page.locator('[data-act="goabsent"]').innerText(),'歌割の変更');
  assert.equal(await page.locator('.summary-tabs>button').evaluateAll(nodes=>nodes.every(el=>el.scrollWidth<=el.clientWidth+1&&el.getBoundingClientRect().right<=innerWidth)),true,'Summary actions stay readable');
  await page.locator('[data-act="goabsent"]').click();
  await page.waitForFunction(()=>U.view==='absent');
  await expectLines([0,1,2,3,5]);
  await mode(page,false,true,'summary');
  await page.locator('[data-act="mode"][data-id="member"]').click();
  await page.locator('#summary-member').selectOption('');await expectLines([1,2]);
  await page.locator('#summary-member').selectOption('m2');await expectLines([1]);
  assert((await page.locator('.member-absence-change').innerText()).includes('一緒に歌うメンバーが変更'));
  await page.locator('#summary-member').selectOption('m4');await expectLines([2]);
  assert((await page.locator('.member-absence-change').innerText()).includes('新しく担当'));
  await assertFits(page);await screenshot(page,width,'absence-summary-member');
  await page.locator('#summary-member').selectOption('m2');await expectLines([1]);
  await page.locator('.member-absence-change[data-i="1"][data-act="summary-note"]').click();
  await page.waitForFunction(()=>U.view==='live');
  await page.waitForSelector('[data-lyric-line="1"].member-lyric-target');
  assert.equal(await page.evaluate(()=>U.lyricTarget.songId),'song');
  assert.equal(await page.locator('[data-lyric-line="0"]').evaluate(el=>el.style.background), '');
  await screenshot(page,width,'absence-lyric-target');
  await mode(page,false,true,'absent');
  await page.locator('[data-act="absence-scope"][data-id="all"]').click();await expectLines([0,1,2,3,5]);
  await page.locator('[data-act="absence-scope"][data-id="member"]').click();
  await page.locator('#summary-member').selectOption('');await expectLines([1,2]);
  await page.locator('#summary-member').selectOption('m2');await expectLines([1]);
  await page.locator('#summary-member').selectOption('m4');await expectLines([2]);
  assert.equal(await page.locator('[data-act="toggleabsent"],[data-act="setassign"],[data-act="setblock"]').count(),0);
  await assertFits(page);await screenshot(page,width,'absence-dedicated-member');
  await mode(page,false,false,'absent');
  const candidates=await page.locator('[data-act="toggleabsent"]').evaluateAll(nodes=>nodes.map(el=>el.dataset.id).sort());
  assert.deepEqual(candidates,['m1','m2','m3','m4']);
  assert.deepEqual(await page.evaluate(()=>[0,1,2,3,4,5].map(i=>lineStatus(S.songs[0],i))),Array(6).fill('changed'));
  assert.equal(await page.evaluate(()=>window.__absenceQA.content()),await page.evaluate(()=>window.__absenceQA.before));
 }finally{
  await page.evaluate(async()=>{
   const saved=window.__absenceQA;if(!saved)return;
   document.activeElement?.blur();await saveNow();
   if(saved.memberKey){if(saved.memberValue===null)localStorage.removeItem(saved.memberKey);else localStorage.setItem(saved.memberKey,saved.memberValue);}
   S=saved.state;U=saved.ui;startupRecoveryNetworkHold=saved.hold;
   if(JSON.stringify(S)!==saved.original)throw Error('Original QA state changed');
   save();await saveNow();
   renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
   delete window.__absenceQA;
  });
 }
 return {absenceAll:true,absencePersonal:true,absenceQuietReduction:true,absenceOwnerGuestPreserved:true,absenceLyricNavigation:true};
}
module.exports={checkAbsence};
