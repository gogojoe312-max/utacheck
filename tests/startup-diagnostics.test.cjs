'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const source = fs.readFileSync(__dirname + '/../app.js','utf8');
const block = (a,b) => source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const work = {
  shows:[{id:'show',name:'PRIVATE_SHOW'}],songs:[{id:'song',lines:[{t:'PRIVATE_LYRIC'}]}],rsongs:[],
  notes:[{id:'note',memo:'PRIVATE_MEMO'}],pubNotes:[],trash:[{songs:[],private:'PRIVATE_TRASH'}],
  groups:[],members:[{id:'member',name:'PRIVATE_NAME'}],plan:{slots:[]},
  ghToken:'PRIVATE_TOKEN',bkKey:'PRIVATE_KEY',src:'https://PRIVATE_GIST_URL',unknown:{private:'PRIVATE_UNKNOWN'}
};
function fixture(options = {}) {
  const values = options.values || [
    {seq:10,at:1000,txt:JSON.stringify(work)}, {seq:9,at:900,txt:JSON.stringify(work)}
  ];
  const records = new Map(values.map((value,index) => ['state:' + index,clone(value)]).filter(([,value]) => value !== undefined));
  records.set('unrelated-original',{private:'PRIVATE_UNRELATED'});
  const legacy = options.legacy === undefined ? null : options.legacy;
  const local = {["utacheck.v1:broken:1"]:'PRIVATE_BROKEN',unrelated:'PRIVATE_LOCAL'};
  if (legacy !== null) local['utacheck.v1'] = legacy;
  const original = {privateOriginal:true}, reads = [], writes = [];
  const target = {inert:false,innerHTML:''}, elements = {app:target};
  const document = {
    getElementById:id=>elements[id] || null,
    createElement:()=>({innerHTML:'',style:{},setAttribute(key,value){this[key]=value;}}),
    body:{appendChild:element=>{elements[element.id]=element;}}
  };
  const c = vm.createContext({
    S0:{songs:[],rsongs:[],notes:[],shows:[],groups:[],members:[],plan:{slots:[]}},S:original,
    KEY:'utacheck.v1',APP_VER:'16.41.33',startupPhase:'loading',recordingInboxStale:false,
    recordingInboxProfileRequired:false,recordingInboxOwner:null,saveSeq:0,idbOK:false,saveErr:false,
    bootErr:'',crypto:options.hashFailure ? {subtle:{digest:async()=>{throw Object.assign(new Error('PRIVATE_HASH_FAILURE'),{name:'NotSupportedError'});}}} : webcrypto,
    TextEncoder,Uint8Array,document,
    h:value=>String(value).replace(/[<>]/g,c=>c==='<'?'&lt;':'&gt;'),recordingInboxOwnerUI(){},
    localStorage:options.indexFailure ? new Proxy(local,{ownKeys(){throw Object.assign(new Error('PRIVATE_INDEX_FAILURE'),{name:'SecurityError'});},get(t,key){return key==='getItem'?k=>local[k]??null:t[key];}})
      : Object.assign(local,{getItem:key=>{if(options.legacyFailure)throw Object.assign(new Error('PRIVATE_LEGACY_FAILURE'),{name:'SecurityError'});return local[key]??null;}}),
    idbGet:async key=>{reads.push(key);if(options.readFailure===key)throw Object.assign(new Error('PRIVATE_READ_FAILURE'),{name:options.errorName || 'UnknownError'});return clone(records.get(key));},
    migrate:()=>{if(options.migrationFailure){c.S.notes[0].memo='MIGRATION_CHANGED_CLONE';throw new TypeError('PRIVATE_MIGRATION_FAILURE');}}
  });
  c.db = async()=>({transaction(name,mode){
    assert.equal(name,'state');assert.equal(mode,'readwrite');
    let done = false;
    const pending = [];
    const tx = {error:null,abort(){done=true;queueMicrotask(()=>tx.onabort?.());},objectStore(){return {
      get(key){const request={};queueMicrotask(()=>{request.result=clone(records.get(key));request.onsuccess?.();});return request;},
      add(value,key){
        writes.push(key);
        if(options.quotaFailure){tx.error=Object.assign(new Error('PRIVATE_QUOTA_FAILURE'),{name:'QuotaExceededError'});done=true;queueMicrotask(()=>tx.onerror?.());}
        else pending.push([key,clone(value)]);
      }
    };}};
    setImmediate(()=>{if(!done){for(const [key,value]of pending)records.set(key,value);tx.oncomplete?.();}});
    return tx;
  }});
  vm.runInContext(block('// Read-only startup inspection.','async function loadRaw()'),c);
  vm.runInContext(block('function unpackState(o)', '\n// 保存に失敗したら'),c);
  vm.runInContext(block('let booted = false;', 'let bootErr = "";'),c);
  const originals = () => JSON.stringify({values:['state:0','state:1','unrelated-original'].map(key=>records.get(key)),local:Object.entries(local).filter(([,v])=>typeof v!=='function')});
  const before = originals();
  return {c,records,reads,writes,target,elements,original,before,originals,
    diagnostic:()=>JSON.parse(vm.runInContext('JSON.stringify(startupDiagnostic)',c)),
    text:()=>c.startupDiagnosticText()};
}
function safe(f) {
  assert.equal(f.originals(),f.before,'original storage bytes must be unchanged');
  assert.doesNotMatch(JSON.stringify(f.diagnostic()),/PRIVATE_|MIGRATION_CHANGED_CLONE/);
  assert.doesNotMatch(f.text(),/PRIVATE_|MIGRATION_CHANGED_CLONE/);
  assert.doesNotMatch(f.target.innerHTML,/PRIVATE_|MIGRATION_CHANGED_CLONE/);
  assert.doesNotMatch(f.elements['startup-protection']?.innerHTML || '',/PRIVATE_|MIGRATION_CHANGED_CLONE/);
}
for (const key of ['state:0','state:1']) test('failed '+key+' read preserves successful generation counts and remains blocked',async()=>{
  const f=fixture({readFailure:key,legacy:JSON.stringify(work)});
  assert.equal(await f.c.load(),false);
  assert.deepEqual(f.reads,['state:0','state:1']);
  const d=f.diagnostic(),index=Number(key.slice(-1));
  assert.equal(d.failure.stage,'read-state:'+index);assert.equal(d.failure.name,'UnknownError');
  assert.equal(d.slots[index].status,'failed');assert.equal(d.slots[1-index].counts.notes,1);
  assert.equal(d.legacy.counts.shows,1);assert.equal(d.preservation,'not-started');
  assert.equal(f.c.S,f.original);assert.equal(f.c.startupPhase,'blocked');assert.equal(f.target.inert,true);
  assert.deepEqual(f.writes,[]);safe(f);
});
test('legacy rejection is unknown, never absence, and IDB counts are retained',async()=>{
  const f=fixture({legacyFailure:true});assert.equal(await f.c.load(),false);
  const d=f.diagnostic();assert.equal(d.legacy.status,'failed');assert.equal(d.failure.stage,'read-legacy');
  assert.equal(d.failure.name,'SecurityError');assert.equal(d.slots[0].counts.songs,1);safe(f);
});
test('recovery index rejection retains already-read legacy counts',async()=>{
  const f=fixture({indexFailure:true,legacy:JSON.stringify(work)});assert.equal(await f.c.load(),false);
  const d=f.diagnostic();assert.equal(d.failure.stage,'read-recovery-index');assert.equal(d.brokenCount,null);
  assert.equal(d.legacy.counts.notes,1);safe(f);
});
test('malformed newest JSON stays present and older counts are retained without choosing it',async()=>{
  const f=fixture({values:[{seq:11,at:1100,txt:'{"PRIVATE_BROKEN_JSON":'}, {seq:10,at:1000,txt:JSON.stringify(work)}]});
  assert.equal(await f.c.load(),false);const d=f.diagnostic();
  assert.equal(d.failure.stage,'select-state');assert.equal(d.failure.name,'SyntaxError');
  assert.equal(d.slots[0].status,'present');assert.equal(d.slots[0].validJSON,false);assert.equal(d.slots[1].counts.notes,1);
  assert.equal(f.c.S,f.original);assert.deepEqual(f.writes,[]);safe(f);
});
test('invalid envelope metadata never exposes string seq/at',async()=>{
  const f=fixture({values:[{seq:'PRIVATE_SEQ',at:'PRIVATE_AT',txt:JSON.stringify(work)},undefined]});
  assert.equal(await f.c.load(),false);const d=f.diagnostic();
  assert.equal(d.failure.code,'slot-format');assert.equal(d.slots[0].seq,null);assert.equal(d.slots[0].at,null);
  assert.equal(d.slots[0].counts.notes,1);assert.equal(d.slots[1].status,'absent');safe(f);
});
test('healthy boot preserves unknown fields and original bytes; next normal IDB edit with retained legacy is diagnosed as different',async()=>{
  const f=fixture({legacy:JSON.stringify(work)});assert.equal(await f.c.load(),true);
  assert.equal(f.c.S.ghToken,'PRIVATE_TOKEN');assert.equal(f.c.S.unknown.private,'PRIVATE_UNKNOWN');
  assert.equal(f.diagnostic().legacyRelation,'same');assert.equal(f.diagnostic().preservation,'succeeded');
  assert.equal(f.writes.length,1);assert(f.writes.every(key=>key.startsWith('preserved:startup:v1:')));safe(f);
  const edited=clone(work);edited.notes.push({id:'new-note',memo:'PRIVATE_EDIT'});
  const later=fixture({legacy:JSON.stringify(work),values:[{seq:10,at:1000,txt:JSON.stringify(work)},{seq:11,at:1100,txt:JSON.stringify(edited)}]});
  assert.equal(await later.c.load(),false);const d=later.diagnostic();
  assert.equal(d.failure.code,'ambiguous-storage');assert.equal(d.failure.stage,'select-state');assert.equal(d.legacyRelation,'different');
  assert.equal(d.slots[1].counts.notes,2);assert.equal(d.legacy.counts.notes,1);assert.deepEqual(later.writes,[]);safe(later);
});
test('empty saved data remains blocked and cannot become a canonical replacement',async()=>{
  const f=fixture({values:[{seq:11,txt:'{"songs":[],"notes":[]}'},undefined]});
  assert.equal(await f.c.load(),false);assert.equal(f.diagnostic().failure.code,'empty-saved-state');
  assert.equal(f.c.S,f.original);assert.deepEqual(f.writes,[]);safe(f);
});
for (const [option,stage,name,preservation] of [
  ['migrationFailure','prepare-state','TypeError','not-started'],
  ['hashFailure','preserve-copy','NotSupportedError','failed'],
  ['quotaFailure','preserve-copy','QuotaExceededError','failed']
]) test(option+' identifies stage and safe name without altering original bytes',async()=>{
  const f=fixture({[option]:true});assert.equal(await f.c.load(),false);const d=f.diagnostic();
  assert.equal(d.failure.stage,stage);assert.equal(d.failure.name,name);assert.equal(d.preservation,preservation);
  assert.equal(f.c.S,f.original);safe(f);
});
test('first failure and summary survive later fatal errors and repeated blocked renders without re-reading or writing',async()=>{
  const f=fixture({readFailure:'state:1',errorName:'PRIVATE_ERROR_NAME'});assert.equal(await f.c.load(),false);
  const before=JSON.stringify(f.diagnostic()),text=f.text();
  f.c.blockStartup(Object.assign(new Error('PRIVATE_LATER_ERROR'),{name:'SecurityError'}));
  f.c.startupRecordFailure(new Error('PRIVATE_LATER_ERROR'),'script');f.c.blockStartup();
  assert.equal(JSON.stringify(f.diagnostic()),before);assert.equal(f.text(),text);
  assert.equal(f.diagnostic().failure.name,'Error');assert.equal(await f.c.load(),false);
  assert.deepEqual(f.reads,['state:0','state:1']);assert.deepEqual(f.writes,[]);safe(f);
});
test('blocked pagehide and visibility events cannot commit, save, or flush',async()=>{
  const f=fixture({readFailure:'state:0'});assert.equal(await f.c.load(),false);
  const handlers={},calls=[];
  f.c.window={addEventListener:(name,handler)=>handlers[name]=handler};
  f.c.document.hidden=true;f.c.document.addEventListener=(name,handler)=>handlers[name]=handler;
  f.c.recordingInboxCanWrite=()=>f.c.startupPhase==='ready';
  for(const fn of ['flushSheet','commitFields','save','saveNow'])f.c[fn]=()=>calls.push(fn);
  vm.runInContext(block('window.addEventListener("pagehide", () => { if (!recordingInboxCanWrite())','if ("serviceWorker" in navigator)'),f.c);
  handlers.pagehide();handlers.visibilitychange();
  assert.deepEqual(calls,[]);assert.deepEqual(f.writes,[]);safe(f);
});
test('protection panel is separate static text; only its browser scroll default is admitted, without downstream editor events',async()=>{
  const f=fixture({readFailure:'state:0'});assert.equal(await f.c.load(),false);
  const panel=f.elements['startup-protection'];
  assert.equal(f.target.inert,true);assert.notEqual(panel,f.target);assert.equal(panel.role,'alert');
  assert.match(panel.style.cssText,/position:fixed/);assert.match(panel.style.cssText,/overflow-y:auto/);
  assert.match(panel.style.cssText,/touch-action:pan-y/);
  assert.equal((panel.innerHTML.match(/<button\b/g)||[]).length,5);assert.match(panel.innerHTML,/id="startup-backup-check"/);
  assert.match(panel.innerHTML,/id="startup-file-input"/);assert.match(panel.innerHTML,/id="startup-file-password"/);
  assert.doesNotMatch(panel.innerHTML,/<(?:textarea|select|a)\b|data-act=/);
  const handlers={};f.c.document.addEventListener=(name,handler)=>handlers[name]=handler;
  f.c.recordingInboxCanWrite=()=>false;
  vm.runInContext(block("for (const type of ['click','input','change','keydown','submit','pointerdown','drop'])",'recordingInboxOwnerUI();'),f.c);
  for(const type of ['pointerdown','click','keydown','input','change','submit','drop']){
    const admitted=[],denied=[];
    handlers[type]({target:{closest:selector=>selector==='#startup-protection'?panel:null},preventDefault:()=>admitted.push('prevent'),stopImmediatePropagation:()=>admitted.push('stop')});
    handlers[type]({target:{closest:()=>null},preventDefault:()=>denied.push('prevent'),stopImmediatePropagation:()=>denied.push('stop')});
    assert.deepEqual(admitted,type==='pointerdown'?['stop']:['prevent','stop']);
    assert.deepEqual(denied,['prevent','stop']);
  }
  assert.deepEqual(f.writes,[]);safe(f);
});

