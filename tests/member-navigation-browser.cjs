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
    viewer:true, groupId:'g', showId:'today', linkSrc:'fixture',
    groups:[{id:'g',name:'検証グループ'},{id:'other',name:'別グループ'}],
    members:[{id:'a',name:'メンバーA'},{id:'b',name:'メンバーB'},{id:'c',name:'別グループの人'}],
    rosters:{'検証グループ':['メンバーA','メンバーB']},
    shows:[{id:'today',name:'本日の公演',ts:2},{id:'yesterday',name:'前回の公演',ts:1},{id:'other',name:'別グループ公演',ts:3}],
    memos:{'today|song':'全員共通の総括です。'},
  });
  const lines = Array.from({length:30},(_,i)=>({t:i===12?'A🎵歌詞の範囲を確かめます':`表示確認用の歌詞 ${i+1}行目`,parts:['a','b']}));
  lines[1].t='A🎵歌詞の範囲を確かめます';
  lines[0].sec='1A';lines[12].sec='2サビ';
  S.songs=[{id:'song',title:'範囲確認の曲',showId:'today',groupId:'g',roster:['a','b'],lines,take:1,blocks:{}},
    {id:'old',title:'範囲確認の曲',showId:'yesterday',groupId:'g',roster:['a','b'],lines:structuredClone(lines),take:1,blocks:{}},
    {id:'other-song',title:'表示しない曲',showId:'other',groupId:'other',roster:['c'],lines:structuredClone(lines),blocks:{}}];
  S.songs.forEach(so=>sigOf(so));
  const note=(id,extra)=>Object.assign({id,songId:'song',showId:'today',lineIdx:12,memberIds:['a'],tags:['pHi'],ro:true,memo:''},extra);
  S.pubNotes=[note('first',{from:0,to:0}),note('selected',{from:1,to:3,memo:'選択した指摘のメモ'}),
    note('b-only',{memberIds:['b'],from:8,to:10,memo:'別メンバー限定のメモ'}),
    note('shared',{memberIds:[],lineIdx:16,lineEnd:18,tags:['rhythm'],memo:'全員への指摘'}),
    note('old-note',{songId:'old',showId:'yesterday',lineIdx:6,from:0,to:3,memo:'前回の指摘'}),
    note('foreign',{songId:'other-song',showId:'other',memberIds:['c'],memo:'別グループ向け'})];
  Object.assign(U,{view:'summary',mode:'member',allShows:false,songIdx:0,menu:null,sheet:null,picker:false,overview:false,
    sumOpen:'',memberScope:'',memberName:'',summaryReturn:null,summaryScroll:null,lyricTarget:null});
  renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
}
(async()=>{
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
    const errors=[],results=[];
    for(const [width,height] of [[320,568],[390,844],[844,390]]) {
      const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block'});
      const page=await context.newPage();page.setDefaultTimeout(5000);
      await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin);await page.waitForFunction(()=>typeof booted!=='undefined'&&booted);
      await page.evaluate(seed);
      const before=await page.evaluate(()=>JSON.stringify([S.pubNotes,S.memos,S.songs]));
      await page.locator('#summary-member').selectOption('a');
      assert((await page.locator('.member-song').innerText()).includes('全員への指摘'));
      assert(!(await page.locator('.member-song').innerText()).includes('別メンバー限定'));
      assert(!(await page.locator('#summary-show').innerText()).includes('別グループ公演'));
      assert((await page.locator('[data-note="selected"] .member-note-location').innerText()).includes('2番・サビ'));
      assert.equal(await page.locator('[data-note="selected"] .member-note-location').innerText(),'2番・サビ');
      assert(!(await page.locator('.member-note-location').allTextContents()).some(text=>/回目|行目/.test(text)));
      assert.equal(await page.locator('[data-note="selected"] .member-lyric-context').count(),2);
      assert((await page.locator('[data-note="shared"] .member-lyric-context').last().innerText()).includes('20行目'));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(out,`summary-${width}.png`)});
      await page.locator('[data-note="selected"]').tap();
      await page.waitForFunction(()=>U.view==='live'&&!!document.querySelector('.member-char-target'));
      assert.equal(await page.locator('.member-char-target').allTextContents().then(a=>a.join('')),'🎵歌詞');
      assert.equal(await page.locator('.member-lyric-target').count(),1);
      assert.equal(await page.locator('.member-char-target').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(240, 178, 60)');
      const row=await page.locator('[data-lyric-line="12"]').boundingBox();
      const sc=await page.locator('#app>.scroll').boundingBox();
      assert(row.y<sc.y+sc.height && row.y+row.height>sc.y,'selected row is in view');
      await page.screenshot({path:path.join(out,`lyrics-${width}.png`)});
      await page.evaluate(()=>render(true));
      assert.equal(await page.locator('.member-char-target').allTextContents().then(a=>a.join('')),'🎵歌詞');
      await page.locator('[data-act="summary-back"]').tap();
      await page.waitForSelector('#summary-member');assert.equal(await page.locator('#summary-member').inputValue(),'a');
      await page.locator('[data-note="shared"]').tap();
      await page.waitForFunction(()=>document.querySelectorAll('.member-lyric-target').length===3);
      assert.deepEqual(await page.locator('.member-lyric-target').evaluateAll(es=>es.map(e=>e.dataset.lyricLine)),['16','17','18']);
      await page.locator('[data-act="summary-back"]').tap();
      await page.locator('[data-act="mode"][data-id="diff"]').tap();
      await page.locator('[data-note="old-note"]').tap();
      await page.waitForFunction(()=>S.showId==='yesterday'&&U.view==='live'&&!!document.querySelector('[data-lyric-line="6"] .member-char-target'));
      assert.equal(await page.locator('.member-char-target').allTextContents().then(a=>a.join('')),'表示確認');
      await page.locator('[data-act="summary-back"]').tap();
      await page.waitForFunction(()=>S.showId==='today'&&U.mode==='diff'&&U.view==='summary');
      assert.equal(await page.evaluate(()=>JSON.stringify([S.pubNotes,S.memos,S.songs])),before);
      results.push({width,height,sharedFeedback:true,exactRange:true,multiLine:true,previousShowReturn:true,dataUnchanged:true});
      await context.close();
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({engine:'Chromium',nativeIPhone:false,results,errors,output:out},null,2));
  } finally { await browser?.close(); server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
