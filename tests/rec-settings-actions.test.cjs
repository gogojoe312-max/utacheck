'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(i,source.indexOf('\n}',i)+2);};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const calls=[],S={recMode:true,rsongId:'one',groups:[{id:'private',name:'Existing REC'}],rsongs:[
  {id:'one',title:'今日を胸に いつまでも続く長い曲名 <first>',groupId:'private',folder:'Existing folder',recArtist:'Singer',recSession:{id:'day',label:'2026/10/8'},lines:[{t:'Kept lyric',parts:['member']}],cols:1},
  {id:'two',title:'Super Duper Long Title That Must Stay Completely Visible',groupId:'private',folder:'Other folder',recArtist:'Singer',recSession:{id:'day',label:'2026/10/8'},lines:[{t:'Other lyric',parts:[]}],cols:2}],
  notes:[{id:'note',songId:'one',memo:'Kept memo'}],staffMemos:{one:'Private'},recs:{audio:{size:23}},plan:{slots:[{id:'slot',takes:{A:3}}]},trash:[],ghToken:'',rfolderOrder:['Existing folder','Empty old folder'],rfolders:{'Existing folder':true}};
 const h=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const c=vm.createContext({S,U:{view:'setup',busy:''},h,VIEW:()=>false,preview:null,recordingInboxCanWrite:()=>true,Date,JSON,overlay:null,pendingRender:false,
  resumeRender(){},typingNow:()=>false,document:{activeElement:null,body:{appendChild:x=>calls.push({append:x.innerHTML})},createElement:()=>({className:'',innerHTML:'',remove(){calls.push({remove:true});}})},
  recMemberSelector:()=>'',lyricDisplaySettings:()=>'',recordingPlanEntryHTML:()=>'',practiceToolsSettingsHTML:()=>'',backupSettingsHTML:()=>'',footerHTML:()=>'',
  save:()=>calls.push({save:true}),render:()=>calls.push({render:true}),renderSheet:()=>calls.push({menu:clone(c.U.menu)}),
  confirm:()=>false,recSong:()=>S.rsongs.find(s=>s.id===S.rsongId),SONGS:()=>S.rsongs,
  editRecordingClassification:id=>calls.push({classify:id,menu:clone(c.U.menu)}),toTrash(){throw Error('Unexpected deletion');}});
 for(const name of ['performanceDateOrder','performanceSelectionOrder','recordingClassification','recordingSelectionSongs','recordingDateInfo','recordingDateBuckets','recordingDateHeading','recordingLibraryHTML','recordingGroupSelector','recSongActionsHTML','viewSetupRec'])vm.runInContext(read(name),c);
 const branch=(name,next)=>{const start=source.indexOf('case "'+name+'":');return source.slice(start,source.indexOf('case "'+next+'":',start));};
 const cleanupStart=source.indexOf('  // The compact REC menu delegates'),cleanupEnd=source.indexOf('  switch (a)',cleanupStart);
 vm.runInContext('function action(a,id){'+source.slice(cleanupStart,cleanupEnd)+'switch(a){'+[
  branch('rec-song-actions','rec-artist-filter'),branch('rpdf','goplan'),branch('rec-classify','ruse'),branch('rfset','rfrename'),branch('rdel','rpick')
 ].join('\n')+'}}',c);
 return {c,S,calls};
}
test('REC settings give every full title one selection action and one menu without changing saved classification',()=>{
 const f=fixture(),before=JSON.stringify(f.S),html=f.c.viewSetupRec();
 assert.equal((html.match(/class="settings-song-title"/g)||[]).length,2);
 for(const song of f.S.rsongs){assert(html.includes(f.c.h(song.title)));assert(html.includes('data-act="ruse" data-id="'+song.id+'"'));assert(html.includes('data-act="rec-song-actions" data-id="'+song.id+'"'));}
 for(const action of ['rpdf','rec-classify','rfset','rdel','newfolder'])assert(!html.includes('data-act="'+action+'"'));
 assert(!html.includes('RECはすべて本人用'));assert(!html.includes('日付 → アーティスト → 曲'));assert(html.includes('LIVEへ切替'));
 assert(html.includes('歌割り・歌詞ファイルを読み込む（Word/PDF/Excel）'));assert(html.includes('2026/10/8'));assert(html.includes('Singer'));
 assert.equal(JSON.stringify(f.S),before);assert.deepEqual(f.calls,[]);
});
test('REC action menu retains PDF, explicit classification, legacy folder movement and confirmed deletion',()=>{
 const f=fixture(),before=JSON.stringify(f.S),html=f.c.recSongActionsHTML('one');
 for(const action of ['rpdf','rec-classify','rfset','rdel'])assert.equal((html.match(new RegExp('data-act="'+action+'"','g'))||[]).length,1);
 assert(html.includes('PDFにする'));assert(html.includes('日付・アーティストを変更'));assert(html.includes('保存フォルダを変更'));assert(html.includes('曲を削除'));
 assert(html.includes('class="sheet organize-sheet"'));assert(html.includes(f.c.h(f.S.rsongs[0].title)));assert(!html.includes('<first>'));
 assert.equal(f.c.recSongActionsHTML('missing'),'');f.c.VIEW=()=>true;assert.equal(f.c.recSongActionsHTML('one'),'');
 assert.equal(JSON.stringify(f.S),before);assert.deepEqual(f.calls,[]);
});
test('REC menu routes to the original actions and closes before another screen, prompt or confirmation',()=>{
 for(const action of ['rpdf','rec-classify','rfset','rdel']){
  const f=fixture(),before=JSON.stringify(f.S);f.c.action('rec-song-actions','one');assert.equal(f.c.U.menu.kind,'rec-song-actions');
  f.c.action(action,'one');
  assert.equal(f.calls[1].menu,null,'old menu closes first');
  if(action==='rpdf'){assert.equal(f.c.U.view,'recprint');assert.equal(f.c.U.pdfBack,'setup');assert.equal(f.c.U.menu,null);}
  if(action==='rec-classify')assert.deepEqual(f.calls.find(x=>x.classify),{classify:'one',menu:null});
  if(action==='rfset')assert.deepEqual(clone(f.c.U.menu),{kind:'organize',mode:'move',rec:true,id:'one'});
  if(action==='rdel')assert.equal(f.c.U.menu,null,'cancelled deletion stays cancelled');
  assert.equal(JSON.stringify(f.S),before,action);
 }
});
test('stale REC action targets and member-mode menu requests cannot affect another song',()=>{
 const f=fixture(),before=JSON.stringify(f.S);f.c.action('rec-song-actions','one');const calls=f.calls.length;
 f.c.action('rpdf','two');assert.equal(f.calls.length,calls);assert.equal(f.c.U.view,'setup');assert.equal(f.c.U.menu.id,'one');
 f.c.U.menu=null;f.c.VIEW=()=>true;f.c.action('rec-song-actions','one');assert.equal(f.c.U.menu,null);
 f.c.VIEW=()=>false;f.c.action('rec-song-actions','missing');assert.equal(f.c.U.menu,null);assert.equal(JSON.stringify(f.S),before);
});
test('renderSheet opens and removes the compact REC menu without touching saved data',()=>{
 const f=fixture(),before=JSON.stringify(f.S);vm.runInContext(read('renderSheet'),f.c);
 f.c.U.menu={kind:'rec-song-actions',id:'one'};f.c.renderSheet();assert(f.calls.at(-1).append.includes('曲の操作'));
 f.c.U.menu={kind:'rec-song-actions',id:'missing'};f.c.renderSheet();assert.equal(f.c.U.menu,null);assert.equal(f.c.overlay,null);
 assert.equal(JSON.stringify(f.S),before);
});
test('backup conflicts retain one file preservation and one cloud inspection entry with all status details',()=>{
 for(const hold of [false,true]){
  const f=fixture();Object.assign(f.c,{backupInFlight:false,startupRecoveryNetworkHold:hold,otherAt:1,syncComparison:{localShows:['Local'],cloudShows:['Cloud']},
   bkSignature:()=>7,storageSettingsHTML:()=>'<div>Storage kept</div>',recoveryOriginalBackupHTML:()=>'<div>Recovery kept</div>'});
  Object.assign(f.S,{ghToken:'synthetic',bkGistId:'existing',bkAt:123,bkHash:7});vm.runInContext(read('backupSettingsHTML'),f.c);
  const before=JSON.stringify(f.S),html=f.c.backupSettingsHTML();
  assert.equal((html.match(/data-act="bkfile"/g)||[]).length,1);assert.equal((html.match(/data-act="backup-check"/g)||[]).length,1);
  assert(html.includes('クラウドとこの端末に違い'));assert(html.includes('Local'));assert(html.includes('Cloud'));assert(html.includes('Storage kept'));
  if(hold){assert(!html.includes('data-act="bknow"'));assert(html.includes('Recovery kept'));}else assert(html.includes('data-act="bknow"'));
  assert.equal(JSON.stringify(f.S),before);assert.deepEqual(f.calls,[]);
 }
});
