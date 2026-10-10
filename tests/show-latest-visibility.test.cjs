'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
function context(){const c=vm.createContext({S:{shows:[],songs:[],groups:[{id:'r',name:'Rosie'},{id:'o',name:'OCHA'}],groupId:'r',folders:{Old:false},folderOrder:['Old']},U:{},VIEW:()=>false});vm.runInContext(block('function autoShowGroupId(', 'function setCurrentShowGroup('),c);vm.runInContext(block('const showsNewestFirst =','const showName ='),c);vm.runInContext(block('function summaryShows()', 'function summaryShowPicker()'),c);return c;}
test('latest shows sort globally including folderless, missing and invalid timestamps without mutations',()=>{
 const c=context();c.S.shows=[{id:'old',ts:10,folder:'Old'},{id:'reny',ts:100,folder:'New'},{id:'latest',ts:101},{id:'none'},{id:'invalid',ts:'bad'}];const before=JSON.stringify(c.S);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(showsNewestFirst().map(x=>x.id))',c)),['latest','reny','old','invalid','none']);assert.equal(JSON.stringify(c.S),before);
});
test('new empty editor performance remains selectable in summary without exposing other groups or hidden material',()=>{
 const c=context();c.S.shows=[{id:'reny',name:'新宿ReNY',groupId:'r',ts:100},{id:'other',groupId:'o',ts:101},{id:'hidden',groupId:'r',hidden:true},{id:'archive',groupId:'r',recoverySource:'original-workbooks'}];
 const before=JSON.stringify(c.S);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(summaryShows().map(x=>x.id))',c)),['reny']);assert.equal(JSON.stringify(c.S),before);
 c.S.shows[0].deliveryMode='song';assert.equal(vm.runInContext('summaryShows()[0].id',c),'reny');
 c.VIEW=()=>true;assert.equal(vm.runInContext('summaryShows().length',c),0);
});
test('main show pickers render the sorted list directly rather than hiding rows under folder order',()=>{
 const setup=block('function viewSetup()', 'function viewSetupRec()');assert(!setup.includes('groupShows(allShows)'));assert.equal((setup.match(/allShows\.map\(showRow\)/g)||[]).length,2);
 const picker=src.slice(src.indexOf('  if (U.picker) {'),src.indexOf('  if (U.picker) {')+1700);assert(picker.includes('showsFor().map'));assert(!picker.includes('groupShows(showsFor())'));
 assert(src.includes('liveGroups().length > 1 || !!U.showFilter'));assert(setup.includes('フォルダを管理'));assert(setup.includes('data-act="frename"'));assert(setup.includes('folderNames().map'));
});
