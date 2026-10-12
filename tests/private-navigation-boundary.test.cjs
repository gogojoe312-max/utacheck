'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const a=source.indexOf('function '+name+'(');return source.slice(a,source.indexOf('\n}',a)+2);};
test('an absent member and a prior substitution never expand the original 全 label',()=>{
 const c=vm.createContext({S:{recMode:false},subOf:()=>['present'],splitAssign:()=>{throw Error('全 must never expand');}});vm.runInContext(read('labelOf'),c);
 const so={id:'stable-song',lines:[{label:'全',labelRaw:'全',t:'original',parts:['absent','present']}]},before=JSON.stringify(so);
 assert.equal(c.labelOf(so,0),'全');assert.equal(JSON.stringify(so),before);
});
test('the private group is reused by name and only a missing group creates one without moving data',()=>{
 const c=vm.createContext({S:{groups:[{id:'existing',name:'配信しない',nopub:false}],songs:[{id:'original',groupId:'public'}]},VIEW:()=>false,recordingInboxCanWrite:()=>true,startupRecoveryNetworkHold:false,uid:()=> 'new-private',save(){}});vm.runInContext(read('ensurePersonalPrivateGroup'),c);
 const before=JSON.stringify(c.S);assert.equal(c.ensurePersonalPrivateGroup(),false);assert.equal(JSON.stringify(c.S),before);
 c.S.groups=[];assert.equal(c.ensurePersonalPrivateGroup(),true);assert.equal(c.S.groups[0].nopub,true);assert.equal(c.S.songs[0].groupId,'public');assert.equal(c.ensurePersonalPrivateGroup(),false);
});
