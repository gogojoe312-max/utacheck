'use strict';
const assert=require('node:assert/strict');

// Synthetic REC dates only; switching views must never rewrite saved materials.
async function checkRecordingBrowse(page,width,{mode,assertFits,screenshot}){
 const saved=await page.evaluate(async()=>{await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,saveErr,pref:localStorage.getItem('utacheck.recBrowseMode'),selections:Object.keys(localStorage).filter(key=>key.startsWith('utacheck.selection:')).map(key=>[key,localStorage.getItem(key)]),selectionCache:[...viewSelections]};});
 let artistResult={};
 const content=()=>page.evaluate(()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan','recordingFolders','recordingDateFolderOrders','rfolders','rfolderOrder','rsongId','planFocus'].map(key=>[key,S[key]]))));
 const toggle=value=>page.locator('[data-act="rec-browse-mode"][data-id="'+value+'"]');
 const ids=()=>page.locator('[data-rec-browse] [data-act="ruse"]').evaluateAll(nodes=>nodes.map(el=>el.dataset.id));
 const songOrder=['qa-browse-plan','qa-browse-tied','qa-browse-multi','qa-browse-old','qa-browse-yearless','qa-browse-undated'];
 const dateOrder=['2026-10-16','2026-10-14','2026-10-12','2026-10-10','2026-10-08','--10-20','undated'];
 const switchTo=async value=>{await toggle(value).click();await page.locator('[data-rec-browse="'+value+'"]').waitFor({state:'visible'});assert.equal(await toggle(value).getAttribute('aria-pressed'),'true');await assertFits(page);};
 const assertNoFolders=async()=>{
  assert.equal(await page.locator('.rec-date,[data-act="newfolder"],[data-act="rec-date-actions"],[data-drag^="rec:"],[data-drag^="rec-date:"]').count(),0,'REC browsing has no folder or manual-order controls');
 };
 const openSongMenu=async()=>{await page.locator('[data-act="rec-song-actions"][data-id="qa-browse-old"]').click();return page.getByRole('dialog',{name:'曲の操作',exact:true});};
 try{
  await page.evaluate(async()=>{
   document.activeElement?.blur();S=structuredClone(S);saveErr=false;startupRecoveryNetworkHold=true;
   const make=(id,title,label,at=0,artist='合成アーティストA')=>({id:'qa-browse-'+id,title,groupId:'group-a',recArtist:artist,at,recSession:{id:'session-'+id,label,displayLabel:'2039/12/31 旧フォルダ',kept:'original session'},lines:[{t:'保持する合成歌詞',lyricBreaks:[4]}]});
   S.rsongs=[make('old','古い日付の合成曲','2026/10/08'),make('undated','日付未設定の合成曲','2026/02/30',9999999999999),
    make('multi','複数日に録る合成曲','2026/10/12・14',100),make('yearless','年未設定の合成曲','10/20'),
    make('tied','同日の新しい合成曲','2026/10/14',200,'合成アーティストB'),make('plan','進行表の日付の合成曲','日付未設定')];
   S.rsongId='qa-browse-old';S.recMode=true;S.viewer=false;
   S.recordingFolders=['旧空フォルダ'];S.recordingDateFolderOrders={'[""]':[JSON.stringify(['日付未設定','']),JSON.stringify(['2039/12/31 旧フォルダ'])]};
   S.rfolders={'旧保存先':true};S.rfolderOrder=['旧保存先'];
   S.plan={year:2026,slots:[{id:'qa-browse-slot-16',songId:'qa-browse-plan',day:'10/16',date:'2026-10-16',a0:600,a1:660},
    {id:'qa-browse-slot-10',songId:'qa-browse-plan',day:'10/10',date:'2026-10-10',a0:600,a1:660},
    {id:'qa-browse-slot-16-second',songId:'qa-browse-plan',day:'10/16',date:'2026-10-16',a0:660,a1:720}]};
   S.planFocus='qa-browse-slot-16';S.notes.push({id:'qa-browse-note',songId:'qa-browse-old',showId:S.showId,lineIdx:0,from:1,to:3,memo:'保持する合成指摘',memberIds:[],tags:[]});
   localStorage.removeItem('utacheck.recBrowseMode');delete U.recBrowseMode;
   for(const key of Object.keys(localStorage))if(key.startsWith('utacheck.selection:'))localStorage.removeItem(key);viewSelections.clear();
   Object.assign(U,{view:'setup',songIdx:0,menu:null,sheet:null,picker:false,overview:false,recArtistFilter:'',planDay:'10/16'});
   renderPointers.clear();scrollingUntil=0;pendingRender=false;save();await saveNow();if(saveErr)throw Error('REC browsing fixture could not be saved');render(true);
  });
  // Let normal startup normalize the synthetic fixture before comparing reloads.
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  await page.evaluate(()=>{startupRecoveryNetworkHold=true;});
  await mode(page,true);const originalState=await page.evaluate(()=>JSON.stringify(S)),originalContent=await content();
  assert.equal(await toggle('song').getAttribute('aria-pressed'),'true','The default REC view is per song');
  assert.deepEqual(await ids(),songOrder,'Songs are sorted by their latest actual REC date, with unknown dates last');
  assert.equal(await page.locator('.settings-song-row[data-rec-song]').count(),6,'Each saved song appears once in song view');
  await assertNoFolders();await assertFits(page);await screenshot(page,width,'rec-browse-song');
  await switchTo('date');assert.deepEqual(await page.locator('.rec-browse-date').evaluateAll(nodes=>nodes.map(el=>el.dataset.recDate)),dateOrder);
  assert.deepEqual(await page.locator('[data-rec-date="2026-10-14"] [data-act="ruse"]').evaluateAll(nodes=>nodes.map(el=>el.dataset.id)),['qa-browse-tied','qa-browse-multi']);
  assert.equal(await page.locator('[data-rec-date="2026-10-16"] [data-act="ruse"][data-id="qa-browse-plan"]').count(),1,'Two slots on one date do not duplicate a song');
  assert.equal(await page.locator('[data-rec-browse] [data-act="ruse"][data-id="qa-browse-plan"]').count(),2,'A song appears on both of its actual REC dates');
  assert.equal(await page.locator('.rec-browse-date details,.rec-browse-date summary').count(),0,'REC dates are visible without opening folders');
  await assertNoFolders();await screenshot(page,width,'rec-browse-date');
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),originalState,'Changing the REC browse mode preserves the entire saved state and selection');
  await switchTo('song');await page.locator('[data-act="rec-artist-filter"][data-id="合成アーティストA"]').click();
  assert.deepEqual(await ids(),songOrder.filter(id=>id!=='qa-browse-tied'));
  await switchTo('date');assert.deepEqual(await page.locator('.rec-browse-date').evaluateAll(nodes=>nodes.map(el=>el.dataset.recDate)),dateOrder);
  await page.locator('[data-act="rec-artist-filter"][data-id=""]').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),originalState,'Filtering the selected artist and changing browse modes preserve records and legacy folders');

  await page.locator('[data-act="go-live"]').click();await page.locator('.song-heading[data-act="picker"]').click();
  assert.equal(await toggle('date').getAttribute('aria-pressed'),'true','The song picker shares the REC view preference');
  assert.deepEqual(await page.locator('.rec-browse-date').evaluateAll(nodes=>nodes.map(el=>el.dataset.recDate)),dateOrder);
  await switchTo('song');assert.deepEqual(await ids(),songOrder);await page.locator('.mask .sheet [data-act="close"]').click();
  await page.locator('[data-act="go-setup"]').click();assert.equal(await toggle('song').getAttribute('aria-pressed'),'true');
  assert.deepEqual(JSON.parse(await content()),JSON.parse(originalContent),'Picker view changes preserve song data, notes, current selection and plan focus');
  await switchTo('date');await page.evaluate(async()=>{await saveNow();if(saveErr)throw Error('REC browsing fixture save failed');});
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  await page.evaluate(()=>{startupRecoveryNetworkHold=true;});await mode(page,true);
  assert.equal(await toggle('date').getAttribute('aria-pressed'),'true','The REC view preference survives a native reload');
  assert.equal(await page.evaluate(()=>localStorage.getItem('utacheck.recBrowseMode')),'date');
  assert.deepEqual(JSON.parse(await content()),JSON.parse(originalContent),'Reload preserves original material IDs, dates, notes and legacy folder metadata');

  await switchTo('song');let menu=await openSongMenu();assert.equal(await menu.locator('[data-act="rfset"]').count(),0);
  assert.equal(await menu.getByText(/1つ[上下]/).count(),0);await menu.getByRole('button',{name:'曲名を変更',exact:true}).click();
  let form=page.locator('#song-rename-form'),field=page.locator('#song-name');
  assert.equal(await field.evaluate(el=>document.activeElement===el&&!el.readOnly),true);
  assert.equal(await field.inputValue(),'古い日付の合成曲');await field.fill('取り消す合成曲名');
  await form.locator('..').getByRole('button',{name:'閉じる',exact:true}).click();assert.deepEqual(JSON.parse(await content()),JSON.parse(originalContent));
  menu=await openSongMenu();await menu.getByRole('button',{name:'曲名を変更',exact:true}).click();field=page.locator('#song-name');
  await field.fill('変更した合成曲名');await page.locator('#song-rename-form').getByRole('button',{name:'保存',exact:true}).click();await page.waitForFunction(()=>!U.menu);
  const renamed=JSON.parse(originalContent);renamed.rsongs.find(song=>song.id==='qa-browse-old').title='変更した合成曲名';
  assert.deepEqual(JSON.parse(await content()),renamed,'REC song rename changes only its title');

  const classify=async()=>{const menu=await openSongMenu();await menu.getByRole('button',{name:'日付・アーティストを変更',exact:true}).click();
   assert.equal(await page.locator('#rec-classification-date').evaluate(el=>document.activeElement===el),true);
   assert.equal(await page.locator('#rec-classification-date').inputValue(),'2026/10/08');return page.locator('#rec-classification-form');};
  form=await classify();await page.locator('#rec-classification-date').fill('2026/10/22');
  await form.locator('..').getByRole('button',{name:'閉じる',exact:true}).click();assert.deepEqual(JSON.parse(await content()),renamed);
  form=await classify();await page.locator('#rec-classification-date').fill('2026/10/22');await page.locator('#rec-classification-artist').fill('変更した合成アーティスト');
  await screenshot(page,width,'rec-classification-form');await form.getByRole('button',{name:'保存',exact:true}).click();await page.waitForFunction(()=>!U.menu);
  const classified=JSON.parse(JSON.stringify(renamed)),changed=classified.rsongs.find(song=>song.id==='qa-browse-old');changed.recSession.label='2026/10/22';changed.recArtist='変更した合成アーティスト';
  assert.deepEqual(JSON.parse(await content()),classified,'REC date editing retains the session ID, old folder, lyrics and notes');
  assert.deepEqual(await ids(),['qa-browse-old',...songOrder.filter(id=>id!=='qa-browse-old')],'A changed REC date immediately determines newest-first ordering');
  await switchTo('date');assert.equal(await page.locator('.rec-browse-date').first().getAttribute('data-rec-date'),'2026-10-22');
  await assertNoFolders();await assertFits(page);
  assert.equal(await page.locator('[data-act="rec-artist-filter"][data-id=""]').getAttribute('aria-pressed'),'true','Editing an artist while browsing all keeps all selected');
  artistResult=await checkArtistSelectionPersistence(page,width,{assertFits,screenshot});
 }finally{
  await page.evaluate(async saved=>{
   document.activeElement?.blur();S=JSON.parse(saved.state);Object.keys(U).forEach(key=>delete U[key]);Object.assign(U,JSON.parse(saved.ui));
   if(saved.pref===null)localStorage.removeItem('utacheck.recBrowseMode');else localStorage.setItem('utacheck.recBrowseMode',saved.pref);
   for(const key of Object.keys(localStorage))if(key.startsWith('utacheck.selection:'))localStorage.removeItem(key);
   for(const [key,value] of saved.selections)localStorage.setItem(key,value);
   viewSelections.clear();for(const [key,value] of saved.selectionCache)viewSelections.set(key,value);
   startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;pendingRender=false;save();await saveNow();
   if(saveErr)throw Error('REC browser check could not restore prior state');saveErr=saved.saveErr;
   window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(key=>[key,S[key]])));
   renderSheet();render(true);
  },saved);
 }
 return {recBrowseSongDate:true,recBrowseNewestFirst:true,recBrowseMultiDate:true,recBrowsePickerAndReload:true,recBrowsePreservesData:true,recSongRename:true,recClassificationForm:true,...artistResult};
}

async function checkArtistSelectionPersistence(page,width,{assertFits,screenshot}){
 const recFilter=artist=>page.locator('[data-act="rec-artist-filter"][data-id="'+artist+'"]');
 const artist='合成アーティストB',songId='qa-browse-tied';
 const records=()=>page.evaluate(()=>Object.fromEntries(['groups','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(key=>[key,S[key]])));
 const setup=async()=>{
  if(await page.locator('[data-act="go-setup"]').count())await page.locator('[data-act="go-setup"]').click();
  await page.waitForFunction(()=>U.view==='setup');
 };
 const assertRec=async(artist,id)=>{
  assert.equal(await recFilter(artist).getAttribute('aria-pressed'),'true','The selected REC artist is visibly restored');
  assert.deepEqual(await page.evaluate(()=>({artist:U.recArtistFilter||'',id:S.rsongId})),{artist,id});
  if(artist)assert.deepEqual(await page.locator('[data-rec-browse] [data-act="ruse"]').evaluateAll(nodes=>nodes.map(el=>el.dataset.id)),[id]);
  await assertFits(page);
 };
 const assertLive=async()=>{
  assert.equal(await page.evaluate(()=>U.showFilter),'group-b');
  assert.equal(await page.locator('[data-act="showfilter"][data-id="group-b"]').evaluate(el=>el.style.background),'var(--accent)','The last LIVE artist is visibly selected');
  assert.equal(await page.evaluate(()=>S.showId),'show-b');await assertFits(page);
 };
 const reload=async rec=>{
  const before=await records(),selection=await page.evaluate(()=>({showId:S.showId,groupId:S.groupId,rsongId:S.rsongId,planFocus:S.planFocus}));
  await page.evaluate(async()=>{await saveNow();if(saveErr)throw Error('Artist selection fixture was not saved');});
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  await page.evaluate(()=>{startupRecoveryNetworkHold=true;});
  assert.equal(await page.evaluate(()=>S.recMode),rec);assert.deepEqual(await records(),before,'Reopening does not change songs, ownership, notes or plan records');
  if(rec)assert.deepEqual(await page.evaluate(()=>({showId:S.showId,groupId:S.groupId,rsongId:S.rsongId,planFocus:S.planFocus})),selection,'Restoring LIVE preferences during REC boot does not change its recording context');
  await setup();
 };
 await page.locator('[data-act="rec-browse-mode"][data-id="song"]').click();
 await recFilter(artist).click();await page.locator('[data-act="ruse"][data-id="'+songId+'"]').click();
 assert((await page.locator('.song-header .t1').innerText()).includes(artist),'The REC lyric header shows the artist');
 assert.equal((await page.locator('.song-header .t1').innerText()).includes('旧フォルダ'),false);
 await reload(true);await assertRec(artist,songId);await screenshot(page,width,'rec-artist-restored');

 await recFilter('').click();await page.locator('[data-act="ruse"][data-id="qa-browse-multi"]').click();
 await reload(true);await assertRec('','qa-browse-multi');
 assert.equal(await page.locator('[data-rec-browse] [data-act="ruse"]').count(),6,'Opening a song from all does not narrow the saved artist filter');

 await recFilter(artist).click();await page.locator('[data-act="ruse"][data-id="'+songId+'"]').click();await setup();
 await page.locator('[data-act="recon"]').click();await page.waitForFunction(()=>!S.recMode);
 await page.locator('[data-act="showfilter"][data-id="group-b"]').click();await assertLive();
 await page.locator('[data-act="recon"]').click();await page.waitForFunction(()=>S.recMode);await assertRec(artist,songId);
 await reload(true);await assertRec(artist,songId);
 await page.locator('[data-act="recon"]').click();await page.waitForFunction(()=>!S.recMode);await assertLive();
 await screenshot(page,width,'live-artist-after-rec-reload');

 await reload(false);await assertLive();
 await page.locator('[data-act="recon"]').click();await page.waitForFunction(()=>S.recMode);await assertRec(artist,songId);
 return {recArtistReload:true,recAllArtistsReload:true,liveArtistAcrossRecReload:true,recArtistAcrossLiveReload:true};
}
module.exports={checkRecordingBrowse};
