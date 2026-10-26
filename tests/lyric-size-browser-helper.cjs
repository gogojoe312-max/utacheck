'use strict';
const assert=require('node:assert/strict');
async function checkLyricSize(page,width,{mode,assertFits,screenshot}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,printLook:prLook()};});
 const open=async()=>{await page.locator('[aria-label="曲のメニュー"]').click();await page.locator('[data-act="lyric-size"]').waitFor({state:'visible',timeout:3000});await page.locator('[data-act="lyric-size"]').click();await page.getByRole('dialog',{name:'歌詞の表示範囲',exact:true}).waitFor();};
 const pick=async(a,b)=>{await page.locator('[data-act="lyric-size-line"][data-i="'+a+'"]').click();if(b!=null)await page.locator('[data-act="lyric-size-line"][data-i="'+b+'"]').click();};
 const close=()=>page.getByRole('dialog',{name:'歌詞の表示範囲',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();
 const save=async()=>{await page.locator('#lyric-size-form [type="submit"]').click();await page.waitForFunction(()=>!U.menu);};
 const indices=()=>page.locator('[data-lyric-line]').evaluateAll(rows=>rows.map(r=>Number(r.dataset.lyricLine)));
 const fileName='サイズ変更の合成曲_1Half.xlsx';
 try{
  const bytes=await page.evaluate(async()=>{
   S=Object.assign(structuredClone(S0),{pt:structuredClone(S.pt||{}),viewer:false,recMode:false,autoPub:false,ghToken:'',src:'',bkGistId:'',groups:[{id:'size-group',name:'OCHA NORMA'}],groupId:'size-group',showId:'size-show',shows:[{id:'size-show',groupId:'size-group',name:'合成サイズ公演'}],songs:[],rsongs:[],members:[],notes:[],pubNotes:[],recs:{kept:{size:12,dur:3}},plan:{slots:[]}});
   startupRecoveryNetworkHold=true;Object.assign(U,{view:'setup',songIdx:0,menu:null,sheet:null,picker:false,overview:false,showFilter:'',recArtistFilter:'',draw:false});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
   const wb=XLSX.utils.book_new(),sh=XLSX.utils.aoa_to_sheet([['斉藤','合成の導入'],['米村','同じ合成フレーズ'],['','隠す合成フレーズ😀'],['','残る結合の続き'],['斉藤','元グレーカット'],['広本','合成の後半'],['斉藤','同じ合成フレーズ'],['広本','合成の終わり']]);
   sh['!merges']=[XLSX.utils.decode_range('A2:A4')];XLSX.utils.book_append_sheet(wb,sh,'歌割');
   const base=XLSX.write(wb,{type:'array',bookType:'xlsx'}),marked=await addVersionTab(new Uint8Array(base),'1Half',{B5:{v:'元グレーカット',fill:'FF808080'}},'歌割');
   return [...new Uint8Array(marked.data)];
  });
  for(const rec of [false,true]){
   await mode(page,rec,false,'setup');
   const chooser=page.waitForEvent('filechooser');await page.locator('[data-act="'+(rec?'rpick':'pickfile')+'"]').click();
   await (await chooser).setFiles({name:fileName,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)});
   await page.waitForFunction(rec=>!U.importing&&U.view==='live'&&(rec?recSong():song())?.lines.length===8,rec);
   const initial=await page.evaluate(async rec=>{
    const so=rec?recSong():song();if(!so.lines[4].cut)throw Error('Original gray-cut source condition missing');
    so.lines[1].lyricBreaks=[2];
    if(rec){so.intro=0;so.lines.forEach(l=>l.bars=1);so.lines[0].sec='RH';so.lines[1].sec='1A';so.lines[5].sec='1B';}
    else{
     S.notes=[{id:'hidden-note',songId:so.id,showId:S.showId,lineIdx:2,from:1,to:3,memo:'隠す指摘',tags:[],memberIds:[so.lines[2].parts[0]]},{id:'kept-note',songId:so.id,showId:S.showId,lineIdx:3,memo:'残す指摘',tags:[],memberIds:[so.lines[3].parts[0]]}];
     const other=structuredClone(so);other.id='other-size-song';other.title='別曲を保持';S.songs.push(other);
    }
    S.memos[S.showId+'|'+so.id]='保持する総括';save();await saveNow();renderPointers.clear();scrollingUntil=0;render(true);
    return {id:so.id,lines:JSON.parse(JSON.stringify(so.lines)),notes:structuredClone(S.notes),source:so.xlsSourceId,other:!rec?JSON.parse(JSON.stringify(S.songs[1])):null};
   },rec);
   assert.deepEqual(await indices(),[0,1,2,3,5,6,7]);
   await open();await pick(2,1);assert.equal(await page.locator('[data-act="lyric-size-line"][aria-pressed="true"]').count(),2,'Reverse range is inclusive and uses row indexes, not duplicate text');
   await page.locator('[data-act="lyric-size-hide"]').click();await screenshot(page,width,rec?'rec-size-draft':'live-size-draft');await assertFits(page);
   assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(song().lines))),initial.lines,'Draft does not alter source or saved data');
   await close();assert.deepEqual(await indices(),[0,1,2,3,5,6,7]);
   await open();await pick(1,2);await page.locator('[data-act="lyric-size-hide"]').click();
   await page.evaluate(()=>render());assert.equal(await page.locator('[data-act="lyric-size-line"].is-hidden').count(),3,'Background render preserves range draft');
   await save();await page.waitForFunction(()=>document.querySelectorAll('[data-lyric-line]').length===5);assert.deepEqual(await indices(),[0,3,5,6,7]);
   await screenshot(page,width,rec?'rec-size-hidden':'live-size-hidden');
   const expected=structuredClone(initial.lines);for(const i of [1,2]){expected[i].sourceCut=false;expected[i].cut=1;}
   assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(song().lines))),expected,'Only cut markers change; lyrics, source cells, breaks, assignments and row numbers stay stored');
   assert.deepEqual(await page.evaluate(()=>S.notes),initial.notes);
   if(!rec){assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(S.songs[1]))),initial.other);assert.match(await page.locator('[data-lyric-line="3"] .lbl').innerText(),/米村/,'A visible continuation keeps its singer after the merged-group start is hidden');}
   else{
    assert.deepEqual(await page.evaluate(()=>sectionNames()),['RH','1A','1B']);assert.equal(await page.evaluate(()=>secBars()['1A'].all),1,'Hidden section header still anchors its remaining lyric');
    assert.deepEqual(await page.locator('[data-lyric-line] [data-act="rbar"]').allTextContents(),['RH 1','2','1B 3','4','5']);
   }
   await page.locator('[data-act="overview"]').click();let text=await page.locator('#app').innerText();assert(!text.includes('隠す合成フレーズ'));assert(!text.includes('元グレーカット'));assert(text.includes('合成の後半'));await page.locator('[data-act="overview"]').click();
   await page.evaluate(()=>{setPrLook("xl");delete XLOOK[song().id];window.__sizeOriginalLookCalls=[];window.__sizeOriginalEnsureLooks=ensureLooks;ensureLooks=async songs=>{__sizeOriginalLookCalls.push(...songs.map(s=>s.id));return __sizeOriginalEnsureLooks(songs);};});
   await page.locator('[data-act="go-setup"]').click();
   if(rec){await page.locator('[data-act="rec-song-actions"][data-id="'+initial.id+'"]').click();await page.locator('[data-act="rpdf"]').click();}
   else{await page.locator('[data-act="songmenu"][data-i="0"]').click();await page.locator('[data-act="m-pdf"]').click();}
   await page.locator('#prpage').waitFor();assert.deepEqual(await page.evaluate(()=>__sizeOriginalLookCalls),[],'Size-edited PDF must not start unused original workbook preview reads before save/reload');await page.evaluate(()=>{ensureLooks=__sizeOriginalEnsureLooks;delete window.__sizeOriginalEnsureLooks;});text=await page.locator('#prpage').innerText();assert(!text.includes('隠す合成フレーズ'));assert(!text.includes('元グレーカット'));assert(text.includes('合成の後半'));
   await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('Size edit save failed');});await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);await mode(page,rec,false,'live');
   assert.deepEqual(await indices(),[0,3,5,6,7]);assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(song().lines))),expected);await screenshot(page,width,rec?'rec-size-reloaded':'live-size-reloaded');
   assert.deepEqual(Buffer.from(await page.evaluate(async key=>[...new Uint8Array(await (await getClip('xls:'+key)).arrayBuffer())],initial.source)),Buffer.from(bytes),'Pinned Excel bytes survive size changes and native reload');
   if(!rec){
    assert.equal(await page.evaluate(async()=>inspectOriginalExcel(song(),await getClip('xls:'+song().xlsSourceId))),true,'Size editing must not break exact original Excel matching/export');
    const owner=await page.evaluate(()=>JSON.stringify(S));
    await page.evaluate(async()=>{const wire=publicationData('size-group');window.__sizeWire=wire;S.viewer=true;S.deviceId='size-member-device';applySetlist(wire);Object.assign(U,{view:'live',songIdx:0,overview:false,menu:null,sheet:null,picker:false,focus:''});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);});
    assert.deepEqual(await indices(),[0,3,5,6,7]);assert.equal(await page.locator('[data-act="lyric-size"]').count(),0);await screenshot(page,width,'size-member-received-lyrics');
    await page.locator('[data-act="go-setup"]').click();await page.locator('[data-act="go-summary"]').click();
    assert.match(await page.locator('#app').innerText(),/残す指摘/);assert.doesNotMatch(await page.locator('#app').innerText(),/隠す指摘/);await page.locator('#summary-member').selectOption({label:'米村'});assert.match(await page.locator('#app').innerText(),/残す指摘/);
    await screenshot(page,width,'size-member-received-feedback');
    await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);await mode(page,false,true,'live');assert.deepEqual(await indices(),[0,3,5,6,7]);
    await page.evaluate(async raw=>{S=JSON.parse(raw);startupRecoveryNetworkHold=true;Object.assign(U,{view:'live',songIdx:0,menu:null,sheet:null,picker:false,overview:false});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);},owner);
   }
   await open();await pick(1);await page.locator('[data-act="lyric-size-show"]').click();await save();await page.waitForFunction(()=>document.querySelectorAll('[data-lyric-line]').length===6);assert.deepEqual(await indices(),[0,1,3,5,6,7]);
   await open();await page.locator('[data-act="lyric-size-reset"]').click();await save();await page.waitForFunction(()=>document.querySelectorAll('[data-lyric-line]').length===7);assert.deepEqual(await indices(),[0,1,2,3,5,6,7],'Reset restores the original source size, retaining original gray cuts');
   await open();await pick(4);await page.locator('[data-act="lyric-size-show"]').click();await save();await page.waitForFunction(()=>document.querySelectorAll('[data-lyric-line]').length===8);assert.deepEqual(await indices(),[0,1,2,3,4,5,6,7],'A gray source row can also be explicitly restored without changing its original flag');
   if(!rec)assert.equal(await page.evaluate(async()=>inspectOriginalExcel(song(),await getClip('xls:'+song().xlsSourceId))),true);
   await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);await mode(page,rec,false,'live');assert.equal((await indices()).length,8);
   await screenshot(page,width,rec?'rec-size-restored':'live-size-restored');
  }
 }catch(error){await screenshot(page,width,'lyric-size-failure');throw error;}finally{
  await page.evaluate(async saved=>{document.activeElement?.blur();if(window.__sizeOriginalEnsureLooks){ensureLooks=__sizeOriginalEnsureLooks;delete window.__sizeOriginalEnsureLooks;}S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;setPrLook(saved.printLook);saveErr=false;renderPointers.clear();scrollingUntil=0;pendingRender=false;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));renderSheet();render(true);},saved);
 }
 return {lyricSizeActualLiveRecImport:true,lyricSizeRangeHideRestoreCancel:true,lyricSizeNotesAndOriginalBytesPreserved:true,lyricSizeNativeReload:true,lyricSizeMemberReceiveLyricsAndFeedback:true,lyricSizeOverviewAndPDF:true,lyricSizePDFWithoutUnusedOriginalReads:true};
}
module.exports={checkLyricSize};
