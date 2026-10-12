'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8'),read=name=>{const a=source.indexOf('function '+name+'(');return source.slice(a,source.indexOf('\n}',a)+2);};
test('age, orphan IDs and recovery references never automatically delete audio, trash, annotations or owner edits',()=>{
 const S={shows:[{id:'known'}],songs:[{id:'song'}],rsongs:[],recs:{'missing-show|missing-song':{ts:1,dur:30}},trash:[{id:'old-trash',at:1,clips:['original-audio'],notes:[{id:'original-note',memo:'keep'}]}],notes:[{id:'unresolved-note',songId:'missing-song',showId:'missing-show'}],draws:{'missing-show|missing-song':[1]},staffMemos:{'missing-show|missing-song':'owner edit'}};
 const before=JSON.stringify(S),c=vm.createContext({S,delClip:()=>{throw Error('must not delete original');},save:()=>{throw Error('must not change original');}});for(const name of ['purgeRecs','purgeTrash','sweep'])vm.runInContext(read(name),c);
 assert.equal(c.purgeRecs(),0);c.purgeTrash();c.sweep();assert.equal(JSON.stringify(S),before);
 assert(!source.includes('日で自動的に消えます'));assert(!source.includes('日を過ぎたものから順に消えます'));
});
