'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const API=require('../startup-file-inspection.js'),bounded=require('../startup-backup-inspection.js');
const block=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start,a);return source.slice(start,end);};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const plain=obj=>({bk:1,data:Buffer.from(JSON.stringify(obj)).toString('base64url')});
const packet=(extra={})=>({app:'utacheck',at:1791300000000,state:{songs:[{id:'PRIVATE_SONG',lines:[]}],recs:{'PRIVATE_SHOW|PRIVATE_SONG|123':{name:'PRIVATE_AUDIO'}}},...extra});
const file=(extra={})=>new File([JSON.stringify(plain(packet(extra)))],'PRIVATE_LOCAL_BACKUP.json');
function integration(extra={}){
 const elements={};for(const id of ['input','password','label','check','cancel','result'])elements['startup-file-'+id]={id:'startup-file-'+id,value:'',disabled:id==='check',textContent:''};
 const calls=[],listeners={window:{},document:{}},readers=[];let created=0,forbidden=0;
 class FakeReader{
  constructor(){this.aborted=false;readers.push(this);}
  readAsArrayBuffer(value){calls.push(['file-read',value.size]);Promise.resolve(value.arrayBuffer()).then(bytes=>{if(!this.aborted){this.result=bytes;this.onload?.();}});}
  abort(){this.aborted=true;this.onabort?.();}
 }
 const deny=()=>{forbidden++;throw Error('forbidden shared/storage/network mutation');};
 const c=vm.createContext({startupPhase:'blocked',document:{hidden:false,getElementById:id=>elements[id]||null,addEventListener:(type,fn)=>listeners.document[type]=fn},
  window:{addEventListener:(type,fn)=>listeners.window[type]=fn},StartupFileInspection:{create:deps=>{created++;calls.push(['create',deps]);return (extra.create||API.create)(deps);}},
  StartupBackupInspection:{counts:bounded.counts,decodeBackup:extra.decodeBackup||((raw,key,context)=>bounded.decodeBackup(raw,key,{...context,openJSON:async()=>plain(packet()),base64Decode:x=>new Uint8Array(Buffer.from(x,'base64url'))}))},
  startupCancelBackupInspection:()=>calls.push(['backup-cancel']),openJSON:()=>{},b64d:()=>{},FileReader:FakeReader,
  Blob,ArrayBuffer,Uint8Array,AbortController,Number,Date,Object,Set,JSON,TextDecoder,
  S:new Proxy({},{get:deny,set:deny}),U:new Proxy({},{get:deny,set:deny}),DB:null,
  db:deny,idbGet:deny,idbPut:deny,putClip:deny,delClip:deny,save:deny,saveNow:deny,restoreBackupFile:deny,fetch:deny,
  localStorage:new Proxy({},{get:deny,set:deny}),sessionStorage:new Proxy({},{get:deny,set:deny}),indexedDB:new Proxy({},{get:deny,set:deny})});
 vm.runInContext(block('let startupFileInspector=null;','function startupSafeError('),c);
 vm.runInContext(block("if(typeof window!=='undefined')window.addEventListener('pagehide'",'let startupFileInspector=null;'),c);
 return {c,elements,calls,listeners,readers,created:()=>created,forbidden:()=>forbidden,
  safe(){assert.equal(forbidden,0);assert(!elements['startup-file-result'].textContent.includes('PRIVATE_'));}};
}
function metadataDB(f,rows,{delay=false}={}){
 let index=0,aborted=false,finished=false;const ops=[];let advance;
 const tx={objectStore(name){assert.equal(name,'clips');return{openCursor(){ops.push('cursor');const request={};advance=()=>queueMicrotask(()=>{
  if(aborted||finished)return;if(index<rows.length){const row=rows[index++];request.result={key:row[0],value:row[1],continue:()=>{if(!delay)advance();}};request.onsuccess?.();}
  else{request.result=null;request.onsuccess?.();finished=true;queueMicrotask(()=>tx.oncomplete?.());}
 });if(!delay)advance();return request;}};},abort(){ops.push('abort');aborted=true;queueMicrotask(()=>tx.onabort?.());}};
 f.c.DB={objectStoreNames:{contains:name=>name==='clips'},transaction(name,mode){assert.equal(name,'clips');assert.equal(mode,'readonly');ops.push('readonly');return tx;}};
 return {ops,tx,advance:()=>advance(),aborted:()=>aborted};
}
test('local integration remains lazy and uses the bounded decoder with explicit exact password',async()=>{
 const f=integration();assert.equal(f.created(),0);assert.equal(f.readers.length,0);const selected=file();f.elements['startup-file-password'].value='PRIVATE_OLD';
 f.c.startupSelectLocalFile(selected);assert.equal(f.created(),1);assert.equal(f.readers.length,0);assert.equal(f.elements['startup-file-password'].value,'');assert.equal(f.elements['startup-file-input'].value,'');
 const deps=f.calls.find(x=>x[0]==='create')[1];let invocation;f.c.StartupBackupInspection.decodeBackup=(raw,key,context)=>{invocation={raw,key,context};return 'SAFE';};
 const signal=new AbortController().signal,isActive=()=>true;assert.equal(deps.decodeBackup({enc:1},' PRIVATE_KEY ',{signal,isActive}),'SAFE');
 assert.equal(invocation.key,' PRIVATE_KEY ');assert.equal(invocation.context.signal,signal);assert.equal(invocation.context.isActive,isActive);assert.equal(invocation.context.openJSON,f.c.openJSON);assert.equal(invocation.context.base64Decode,f.c.b64d);
 assert.equal(deps.counts,bounded.counts);assert.equal(deps.readAncillary,f.c.startupLocalClipMetadata);assert.equal(deps.fetch,undefined);assert.equal(deps.digest,undefined);f.safe();
});
test('readonly classification separates 124 resources, never reads Blob content, and returns only numeric totals',async()=>{
 const f=integration(),rows=[];let blobReads=0;
 class MetadataOnlyBlob extends Blob{arrayBuffer(){blobReads++;throw Error('no body reads');}text(){blobReads++;throw Error('no body reads');}stream(){blobReads++;throw Error('no body reads');}}
 for(let i=0;i<100;i++)rows.push(['xls:PRIVATE_SONG_'+i,new MetadataOnlyBlob(['xx'])]);
 for(let i=0;i<20;i++)rows.push(['PRIVATE_SHOW|PRIVATE_SONG|'+i,new MetadataOnlyBlob(['abc'],{type:'audio/mp4'})]);
 rows.push(['PRIVATE_BINARY',new Uint8Array([1,2,3,4])],['PRIVATE_OTHER',new MetadataOnlyBlob(['abcde'],{type:'application/octet-stream'})],['PRIVATE_UNKNOWN',{}],['PRIVATE_UNKNOWN_TWO',null]);
 const before=rows.map(([key,value])=>[key,value instanceof Blob?{size:value.size,type:value.type}:value]),original=JSON.stringify(before);
 const db=metadataDB(f,rows),signal=new AbortController().signal;const result=await f.c.startupLocalClipMetadata(['PRIVATE_SHOW|PRIVATE_SONG|0','PRIVATE_MISSING'],{signal,isActive:()=>true});
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{total:124,audio:20,workbooks:100,other:2,unclassified:2,bytes:269,matchedRecordings:1});
 assert.deepEqual(db.ops,['readonly','cursor']);assert.equal(blobReads,0);assert.equal(JSON.stringify(before),original);assert(!JSON.stringify(result).includes('PRIVATE_'));f.safe();
 const output=f.c.startupLocalFileText({status:'checked',at:1791300000000,counts:bounded.counts({}),backupIdPresent:false,ancillary:result});
 assert.match(output,/サイズを確認できた分の合計：269 bytes/);assert.match(output,/一致しないファイルもすべて保持/);assert.doesNotMatch(output,/録音124|音声形式 124/);
});
test('real module to app metadata adapter receives cancellation context and successfully reports retained files',async()=>{
 const f=integration();metadataDB(f,[['PRIVATE_SHOW|PRIVATE_SONG|123',new Blob(['audio'],{type:'audio/mp4'})],['xls:PRIVATE_SONG',new Blob(['book'])]]);
 const selected=file(),before=Buffer.from(await selected.arrayBuffer());f.c.startupSelectLocalFile(selected);f.elements['startup-file-password'].value='PRIVATE_EPHEMERAL';await f.c.startupCheckLocalFile();
 const output=f.elements['startup-file-result'].textContent;assert.match(output,/端末ファイル：2 \/ 音声形式 1 \/ Excelキー 1/);assert.match(output,/同じキー：1/);assert.match(output,/復元はまだしていません/);
 assert.equal(f.elements['startup-file-password'].value,'');assert.equal(f.elements['startup-file-check'].disabled,true);assert.deepEqual(Buffer.from(await selected.arrayBuffer()),before);f.safe();
});
test('missing database stays unknown without opening, upgrading, replacing or deleting original stores',async()=>{
 const f=integration(),signal=new AbortController().signal;await assert.rejects(f.c.startupLocalClipMetadata([],{signal,isActive:()=>true}),/storage-read/);
 f.c.startupSelectLocalFile(file());await f.c.startupCheckLocalFile();assert.match(f.elements['startup-file-result'].textContent,/端末ファイル：未確認/);f.safe();
});
test('metadata cancellation aborts its readonly transaction and never writes any original resource',async()=>{
 const f=integration(),controller=new AbortController(),db=metadataDB(f,[['PRIVATE_AUDIO',new Blob(['audio'],{type:'audio/mp4'})]],{delay:true});
 const pending=f.c.startupLocalClipMetadata(['PRIVATE_AUDIO'],{signal:controller.signal,isActive:()=>!controller.signal.aborted});controller.abort();await assert.rejects(pending,/storage-read/);
 assert.equal(db.aborted(),true);assert.deepEqual(db.ops,['readonly','cursor','abort']);f.safe();
});
test('FileReader integration abort is classified as cancelled and cannot emit stale counts',async()=>{
 let reader;class PendingReader{constructor(){reader=this;}readAsArrayBuffer(){}abort(){this.onabort?.();}}
 const f=integration();f.c.FileReader=PendingReader;f.c.startupSelectLocalFile(file());f.elements['startup-file-password'].value='PRIVATE_KEY';const pending=f.c.startupCheckLocalFile();await flush();
 assert(reader);f.c.startupCancelLocalFileInspection();await pending;assert.match(f.elements['startup-file-result'].textContent,/中止/);assert.doesNotMatch(f.elements['startup-file-result'].textContent,/公演/);
 assert.equal(f.elements['startup-file-password'].value,'');assert.equal(f.elements['startup-file-input'].value,'');f.safe();
});
test('FileReader error is fixed file-read-failed without leaking browser error text',async()=>{
 class ErrorReader{readAsArrayBuffer(){queueMicrotask(()=>this.onerror?.({message:'PRIVATE_BROWSER_ERROR'}));}abort(){this.onabort?.();}}
 const f=integration();f.c.FileReader=ErrorReader;f.c.startupSelectLocalFile(file());await f.c.startupCheckLocalFile();assert.match(f.elements['startup-file-result'].textContent,/読み取れません/);f.safe();
});
test('read adapter unregisters the abort listener for normal, error, abort and synchronous read failure',async()=>{
 for(const mode of ['load','error','abort','throw']){const f=integration();let adds=0,removes=0,abort;const signal={aborted:false,addEventListener:(type,fn)=>{adds++;abort=fn;},removeEventListener:()=>removes++};
  class Reader{readAsArrayBuffer(){if(mode==='throw')throw Error('PRIVATE_SYNC');queueMicrotask(()=>{if(mode==='load'){this.result=new ArrayBuffer(1);this.onload?.();}else if(mode==='error')this.onerror?.();else abort();});}abort(){this.onabort?.();}}
  f.c.FileReader=Reader;const pending=f.c.startupReadLocalFile({size:1},signal);if(mode==='load')await pending;else await assert.rejects(pending);
  assert.equal(adds,1,mode);assert.equal(removes,1,mode);f.safe();}
});
test('new file selection and new password survive the completion of an old cancelled check',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const f=integration({decodeBackup:async()=>{await gate;return packet();}});
 f.c.startupSelectLocalFile(file());f.elements['startup-file-password'].value='PRIVATE_OLD_KEY';const pending=f.c.startupCheckLocalFile();await flush();
 f.c.startupSelectLocalFile(file({at:1791400000000}));f.elements['startup-file-password'].value='PRIVATE_NEW_KEY';release();await pending;
 assert.equal(f.elements['startup-file-password'].value,'PRIVATE_NEW_KEY');assert.match(f.elements['startup-file-result'].textContent,/選択/);f.safe();
});
test('serial busy guard preserves a newly entered password until the cancelled earlier check has drained',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);let decoded=0;const f=integration({decodeBackup:async()=>{decoded++;await gate;return packet();}});
 f.c.startupSelectLocalFile(file());f.elements['startup-file-password'].value='PRIVATE_OLD_KEY';const pending=f.c.startupCheckLocalFile();await flush();
 f.c.startupSelectLocalFile(file({at:1791400000000}));f.elements['startup-file-password'].value='PRIVATE_NEW_KEY';await f.c.startupCheckLocalFile();
 assert.equal(f.elements['startup-file-password'].value,'PRIVATE_NEW_KEY');assert.equal(decoded,1);release();await pending;
 await f.c.startupCheckLocalFile();assert.equal(decoded,2);assert.equal(f.elements['startup-file-password'].value,'');f.safe();
});
test('hidden/pagehide cleanup drops local selection, clears inputs, and keeps late checks inert',async()=>{
 for(const mode of ['visibilitychange','pagehide']){const f=integration();f.c.startupSelectLocalFile(file());f.elements['startup-file-password'].value='PRIVATE_KEY';
  if(mode==='visibilitychange'){f.c.document.hidden=true;f.listeners.document.visibilitychange();}else f.listeners.window.pagehide();
  assert.equal(f.elements['startup-file-password'].value,'');assert.equal(f.elements['startup-file-input'].value,'');assert.equal(f.elements['startup-file-check'].disabled,true);
  f.c.document.hidden=false;await f.c.startupCheckLocalFile();assert.equal(f.readers.length,0);f.safe();}
});
test('blocked/hidden and missing module guards cannot trigger reads or persistent app changes',async()=>{
 const f=integration();f.c.startupPhase='ready';f.c.startupSelectLocalFile(file());await f.c.startupCheckLocalFile();assert.equal(f.created(),0);
 f.c.startupPhase='blocked';f.c.document.hidden=true;await f.c.startupCheckLocalFile();assert.equal(f.created(),0);
 f.c.document.hidden=false;f.c.StartupFileInspection=undefined;f.c.startupSelectLocalFile(file());assert.equal(f.created(),0);assert.match(f.elements['startup-file-result'].textContent,/読み込めません/);f.safe();
});
function handlers(){
 const captured={},calls=[],panel={id:'startup-protection'},controls={};
 for(const id of ['input','password','label','check','cancel'])controls[id]={id:'startup-file-'+id,disabled:false,files:[{size:123}],closest:selector=>selector==='#startup-protection'?panel:null};
 const c=vm.createContext({startupPhase:'blocked',recordingInboxCanWrite:()=>false,document:{addEventListener:(type,fn)=>captured[type]=fn},
  startupFileIMEActive:()=>false,startupSelectLocalFile:value=>calls.push(['select',value.size]),startupCheckLocalFile:()=>calls.push(['check']),startupCancelLocalFileInspection:()=>calls.push(['cancel']),startupInspectBackups:()=>calls.push(['backup'])});
 vm.runInContext(block("for (const type of ['click','input','change','keydown','submit','pointerdown','drop'])",'recordingInboxOwnerUI();'),c);
 const event=(kind,extra={})=>{const actions=[],control=controls[kind],target={closest:selector=>control&&selector.includes('#'+control.id)?control:selector==='#startup-protection'?panel:null};
  return{actions,value:{target,...extra,stopImmediatePropagation:()=>actions.push('stop'),preventDefault:()=>actions.push('prevent')}};};
 return{c,captured,calls,controls,event};
}
test('password input and dedicated label retain native click/focus while stopping downstream editor events',()=>{
 const f=handlers();for(const kind of ['password','label'])for(const type of ['click','pointerdown']){const e=f.event(kind);f.captured[type](e.value);assert.deepEqual(e.actions,['stop'],kind+' '+type);}
 assert.deepEqual(f.calls,[]);
});
test('file picker click remains native, selection is isolated, and check/cancel clicks stay explicit',()=>{
 const f=handlers(),click=f.event('input');f.captured.click(click.value);assert.deepEqual(click.actions,['stop']);assert.deepEqual(f.calls,[['cancel']]);
 const change=f.event('input');f.captured.change(change.value);assert.deepEqual(change.actions,['stop','prevent']);assert.deepEqual(f.calls,[['cancel'],['select',123]]);
 const check=f.event('check');f.captured.click(check.value);assert.deepEqual(check.actions,['stop','prevent']);assert.deepEqual(f.calls.at(-1),['check']);
 f.controls.check.disabled=true;f.captured.click(f.event('check').value);assert.equal(f.calls.filter(x=>x[0]==='check').length,1);
 f.captured.click(f.event('cancel').value);assert.deepEqual(f.calls.at(-1),['cancel']);
});
test('password editing and IME are isolated, Enter triggers only explicit local check, and submit/drop stay blocked',()=>{
 const f=handlers();for(const [type,extra] of [['input',{}],['change',{}],['keydown',{key:'a'}],['keydown',{key:'Backspace'}],['keydown',{key:'v',ctrlKey:true}],['keydown',{key:'Enter',isComposing:true}]]){
  const e=f.event('password',extra);f.captured[type](e.value);assert.deepEqual(e.actions,['stop']);}
 const enter=f.event('password',{key:'Enter',isComposing:false});f.captured.keydown(enter.value);assert.deepEqual(enter.actions,['stop','prevent']);assert.deepEqual(f.calls,[['check']]);
 for(const type of ['submit','drop']){const e=f.event('password');f.captured[type](e.value);assert.deepEqual(e.actions,['stop','prevent']);}assert.deepEqual(f.calls,[['check']]);
});
test('keyboard Tab can move among dedicated local controls while editor listeners remain stopped',()=>{
 const f=handlers();for(const kind of ['input','password','label','check','cancel']){const e=f.event(kind,{key:'Tab'});f.captured.keydown(e.value);assert.deepEqual(e.actions,['stop'],kind);}
 assert.deepEqual(f.calls,[]);
});
test('dedicated controls cannot escape their protection panel or run outside blocked phase',()=>{
 const f=handlers();f.controls.password.closest=()=>null;const outside=f.event('password');f.captured.input(outside.value);assert.deepEqual(outside.actions,['prevent','stop']);
 for(const phase of ['ready','loading']){f.c.startupPhase=phase;for(const type of Object.keys(f.captured)){const e=f.event('input');f.captured[type](e.value);assert.deepEqual(e.actions,['prevent','stop']);}}
 assert.deepEqual(f.calls,[]);
});
test('file/password controls and script cache wiring are minimal and do not advertise restoration guarantees',()=>{
 const passwordMarkup=source.match(/<input id="startup-file-password"[^>]*>/)?.[0]||'';
 assert.match(passwordMarkup,/type="password"/);assert.match(passwordMarkup,/maxlength="4096"/);assert.match(passwordMarkup,/autocomplete="off"/);
 assert.match(passwordMarkup,/inputmode="text"/);assert.match(passwordMarkup,/lang="ja"/);
 assert.match(source,/id="startup-file-label"[^>]*for="startup-file-password"|for="startup-file-password"[^>]*id="startup-file-label"/);
 const local=block('let startupFileComposing=false;','function startupSafeError(');assert.doesNotMatch(local,/\b(?:fetch|save|idbPut|putClip|delClip|restoreBackupFile|backupDigest)\s*\(/);
 assert.doesNotMatch(local,/復元可能|完全復旧|復元を完了/);
 const html=fs.readFileSync(__dirname+'/../index.html','utf8'),sw=fs.readFileSync(__dirname+'/../sw.js','utf8');
 assert(html.indexOf('startup-file-inspection.js')<html.indexOf('<script src="app.js'));
 assert.match(html,/startup-file-inspection\.js\?v=16\.41\.49/);assert.match(sw,/"\.\/startup-file-inspection\.js"/);assert.match(sw,/if \(url\.origin !== self\.location\.origin\) return;/);
});

