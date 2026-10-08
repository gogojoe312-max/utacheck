'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
function read(name){const a=src.indexOf('function '+name+'(');assert(a>=0);return src.slice(a,src.indexOf('\n}',a)+2);}
const visible=html=>html.replace(/<details\b(?![^>]*\bopen\b)[^>]*>[\s\S]*?<\/details>/g,'');
function fixture(options={}){
 const values=new Map(Object.entries(options.values||{}));
 const S={groups:[{id:'g',name:'担当'}],shows:[{id:'archive',recoverySource:'original-workbooks'},{id:'show'}],
  songs:[{id:'original',lines:[{t:'保持する歌詞'}]}],rsongs:[{id:'rec',takes:{A:3}}],notes:[{id:'note',memo:'保持するメモ'}],
  plan:{slots:[{id:'slot',a0:600,a1:625,takes:{A:3}}]},staffMemos:{private:'保持'},ghToken:'',...options.state};
 const deny=()=>{throw Error('Settings rendering must not mutate, send or delete');};
 const c=vm.createContext({S,U:{showFilter:''},TextEncoder,Date,JSON,KEY:'utacheck.v1',idbOK:true,saveErr:false,
  localStorage:{get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k),setItem:deny,removeItem:deny},
  packState:x=>x,unpackState:x=>x,h:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  backupInFlight:false,startupRecoveryNetworkHold:false,bkSignature:()=>7,otherAt:0,syncComparison:null,syncReadReport:'',
  recoveryOriginalBackupHTML:()=>'<div id="recovery-original-backup-check">元の保存先を確認して復旧</div>',
  recordingInboxSettingsHTML:()=>'<button data-act="recording-inbox-enroll">自動受信を設定</button>',
  pianoHTML:()=>'<div class="pno">鍵盤</div>',pitchHTML:()=>'<button data-act="pitch-start">ピッチ</button>',metroHTML:()=>'<button data-act="metro-start">メトロノーム</button>',
  fetch:deny,save:deny,download:deny});
 for(const name of ['recoveryMaterialShow','storageSettingsHTML','practiceToolsSettingsHTML','backupSettingsHTML'])vm.runInContext(read(name),c);
 return {c,values,html:()=>c.backupSettingsHTML(),snapshot:()=>JSON.stringify({state:S,local:[...values]})};
}
test('normal settings keep backup visible and recovery, old materials and manual REC inputs closed',()=>{
 const f=fixture(),before=f.snapshot(),html=f.html(),shown=visible(html);
 assert.match(shown,/data-act="bkfile"/);
 for(const action of ['backup-file-restore','show-recovery','recording-schedule-update','recording-addition','recording-inbox-enroll']){
  assert.match(html,new RegExp('data-act="'+action+'"'));
  assert.doesNotMatch(shown,new RegExp('data-act="'+action+'"'));
 }
 assert.match(html,/data-id="__archive__"/);assert.doesNotMatch(shown,/data-id="__archive__"/);
 assert.equal(f.snapshot(),before);
});
test('recovery hold uses the existing file backup action even with saved cloud credentials',()=>{
 const f=fixture({state:{ghToken:'synthetic-token',bkGistId:'synthetic-id',bkAt:123,bkHash:7}});f.c.startupRecoveryNetworkHold=true;
 const html=f.html(),shown=visible(html);
 assert.match(shown,/クラウド保存・他端末との同期は停止中/);assert.match(shown,/data-act="bkfile"/);assert.doesNotMatch(html,/data-act="bknow"/);
 assert.match(html,/recovery-original-backup-check/);assert.match(html,/data-act="backup-restore"/);
 assert.doesNotMatch(html,/synthetic-token|synthetic-id/);
});
test('ordinary connected backup preserves cloud and file actions',()=>{
 const f=fixture({state:{ghToken:'synthetic-token',bkAt:123,bkHash:7}}),shown=visible(f.html());
 assert.match(shown,/data-act="bknow"/);assert.match(shown,/data-act="bkfile"/);
});
test('REC retains maintenance restore and manual additions without exposing LIVE archive navigation',()=>{
 const f=fixture({state:{recMode:true}}),before=f.snapshot(),html=f.html();
 assert.match(html,/data-act="backup-file-restore"/);assert.match(html,/data-act="recording-addition"/);
 assert.doesNotMatch(html,/data-act="show-recovery"|data-id="__archive__"/);assert.equal(f.snapshot(),before);
});
test('cloud conflict and failed save status stay visible instead of being collapsed',()=>{
 const f=fixture();f.c.otherAt=1;f.c.saveErr=true;f.c.S.bkError='合成保存エラー';
 const html=f.html(),shown=visible(html);
 assert.match(shown,/クラウドとこの端末に違い/);assert.match(shown,/data-act="backup-check"/);
 assert.match(shown,/合成保存エラー/);assert.match(html,/data-settings-panel="storage" open/);assert.match(shown,/いま保存できていません/);
});
test('old storage remains intact and no longer promises automatic removal of preserved originals',()=>{
 const original={shows:[{id:'old-show'}],songs:[{id:'old-song'}],notes:[{memo:'PRIVATE_NOTE'}]};
 const f=fixture({values:{'utacheck.v1:broken:123':JSON.stringify(original),'other-service':'PRIVATE_OTHER_VALUE'}}),before=f.snapshot();
 const html=f.c.storageSettingsHTML();
 assert.match(html,/復元用の原本は保持/);assert.match(html,/REC曲1件/);assert.doesNotMatch(html,/自動で片付|PRIVATE_NOTE|PRIVATE_OTHER_VALUE/);
 assert.match(html,/data-act="strayuse"/);assert.equal(f.snapshot(),before);
});
test('storage read failure still exposes current state size without mutation',()=>{
 const f=fixture(),before=f.snapshot();f.c.localStorage={get length(){throw Error('Denied');}};
 assert.match(f.c.storageSettingsHTML(),/いまのデータ/);assert.equal(f.snapshot(),before);
});
test('all three modes use one practice renderer and both editors use one storage renderer',()=>{
 assert.equal((src.match(/\$\{practiceToolsSettingsHTML\(\)\}/g)||[]).length,3);
 assert.equal((src.match(/\$\{storageSettingsHTML\(\)\}/g)||[]).length,1);
 const f=fixture(),html=f.c.practiceToolsSettingsHTML();
 assert.match(html,/data-settings-panel="practice"><summary>/);assert.match(html,/鍵盤/);assert.match(html,/pitch-start/);assert.match(html,/metro-start/);
});

test('private preparation status is rendered once outside closed maintenance panels',()=>{
 const f=fixture();f.c.PrivatePreparationUI={settingsHTML:()=>'<p data-private-preparation-status role="status">本人用準備</p><button data-act="private-preparation-check">今確認</button>'};
 const html=f.html(),shown=visible(html);
 assert.equal((html.match(/data-private-preparation-status/g)||[]).length,1);assert.match(shown,/data-private-preparation-status/);assert.match(shown,/data-act="private-preparation-check"/);
});
