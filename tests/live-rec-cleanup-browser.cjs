// Full browser checks with synthetic data only. No remote data or publication.
// NODE_PATH must include Playwright; CHROMIUM_PATH can select a local browser.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..');
const out = process.env.QA_OUTPUT || path.join(require('node:os').tmpdir(), 'utacheck-member-qa');
fs.mkdirSync(out, { recursive: true });
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json'};
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(root, name === '/' ? 'index.html' : name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
function seed() {
  S = Object.assign(JSON.parse(JSON.stringify(S0)), {
    groups:[{id:'empty',name:'グループ1'},{id:'archive',name:'元Excelから復旧した資料',nopub:true},{id:'rec',name:'REC専用グループ',nopub:true},{id:'live',name:'通常グループ',nopub:true}],
    showId:'show',groupId:'live',viewer:false,
    shows:[{id:'archiveShow',name:'元Excelから復旧した資料',groupId:'archive',recoverySource:'original-workbooks',nopub:true},{id:'show',name:'本公演',groupId:'live',nopub:true,recoveredSourceShowId:'source'}],
    songs:[{id:'archiveSong',title:'保管曲',showId:'archiveShow',groupId:'archive',recoveredFromOriginalExcel:true,roster:[],lines:[{t:'保持する歌詞',parts:[]}],blocks:{}},{id:'song',title:'通常曲',showId:'show',groupId:'live',roster:[],lines:[{t:'通常歌詞',parts:[]}],blocks:{}}],
    rsongs:[{id:'rec-song',title:'録音曲',groupId:'rec',roster:[],lines:[{t:'REC歌詞',parts:[]}],blocks:{}}],rsongId:'rec-song',
    notes:[{id:'note',songId:'song',showId:'show',memo:'保持する指摘',memberIds:[],tags:[],lineIdx:0}],plan:{slots:[]},staffMemos:{'show|song':'PRIVATE'}
  });
  startupRecoveryNetworkHold=true;
  Object.assign(U,{view:'setup',showFilter:'',songIdx:0,menu:null,sheet:null,picker:false,overview:false,pick:[]});
  render(true);
}
(async()=>{
 let browser;
 try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const errors=[],results=[];
  for(const [width,height] of [[320,568],[390,844],[844,390]]) {
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block'});
   const page=await context.newPage(); page.setDefaultTimeout(5000);
   await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);await page.waitForFunction(()=>typeof booted!=='undefined'&&booted);
   await page.evaluate(seed);
   const data=()=>page.evaluate(()=>JSON.stringify([S.groups,S.shows.filter(s=>!s.hidden),S.songs,S.rsongs,S.notes,S.staffMemos,S.plan]));
   const before=await data();
   const filter=await page.locator('[data-act="showfilter"]').allTextContents();
   assert(!filter.some(t=>/グループ1|元Excel|REC専用/.test(t)));
   assert.equal(await page.locator('[data-act="useshow"]').count(),1);
   assert((await page.locator('[data-act="useshow"]').innerText()).includes('本公演'));
   assert((await page.locator('#app').innerText()).includes('配信再接続待ち'));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(out,`live-clean-${width}.png`)});
   await page.getByText('復旧資料の保管',{exact:true}).click();
   await page.getByText('保管資料を見る',{exact:true}).click();
   assert((await page.locator('[data-act="useshow"]').innerText()).includes('元Excel'));
   await page.getByText('復旧資料の保管',{exact:true}).click();
   await page.getByText('通常の公演に戻る',{exact:true}).click();
   assert((await page.locator('[data-act="useshow"]').innerText()).includes('本公演'));
   await page.evaluate(()=>{S.recMode=true;U.view='setup';render(true)});
   assert((await page.locator('#app').innerText()).includes('録音曲'));
   await page.screenshot({path:path.join(out,`rec-retained-${width}.png`)});
   await page.evaluate(()=>{S.recMode=false;U.view='setup';render(true)});
   assert.equal(await data(),before);
   results.push({width,height,archiveRoundtrip:true,recRetained:true,dataUnchanged:true});
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results,errors,out}));
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
