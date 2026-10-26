'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
function fn(name){const at=src.indexOf('function '+name+'(');assert(at>=0,'Missing '+name);return src.slice(src.lastIndexOf('\n',at)+1,src.indexOf('\n}',at)+2);}
function setup(){
 const so={id:'current',lines:[{t:'same',parts:['a']},{t:'same',parts:['b'],lyricBreaks:[2]},{gap:true,t:''},{t:'gray',cut:1},{t:'previous size',sourceCut:false,cut:1}]};
 const c={S:{recMode:false,songs:[so],rsongs:[]},U:{menu:{kind:'song',id:'current'}},VIEW:()=>false,preview:null,recordingInboxCanWrite:()=>true,commitFields(){},flushSheet(){},sheetTimer:null,clearTimeout(){},document:{activeElement:{blur(){}}},renderSheet(){},updateLyricSizeDraft(){}};vm.createContext(c);for(const name of ['lyricSizeTarget','openLyricSize','changeLyricSizeDraft'])vm.runInContext(fn(name),c);return {c,so};
}
test('range drafting is inclusive in both directions, preserves duplicate lyrics and cancels without source mutation',()=>{
 const {c,so}=setup(),before=JSON.stringify(so);assert(c.openLyricSize(c.U.menu));
 assert(c.changeLyricSizeDraft('lyric-size-line',2));assert(c.changeLyricSizeDraft('lyric-size-line',0));assert(c.changeLyricSizeDraft('lyric-size-hide'));
 assert.deepEqual(Array.from(c.U.menu.cuts),[true,true,true,true,true]);assert.equal(JSON.stringify(so),before);
 assert(c.changeLyricSizeDraft('lyric-size-line',1));assert(c.changeLyricSizeDraft('lyric-size-show'));assert.equal(c.U.menu.cuts[1],false);assert.equal(c.U.menu.cuts[0],true);
 c.U.menu=null;assert.equal(JSON.stringify(so),before);
});
test('reset uses immutable source cut flags, retaining gray rows and undoing old manual cuts',()=>{
 const {c,so}=setup();c.openLyricSize(c.U.menu);c.changeLyricSizeDraft('lyric-size-reset');assert.deepEqual(Array.from(c.U.menu.cuts),[false,false,false,true,false]);assert.equal(so.lines[4].cut,1);
});
test('readonly, preview, cross-mode, duplicate identity, stale source and saving guards reject changes',()=>{
 for(const kind of ['readonly','preview','mode','duplicate','stale','saving']){
  const {c,so}=setup();c.openLyricSize(c.U.menu);const menu=c.U.menu;
  if(kind==='readonly')c.VIEW=()=>true;if(kind==='preview')c.preview={};if(kind==='mode')c.S.recMode=true;if(kind==='duplicate')c.S.songs.push(structuredClone(so));if(kind==='stale')so.lines[0].t='new source';if(kind==='saving')menu.saving=true;
  const before=JSON.stringify(c.S);assert.equal(c.changeLyricSizeDraft('lyric-size-line',0),false,kind);assert.equal(JSON.stringify(c.S),before);assert.equal(menu.first,null);
 }
});
test('REC source section markers still apply after their header row is hidden',()=>{
 const c={S:{},recSong:()=>({lines:[{t:'first',sec:'1A',cut:1,bars:2},{t:'visible',bars:2},{t:'hidden section',sec:'2A',cut:1,bars:2},{t:'last',sec:'1B',bars:1}]}),tagSecNames:()=>[],recordingEmptyTextLine:()=>false,recordingLineSegments:l=>[{sec:l.sec,bars:l.bars}]};vm.createContext(c);for(const name of ['sectionNames','secBars'])vm.runInContext(fn(name),c);
 assert.deepEqual(Array.from(c.sectionNames()),['1A','1B']);assert.deepEqual(JSON.parse(JSON.stringify(c.secBars())),{'1A':{all:2,live:2},'1B':{all:1,live:1}});
});
function submitSetup(){
 const {c,so}=setup(),error={textContent:'',hidden:true},form={isConnected:true,querySelector:()=>error,setAttribute(){},removeAttribute(){}};
 c.openLyricSize(c.U.menu);Object.assign(c,{overlay:{querySelectorAll:()=>[]},pushUndo(){},save(){},saveNow:async()=>{},loadRaw:async()=>JSON.stringify(c.S),unpackState:x=>x,automaticBackupBeforeEdit:async()=>true,render(){},schedulePush(){c.published=true;},saveErr:false});vm.runInContext(fn('submitLyricSizeForm'),c);c.changeLyricSizeDraft('lyric-size-line',0);c.changeLyricSizeDraft('lyric-size-hide');return {c,so,error,form};
}
test('save verifies durable contents, preserves original sourceCut and only then schedules member publication',async()=>{
 const {c,so,form}=submitSetup();const before=structuredClone(so);assert.equal(await c.submitLyricSizeForm(form),true);assert.equal(c.published,true);assert.equal(c.U.menu,null);
 const expected=structuredClone(before);expected.lines[0].sourceCut=false;expected.lines[0].cut=1;assert.deepEqual(JSON.parse(JSON.stringify(so)),expected);
});
test('failed durable save is not closed or published and the exact draft can be retried',async()=>{
 const {c,so,error,form}=submitSetup();c.loadRaw=async()=>JSON.stringify({songs:[]});assert.equal(await c.submitLyricSizeForm(form),false);assert(c.U.menu?.needsSave);assert.equal(c.published,undefined);assert.equal(error.hidden,false);
 c.loadRaw=async()=>JSON.stringify(c.S);assert.equal(await c.submitLyricSizeForm(form),true);assert.equal(c.U.menu,null);assert.equal(so.lines[0].sourceCut,false);
});
test('backup failure, stale source and owner loss never write the proposed cut; freehand ink is preserved',async()=>{
 for(const failure of ['backup','stale','owner','ink']){
  const {c,so,form}=submitSetup();const original=so.lines[0].cut;
  if(failure==='backup')c.automaticBackupBeforeEdit=async()=>false;
  if(failure==='stale')c.automaticBackupBeforeEdit=async()=>{so.lines[1].t='externally updated';return true;};
  if(failure==='owner')c.automaticBackupBeforeEdit=async()=>{c.recordingInboxCanWrite=()=>false;return true;};
  if(failure==='ink')c.S.draws={'show|current':[{points:[{x:2,y:5}]}]};
  assert.equal(await c.submitLyricSizeForm(form),false,failure);assert.equal(so.lines[0].cut,original);assert.equal(so.lines[0].sourceCut,undefined);assert.equal(c.published,undefined);
 }
});
