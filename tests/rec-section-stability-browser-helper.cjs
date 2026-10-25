'use strict';
const assert=require('node:assert/strict');
async function checkRecSectionStability(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U)};});
 try{
  await page.evaluate(async()=>{
   const sections=['RH','1A','1B','1C','2A','2B','2C','T','TRap','2ARap','D','DRap','3C',"3C'",'Inter','Outro'];
   S=Object.assign(structuredClone(S0),{viewer:false,recMode:true,ghToken:'',bkGistId:'',autoPub:false,rsongId:'qa-scroll-song',groups:[{id:'qa-scroll-group',name:'合成',nopub:true}],members:[{id:'qa-scroll-person',name:'検証担当'},{id:'qa-scroll-person-2',name:'もう一人'}],rsongs:[{id:'qa-scroll-song',title:'保持するセクション合成曲',groupId:'qa-scroll-group',take:4,roster:['qa-scroll-person','qa-scroll-person-2'],blocks:{},lines:sections.flatMap((sec,i)=>[{t:'ユニゾンの合成歌詞 '+i,sec,bars:4,parts:['qa-scroll-person','qa-scroll-person-2']},{t:'ソロの合成歌詞 '+i,bars:4,parts:['qa-scroll-person']}])}],recs:{kept:{dur:12,size:4}},pt:{on:true,mode:'direct',url:'https://bridge.invalid',token:'synthetic-preserved-bridge-token'},planFocus:'qa-scroll-slot',plan:{year:2031,timezone:'Asia/Tokyo',slots:[{id:'qa-scroll-slot',songId:'qa-scroll-song',name:'検証担当',kind:'member',date:'2031-10-27',day:'10/27',place:'合成',at:720,min:90,a0:Date.now()-10000,secCur:'1A',secStart:Date.now()-10000,takes:{'1A':7,'2C':3}}]}});
   startupRecoveryNetworkHold=true;Object.assign(U,{view:'live',songIdx:0,menu:null,sheet:null,overview:false,draw:false,secView:'',recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
   window.__qaRecRetained=JSON.stringify([S.recs,S.pt,S.rsongs,S.plan.slots[0].takes]);
  });
  const target=page.locator('.sectabs [data-act="jumpsec"][data-id="2C"]').first();
  await page.waitForFunction(()=>document.querySelector('.sectabs')?.scrollWidth>document.querySelector('.sectabs')?.clientWidth);
  await page.evaluate(()=>{const b=document.querySelector('.sectabs'),t=b.querySelector('[data-id="2C"]');b.scrollLeft=t.offsetLeft-b.clientWidth+t.offsetWidth+28;});
  const before=await target.evaluate(t=>({left:t.parentElement.scrollLeft,x:t.getBoundingClientRect().left}));assert(before.left>0);
  await screenshot(page,width,'rec-section-before-selection');await target.click();
  await page.waitForFunction(()=>U.secView==='2C'&&document.querySelector('.sectabs [data-id="2C"]')?.classList.contains('on'));
  await page.waitForTimeout(400);
  const after=await page.locator('.sectabs [data-id="2C"]').first().evaluate(t=>({left:t.parentElement.scrollLeft,x:t.getBoundingClientRect().left}));
  await screenshot(page,width,'rec-section-after-selection');
  assert(Math.abs(after.left-before.left)<1,'Choosing a section must retain horizontal scroll: '+JSON.stringify({before,after}));assert(Math.abs(after.x-before.x)<1);
  await page.evaluate(()=>{renderPointers.clear();scrollingUntil=0;render(true);});await page.waitForTimeout(100);
  assert(Math.abs(await page.locator('.sectabs').first().evaluate(b=>b.scrollLeft)-before.left)<1);
  const originalNumbers=await page.locator('[data-lyric-line] .lbl').allTextContents();
  assert.equal(await page.locator('[data-lyric-line]').count(),2);
  await page.locator('[data-act="rec-singer-filter"][data-id="unison"]').click();
  assert.equal(await page.locator('[data-lyric-line]').count(),1);assert.match(await page.locator('[data-lyric-line] .txt').innerText(),/ユニゾン/);assert.equal(await page.locator('[data-lyric-line] .lbl').innerText(),originalNumbers[0]);
  await screenshot(page,width,'rec-section-unison-only');
  await page.locator('[data-act="rec-singer-filter"][data-id="solo"]').click();
  assert.equal(await page.locator('[data-lyric-line]').count(),1);assert.match(await page.locator('[data-lyric-line] .txt').innerText(),/ソロ/);assert.equal(await page.locator('[data-lyric-line] .lbl').innerText(),originalNumbers[1]);
  await screenshot(page,width,'rec-section-solo-only');
  await page.locator('[data-act="overview"]').first().click();assert.equal(await page.locator('.ovw').count(),32);await page.locator('[data-act="overview"]').first().click();
  assert.equal(await page.locator('[data-lyric-line]').count(),1);
  assert.equal(await page.locator('[data-act="takeup"],[data-act="takedown"],[data-act="recstart"],#ptpill,#ptbar,#ptwrap,script[src*="ptlink"]').count(),0);
  assert.equal(await page.evaluate(()=>JSON.stringify([S.recs,S.pt,S.rsongs,S.plan.slots[0].takes])===__qaRecRetained),true);
  const retained=await page.evaluate(async()=>{save();await saveNow();return __qaRecRetained;});
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  assert.equal(await page.evaluate(retained=>JSON.stringify([S.recs,S.pt,S.rsongs,S.plan.slots[0].takes])===retained,retained),true);
  assert.equal(await page.locator('#ptpill,#ptbar,script[src*="ptlink"]').count(),0);
 }finally{await page.evaluate(async saved=>{S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();render();},saved);}
 return {recSelectedSectionScrollStable:true,recUnusedTransportRemoved:true,recLegacyAudioTakesAndBridgePreserved:true,recSectionSoloUnisonFilterWithoutTakes:true};
}
module.exports={checkRecSectionStability};
