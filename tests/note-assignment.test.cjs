'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function fixture(){
 const so={id:'song',showId:'show',blocks:{A:['original']},lines:[{parts:['original'],label:'A'}]};
 const c=vm.createContext({S:{showId:'show',subs:{},gsubs:{},notes:[]},U:{sheet:null},song:()=>so,VIEW:()=>false,
  preview:null,recordingInboxCanWrite:()=>true,runAt:()=>[0],blockOf:(s,i)=>s.blocks?.[s.lines[i].label]?s.lines[i].label:'',renderSheet(){},render(){},pushUndo(){},save(){},schedulePush(){},
  uid:()=> 'note',recAt:()=>null,takeCtx:()=>null,catOf:x=>x,parseNoteInput:s=>({memo:s,tags:[]}),
  document:{getElementById:()=>null},clearTimeout,sheetTimer:null});
 const a=source.indexOf('const partsOf =');vm.runInContext(source.slice(a,source.indexOf('\n};',a)+3),c);
 for(const name of ['openSheet','commitNote','openAssignmentForLine']){const start=source.indexOf('function '+name+'(');vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),c);}
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

test('absence lyric taps open the real line assignment editor without creating a feedback draft',()=>{
 const {c,so,run}=fixture();so.lines[0].label='米村';c.U.view='live';c.U.absenceReturn={showId:'show'};run('openSheet(0,[0,1],null,{x:10,y:10})');
 assert.equal(c.U.sheet,null);assert.deepEqual(JSON.parse(JSON.stringify(c.U.menu)),{kind:'assign',id:'song',i:0,idx:[0]});assert.equal(c.S.notes.length,0);
});
test('absence lyric taps on an A/B assignment open the block editor',()=>{
 const {c,run}=fixture();c.U.view='live';c.U.absenceReturn={showId:'show'};run('openSheet(0)');assert.equal(c.U.sheet,null);assert.deepEqual(JSON.parse(JSON.stringify(c.U.menu)),{kind:'block',id:'song',b:'A'});
});
test('leaving absence context, a different show and REC keep the normal feedback behavior',()=>{
 for(const context of [{absenceReturn:null},{absenceReturn:{showId:'other'}},{absenceReturn:{showId:'show'},rec:true}]){
  const {c,run}=fixture();c.U.view='live';c.U.absenceReturn=context.absenceReturn;c.S.recMode=!!context.rec;run('openSheet(0)');assert.equal(c.U.sheet.quick,true);assert.equal(c.U.menu,undefined);
 }
});
test('read-only member and preview contexts cannot enter absence assignment editing',()=>{
 for(const preview of [false,true]){const {c,run}=fixture();c.U.view='live';c.U.absenceReturn={showId:'show'};c.preview=preview;c.VIEW=()=>!preview;run('openSheet(0)');assert.equal(c.U.sheet,null);assert.equal(c.U.menu,undefined);}
});
