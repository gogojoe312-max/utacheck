'use strict';
const assert=require('node:assert/strict');
function auditAudio(){
 const calls=window.__audioAudit={contexts:0,resumes:0,mediaPlays:0,loopingPlays:0,microphones:0,recognitionStarts:0,oscillators:0};
 const wrap=(object,key,count)=>{const original=object?.[key];if(typeof original==='function')object[key]=function(...args){count.call(this);return Reflect.apply(original,this,args);};};
 const Native=window.AudioContext||window.webkitAudioContext;
 if(Native){wrap(Native.prototype,'resume',()=>calls.resumes++);wrap(Native.prototype,'createOscillator',()=>calls.oscillators++);const traced=new Proxy(Native,{construct(target,args,newTarget){calls.contexts++;return Reflect.construct(target,args,newTarget);}});if(window.AudioContext)window.AudioContext=traced;if(window.webkitAudioContext)window.webkitAudioContext=traced;}
 wrap(HTMLMediaElement.prototype,'play',function(){calls.mediaPlays++;if(this.loop)calls.loopingPlays++;});
 wrap(navigator.mediaDevices,'getUserMedia',()=>calls.microphones++);
 for(const Recognition of new Set([window.SpeechRecognition,window.webkitSpeechRecognition]))if(Recognition)wrap(Recognition.prototype,'start',()=>calls.recognitionStarts++);
}
function referenceWav(){const rate=8000,samples=rate*20,b=Buffer.alloc(44+samples*2);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(1000*Math.sin(i*2*Math.PI*220/rate)),44+i*2);return 'data:audio/wav;base64,'+b.toString('base64');}
async function checkPassiveAudio(context,origin,width,{screenshot}){
 const page=await context.newPage(),reference=await context.newPage();page.setDefaultTimeout(20000);page.on('dialog',d=>d.dismiss());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(auditAudio);
 const passive=async(label)=>{const calls=await page.evaluate(()=>__audioAudit);assert.deepEqual(calls,{contexts:0,resumes:0,mediaPlays:0,loopingPlays:0,microphones:0,recognitionStarts:0,oscillators:0},label+': no passive audio acquisition');};
 const stillPlaying=async()=>{const before=await reference.evaluate(()=>({paused:document.querySelector('audio').paused,time:document.querySelector('audio').currentTime}));assert.equal(before.paused,false);await reference.waitForFunction(time=>!document.querySelector('audio').paused&&Math.abs(document.querySelector('audio').currentTime-time)>.05,before.time);};
 try{
  await reference.setContent('<button id="start">別タブの音声を再生</button><audio loop src="'+referenceWav()+'"></audio><p>ブラウザー内の参照音声。携帯の他アプリの実機検証ではありません。</p><script>document.querySelector("audio").volume=.01;document.querySelector("#start").onclick=()=>document.querySelector("audio").play();</script>');
  await reference.bringToFront();await reference.locator('#start').click();await stillPlaying();
  await page.bringToFront();
  await page.goto(origin);await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);await passive('Initial startup while reference audio plays');await stillPlaying();
  await page.evaluate(async()=>{
   S=Object.assign(structuredClone(S0),{viewer:false,recMode:false,ghToken:'',bkGistId:'',src:'',autoPub:false,bkAuto:false,groupId:'audio-group',showId:'audio-show',liveShow:'audio-show',
    groups:[{id:'audio-group',name:'OCHA NORMA'}],members:[{id:'audio-member',name:'斉藤'}],rosters:{'OCHA NORMA':['斉藤']},shows:[{id:'audio-show',groupId:'audio-group',name:'音声を使わない合成公演'}],
    songs:[{id:'audio-song',showId:'audio-show',groupId:'audio-group',title:'合成LIVE曲',roster:['audio-member'],blocks:{},lines:[{t:'確認する合成歌詞',label:'斉藤',parts:['audio-member']}]}],
    rsongs:[{id:'audio-rec-song',groupId:'audio-group',title:'合成REC曲',recArtist:'OCHA NORMA',lines:[{t:'確認するREC合成歌詞',sec:'1A',parts:[],recAssignmentHint:{type:'count',count:1}}]}],rsongId:'audio-rec-song',
    pt:{on:true,mode:'direct',url:'https://bridge.invalid',token:'synthetic-kept-audio-setting'},recs:{'kept-audio':{size:44,dur:1}},notes:[{id:'audio-note',songId:'audio-song',showId:'audio-show',lineIdx:0,tags:[],memo:'保持する指摘',memberIds:['audio-member']}],plan:{slots:[]}});
   S.songs.forEach(so=>so.sig=sigOf(so));
   startupRecoveryNetworkHold=true;Object.assign(U,{view:'live',songIdx:0,menu:null,sheet:null,overview:false,picker:false,recArtistFilter:'',recSchedulePaused:true});renderPointers.clear();scrollingUntil=0;save();await saveNow();render();
  });
  const kept=await page.evaluate(()=>JSON.stringify([S.songs,S.rsongs,S.notes,S.recs,S.pt,S.plan]));
  await page.bringToFront();await page.locator('[data-act="go-setup"]').click();await passive('LIVE settings tap while reference audio plays');await stillPlaying();
  await page.locator('[data-settings-panel="practice"] summary').click();await passive('Opening piano settings without playing');
  await page.locator('[data-act="recon"]').click();await page.locator('[data-act="ruse"][data-id="audio-rec-song"]').click();await page.locator('[data-act="go-setup"]').click();await passive('REC navigation');
  await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  assert.equal(await page.evaluate(()=>S.recMode),true);await passive('Cold reload of saved REC with legacy audio settings');await stillPlaying();
  await reference.bringToFront();await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await passive('Returning to the app');await stillPlaying();
  await page.locator('[data-act="go-setup"]').click();await screenshot(page,width,'audio-passive-rec-settings');
  assert.deepEqual(await page.evaluate(()=>[S.songs,S.rsongs,S.notes,S.recs,S.pt,S.plan]),JSON.parse(kept));
  const owner=await page.evaluate(()=>JSON.stringify(S));
  await page.evaluate(async()=>{const wire=publicationData('audio-group');S.viewer=true;applySetlist(wire);Object.assign(U,{view:'summary',mode:'member',memberName:'',sheet:null,menu:null});renderPointers.clear();scrollingUntil=0;save();await saveNow();render();});
  await page.locator('#summary-member').click();await page.keyboard.press('Escape');await passive('Received member-screen selector');
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);await passive('Saved member-screen reopen');await stillPlaying();await screenshot(page,width,'audio-passive-member-reopen');
  await page.evaluate(async owner=>{S=JSON.parse(owner);S.recMode=false;Object.assign(U,{view:'live',songIdx:0,menu:null,sheet:null,picker:false,overview:false});renderPointers.clear();scrollingUntil=0;save();await saveNow();render();},owner);
  await page.locator('[data-act="go-setup"]').click();await page.locator('[data-settings-panel="practice"] summary').click();await passive('All ordinary controls before explicit sound');
  await page.locator('[data-settings-panel="practice"] [data-act="key"][data-id="C4"]').click();await page.waitForFunction(()=>__audioAudit.oscillators>0&&AC?.state==='running');
  let explicit=await page.evaluate(()=>__audioAudit);assert.equal(explicit.contexts,1);assert.equal(explicit.mediaPlays,0);assert.equal(explicit.microphones,0);
  await page.locator('[data-act="metstart"]').click();await page.waitForFunction(()=>__audioAudit.oscillators>=3);if(!await page.locator('[data-settings-panel="practice"]').evaluate(el=>el.open))await page.locator('[data-settings-panel="practice"] summary').click();await page.locator('[data-act="metstop"]').click();
  await page.waitForTimeout(1500);await stillPlaying();const stopped=await page.evaluate(()=>structuredClone(__audioAudit));
  await reference.bringToFront();await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>__audioAudit),stopped,'Reopening does not restart or acquire audio after an explicit sound has finished');await stillPlaying();
  await screenshot(page,width,'audio-explicit-piano-and-metronome');await screenshot(reference,width,'audio-reference-still-playing');assert.deepEqual(errors,[]);
  return {passiveStartupWithoutAudio:true,passiveNavigationWithoutAudio:true,savedRECAndMemberReopenWithoutAudio:true,browserReferencePlaybackContinued:true,explicitPianoAndMetronomeWork:true,noSilentAudioLoop:true,audioDataPreserved:true,actualPhoneAudioFocusVerified:false};
 }catch(e){await screenshot(page,width,'audio-passive-failure');throw e;
 }finally{await reference.close();await page.close();}
}
module.exports={checkPassiveAudio};
