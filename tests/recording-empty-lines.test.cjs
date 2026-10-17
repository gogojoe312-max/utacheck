'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(i,source.indexOf('\n}',i)+2);};
function fixture(lines){
 const song={id:'rec',intro:8,lines},S={rsongs:[song],notes:[],pubNotes:[],draws:{},subs:{},subsMan:{},recs:{take:{duration:30}},plan:{slots:[{id:'member',takes:{A:3},a0:600,a1:660}]}};
 const c=vm.createContext({S,U:{},recSong:()=>song,tagSecNames:()=>[]});
 for(const name of ['recordingEmptyTextLine','recordingHiddenLineIndexes','barsOf','secRange','vtTargets','secBars'])vm.runInContext(read(name),c);
 return {c,S,song,hidden:()=>Array.from(c.recordingHiddenLineIndexes(song))};
}
test('empty Word paragraphs are hidden without removing or renumbering stored lyric rows',()=>{
 const f=fixture([{t:'First'},{t:'',parts:[],main:[],extra:[]},{t:' \t　'},{t:'Last'}]),before=JSON.stringify(f.S);
 assert.deepEqual(f.hidden(),[1,2]);assert.equal(f.song.lines.length,4);assert.equal(f.song.lines[3].t,'Last');
 assert.equal(JSON.stringify(f.S),before);
});
test('explicit spacing, musical settings, labels and singer assignments stay visible',()=>{
 const marked=[{gap:true},{at:0},{bars:0},{add:1},{cut:true},{skip:true},{brk:1},{cont:true},{solo:true},{vh:true},
  {sec:'A'},{tag:'Tag'},{vt:'Voice'},{label:'Singer'},{labelRaw:'Singer'},{extraRaw:'Singer'},{raw:'Singer'},
  {parts:['member']},{main:['member']},{extra:['member']}].map(fields=>({t:'',...fields}));
 const f=fixture(marked);assert.deepEqual(f.hidden(),[]);
});
test('notes and hand marks from every show and take retain their original blank line anchors',()=>{
 const f=fixture([{t:'First'},{t:''},{t:''},{t:''},{t:''},{t:'Last'}]);
 f.S.notes=[{songId:'rec',showId:'earlier',tk:'member|take1',lineIdx:1,lineEnd:2,from:0,to:0,memo:'Range kept'},
  {songId:'unrelated',lineIdx:4,memo:'Does not reserve this song'}];
 f.S.pubNotes=[{songId:'rec',showId:'another',tk:'member|take2',lineIdx:3,hand:{points:[0,1]}}];
 const before=JSON.stringify(f.S);assert.deepEqual(f.hidden(),[4]);assert.equal(JSON.stringify(f.S),before);
});
test('manual assignment overrides on blank rows remain available across shows',()=>{
 const f=fixture([{t:'First'},{t:''},{t:''},{t:''},{t:'Last'}]);
 f.S.subs={'old-show|rec':{1:['member']}};f.S.subsMan={'another-show|rec':{2:1},'show|other':{3:1}};
 const before=JSON.stringify(f.S);assert.deepEqual(f.hidden(),[3]);assert.equal(JSON.stringify(f.S),before);
});
test('absolute-position freehand ink preserves the original layout in every take',()=>{
 const f=fixture([{t:'First'},{t:''},{t:'Last'}]);
 f.S.draws={'old-show|other|take1':[{p:[0,100]}]};assert.deepEqual(f.hidden(),[1]);
 f.S.draws['old-show|rec|take2']=[{c:'#fff',w:3,p:[0.2,100,0.4,120]}];
 const before=JSON.stringify(f.S);assert.deepEqual(f.hidden(),[]);assert.equal(JSON.stringify(f.S),before);
});
test('drawing mode restores the original layout before the first stroke is captured',()=>{
 const f=fixture([{t:'First'},{t:''},{t:'Last'}]);assert.deepEqual(f.hidden(),[1]);
 f.c.U.draw=true;assert.deepEqual(f.hidden(),[]);
 f.S.draws['show|rec|take1']=[{c:'#fff',w:3,p:[0.2,140,0.4,160]}];
 f.c.U.draw=false;assert.deepEqual(f.hidden(),[]);
 assert.deepEqual(f.S.draws['show|rec|take1'][0].p,[0.2,140,0.4,160]);
});
test('plain empty paragraphs do not invent four bars and explicit numbering is preserved',()=>{
 const f=fixture([{t:'First'},{t:'',parts:[]},{t:'',gap:true},{t:'Next',at:30,bars:2},{t:'',bars:8},{t:'Last'}]),before=JSON.stringify(f.S);
 assert.deepEqual(Array.from(f.c.barsOf(f.song)),[9,null,null,30,32,40]);
 assert.equal(JSON.stringify(f.S),before);
});
test('voice target counts skip unused paragraphs while retaining original indexes and explicit musical rows',()=>{
 const f=fixture([{t:'First',sec:'A'},{t:''},{t:''},{t:'Second'},{t:'',gap:true},{t:'Third'},{t:'',bars:8},{t:'Fourth',sec:'B'}]),before=JSON.stringify(f.S);
 f.c.U.vtN=3;assert.deepEqual(Array.from(f.c.vtTargets(f.song,0)),[0,3,5]);
 f.c.U.vtN='sec';assert.deepEqual(Array.from(f.c.vtTargets(f.song,0)),[0,3,5,6]);
 assert.equal(JSON.stringify(f.S),before);
});
test('section bar totals exclude empty paragraphs and keep explicit silent bars and skip settings',()=>{
 const f=fixture([{t:'First',sec:'A'},{t:''},{t:'Second',skip:true},{t:'',gap:true},{t:'',bars:8},{t:'Last',sec:'B'}]),before=JSON.stringify(f.S);
 assert.deepEqual(JSON.parse(JSON.stringify(f.c.secBars())),{A:{all:16,live:12},B:{all:4,live:4}});
 assert.equal(JSON.stringify(f.S),before);
});
