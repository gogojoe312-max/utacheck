const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
function setup(gh) {
 const alerts=[],uploads=[];
 const c=vm.createContext({S:{ghToken:'secret',bkGistId:'target',bkAt:10,bkHash:0,notes:[{memo:'original'}],draws:{line:[1,2]}},U:{view:'live'},preview:null,VIEW:()=>false,
  APP_VER:"test",Date,AbortSignal,TextEncoder,TextDecoder,Response,Uint8Array,CompressionStream,JSON,Promise,
  packState:x=>x,unpackState:x=>x,save(){},render(){},commitFields(){},alert:x=>alerts.push(x),
  gh:async(...args)=>{uploads.push(args);return gh?gh(...args):{id:'target'};},
  backupToFile:async()=>{c.fileSaved=true;return true;}});
 vm.runInContext(block('const hash32 =','async function unpackBackup'),c);
 vm.runInContext(block('let backupInFlight =','async function restoreBackup'),c);
 // Observe the immutable payload without real network credentials.
 c.packBackup=async state=>({state});
 return {c,alerts,uploads,run:code=>vm.runInContext(code,c)};
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
test('failed and oversized backups never mark data as saved or remove drawings',async()=>{
 const s=setup(async()=>{throw new Error('offline');});
 const before=JSON.stringify(s.c.S.draws);
 assert.equal(await s.run('doBackup(true)'),false);
 assert.equal(s.c.S.bkAt,10);assert.equal(s.c.S.bkError,'offline');assert.equal(s.alerts.length,0);
 s.c.packBackup=async()=>({data:'x'.repeat(960000)});
 assert.equal(await s.run('doBackup(true)'),false);
 assert.match(s.c.S.bkError,/ファイルに保存/);assert.equal(JSON.stringify(s.c.S.draws),before);assert.equal(s.uploads.length,1);
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
