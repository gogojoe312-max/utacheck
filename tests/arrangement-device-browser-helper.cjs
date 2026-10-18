'use strict';
const assert=require('node:assert/strict');
async function checkArrangementDevice(page){
 await page.evaluate(async()=>{
  S=Object.assign(JSON.parse(JSON.stringify(S0)),{ghToken:'',autoPub:false,groupId:'qa-offline-group',showId:'qa-offline-show',recMode:false,
   groups:[{id:'qa-offline-group',name:'Synthetic offline group',nopub:true}],members:[],shows:[{id:'qa-offline-show',groupId:'qa-offline-group',name:'Synthetic offline show',nopub:true}],
   songs:[{id:'qa-offline-song',title:'Synthetic 1Half',groupId:'qa-offline-group',showId:'qa-offline-show',sheetName:'Synthetic',lines:[
    {t:'SYNTHETIC_KEEP_FIRST',lcell:'B1',labelRaw:'',parts:[]},{t:'SYNTHETIC_HIDE_CUT',lcell:'B2',labelRaw:'',parts:[]},{t:'SYNTHETIC_KEEP_LAST',lcell:'B3',labelRaw:'',parts:[]}]}],
   notes:[{id:'qa-offline-note',songId:'qa-offline-song',showId:'qa-offline-show',lineIdx:1,tags:[],memberIds:[],memo:'SYNTHETIC_CUT_NOTE'}]});
  const so=S.songs[0];ArrangementCatalog=[{id:'synthetic-offline-rule',sheetName:'Synthetic',rowCount:3,
   fingerprint:await ArrangementVerification.digest(ArrangementVerification.canonical(so)),cutCells:['B2'],sourceCutCells:[]}];
  const unavailable={read:async()=>({status:'unavailable',code:'HTTP_404'})};window.ProgressPreparationSource=unavailable;window.PrivatePreparationSource=unavailable;window.PreparationRelaySource=undefined;
  startupRecoveryNetworkHold=true;saveErr=false;Object.assign(U,{view:'live',mode:'song',songIdx:0,showFilter:S.groupId,sheet:null,menu:null,picker:false,overview:false,allShows:false});
  renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);await ArrangementVerificationUI.check();
 });
 await page.waitForFunction(()=>{const r=ArrangementVerificationUI.getStatus('qa-offline-song');return r?.saved&&r?.display;},null,{timeout:15000});
 assert.equal(await page.locator('[data-arrangement-verification][data-check-state="verified"]').count(),1);
 assert.equal(await page.getByText('SYNTHETIC_HIDE_CUT',{exact:true}).count(),0);
 assert.equal(await page.getByText('SYNTHETIC_KEEP_LAST',{exact:true}).count(),1);
 const saved=await page.evaluate(async()=>{const s=unpackState(JSON.parse(await loadRaw()));return {cut:s.songs[0].lines[1].cut,notes:s.notes.length,memo:s.notes[0].memo};});
 assert.deepEqual(saved,{cut:1,notes:1,memo:'SYNTHETIC_CUT_NOTE'});
 await page.evaluate(()=>{U.view='summary';renderPointers.clear();scrollingUntil=0;render(true);});
 assert.equal(await page.getByText('SYNTHETIC_CUT_NOTE',{exact:false}).count(),0);
 return {offlineArrangementVerified:true,offlineArrangementSaved:true,cutFeedbackHidden:true};
}
module.exports={checkArrangementDevice};
