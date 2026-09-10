const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function gestures() {
 const handlers = {}, clicks = [];
 const ctx = vm.createContext({console, Set, Date, performance:{now:()=>100}, innerWidth:390,
  VIEW:()=>false, U:{view:'live'}, S:{recMode:false}, REC:false, org:null, dragOn:false,
  clearHold(){}, clearHl(){},
  document:{addEventListener(name, fn){(handlers[name] ||= []).push(fn);}},
  app:{querySelector(sel){return {classList:{contains:()=>false},click(){clicks.push(sel);}};}}
 });
 vm.runInContext(source('gestures.js'), ctx);
 function target(kind) { return {closest(sel){
  if(sel === '#app>.scroll' && !kind.startsWith('control')) return {};
  if(sel === '#app>.bottom,#app>.lf-dock,#app>.aubar' && kind.startsWith('control')) return {};
  if(kind === 'control-input' && sel.includes('input')) return {};
  if(kind === 'text' && sel.includes('[data-c]')) return {};
  if(kind === 'button' && sel.includes('button')) return {};
  if(kind === 'note' && sel.includes('.mk')) return {};
  return null;
 }}; }
 function fire(name, x, y, kind='blank', id=1) {
  const e={pointerType:'touch',pointerId:id,clientX:x,clientY:y,target:target(kind),isTrusted:true,preventDefault(){this.prevented=true;},stopImmediatePropagation(){}};
  (handlers[name] || []).forEach(fn=>fn(e));return e;
 }
 function swipe(kind, dy=0) {fire('pointerdown',240,200,kind);fire('pointermove',130,200+dy,kind);fire('pointerup',130,200+dy,kind);}
 return {ctx,clicks,fire,swipe};
}
test('lyric characters, note badges and buttons never start song swipes',()=>{
 const g=gestures();['text','note','button','blank','control-input'].forEach(k=>g.swipe(k));assert.equal(g.clicks.length,0);
 g.swipe('control-button');assert.equal(g.clicks.length,1);assert.match(g.clicks[0],/next/);
});
test('vertical scrolling, pinch, overview and recording do not switch songs',()=>{
 const g=gestures();g.swipe('control-button',160);assert.equal(g.clicks.length,0);
 g.fire('pointerdown',240,200);g.fire('pointerdown',200,200,'blank',2);g.fire('pointermove',130,200);g.fire('pointerup',130,200);g.fire('pointerup',200,200,'blank',2);
 assert.equal(g.clicks.length,0);
 g.ctx.U.overview=true;g.swipe('control-button');g.ctx.U.overview=false;g.ctx.S.recMode=true;g.swipe('control-button');assert.equal(g.clicks.length,0);
});
function live() {
 const so={id:'song',lines:[{t:'test lyric',parts:[]}]};let publishes=0;
 const c=vm.createContext({S:{showId:'show',songs:[so],notes:[{id:'confirmed'}],livePending:[{id:'other',showId:'other-show',songId:'song',lineIdx:0,text:'test lyric'}]},U:{},preview:null,
  VIEW:()=>false,song:()=>so,uid:()=> 'new',recAt:()=>null,partsOf:()=>[],undoStack:[],
  pushUndo(){c.undoStack.push(JSON.stringify(c.S));},save(){},render(){},schedulePush(){publishes++;},TAGS:[],h:String,
  window:{addEventListener(){}},document:{addEventListener(){}},setTimeout,clearTimeout});
 vm.runInContext(source('liveflow.js'),c);
 return {c,run:code=>vm.runInContext(code,c),publishes:()=>publishes};
}
test('temporary check toggles off without deleting confirmed notes or another show, and can be undone',()=>{
 const l=live();l.run('LiveFlow.handle("lf-line", "", 0)');assert.equal(l.c.S.livePending.length,2);
 assert.match(l.run('LiveFlow.lineButton(song(),0)'),/aria-pressed="true"/);
 l.run('LiveFlow.handle("lf-line", "", 0)');assert.equal(l.c.S.livePending.length,1);assert.equal(l.c.S.livePending[0].id,'other');
 assert.equal(l.c.S.notes[0].id,'confirmed');assert.equal(l.publishes(),0);
 assert.equal(JSON.parse(l.c.undoStack.at(-1)).livePending.length,2);
 assert.match(l.run('LiveFlow.lineButton(song(),0)'),/aria-pressed="false"/);
});
test('member preview cannot change temporary checks',()=>{
 const l=live();l.c.preview='saved-state';l.run('LiveFlow.handle("lf-line", "", 0)');assert.equal(l.c.S.livePending.length,1);
});

test('members can swipe lyrics to change songs while editors keep lyric gestures for notes',()=>{
 const g=gestures();g.ctx.VIEW=()=>true;g.swipe('text');assert.equal(g.clicks.length,1);
 g.swipe('button');assert.equal(g.clicks.length,1);
});
test('member notes use the current group roster and never change editor data',()=>{
 const raw=[{id:'a',songId:'song',memberIds:['in','out']},{id:'b',songId:'song',memberIds:['out']},{id:'c',songId:'stale',memberIds:['in']},{id:'d',songId:'song',memberIds:[]}];
 const c=vm.createContext({S:{groupId:'g',songs:[{id:'song',groupId:'g',roster:['in','out']}],rosters:{Current:['Alice'],Other:['Bob']}},VIEW:()=>true,group:()=>({name:'Current'}),member:id=>({name:id==='in'?'Alice':'Bob'}),songRoster:so=>so.roster,raw});
 const app=source('app.js'),start=app.indexOf('function memberViewNotes(');vm.runInContext(app.slice(start,app.indexOf('\n}',start)+2),c);
 const result=JSON.parse(vm.runInContext('JSON.stringify(memberViewNotes(raw))',c));
 assert.deepEqual(result.map(n=>n.id),['a','d']);assert.deepEqual(result[0].memberIds,['in']);assert.deepEqual(raw[0].memberIds,['in','out']);
 c.VIEW=()=>false;assert.equal(vm.runInContext('memberViewNotes(raw)===raw',c),true);
});

test('footer taps remain available and a swipe suppresses the following button click',()=>{
 const g=gestures();g.fire('pointerdown',240,200,'control-button');g.fire('pointerup',240,200,'control-button');
 assert.equal(g.clicks.length,0);assert.equal(g.fire('click',240,200,'control-button').prevented,undefined);
 g.swipe('control-button');assert.equal(g.clicks.length,1);
 assert.equal(g.fire('click',130,200,'control-button').prevented,true);
});

test('a temporary check still becomes a published note with its memo and recording position',()=>{
 const l=live();l.c.S.songs[0].showId='show';l.c.prevSongOf=()=>null;l.c.renderSheet=()=>{};l.c.TAGS=[{id:'pLo'}];
 l.run('LiveFlow.handle("lf-line", "", 0)');
 const d=l.c.S.livePending.find(n=>n.id==='new');d.at=12;d.recKey='show|song|1';d.memberIds=['singer'];
 l.c.U.menu={kind:'lf-item',showId:'show',songId:'song',itemId:d.id,itemKind:'draft',tag:'pLo',memo:'語尾を確認'};
 l.run('LiveFlow.handle("lf-confirm", "", 0)');
 const note=l.c.S.notes.at(-1);assert.equal(note.memo,'語尾を確認');assert.deepEqual(Array.from(note.tags),['pLo']);assert.equal(note.at,12);assert.equal(note.recKey,'show|song|1');assert.deepEqual(Array.from(note.memberIds),['singer']);
 assert.equal(l.c.S.livePending.length,1);assert.equal(l.publishes(),1);
});
