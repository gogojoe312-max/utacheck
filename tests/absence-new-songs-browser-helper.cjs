'use strict';
const assert=require('node:assert/strict');
async function checkNewAbsenceSongs(page,width,{screenshot}){
 const restoreDate=await require("./browser-date.cjs").withBrowserDate(page,"2026-10-18T03:00:00Z");
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold};});
 try{
  await page.evaluate(async()=>{
   S=Object.assign(structuredClone(S0),{pt:structuredClone(S.pt||{}),viewer:false,recMode:false,ghToken:'',bkGistId:'',src:'',autoPub:false,groupId:'absence-add-group',showId:'absence-add-show',groups:[{id:'absence-add-group',name:'OCHA NORMA'}],shows:[{id:'absence-add-show',groupId:'absence-add-group',name:'2026/10/18 追加曲の合成公演'}],members:['斉藤','広本','米村','窪田','中山','西﨑','北原','筒井'].map(name=>({id:name,name})),notes:[],pubNotes:[],recs:{},rsongs:[],plan:{slots:[]},songs:[{id:'absence-existing',showId:'absence-add-show',groupId:'absence-add-group',title:'既存の合成曲',roster:['北原','斉藤','広本'],blocks:{},lines:[{t:'保持する既存歌詞',parts:['北原','斉藤']}]}]});
   startupRecoveryNetworkHold=true;Object.assign(U,{view:'absent',songIdx:0,mode:'song',showFilter:S.groupId,menu:null,sheet:null,picker:false,overview:false,draw:false});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
  });
  await page.locator('[data-act="toggleabsent"][data-id="北原"]').click();
  await page.waitForFunction(()=>!U.absencePending&&S.shows[0].absent?.includes('北原'));
  await page.locator('[data-act="go-live"]').click();await page.locator('[data-act="go-setup"]').click();
  const bytes=await page.evaluate(()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['北原・斉藤','追加曲の二人歌唱'],['北原','追加曲のソロ'],['広本','通常の歌唱']]),'歌割');return Array.from(new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'})));});
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-act="pickfile"]').click();
  await (await chooser).setFiles({name:'追加の合成新曲_歌割.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>!U.importing&&S.songs.length===2&&U.view==='live');
  const added=await page.evaluate(()=>{const so=song();return {id:so.id,parts:so.lines.map((_,i)=>partsOf(so,i).map(id=>member(id)?.name)),status:so.lines.map((_,i)=>lineStatus(so,i)),source:so.xlsSourceId,sourceText:JSON.stringify(so.lines)};});
  assert.deepEqual(added.parts[0],['斉藤']);assert.equal(added.status[1],'need');assert(added.source,'Original workbook remains linked');
  const hold=async index=>{const el=page.locator('.lbl[data-hold="assignline"][data-i="'+index+'"]');await el.scrollIntoViewIfNeeded();const b=await el.boundingBox();assert(b);await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+2,b.y+b.height/2+1);await page.waitForTimeout(650);await page.mouse.up();await page.waitForFunction(()=>U.menu?.kind==='assign'&&!U.sheet);};
  await hold(1);await screenshot(page,width,'absence-new-song-long-press');
  await page.locator('.mask [data-act="setassign"][data-id="北原"]').click();
  await page.waitForFunction(()=>partsOf(song(),1).length===0);
  await page.locator('.mask [data-act="setassign"][data-id="斉藤"]').click();
  await page.waitForFunction(()=>partsOf(song(),1).map(id=>member(id)?.name).join()==='斉藤');
  await page.locator('.mask [data-act="closemenu"]').first().click();
  const exported=await page.evaluate(async()=>{const so=song(),data=await buildAbsentWorkbook(so,'欠席確認',absentEdits(so)),wb=XLSX.read(data,{type:'array'});return {base:wb.Sheets['歌割'].A1.v,changed:wb.Sheets['欠席確認'].A1.v,solo:wb.Sheets['欠席確認'].A2.v,text:wb.Sheets['歌割'].B1.v};});
  assert.equal(exported.base,'北原・斉藤');assert.equal(exported.changed,'斉藤');assert.equal(exported.solo,'斉藤');assert.equal(exported.text,'追加曲の二人歌唱');
  // A line with no prior override must toggle the displayed performer, rather than starting from an empty list.
  await hold(2);await page.locator('.mask [data-act="setassign"][data-id="広本"]').click();
  await page.waitForFunction(()=>partsOf(song(),2).length===0);
  await page.locator('.mask [data-act="closemenu"]').first().click();
  await page.evaluate(async()=>{await saveNow();if(saveErr)throw Error('save failed');});
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  assert.equal(await page.evaluate(id=>{const so=S.songs.find(x=>x.id===id);return !!so&&!!so.xlsSourceId&&partsOf(so,0).map(id=>member(id)?.name).join()==='斉藤'&&partsOf(so,1).some(id=>member(id)?.name==='斉藤')&&partsOf(so,2).length===0;},added.id),true);
  await page.evaluate(()=>{const wire=publicationData('absence-add-group');S.viewer=true;S.deviceId='new-absence-member-device';applySetlist(wire);Object.assign(U,{view:'absent',memberName:'',menu:null,sheet:null,picker:false,overview:false});renderPointers.clear();scrollingUntil=0;render(true);});
  const card=page.locator('.member-song').filter({hasText:'追加の合成新曲'});assert.equal(await card.count(),1);assert(await card.isVisible());assert(await card.locator('.member-absence-change').count()>=2);
  await screenshot(page,width,'absence-new-song-member-received');
 }finally{
  await page.evaluate(async saved=>{document.activeElement?.blur();S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;pendingRender=false;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render();},saved);
  await restoreDate();
 }
 return {absenceNewSongImportedAndLinked:true,assignmentNameLongPressWithDrift:true,assignmentToggleMatchesDisplayedNames:true,absenceNewSongSaveReloadAndMemberReceive:true};
}
module.exports={checkNewAbsenceSongs};
