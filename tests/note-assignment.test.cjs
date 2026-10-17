'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function fixture(){
 const so={id:'song',showId:'show',blocks:{A:['original']},lines:[{parts:['original'],label:'A'}]};
 const c=vm.createContext({S:{showId:'show',subs:{},gsubs:{},notes:[]},U:{sheet:null},song:()=>so,VIEW:()=>false,
  blockOf:(s,i)=>s.lines[i].label,renderSheet(){},render(){},pushUndo(){},save(){},schedulePush(){},
  uid:()=> 'note',recAt:()=>null,takeCtx:()=>null,catOf:x=>x,parseNoteInput:s=>({memo:s,tags:[]}),
  document:{getElementById:()=>null},clearTimeout,sheetTimer:null});
 const a=source.indexOf('const partsOf =');vm.runInContext(source.slice(a,source.indexOf('\n};',a)+3),c);
 for(const name of ['openSheet','commitNote']){const start=source.indexOf('function '+name+'(');vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),c);}
 return {c,so,run:text=>vm.runInContext(text,c)};
}
test('new feedback records the changed performer, including a change made while its sheet is open',()=>{
 const {c,run}=fixture();c.S.subs['show|song']={0:['replacement']};run('openSheet(0)');assert.deepEqual(Array.from(c.U.sheet.sel),['replacement']);
 c.S.subs['show|song'][0]=['latest'];c.U.sheet.memo='Pitch correction';run('commitNote()');assert.deepEqual(Array.from(c.S.notes[0].memberIds),['latest']);
});
test('an explicit personal feedback target remains explicit',()=>{
 const {c,run}=fixture();run('openSheet(0)');c.U.sheet.sel=['individual'];c.U.sheet.memo='Personal feedback';c.S.subs['show|song']={0:['replacement']};run('commitNote()');assert.deepEqual(Array.from(c.S.notes[0].memberIds),['individual']);
});
test('effective assignment uses the song performance and keeps an explicit empty line override',()=>{
 const {c,so,run}=fixture();c.S.showId='different';c.S.gsubs['show|song']={A:['replacement']};c.S.gsubs['different|song']={A:['wrong']};
 assert.deepEqual(Array.from(run('partsOf(song(),0)')),['replacement']);c.S.subs['show|song']={0:[]};assert.deepEqual(Array.from(run('partsOf(song(),0)')),[]);assert.equal(so.lines[0].parts[0],'original');
});
