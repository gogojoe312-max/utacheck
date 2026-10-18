'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const A=require('../arrangement-verification.js');
async function setup(){
 const so={id:'song',title:'Synthetic 1Half',sheetName:'Sheet',lines:[{lcell:'B1',t:'Synthetic first',labelRaw:'A'},{lcell:'B2',t:'Synthetic cut',labelRaw:'B'}]};
 const rule={id:'rule',sheetName:'Sheet',rowCount:2,fingerprint:await A.digest(A.canonical(so),webcrypto),cutCells:['B2'],sourceCutCells:['B2']};
 let stored='',saves=0,writes=0,rendered=[0,1];const badge={dataset:{song:'song'}};
 const c={ArrangementVerification:A,ArrangementCatalog:[rule],S:{songs:[so],rsongs:[],notes:[{memo:'Preserve'}],recs:{audio:{dur:30}}},U:{view:'live'},
  startupPhase:'ready',booted:true,bootErr:null,REC:null,recordingStartPending:false,recordingFinalizePending:false,syncing:false,manualSync:false,
  recordingInboxCanWrite:()=>true,typingNow:()=>false,recordingInboxIntegration:{gate:{applying:false}},recordingInboxAdmitWriter:()=>()=>{},
  VIEW:()=>false,preview:null,stateRevision:0,APP_VER:'synthetic',saveErr:false,crypto:webcrypto,
  setInterval:()=>0,setTimeout:()=>1,document:{addEventListener(){}},h:String,
  app:{querySelectorAll:selector=>selector==='[data-arrangement-verification]'?[badge]:rendered.map(i=>({dataset:{lyricLine:String(i)}}))},
  song:()=>c.S.songs[0],render:()=>{rendered=c.S.songs[0].lines.flatMap((l,i)=>l.cut?[]:[i]);},
  save:()=>{saves++;c.stateRevision++;},saveNow:async()=>{if(!c.saveErr)stored=JSON.stringify(c.S);},
  loadRaw:async()=>stored,unpackState:v=>v,idbPut:async()=>{writes++;}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../arrangement-verification-ui.js','utf8'),c);
 return {c,badge,check:()=>c.ArrangementVerificationUI.check(),status:()=>c.ArrangementVerificationUI.getStatus('song'),get stored(){return stored;},get saves(){return saves;},get writes(){return writes;}};
}
test('device repairs and checks saved state and actual DOM with no credentials or original-file reception',async()=>{
 const f=await setup(),before=JSON.stringify({notes:f.c.S.notes,recs:f.c.S.recs});await f.check();
 assert.equal(f.c.S.songs[0].lines[1].cut,1);assert.equal(f.status().saved,true);assert.equal(f.status().display,true);assert.equal(f.badge.dataset.checkState,'verified');
 assert.equal(JSON.parse(f.stored).songs[0].lines[1].cut,1);assert.equal(JSON.stringify({notes:f.c.S.notes,recs:f.c.S.recs}),before);assert.equal(f.writes,1);
 const saves=f.saves;await f.check();assert.equal(f.saves,saves);
});
test('failed persistence never claims verified, and retry confirms a real saved copy',async()=>{
 const f=await setup();f.c.saveErr=true;await f.check();assert.equal(f.status().saved,false);assert.equal(f.badge.dataset.checkState,'pending');assert.equal(f.writes,0);
 f.c.saveErr=false;await f.check();assert.equal(f.status().saved,true);assert.equal(f.status().error,null);assert.equal(f.badge.dataset.checkState,'verified');
});
test('stale rendered cut rows cannot receive a success receipt even when storage is correct',async()=>{
 const f=await setup();f.c.render=()=>{};await f.check();assert.equal(f.status().saved,true);assert.equal(f.status().display,false);assert.equal(f.badge.dataset.checkState,'pending');assert.equal(f.writes,0);
});
test('busy input waits and automatically retrying the check keeps the original note intact',async()=>{
 const f=await setup();f.c.U.sheet={draft:'Preserve input'};await f.check();assert.equal(f.status(),null);assert.equal(f.c.S.songs[0].lines[1].cut,undefined);
 f.c.U.sheet=null;await f.check();assert.equal(f.status().saved,true);assert.equal(f.c.S.notes[0].memo,'Preserve');
});
test('member display works without any owner save or network access',async()=>{
 const f=await setup();f.c.VIEW=()=>true;await f.check();assert.equal(f.status().display,true);assert.equal(f.saves,0);assert.equal(f.badge.dataset.checkState,'verified');assert.equal(f.writes,0);
});
