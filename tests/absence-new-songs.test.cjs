'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
function read(name){const a=source.indexOf('function '+name+'(');return a<0?'':source.slice(a,source.indexOf('\n}',a)+2);}
test('the assignment chip toggles its displayed original selection before any override exists',()=>{
 const S={songs:[{id:'song',lines:[{parts:['keep']}]}],subs:{},subsMan:{}},c={S,U:{menu:{id:'song',i:0}},id:'keep',subKey:()=> 'show|song',partsOf:so=>so.lines[0].parts,recordAssignmentChange(){},rememberSub(){},save(){},schedulePush(){},renderSheet(){},render(){}};vm.createContext(c);
 const a=source.indexOf('    case "setassign": {'),b=source.indexOf('\n    case ',a+10);vm.runInContext('switch("setassign"){'+source.slice(a,b)+'}',c);
 assert.deepEqual(Array.from(S.subs['show|song'][0]),[],'Pressing an already selected original singer removes that singer');
});
test('a song added after absence selection inherits the target show settings even while another show or REC is selected',()=>{
 const original={id:'old',showId:'show',lines:[{t:'既存歌詞',parts:['absent','keep']}]},song={id:'added',showId:'show',blocks:{A:['absent','keep']},lines:[{t:'新しい歌詞',parts:['absent','keep']},{t:'ソロ',parts:['absent']},{t:'ブロック',label:'A',parts:['absent','keep']}]};
 const S={shows:[{id:'show',absent:['absent']},{id:'other'}],showId:'other',songs:[original,song],rsongs:[],recMode:true,subs:{'show|old':{0:['replacement']}},gsubs:{}},before=JSON.stringify(S.songs);
 const c={S,VIEW:()=>false,preview:null,recordingInboxCanWrite:()=>true,absentIds:id=>S.shows.find(s=>s.id===(id||S.showId))?.absent||[],SONGS:()=>S.recMode?S.rsongs:S.songs.filter(s=>s.showId===S.showId),subKey:id=>S.showId+'|'+id,blocksOf:s=>Object.keys(s.blocks||{}),blockOf:(s,i)=>s.blocks?.[s.lines[i].label]?s.lines[i].label:'',idbOK:false,packState:s=>s,recordingInboxStorageSet(){},KEY:'state',stateRevision:0,booted:true,saveErr:false,freeSpace:()=>false};vm.createContext(c);
 for(const name of ['autoSubs','reconcileNewAbsenceSongs','save']){const code=read(name);if(code)vm.runInContext(code,c);}
 c.save();assert.deepEqual(Array.from(S.subs['show|added']?.[0]||[]),['keep']);assert.deepEqual(Array.from(S.gsubs['show|added']?.A||[]),['keep']);assert.equal(S.subs['show|added'][1],undefined);assert.deepEqual(S.subs['show|old'][0],['replacement']);assert.equal(JSON.stringify(S.songs),before);
 S.subs['show|added'][0]=['replacement'];c.save();assert.deepEqual(S.subs['show|added'][0],['replacement']);
});
test('small pointer drift does not cancel a name long press; actual scrolling and release do',()=>{
 let opened=0,timerId=0;const timers=new Map(),events={},el={isConnected:true,dataset:{act:'noteblock',hold:'assignline',i:'0'},click(){if(el.dataset.act==='assignline')opened++;}},c={document:{addEventListener:(type,fn)=>(events[type]||=[]).push(fn)},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),VIEW:()=>false,preview:null,S:{showId:'show',recMode:false},U:{},song:()=>({id:'song'}),openAssignmentForLine:()=>{opened++;return true;}};vm.createContext(c);
 const a=source.indexOf('/* 左の名前を長押し')>=0?source.indexOf('/* 左の名前を長押し'):source.indexOf('/* Short taps add feedback;');vm.runInContext(source.slice(a,source.indexOf('\nlet holdTimer',a)),c);
 const fire=(type,x=10,y=10)=>{const e={pointerId:1,button:0,isPrimary:true,clientX:x,clientY:y,target:{closest:()=>el},preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}};for(const f of events[type]||[])f(e);};
 fire('pointerdown');fire('pointermove',12,11);for(const f of timers.values())f();assert.equal(opened,1,'Two-pixel hand jitter must not cancel assignment editing');fire('pointerup');
 opened=0;timers.clear();fire('pointerdown');fire('pointermove',10,40);for(const f of timers.values())f();assert.equal(opened,0);
 timers.clear();fire('pointerdown');fire('pointerup');for(const f of timers.values())f();assert.equal(opened,0);
});
