'use strict';
const assert=require('node:assert/strict');

// Native IndexedDB and the real receiver/source/commit path; GitHub responses
// and credentials are synthetic and cannot leave this isolated browser.
async function checkProgressPreparation(page,{manifest=null,relay=false,automaticInteraction=false,progressRelay=false}={}){
 const result=await page.evaluate(async({supplied,relay,automaticInteraction,progressRelay})=>{
  const oldFetch=window.fetch,token='qa-progress-token',oldToken='qa-gist-only-token';
  const reads=[],interaction={};
  const waitUntil=async(test,message,ms=5000)=>{const until=Date.now()+ms;while(!test()){if(Date.now()>until)throw Error(message);await new Promise(resolve=>setTimeout(resolve,40));}};
  const pointer=(type,id)=>document.getElementById('app').dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,isPrimary:true,pointerType:'touch'}));
  const interruptFirstResponse=()=>{
   if(!automaticInteraction||interaction.injected)return;
   interaction.injected=true;pointer('pointerdown',701);
   document.querySelector('#app > .scroll')?.dispatchEvent(new Event('scroll',{bubbles:true}));
   interaction.pointerHeld=renderPointers.has(701);
  };
  if(!relay||progressRelay){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('shinkou',2);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put({settings:{sync:{on:true,owner:'gogojoe312-max',repo:'shinkou-data',path:'data.json',branch:'main',token}}},'state');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
  document.activeElement?.blur();saveErr=false;S.viewer=false;S.recMode=true;S.ghToken=progressRelay?'':oldToken;
  recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:true};recordingInboxIntegration=setupRecordingInboxIntegration();
  startupRecoveryNetworkHold=true;
  Object.assign(U,{view:'setup',menu:null,sheet:null,picker:false,showRecovery:false,busy:false,importing:false,recArtistFilter:'歌手A'});
  let manifest=supplied;
  if(!manifest){
   const make=(id,title,artist)=>({app:'utacheck-recording-song',version:1,group:{id:'qa-progress-group-'+id,name:'配信しない',nopub:true},song:{id,title,artist,credit:'Synthetic credit',lines:[{t:'Synthetic new lyric',parts:[]}]},source:{file:'synthetic.docx'}});
   const packets=[make('rec-a','Conflicting older song','歌手A'),make('qa-progress-new','新しいREC合成曲','新しい歌手')];
   const operations=await Promise.all(packets.map(async(packet,i)=>({id:'qa-progress-operation-'+i,type:'recording-song',packet,sha256:await PrivatePreparation.digest(packet)})));
   manifest={app:'utacheck-private-preparation',version:1,owner:'gogojoe312-max',revision:'qa-native-idb',createdAt:'2031-01-01T00:00:00Z',operations};
  }else{
   // Model a device with earlier deliveries but no receipts, including a local
   // edit that must never prevent a later independent session from arriving.
   for(const op of manifest.operations.slice(0,-1))S=PrivatePreparation.apply(S,op,{schedule:RecordingScheduleUpdate.apply,recording:mergeRecordingAddition}).state;
   delete S.privatePreparations;
   S.rsongs[0].title+=' locally edited';
  }
  const before=JSON.stringify({rsongs:S.rsongs,notes:S.notes,recs:S.recs,memos:S.memos,staffMemos:S.staffMemos});
  const last=manifest.operations.at(-1),newSong=last.packet.song||last.packet.songs[0];
  const raw=JSON.stringify(manifest),bytes=new TextEncoder().encode(raw);
  const encoded=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
  window.fetch=async(url,options={})=>{
   const u=new URL(url,location.href);
   if((relay||progressRelay)&&u.href==='https://shinkou-secure.onrender.com/utacheck/prepared'){
    if(options.headers?.Authorization!=='Bearer '+(progressRelay?token:oldToken))throw Error('Relay must use the existing login');
    reads.push({path:u.pathname,relay:true});interruptFirstResponse();return new Response(JSON.stringify({status:'ready',manifest,sourceSha:'a'.repeat(40),sourcePath:'utacheck/prepared.json'}),{headers:{'Content-Type':'application/json'}});
   }
   if(u.origin!=='https://api.github.com')return oldFetch(url,options);
   const allowed=options.headers?.Authorization==='Bearer '+token;
   reads.push({path:u.pathname,progress:allowed});
   let body,status=200;
   if(u.pathname==='/user')body={login:'gogojoe312-max'};
   else if(!allowed||progressRelay){body={message:'Not Found'};status=404;}
   else if(u.pathname==='/repos/gogojoe312-max/shinkou-data')body={private:true,full_name:'gogojoe312-max/shinkou-data',owner:{login:'gogojoe312-max'}};
   else if(u.pathname==='/repos/gogojoe312-max/shinkou-data/contents/utacheck/prepared.json'){interruptFirstResponse();body={type:'file',path:'utacheck/prepared.json',name:'prepared.json',sha:'a'.repeat(40),encoding:'base64',size:bytes.length,content:encoded};}
   else throw Error('Unexpected preparation endpoint');
   return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  };
  try{
   const legacy=await PrivatePreparationSource.read({owner:'gogojoe312-max',repo:'shinkou-data',token:oldToken});
   save();await saveNow();
   await waitUntil(()=>!renderPointers.size&&Date.now()>=scrollingUntil&&!saving,'The previous UI interaction did not settle');
   render(true);
   let received;
   if(automaticInteraction){
    const draft=document.createElement('form');draft.setAttribute('data-save-on-submit','');
    const field=document.createElement('textarea');field.value='Keep the unsaved draft';draft.appendChild(field);document.body.appendChild(draft);field.focus();
    try{
     const editing=await PrivatePreparationUI.receive(false);
     interaction.editingPreserved=editing.status==='deferred'&&editing.reason==='editing'&&document.activeElement===field&&field.value==='Keep the unsaved draft'&&!S.rsongs.some(song=>song.id===newSong.id);
     recordingStartPending=true;field.blur();draft.remove();
     const recording=await PrivatePreparationUI.receive(false);
     interaction.recordingPreserved=recording.status==='deferred'&&recording.reason==='recording'&&!S.rsongs.some(song=>song.id===newSong.id);
    }finally{recordingStartPending=false;field.blur();draft.remove();}
    // A normal connectivity event starts the automatic path even when a prior
    // missing-token attempt happened during the surrounding settings checks.
    window.dispatchEvent(new Event('online'));
    await waitUntil(()=>interaction.injected&&PrivatePreparationUI.getStatus().kind==='deferred','The first automatic receive did not defer during touch');
    interaction.firstStatus=PrivatePreparationUI.getStatus();
    if(interaction.firstStatus.reason!=='interaction')throw Error('Expected the real touch/scroll guard');
    interaction.beforeReleaseAbsent=!S.rsongs.some(song=>song.id===newSong.id);
    pointer('pointercancel',701);pointer('pointerdown',702);pointer('pointerup',702);
    interaction.released=!renderPointers.size;
    const releasedAt=Date.now();
    await waitUntil(()=>S.rsongs.some(song=>song.id===newSong.id)&&PrivatePreparationUI.getStatus().kind==='applied','Automatic preparation did not resume within 5 seconds after interaction');
    interaction.resumeMs=Date.now()-releasedAt;
    const current=PrivatePreparationUI.getStatus();received={status:current.kind,count:current.count,conflicts:current.conflicts};
   }else received=await PrivatePreparationUI.receive(true);
   await waitUntil(()=>!renderPointers.size&&Date.now()>=scrollingUntil&&!saving,'The received UI did not settle');
   await waitUntil(()=>document.getElementById('app').textContent.includes(newSong.artist||newSong.recArtist||''),'The new artist did not become visible');
   const added=S.rsongs.find(s=>s.id===newSong.id),persisted=JSON.parse(await loadRaw());
   const previous=JSON.parse(before);
   const preserved=previous.rsongs.every(s=>JSON.stringify(S.rsongs.find(x=>x.id===s.id))===JSON.stringify(s))
    &&['notes','recs','memos','staffMemos'].every(k=>JSON.stringify(S[k])===JSON.stringify(previous[k]));
   return {legacy,received,reads,interaction,preserved,filter:U.recArtistFilter,
    newSong:added?{id:added.id,title:added.title,artist:added.recArtist||added.artist,lines:added.lines.length}:null,
    receipt:!!persisted.privatePreparations?.[last.id],saved:!!persisted.rsongs?.find(s=>s.id===newSong.id),
    slotCount:last.packet.plan?.slots?.filter(s=>S.plan.slots.some(x=>x.id===s.id)).length||0,
    obsoleteControls:document.querySelectorAll('[data-act="private-preparation-check"],[data-act="private-preparation-setup"]').length,
    credentialLeaked:JSON.stringify(S).includes(token)||JSON.stringify(backupState()).includes(token)||document.documentElement.outerHTML.includes(token),
    status:PrivatePreparationUI.getStatus(),visibleArtist:!!added&&document.getElementById('app').textContent.includes(added.recArtist||added.artist)};
  }finally{window.fetch=oldFetch;}
 },{supplied:manifest,relay,automaticInteraction,progressRelay});
 assert.equal(result.legacy.code,'HTTP_404');assert.equal(result.legacy.stage,'repository');
 assert.equal(result.received.status,'applied',JSON.stringify(result.status));assert.equal(result.saved,true);assert.equal(result.receipt,true);
 assert.equal(result.preserved,true);assert.equal(result.filter,'');assert.equal(result.visibleArtist,true);
 assert.equal(result.obsoleteControls,0);assert.equal(result.credentialLeaked,false);
 if(automaticInteraction){
  assert.equal(result.interaction.firstStatus.kind,'deferred');assert.equal(result.interaction.firstStatus.reason,'interaction');
  for(const key of ['injected','pointerHeld','beforeReleaseAbsent','released','editingPreserved','recordingPreserved'])assert.equal(result.interaction[key],true,key);
  assert(result.interaction.resumeMs<5000);
 }
 if(relay||progressRelay){assert(result.reads.filter(r=>r.relay).length>=2);if(!progressRelay)assert(!result.reads.some(r=>r.progress));}
 else{assert(result.reads.slice(2).length>=6);assert(result.reads.slice(2).every(r=>r.progress));}
 return result;
}
module.exports={checkProgressPreparation};
