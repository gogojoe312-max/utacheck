'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync(__dirname+'/../app.js','utf8');
const delivery=fs.readFileSync(__dirname+'/../recovery-delivery.js','utf8');
const fn=name=>{const at=app.indexOf('function '+name+'(');assert.ok(at>=0);return app.slice(at,app.indexOf('\n}',at)+2);};
const api=new Function('startupStateObject',['packState','unpackState','validateStartupState','recoveryValidateCloudState'].map(fn).join('\n')+'\nreturn {packState,unpackState,validateStartupState,recoveryValidateCloudState};')(value=>!!value&&typeof value==='object'&&!Array.isArray(value));
const message=new Function(delivery.slice(delivery.indexOf('  function message('),delivery.indexOf('  function ready('))+'\nreturn message;')();
const clone=value=>JSON.parse(JSON.stringify(value));
const fixture=()=>({
 members:[{id:'m',name:'Member'}],groups:[{id:'g',name:'Group'}],shows:[{id:'show',name:'Performance'}],
 songs:[{id:'song',showId:'show',title:'Live song',lines:[{t:'Live lyric',parts:['m']}]}],
 rsongs:[{id:'rec',title:'Recording song',lines:[{t:'Recording lyric',bars:4},{gap:true,t:''},{t:'Chorus',add:1,bars:0,sec:'Chorus'}]}],
 notes:[{songId:'song',showId:'show',tags:['timing'],memberIds:['m'],memo:'Keep correction'}],pubNotes:[],
 staffMemos:{'show|song':'Keep private memo'},recs:{rec:{clip:'existing-clip'}},memos:{'show|song':'Keep summary'}
});
test('native REC import rows pass reconnect validation without changing any saved data',()=>{
 const state=fixture(),before=JSON.stringify(state);
 assert.doesNotThrow(()=>api.validateStartupState(state));
 assert.doesNotThrow(()=>api.recoveryValidateCloudState(state));
 assert.equal(JSON.stringify(state),before);
});
test('packed LIVE lyrics and native REC lyrics round-trip without data loss',()=>{
 const state=fixture(),packed=api.packState(state),before=JSON.stringify(packed);
 assert.doesNotThrow(()=>api.recoveryValidateCloudState(packed));
 assert.equal(JSON.stringify(packed),before);
 assert.deepEqual(api.unpackState(clone(packed)),state);
});
test('REC rows with explicit valid singer parts remain supported',()=>{
 const state=fixture();state.rsongs[0].lines[0].parts=['m'];
 assert.doesNotThrow(()=>api.recoveryValidateCloudState(state));
});
for(const [label,parts] of [['null',null],['string','m'],['invalid ID',['bad|id']],['non-string ID',[7]],['empty ID',['']]]){
 test('REC rejects supplied '+label+' parts and preserves the input',()=>{
  const state=fixture();state.rsongs[0].lines[0].parts=parts;const before=JSON.stringify(state);
  assert.throws(()=>api.recoveryValidateCloudState(state),/state-format/);
  assert.equal(JSON.stringify(state),before);
 });
}
for(const [label,change] of [
 ['LIVE missing singer parts',s=>delete s.songs[0].lines[0].parts],
 ['LIVE null singer parts',s=>s.songs[0].lines[0].parts=null],
 ['REC missing title',s=>delete s.rsongs[0].title],
 ['REC missing lyric text',s=>delete s.rsongs[0].lines[1].t],
 ['REC non-string lyric text',s=>s.rsongs[0].lines[0].t=42],
 ['invalid note member IDs',s=>s.notes[0].memberIds=['bad|id']],
 ['invalid packed lyric reference',s=>{s.songs[0].L=2;s.songLib=[];}]
]){
 test('reconnect still rejects '+label,()=>{
  const state=fixture();change(state);const before=JSON.stringify(state);
  assert.throws(()=>api.recoveryValidateCloudState(state));
  assert.equal(JSON.stringify(state),before);
 });
}
test('REC import producers retain their native optional singer-parts format',()=>{
 assert.match(app,/lines\.push\(\{t,\s*bars:4/);
 assert.match(app,/\{gap:true,t:""\}/);
});
for(const code of ['state-format','lyric-format','lyric-reference']){
 test('reconnect explains '+code+' without exposing arbitrary error text',()=>{
  assert.doesNotThrow(()=>message(Object.assign(new Error('private detail'),{inspectionCode:code})));
  assert.doesNotMatch(message(Object.assign(new Error('private detail'),{inspectionCode:code})),/private detail/);
  assert.doesNotMatch(message(new Error(code)),/元の配信先・公演の対応または形式/);
 });
}
