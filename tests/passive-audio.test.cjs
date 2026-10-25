'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
function setup({unsupported=false}={}){
 const calls={contexts:0,resumes:0,plays:0,sessions:[],oscillators:0},handlers={};
 class Context {constructor(){calls.contexts++;this.state='suspended';this.currentTime=0;}resume(){calls.resumes++;this.state='running';return Promise.resolve();}createOscillator(){calls.oscillators++;return {frequency:{value:0},connect(){},start(){},stop(){}};}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}}
 const audioSession={set type(value){calls.sessions.push(value);if(unsupported)throw Error('unsupported');}};
 const c={navigator:{audioSession},window:{AudioContext:Context},Audio:class{play(){calls.plays++;return Promise.resolve();}setAttribute(){}},document:{addEventListener:(name,fn)=>(handlers[name]||=[]).push(fn)},AC:null,freeMic(){},freqOf:()=>440};vm.createContext(c);
 const start=source.includes('// iPhoneの消音スイッチはWeb Audioを黙らせる。')?source.indexOf('// iPhoneの消音スイッチはWeb Audioを黙らせる。'):source.indexOf('// Audio is initialized only');
 vm.runInContext(source.slice(start,source.indexOf('// 使っている間は画面を消させない',start)),c);
 const at=source.indexOf('function tone(');vm.runInContext(source.slice(at,source.indexOf('\n}',at)+2),c);
 return {c,calls,tap(){for(const fn of handlers.pointerdown||[])fn({target:{tagName:'BUTTON'}});}};
}
test('passive opening and ordinary screen taps never initialize playback or change the audio session',()=>{
 const f=setup();f.tap();f.tap();assert.equal(f.calls.contexts,0);assert.equal(f.calls.resumes,0);assert.equal(f.calls.plays,0);assert.deepEqual(f.calls.sessions,[]);
});
test('explicit piano sound uses Web Audio without starting a silent looping media player',()=>{
 const f=setup();f.c.tone('C4');assert.equal(f.calls.contexts,1);assert.equal(f.calls.oscillators,1);assert.equal(f.calls.plays,0);assert.deepEqual(f.calls.sessions,['ambient']);
});
test('a browser rejecting ambient mode can still play an explicitly requested note',()=>{
 const f=setup({unsupported:true});f.c.tone('C4');assert.equal(f.calls.contexts,1);assert.equal(f.calls.oscillators,1);assert.equal(f.calls.plays,0);
});
