const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const block = (a,b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
function setup(storage = new Map()) {
  let writes = 0, pushes = 0;
  const c = vm.createContext({S:{viewer:false,groupId:'rose',showId:'r',groups:[{id:'ocha',name:'OCHA NORMA'},{id:'rose',name:'ロージー'}],
    shows:[{id:'r',name:'ロージー公演',groupId:'rose',ts:2},{id:'o',name:'OCHA公演',groupId:'ocha',ts:1}],
    songs:[{id:'rs',showId:'r',groupId:'rose',title:'曲R',lines:[]},{id:'os',showId:'o',groupId:'ocha',title:'曲O',lines:[]}],
    notes:[],memos:{},staffMemos:{},folders:{},gsubs:{},subs:{}},U:{showFilter:'',songIdx:0},preview:null,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{writes++;storage.set(k,v);}},
    save(){},render(){},renderSheet(){},schedulePush(){pushes++;},member:()=>null});
  c.VIEW = () => c.S.viewer;
  c.group = id => c.S.groups.find(g=>g.id===(id||c.S.groupId));
  c.showsNewestFirst = () => c.S.shows.slice().sort((a,b)=>b.ts-a.ts);
  vm.runInContext(block('function autoShowGroupId(', 'const showsNewestFirst ='),c);
  vm.runInContext(block('function publicationData(', 'async function gh('),c);
  return {c,storage,run:s=>vm.runInContext(s,c),writes:()=>writes,pushes:()=>pushes};
}
const snapshot = c => JSON.stringify([c.S.shows,c.S.songs,c.S.notes,c.S.memos,c.S.staffMemos]);
test('explicit show/group filter survives an immediate fresh runtime without any data save',()=>{
  const a=setup();a.run("selectShow('o');setShowFilter('ocha')");
  const b=setup(a.storage),before=snapshot(b.c);assert.equal(b.run('restoreViewSelection()'),true);
  assert.equal(b.c.S.showId,'o');assert.equal(b.c.S.groupId,'ocha');assert.equal(b.c.U.showFilter,'ocha');
  assert.equal(snapshot(b.c),before);assert.equal(b.writes(),0);assert.equal(b.pushes(),0);
});
test('All and Unassigned are explicit persistent filters without publication',()=>{
  const a=setup();a.run("setShowFilter('ocha');setShowFilter('')");
  let b=setup(a.storage);b.run('restoreViewSelection()');assert.equal(b.c.U.showFilter,'');
  a.run("setShowFilter('__unassigned__')");b=setup(a.storage);b.run('restoreViewSelection()');
  assert.equal(b.c.U.showFilter,'__unassigned__');assert.equal(a.pushes(),0);
});
test('normal show destination beats stale saved import group without modifying publication data',()=>{
  const a=setup();a.c.S.showId='o';a.c.S.groupId='rose';a.run('rememberViewSelection()');
  const b=setup(a.storage);const before=snapshot(b.c);
  const pubs=['ocha','rose'].map(id=>b.run(`JSON.stringify(publicationData('${id}'))`));
  b.run('restoreViewSelection()');assert.equal(b.c.S.groupId,'ocha');assert.equal(snapshot(b.c),before);
  for(const [i,id] of ['ocha','rose'].entries()) {
    const beforePub=JSON.parse(pubs[i]),after=JSON.parse(b.run(`JSON.stringify(publicationData('${id}'))`));
    delete beforePub.focusShow;delete after.focusShow;delete beforePub.version;delete after.version;assert.deepEqual(after,beforePub);
  }
  assert.equal(b.pushes(),0);
});
test('mixed show keeps a valid last import group without rerouting songs',()=>{
  const a=setup();a.c.S.shows[1].deliveryMode='song';a.c.S.showId='o';a.c.S.groupId='rose';a.run('rememberViewSelection()');
  const b=setup(a.storage);b.c.S.shows[1].deliveryMode='song';const before=snapshot(b.c);b.run('restoreViewSelection()');
  assert.equal(b.c.S.showId,'o');assert.equal(b.c.S.groupId,'rose');assert.equal(snapshot(b.c),before);
});
test('missing, deleted, hidden and stale-group preferences never recreate data',()=>{
  const a=setup();a.run("selectShow('o');setShowFilter('ocha')");
  const b=setup(a.storage);b.c.S.shows=b.c.S.shows.filter(x=>x.id!=='o');b.c.S.songs=b.c.S.songs.filter(x=>x.showId!=='o');b.c.S.groups=b.c.S.groups.filter(x=>x.id!=='ocha');
  const before=snapshot(b.c);assert.equal(b.run('restoreViewSelection()'),false);
  assert.equal(b.c.S.showId,'r');assert.equal(b.c.S.groupId,'rose');assert.equal(b.c.U.showFilter,'');assert.equal(snapshot(b.c),before);
  b.c.S.shows.push({id:'o',hidden:true});assert.equal(b.run('restoreViewSelection()'),false);assert.equal(b.c.S.showId,'r');
});
test('a selection missing at boot is restored when data arrives, unless a newer user choice replaces it',()=>{
  const a=setup();a.run("selectShow('o');setShowFilter('ocha')");
  const b=setup(a.storage),show=b.c.S.shows.pop(),song=b.c.S.songs.pop();
  b.run('restoreViewSelection()');assert.equal(b.c.S.showId,'r');
  b.c.S.shows.push(show);b.c.S.songs.push(song);b.run('restoreViewSelection()');assert.equal(b.c.S.showId,'o');
  b.run("selectShow('r');setShowFilter('rose')");b.c.S.showId='o';b.run('restoreViewSelection()');assert.equal(b.c.S.showId,'r');assert.equal(b.c.U.showFilter,'rose');
});
test('viewer sources are isolated and preferences cannot select another group or hidden show',()=>{
  const a=setup();a.c.S.viewer=true;a.c.S.linkSrc='fixture-A';a.c.S.groupId='ocha';a.c.S.showId='o';a.run('rememberViewSelection()');
  a.c.S.linkSrc='fixture-B';a.c.S.groupId='rose';a.c.S.showId='r';assert.equal(a.run('restoreViewSelection()'),false);a.run('rememberViewSelection()');
  a.c.S.linkSrc='fixture-A';a.c.S.groupId='ocha';a.run('restoreViewSelection()');assert.equal(a.c.S.showId,'o');
  a.c.S.groupId='rose';assert.equal(a.run('restoreViewSelection()'),false);assert.equal(a.c.S.showId,'r');assert.equal(a.c.S.groupId,'rose');
  a.c.S.shows[0].hidden=true;a.c.S.showId='';assert.equal(a.run('restoreViewSelection()'),false);assert.equal(a.c.S.showId,'');
});
test('preview and recording keep their original state and never read or overwrite preferences',()=>{
  const a=setup();a.run("selectShow('o')");const saved=JSON.stringify([...a.storage]);
  a.c.preview='{}';a.c.S.showId='r';a.run('rememberViewSelection();restoreViewSelection()');assert.equal(a.c.S.showId,'r');
  a.c.preview=null;a.c.S.recMode=true;a.c.S.showId='rec';a.c.S.liveShow='o';a.run('rememberViewSelection();restoreViewSelection()');
  assert.equal(a.c.S.showId,'rec');assert.equal(a.c.S.liveShow,'o');assert.equal(JSON.stringify([...a.storage]),saved);
});
test('blocked or malformed storage cannot stop the app or rewrite content',()=>{
  const a=setup(),before=snapshot(a.c);a.c.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
  assert.doesNotThrow(()=>a.run('rememberViewSelection();restoreViewSelection()'));assert.equal(snapshot(a.c),before);
  for(const raw of ['{','null','[]','{"version":1,"showId":{},"groupId":"rose","showFilter":""}']) {
    a.run('viewSelections.clear()');a.c.localStorage={getItem:()=>raw};assert.equal(a.run('restoreViewSelection()'),false);
  }
});
test('automatic cloud refresh keeps local navigation and establishes a clean backup signature',async()=>{
  const a=setup();a.run("selectShow('o');setShowFilter('ocha')");const remote=JSON.parse(JSON.stringify(a.c.S));remote.showId='r';remote.groupId='rose';remote.notes=[{id:'new',memo:'new synthetic note'}];
  Object.assign(a.c,{syncing:false,backupInFlight:false,otherAt:0,
    gh:async()=>({files:{}}),backupIndexFile:()=>true,readCloudBackup:async()=>({}),unpackBackup:async()=>({app:"utacheck",at:20,state:remote}),fromBackup:x=>structuredClone(x),
    bkSignature:()=>JSON.stringify([a.c.S.showId,a.c.S.groupId,a.c.S.notes])});
  a.c.S.ghToken='synthetic';a.c.S.bkGistId='synthetic';a.c.S.bkSeen=0;a.c.S.bkHash=a.c.bkSignature();a.c.U.songIdx=4;
  vm.runInContext(block('async function readSyncBackup(target)', '// その場で両方向に揃える'),a.c);
 vm.runInContext(block('async function checkOther(strict = false)', 'async function takeOther()'),a.c);await a.run('checkOther()');
  assert.equal(a.c.S.showId,'o');assert.equal(a.c.S.groupId,'ocha');assert.equal(a.c.U.showFilter,'ocha');assert.equal(a.c.S.notes[0].id,'new');
  assert.equal(a.c.U.songIdx,4);assert.equal(a.c.S.bkHash,a.c.bkSignature());assert.equal(a.c.otherAt,0);assert.equal(a.c.syncing,false);
});
test('boot restores selection before first render, without replacing the state persistence path',()=>{
  const boot=block('/* ---------------- boot ---------------- */', '// 指摘の画面');
  assert(boot.indexOf('await load()') < boot.indexOf('restoreViewSelection()'));
  assert(boot.indexOf('restoreViewSelection()') < boot.indexOf('render()'));
  assert(source.includes('savePend = JSON.stringify(packState(preview ? JSON.parse(preview) : S))'));
});
test('legacy saved selection is seeded before cloud synchronization on the first upgraded boot',async()=>{
  const a=setup();a.c.S.showId='o';a.c.S.groupId='ocha';
  Object.assign(a.c,{load:async()=>{},booted:false,idbOK:false,location:{hash:''},restoreViewerMember(){},importFromLink(){},syncSetlist(){}});
  await vm.runInContext(block('/* ---------------- boot ---------------- */', '// 指摘の画面'),a.c);
  assert.equal(a.c.booted,true);assert.equal(JSON.parse(a.storage.get('utacheck.selection:editor')).showId,'o');
  a.c.S.showId='r';a.c.S.groupId='rose';a.run('restoreViewSelection()');assert.equal(a.c.S.showId,'o');
});
test('a failed preference write cannot restore an older choice in the current session',()=>{
  const a=setup();a.run("selectShow('o');setShowFilter('ocha')");
  a.c.localStorage.setItem=()=>{throw Error('quota');};a.run("selectShow('r');setShowFilter('rose')");
  assert.equal(JSON.parse(a.storage.get('utacheck.selection:editor')).showId,'o');
  a.c.S.showId='o';a.c.S.groupId='ocha';a.run('restoreViewSelection()');
  assert.equal(a.c.S.showId,'r');assert.equal(a.c.U.showFilter,'rose');
});
test('source replacement clears temporary navigation before applying the new source preferences',()=>{
  const a=setup();a.c.S.viewer=true;a.c.S.recs={};a.c.U.summaryReturn={showId:'old'};a.c.U.lyricTarget={showId:'old'};
  Object.assign(a.c,{uid:()=> 'placeholder',todayLabel:()=> '今日',delClip(){}});
  vm.runInContext(block('function resetForNewSource()', 'function applySetlist(d)'),a.c);a.run('resetForNewSource()');
  assert.equal(a.c.U.summaryReturn,null);assert.equal(a.c.U.lyricTarget,null);assert.equal(a.c.U.summaryScroll,null);
});
