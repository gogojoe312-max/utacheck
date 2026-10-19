'use strict';
const assert=require('node:assert/strict');
async function checkLiveNoteInput(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold};});
 try{
  await page.evaluate(async()=>{
   S=Object.assign(structuredClone(S0),{viewer:false,recMode:false,ghToken:'',bkGistId:'',src:'',autoPub:false,groupId:'fast-note-group',showId:'fast-note-show',groups:[{id:'fast-note-group',name:'OCHA NORMA'}],shows:[{id:'fast-note-show',name:'合成LIVE公演'}],members:[{id:'m',name:'斉藤'}],notes:[],pubNotes:[],plan:{slots:[]},rsongs:[],recs:{}});
   // Retain a restored-library-sized state; do not shrink the library to make typing fast.
   S.songs=Array.from({length:836},(_,i)=>({id:'fast-note-'+i,showId:i?'other-show':'fast-note-show',groupId:S.groupId,title:'合成LIVE '+i,sheetName:'Unrelated synthetic original',roster:['m'],blocks:{},lines:Array.from({length:12},(_,j)=>({t:'保存される合成歌詞😀 '+j,parts:['m'],lcell:'B'+(j+1)}))}));
   startupRecoveryNetworkHold=true;Object.assign(U,{view:'live',songIdx:0,mode:'song',menu:null,sheet:null,picker:false,overview:false,draw:false,showFilter:S.groupId});renderPointers.clear();scrollingUntil=0;save();await saveNow();render();
   window.__noteProbe={backupCalls:0,focus:[],canonicalCalls:0};window.__noteBackupState=backupState;backupState=function(...args){__noteProbe.backupCalls++;return __noteBackupState(...args);};
   window.__noteFocus=e=>{if(e.target.id==='memo')__noteProbe.focus.push({readOnly:e.target.readOnly,active:document.activeElement===e.target,trusted:e.isTrusted});};document.addEventListener('focusin',__noteFocus);
   window.__noteBefore=JSON.stringify(S.songs);
  });
  const open=async()=>{
   await page.locator('[data-lyric-line="0"] .txt [data-c="1"]').click();
   assert.deepEqual(await page.evaluate(()=>__noteProbe.focus.at(-1)),{readOnly:false,active:true,trusted:true},'The original trusted focus remains writable; an asynchronous unlock cannot open the iOS keyboard');
   assert.equal(await page.evaluate(()=>__noteProbe.backupCalls),0,'Opening a note draft must not copy the entire restored library');
   assert.equal(await page.locator('#memo').evaluate(el=>document.activeElement===el&&!el.readOnly),true);
  };
  await open();await page.locator('#memo').fill('入力中の下書き');
  await page.evaluate(()=>{window.__noteInput=document.getElementById('memo');render(true);});
  assert.equal(await page.evaluate(()=>document.getElementById('memo')===__noteInput),true);
  assert.equal(await page.locator('#memo').inputValue(),'入力中の下書き');
  await screenshot(page,width,'live-note-writable');
  await page.locator('#memo').fill('');await page.locator('.note-close').click();
  await open();await page.locator('#memo').fill('合成LIVE指摘の保存を確認');await page.locator('.note-close').click();
  await page.waitForFunction(()=>!U.sheet&&S.notes.length===1);
  await page.evaluate(async()=>{await saveNow();if(saveErr)throw Error('Note save failed');});
  assert.equal(await page.evaluate(()=>JSON.stringify(S.songs)===__noteBefore),true,'Opening, typing and committing preserve every song and source row');
  // A note-only revision must not serialize unrelated original worksheets.
  const unrelated=await page.evaluate(async()=>{
   const original=ArrangementVerification.canonical;let calls=0;ArrangementVerification.canonical=function(so){if(so.sheetName==='Unrelated synthetic original')calls++;return original(so);};
   try{save();await saveNow();await ArrangementVerificationUI.check();return calls;}finally{ArrangementVerification.canonical=original;}
  });assert.equal(unrelated,0);
  await page.evaluate(()=>{backupState=__noteBackupState;document.removeEventListener('focusin',__noteFocus);});
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  assert.equal(await page.evaluate(()=>S.notes.find(n=>n.songId==='fast-note-0')?.memo),'合成LIVE指摘の保存を確認');
  assert.equal(await page.evaluate(()=>S.songs.length),836);
  await page.evaluate(()=>{const wire=publicationData('fast-note-group');S.viewer=true;S.deviceId='separate-note-member-device';S.notes=[];applySetlist(wire);Object.assign(U,{view:'live',songIdx:0,overview:false,memberName:'',sheet:null,menu:null,picker:false});renderPointers.clear();scrollingUntil=0;render(true);});

  assert.equal(await page.evaluate(()=>S.pubNotes.filter(n=>n.memo==='合成LIVE指摘の保存を確認').length),1);
  const received=page.locator('#app .reading-notes > div').filter({hasText:'合成LIVE指摘の保存を確認'});
  assert.equal(await received.count(),1,'The received note is rendered on the member lyric screen');assert(await received.isVisible());
  await screenshot(page,width,'live-note-received');
 }finally{
  await page.evaluate(async saved=>{
   document.activeElement?.blur();if(window.__noteBackupState)backupState=__noteBackupState;if(window.__noteFocus)document.removeEventListener('focusin',__noteFocus);
   S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;pendingRender=false;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render();
  },saved);
 }
 return {liveNoteWritableTrustedFocus:true,liveNoteNoWholeLibraryCheckpoint:true,liveNoteInputDOMPreserved:true,liveNoteSaveReloadAndReceive:true,unrelatedArrangementNotSerialized:true};
}
module.exports={checkLiveNoteInput};
