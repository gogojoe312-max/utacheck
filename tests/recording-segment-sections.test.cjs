'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const at=source.indexOf('function '+name+'(');assert(at>=0,name);return source.slice(source.lastIndexOf('\n',at)+1,source.indexOf('\n}',at)+2);};
function fixture(){
 const so={id:'song',intro:74,lines:[{t:'前のフレーズ😀次のフレーズ',lyricBreaks:[7],bars:1,sec:'2B'},{t:'後続のフレーズ',bars:1},{t:'終わりのフレーズ',bars:1,sec:'D'}]};
 const c={S:{recMode:true,rsongs:[so]},U:{},recSong:()=>so,tagSecNames:()=>[],tagBase:x=>x,tagNum:()=>0};vm.createContext(c);
 for(const name of ['lyricBreakOffsets','recordingEmptyTextLine','recordingLineSegments','recordingBarRows','pruneRecordingBarOverrides','setRecordingSegmentSection','secOfLine','linesInSec','sectionNames','secBars','setRecordingSegmentBar','repairRecordingSectionMarker'])vm.runInContext(read(name),c);
 return {so,c};
}
test('a section chosen on the continuation starts at that character position, never at the original row start',()=>{
 const {so,c}=fixture(),text=so.lines[0].t;assert(c.setRecordingSegmentSection(so.lines[0],1,'Rap'));
 assert.equal(so.lines[0].sec,'2B');assert.equal(so.lines[0].recBarOverrides[7].sec,'Rap');assert.equal(so.lines[0].t,text);
 assert.equal(c.secOfLine(so,0,0),'2B');assert.equal(c.secOfLine(so,0,1),'Rap');assert.equal(c.secOfLine(so,1),'Rap');assert.equal(c.secOfLine(so,2),'D');
 assert.deepEqual(Array.from(c.sectionNames()),['2B','Rap','D']);assert.deepEqual(Array.from(c.linesInSec(so,'Rap')),[0,1]);
 assert.deepEqual(Array.from(c.recordingBarRows(so)[0],s=>s.number),[75,76]);
 assert.deepEqual(JSON.parse(JSON.stringify(c.secBars())),{'2B':{all:1,live:1},Rap:{all:2,live:2},D:{all:1,live:1}});
 c.setRecordingSegmentBar(so.lines[0],1,'bars',2);assert.equal(so.lines[0].recBarOverrides[7].sec,'Rap');
});
test('section clearing and number edits preserve each others metadata and cannot affect other segments',()=>{
 const {so,c}=fixture(),line=so.lines[0];line.recBarOverrides={7:{at:76,bars:1}};
 c.setRecordingSegmentSection(line,1,'Rap');c.pruneRecordingBarOverrides(line);assert.equal(line.recBarOverrides[7].sec,'Rap');
 c.setRecordingSegmentSection(line,1,'');assert.equal(line.recBarOverrides[7].sec,undefined);assert.equal(line.recBarOverrides[7].at,76);assert.equal(line.sec,'2B');
 assert.equal(c.setRecordingSegmentSection(line,9,'Rap'),false);
});
test('explicitly moving a legacy whole-row marker to a continuation removes only that same misplaced marker',()=>{
 const {so,c}=fixture(),line=so.lines[0];line.sec='Rap';c.setRecordingSegmentSection(line,1,'Rap');assert.equal(line.sec,undefined);assert.equal(line.recBarOverrides[7].sec,'Rap');
});

test('legacy automatic correction requires the exact source digest, length, section and break',()=>{
 const {c}=fixture(),signature='0e139f9c935ceb8f1046a7dc2f3b46c5ba77168d28989d4abd0201901065ef9b';
 const line={t:'123456789ABCDEFG',lyricBreaks:[9],sec:'Rap',recBarOverrides:{9:{at:76,bars:1}}};
 assert.equal(c.repairRecordingSectionMarker(line,'different-source'),false);assert.equal(line.sec,'Rap');
 assert(c.repairRecordingSectionMarker(line,signature));assert.equal(line.sec,undefined);assert.equal(line.recBarOverrides[9].sec,'Rap');assert.equal(line.recBarOverrides[9].at,76);
 assert.equal(c.repairRecordingSectionMarker(line,signature),false);
});
