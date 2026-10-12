// Isolated synthetic browser regression. No user profile, remote data, or publication.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.join(root,url.pathname==='/'?'index.html':url.pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
function seed(){
 const pt=structuredClone(S.pt||{});S=Object.assign(structuredClone(S0),{pt,viewer:false,recMode:false,showId:'rh',groupId:'r',ghToken:'',groups:[{id:'r',name:'Rosie'},{id:'o',name:'OCHA NORMA'},{id:'h',name:'ハロコン'}],shows:[{id:'rh',name:'通しリハ',groupId:'r',ts:100},{id:'night',name:'熊谷夜公演',groupId:'r',ts:90},{id:'day',name:'熊谷昼公演',groupId:'r',ts:80},{id:'ocha',name:'OCHA本公演',groupId:'o',ts:110},{id:'mixed',name:'混合ハロコン',groupId:'h',deliveryMode:'song',ts:70}],members:[{id:'m',name:'本人'}],notes:[{id:'note',songId:'n',showId:'night',lineIdx:0,memberIds:['m'],tags:[],memo:'保持する指摘'}],staffMemos:{private:'保持する本人メモ'},plan:{slots:[]},recs:{'night|n':{size:123,dur:1,at:Date.now()}},rsongId:'ra',rfolders:{},folders:{},songId:'n'});
 S.shows.filter(sw=>sw.groupId==='r').forEach(sw=>sw.folder='秋ツアー');
 S.songs=[['rh','rh'],['n','night'],['d','day'],['o','ocha'],['h','mixed']].map(([id,showId])=>({id,showId,groupId:showId==='ocha'?'o':showId==='mixed'?'h':'r',title:id==='o'?'OCHA曲':id==='h'?'ハロコン曲':'Rosie曲',roster:['m'],take:1,blocks:{},lines:[{t:'保持する歌詞',parts:['m']}]}));
 S.rsongs=[{id:'ra',title:'Rosie録音',groupId:'r',roster:['m'],blocks:{},at:1,lines:[{id:'rl',t:'REC歌詞',parts:['m']}]},{id:'oa',title:'OCHA録音',groupId:'o',roster:['m'],blocks:{},at:2,lines:[{id:'ol',t:'REC別歌詞',parts:['m']}]}];
 startupRecoveryNetworkHold=true;Object.assign(U,{view:'setup',showFilter:'',songIdx:0,pick:[],menu:null,sheet:null,picker:false,overview:false,recGroupFilter:undefined});renderPointers.clear();scrollingUntil=0;render(true);
}
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});const results=[];
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[],remote=[];page.setDefaultTimeout(5000);
  await page.route('**/*',route=>{if(route.request().url().startsWith(origin))return route.continue();remote.push(route.request().url());return route.abort();});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);await page.evaluate(seed);
  const snapshot=()=>page.evaluate(()=>JSON.stringify([S.groups,S.shows.filter(x=>!x.hidden),S.songs,S.rsongs,S.notes,S.recs,S.staffMemos]));const before=await snapshot();assert(await page.locator('[data-act="picker"]').count());await page.locator('[data-act="picker"]').first().tap();assert(await page.locator('.sheet summary').filter({hasText:'秋ツアー'}).count());await page.locator('.sheet [data-act="cancel"]').tap();
  await page.locator('[data-act="showfilter"][data-id="r"]').tap();assert.equal(await page.evaluate(()=>S.showId),'night');
  assert.equal(await page.locator('[data-settings-panel="live-materials"] [data-act="opensong"]').first().isVisible(),true);
  for(const name of ['publication','sync','recovery','recording-import'])assert.equal(await page.locator('[data-settings-panel="'+name+'"]').count(),0);
  assert.equal(await page.locator('[data-act="publication-inspect"]').count(),0);assert.equal(await page.locator('[data-act="go-summary"]').count(),0);
  await page.locator('[data-act="showfilter"][data-id="o"]').tap();assert.equal(await page.evaluate(()=>S.showId),'ocha');
  await page.locator('[data-act="showfilter"][data-id="h"]').tap();assert.equal(await page.evaluate(()=>S.showId),'mixed');
  await page.locator('[data-act="showfilter"][data-id="r"]').tap();await page.locator('[data-settings-panel="live-materials"] details summary').first().tap();await page.locator('[data-act="useshow"][data-id="day"]').tap();assert.equal(await page.evaluate(()=>S.showId),'day');
  await page.evaluate(()=>{restoreViewSelection();render(true);});assert.equal(await page.evaluate(()=>S.showId),'day');
  await page.locator('[data-act="recon"]').tap();await page.waitForSelector('[data-settings-panel="rec-materials"]');assert.equal(await page.locator('[data-settings-panel="rec-materials"]').isVisible(),true);
  await page.locator('[data-act="rec-group-filter"][data-id="o"]').tap();assert.equal(await page.evaluate(()=>S.rsongId),'oa');assert.equal(await page.locator('[data-act="ruse"][data-id="ra"]').count(),0);
  await page.locator('[data-act="ruse"][data-id="oa"]').tap();assert.equal(await page.evaluate(()=>U.view),'live');await page.locator('[data-act="go-setup"]').tap();
  await page.locator('[data-act="recon"]').tap();assert.equal(await page.evaluate(()=>S.showId),'day');assert.equal(await page.evaluate(()=>S.groupId),'r');assert.equal(await snapshot(),before);
  const privateBoundary=await page.evaluate(()=>{
    const original=JSON.stringify(S);
    S.groups.push({id:'off-boundary',name:'配信しない',nopub:true});
    S.shows.push({id:'private-boundary',groupId:'off-boundary',nopub:true,name:'private',folder:'PRIVATE FOLDER'});
    S.folderOrder=['PRIVATE FOLDER','秋ツアー'];
    S.notes.push({id:'private-note',songId:'n',showId:'private-boundary',memberIds:[],tags:[],lineIdx:0,memo:'PRIVATE NOTE'});
    S.memos['private-boundary|n']='PRIVATE MEMO';
    const before=JSON.stringify(S),payload=publicationData('r');
    const result={excluded:!JSON.stringify(payload).includes('PRIVATE'),preserved:JSON.stringify(S)===before,folders:payload.folderOrder};S=JSON.parse(original);return result;
  });assert.equal(privateBoundary.excluded,true);assert.equal(privateBoundary.preserved,true);assert.deepEqual(privateBoundary.folders,['秋ツアー']);
  const guard=await page.evaluate(async()=>{
   const oldGh=gh,oldToken=S.ghToken,oldHold=startupRecoveryNetworkHold,g=S.groups.find(x=>x.id==='r'),oldGroup=structuredClone(g),requests=[];
   try{
    startupRecoveryNetworkHold=false;S.ghToken='synthetic-only';g.gistId='a'.repeat(32);g.src='https://gist.githubusercontent.com/synthetic/'+g.gistId+'/raw/utacheck.json';g.lastKey='unmatched';
    gh=async(path,opts)=>{requests.push({path,method:opts?.method||'GET'});return {files:{'utacheck.json':{content:JSON.stringify({shows:[{id:'phone-only'}],songs:[{showId:'phone-only'}]})}}};};
    const codes=[];for(const force of [false,true])try{await gistPush('r',force);}catch(e){codes.push(e.code);}
    return {codes,reads:requests.filter(x=>x.method==='GET').length,writes:requests.filter(x=>x.method!=='GET').length};
   }finally{gh=oldGh;S.ghToken=oldToken;startupRecoveryNetworkHold=oldHold;Object.keys(g).forEach(k=>delete g[k]);Object.assign(g,oldGroup);}
  });assert.deepEqual(guard,{codes:['PUBLICATION_SOURCE_INCOMPLETE','PUBLICATION_SOURCE_INCOMPLETE'],reads:2,writes:0});assert.equal(await snapshot(),before);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);results.push({...viewport,dataPreserved:true,remoteRequests:0});await context.close();
 }
 console.log(JSON.stringify({results,userProfileUsed:false}));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
