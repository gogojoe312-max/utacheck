const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'ui.js'),'utf8');
const component=source.slice(source.indexOf('const NoteKeyboard ='),source.lastIndexOf("if (typeof render"));
function setup({visual=true}={}){
 const events={},styles={},classes={},frames=[];let now=1000,commits=0,renders=0;
 const listen=(name,fn)=>{(events[name]||=[]).push(fn);};
 const close={textContent:'',setAttribute(k,v){this[k]=v;}};
 const field={id:'memo',value:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},closest:()=>({querySelector:()=>close}),blur(){c.document.activeElement=null;}};
 const doc={documentElement:{clientHeight:844,style:{setProperty:(k,v)=>styles[k]=v},classList:{toggle:(k,v)=>classes[k]=v}},body:{},activeElement:field,
  querySelector:()=>field,addEventListener:listen};
 const viewport={height:844,width:390,offsetTop:0,offsetLeft:0,addEventListener:listen};
 const c=vm.createContext({window:{innerHeight:844,innerWidth:390,visualViewport:visual?viewport:undefined,addEventListener:listen},document:doc,
  U:{sheet:{memo:'',tags:[]}},WeakSet,WeakMap,Number,Math,Infinity,performance:{now:()=>now},
  requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},MutationObserver:class{constructor(fn){this.callback=fn;}observe(){}},
  commitFields(){if(c.U.sheet)c.U.sheet.memo=field.value;},sheetHasInput:()=>!!c.U.sheet?.memo.trim(),
  scheduleCommit(){commits++;c.saved=c.U.sheet;c.U.sheet=null;},renderSheet(){renders++;}});
 vm.runInContext(component,c);
 const fire=(name,extra={})=>{const e={target:field,button:0,isPrimary:true,stopImmediatePropagation(){this.stopped=true;},preventDefault(){this.prevented=true;},...extra};for(const fn of events[name]||[])fn(e);return e;};
 return {c,field,close,viewport,styles,classes,frames,fire,fit:()=>vm.runInContext('NoteKeyboard.fit()',c),advance:ms=>now+=ms,
  open:()=>vm.runInContext('positionQuickNote()',c),get commits(){return commits;},get renders(){return renders;}};
}
test('all shipped scripts parse and every linked local asset exists',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const [,url] of html.matchAll(/<script\s+src="([^"]+)"/g)){
  const file=path.join(root,url.split('?')[0]);assert(fs.existsSync(file),file);assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(file,'utf8'),{filename:file}));
 }
 assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,'sw.js'),'utf8')));
});
test('keyboard height and panning set actual visible bounds instead of the layout viewport',()=>{
 const s=setup();Object.assign(s.viewport,{height:350,offsetTop:80,offsetLeft:4,width:380});s.fit();
 assert.equal(s.styles['--note-vv-height'],'350px');assert.equal(s.styles['--note-vv-top'],'80px');assert.equal(s.styles['--note-vv-width'],'380px');assert.equal(s.styles['--note-vv-left'],'4px');
 assert.equal(s.styles['--note-bottom-gap'],'8px');assert.equal(s.classes['note-compact'],true);assert.equal(s.classes['note-short'],false);
 s.viewport.height=170;s.fit();assert.equal(s.classes['note-short'],true);
});
test('resize bursts schedule one layout update and never re-render the input',()=>{
 const s=setup();s.fire('resize');s.fire('scroll');s.fire('resize');assert.equal(s.frames.length,1);
 s.viewport.height=400;s.frames[0]();assert.equal(s.styles['--note-vv-height'],'400px');assert.equal(s.renders,0);assert.equal(s.commits,0);
});
test('browsers without visualViewport retain a window-sized dialog',()=>{
 const s=setup({visual:false});assert.equal(s.styles['--note-vv-height'],'844px');assert.equal(s.styles['--note-vv-width'],'390px');assert.equal(s.styles['--note-vv-top'],'0px');
});
test('typing retains the draft and deleting all characters clears it without saving',()=>{
 const s=setup();s.field.value='低い';s.fire('input');assert.equal(s.c.U.sheet.memo,'低い');assert.equal(s.close.textContent,'保存');
 s.field.value='';s.fire('input');assert.equal(s.c.U.sheet.memo,'');assert.equal(s.close.textContent,'閉じる');assert.equal(s.commits,0);assert.equal(s.renders,0);
});
test('IME conversion Enter and Safari-style keyCode 229 do not save or prevent conversion',()=>{
 const s=setup();s.field.value='ひくい';s.fire('compositionstart');
 let e=s.fire('keydown',{key:'Enter',isComposing:true});assert.equal(e.stopped,true);assert.equal(e.prevented,undefined);assert.equal(s.commits,0);
 s.fire('compositionend');e=s.fire('keydown',{key:'Enter',keyCode:229});assert.equal(e.prevented,undefined);assert.equal(s.commits,0);
 s.advance(30);s.fire('keydown',{key:'Enter'});assert.equal(s.commits,0);
 s.advance(100);s.field.value='低い';s.fire('keydown',{key:'Enter'});assert.equal(s.commits,1);assert.equal(s.c.saved.memo,'低い');
});
test('Done blurs before commit, closes once, and held Enter cannot duplicate a note',()=>{
 const s=setup();s.field.value='語尾を短く';let e=s.fire('keydown',{key:'Enter',repeat:true});assert.equal(s.commits,0);
 e=s.fire('keydown',{key:'Enter'});assert.equal(e.prevented,true);assert.equal(s.c.document.activeElement,null);assert.equal(s.commits,1);assert.equal(s.c.saved.memo,'語尾を短く');
 s.fire('keydown',{key:'Enter'});assert.equal(s.commits,1);
});
test('empty Done closes without making an empty note',()=>{
 const s=setup();s.fire('keydown',{key:'Enter'});assert.equal(s.commits,0);assert.equal(s.renders,1);assert.equal(s.c.U.sheet,null);
});
test('pressing a note button holds focus until click, but typing and secondary pointers are untouched',()=>{
 const s=setup(),target={closest:()=>true};
 assert.equal(s.fire('pointerdown',{target}).prevented,true);assert.equal(s.fire('mousedown',{target}).prevented,true);
 assert.equal(s.fire('pointerdown',{target,isPrimary:false}).prevented,undefined);
 assert.equal(s.fire('pointerdown',{target,button:2}).prevented,undefined);
 assert.equal(s.fire('pointerdown',{target:{closest:()=>null}}).prevented,undefined);
 assert.equal(s.commits,0);
});


test('quick-panel presentation hook updates bounds without refocusing the input',()=>{
 const s=setup();let calls=0;s.field.focus=()=>{calls++;};
 s.field.blur();s.viewport.height=360;s.open();s.open();assert.equal(calls,0);assert.equal(s.c.document.activeElement,null);
 assert.equal(s.styles['--note-vv-height'],'360px');
});
