const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function gestures() {
 const handlers = {}, clicks = [];
 const ctx = vm.createContext({console, Set, Date, performance:{now:()=>100}, innerWidth:390,
  U:{view:'live'}, S:{recMode:false}, REC:false, org:null, dragOn:false,
  clearHold(){}, clearHl(){},
  document:{addEventListener(name, fn){(handlers[name] ||= []).push(fn);}},
  app:{querySelector(sel){return {classList:{contains:()=>false},click(){clicks.push(sel);}};}}
 });
 vm.runInContext(source('gestures.js'), ctx);
 function target(kind) { return {closest(sel){
  if(sel === '#app>.scroll') return {};
  if(kind === 'text' && sel.includes('[data-c]')) return {};
  if(kind === 'button' && sel.includes('button')) return {};
  if(kind === 'note' && sel.includes('.mk')) return {};
  return null;
 }}; }
 function fire(name, x, y, kind='blank', id=1) {
  const e={pointerType:'touch',pointerId:id,clientX:x,clientY:y,target:target(kind),preventDefault(){},stopImmediatePropagation(){}};
  (handlers[name] || []).forEach(fn=>fn(e));
 }
 function swipe(kind, dy=0) {fire('pointerdown',240,200,kind);fire('pointermove',130,200+dy,kind);fire('pointerup',130,200+dy,kind);}
 return {ctx,clicks,fire,swipe};
}
test('lyric characters, note badges and buttons never start song swipes',()=>{
 const g=gestures();['text','note','button'].forEach(k=>g.swipe(k));assert.equal(g.clicks.length,0);
 g.swipe('blank');assert.equal(g.clicks.length,1);assert.match(g.clicks[0],/next/);
});
test('vertical scrolling, pinch, overview and recording do not switch songs',()=>{
 const g=gestures();g.swipe('blank',160);assert.equal(g.clicks.length,0);
 g.fire('pointerdown',240,200);g.fire('pointerdown',200,200,'blank',2);g.fire('pointermove',130,200);g.fire('pointerup',130,200);g.fire('pointerup',200,200,'blank',2);
 assert.equal(g.clicks.length,0);
 g.ctx.U.overview=true;g.swipe('blank');g.ctx.U.overview=false;g.ctx.S.recMode=true;g.swipe('blank');assert.equal(g.clicks.length,0);
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
