const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const ink=()=>({v:1,cells:[[[[50,50],[190,190]]],[],[[[100,30],[100,220]]]],text:'つい',state:'draft'});
function setup(){
 const workers=[],timers=new Map(),events={},els={};let serial=0,saves=0,undos=0;
 const c=vm.createContext({S:{notes:[{id:'n',hand:ink()}]},U:{menu:{kind:'hand-edit',id:'n',text:'つい'}},overlay:null,booted:false,
  Worker:class {constructor(file){this.file=file;this.messages=[];workers.push(this);}postMessage(msg){this.messages.push(clone(msg));}terminate(){this.terminated=(this.terminated||0)+1;}},
  setTimeout(fn,ms){timers.set(++serial,{fn,ms});return serial;},clearTimeout(id){timers.delete(id);},
  document:{getElementById:id=>els[id]||null,addEventListener(name,fn){(events[name]||=[]).push(fn);},body:{appendChild(el){c.html=el.innerHTML;}},createElement(){return {innerHTML:'',querySelectorAll:()=>[]};}},
  VIEW:()=>false,typingNow:()=>false,save(){saves++;},schedulePush(){},render(){},renderSheet(){},commitFields(){},pushUndo(){undos++;},
  h:s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
 });
 for(const f of ['hand-data.js','hand-notes.js'])vm.runInContext(read(f),c);
 const run=s=>vm.runInContext(s,c),act=(name,id)=>{c.action=name;c.id=id;return run('HandNotes.handle(action,id)');};
 const respond=(response={},worker=workers.at(-1))=>worker.onmessage({data:{id:worker.messages.at(-1).id,text:'つい',candidates:[{index:0,choices:[{text:'つ',score:1},{text:'く',score:.5}]},{index:2,choices:[{text:'い',score:1},{text:'り',score:.5}]}],...response}});
 return {c,workers,timers,events,els,run,act,respond,get saves(){return saves;},get undos(){return undos;},fire(name,event){for(const fn of events[name]||[])fn(event);}};
}
test('new recognition remains opt-in; default notes use the existing lightweight worker',()=>{
 const s=setup();s.c.S.notes[0].hand.state='pending';s.run('HandNotes.recognize(S.notes[0])');
 assert.match(s.workers[0].file,/^hand-worker\.js/);assert.equal(s.workers.length,1);
});
test('trial candidates and kana changes never change the saved note until explicit Save',()=>{
 const s=setup(),before=clone(s.c.S.notes[0]);s.act('hand-model-read');
 assert.match(s.workers[0].file,/^hand-model-worker\.js/);assert.deepEqual(clone(s.c.S.notes[0]),before);assert.equal(s.saves,0);
 s.respond();assert.equal(s.c.U.menu.modelBusy,false);assert.equal(s.c.U.menu.candidates.length,2);assert.equal(s.timers.size,0);
 s.act('hand-kana','0');assert.equal(s.c.U.menu.text,'っい');s.act('hand-candidate','1:1');assert.equal(s.c.U.menu.text,'っり');
 assert.deepEqual(clone(s.c.S.notes[0]),before);assert.equal(s.saves,0);
 s.act('hand-text-save');const note=s.c.S.notes[0];assert.equal(note.hand.text,'っり');assert.equal(note.hand.state,'manual');assert.equal(s.saves,1);assert.equal(s.undos,1);
 assert.deepEqual(clone(note.hand.cells),before.hand.cells);assert.equal(note.hand.candidates,undefined);assert.equal(note.hand.engine,undefined);
});
test('failed, timed-out and malformed trials preserve both corrected text and original ink',()=>{
 for(const failure of ['error','timeout','empty','messageerror']){
  const s=setup(),before=clone(s.c.S.notes[0]);s.act('hand-model-read');
  if(failure==='error')s.respond({error:true});
  if(failure==='timeout')[...s.timers.values()][0].fn();
  if(failure==='empty')s.respond({text:'',candidates:[]});
  if(failure==='messageerror')s.workers[0].onmessageerror();
  assert.deepEqual(clone(s.c.S.notes[0]),before);assert.equal(s.c.U.menu.text,'つい');assert.equal(s.saves,0);assert.equal(s.timers.size,0);assert.equal(s.workers[0].terminated,1);
  if(failure!=='empty')assert.match(s.c.U.menu.modelStatus,/読み取れません/);
 }
});
test('typing wins over a trial reply without rerendering or resetting the edit field',()=>{
 const s=setup();s.els['hand-text']={value:'自分で修正'};s.act('hand-model-read');
 s.fire('input',{target:{id:'hand-text',value:'自分で修正'}});s.respond();
 assert.equal(s.c.U.menu.text,'自分で修正');assert.equal(s.els['hand-text'].value,'自分で修正');assert.equal(s.c.U.menu.candidates,null);
 assert.match(s.c.U.menu.modelStatus,/入力した文字を優先/);assert.equal(s.c.S.notes[0].hand.text,'つい');
});
test('late trial results cannot resurrect deleted, replaced or manually corrected notes',()=>{
 for(const mutation of ['delete','replace','manual','readonly','view','close']){
  const s=setup();s.act('hand-model-read');
  if(mutation==='delete')s.c.S.notes=[];
  if(mutation==='replace')s.c.S.notes=[clone(s.c.S.notes[0])];
  if(mutation==='manual')s.c.S.notes[0].hand={...ink(),text:'確定',state:'manual'};
  if(mutation==='readonly')s.c.S.notes[0].ro=true;
  if(mutation==='view')s.c.VIEW=()=>true;
  if(mutation==='close')s.c.U.menu=null;
  s.respond({text:'悪い返信'});assert.equal(s.saves,0);assert.notEqual(s.c.U.menu?.text,'悪い返信');assert.notEqual(s.c.S.notes[0]?.hand.text,'悪い返信');
 }
});
test('closing the editor releases its worker and a new note gets no stale choices',()=>{
 const s=setup();s.act('hand-model-read');const old=s.workers[0];
 s.fire('click',{target:{closest:()=>({dataset:{act:'closemenu'}})}});s.c.U.menu=null;
 assert.equal(old.terminated,1);assert.equal(s.timers.size,0);
 s.act('hand-edit','n');s.respond({text:'遅い返信'},old);assert.equal(s.c.U.menu.candidates,undefined);
 s.act('hand-model-read');assert.equal(s.workers.length,2);
});
test('read-only notes reject direct edit, retry, model, candidate and save actions',()=>{
 for(const action of ['hand-edit','hand-retry','hand-model-read','hand-candidate','hand-text-save']){
  const s=setup();s.c.S.notes[0].ro=true;const before=clone(s.c.S.notes[0]);
  s.act(action,action==='hand-edit'?'n':'0:0');assert.equal(s.saves,0);assert.equal(s.workers.length,0);assert.deepEqual(clone(s.c.S.notes[0]),before);
 }
});
test('repeated trial taps start only one job and manual editing clears misleading per-cell choices',()=>{
 const s=setup();s.act('hand-model-read');s.act('hand-model-read');assert.equal(s.workers.length,1);s.respond();
 s.fire('input',{target:{id:'hand-text',value:'別の文'}});assert.equal(s.c.U.menu.candidates,null);s.act('hand-candidate','0:1');assert.equal(s.c.U.menu.text,'別の文');
});
test('invalid candidate indices are ignored and model HTML is escaped in the editor',()=>{
 const s=setup();s.act('hand-model-read');s.respond({text:'<&',candidates:[{index:0,choices:[{text:'<img>',score:1},{text:'<',score:.5}]},{index:2,choices:[{text:'&',score:1}]}]});
 for(const id of ['-1:0','99:0','0:99','x:y'])s.act('hand-candidate',id);
 s.run('HandNotes.renderEdit(U.menu)');assert(s.c.html.includes('&lt;'));assert(s.c.html.includes('&amp;'));assert(!s.c.html.includes('<img>'));
});
test('small kana toggles in both directions without adding candidate data to the note',()=>{
 const s=setup();s.act('hand-model-read');s.respond({text:'ツヤ'});s.act('hand-kana','0');s.act('hand-kana','1');assert.equal(s.c.U.menu.text,'ッャ');
 s.act('hand-kana','0');s.act('hand-kana','1');assert.equal(s.c.U.menu.text,'ツヤ');assert.equal(s.saves,0);
});
test('a default-worker timeout ends all stalled jobs and the next note starts a fresh worker',()=>{
 const s=setup();s.c.S.notes=[{id:'a',hand:{...ink(),state:'pending'}},{id:'b',hand:{...ink(),state:'pending'}}];
 s.run('S.notes.forEach(HandNotes.recognize)');assert.equal(s.workers.length,1);[...s.timers.values()][0].fn();
 assert.equal(s.workers[0].terminated,1);assert.equal(s.timers.size,0);assert(s.c.S.notes.every(n=>n.hand.state==='unread'));
 s.c.S.notes.push({id:'c',hand:{...ink(),state:'pending'}});s.run('HandNotes.recognize(S.notes[2])');assert.equal(s.workers.length,2);
 s.respond({text:'くい'});assert.equal(s.c.S.notes[2].hand.text,'くい');
});
test('a late error from an obsolete worker never terminates its replacement',()=>{
 const s=setup();s.c.S.notes[0].hand.state='pending';s.run('HandNotes.recognize(S.notes[0])');const old=s.workers[0];old.onerror();
 s.c.S.notes[0].hand={...ink(),state:'pending'};s.run('HandNotes.recognize(S.notes[0])');old.onerror();old.onmessageerror();
 assert.equal(s.workers[1].terminated,undefined);s.respond({text:'くい'});assert.equal(s.c.S.notes[0].hand.text,'くい');
});
test('saved corrections are capped to the same length accepted by the handwriting data format',()=>{
 const s=setup();s.c.U.menu.text='あ'.repeat(1200);s.act('hand-text-save');assert.equal(s.c.S.notes[0].hand.text.length,1000);
});
