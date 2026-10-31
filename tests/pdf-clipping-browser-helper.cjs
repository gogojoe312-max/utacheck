'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function checkPDFClipping(page,width,{screenshot}){
 const saved=await page.evaluate(async()=>{document.activeElement?.blur();await saveNow();return {state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,look:prLook()};});
 try{
  const bytes=await page.evaluate(async()=>{
   S={...structuredClone(S0),viewer:false,recMode:false,autoPub:false,ghToken:'',src:'',bkGistId:'',groupId:'pdf-group',showId:'pdf-show',groups:[{id:'pdf-group',name:'合成PDF検証',nopub:true},{id:'pdf-private',name:'配信しない',nopub:true}],shows:[{id:'pdf-show',groupId:'pdf-group',name:'合成公演',nopub:true}],songs:[],rsongs:[],notes:[],pubNotes:[],members:[],plan:{slots:[]}};
   startupRecoveryNetworkHold=true;Object.assign(U,{view:'setup',songIdx:0,menu:null,sheet:null,picker:false,overview:false,showFilter:'',draw:false});setPrLook('xl');renderPointers.clear();scrollingUntil=0;save();await saveNow();render(true);
   const rows=[['合成PDF 長い歌詞・チェックの末尾まで確認'],['作詞：合成 作曲：合成']];
   for(let i=0;i<18;i++)rows.push(['甲','左の長い合成歌詞'+i+' ここまで全文を残して確認する左末尾'+i,'','乙','右の長い合成歌詞'+i+' ここまで全文を残して確認する右末尾'+i,'']);
   rows.push(['甲','未結合の左歌詞も最後まで表示する','','乙','未結合の右歌詞が隣の空セルを越えても最後の文字まで全文を表示する右最終端']);
   const wb=XLSX.utils.book_new(),sh=XLSX.utils.aoa_to_sheet(rows);sh['!cols']=[{wch:5},{wch:13},{wch:5},{wch:5},{wch:13},{wch:5}];
   sh['!merges']=[XLSX.utils.decode_range('A1:F1'),XLSX.utils.decode_range('A2:F2'),...Array.from({length:18},(_,i)=>[XLSX.utils.decode_range('B'+(i+3)+':C'+(i+3)),XLSX.utils.decode_range('E'+(i+3)+':F'+(i+3))]).flat()];
   sh['!rows']=rows.map(()=>({hpt:15}));XLSX.utils.book_append_sheet(wb,sh,'歌割');
   const archive=await unzip(XLSX.write(wb,{type:'array',bookType:'xlsx'})),encode=t=>new TextEncoder().encode(t);
   archive.files['xl/worksheets/_rels/sheet1.xml.rels']=encode('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rDraw" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
   archive.files['xl/drawings/drawing1.xml']=encode('<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:row>'+rows.length+'</xdr:row><xdr:colOff>0</xdr:colOff><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="3000000" cy="190500"/><xdr:sp><xdr:spPr/><xdr:txBody><a:p><a:r><a:rPr sz="1100"/><a:t>元Excelの吹き出しも長い文字を切らずに末尾まで表示して確認する合成の最終行</a:t></a:r></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>');
   archive.files['xl/worksheets/sheet1.xml']=encode(new TextDecoder().decode(archive.files['xl/worksheets/sheet1.xml']).replace('</worksheet>','<drawing r:id="rDraw"/></worksheet>'));
   archive.files['[Content_Types].xml']=encode(new TextDecoder().decode(archive.files['[Content_Types].xml']).replace('</Types>','<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'));
   return [...new Uint8Array(await zip(archive.files))];
  });
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-act="pickfile"]').click();await(await chooser).setFiles({name:'合成PDF_歌割.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>!U.importing&&U.view==='live'&&song()?.lines.some(l=>l.t.includes('右末尾17')));
  const id=await page.evaluate(()=>song().id);
  const targets=await page.evaluate(()=>['左末尾0','右末尾0','右末尾17'].map(text=>song().lines.findIndex(l=>l.t.endsWith(text))));
  for(const [n,i]of targets.entries()){
   await page.locator('[data-lyric-line="'+i+'"] .txt [data-c="1"]').click();await page.locator('#memo').fill('確認'+n+'［音程とリズムの長い指摘・最後の文字まで表示してほしい］'.repeat(2));await page.locator('.note-close').click();await page.waitForFunction(()=>!U.sheet);
  }
  await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('Note save');});
  const preserved=await page.evaluate(()=>JSON.parse(JSON.stringify({songs:S.songs,notes:S.notes,groups:S.groups,shows:S.shows})));
  const open=async()=>{await page.locator('[data-act="songmenu"]').click();await page.locator('[data-act="m-pdf"]').click();await page.waitForSelector('#prpage .xlt');await page.waitForFunction(()=>!U.lookWait);await page.evaluate(async()=>{await document.fonts.ready;fitPrintDOM();});};
  await open();await screenshot(page,width,'pdf-annotated-original-preview');
  // Inspect ALL rendered glyph rectangles, including text clipped by a cell,
  // not just the document's nominal width or its clipped outer screenshot.
  const inspect=()=>page.evaluate(()=>{
   const root=document.getElementById('prpage'),box=root.querySelector('.prbox'),bounds=box.getBoundingClientRect(),tolerance=Math.max(.1,bounds.width/box.offsetWidth),bad=[];
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node,count=0;
   while((node=walker.nextNode())){
    let offset=0;for(const ch of node.textContent){const range=document.createRange();range.setStart(node,offset);offset+=ch.length;range.setEnd(node,offset);if(!ch.trim())continue;
     for(const rect of range.getClientRects()){
      count++;if(rect.width<.01||rect.height<.01)continue;
      if(rect.left<bounds.left-tolerance||rect.right>bounds.right+tolerance||rect.top<bounds.top-tolerance||rect.bottom>bounds.bottom+tolerance)bad.push({text:node.textContent.slice(-22),kind:'page'});
      for(let p=node.parentElement;p&&p!==box;p=p.parentElement){const css=getComputedStyle(p),r=p.getBoundingClientRect();if(/hidden|clip/.test(css.overflowX)&&rect.right>r.right+tolerance||/hidden|clip/.test(css.overflowY)&&rect.bottom>r.bottom+tolerance)bad.push({text:node.textContent.slice(-22),kind:'clipped-cell'});}
     }
    }
   }
   return {count,bad:bad.slice(0,25),rightFits:bounds.right<=innerWidth+1,hasRightTail:root.textContent.includes('右末尾17'),notes:root.querySelectorAll('.prt').length};
  });
  assert.equal(await page.locator('#prpage .xlshape').count(),1);
  assert.equal(await page.locator('#prpage .xlshape').evaluate(el=>el.offsetTop>=el.parentElement.querySelector('.xlt').offsetHeight-1),true,'Source callout follows expanded table rows');
  const layout=await inspect();assert(layout.count>1000,JSON.stringify(layout));assert.equal(layout.hasRightTail,true);assert.equal(layout.notes,3);assert.deepEqual(layout.bad,[],'Every lyric, annotation and heading glyph must fit the preview and its clipping ancestors');assert(layout.rightFits,'Landscape preview fits the phone viewport');
  await page.locator('[data-act="prlook"]').click();await page.waitForSelector('#prpage .prg');await page.evaluate(()=>fitPrintDOM());
  const readable=await inspect();assert.deepEqual(readable.bad,[]);assert(readable.rightFits);await screenshot(page,width,'pdf-annotated-readable-layout');
  await page.locator('[data-act="prlook"]').click();await page.waitForSelector('#prpage .xlt');await page.evaluate(()=>fitPrintDOM());
  await page.locator('[data-act="doprint"]').click();await page.waitForFunction(()=>!U.pdfBuilding&&!!U.pdfExport?.blob);
  const pdf=await page.evaluate(async()=>{
   const data=new Uint8Array(await U.pdfExport.blob.arrayBuffer());pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';const doc=await pdfjsLib.getDocument({data:data.slice()}).promise;
   const pdfPage=await doc.getPage(1),viewport=pdfPage.getViewport({scale:1.5}),canvas=document.createElement('canvas');canvas.id='qa-saved-pdf';canvas.width=viewport.width;canvas.height=viewport.height;
   await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   const viewer=document.createElement('div');viewer.id='qa-saved-pdf-viewer';viewer.style='position:fixed;inset:0;z-index:100000;background:#222;overflow:auto';canvas.style='display:block;width:100%;height:auto';viewer.append(canvas);document.body.append(viewer);
   const result={pages:doc.numPages,size:data.length,base64:btoa(Array.from(data,c=>String.fromCharCode(c)).join(''))};await doc.destroy();return result;
  });assert.equal(pdf.pages,1);assert(pdf.size>10000);
  const out=process.env.QA_OUTPUT;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'annotated-original-'+width+'.pdf'),Buffer.from(pdf.base64,'base64'));}
  await screenshot(page,width,'pdf-saved-file-rendered');await page.evaluate(()=>document.getElementById('qa-saved-pdf-viewer').remove());
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify({songs:S.songs,notes:S.notes,groups:S.groups,shows:S.shows}))),preserved);
  await page.evaluate(async()=>{closePdfExport();U.menu=null;renderSheet();save();await saveNow();});await page.reload();await page.waitForFunction(()=>normalStartupInitialized);
  await page.evaluate(id=>{S.viewer=false;S.recMode=false;S.showId='pdf-show';U.songIdx=SONGS().findIndex(s=>s.id===id);Object.assign(U,{view:'live',menu:null,sheet:null,picker:false,overview:false});renderPointers.clear();scrollingUntil=0;render(true);},id);
  await open();assert.deepEqual((await inspect()).bad,[]);await screenshot(page,width,'pdf-annotated-original-after-native-reload');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify({songs:S.songs,notes:S.notes,groups:S.groups,shows:S.shows}))),preserved);
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>[...new Uint8Array(await(await getOriginalExcel(song())).arrayBuffer())])),Buffer.from(bytes),'PDF must never rewrite the pinned original');
  return {pdfCheckedLyricsAndNotesWithoutClipping:true,pdfOriginalTwoPanelMergedCellsPreserved:true,pdfRealSavedFileRendered:true,pdfOriginalBytesAndNativeReloadPreserved:true};
 }finally{
  await page.evaluate(async saved=>{document.getElementById('qa-saved-pdf-viewer')?.remove();closePdfExport();S=JSON.parse(saved.state);Object.keys(U).forEach(k=>delete U[k]);Object.assign(U,JSON.parse(saved.ui));startupRecoveryNetworkHold=saved.hold;setPrLook(saved.look);saveErr=false;renderPointers.clear();scrollingUntil=0;save();await saveNow();window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));render(true);},saved);
 }
}
module.exports={checkPDFClipping};
