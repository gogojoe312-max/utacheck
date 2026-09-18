const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
function clock(){let now=0,id=0;const timers=new Map();return {Date:{now:()=>now},setTimeout(fn,ms){timers.set(++id,{fn,at:now+ms});return id;},clearTimeout(i){timers.delete(i);},advance(ms){now+=ms;for(const [i,t] of [...timers])if(t.at<=now){timers.delete(i);t.fn();}}};}
function events(){const handlers={};return {handlers,addEventListener(name,fn){(handlers[name]||=[]).push(fn);},fire(name,props={}){for(const fn of handlers[name]||[])fn({pointerId:1,isPrimary:true,button:0,...props});}};}

test('background publishing changes only its status, without replacing the open note dialog',()=>{
 const status={style:{}},sheet={memo:'入力中'};let renders=0;
 const c=vm.createContext({U:{view:'live',sheet},pushState:'送信中',app:{querySelector:()=>status},render(){renders++;}});
 vm.runInContext(block('function renderPublishStatus()', 'async function pushOne'),c);
 vm.runInContext('renderPublishStatus()',c);assert.equal(status.textContent,' ・ 送信中');assert.equal(c.U.sheet,sheet);assert.equal(renders,0);
 c.pushState='未送信';vm.runInContext('renderPublishStatus()',c);assert.equal(status.style.color,'var(--bad)');assert.equal(renders,0);
});

test('touching, scrolling and open dialogs defer background renders until interaction ends',()=>{
 const time=clock(),doc=events(),win=events();doc.activeElement=null;let writes=0;
 const app={dataset:{},querySelector:()=>null,set innerHTML(v){writes++;}};
 const c=vm.createContext({...time,document:doc,window:win,Set,S:{recMode:false},U:{view:'live'},app,
  alertPending:()=>null,viewLive:()=>'<div>歌詞</div>',saveErr:false,VIEW:()=>false,queueInkPaint(){},renderSheet(){}});
 vm.runInContext(block('let pendingRender = false;', '// 今日の日付'),c);
 const run=s=>vm.runInContext(s,c);
 doc.fire('pointerdown');run('render(true)');assert.equal(writes,0);
 doc.fire('pointerup');time.advance(170);assert.equal(writes,1);
 doc.fire('scroll',{target:{matches:()=>true}});run('render(true)');assert.equal(writes,1);time.advance(170);assert.equal(writes,2);
 c.U.sheet={tags:[]};run('render(true)');time.advance(170);assert.equal(writes,2);
 c.U.sheet=null;run('resumeRender()');time.advance(170);assert.equal(writes,3);
 // A missing release must not trap the next gesture forever.
 doc.fire('pointerdown',{pointerId:8});run('render(true)');doc.fire('pointerdown',{pointerId:9});doc.fire('pointerup',{pointerId:9});time.advance(170);assert.equal(writes,4);
});

test('drawing allocates no full-song bitmap, preserves stroke positions and coalesces paints',()=>{
 const calls=[];let contexts=0,raf;
 const cv={width:300,height:150,style:{},getContext(){contexts++;return {clearRect(){},save(){},restore(){},translate(x,y){calls.push(['offset',x,y]);},beginPath(){},moveTo(x,y){calls.push(['point',x,y]);},lineTo(){},stroke(){}};}};
 const sc={clientWidth:390,clientHeight:560,scrollHeight:40000,scrollTop:3000};
 const c=vm.createContext({document:{getElementById:()=>cv},app:{querySelector:()=>sc},S:{draws:{}},U:{draw:false},drawKey:()=> 'song',inkPath:null,requestAnimationFrame(fn){raf=fn;return 1;}});
 vm.runInContext(block('function paintInk()', 'function inkPos'),c);
 vm.runInContext('paintInk()',c);assert.equal(cv.width,0);assert.equal(cv.height,0);assert.equal(contexts,0);
 c.S.draws.song=[{c:'red',w:3,p:[.5,3100,.6,3120]}];
 vm.runInContext('paintInk()',c);assert.equal(cv.width,390);assert.equal(cv.height,560);assert.equal(cv.style.top,'3000px');assert.deepEqual(calls,[['offset',0,-3000],['point',195,3100]]);
 const before=contexts;vm.runInContext('queueInkPaint();queueInkPaint();queueInkPaint()',c);assert.equal(contexts,before);raf();assert.equal(contexts,before+1);
 c.inkPath='erasing';assert.doesNotThrow(()=>vm.runInContext('paintInk()',c));
});

test('rapid saves serialize once and a preview cannot overwrite the editor data',async()=>{
 const time=clock(),writes=[];let packed=0;
 const c=vm.createContext({...time,S:{notes:[]},preview:null,booted:true,saveErr:false,KEY:'state',packState(s){packed++;return s;},idbPut:async(k,v)=>writes.push(JSON.parse(v.txt))});
 vm.runInContext('let idbOK = true;'+block('let saveTimer = null','const REC_SHOW'),c);
 for(let i=0;i<30;i++){c.S.notes.push(i);vm.runInContext('save()',c);}
 assert.equal(packed,0);await vm.runInContext('saveNow()',c);assert.equal(packed,1);assert.equal(writes[0].notes.length,30);
 c.S.notes.push(30);vm.runInContext('save()',c);c.preview=JSON.stringify(c.S);c.S={notes:['viewer']};
 await vm.runInContext('saveNow()',c);assert.equal(writes[1].notes.length,31);assert(!writes[1].notes.includes('viewer'));
});

test('saving during an outstanding database write persists the final edit too',async()=>{
 const time=clock(),writes=[];let finishFirst;
 const c=vm.createContext({...time,S:{n:1},preview:null,booted:true,saveErr:false,packState:s=>s,idbPut(k,v){writes.push(JSON.parse(v.txt));return writes.length===1?new Promise(r=>{finishFirst=r;}):Promise.resolve();}});
 vm.runInContext('let idbOK = true;'+block('let saveTimer = null','const REC_SHOW'),c);
 vm.runInContext('save()',c);const flush=vm.runInContext('saveNow()',c);c.S.n=2;vm.runInContext('save()',c);finishFirst();await flush;
 assert.deepEqual(writes,[{n:1},{n:2}]);
});

test('note undo does not copy recording lyrics or erase recording state when restored',()=>{
 const songs=[{id:'recording',lines:Array(1000).fill('long lyric')}],plan={slots:[{id:'running'}]};
 const c=vm.createContext({S:{notes:[{id:'before'}],rsongs:songs,plan},undoStack:[],U:{},song:()=>({}),clearTimeout(){},save(){},schedulePush(){},render(){},document:{addEventListener(name,fn){c.click=fn;}}});
 vm.runInContext(block('function pushUndo(', 'let saveErr'),c);vm.runInContext('pushUndo(null,true)',c);
 assert(!c.undoStack[0].includes('recording'));c.S.notes.push({id:'after'});
 const start=src.indexOf('document.addEventListener("click", (e) => {');vm.runInContext(src.slice(start,src.indexOf('\n});',start)+4),c);
 c.click({target:{closest:sel=>sel==='[data-act]'?{dataset:{act:'undo'}}:null}});
 assert.equal(c.S.notes.length,1);assert.equal(c.S.rsongs,songs);assert.equal(c.S.plan,plan);
});

test('cancelled lyric gestures and second fingers cannot open notes; highlights restore existing marks',()=>{
 const time=clock(),doc=events(),win=events(),notes=[];
 const chars=Array.from({length:3},(_,i)=>({dataset:{c:String(i)},style:{background:i===1?'red':''},getBoundingClientRect:()=>({left:i*20,right:i*20+20,top:0,bottom:30})}));
 const row={dataset:{l:'0'},isConnected:true,querySelectorAll:()=>chars};
 const target={closest:sel=>sel==='.txt'?row:null};
 const c=vm.createContext({...time,document:doc,window:win,U:{},S:{recMode:false},VIEW:()=>false,song:()=>({id:'a'}),openSheet:(...a)=>notes.push(a),app:{querySelector:()=>row}});
 vm.runInContext(block('let org = null, dragOn = false;', '/* ---------------- files'),c);
 const fire=(name,more={})=>doc.fire(name,{target,clientX:5,clientY:10,preventDefault(){},...more});
 fire('pointerdown');fire('pointercancel');fire('pointerup');assert.equal(notes.length,0);
 fire('pointerdown',{isPrimary:false});fire('pointerup');assert.equal(notes.length,0);
 fire('pointerdown');fire('pointerup');assert.equal(notes.length,1);
 vm.runInContext('highlight(0,0,2);clearHl()',c);assert.equal(chars[1].style.background,'red');assert.equal(chars[0].style.background,'');
 fire('pointerdown');row.isConnected=false;fire('pointerup');assert.equal(notes.length,1);
});

test('slow background publication does not start overlapping sends',async()=>{
 let finish,calls=0;
 const c=vm.createContext({publishGroups(){calls++;return new Promise(r=>{finish=r;});}});
 vm.runInContext(block('let publishInFlight = false;', 'async function publishGroups'),c);
 const first=vm.runInContext('doPush(true)',c);await vm.runInContext('doPush(true)',c);assert.equal(calls,1);finish();await first;
 const next=vm.runInContext('doPush(true)',c);assert.equal(calls,2);finish();await next;
});

test('unchanged publications reuse their check, but new notes and completed sends invalidate it',()=>{
 let reads=0;const c=vm.createContext({stateRevision:1,S:{groups:[{id:'a',gistId:'g',lastKey:'same'}]},publicationData(){reads++;return 'same';},payloadKey:x=>x});
 vm.runInContext(block('let pendingCheck = null;', '// アプリを開いている間'),c);
 for(let i=0;i<100;i++)assert.equal(vm.runInContext('hasPending()',c),false);assert.equal(reads,1);
 c.stateRevision++;vm.runInContext('hasPending()',c);assert.equal(reads,2);
 c.S.groups[0].lastKey='old';assert.equal(vm.runInContext('hasPending()',c),true);assert.equal(reads,3);
});

test('unchanged or failed automatic receive polls leave the live DOM alone',async()=>{
 let renders=0,applied=0;const payload={version:7,songs:[{}]};
 const c=vm.createContext({S:{songs:[{}],setlistVer:7},fetchSetlist:async()=>payload,render(){renders++;},applySetlist(){applied++;},syncErr:''});
 vm.runInContext(block('async function syncSetlist(manual)', '/* ---- 共有リンク'),c);
 await vm.runInContext('syncSetlist(false)',c);assert.equal(renders,0);assert.equal(applied,0);
 c.fetchSetlist=async()=>null;await vm.runInContext('syncSetlist(false)',c);assert.equal(renders,0);
 c.fetchSetlist=async()=>({...payload,version:8});await vm.runInContext('syncSetlist(false)',c);assert.equal(applied,1);
});
