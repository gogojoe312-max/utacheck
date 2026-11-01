'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
const read=name=>{const start=source.indexOf('function '+name+'(');return start<0?'':source.slice(start,source.indexOf('\n}',start)+2);};
const json=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const names=['北原','米村','斉藤','窪田','筒井','西﨑','広本','中山','西崎','北','斉','広','A','B','間奏','お客さん'];
 const so={id:'song',groupId:'g',showId:'show',roster:names.slice(),blocks:{A:['米村','斉藤']},lines:[{t:'合成歌詞',parts:['米村']}]};
 const S={groupId:'g',showId:'show',groups:[{id:'g',name:'OCHA NORMA'}],members:names.map(name=>({id:name,name})),rosters:{'OCHA NORMA':names.slice()},songs:[so],shows:[{id:'show',absent:['米村']}],subs:{},gsubs:{},subsMan:{}};
 const c={S,U:{menu:{id:'song',i:0}},id:'斉藤',song:()=>so,group:()=>S.groups[0],member:id=>S.members.find(m=>m.id===id),compactMemberLabel:x=>x,songRoster:s=>s.roster,showRoster:()=>so.roster,VIEW:()=>false,
  absentIds:id=>S.shows.find(sw=>sw.id===(id||S.showId))?.absent||[],partsOf:s=>S.subs['show|song']?.[0]||s.lines[0].parts,blockParts:(s,b)=>S.gsubs['show|song']?.[b]||s.blocks[b],subKey:()=> 'show|song',recordAssignmentChange(){},rememberSub(){},save(){},schedulePush(){},renderSheet(){},render(){}};
 vm.createContext(c);for(const name of ['viewerMemberName','viewerMembers','assignmentMembers','nextAssignment']){const code=read(name);if(code)vm.runInContext(code,c);}
 const act=(id,type='setassign')=>{c.id=id;if(type==='setblock')c.U.menu={id:'song',b:'A'};const a=source.indexOf('    case "'+type+'": {'),b=source.indexOf('\n    case ',a+10);vm.runInContext('switch("'+type+'"){'+source.slice(a,b)+'}',c);return json(type==='setassign'?S.subs['show|song'][0]:S.gsubs['show|song'].A);};
 return {c,S,so,act};
}
test('one replacement tap removes the absent solo without an extra deselect tap',()=>{
 const f=fixture(),before=json(f.so);assert.deepEqual(f.act('斉藤'),['斉藤']);assert.deepEqual(f.so,before);
});
test('a new replacement cleans an old manual absent/replacement pair and retains present singers',()=>{
 const f=fixture();f.S.subs['show|song']={0:['米村','斉藤']};assert.deepEqual(f.act('広本'),['斉藤','広本']);assert.equal(f.S.subsMan['show|song'][0],1);
});
test('all absent people are removed from a multi-person assignment, present partners remain',()=>{
 const f=fixture();f.so.lines[0].parts=['米村','北原','窪田'];f.S.shows[0].absent=['米村','北原'];assert.deepEqual(f.act('斉藤'),['窪田','斉藤']);
});
test('block replacements share the same absence semantics',()=>{
 const f=fixture();assert.deepEqual(f.act('広本','setblock'),['斉藤','広本']);assert.deepEqual(f.so.blocks.A,['米村','斉藤']);
});
test('ordinary non-absence multi-select and explicit empty selection remain usable',()=>{
 const f=fixture();f.S.shows[0].absent=[];assert.deepEqual(f.act('米村'),[]);assert.deepEqual(f.act('斉藤'),['斉藤']);assert.deepEqual(f.act('広本'),['斉藤','広本']);
});
test('an absent person cannot be added back by clicking their chip',()=>{
 const f=fixture();f.S.subs['show|song']={0:['斉藤']};assert.deepEqual(f.act('米村'),['斉藤']);
});
test('alias selections toggle one real person and absent aliases are removed together',()=>{
 const f=fixture();f.so.lines[0].parts=['西崎','斉藤'];f.S.shows[0].absent=['西﨑'];assert.deepEqual(f.act('広本'),['斉藤','広本']);
 const g=fixture();g.so.lines[0].parts=['西崎','斉藤'];g.S.shows[0].absent=[];assert.deepEqual(g.act('西﨑'),['斉藤']);
});
test('the raw nine-person screenshot roster and contaminated registered roster project to the requested eight names without mutation',()=>{
 const f=fixture(),before=json(f.S);assert.equal(typeof f.c.assignmentMembers,'function');const projected=json(f.c.assignmentMembers(f.so));assert.deepEqual(projected.map(m=>m.name),['斉藤','広本','米村','窪田','中山','西﨑','北原','筒井']);assert.deepEqual(projected.find(m=>m.name==='西﨑').assignmentIds,['西﨑','西崎']);assert.deepEqual(f.S,before);
});
test('replacement absence follows the edited song own performance',()=>{
 const f=fixture();f.S.shows.push({id:'other',absent:['斉藤']});f.S.showId='other';assert.deepEqual(json(f.c.nextAssignment(f.so,['米村'],'斉藤')),['斉藤']);
});
test('same-name REC or other-performance IDs never enter the LIVE choice or absence identity',()=>{
 const f=fixture();f.S.members.unshift({id:'rec-saito',name:'斉藤'});f.S.songs.push({id:'other-song',showId:'other',roster:['rec-saito'],blocks:{},lines:[{parts:['rec-saito']}]});
 const selected=json(f.c.assignmentMembers(f.so)).find(m=>m.name==='斉藤');assert.equal(selected.id,'斉藤');assert.deepEqual(selected.assignmentIds,['斉藤','斉']);assert.deepEqual(f.act('斉藤'),['斉藤']);
});
