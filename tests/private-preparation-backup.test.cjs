'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const testContext=require('./inbox-test-context.cjs');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const block=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start);return source.slice(start,end)};
const clone=x=>JSON.parse(JSON.stringify(x));
const TARGET='a'.repeat(32),TOKEN='synthetic-existing-token',KEY='synthetic-existing-passphrase';
const receipt=()=>({prepared:{sha256:'b'.repeat(64),type:'live-addition',at:1}});
function fixture(options={}) {
 const calls=[],alerts=[],timers=[];let writes=0,preflight=0,afterRead=options.afterRead;
 const server={id:TARGET,public:false,files:{'utacheck-backup.json':{content:JSON.stringify({bk:1,z:false,data:'cHJldmlvdXM='})}},...options.server};
 const c=testContext({S:{ghToken:TOKEN,bkGistId:TARGET,bkKey:KEY,bkAt:0,bkSeen:100,bkHash:0,
  shows:[{id:'show',name:'Synthetic private rehearsal'}],songs:[{id:'song',title:'Synthetic prepared song',lines:[{t:'PRIVATE_SYNTHETIC_LYRIC'}]}],
  notes:[{id:'note',memo:'Keep later local note'}],rsongs:[],groups:[{id:'private-group',nopub:true}],draws:{keep:[1,2]},recs:{keep:{id:'clip'}},privatePreparations:receipt(),...options.state},
  U:{view:'live'},preview:null,VIEW:()=>false,APP_VER:'synthetic',startupRecoveryNetworkHold:false,document:{hidden:false},
  Date,Number,Array,JSON,Error,Promise,URL,Response,Uint8Array,TextEncoder,TextDecoder,AbortSignal,crypto:webcrypto,CompressionStream,DecompressionStream,
  b64e:x=>Buffer.from(x).toString('base64'),b64d:x=>new Uint8Array(Buffer.from(x,'base64')),packState:x=>x,unpackState:x=>x,
  save(){writes++},render(){},commitFields(){},restoreViewSelection(){},alert:x=>alerts.push(x),backupToFile:async()=>{throw Error('unexpected file fallback')},
  setInterval(fn,ms){if(ms===30000)timers.push(fn)},
  gh:async(path,init={})=>{
   calls.push({path,init});
   if(!init.method){if(options.missing)throw Object.assign(Error('missing'),{status:404});if(afterRead){const f=afterRead;afterRead=null;await f(c)}return clone(server)}
   assert.equal(init.method,'PATCH');assert.equal(path,'/gists/'+TARGET);const data=JSON.parse(init.body);
   for(const [name,file]of Object.entries(data.files)){if(file===null)delete server.files[name];else server.files[name]={...file,truncated:false}}
   return clone(server);
  }});
 vm.runInContext(block('async function deriveKey(', 'async function wrap('),c);
 vm.runInContext(block('const hash32 =', '// バックアップの置き場所'),c);
 vm.runInContext(block('const BACKUP_FILE =', 'async function restoreBackup'),c);
 vm.runInContext(block('let otherAt =', '/* ---- 自分用リンク'),c);
 c.readSyncBackup=async()=>{preflight++;return {app:'utacheck',at:100,state:clone(c.S)}};
 const timerAt=source.indexOf('// 変わっていれば送る'),timerStart=source.lastIndexOf('setInterval(() => {',timerAt),timerEnd=source.indexOf('}, 30000);',timerAt)+'}, 30000);'.length;
 assert(timerStart>=0&&timerEnd>timerStart);vm.runInContext(source.slice(timerStart,timerEnd),c);
 let lastBackup;const doBackup=c.doBackup;c.doBackup=(...args)=>(lastBackup=doBackup(...args));
 return {c,calls,alerts,server,timers,get writes(){return writes},get preflight(){return preflight},get lastBackup(){return lastBackup},run:text=>vm.runInContext(text,c)};
}
test('private prepared backups missing an existing target or key stop before all network reads',async()=>{
 for(const state of [{bkGistId:''},{bkKey:''},{bkKey:'  '},{bkGistId:undefined},{bkKey:undefined}]){
  const f=fixture({state}),before=clone(f.c.S);assert.equal(await f.c.doBackup(true),false);assert.equal(f.preflight,0);assert.equal(f.calls.length,0);
  assert.match(f.c.S.bkError,/本人用.*送信を停止/);for(const key of Object.keys(before).filter(k=>k!=='bkError'))assert.deepEqual(f.c.S[key],before[key],key);
  assert.equal(f.alerts.length,0);assert.equal(f.writes,0);
 }
});
test('the actual 30-second timer cannot publish unencrypted or new prepared backups',async()=>{
 for(const state of [{bkGistId:''},{bkKey:''}]){
  const f=fixture({state});assert.equal(f.timers.length,1);f.timers[0]();assert.equal(await f.lastBackup,false);
  assert.equal(f.preflight,0);assert.equal(f.calls.length,0);assert.equal(f.writes,0);assert.equal(f.c.S.bkGistId,state.bkGistId??TARGET);
 }
});
test('manual backup reports the safe stop without prompting for or making credentials',async()=>{
 const f=fixture({state:{bkKey:''}});assert.equal(await f.c.doBackup(false),false);assert.equal(f.calls.length,0);assert.equal(f.alerts.length,1);
 assert.match(f.alerts[0],/端末の内容は保持/);assert.doesNotMatch(f.alerts[0],/作成|入力|synthetic|token/i);
});
test('direct upload rejects plaintext, cosmetic encryption and ciphertext under a different key before network',async()=>{
 const f=fixture();
 const wrong=await f.c.sealJSON({bk:1,z:false,data:'cHJldmlvdXM='},'different-synthetic-key');
 const fake={enc:1,salt:Buffer.alloc(16).toString('base64'),iv:Buffer.alloc(12).toString('base64'),data:Buffer.alloc(32).toString('base64')};
 for(const content of [JSON.stringify({bk:1,z:false,data:'PRIVATE_SYNTHETIC_LYRIC'}),JSON.stringify(fake),JSON.stringify(wrong),'invalid']){
  await assert.rejects(f.c.uploadCloudBackup(content),/本人用/);assert.equal(f.calls.length,0);
 }
});
test('direct upload also refuses missing destination, key, or token without network',async()=>{
 for(const state of [{bkGistId:''},{bkKey:''},{ghToken:''}]){
  const f=fixture({state});await assert.rejects(f.c.uploadCloudBackup('{}'),/本人用/);assert.equal(f.calls.length,0);
 }
});
test('existing key encryption and verified nonpublic existing gist permit a single PATCH only',async()=>{
 const f=fixture(),before=clone(f.c.S);assert.equal(await f.c.doBackup(true),true);
 assert.equal(f.preflight,1);assert.deepEqual(f.calls.map(c=>c.init.method||'GET'),['GET','PATCH']);
 assert(f.calls.every(c=>c.path==='/gists/'+TARGET));assert.equal(f.c.S.bkGistId,TARGET);assert.equal(f.c.S.bkKey,KEY);
 const content=f.server.files['utacheck-backup.json'].content;assert.doesNotMatch(content,/PRIVATE_SYNTHETIC_LYRIC|synthetic-existing-token/);
 const restored=await f.c.unpackBackup(JSON.parse(content),KEY);assert.deepEqual(clone(restored.state.privatePreparations),before.privatePreparations);
 assert.equal(restored.state.songs[0].lines[0].t,'PRIVATE_SYNTHETIC_LYRIC');assert.equal(restored.state.ghToken,undefined);
});
test('public, unverified privacy or mismatched gist metadata never receives prepared data',async()=>{
 for(const server of [{public:true},{public:undefined},{id:'b'.repeat(32)}]){
  const f=fixture({server}),content=JSON.stringify(await f.c.packBackup());await assert.rejects(f.c.uploadCloudBackup(content),/本人用/);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.method,undefined);assert.equal(f.c.S.bkGistId,TARGET);assert.equal(f.writes,0);
 }
});
test('missing existing gist never clears the destination or creates a replacement',async()=>{
 const f=fixture({missing:true}),content=JSON.stringify(await f.c.packBackup());await assert.rejects(f.c.uploadCloudBackup(content),/本人用/);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.method,undefined);assert.equal(f.c.S.bkGistId,TARGET);assert.equal(f.writes,0);
});
test('destination, existing key or token changes during metadata read prevent every write',async()=>{
 for(const [key,value]of [['bkGistId','b'.repeat(32)],['bkKey','changed-existing-key'],['ghToken','changed-existing-token']]){
  const f=fixture({afterRead:c=>{c.S[key]=value}}),content=JSON.stringify(await f.c.packBackup());await assert.rejects(f.c.uploadCloudBackup(content),/本人用/);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.method,undefined);assert.equal(f.c.S[key],value);assert.equal(f.writes,0);
 }
});
test('missing or mismatched incoming preparation receipts cannot replace a clean local editor',async()=>{
 for(const remoteReceipt of [undefined,{}, {prepared:{sha256:'c'.repeat(64),type:'live-addition'}},{prepared:{sha256:'b'.repeat(64),type:'recording-addition'}}]){
  const f=fixture(),remote=clone(f.c.S);remote.privatePreparations=remoteReceipt;remote.songs[0].lines[0].t='Remote replacement';
  f.c.S.bkHash=f.run('bkSignature()');f.c.readSyncBackup=async()=>({app:'utacheck',at:200,state:remote});const before=clone(f.c.S);
  assert.equal(await f.c.checkOther(true),'conflict');assert.deepEqual(f.c.S,before);assert.equal(f.writes,0);assert.equal(f.calls.length,0);
  assert.match(f.run('syncReadReport'),/受信記録が一致しない/);
 }
});
test('matching preparation receipt identity allows existing safe whole-state synchronization',async()=>{
 const f=fixture(),remote=clone(f.c.S);remote.songs[0].lines[0].t='Newer owner edit';remote.privatePreparations.prepared.at=99;
 f.c.S.bkHash=f.run('bkSignature()');f.c.readSyncBackup=async()=>({app:'utacheck',at:200,state:remote});
 assert.equal(await f.c.checkOther(true),'received');assert.equal(f.c.S.songs[0].lines[0].t,'Newer owner edit');assert.equal(f.c.S.ghToken,TOKEN);assert.equal(f.c.S.bkKey,KEY);
});
test('empty preparation receipts preserve ordinary existing backup behavior',async()=>{
 const f=fixture({state:{privatePreparations:{},bkKey:''}});assert.equal(await f.c.doBackup(true),true);assert.equal(f.calls.at(-1).init.method,'PATCH');
 const content=JSON.parse(f.server.files['utacheck-backup.json'].content);assert.equal(content.bk,1);assert.equal(content.enc,undefined);
});
