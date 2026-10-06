const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const calls=[],alerts=[],timers=new Map();let timerId=0;
 const groups=['one','two'].map(id=>({id,name:id,gistId:'synthetic-'+id,key:'old'}));
 const c=vm.createContext({S:{groups,ghToken:'synthetic'},U:{},publishIssues:[],pushState:'',pushTimer:null,lastPushAt:0,limitedAt:'',
  Date,URL,AbortController,Error,document:{getElementById:()=>({value:'new'})},id:'one',
  setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearTimeout(id){timers.delete(id);},
  publicationData:id=>({version:1,groupName:id,shows:[],songs:[]}),unresolvedPublicationShows:()=>[],group:id=>groups.find(g=>g.id===id)||groups[0],
  wrap:async(d,g)=>({key:g.key,data:d}),save(){},render(){},renderPublishStatus(){},alert:x=>alerts.push(x),confirm:()=>false,
  fetch:async(url,opts)=>{calls.push({url,opts});return{ok:true,json:async()=>({})};}});
 for(const [a,b] of [['async function gh(path, opts)','// raw_url は'],['function payloadKey(', '// 送りすぎるとGitHub'],['async function pushOne(', 'window.addEventListener("online"']])vm.runInContext(block(a,b),c);
 return {c,calls,alerts,timers,groups,run:x=>vm.runInContext(x,c),expire(){for(const [id,t] of [...timers]){assert.equal(t.ms,60000);timers.delete(id);t.fn();}}};
}
test('setkey forces only its unchanged target and announces success after PATCH completion',async()=>{
 const s=setup();await s.c.doPush('force');s.calls.length=0;let finish;
 s.c.fetch=async(url,opts)=>{s.calls.push({url,opts});return new Promise(r=>finish=()=>r({ok:true,json:async()=>({})}));};
 s.run('switch("setkey"){'+block('    case "setkey": {','    case "frename":')+'}');await tick();
 assert.equal(s.calls.length,1);assert(s.calls[0].url.endsWith('synthetic-one'));assert.equal(s.alerts.length,0);
 assert.equal(JSON.parse(JSON.parse(s.calls[0].opts.body).files['utacheck.json'].content).key,'new');
 finish();await tick();assert.match(s.alerts[0],/変更を配信しました/);assert.equal(s.groups[0].publishKeyPending,false);
});
test('failed key change preserves old publication cache, stays pending, and never claims success',async()=>{
 const s=setup();await s.c.pushOne('one');const cache=s.groups[0].lastKey;
 s.c.fetch=async()=>{throw new TypeError('synthetic network failure');};
 s.run('switch("setkey"){'+block('    case "setkey": {','    case "frename":')+'}');await tick();
 assert.equal(s.groups[0].lastKey,cache);assert.equal(s.groups[0].publishKeyPending,true);
 assert.match(s.alerts[0],/変更完了は確認できていません/);assert.match(s.c.pushState,/結果不明/);
 s.c.fetch=async(url,opts)=>{s.calls.push({url,opts});return{ok:true,json:async()=>({})};};
 const before=s.calls.length;await s.c.doPush(true);assert.equal(s.calls.length,before+2);assert.equal(s.groups[0].publishKeyPending,false);
});
test('pushOne and repeated explicit sends queue behind older PATCH and build latest payload',async()=>{
 const s=setup();s.groups.pop();let finish;const server=[];
 s.c.fetch=async(url,opts)=>{const wire=JSON.parse(JSON.parse(opts.body).files['utacheck.json'].content);s.calls.push(wire);if(s.calls.length===1)await new Promise(r=>finish=r);server.push(wire);return{ok:true,json:async()=>({})};};
 const old=s.c.doPush('force');await tick();
 const next=s.c.pushOne('one'),manual=s.c.doPush('force');await s.c.doPush(true);await tick();assert.equal(s.calls.length,1);
 s.c.publicationData=id=>({version:2,groupName:id,shows:[],songs:[],alert:'latest'});
 finish();await Promise.all([old,next,manual]);assert.equal(s.calls.length,3);assert.equal(server[0].data.alert,undefined);assert.equal(server[1].data.alert,'latest');assert.equal(server[2].data.alert,'latest');assert.equal(s.run('publishInFlight'),false);
});
for(const stage of ['fetch','body'])test('PATCH '+stage+' timeout releases queue, reports unknown, and does not mark sent',async()=>{
 const s=setup();s.groups.pop();let signal;
 s.c.fetch=async(url,opts)=>{signal=opts.signal;if(stage==='fetch')return new Promise(()=>{});return{ok:true,json:()=>new Promise(()=>{})};};
 const work=s.c.pushOne('one');await tick();s.expire();const result=await work;
 assert.equal(result.sent,false);assert.match(result.state,/結果不明/);assert.equal(signal.aborted,true);assert.equal(s.groups[0].lastKey,undefined);assert.equal(s.run('publishInFlight'),false);
 s.c.fetch=async()=>({ok:true,json:async()=>({})});assert.equal((await s.c.pushOne('one')).sent,true);assert.equal(s.timers.size,0);
});
test('caller cancellation remains effective and already aborted requests never fetch',async()=>{
 const s=setup(),controller=new AbortController();let signal;
 s.c.fetch=async(url,opts)=>{signal=opts.signal;return new Promise(()=>{});};
 const req=s.c.gh('/gists/synthetic',{signal:controller.signal});controller.abort(new Error('explicit stop'));await assert.rejects(req,/explicit stop/);assert(signal.aborted);assert.equal(s.timers.size,0);
 let calls=0;s.c.fetch=async()=>{calls++;};await assert.rejects(s.c.gh('/gists/synthetic',{signal:controller.signal}),/explicit stop/);assert.equal(calls,0);
});
for(const raw of [false,true])test('previous-publication '+(raw?'raw':'API')+' timeout never PATCHes or claims unknown write',async()=>{
 const s=setup();s.groups.pop();s.c.publicationData=()=>{const e=new Error('need previous');e.code='NEED_PREVIOUS_PUBLICATION';throw e;};
 s.c.fetch=async(url,opts)=>{s.calls.push({url,opts});if(raw&&url.startsWith('https://api.'))return{ok:true,json:async()=>({files:{'utacheck.json':{truncated:true,raw_url:'https://gist.githubusercontent.com/synthetic/raw/file'}}})};return new Promise(()=>{});};
 const work=s.c.pushOne('one');await tick();s.expire();const result=await work;assert.equal(result.sent,false);assert.match(result.state,/未送信/);assert(!s.calls.some(x=>x.opts.method==='PATCH'));assert.equal(s.run('publishInFlight'),false);
});
test('permission failures retain destination and do not masquerade as unknown transport results',async()=>{
 const s=setup();s.groups.pop();s.c.fetch=async()=>({ok:false,status:403,text:async()=> 'synthetic permission error'});
 const result=await s.c.pushOne('one');assert.equal(result.sent,false);assert.match(result.state,/未送信/);assert.equal(s.groups[0].gistId,'synthetic-one');assert.equal(s.groups[0].lastKey,undefined);
});
test('pending key flag invalidates unchanged cached automatic-publication check',()=>{
 const s=setup();s.groups.pop();s.c.stateRevision=1;vm.runInContext(block('let pendingCheck = null;', '// アプリを開いている間'),s.c);
 s.groups[0].lastKey=s.c.payloadKey(s.c.publicationData('one'));assert.equal(s.c.hasPending(),false);s.groups[0].publishKeyPending=true;assert.equal(s.c.hasPending(),true);
});
test('queued explicit send proceeds after timeout and retains its own completion result',async()=>{
 const s=setup();s.groups.pop();let count=0;
 s.c.fetch=async()=>++count===1?new Promise(()=>{}):{ok:true,json:async()=>({})};
 const first=s.c.pushOne('one'),next=s.c.pushOne('one');await tick();assert.equal(count,1);s.expire();
 const [a,b]=await Promise.all([first,next]);assert.equal(a.sent,false);assert.match(a.state,/結果不明/);assert.equal(b.sent,true);assert.match(b.state,/公開済/);assert.equal(count,2);assert.equal(s.run('publishInFlight'),false);
});
test('a key edited during an older PATCH remains pending until its own queued send',async()=>{
 const s=setup();s.groups.pop();let finish;
 s.c.fetch=async()=>new Promise(r=>finish=()=>r({ok:true,json:async()=>({})}));
 const first=s.c.pushOne('one');await tick();s.groups[0].key='new';s.groups[0].publishKeyPending=true;finish();await first;
 assert.equal(s.groups[0].publishKeyPending,true);
 s.c.fetch=async()=>({ok:true,json:async()=>({})});await s.c.doPush(true);assert.equal(s.groups[0].publishKeyPending,false);
});

test('API timeout retains TimeoutError classification for shared backup diagnostics',async()=>{
 const s=setup();s.c.fetch=async()=>new Promise(()=>{});
 const request=s.c.gh('/gists/synthetic');await tick();s.expire();
 await assert.rejects(request,e=>e.name==='TimeoutError'&&e.code==='REQUEST_TIMEOUT');
 assert.equal(s.timers.size,0);
});

// Match production group() fallback: publishing must never use it for target lookup.
test('deleted queued target never falls back to the first remaining group',async()=>{
 const s=setup();const queued=s.c.pushOne('one');s.groups.shift();
 assert.equal(s.c.group('one').id,'two');const result=await queued;
 assert.equal(result.sent,false);assert.match(result.state,/未送信/);assert.equal(s.calls.length,0);
 assert.equal(await s.c.gistPush('one',true),'skip');assert.equal(s.calls.length,0);
});
for(const stage of ['previous GET','encryption'])for(const change of ['destination','token','key','deleted','replaced','disabled'])test(stage+' target '+change+' prevents PATCH',async()=>{
 const s=setup();let finish;
 if(stage==='previous GET'){
  s.c.publicationData=(id,previous)=>{if(previous)return{groupName:id,shows:[],songs:[]};const e=new Error('need previous');e.code='NEED_PREVIOUS_PUBLICATION';throw e;};
  s.c.fetch=async(url,opts)=>{s.calls.push({url,opts});await new Promise(r=>finish=r);return{ok:true,json:async()=>({files:{'utacheck.json':{content:'{}'}}})};};
 }else{
  s.c.wrap=async(d,g)=>{const key=g.key;await new Promise(r=>finish=r);return{key,data:d};};
 }
 const send=s.c.pushOne('one');await tick();
 const original=s.groups[0];
 if(change==='destination')original.gistId='different';
 if(change==='token')s.c.S.ghToken='different';
 if(change==='key')original.key='different';
 if(change==='deleted')s.groups.shift();
 if(change==='replaced')s.groups[0]={...original};
 if(change==='disabled')original.nopub=true;
 finish();const result=await send;
 assert.equal(result.sent,false);assert.match(result.state,/未送信/);assert(!s.calls.some(x=>x.opts.method==='PATCH'));assert.equal(original.lastKey,undefined);
 assert.equal(s.run('publishInFlight'),false);
});
