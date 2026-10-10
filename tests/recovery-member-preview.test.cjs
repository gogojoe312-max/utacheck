'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const {appContext,settle,clone}=require('./startup-excel-recovery-fixture.cjs');
test('real recovered editor member preview imports publication and restores every editor field without saves',async()=>{
 const idb=indexedFixture({state:{'recovery:network-hold:v1':{v:1,sourceKind:'cloud-publication'}}});
 let raw;const requests=[];const f=appContext(idb,{fetch:async(url,opts)=>{requests.push({url,opts});return {ok:true,text:async()=>raw};}});
 const state=clone(f.run('S0')),gistId='b'.repeat(32),src='https://gist.githubusercontent.com/synthetic/'+gistId+'/raw/utacheck.json';
 Object.assign(state,{deviceId:'editor',groups:[{id:'g',name:'Synthetic',gistId,src}],groupId:'g',showId:'show',
 shows:[{id:'show',name:'Performance',groupId:'g'}],members:[{id:'m',name:'Singer'}],
 songs:[{id:'song',title:'Song',showId:'show',groupId:'g',roster:['m'],blocks:{},lines:[{t:'Lyric',label:'Singer',parts:['m']}]}],
 notes:[{id:'note',showId:'show',songId:'song',lineIdx:0,memberIds:['m'],tags:['pitch'],memo:'Correction',ts:1}],
 memos:{'show|song':'Summary'},staffMemos:{'show|song':'Private editor note'},rsongs:[{id:'rec',lines:[]}],
 recoveryDelivery:{version:2,targets:[{groupId:'g',groupName:'Synthetic',gistId,src,status:'ready'}]}});
 idb.replace('state:0',{seq:2,at:1,txt:JSON.stringify(state)});idb.replace('state:1',{seq:1,at:1,txt:JSON.stringify(state)});
 await settle(f);assert.equal(f.run('startupPhase'),'ready');
 vm.runInContext(fs.readFileSync(__dirname+'/../recovery-delivery.js','utf8'),f.c);
 const source=fs.readFileSync(__dirname+'/../app.js','utf8'),saveAt=source.indexOf('function save(');vm.runInContext(source.slice(saveAt,source.indexOf('\n}',saveAt)+2),f.c);
 raw=f.run('JSON.stringify(publicationData("g"))');const before=f.run('JSON.stringify(S)'),db=idb.snapshot(),local=clone(f.localWrites);
 await f.run('startPreview(S.groups[0].src,"")');
 assert.equal(f.run('VIEW()'),true);assert.equal(f.run('S.songs.length'),1);assert.equal(f.run('S.pubNotes.length'),1);
 assert.match(f.app.innerHTML,/Singer/);f.run('endPreview()');
 assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(idb.snapshot(),db);assert.deepEqual(f.localWrites,local);
 assert.equal(f.calls.saves,0);assert.equal(requests.length,1);assert.equal(requests[0].opts.method,'GET');assert.equal(requests[0].opts.headers.Authorization,undefined);
 assert.equal(f.run('startupCanCommunicate()'),false);
});

test('recording finalization blocks preview and overlapping recording until metadata is saved',async()=>{
 const idb=indexedFixture({state:{'recovery:network-hold:v1':{v:1,sourceKind:'cloud-publication'}}});
 let raw;const requests=[];const f=appContext(idb,{fetch:async(url,opts)=>{requests.push({url,opts});return {ok:true,text:async()=>raw};}});
 const state=clone(f.run('S0')),gistId='b'.repeat(32),src='https://gist.githubusercontent.com/synthetic/'+gistId+'/raw/utacheck.json';
 Object.assign(state,{deviceId:'editor',groups:[{id:'g',name:'Synthetic',gistId,src}],groupId:'g',showId:'show',
 shows:[{id:'show',name:'Performance',groupId:'g'}],members:[{id:'m',name:'Singer'}],
 songs:[{id:'song',title:'Song',showId:'show',groupId:'g',roster:['m'],blocks:{},lines:[{t:'Lyric',label:'Singer',parts:['m']}]}],
 notes:[{id:'note',showId:'show',songId:'song',lineIdx:0,memberIds:['m'],tags:['pitch'],memo:'Correction',ts:1}],
 memos:{'show|song':'Summary'},staffMemos:{'show|song':'Private editor note'},rsongs:[{id:'rec',lines:[]}],
 recoveryDelivery:{version:2,targets:[{groupId:'g',groupName:'Synthetic',gistId,src,status:'ready'}]}});
 idb.replace('state:0',{seq:2,at:1,txt:JSON.stringify(state)});idb.replace('state:1',{seq:1,at:1,txt:JSON.stringify(state)});
 await settle(f);assert.equal(f.run('startupPhase'),'ready');
 vm.runInContext(fs.readFileSync(__dirname+'/../recovery-delivery.js','utf8'),f.c);
 const source=fs.readFileSync(__dirname+'/../app.js','utf8'),saveAt=source.indexOf('function save(');vm.runInContext(source.slice(saveAt,source.indexOf('\n}',saveAt)+2),f.c);
 raw=f.run('JSON.stringify(publicationData("g"))');const before=f.run('JSON.stringify(S)'),db=idb.snapshot(),local=clone(f.localWrites);

 let resolveClip,recorderCount=0;const alerts=[],stream={getTracks:()=>[{stop(){}}]};
 f.c.navigator.mediaDevices={getUserMedia:async()=>stream};
 class Recorder{constructor(st){recorderCount++;this.stream=st;this.state='inactive';this.mimeType='audio/webm';}start(){this.state='recording';}static isTypeSupported(){return true;}}
 f.c.window.MediaRecorder=Recorder;f.c.MediaRecorder=Recorder;f.c.render=()=>{};f.c.alert=text=>alerts.push(text);
 f.c.putClip=()=>new Promise(resolve=>{resolveClip=resolve;});
 await f.run('startRec()');f.run('recChunks=[new Blob(["synthetic audio"])];');
 const stopped=f.run('REC.onstop()');
 assert.equal(f.run('REC'),null);assert.equal(f.run('recordingFinalizePending'),true);
 await f.run('startRec()');assert.equal(recorderCount,1);
 await f.run('startPreview(S.groups[0].src,"")');
 assert.equal(f.run('VIEW()'),false);assert.equal(f.run('preview'),null);assert.equal(requests.length,0);assert.equal(alerts.length,1);
 resolveClip();await stopped;
 assert.equal(f.run('recordingFinalizePending'),false);assert.equal(f.run('Object.keys(S.recs).length'),1);
 const saved=f.run('JSON.stringify(S)');
 await f.run('startPreview(S.groups[0].src,"")');assert.equal(f.run('VIEW()'),true);
 f.run('endPreview()');assert.equal(f.run('JSON.stringify(S)'),saved);assert.equal(f.run('Object.keys(S.recs).length'),1);
});

async function busyPreviewFixture(){
 const idb=indexedFixture({state:{'recovery:network-hold:v1':{v:1,sourceKind:'cloud-publication'}}});
 let raw;const requests=[];const f=appContext(idb,{fetch:async(url,opts)=>{requests.push({url,opts});return {ok:true,text:async()=>raw};}});
 const state=clone(f.run('S0')),gistId='b'.repeat(32),src='https://gist.githubusercontent.com/synthetic/'+gistId+'/raw/utacheck.json';
 Object.assign(state,{deviceId:'editor',groups:[{id:'g',name:'Synthetic',gistId,src}],groupId:'g',showId:'show',
 shows:[{id:'show',name:'Performance',groupId:'g'}],members:[{id:'m',name:'Singer'}],
 songs:[{id:'song',title:'Song',showId:'show',groupId:'g',roster:['m'],blocks:{},lines:[{t:'Lyric',label:'Singer',parts:['m']}]}],
 notes:[{id:'note',showId:'show',songId:'song',lineIdx:0,memberIds:['m'],tags:['pitch'],memo:'Correction',ts:1}],
 memos:{'show|song':'Summary'},staffMemos:{'show|song':'Private editor note'},rsongs:[{id:'rec',lines:[]}],
 recoveryDelivery:{version:2,targets:[{groupId:'g',groupName:'Synthetic',gistId,src,status:'ready'}]}});
 idb.replace('state:0',{seq:2,at:1,txt:JSON.stringify(state)});idb.replace('state:1',{seq:1,at:1,txt:JSON.stringify(state)});
 await settle(f);assert.equal(f.run('startupPhase'),'ready');
 vm.runInContext(fs.readFileSync(__dirname+'/../recovery-delivery.js','utf8'),f.c);
 const source=fs.readFileSync(__dirname+'/../app.js','utf8'),saveAt=source.indexOf('function save(');vm.runInContext(source.slice(saveAt,source.indexOf('\n}',saveAt)+2),f.c);
 raw=f.run('JSON.stringify(publicationData("g"))');const before=f.run('JSON.stringify(S)'),db=idb.snapshot(),local=clone(f.localWrites);

 const alerts=[];f.c.alert=text=>alerts.push(text);return {f,idb,requests,before,db,local,alerts};
}

test('preview waits admitted publication, suppresses silent sends, and preserves editor state',async()=>{
 const {f,idb,requests,before,db,local,alerts}=await busyPreviewFixture();
 let finish;f.c.qaQueue=new Promise(resolve=>{finish=resolve;});f.run('publishInFlight=true;publicationQueue=qaQueue');
 const opening=f.run('startPreview(S.groups[0].src,"")');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.run('previewLoading'),true);assert.equal(requests.length,0);
 f.c.publishGroups=()=>{throw Error('unexpected new publication');};
 await f.run('doPush(true)');
 f.run('publishInFlight=false');finish();await opening;
 assert.equal(requests.length,1);assert.equal(f.run('VIEW()'),true);assert.equal(f.run('previewLoading'),false);assert.deepEqual(alerts,[]);
 f.run('endPreview()');assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(idb.snapshot(),db);assert.deepEqual(f.localWrites,local);
});
test('preview opening pauses six-second publication timer and silent retries during read',async()=>{
 const {f}=await busyPreviewFixture();let called=0;f.c.doPush=()=>{called++;};
 f.run('previewLoading=true;S.ghToken="synthetic";S.autoPub=true;lastPushAt=0');
 f.c.hasPending=()=>true;
 const source=fs.readFileSync(__dirname+'/../app.js','utf8'),at=source.indexOf('// アプリを開いている間、自動でやりとりする');
 const block=source.slice(source.indexOf('setInterval(() => {',at),source.indexOf('}, 6000);',at)+9);
 f.c.setInterval=fn=>fn();vm.runInContext(block,f.c);assert.equal(called,0);
});
test('navigation while waiting cancels preview without reading or changing data',async()=>{
 const {f,requests,before,alerts}=await busyPreviewFixture();let finish;f.c.qaQueue=new Promise(resolve=>{finish=resolve;});f.run('publishInFlight=true;publicationQueue=qaQueue');
 const opening=f.run('startPreview(S.groups[0].src,"")');f.run('U.view="synthetic-navigation";publishInFlight=false');finish();await opening;
 assert.equal(requests.length,0);assert.equal(f.run('preview'),null);assert.equal(f.run('previewLoading'),false);assert.equal(f.run('JSON.stringify(S)'),before);assert.deepEqual(alerts,[]);
});
test('stalled publication gives specific message and never retries send or starts preview',async()=>{
 const {f,requests,before,alerts}=await busyPreviewFixture();let timeout;
 f.c.setTimeout=(fn,ms)=>{if(ms===35000)timeout=fn;return 0;};f.c.qaQueue=new Promise(()=>{});f.run('publishInFlight=true;publicationQueue=qaQueue');
 const opening=f.run('startPreview(S.groups[0].src,"")');assert.ok(timeout);timeout();await opening;
 assert.equal(requests.length,0);assert.equal(f.run('previewLoading'),false);assert.equal(f.run('preview'),null);assert.equal(f.run('JSON.stringify(S)'),before);assert.match(alerts[0],/配信処理の完了/);
});

test('manual-publication retry with autoPub off is not discarded during preview loading',async()=>{
 const {f}=await busyPreviewFixture();let retries=0;f.c.publishGroups=()=>{retries++;};
 f.run('startupRecoveryNetworkHold=false;previewLoading=true;S.autoPub=false;publishInFlight=false');await f.run('doPush(true)');assert.equal(retries,1);
});
test('silent automatic retry is suppressed during loading when existing autoPub is on',async()=>{
 const {f}=await busyPreviewFixture();let sends=0;f.c.publishGroups=()=>{sends++;};
 f.run('startupRecoveryNetworkHold=false;previewLoading=true;S.autoPub=true;publishInFlight=false');await f.run('doPush(true)');assert.equal(sends,0);
});
