'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;try{res.end(fs.readFileSync(path.join(root,pathname==='/'?'index.html':pathname)));}catch{res.writeHead(404).end();}});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(origin);await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  await page.evaluate(()=>{
   S=Object.assign(structuredClone(S0),{groups:[{id:'group',name:'テスト'}],groupId:'group',shows:[{id:'show',name:'公演',folder:'春',groupId:'group'}],showId:'show',folderOrder:['春'],folders:{春:true}});
   U.view='setup';U.showFilter='group';U.menu=null;renderPointers.clear();scrollingUntil=0;render();
   window.organizationBackupCalls=0;window.organizationFocusEvents=[];
   automaticBackupBeforeEdit=async()=>{window.organizationBackupCalls++;return window.organizationBackupResult!==false;};
   document.addEventListener('click',event=>{
    const action=event.target.closest('[data-act]')?.dataset.act;
    if(['frename','newfolder','newshow','rfrename'].includes(action))window.organizationFocusEvents.push({action,id:document.activeElement?.id,readOnly:document.activeElement?.readOnly,backups:window.organizationBackupCalls});
   });
  });
  async function openRename(){
   await page.evaluate(()=>{document.activeElement?.blur();U.menu={kind:'organize',mode:'folder-actions',id:'春',scope:'group',showIds:['show']};renderSheet();});
   await page.locator('[data-act="frename"]').click();
   assert.equal(await page.locator('#org-name').evaluate(field=>document.activeElement===field&&!field.readOnly),true);
  }
  for(let attempt=0;attempt<3;attempt++){
   await openRename();await page.locator('#org-name').fill('キャンセルされる入力');await page.locator('[data-act="org-close"]').last().click();
   assert.equal(await page.evaluate(()=>S.shows[0].folder),'春');
  }
  assert.equal(await page.evaluate(()=>window.organizationBackupCalls),0);
  assert.deepEqual(await page.evaluate(()=>window.organizationFocusEvents),Array.from({length:3},()=>({action:'frename',id:'org-name',readOnly:false,backups:0})));
  await openRename();await page.locator('#org-name').fill('秋');await page.evaluate(()=>{window.organizationBackupResult=false;});
  await page.locator('#organize-form [type="submit"]').click();await page.waitForFunction(()=>document.getElementById('org-error')?.hidden===false);
  assert.equal(await page.evaluate(()=>S.shows[0].folder),'春');assert.equal(await page.locator('#org-name').inputValue(),'秋');
  await page.evaluate(()=>{window.organizationBackupResult=true;});await page.locator('#organize-form [type="submit"]').click();await page.waitForFunction(()=>S.shows[0].folder==='秋');
  // Opening a show form and selecting a new folder keep focus in the native gesture.
  await page.evaluate(()=>{U.menu=null;renderPointers.clear();scrollingUntil=0;render();});
  await page.locator('[data-act="newshow"]').click();
  assert.equal(await page.locator('#org-name').evaluate(field=>document.activeElement===field&&!field.readOnly),true);
  const beforeSelect=await page.evaluate(()=>window.organizationBackupCalls);
  await page.locator('#org-folder').selectOption('__new_folder__');
  assert.equal(await page.locator('#org-new-folder').evaluate(field=>document.activeElement===field&&!field.readOnly),true);
  assert.equal(await page.evaluate(()=>window.organizationBackupCalls),beforeSelect);
  await page.locator('[data-act="org-close"]').last().click();
  await page.locator('[data-act="newfolder"]').click();
  assert.equal(await page.locator('#org-name').evaluate(field=>document.activeElement===field&&!field.readOnly),true);
  await page.locator('#org-name').fill('日本語の名前');
  const beforeIME=await page.evaluate(()=>window.organizationBackupCalls);
  await page.locator('#org-name').dispatchEvent('compositionstart');
  await page.evaluate(()=>document.getElementById('organize-form').requestSubmit());
  assert.equal(await page.evaluate(()=>window.organizationBackupCalls),beforeIME);
  assert.equal(await page.locator('#org-name').inputValue(),'日本語の名前');
  await page.locator('#org-name').dispatchEvent('compositionend');
  await page.locator('[data-act="org-close"]').last().click();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({mobileViewport:390,synchronousWritableFocus:true,reopenAttempts:3,cancelPreservesState:true,backupFailureRetainsDraft:true,backupRetrySaves:true,newFolderSelectionFocus:true,imeDraftPreserved:true,pageErrors:errors}));
  await context.close();
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
