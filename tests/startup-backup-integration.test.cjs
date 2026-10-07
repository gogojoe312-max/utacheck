'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const inspection=require('../startup-backup-inspection.js');
const block=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function handlers(){
  const capture={},calls=[],panel={id:'startup-protection'};
  const button={id:'startup-backup-check',disabled:false,closest(selector){return selector==='#startup-protection'?panel:null;}};
  const c=vm.createContext({startupPhase:'blocked',recordingInboxCanWrite:()=>false,
    startupInspectBackups:()=>calls.push('inspect'),document:{addEventListener:(type,handler)=>capture[type]=handler}});
  vm.runInContext(block("for (const type of ['click','input','change','keydown','submit','pointerdown','drop'])",'recordingInboxOwnerUI();'),c);
  const event=(target,extra={})=>{const actions=[];return {value:{target,...extra,preventDefault:()=>actions.push('prevent'),stopImmediatePropagation:()=>actions.push('stop')},actions};};
  const buttonTarget={closest:selector=>selector==='#startup-backup-check'?button:selector==='#startup-protection'?panel:null};
  const panelTarget={closest:selector=>selector==='#startup-protection'?panel:null};
  const editorTarget={closest:()=>null};
  return {capture,calls,c,button,panel,event,buttonTarget,panelTarget,editorTarget};
}
test('blocked capture admits only own inspection click and no downstream editor event',()=>{
  const f=handlers();const event=f.event(f.buttonTarget);f.capture.click(event.value);
  assert.deepEqual(f.calls,['inspect']);assert.deepEqual(event.actions,['stop','prevent']);
  f.button.disabled=true;f.capture.click(f.event(f.buttonTarget).value);assert.deepEqual(f.calls,['inspect']);
  for(const type of ['input','change','submit','drop']){
    const e=f.event(f.buttonTarget);f.capture[type](e.value);assert.deepEqual(e.actions,['stop','prevent']);assert.deepEqual(f.calls,['inspect']);
  }
});
test('blocked protection scrolling and inspection Enter/Space defaults stay isolated',()=>{
  const f=handlers();
  for(const target of [f.buttonTarget,f.panelTarget]){const e=f.event(target);f.capture.pointerdown(e.value);assert.deepEqual(e.actions,['stop']);}
  for(const key of ['Enter',' ']){const e=f.event(f.buttonTarget,{key});f.capture.keydown(e.value);assert.deepEqual(e.actions,['stop']);}
  for(const extra of [{key:'a'},{key:'Escape'},{key:'Enter',ctrlKey:true},{key:' ',altKey:true},{key:'Enter',metaKey:true}]){
    const e=f.event(f.buttonTarget,extra);f.capture.keydown(e.value);assert.deepEqual(e.actions,['stop','prevent']);
  }
  assert.deepEqual(f.calls,[]);
});
test('all unrelated blocked editor events remain prevented and inspection is absent in ready/loading phases',()=>{
  const f=handlers();
  for(const type of Object.keys(f.capture)){const e=f.event(f.editorTarget);f.capture[type](e.value);assert.deepEqual(e.actions,['prevent','stop']);}
  for(const phase of ['ready','loading']){f.c.startupPhase=phase;const e=f.event(f.buttonTarget);f.capture.click(e.value);assert.deepEqual(e.actions,['prevent','stop']);}
  assert.deepEqual(f.calls,[]);
});
function integration(options={}){
  const listeners={window:{},document:{}},calls=[],button={disabled:false},output={textContent:''};
  const doc={hidden:false,getElementById:id=>id==='startup-backup-check'?button:id==='startup-backup-result'?output:null,
    addEventListener:(type,fn)=>listeners.document[type]=fn};
  let created=0,ran=0,cancelled=0,resolveRun;
  const inspector={busy:false,run:async()=>{ran++;inspector.busy=true;try{if(options.pending)await new Promise(resolve=>resolveRun=resolve);}finally{inspector.busy=false;}},
    cancel:()=>{cancelled++;resolveRun?.();}};
  const c=vm.createContext({startupPhase:'blocked',document:doc,window:{addEventListener:(type,fn)=>listeners.window[type]=fn},
    StartupBackupInspection:{create:deps=>{created++;calls.push(deps);return inspector;},decodeBackup:()=>{}},
    idbGet:async()=>{throw new Error('synthetic must not be called without run');},backupDigest:()=>{},openJSON:()=>{},b64d:()=>{},unpackBackup:()=>{throw new Error('legacy unbounded unpack must not be used');},fetch:()=>{},
    DB:null,S:new Proxy({},{get(){throw new Error('shared state access forbidden');}}),
    Promise,Number,Date,Object,JSON});
  vm.runInContext(block('let startupBackupInspector = null;','function startupSafeError('),c);
  return {c,doc,button,output,listeners,calls,inspector,created:()=>created,ran:()=>ran,cancelled:()=>cancelled};
}
test('startup integration load/render is lazy and uses explicit saved-key unpacking without shared state',async()=>{
  const f=integration();assert.equal(f.created(),0);assert.equal(f.ran(),0);
  await f.c.startupInspectBackups();assert.equal(f.created(),1);assert.equal(f.ran(),1);assert.equal(f.button.disabled,false);
  const deps=f.calls[0];let invocation;
  f.c.StartupBackupInspection.decodeBackup=(raw,key,context)=>{invocation={raw,key,context};return 'synthetic';};
  const signal=new AbortController().signal,isActive=()=>true;
  assert.equal(deps.unpackBackup({enc:1},'synthetic-key',{signal,isActive}),'synthetic');
  assert.deepEqual(invocation.raw,{enc:1});assert.equal(invocation.key,'synthetic-key');
  assert.equal(invocation.context.signal,signal);assert.equal(invocation.context.isActive,isActive);
  assert.equal(invocation.context.openJSON,f.c.openJSON);assert.equal(invocation.context.base64Decode,f.c.b64d);
  assert.equal(deps.isActive(),true);f.doc.hidden=true;assert.equal(deps.isActive(),false);
});
test('startup integration busy repeat and hidden/pagehide cancellation stop exactly the active inspector',async()=>{
  const f=integration({pending:true});const pending=f.c.startupInspectBackups();await flush();assert.equal(f.button.disabled,true);
  await f.c.startupInspectBackups();assert.equal(f.ran(),1);
  f.doc.hidden=true;f.listeners.document.visibilitychange();await pending;
  assert.equal(f.cancelled(),1);assert.equal(f.button.disabled,false);assert.match(f.output.textContent,/中止/);
  f.listeners.window.pagehide();assert.equal(f.cancelled(),1);
  const g=integration({pending:true});const other=g.c.startupInspectBackups();await flush();g.listeners.window.pagehide();await other;assert.equal(g.cancelled(),1);
});
test('startup integration blocked/visible guard and missing module never run save/restore/network',async()=>{
  const f=integration();f.doc.hidden=true;await f.c.startupInspectBackups();assert.equal(f.created(),0);
  f.doc.hidden=false;f.c.startupPhase='ready';await f.c.startupInspectBackups();assert.equal(f.created(),0);
  f.c.startupPhase='blocked';f.c.StartupBackupInspection=undefined;await f.c.startupInspectBackups();assert.equal(f.created(),0);assert.match(f.output.textContent,/読み込めません/);
});

test('ancillary enumerates count/key-only existing stores in a readonly transaction without opening a database',async()=>{
  const f=integration();const stored=['state:0','state:1','preserved:startup:v1:synthetic','unrelated-original'],original=JSON.stringify(stored),ops=[];
  f.c.db=()=>{throw new Error('read-only inspection must not open or upgrade a database');};
  f.c.DB={objectStoreNames:{contains:name=>['state','clips'].includes(name)},transaction(names,mode){
    assert.deepEqual(Array.from(names),['state','clips']);assert.equal(mode,'readonly');ops.push(['transaction',mode]);
    const tx={objectStore(name){
      if(name==='clips')return{count(){const q={};queueMicrotask(()=>{q.result=3;q.onsuccess?.();});return q;}};
      return{openKeyCursor(){const q={};let index=0;const advance=()=>queueMicrotask(()=>{
        if(index<stored.length){const cursor={key:stored[index++],continue:advance};Object.defineProperty(cursor,'value',{get(){throw new Error('original values must not be read');}});q.result=cursor;}
        else{q.result=null;queueMicrotask(()=>tx.oncomplete?.());}q.onsuccess?.();
      });advance();return q;}};
    }};return tx;
  }};
  const result=await f.c.startupBackupAncillary();assert.deepEqual(JSON.parse(JSON.stringify(result)),{status:'read',clips:3,preserved:1});
  assert.equal(JSON.stringify(stored),original);assert.deepEqual(ops,[['transaction','readonly']]);
});

test('ancillary missing store is unknown without database creation',async()=>{
  const f=integration();let opened=0;f.c.db=()=>{opened++;throw new Error('do not open');};f.c.DB=null;
  assert.deepEqual(JSON.parse(JSON.stringify(await f.c.startupBackupAncillary())),{status:'read-failed',clips:null,preserved:null});assert.equal(opened,0);
});

test('service worker includes new module before app load and retains external-origin bypass',()=>{
  const html=fs.readFileSync(__dirname+'/../index.html','utf8'),sw=fs.readFileSync(__dirname+'/../sw.js','utf8');
  assert(html.indexOf('startup-backup-inspection.js')<html.indexOf('<script src="app.js'));
  assert.match(html,/startup-backup-inspection\.js\?v=16\.41\.41/);assert.match(sw,/"\.\/startup-backup-inspection\.js"/);
  assert.match(sw,/if \(url\.origin !== self\.location\.origin\) return;/);
});

test('inspection slot provider reads existing handles only, preserves raw bytes, and never creates/upgrades stores',async()=>{
  const f=integration(),original={seq:7,at:1234,txt:'{"synthetic":"original bytes"}'},before=JSON.stringify(original),ops=[];
  f.c.db=f.c.idbGet=()=>{throw new Error('inspection must not use opening/upgrade helpers');};
  f.c.DB={objectStoreNames:{contains:name=>name==='state'},transaction(name,mode){
    assert.equal(name,'state');assert.equal(mode,'readonly');ops.push(['transaction',name,mode]);
    return{objectStore(store){assert.equal(store,'state');return{get(key){ops.push(['get',key]);const q={};queueMicrotask(()=>{q.result=original;q.onsuccess?.();});return q;}};}};
  }};
  assert.equal(await f.c.startupBackupReadSlot('state:0'),original);assert.equal(JSON.stringify(original),before);
  assert.deepEqual(ops,[['transaction','state','readonly'],['get','state:0']]);
  f.c.DB=null;await assert.rejects(f.c.startupBackupReadSlot('state:1'),/storage-read/);assert.equal(ops.length,2);
});

test('inspection slot provider failures stay rejected instead of becoming missing records',async()=>{
  for(const type of ['request','abort']){
    const f=integration();f.c.DB={objectStoreNames:{contains:()=>true},transaction(){const tx={objectStore:()=>({get(){const q={};queueMicrotask(()=>type==='request'?q.onerror?.():tx.onabort?.());return q;}})};return tx;}};
    await assert.rejects(f.c.startupBackupReadSlot('state:0'),/storage-read/);
  }
});

