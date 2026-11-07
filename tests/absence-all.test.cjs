'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),AbsenceChanges=require('../absence-changes.js');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function setup(){
 const people=['斉藤','広本','米村','窪田','中山','西﨑','北原','筒井'];const so={id:'s',showId:'show',roster:people,blocks:{A:['米村']},lines:[{t:'保持する歌詞',label:'米村',parts:['米村'],main:['米村'],cell:'A2',lcell:'B2'},{t:'#植村自己紹介',raw:'',labelRaw:'',label:'',cont:true,parts:people,cell:'A3',lcell:'B3'}]};
 const c=vm.createContext({S:{showId:'show',recMode:false,songs:[so],members:people.map(id=>({id,name:id})),shows:[{id:'show',absent:['米村']}],subs:{},gsubs:{},subsMan:{},assignmentEdits:{}},U:{menu:{kind:'assign',id:'s',i:0,idx:[0]}},AbsenceChanges,preview:null,VIEW:()=>false,recordingInboxCanWrite:()=>true,assignmentMembers:()=>people.map(id=>({id,assignmentIds:[id]})),absentIds:()=>c.S.shows[0].absent,subKey:id=>'show|'+id,subOf:(id,i)=>c.S.subs['show|'+id]?.[i],gsubOf:(id,b)=>c.S.gsubs['show|'+id]?.[b],blockParts:(s,b)=>c.S.gsubs['show|s']?.[b]||s.blocks[b],blockOf:()=>'',blocksOf:s=>Object.keys(s.blocks),member:id=>c.S.members.find(m=>m.id===id),names:ids=>ids.join('・'),pushUndo(){},rememberSub(){},save(){},schedulePush(){},renderSheet(){},render(){}});
 const a=source.indexOf('const partsOf =');vm.runInContext(source.slice(a,source.indexOf('\n};',a)+3)+'\nglobalThis.partsOf=partsOf;',c);
 for(const n of ['allAssignmentParts','assignmentIsAll','setAllAssignment','recordAssignmentChange','labelOf','lineStatus','absentEdits']){const i=source.indexOf('function '+n+'(');vm.runInContext(source.slice(i,source.indexOf('\n}',i)+2),c);}return {c,so};
}
test('explicit 全 stores real present IDs and label metadata without rewriting the lyric/source',()=>{
 const {c,so}=setup(),original=JSON.stringify(so);assert(c.setAllAssignment());assert.deepEqual(Array.from(c.partsOf(so,0)),['斉藤','広本','窪田','中山','西﨑','北原','筒井']);assert.equal(c.labelOf(so,0),'全');assert.equal(c.lineStatus(so,0),'changed');assert.equal(c.absentEdits(so).A2,'全');assert.equal(JSON.stringify(so),original);assert(!c.S.members.some(m=>m.name==='全'));
 c.recordAssignmentChange(so,'lines',0,c.partsOf(so,0));assert.equal(c.assignmentIsAll(so,'lines',0),true,'Export confirmation retains the explicit label');
 c.recordAssignmentChange(so,'lines',0,c.partsOf(so,0),false);assert.equal(c.assignmentIsAll(so,'lines',0),false,'A personal edit clears the all label');
});
test('blocks can become 全 and unavailable/viewer/header targets cannot be assigned',()=>{
 const {c,so}=setup();so.blockCells={A:'B1'};c.U.menu={kind:'block',id:'s',b:'A'};assert(c.setAllAssignment());assert.equal(c.absentEdits(so).B1,'全');
 c.U.menu={kind:'assign',id:'s',i:1,idx:[1]};assert.equal(c.setAllAssignment(),false);c.U.menu.i=0;c.U.menu.idx=[0];c.VIEW=()=>true;assert.equal(c.setAllAssignment(),false);
 c.VIEW=()=>false;c.S.shows[0].absent=c.S.members.map(m=>m.id);assert.equal(c.setAllAssignment(),false);
});
test('self-introduction headings ignore old confirmed substitutions without changing stored data',()=>{
 const {c,so}=setup();c.S.subs['show|s']={1:['斉藤','広本','窪田','中山','西﨑','北原','筒井']};c.recordAssignmentChange(so,'lines',1,c.S.subs['show|s'][1]);const saved=JSON.stringify(c.S);assert.deepEqual(Array.from(c.partsOf(so,1)),[]);assert.equal(c.labelOf(so,1),'');assert.equal(c.lineStatus(so,1),'');assert.equal(AbsenceChanges.line(so,1,{subs:c.S.subs['show|s'],edits:c.S.assignmentEdits['show|s'],absent:['米村']}),null);assert.equal(JSON.stringify(c.S),saved);
});
test('heading detection retains named spoken lines and ordinary merged lyric continuations',()=>{
 for(const name of ['橋田','吉田','小野田','村越','植村','松原','島川','上村','相馬'])assert(AbsenceChanges.heading({t:'#'+name+'自己紹介',cont:true,label:'',raw:''}));
 assert(!AbsenceChanges.heading({t:'#植村自己紹介',label:'村越'}));assert(!AbsenceChanges.heading({t:'「植村葉純」',label:'植村'}));assert(!AbsenceChanges.heading({t:'普通の歌詞の続き',cont:true,label:''}));
});

test('original Excel matching ignores only the inherited heading assignment, never changed text/cells or explicit singers',()=>{
 const {c,so}=setup(),i=source.indexOf('function originalExcelLayout(');vm.runInContext(source.slice(i,source.indexOf('\n}',i)+2),c);so.sheetName='歌割';
 const original=structuredClone(so);Object.assign(original.lines[1],{parts:[],main:[],cont:false});const project=s=>c.originalExcelLayout(s,id=>id);
 assert.equal(project(so),project(original));const changed=structuredClone(original);changed.lines[1].lcell='C99';assert.notEqual(project(so),project(changed));changed.lines[1].lcell='B3';changed.lines[1].t='#別の見出し自己紹介';assert.notEqual(project(so),project(changed));
 const explicit=structuredClone(original);Object.assign(explicit.lines[1],{label:'植村',raw:'植村',labelRaw:'植村',parts:['植村']});assert.notEqual(project(so),project(explicit));
});
