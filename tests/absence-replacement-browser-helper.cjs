'use strict';
const assert=require('node:assert/strict');
async function checkAbsenceReplacement(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold};});
 const names=['斉藤','広本','米村','窪田','中山','西﨑','北原','筒井'];
 try{
  const bytes=await page.evaluate(async()=>{
   // Preserve the screenshot's order and duplicate 西崎 in BOTH raw sources.
   const roster=['北原','米村','斉藤','窪田','筒井','西﨑','広本','中山','西崎','北','斉','広','A','B','間奏','お客さん'];
   S={...structuredClone(S0),pt:structuredClone(S.pt||{}),viewer:false,recMode:false,ghToken:'',src:'',autoPub:false,bkGistId:'',groupId:'replace-group',showId:'replace-show',groups:[{id:'replace-group',name:'OCHA NORMA'},{id:'private',name:'配信しない',nopub:true}],shows:[{id:'replace-show',groupId:'replace-group',name:'2026/11/1 合成公演'}],members:roster.map((name,i)=>({id:'replace-'+i,name})),rosters:{'OCHA NORMA':roster},songs:[],rsongs:[],notes:[],pubNotes:[],recs:{kept:{dur:5,size:12}},plan:{slots:[]}};
   startupRecoveryNetworkHold=true;Object.assign(U,{view:'setup',songIdx:0,menu:null,sheet:null,picker:false,overview:false,draw:false,showFilter:''});renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
   const wb=XLSX.utils.book_new(),sh=XLSX.utils.aoa_to_sheet([['A','北原・米村・斉藤・窪田・筒井・西﨑・広本・中山・西崎'],['米村','欠席ソロを一度で替える合成歌詞'],['北','略記された欠席者を替える'],['米村','次の欠席ソロも一度で替える'],['米村・窪田','出席中の共唱者を残す'],['A','ブロックの合成歌詞'],...['北原','窪田','筒井','西﨑','広本','中山','西崎','斉藤','斉','広','B','間奏','お客さん'].map((n,i)=>[n,'保持する合成歌詞'+i])]);
   XLSX.utils.book_append_sheet(wb,sh,'歌割');return [...new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'}))];
  });
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-act="pickfile"]').click();await(await chooser).setFiles({name:'置き換え確認_歌割.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>!U.importing&&U.view==='live'&&song()?.lines.some(l=>l.t.startsWith('欠席ソロ')));
  const soId=await page.evaluate(()=>song().id);
  const baseline=await page.evaluate(()=>JSON.parse(JSON.stringify({songs:S.songs,notes:S.notes,members:S.members,groups:S.groups,rosters:S.rosters,recs:S.recs})));
  await page.evaluate(()=>{U.view='absent';renderPointers.clear();scrollingUntil=0;render(true);});
  const selectedAbsenceOrder=await page.locator('[data-act="toggleabsent"]').allTextContents();
  await page.locator('[data-act="toggleabsent"][data-id="replace-1"]').click();await page.waitForFunction(()=>!U.absencePending&&absentIds().includes('replace-1'));
  const lines=await page.evaluate(()=>({solo:0,alias:1,next:2,duo:3,block:4}));
  await page.locator('[data-act="go-live"]').click();
  const label=page.locator('.lbl[data-hold="assignline"][data-i="'+lines.solo+'"]');await label.scrollIntoViewIfNeeded();const box=await label.boundingBox();assert(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();await page.waitForFunction(()=>U.menu?.kind==='assign'&&!U.sheet);
  const actualOrder=await page.locator('.mask [data-act="setassign"]').allTextContents();
  await page.locator('.mask [data-act="setassign"][data-id="replace-2"]').click();await page.waitForFunction(()=>partsOf(song(),0).includes('replace-2'));
  await screenshot(page,width,'absence-replacement-single-tap-and-member-order');
  const got=await page.evaluate(()=>({now:partsOf(song(),0).map(id=>member(id)?.name),selected:[...document.querySelectorAll('.mask [data-act="setassign"]')].filter(el=>getComputedStyle(el).backgroundColor==='rgb(166, 200, 255)').map(el=>el.textContent)}));
  assert.deepEqual({order:actualOrder,absenceOrder:selectedAbsenceOrder,now:got.now},{order:names,absenceOrder:names,now:['斉藤']},'The exact popup must use eight ordered people and remove 米村 with the first replacement tap');
  assert.equal(await page.locator('.mask [data-act="setassign"][data-id="replace-1"]').getAttribute('aria-pressed'),'false');
  await page.locator('.mask [data-act="closemenu"]').first().click();await page.locator('[data-act="picker"]').click();await page.locator('.mask [data-act="goabsent"]').click();assert.equal(await page.locator('.mask').count(),0,'Navigation closes the picker before showing absence assignments');
  await page.locator('[data-act="assign"][data-i="'+lines.next+'"]').click();await page.locator('.mask [data-act="setassign"][data-id="replace-6"]').click();await page.waitForFunction(()=>partsOf(song(),2).includes('replace-6'));await page.locator('.mask [data-act="closemenu"]').first().click();
  // Retained old manual pair, as in the supplied screenshot; adding another
  // singer must remove all absentees without removing the present partner.
  await page.evaluate(()=>{S.subs['replace-show|'+song().id][3]=['replace-1','replace-3'];S.subsMan['replace-show|'+song().id][3]=1;save();renderPointers.clear();scrollingUntil=0;render(true);});
  await page.locator('[data-act="assign"][data-i="'+lines.duo+'"]').click();await page.locator('.mask [data-act="setassign"][data-id="replace-6"]').click();
  await page.waitForFunction(()=>partsOf(song(),3).includes('replace-6'));assert.deepEqual(await page.evaluate(()=>partsOf(song(),3).map(id=>member(id)?.name)),['窪田','広本']);await page.locator('.mask [data-act="closemenu"]').first().click();
  // The block editor uses the same identity and replacement semantics.
  await page.evaluate(()=>{S.gsubs['replace-show|'+song().id]={A:['replace-1','replace-2']};save();renderPointers.clear();scrollingUntil=0;render(true);});
  await page.locator('[data-act="assignblock"][data-b="A"]').click();assert.deepEqual(await page.locator('.mask [data-act="setblock"]').allTextContents(),names);
  await page.locator('.mask [data-act="setblock"][data-id="replace-6"]').click();await page.waitForFunction(()=>blockParts(song(),'A').includes('replace-6'));assert.deepEqual(await page.evaluate(()=>blockParts(song(),'A').map(id=>member(id)?.name)),['斉藤','広本']);await page.locator('.mask [data-act="closemenu"]').first().click();
  await page.locator('[data-act="toggleabsent"][data-id="replace-0"]').click();await page.waitForFunction(()=>!U.absencePending);
  assert.equal(await page.evaluate(()=>absentIds().includes('replace-9')),true,'北 and 北原 are one absent person');
  await page.locator('[data-act="assign"][data-i="'+lines.alias+'"]').click();await page.locator('.mask [data-act="setassign"][data-id="replace-6"]').click();await page.waitForFunction(()=>partsOf(song(),1).includes('replace-6'));assert.deepEqual(await page.evaluate(()=>partsOf(song(),1).map(id=>member(id)?.name)),['広本']);await page.locator('.mask [data-act="closemenu"]').first().click();
  const exportResult=await page.evaluate(async()=>{const so=song(),out=await buildAbsentWorkbook(so,'確認ver',absentEdits(so)),wb=XLSX.read(out,{type:'array'});return {original:wb.Sheets['歌割'].A2.v,changed:wb.Sheets['確認ver'].A2.v,second:wb.Sheets['確認ver'].A4.v,duo:wb.Sheets['確認ver'].A5.v,alias:wb.Sheets['確認ver'].A3.v,block:wb.Sheets['確認ver'].B1.v};});
  assert.deepEqual(exportResult,{original:'米村',changed:'斉藤',second:'広本',duo:'窪田・広本',alias:'広本',block:'斉藤・広本'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify({songs:S.songs,notes:S.notes,members:S.members,groups:S.groups,rosters:S.rosters,recs:S.recs}))),baseline,'Display aliases and edits must never rewrite source data');
  await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('Assignment save');});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);
  assert.deepEqual(await page.evaluate(id=>{const so=S.songs.find(s=>s.id===id);return [0,2,3,1].map(i=>partsOf(so,i).map(id=>member(id)?.name));},soId),[['斉藤'],['広本'],['窪田','広本'],['広本']]);
  assert.deepEqual(Buffer.from(await page.evaluate(async id=>[...new Uint8Array(await(await getOriginalExcel(S.songs.find(s=>s.id===id))).arrayBuffer())],soId)),Buffer.from(bytes));
  await page.evaluate(()=>{const wire=publicationData('replace-group');S.viewer=true;S.deviceId='replace-member-device';applySetlist(wire);Object.assign(U,{view:'absent',memberName:'',menu:null,sheet:null,picker:false,overview:false});renderPointers.clear();scrollingUntil=0;save();render(true);});
  assert.deepEqual(await page.locator('#summary-member option').allTextContents(),['全員',...names]);
  assert.match(await page.locator('.member-absence-change').first().innerText(),/斉藤/);await screenshot(page,width,'absence-replacement-member-received');
  await page.evaluate(async()=>{save();await saveNow();});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);await page.evaluate(()=>{U.view='absent';renderPointers.clear();scrollingUntil=0;render(true);});assert.deepEqual(await page.locator('#summary-member option').allTextContents(),['全員',...names]);
  return {absenceReplacementOneTap:true,absenceReplacementKeepsPresentPartners:true,absenceReplacementBlocksAndAliases:true,absenceOCHAOrderAndNoDuplicateNames:true,absenceReplacementOriginalExcelExportAndReload:true,absenceReplacementMemberReceiveAndReload:true};
 }finally{await page.evaluate(async s=>{document.activeElement?.blur();S=JSON.parse(s.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(s.ui));startupRecoveryNetworkHold=s.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render(true);},saved);}
}
module.exports={checkAbsenceReplacement};
