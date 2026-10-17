'use strict';
const assert=require('node:assert/strict');

// Exercise trusted clicks and the same pointer events as the setlist handles.
// Desktop headless engines verify focus timing, not a physical phone keyboard.
async function drag(page,source,target,{cancel=false}={}){
 await source.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();
 let from=await source.boundingBox(),to=await target.boundingBox();
 assert(from&&to,'Both drag endpoints must be visible');
 await source.evaluate((el,midpoint)=>{const scroller=el.closest('.scroll');if(scroller){const bounds=scroller.getBoundingClientRect();scroller.scrollTop+=midpoint-(bounds.top+bounds.height/2);}},(Math.min(from.y,to.y)+Math.max(from.y+from.height,to.y+to.height))/2);
 from=await source.boundingBox();to=await target.boundingBox();
 assert.equal(await source.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'The drag starts on its visible handle');
 assert.equal(await target.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'The drag ends on its visible target');
 await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
 await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});
 if(cancel)await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1,pointerType:'mouse'})));
 await page.mouse.up();
}
async function closeFolders(page,selector){
 for(const folder of await page.locator(selector).all())if(await folder.evaluate(el=>el.open))await folder.locator(':scope > summary').click();
}
async function checkLiveSongRename(page,width,{mode,screenshot}){
 await mode(page,false);
 const before=JSON.parse(await page.evaluate(()=>qaContent())),nextName='LIVE共通操作の曲名';
 const originalName=before.songs.find(song=>song.id==='song-a').title,selected=await page.evaluate(()=>SONGS()[U.songIdx].id);
 const form=page.locator('#song-rename-form'),field=page.locator('#song-name');
 const open=async()=>{
  await page.locator('[data-drop="g:song-a"] [data-act="songmenu"]').click();
  await page.getByRole('dialog',{name:'曲の操作',exact:true}).getByRole('button',{name:'曲名を変更',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'曲名を変更',exact:true});
  assert.deepEqual(await dialog.getByRole('button').allTextContents(),['閉じる','保存']);
  assert.equal(await field.evaluate(el=>document.activeElement===el&&!el.readOnly),true);
  assert.equal(await dialog.getByLabel('曲名',{exact:true}).getAttribute('id'),'song-name');
 };
 await open();assert.equal(await field.inputValue(),originalName);
 await field.fill('取り消す曲名');await form.locator('..').getByRole('button',{name:'閉じる',exact:true}).click();
 assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before);
 await open();await field.fill(nextName);await screenshot(page,width,'live-common-song-rename');
 await form.getByRole('button',{name:'保存',exact:true}).click();await page.waitForFunction(()=>!U.menu);
 before.songs.find(song=>song.id==='song-a').title=nextName;
 assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before,'LIVE rename changes only the chosen title');
 assert.equal(await page.evaluate(()=>SONGS()[U.songIdx].id),selected);
 await open();assert.equal(await field.inputValue(),nextName);
 await form.locator('..').getByRole('button',{name:'閉じる',exact:true}).click();
}
async function checkLiveFolderManagement(page,width,{mode,assertFits,screenshot,confirmNext}){
 await mode(page,false);const folderName='LIVE作成検証',before=await page.evaluate(()=>qaContent());
 const form=page.locator('#organize-form'),field=page.locator('#org-name');
 await page.getByRole('button',{name:'＋ フォルダ',exact:true}).click();
 assert.equal(await page.getByRole('dialog',{name:'フォルダを作成',exact:true}).count(),1);
 assert.equal(await field.evaluate(el=>document.activeElement===el),true);
 await field.fill('取り消す新規フォルダ');await form.locator('..').getByRole('button',{name:'閉じる',exact:true}).click();
 assert.equal(await page.evaluate(()=>qaContent()),before);
 await page.getByRole('button',{name:'＋ フォルダ',exact:true}).click();await field.fill(folderName);
 await form.getByRole('button',{name:'フォルダを作成',exact:true}).click();await page.waitForFunction(()=>!U.menu);
 const folder=page.locator('.performance-folder').filter({has:page.locator('.performance-folder-name').filter({hasText:new RegExp('^'+folderName+'$')})});
 await folder.waitFor({state:'visible'});assert.equal(await page.evaluate(()=>qaContent()),before);
 await folder.locator(':scope > summary [data-act="folder-actions"]').click();
 const menu=page.getByRole('dialog',{name:folderName,exact:true}),beforeDelete=await page.evaluate(()=>JSON.stringify(S));
 await menu.getByRole('button',{name:'フォルダを削除',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.stringify(S)),beforeDelete,'Cancelling deletion preserves metadata and content');
 confirmNext();await menu.getByRole('button',{name:'フォルダを削除',exact:true}).click();await page.waitForFunction(()=>!U.menu);
 assert.equal(await page.evaluate(()=>qaContent()),before,'Folder deletion retains every song and recording');
 assert.equal(await folder.count(),0);await assertFits(page);await screenshot(page,width,'live-folder-created-deleted');
}
async function checkFolderInteractions(page,width,{mode,assertFits,screenshot,confirmNext}){
 const saved=await page.evaluate(async()=>{await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,saveErr};});
 try{
  await page.evaluate(()=>{
   document.activeElement?.blur();S=JSON.parse(JSON.stringify(S));saveErr=false;startupRecoveryNetworkHold=true;
   S.shows.push({id:'qa-folder-old',groupId:'group-a',name:'2026/10/01 公演',folder:'古いフォルダ',nopub:true},
    {id:'qa-folder-other',groupId:'group-b',name:'2026/10/02 公演',folder:'合成フォルダ',nopub:true},
    {id:'qa-folder-hidden',groupId:'group-a',name:'2026/10/03 公演',folder:'合成フォルダ',hidden:true,nopub:true});
   S.folderOrder.push('古いフォルダ');S.folders['古いフォルダ']=true;
   S.performanceFolderOrders={'["group-b"]':{mode:'manual',names:['別グループ','合成フォルダ']}};
   window.__folderQA={backup:automaticBackupBeforeEdit,clicks:[],backupCalls:0};
   window.__folderQA.clickListener=e=>{
    if(e.target.closest('[data-act]')?.dataset.act==='frename')
     window.__folderQA.clicks.push({trusted:e.isTrusted,active:document.activeElement?.id,backupCalls:window.__folderQA.backupCalls});
   };
   document.addEventListener('click',window.__folderQA.clickListener);
  });
  {
   await mode(page,false);
   await page.evaluate(()=>{
    U.showFilter='group-a';
    renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
    window.__folderQA.backupCalls=0;
    automaticBackupBeforeEdit=async()=>{window.__folderQA.backupCalls++;return new Promise(resolve=>window.__folderQA.finishBackup=resolve);};
   });
   const content=await page.evaluate(()=>qaContent());
   const field=page.locator('#org-name'),form=page.locator('#organize-form');
   const originalName='合成フォルダ',nextName='LIVEキーボード検証';
   const folder=page.locator('.performance-folder').filter({has:page.locator('[data-drop="s:show-a"]')});
   assert.equal(await folder.locator(':scope > summary .performance-folder-name').innerText(),originalName,'LIVE displays the saved folder name as the whole heading');
   const open=async()=>{
    await folder.locator(':scope > summary [data-act="folder-actions"]').click();
    assert.deepEqual(await page.locator('.organize-sheet').getByRole('button').allTextContents(),['閉じる','名前を変更','フォルダを削除'],'LIVE folder actions stay available');
    assert.equal(await page.locator('.organize-sheet [data-act="fup"],.organize-sheet [data-act="fdown"]').count(),0);
    await page.locator('[data-act="frename"]').click();
    const dialog=page.getByRole('dialog',{name:'フォルダ名を変更',exact:true});
    assert.equal(await dialog.count(),1,'LIVE folder rename stays available');
    assert.deepEqual(await dialog.getByRole('button').allTextContents(),['閉じる','保存'],'LIVE keeps its close and save controls');
    assert.equal(await dialog.getByLabel('フォルダ名',{exact:true}).getAttribute('id'),'org-name');
    assert.equal(await field.evaluate(el=>document.activeElement===el),true,'Rename field receives focus');
    assert.deepEqual(await page.evaluate(()=>window.__folderQA.clicks.at(-1)),{trusted:true,active:'org-name',backupCalls:0},'Focus occurs in the original click before any backup');
   };
   for(let repeat=0;repeat<2;repeat++){
    await open();assert.equal(await field.inputValue(),originalName);await field.fill('保存しない下書き');
    await page.evaluate(()=>render());assert.equal(await field.inputValue(),'保存しない下書き');
    assert.equal(await field.evaluate(el=>document.activeElement===el),true,'Ordinary render preserves typing focus');
    await form.locator('..').locator('[data-act="org-close"]').click();
    assert.equal(await page.evaluate(()=>qaContent()),content,'Cancelling rename leaves all content untouched');
   }
   await open();await field.fill(nextName);await assertFits(page);await screenshot(page,width,'live-rename-input');
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
   assert.equal(await folder.locator(':scope > summary .performance-folder-name').innerText(),nextName,'LIVE replaces the complete folder heading');
   const savedRename=await page.evaluate(()=>qaContent());
   await page.evaluate(()=>window.__folderQA.backupCalls=0);await open();
   assert.equal(await field.inputValue(),nextName,'Reopening rename starts with the current visible name');
   await field.fill('取り消す二度目の変更');
   await form.locator('..').locator('[data-act="org-close"]').click();
   assert.equal(await page.evaluate(()=>qaContent()),savedRename,'Cancelling a subsequent rename preserves the saved name');
   assert.deepEqual(await page.evaluate(()=>['show-a','qa-folder-other','qa-folder-hidden'].map(id=>S.shows.find(x=>x.id===id).folder)),[nextName,'合成フォルダ','合成フォルダ']);
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
  await checkLiveSongRename(page,width,{mode,screenshot});
  await checkLiveFolderManagement(page,width,{mode,assertFits,screenshot,confirmNext});
  const persisted=await page.evaluate(async()=>{save();await saveNow();const state=unpackState(JSON.parse(await loadRaw()));return {error:saveErr,actual:JSON.stringify(state.performanceFolderOrders),expected:JSON.stringify(S.performanceFolderOrders)};});
  assert.equal(persisted.error,false);assert.equal(persisted.actual,persisted.expected,'LIVE scoped folder orders survive durable storage');
  await mode(page,false);const contentBefore=await page.evaluate(()=>qaContent()),otherScope=await page.evaluate(()=>JSON.stringify(S.performanceFolderOrders['["group-b"]']));
  await page.getByRole('button',{name:'新しい日付順に戻す',exact:true}).click();
  await page.waitForFunction(()=>S.performanceFolderOrders['["group-a"]']?.mode==='date');
  assert.equal(await page.evaluate(()=>qaContent()),contentBefore);
  assert.equal(await page.evaluate(()=>JSON.stringify(S.performanceFolderOrders['["group-b"]'])),otherScope,'Resetting one LIVE scope preserves another');
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
 return {liveFolderNameWholeHeading:true,liveFolderRenameImmediateFocus:true,liveFolderRenameCancel:true,liveFolderRenameCheckpoint:true,liveFolderDraftRenderPreserved:true,liveFolderDrag:true,liveFolderDragCancel:true,liveSongDrag:true,liveSongRename:true,liveFolderCreateDelete:true,liveFolderOrderScopeAndStorage:true};
}
module.exports={checkFolderInteractions};
