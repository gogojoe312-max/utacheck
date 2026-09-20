const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','autoscroll.js'),'utf8');

function setup({rounded=false,max=10000}={}) {
 let time=0,nextId=0,b=null,sc,top=0;
 const timers=new Map(),frames=new Map(),handlers={},win={};
 const doc={hidden:false,addEventListener(name,fn){(handlers[name]||=[]).push(fn);},createElement(){return {dataset:{},setAttribute(k,v){this[k]=v;}};}};
 function fire(name,props={}){for(const fn of handlers[name]||[])fn({target:target(),pointerId:1,isPrimary:true,button:0,pointerType:'touch',clientX:100,clientY:500,...props});}
 const dock={querySelector:()=>null,insertBefore(el){b=el;}};
 function freshScroll(){top=0;return {isConnected:true,scrollHeight:max+500,clientHeight:500,
  get scrollTop(){return top;},set scrollTop(v){top=Math.min(max,Math.max(0,rounded?Math.floor(v):v));fire('scroll',{target:this});}};}
 sc=freshScroll();
 const c=vm.createContext({document:doc,window:{addEventListener(name,fn){(win[name]||=[]).push(fn);}},
  S:{showId:'show',recMode:false},U:{view:'live'},currentSong:{id:'song'},take:'',VIEW:()=>false,typingNow:()=>false,
  song:()=>c.currentSong,takeCtx:()=>c.take,performance:{now:()=>time},
  app:{querySelector(sel){return sel==='#app > .scroll'?sc:sel==='[data-act="auto-scroll"]'?b:dock;}},
  setTimeout(fn,ms){timers.set(++nextId,{fn,at:time+ms});return nextId;},clearTimeout(id){timers.delete(id);},
  requestAnimationFrame(fn){frames.set(++nextId,{fn,at:time+16});return nextId;},cancelAnimationFrame(id){frames.delete(id);}});
 vm.runInContext(source,c);
 const run=s=>vm.runInContext(s,c);
 run('LyricScroll.mount()');
 function target(kind='lyric'){return {closest(sel){return sel==='#app > .scroll'&&kind==='lyric'?sc:sel==='[data-act="auto-scroll"]'&&kind==='auto'?b:null;},matches:()=>kind==='input'};}
 function advance(ms){const end=time+ms;while(true){const entries=[...[...timers].map(([id,x])=>({id,...x,map:timers})),...[...frames].map(([id,x])=>({id,...x,map:frames}))].filter(x=>x.at<=end).sort((a,b)=>a.at-b.at);if(!entries.length)break;const e=entries[0];time=e.at;e.map.delete(e.id);e.fn(time);}time=end;}
 function click(){fire('click',{target:target('auto')});}
 function touchStart(){fire('pointerdown');fire('touchstart',{touches:[{identifier:1,clientX:100,clientY:500}]});}
 function touchScroll(px=20,dt=100,steps=5){touchStart();for(let i=1;i<=steps;i++){advance(dt);fire('touchmove',{touches:[{identifier:1,clientX:100,clientY:500-i*20*Math.sign(px)}]});if(i===1)fire('pointercancel');sc.scrollTop+=px;}fire('touchend',{touches:[]});}
 return {c,run,fire,target,advance,click,touchStart,touchScroll,doc,win,button:()=>b,sc:()=>sc,frames,
  replace(){sc.isConnected=false;sc=freshScroll();b=null;return sc;}};
}

test('uses measured manual speed and direction, with fractional positions at low speeds',()=>{
 const s=setup({rounded:true});s.touchScroll(20,100);s.advance(140);s.click();
 const start=s.sc().scrollTop;s.advance(1000);assert(Math.abs(s.sc().scrollTop-start-200)<5);
 s.fire('pointerdown',{target:s.target('other')});
 s.touchScroll(-10,100);s.advance(140);s.click();const back=s.sc().scrollTop;s.advance(1000);assert(Math.abs(s.sc().scrollTop-back+100)<3);
 s.fire('pointerdown',{target:s.target('other')});
 s.touchScroll(2,200);s.advance(140);s.click();const slow=s.sc().scrollTop;s.advance(2000);assert(Math.abs(s.sc().scrollTop-slow-20)<2);
});

test('arming before a manual scroll waits for a measured speed and then continues after native momentum',()=>{
 const s=setup();s.click();assert.equal(s.button().textContent,'待機');s.advance(1000);assert.equal(s.sc().scrollTop,0);
 s.touchScroll(20,100);assert.equal(s.frames.size,0);
 // Inertia moves the content after touchend. It must not replace the learned 200 px/s.
 for(let i=0;i<4;i++){s.advance(60);s.sc().scrollTop+=10;assert.equal(s.frames.size,0);}
 s.advance(121);const start=s.sc().scrollTop;s.advance(1000);assert(Math.abs(s.sc().scrollTop-start-200)<5);
});

test('dragging again updates speed, but tapping a lyric stops until explicitly restarted',()=>{
 const s=setup();s.touchScroll(20,100);s.advance(140);s.click();s.advance(500);
 s.touchScroll(5,100);s.advance(140);const start=s.sc().scrollTop;s.advance(1000);assert(Math.abs(s.sc().scrollTop-start-50)<2);
 s.touchStart();const touched=s.sc().scrollTop;s.advance(200);assert.equal(s.sc().scrollTop,touched);
 s.fire('touchend',{touches:[]});s.advance(1000);assert.equal(s.sc().scrollTop,touched);assert.equal(s.button()['aria-pressed'],'false');
 s.click();s.advance(500);assert(s.sc().scrollTop>touched);
});

test('wheel scrolling is learned, while automatic, programmatic and horizontal movements are not',()=>{
 const s=setup();s.sc().scrollTop=500;s.click();assert.equal(s.button().textContent,'待機');
 for(let i=0;i<5;i++){s.fire('wheel',{deltaX:0,deltaY:30});s.advance(80);s.sc().scrollTop+=30;}
 s.advance(200);const start=s.sc().scrollTop;s.advance(1000);assert(Math.abs(s.sc().scrollTop-start-375)<7);
 s.fire('wheel',{deltaX:50,deltaY:5});assert.equal(s.button()['aria-pressed'],'false');
 const stopped=s.sc().scrollTop;s.advance(1000);assert.equal(s.sc().scrollTop,stopped);
 const other=setup();other.touchStart();other.fire('touchmove',{touches:[{identifier:1,clientX:200,clientY:500}]});other.fire('touchend',{touches:[]});other.click();assert.equal(other.button().textContent,'待機');
});

test('dialogs, drawing, backgrounding, cancelled and multi-touch gestures cannot keep scrolling',()=>{
 for(const action of [s=>{s.c.U.sheet={};},s=>{s.c.U.draw=true;},s=>{s.doc.hidden=true;s.fire('visibilitychange');},
  s=>s.fire('touchcancel'),s=>{s.touchStart();s.fire('touchstart',{touches:[{},{}]});},s=>s.win.blur.forEach(fn=>fn())]){
  const s=setup();s.touchScroll();s.advance(140);s.click();s.advance(200);action(s);s.advance(100);
  const at=s.sc().scrollTop;s.advance(500);assert.equal(s.sc().scrollTop,at);assert.equal(s.button()['aria-pressed'],'false');assert.equal(s.frames.size,0);
 }
});

test('same-song background renders continue smoothly; a different song, take or section stops',()=>{
 const s=setup();s.touchScroll();s.advance(140);s.click();s.advance(200);
 const at=s.sc().scrollTop;s.replace().scrollTop=at;s.run('LyricScroll.mount()');s.advance(200);assert(s.sc().scrollTop>at);
 for(const change of [()=>s.c.currentSong={id:'next'},()=>s.c.take='2',()=>s.c.U.secView='B']){
  change();s.replace();s.run('LyricScroll.mount()');assert.equal(s.sc().scrollTop,0);assert.equal(s.button()['aria-pressed'],'false');s.advance(500);assert.equal(s.sc().scrollTop,0);
  s.click();s.advance(50);
 }
});

test('reaching either edge stops without advancing a song, and stopping removes the animation loop',()=>{
 const s=setup({max:250});s.touchScroll();s.advance(140);s.click();s.advance(2000);
 assert.equal(s.sc().scrollTop,250);assert.equal(s.button()['aria-pressed'],'false');assert.equal(s.c.currentSong.id,'song');assert.equal(s.frames.size,0);
 s.touchScroll(-20,100);s.advance(140);s.click();s.advance(2000);assert.equal(s.sc().scrollTop,0);assert.equal(s.frames.size,0);
});
