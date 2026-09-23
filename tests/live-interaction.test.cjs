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
  if(sel === '#app>.bottom,#app>.aubar' && kind.startsWith('control')) return {};
  if(kind === 'control-input' && sel.includes('input')) return {};
  if(kind === 'text' && sel.includes('[data-c]')) return {};
  if(kind === 'button' && sel.includes('button')) return {};
  if(kind === 'note' && sel.includes('.mk')) return {};
  return null;
 }}; }
 function fire(name, x, y, kind='blank', id=1) {
  const e={pointerType:'touch',pointerId:id,isPrimary:id===1,clientX:x,clientY:y,target:target(kind),isTrusted:true,preventDefault(){this.prevented=true;},stopImmediatePropagation(){}};
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

test('footer song swipes recover after another interaction consumes pointerup',()=>{
 const g=gestures();g.ctx.U.sheet={};
 g.fire('pointerdown',240,200,'text',9);
 // A dialog / long-press handler consumes this release before navigation sees it.
 g.ctx.U.sheet=null;
 g.swipe('control-button');g.swipe('control-button');
 assert.equal(g.clicks.length,2);g.clicks.forEach(x=>assert.match(x,/next/));
});

test('footer swipes use the same song navigation as arrows while live audio is recording',()=>{
 const g=gestures();g.ctx.REC=true;g.swipe('control-button');
 assert.equal(g.clicks.length,1);assert.equal(g.ctx.REC,true);
});
