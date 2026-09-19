const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
function setup(gh) {
 const alerts=[],uploads=[];
 const server={files:{'utacheck-backup.json':{content:'{"bk":1,"data":"previous"}'}}};
 let revision=0;
 const rawFiles=new Map();
 const copy=()=>JSON.parse(JSON.stringify({id:'target',files:server.files}));
 const c=vm.createContext({S:{ghToken:'secret',bkGistId:'target',bkAt:10,bkHash:0,notes:[{memo:'original'}],draws:{line:[1,2]}},U:{view:'live'},preview:null,VIEW:()=>false,
  APP_VER:"test",crypto:require("node:crypto").webcrypto,URL,Date,AbortSignal,TextEncoder,TextDecoder,Response,Uint8Array,CompressionStream,JSON,Promise,
  packState:x=>x,unpackState:x=>x,save(){},render(){},commitFields(){},alert:x=>alerts.push(x),
  gh:async(path,opts={})=>{
    if (!opts.method) return copy();
    uploads.push([path,opts]);
    if(gh) await gh(path,opts,server);
    revision++;
    for(const [name,file] of Object.entries(JSON.parse(opts.body).files)) {
      if(file===null){delete server.files[name];continue;}
      const raw_url='https://gist.githubusercontent.com/test/target/raw/'+revision+'/'+name;
      server.files[name]={...file,raw_url,truncated:false};rawFiles.set(raw_url,file.content);
    }
    return copy();
  },
  fetch:async url=>({ok:rawFiles.has(String(url)),status:404,text:async()=>rawFiles.get(String(url))}),
  backupToFile:async()=>{c.fileSaved=true;return true;}});
 vm.runInContext(block('const hash32 =','async function unpackBackup'),c);
 vm.runInContext(block('const BACKUP_FILE =','async function restoreBackup'),c);
 // Observe the immutable payload without real network credentials.
 c.packBackup=async state=>({state});
 return {c,alerts,uploads,server,rawFiles,read:vm.runInContext("readCloudBackup",c),run:code=>vm.runInContext(code,c)};
}
test('backup snapshots exclude token, preserve edits during upload and prevent duplicate sends',async()=>{
 let release;const s=setup(()=>new Promise(r=>release=r));
 const pending=s.run('doBackup(true)');await new Promise(r=>setImmediate(r));
 s.c.S.notes.push({memo:'during upload'});
 assert.equal(await s.run('doBackup(true)'),false);assert.equal(s.uploads.length,1);
 const payload=JSON.parse(JSON.parse(s.uploads[0][1].body).files['utacheck-backup.json'].content);
 assert.equal(payload.state.ghToken,undefined);assert.equal(payload.state.notes.length,1);
 release({id:'target'});assert.equal(await pending,true);
 assert.notEqual(s.c.S.bkHash,s.run('bkSignature()'));assert.equal(s.c.S.notes.length,2);
});
test('failed backups never mark data as saved or remove drawings',async()=>{
 const s=setup(async()=>{throw new Error('offline');});
 const before=JSON.stringify(s.c.S.draws),remote=JSON.stringify(s.server.files);
 assert.equal(await s.run('doBackup(true)'),false);
 assert.equal(s.c.S.bkAt,10);assert.equal(s.c.S.bkError,'offline');assert.equal(s.alerts.length,0);
 assert.equal(JSON.stringify(s.c.S.draws),before);assert.equal(JSON.stringify(s.server.files),remote);
});
test('successful backup tracks the uploaded state without metadata making it perpetually dirty',async()=>{
 const s=setup();s.c.S.bkGistId='';
 assert.equal(await s.run('doBackup(false)'),true);
 assert.equal(s.c.S.bkHash,s.run('bkSignature()'));
 s.c.S.bkFileAt=500;s.c.S.bkError='status';assert.equal(s.c.S.bkHash,s.run('bkSignature()'));
 assert.equal(s.alerts.length,1);
});
test('manual backup without a token uses a file, automatic backup does not download',async()=>{
 const s=setup();s.c.S.ghToken='';
 assert.equal(await s.run('doBackup(true)'),false);assert.equal(s.c.fileSaved,undefined);
 assert.equal(await s.run('doBackup(false)'),true);assert.equal(s.c.fileSaved,true);
});
test('unsupported compression falls back to uncompressed backup instead of aborting',async()=>{
 const s=setup();s.c.CompressionStream=class{constructor(){throw new TypeError('unsupported format');}};
 assert.equal(await s.run('squeeze(new Uint8Array([1,2,3]))'),null);
});
test('backup file round trip restores notes and drawings without importing credentials',async()=>{
 const s=setup(),c=s.c;let exported;
 Object.assign(c,{DecompressionStream,b64e:u=>Buffer.from(u).toString('base64'),b64d:x=>new Uint8Array(Buffer.from(x,'base64')),
  download:(name,text)=>{exported={name,text};},saveNow:async()=>{},saveErr:false,confirm:()=>true});
 vm.runInContext(block('async function packBackup(', '// バックアップの置き場所'),c);
 vm.runInContext(block('async function backupToFile()', '/* ---- 受け取り'),c);
 c.unpackWithPass=raw=>c.unpackBackup(raw);
 c.S.songs=[{id:'song',lines:[{t:'テスト歌詞'}]}];c.S.shows=[{id:'show'}];
 await s.run('backupToFile()');assert.match(exported.name,/\.json$/);
 const decoded=await c.unpackBackup(JSON.parse(exported.text));assert.equal(decoded.state.ghToken,undefined);
 c.S.notes=[];c.S.draws={};c.S.ghToken='current-token';
 await c.restoreBackupFile({text:async()=>exported.text});
 assert.equal(c.S.notes[0].memo,'original');assert.deepEqual(JSON.parse(JSON.stringify(c.S.draws)),{line:[1,2]});
 assert.equal(c.S.ghToken,'current-token');assert.equal(c.S.bkHash,null);
 const before=JSON.stringify(c.S);
 await c.restoreBackupFile({text:async()=>'{invalid'});assert.equal(JSON.stringify(c.S),before);
});

test('multi-megabyte backups stage small requests, commit the index last and round trip all content',async()=>{
 const s=setup();const data={bk:1,data:'x'.repeat(3200000),drawings:'kept'};
 s.c.packBackup=async()=>data;
 assert.equal(await s.run('doBackup(false)'),true);
 assert.equal(s.uploads.length,5);
 const calls=s.uploads.map(([,opts])=>JSON.parse(opts.body).files);
 for(const files of calls.slice(0,-1)){
  assert(!files['utacheck-backup.json']);
  assert(Object.values(files).every(f=>f.content.length<=900000));
 }
 const index=JSON.parse(calls.at(-1)['utacheck-backup.json'].content);
 assert.equal(index.bk,2);assert.equal(index.parts.length,4);
 assert.deepEqual(JSON.parse(JSON.stringify(await s.read(s.server.files))),data);
 assert.equal(s.c.S.bkPendingParts,undefined);
 assert.equal(s.c.S.bkHash,s.run('bkSignature()'));
});
test('interrupted uploads leave the prior backup usable, and retry cleans only this device leftovers',async()=>{
 let fail=true,n=0;
 const s=setup(async()=>{if(fail && ++n===2)throw new Error('connection lost');});
 const original=await s.read(s.server.files);
 s.c.packBackup=async()=>({bk:1,data:'x'.repeat(1800000)});
 assert.equal(await s.run('doBackup(true)'),false);
 assert.equal(s.c.S.bkAt,10);
 assert.deepEqual(await s.read(s.server.files),original);
 const stale=Object.keys(s.server.files).filter(k=>k.endsWith('.txt'));assert.equal(stale.length,1);
 const foreign='utacheck-backup-part-'+ 'f'.repeat(32)+'-0001.txt';s.server.files[foreign]={content:'other device upload'};
 fail=false;assert.equal(await s.run('doBackup(true)'),true);
 assert(stale.every(k=>!s.server.files[k]));assert(s.server.files[foreign]);
 const good=await s.read(s.server.files);assert.equal(good.data.length,1800000);
 s.c.packBackup=async()=>({bk:1,data:'small'});assert.equal(await s.run('doBackup(true)'),true);
 assert.equal((await s.read(s.server.files)).data,'small');
 assert.deepEqual(Object.keys(s.server.files).sort(),['utacheck-backup.json',foreign].sort());
});
test('truncated or omitted API file contents use versioned raw URLs, without forwarding tokens',async()=>{
 const s=setup();s.c.packBackup=async()=>({enc:1,data:'z'.repeat(1000000)});
 await s.run('doBackup(true)');
 const expected=await s.read(s.server.files);
 const index=JSON.parse(s.server.files['utacheck-backup.json'].content);
 const part=index.parts[0].name;s.server.files[part].truncated=true;s.server.files[part].content='partial';
 let requests=0;const fetch=s.c.fetch;s.c.fetch=async(url,opts)=>{requests++;assert.equal(opts.credentials,'omit');assert.equal(opts.headers,undefined);return fetch(url,opts);};
 assert.deepEqual(await s.read(s.server.files),expected);
 delete s.server.files[part];assert.deepEqual(await s.read(s.server.files),expected);assert.equal(requests,2);
 const old=setup();old.server.files['utacheck-backup.json']={truncated:true,content:'partial',raw_url:'https://gist.githubusercontent.com/test/raw/old'};
 old.rawFiles.set('https://gist.githubusercontent.com/test/raw/old','{"bk":1,"data":"legacy"}');
 assert.equal((await old.read(old.server.files)).data,'legacy');
});
test('corrupted parts are rejected before restore and credentials cannot be fetched from arbitrary hosts',async()=>{
 const s=setup();s.c.packBackup=async()=>({bk:1,data:'a'.repeat(1000000)});await s.run('doBackup(true)');
 const index=JSON.parse(s.server.files['utacheck-backup.json'].content),part=index.parts[0].name;
 s.server.files[part].content='b'+s.server.files[part].content.slice(1);
 await assert.rejects(s.read(s.server.files),/壊れ/);
 s.server.files[part]={truncated:true,raw_url:'https://example.com/private'};
 await assert.rejects(s.read(s.server.files),/取得先/);
});
test('encrypted large backup restores through both cloud restore and automatic device sync',async()=>{
 const s=setup(),c=s.c;let reloaded=false,persisted=false;
 Object.assign(c,{DecompressionStream,b64e:u=>Buffer.from(u).toString('base64'),b64d:x=>new Uint8Array(Buffer.from(x,'base64')),
  saveNow:async()=>{persisted=true;},saveErr:false,confirm:()=>true,location:{reload(){assert(persisted);reloaded=true;}},syncing:false,otherAt:0});
 vm.runInContext(block('async function deriveKey(', 'async function wrap('),c);
 vm.runInContext(block('async function packBackup(', '// バックアップの置き場所'),c);
 vm.runInContext(block('async function restoreBackup(silent)', 'function download(name'),c);
 vm.runInContext(block('async function checkOther()', 'async function takeOther()'),c);
 c.unpackWithPass=raw=>c.unpackBackup(raw);
 c.squeeze=async()=>null; // Safari fallback is the largest encoded case.
 c.S.bkKey='test-pass';c.S.notes=[{memo:'確認用の指摘'.repeat(80000)}];c.S.songs=[{id:'song',lines:[{t:'歌詞'}]}];c.S.shows=[{id:'show'}];
 const expected=JSON.stringify(c.S.notes);
 assert.equal(await s.run('doBackup(true)'),true);
 assert(s.uploads.length>2);assert(!JSON.stringify(s.server.files).includes('確認用の指摘'));
 c.S.notes=[];c.S.draws={};await s.run('restoreBackup(true)');
 assert(reloaded);assert.equal(JSON.stringify(c.S.notes),expected);assert.equal(c.S.draws.line.length,2);
 c.S.notes=[];c.S.bkHash=s.run('bkSignature()');c.S.bkSeen=0;
 await s.run('checkOther()');assert.equal(JSON.stringify(c.S.notes),expected);
});
