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
 const c=require('./inbox-test-context.cjs')({S:clone(state),U:{sheet:null},DB:idb.database,KEY:'utacheck.v1',stateRevision:0,saveSeq:2,saveDirty:false,savePend:null,saveErr:false,
 startupPhase:'ready',startupRecoveryNetworkHold:true,recordingInboxCanWrite:()=>true,recordingInboxAdmitWriter:()=>()=>{},VIEW:()=>false,preview:null,document,publishInFlight:false,saving:false,REC:null,
 RecoveryDeliveryScope:Scope,RecoveryDeliveryStore:options.store||Store,TextEncoder,URL,AbortController,setTimeout,clearTimeout,Map,
 h:s=>String(s??''),alert:s=>alerts.push(s),render(){},sheetHasInput:()=>false,recoveryValidateCloudState:()=>true,packState:clone,
 localStorage:{getItem:()=>null},backupDigest:async s=>{await options.digest?.(s,c);return sha(s);},
 idbGet:async k=>idb.record(k),idbPut:async(k,v)=>{writes.push(k);idb.replace(k,v);},
 save(){c.stateRevision++;c.saveDirty=true;},async saveNow(){if(c.saveDirty){await options.persist?.(c);c.saveSeq++;idb.replace('state:'+(c.saveSeq%2),{seq:c.saveSeq,at:1,txt:JSON.stringify(c.S)});c.saveDirty=false;}},
 async pushOne(groupId){calls.push({action:'pushOne',groupId});await options.afterCommitPush?.(groupId,c);},
 fetch:async(url,opts)=>{const method=opts.method||'GET';calls.push({url,method,token:opts.headers.Authorization});await options.network?.(url,opts,c);
  if(method==='PATCH'){patches++;remoteRaw=JSON.parse(opts.body).files['utacheck.json'].content;if(options.unknownPatch)throw Error('UNKNOWN_RESPONSE');}
  const content=JSON.stringify({id:gistId,public:false,files:{'utacheck.json':{content:remoteRaw,raw_url:src,truncated:false}}});
  return {ok:true,status:200,text:async()=>content};}
 });
 c.group=id=>c.S.groups.find(g=>g.id===(id||c.S.groupId));c.member=id=>c.S.members.find(m=>m.id===id);c.showsNewestFirst=()=>c.S.shows;
 vm.runInContext(app.slice(app.indexOf('function autoShowGroupId('),app.indexOf('function showsFor()')),c);
 vm.runInContext(app.slice(app.indexOf('function publicationData('),app.indexOf('async function gh(')),c);vm.runInContext(fn('payloadKey'),c);vm.runInContext(fn('gistRawSource'),c);
 vm.runInContext(app.match(/^const NAMESEP = .*;$/m)[0]+'\n'+app.match(/^const hash32 = .*;$/m)[0]+'\n'+['stripParens','splitNames','songSig','buildSong'].map(fn).join('\n'),c);
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
test('reconnection preflight includes new owner shows while its recovered-source receipt stays bounded',async()=>{
 const f=await fixture();
 for(let i=1;i<=3;i++){
  f.c.S.shows.push({id:'new-reny-'+i,name:'New owner performance '+i,groupId:'g',from:i===1?'show':'new-reny-'+(i-1)});
  f.c.S.songs.push({...clone(f.c.S.songs[0]),id:'new-song-'+i,showId:'new-reny-'+i});
  f.c.S.notes.push({...clone(f.c.S.notes[0]),id:'new-note-'+i,songId:'new-song-'+i,showId:'new-reny-'+i});
 }
 f.c.save();await f.c.saveNow();const before=JSON.stringify(f.c.S),db=f.idb.snapshot();
 await f.check();assert.match(f.modal().querySelector('#rd-status').textContent,/まだ送信・保存/);
 assert.match(f.modal().querySelector('#rd-preview').innerHTML,/公演4件・曲4件・指摘4件/);
 assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);
 f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');
 await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
 assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0].sourceShowIds),['show']);
 assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0].showIds),['show']);
 assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0].managedLocalShowIds),['show','new-reny-1','new-reny-2','new-reny-3']);
 assert.deepEqual(f.calls.filter(x=>x.action==='pushOne'),[{action:'pushOne',groupId:'g'}]);
 assert.equal(await f.c.RecoveryDelivery.push('g',true),'sent');assert.equal(JSON.parse(f.remote()).shows.length,4);
});
test('one-group reconnection retains unrelated ready and uncertain bindings without resuming or sending them',async()=>{
 for(const status of ['ready','uncertain','blocked','prepared']){
  const f=await fixture();
  const other={groupId:'other',groupName:'Other group',gistId:'c'.repeat(32),src:'https://gist.githubusercontent.com/other/'+ 'c'.repeat(32)+'/raw/utacheck.json',
    sourceSha256:'d'.repeat(64),expectedRemoteSha256:'e'.repeat(64),sourceShowIds:['other-source'],showIds:['other-show'],status,
    preservedShowIds:['other-held'],heldLocalShowIds:['other-show'],pendingDigest:'f'.repeat(64),pendingKey:'OTHER_PENDING_KEY'};
  f.c.S.groups.push({id:'other',name:'Other group',gistId:other.gistId,src:other.src,nopub:false});
  f.c.S.recoveryDelivery={version:2,targets:[clone(other)]};
  f.c.save();await f.c.saveNow();await f.check();
  f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');
  await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
  assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0]),other);
  assert.equal(f.c.S.recoveryDelivery.targets.length,2);assert.equal(f.c.S.recoveryDelivery.targets[1].groupId,'g');
  assert.equal(f.c.S.recoveryDelivery.targets[1].status,'ready');
  assert.equal(f.c.S.autoPub,false);
  assert.deepEqual(f.calls.filter(x=>x.action==='pushOne'),[{action:'pushOne',groupId:'g'}]);
  assert(f.calls.filter(x=>x.url).every(x=>!x.url.includes(other.gistId)));
  assert.deepEqual(f.idb.record('recovery:network-hold:v1'),f.hold);
  assert.equal(await f.c.RecoveryDelivery.push('g',true),'sent','unrelated incomplete receipts must not block the selected target');
  assert(f.calls.filter(x=>x.url).every(x=>!x.url.includes(other.gistId)));
  assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0]),other);
 }
});
test('post-commit delivery failure does not turn verified local storage into a blocked startup',async()=>{
 const f=await fixture({afterCommitPush:async()=>{throw Error('synthetic queue failure');}});await f.check();
 f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');
 await f.until(()=>f.alerts.length>0);assert.match(f.alerts[0],/再接続設定は保存済み/);
 assert.equal(f.c.startupPhase,'ready');assert.equal(f.c.S.recoveryDelivery.targets[0].status,'ready');
 assert.equal(f.patches(),0);assert.equal(f.c.document.getElementById('app').inert,false);
});
test('reconnection reuses an existing saved token without requiring token entry',async()=>{
 const f=await fixture();f.c.S.ghToken='SYNTHETIC_SAVED_TOKEN';
 f.click('rd-open');f.modal().querySelector('#rd-file').files=[{size:JSON.stringify(f.packet).length,text:async()=>JSON.stringify(f.packet)}];
 f.click('rd-check');await f.until(()=>/まだ送信・保存/.test(f.modal().querySelector('#rd-status').textContent));
 assert(f.calls.every(call=>call.token==='Bearer SYNTHETIC_SAVED_TOKEN'));assert.equal(f.patches(),0);
 assert.equal(f.modal().querySelector('#rd-token').value,'');f.click('rd-close');assert.equal(f.c.S.ghToken,'SYNTHETIC_SAVED_TOKEN');
});
test('explicit commit archives originals, keeps global hold and REC/private state, and only enables bound existing destination',async()=>{
 const f=await fixture();await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
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
 const f=await fixture({unknownPatch:true});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
 await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true),/送信結果/);assert.equal(f.patches(),1);assert.equal(f.c.S.recoveryDelivery.targets[0].status,'uncertain');
 assert.equal(await f.c.RecoveryDelivery.push('g',true),false);assert.equal(f.patches(),1);await f.c.RecoveryDelivery.reconcile();assert.equal(f.patches(),1);assert.equal(f.c.S.recoveryDelivery.targets[0].status,'ready');
});
test('opt-out during final digest prevents stale payload PATCH',async()=>{
 let mutate=false;const f=await fixture({digest:async(raw,c)=>{if(mutate&&raw.includes('"groupName":"Synthetic Group"')){c.S.shows[0].nopub=true;mutate=false;}}});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
 mutate=true;await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true));assert.equal(f.patches(),0);
});

test('final save failure retains pending ledger so reconciliation never repeats a successful PATCH',async()=>{
 let count=0;const f=await fixture({persist:async()=>{if(++count===3)throw Error('storage failure');}});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
 await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true),/送信結果/);const b=f.c.S.recoveryDelivery.targets[0];assert.equal(b.status,'uncertain');assert(b.pendingDigest);assert(b.pendingKey);assert.equal(f.patches(),1);
 await f.c.RecoveryDelivery.reconcile();assert.equal(b.status,'ready');assert.equal(f.patches(),1);assert(!f.c.RecoveryDelivery.pending('g'));
});
test('reconciliation save failure restores uncertain in-memory ledger and does not claim success',async()=>{
 let failSave=false;const f=await fixture({unknownPatch:true,persist:async()=>{if(failSave)throw Error('storage failure');}});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
 await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true));const before=clone(f.c.S.recoveryDelivery.targets[0]);failSave=true;await f.c.RecoveryDelivery.reconcile();assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0]),before);assert.equal(f.patches(),1);assert(!f.alerts.at(-1).includes('結果を確認しました'));
});

test('other publishers must be explicitly stopped before commit',async()=>{
 const f=await fixture();await f.check();f.modal().querySelector('#rd-approve').checked=true;f.click('rd-commit');await new Promise(r=>setImmediate(r));assert.equal(f.c.S.ghToken,'');assert.equal(f.patches(),0);assert(!f.calls.some(x=>x.action==='pushOne'));
});

test('unexpected remote change blocks automatic retries without PATCH',async()=>{
 const f=await fixture();await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
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
 const f=await fixture();await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
 f.c.S.recoveryDelivery.version=1;const before=f.calls.length;assert.equal(f.c.RecoveryDelivery.canPublish('g'),false);assert.equal(f.c.RecoveryDelivery.hasResumed(),false);assert.equal(await f.c.RecoveryDelivery.push('g',true),false);await f.c.RecoveryDelivery.reconcile();assert.equal(f.calls.length,before);assert.equal(f.patches(),0);assert.match(f.c.RecoveryDelivery.settingsHTML(),/接続ファイルの更新が必要/);
});

test('verified matching baseline resumes new live notes through the actual transport ledger',async()=>{
 const f=await fixture();await f.check();assert.match(f.modal().querySelector('#rd-preview').innerHTML,/新しい指摘/);
 f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
 assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0].preservedShowIds),[]);assert.equal(await f.c.RecoveryDelivery.push('g',true),'sent');
 f.c.S.notes.push({id:'new-live-note',songId:'song',showId:'show',lineIdx:0,memberIds:['m'],tags:['fast'],memo:'New live correction'});f.c.save();await f.c.saveNow();
 assert(f.c.RecoveryDelivery.pending('g'));assert.equal(await f.c.RecoveryDelivery.push('g',false),'sent');
 const output=JSON.parse(f.remote());assert.equal(output.notes.length,2);assert(output.notes.some(n=>n.memo==='New live correction'));assert.equal(f.patches(),2);assert(!f.c.RecoveryDelivery.pending('g'));
});
test('a different remote edit blocks a new local note without dropping either side',async()=>{
 const f=await fixture();await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));await f.c.RecoveryDelivery.push('g',true);
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
 for(const kind of ['wrong-source','missing','duplicate','mismatch','legacy']){
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


test('preview resolves a blocked latest-raw redirect through the same Gist without credentials or sends',async()=>{
 const f=await fixture(),src=enablePreviewBinding(f),before=JSON.stringify(f.c.S);const calls=[];
 f.c.fetch=async(url,opts)=>{calls.push({url,opts});if(url===src)throw new TypeError('redirect blocked');return {ok:true,text:async()=>JSON.stringify({id:f.packet.targets[0].gistId,files:{'utacheck.json':{raw_url:src,content:f.remote()}}})};};
 const data=await f.c.RecoveryDelivery.readPreview(src);assert.equal(data.songs.length,1);assert.equal(calls.length,2);
 assert.equal(calls[1].url,'https://api.github.com/gists/'+f.packet.targets[0].gistId);
 for(const c of calls){assert.equal(c.opts.method,'GET');assert.equal(c.opts.redirect,'error');assert.equal(c.opts.headers.Authorization,undefined);}
 assert.equal(JSON.stringify(f.c.S),before);assert.equal(f.patches(),0);
});
test('preview does not retry HTTP denials and rejects a mismatched fallback Gist',async()=>{
 for(const mode of ['denied','mismatch']){const f=await fixture(),src=enablePreviewBinding(f);let calls=0;
 f.c.fetch=async(url)=>{calls++;if(mode==='denied')return {ok:false,status:403};if(url===src)throw new TypeError('redirect');return {ok:true,text:async()=>JSON.stringify({id:'c'.repeat(32),files:{'utacheck.json':{raw_url:src,content:f.remote()}}})};};
 await assert.rejects(f.c.RecoveryDelivery.readPreview(src));assert.equal(calls,mode==='denied'?1:2);assert.equal(f.patches(),0);}
});

test('held or uncertain delivery remains read-only previewable without enabling publication',async()=>{
 for(const status of ['blocked','prepared','sending','uncertain']){
 const f=await fixture(),src=enablePreviewBinding(f);f.c.S.recoveryDelivery.targets[0].status=status;f.c.S.ghToken='SYNTHETIC_STORED_TOKEN';
 const before=JSON.stringify(f.c.S),db=f.idb.snapshot();f.c.fetch=async()=>({ok:true,text:async()=>f.remote()});
 const d=await f.c.RecoveryDelivery.readPreview(src);assert.equal(d.songs.length,1);assert.equal(f.c.RecoveryDelivery.canPublish('g'),false);
 assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);}
});

test('held difference view reads once and shows only public show names, categories and counts',async()=>{
 const f=await fixture(),src=enablePreviewBinding(f);f.c.S.groups[0].nopub=false;f.c.S.shows[0].nopub=false;
 Object.assign(f.c.S.recoveryDelivery.targets[0],{status:'blocked',heldLocalShowIds:['show']});f.c.S.ghToken='SECRET_TOKEN';
 f.c.S.notes[0].memo='NEW_PRIVATE_CORRECTION';const before=JSON.stringify(f.c.S),db=f.idb.snapshot();let reads=0;
 f.c.fetch=async()=>{reads++;return {ok:true,text:async()=>f.remote()};};
 const rows=await f.c.RecoveryDelivery.inspectHeldDifferences('g');
 assert.equal(rows.length,1);assert.equal(rows[0].name,'Performance');assert.match(rows[0].status,/指摘/);
 const output=f.c.document.getElementById('rd-difference-g').textContent;
 assert.match(output,/手元：1曲・指摘1件/);assert.match(output,/保留解除はしていません/);
 for(const secret of ['SECRET_TOKEN','NEW_PRIVATE_CORRECTION','PRIVATE','https:',src,f.packet.targets[0].gistId])assert(!output.includes(secret));
 assert.equal(reads,1);assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);
 assert.match(f.c.RecoveryDelivery.settingsHTML(),/保留中の公演と差分を見る/);
});
test('held difference view rejects ambiguous show mapping and does not choose a side',async()=>{
 const f=await fixture(),src=enablePreviewBinding(f);f.c.S.shows[0].nopub=false;Object.assign(f.c.S.recoveryDelivery.targets[0],{status:'blocked',heldLocalShowIds:['show']});
 const remote=JSON.parse(f.remote());remote.shows.push({...remote.shows[0],id:'duplicate',recoveredSourceShowId:'show'});
 f.c.fetch=async()=>({ok:true,text:async()=>JSON.stringify(remote)});const before=JSON.stringify(f.c.S);
 const rows=await f.c.RecoveryDelivery.inspectHeldDifferences('g');assert.match(rows[0].status,/一意ではありません/);assert.equal(JSON.stringify(f.c.S),before);assert.equal(f.patches(),0);
});
test('held difference view keeps newer input when an edit arrives during the read',async()=>{
 const f=await fixture(),src=enablePreviewBinding(f);f.c.S.shows[0].nopub=false;Object.assign(f.c.S.recoveryDelivery.targets[0],{status:'blocked',heldLocalShowIds:['show']});
 f.c.fetch=async()=>{f.c.S.notes[0].memo='newer edit';return {ok:true,text:async()=>f.remote()};};
 await f.c.RecoveryDelivery.inspectHeldDifferences('g');assert.equal(f.c.S.notes[0].memo,'newer edit');assert.match(f.c.document.getElementById('rd-difference-g').textContent,/手元の内容が変わりました/);assert.equal(f.patches(),0);
});
test('held difference view identifies section metadata and refuses duplicate local source identities',async()=>{
 const f=await fixture(),src=enablePreviewBinding(f);f.c.S.shows[0].nopub=false;Object.assign(f.c.S.recoveryDelivery.targets[0],{status:'blocked',heldLocalShowIds:['show']});
 const remote=JSON.parse(f.remote());remote.lib[0].sections=[{name:'different section'}];f.c.fetch=async()=>({ok:true,text:async()=>JSON.stringify(remote)});
 let rows=await f.c.RecoveryDelivery.inspectHeldDifferences('g');assert.match(rows[0].status,/歌割・区切り/);
 f.c.S.shows.push({...f.c.S.shows[0],id:'duplicate',recoveredSourceShowId:'show'});
 f.c.S.songs.push({...f.c.S.songs[0],id:'duplicate-song',showId:'duplicate'});
 rows=await f.c.RecoveryDelivery.inspectHeldDifferences('g');assert.match(rows[0].status,/照合できません/);assert.equal(f.patches(),0);
});
test('held difference view identifies display-only lyric breaks without reporting changed lyric text',async()=>{
 const f=await fixture();enablePreviewBinding(f);f.c.S.shows[0].nopub=false;
 Object.assign(f.c.S.recoveryDelivery.targets[0],{status:'blocked',heldLocalShowIds:['show']});
 const before=JSON.stringify(f.c.S),remote=JSON.parse(f.remote());remote.lib[0].lyricBreaks=[{lineIdx:0,offsets:[2]}];
 f.c.fetch=async()=>({ok:true,text:async()=>JSON.stringify(remote)});
 const rows=await f.c.RecoveryDelivery.inspectHeldDifferences('g');assert.equal(rows[0].status,'相違：歌割・区切り');
 assert.equal(JSON.stringify(f.c.S),before);assert.equal(f.patches(),0);
});

test('duplicate matching song titles are unresolved rather than falsely reported as a changed setlist',async()=>{
 const f=await fixture(),src=enablePreviewBinding(f);f.c.S.shows[0].nopub=false;Object.assign(f.c.S.recoveryDelivery.targets[0],{status:'blocked',heldLocalShowIds:['show']});
 f.c.S.songs.push({...f.c.S.songs[0],id:'second'});const remote=JSON.parse(f.remote());remote.songs.push({...remote.songs[0]});
 f.c.fetch=async()=>({ok:true,text:async()=>JSON.stringify(remote)});
 const rows=await f.c.RecoveryDelivery.inspectHeldDifferences('g');assert.match(rows[0].status,/一意に照合できません/);assert(!rows[0].status.includes('相違：'));assert.equal(f.patches(),0);
});

test('a newly authored same-group performance extends only the existing bound payload and preserves held remote shows',async()=>{
 const f=await fixture();const plan=Scope.plan(f.c.S,f.packet);f.c.S=plan.state;
 const target={...clone(plan.targets[0]),status:'ready',preservedShowIds:['show'],heldLocalShowIds:['show'],managedLocalShowIds:[]};
 f.c.S.recoveryDelivery={version:2,targets:[target]};f.c.S.ghToken='SYNTHETIC_EXISTING_TOKEN';
 f.c.S.shows.push({id:'new-reny',name:'10/10 新宿ReNY',groupId:'g',ts:1791590400000,from:'show'});
 f.c.S.songs.push({...clone(f.c.S.songs[0]),id:'new-song',showId:'new-reny'});
 f.c.S.notes.push({...clone(f.c.S.notes[0]),id:'new-note',showId:'new-reny',songId:'new-song',memo:'new note'});
 const originalRemote=JSON.parse(f.remote()),before=JSON.stringify([f.c.S.shows,f.c.S.songs,f.c.S.notes]);
 assert.throws(()=>Scope.mergePublication(plan.targets[0],originalRemote,f.c.publicationData('g',undefined,true)),e=>e.code==='payload-show-out-of-scope');
 const extended=Scope.extendForOwnedShows(f.c.S,plan.targets[0]);assert.deepEqual(extended.showIds,['show','new-reny']);assert.equal(extended.gistId,plan.targets[0].gistId);
 assert.equal(await f.c.RecoveryDelivery.push('g',true),'sent');const delivered=JSON.parse(f.remote());
 assert.deepEqual(delivered.shows.find(show=>show.id==='show'),originalRemote.shows[0]);
 assert.equal(delivered.shows.find(show=>show.id==='new-reny').name,'10/10 新宿ReNY');
 assert(delivered.notes.some(note=>note.memo==='new note'));assert(delivered.notes.some(note=>note.memo==='Correction'));
 assert.equal(JSON.stringify([f.c.S.shows,f.c.S.songs,f.c.S.notes]),before);assert.equal(f.c.S.recoveryDelivery.targets[0].status,'ready');
 assert.equal(await f.c.RecoveryDelivery.push('g',true),'sent');assert.equal(JSON.parse(f.remote()).shows.filter(show=>show.id==='new-reny').length,1);
});
test('new-performance scope rejects private, other-group, recovered, hidden, rerouted and ambiguous material',async()=>{
 for(const variant of ['private','other','recovered','hidden','mixed','rerouted','private-song','destination','duplicate']){
  const f=await fixture(),plan=Scope.plan(f.c.S,f.packet);f.c.S=plan.state;
  const show={id:'new-reny',name:'New',groupId:'g'},song={...clone(f.c.S.songs[0]),id:'new-song',showId:'new-reny'};
  f.c.S.shows.push(show);f.c.S.songs.push(song);
  f.c.S.groups.push({id:'other',name:'Other'},{id:'private',name:'Private',nopub:true});
  if(variant==='private')show.nopub=true;if(variant==='other')show.groupId='other';if(variant==='recovered')show.recoveredSourceShowId='another-source';if(variant==='hidden')show.hidden=true;
  if(variant==='mixed')show.deliveryMode='song';if(variant==='rerouted')show.deliveryGroupId='other';if(variant==='private-song')song.groupId='private';if(variant==='destination')f.c.S.groups[0].gistId='c'.repeat(32);if(variant==='duplicate')show.id='show';
  const before=JSON.stringify(f.c.S);
  if(['private-song','destination','duplicate'].includes(variant))assert.throws(()=>Scope.extendForOwnedShows(f.c.S,plan.targets[0]));
  else assert.deepEqual(Scope.extendForOwnedShows(f.c.S,plan.targets[0]).showIds,['show']);
  assert.equal(JSON.stringify(f.c.S),before);assert.equal(f.patches(),0);
 }
});

async function savedFixture(options={}){
 const f=await fixture(options),plan=Scope.plan(f.c.S,f.packet);f.c.S=plan.state;
 const binding={...clone(plan.targets[0]),status:'uncertain',expectedRemoteSha256:'d'.repeat(64),pendingDigest:'e'.repeat(64),pendingKey:'OLD_PENDING',
  preservedShowIds:['show'],heldLocalShowIds:['show'],managedLocalShowIds:[]};
 const other={groupId:'other',groupName:'Ready Group',gistId:'c'.repeat(32),src:'https://gist.githubusercontent.com/other/'+ 'c'.repeat(32)+'/raw/utacheck.json',
  sourceSha256:'f'.repeat(64),expectedRemoteSha256:'1'.repeat(64),sourceShowIds:['other-source'],showIds:['other-show'],status:'ready',preservedShowIds:[],heldLocalShowIds:[],managedLocalShowIds:['other-show']};
 f.c.S.groups.push({id:other.groupId,name:other.groupName,gistId:other.gistId,src:other.src,nopub:false});
 f.c.S.recoveryDelivery={version:2,targets:[binding,clone(other)]};f.c.S.ghToken='SYNTHETIC_SAVED_TOKEN';f.c.S.groupId='other';
 f.c.save();await f.c.saveNow();
 return f;
}
async function savedCheck(f,gid){
 f.click('rd-open');if(gid!==undefined)f.modal().querySelector('#rd-group').value=gid;
 f.click('rd-check-saved');
 await f.until(()=>{const text=f.modal().querySelector('#rd-status').textContent;return text&&!text.includes('読み取っています');});
}
test('fileless reconnection selects the sole unfinished group and keeps its uncertain ledger unchanged in preview',async()=>{
 const f=await savedFixture(),before=JSON.stringify(f.c.S),db=f.idb.snapshot();
 await savedCheck(f);assert.equal(f.modal().querySelector('#rd-group').value,'g');assert.equal(f.c.S.groupId,'other');
 assert.match(f.modal().innerHTML,/接続ファイルを使って確認/);assert.match(f.modal().innerHTML,/保存済みの認証情報/);
 assert.equal(f.modal().querySelector('#rd-file').files.length,0);assert.equal(f.modal().querySelector('#rd-token').value,'');
 assert.match(f.modal().querySelector('#rd-preview').innerHTML,/確認後の新しい指摘を反映する公演：1件/);
 assert.match(f.modal().querySelector('#rd-preview').innerHTML,/<details><summary>対象の公演を見る（1公演）<\/summary><ul/);
 assert.match(f.modal().querySelector('#rd-status').textContent,/まだ送信・保存/);
 assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);
 assert.deepEqual(f.calls.map(c=>({url:c.url,method:c.method,token:c.token})),[{url:'https://api.github.com/gists/'+f.packet.targets[0].gistId,method:'GET',token:'Bearer SYNTHETIC_SAVED_TOKEN'}]);
 f.click('rd-close');assert.equal(JSON.stringify(f.c.S),before);
});
test('fileless explicit commit retains old pending evidence, unrelated ready group and hold before allowing new notes',async()=>{
 const f=await savedFixture(),before=JSON.stringify(f.c.S),other=clone(f.c.S.recoveryDelivery.targets[1]);
 await savedCheck(f);f.modal().querySelector('#rd-approve').checked=true;f.click('rd-commit');await new Promise(r=>setImmediate(r));
 assert.equal(JSON.stringify(f.c.S),before);assert.equal(f.calls.length,1,'second approval remains required');
 f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(c=>c.action==='pushOne'));
 assert(f.idb.snapshot().state.some(([key,value])=>key.includes('editor:')&&value===before));
 assert.deepEqual(f.idb.record('recovery:network-hold:v1'),f.hold);assert.equal(f.c.startupRecoveryNetworkHold,true);
 assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[1]),other);assert.equal(f.c.S.autoPub,false);
 const binding=f.c.S.recoveryDelivery.targets[0];assert.equal(binding.status,'ready');assert.equal(binding.expectedRemoteSha256,sha(f.remote()));
 assert.deepEqual(clone(binding.sourceShowIds),['show']);assert.deepEqual(clone(binding.heldLocalShowIds),[]);assert.deepEqual(clone(binding.managedLocalShowIds),['show']);
 assert.equal(binding.pendingDigest,undefined);assert.equal(binding.pendingKey,undefined);
 assert.equal(f.calls.filter(c=>c.method==='GET').length,2);assert.equal(f.patches(),0);assert(f.calls.every(c=>!c.url||!c.url.includes(other.gistId)));
 f.c.S.notes.push({id:'after-fileless',songId:'song',showId:'show',lineIdx:0,memberIds:['m'],tags:[],memo:'New after reconnect'});f.c.save();await f.c.saveNow();
 assert.equal(await f.c.RecoveryDelivery.push('g',true),'sent');assert(JSON.parse(f.remote()).notes.some(n=>n.memo==='New after reconnect'));
 assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[1]),other);
});
test('fileless checking requires an explicit choice when more than one connection is unfinished',async()=>{
 const f=await savedFixture();f.c.S.recoveryDelivery.targets[1].status='blocked';
 await savedCheck(f);assert.equal(f.modal().querySelector('#rd-group').value,'');assert.match(f.modal().querySelector('#rd-status').textContent,/配信先を選択/);assert.equal(f.calls.length,0);
 f.modal().querySelector('#rd-group').value='g';f.click('rd-check-saved');await f.until(()=>/まだ送信・保存/.test(f.modal().querySelector('#rd-status').textContent));
 assert.equal(f.calls.length,1);assert.equal(f.c.S.recoveryDelivery.targets[1].status,'blocked');
});
test('fileless checking rejects missing, ambiguous, inconsistent and unfinished stored targets before GET',async()=>{
 const variants=['missing-token','legacy','duplicate-group','duplicate-gist','duplicate-src','group-name','group-gist','group-src','receipt','unknown-status','sending','prepared','ready-selected'];
 for(const variant of variants){
  const f=await savedFixture(),b=f.c.S.recoveryDelivery.targets[0],other=f.c.S.recoveryDelivery.targets[1];
  if(variant==='missing-token')f.c.S.ghToken='';
  if(variant==='legacy')f.c.S.recoveryDelivery.version=1;
  if(variant==='duplicate-group')f.c.S.recoveryDelivery.targets.push(clone(b));
  if(variant==='duplicate-gist')other.gistId=b.gistId;
  if(variant==='duplicate-src')other.src=b.src;
  if(variant==='group-name')f.c.S.groups[0].name='Other name';
  if(variant==='group-gist')f.c.S.groups[0].gistId='2'.repeat(32);
  if(variant==='group-src')f.c.S.groups[0].src=other.src;
  if(variant==='receipt')f.c.S.recoveredShowSources[b.sourceSha256].focusGroupId='other';
  if(variant==='unknown-status')b.status='unknown-status';
  if(variant==='sending'||variant==='prepared')b.status=variant;
  const before=JSON.stringify(f.c.S),db=f.idb.snapshot();
  await savedCheck(f,variant==='ready-selected'?'other':'g');
  assert.equal(f.calls.length,0,variant);assert.equal(f.patches(),0,variant);assert.equal(JSON.stringify(f.c.S),before,variant);assert.deepEqual(f.idb.snapshot(),db,variant);
  assert.equal(f.modal().querySelector('#rd-preview').innerHTML,'',variant);
 }
});
test('fileless checking refuses non-equivalent content, participant changes and unknown remote-only changes without writes',async()=>{
 for(const variant of ['local-note','remote-note','wrong-source-id','local-addition','remote-addition','missing-protected','roster','participant-expansion']){
  const f=await savedFixture(),remote=JSON.parse(f.remote()),b=f.c.S.recoveryDelivery.targets[0];
  if(variant==='local-note')f.c.S.notes[0].memo='LOCAL_NEW';
  if(variant==='remote-note')remote.notes[0].memo='REMOTE_NEW';
  if(variant==='wrong-source-id'){remote.shows[0].id='different';remote.songs[0].showId='different';for(const field of ['notes','memos','subs','gsubs'])for(const row of remote[field]||[])if(row.showId)row.showId='different';}
  if(variant==='local-addition'){f.c.S.shows.push({id:'new-show',name:'New',groupId:'g'});f.c.S.songs.push({...clone(f.c.S.songs[0]),id:'new-song',showId:'new-show'});}
  if(variant==='remote-addition'){remote.shows.push({id:'new-remote',name:'Remote new'});remote.songs.push({...remote.songs[0],showId:'new-remote'});}
  if(variant==='missing-protected')b.preservedShowIds.push('missing');
  if(variant==='roster')remote.rosters['Synthetic Group']=['Different'];
  if(variant==='participant-expansion')remote.members=[];
  f.setRemote(JSON.stringify(remote));const before=JSON.stringify(f.c.S),db=f.idb.snapshot();
  await savedCheck(f);assert.equal(f.modal().querySelector('#rd-preview').innerHTML,'',variant);
  assert.equal(f.calls.length,1,variant);assert.equal(f.patches(),0,variant);assert.equal(JSON.stringify(f.c.S),before,variant);assert.deepEqual(f.idb.snapshot(),db,variant);
 }
});
test('fileless checking preserves the complete known remote-only set while newly proving the old held show equivalent',async()=>{
 const f=await savedFixture(),remote=JSON.parse(f.remote());remote.shows.push({id:'bookmark',name:'Existing bookmark'});remote.songs.push({...remote.songs[0],showId:'bookmark'});
 f.c.S.recoveryDelivery.targets[0].preservedShowIds.push('bookmark');f.setRemote(JSON.stringify(remote));
 await savedCheck(f);assert.match(f.modal().querySelector('#rd-status').textContent,/まだ送信・保存/);assert.match(f.modal().querySelector('#rd-preview').innerHTML,/公演2件/);
 f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(c=>c.action==='pushOne'));
 assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0].preservedShowIds),['bookmark']);assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[0].heldLocalShowIds),[]);
 assert.equal(await f.c.RecoveryDelivery.push('g',true),'sent');const after=JSON.parse(f.remote());assert.deepEqual(after.shows.find(s=>s.id==='bookmark'),remote.shows[1]);
});
test('fileless confirmation stops for a changed remote or selection before commit and never changes the old ledger',async()=>{
 for(const variant of ['remote','selection','selection-event']){
  const f=await savedFixture(),before=JSON.stringify(f.c.S),db=f.idb.snapshot();await savedCheck(f);
  if(variant==='remote')f.setRemote(f.remote()+' ');
  else f.modal().querySelector('#rd-group').value='other';
  if(variant==='selection-event')for(const h of f.handlers.change)h({target:{id:'rd-group'}});
  f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');
  if(variant==='selection-event')await new Promise(r=>setImmediate(r));else await f.until(()=>/停止/.test(f.modal().querySelector('#rd-status').textContent));
  assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);assert(!f.calls.some(c=>c.action==='pushOne'));
 }
});
test('fileless read rejects a changed selection or owner edit while the request is in flight',async()=>{
 for(const variant of ['selection','state']){
  let f;f=await savedFixture({network:async()=>{if(variant==='selection')f.modal().querySelector('#rd-group').value='other';else f.c.S.notes[0].memo='NEWER_EDIT';}});
  const oldBinding=clone(f.c.S.recoveryDelivery),db=f.idb.snapshot();await savedCheck(f);
  assert.equal(f.modal().querySelector('#rd-preview').innerHTML,'');assert.deepEqual(clone(f.c.S.recoveryDelivery),oldBinding);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);
  if(variant==='state')assert.equal(f.c.S.notes[0].memo,'NEWER_EDIT');
 }
});
test('native reconnect consent avoids the editor checkpoint but keeps the owner and prepared guards',async()=>{
 const f=await savedFixture();await savedCheck(f);const before=JSON.stringify(f.c.S),db=f.idb.snapshot();let checkpoints=0;
 f.c.automaticBackupBeforeEdit=async()=>{checkpoints++;return false;};
 vm.runInContext(app.slice(app.indexOf('const verifiedBackupWidgetReplay ='),app.indexOf('const verifiedBackupSelectPending =')),f.c);
 const nativeClick=field=>{
  field.tagName='INPUT';field.type='checkbox';field.closest=()=>null;
  const previous=field.checked;field.checked=!previous;let stopped=false,prevented=false;
  const event={target:field,stopImmediatePropagation(){stopped=true;},preventDefault(){prevented=true;}};
  for(const handler of f.handlers.click){handler(event);if(stopped)break;}
  if(prevented)field.checked=previous;return {stopped,prevented};
 };
 for(const id of ['rd-exclusive','rd-approve']){
  const field=f.modal().querySelector('#'+id);assert.deepEqual(nativeClick(field),{stopped:true,prevented:false});assert.equal(field.checked,true);
 }
 assert.equal(checkpoints,0);assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);
 f.c.recordingInboxCanWrite=()=>false;const field=f.modal().querySelector('#rd-approve');assert.equal(nativeClick(field).prevented,true);assert.equal(field.checked,true);
 f.c.recordingInboxCanWrite=()=>true;
 const unrelated={id:'other-checkbox',checked:false};nativeClick(unrelated);assert.equal(checkpoints,1,'Other editor checkboxes keep their checkpoint');
 f.click('rd-commit');await f.until(()=>f.calls.some(c=>c.action==='pushOne'));assert.equal(f.c.S.recoveryDelivery.targets[0].status,'ready');
});
test('commit feedback stays next to the button and a rejected commit requires fresh checking',async()=>{
 const f=await savedFixture();await savedCheck(f);
 assert.match(f.modal().querySelector('#rd-preview').innerHTML,/id="rd-commit-status"/);
 f.click('rd-commit');assert.match(f.modal().querySelector('#rd-commit-status').textContent,/2つの確認欄/);
 f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;
 f.setRemote(f.remote()+' ');f.click('rd-commit');await f.until(()=>/上書きせず停止/.test(f.modal().querySelector('#rd-status').textContent));
 assert.equal(f.modal().querySelector('#rd-commit-status').textContent,f.modal().querySelector('#rd-status').textContent);
 assert.equal(f.modal().querySelector('[data-act="rd-commit"]').dataset.act,'rd-check-saved');assert.equal(f.patches(),0);
 f.click('rd-commit');assert.match(f.modal().querySelector('#rd-commit-status').textContent,/もう一度/);assert.equal(f.patches(),0);
});
test('saved mismatch identifies the affected show and folder without accepting or changing either copy',async()=>{
 const f=await savedFixture();f.c.S.shows[0].folder='手元のフォルダ';const remote=JSON.parse(f.remote());remote.shows[0].folder='配信済みのフォルダ';f.setRemote(JSON.stringify(remote));
 f.c.S.notes[0].memo='A newer correction that must not be replaced';
 const before=JSON.stringify(f.c.S),db=f.idb.snapshot();await savedCheck(f);
 const status=f.modal().querySelector('#rd-status').textContent;
 assert.match(status,/すべて一致していない/);assert.match(status,/Performance/);assert.match(status,/公演情報/);
 assert.match(status,/手元「手元のフォルダ」／配信済み「配信済みのフォルダ」/);
 assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);
 assert.equal(f.modal().querySelector('#rd-preview').innerHTML,'');
});
async function alignmentFixture(options={}){
 const f=await savedFixture(options);f.c.S.shows[0].folder='Local folder';
 f.c.S.members.push({id:'b',name:'B'});f.c.S.songs[0].lines.push({t:'Second lyric',raw:'B',label:'B',parts:['b']});
 const remote=clone(f.c.publicationData('g',undefined,true));delete remote.shows[0].recoveredSourceShowId;
 remote.shows[0].folder='Published folder';remote.lib[0].order.push('B');f.setRemote(JSON.stringify(remote));
 f.c.save();await f.c.saveNow();return f;
}
test('a bounded display proposal requires per-show acceptance and preserves originals before exact reconnection',async()=>{
 const f=await alignmentFixture(),before=JSON.stringify(f.c.S),db=f.idb.snapshot(),other=clone(f.c.S.recoveryDelivery.targets[1]);await savedCheck(f);
 const html=f.modal().querySelector('#rd-preview').innerHTML;
 assert.match(html,/手元の表示を配信済みに合わせる確認/);assert.match(html,/Local folder.*Published folder/);assert.match(html,/曲の表示名簿の末尾に B/);
 assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);
 f.modal().querySelector('#rd-exclusive').checked=true;f.modal().querySelector('#rd-approve').checked=true;f.click('rd-commit');
 assert.match(f.modal().querySelector('#rd-commit-status').textContent,/公演ごとの表示変更/);assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);
 f.modal().querySelector('#rd-alignment-0').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(c=>c.action==='pushOne'));
 assert.equal(f.c.S.shows[0].folder,'Published folder');assert.deepEqual(clone(f.c.S.songs[0].roster),['m','b']);
 const expected=JSON.parse(before);expected.shows[0].folder='Published folder';expected.songs[0].roster.push('b');
 for(const key of ['shows','songs','members','rosters','notes','pubNotes','memos','subs','gsubs','rsongs','staffMemos','recs','draws','folderOrder','trash','plan'])assert.deepEqual(clone(f.c.S[key]),expected[key],key);
 assert.deepEqual(clone(f.c.S.recoveryDelivery.targets[1]),other);assert.equal(f.c.S.recoveryDelivery.targets[0].heldLocalShowIds.length,0);
 assert(f.idb.snapshot().state.some(([key,value])=>key.includes('editor:')&&value===before));assert.deepEqual(f.idb.record('recovery:network-hold:v1'),f.hold);
});
test('display proposals refuse content edits, reordered singers, unknown identities and unapproved scopes',async()=>{
 for(const variant of ['note','memo','lyric','reorder','middle-insert','unknown-name','other-song-only','duplicate-id-for-name','new-held','missing-protected','unknown-remote']){
  const f=await alignmentFixture(),remote=JSON.parse(f.remote());
  if(variant==='note')f.c.S.notes[0].memo='NEW OWNER NOTE';
  if(variant==='memo')f.c.S.memos['show|song']='NEW OWNER SUMMARY';
  if(variant==='lyric')f.c.S.songs[0].lines[0].t='NEW OWNER LYRIC';
  if(variant==='reorder')remote.lib[0].order.reverse();
  if(variant==='middle-insert')remote.lib[0].order.unshift('B');
  if(variant==='unknown-name')remote.lib[0].order.push('UNKNOWN');
  if(variant==='other-song-only'){f.c.S.members.push({id:'else',name:'Else'});f.c.S.rsongs[0].lines=[{t:'Elsewhere',raw:'Else',parts:['else']}];remote.lib[0].order.push('Else');}
  if(variant==='duplicate-id-for-name'){f.c.S.members.push({id:'b2',name:'B'});f.c.S.songs[0].lines[1].parts.push('b2');}
  if(variant==='new-held')f.c.S.recoveryDelivery.targets[0].heldLocalShowIds=[];
  if(variant==='missing-protected')f.c.S.recoveryDelivery.targets[0].preservedShowIds.push('missing');
  if(variant==='unknown-remote'){remote.shows.push({id:'unknown',name:'Unknown'});remote.songs.push({...remote.songs[0],showId:'unknown'});}
  f.setRemote(JSON.stringify(remote));const before=JSON.stringify(f.c.S),db=f.idb.snapshot();await savedCheck(f);
  assert.match(f.modal().querySelector('#rd-status').textContent,/一致していない/,variant);assert.equal(f.modal().querySelector('#rd-preview').innerHTML,'',variant);
  assert.equal(JSON.stringify(f.c.S),before,variant);assert.deepEqual(f.idb.snapshot(),db,variant);assert.equal(f.patches(),0,variant);
 }
});
test('a changed remote still blocks an explicitly accepted display proposal before any save or PATCH',async()=>{
 const f=await alignmentFixture();await savedCheck(f);const before=JSON.stringify(f.c.S),db=f.idb.snapshot();
 for(const id of ['rd-exclusive','rd-approve','rd-alignment-0'])f.modal().querySelector('#'+id).checked=true;
 f.setRemote(f.remote()+' ');f.click('rd-commit');await f.until(()=>/上書きせず停止/.test(f.modal().querySelector('#rd-status').textContent));
 assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);
});
test('one valid display alignment cannot partially adopt another held show with an actual content edit',async()=>{
 const f=await alignmentFixture(),remote=JSON.parse(f.remote()),binding=f.c.S.recoveryDelivery.targets[0];
 f.c.S.shows.push({...clone(f.c.S.shows[0]),id:'second-show',name:'Second',recoveredSourceShowId:'second-show'});
 f.c.S.songs.push({...clone(f.c.S.songs[0]),id:'second-song',showId:'second-show'});
 binding.sourceShowIds.push('second-show');binding.showIds.push('second-show');binding.heldLocalShowIds.push('second-show');binding.preservedShowIds.push('second-show');
 remote.shows.push({...clone(remote.shows[0]),id:'second-show',name:'Second'});remote.songs.push({...clone(remote.songs[0]),showId:'second-show'});
 f.c.S.notes.push({id:'new-second-note',songId:'second-song',showId:'second-show',lineIdx:0,memberIds:['m'],tags:[],memo:'NEW NOTE'});
 f.setRemote(JSON.stringify(remote));const before=JSON.stringify(f.c.S),db=f.idb.snapshot();await savedCheck(f);
 assert.match(f.modal().querySelector('#rd-status').textContent,/一致していない/);assert.equal(f.modal().querySelector('#rd-preview').innerHTML,'');
 assert.equal(JSON.stringify(f.c.S),before);assert.deepEqual(f.idb.snapshot(),db);assert.equal(f.patches(),0);
});
test('display proposal groups only exact title and added-name matches without changing approved records',()=>{
 const start=code.indexOf('  function alignmentHTML('),end=code.indexOf('\n  function payloadFor(',start),c=vm.createContext({h:s=>String(s)});
 vm.runInContext(code.slice(start,end),c);
 const change={showId:'show',name:'Performance',fromFolder:'Old',toFolder:'New',rosterAdditions:[
  ...Array.from({length:4},(_,i)=>({songId:'take-'+i,title:'Repeated long title',names:['A','B']})),
  {songId:'different-names',title:'Repeated long title',names:['A','C']},
  {songId:'different-order',title:'Repeated long title',names:['B','A']},
  {songId:'different-title',title:'Repeated long title ',names:['A','B']}
 ]};
 const changes=[change],before=JSON.stringify(changes),html=c.alignmentHTML(changes);
 assert.equal((html.match(/Repeated long title（4件）/g)||[]).length,1);
 assert.equal((html.match(/曲の表示名簿の末尾に/g)||[]).length,4);
 assert(html.includes('末尾に A、C'));assert(html.includes('末尾に B、A'));assert(html.includes('Repeated long title ：'));
 assert.equal((html.match(/id="rd-alignment-/g)||[]).length,1);assert.equal(JSON.stringify(changes),before);
});

test('automatic readback clears accepted uncertain delivery without sending again or alerting',async()=>{
 const options={unknownPatch:true},f=await fixture(options);await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
 await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true));const alerts=f.alerts.length;
 assert.equal(await f.c.RecoveryDelivery.reconcilePending(),true);
 assert.equal(f.patches(),1);assert.equal(f.alerts.length,alerts);assert.equal(f.c.S.recoveryDelivery.targets[0].status,'ready');assert.equal(f.c.RecoveryDelivery.pending('g'),false);
 options.unknownPatch=false;f.c.S.subs['show|song']={0:[]};f.c.S.shows[0].absent=['m'];f.c.save();await f.c.saveNow();
 assert.equal(f.c.RecoveryDelivery.pending('g'),true);assert.equal(await f.c.RecoveryDelivery.push('g',true),'sent');assert.equal(f.patches(),2);
 assert.deepEqual(JSON.parse(f.remote()).subs,[{showId:'show',songIdx:0,lineIdx:0,names:[]}]);
});

test('automatic readback waits during editing and holds changed remote content without retry storms',async()=>{
 const f=await fixture({unknownPatch:true});await f.check();f.modal().querySelector('#rd-approve').checked=true;f.modal().querySelector('#rd-exclusive').checked=true;f.click('rd-commit');await f.until(()=>f.calls.some(x=>x.action==='pushOne'));
 await assert.rejects(()=>f.c.RecoveryDelivery.push('g',true));const before=f.calls.length,alerts=f.alerts.length;
 f.c.U.sheet='editing';assert.equal(await f.c.RecoveryDelivery.reconcilePending(),false);assert.equal(f.calls.length,before);f.c.U.sheet=null;
 f.setRemote(f.remote()+' ');assert.equal(await f.c.RecoveryDelivery.reconcilePending(),false);const after=f.calls.length;assert(after>before);
 assert.equal(f.c.S.recoveryDelivery.targets[0].status,'uncertain');assert.equal(f.patches(),1);assert.equal(f.alerts.length,alerts);
 assert.equal(await f.c.RecoveryDelivery.reconcilePending(),false);assert.equal(f.calls.length,after);
});
