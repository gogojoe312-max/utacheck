'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const start=source.indexOf("document.addEventListener('focusin', async event =>"),end=source.indexOf('\n});',start)+4;
function setup(){const listeners={},calls=[];const c={U:{sheet:{}},overlay:{contains:f=>f.inOverlay},VIEW:()=>false,preview:null,document:{addEventListener:(name,fn)=>listeners[name]=fn},automaticBackupBeforeEdit:async reason=>{calls.push(reason);return true;}};vm.createContext(c);vm.runInContext(source.slice(start,end),c);return {c,calls,focus:field=>listeners.focusin({target:field})};}
test('the note draft stays writable during its original focus gesture without a full-state checkpoint',async()=>{const s=setup(),field={id:'memo',inOverlay:true,tagName:'INPUT',type:'text',readOnly:false,disabled:false,isConnected:true,matches:()=>false,closest:()=>null};const result=s.focus(field);assert.equal(field.readOnly,false);assert.deepEqual(s.calls,[]);await result;});
test('an unrelated persisted text field still requires its verified pre-edit snapshot',async()=>{const s=setup(),field={id:'songmemo',tagName:'TEXTAREA',readOnly:false,isConnected:true,matches:()=>false,closest:()=>null};const result=s.focus(field);assert.equal(field.readOnly,true);assert.deepEqual(s.calls,['text-edit']);await result;assert.equal(field.readOnly,false);});
test('background backup and remote checks pause while the owner is editing or interacting and resume when idle',()=>{
 const a=source.indexOf('setInterval(() => {\n  if (!recordingInboxCanWrite()',source.indexOf('// アプリを開いている間、自動でやりとりする'));
 const backup=source.slice(source.indexOf('setInterval(() => {',source.indexOf('}, 60000);',a)),source.indexOf('}, 30000);',a)+10);
 let tick,calls=0;const c={S:{ghToken:'configured',bkHash:1,bkAt:0},U:{sheet:{},menu:null,picker:false},recordingInboxCanWrite:()=>true,document:{hidden:false},preview:null,VIEW:()=>false,backupInFlight:false,syncing:false,backupRetryAt:0,typingNow:()=>false,renderPointers:new Set(),scrollingUntil:0,bkSignature:()=>{calls++;return 1;},doBackup:()=>calls++,checkOther:()=>calls++,setInterval:fn=>tick=fn,Date};vm.createContext(c);vm.runInContext(backup,c);
 tick();assert.equal(calls,0);c.U.sheet=null;c.typingNow=()=>true;tick();assert.equal(calls,0);c.typingNow=()=>false;c.renderPointers.add(1);tick();assert.equal(calls,0);c.renderPointers.clear();tick();assert.equal(calls,2);
});
