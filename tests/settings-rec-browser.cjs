'use strict';
// Isolated browser checks with synthetic data. Every external request is blocked.
const playwright=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {checkPDFClipping}=require('./pdf-clipping-browser-helper.cjs');
const {checkPassiveAudio}=require('./passive-audio-browser-helper.cjs');
const {checkRecordingPreparation}=require('./recording-preparation-browser-helper.cjs');
const {checkProgressPreparation}=require('./progress-preparation-browser-helper.cjs');
const {checkAbsence}=require('./absence-view-browser-helper.cjs');
const {checkNewAbsenceSongs}=require('./absence-new-songs-browser-helper.cjs');
const {checkFolderInteractions}=require('./folder-interactions-browser-helper.cjs');
const {checkRecordingSegmentSections}=require('./recording-segment-section-browser-helper.cjs');
const {checkLiveNoteInput}=require('./live-note-input-browser-helper.cjs');
const {checkRecordingAutoStart}=require('./recording-auto-start-browser-helper.cjs');
const {checkRecordingOKOriginal}=require('./recording-ok-original-browser-helper.cjs');
const {checkRecSectionStability}=require('./rec-section-stability-browser-helper.cjs');
const {checkRecordingHeadcounts}=require('./recording-headcount-browser-helper.cjs');
const {checkLyricBreaks}=require('./lyric-break-browser-helper.cjs');
const {checkLyricSize}=require('./lyric-size-browser-helper.cjs');
const {checkMemberStartDay}=require('./member-start-day-browser-helper.cjs');
const {checkMemberFeedbackStart}=require('./member-feedback-start-browser-helper.cjs');
const {checkNoteNavigationDelivery}=require('./note-navigation-delivery-browser-helper.cjs');
const {checkMemberLinkSwitch}=require('./member-link-switch-browser-helper.cjs');
const {checkRecordingBrowse}=require('./recording-browse-browser-helper.cjs');
const {checkArrangementDevice}=require('./arrangement-device-browser-helper.cjs');
const {checkMemberRoster}=require('./member-roster-browser-helper.cjs');
const engine=process.env.BROWSER_ENGINE||'chromium';assert(['chromium','webkit'].includes(engine));
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||path.join(require('node:os').tmpdir(),'utacheck-settings-qa',engine);
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),file=path.resolve(root,url.pathname==='/'?'index.html':'.'+url.pathname);
 if(req.method!=='GET'||!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
function seed(){
 const clone=x=>JSON.parse(JSON.stringify(x)),makeSong=(id,showId,groupId,title)=>({id,showId,groupId,title,roster:['m'],take:1,blocks:{},lines:[{t:'合成歌詞を保持',parts:['m']}]});
 S=Object.assign(clone(S0),{pt:clone(S.pt||{}),viewer:false,recMode:false,ghToken:'',bkGistId:'',src:'',showId:'show-a',groupId:'group-a',
  groups:[{id:'group-a',name:'検証グループA',nopub:true},{id:'group-b',name:'検証グループB',nopub:true}],
  members:[{id:'m',name:'検証メンバー'}],
  shows:[{id:'show-a',groupId:'group-a',name:'2026/10/14 合成公演A',folder:'合成フォルダ',nopub:true},{id:'show-b',groupId:'group-b',name:'2026/10/13 合成公演B',folder:'別グループ',nopub:true}],
  songs:[makeSong('song-a','show-a','group-a','長い曲名が途中で省略されず最後の文字まで読み取れることを確認する合成曲A'),makeSong('song-b','show-a','group-a','合成曲B'),makeSong('song-other','show-b','group-b','対象外合成曲')],
  rsongs:[
   {id:'rec-a',groupId:'group-a',title:'録音の長い曲名も途中で省略されず最後の文字まで読み取れることを確認する合成曲',recArtist:'歌手A',recSession:{id:'session-a',label:'2026/10/08',kept:'session metadata'},lines:[{t:'REC合成歌詞A'}]},
   {id:'rec-b',groupId:'group-a',title:'REC合成曲B',recArtist:'歌手A',recSession:{id:'session-b',label:'2026/10/08',kept:'second metadata'},lines:[{t:'REC合成歌詞B'}]},
   {id:'rec-other',groupId:'group-b',title:'REC対象外合成曲',recArtist:'歌手B',recSession:{id:'session-other',label:'2026/10/09',kept:'other metadata'},lines:[{t:'REC対象外歌詞'}]}],
  rsongId:'rec-a',notes:[{id:'note',songId:'song-a',showId:'show-a',memo:'合成指摘を保持',memberIds:['m'],tags:[],lineIdx:0}],
  memos:{'show-a|song-a':'合成総括を保持'},staffMemos:{'show-a|song-a':'合成本人メモを保持'},recs:{synthetic:{size:0,dur:0}},plan:{slots:[]},
  folders:{'合成フォルダ':true,'別グループ':true},folderOrder:['合成フォルダ','別グループ'],rfolders:{},rfolderOrder:[]});
 startupRecoveryNetworkHold=true;
 Object.assign(U,{view:'setup',showFilter:'group-a',songIdx:0,menu:null,sheet:null,picker:false,overview:false,pick:[],allShows:false,recArtistFilter:'',appInfoOpen:false,appUpdateText:'',appUpdateVersion:''});
 renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
 window.qaContent=()=>JSON.stringify(Object.fromEntries(['groups','shows','songs','rsongs','notes','memos','staffMemos','recs','plan'].map(k=>[k,S[k]])));
}
async function mode(page,rec=false,viewer=false,view='setup'){
 await page.evaluate(({rec,viewer,view})=>{document.activeElement?.blur();S.viewer=viewer;S.recMode=rec;
  Object.assign(U,{view,songIdx:0,menu:null,sheet:null,picker:false,overview:false,pick:[],recArtistFilter:''});
  renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
 },{rec,viewer,view});
 await page.waitForFunction(view=>U.view===view&&document.querySelector('#app')?.dataset.screen===view,view);
}
async function screenshot(page,width,name){await page.screenshot({path:path.join(out,engine+'-'+width+'-'+name+'.png')});}
async function assertFits(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal viewport overflow');}
async function readableTitles(page,rec){
 const rows=rec?page.locator('.settings-song-row').filter({has:page.locator('[data-act="ruse"]')}):page.locator('.settings-song-row[data-drop^="g:"]');
 const titles=await rows.locator('.settings-song-title').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent,whiteSpace:getComputedStyle(el).whiteSpace,textOverflow:getComputedStyle(el).textOverflow,lineClamp:getComputedStyle(el).webkitLineClamp,w:el.clientWidth,h:el.clientHeight,sw:el.scrollWidth,sh:el.scrollHeight})));
 assert(titles.length>=2);
 const expected=await page.evaluate(rec=>rec?recordingSelectionSongs().map(s=>s.title):SONGS().map(songName),rec);
 assert.deepEqual(titles.map(t=>t.text.replace(/^★\s*/,'')).sort(),expected.sort());
 for(const title of titles){assert.equal(title.whiteSpace,'normal');assert.notEqual(title.textOverflow,'ellipsis');assert(['none','unset','0',''].includes(title.lineClamp));assert(title.w>0&&title.h>0);assert(title.sw<=title.w+1&&title.sh<=title.h+1);}
 for(const control of await rows.locator('.settings-song-select').evaluateAll(nodes=>nodes.map(el=>({align:getComputedStyle(el).textAlign,height:el.getBoundingClientRect().height})))){assert.equal(control.align,'left');assert(control.height>=44);}
}
(async()=>{let browser;const contexts=new Set(),results=[],errors=[],blocked=[],dialogs=[];
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=process.env.QA_BASE_URL||'http://127.0.0.1:'+server.address().port;
  const allowedOrigin=new URL(origin).origin;
  browser=await playwright[engine].launch({headless:true});
  for(const width of [320,390]){
   const context=engine==='webkit'
    ? await playwright.webkit.launchPersistentContext(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'utacheck-webkit-')),{headless:true,viewport:{width,height:844},serviceWorkers:'block'})
    : await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
   contexts.add(context);
   await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==allowedOrigin||request.method()!=='GET'){blocked.push({origin:url.origin,method:request.method()});return route.abort('blockedbyclient');}
    if(url.searchParams.has('app-update-check'))return route.fulfill({status:200,contentType:'text/html',body:'<script src="app.js?v=99.99.99"></script>'});return route.continue();});
   if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>{blocked.push({origin:'websocket',method:'CONNECT'});socket.close();});
   const page=await context.newPage();page.setDefaultTimeout(20000);let promptReply=null,confirmReply=false;
   page.on('pageerror',e=>errors.push(e.stack||e.message));
   page.on('dialog',async dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});if(dialog.type()==='confirm'&&confirmReply){confirmReply=false;await dialog.accept();}else if(dialog.type()==='prompt'&&promptReply!==null){const reply=promptReply;promptReply=null;await dialog.accept(reply);}else await dialog.dismiss();});
   await page.goto(origin);await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);await page.evaluate(seed);
   const startupTheme=await page.evaluate(()=>{
    const prior={profile:recordingInboxProfileRequired,stale:recordingInboxStale,owner:recordingInboxOwner};
    try{
     recordingInboxProfileRequired=true;recordingInboxStale=false;recordingInboxOwner=null;recordingInboxOwnerUI();
     const loading=document.getElementById('recording-inbox-readonly'),color=getComputedStyle(loading).backgroundColor,text=loading.textContent;
     recordingInboxOwner={status:'secondary',canWrite:false};recordingInboxOwnerUI();
     const denied=document.getElementById('recording-inbox-readonly');return {color,text,deniedColor:getComputedStyle(denied).backgroundColor,deniedText:denied.textContent};
    }finally{recordingInboxProfileRequired=prior.profile;recordingInboxStale=prior.stale;recordingInboxOwner=prior.owner;recordingInboxOwnerUI();}
   });
   assert.equal(startupTheme.color,'rgb(17, 18, 21)');assert(startupTheme.text.includes('読み込み中'));
   assert.equal(startupTheme.deniedColor,'rgb(17, 18, 21)');assert(startupTheme.deniedText.includes('読み取り専用'));
   const original=await page.evaluate(()=>qaContent()),data=page.locator('[data-settings-panel="data-save"]');
   assert.equal(await data.count(),1);assert.equal(await page.getByText('データの保存',{exact:true}).count(),1);
   assert.equal(await page.getByText('歌割をPDFにする',{exact:true}).count(),0);assert.equal(await page.locator('[data-act="gopdf"]').count(),0);
   assert.equal(await data.locator('[data-act="bkfile"]').count(),1);assert.equal(await data.locator('[data-act="bkfile"]').isVisible(),true);assert.equal(await data.locator('[data-act="bknow"]').count(),0);
   const storage=data.locator('[data-settings-panel="storage"]'),recovery=data.locator('[data-settings-panel="connection-recovery"]');
   assert.equal(await storage.evaluate(el=>el.open),false);assert.equal(await recovery.evaluate(el=>el.open),false);
   await recovery.locator(':scope > summary').click();assert.equal(await recovery.locator('#recovery-original-backup-check').isVisible(),true);
   await recovery.locator(':scope > summary').click();assert.equal(await recovery.locator('#recovery-original-backup-check').isVisible(),false);assert.equal(await page.evaluate(()=>qaContent()),original);
   await readableTitles(page,false);await assertFits(page);await screenshot(page,width,'live-settings');
   await page.locator('.settings-song-row [data-act="songmenu"][data-i="0"]').click();
   await page.getByRole('dialog',{name:'曲の操作',exact:true}).locator('[data-act="m-pdf"]').click();await page.waitForSelector('#prpage');
   assert.deepEqual(await page.evaluate(()=>U.printPick),['song-a']);assert.equal(await page.locator('#prpage .prs').count(),1);
   await mode(page,true);await readableTitles(page,true);assert.equal(await page.getByText('RECはすべて本人用です',{exact:false}).count(),0);
   await page.locator('[data-act="ruse"][data-id="rec-a"]').scrollIntoViewIfNeeded();await screenshot(page,width,'rec-titles');
   await page.locator('[data-act="rec-song-actions"][data-id="rec-a"]').click();const recMenu=page.getByRole('dialog',{name:'曲の操作',exact:true});
   for(const action of ['rpdf','rec-classify','rdel'])assert.equal(await recMenu.locator('[data-act="'+action+'"]').count(),1);
   await recMenu.locator('[data-act="rpdf"]').click();await page.waitForSelector('#prpage');assert.equal(await page.evaluate(()=>U.view),'recprint');assert.equal(await page.locator('#prpage .prs').count(),1);
   const expected=JSON.parse(original);
   await mode(page,false,true,'live');const viewerBefore=await page.evaluate(()=>qaContent());
   assert.equal(await page.locator('.song-header [data-act="songmenu"]').count(),0);
   const pdf=page.locator('.song-header [data-act="gopdf"][data-id="song-a"]');assert.equal(await pdf.getAttribute('aria-label'),'この曲をPDFにする');
   await assertFits(page);await screenshot(page,width,'viewer-song-pdf');await pdf.click();await page.waitForSelector('#prpage');
   assert.deepEqual(await page.evaluate(()=>U.printPick),['song-a']);assert.equal(await page.locator('#prpage .prs').count(),1);assert.equal(await page.evaluate(()=>qaContent()),viewerBefore);
   await mode(page,false,true);assert.equal(await page.locator('[data-act="app-update-check"]').count(),0);
   await mode(page,false,false);const info=page.locator('[data-settings-panel="app-info"]');
   assert.equal(await info.evaluate(el=>el.open),false);assert.equal(await info.evaluate(el=>el.closest('.settings-section')===null),true);
   await info.locator(':scope > summary').click();assert.equal(await info.evaluate(el=>el.open),true);
   await page.evaluate(()=>{renderPointers.clear();scrollingUntil=0;render(true);});assert.equal(await info.evaluate(el=>el.open),true);
   await info.locator('[data-act="app-update-check"]').click();await page.waitForFunction(()=>U.appUpdateVersion==='99.99.99');
   await info.locator('[data-act="app-update-reload"]').waitFor({state:'visible'});assert.equal(await info.evaluate(el=>el.open),true);
   const beforeReload=await page.evaluate(()=>qaContent()),dialogCount=dialogs.length;
   await page.evaluate(()=>{U.sheet={lineIdx:0,lineEnd:null,range:null,anchor:null,point:null,quick:true,tags:[],memo:'未保存の合成入力',seq:[],rec:false,sel:['m']};document.querySelector('[data-act="app-update-reload"]').click();});
   assert.equal(dialogs.length,dialogCount+1);assert.equal(dialogs.at(-1).type,'alert');assert.equal(await page.evaluate(()=>U.sheet.memo),'未保存の合成入力');assert.equal(await page.evaluate(()=>qaContent()),beforeReload);
   await page.evaluate(()=>{document.activeElement?.blur();U.sheet=null;renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);});await page.locator('.note-quick-mask').waitFor({state:'detached'});await info.locator(':scope > summary').click();assert.equal(await info.evaluate(el=>el.open),false);
   await checkGrayCutImport(page);
   await checkEditingDuringPublication(page,dialogs);
   await checkMemberPreviewLoading(page,width,{screenshot,assertFits});
   const folderResult=await checkFolderInteractions(page,width,{mode,assertFits,screenshot,confirmNext:()=>{confirmReply=true;}});
   const recordingBrowseResult=await checkRecordingBrowse(page,width,{mode,assertFits,screenshot});
   const absenceResult=await checkAbsence(page,width,{mode,assertFits,screenshot});
   const newAbsenceResult=await checkNewAbsenceSongs(page,width,{screenshot});
   const lyricBreakResult=await checkLyricBreaks(page,width,{mode,assertFits,screenshot});
   const lyricSizeResult=await checkLyricSize(page,width,{mode,assertFits,screenshot});
   const pdfClippingResult=await checkPDFClipping(page,width,{screenshot});
   const memberStartDayResult=await checkMemberStartDay(page,width,{screenshot});
   const memberFeedbackStartResult=await checkMemberFeedbackStart(page,width,{screenshot});
   const noteNavigationDeliveryResult=await checkNoteNavigationDelivery(page,width,{screenshot});
   const memberLinkSwitchResult=await checkMemberLinkSwitch(page,width,{screenshot});
   const recSegmentResult=await checkRecordingSegmentSections(page,width,{screenshot});
   const liveNoteResult=await checkLiveNoteInput(page,width,{screenshot});
   const recAutoResult=await checkRecordingAutoStart(page,width,{screenshot});
   const excelCheck=await checkExcelReattach(page,width,dialogs);
   await page.evaluate(async()=>{await saveNow();saveErr=true;renderPointers.clear();scrollingUntil=0;render(true);});
   await page.waitForSelector('[data-settings-panel="storage"][open]');assert.equal(await page.getByText('いま保存できていません',{exact:false}).isVisible(),true);
   assert.equal(await page.locator('[data-settings-panel="data-save"] [data-act="bkfile"]').isVisible(),true);assert.equal(await page.locator('[data-settings-panel="connection-recovery"]').evaluate(el=>el.open),false);
   await assertFits(page);await screenshot(page,width,'save-error');assert.deepEqual(JSON.parse(await page.evaluate(()=>qaContent())),expected);
   const progressConnection=await checkProgressPreparation(page,{relay:width===390,automaticInteraction:width===390});
   const arrangementDevice=await checkArrangementDevice(page);
   const memberRoster=await checkMemberRoster(page);
   const legacyMemberRoster=await checkMemberRoster(page,{legacy:true});
   const cleanMemberRoster=await checkMemberRoster(page,{clean:true});
   // The owner-only REC receive flow gets its own native IDB/ownership context;
   // member preview fixtures above intentionally leave a different role active.
   await context.close();contexts.delete(context);
   const headcountContext=engine==='webkit'
    ? await playwright.webkit.launchPersistentContext(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'utacheck-headcounts-webkit-')),{headless:true,viewport:{width,height:844},serviceWorkers:'block'})
    : await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
   contexts.add(headcountContext);
   await headcountContext.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==allowedOrigin||request.method()!=='GET'){blocked.push({origin:url.origin,method:request.method()});return route.abort('blockedbyclient');}return route.continue();});
   const headcountPage=await headcountContext.newPage();headcountPage.setDefaultTimeout(20000);headcountPage.on('pageerror',e=>errors.push(e.stack||e.message));headcountPage.on('dialog',d=>d.dismiss());
   await headcountPage.clock.install();
   await headcountPage.goto(origin);await headcountPage.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
   const recHeadcountResult=await checkRecordingHeadcounts(headcountPage,width,{screenshot});const recScrollResult=await checkRecSectionStability(headcountPage,width,{screenshot});const recOriginalOKResult=await checkRecordingOKOriginal(headcountPage,width,{screenshot});await headcountContext.close();contexts.delete(headcountContext);
   const dotContext=engine==='webkit'
    ? await playwright.webkit.launchPersistentContext(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'utacheck-dot-webkit-')),{headless:true,viewport:{width,height:844},serviceWorkers:'block'})
    : await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
   contexts.add(dotContext);await dotContext.route('**/*',route=>{const request=route.request(),url=new URL(request.url());return url.origin===allowedOrigin&&request.method()==='GET'?route.continue():route.abort('blockedbyclient');});
   const dotPage=await dotContext.newPage();dotPage.on('pageerror',e=>errors.push(e.stack||e.message));dotPage.on('dialog',d=>d.dismiss());await dotPage.goto(origin);await dotPage.waitForFunction(()=>normalStartupInitialized);
   const dotRecResult=await checkRecordingPreparation(dotPage,width,{screenshot});await dotContext.close();contexts.delete(dotContext);
   const audioContext=engine==='webkit'
    ? await playwright.webkit.launchPersistentContext(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'utacheck-audio-webkit-')),{headless:true,viewport:{width,height:844},serviceWorkers:'block'})
    : await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
   contexts.add(audioContext);await audioContext.route('**/*',route=>{const request=route.request(),url=new URL(request.url());return url.origin===allowedOrigin&&request.method()==='GET'?route.continue():route.abort('blockedbyclient');});
   const passiveAudioResult=await checkPassiveAudio(audioContext,origin,width,{screenshot});await audioContext.close();contexts.delete(audioContext);
   results.push({width,memberRoster,legacyMemberRoster,cleanMemberRoster,arrangementDevice,progressConnection,...folderResult,...recordingBrowseResult,...absenceResult,...newAbsenceResult,...lyricBreakResult,...lyricSizeResult,...pdfClippingResult,...memberStartDayResult,...memberFeedbackStartResult,...noteNavigationDeliveryResult,...memberLinkSwitchResult,...recSegmentResult,...liveNoteResult,...recAutoResult,...recHeadcountResult,...recScrollResult,...recOriginalOKResult,...passiveAudioResult,...dotRecResult,excelOriginal:excelCheck,settings:true,pdfLiveRecView:true,fullTitles:true,footer:true,draftPreserved:true,saveErrorVisible:true});
  }
  assert.deepEqual(errors,[]);assert.equal(blocked.filter(x=>x.method!=='GET').length,0);
  const report={passed:true,engine,results,errors,blocked,externalRequestsAllowed:0,syntheticDataOnly:true};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await Promise.allSettled([...contexts].map(context=>context.close()));await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});


async function checkGrayCutImport(page){
 try{
  const result=await page.evaluate(async()=>{
   window.__grayQA={state:S,ui:structuredClone(U)};
   S=structuredClone(S0);S.groups=[{id:'gray-group',name:'合成歌手'}];S.groupId='gray-group';S.showId='gray-show';S.shows=[{id:'gray-show',groupId:'gray-group',name:'合成公演'}];
   const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['甲','表示する最初の歌詞'],['甲','非表示カット歌詞'],['乙','表示する最後の歌詞']]),'歌割');
   const bytes=XLSX.write(wb,{type:'array',bookType:'xlsx'});
   const marked=await addVersionTab(new Uint8Array(bytes),'1Half',{B2:{v:'非表示カット歌詞',fill:'FF808080'}},'歌割');
   const parsed=await parseXLSX({name:'synthetic.xlsx'},marked.data,{state:S,sheetName:'1Half'});
   const so=Object.assign(buildSong(parsed),{groupId:S.groupId,showId:S.showId});S.songs=[so];
   const cut=so.lines.findIndex(l=>l.t==='非表示カット歌詞');if(cut<0||!so.lines[cut].cut)throw Error('Gray fill was not imported as a cut');
   const expected=JSON.stringify(so.lines);const views=[];
   for(const rec of [false,true])for(const viewer of [false,true])for(const overview of [false,true]){
    S.recMode=rec;S.viewer=viewer;S.rsongs=[so];S.rsongId=so.id;Object.assign(U,{view:'live',songIdx:0,overview,sheet:null,menu:null,picker:false,focus:''});
    renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
    const text=document.getElementById('app').innerText;
    if(text.includes('非表示カット歌詞')||!text.includes('表示する最初の歌詞')||!text.includes('表示する最後の歌詞'))throw Error('Gray cut projection failed '+JSON.stringify({rec,viewer,overview}));
    views.push({rec,viewer,overview});
   }
   return {views:views.length,preserved:JSON.stringify(so.lines)===expected,cut};
  });
  assert.equal(result.views,8);assert.equal(result.preserved,true);
 }finally{
  await page.evaluate(()=>{const q=window.__grayQA;if(!q)return;S=q.state;U=q.ui;delete window.__grayQA;renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);});
 }
}
async function checkEditingDuringPublication(page,dialogs){
 const priorDialogs=dialogs.length;
 try{
  await page.evaluate(()=>{
   window.__editDuringSendQA={state:S,ui:structuredClone(U),publish:publishInFlight,backup:backupInFlight,hash:backupDigest};
   S=structuredClone(S);U=structuredClone(U);U.view='live';S.recMode=false;S.viewer=false;S.autoPub=false;
   publishInFlight=true;backupInFlight=true;verifiedEditBackup=null;
   backupDigest=async text=>{
    const digest=await window.__editDuringSendQA.hash(text);
    S.groups[0].lastKey='synthetic-send-finished';S.groups[0].publishKeyPending=false;S.bkAt=123;
    return digest;
   };
   renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
  });
  await page.locator('[data-act="note"][data-i="0"]').first().click();
  await page.locator('.note-quick-mask').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#memo')?.readOnly===false);
  assert.equal(dialogs.length,priorDialogs,'Opening and focusing a note during a send must not reject editing');
  const result=await page.evaluate(async()=>{
   const before=editCheckpointContent(backupState());
   const ok=await automaticBackupBeforeEdit('synthetic-second-focus');
   return {ok,unchanged:editCheckpointContent(backupState())===before,notes:S.notes.length,code:U.backupFailureCode};
  });
  assert.equal(result.ok,true);assert.equal(result.unchanged,true);assert.equal(result.notes,1);assert.equal(result.code,'');
 }finally{
  await page.evaluate(()=>{
   const q=window.__editDuringSendQA;if(!q)return;
   U.sheet=null;document.activeElement?.blur();S=q.state;U=q.ui;publishInFlight=q.publish;backupInFlight=q.backup;backupDigest=q.hash;verifiedEditBackup=null;
   delete window.__editDuringSendQA;renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
  });
 }
}
async function checkMemberPreviewLoading(page,width,{screenshot,assertFits}){
 try{
  await page.evaluate(()=>{
   window.__previewQA={state:S,ui:structuredClone(U),hold:startupRecoveryNetworkHold,fetch:fetchSetlist};
   S=structuredClone(S);U=structuredClone(U);
   const g=S.groups[0];g.name='ロージークロニクル';g.src='https://gist.githubusercontent.com/synthetic/'+'b'.repeat(32)+'/raw/utacheck.json';g.gistId='b'.repeat(32);g.nopub=false;
   S.shows.find(s=>s.groupId===g.id).nopub=false;S.autoPub=false;
   window.__previewQA.wire=publicationData(g.id,undefined,true);
   window.__previewQA.before=JSON.stringify(S);window.__previewQA.reads=0;
   startupRecoveryNetworkHold=false;
   fetchSetlist=()=>{window.__previewQA.reads++;return new Promise(resolve=>{window.__previewQA.finish=resolve;});};
   U.view='setup';renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
  });
  const button=page.locator('[data-act="pvnow"][data-id="group-a"]');
  await button.click();
  const progress=page.locator('#operation-progress');
  await progress.waitFor({state:'visible'});
  assert.equal(await progress.innerText(),'メンバー画面を読み込み中…');
  assert.equal(await page.locator('#app').getAttribute('aria-busy'),'true');
  await button.dispatchEvent('click');
  assert.equal(await page.evaluate(()=>window.__previewQA.reads),1,'Repeated taps do not start another read');
  assert.equal(await progress.isVisible(),true,'A duplicate tap cannot dismiss the pending indicator');
  await assertFits(page);await screenshot(page,width,'member-preview-loading');
  await page.evaluate(()=>window.__previewQA.finish(window.__previewQA.wire));
  await page.waitForFunction(()=>U.view==='summary'&&!!preview);
  await progress.waitFor({state:'hidden'});
  await page.locator('[data-act="endpv"]').first().click();
  await page.waitForFunction(()=>!preview&&U.view==='setup');
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),await page.evaluate(()=>window.__previewQA.before));
  await button.click();await progress.waitFor({state:'visible'});
  await page.evaluate(()=>window.__previewQA.finish(null));
  await progress.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),await page.evaluate(()=>window.__previewQA.before),'Failed read preserves all editor data');
 }finally{
  await page.evaluate(()=>{
   const q=window.__previewQA;if(!q)return;
   S=q.state;U=q.ui;startupRecoveryNetworkHold=q.hold;fetchSetlist=q.fetch;preview=null;
   delete window.__previewQA;renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
  });
 }
}
async function checkExcelReattach(page,width,dialogs){
 const restoreDate=await require('./browser-date.cjs').withBrowserDate(page,'2026-10-18T03:00:00Z');
 const saved=await page.evaluate(()=>({state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold,saveErr}));
 const songId='qa-excel-song',showId='qa-excel-show';
 try{
  const files=await page.evaluate(async()=>{
   document.activeElement?.blur();closeExcelExport();saveErr=false;S.viewer=false;S.recMode=false;
   const title='合成Excel曲',make=(wrong=false)=>{
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Synthetic cover to preserve'],['Cover sheet stays unchanged']]),'表紙');
    const sheet=XLSX.utils.aoa_to_sheet([['甲',wrong?'Unrelated replacement lyric':'Synthetic lyric one to preserve'],['乙','Synthetic lyric two to preserve']]);
    sheet['!cols']=[{wch:12},{wch:48}];sheet['!rows']=[{hpt:28},{hpt:32}];
    XLSX.utils.book_append_sheet(wb,sheet,'歌割');
    return new Uint8Array(XLSX.write(wb,{bookType:'xlsx',type:'array'}));
   },correct=make(),wrong=make(true);
   const file=new File([correct],title+'.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
   const parsed=await parseXLSX(file,correct,{sheetName:'歌割',state:S});
   const addMember=name=>{const id='qa-excel-member-'+name;if(!S.members.some(m=>m.id===id))S.members.push({id,name});return{id};};
   const so=buildSong(parsed,{addMember,uid:()=> 'qa-excel-song'});
   Object.assign(so,{showId:'qa-excel-show',groupId:'qa-excel-group',xls:1,xlsSourceId:'qa-excel-missing',xlsAt:123});
   S.groups.push({id:'qa-excel-group',name:'合成Excel検証',nopub:true});
   S.shows.push({id:'qa-excel-show',groupId:'qa-excel-group',name:'2026/10/18 合成Excel公演',nopub:true,absent:['qa-excel-member-甲']});
   S.songs.push(so);S.groupId='qa-excel-group';S.showId='qa-excel-show';
   const lineIdx=so.lines.findIndex(l=>l.t==='Synthetic lyric one to preserve');
   if(lineIdx<0||so.lines[lineIdx].cell!=='A1'||so.lines[lineIdx].lcell!=='B1')throw Error('Synthetic workbook must retain expected cell mapping');
   S.subs[S.showId+'|'+so.id]={[lineIdx]:['qa-excel-member-乙']};S.subsMan[S.showId+'|'+so.id]={[lineIdx]:1};
   S.notes.push({id:'qa-excel-note',songId:so.id,showId:S.showId,lineIdx,memo:'合成指摘を保持',memberIds:['qa-excel-member-甲'],tags:[]});
   S.memos[S.showId+'|'+so.id]='合成総括を保持';S.staffMemos[S.showId+'|'+so.id]='合成本人メモを保持';
   Object.assign(U,{view:'absent',songIdx:0,menu:null,sheet:null,picker:false,overview:false,showFilter:'qa-excel-group',excelExport:null,fileReport:null});
   startupRecoveryNetworkHold=true;renderPointers.clear();scrollingUntil=0;pendingRender=false;
   save();await saveNow();if(saveErr)throw Error('Synthetic original state was not persisted');render(true);
   window.qaExcelBytes={correct,wrong};
   return {correct:Array.from(correct),wrong:Array.from(wrong),before:JSON.stringify(S)};
  });
  const initial=files.before,exportButton=page.locator('[data-act="xlsout"][data-id="'+songId+'"]');
  await exportButton.click();
  const reattach=page.locator('[data-act="excel-reattach"][data-id="'+songId+'"]');
  await reattach.waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),initial,'Missing original must not change the song');
  await assertFits(page);await screenshot(page,width,'excel-original-missing');
  const wrongDialogCount=dialogs.length,wrongChooser=page.waitForEvent('filechooser'),wrongRejected=page.waitForEvent('dialog');
  await reattach.click();await(await wrongChooser).setFiles({name:'合成Excel曲.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(files.wrong)});
  await wrongRejected;await page.waitForFunction(()=>!U.importing&&!U.busy);
  assert(dialogs.length>wrongDialogCount,'Wrong workbook must explain rejection');
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),initial,'Same-title different lyrics must not change any state');
  assert.equal(await page.evaluate(()=>S.songs.find(s=>s.id==='qa-excel-song').xlsSourceId),'qa-excel-missing');
  await page.evaluate(async()=>{
   U.menu=null;U.fileReport=null;renderPointers.clear();scrollingUntil=0;render(true);
   await putClip('xls:qa-excel-song',new Blob([qaExcelBytes.wrong],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  });
  await exportButton.click();await reattach.waitFor({state:'visible'});
  const successDialogCount=dialogs.length,chooser=page.waitForEvent('filechooser');
  await reattach.click();await(await chooser).setFiles({name:'合成Excel曲.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(files.correct)});
  await page.waitForFunction(()=>!U.importing&&!U.busy&&/^sha256-[a-f0-9]{64}$/.test(S.songs.find(s=>s.id==='qa-excel-song').xlsSourceId||''));
  assert(dialogs.slice(successDialogCount).some(d=>d.message.includes('元Excelを再添付し、保存後の一致を確認しました。')));
  const verified=await page.evaluate(async()=>{
   const so=S.songs.find(s=>s.id==='qa-excel-song'),original=await getOriginalExcel(so,true),old=await getClip('xls:'+so.id),durable=await loadRaw();
   return {state:JSON.stringify(S),source:so.xlsSourceId,stored:Array.from(new Uint8Array(await original.arrayBuffer())),old:Array.from(new Uint8Array(await old.arrayBuffer())),durable,packed:JSON.stringify(packState(S)),automaticExport:!!U.excelExport};
  });
  const excelPublication=await page.evaluate(()=>{
   const original=S,ui=JSON.stringify(U);
   try{
    S=structuredClone(S);const g=S.groups.find(g=>g.id==='qa-excel-group'),show=S.shows.find(s=>s.id==='qa-excel-show');g.nopub=false;show.nopub=false;
    const wire=JSON.parse(JSON.stringify(publicationData(g.id,undefined,true)));
    const scope={groupId:g.id,groupName:g.name,gistId:'b'.repeat(32),src:'https://gist.githubusercontent.com/synthetic/'+ 'b'.repeat(32)+'/raw/utacheck.json',sourceSha256:'a'.repeat(64),expectedRemoteSha256:'c'.repeat(64),showIds:[show.id],sourceShowIds:[show.id]};
    RecoveryDeliveryScope.verifyPublication(scope,wire,wire);
    if(wire.lib[0].sheetName!=='歌割')throw Error('Actual Excel worksheet metadata is missing');
    S.deviceId='synthetic-member-device';S.viewer=true;applySetlist(wire);
    const received=S.songs[0];
    return {sheet:received.sheetName,notes:S.pubNotes.map(n=>n.memo),title:received.title};
   }finally{S=original;U=JSON.parse(ui);renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);}
  });
  assert.equal(excelPublication.sheet,'歌割');assert.deepEqual(excelPublication.notes,['合成指摘を保持']);assert.equal(excelPublication.title,'合成Excel曲');
  const expected=JSON.parse(initial),next=JSON.parse(verified.state),expectedSong=expected.songs.find(s=>s.id===songId),actualSong=next.songs.find(s=>s.id===songId);
  for(const key of ['xlsSourceId','xls','xlsAt'])expectedSong[key]=actualSong[key];
  assert.deepEqual(next,expected,'Reattachment changes only original-workbook metadata');
  assert.deepEqual(verified.stored,files.correct);assert.deepEqual(verified.old,files.wrong,'Existing legacy workbook bytes remain unchanged');
  assert.equal(verified.durable,verified.packed,'Successful reattachment is durably reread');assert.equal(verified.automaticExport,false);
  await exportButton.click();await page.waitForFunction(()=>!!U.excelExport?.blob&&!U.exportingExcel);
  const exported=await page.evaluate(async()=>{
   const so=S.songs.find(s=>s.id==='qa-excel-song'),bytes=new Uint8Array(await U.excelExport.blob.arrayBuffer()),wb=XLSX.read(bytes,{type:'array',cellStyles:true});
   return {state:JSON.stringify(S),name:U.excelExport.name,count:U.excelExport.count,failures:U.excelExport.failures,sheets:wb.SheetNames,cover:wb.Sheets['表紙'].A1.v,originalName:wb.Sheets['歌割'].A1.v,originalLyric:wb.Sheets['歌割'].B1.v,versionName:wb.Sheets[absentTab()].A1.v,versionLyric:wb.Sheets[absentTab()].B1.v,tab:absentTab()};
  });
  const beforeExport=JSON.parse(verified.state),afterExport=JSON.parse(exported.state);
  assert(afterExport.assignmentEdits?.['qa-excel-show|qa-excel-song'] || Object.keys(afterExport.assignmentEdits||{}).length,'Explicit export confirms changed assignments');
  afterExport.assignmentEdits=beforeExport.assignmentEdits;
  assert.deepEqual(afterExport,beforeExport,'Export preserves all content except explicit assignment confirmation');
  const exportedMemberChange=await page.evaluate(()=>{
   const original=S,ui=JSON.stringify(U);
   try{
    S=structuredClone(S);S.groups.find(g=>g.id==='qa-excel-group').nopub=false;S.shows.find(s=>s.id==='qa-excel-show').nopub=false;
    const wire=publicationData('qa-excel-group',undefined,true);
    if(!wire.subs.some(row=>row.confirmed===true))throw Error('Created Excel omitted confirmed change from publication');
    S.viewer=true;applySetlist(wire);
    return {count:memberAbsenceChanges(S.songs[0]).length,notice:memberReviewNav(),notes:S.pubNotes.map(n=>n.memo)};
   }finally{S=original;U=JSON.parse(ui);}
  });
  assert.equal(exportedMemberChange.count,1);assert(exportedMemberChange.notice.includes('欠席歌割'));assert(exportedMemberChange.notice.includes('甲が欠席'));assert(!/\d+件/.test(exportedMemberChange.notice));assert.deepEqual(exportedMemberChange.notes,['合成指摘を保持']);
  assert.equal(exported.count,1);assert.deepEqual(exported.failures,[]);assert(exported.name.endsWith('.xlsx'));
  assert.deepEqual(exported.sheets,[exported.tab,'表紙','歌割']);assert.equal(exported.cover,'Synthetic cover to preserve');
  assert.equal(exported.originalName,'甲');assert.equal(exported.originalLyric,'Synthetic lyric one to preserve');
  assert.equal(exported.versionName,'乙');assert.equal(exported.versionLyric,'Synthetic lyric one to preserve');
  await assertFits(page);await screenshot(page,width,'excel-reattached-export');
  const batchBefore=await page.evaluate(async()=>{
   document.activeElement?.blur();closeExcelExport();
   const base=S.songs.find(s=>s.id==='qa-excel-song'),copy=JSON.parse(JSON.stringify(base));copy.id='qa-excel-copy';copy.xlsSourceId='missing-batch-original';
   S.songs.push(copy);const other=JSON.parse(JSON.stringify(copy));other.id='qa-excel-other-group';other.groupId='group-b';S.songs.push(other);
   Object.assign(U,{menu:null,sheet:null,fileReport:null});save();await saveNow();if(saveErr)throw Error('Batch fixture save failed');
   renderPointers.clear();scrollingUntil=0;showFileReport('元Excelの復旧結果',[],[],[],[copy.id]);return JSON.stringify(S);
  });
  const batchChooser=page.waitForEvent('filechooser');
  await page.locator('[data-act="excel-reattach-batch"]').click();
  const batchPicker=await batchChooser;assert.equal(batchPicker.isMultiple(),true);
  await batchPicker.setFiles([{name:'同じ名前.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(files.correct)},{name:'別の原本.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(files.wrong)}]);
  await page.waitForFunction(()=>!U.importing&&!U.busy&&/^sha256-/.test(S.songs.find(s=>s.id==='qa-excel-copy').xlsSourceId||''));
  const batchAfter=await page.evaluate(async()=>({state:JSON.stringify(S),report:U.fileReport,durable:await loadRaw(),packed:JSON.stringify(packState(S))}));
  const oldBatch=JSON.parse(batchBefore),newBatch=JSON.parse(batchAfter.state);
  for(const id of ['qa-excel-song','qa-excel-copy']){
   const prev=oldBatch.songs.find(s=>s.id===id),next=newBatch.songs.find(s=>s.id===id);
   for(const key of ['xlsSourceId','xls','xlsAt'])prev[key]=next[key];
  }
  assert.deepEqual(newBatch,oldBatch,'Batch binding preserves all lyrics, notes and the other group');
  assert.equal(batchAfter.durable,batchAfter.packed);assert.equal(batchAfter.report.succeeded.length,2);
  assert.equal(newBatch.songs.find(s=>s.id==='qa-excel-copy').xlsSourceId,newBatch.songs.find(s=>s.id==='qa-excel-song').xlsSourceId);
  assert.equal(newBatch.songs.find(s=>s.id==='qa-excel-other-group').xlsSourceId,'missing-batch-original');
  await assertFits(page);
  const onDemand=await page.evaluate(async()=>{
   const so=S.songs.find(song=>song.id==='qa-excel-song'),key='xls:'+so.xlsSourceId;
   await new Promise((resolve,reject)=>{const tx=DB.transaction('clips','readwrite');tx.objectStore('clips').delete(key);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});
   originalExcelExportSource.cache=new WeakMap();
   const originalUI=PrivatePreparationUI,bytes=qaExcelBytes.correct,blob=new Blob([bytes]);let requests=0;
   const packet={app:'utacheck-original-excel',version:1,name:so.title+'.xlsx',size:bytes.length,sha256:await startupExcelDigest(blob),base64:btoa(Array.from(bytes,c=>String.fromCharCode(c)).join(''))};
   window.PrivatePreparationUI={...originalUI,readOriginalExcelPackets:async()=>{
    requests++;if(!U.busy)throw Error('Demand read must run during the export, without waiting for background idle');
    return {status:'ready',operations:[{packet}]};
   }};
   try{
    const before=JSON.stringify(S);U.menu={kind:'file-report'};
    await exportAbsentXlsx(so.id);
    if(!U.excelExport?.blob)throw Error('On-demand original did not produce Excel');
    const wb=XLSX.read(new Uint8Array(await U.excelExport.blob.arrayBuffer()),{type:'array'});
    const replacement=wb.Sheets[absentTab()].A1.v,original=wb.Sheets['歌割'].A1.v;
    await exportAbsentXlsx(so.id);
    return {requests,replacement,original,stateUnchanged:JSON.stringify(S)===before,receipt:S.privatePreparations?.['synthetic-demand-original']||null};
   }finally{window.PrivatePreparationUI=originalUI;}
  });
  assert.deepEqual(onDemand,{requests:1,replacement:'乙',original:'甲',stateUnchanged:true,receipt:null},'An export recovers its verified original without waiting for the background receiver and reuses it');

  const restoredBefore=await page.evaluate(()=>{
   closeExcelExport();U.menu=null;U.fileReport=null;
   const so=S.songs.find(song=>song.id==='qa-excel-song');
   for(const key of ['xls','xlsSourceId','xlsAt','sheetName','micSheet','micMap','blockCells','blockRows'])delete so[key];
   for(const line of so.lines)for(const key of ['cell','lcell','extraCell'])delete line[key];
   originalExcelExportSource.cache=new WeakMap();
   renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
   return JSON.stringify(S);
  });
  await exportButton.waitFor({state:'visible'});await exportButton.click();
  await page.waitForFunction(()=>!!U.excelExport?.blob&&!U.exportingExcel);
  assert.equal(await page.locator('[data-act="excel-export-share"]').isVisible(),true,'Restored songs expose the same single-song save screen');
  const restoredSingle=await page.evaluate(async()=>{
   const wb=XLSX.read(new Uint8Array(await U.excelExport.blob.arrayBuffer()),{type:'array'});
   return {state:JSON.stringify(S),name:U.excelExport.name,count:U.excelExport.count,failures:U.excelExport.failures,cover:wb.Sheets['表紙'].A1.v,original:wb.Sheets['歌割'].A1.v,replacement:wb.Sheets[absentTab()].A1.v};
  });
  assert.equal(restoredSingle.state,restoredBefore);assert.equal(restoredSingle.count,1);assert.deepEqual(restoredSingle.failures,[]);assert(restoredSingle.name.endsWith('.xlsx'));
  assert.equal(restoredSingle.cover,'Synthetic cover to preserve');assert.equal(restoredSingle.original,'甲');assert.equal(restoredSingle.replacement,'乙');
  await page.getByRole('dialog',{name:'Excelの保存'}).locator('[data-act="excel-export-close"]').click();
  await page.locator('[data-act="xlsall"]').click();await page.waitForFunction(()=>!!U.excelExport?.blob&&!U.exportingExcel);
  const restoredBatch=await page.evaluate(async()=>{
   const archive=await unzip(new Uint8Array(await U.excelExport.blob.arrayBuffer())),name=archive.order[0],wb=XLSX.read(archive.files[name],{type:'array'});
   return {state:JSON.stringify(S),name:U.excelExport.name,count:U.excelExport.count,failures:U.excelExport.failures,files:archive.order.length,cover:wb.Sheets['表紙'].A1.v,original:wb.Sheets['歌割'].A1.v,replacement:wb.Sheets[absentTab()].A1.v};
  });
  assert.equal(restoredBatch.state,restoredBefore);assert.equal(restoredBatch.count,1);assert.equal(restoredBatch.files,1);assert.deepEqual(restoredBatch.failures,[]);assert(restoredBatch.name.endsWith('.zip'));
  assert.equal(restoredBatch.cover,'Synthetic cover to preserve');assert.equal(restoredBatch.original,'甲');assert.equal(restoredBatch.replacement,'乙');

  // A slow original lookup must show feedback immediately, then share directly.
  await page.getByRole('dialog',{name:'Excelの保存'}).locator('[data-act="excel-export-close"]').click();
  await page.evaluate(()=>{
   window.qaShareDescriptors={share:Object.getOwnPropertyDescriptor(navigator,'share'),canShare:Object.getOwnPropertyDescriptor(navigator,'canShare')};
   window.qaNativeShares=[];window.qaOriginalExportSource=originalExcelExportSource;runAbsentExport.prepared=new Map();
   Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
   Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{
    qaNativeShares.push({name:files[0].name,resultSheet:U.menu?.kind==='excel-export',loading:!document.getElementById('operation-progress').hidden});
   }});
   originalExcelExportSource=async(...args)=>{await new Promise(resolve=>window.qaReleaseExcel=resolve);return qaOriginalExportSource(...args);};
  });
  try{
   await exportButton.click();await page.locator('#operation-progress').waitFor({state:'visible'});
   assert.match(await page.locator('#operation-progress').innerText(),/Excel/);
   assert.equal(await page.getByRole('dialog',{name:'Excelの保存'}).count(),0);
   await page.waitForFunction(()=>typeof window.qaReleaseExcel==='function');await page.evaluate(()=>qaReleaseExcel());await page.waitForFunction(()=>qaNativeShares.length===1&&!U.exportingExcel);
   const shared=await page.evaluate(()=>({shares:qaNativeShares,state:JSON.stringify(S),file:U.excelExport}));
   assert.equal(shared.shares[0].resultSheet,false);assert.equal(shared.shares[0].loading,false);assert(shared.shares[0].name.endsWith('.xlsx'));
   assert.equal(shared.state,restoredBefore);assert.equal(shared.file,null);await page.locator('#operation-progress').waitFor({state:'hidden'});
   // The next tap must invoke sharing inside the tap, using unchanged prepared bytes.
   await page.evaluate(()=>{originalExcelExportSource=async()=>{throw Error('Prepared export must not reread');};});
   await exportButton.click();await page.waitForFunction(()=>qaNativeShares.length===2&&!U.exportingExcel);
   assert.equal(await page.getByRole('dialog',{name:'Excelの保存'}).count(),0);
   assert.equal(await page.evaluate(()=>JSON.stringify(S)),restoredBefore);

  const progressLifecycle=await page.evaluate(()=>{
   const input=document.createElement('input');input.readOnly=true;document.body.appendChild(input);input.focus();
   const first=OperationProgress.begin('読み込み中…'),second=OperationProgress.begin('保存中…');
   first();const pending=!document.getElementById('operation-progress').hidden;
   const focused=document.activeElement===input;second();
   const finished=document.getElementById('operation-progress').hidden;input.remove();return {pending,focused,finished};
  });
  assert.deepEqual(progressLifecycle,{pending:true,focused:true,finished:true});

  }finally{
   await page.evaluate(()=>{
    originalExcelExportSource=qaOriginalExportSource;
    for(const key of ['share','canShare']){const descriptor=qaShareDescriptors[key];if(descriptor)Object.defineProperty(navigator,key,descriptor);else delete navigator[key];}
    delete window.qaOriginalExportSource;delete window.qaShareDescriptors;delete window.qaNativeShares;delete window.qaReleaseExcel;
   });
  }


 }finally{
  await page.evaluate(async saved=>{
   closeExcelExport();S=JSON.parse(saved.state);Object.keys(U).forEach(key=>delete U[key]);Object.assign(U,JSON.parse(saved.ui));
   startupRecoveryNetworkHold=saved.hold;saveErr=false;renderPointers.clear();scrollingUntil=0;pendingRender=false;save();await saveNow();
   if(saveErr)throw Error('Synthetic test could not restore prior state');saveErr=saved.saveErr;delete window.qaExcelBytes;render(true);
  },saved);
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),saved.state,'Excel check restores exact prior application state');
  await restoreDate();
 }
 return {reattach:true,wrongWorkbookRejected:true,oldWorkbookPreserved:true,idsLyricsNotesPreserved:true,export:true,batchReattach:true,onDemandOriginal:true,restoredSongIndividualAndBatch:true,directNativeShareAndLoading:true};
}
