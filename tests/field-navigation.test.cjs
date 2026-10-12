'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=n=>{const a=source.indexOf('function '+n+'(');return source.slice(a,source.indexOf('\n}',a)+2);};
function fixture(){
 const S={groups:[{id:'r',name:'Rosie'},{id:'o',name:'OCHA'},{id:'h',name:'ハロコン'}],groupId:'r',showId:'rh',shows:[{id:'rh',name:'通しリハ',groupId:'r',ts:100},{id:'night',name:'熊谷夜公演',groupId:'r',ts:90},{id:'day',name:'熊谷昼公演',groupId:'r',ts:80},{id:'ocha',name:'OCHA本公演',groupId:'o',ts:110},{id:'mixed',name:'混合ハロコン',groupId:'h',deliveryMode:'song',ts:70}],songs:[{id:'rs',showId:'night',groupId:'r',lines:[]},{id:'os',showId:'ocha',groupId:'o',lines:[]},{id:'hm',showId:'mixed',groupId:'r',lines:[]}],rsongs:[{id:'ra',title:'Rosie録音',groupId:'r',at:2},{id:'oa',title:'OCHA録音',groupId:'o',at:3}],rsongId:'ra',notes:[{id:'n',memo:'本人の指摘'}],recs:{audio:{size:123}},folders:{}};
 const saved=new Map(),calls=[];const c=require('./inbox-test-context.cjs')({S,U:{showFilter:'',songIdx:0},preview:null,VIEW:()=>false,recordingInboxStorageSet:(k,v)=>saved.set(k,v),localStorage:{getItem:k=>saved.get(k)||null},render(){},renderSheet(){},save(){calls.push('save');},schedulePush(){calls.push('publish');},SONGS:()=>S.recMode?S.rsongs:S.songs.filter(x=>x.showId===S.showId)});
 const a=source.indexOf('function autoShowGroupId('),b=source.indexOf('const showsNewestFirst =');vm.runInContext(source.slice(a,b),c);vm.runInContext(source.slice(b,source.indexOf('const showName =',b)),c);
 for(const n of ['recordingSelectionSongs','selectRecordingGroup'])vm.runInContext(read(n),c);
 return {c,S,calls,saved,run:txt=>vm.runInContext(txt,c),original:()=>JSON.stringify([S.groups,S.shows,S.songs,S.rsongs,S.notes,S.recs])};
}
test('group entry selects the latest actual performance over a newer rehearsal, without publishing or changing content',()=>{
 const f=fixture(),before=f.original();f.run("setShowFilter('r')");assert.equal(f.S.showId,'night');assert.deepEqual(f.calls,[]);assert.equal(f.original(),before);
 f.run("setShowFilter('o')");assert.equal(f.S.showId,'ocha');f.run("setShowFilter('h')");assert.equal(f.S.showId,'mixed');assert.equal(f.original(),before);
});
test('initial reload opens latest group show; deliberate old show and background refresh remain stable',()=>{
 const f=fixture();f.run("selectShow('rh');setShowFilter('r');selectShow('day')");f.calls.length=0;f.run('restoreViewSelection()');assert.equal(f.S.showId,'day');
 f.run('restoreViewSelection(S.showId,true)');assert.equal(f.S.showId,'night');assert.deepEqual(f.calls,[]);
});
test('latest selection never creates absent ReNY or release-event data, and a rehearsal-only source stays usable',()=>{
 const f=fixture(),before=f.original();assert.equal(f.run("latestPerformance('r').id"),'night');assert.equal(f.original(),before);
 f.S.shows=f.S.shows.filter(x=>x.id==='rh');assert.equal(f.run("latestPerformance('r').id"),'rh');assert.equal(f.S.shows.length,1);
});
test('REC group navigation opens the matching song and preserves LIVE group, recording metadata and annotations',()=>{
 const f=fixture(),before=f.original();f.S.recMode=true;f.run("selectRecordingGroup('o')");assert.equal(f.S.rsongId,'oa');assert.equal(f.S.groupId,'r');assert.equal(f.c.U.songIdx,1);assert.equal(f.run('recordingSelectionSongs().length'),1);
 f.run("selectRecordingGroup('')");assert.equal(f.run('recordingSelectionSongs().length'),2);assert.equal(f.original(),before);assert.deepEqual(f.calls,[]);
});
test('setlist and REC materials precede optional controls and routine management markup is removed',()=>{
 const live=source.slice(source.indexOf('function viewSetup()'),source.indexOf('/* ---------------- events ---------------- */'));const owner=live.slice(live.indexOf('if (S.recMode) return viewSetupRec()'));
 assert(owner.indexOf('セットリスト')<owner.indexOf('公演を選ぶ・追加'));assert(owner.indexOf('data-settings-panel="live-materials"')<owner.indexOf('${lyricDisplaySettings()}'));
 assert.doesNotMatch(owner,/配信設定|接続・グループを管理|自動公開の接続設定|端末間の同期・接続先|指摘の集計を見る/);
 const rec=read('viewSetupRec');assert(rec.indexOf('${list')<rec.indexOf('${lyricDisplaySettings()}'));assert.match(rec,/<section data-settings-panel="rec-materials">/);
 const backup=read('backupSettingsHTML');assert.doesNotMatch(backup,/data-settings-panel="recovery"|data-settings-panel="recording-import"/);
 assert.match(source,/function applySetlist/);assert.match(source,/async function restoreBackup/);assert.match(source,/async function syncNow/);
});
test('the reserved private group stays selectable with only REC material; empty REC filter never exposes other groups',()=>{
 const f=fixture();f.c.S.groups.push({id:'off',name:'配信しない',nopub:true});f.c.S.rsongs.push({id:'private-rec',groupId:'off',lines:[]});
 assert(f.run('liveGroups().some(g=>g.id==="off")'));const original=JSON.stringify(f.c.S);f.run("U.recGroupFilter='off'");assert.deepEqual(Array.from(f.run('recordingSelectionSongs()'),x=>x.id),['private-rec']);
 f.c.S.rsongs=f.c.S.rsongs.filter(x=>x.id!=='private-rec');assert.equal(f.run('recordingSelectionSongs().length'),0);assert.equal(f.c.S.groupId,'r');
});
