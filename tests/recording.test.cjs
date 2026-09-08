/* node --test tests/recording.test.cjs */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function declaration(name){
 const start=source.indexOf('function '+name+'(');
 assert.ok(start>=0,name);
 return source.slice(start,source.indexOf('\n}',start)+2);
}
function state(){
 const c=vm.createContext({Date,console,setTimeout:()=>{},document:{getElementById:()=>null},save:()=>{},render:()=>{},pushUndo:()=>{},alert:()=>{throw Error('Unexpected alert');}});
 vm.runInContext(`let S={recMode:true,rsongId:'second',rsongs:[{id:'first'},{id:'second'}],planAuto:true,plan:{start:'10:00',slots:[{id:'a',kind:'member',name:'A',min:60},{id:'b',kind:'break',name:'休憩',min:15},{id:'c',kind:'member',name:'C',min:60}]}}, U={songIdx:0,secView:''};let autoMsg='';const nowMin=()=>600;const PREP='RH';const SEC_MIN=5;const sectionOrder=()=>['1A'];const secBars=()=>({});const tagBase=s=>s;const isTagSec=()=>false;`,c);
 for(const name of ['hm2min','planRows','focusRow','sectionsOf','startSlot','finishSlot','autoPlan'])vm.runInContext(declaration(name),c);
 for(const name of ['recSong','song'])vm.runInContext(source.split('\n').find(l=>l.startsWith('const '+name+' =')),c);
 const start=source.indexOf('    case "pnextsec":');
 const end=source.indexOf('    case "psetstart":',start);
 vm.runInContext('function nextSection(){switch("pnextsec"){'+source.slice(start,end)+'}}',c);
 const x=code=>vm.runInContext(code,c);
 return x;
}
test('selected recording song survives a stale index and reordered songs',()=>{
 const x=state();assert.equal(x('recSong().id'),'second');assert.equal(x('song().id'),'second');
 x('S.rsongs.reverse();U.songIdx=1');assert.equal(x('song().id'),'second');
 x('S.recMode=false; var SONGS=()=>S.rsongs');assert.equal(x('song().id'),'first');
});
test('old automatic progress setting cannot start overdue slots or advance a live slot',()=>{
 const x=state();x('S.plan.slots.forEach(s=>s.at=590);autoPlan()');
 assert.equal(x('S.plan.slots.some(s=>s.a0!=null)'),false);
 x('startSlot(S.plan.slots[0]);autoPlan()');
 assert.equal(x('S.plan.slots[0].a1'),undefined);assert.equal(x('S.plan.slots[1].a0'),undefined);
 assert.equal(x('song().id'),'second');
});
test('last recording section finishes without starting the next person or review',()=>{
 const x=state();x('startSlot(S.plan.slots[0]);nextSection()');
 assert.equal(x('S.plan.slots[0].a1'),600);assert.equal(x('S.plan.slots[1].a0'),undefined);
 assert.equal(x('S.planFocus'),'a');assert.equal(x('U.menu'),undefined);assert.equal(x('song().id'),'second');
});
test('breaks have no recording sections and end without starting another slot',()=>{
 const x=state();x('startSlot(S.plan.slots[0]);startSlot(S.plan.slots[1])');
 assert.equal(x('S.plan.slots.filter(s=>s.a0!=null&&s.a1==null).length'),1);
 assert.equal(x('focusRow().s.kind'),'break');assert.equal(x('sectionsOf(focusRow().s).length'),0);
 assert.equal(x('U.secView'),'');x('nextSection()');assert.equal(x('S.plan.slots[1].a1'),undefined);
 x('finishSlot(S.plan.slots[1])');assert.equal(x('S.plan.slots[2].a0'),undefined);assert.equal(x('song().id'),'second');
});
