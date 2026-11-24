'use strict';
const assert = require('node:assert/strict');

async function checkUnscheduledRecording(page) {
  const original = await page.evaluate(async () => {
    document.activeElement?.blur(); await saveNow();
    return {state:JSON.stringify(S), ui:JSON.stringify(U), hold:startupRecoveryNetworkHold};
  });
  const start = page.locator('[data-act="free-rec-start"]');
  const ok = page.locator('[data-act="pnextsec"]');
  try {
    await page.evaluate(async () => {
      S = Object.assign(structuredClone(S0), {
        viewer:false, recMode:true, autoPub:false, ghToken:'', rsongId:'manual',
        rsongs:[
          {id:'manual', title:'進行表なしの曲', roster:[], lines:[{t:'一行目',sec:'1A',parts:[]},{t:'二行目',sec:'1B',parts:[]}]},
          {id:'plain',title:'区切りなしの曲',roster:[],lines:[{t:'全体の歌詞',parts:[]}]}
        ], groups:[], members:[], plan:{slots:[]}, notes:[], planFocus:''
      });
      Object.assign(U,{view:'live',secView:'',recFocusId:'',songIdx:0,overview:false,draw:false,sheet:null,menu:null,picker:false});
      startupRecoveryNetworkHold=true; save(); await saveNow(); render();
    });
    await page.locator('[data-act="jumpsec"][data-id="1B"]').click();
    await start.click();
    await page.waitForFunction(() => /^\d+:\d{2}$/.test(document.getElementById('pcd2')?.textContent));
    await ok.click();
    assert.equal(await page.locator('#tab-1B').getAttribute('aria-label'),'1B：録り終わり');
    await page.evaluate(() => saveNow());
    await page.reload();
    await page.waitForFunction(() => typeof normalStartupInitialized !== 'undefined' && normalStartupInitialized);
    await ok.waitFor();
    assert.equal(await page.locator('#tab-1B').getAttribute('aria-label'),'1B：録り終わり');
    await ok.click();
    assert.equal(await page.locator('#tab-1A').getAttribute('aria-label'),'1A：録り終わり');
    assert.equal(await ok.count(),0);
    await page.locator('[data-act="undoall"]').click();
    await ok.waitFor();
    await page.evaluate(() => {
      S.rsongId='plain'; U.secView=''; U.songIdx=1;
      S.plan.slots.push({id:'other',kind:'member',name:'別曲の人',songId:'manual',a0:720,min:45,secCur:'1A'});
      S.planFocus='other'; render();
    });
    await start.click();
    await ok.click();
    assert.equal(await page.locator('[data-act="jumpsec"][data-id="曲全体"]').getAttribute('aria-label'),'曲全体：録り終わり');
    const actual = await page.evaluate(() => ({plan:S.plan.slots,focus:S.planFocus,first:recSong().id,manual:S.rsongs[0].freeRecSlots[0].secCur}));
    assert.deepEqual(actual,{plan:[{id:'other',kind:'member',name:'別曲の人',songId:'manual',a0:720,min:45,secCur:'1A'}],focus:'other',first:'plain',manual:'1A'});
    return {unscheduledRecordingReload:true,unscheduledRecordingUndo:true,otherSongSchedulePreserved:true};
  } finally {
    await page.evaluate(async original => {
      S=JSON.parse(original.state); U=JSON.parse(original.ui); startupRecoveryNetworkHold=original.hold;
      save(); await saveNow(); render();
    },original);
  }
}
module.exports={checkUnscheduledRecording};
