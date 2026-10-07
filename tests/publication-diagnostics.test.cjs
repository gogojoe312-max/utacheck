'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const clone=x=>JSON.parse(JSON.stringify(x));
const id='a'.repeat(32),backupId='b'.repeat(32),otherId='c'.repeat(32);
const raw=gid=>`https://gist.githubusercontent.com/synthetic/${gid}/raw/utacheck.json`;
function fixture({viewer=false,linked=true,backup=false}={}) {
 const requests=[],alerts=[],forbidden=[],state={groups:[{id:'g',name:'Synthetic',gistId:viewer?'':linked?id:'',src:linked?raw(id):'',key:'synthetic-key'}],groupId:'g',
  viewer,src:linked?raw(id):'',linkSrc:linked?raw(id):'',key:'synthetic-key',ghToken:'synthetic-token',bkKey:'synthetic-backup-key',bkGistId:backup?backupId:'',deviceId:'local-device',
  shows:[{id:'show',name:'PRIVATE_SHOW_TITLE',groupId:'g'}],showId:'show',songs:[{id:'song',title:'PRIVATE_LYRIC_TITLE',showId:'show',groupId:'g',lines:[],blocks:{}}],
  notes:[{id:'note',showId:'show',songId:'song',memberIds:[],tags:[],memo:'PRIVATE_MEMO'}],pubNotes:[],members:[],gsubs:{},subs:{},memos:{},
  trash:[{kind:'rec',at:1,songs:[{id:'deleted',title:'PRIVATE_DELETED'}]}],staffMemos:{private:'PRIVATE_STAFF'},draws:{line:[1,2]},offlineField:{input:'PRIVATE_OFFLINE'},plan:{slots:[{id:'old',a0:1,secLog:{old:1}}]}};
 let published,memberPayload,cloud,fetchOverride;
 const c=vm.createContext({S:state,U:{},preview:null,URL,Date,JSON,Object,Array,Set,Number,SyntaxError,Error,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,
  VIEW:()=>viewer,typingNow:()=>false,enterRecordingInboxEditor:()=>()=>{},group:gid=>state.groups.find(g=>g.id===gid),member:()=>null,showsNewestFirst:()=>state.shows,
  packState:clone,hash32:s=>{let n=0;for(const ch of s)n=Math.imul(31,n)+ch.charCodeAt(0)|0;return String(n);},
  b64e:bytes=>Buffer.from(bytes).toString('base64url'),b64d:text=>new Uint8Array(Buffer.from(text,'base64url')),squeeze:async()=>null,
  alert:text=>alerts.push(text),save:()=>forbidden.push('save'),saveNow:()=>forbidden.push('saveNow'),applySetlist:()=>forbidden.push('apply'),doPush:()=>forbidden.push('send'),
  download:()=>forbidden.push('download'),prompt:()=>forbidden.push('prompt'),render:()=>forbidden.push('render'),
  boundedPublicationRequest:async(url,opts,read)=>{
   requests.push({url,opts});if(fetchOverride)return fetchOverride(url,opts,read);
   let body;
   if(url===`https://api.github.com/gists/${id}`)body={id,files:{'utacheck.json':{content:JSON.stringify(published),raw_url:raw(id)}}};
   else if(url===`https://api.github.com/gists/${backupId}`)body={id:backupId,files:{'utacheck-backup.json':{content:'{"bk":1}'}}};
   else if(url.startsWith(raw(id)))body=memberPayload||published;
   else throw Error('unexpected endpoint');
   return read({ok:true,json:async()=>clone(body),text:async()=>JSON.stringify(body)});
  },
  readCloudBackupContent:async(files,readFile)=>readFile(files['utacheck-backup.json']),
  unpackBackup:async(raw,pass)=>{assert.equal(pass,state.bkKey);return clone(cloud);},
 });
 for(const [a,b] of [['function autoShowGroupId(','function setCurrentShowGroup('],['function showDeliveryLabel(','function syncShowGroup('],['function publicationData(','async function gh('],['function gistRawSource(','// 入れたトークン'],['function backupState()','// バックアップの置き場所'],['// Read-only diagnostics:','// version は毎回']])vm.runInContext(block(a,b),c);
 // Production unpacking is tested separately; this fixture isolates transport/authority.
 c.unpackBackup=async(raw,pass)=>{assert.equal(pass,'synthetic-backup-key');return clone(cloud);};
 const run=s=>vm.runInContext(s,c);
 published=clone(c.publicationData('g'));published.version=100;
 state.groups[0].lastKey=JSON.stringify(published);state.setlistVer=100;
 state.pubNotes=clone(published.notes);
 state.bkHash=run('bkSignature()');cloud={app:'utacheck',at:100,state:clone(c.backupState())};
 return {c,state,requests,alerts,forbidden,run,published:()=>published,cloud:()=>cloud,
  setPublished:x=>published=x,setMember:x=>memberPayload=x,setCloud:x=>cloud=x,setFetch:x=>fetchOverride=x};
}
test('all opted-out songs show no delivery and stay excluded without changing state',()=>{
 const f=fixture();f.state.songs[0].deliveryGroupId='';const before=JSON.stringify(f.state);
 assert.equal(f.c.showDeliveryLabel(f.state.shows[0]),'配信しない（全曲対象外）');assert.equal(f.c.publicationData('g').songs.length,0);assert.equal(JSON.stringify(f.state),before);
 f.state.shows[0].deliveryMode='song';assert.equal(f.c.showDeliveryLabel(f.state.shows[0]),'配信しない（全曲対象外）');
});
test('legacy empty shows and partially opted-out shows retain their valid destination label',()=>{
 const f=fixture();const song=clone(f.state.songs[0]);f.state.songs=[];assert.equal(f.c.showDeliveryLabel(f.state.shows[0]),'Synthetic');
 f.state.songs=[song,{...song,id:'other',deliveryGroupId:''}];assert.equal(f.c.showDeliveryLabel(f.state.shows[0]),'Synthetic');assert.equal(f.c.publicationData('g').songs.length,1);
});
test('all songs in a private group show no delivery without changing private settings',()=>{
 const f=fixture();f.state.groups[0].nopub=true;const before=JSON.stringify(f.state);
 assert.equal(f.c.showDeliveryLabel(f.state.shows[0]),'配信しない（全曲対象外）');assert.equal(JSON.stringify(f.state),before);
});
test('editor compares intended, Gist and member-source content using GET only and leaves all local work unchanged',async()=>{
 const f=fixture({backup:true}),before=JSON.stringify(f.state),r=await f.c.inspectPublication('g');
 assert.equal(r.status,'checked');assert.equal(r.delivery,'same');assert.equal(r.source,'same');assert.equal(r.memberContent,'same');assert.equal(r.authority,'same');
 assert.deepEqual(clone(r.planned),{shows:1,songs:1,notes:1});assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.forbidden,[]);assert.equal(f.requests.length,3);
 for(const {url,opts} of f.requests){assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');assert.equal(opts.referrerPolicy,'no-referrer');
  if(url.startsWith('https://api.github.com/'))assert.equal(opts.headers.Authorization,'Bearer synthetic-token');else assert.equal(opts.headers,undefined);}
 const output=JSON.stringify(r)+f.alerts.join('');for(const secret of ['PRIVATE_',id,raw(id),'synthetic-key','synthetic-token','synthetic-backup-key'])assert(!output.includes(secret));
});
test('unsent changes are distinct from connection failure and are never sent by inspection',async()=>{
 const f=fixture();f.state.notes.push({...f.state.notes[0],id:'new',memo:'PRIVATE_NEW'});const before=JSON.stringify(f.state),r=await f.c.inspectPublication('g');
 assert.equal(r.delivery,'unsent');assert.equal(r.planned.notes,2);assert.equal(r.published.notes,1);assert.equal(r.authority,'unlinked');assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.forbidden,[]);
});
test('an unchanged local baseline and changed cloud are reported as possibly stale, not silently received',async()=>{
 const f=fixture({backup:true});f.cloud().state.notes.push({id:'remote-new',memo:'PRIVATE_REMOTE'});
 const changed=clone(f.published());changed.notes.push({songIdx:0,showId:'show',memo:'PRIVATE_REMOTE'});f.setPublished(changed);
 const before=JSON.stringify(f.state),r=await f.c.inspectPublication('g');assert.equal(r.authority,'local-behind-possible');assert.equal(r.delivery,'local-behind-possible');assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.forbidden,[]);
});
test('divergent offline and remote edits are retained and reported as changes on both sides',async()=>{
 const f=fixture({backup:true});f.state.notes.push({id:'local-new',memo:'PRIVATE_LOCAL'});f.cloud().state.notes.push({id:'remote-new',memo:'PRIVATE_REMOTE'});
 const changed=clone(f.published());changed.notes.push({songIdx:0,showId:'show',memo:'PRIVATE_REMOTE'});f.setPublished(changed);
 const before=JSON.stringify(f.state),r=await f.c.inspectPublication('g');assert.equal(r.authority,'both-changed');assert.equal(r.delivery,'both-changed');assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.forbidden,[]);
});
test('missing old backup baseline never claims an outdated device is authoritative',async()=>{
 const f=fixture({backup:true});delete f.state.bkHash;f.cloud().state.notes=[];const r=await f.c.inspectPublication('g');assert.equal(r.authority,'unverified');
});
test('backup comparison retains unknown metadata fields inside the state comparison',()=>{
 const f=fixture();const a={shows:[],songs:[],version:1,src:'private-a',authorId:'a'},b={...a,version:2};
 assert.notEqual(f.c.publicationDiagnosticBackupKey(a),f.c.publicationDiagnosticBackupKey(b));
});
test('same counts with different private notes remain a content mismatch',async()=>{
 const f=fixture(),changed=clone(f.published());changed.notes[0].memo='PRIVATE_OTHER';f.setPublished(changed);const r=await f.c.inspectPublication('g');assert.equal(r.delivery,'different-unverified');
});
test('only metadata ordering and publication timestamps may differ without a false unsent warning',()=>{
 const f=fixture(),a={version:1,src:raw(id),authorId:'a',songs:[],shows:[],notes:[]},b={notes:[],shows:[],songs:[],version:2,src:raw(id),authorId:'b'};
 assert.equal(f.c.publicationDiagnosticDelivery(a,b,'','unlinked'),'same');
});
test('excluded settings are counted without exposing titles or changing them',async()=>{
 const f=fixture();f.state.songs[0].deliveryGroupId='';f.state.shows.push({id:'hidden',groupId:'g',hidden:true},{id:'private',groupId:'g',nopub:true});
 const before=JSON.stringify(f.state),r=await f.c.inspectPublication('g');assert.equal(r.excluded.optedOut,1);assert.equal(r.excluded.hidden,1);assert.equal(r.excluded.privateShows,1);assert.equal(r.planned.songs,0);assert.equal(JSON.stringify(f.state),before);
});
test('member inspects the actual selected source and received version without refresh/apply or credential forwarding',async()=>{
 const f=fixture({viewer:true}),before=JSON.stringify(f.state),r=await f.c.inspectPublication();
 assert.equal(r.role,'member');assert.equal(r.version,'version-same');assert.equal(f.requests.length,1);assert.equal(f.requests[0].opts.headers,undefined);assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.forbidden,[]);
 f.state.setlistVer=50;assert.equal((await f.c.inspectPublication()).version,'version-different');
});
test('legacy publication without version is readable without claiming received-version equality',async()=>{
 const f=fixture({viewer:true}),old=clone(f.published());delete old.version;delete old.shows;f.setPublished(old);assert.equal((await f.c.inspectPublication()).version,'version-unknown');
});
test('different member link and selected Gist are detected before any request',async()=>{
 const f=fixture({viewer:true});f.state.linkSrc=raw(otherId);const before=JSON.stringify(f.state),r=await f.c.inspectPublication();assert.equal(r.status,'source-mismatch');assert.equal(f.requests.length,0);assert.equal(JSON.stringify(f.state),before);
});
test('publisher source on another Gist is not fetched and is reported separately from saved content',async()=>{
 const f=fixture();f.state.groups[0].src=raw(otherId);const r=await f.c.inspectPublication('g');assert.equal(r.status,'checked');assert.equal(r.source,'source-mismatch');assert.equal(f.requests.length,1);
});
for(const viewer of [false,true])test('unlinked '+(viewer?'member':'editor')+' performs no requests and does not initialize state',async()=>{
 const f=fixture({viewer,linked:false}),before=JSON.stringify(f.state),r=await f.c.inspectPublication('g');assert.equal(r.status,'unlinked');assert.equal(f.requests.length,0);assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.forbidden,[]);
});
for(const status of [401,403,404,500])test('HTTP '+status+' is sanitized and never echoes response/private data',async()=>{
 const f=fixture();f.setFetch(async(url,opts,read)=>read({ok:false,status,text:async()=>{throw Error('PRIVATE_RESPONSE_MUST_NOT_READ');}}));
 const before=JSON.stringify(f.state),r=await f.c.inspectPublication('g');assert.equal(r.status,status===404?'not-found':status===500?'connection-unavailable':'auth-unavailable');assert.equal(JSON.stringify(f.state),before);assert(!f.alerts.join('').includes('PRIVATE_'));assert.deepEqual(f.forbidden,[]);
});
test('network and decryption failures do not expose secrets or alter state',async()=>{
 const f=fixture(),before=JSON.stringify(f.state);f.setFetch(async()=>{throw Error('PRIVATE_URL synthetic-token');});assert.equal((await f.c.inspectPublication('g')).status,'connection-unavailable');
 f.setFetch(null);f.setPublished({enc:1,data:'PRIVATE_CIPHER'});f.c.openJSON=async()=>{throw Error('PRIVATE_KEY');};assert.equal((await f.c.inspectPublication('g')).status,'bad-key');assert.equal(JSON.stringify(f.state),before);assert(!f.alerts.join('').includes('PRIVATE_'));
});
test('new input during network waits invalidates the report and is never rolled back',async()=>{
 const f=fixture();let finish;f.setFetch(async(url,opts,read)=>new Promise(resolve=>{finish=()=>resolve(read({ok:true,json:async()=>({id,files:{'utacheck.json':{content:JSON.stringify(f.published()),raw_url:raw(id)}}})}));}));
 const pending=f.c.inspectPublication('g');await new Promise(r=>setImmediate(r));f.state.offlineField.input='PRIVATE_EDIT_DURING_READ';finish();const r=await pending;
 assert.equal(r.status,'state-changed');assert.equal(f.state.offlineField.input,'PRIVATE_EDIT_DURING_READ');assert.deepEqual(f.forbidden,[]);
});
test('partial editor/member-source fetch failure keeps the readable Gist result without claiming arrival',async()=>{
 const f=fixture();f.setFetch(async(url,opts,read)=>{if(!url.startsWith('https://api.github.com/'))throw Error('PRIVATE_NETWORK');return read({ok:true,json:async()=>({id,files:{'utacheck.json':{content:JSON.stringify(f.published()),raw_url:raw(id)}}})});});
 const r=await f.c.inspectPublication('g');assert.equal(r.status,'checked');assert.equal(r.memberContent,'connection-unavailable');assert.match(f.alerts[0],/実メンバー端末への到達は未確認/);
});
test('truncated raw reads reject redirects, other Gists, credentials, custom hosts and encoded paths before transport',async()=>{
 const f=fixture();for(const url of [raw(otherId),raw(id).replace('https:','http:'),raw(id).replace('https://','https://user:pass@'),raw(id).replace('gist.githubusercontent.com','other.example'),raw(id).replace('/raw/','/%72aw/')])
  await assert.rejects(f.c.publicationDiagnosticReadFile({truncated:true,raw_url:url},id),e=>e.code==='source-invalid');
 assert.equal(f.requests.length,0);await f.c.publicationDiagnosticReadFile({truncated:true,raw_url:raw(id)+'?private=hidden#key'},id);
 const requested=new URL(f.requests[0].url);assert.equal(requested.origin+requested.pathname,raw(id));assert.equal(requested.searchParams.get('private'),null);assert(requested.searchParams.has('t'));assert.equal(requested.hash,'');
 assert.equal(f.requests[0].opts.redirect,'error');assert.equal(f.requests[0].opts.headers,undefined);
});
test('preview and input-in-progress do not pretend to inspect a real member or commit input',async()=>{
 const f=fixture();f.c.preview='PRIVATE_PREVIEW';assert.equal((await f.c.inspectPublication()).status,'preview');f.c.preview=null;f.c.typingNow=()=>true;
 assert.equal((await f.c.inspectPublication()).status,'editing');assert.equal(f.requests.length,0);assert.deepEqual(f.forbidden,[]);
});
test('actual click dispatch bypasses the generic commit/blur path for diagnostics',async()=>{
 const f=fixture();let handler;f.c.document={addEventListener:(name,fn)=>handler=fn,activeElement:{blur(){throw Error('unexpected blur');}}};
 f.c.typingNow=()=>true;f.c.commitFields=()=>{throw Error('unexpected commit');};f.c.song=()=>{throw Error('unexpected selection');};
 const start=src.indexOf('document.addEventListener("click", (e) => {\n  const b = e.target.closest("[data-act]");');let end=src.indexOf('\n});',start);
 while(end>=0){try{new vm.Script(src.slice(start,end+4));break;}catch(_){end=src.indexOf('\n});',end+1);}}
 assert(end>=0);vm.runInContext(src.slice(start,end+4),f.c);
 const button={dataset:{act:'publication-inspect',id:'g'},tagName:'BUTTON'};
 handler({target:{closest:q=>q==='[data-act]'?button:null}});await new Promise(r=>setImmediate(r));assert.equal(f.requests.length,0);assert.match(f.alerts[0],/入力を終えて/);assert.deepEqual(f.forbidden,[]);
});
test('backup codec accepts an explicit captured key while retaining the old default-key call',async()=>{
 const f=fixture();vm.runInContext(block('async function packBackup(', '// バックアップの置き場所'),f.c);
 vm.runInContext(block('async function deriveKey(', 'async function wrap('),f.c);
 const envelope={app:'utacheck',at:1,state:{shows:[],songs:[],notes:[],trash:[{id:'kept'}],memos:{note:'PRIVATE_MEMO'}}};
 const body={bk:1,z:false,data:Buffer.from(JSON.stringify(envelope)).toString('base64url')};
 const sealed=await f.c.sealJSON(body,'captured-key');const before=JSON.stringify(f.state);
 assert.deepEqual(clone(await f.c.unpackBackup(sealed,'captured-key')),envelope);assert.equal(JSON.stringify(f.state),before);
 const old=await f.c.sealJSON(body,f.state.bkKey);assert.deepEqual(clone(await f.c.unpackBackup(old)),envelope);assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.forbidden,[]);
});
test('unavailable backup key is reported separately and does not trigger key entry or change settings',async()=>{
 const f=fixture({backup:true});f.c.unpackBackup=async()=>{const error=Error('PRIVATE_BACKUP_KEY');error.badKey=1;throw error;};
 const before=JSON.stringify(f.state),r=await f.c.inspectPublication('g');assert.equal(r.status,'checked');assert.equal(r.authority,'bad-key');assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.forbidden,[]);assert(!f.alerts.join('').includes('PRIVATE_'));
});
test('a mismatched API Gist identity is rejected before reading or fetching its files',async()=>{
 const f=fixture();f.setFetch(async(url,opts,read)=>read({ok:true,json:async()=>({id:otherId,files:{'utacheck.json':{truncated:true,raw_url:raw(otherId)}}})}));
 const before=JSON.stringify(f.state),r=await f.c.inspectPublication('g');assert.equal(r.status,'invalid-data');assert.equal(f.requests.length,1);assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.forbidden,[]);
});
