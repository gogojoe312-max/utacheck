const { chromium, webkit }=require('playwright');
const {checkUnscheduledRecording}=require('./tests/unscheduled-recording-browser-helper.cjs');
const fs=require('node:fs');
(async()=>{
  const engine=process.env.ENGINE;
  const port=process.env.QA_BASE_URL||'http://127.0.0.1:8432/';
  for(const width of [320,390]){
    const browser=engine==='chromium'?await chromium.launch():null;
    const args={viewport:{width,height:844},serviceWorkers:'block'};
    const context=browser?await browser.newContext(args):await webkit.launchPersistentContext(fs.mkdtempSync('/tmp/free-rec-'),args);
    try{
      await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(port).origin&&r.request().method()==='GET'?r.continue():r.abort());
      const page=await context.newPage();page.on('pageerror',console.error);page.setDefaultTimeout(15000);
      await page.goto(port);await page.waitForFunction(()=>normalStartupInitialized);
      console.log({engine,width,result:await checkUnscheduledRecording(page)});
    } finally {await context.close();if(browser)await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1});
