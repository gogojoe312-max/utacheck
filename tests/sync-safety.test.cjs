const testContext = require('./inbox-test-context.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const clone=x=>JSON.parse(JSON.stringify(x));
const work=()=>({shows:[{id:'show',name:'公演'}],songs:[{id:'song',lyric:'kept'}],notes:[{id:'note',memo:'kept'}],rsongs:[{id:'recording',takes:[1]}],draws:{line:[1,2]},groups:[{id:'g',src:'unchanged'}]});
const initial=()=>({shows:[{id:'new',name:'10/6 公演'}],songs:[],notes:[],rsongs:[],groups:[]});
function setup({local=work(),remote=work(),seen=100,at=100,dirty=true,fail='',legacy=false}={}){
 const events=[],alerts=[];let readGate,uploadGate;
 const c=testContext({S:{...clone(local),ghToken:'synthetic',bkGistId:'target',bkSeen:seen,bkHash:0,bkAt:seen},U:{view:'setup'},preview:null,VIEW:()=>false,
 Date,Number,Array,JSON,Error,Promise,TRASH_DAYS:30,save(){events.push('save');},render(){},commitFields(){},restoreViewSelection(){},alert:x=>alerts.push(x),
 fromBackup:clone,backupState(){const s=clone(c.S);delete s.ghToken;return s;},backupSignature(s){const a=clone(s);for(const k of ['bkAt','bkHash','bkSeen','bkGistId','bkError','bkFileAt','editPass'])delete a[k];return JSON.stringify(a);},
 bkSignature(){return c.backupSignature(c.backupState());},
 gh:async(path)=>{events.push('GET');if(readGate)await readGate;if(fail==='network')throw new Error('offline');return {files:fail==='missing'?{}:{backup:{}}};},
 backupIndexFile:files=>files.backup,readCloudBackup:async()=>({app:'utacheck',at,state:clone(remote)}),
 unpackBackup:async x=>{if(fail==='decrypt')throw new Error('bad key');if(fail==='invalid')return {app:'wrong',at,state:remote};return x;},
 packBackup:async state=>({state:clone(state)}),uploadCloudBackup:async content=>{events.push('PATCH');if(uploadGate)await uploadGate;if(fail==='upload')throw new Error('upload failed');c.uploaded=JSON.parse(content);},
 backupToFile:async()=>{events.push('file');return true;}});
 vm.runInContext(block('let backupInFlight =','async function restoreBackup'),c);
 vm.runInContext(block('let otherAt =','/* ---- 自分用リンク'),c);
 if(legacy) delete remote.rsongs;
 c.S.bkHash=dirty?'baseline':c.bkSignature();
 return {c,events,alerts,run:code=>vm.runInContext(code,c),gateRead:p=>readGate=p,gateUpload:p=>uploadGate=p};
}
test('manual sync reads before sending normal saved local edits',async()=>{const s=setup();await s.run('syncNow()');assert.deepEqual(s.events.filter(x=>/GET|PATCH/.test(x)),['GET','GET','PATCH']);assert.equal(s.c.uploaded.state.notes[0].memo,'kept');assert.equal(s.c.uploaded.state.ghToken,undefined);});
test('fresh local never overwrites valid cloud through manual sync',async()=>{const s=setup({local:initial(),seen:0});const before=clone(s.c.S);await s.run('syncNow()');assert(!s.events.includes('PATCH'));assert.deepEqual(s.c.S,before);assert.match(s.alerts[0],/送信していません/);});
test('fresh local never overwrites valid cloud through automatic backup',async()=>{const s=setup({local:initial(),seen:0});assert.equal(await s.run('doBackup(true)'),false);assert(!s.events.includes('PATCH'));});
test('empty local with stale saved metadata still cannot overwrite cloud',async()=>{const s=setup({local:initial()});assert.equal(await s.run('doBackup(true)'),false);assert(!s.events.includes('PATCH'));});
test('valid local with unverified baseline does not overwrite older cloud',async()=>{const s=setup({seen:0,at:50});await s.run('syncNow()');assert(!s.events.includes('PATCH'));assert.equal(s.c.S.songs[0].lyric,'kept');});
test('valid saved local can upload when cloud is older than observed baseline',async()=>{const s=setup({at:50});await s.run('syncNow()');assert(s.events.includes('PATCH'));});
test('newer remote plus local edits remains an explicit conflict',async()=>{const s=setup({at:200});await s.run('syncNow()');assert(!s.events.includes('PATCH'));assert.equal(s.run('otherAt'),200);assert.equal(s.c.S.bkSeen,100);});
test('clean local receives newer remote before any send',async()=>{const remote=work();remote.songs[0].lyric='remote';const s=setup({remote,at:200,dirty:false});await s.run('syncNow()');assert.equal(s.c.S.songs[0].lyric,'remote');assert.equal(s.c.S.ghToken,'synthetic');assert.equal(s.c.S.groups[0].src,'unchanged');assert(!s.events.includes('PATCH'));});
test('remote removing an existing recording never auto-replaces local',async()=>{const remote=work();remote.rsongs=[];const s=setup({remote,at:200,dirty:false});assert.equal(await s.run('checkOther(true)'), 'conflict');assert.equal(s.c.S.rsongs.length,1);});
test('legacy remote without recording field preserves local recording',async()=>{const remote=work();delete remote.rsongs;const s=setup({remote,at:200,dirty:false});assert.equal(await s.run('checkOther(true)'), 'conflict');assert.equal(s.c.S.rsongs.length,1);});
for(const fail of ['network','missing','decrypt','invalid'])test(`${fail} read failure never sends or reports success`,async()=>{const s=setup({fail});await s.run('syncNow()');assert(!s.events.includes('PATCH'));assert(s.alerts.some(x=>/揃えられません/.test(x)));assert.equal(s.run('manualSync'),false);assert.equal(s.run('syncing'),false);assert.equal(s.c.U.busy,'');});
test('background read failure returns failed without mutating content',async()=>{const s=setup({fail:'network'});assert.equal(await s.run('checkOther()'),'failed');assert.equal(s.c.S.notes[0].memo,'kept');assert.equal(s.alerts.length,0);});
test('background backup checks cloud and preserves state on failure',async()=>{const s=setup({fail:'network'});assert.equal(await s.run('doBackup(true)'),false);assert.equal(s.c.S.bkSeen,100);assert.deepEqual(s.c.S.draws,{line:[1,2]});assert(!s.events.includes('PATCH'));});
test('upload failure does not mark local as synchronized',async()=>{const s=setup({fail:'upload'});await s.run('syncNow()');assert.equal(s.c.S.bkSeen,100);assert.equal(s.c.S.bkHash,'baseline');assert.equal(s.run('backupInFlight'),false);});
test('duplicate manual sync is coalesced during read',async()=>{const s=setup();let release;s.gateRead(new Promise(r=>release=r));const p=s.run('syncNow()');await s.run('syncNow()');assert.equal(s.events.filter(x=>x==='GET').length,1);release();await p;assert.equal(s.events.filter(x=>x==='PATCH').length,1);});
test('duplicate automatic backup is coalesced during preflight',async()=>{const s=setup();let release;s.gateRead(new Promise(r=>release=r));const p=s.run('doBackup(true)');assert.equal(await s.run('doBackup(true)'),false);release();assert.equal(await p,true);assert.equal(s.events.filter(x=>x==='PATCH').length,1);});
test('manual sync refuses to race with background upload',async()=>{const s=setup();let release;s.gateUpload(new Promise(r=>release=r));const p=s.run('doBackup(true)');await new Promise(r=>setImmediate(r));await s.run('syncNow()');assert.equal(s.events.filter(x=>x==='PATCH').length,1);release();await p;});
test('edits during upload stay dirty and preserve immutable snapshot',async()=>{const s=setup();let release;s.gateUpload(new Promise(r=>release=r));const p=s.run('doBackup(true)');await new Promise(r=>setImmediate(r));s.c.S.notes.push({id:'new'});release();await p;assert.equal(s.c.uploaded.state.notes.length,1);assert.equal(s.c.S.notes.length,2);assert.notEqual(s.c.S.bkHash,s.c.bkSignature());});
test('connection change during read aborts without replacing or sending',async()=>{const s=setup({at:200,dirty:false});let release;s.gateRead(new Promise(r=>release=r));const p=s.run('syncNow()');s.c.S.bkGistId='different';release();await p;assert(!s.events.includes('PATCH'));assert.equal(s.c.S.bkGistId,'different');});
test('no token manual backup stays file-only',async()=>{const s=setup();s.c.S.ghToken='';assert.equal(await s.run('doBackup(false)'),true);assert.deepEqual(s.events,['file']);});
test('unlinked manual sync never creates a cloud backup',async()=>{const s=setup();s.c.S.bkGistId='';await s.run('syncNow()');assert.equal(s.events.length,0);});
test('new cloud backup still supports valid local content',async()=>{const s=setup();s.c.S.bkGistId='';assert.equal(await s.run('doBackup(false)'),true);assert(s.events.includes('PATCH'));});
test('new empty cloud backup is not created by timer',async()=>{const s=setup({local:initial()});s.c.S.bkGistId='';assert.equal(await s.run('doBackup(true)'),false);assert(!s.events.includes('PATCH'));});
test('intentional cloud selection retains old deletion safety',async()=>{const s=setup({at:200});await s.run('takeOther()');assert.equal(s.c.S.bkSeen,200);assert(!s.events.includes('PATCH'));});
test('backup cannot race with a pending remote read',async()=>{const s=setup({at:200,dirty:false});let release;s.gateRead(new Promise(r=>release=r));const p=s.run('checkOther()');assert.equal(await s.run('doBackup(true)'),false);release();await p;assert(!s.events.includes('PATCH'));});
test('editing during a remote read prevents automatic replacement',async()=>{const s=setup({at:200,dirty:false});let release;s.gateRead(new Promise(r=>release=r));const p=s.run('syncNow()');s.c.S.notes.push({id:'fresh',memo:'retain'});release();await p;assert(!s.events.includes('PATCH'));assert.equal(s.c.S.notes.at(-1).memo,'retain');});
test('new cloud revision between sync read and upload preflight blocks upload',async()=>{const s=setup();let n=0;const read=s.c.readSyncBackup;s.c.readSyncBackup=async target=>{const obj=await read(target);if(++n===2)obj.at=200;return obj;};await s.run('syncNow()');assert(!s.events.includes('PATCH'));assert.equal(s.c.S.bkSeen,100);});
test('legacy valid backup without recordings can receive into matching clean local',async()=>{const local=work(),remote=work();delete local.rsongs;delete remote.rsongs;const s=setup({local,remote,dirty:false,at:200});assert.equal(await s.run('checkOther(true)'),'received');assert(!s.events.includes('PATCH'));});
test('actual last-recording deletion remains synchronizable with recovery copy',async()=>{
 const local=initial();local.rsongs=[{id:'last',title:'last recording',lines:[{t:'retain'}]}];local.trash=[];
 const s=setup({local,remote:local});Object.assign(s.c,{uid:()=> 'trash-id',confirm:()=>true,renderSheet(){},id:'last'});
 vm.runInContext(block('function toTrash(', 'function fromTrash('),s.c);
 vm.runInContext('switch("rdel"){'+block('    case "rdel": {','    case "rpick": {')+'}',s.c);
 assert.equal(s.c.S.rsongs.length,0);assert.equal(s.c.S.trash[0].songs[0].lines[0].t,'retain');
 await s.run('syncNow()');assert(s.events.includes('PATCH'));assert.equal(s.c.uploaded.state.trash[0].songs[0].id,'last');
});
test('clean device accepts normal remote recording deletion kept in valid trash',async()=>{
 const remote=work();remote.trash=[{kind:'rec',at:Date.now(),songs:clone(remote.rsongs)}];remote.rsongs=[];
 const s=setup({remote,at:200,dirty:false});assert.equal(await s.run('checkOther(true)'),'received');assert.equal(s.c.S.rsongs.length,0);assert.equal(s.c.S.trash[0].songs[0].takes[0],1);assert(!s.events.includes('PATCH'));
});
for(const variant of ['expired','different-content','wrong-kind','missing-copy'])test(`remote deletion with ${variant} trash remains conflict`,async()=>{
 const remote=work(),t={kind:'rec',at:Date.now(),songs:clone(remote.rsongs)};
 if(variant==='expired')t.at=Date.now()-31*86400000;
 if(variant==='different-content')t.songs[0].takes=[];
 if(variant==='wrong-kind')t.kind='song';
 if(variant==='missing-copy')t.songs=[];
 remote.trash=[t];remote.rsongs=[];const s=setup({remote,at:200,dirty:false});assert.equal(await s.run('checkOther(true)'),'conflict');assert.equal(s.c.S.rsongs.length,1);
});
test('work detection never mutates packed cloud state',()=>{const s=setup();vm.runInContext(block('function unpackState(', '// 保存に失敗したら'),s.c);s.c.fromBackup=s.c.unpackState;const packed={shows:[],songs:[{id:'song',L:0}],songLib:[[{t:'keep'}]],notes:[]};const before=clone(packed);assert(s.c.hasBackupWork(packed));assert.deepEqual(packed,before);});
