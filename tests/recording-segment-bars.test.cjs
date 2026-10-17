'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(i,source.indexOf('\n}',i)+2);};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(lines,intro=156){
 const song={id:'rec',intro,lines},S={rsongs:[song],notes:[{songId:'rec',lineIdx:0,from:2,to:4,memo:'Keep anchor'}],recs:{audio:{duration:30}},plan:{slots:[{songId:'rec',takes:{A:2}}]}};
 const c=vm.createContext({S,U:{menu:{kind:'rbar',i:0,segment:0}},recSong:()=>song,tagSecNames:()=>['Tag']});
 for(const name of ['lyricBreakOffsets','recordingEmptyTextLine','recordingLineSegments','recordingBarRows','barsOf','pruneRecordingBarOverrides','setRecordingSegmentBar','recordingBarMenuTarget','setRecordingBarLengths','secBars'])vm.runInContext(read(name),c);
 return {c,song,S,numbers:()=>clone(c.recordingBarRows(song)).map(segments=>segments.map(s=>s.number))};
}
test('saved display breaks become independent bars without changing stored lyric or note positions',()=>{
 const f=fixture([{t:'甲😀乙丙',lyricBreaks:[2],parts:['member'],cs:[{f:2,t:4,c:'#fff'}]},{t:'次の行'}]),before=clone(f.S);
 assert.deepEqual(f.numbers(),[[157,161],[165]]);
 assert.deepEqual(clone(f.c.barsOf(f.song)),[157,165]);
 assert.deepEqual(clone(f.c.recordingLineSegments(f.song.lines[0])),[
  {index:0,from:0,to:2,text:'甲😀',bars:4,at:null},{index:1,from:2,to:4,text:'乙丙',bars:4,at:null}]);
 assert.deepEqual(clone(f.S),before);assert.equal(f.song.lines.length,2);
});
test('segment start edits advance following numbers and clearing restores the inherited sequence',()=>{
 const f=fixture([{t:'甲乙丙丁',at:157,bars:4,lyricBreaks:[2]},{t:'次の行'},{t:'固定',at:200},{t:'最後'}]),line=f.song.lines[0];
 assert(f.c.setRecordingSegmentBar(line,1,'at',162));
 assert.deepEqual(f.numbers(),[[157,162],[166],[200],[204]]);assert.equal(line.at,157);assert.deepEqual(clone(line.recBarOverrides),{2:{at:162}});
 const reloaded=fixture(clone(f.song.lines));assert.deepEqual(reloaded.numbers(),f.numbers());
 assert(f.c.setRecordingSegmentBar(line,1,'at',null));assert.equal(line.recBarOverrides,undefined);assert.deepEqual(f.numbers(),[[157,161],[165],[200],[204]]);
 f.c.setRecordingSegmentBar(line,0,'at',160);assert.equal(line.at,160);assert.deepEqual(f.numbers(),[[160,164],[168],[200],[204]]);
});
test('length changes begin at the selected split row and retain explicit later bar starts',()=>{
 const f=fixture([{t:'甲乙丙丁戊己',lyricBreaks:[2,4]},{t:'次も分割',lyricBreaks:[2],recBarOverrides:{2:{at:200,bars:8}}},{t:'最後'}]),line=f.song.lines[0];
 f.c.setRecordingBarLengths(f.song,0,1,2);
 assert.deepEqual(f.numbers(),[[157,161,163],[165,200],[202]]);
 assert.equal(line.bars,undefined);assert.deepEqual(clone(line.recBarOverrides),{2:{bars:2},4:{bars:2}});
 assert.deepEqual(clone(f.song.lines[1].recBarOverrides),{2:{at:200}});
 f.c.setRecordingBarLengths(f.song,0,0,8);
 assert.deepEqual(f.numbers(),[[157,165,173],[181,200],[208]]);assert.equal(line.bars,8);assert.equal(line.recBarOverrides,undefined);
});
test('non-counting rows remain excluded and length edits do not make imported empty rows visible',()=>{
 const lines=[{t:'甲乙',sec:'A',lyricBreaks:[1]},{t:'',parts:[]},{t:'',gap:true},{t:'追加',add:1,lyricBreaks:[1]},{t:'削除',cut:1,lyricBreaks:[1]},{t:'',bars:2},{t:'最後',skip:1}];
 const f=fixture(lines),untouched=clone(lines.slice(1,5));
 assert.deepEqual(f.numbers(),[[157,161],[null],[null],[null,null],[null,null],[165],[167]]);
 assert.deepEqual(clone(f.c.secBars()),{A:{all:22,live:18}}); // Added vocals retain their existing section workload.
 f.c.setRecordingBarLengths(f.song,0,1,2);assert.deepEqual(clone(lines.slice(1,5)),untouched);
 assert.deepEqual(f.numbers(),[[157,161],[null],[null],[null,null],[null,null],[163],[165]]);
 assert.deepEqual(clone(f.c.secBars()),{A:{all:18,live:16}});
});
test('section and tag totals include every split duration while copy rows consume no recording time',()=>{
 const f=fixture([{t:'甲乙丙丁',sec:'A',tag:'Tag',lyricBreaks:[2],recBarOverrides:{2:{bars:2}}},{t:'コピー',skip:1,lyricBreaks:[1]},{t:'最後',sec:'B',bars:8}]);
 assert.deepEqual(clone(f.c.secBars()),{Tag:{all:6,live:6},A:{all:14,live:6},B:{all:8,live:8}});
});
test('overrides follow character offsets through inserted breaks and stale offsets are discarded',()=>{
 const f=fixture([{t:'甲乙丙丁戊己',lyricBreaks:[2,4],recBarOverrides:{2:{at:180},4:{bars:2}}}]),line=f.song.lines[0];
 line.lyricBreaks=[1,2,4];f.c.pruneRecordingBarOverrides(line);assert.deepEqual(f.numbers(),[[157,161,180,184]]);
 line.lyricBreaks=[1,4];f.c.pruneRecordingBarOverrides(line);assert.deepEqual(clone(line.recBarOverrides),{4:{bars:2}});assert.deepEqual(f.numbers(),[[157,161,165]]);
 delete line.lyricBreaks;f.c.pruneRecordingBarOverrides(line);assert.equal(line.recBarOverrides,undefined);assert.deepEqual(f.numbers(),[[157]]);
});
test('legacy unsplit lines retain numbering and invalid segment metadata cannot alter bar progression',()=>{
 const f=fixture([{t:'甲乙',bars:2,at:30,lyricBreaks:[0,-1,1,1,2,99,'1'],recBarOverrides:{0:{at:400},1:{at:-5,bars:'8'},99:{at:900}}},{t:'次の行'}],8);
 assert.deepEqual(f.numbers(),[[30,32],[34]]);f.c.pruneRecordingBarOverrides(f.song.lines[0]);assert.equal(f.song.lines[0].recBarOverrides,undefined);
 f.c.U.menu.segment=1;assert.equal(f.c.recordingBarMenuTarget().segment.number,32);
 f.c.U.menu.segment=8;assert.equal(f.c.recordingBarMenuTarget(),null);
 for(const args of [[0,0],[3,2],[-1,2]])assert.equal(f.c.setRecordingSegmentBar(f.song.lines[0],args[0],'bars',args[1]),false);
 assert.equal(f.c.setRecordingBarLengths(f.song,9,0,4),false);
});
