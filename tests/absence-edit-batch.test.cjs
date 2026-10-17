'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function fixture(){
 const buttons=['a','b'].map(id=>({id,textContent:id,isConnected:true,disabled:false,setAttribute(){},removeAttribute(){}}));
 const c={S:{showId:'show',groupId:'group',recMode:false,shows:[{id:'show',absent:[]}],notes:[{memo:'keep'}],songs:[{id:'song',lines:[{t:'keep lyric'}]}],subs:{},gsubs:{},ghToken:'test-token'},U:{view:'absent'},preview:null,viewer:false,
  booted:true,bootErr:'',syncing:false,manualSync:false,backupInFlight:false,publishInFlight:false,saveErr:false,stateRevision:0,checks:0,writes:0,renders:0,allowed:true,
  recordingInboxCanWrite:()=>true,packState:s=>({...s}),document:{querySelectorAll:()=>buttons},typingNow:()=>false,schedulePush(){},rebuildSubs(){},render(){c.renders++;},save(){c.stateRevision++;},async saveNow(){c.writes++;},async automaticBackupBeforeEdit(){c.checks++;return c.allowed;}};
 c.VIEW=()=>c.viewer;c.absenceSelectableMembers=()=>buttons.map(b=>({id:b.id}));
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('let absenceEditBatch ='),source.indexOf('// Read-only view of absence substitutions;')),c);
 return {c,buttons,run:code=>vm.runInContext(code,c)};
}
test('consecutive absence selections share a verified restore point and every tap persists',async()=>{
 const {c,buttons,run}=fixture();
 assert.equal(await c.toggleAbsenceMember('a',buttons[0]),true);assert.equal(await c.toggleAbsenceMember('b',buttons[1]),true);assert.equal(await c.toggleAbsenceMember('a',buttons[0]),true);
 assert.equal(c.checks,1);assert.equal(c.writes,3);assert.deepEqual(Array.from(c.S.shows[0].absent),['b']);
 assert.equal(c.S.notes[0].memo,'keep');assert.equal(c.S.songs[0].lines[0].t,'keep lyric');
 assert.equal(run('absenceEditBatch.snapshot.includes("test-token")'),false);
});
test('unrelated saved or unsaved notes, replaced state and another show require new verification',async()=>{
 const {c,buttons}=fixture();await c.toggleAbsenceMember('a',buttons[0]);
 c.S.notes[0].memo='new note without save';await c.toggleAbsenceMember('b',buttons[1]);assert.equal(c.checks,2);
 c.save();await c.toggleAbsenceMember('a',buttons[0]);assert.equal(c.checks,3);
 c.S=JSON.parse(JSON.stringify(c.S));await c.toggleAbsenceMember('b',buttons[1]);assert.equal(c.checks,4);
 c.S.shows.push({id:'other',absent:[]});c.S.showId='other';await c.toggleAbsenceMember('a',buttons[0]);assert.equal(c.checks,5);assert.equal(c.S.notes[0].memo,'new note without save');
});
test('leaving and reentering the editor clears the batch, including background navigation',async()=>{
 const {c,buttons}=fixture();await c.toggleAbsenceMember('a',buttons[0]);const stub=c.render;
 const start=source.indexOf('function render(background = false) {'),end=source.indexOf('\n}',start)+2;
 vm.runInContext(source.slice(start,end),c);c.U.view='live';c.recordingInboxCanWrite=()=>false;c.render();
 c.render=stub;c.recordingInboxCanWrite=()=>true;c.U.view='absent';await c.toggleAbsenceMember('b',buttons[1]);assert.equal(c.checks,2);
 assert(source.includes('if (a === "toggleabsent") { await toggleAbsenceMember(id,b); return; }\n  resetAbsenceEditBatch();'));
});
test('failed first verification and navigation during verification never modify assignments',async()=>{
 const {c,buttons}=fixture(),before=JSON.stringify(c.S);c.allowed=false;
 assert.equal(await c.toggleAbsenceMember('a',buttons[0]),false);assert.equal(JSON.stringify(c.S),before);assert.equal(c.writes,0);assert.equal(buttons[0].disabled,false);
 c.allowed=true;let finish;c.automaticBackupBeforeEdit=()=>new Promise(resolve=>{finish=resolve;});const pending=c.toggleAbsenceMember('a',buttons[0]);
 assert.equal(c.U.absencePending,true);assert.equal(buttons[0].disabled,true);assert(buttons[0].textContent.includes('確認中'));
 c.U.view='live';finish(true);assert.equal(await pending,false);assert.equal(JSON.stringify(c.S),before);assert.equal(c.U.absencePending,false);
});
test('failed durable save prevents reuse, and notes changed during a save invalidate the next tap',async()=>{
 const {c,buttons}=fixture();c.saveNow=async()=>{c.writes++;c.saveErr=true;};
 assert.equal(await c.toggleAbsenceMember('a',buttons[0]),false);
 c.saveErr=false;c.saveNow=async()=>{c.writes++;c.S.notes[0].memo='changed during save';};
 await c.toggleAbsenceMember('b',buttons[1]);assert.equal(c.checks,2);
 await c.toggleAbsenceMember('a',buttons[0]);assert.equal(c.checks,3);assert.equal(c.S.notes[0].memo,'changed during save');
});
test('leaving and returning while a durable save is pending cannot reopen the old batch',async()=>{
 const {c,buttons}=fixture();let finish;c.saveNow=()=>new Promise(resolve=>{finish=resolve;});
 const pending=c.toggleAbsenceMember('a',buttons[0]);await new Promise(setImmediate);
 c.U.view='live';c.resetAbsenceEditBatch();c.U.view='absent';finish();await pending;
 c.saveNow=async()=>{};await c.toggleAbsenceMember('b',buttons[1]);assert.equal(c.checks,2);
});
test('viewer, preview, unknown members and simultaneous pending taps cannot bypass protection',async()=>{
 const {c,buttons}=fixture();c.viewer=true;assert.equal(await c.toggleAbsenceMember('a',buttons[0]),false);c.viewer=false;c.preview={};assert.equal(await c.toggleAbsenceMember('a',buttons[0]),false);c.preview=null;
 assert.equal(await c.toggleAbsenceMember('unknown',buttons[0]),false);assert.equal(c.checks,0);
 let finish;c.automaticBackupBeforeEdit=()=>{c.checks++;return new Promise(resolve=>{finish=resolve;});};const first=c.toggleAbsenceMember('a',buttons[0]);
 assert.equal(await c.toggleAbsenceMember('b',buttons[1]),false);finish(true);await first;assert.equal(c.checks,1);assert.deepEqual(Array.from(c.S.shows[0].absent),['a']);
});
