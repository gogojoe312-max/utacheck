'use strict';
const assert=require('node:assert/strict');
async function checkRecordingAutoStart(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold};});
 await page.addInitScript(()=>{if(sessionStorage.getItem('qa-rec-auto-time')){window.__recClockOriginal=Date.now;Date.now=()=>Number(sessionStorage.getItem('qa-rec-auto-time'));}});
 const at=async text=>page.evaluate(text=>sessionStorage.setItem('qa-rec-auto-time',String(Date.parse(text))),text);
 try{
  await page.evaluate(async()=>{
   window.__recClockOriginal=Date.now;sessionStorage.setItem('qa-rec-auto-time',String(Date.parse('2026-10-20T00:59:50Z')));Date.now=()=>Number(sessionStorage.getItem('qa-rec-auto-time'));
   S=Object.assign(structuredClone(S0),{viewer:false,recMode:true,ghToken:'',bkGistId:'',src:'',autoPub:false,
    groups:[{id:'auto-group',name:'合成REC'}],groupId:'auto-group',members:[{id:'member-a',name:'担当A'},{id:'member-b',name:'担当B'}],
    rsongs:[{id:'auto-one',title:'自動開始の曲A',roster:['member-a','member-b'],groupId:'auto-group',lines:[{t:'合成の歌詞A',sec:'1A',parts:['member-a']}]},{id:'auto-two',title:'自動開始の曲B',roster:['member-a','member-b'],groupId:'auto-group',lines:[{t:'合成の歌詞B',sec:'1A',parts:['member-b']}]}],rsongId:'auto-one',
    plan:{year:2026,start:'10:00',slots:[{id:'auto-first',songId:'auto-one',name:'担当A',kind:'member',day:'10/20',date:'2026-10-20',at:600,min:10,takes:{'1A':3}},{id:'auto-second',songId:'auto-two',name:'担当B',kind:'member',day:'10/20',date:'2026-10-20',at:610,min:10}]},
    notes:[{id:'auto-keep-note',showId:'rec',songId:'auto-one',lineIdx:0,memberIds:['member-a'],tags:[],memo:'既存の指摘'}],recs:{keep:{dur:30}}});
   startupRecoveryNetworkHold=true;Object.assign(U,{view:'live',songIdx:0,planSongId:'',planSongEditing:false,planSec:'',secOrd:false,sheet:null,menu:null,picker:false,overview:false,draw:false,recSchedulePaused:false,recScheduleId:'',recFocusId:'',secView:'',recScheduleInputUntil:0,recSchedulePointer:false,wordEdit:null,pick:[]});renderPointers.clear();scrollingUntil=0;save();await saveNow();render();
   window.__autoContent=JSON.stringify({songs:S.rsongs,notes:S.notes,recs:S.recs});
  });
  await page.locator('[data-act="goplan"]').click();
  assert.equal(await page.locator('[data-act="pstart"][data-id="auto-first"]').count(),1);
  await at('2026-10-20T01:00:00Z');
  await page.waitForFunction(()=>S.plan.slots[0].a0===600&&document.getElementById('pcd2')?.textContent==='10:00').catch(async e=>{console.log(await page.evaluate(()=>({view:U.view,paused:U.recSchedulePaused,editing:recScheduleEditing(),inputUntil:U.recScheduleInputUntil,now:Date.now(),sheet:!!U.sheet,menu:!!U.menu,picker:U.picker,word:U.wordEdit,pick:U.pick,canWrite:recordingInboxCanWrite(),slot:S.plan.slots[0],row:recScheduledRow()?.s.id,timer:document.getElementById('pcd2')?.textContent,focus:S.planFocus,active:document.activeElement?.tagName,REC:!!REC,PT:PT.on})));throw e;});
  assert.equal(await page.evaluate(()=>U.view),'recplan');
  assert.equal(await page.locator('[data-act="pnext"][data-id="auto-first"]').count(),1);
  assert.equal(await page.locator('[data-act="pstart"][data-id="auto-first"]').count(),0);
  await page.evaluate(()=>{window.__autoTimer=document.getElementById('pcd2');});
  await at('2026-10-20T01:00:01Z');await page.waitForFunction(()=>document.getElementById('pcd2')?.textContent==='9:59');
  assert.equal(await page.evaluate(()=>document.getElementById('pcd2')===__autoTimer),true,'A clock tick must update the timer without replacing the progression screen');
  assert.match(await page.locator('[data-plan-time="auto-first"]').innerText(),/残り 10分/);
  await screenshot(page,width,'rec-auto-start-running');
  const before=await page.evaluate(async()=>{await saveNow();if(saveErr)throw Error('auto-start save failed');return {at:S.plan.slots[0].startAt,content:__autoContent};});
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  assert.equal(await page.evaluate(()=>S.plan.slots[0].startAt),before.at);
  await page.locator('[data-act="goplan"]').click();
  await page.waitForFunction(()=>document.getElementById('pcd2')?.textContent==='9:59');
  assert.equal(await page.evaluate(()=>S.plan.slots[0].takes['1A']),3);
  await at('2026-10-20T01:10:00Z');await page.waitForFunction(()=>S.plan.slots[0].a1===610&&S.plan.slots[1].a0===610&&document.getElementById('pcd2')?.textContent==='10:00');
  assert.equal(await page.evaluate(()=>S.rsongId),'auto-two');assert.equal(await page.evaluate(()=>U.view),'recplan');
  assert.equal(await page.locator('[data-act="pnext"][data-id="auto-second"]').count(),1);
  await screenshot(page,width,'rec-auto-start-next');
  assert.equal(await page.evaluate(()=>JSON.stringify({songs:S.rsongs,notes:S.notes,recs:S.recs})),before.content);
  // An explicit pause keeps the running slot under the operator's control.
  await page.locator('[data-act="recschedule"]').click();await at('2026-10-20T01:20:05Z');
  await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>S.plan.slots[1].a1),undefined);
  await page.locator('[data-act="recschedule"]').click();await at('2026-10-20T01:20:07Z');await page.waitForFunction(()=>S.plan.slots[1].a1===620);
  await page.locator('[data-act="pundo"][data-id="auto-second"]').click();
  await at('2026-10-20T01:20:09Z');await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>S.plan.slots[1].a1),undefined,'Explicitly reopening an automatically finished slot must remain manual');
  assert.equal(await page.evaluate(()=>U.recSchedulePaused),true);
  await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('completion save failed');});
 }finally{
  await page.evaluate(async saved=>{document.activeElement?.blur();sessionStorage.removeItem('qa-rec-auto-time');if(window.__recClockOriginal)Date.now=__recClockOriginal;S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;pendingRender=false;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render();},saved);
 }
 return {recScheduledStartAndTimer:true,recAutoStartSavedReloaded:true,recScheduledNextSlot:true,recAutoTimerDOMStable:true,recExplicitPauseRespected:true};
}
module.exports={checkRecordingAutoStart};
