'use strict';
const assert=require('node:assert/strict'),fixture=require('./recording-headcount-fixture.cjs'),XLSX=require('../vendor/xlsx.full.min.js');
const {checkProgressPreparation}=require('./progress-preparation-browser-helper.cjs');
async function checkRecordingHeadcounts(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold};});
 try{
  await page.evaluate(async()=>{S=Object.assign(structuredClone(S0),{pt:structuredClone(S.pt||{}),viewer:false,recMode:true,ghToken:'',bkGistId:'',src:'',autoPub:false,groups:[{id:'count-existing-group',name:'既存の合成グループ'}],shows:[{id:'count-existing-show',groupId:'count-existing-group',name:'既存の合成公演'}],groupId:'count-existing-group',showId:'count-existing-show',members:[{id:'count-existing-person',name:'既存担当'}],songs:[{id:'count-existing-song',groupId:'count-existing-group',showId:'count-existing-show',title:'保持する合成曲',lines:[{t:'保持する歌詞',parts:['count-existing-person']}]}],rsongs:[],notes:[],recs:{},plan:{slots:[]}});startupRecoveryNetworkHold=true;Object.assign(U,{view:'setup',songIdx:0,recArtistFilter:'OCHA NORMA',menu:null,sheet:null,picker:false,overview:false,draw:false,secView:'',recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;save();await saveNow();render();});
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-act="rpick"]').click();await (await chooser).setFiles({name:'暫定合成曲_歌割.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(fixture(XLSX),{type:'array',bookType:'xlsx'}))});
  await page.waitForFunction(()=>!U.importing&&S.rsongs.length===1&&U.view==='live').catch(async e=>{throw Error('REC import state: '+JSON.stringify(await page.evaluate(()=>({songs:S.rsongs.length,view:U.view,importing:U.importing,busy:U.busy,report:U.fileReport,canWrite:recordingInboxCanWrite(),readonly:recordingInboxProfileRequired,code:U.backupFailureCode,fields:U.backupChangedFields})))+' '+e.message);});
  const check=async()=>{
   const labels=await page.locator('[data-lyric-line] .lbl').allTextContents();assert(labels.some(t=>t.includes('予想1人')));assert(labels.some(t=>t.includes('予想2人')));assert(labels.some(t=>t.includes('予想3人')));assert(labels.some(t=>t.includes('暫定A組（人数未定）')));assert(labels.some(t=>t.includes('暫定B組（人数未定）')));
   assert.equal(await page.locator('[data-lyric-line] .txt').count(),8);assert(!(await page.locator('[data-lyric-line] .txt').allTextContents()).some(t=>/^[1-9AB]$/.test(t.trim())));
   assert.equal(await page.evaluate(()=>recSong().lines.some(l=>l.parts?.length)),false,'A number never becomes a person ID');
  };
  await check();await screenshot(page,width,'rec-predicted-headcounts');
  await page.locator('[data-act="go-setup"]').click();assert.match(await page.locator('.rec-member-focus .note').innerText(),/暫定の予想人数.*担当は未確定/);
  await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('save');});await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  await page.evaluate(()=>{S.recMode=true;Object.assign(U,{view:'live',songIdx:0,secView:'',menu:null,sheet:null,overview:false});renderPointers.clear();scrollingUntil=0;render();});await check();
  const originalBytes=await page.evaluate(async()=>{const blob=await getClip('xls:'+recSong().xlsSourceId);return blob?.size;});assert(originalBytes>0);
  const manifest=await page.evaluate(async()=>{
   const song={...structuredClone(recSong()),id:'qa-rec-count-received',title:'受信する暫定合成曲',groupId:'qa-rec-count-group',recArtist:'受信する歌手',roster:[],blocks:{}};song.lines.forEach(l=>Object.assign(l,{parts:[],main:[],extra:[]}));
   const packet={app:'utacheck-recording-addition',version:1,group:{id:song.groupId,name:'受信する非公開REC',nopub:true},members:[],roster:[],songs:[song],plan:{year:2031,timezone:'Asia/Tokyo',slots:[{id:'qa-rec-count-slot',songId:song.id,name:'検証担当',day:'10/27',date:'2031-10-27',at:720,min:90,kind:'member',place:'検証スタジオ'}]}};
   return {app:'utacheck-private-preparation',version:1,owner:'gogojoe312-max',revision:'qa-recording-headcounts',createdAt:'2031-01-01T00:00:00Z',operations:[{id:'qa-recording-headcounts-addition',type:'recording-addition',packet,sha256:await PrivatePreparation.digest(packet)}]};
  });
  const received=await checkProgressPreparation(page,{manifest});assert.equal(received.received.status,'applied');assert.equal(received.slotCount,1);assert.equal(received.receipt,true);assert.equal(received.preserved,true);
  await page.locator('[data-act="ruse"][data-id="qa-rec-count-received"]').click();await check();await screenshot(page,width,'rec-predicted-headcounts-received');
  await page.locator('[data-act="overview"]').first().click();assert.match(await page.locator('#app .ovwn').first().innerText(),/予想1人/);await page.locator('[data-act="overview"]').first().click();
  await page.evaluate(()=>{U.view='recprint';renderPointers.clear();scrollingUntil=0;render();});assert.match(await page.locator('#prpage').innerText(),/予想1人/);assert.match(await page.locator('#prpage').innerText(),/暫定A組/);
  await screenshot(page,width,'rec-predicted-headcounts-print');
 }finally{await page.evaluate(async saved=>{S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render();},saved);

 }
 return {recPredictedHeadcountsImported:true,recPredictedCountsSeparateFromMembers:true,recPredictedHeadcountsReloadAndPrint:true,recPredictedHeadcountsScheduleReceive:true};
}
module.exports={checkRecordingHeadcounts};
