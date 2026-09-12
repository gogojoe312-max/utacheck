const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

function setup(notes=[]) {
 const handlers={}, commits=[];
 const c=vm.createContext({S:{notes},U:{sheet:{tags:[],memo:'keep'}},VIEW:()=>false,song:()=>({id:'song'}),Date,Set,
  document:{addEventListener(name,fn,opts){(handlers[name] ||= []).push({fn,capture:opts===true || !!opts?.capture});}},
  window:{addEventListener(){}},commitFields(){},scheduleCommit(){commits.push(c.U.sheet.tags.slice());c.U.sheet=null;}});
 vm.runInContext(src.slice(0,src.indexOf('/* ---------------- state')),c);
 const clickStart=src.indexOf('document.addEventListener("click", (e) => {');
 vm.runInContext(src.slice(clickStart,src.indexOf('\n});',clickStart)+4),c);
 vm.runInContext(src.slice(src.indexOf('let swOrg = null'),src.indexOf('/* ---- 公演をつまんで')),c);
 const tile={dataset:{swipe:'pitch',act:'tag-choice',id:'pitch'},setPointerCapture(){},querySelectorAll(){return []}};
 function fire(name,x=100,y=100,more={}) {
  const e={pointerId:1,button:0,clientX:x,clientY:y,detail:1,isTrusted:true,
   target:{closest:sel=>['[data-swipe]','[data-act]'].includes(sel)?tile:null},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...more};
  for(const {fn} of [...(handlers[name] || [])].sort((a,b)=>Number(b.capture)-Number(a.capture))){fn(e);if(e.stopped)break;}
  return e;
 }
 return {c,tile,handlers,commits,fire,run:code=>vm.runInContext(code,c)};
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
 s.tile.dataset.swipe='level';s.fire('pointerdown');s.fire('pointerup',170,100);
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

test('recent tags use four distinct saved choices, newest first, without changing notes',()=>{
 const notes=[{tags:['pitch'],ts:1},{tags:['pLo','fast'],ts:5},{tags:['slow','good','diction','mic'],ts:4},{tags:['pLo'],ts:6},{tags:['unknown'],ts:100},{tags:['pHi'],ts:200,ro:true}];
 const original=JSON.stringify(notes),s=setup(notes);
 assert.deepEqual(Array.from(s.run('recentTagIds()')),['pLo','fast','slow','good']);
 const html=s.run('tagMenuHTML()');assert(html.indexOf('recent-tags')<html.indexOf('swipe-tags'));
 assert.equal((html.match(/data-swipe=/g)||[]).length,7);assert.equal(JSON.stringify(notes),original);
 s.c.S.notes=[];assert(!s.run('tagMenuHTML()').includes('class="recent-tags"'));
});
