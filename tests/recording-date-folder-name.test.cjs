'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const a=source.indexOf('function '+name+'('),start=source.lastIndexOf('\n',a)+1;assert(a>=0,name);return source.slice(start,source.indexOf('\n}',start)+2);};
function fixture(){
 const calls={save:0,undo:0,backup:0,alerts:[]};
 const S={recMode:true,groups:[],rsongId:'a',rsongs:[
  {id:'a',recArtist:'A',groupId:'g-a',folder:'legacy',recSession:{id:'session-a',label:'2026/10/8・9 再録',extra:{keep:true}},lines:[]},
  {id:'b',recArtist:'B',groupId:'g-b',folder:'legacy',recSession:{id:'session-b',label:'2026/10/8・9 再録'},lines:[]},
  {id:'c',recArtist:'A',recSession:{id:'other',label:'2026/10/14'},lines:[]}],
  notes:[{songId:'a',memo:'keep'}],recs:{'rec|a|1':{clip:'keep'}},plan:{slots:[{id:'slot',songId:'a'}]}};
 const c=vm.createContext({S,U:{recArtistFilter:'A',menu:null},preview:null,VIEW:()=>false,recordingInboxCanWrite:()=>true,
  h:s=>String(s??'').replace(/[<>&"]/g,k=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[k])),
  document:{activeElement:null},folderOf:x=>x?.folder || '',draftFormIsComposing:()=>false,prompt:()=> 'New REC',confirm:()=>true,alert:s=>calls.alerts.push(s),save:()=>calls.save++,pushUndo:()=>calls.undo++,render(){},renderSheet(){},
  automaticBackupBeforeEdit:async()=>{calls.backup++;return true;}});
 for(const name of ['performanceDateOrder','performanceSelectionOrder','recordingClassification','recordingSelectionSongs',
  'recordingDateInfo','canonicalRecordingFolderKey','recordingFolderKey','recordingDateBuckets','recordingDateHeading','recordingLibraryHTML','recordingDateContext',
  'organizeSheetHTML','recDateActionsHTML','recDateRenameHTML','openRecordingDateRename','recordingFolderError','recordingFolderDraftSnapshot','recordingFolderEditAllowed','recordingFolderNameConflict','setRecordingSongFolder','rememberRecordingFolder','updateRecordingFolderReferences','forgetEmptyRecordingFolder','finishRecordingFolderEdit','createRecordingFolder','moveRecordingSongToFolder','dropRecordingSongToFolder','removeRecordingDateFolder','resetRecordingDateFolderOrder','renameRecordingDateBucket','moveRecordingDateFolder','moveRecordingSong','recordingClassificationTarget','submitRecordingClassificationForm','editRecordingClassification','packState','unpackState'])vm.runInContext(read(name),c);
 vm.runInContext('const recordingClassificationSubmissions=new WeakSet();',c);
 const open=()=>{const key=c.recordingDateBuckets(c.recordingSelectionSongs()).find(b=>b.songs.some(s=>s.id==='a')).key;return c.U.menu=c.recordingDateContext(key);};
 return {c,calls,open};
}
test('REC dates are padded for display, ranges retained, and unknown years never inferred',()=>{
 const {c}=fixture();
 for(const [raw,label] of [['2026/10/8','2026/10/08'],['2026-10-08','2026/10/08'],['2026年10月8日','2026/10/08'],['261008','2026/10/08'],
  ['2026/10/8・9 再録','2026/10/08・2026/10/09 再録'],['2026/10/13–15','2026/10/13–2026/10/15'],
  ['10/8・9 REC','10/08・10/09（年未設定） REC'],['take10-15 2026/10/8','take10-15 2026/10/08']])assert.equal(c.recordingDateInfo(raw).label,label);
 assert.equal(c.recordingDateInfo('2026/02/30').date,null);assert.equal(c.recordingDateInfo('2026/10/13–12').date,null);
});
test('name changes touch only selected song displayLabel and survive backup roundtrip',async()=>{
 const {c,calls,open}=fixture(),before=JSON.parse(JSON.stringify(c.S)),menu=open();
 assert.deepEqual(Array.from(menu.songIds),['a']);assert.match(c.recDateActionsHTML(menu),/表示中の1曲/);
 assert.equal(await c.renameRecordingDateBucket(menu,'New REC'),true);
 before.rsongs[0].recSession.displayLabel='New REC';before.recordingFolders=['New REC'];
 assert.deepEqual(JSON.parse(JSON.stringify(c.S)),before);
 assert.equal(calls.save,1);assert.equal(calls.undo,1);assert.equal(calls.backup,1);
 assert.deepEqual(JSON.parse(JSON.stringify(c.unpackState(JSON.parse(JSON.stringify(c.packState(c.S)))).rsongs)),before.rsongs);
});
test('cancel, checkpoint failure, stale filter, owner changes and privilege loss refuse mutation',async()=>{
 for(const variant of ['cancel','backup','filter','state','readonly','viewer','menu']){
  const {c,calls,open}=fixture(),menu=open(),before=JSON.stringify(c.S.rsongs);
  const answer=variant==='cancel'?null:'New REC';
  if(variant==='viewer')c.VIEW=()=>true;
  c.automaticBackupBeforeEdit=async()=>{
   if(variant==='filter')c.U.recArtistFilter='B';
   if(variant==='state')c.S.notes[0].memo='newer';
   if(variant==='readonly')c.recordingInboxCanWrite=()=>false;
   if(variant==='menu')c.U.menu=null;
   return variant!=='backup';
  };
  assert.equal(await c.renameRecordingDateBucket(menu,answer),false,variant);
  assert.equal(JSON.stringify(c.S.rsongs),before,variant);assert.equal(calls.save,0,variant);assert.equal(calls.undo,0,variant);
 }
});
test('blank names are rejected and only owner settings show the menu',async()=>{
 const {c,open}=fixture();c.S.rsongs[0].recSession.displayLabel='Custom';c.prompt=()=>'';const menu=open();
 assert.equal(await c.renameRecordingDateBucket(menu,''),false);assert.equal(c.S.rsongs[0].recSession.displayLabel,'Custom');
 assert.equal(c.S.rsongs[0].recSession.id,'session-a');assert.equal(c.S.rsongs[0].recSession.label,'2026/10/8・9 再録');
 assert.match(c.recordingLibraryHTML(c.S.rsongs,x=>x.id,{editable:true}),/rec-date-actions/);
 assert(!c.recordingLibraryHTML(c.S.rsongs,x=>x.id).includes('rec-date-actions'));
 c.VIEW=()=>true;assert(!c.recordingLibraryHTML(c.S.rsongs,x=>x.id,{editable:true}).includes('rec-date-actions'));
});
test('unknown-date custom names stay separate and HTML-safe',()=>{
 const {c}=fixture();c.S.rsongs=[
  {id:'x',recArtist:'A',recSession:{id:'x',label:'日付未設定',displayLabel:'<Album A>'}},
  {id:'y',recArtist:'A',recSession:{id:'y',label:'日付未設定',displayLabel:'Album B'}}];
 const before=JSON.stringify(c.S),html=c.recordingLibraryHTML(c.S.rsongs,x=>x.id);
 assert.equal(c.recordingDateBuckets(c.S.rsongs).length,2);assert(html.includes('&lt;Album A&gt;'));assert(html.includes('Album B'));assert.equal(JSON.stringify(c.S),before);
});
test('editing artist and date preserves the session identity and custom name',async()=>{
 const {c}=fixture();c.S.rsongs[0].recSession.displayLabel='Custom';c.S.rsongs[0].recSession.folderDate='2026/10/22';c.editRecordingClassification('a');
 const fields={'#rec-classification-artist':{value:'Other artist'},'#rec-classification-date':{value:'2026/10/15'},'#rec-classification-error':{},'[type="submit"]':{}};
 await c.submitRecordingClassificationForm({isConnected:true,querySelector:selector=>fields[selector],setAttribute(){},removeAttribute(){}});
 assert.equal(c.S.rsongs[0].recSession.id,'session-a');
 assert.equal(c.S.rsongs[0].recSession.displayLabel,'Custom');
 assert.equal(c.S.rsongs[0].recSession.folderDate,'2026/10/22');
 assert.equal(c.S.rsongs[0].recSession.extra.keep,true);
 assert.equal(c.S.rsongs[0].recSession.label,'2026/10/15');
});
test('REC rename opens a focused draft form before backup and cancelling leaves saved content untouched',()=>{
 const {c,calls,open}=fixture(),before=JSON.stringify(c.S),menu=open();
 c.prompt=()=>{throw Error('Native prompt must not open');};
 assert.equal(c.openRecordingDateRename(menu),true);assert.equal(c.U.menu.kind,'rec-date-rename');
 const html=c.recDateRenameHTML(c.U.menu);
 assert.match(html,/id="organize-form" data-save-on-submit/);
 assert.match(html,/id="org-name"/);
 assert.equal(calls.backup,0);assert.equal(calls.save,0);c.U.menu=null;assert.equal(JSON.stringify(c.S),before);
});
test('REC folders reorder in the selected artist scope and retain their order through rename and backup',async()=>{
 const {c,calls,open}=fixture(),before=JSON.parse(JSON.stringify(c.S));
 const initial=c.recordingDateBuckets(c.recordingSelectionSongs()).map(bucket=>bucket.key),scope=JSON.stringify(['A']);
 assert.equal(await c.moveRecordingDateFolder(initial[0],initial[1]),true);
 assert.deepEqual(Array.from(c.recordingDateBuckets(c.recordingSelectionSongs()),bucket=>bucket.key),Array.from(initial).reverse());
 assert.deepEqual(JSON.parse(JSON.stringify(c.S.rsongs)),before.rsongs);
 const saved=JSON.parse(JSON.stringify(c.unpackState(JSON.parse(JSON.stringify(c.packState(c.S))))));
 assert.deepEqual(saved.recordingDateFolderOrders[scope],Array.from(initial).reverse());
 c.U.recArtistFilter='';assert.deepEqual(Array.from(c.recordingDateBuckets(c.recordingSelectionSongs()),bucket=>bucket.key),Array.from(initial));
 c.U.recArtistFilter='A';const menu=open();assert.equal(await c.renameRecordingDateBucket(menu,'Rehearsal'),true);
 const renamed=c.recordingDateBuckets(c.recordingSelectionSongs());assert.equal(renamed[0].displayLabel,'Rehearsal');assert.equal(renamed[0].songs[0].id,'a');
 assert.deepEqual(Array.from(c.S.recordingDateFolderOrders[scope]),Array.from(renamed,bucket=>bucket.key));
 assert.equal(calls.backup,2);assert.equal(calls.save,2);assert.equal(calls.undo,2);
});
test('renaming a shared date after reordering retains remaining artists and assigns the new name the same position',async()=>{
 const {c,open}=fixture();c.U.recArtistFilter='';
 const initial=c.recordingDateBuckets(c.recordingSelectionSongs()).map(bucket=>bucket.key);
 await c.moveRecordingDateFolder(initial[0],initial[1]);
 c.U.recArtistFilter='A';await c.renameRecordingDateBucket(open(),'Only A');
 c.U.recArtistFilter='';const dates=c.recordingDateBuckets(c.recordingSelectionSongs());
 assert.deepEqual(Array.from(dates,bucket=>bucket.songs.map(song=>song.id).join(',')),['b','a','c']);
 assert.equal(c.S.rsongs[1].recSession.displayLabel,undefined);
});
test('REC folder dragging refuses stale state, ownership loss and filtered-out destinations',async()=>{
 for(const variant of ['backup','filter','state','readonly','viewer','mode','menu','target']){
  const {c,calls}=fixture(),keys=c.recordingDateBuckets(c.recordingSelectionSongs()).map(bucket=>bucket.key);
  c.automaticBackupBeforeEdit=async()=>{
   if(variant==='filter')c.U.recArtistFilter='B';
   if(variant==='state')c.S.notes[0].memo='changed';
   if(variant==='readonly')c.recordingInboxCanWrite=()=>false;
   if(variant==='viewer')c.VIEW=()=>true;
   if(variant==='mode')c.S.recMode=false;
   if(variant==='menu')c.U.menu={kind:'rec-song-actions'};
   return variant!=='backup';
  };
  assert.equal(await c.moveRecordingDateFolder(keys[0],variant==='target'?'missing':keys[1]),false,variant);
  assert.equal(c.S.recordingDateFolderOrders,undefined,variant);assert.equal(calls.save,0,variant);assert.equal(calls.undo,0,variant);
 }
});
test('REC song dragging only reorders the visible date and artist without changing saved folder classification',async()=>{
 const {c,calls}=fixture();c.S.rsongs.push({...JSON.parse(JSON.stringify(c.S.rsongs[0])),id:'d',folder:'another legacy folder'});
 const before=JSON.parse(JSON.stringify(c.S.rsongs));
 assert.equal(await c.moveRecordingSong('a','c'),false,'another date');
 c.U.recArtistFilter='';assert.equal(await c.moveRecordingSong('a','b'),false,'another artist');
 c.U.recArtistFilter='B';assert.equal(await c.moveRecordingSong('a','d'),false,'hidden source');
 c.U.recArtistFilter='A';assert.equal(await c.moveRecordingSong('a','d'),true);
 assert.deepEqual(Array.from(c.S.rsongs,song=>song.id),['d','b','c','a']);
 assert.equal(c.U.songIdx,3);assert.equal(c.S.rsongId,'a');
 assert.deepEqual(JSON.parse(JSON.stringify(c.S.rsongs)).sort((a,b)=>a.id.localeCompare(b.id)),before.sort((a,b)=>a.id.localeCompare(b.id)));
 assert.equal(calls.undo,1);assert.equal(calls.save,1);assert.equal(calls.backup,1);
});
test('REC reorder resolves saved song identities again after an equal-content state refresh',async()=>{
 const {c}=fixture();c.S.rsongs.push({...JSON.parse(JSON.stringify(c.S.rsongs[0])),id:'d'});
 c.automaticBackupBeforeEdit=async()=>{c.S=JSON.parse(JSON.stringify(c.S));return true;};
 assert.equal(await c.moveRecordingSong('a','d'),true);
 assert.deepEqual(Array.from(c.S.rsongs,song=>song.id),['d','b','c','a']);
 assert.equal(c.U.songIdx,3);assert.equal(Object.hasOwn(c.S.rsongs,'-1'),false);
});
test('REC rename refuses a changed draft during the backup and preserves its saved name',async()=>{
 const {c,calls,open}=fixture(),menu=open(),input={id:'org-name',value:'New REC'},form={isConnected:true,elements:[],querySelector:()=>null};
 form.elements=[input];c.draftFormIsComposing=()=>false;
 c.automaticBackupBeforeEdit=async()=>{input.value='More recent draft';return true;};
 assert.equal(await c.renameRecordingDateBucket(menu,'New REC',form),false);
 assert.equal(c.S.rsongs[0].recSession.displayLabel,undefined);assert.equal(c.U.menu,menu);assert.equal(calls.undo,0);assert.equal(calls.save,0);
});
test('the renamed folder heading replaces its date and merges legacy same-name date buckets without editing songs',()=>{
 const {c}=fixture();c.U.recArtistFilter='';
 c.S.rsongs[0].recSession.displayLabel='Session';c.S.rsongs[2].recSession.displayLabel='Session';
 c.S.recordingDateFolderOrders={'[""]':[JSON.stringify(['2026/10/14','Session']),JSON.stringify(['2026/10/8・9 再録','Session']),JSON.stringify(['2026/10/8・9 再録',''])]};
 const before=JSON.stringify(c.S),buckets=c.recordingDateBuckets(c.S.rsongs);
 assert.equal(buckets.length,2);assert.equal(buckets[0].key,'["Session"]');assert.equal(c.recordingDateHeading(buckets[0]),'Session');
 assert.deepEqual(Array.from(buckets[0].songs,song=>song.id),['a','c']);assert.equal(JSON.stringify(c.S),before);
});
test('empty folders can be created, renamed, saved and removed without changing songs or records',async()=>{
 const {c,calls}=fixture(),before=JSON.stringify([c.S.rsongs,c.S.notes,c.S.recs,c.S.plan]);
 c.U.menu={kind:'rec-folder-create',artistFilter:'A'};
 assert.equal(await c.createRecordingFolder(c.U.menu,' Empty Folder '),true);
 const empty=c.recordingDateBuckets(c.recordingSelectionSongs()).find(bucket=>bucket.key==='["Empty Folder"]');
 assert.equal(empty.songs.length,0);assert(!c.recordingDateBuckets(c.recordingSelectionSongs(),false).some(bucket=>bucket.key===empty.key));
 c.U.menu=c.recordingDateContext(empty.key);assert.equal(await c.renameRecordingDateBucket(c.U.menu,'Ready'),true);
 assert.deepEqual(Array.from(c.S.recordingFolders),['Ready']);
 const restored=c.unpackState(JSON.parse(JSON.stringify(c.packState(c.S))));assert.deepEqual(Array.from(restored.recordingFolders),['Ready']);
 c.U.menu=c.recordingDateContext('["Ready"]');assert.equal(await c.removeRecordingDateFolder(c.U.menu),true);
 assert.deepEqual(Array.from(c.S.recordingFolders),[]);assert.equal(JSON.stringify([c.S.rsongs,c.S.notes,c.S.recs,c.S.plan]),before);
 assert.equal(calls.save,3);assert.equal(calls.undo,3);
});
test('move to an explicit folder changes the visible folder while retaining dates, artists, session IDs and legacy data',async()=>{
 const {c}=fixture(),before=JSON.parse(JSON.stringify(c.S));c.S.recordingFolders=['Takes'];
 c.U.menu={kind:'rec-folder-move',id:'a',artistFilter:'A'};
 assert.equal(await c.moveRecordingSongToFolder(c.U.menu,'["Takes"]'),true);
 assert.equal(c.recordingFolderKey(c.S.rsongs[0]),'["Takes"]');
 before.rsongs[0].recSession.displayLabel='Takes';before.recordingFolders=['Takes'];
 assert.deepEqual(JSON.parse(JSON.stringify(c.S)),before);
 c.U.menu={kind:'rec-folder-move',id:'c',artistFilter:'A'};
 assert.equal(await c.moveRecordingSongToFolder(c.U.menu,'["Takes"]'),true);
 const bucket=c.recordingDateBuckets(c.recordingSelectionSongs()).find(bucket=>bucket.key==='["Takes"]');
 assert.deepEqual(Array.from(bucket.songs,song=>song.id),['a','c']);assert.equal(c.S.rsongs[2].recSession.label,'2026/10/14');
 c.U.menu={kind:'rec-folder-move',id:'a',artistFilter:'A'};
 assert.equal(await c.moveRecordingSongToFolder(c.U.menu,''),true);assert.equal(c.S.rsongs[0].recSession.folderless,true);
 assert.equal(c.S.rsongs[0].recSession.displayLabel,undefined);assert.equal(c.S.rsongs[0].recSession.label,'2026/10/8・9 再録');
});
test('dragging into a default date folder preserves the actual recording date and does not create a duplicate title',async()=>{
 const {c}=fixture(),dateKey=c.recordingFolderKey(c.S.rsongs[2]);
 assert.equal(await c.dropRecordingSongToFolder('a',dateKey),true);assert.equal(c.U.menu,null);
 assert.equal(c.S.rsongs[0].recSession.folderDate,'2026/10/14');assert.equal(c.S.rsongs[0].recSession.label,'2026/10/8・9 再録');
 assert.equal(c.recordingFolderKey(c.S.rsongs[0]),dateKey);assert.equal(c.recordingDateBuckets(c.recordingSelectionSongs()).length,1);
 assert.equal(c.S.rsongs[0].folder,'legacy');assert.equal(c.S.rsongs[0].recArtist,'A');
});
test('new-folder move normalizes names, prevents duplicates and retains an emptied explicit source',async()=>{
 const {c}=fixture();c.S.rsongs[0].recSession.displayLabel='Original';
 c.U.menu={kind:'rec-folder-move',id:'a',artistFilter:'A'};
 assert.equal(await c.moveRecordingSongToFolder(c.U.menu,'__new_folder__',' Cafe\u0301 '),true);
 assert.equal(c.recordingFolderKey(c.S.rsongs[0]),'["Café"]');assert.deepEqual(Array.from(c.S.recordingFolders),['Original','Café']);
 assert.equal(c.recordingDateBuckets(c.recordingSelectionSongs()).find(bucket=>bucket.key==='["Original"]').songs.length,0);
 c.U.menu={kind:'rec-folder-create',artistFilter:'A'};const before=JSON.stringify(c.S);
 assert.equal(await c.createRecordingFolder(c.U.menu,'Cafe\u0301'),false);assert.equal(JSON.stringify(c.S),before);
});
test('deleting a folder only removes the visible scope and leaves every song and recording intact',async()=>{
 const {c,open}=fixture(),before=JSON.parse(JSON.stringify(c.S));
 c.S.rsongs[0].recSession.displayLabel='Shared';c.S.rsongs[1].recSession.displayLabel='Shared';c.S.recordingFolders=['Shared'];
 assert.equal(await c.removeRecordingDateFolder(open()),true);
 before.rsongs[0].recSession.folderless=true;before.rsongs[1].recSession.displayLabel='Shared';before.recordingFolders=['Shared'];
 assert.deepEqual(JSON.parse(JSON.stringify(c.S)),before);assert.equal(c.recordingFolderKey(c.S.rsongs[1]),'["Shared"]');
 assert.equal(c.recordingDateContext('[""]'),null);
 c.U.recArtistFilter='B';c.U.menu=c.recordingDateContext('["Shared"]');assert.equal(await c.removeRecordingDateFolder(c.U.menu),true);
 assert.deepEqual(Array.from(c.S.recordingFolders),[]);assert.equal(c.S.rsongs.length,3);
});
test('folderless songs stay last and cannot participate in folder drag; reset changes only current artist order',async()=>{
 const {c}=fixture();c.S.rsongs[0].recSession.folderless=true;c.S.recordingFolders=['Empty'];
 const scope=JSON.stringify(['A']),other=JSON.stringify(['B']),date=c.recordingFolderKey(c.S.rsongs[2]);
 c.S.recordingDateFolderOrders={[scope]:['[""]','["Empty"]',date],[other]:['kept']};
 let buckets=c.recordingDateBuckets(c.recordingSelectionSongs());assert.equal(buckets.at(-1).folderless,true);
 assert.equal(await c.moveRecordingDateFolder('[""]',date),false);
 assert.equal(await c.moveRecordingDateFolder(date,'["Empty"]'),true);
 assert(!c.S.recordingDateFolderOrders[scope].includes('[""]'));
 assert.equal(await c.resetRecordingDateFolderOrder(),true);assert.equal(c.S.recordingDateFolderOrders[scope],undefined);assert.deepEqual(Array.from(c.S.recordingDateFolderOrders[other]),['kept']);
 buckets=c.recordingDateBuckets(c.recordingSelectionSongs());assert.equal(buckets[0].key,date);assert.equal(buckets.at(-1).folderless,true);
});
test('create, move and delete refuse stale state, scope changes, failed backup or cancelled confirmation',async()=>{
 for(const action of ['create','move','delete'])for(const failure of ['backup','filter','state','readonly','menu','cancel']){
  const {c,calls,open}=fixture();c.S.recordingFolders=['Destination'];const before=JSON.stringify(c.S.rsongs);
  c.U.menu=action==='create'?{kind:'rec-folder-create',artistFilter:'A'}:action==='move'?{kind:'rec-folder-move',id:'a',artistFilter:'A'}:open();
  if(failure==='cancel'&&action==='delete')c.confirm=()=>false;
  c.automaticBackupBeforeEdit=async()=>{
   if(failure==='filter')c.U.recArtistFilter='B';if(failure==='state')c.S.notes[0].memo='new';
   if(failure==='readonly')c.recordingInboxCanWrite=()=>false;if(failure==='menu')c.U.menu=null;
   return failure!=='backup' && failure!=='cancel';
  };
  const result=action==='create'?await c.createRecordingFolder(c.U.menu,'New'):action==='move'?await c.moveRecordingSongToFolder(c.U.menu,'["Destination"]'):await c.removeRecordingDateFolder(c.U.menu);
  assert.equal(result,false,action+'/'+failure);assert.equal(JSON.stringify(c.S.rsongs),before);assert.deepEqual(Array.from(c.S.recordingFolders),['Destination']);assert.equal(calls.save,0);assert.equal(calls.undo,0);
 }
});
test('folder create and move preserve pending input after failed backup or a changed draft',async()=>{
 for(const action of ['create','move'])for(const failure of ['backup','draft']){
  const {c}=fixture(),input={id:'org-name',value:'New'},error={hidden:true},form={isConnected:true,elements:[input],querySelector:id=>id==='#org-error'?error:null};
  c.S.recordingFolders=['Destination'];c.U.menu={kind:action==='create'?'rec-folder-create':'rec-folder-move',id:'a',artistFilter:'A'};
  c.automaticBackupBeforeEdit=async()=>{if(failure==='draft')input.value='Newer';return failure!=='backup';};
  const before=JSON.stringify(c.S),menu=c.U.menu;
  const result=action==='create'?await c.createRecordingFolder(menu,'New',form):await c.moveRecordingSongToFolder(menu,'["Destination"]','',form);
  assert.equal(result,false);assert.equal(JSON.stringify(c.S),before);assert.equal(c.U.menu,menu);assert.equal(error.hidden,false);assert(error.textContent);
 }
});
test('folder creation and deletion undo restore the empty folders, order and complete recording data',async()=>{
 const {c,open}=fixture();Object.assign(c.S,{recordingFolders:['Empty'],recordingDateFolderOrders:{'["A"]':['["Empty"]']},performanceFolderOrders:{}});
 vm.runInContext('let undoStack=[];'+read('pushUndo'),c);c.schedulePush=()=>{};
 const start=source.indexOf('    case "undo":'),end=source.indexOf('    case "jump":',start);
 vm.runInContext('function undoAction(){switch("undo"){'+source.slice(start,end)+'}}',c);
 const before=JSON.stringify(c.S);c.U.menu={kind:'rec-folder-create',artistFilter:'A'};
 assert.equal(await c.createRecordingFolder(c.U.menu,'New'),true);c.undoAction();assert.equal(JSON.stringify(c.S),before);
 assert.equal(await c.removeRecordingDateFolder(open()),true);c.undoAction();assert.equal(JSON.stringify(c.S),before);
});
