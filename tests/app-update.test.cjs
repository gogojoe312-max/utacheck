const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8'),slice=name=>{const a=source.indexOf('async function '+name+'(');return source.slice(a,source.indexOf('\n}',a)+2);};
function fixture(extra={}){const calls=[],c=vm.createContext({URL,Date,location:{href:'https://example.test/utacheck/',reload:()=>calls.push('reload')},navigator:{},U:{},APP_VER:'16.41.58.5',render:()=>calls.push('render'),S:{notes:[{memo:'preserve'}]},VIEW:()=>false,preview:null,typingNow:()=>false,recordingInboxCanWrite:()=>true,REC:null,recordingStartPending:false,recordingFinalizePending:false,pitchStartPending:false,PT:{on:false},micStream:null,saving:false,syncing:false,manualSync:false,publishInFlight:false,backupInFlight:false,automaticBackupBeforeEdit:async()=>{calls.push('checkpoint');return true;},packState:x=>x,save:()=>calls.push('save'),saveNow:async()=>calls.push('flush'),saveErr:false,loadRaw:async()=>JSON.stringify(c.S),alert:()=>calls.push('alert'),...extra});vm.runInContext(slice('checkAppUpdate')+'\n'+slice('reloadForAppUpdate'),c);return{c,calls};}
test('update checks identify the network version without changing owner state or reloading',async()=>{const f=fixture({fetch:async url=>({ok:true,url,text:async()=>'<script src="app.js?v=16.41.58.6"></script>'})}),before=JSON.stringify(f.c.S);await f.c.checkAppUpdate();assert.equal(f.c.U.appUpdateVersion,'16.41.58.6');assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.calls,['render']);});
test('an old service worker offline fallback is never claimed as the live version',async()=>{const f=fixture({fetch:async()=>({ok:true,url:'https://example.test/utacheck/index.html',text:async()=>'<script src="app.js?v=16.41.58.5"></script>'})});await f.c.checkAppUpdate();assert.equal(f.c.U.appUpdateVersion,'');assert.match(f.c.U.appUpdateText,/確認できません/);assert.deepEqual(f.calls,['render']);});
test('reload waits for the verified checkpoint and durable state, and stops during recording or input',async()=>{for(const extra of [{REC:{}},{micStream:{}},{U:{sheet:{memo:'draft'}}},{typingNow:()=>true}]){const f=fixture(extra);assert.equal(await f.c.reloadForAppUpdate(),false);assert.deepEqual(f.calls,['alert']);}const f=fixture();assert.equal(await f.c.reloadForAppUpdate(),true);assert.deepEqual(f.calls,['checkpoint','save','flush','reload']);const bad=fixture({loadRaw:async()=>'{"different":true}'});assert.equal(await bad.c.reloadForAppUpdate(),false);assert.equal(bad.calls.includes('reload'),false);});

for (const stage of ['checkpoint','flush','read']) for (const late of ['typing','sheet','recording','nonwritable','sync','import']) test('reload stops when '+late+' starts during '+stage,async()=>{
  const f=fixture(), before=JSON.stringify(f.c.S);
  const change=()=>{if(late==='typing')f.c.typingNow=()=>true;else if(late==='sheet')f.c.U.sheet={memo:'unsaved'};else if(late==='recording')f.c.REC={};else if(late==='nonwritable')f.c.recordingInboxCanWrite=()=>false;else if(late==='sync')f.c.syncing=true;else f.c.U.importing=true;};
  f.c.automaticBackupBeforeEdit=async()=>{f.calls.push('checkpoint');if(stage==='checkpoint')change();return true;};
  f.c.saveNow=async()=>{f.calls.push('flush');if(stage==='flush')change();};
  f.c.loadRaw=async()=>{f.calls.push('read');if(stage==='read')change();return JSON.stringify(f.c.S);};
  assert.equal(await f.c.reloadForAppUpdate(),false);
  assert.equal(f.calls.includes('reload'),false);
  assert.equal(f.calls.at(-1),'alert');
  assert.equal(JSON.stringify(f.c.S),before);
  if(stage==='checkpoint')assert.deepEqual(f.calls,['checkpoint','alert']);
});
