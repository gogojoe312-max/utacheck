const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

function setup(notes=[]) {
 const handlers={}, commits=[], feedback={hidden:true,textContent:""};
 const c=vm.createContext({S:{notes},U:{sheet:{tags:[],memo:'keep'}},VIEW:()=>false,song:()=>({id:'song'}),Date,Set,
  document:{querySelector(){return feedback;},addEventListener(name,fn,opts){(handlers[name] ||= []).push({fn,capture:opts===true || !!opts?.capture});}},
  window:{addEventListener(){}},commitFields(){},scheduleCommit(){commits.push(c.U.sheet.tags.slice());c.U.sheet=null;}});
 vm.runInContext(src.slice(0,src.indexOf('/* ---------------- state')),c);
 const clickStart=src.indexOf('document.addEventListener("click", (e) => {');
 vm.runInContext(src.slice(clickStart,src.indexOf('\n});',clickStart)+4),c);
 vm.runInContext(src.slice(src.indexOf('let swOrg = null'),src.indexOf('/* ---- 公演をつまんで')),c);
 const row={dataset:{swipe:'pitch'},setPointerCapture(){},querySelectorAll(){return []}};
 const choice=id=>({dataset:{act:'tag-choice',id},closest(sel){return sel==='[data-swipe]'?row:['[data-act]','[data-act="tag-choice"]'].includes(sel)?this:null;}});
 const tile=choice('pitch');
 function fire(name,x=100,y=100,more={}) {
  const e={pointerId:1,button:0,clientX:x,clientY:y,detail:1,isTrusted:true,
   target:tile,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...more};
  for(const {fn} of [...(handlers[name] || [])].sort((a,b)=>Number(b.capture)-Number(a.capture))){fn(e);if(e.stopped)break;}
  return e;
 }
 return {c,row,tile,choice,handlers,commits,fire,feedback,run:code=>vm.runInContext(code,c)};
}

test('all 33 existing tags remain reachable with their original swipe directions',()=>{
 const s=setup();
 const ids=s.run('SWIPES.flatMap(s=>[s.id,s.up,s.dn,s.lf,s.rt]).filter(Boolean)');
 assert.deepEqual([...new Set(ids)].sort(),Array.from(s.run('TAGS.map(t=>t.id)')).sort());
 for(const [dx,dy,id] of [[0,0,'pitch'],[0,-60,'pHi'],[0,60,'pLo'],[-60,0,'pUn'],[60,0,'pWob']]){
  s.c.U.sheet={tags:[],memo:'keep'};s.fire('pointerdown');s.fire('pointermove',100+dx,100+dy);s.fire('pointerup',100+dx,100+dy);
  assert.equal(s.commits.at(-1)[0],id);assert.equal(s.c.U.sheet,null);
 }
 assert.equal(s.commits.length,5);
});

test('cancelled, multi-touch, stale-sheet and unassigned-direction gestures never save a note',()=>{
 const s=setup();
 s.fire('pointerdown');s.fire('pointercancel');s.fire('pointerup');
 s.fire('pointerdown');s.fire('pointerdown',100,100,{pointerId:2});s.fire('pointerup');s.fire('pointerup',100,100,{pointerId:2});
 s.fire('click');assert.equal(s.commits.length,0);
 s.fire('pointerdown');s.c.U.sheet={tags:[]};s.fire('pointerup');
 s.row.dataset.swipe='level';s.fire('pointerdown');s.fire('pointerup',170,100);
 assert.equal(s.commits.length,0);
 s.c.VIEW=()=>true;s.fire('pointerdown');s.fire('pointerup');assert.equal(s.commits.length,0);
});

test('release consumes its follow-up click, permits the next tap and clears pointers before song-swipe capture',()=>{
 const s=setup();
 assert.equal(s.handlers.pointerup[0].capture,true);
 s.fire('pointerdown');s.fire('pointerup',100,40);
 assert.equal(s.fire('click').stopped,true);
 s.fire('pointerdown',100,100,{target:{closest:()=>null}});
 assert.equal(s.fire('click').stopped,undefined);
 s.fire('pointerup',100,100,{target:{closest:()=>null}});
 s.c.U.sheet={tags:[]};s.fire('pointerdown');s.fire('pointerup');assert.equal(s.commits.length,2);
 s.c.U.sheet={tags:[]};s.fire('click',100,100,{detail:0});assert.equal(s.commits.length,3);
});

test('quick choices stay in the same bottom positions regardless of note history',()=>{
 const s=setup([{tags:['good','mic'],ts:100}]);
 const before=s.run('tagMenuHTML()');
 s.c.S.notes=[{tags:['pLo'],ts:200}];
 assert.equal(s.run('tagMenuHTML()'),before);
 assert.deepEqual(Array.from(s.run('QUICK_TAGS')),['pHi','pLo','fast','slow']);
 assert(before.indexOf('quick-tags')>before.indexOf('swipe-tags'));
});
test('swipe feedback follows direction and disappears on cancellation and release',()=>{
 const s=setup();s.fire('pointerdown');s.fire('pointermove',100,40);
 assert.equal(s.feedback.hidden,false);assert.equal(s.feedback.textContent,'音程高');
 s.fire('pointermove',100,160);assert.equal(s.feedback.textContent,'音程低');
 s.fire('pointercancel');assert.equal(s.feedback.hidden,true);assert.equal(s.commits.length,0);
 s.fire('pointerdown');s.fire('pointermove',100,40);s.fire('pointerup',100,40);
 assert.equal(s.feedback.hidden,true);assert.equal(s.commits[0][0],'pHi');
});

test('each direction can start anywhere in the row while a tap selects the touched choice',()=>{
 const s=setup();
 for(const startId of ['pHi','pLo','pUn','pWob','pitch']){
  const target=s.choice(startId);
  for(const [dx,dy,id] of [[3,3,startId],[0,-60,'pHi'],[0,60,'pLo'],[-60,0,'pUn'],[60,0,'pWob']]){
   s.c.U.sheet={tags:[]};
   s.fire('pointerdown',200,200,{target});s.fire('pointermove',200+dx,200+dy,{target});s.fire('pointerup',200+dx,200+dy,{target});
   assert.equal(s.commits.at(-1)[0],id);
   assert.equal(s.fire('click',200+dx,200+dy,{target}).stopped,true);
  }
 }
 assert.equal(s.commits.length,25);
 const gap={closest:sel=>sel==='[data-swipe]'?s.row:null};
 s.c.U.sheet={tags:[]};s.fire('pointerdown',200,200,{target:gap});s.fire('pointerup',200,200,{target:gap});
 assert.equal(s.commits.length,25);
 s.fire('pointerdown',200,200,{target:gap});s.fire('pointerup',140,200,{target:gap});
 assert.equal(s.commits.at(-1)[0],'pUn');
});

test('cancelled choice taps do not save through native clicks, and fixed shortcut buttons still work',()=>{
 const s=setup(),target=s.choice('pHi');
 s.fire('pointerdown',200,200,{target});s.fire('pointercancel',200,200,{target});s.fire('click',200,200,{target});
 assert.equal(s.commits.length,0);
 s.fire('pointerdown',200,200,{target});s.fire('pointerdown',200,200,{pointerId:2,target});
 s.fire('pointerup',200,200,{target});s.fire('pointerup',200,200,{pointerId:2,target});s.fire('click',200,200,{target});
 assert.equal(s.commits.length,0);
 s.fire('click',200,200,{target,detail:0});assert.equal(s.commits.at(-1)[0],'pHi');
 s.c.U.sheet={tags:[]};
 const recent={dataset:{act:'tag-choice',id:'fast'},closest(sel){return sel==='[data-act]'?this:null;}};
 s.fire('pointerdown',200,200,{target:recent});s.fire('pointerup',200,200,{target:recent});s.fire('click',200,200,{target:recent});
 assert.equal(s.commits.at(-1)[0],'fast');assert.equal(s.commits.length,2);
});

test('every genre appears after its direct choices, at the right end of the row',()=>{
 const html=setup().run('tagMenuHTML()');
 const rows=[...html.matchAll(/<section class="swipe-row"[\s\S]*?<\/section>/g)].map(m=>m[0]);
 assert.equal(rows.length,7);
 for(const row of rows){
  assert.match(row, /^<section class="swipe-row" data-swipe=/);
  assert(row.indexOf('class="swipe-choices"')<row.indexOf('class="swipe-tile"'));
 }
});
