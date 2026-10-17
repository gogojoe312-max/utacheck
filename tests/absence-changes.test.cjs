'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Changes=require('../absence-changes.js');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const a=source.indexOf('function '+name+'(');assert(a>=0,name);return source.slice(source.lastIndexOf('\n',a)+1,source.indexOf('\n}',a)+2);};
const json=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const c={AbsenceChanges:Changes,S:{showId:'show',groupId:'g',groups:[{id:'g',name:'Group'}],rosters:{Group:['Person 1','Person 2','Person 3']},
  members:[{id:'m1',name:'Person 1'},{id:'m2',name:'Person 2'},{id:'m3',name:'Person 3'},{id:'m4',name:'Guest 4'},{id:'ph',name:'回替わり'},{id:'block',name:'A'}],
  shows:[{id:'show',name:'Show',absent:['m1']}],songs:[{id:'song',showId:'show',groupId:'g',title:'Song <safe>',roster:['m1','m2','m3','m4','ph','block'],blocks:{A:['m1','m2']},lines:[
   {t:'quiet trio',parts:['m1','m2','m3'],label:'Person 1・Person 2・Person 3'},
   {t:'visible duo',parts:['m1','m2'],label:'Person 1・Person 2'},
   {t:'visible replacement',parts:['m1'],label:'Person 1'},
   {t:'visible addition',parts:['m1','m2','m3'],label:'Person 1・Person 2・Person 3'}]}],
  subs:{'show|song':{0:['m2','m3'],1:['m2'],2:['m4'],3:['m2','m3','m4']}},gsubs:{'show|song':{A:['m2']}}},
  U:{mode:'song',allShows:false},preview:null,viewer:true,selected:null,libFrom:'',
  h:s=>String(s??'').replace(/[<>&"]/g,k=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[k])),
  songName:s=>s.title,shownNotes:()=>[],summaryMemo:()=>'',needCount:()=>0,changedCount:()=>0,runAt:(s,i)=>[i]};
 c.VIEW=()=>c.viewer;c.member=id=>c.S.members.find(m=>m.id===id);c.names=ids=>(ids||[]).map(c.member).filter(Boolean).map(m=>m.name).join('・');
 c.SONGS=()=>c.S.songs.filter(s=>s.showId===c.S.showId);c.songRoster=s=>s.roster||[];c.showRoster=()=>[...new Set(c.SONGS().flatMap(c.songRoster))];
 c.absentIds=id=>c.S.shows.find(s=>s.id===(id||c.S.showId))?.absent||[];
 c.subOf=(id,i)=>c.S.subs[c.S.showId+'|'+id]?.[i]||null;c.gsubOf=(id,b)=>c.S.gsubs[c.S.showId+'|'+id]?.[b]||null;
 c.blockOf=(s,i)=>s.blocks?.[s.lines[i]?.label]?s.lines[i].label:'';c.blocksOf=s=>Object.keys(s.blocks||{});
 c.blockParts=(s,b)=>c.gsubOf(s.id,b)||s.blocks[b];c.partsOf=(s,i)=>c.subOf(s.id,i)||s.lines[i].parts;
 c.restoreViewerMember=()=>c.selected;c.viewerMembers=()=>c.S.members.slice(0,4);c.compactMemberLabel=n=>n;
 c.summarySongs=()=>c.U.allShows?c.S.songs:c.SONGS();c.showName=id=>c.S.shows.find(s=>s.id===(id||c.S.showId))?.name||'';
 vm.createContext(c);
 for(const name of ['rowNo','memberAbsenceContext','memberAbsenceChanges','absenceSelectableMembers','memberAbsenceRows','viewMemberAbsence','viewerSummaryBody','lineStatus','blockStatus','viewAbsent'])vm.runInContext(read(name),c);
 return c;
}
test('2 to 1 remains important; 3+ subset reductions are quiet, including 3 to 1',()=>{
 assert.equal(Changes.classify(['a','b'],['b'],['a'],true).status,'changed');
 for(const after of [['b','c'],['c']])assert.equal(Changes.classify(['a','b','c'],after,['a','b','c'].filter(id=>!after.includes(id)),true),null);
});
test('addition and replacement remain visible; reorder and no absence do not create changes',()=>{
 assert.equal(Changes.classify(['a','b','c'],['b','c','d'],['a'],true).status,'changed');
 assert.equal(Changes.classify(['a'],['d'],['a'],true).status,'changed');
 assert.equal(Changes.classify(['b','c'],['c','b'],['a'],true),null);
 assert.equal(Changes.classify(['a'],['d'],[],true).status,'changed');
});
test('unresolved and empty assignments are not mistaken for quiet completion',()=>{
 assert.equal(Changes.classify(['a'],['a'],['a'],false).status,'need');
 assert.equal(Changes.classify(['a','b','c'],[],['a'],true).status,'need');
 assert.equal(Changes.classify(['a','b','c'],['a','b'],['a'],true).status,'need');
});
test('collecting entries is read only and keeps original and replacement membership',()=>{
 const c=fixture(),song=c.S.songs[0],before=JSON.stringify(c.S),entries=c.memberAbsenceChanges(song);
 assert(entries.some(e=>e.kind==='line'&&e.lineIdx===0));
 assert.deepEqual(json(entries.find(e=>e.lineIdx===1).before),['m1','m2']);
 assert.deepEqual(json(entries.find(e=>e.lineIdx===1).after),['m2']);
 assert(entries.find(e=>e.lineIdx===2).involved.includes('m1'));assert(entries.find(e=>e.lineIdx===2).involved.includes('m4'));
 assert.equal(JSON.stringify(c.S),before);
});
test('consecutive rows with different replacements never merge',()=>{
 const song={id:'s',lines:[{parts:['a'],t:'first'},{parts:['a'],t:'second'}]};
 assert.equal(Changes.entries(song,{absent:['a'],subs:{0:['b'],1:['c']}}).length,2);
 const same=Changes.entries(song,{absent:['a'],subs:{0:['b'],1:['b']}});assert.equal(same.length,1);assert.deepEqual(same[0].lineIndices,[0,1]);
});
test('block substitutions and line overrides use their own effective rows',()=>{
 const song={id:'s',blocks:{A:['a','b']},lines:[{label:'A',parts:['a','b'],t:'override'},{label:'A',parts:['a','b'],t:'block'}]};
 const entries=Changes.entries(song,{absent:['a'],gsubs:{A:['b']},subs:{0:['c']}});
 assert.equal(entries.length,2);assert.deepEqual(entries[0].lineIndices,[1]);assert.deepEqual(entries[1].after,['c']);
 assert.equal(Changes.entries(song,{absent:['a'],gsubs:{A:['b']},subs:{0:['c'],1:['c']}}).some(e=>e.kind==='block'),false);
});
test('gap, cut and all-member labels never expand into absence alerts',()=>{
 const song={id:'s',lines:[{gap:true,parts:['a']},{cut:1,parts:['a']},{label:'全',parts:['a','b']},{labelRaw:'全（a以外）',parts:['a','b']}]};
 assert.deepEqual(Changes.entries(song,{absent:['a'],subs:{0:['b'],1:['b'],2:['b'],3:['b']}}),[]);
});
test('harmony replacements retain separate before and after roles',()=>{
 const song={id:'s',lines:[{parts:['a','b'],main:['a'],extra:['b'],t:'harmony'}]};
 const entry=Changes.line(song,0,{absent:['b'],subs:{0:['a','c']}});
 assert.deepEqual(entry.beforeMain,['a']);assert.deepEqual(entry.beforeExtra,['b']);
 assert.deepEqual(entry.afterMain,['a']);assert.deepEqual(entry.afterExtra,['c']);
});
test('only explicit placeholder labels and actual block labels are removed; guests remain',()=>{
 const members=[{id:'real',name:'Guest 4'},{id:'close',name:'回川'},{id:'a',name:'A'},...['回替わり','回替り','回代わり','回代り','回変わり','回変り','日替わり','日替り'].map((name,i)=>({id:'p'+i,name}))];
 assert.deepEqual(Changes.eligibleMembers(members,{rosterNames:['Someone else'],blockLabels:['A']}).map(m=>m.id),['real','close']);
 const c=fixture(),before=JSON.stringify(c.S);assert.deepEqual(Array.from(c.absenceSelectableMembers(),m=>m.id),['m1','m2','m3','m4']);assert.equal(JSON.stringify(c.S),before);
});
test('owner status stays unchanged while VIEW hides only quiet reductions',()=>{
 const c=fixture(),song=c.S.songs[0];assert.equal(c.lineStatus(song,0),'');assert.equal(c.lineStatus(song,1),'changed');
 c.viewer=false;assert.equal(c.lineStatus(song,0),'changed');assert.equal(c.lineStatus(song,1),'changed');
});
test('each performance and take uses its own substitution key',()=>{
 const c=fixture();c.S.shows.push({id:'other',name:'Other',absent:['m2']});
 const other={id:'take2',showId:'other',groupId:'g',from:'song',title:'Take 2',roster:['m2','m3'],blocks:{},lines:[{t:'other song',parts:['m2','m3']}]};
 c.S.songs.push(other);c.S.subs['other|take2']={0:['m3']};c.S.subs['show|take2']={0:['m4']};
 assert.deepEqual(json(c.memberAbsenceChanges(other)[0].after),['m3']);assert.equal(c.S.showId,'show');
});
test('VIEW summary contains absence-only songs and personal changes before or after assignment',()=>{
 const c=fixture();delete c.S.songs[0].blocks.A;delete c.S.gsubs['show|song'].A;
 let html=c.viewerSummaryBody();assert.equal((html.match(/member-absence-change/g)||[]).length,4);assert(html.includes('quiet trio'));assert(html.includes('visible duo'));assert(html.includes('Song &lt;safe&gt;'));
 c.U.mode='member';c.selected=c.member('m2');html=c.viewerSummaryBody();assert.equal((html.match(/member-absence-change/g)||[]).length,1);assert(!html.includes('visible replacement'));assert(html.includes('一緒に歌うメンバーが変更'));
 c.selected=c.member('m4');html=c.viewerSummaryBody();assert.equal((html.match(/member-absence-change/g)||[]).length,1);assert(!html.includes('visible duo'));assert(!html.includes('visible addition'));assert(html.includes('新しく担当'));
 c.selected=c.member('m1');html=c.viewerSummaryBody();assert.equal((html.match(/member-absence-change/g)||[]).length,2);assert(html.includes('担当から外れます'));
});
test('personal changes exclude unison groups before or after replacement but preserve small roles',()=>{
 const song={id:'s',blocks:{A:['a','b','c']},lines:[
  {parts:['a','b'],t:'expansion'},
  {parts:['a','b','c'],t:'reduction'},
  {parts:['a','b','c','d'],main:['a','b','c'],extra:['d'],t:'solo harmony'},
  {parts:['a','b','c','d'],main:['a'],extra:['b','c','d'],t:'solo melody'},
  {label:'A',parts:['a','b','c'],t:'block group'}]};
 const entries=Changes.entries(song,{absent:['a'],includeGroupReductions:true,
  gsubs:{A:['b','c','e']},subs:{0:['b','c','e'],1:['b','c'],2:['a','b','c','e'],3:['b','c','d','e']}});
 for(const entry of entries.filter(e=>e.kind==='block'||e.lineIdx<2))for(const id of entry.involved)assert.equal(Changes.forMember(entry,id),false);
 const harmony=Changes.line(song,2,{absent:['d'],subs:{2:['a','b','c','e']}}),melody=entries.find(e=>e.lineIdx===3);
 for(const id of ['d','e'])assert.equal(Changes.forMember(harmony,id),true);
 for(const id of ['a','b','c'])assert.equal(Changes.forMember(harmony,id),false);
 for(const id of ['a','e'])assert.equal(Changes.forMember(melody,id),true);
 for(const id of ['b','c','d'])assert.equal(Changes.forMember(melody,id),false);
});
test('personal tabs exclude large unisons even before a member is selected',()=>{
 const c=fixture();delete c.S.songs[0].blocks.A;delete c.S.gsubs['show|song'].A;
 c.U.mode='member';c.U.absenceMode='member';
 for(const html of [c.viewerSummaryBody(),c.viewMemberAbsence()]){
  assert.equal((html.match(/member-absence-change/g)||[]).length,2);
  assert(!html.includes('quiet trio'));assert(!html.includes('visible addition'));
  assert(html.includes('visible duo'));assert(html.includes('visible replacement'));
 }
 c.U.mode='song';c.U.absenceMode='all';
 for(const html of [c.viewerSummaryBody(),c.viewMemberAbsence()])assert.equal((html.match(/member-absence-change/g)||[]).length,4);
});
test('unresolved or unchanged assignments stay out of member changes and lyric emphasis',()=>{
 const c=fixture(),song=c.S.songs[0];delete c.S.subs['show|song'][2];
 assert(!c.memberAbsenceChanges(song).some(e=>e.lineIdx===2));assert.equal(c.lineStatus(song,2),'');
 c.S.subs['show|song'][2]=['m1'];assert(!c.memberAbsenceChanges(song).some(e=>e.lineIdx===2));assert.equal(c.lineStatus(song,2),'');
 assert(!c.viewMemberAbsence().includes('調整中'));assert(!c.viewerSummaryBody().includes('調整中'));
 c.S.subs['show|song'][2]=['m4'];assert(c.memberAbsenceChanges(song).some(e=>e.lineIdx===2));assert.equal(c.lineStatus(song,2),'changed');
 c.S.shows[0].absent=[];assert(c.memberAbsenceChanges(song).some(e=>e.lineIdx===2));
 c.viewer=false;c.S.subs['show|song'][2]=['m1'];assert.equal(c.lineStatus(song,2),'');
});
test('an unchanged solo role does not inherit a large unison change',()=>{
 const song={id:'s',lines:[{parts:['a','b','c','h'],main:['a','b','c'],extra:['h'],t:'synthetic'}]};
 const entry=Changes.line(song,0,{absent:['a'],subs:{0:['b','c','h','d']}});
 assert.equal(Changes.forMember(entry,'h'),false);
});
test('member screens expose no edit controls and rendering never changes saved data',()=>{
 const c=fixture(),before=JSON.stringify(c.S),html=c.viewAbsent()+c.viewerSummaryBody();
 assert(html.includes('data-act="absence-scope"'));assert(html.includes('data-act="summary-note"'));
 for(const action of ['toggleabsent','setassign','setblock','assignblock','resetsubs','assign'])assert(!html.includes('data-act="'+action+'"'),action);
 assert.equal(JSON.stringify(c.S),before);
});
test('restored songs keep individual Excel export available before their original is linked',()=>{
 const c=fixture();c.viewer=false;
 const before=JSON.stringify(c.S),html=c.viewAbsent();
 assert(html.includes('data-act="xlsout" data-id="song"'),'A changed song without Excel metadata must still offer its verified-original export');
 assert(html.includes('data-act="xlsall"'));
 assert.equal(JSON.stringify(c.S),before,'Rendering the export controls does not repair or mutate the song');
 c.viewer=true;assert(!c.viewAbsent().includes('data-act="xlsout"'));
});
test('VIEW style uses the pure comparison and owner toggle validates allowed IDs',()=>{
 assert(source.includes('if (VIEW() && typeof AbsenceChanges !== "undefined") return AbsenceChanges.line'));
 assert(source.includes('if (VIEW() || preview || !absenceSelectableMembers().some(m=>m.id===id)) return false;'));
});
