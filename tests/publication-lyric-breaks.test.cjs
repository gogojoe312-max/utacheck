'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const S={deviceId:'fixture',groupId:'group',showId:'show',groups:[{id:'group',name:'Group'}],shows:[{id:'show',name:'Show',groupId:'group'}],
  songs:[],members:[],notes:[],subs:{},gsubs:{},memos:{},rosters:{},folderOrder:[]};
 let next=0;
 const c=vm.createContext({S,Date:{now:()=>123},JSON,Map,Set,Array,Number,
  group:id=>S.groups.find(g=>g.id===id),privateDeliveryGroup:()=>false,unresolvedPublicationShows:()=>[],songDeliveryGroupId:so=>so.groupId,
  member:id=>S.members.find(m=>m.id===id),showsNewestFirst:()=>S.shows,uid:()=>String(++next),songSig:so=>so.lines.map(line=>line.t).join('|'),
  splitNames:value=>value?value.split('・'):[],addMember:name=>{let m=S.members.find(m=>m.name===name);if(!m){m={id:'member-'+name,name};S.members.push(m);}return m;}});
 for(const [start,end]of [['function lyricBreakOffsets(','function lyricBreakDraft('],['function buildSong(','// 拡張子が二重'],['function publicationData(','function unresolvedPublicationShows(']]){
  const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);vm.runInContext(source.slice(a,b),c);
 }
 const add=parsed=>{const song=c.buildSong(parsed);song.showId='show';song.groupId='group';S.songs.push(song);return song;};
 return {S,c,add,publish:()=>plain(c.publicationData('group'))};
}
const parsed=()=>({title:'同じ曲',order:['歌手'],lines:[['歌手','空😀の向こう'],['',''],['→','次の歌詞']]});

test('LIVE publication and buildSong preserve Unicode display breaks without moving text or note anchors',()=>{
 const f=fixture(),input={...parsed(),lyricBreaks:[{lineIdx:0,offsets:[1,3]},{lineIdx:2,offsets:[2]}]},before=plain(input),song=f.add(input);
 f.S.notes.push({id:'note',songId:song.id,showId:'show',lineIdx:0,from:1,to:3,tags:['pitch'],memberIds:[],memo:'Keep this range'});
 const stateBefore=plain(f.S),payload=f.publish(),wire=payload.lib[0],restored=f.c.buildSong(wire);
 assert.deepEqual(wire.lyricBreaks,input.lyricBreaks);assert.deepEqual(plain(restored.lines.map(line=>line.lyricBreaks||[])),[[1,3],[],[2]]);
 assert.deepEqual(wire.lines.map(row=>row[1]),input.lines.map(row=>row[1]));assert.deepEqual(plain(restored.lines.map(line=>line.t)),input.lines.map(row=>row[1]));
 assert.equal(payload.notes[0].lineIdx,0);assert.equal(payload.notes[0].from,1);assert.equal(payload.notes[0].to,3);
 assert.deepEqual(plain(f.S),stateBefore);assert.deepEqual(input,before);
});

test('restoration and serialization normalize invalid display offsets and never add a gap marker',()=>{
 const f=fixture(),song=f.add({...parsed(),lyricBreaks:[null,{lineIdx:-1,offsets:[1]},{lineIdx:90,offsets:[1]},
  {lineIdx:0,offsets:[3,1,1,0,-1,1.5,'2',6,7]},{lineIdx:0,offsets:[2]},{lineIdx:1,offsets:[1]}]});
 assert.deepEqual(plain(song.lines[0].lyricBreaks),[1,2,3]);assert.equal(Object.hasOwn(song.lines[1],'lyricBreaks'),false);
 song.lines[2].lyricBreaks=[3,2,2,0,4];song.lines[1].lyricBreaks=[1];
 const wire=f.publish().lib[0];assert.deepEqual(wire.lyricBreaks,[{lineIdx:0,offsets:[1,2,3]},{lineIdx:2,offsets:[2,3]}]);
 assert.equal(wire.lines[0][1],'空😀の向こう');
});

test('display break offsets keep their exact source text when whitespace surrounds Unicode lyrics',()=>{
 const f=fixture(),text=' 空😀の向こう ',input={...parsed(),lines:[['歌手',text]],lyricBreaks:[{lineIdx:0,offsets:[2,5]}]};
 const song=f.add(input),wire=f.publish().lib[0],restored=f.c.buildSong(wire);
 assert.equal(song.lines[0].t,text);assert.equal(wire.lines[0][1],text);assert.equal(restored.lines[0].t,text);
 assert.deepEqual(plain(restored.lines[0].lyricBreaks),[2,5]);
});

test('identical lyrics with different display breaks stay in separate compact libraries',()=>{
 const f=fixture();f.add(parsed());f.add({...parsed(),lyricBreaks:[{lineIdx:0,offsets:[1]}]});f.add({...parsed(),lyricBreaks:[{lineIdx:0,offsets:[3]}]});
 f.add({...parsed(),lyricBreaks:[{lineIdx:0,offsets:[1,1,0]}]});
 const payload=f.publish();assert.equal(payload.lib.length,3);assert.deepEqual(payload.songs.map(song=>song.libIdx),[0,1,2,1]);
 assert.equal(Object.hasOwn(payload.lib[0],'lyricBreaks'),false);
});

test('empty or invalid local break arrays leave the old wire payload and library dedup unchanged',()=>{
 const f=fixture(),first=f.add(parsed());f.add(parsed());const before=f.publish();
 first.lines[0].lyricBreaks=[];first.lines[1].lyricBreaks=[1];first.lines[2].lyricBreaks=[0,4,9,'1'];
 assert.deepEqual(f.publish(),before);assert.equal(before.lib.length,1);
 const old=f.c.buildSong(before.lib[0]);assert(old.lines.every(line=>!Object.hasOwn(line,'lyricBreaks')));
});

test('publication and restoration retain gray-cut markers and distinguish full and cut libraries',()=>{
 const f=fixture(),input=parsed();input.lines[0].push('A1','B1','','','歌手','');const full=f.add(input);
 const cut=f.add({...input,lines:input.lines.map((row,i)=>i===0?[...row,'cut']:row)});
 f.S.notes.push({id:'note',songId:cut.id,showId:'show',lineIdx:0,from:0,to:1,tags:[],memberIds:[],memo:'Keep'});
 const before=plain(f.S),payload=f.publish(),wire=payload.lib[payload.songs[1].libIdx],restored=f.c.buildSong(wire);
 assert.equal(payload.lib.length,2);assert.equal(wire.lines[0][8],'cut');assert.equal(restored.lines[0].cut,1);
 assert.equal(full.lines[0].cut,undefined);assert.equal(restored.lines[2].cut,undefined);
 assert.equal(payload.notes[0].lineIdx,0);assert.deepEqual(plain(f.S),before);
});
test('publication preserves exact Excel worksheet, microphone and group addresses across restoration',()=>{
 const f=fixture(),input={...parsed(),sheetName:'1Half',micSheet:'マイク',micMap:{歌手:'1'},
  groups:{A:['歌手']},groupCells:{A:'C4'},groupRows:[{b:'A',ncell:'C4',lcell:'D4'}],
  lines:[['歌手','歌詞','A1','B1','','','歌手',''],['','','A2','B2'],['→','続き','A3','B3']]};
 const original=f.add(input),before=plain(f.S),wire=f.publish().lib[0],restored=f.c.buildSong(wire);
 for(const key of ['sheetName','micSheet','micMap','blockCells','blockRows'])assert.deepEqual(plain(restored[key]),plain(original[key]));
 assert.deepEqual(plain(restored.lines),plain(original.lines));assert.deepEqual(plain(f.S),before);
 f.add({...input,sheetName:'Full'});assert.equal(f.publish().lib.length,2);
 f.add({...input,micMap:{歌手:'2'}});assert.equal(f.publish().lib.length,3);
});
