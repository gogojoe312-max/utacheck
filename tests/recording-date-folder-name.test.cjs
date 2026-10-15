'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const a=source.indexOf('function '+name+'('),start=source.lastIndexOf('\n',a)+1;return source.slice(start,source.indexOf('\n}',start)+2);};
function fixture(){
 const calls={save:0,undo:0,backup:0,alerts:[]};
 const S={recMode:true,groups:[],rsongId:'a',rsongs:[
  {id:'a',recArtist:'A',groupId:'g-a',folder:'legacy',recSession:{id:'session-a',label:'2026/10/8・9 再録',extra:{keep:true}},lines:[]},
  {id:'b',recArtist:'B',groupId:'g-b',folder:'legacy',recSession:{id:'session-b',label:'2026/10/8・9 再録'},lines:[]},
  {id:'c',recArtist:'A',recSession:{id:'other',label:'2026/10/14'},lines:[]}],
  notes:[{songId:'a',memo:'keep'}],recs:{'rec|a|1':{clip:'keep'}},plan:{slots:[{id:'slot',songId:'a'}]}};
 const c=vm.createContext({S,U:{recArtistFilter:'A',menu:null},preview:null,VIEW:()=>false,recordingInboxCanWrite:()=>true,
  h:s=>String(s??'').replace(/[<>&"]/g,k=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[k])),
  prompt:()=> 'New REC',alert:s=>calls.alerts.push(s),save:()=>calls.save++,pushUndo:()=>calls.undo++,render(){},renderSheet(){},
  automaticBackupBeforeEdit:async()=>{calls.backup++;return true;}});
 for(const name of ['performanceDateOrder','performanceSelectionOrder','recordingClassification','recordingSelectionSongs',
  'recordingDateInfo','recordingDateBuckets','recordingDateHeading','recordingLibraryHTML','recordingDateContext',
  'recDateActionsHTML','renameRecordingDateBucket','editRecordingClassification','packState','unpackState'])vm.runInContext(read(name),c);
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
 assert.equal(await c.renameRecordingDateBucket(menu),true);
 before.rsongs[0].recSession.displayLabel='New REC';
 assert.deepEqual(JSON.parse(JSON.stringify(c.S)),before);
 assert.equal(calls.save,1);assert.equal(calls.undo,1);assert.equal(calls.backup,1);
 assert.deepEqual(JSON.parse(JSON.stringify(c.unpackState(JSON.parse(JSON.stringify(c.packState(c.S)))).rsongs)),before.rsongs);
});
test('cancel, checkpoint failure, stale filter, owner changes and privilege loss refuse mutation',async()=>{
 for(const variant of ['cancel','backup','filter','state','readonly','viewer','menu']){
  const {c,calls,open}=fixture(),menu=open(),before=JSON.stringify(c.S.rsongs);
  if(variant==='cancel')c.prompt=()=>null;
  if(variant==='viewer')c.VIEW=()=>true;
  c.automaticBackupBeforeEdit=async()=>{
   if(variant==='filter')c.U.recArtistFilter='B';
   if(variant==='state')c.S.notes[0].memo='newer';
   if(variant==='readonly')c.recordingInboxCanWrite=()=>false;
   if(variant==='menu')c.U.menu=null;
   return variant!=='backup';
  };
  assert.equal(await c.renameRecordingDateBucket(menu),false,variant);
  assert.equal(JSON.stringify(c.S.rsongs),before,variant);assert.equal(calls.save,0,variant);assert.equal(calls.undo,0,variant);
 }
});
test('resetting the name preserves date and ID; only owner settings show the menu',async()=>{
 const {c,open}=fixture();c.S.rsongs[0].recSession.displayLabel='Custom';c.prompt=()=>'';const menu=open();
 assert.equal(await c.renameRecordingDateBucket(menu),true);assert(!('displayLabel' in c.S.rsongs[0].recSession));
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
 const {c}=fixture();c.S.rsongs[0].recSession.displayLabel='Custom';let n=0;c.prompt=()=>++n===1?'Other artist':'2026/10/15';
 await c.editRecordingClassification('a');
 assert.equal(c.S.rsongs[0].recSession.id,'session-a');
 assert.equal(c.S.rsongs[0].recSession.displayLabel,'Custom');
 assert.equal(c.S.rsongs[0].recSession.extra.keep,true);
 assert.equal(c.S.rsongs[0].recSession.label,'2026/10/15');
});
