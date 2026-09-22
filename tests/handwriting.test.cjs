const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),app=read('app.js');
const block=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const clone=x=>JSON.parse(JSON.stringify(x));
const ku=[[[180,30],[145,65],[105,105],[65,130],[110,165],[155,210],[185,238]]];
const ii=[[[55,50],[50,90],[50,130],[55,165],[75,195],[95,170]],[[175,70],[200,105],[210,135],[215,155]]];
const low=[[[80,40],[40,100]],[[60,80],[60,225]],[[200,35],[130,55]],[[128,55],[126,205],[153,184]],[[130,110],[222,103]],[[173,43],[173,115],[185,177],[215,215],[233,205]],[[150,212],[172,236]]];
const ink=()=>({v:1,cells:[clone(ku),clone(ii)],text:'',state:'pending'});
function setup(){
 const timers=new Map(),workers=[],events={},canvases=[];let serial=0,saves=0,renders=0;
 const c=vm.createContext({S:{notes:[],songs:[],showId:'show'},U:{sheet:null},overlay:null,booted:false,
  Worker:class{constructor(){workers.push(this);}postMessage(msg){this.msg=clone(msg);}terminate(){this.terminated=true;}},
  setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);},
  document:{getElementById:()=>null,addEventListener(name,fn){events[name]=fn;},body:{appendChild(el){c.html=el.innerHTML;}},
   createElement(){return {innerHTML:'',querySelectorAll:()=>canvases,querySelector:()=>({disabled:true})};}},
  VIEW:()=>false,typingNow:()=>false,save(){saves++;},schedulePush(){},render(){renders++;},renderSheet(){renders++;},commitFields(){},pushUndo(){},
  recAt:()=>12,takeCtx:()=> 'take1',uid:()=> 'note1',clearTimeout:()=>{},
  song:()=>({id:'song1'}),h:s=>String(s??'').replaceAll('<','&lt;'),
 });
 vm.runInContext(read('hand-data.js'),c);vm.runInContext(read('hand-notes.js'),c);
 const run=s=>vm.runInContext(s,c);
 return {c,run,workers,timers,events,canvases,get saves(){return saves;},get renders(){return renders;},
  response(text,error=false){const w=workers.at(-1);w.onmessage({data:{id:w.msg.id,text,error}});}};
}
test('handwriting saves immediately with the lyric range, member, show and take before recognition',()=>{
 const s=setup();s.c.U.sheet={lineIdx:0,rangeLine:2,range:[3,8],sel:['m'],tags:[],memo:'',seq:[],hand:ink()};
 vm.runInContext(block('let sheetTimer = null;', '// 今のセットリスト'),s.c);s.run('commitNote()');
 const n=s.c.S.notes[0];assert.equal(s.c.U.sheet,null);assert.equal(s.saves,1);assert.equal(n.hand.state,'pending');
 assert.deepEqual([n.songId,n.showId,n.tk,n.lineIdx,n.from,n.to],['song1','show','take1',2,3,8]);assert.deepEqual(n.memberIds,['m']);
 assert.deepEqual(clone(n.hand.cells),ink().cells);s.response('くい');assert.equal(n.hand.text,'くい');assert.equal(n.hand.state,'draft');
 assert.deepEqual(clone(n.hand.cells),ink().cells);assert.equal(s.c.S.notes.length,1);
});
test('late results never resurrect undone notes or overwrite manual corrections',()=>{
 for(const mutation of ['delete','replace','manual']){
  const s=setup(),n={id:'n',hand:ink()};s.c.S.notes=[n];s.run('HandNotes.recognize(S.notes[0])');
  if(mutation==='delete')s.c.S.notes=[];
  if(mutation==='replace')s.c.S.notes=[clone(n)];
  if(mutation==='manual')n.hand={...n.hand,text:'低い',state:'manual'};
  s.response('別の文字');assert.equal(s.saves,0);assert.notEqual(s.c.S.notes[0]?.hand.text,'別の文字');
 }
});
test('recognition failure keeps the original and a saved correction remains editable',()=>{
 const s=setup(),n={id:'n',hand:ink()};s.c.S.notes=[n];s.run('HandNotes.recognize(S.notes[0])');s.response('',true);
 assert.equal(n.hand.state,'unread');assert.deepEqual(clone(n.hand.cells),ink().cells);
 s.c.U.menu={kind:'hand-edit',id:'n',text:'語尾を短く'};s.run('HandNotes.handle("hand-text-save")');
 assert.equal(n.hand.text,'語尾を短く');assert.equal(n.hand.state,'manual');assert.deepEqual(clone(n.hand.cells),ink().cells);
});
test('a current input dialog is not re-rendered by recognition and duplicate jobs are not queued',()=>{
 const s=setup(),n={id:'n',hand:ink()};s.c.S.notes=[n];s.c.U.sheet={handOpen:true};
 s.run('HandNotes.recognize(S.notes[0]);HandNotes.recognize(S.notes[0])');assert.equal(s.workers.length,1);
 s.response('くい');assert.equal(s.renders,0);assert.equal(n.hand.text,'くい');
});
test('compact ink is bounded, finite, detached from the draft, and renders no untrusted SVG markup',()=>{
 const s=setup();s.c.data={v:1,cells:[[[[-100,999],[NaN,1],[30,40]]]],text:'<img onerror=bad>',state:'draft'};
 const data=s.run('HandData.clean(data)');assert.deepEqual(clone(data.cells),[[[[0,255],[30,40]]]]);
 s.c.data.cells[0][0][0][0]=90;assert.equal(data.cells[0][0][0][0],0);
 const svg=s.run('HandData.svg(data)');assert(!svg.includes('<img'));assert(!svg.includes('NaN'));
 s.c.note={id:'n',hand:ink(),ro:true};const view=s.run('HandNotes.preview(note)');assert(view.includes('手書きの原文'));assert(!view.includes('data-act="hand-edit"'));
});
test('canvas scales strokes to its visible bounds, keeps cancelled strokes, and undo removes only the last stroke',()=>{
 const s=setup(),handlers={};
 const canvas={dataset:{handCell:'0'},getContext:()=>({clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}}),getBoundingClientRect:()=>({left:40,top:80,width:128,height:128}),setPointerCapture(){},addEventListener(n,fn){handlers[n]=fn;}};
 s.canvases.push(canvas);s.c.U.sheet={hand:ink(),handOpen:true};s.run('HandNotes.render(U.sheet,"テスト")');
 const fire=(n,x,y,extra={})=>handlers[n]({type:n,button:0,isPrimary:true,pointerId:1,clientX:x,clientY:y,preventDefault(){},...extra});
 fire('pointerdown',50,90);fire('pointermove',80,130);fire('pointermove',100,150,{pointerId:2});fire('pointercancel',80,130);
 const strokes=s.c.U.sheet.hand.cells[0];assert.deepEqual(clone(strokes.at(-1)),[[20,20],[80,100]]);
 s.run('HandNotes.handle("hand-undo")');assert.deepEqual(clone(strokes),ku);
});
test('blank handwriting does not create a note on close and unfinished writing is detected',()=>{
 const s=setup();vm.runInContext(block('function sheetHasInput()', '// タグを押したら'),s.c);
 s.c.U.sheet={sel:['m'],tags:[],memo:'',seq:[],hand:{v:1,cells:[[],[]]}};assert.equal(s.run('sheetHasInput()'),false);
 s.c.U.sheet.hand=ink();assert.equal(s.run('sheetHasInput()'),true);
});
test('backup packing and publication preserve original ink and recognition text, filtering unrelated groups',()=>{
 const s=setup();s.c.S={...s.c.S,gsubs:{},subs:{},shows:[{id:'show'}],songs:[{id:'s',groupId:'g',showId:'show',title:'test',lines:[{t:'テスト',parts:['m']}]}],notes:[{songId:'s',lineIdx:0,memberIds:['m'],tags:[],hand:{...ink(),text:'低い',state:'manual'}},{songId:'other',hand:ink()}]};
 s.c.group=()=>({id:'g',name:'group'});s.c.member=()=>({name:'member'});s.c.showsNewestFirst=()=>s.c.S.shows;
 vm.runInContext(block('function packState(', 'function freeSpace('),s.c);
 vm.runInContext(block('function publicationData(', 'async function gh('),s.c);
 const backup=s.run('unpackState(JSON.parse(JSON.stringify(packState(S))))');assert.deepEqual(clone(backup.notes[0].hand),clone(s.c.S.notes[0].hand));
 const pub=s.run('publicationData("g")');assert.equal(pub.notes.length,1);assert.deepEqual(clone(pub.notes[0].hand),clone(s.c.S.notes[0].hand));
 assert.equal(pub.notes[0].memberNames[0],'member');
});
test('real bundled recognizer reads independent handwritten kana strokes and reports missing models safely',async()=>{
 const results=[];
 const c=vm.createContext({self:{postMessage:msg=>results.push(msg)},fetch:async()=>({ok:true,json:async()=>JSON.parse(read('vendor/hand-patterns.json'))})});
 c.importScripts=(...files)=>files.forEach(f=>vm.runInContext(read(f),c));vm.runInContext(read('hand-worker.js'),c);
 await c.self.onmessage({data:{id:1,hand:ink()}});assert.equal(results[0].text,'くい');
 await c.self.onmessage({data:{id:2,hand:{v:1,cells:[low,ii],state:'pending'}}});
 assert(results[1].text.length===2); // accuracy is experimental; originals remain authoritative.
 const fail=vm.createContext({self:{postMessage:msg=>results.push(msg)},fetch:async()=>({ok:false})});fail.importScripts=(...files)=>files.forEach(f=>vm.runInContext(read(f),fail));vm.runInContext(read('hand-worker.js'),fail);
 await fail.self.onmessage({data:{id:3,hand:ink()}});assert.equal(results[2].error,true);
});
