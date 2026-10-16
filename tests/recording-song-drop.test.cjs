'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const start=source.indexOf('function '+name+'(');assert(start>=0,name);return source.slice(source.lastIndexOf('\n',start)+1,source.indexOf('\n}',start)+2);};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const calls={backups:0,saves:0,undo:[]};
 const S={recMode:true,groups:[],rsongId:'a',recordingFolders:['First','Second'],rsongs:[
  {id:'a',title:'Source',groupId:'original',folder:'legacy',recArtist:'A',recSession:{id:'session-a',label:'2026/10/08',displayLabel:'First'},lines:[{t:'Keep lyrics'}]},
  {id:'b',title:'Same artist',recArtist:'A',recSession:{id:'session-b',label:'2026/10/08',displayLabel:'First'},lines:[]},
  {id:'c',title:'Destination',recArtist:'B',recSession:{id:'session-c',label:'2026/10/15',displayLabel:'Second'},lines:[]},
  {id:'d',title:'Other artist',recArtist:'B',recSession:{id:'session-d',label:'2026/10/08',displayLabel:'First'},lines:[]}],
  notes:[{songId:'a',memo:'Keep note'}],staffMemos:{a:'Keep staff memo'},recs:{audio:{songId:'a',clip:'Keep audio'}},plan:{slots:[{songId:'a'}]}};
 const c=vm.createContext({S,U:{recArtistFilter:'',menu:null,songIdx:0},preview:null,VIEW:()=>false,recordingInboxCanWrite:()=>true,
  document:{activeElement:null},render(){},renderSheet(){},alert(){},save(){calls.saves++;},pushUndo(){calls.undo.push(clone(c.S));},
  automaticBackupBeforeEdit:async()=>{calls.backups++;if(c.duringBackup)c.duringBackup();return c.backupResult!==false;}});
 for(const name of ['performanceDateOrder','performanceSelectionOrder','recordingClassification','recordingSelectionSongs','recordingDateInfo',
  'canonicalRecordingFolderKey','recordingFolderKey','recordingDateBuckets','recordingDateHeading','recordingFolderError',
  'recordingFolderDraftSnapshot','recordingFolderEditAllowed','recordingFolderNameConflict','setRecordingSongFolder','rememberRecordingFolder',
  'finishRecordingFolderEdit','moveRecordingSongToFolder','dropRecordingSongToFolder','moveRecordingSong','onDrop'])vm.runInContext(read(name),c);
 return {c,calls};
}
test('dropping on another folder song moves only folder membership and keeps recording metadata',async()=>{
 const {c,calls}=fixture(),before=clone(c.S);
 assert.equal(await c.onDrop('rec:a','r:c'),true);
 const expected=clone(before);expected.rsongs[0].recSession.displayLabel='Second';
 assert.deepEqual(clone(c.S),expected);
 assert.equal(c.recordingFolderKey(c.S.rsongs[0]),c.recordingFolderKey(c.S.rsongs[2]));
 assert.equal(calls.backups,1);assert.equal(calls.saves,1);assert.deepEqual(calls.undo,[before]);
});
test('dropping on a date-folder song changes display grouping without replacing the source recording date',async()=>{
 const {c}=fixture();delete c.S.rsongs[2].recSession.displayLabel;
 const before=clone(c.S);
 assert.equal(await c.onDrop('rec:a','r:c'),true);
 const expected=clone(before);delete expected.rsongs[0].recSession.displayLabel;expected.rsongs[0].recSession.folderDate='2026/10/15';
 assert.deepEqual(clone(c.S),expected);
 assert.equal(c.recordingClassification(c.S.rsongs[0]).label,'2026/10/08');
 assert.equal(c.recordingFolderKey(c.S.rsongs[0]),c.recordingFolderKey(c.S.rsongs[2]));
});
test('same-folder drops keep existing artist-specific ordering and selected song',async()=>{
 const {c,calls}=fixture(),before=clone(c.S);
 assert.equal(await c.onDrop('rec:a','r:d'),false,'another artist in the same folder');
 assert.deepEqual(clone(c.S),before);assert.equal(calls.backups,0);
 assert.equal(await c.onDrop('rec:a','r:b'),true);
 assert.deepEqual(Array.from(c.S.rsongs,song=>song.id),['b','a','c','d']);
 assert.equal(c.U.songIdx,1);assert.equal(c.S.rsongId,'a');
 assert.deepEqual(clone(c.S.rsongs[1]),before.rsongs[0]);
});
test('invalid or filtered targets and failed or stale checkpoints never move a song',async()=>{
 for(const variant of ['missing','hidden','duplicate','backup','filter','mode','viewer','readonly','menu','state']){
  const {c,calls}=fixture();let target='c';
  if(variant==='missing')target='missing';
  if(variant==='hidden')c.U.recArtistFilter='A';
  if(variant==='duplicate')c.S.rsongs.push({...clone(c.S.rsongs[2])});
  if(variant==='backup')c.backupResult=false;
  c.duringBackup=()=>{
   if(variant==='filter')c.U.recArtistFilter='B';
   if(variant==='mode')c.S.recMode=false;
   if(variant==='viewer')c.VIEW=()=>true;
   if(variant==='readonly')c.recordingInboxCanWrite=()=>false;
   if(variant==='menu')c.U.menu={kind:'rec-song-actions',id:'c'};
   if(variant==='state')c.S.notes[0].memo='Newer note';
  };
  const songs=clone(c.S.rsongs);
  assert.equal(await c.onDrop('rec:a','r:'+target),false,variant);
  assert.deepEqual(clone(c.S.rsongs),songs,variant);assert.equal(calls.saves,0,variant);assert.equal(calls.undo.length,0,variant);
 }
});
