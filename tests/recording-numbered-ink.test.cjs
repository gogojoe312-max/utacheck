'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function fixture(){
 const S={recMode:true,draws:{}},events={};
 const c=vm.createContext({S,U:{draw:true},VIEW:()=>false,song:()=>({id:'song'}),inkPath:null,inkPos:()=>[0.2,100],paintInk(){},eraseAt(){},document:{addEventListener(name,listener){events[name]=listener;}}});
 const start=source.indexOf('function recordingLegacyLyricInk(');vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),c);
 const pointer=source.indexOf('const inkPts = new Map();');vm.runInContext(source.slice(pointer,source.indexOf('document.addEventListener("pointermove"',pointer)),c);
 return {c,S,draw(){events.pointerdown({target:{closest:()=>({})},preventDefault(){},pointerId:1,clientX:100,clientY:100});return c.inkPath;}};
}
test('old ink in any take preserves its original layout; numbered-layout ink keeps the new layout',()=>{
 const f=fixture();assert.equal(f.c.recordingLegacyLyricInk({id:'song'}),false);
 f.S.draws['show|other|take1']=[{p:[0.2,100,0.3,150]}];assert.equal(f.c.recordingLegacyLyricInk({id:'song'}),false);
 f.S.draws['show|song|take1']=[{recNumberedLyrics:1,p:[0.2,100,0.3,150]}];assert.equal(f.c.recordingLegacyLyricInk({id:'song'}),false);
 f.S.draws['past|song|take2']=[{p:[0.2,100,0.3,150]}];const before=JSON.stringify(f.S);
 assert.equal(f.c.recordingLegacyLyricInk({id:'song'}),true);assert.equal(JSON.stringify(f.S),before);
});
test('first REC stroke records the layout it was drawn on without relabelling old-layout strokes',()=>{
 const current=fixture();assert.equal(current.draw().recNumberedLyrics,1);
 const legacy=fixture();legacy.S.draws['show|song|old']=[{p:[0.1,100,0.2,200]}];assert.equal(legacy.draw().recNumberedLyrics,undefined);
 const live=fixture();live.S.recMode=false;assert.equal(live.draw().recNumberedLyrics,undefined);
});
