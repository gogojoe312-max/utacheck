'use strict';
const assert=require('node:assert/strict');
async function checkRecordingAddedBars(page,width,{screenshot,promptNext}){
 const saved=await page.evaluate(async()=>{await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold};});
 try{
  await page.evaluate(async()=>{
   S=Object.assign(JSON.parse(JSON.stringify(S0)),{recMode:true,viewer:false,ghToken:'',src:'',autoPub:false,recBars:true,
    groups:[{id:'added-bars-private',name:'合成REC',nopub:true}],members:[{id:'cue-member',name:'検証メンバー'}],
    rsongs:[{id:'added-bars-rec',title:'追加した煽りの小節確認',groupId:'added-bars-private',intro:0,xlsSourceId:'qa-added-bars-source',
     lines:[{t:'合成フレーズ一',at:61,bars:1,sec:'2B'},{t:'合成フレーズ二',bars:1},{t:'合成フレーズ三',at:63,bars:1},{t:'合成フレーズ四',at:63,bars:1},
      {t:'煽り',add:1,bars:0,sec:'煽り'},{t:'後続の合成フレーズ',at:76,bars:1,sec:'3C'}]}],rsongId:'added-bars-rec',
    notes:[{id:'cue-note',songId:'added-bars-rec',showId:'rec',lineIdx:0,from:0,to:1,tags:['rhythm'],memberIds:['cue-member'],memo:'既存の指摘を保持'}],
    recs:{'rec|added-bars-rec|1':{dur:2,size:4}},plan:{slots:[{id:'cue-slot',songId:'added-bars-rec',memberId:'cue-member',date:'2026-11-04',at:780,min:90,takes:{'2B':2},sectionChecks:{'2B':{whole:true}}}]}});
   startupRecoveryNetworkHold=true;
   await putClip('xls:qa-added-bars-source',new Blob([new Uint8Array([80,75,3,4,9])],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   await putClip('rec|added-bars-rec|1',new Blob([new Uint8Array([1,2,3,4])],{type:'audio/webm'}));
   window.__addedBarOriginal=JSON.stringify({notes:S.notes,recs:S.recs,plan:S.plan,source:recSong().lines.filter(l=>!l.add)});
   Object.assign(U,{view:'live',songIdx:0,secView:'',recFocusId:'',menu:null,sheet:null,picker:false,overview:false,draw:false,rmore:false,recSchedulePaused:true});
   renderPointers.clear();scrollingUntil=0;save();await saveNow();render();
  });
  const cue=()=>page.locator('[data-lyric-line="4"]');
  const openCue=async()=>{await cue().locator('[data-act="rbar"]').click();};
  await openCue();await screenshot(page,width,'rec-added-bars-before');
  promptNext('64');await page.locator('.mask [data-act="rbarnum"]').click();
  await page.waitForFunction(()=>recSong().lines[4].at===64,{},{timeout:2000});
  assert.equal((await page.locator('.mask [data-act="rbarnum"]').innerText()).trim(),'64');
  await page.locator('.mask [data-act="rlen"][data-id="2"]').click();
  assert.equal((await cue().locator('[data-act="rbar"]').innerText()).trim(),'煽り 64');
  assert.equal((await page.locator('[data-lyric-line="5"] [data-act="rbar"]').innerText()).trim(),'3C 76');
  assert.equal(await page.evaluate(()=>recSong().lines[4].bars),2);
  assert.equal(await page.evaluate(()=>recSong().lines[5].bars),1,'Added-cue duration must not rewrite following source lengths');
  await openCue();
  for(const [delta,expected] of [['4',68],['-1',67],['-4',63],['1',64]]){
   await page.locator('.mask [data-act="rbarset"][data-id="'+delta+'"]').click();
   assert.equal((await page.locator('.mask [data-act="rbarnum"]').innerText()).trim(),String(expected));
  }
  await page.locator('.mask [data-act="closemenu"]').last().click();
  await screenshot(page,width,'rec-added-bars-numbered');
  // Add another cue through the same lyric-number menu, not a cleaned fixture.
  await page.locator('[data-lyric-line="3"] [data-act="rbar"]').click();
  await page.locator('.mask [data-act="rmore"]').click();promptNext('合成掛け声😀続き');
  await page.locator('.mask [data-act="raddfree"]').click();
  assert.equal(await page.evaluate(()=>recordingBarRows(recSong())[4][0].number),null);
  await cue().locator('[data-act="rbar"]').click();
  assert.equal((await page.locator('.mask [data-act="rbarnum"]').innerText()).trim(),'番号を付ける');
  await page.locator('.mask [data-act="rbarset"][data-id="1"]').click();
  assert.equal(await page.evaluate(()=>recSong().lines[4].at),65);
  promptNext('64');await page.locator('.mask [data-act="rbarnum"]').click();
  await page.locator('.mask [data-act="rlen"][data-id="1"]').click();
  await page.locator('[data-act="jumpsec"][data-id="煽り"]').click();
  assert.equal((await page.locator('[data-lyric-line="5"] [data-act="rbar"]').innerText()).trim(),'煽り 64');
  await screenshot(page,width,'rec-added-bars-section');
  const preserved=await page.evaluate(()=>__addedBarOriginal);
  const beforeReload=await page.evaluate(async()=>{U.secView='';save();await saveNow();if(saveErr)throw Error('save');return JSON.stringify(recSong());});
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  await page.evaluate(()=>{S.recMode=true;S.rsongId='added-bars-rec';Object.assign(U,{view:'live',songIdx:0,secView:'',overview:false,recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;render();});
  assert.equal(await page.evaluate(()=>JSON.stringify(recSong())),beforeReload);
  assert.deepEqual(await page.evaluate(()=>recordingBarRows(recSong()).map(row=>row.map(s=>s.number))),[[61],[62],[63],[63],[64],[64],[76]]);
  await screenshot(page,width,'rec-added-bars-reloaded');
  await page.locator('.song-header [data-act="overview"]').click();
  assert.equal((await page.locator('[data-act="jumpline"][data-i="5"] .ovwn').innerText()).trim(),'64');
  await screenshot(page,width,'rec-added-bars-overview');
  await page.evaluate(()=>{U.view='recprint';renderPointers.clear();scrollingUntil=0;render();});
  assert.equal((await page.locator('tr[data-line="5"] .prn').innerText()).trim(),'煽り 64');
  await screenshot(page,width,'rec-added-bars-print');
  assert.equal(await page.evaluate(expected=>JSON.stringify({notes:S.notes,recs:S.recs,plan:S.plan,source:recSong().lines.filter(l=>!l.add)})===expected,preserved),true);
  assert.deepEqual(await page.evaluate(async()=>({xls:Array.from(new Uint8Array(await (await getClip('xls:qa-added-bars-source')).arrayBuffer())),audio:Array.from(new Uint8Array(await (await getClip('rec|added-bars-rec|1')).arrayBuffer()))})),{xls:[80,75,3,4,9],audio:[1,2,3,4]});
 }catch(error){await screenshot(page,width,'rec-added-bars-failure');throw error;}
 finally{
  await page.evaluate(async saved=>{S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render();},saved);
 }
 return {recordingAddedBars:true,restoredAndNewCueNumbered:true,addedCueLengthLocal:true,savedReloaded:true,overviewAndPrint:true,sourceMediaAndNotesPreserved:true};
}
module.exports={checkRecordingAddedBars};
