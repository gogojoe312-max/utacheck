'use strict';
const assert=require('node:assert/strict');

// Exercise trusted clicks and the same pointer events as the setlist handles.
// Desktop headless engines verify focus timing, not a physical phone keyboard.
async function drag(page,source,target,{cancel=false}={}){
 await source.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();
 const from=await source.boundingBox(),to=await target.boundingBox();
 assert(from&&to,'Both drag endpoints must be visible');
 await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
 await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});
 if(cancel)await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1,pointerType:'mouse'})));
 await page.mouse.up();
}
async function closeFolders(page,selector){
 for(const folder of await page.locator(selector).all())if(await folder.evaluate(el=>el.open))await folder.locator(':scope > summary').click();
}
async function checkFolderInteractions(page,width,{mode,assertFits,screenshot}){
 const saved=await page.evaluate(async()=>{await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,saveErr};});
 try{
  await page.evaluate(()=>{
   document.activeElement?.blur();S=JSON.parse(JSON.stringify(S));saveErr=false;startupRecoveryNetworkHold=true;
   S.shows.push({id:'qa-folder-old',groupId:'group-a',name:'2026/10/01 公演',folder:'古いフォルダ',nopub:true},
    {id:'qa-folder-other',groupId:'group-b',name:'2026/10/02 公演',folder:'合成フォルダ',nopub:true},
    {id:'qa-folder-hidden',groupId:'group-a',name:'2026/10/03 公演',folder:'合成フォルダ',hidden:true,nopub:true});
   S.folderOrder.push('古いフォルダ');S.folders['古いフォルダ']=true;
   S.performanceFolderOrders={'["group-b"]':{mode:'manual',names:['別グループ','合成フォルダ']}};
   S.rsongs.push({id:'qa-rec-old',groupId:'group-a',title:'古いREC',recArtist:'歌手A',recSession:{id:'qa-session-old',label:'2026/10/01'},lines:[{t:'保持する歌詞'}]});
   S.recordingDateFolderOrders={'["歌手B"]':[JSON.stringify(['2026/10/09',''])]};
   window.__folderQA={backup:automaticBackupBeforeEdit,clicks:[],backupCalls:0};
   window.__folderQA.clickListener=e=>{
    if(['frename','rec-date-rename'].includes(e.target.closest('[data-act]')?.dataset.act))
     window.__folderQA.clicks.push({trusted:e.isTrusted,active:document.activeElement?.id,backupCalls:window.__folderQA.backupCalls});
   };
   document.addEventListener('click',window.__folderQA.clickListener);
  });
  for(const rec of [false,true]){
   await mode(page,rec);
   await page.evaluate(rec=>{
    U.showFilter='group-a';U.recArtistFilter=rec?'歌手A':'';
    renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
    window.__folderQA.backupCalls=0;
    automaticBackupBeforeEdit=async()=>{window.__folderQA.backupCalls++;return new Promise(resolve=>window.__folderQA.finishBackup=resolve);};
   },rec);
   const content=await page.evaluate(()=>qaContent());
   const field=page.locator(rec?'#rec-date-name':'#org-name'),form=page.locator(rec?'#rec-date-rename-form':'#organize-form');
   const originalName=rec?'検証用フォルダ名':'合成フォルダ',nextName=rec?'RECキーボード検証':'LIVEキーボード検証';
   const folder=rec?page.locator('.rec-date').filter({has:page.locator('[data-act="ruse"][data-id="rec-a"]')}):page.locator('.performance-folder[data-performance-folder="合成フォルダ"]');
   const open=async()=>{
    await folder.locator(':scope > summary [data-act="'+(rec?'rec-date-actions':'folder-actions')+'"]').click();
    assert.equal(await page.locator('.organize-sheet [data-act="fup"],.organize-sheet [data-act="fdown"]').count(),0);
    await page.locator('[data-act="'+(rec?'rec-date-rename':'frename')+'"]').click();
    assert.equal(await field.evaluate(el=>document.activeElement===el),true,'Rename field receives focus');
    assert.deepEqual(await page.evaluate(()=>window.__folderQA.clicks.at(-1)),{trusted:true,active:rec?'rec-date-name':'org-name',backupCalls:0},'Focus occurs in the original click before any backup');
   };
   for(let repeat=0;repeat<2;repeat++){
    await open();assert.equal(await field.inputValue(),originalName);await field.fill('保存しない下書き');
    await page.evaluate(()=>render());assert.equal(await field.inputValue(),'保存しない下書き');
    assert.equal(await field.evaluate(el=>document.activeElement===el),true,'Ordinary render preserves typing focus');
    await form.locator('..').locator('[data-act="'+(rec?'closemenu':'org-close')+'"]').click();
    assert.equal(await page.evaluate(()=>qaContent()),content,'Cancelling rename leaves all content untouched');
   }
   await open();await field.fill(nextName);await assertFits(page);await screenshot(page,width,rec?'rec-rename-input':'live-rename-input');
   const beforeSave=await page.evaluate(()=>JSON.stringify(S));
   await form.evaluate(el=>{window.__folderQA.draftForm=el;pendingRender=true;});
   await form.locator('button[type="submit"]').click();
   await page.waitForFunction(()=>window.__folderQA.backupCalls===1);
   await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
   assert.equal(await form.evaluate(el=>el===window.__folderQA.draftForm),true,'A pending render on focusout keeps the submitted form');
   assert.equal(await field.inputValue(),nextName);
   assert.equal(await page.evaluate(()=>JSON.stringify(S)),beforeSave,'Rename waits for a successful checkpoint');
   await page.evaluate(()=>window.__folderQA.finishBackup(true));await page.waitForFunction(()=>!U.menu);
   await page.evaluate(()=>automaticBackupBeforeEdit=window.__folderQA.backup);
   if(rec){
    const changed=await page.evaluate(()=>S.rsongs.filter(x=>['rec-a','rec-b'].includes(x.id)).map(x=>[x.id,x.recSession.label,x.recSession.displayLabel]));
    assert.deepEqual(changed,[['rec-a','2026/10/08',nextName],['rec-b','2026/10/08',nextName]]);
   }else{
    assert.deepEqual(await page.evaluate(()=>['show-a','qa-folder-other','qa-folder-hidden'].map(id=>S.shows.find(x=>x.id===id).folder)),[nextName,'合成フォルダ','合成フォルダ']);
   }
  }
  await mode(page,false);await closeFolders(page,'.performance-folder');
  const liveNames=()=>page.locator('.performance-folder').evaluateAll(nodes=>nodes.map(el=>el.dataset.performanceFolder));
  assert.deepEqual(await liveNames(),['LIVEキーボード検証','古いフォルダ']);
  const liveBefore=await page.evaluate(()=>qaContent()),otherLiveOrder=await page.evaluate(()=>JSON.stringify(S.performanceFolderOrders['["group-b"]']));
  const liveHandle=page.locator('[data-drag="performance-folder:古いフォルダ"]'),liveTarget=page.locator('.performance-folder[data-performance-folder="LIVEキーボード検証"] > summary');
  await drag(page,liveHandle,liveTarget,{cancel:true});assert.deepEqual(await liveNames(),['LIVEキーボード検証','古いフォルダ']);
  await drag(page,liveHandle,liveTarget);
  await page.waitForFunction(()=>document.querySelector('.performance-folder')?.dataset.performanceFolder==='古いフォルダ');
  assert.equal(await page.evaluate(()=>qaContent()),liveBefore);assert.equal(await page.evaluate(()=>JSON.stringify(S.performanceFolderOrders['["group-b"]'])),otherLiveOrder);
  assert.deepEqual(await page.evaluate(()=>S.performanceFolderOrders['["group-a"]'].names),['古いフォルダ','LIVEキーボード検証']);
  await assertFits(page);await screenshot(page,width,'live-folder-drag');
  await page.locator('[data-act="songmenu"][data-i="0"]').click();
  assert.equal(await page.getByRole('dialog',{name:'曲の操作',exact:true}).getByText(/曲順を1つ[上下]へ/).count(),0);
  await page.getByRole('dialog',{name:'曲の操作',exact:true}).locator('[data-act="closemenu"]').click();
  const liveSongsBefore=JSON.parse(await page.evaluate(()=>qaContent())),selectedLive=await page.evaluate(()=>SONGS()[U.songIdx].id);
  await drag(page,page.locator('[data-drag="song:song-a"]'),page.locator('[data-drop="g:song-b"]'));
  await page.waitForFunction(()=>SONGS()[0]?.id==='song-b');
  assert.equal(await page.evaluate(()=>SONGS()[U.songIdx].id),selectedLive);
  [liveSongsBefore.songs[0],liveSongsBefore.songs[1]]=[liveSongsBefore.songs[1],liveSongsBefore.songs[0]];
  assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),liveSongsBefore,'LIVE song drag changes only the visible setlist order');
  await mode(page,true);await page.evaluate(()=>{U.recArtistFilter='歌手A';renderPointers.clear();scrollingUntil=0;render(true);});
  await closeFolders(page,'.rec-date');
  const recFolders=page.locator('.rec-date'),recBefore=await page.evaluate(()=>qaContent()),otherRecOrder=await page.evaluate(()=>JSON.stringify(S.recordingDateFolderOrders['["歌手B"]']));
  const recKey=JSON.stringify(['2026/10/01','']),newKey=JSON.stringify(['2026/10/08','RECキーボード検証']);
  const oldRecFolder=recFolders.filter({has:page.locator('[data-act="ruse"][data-id="qa-rec-old"]')}),newRecFolder=recFolders.filter({has:page.locator('[data-act="ruse"][data-id="rec-a"]')});
  await drag(page,oldRecFolder.locator(':scope > summary [data-drag]'),newRecFolder.locator(':scope > summary'),{cancel:true});
  assert((await recFolders.first().locator(':scope > summary').innerText()).includes('RECキーボード検証'));
  await drag(page,oldRecFolder.locator(':scope > summary [data-drag]'),newRecFolder.locator(':scope > summary'));
  await page.waitForFunction(()=>document.querySelector('.rec-date')?.querySelector('[data-act="ruse"]')?.dataset.id==='qa-rec-old');
  assert.equal(await page.evaluate(()=>qaContent()),recBefore);assert.equal(await page.evaluate(()=>JSON.stringify(S.recordingDateFolderOrders['["歌手B"]'])),otherRecOrder);
  assert.deepEqual(await page.evaluate(()=>S.recordingDateFolderOrders['["歌手A"]']),[recKey,newKey]);
  await assertFits(page);await screenshot(page,width,'rec-folder-drag');
  if(!await newRecFolder.evaluate(el=>el.open))await newRecFolder.locator(':scope > summary').click();
  await page.locator('[data-act="rec-song-actions"][data-id="rec-a"]').click();
  assert.equal(await page.getByRole('dialog',{name:'曲の操作',exact:true}).getByText(/1つ[上下]/).count(),0);
  await page.getByRole('dialog',{name:'曲の操作',exact:true}).locator('[data-act="closemenu"]').click();
  const recSongsBefore=JSON.parse(await page.evaluate(()=>qaContent())),selectedRec=await page.evaluate(()=>S.rsongId);
  await drag(page,page.locator('[data-drag="rec:rec-a"]'),page.locator('[data-drop="r:rec-b"]'));
  await page.waitForFunction(()=>S.rsongs[0]?.id==='rec-b');
  assert.equal(await page.evaluate(()=>S.rsongId),selectedRec);
  [recSongsBefore.rsongs[0],recSongsBefore.rsongs[1]]=[recSongsBefore.rsongs[1],recSongsBefore.rsongs[0]];
  assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),recSongsBefore,'REC song drag preserves other dates and artists');
  const persisted=await page.evaluate(async()=>{save();await saveNow();const raw=await loadRaw(),state=unpackState(JSON.parse(raw));return {error:saveErr,actual:JSON.stringify([state.performanceFolderOrders,state.recordingDateFolderOrders]),expected:JSON.stringify([S.performanceFolderOrders,S.recordingDateFolderOrders])};});
  assert.equal(persisted.error,false);assert.equal(persisted.actual,persisted.expected,'Both scoped folder orders survive durable storage');
 }finally{
  await page.evaluate(async saved=>{
   document.activeElement?.blur();const qa=window.__folderQA;
   if(qa){automaticBackupBeforeEdit=qa.backup;document.removeEventListener('click',qa.clickListener);qa.finishBackup?.(false);delete window.__folderQA;}
   S=JSON.parse(saved.state);Object.keys(U).forEach(key=>delete U[key]);Object.assign(U,JSON.parse(saved.ui));
   startupRecoveryNetworkHold=saved.hold;saveErr=false;save();await saveNow();
   if(saveErr)throw Error('Folder QA could not restore prior state');saveErr=saved.saveErr;
   renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
  },saved);
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),saved.state,'Folder QA restores exact prior state');
 }
 return {folderRenameImmediateFocus:true,folderRenameCancel:true,folderRenameCheckpoint:true,folderDraftRenderPreserved:true,folderDragLiveRec:true,folderDragCancel:true,songDragLiveRec:true,folderOrderScopeAndStorage:true};
}
module.exports={checkFolderInteractions};
