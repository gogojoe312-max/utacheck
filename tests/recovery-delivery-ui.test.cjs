'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createHash}=require('node:crypto');
const Scope=require('../recovery-delivery-scope.js'),Store=require('../recovery-delivery-store.js'),{indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const app=fs.readFileSync(__dirname+'/../app.js','utf8'),code=fs.readFileSync(__dirname+'/../recovery-delivery.js','utf8');
const sha=s=>createHash('sha256').update(s).digest('hex'),clone=x=>JSON.parse(JSON.stringify(x));
const fn=name=>{const i=app.indexOf('function '+name+'(');return app.slice(i,app.indexOf('\n}',i)+2);};
async function fixture(options={}){
 const writes=[],calls=[],alerts=[],handlers={},elements=new Map();
 function el(id=''){return {id,value:'',checked:false,disabled:false,inert:false,innerHTML:'',textContent:'',files:[],dataset:{},remove(){this.removed=true;},querySelector(sel){if(!this.children)this.children=new Map();if(!this.children.has(sel))this.children.set(sel,el(sel.slice(1)));return this.children.get(sel);},querySelectorAll(){return this.children?[...this.children.values()]:[];}};}
 const document={hidden:false,body:{appendChild(node){elements.set('modal',node);}},createElement:()=>el(),getElementById:id=>{if(!elements.has(id))elements.set(id,el(id));return elements.get(id);},addEventListener:(event,handler)=>{(handlers[event]||=[]).push(handler);}};
 const sourceHash='a'.repeat(64),gistId='b'.repeat(32),src='https://gist.githubusercontent.com/synthetic/'+gistId+'/raw/utacheck.json';
 const state={groups:[{id:'g',name:'Synthetic Group',nopub:true}],members:[{id:'m',name:'Member'}],
 shows:[{id:'show',name:'Performance',groupId:'g',nopub:true,recoveredSourceShowId:'show'}],
 songs:[{id:'song',title:'Song',showId:'show',groupId:'g',roster:['m'],lines:[{t:'Lyric',raw:'Member',label:'Member',parts:['m']}],blocks:{A:['m']}}],
 notes:[{id:'n',songId:'song',showId:'show',lineIdx:0,memberIds:['m'],tags:['fast'],memo:'Correction'}],pubNotes:[],
 rsongs:[{id:'recording',lines:[]}],plan:{slots:[{id:'slot'}]},staffMemos:{'show|song':'PRIVATE'},recs:{},draws:{},trash:[],
 memos:{'show|song':'Summary'},gsubs:{},subs:{},rosters:{'Synthetic Group':['Member']},folderOrder:['PRIVATE_OTHER_FOLDER'],
 ghToken:'',autoPub:false,deviceId:'device',showId:'show',groupId:'g',recoveredShowSources:{[sourceHash]:{source:{sha256:sourceHash},focusGroupId:'g'}}};
 const hold={v:1,seq:1,slot:1,copyKey:'preserved:recovery:v1:'+sha('old'),sourceKind:'cloud-publication'};
 const initial=JSON.stringify(state),idb=indexedFixture({state:{'state:0':{seq:2,at:1,txt:initial},'state:1':{seq:1,at:1,txt:initial},'recovery:network-hold:v1':hold},clips:{'xls:song':new Blob(['ORIGINAL'])}});
 let remoteRaw='',patches=0;
 const c=vm.createContext({S:clone(state),U:{sheet:null},DB:idb.database,KEY:'utacheck.v1',stateRevision:0,saveSeq:2,saveDirty:false,savePend:null,saveErr:false,
 startupPhase:'ready',startupRecoveryNetworkHold:true,recordingInboxCanWrite:()=>true,recordingInboxAdmitWriter:()=>()=>{},VIEW:()=>false,preview:null,document,publishInFlight:false,saving:false,REC:null,
 RecoveryDeliveryScope:Scope,RecoveryDeliveryStore:options.store||Store,TextEncoder,URL,AbortController,setTimeout,clearTimeout,Map,
 h:s=>String(s??''),alert:s=>alerts.push(s),render(){},sheetHasInput:()=>false,recoveryValidateCloudState:()=>true,packState:clone,
 localStorage:{getItem:()=>null},backupDigest:async s=>{await options.digest?.(s,c);return sha(s);},
 idbGet:async k=>idb.record(k),idbPut:async(k,v)=>{writes.push(k);idb.replace(k,v);},
 save(){c.stateRevision++;c.saveDirty=true;},async saveNow(){if(c.saveDirty){await options.persist?.(c);c.saveSeq++;idb.replace('state:'+(c.saveSeq%2),{seq:c.saveSeq,at:1,txt:JSON.stringify(c.S)});c.saveDirty=false;}},
 async doPush(){calls.push({action:'doPush'});},
 fetch:async(url,opts)=>{const method=opts.method||'GET';calls.push({url,method,token:opts.headers.Authorization});await options.network?.(url,opts,c);
  if(method==='PATCH'){patches++;remoteRaw=JSON.parse(opts.body).files['utacheck.json'].content;if(options.unknownPatch)throw Error('UNKNOWN_RESPONSE');}
  const content=JSON.stringify({id:gistId,public:false,files:{'utacheck.json':{content:remoteRaw,raw_url:src,truncated:false}}});
  return {ok:true,status:200,text:async()=>content};}
 });
 c.group=id=>c.S.groups.find(g=>g.id===(id||c.S.groupId));c.member=id=>c.S.members.find(m=>m.id===id);c.showsNewestFirst=()=>c.S.shows;
 vm.runInContext(app.slice(app.indexOf('function autoShowGroupId('),app.indexOf('function showsFor()')),c);
 vm.runInContext(app.slice(app.indexOf('function publicationData('),app.indexOf('async function gh(')),c);vm.runInContext(fn('payloadKey'),c);vm.runInContext(fn('gistRawSource'),c);
 const orig=c.S;c.S=clone(orig);c.S.groups[0].nopub=false;c.S.groups[0].gistId=gistId;c.S.groups[0].src=src;c.S.shows[0].nopub=false;
 const remote=clone(c.publicationData('g'));delete remote.shows[0].recoveredSourceShowId;remote.folderOrder=[];remoteRaw=JSON.stringify(remote);c.S=orig;
 const packet={app:'utacheck-existing-delivery',version:2,targets:[{sourceSha256:sourceHash,expectedRemoteSha256:sha(remoteRaw),groupName:'Synthetic Group',gistId,src,sourceShowIds:['show']}]};
 vm.runInContext(code,c);
 const click=action=>{const e={target:{closest:()=>({dataset:{act:action}})},preventDefault(){},stopImmediatePropagation(){}};for(const handler of handlers.click)handler(e);};
 const modal=()=>elements.get('modal');
 const until=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>setImmediate(r));}throw Error('UI did not settle: '+modal()?.querySelector('#rd-status').textContent);};
 const check=async()=>{click('rd-open');modal().querySelector('#rd-file').files=[{size:JSON.stringify(packet).length,text:async()=>JSON.stringify(packet)}];modal().querySelector('#rd-token').value='SYNTHETIC_EXISTING_TOKEN';click('rd-check');await until(()=>!modal().querySelector('#rd-check').disabled);await until(()=>{const text=modal().querySelector('#rd-status').textContent;return !!text&&!text.includes('読み取っています');});};
 return {c,idb,initial,hold,packet,calls,writes,alerts,handlers,click,modal,until,check,patches:()=>patches,setRemote:raw=>remoteRaw=raw,remote:()=>remoteRaw};
}
test('preflight reads only, token stays outside saved state until explicit acceptance',async()=>{
 const f=await fixture();const before=f.idb.snapshot();await f.check();assert.match(f.modal().querySelector('#rd-status').textContent,/まだ送信・保存/);
 assert.equal(JSON.stringify(f.c.S),f.initial);assert.deepEqual(f.idb.snapshot(),before);assert.equal(f.patches(),0);assert.equal(f.modal().querySelector('#rd-token').value,'');
 f.click('rd-commit');await new Promise(r=>setImmediate(r));assert.equal(f.patches(),0);assert.equal(f.c.S.ghToken,'');f.click('rd-close');assert.equal(f.c.S.ghToken,'');assert.equal(f.c.document.getElementById('app').inert,false);
});
test('explicit commit archives originals, keeps global hold and REC/private state, and only enables bound existing destination',async()=>{
 const f=await fixture();await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='doPush'));
 assert.equal(f.c.S.ghToken,'SYNTHETIC_EXISTING_TOKEN');assert.equal(f.c.S.groups[0].nopub,false);assert.equal(f.c.S.shows[0].nopub,false);assert(f.c.RecoveryDelivery.canPublish('g'));assert(!f.c.RecoveryDelivery.canPublish('foreign'));
 assert.deepEqual(f.idb.record('recovery:network-hold:v1'),f.hold);assert.deepEqual(clone(f.c.S.rsongs),JSON.parse(f.initial).rsongs);assert.equal(f.c.S.staffMemos['show|song'],'PRIVATE');
 assert(f.idb.snapshot().state.some(([key,value])=>key.includes('editor:')&&value===f.initial));assert.equal(f.patches(),0);
 assert.equal(await f.c.RecoveryDelivery.push('g',true),'sent');assert.equal(f.patches(),1);const pub=JSON.parse(f.remote());assert(!JSON.stringify(pub).includes('PRIVATE'));assert(!JSON.stringify(pub).includes('recording'));
});
test('changing remote after preview stops before local commit or publication',async()=>{
 const f=await fixture();await f.check();const before=f.idb.snapshot();f.setRemote(f.remote()+' ');f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>/上書きせず停止/.test(f.modal().querySelector('#rd-status').textContent));
 assert.equal(JSON.stringify(f.c.S),f.initial);assert.deepEqual(f.idb.snapshot(),before);assert.equal(f.patches(),0);
});
test('editing the chosen input invalidates preview and prevents old-target commit',async()=>{
 const f=await fixture();await f.check();f.modal().querySelector('#rd-token').value='CHANGED';for(const handler of f.handlers.input)handler({target:{id:'rd-token'}});
 f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await new Promise(r=>setImmediate(r));assert.equal(f.c.S.ghToken,'');assert.equal(f.patches(),0);assert.equal(f.modal().querySelector('#rd-preview').innerHTML,'');f.click('rd-close');
});
test('a missing preservation verification blocks adoption and sending',async()=>{
 const f=await fixture({store:{commit:async()=>({status:'unverified',committed:true})}});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.c.startupPhase==='blocked');
 assert.equal(f.patches(),0);assert.equal(f.c.S.ghToken,'');assert.equal(f.c.document.getElementById('app').inert,true);
});
test('unknown PATCH outcome disables retries until read-only reconciliation',async()=>{
 const f=await fixture({unknownPatch:true});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='doPush'));
 await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true),/送信結果/);assert.equal(f.patches(),1);assert.equal(f.c.S.recoveryDelivery.targets[0].status,'uncertain');
 assert.equal(await f.c.RecoveryDelivery.push('g',true),false);assert.equal(f.patches(),1);await f.c.RecoveryDelivery.reconcile();assert.equal(f.patches(),1);assert.equal(f.c.S.recoveryDelivery.targets[0].status,'ready');
});
test('opt-out during final digest prevents stale payload PATCH',async()=>{
 let mutate=false;const f=await fixture({digest:async(raw,c)=>{if(mutate&&raw.includes('"groupName":"Synthetic Group"')){c.S.shows[0].nopub=true;mutate=false;}}});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='doPush'));
 mutate=true;await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true));assert.equal(f.patches(),0);
});

test('final save failure retains pending ledger so reconciliation never repeats a successful PATCH',async()=>{
 let count=0;const f=await fixture({persist:async()=>{if(++count===3)throw Error('storage failure');}});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='doPush'));
 await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true),/送信結果/);const b=f.c.S.recoveryDelivery.targets[0];assert.equal(b.status,'uncertain');assert(b.pendingDigest);assert(b.pendingKey);assert.equal(f.patches(),1);
 await f.c.RecoveryDelivery.reconcile();assert.equal(b.status,'ready');assert.equal(f.patches(),1);assert(!f.c.RecoveryDelivery.pending('g'));
});
test('reconciliation save failure restores uncertain in-memory ledger and does not claim success',async()=>{
 let failSave=false;const f=await fixture({unknownPatch:true,persist:async()=>{if(failSave)throw Error('storage failure');}});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='doPush'));
 await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true));const before=clone(f.c.S.recoveryDelivery.targets[0]);failSave=true;await f.c.RecoveryDelivery.reconcile();assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0]),before);assert.equal(f.patches(),1);assert(!f.alerts.at(-1).includes('結果を確認しました'));
});

test('other publishers must be explicitly stopped before commit',async()=>{
 const f=await fixture();await f.check();f.modal().querySelector('#rd-approve').checked=true;f.click('rd-commit');await new Promise(r=>setImmediate(r));assert.equal(f.c.S.ghToken,'');assert.equal(f.patches(),0);assert(!f.calls.some(x=>x.action==='doPush'));
});

test('unexpected remote change blocks automatic retries without PATCH',async()=>{
 const f=await fixture();await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='doPush'));
 const old=f.remote();f.setRemote(old+' ');await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true),/上書き/);assert.equal(f.c.S.recoveryDelivery.targets[0].status,'blocked');const requests=f.calls.length;assert.equal(await f.c.RecoveryDelivery.push('g',true),false);assert.equal(f.calls.length,requests);assert.equal(f.patches(),0);
 f.setRemote(old);await f.c.RecoveryDelivery.reconcile();assert.equal(f.c.S.recoveryDelivery.targets[0].status,'ready');assert.equal(f.patches(),0);
});

test('an unverified committed transaction stores prepared targets, so reload cannot auto-publish',async()=>{
 let saved;const f=await fixture({store:{commit:async options=>{saved=JSON.parse(options.nextStateRaw);return {status:'unverified',committed:true};}}});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.c.startupPhase==='blocked');
 assert.equal(saved.recoveryDelivery.targets[0].status,'prepared');f.c.S=saved;f.c.startupPhase='ready';assert.equal(f.c.RecoveryDelivery.canPublish('g'),false);assert.equal(f.patches(),0);
});

test('superseded two-group packet stops before remote reads and token storage',async()=>{
 const f=await fixture();f.packet.version=1;await f.check();assert.match(f.modal().querySelector('#rd-status').textContent,/旧版/);assert.equal(f.calls.length,0);assert.equal(f.c.S.ghToken,'');assert.equal(f.patches(),0);
});
test('missing recovered receipt is distinct from token errors and only exposes the target ordinal',async()=>{
 const f=await fixture();f.c.S.recoveredShowSources={};await f.check();const text=f.modal().querySelector('#rd-status').textContent;
 assert.match(text,/公演の対応確認.*接続対象1.*救出情報/);assert(!text.includes('SYNTHETIC_EXISTING_TOKEN'));assert(!text.includes(f.packet.targets[0].sourceSha256));assert.equal(f.calls.length,0);assert.equal(f.c.S.ghToken,'');
});
test('legacy saved bindings cannot resume or reconcile a superseded target',async()=>{
 const f=await fixture();await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='doPush'));
 f.c.S.recoveryDelivery.version=1;const before=f.calls.length;assert.equal(f.c.RecoveryDelivery.canPublish('g'),false);assert.equal(f.c.RecoveryDelivery.hasResumed(),false);assert.equal(await f.c.RecoveryDelivery.push('g',true),false);await f.c.RecoveryDelivery.reconcile();assert.equal(f.calls.length,before);assert.equal(f.patches(),0);assert.match(f.c.RecoveryDelivery.settingsHTML(),/接続ファイルの更新が必要/);
});

test('verified matching baseline resumes new live notes through the actual transport ledger',async()=>{
 const f=await fixture();await f.check();assert.match(f.modal().querySelector('#rd-preview').innerHTML,/新しい指摘/);
 f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='doPush'));
 assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0].preservedShowIds),[]);assert.equal(await f.c.RecoveryDelivery.push('g',true),'sent');
 f.c.S.notes.push({id:'new-live-note',songId:'song',showId:'show',lineIdx:0,memberIds:['m'],tags:['fast'],memo:'New live correction'});f.c.save();await f.c.saveNow();
 assert(f.c.RecoveryDelivery.pending('g'));assert.equal(await f.c.RecoveryDelivery.push('g',false),'sent');
 const output=JSON.parse(f.remote());assert.equal(output.notes.length,2);assert(output.notes.some(n=>n.memo==='New live correction'));assert.equal(f.patches(),2);assert(!f.c.RecoveryDelivery.pending('g'));
});
test('a different remote edit blocks a new local note without dropping either side',async()=>{
 const f=await fixture();await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='doPush'));await f.c.RecoveryDelivery.push('g',true);
 f.c.S.notes.push({id:'local-only-note',songId:'song',showId:'show',lineIdx:0,memberIds:['m'],tags:['fast'],memo:'Keep local edit'});f.c.save();await f.c.saveNow();
 const remote=JSON.parse(f.remote());remote.notes[0].memo='Keep other editor change';f.setRemote(JSON.stringify(remote));await assert.rejects(()=>f.c.RecoveryDelivery.push('g',false),/新しい変更/);
 assert.equal(f.patches(),1);assert(f.c.S.notes.some(n=>n.memo==='Keep local edit'));assert.equal(JSON.parse(f.remote()).notes[0].memo,'Keep other editor change');assert.equal(f.c.S.recoveryDelivery.targets[0].status,'blocked');
});

test('reconnection dialog keeps its bottom controls clear of the fixed recovery banner and restores it on close',async()=>{
 const f=await fixture();const notice=f.c.document.getElementById('recovery-network-notice');notice.hidden=false;f.click('rd-open');assert.equal(notice.hidden,true);f.click('rd-close');assert.equal(notice.hidden,false);
 notice.hidden=true;f.click('rd-open');f.click('rd-close');assert.equal(notice.hidden,true);
});

function enablePreviewBinding(f){
 const t=f.packet.targets[0],g=f.c.S.groups[0];Object.assign(g,{src:t.src,gistId:t.gistId,nopub:false});
 f.c.S.recoveryDelivery={version:2,targets:[{...clone(t),groupId:g.id,status:'ready'}]};
 return t.src;
}
test('reconnected member preview reads exact approved raw source without tokens or writes',async()=>{
 const f=await fixture(),src=enablePreviewBinding(f);f.c.S.ghToken='SYNTHETIC_STORED_TOKEN';const before=JSON.stringify(f.c.S),db=f.idb.snapshot();let request;
 f.c.fetch=async(url,opts)=>{request={url,opts};return {ok:true,text:async()=>f.remote()};};
 const d=await f.c.RecoveryDelivery.readPreview(src);
 assert.equal(d.songs.length,1);assert.equal(request.url,src);assert.equal(request.opts.method,'GET');
 assert.equal(request.opts.credentials,'omit');assert.equal(request.opts.redirect,'error');assert.equal(request.opts.headers.Authorization,undefined);
 assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.c.startupRecoveryNetworkHold,true);assert.equal(f.patches(),0);
});
test('preview rejects unbound, ambiguous, stale, and changed bindings without widening recovery transport',async()=>{
 for(const kind of ['wrong-source','missing','pending','duplicate','mismatch','legacy']){
  const f=await fixture(),src=enablePreviewBinding(f);let n=0;f.c.fetch=async()=>{n++;throw Error('must not fetch');};
  let input=src;if(kind==='wrong-source')input+='?x=1';if(kind==='missing')f.c.S.recoveryDelivery.targets=[];
  if(kind==='pending')f.c.S.recoveryDelivery.targets[0].status='sending';
  if(kind==='duplicate')f.c.S.recoveryDelivery.targets.push(clone(f.c.S.recoveryDelivery.targets[0]));
  if(kind==='mismatch')f.c.S.groups[0].gistId='c'.repeat(32);
  if(kind==='legacy')f.c.S.recoveryDelivery.version=1;
  await assert.rejects(f.c.RecoveryDelivery.readPreview(input));assert.equal(n,0);assert.equal(f.patches(),0);
 }
 const f=await fixture(),src=enablePreviewBinding(f);f.c.fetch=async()=>{f.c.S.notes[0].memo='new edit';return {ok:true,text:async()=>f.remote()};};
 await assert.rejects(f.c.RecoveryDelivery.readPreview(src),e=>e.reconnectCode==='local-changed');assert.equal(f.c.S.notes[0].memo,'new edit');
});
test('whole member preview keeps editor data and restores it exactly on exit under recovery hold',async()=>{
 const f=await fixture(),src=enablePreviewBinding(f),before=JSON.stringify(f.c.S),db=f.idb.snapshot();
 Object.assign(f.c,{previewLoading:false,recordingStartPending:false,recordingFinalizePending:false,pitchStartPending:false,PT:{on:false},micStream:null,enterRecordingInboxEditor:()=>()=>{},uid:()=> 'preview-id',syncErr:'',
  fetchSetlist:async()=>{throw Error('held receiver must not be used');},applySetlist:d=>{f.c.S.songs=clone(d.songs);f.c.S.shows=clone(d.shows);}});
 f.c.fetch=async()=>({ok:true,text:async()=>f.remote()});
 vm.runInContext('async '+fn('startPreview'),f.c);vm.runInContext(fn('endPreview'),f.c);
 await f.c.startPreview(src,'');assert.equal(f.c.S.viewer,true);assert.equal(f.c.S.songs.length,1);assert.equal(f.c.startupRecoveryNetworkHold,true);
 f.c.endPreview();assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);
});

test('preview rejects recording, pending microphone starts and navigation during its read',async()=>{
 for(const field of ['REC','recordingStartPending','recordingFinalizePending','pitchStartPending','PT','micStream']){
  const f=await fixture(),src=enablePreviewBinding(f);let calls=0;
  const activity=()=>{f.c[field]=field==='REC'?{state:'recording'}:field==='PT'?{on:true}:true;};
  f.c.fetch=async()=>{calls++;return {ok:true,text:async()=>f.remote()};};activity();
  await assert.rejects(f.c.RecoveryDelivery.readPreview(src));assert.equal(calls,0);
 }
 for(const change of [c=>c.REC={state:'recording'},c=>c.U.view='live',c=>c.recordingStartPending=true,c=>c.recordingFinalizePending=true]){
  const f=await fixture(),src=enablePreviewBinding(f),before=JSON.stringify(f.c.S);
  f.c.fetch=async()=>{change(f.c);return {ok:true,text:async()=>f.remote()};};
  await assert.rejects(f.c.RecoveryDelivery.readPreview(src),e=>e.reconnectCode==='local-changed');
  assert.equal(JSON.stringify(f.c.S),before);assert.equal(f.patches(),0);
 }
});
