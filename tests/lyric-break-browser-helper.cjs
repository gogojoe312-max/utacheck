'use strict';
const assert=require('node:assert/strict');

// Trusted clicks/keys and native IndexedDB reloads; all text is synthetic.
// Headless focus checks cannot prove a physical phone's keyboard is visible.
async function checkLyricBreaks(page,width,{mode,assertFits,screenshot}){
 const saved=await page.evaluate(async()=>{await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,saveErr};});
 const originalText='甲😀乙丙 丁終';
 const content=()=>page.evaluate(()=>JSON.stringify({songs:S.songs,rsongs:S.rsongs,notes:S.notes,memos:S.memos,staffMemos:S.staffMemos,recs:S.recs,plan:S.plan}));
 const line=()=>page.locator('[data-lyric-line="0"] .txt');
 const open=async rec=>{
  await page.evaluate(()=>{
   window.__lyricClickFocus=null;
   if(window.__lyricClickListener)window.removeEventListener('click',window.__lyricClickListener);
   window.__lyricClickListener=event=>{if(event.target.closest('[data-act="lyric-breaks"]'))window.__lyricClickFocus={trusted:event.isTrusted,active:document.activeElement?.id};};
   window.addEventListener('click',window.__lyricClickListener);
  });
  if(rec)await page.locator('[data-lyric-line="0"] [data-act="rbar"][data-segment="0"]').click();
  else await page.locator('[data-lyric-line="0"] [data-act="note"]').click();
  await page.locator('[data-act="lyric-breaks"][data-i="0"]').click();
  const field=page.locator('#lyric-break-text');
  await field.waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>window.__lyricClickFocus),{trusted:true,active:'lyric-break-text'},'Textarea focuses in the original trusted click, before an async retry');
  assert.equal(await field.evaluate(el=>document.activeElement===el&&!el.disabled&&!el.readOnly),true);
  return field;
 };
 const rendered=async rec=>{
  assert.deepEqual(await line().locator(rec?'.rec-lyric-number':'br').evaluateAll(nodes=>nodes.map(br=>({before:br.previousElementSibling?.dataset.c,after:br.nextElementSibling?.dataset.c,text:br.nextElementSibling?.textContent}))),[
   {before:'1',after:'2',text:'乙'},{before:'2',after:'3',text:'丙'}
  ],'Line breaks use Unicode character offsets, including an astral character');
  assert.deepEqual(await line().locator('[data-c]').evaluateAll(nodes=>nodes.map(node=>({index:Number(node.dataset.c),text:node.textContent}))),Array.from(originalText).map((text,index)=>({index,text:text===' '?'\u00a0':text})));
 };
 const numbers=async expected=>{
  await page.waitForFunction(expected=>JSON.stringify(Array.from(document.querySelectorAll('[data-lyric-line] button[data-act="rbar"]'),el=>el.textContent))===JSON.stringify(expected),expected.map(String));
  assert.deepEqual(await page.locator('[data-lyric-line] button[data-act="rbar"]').allTextContents(),expected.map(String),'Every REC paragraph and the following lyric have consecutive bar numbers');
  await assertFits(page);
 };
 const closeBar=()=>page.locator('.mask .sheet [data-act="closemenu"]').click();
 const saveBreaks=async offsets=>{
  await page.locator('#lyric-break-form').getByRole('button',{name:'保存',exact:true}).click();
  await page.waitForFunction(offsets=>!U.menu&&JSON.stringify(S.rsongs[0].lines[0].lyricBreaks||[])===JSON.stringify(offsets),offsets);
 };
 const allNumberViews=async expected=>{
  await numbers(expected);
  await page.locator('[data-act="overview"]').click();
  assert.deepEqual(await page.locator('.ovw .ovwn').allTextContents(),expected.map(String),'Overview uses the same paragraph numbers');
  await assertFits(page);await screenshot(page,width,'rec-numbered-overview');
  await page.locator('[data-act="overview"]').click();
  await page.locator('[data-act="go-setup"]').click();
  for(const detail of await page.locator('.rec-date').all())if(!await detail.evaluate(el=>el.open))await detail.locator(':scope > summary').click();
  await page.locator('[data-act="rec-song-actions"][data-id="qa-break-rec"]').click();
  await page.getByRole('dialog',{name:'曲の操作',exact:true}).locator('[data-act="rpdf"]').click();
  await page.locator('#prpage').waitFor({state:'visible'});
  assert.deepEqual(await page.locator('#prpage .prn').allTextContents(),expected.map(String),'PDF uses the same paragraph numbers');
  await assertFits(page);await screenshot(page,width,'rec-numbered-pdf');
  await mode(page,true,false,'live');
 };
 try{
  await page.evaluate(async text=>{
   document.activeElement?.blur();saveErr=false;
   const group={id:'qa-break-group',name:'合成改行グループ',nopub:true},show={id:'qa-break-show',groupId:group.id,name:'合成改行公演',nopub:true};
   const make=(id,title)=>({id,title,groupId:group.id,showId:show.id,roster:['qa-break-member'],take:1,blocks:{},lines:[{t:text,parts:['qa-break-member'],main:['qa-break-member'],extra:[],raw:'検証者'}]});
   const rec=make('qa-break-rec','REC改行の合成曲');rec.intro=156;rec.lines.push({t:'次の合成歌詞',parts:['qa-break-member'],main:['qa-break-member'],extra:[],raw:'検証者'});
   S=Object.assign(structuredClone(S0),{pt:structuredClone(S.pt||{}),viewer:false,recMode:false,recBars:true,autoPub:false,ghToken:'',bkGistId:'',src:'',linkSrc:'',groupId:group.id,showId:show.id,
    groups:[group],shows:[show],members:[{id:'qa-break-member',name:'検証者'}],songs:[make('qa-break-live','LIVE改行の合成曲')],rsongs:[rec],rsongId:'qa-break-rec',
    notes:['live','rec'].map(kind=>({id:'qa-break-note-'+kind,songId:'qa-break-'+kind,showId:show.id,lineIdx:0,from:1,to:3,memo:'保持する合成指摘',memberIds:['qa-break-member'],tags:[],take:1})),
    memos:{'qa-break-show|qa-break-live':'保持する総括'},staffMemos:{'qa-break-show|qa-break-live':'保持する本人メモ'},recs:{synthetic:{size:0,dur:0}},plan:{slots:[]}});
   startupRecoveryNetworkHold=true;Object.assign(U,{view:'live',songIdx:0,menu:null,sheet:null,picker:false,overview:false,pick:[],focus:'',secView:'',recArtistFilter:'',showFilter:'',lyricTarget:null});
   renderPointers.clear();scrollingUntil=0;pendingRender=false;save();await saveNow();if(saveErr)throw Error('Synthetic lyric fixture could not be saved');render(true);
  },originalText);
  for(const rec of [false,true]){
   await mode(page,rec,false,'live');
   const before=await content();let field=await open(rec);
   assert.equal(await field.inputValue(),originalText);
   await field.evaluate(el=>el.setSelectionRange(3,3));await field.press('Enter');
   assert.equal(await field.inputValue(),'甲😀\n乙丙 丁終');assert.equal(await field.isVisible(),true);
   assert.equal(await content(),before,'Enter inserts a newline without submitting or changing saved content');
   await assertFits(page);await screenshot(page,width,rec?'rec-lyric-break-input':'live-lyric-break-input');
   await page.getByRole('dialog',{name:'歌詞の改行',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();
   assert.equal(await content(),before,'Cancel preserves lyrics and all note anchors');

   field=await open(rec);await field.evaluate(el=>el.setSelectionRange(3,3));await field.press('Enter');
   await field.evaluate(el=>el.setSelectionRange(5,5));
   await page.getByRole('button',{name:'改行を入れる',exact:true}).click();
   assert.equal(await field.inputValue(),'甲😀\n乙\n丙 丁終');assert.equal(await field.evaluate(el=>document.activeElement===el),true,'Manual insertion restores editable focus');
   await page.evaluate(()=>render());assert.equal(await field.inputValue(),'甲😀\n乙\n丙 丁終','Background rendering retains the draft');
   await page.locator('#lyric-break-form').getByRole('button',{name:'保存',exact:true}).click();
   await page.waitForFunction(rec=>JSON.stringify((rec?S.rsongs:S.songs)[0].lines[0].lyricBreaks)==='[2,3]'&&!U.menu,rec);
   const expected=JSON.parse(before);(rec?expected.rsongs:expected.songs)[0].lines[0].lyricBreaks=[2,3];
   assert.deepEqual(JSON.parse(await content()),expected,'Save changes only display offsets; lyric text and notes.from/to stay intact');
   await rendered(rec);if(rec)await numbers([157,161,165,169]);await assertFits(page);await screenshot(page,width,rec?'rec-lyric-break-saved':'live-lyric-break-saved');
   const durable=await page.evaluate(async()=>{await saveNow();if(saveErr)throw Error('Lyric breaks were not saved');return JSON.stringify(unpackState(JSON.parse(await loadRaw())));});
   assert.deepEqual((rec?JSON.parse(durable).rsongs:JSON.parse(durable).songs)[0].lines[0].lyricBreaks,[2,3]);

   await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
   await page.evaluate(()=>{startupRecoveryNetworkHold=true;});await mode(page,rec,false,'live');
   const restored=await page.evaluate(rec=>({line:(rec?S.rsongs:S.songs)[0].lines[0],notes:S.notes}),rec);
   assert.equal(restored.line.t,originalText);assert.deepEqual(restored.line.lyricBreaks,[2,3]);assert.deepEqual(restored.notes,expected.notes,'Native IndexedDB reload preserves character-range annotations');
   await rendered(rec);await assertFits(page);
   const persisted=await content();field=await open(rec);assert.equal(await field.inputValue(),'甲😀\n乙\n丙 丁終');
   await page.getByRole('button',{name:'改行を解除',exact:true}).click();assert.equal(await field.inputValue(),originalText);
   await page.getByRole('dialog',{name:'歌詞の改行',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();
   assert.equal(await content(),persisted,'Cancelling clear retains saved display breaks');
   if(rec){
    field=await open(true);await page.getByRole('button',{name:'改行を解除',exact:true}).click();await saveBreaks([]);await numbers([157,161]);
    field=await open(true);await field.evaluate(el=>el.setSelectionRange(3,3));await field.press('Enter');await saveBreaks([2]);
    await allNumberViews([157,161,165]);
    await page.locator('[data-lyric-line="0"] button[data-act="rbar"][data-segment="1"]').click();
    assert.deepEqual(await page.evaluate(()=>({i:U.menu.i,segment:U.menu.segment})),{i:0,segment:1},'A continuation number opens its original line and exact paragraph');
    assert.equal(await page.locator('[data-act="rbarnum"]').innerText(),'161');
    await page.locator('[data-act="rbarset"][data-id="1"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-act="rbarnum"]')?.textContent.trim()==='162');
    await closeBar();await numbers([157,162,166]);
    const adjusted=JSON.parse(before);adjusted.rsongs[0].lines[0].lyricBreaks=[2];adjusted.rsongs[0].lines[0].recBarOverrides={'2':{at:162}};
    assert.deepEqual(JSON.parse(await content()),adjusted,'Number adjustment only stores its paragraph override; notes and original rows stay intact');
    await page.evaluate(async()=>{await saveNow();if(saveErr)throw Error('Paragraph numbering was not saved');});
    await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
    await page.evaluate(()=>{startupRecoveryNetworkHold=true;});await mode(page,true,false,'live');
    await numbers([157,162,166]);
    assert.deepEqual(await page.evaluate(()=>({line:S.rsongs[0].lines[0],notes:S.notes})),{line:adjusted.rsongs[0].lines[0],notes:adjusted.notes},'Reload retains paragraph adjustment and original character anchors');
    await page.locator('[data-lyric-line="0"] button[data-act="rbar"][data-segment="1"]').click();
    if(!await page.locator('[data-act="rbarclear"]').count())await page.locator('[data-act="rmore"]').click();
    await page.locator('[data-act="rbarclear"]').click();await closeBar();await numbers([157,161,165]);
    const reset=JSON.parse(before);reset.rsongs[0].lines[0].lyricBreaks=[2];
    assert.deepEqual(JSON.parse(await content()),reset,'Clearing an adjustment restores automatic paragraph numbering');
    field=await open(true);await page.getByRole('button',{name:'改行を解除',exact:true}).click();await saveBreaks([]);
    await numbers([157,161]);assert.deepEqual(JSON.parse(await content()),JSON.parse(before),'Removing breaks restores later numbering without splitting or deleting source lyric rows');
    await page.evaluate(async()=>{await saveNow();if(saveErr)throw Error('Cleared numbering was not saved');});
    await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
    await page.evaluate(()=>{startupRecoveryNetworkHold=true;});await mode(page,true,false,'live');await numbers([157,161]);
    assert.deepEqual(await page.evaluate(()=>({lines:S.rsongs[0].lines,notes:S.notes})),{lines:JSON.parse(before).rsongs[0].lines,notes:JSON.parse(before).notes});
   }
  }
 }finally{
  await page.evaluate(async saved=>{
   document.activeElement?.blur();if(window.__lyricClickListener)window.removeEventListener('click',window.__lyricClickListener);
   S=JSON.parse(saved.state);Object.keys(U).forEach(key=>delete U[key]);Object.assign(U,JSON.parse(saved.ui));
   startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;pendingRender=false;save();await saveNow();
   if(saveErr)throw Error('Lyric browser check could not restore prior state');saveErr=saved.saveErr;
   window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));
   renderSheet();render(true);delete window.__lyricClickFocus;delete window.__lyricClickListener;
  },saved);
 }
 return {lyricBreaksLiveRec:true,lyricBreaksNativeReload:true,lyricBreaksUnicodeNotes:true,lyricBreaksFocusAndCancel:true,lyricBreaksNumberingViews:true,lyricBreaksNumberAdjustmentReload:true};
}
module.exports={checkLyricBreaks};
