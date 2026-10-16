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
async function checkCommonSongRename(page,width,{mode,screenshot}){
 for(const rec of [false,true]){
  await mode(page,rec);
  const id=rec?'rec-a':'song-a',nextName=rec?'REC共通操作の曲名':'LIVE共通操作の曲名';
  const before=JSON.parse(await page.evaluate(()=>qaContent()));
  const originalName=(rec?before.rsongs:before.songs).find(song=>song.id===id).title;
  const selected=await page.evaluate(rec=>rec?S.rsongId:SONGS()[U.songIdx].id,rec);
  const form=page.locator('#song-rename-form'),field=page.locator('#song-name');
  const open=async()=>{
   if(rec){
    const folder=page.locator('.rec-date').filter({has:page.locator('[data-act="ruse"][data-id="rec-a"]')});
    if(!await folder.evaluate(el=>el.open))await folder.locator(':scope > summary').click();
    await page.locator('[data-act="rec-song-actions"][data-id="rec-a"]').click();
   }else await page.locator('[data-drop="g:song-a"] [data-act="songmenu"]').click();
   const menu=page.getByRole('dialog',{name:'曲の操作',exact:true});
   await menu.getByRole('button',{name:'曲名を変更',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'曲名を変更',exact:true});
   assert.deepEqual(await dialog.getByRole('button').allTextContents(),['閉じる','保存'],'Both modes use the same song rename controls');
   assert.equal(await field.evaluate(el=>document.activeElement===el&&!el.readOnly),true);
   assert.equal(await dialog.getByLabel('曲名',{exact:true}).getAttribute('id'),'song-name');
  };
  await open();assert.equal(await field.inputValue(),originalName);
  await field.fill('取り消す曲名');await form.locator('..').getByRole('button',{name:'閉じる',exact:true}).click();
  assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before,'Cancelling a song rename preserves all content');
  await open();assert.equal(await field.inputValue(),originalName);await field.fill(nextName);
  await screenshot(page,width,rec?'rec-common-song-rename':'live-common-song-rename');
  await form.getByRole('button',{name:'保存',exact:true}).click();await page.waitForFunction(()=>!U.menu);
  (rec?before.rsongs:before.songs).find(song=>song.id===id).title=nextName;
  assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before,'Song rename only changes the chosen title, preserving lyrics, dates and classification');
  assert.equal(await page.evaluate(rec=>rec?S.rsongId:SONGS()[U.songIdx].id,rec),selected,'Renaming a song preserves the selection');
  await open();assert.equal(await field.inputValue(),nextName,'Reopened song rename starts with the current title');
  await form.locator('..').getByRole('button',{name:'閉じる',exact:true}).click();
 }
}
async function checkCommonFolderManagement(page,width,{mode,assertFits,screenshot,confirmNext}){
 for(const rec of [false,true]){
  await mode(page,rec);const folderName=rec?'REC作成移動検証':'LIVE作成検証';
  const before=JSON.parse(await page.evaluate(()=>qaContent()));
  const form=page.locator('#organize-form'),field=page.locator('#org-name');
  await page.getByRole('button',{name:'＋ フォルダ',exact:true}).click();
  assert.equal(await page.getByRole('dialog',{name:'フォルダを作成',exact:true}).count(),1);
  assert.equal(await field.evaluate(el=>document.activeElement===el),true);
  await field.fill('取り消す新規フォルダ');await form.locator('..').getByRole('button',{name:'閉じる',exact:true}).click();
  assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before);
  await page.getByRole('button',{name:'＋ フォルダ',exact:true}).click();await field.fill(folderName);
  await form.getByRole('button',{name:'フォルダを作成',exact:true}).click();await page.waitForFunction(()=>!U.menu);
  const folder=page.locator(rec?'.rec-date':'.performance-folder').filter({has:page.locator('.performance-folder-name').filter({hasText:new RegExp('^'+folderName+'$')})});
  await folder.waitFor({state:'visible'});assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before,'Creating an empty folder preserves all content');
  if(rec){
   await page.locator('[data-act="rec-song-actions"][data-id="rec-a"]').click();
   await page.getByRole('dialog',{name:'曲の操作',exact:true}).getByRole('button',{name:'保存フォルダを変更',exact:true}).click();
   assert.equal(await page.getByRole('dialog',{name:'フォルダを選択',exact:true}).count(),1);
   await page.locator('#org-folder').selectOption({label:folderName});
   await form.getByRole('button',{name:'ここに移動',exact:true}).click();await page.waitForFunction(()=>!U.menu);
   before.rsongs.find(song=>song.id==='rec-a').recSession.displayLabel=folderName;
   assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before,'Moving into a visible REC folder preserves the original date, artist and session');
   assert.equal(await folder.locator('[data-act="ruse"][data-id="rec-a"]').count(),1);
   const otherFolder=page.locator('.rec-date').filter({has:page.locator('[data-act="ruse"][data-id="rec-b"]')});
   if(!await otherFolder.evaluate(el=>el.open))await otherFolder.locator(':scope > summary').click();
   if(!await folder.evaluate(el=>el.open))await folder.locator(':scope > summary').click();
   await drag(page,page.locator('[data-drag="rec:rec-b"]'),folder.locator('[data-drop="r:rec-a"]'));
   await page.waitForFunction(name=>S.rsongs.find(song=>song.id==='rec-b').recSession.displayLabel===name,folderName);
   before.rsongs.find(song=>song.id==='rec-b').recSession.displayLabel=folderName;
   assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before,'Dropping onto another folder song moves only folder membership, preserving different dates and artists');
  }
  await folder.locator(':scope > summary [data-act="'+(rec?'rec-date-actions':'folder-actions')+'"]').click();
  const menu=page.getByRole('dialog',{name:folderName,exact:true});
  const beforeDelete=await page.evaluate(()=>JSON.stringify(S));
  await menu.getByRole('button',{name:'フォルダを削除',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),beforeDelete,'Cancelling folder deletion also preserves its metadata');
  assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before,'Cancelling folder deletion preserves all content');
  confirmNext();await menu.getByRole('button',{name:'フォルダを削除',exact:true}).click();await page.waitForFunction(()=>!U.menu);
  if(rec){
   for(const song of before.rsongs.filter(song=>['rec-a','rec-b'].includes(song.id))){delete song.recSession.displayLabel;song.recSession.folderless=true;}
   assert.equal(await page.locator('.rec-date').filter({has:page.locator('[data-act="ruse"][data-id="rec-a"]')}).locator(':scope > summary .performance-folder-name').innerText(),'フォルダなし');
  }
  assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before,'Folder deletion retains every song and recording');
  assert.equal(await folder.count(),0);await assertFits(page);await screenshot(page,width,rec?'rec-folder-created-moved-deleted':'live-folder-created-deleted');
 }
}
async function checkRecordingClassification(page,width,{mode,screenshot}){
 await mode(page,true);const before=JSON.parse(await page.evaluate(()=>qaContent()));
 const original=before.rsongs.find(song=>song.id==='rec-b'),form=page.locator('#rec-classification-form');
 const open=async()=>{
  await page.locator('[data-act="rec-song-actions"][data-id="rec-b"]').click();
  await page.getByRole('dialog',{name:'曲の操作',exact:true}).getByRole('button',{name:'日付・アーティストを変更',exact:true}).click();
  assert.equal(await page.getByRole('dialog',{name:'日付・アーティストを変更',exact:true}).count(),1);
  assert.equal(await page.locator('#rec-classification-date').evaluate(el=>document.activeElement===el),true);
  assert.equal(await page.locator('#rec-classification-date').inputValue(),original.recSession.label);
  assert.equal(await page.locator('#rec-classification-artist').inputValue(),original.recArtist);
 };
 await open();await page.locator('#rec-classification-date').fill('2026/10/22');
 await form.locator('..').getByRole('button',{name:'閉じる',exact:true}).click();
 assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before);
 await open();await page.locator('#rec-classification-date').fill('2026/10/22');await page.locator('#rec-classification-artist').fill('検証アーティスト');
 await screenshot(page,width,'rec-classification-form');await form.getByRole('button',{name:'保存',exact:true}).click();await page.waitForFunction(()=>!U.menu);
 original.recSession.label='2026/10/22';original.recArtist='検証アーティスト';
 assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),before,'Date and artist changes retain the custom folder name, session identity, lyrics and records');
 const folder=page.locator('.rec-date').filter({has:page.locator('[data-act="ruse"][data-id="rec-b"]')});
 assert.equal(await folder.locator(':scope > summary .performance-folder-name').innerText(),'RECキーボード検証');
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
   const field=page.locator('#org-name'),form=page.locator('#organize-form');
   const originalName=rec?'検証用フォルダ名':'合成フォルダ',nextName=rec?'RECキーボード検証':'LIVEキーボード検証';
   const folder=rec?page.locator('.rec-date').filter({has:page.locator('[data-act="ruse"][data-id="rec-a"]')}):page.locator('.performance-folder').filter({has:page.locator('[data-drop="s:show-a"]')});
   assert.equal(await folder.locator(':scope > summary .performance-folder-name').innerText(),originalName,'Both modes display the saved folder name as the whole heading');
   const open=async()=>{
    await folder.locator(':scope > summary [data-act="'+(rec?'rec-date-actions':'folder-actions')+'"]').click();
    assert.deepEqual(await page.locator('.organize-sheet').getByRole('button').allTextContents(),['閉じる','名前を変更','フォルダを削除'],'Both modes use the same folder action menu');
    assert.equal(await page.locator('.organize-sheet [data-act="fup"],.organize-sheet [data-act="fdown"]').count(),0);
    await page.locator('[data-act="'+(rec?'rec-date-rename':'frename')+'"]').click();
    const dialog=page.getByRole('dialog',{name:'フォルダ名を変更',exact:true});
    assert.equal(await dialog.count(),1,'Both modes use the same folder rename dialog');
    assert.deepEqual(await dialog.getByRole('button').allTextContents(),['閉じる','保存'],'Both modes have the same close and save controls');
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
   assert.equal(await folder.locator(':scope > summary .performance-folder-name').innerText(),nextName,'Both modes replace the complete folder heading');
   const savedRename=await page.evaluate(()=>qaContent());
   await page.evaluate(()=>window.__folderQA.backupCalls=0);await open();
   assert.equal(await field.inputValue(),nextName,'Reopening rename starts with the current visible name');
   await field.fill('取り消す二度目の変更');
   await form.locator('..').locator('[data-act="org-close"]').click();
   assert.equal(await page.evaluate(()=>qaContent()),savedRename,'Cancelling a subsequent rename preserves the saved name');
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
  await page.evaluate(()=>{renderPointers.clear();scrollingUntil=0;render(true);});
  assert.equal(await page.locator('.rec-date[open]').count(),0,'REC folder disclosure state survives a redraw like LIVE');
  const recFolders=page.locator('.rec-date'),recBefore=await page.evaluate(()=>qaContent()),otherRecOrder=await page.evaluate(()=>JSON.stringify(S.recordingDateFolderOrders['["歌手B"]']));
  const recKey=JSON.stringify(['2026/10/01','']),newKey=JSON.stringify(['RECキーボード検証']);
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
  await checkCommonSongRename(page,width,{mode,screenshot});
  await checkRecordingClassification(page,width,{mode,screenshot});
  await checkCommonFolderManagement(page,width,{mode,assertFits,screenshot,confirmNext});
  const persisted=await page.evaluate(async()=>{save();await saveNow();const raw=await loadRaw(),state=unpackState(JSON.parse(raw));return {error:saveErr,actual:JSON.stringify([state.performanceFolderOrders,state.recordingDateFolderOrders]),expected:JSON.stringify([S.performanceFolderOrders,S.recordingDateFolderOrders])};});
  assert.equal(persisted.error,false);assert.equal(persisted.actual,persisted.expected,'Both scoped folder orders survive durable storage');
  for(const rec of [false,true]){
   await mode(page,rec);if(rec)await page.locator('[data-act="rec-artist-filter"][data-id="歌手A"]').click();
   const contentBefore=await page.evaluate(()=>qaContent());
   const otherScope=await page.evaluate(rec=>JSON.stringify(rec?S.recordingDateFolderOrders['["歌手B"]']:S.performanceFolderOrders['["group-b"]']),rec);
   await page.getByRole('button',{name:'新しい日付順に戻す',exact:true}).click();
   await page.waitForFunction(rec=>rec?!S.recordingDateFolderOrders['["歌手A"]']:S.performanceFolderOrders['["group-a"]']?.mode==='date',rec);
   assert.equal(await page.evaluate(()=>qaContent()),contentBefore);
   assert.equal(await page.evaluate(rec=>JSON.stringify(rec?S.recordingDateFolderOrders['["歌手B"]']:S.performanceFolderOrders['["group-b"]']),rec),otherScope,'Resetting one scope preserves another scope');
  }
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
 return {folderNameWholeHeading:true,folderRenameCurrentNamePrefill:true,folderRenameImmediateFocus:true,folderRenameCancel:true,folderRenameCheckpoint:true,folderDraftRenderPreserved:true,folderDragLiveRec:true,folderDragCancel:true,folderOpenStatePreserved:true,songDragLiveRec:true,songRenameCommonControls:true,recClassificationForm:true,recCrossFolderRowDrop:true,folderCreateMoveDelete:true,folderResetCommonControls:true,folderOrderScopeAndStorage:true};
}
module.exports={checkFolderInteractions};
