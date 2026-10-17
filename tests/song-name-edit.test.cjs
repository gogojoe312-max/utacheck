const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(source.lastIndexOf('\n',i)+1,source.indexOf('\n}',i)+2);};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(rec=false){
 const calls={backup:0,save:0,publish:0,undo:[],render:0,sheet:0},fields={};let finish;
 const item=id=>({id,title:'現在の曲名 <'+id+'>',groupId:'group',showId:'show',folder:'フォルダ',recArtist:'Singer',recSession:{id:'session',label:'2026/10/13–15',displayLabel:'表示名'},lines:[{id:'line',t:'変えない歌詞'}],xls:'source.xlsx'});
 const S={recMode:rec,groups:[],songs:[item('live'),item('live-other')],rsongs:[item('rec'),item('rec-other')],showId:'show',rsongId:'rec',notes:[{songId:'rec',memo:'記録'}],recs:{rec:{audio:'keep'}},plan:{slots:[{songId:'rec',takes:{A:3}}]}};
 const form={isConnected:true,querySelector:selector=>fields[selector],setAttribute(){},removeAttribute(){}};
 for(const selector of ['#song-name','#song-name-error','#rec-classification-artist','#rec-classification-date','#rec-classification-error','[type="submit"]'])fields[selector]={value:'',hidden:true,disabled:false};
 const c=vm.createContext({S,U:{menu:{kind:rec?'rec-song-actions':'song',id:rec?'rec':'live'}},VIEW:()=>false,preview:null,recordingInboxCanWrite:()=>true,
  h:s=>String(s).replace(/[<>&"]/g,x=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[x])),WeakSet,document:{activeElement:{blur(){}}},draftFormIsComposing:()=>false,
  rememberRecordingSelection(){},renderSheet(){calls.sheet++;},render(){calls.render++;},save(){calls.save++;},schedulePush(){calls.publish++;},pushUndo(id){calls.undo.push(id);},
  automaticBackupBeforeEdit(){calls.backup++;return new Promise(resolve=>{finish=resolve;});}});
 vm.runInContext('const songRenameSubmissions=new WeakSet(),recordingClassificationSubmissions=new WeakSet();',c);
 for(const name of ['songRenameTarget','openSongRename','songRenameSheetHTML','submitSongRenameForm','recordingClassification','recordingClassificationTarget','editRecordingClassification','recordingClassificationSheetHTML','submitRecordingClassificationForm'])vm.runInContext(read(name),c);
 return {c,S,form,fields,calls,finish:value=>finish(value),open(){assert(c.openSongRename(c.U.menu));fields['#song-name'].value=c.U.menu.originalTitle;},classify(){assert(c.editRecordingClassification('rec'));const info=c.recordingClassification(S.rsongs[0]);fields['#rec-classification-artist'].value=info.artist;fields['#rec-classification-date'].value=info.label;}};
}
test('LIVE and REC open the same song name form synchronously, prefilling the current name without backup',()=>{
 for(const rec of [false,true]){const f=fixture(rec),before=JSON.stringify(f.S);f.open();const html=f.c.songRenameSheetHTML(f.c.U.menu);
  assert(html.includes('id="song-rename-form" data-save-on-submit'));assert(html.includes('id="song-name"'));assert(html.includes('曲名を変更'));assert(html.includes('&lt;'+(rec?'rec':'live')+'&gt;'));assert(!html.includes('<live>'));assert.equal(f.calls.sheet,1);assert.equal(f.calls.backup,0);assert.equal(JSON.stringify(f.S),before);
 }
 assert(source.includes('B("song-rename", "曲名を変更")'));assert(source.includes('action("song-rename", "曲名を変更")'));assert(!source.includes('prompt("曲名",'));
});
test('renaming changes only the selected title, keeps lyrics/session/audio/identity and saves after backup',async()=>{
 for(const rec of [false,true]){const f=fixture(rec),expected=clone(f.S);f.open();f.fields['#song-name'].value='  新しい曲名  ';const pending=f.c.submitSongRenameForm(f.form);
  assert.equal(f.calls.save,0);assert.deepEqual(clone(f.S),expected);f.finish(true);assert.equal(await pending,true);expected[rec?'rsongs':'songs'][0].title='新しい曲名';assert.deepEqual(clone(f.S),expected);assert.equal(f.calls.save,1);assert.equal(f.calls.publish,rec?0:1);assert.deepEqual(f.calls.undo,[rec?undefined:'live']);
  f.c.U.menu={kind:rec?'rec-song-actions':'song',id:rec?'rec':'live'};f.open();assert.equal(f.fields['#song-name'].value,'新しい曲名');
 }
});
test('blank name, composition and unchanged name never create backups or mutations',async()=>{
 for(const rec of [false,true]){const f=fixture(rec),before=JSON.stringify(f.S);f.open();f.fields['#song-name'].value=' ';assert.equal(await f.c.submitSongRenameForm(f.form),false);assert.equal(f.fields['#song-name-error'].hidden,false);
  f.fields['#song-name'].value='変換中';f.c.draftFormIsComposing=()=>true;assert.equal(await f.c.submitSongRenameForm(f.form),false);f.c.draftFormIsComposing=()=>false;f.fields['#song-name'].value=f.c.U.menu.originalTitle;assert.equal(await f.c.submitSongRenameForm(f.form),true);assert.equal(f.calls.backup,0);assert.equal(f.calls.save,0);assert.equal(JSON.stringify(f.S),before);
 }
});
test('backup failure retains the song draft and a second submit can save it',async()=>{
 const f=fixture(true);f.open();f.fields['#song-name'].value='変更名';let pending=f.c.submitSongRenameForm(f.form);f.finish(false);assert.equal(await pending,false);assert.equal(f.calls.save,0);assert.equal(f.fields['#song-name'].value,'変更名');assert.equal(f.fields['[type="submit"]'].disabled,false);
 pending=f.c.submitSongRenameForm(f.form);f.finish(true);assert.equal(await pending,true);assert.equal(f.S.rsongs[0].title,'変更名');
});
test('cancel, state change, permission loss and draft edits while backup waits cannot save a stale song rename',async()=>{
 for(const change of [f=>{f.c.U.menu=null;},f=>{f.form.isConnected=false;},f=>{f.S.notes.push({memo:'new'});},f=>{f.fields['#song-name'].value='別名';},f=>{f.c.recordingInboxCanWrite=()=>false;},f=>{f.c.VIEW=()=>true;},f=>{f.S.recMode=false;}]){
  const f=fixture(true);f.open();f.fields['#song-name'].value='保存しない';const pending=f.c.submitSongRenameForm(f.form);change(f);f.finish(true);assert.equal(await pending,false);assert.equal(f.calls.save,0);assert.equal(f.S.rsongs[0].title,'現在の曲名 <rec>');
 }
});
test('duplicate submit makes one backup and one rename',async()=>{
 const f=fixture();f.open();f.fields['#song-name'].value='一度だけ';const pending=f.c.submitSongRenameForm(f.form);assert.equal(await f.c.submitSongRenameForm(f.form),false);f.finish(true);await pending;assert.equal(f.calls.backup,1);assert.equal(f.calls.save,1);
});
test('REC classification is one draft sheet with current date and artist and no prompt',()=>{
 const f=fixture(true),before=JSON.stringify(f.S);f.classify();const html=f.c.recordingClassificationSheetHTML(f.c.U.menu);
 for(const text of ['id="rec-classification-form" data-save-on-submit','id="rec-classification-date"','id="rec-classification-artist"','2026/10/13–15','Singer','閉じる','保存'])assert(html.includes(text));assert.equal(JSON.stringify(f.S),before);assert.equal(f.calls.backup,0);assert(!read('editRecordingClassification').includes('prompt('));
});
test('classification save preserves song name, IDs, folder display name and existing session while applying explicit fields',async()=>{
 const f=fixture(true),expected=clone(f.S);f.classify();f.fields['#rec-classification-artist'].value='Other artist';f.fields['#rec-classification-date'].value='2026/10/16';const pending=f.c.submitRecordingClassificationForm(f.form);assert.equal(f.calls.save,0);f.finish(true);assert.equal(await pending,true);
 expected.rsongs[0].recArtist='Other artist';expected.rsongs[0].recSession.label='2026/10/16';assert.deepEqual(clone(f.S),expected);assert.equal(f.calls.save,1);assert.equal(f.calls.publish,0);assert.equal(f.c.U.recArtistFilter,'');
});
test('classification backup failure, input changes and cancelled dialog preserve data and draft',async()=>{
 for(const action of ['failure','edit','cancel','state']){const f=fixture(true);f.classify();const before=JSON.stringify(f.S);f.fields['#rec-classification-date'].value='2026/11/01';const pending=f.c.submitRecordingClassificationForm(f.form);
  if(action==='edit')f.fields['#rec-classification-artist'].value='New artist';if(action==='cancel')f.c.U.menu=null;if(action==='state')f.S.notes.push({memo:'changed'});f.finish(action!=='failure');assert.equal(await pending,false);assert.equal(f.calls.save,0);assert.equal(f.fields['#rec-classification-date'].value,'2026/11/01');if(action!=='state')assert.equal(JSON.stringify(f.S),before);
 }
});
