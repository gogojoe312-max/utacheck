'use strict';
const assert=require('node:assert/strict');
async function checkScopedFolders(page,width,{screenshot}){
 let confirm=false;const dialog=async d=>{if(d.type()==='confirm'&&confirm){confirm=false;await d.accept();}else await d.dismiss();};page.on('dialog',dialog);
 const label='共通ツアー',other='別グループのフォルダ';
 const seed=async()=>page.evaluate(async()=>{
  S=Object.assign(structuredClone(S0),{viewer:false,recMode:false,ghToken:'',src:'',bkGistId:'',autoPub:false,groupId:'a',showId:'sa',rsongId:'ra',groups:[{id:'a',name:'OCHA NORMA'},{id:'b',name:'Rosy'}],members:[{id:'m',name:'本人'}],shows:[{id:'sa',groupId:'a',name:'11/4',folder:'整理前'},{id:'sb',groupId:'b',name:'11/5',folder:'共通ツアー'},{id:'sb2',groupId:'b',name:'11/6',folder:'別グループのフォルダ'}],songs:[{id:'la',showId:'sa',groupId:'a',title:'保持する曲',roster:['m'],blocks:{},lines:[{t:'歌詞を保持',parts:['m']}]},{id:'lb',showId:'sb',groupId:'b',title:'他グループの曲',roster:['m'],blocks:{},lines:[{t:'他グループの歌詞を保持',parts:['m']}]}],rsongs:[{id:'ra',groupId:'a',recArtist:'OCHA NORMA',title:'録音A',recSession:{id:'ra',label:'2026/11/4'},roster:[],blocks:{},lines:[{t:'録音の歌詞A'}]},{id:'rb',groupId:'b',recArtist:'Rosy',title:'録音B',recSession:{id:'rb',label:'2026/11/5',displayLabel:'共通ツアー'},roster:[],blocks:{},lines:[{t:'録音の歌詞B'}]},{id:'rb2',groupId:'b',recArtist:'Rosy',title:'録音B2',recSession:{id:'rb2',label:'2026/11/6',displayLabel:'別グループのフォルダ'},roster:[],blocks:{},lines:[{t:'録音の歌詞B2'}]}],notes:[{id:'note',songId:'lb',showId:'sb',memo:'別グループの指摘を保持',memberIds:['m'],tags:[],lineIdx:0,from:0,to:1}],recs:{kept:{dur:4}},plan:{slots:[{id:'slot',songId:'rb',name:'本人',at:720,min:90,kind:'member',date:'2026-11-05',day:'11/5'}]},folderOrder:['整理前','共通ツアー','別グループのフォルダ'],folders:{整理前:true,共通ツアー:true,別グループのフォルダ:true},recordingFolders:['共通ツアー','別グループのフォルダ']});
  startupRecoveryNetworkHold=true;ensurePersonalPrivateGroup();S.songs.forEach(sigOf);Object.assign(U,{view:'setup',showFilter:'a',recArtistFilter:'',menu:null,sheet:null,overview:false,picker:false,songIdx:0});saveErr=false;await putClip('scoped-original',new Blob([new Uint8Array([2,5,8,13])]));save();await saveNow();renderPointers.clear();scrollingUntil=0;render(true);
 });
 const kept=()=>page.evaluate(()=>({shows:S.shows.filter(s=>s.groupId==='b'),rsongs:S.rsongs,songs:S.songs,notes:S.notes,recs:S.recs,plan:S.plan,groups:S.groups}));
 const save=async name=>{await page.locator('#org-name').fill(name);await page.locator('#organize-form button[type="submit"]').click();await page.waitForFunction(()=>!U.menu||document.querySelector('#org-error')?.hidden===false);};
 const close=()=>page.locator('.organize-sheet [data-act="org-close"]').click();
 const folder=name=>page.locator('.performance-folder').filter({has:page.locator('.performance-folder-name').filter({hasText:new RegExp('^'+name+'$')})});
 const openRename=async name=>{await folder(name).locator(':scope > summary [data-act="folder-actions"]').click();await page.locator('[data-act="frename"]').click();};
 try{
  await seed();const original=await kept();await openRename('整理前');await save(label);
  await screenshot(page,width,'live'+'-cross-group-rename-result');
  assert.equal(await page.locator('#org-error:visible').count(),0,'Another group must not reserve this folder name');await page.waitForFunction(()=>!U.menu);await folder(label).waitFor({state:'visible'});assert.deepEqual(await kept(),original);
  await page.getByRole('button',{name:'＋ フォルダ',exact:true}).click();await save(other);assert.equal(await page.locator('#org-error:visible').count(),0);await page.waitForFunction(()=>!U.menu);await folder(other).waitFor({state:'visible'});
  await page.getByRole('button',{name:'＋ フォルダ',exact:true}).click();await save(label);assert.match(await page.locator('#org-error').innerText(),/同じ名前/);await close();
  // The newly created empty folder keeps its own identity even though B uses it.
  await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);
  await page.evaluate(()=>{S.recMode=false;Object.assign(U,{view:'setup',showFilter:'a',recArtistFilter:'',menu:null,sheet:null});renderPointers.clear();scrollingUntil=0;render(true);});
  await folder(other).waitFor({state:'visible'});await folder(label).waitFor({state:'visible'});assert.deepEqual(await kept(),original);await screenshot(page,width,'live'+'-same-names-after-native-reload');
  await openRename(other);await save('空フォルダを変更');await page.waitForFunction(()=>!U.menu);await folder('空フォルダを変更').waitFor({state:'visible'});assert.deepEqual(await kept(),original);
  await folder('空フォルダを変更').locator(':scope > summary [data-act="'+'folder-actions'+'"]').click();confirm=true;await page.locator('[data-act="'+'fdelete'+'"]').click();await page.waitForFunction(()=>!U.menu);assert.equal(await folder('空フォルダを変更').count(),0);assert.deepEqual(await kept(),original);
  // Use the real group/artist selector, not an unfiltered combined view.
  await page.locator('[data-act="showfilter"][data-id="b"]').click();
  await folder(label).waitFor({state:'visible'});await folder(other).waitFor({state:'visible'});assert.deepEqual(await kept(),original);await screenshot(page,width,'live'+'-other-group-preserved');
  // Create two genuinely empty folders through their own group controls.
  const empty='同名の空フォルダ';
  await page.getByRole('button',{name:'＋ フォルダ',exact:true}).click();await save(empty);await page.waitForFunction(()=>!U.menu);
  await page.locator('[data-act="showfilter"][data-id="a"]').click();
  await page.getByRole('button',{name:'＋ フォルダ',exact:true}).click();await save(empty);assert.equal(await page.locator('#org-error:visible').count(),0);await page.waitForFunction(()=>!U.menu);
  await folder(empty).waitFor({state:'visible'});await screenshot(page,width,'live-same-empty-folder-own-group');
  await openRename(empty);await save('Aだけの空');await page.waitForFunction(()=>!U.menu);
  await folder('Aだけの空').locator(':scope > summary [data-act="folder-actions"]').click();confirm=true;await page.locator('[data-act="fdelete"]').click();await page.waitForFunction(()=>!U.menu);
  await page.locator('[data-act="showfilter"][data-id="b"]').click();await folder(empty).waitFor({state:'visible'});assert.deepEqual(await kept(),original);
  await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);
  await page.evaluate(()=>{Object.assign(U,{view:'setup',showFilter:'b',menu:null,sheet:null});renderPointers.clear();scrollingUntil=0;render(true);});
  await folder(empty).waitFor({state:'visible'});await screenshot(page,width,'live-other-empty-folder-preserved-after-reload');
  assert.deepEqual(await page.evaluate(async()=>Array.from(new Uint8Array(await(await getClip('scoped-original')).arrayBuffer()))),[2,5,8,13]);
  const wire=await page.evaluate(()=>{const a=publicationData('a'),b=publicationData('b');return {a,b};});
  assert.deepEqual(wire.a.shows.map(s=>s.id),['sa']);assert.deepEqual(wire.b.shows.map(s=>s.id),['sb']);assert.equal(wire.a.shows[0].folder,label);assert.equal(wire.b.shows.find(s=>s.id==='sb').folder,label);
  await page.evaluate(async wire=>{S=structuredClone(S0);S.viewer=true;S.groups=[];S.members=[];applySetlist(wire);startupRecoveryNetworkHold=true;Object.assign(U,{view:'summary',menu:null,sheet:null,allShows:false,memberScope:'',memberName:'',sumOpen:''});save();await saveNow();renderPointers.clear();scrollingUntil=0;render(true);},wire.b);
  await page.locator('#summary-show').click();await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>S.shows.map(s=>s.id)),['sb']);await screenshot(page,width,'member-same-folder-correct-group');
  await page.reload();await page.waitForFunction(()=>normalStartupInitialized);assert.deepEqual(await page.evaluate(()=>S.shows.map(s=>s.id)),['sb']);
 }catch(error){await screenshot(page,width,'scoped-folders-failure');throw error;}finally{page.off('dialog',dialog);}
 return {crossGroupFolderRename:true,crossGroupFolderCreation:true,folderDuplicateWithinGroupRejected:true,scopedEmptyFolderRenameDelete:true,scopedFolderNativeReloadAndOtherGroupPreserved:true,sameFolderMemberPublicationReceive:true};
}
module.exports={checkScopedFolders};
