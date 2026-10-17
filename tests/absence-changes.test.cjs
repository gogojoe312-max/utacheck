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
 c.recordingInboxCanWrite=()=>true;c.VIEW=()=>c.viewer;c.member=id=>c.S.members.find(m=>m.id===id);c.names=ids=>(ids||[]).map(c.member).filter(Boolean).map(m=>m.name).join('・');
 c.SONGS=()=>c.S.songs.filter(s=>s.showId===c.S.showId);c.songRoster=s=>s.roster||[];c.showRoster=()=>[...new Set(c.SONGS().flatMap(c.songRoster))];
 c.absentIds=id=>c.S.shows.find(s=>s.id===(id||c.S.showId))?.absent||[];
 c.subOf=(id,i)=>c.S.subs[c.S.showId+'|'+id]?.[i]||null;c.gsubOf=(id,b)=>c.S.gsubs[c.S.showId+'|'+id]?.[b]||null;
 c.blockOf=(s,i)=>s.blocks?.[s.lines[i]?.label]?s.lines[i].label:'';c.blocksOf=s=>Object.keys(s.blocks||{});
 c.blockParts=(s,b)=>c.gsubOf(s.id,b)||s.blocks[b];c.partsOf=(s,i)=>c.subOf(s.id,i)||s.lines[i].parts;
 c.restoreViewerMember=()=>c.selected;c.viewerMembers=()=>c.S.members.slice(0,4);c.compactMemberLabel=n=>n;
 c.summarySongs=()=>c.U.allShows?c.S.songs:c.SONGS();c.showName=id=>c.S.shows.find(s=>s.id===(id||c.S.showId))?.name||'';
 vm.createContext(c);
 for(const name of ['rowNo','memberChangePerformances','recordAssignmentChange','confirmAbsentAssignments','memberReviewNav','memberAbsenceContext','memberAbsenceChanges','absenceSelectableMembers','memberAbsenceRows','viewMemberAbsence','viewerSummaryBody','lineStatus','blockStatus','viewAbsent'])vm.runInContext(read(name),c);
 for(const so of c.S.songs){
  const key=so.showId+'|'+so.id;
  for(const [index,after] of Object.entries(c.S.subs[key]||{}))c.recordAssignmentChange(so,'lines',Number(index),after);
  for(const [block,after] of Object.entries(c.S.gsubs[key]||{}))c.recordAssignmentChange(so,'blocks',block,after);
 }
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
 c.S.songs.push(other);c.S.subs['other|take2']={0:['m3']};c.S.subs['show|take2']={0:['m4']};c.recordAssignmentChange(other,'lines',0,['m3']);
 assert.deepEqual(json(c.memberAbsenceChanges(other)[0].after),['m3']);assert.equal(c.S.showId,'show');
});
test('pre-live changes are separate from notes, with only actual changes exposing navigation',()=>{
 const c=fixture();delete c.S.songs[0].blocks.A;delete c.S.gsubs['show|song'].A;
 assert(!c.viewerSummaryBody().includes('member-absence-change'));
 assert(!c.viewerSummaryBody().includes('歌割の変更'));
 assert(c.memberReviewNav().includes('歌割変更があります'));assert(!c.memberReviewNav().includes('>歌割変更<'));
 c.U.absenceMode='all';let html=c.viewMemberAbsence();assert.equal((html.match(/member-absence-change/g)||[]).length,4);
 c.U.absenceMode='member';c.selected=c.member('m4');html=c.viewMemberAbsence();assert.equal((html.match(/member-absence-change/g)||[]).length,1);assert(html.includes('新しく担当'));
 c.S.subs={};c.S.gsubs={};assert.equal(c.memberReviewNav(),'');assert(!c.viewerSummaryBody().includes('member-absence-change'));
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
test('one member selector shows all changes for everyone and only personal changes for a named person',()=>{
 const c=fixture();delete c.S.songs[0].blocks.A;delete c.S.gsubs['show|song'].A;
 let html=c.viewMemberAbsence();assert.equal((html.match(/member-absence-change/g)||[]).length,4);
 assert(html.includes('id="summary-member"'));assert(!html.includes('absence-scope'));
 c.selected=c.member('m4');html=c.viewMemberAbsence();assert.equal((html.match(/member-absence-change/g)||[]).length,1);assert(html.includes('visible replacement'));
 c.selected=null;html=c.viewMemberAbsence();assert.equal((html.match(/member-absence-change/g)||[]).length,4);
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
 assert(!html.includes('data-act="absence-scope"'));assert(html.includes('id="summary-member"'));assert(html.includes('data-act="summary-note"'));
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

test('inactive legacy substitutions need explicit confirmation and unchanged assignments stay hidden',()=>{
 const c=fixture(),song=c.S.songs[0],before=json(c.S.subs);c.S.assignmentEdits={};c.S.shows[0].absent=[];c.S.subsMan={'show|song':{0:1,1:1,2:1,3:1}};
 assert.deepEqual(json(c.memberAbsenceChanges(song)),[]);assert.equal(c.memberReviewNav(),'');assert.equal(c.lineStatus(song,2),'');assert.deepEqual(json(c.S.subs),before);
 c.recordAssignmentChange(song,'lines',2,['m4']);assert.equal(c.memberAbsenceChanges(song).length,1);assert(c.memberReviewNav().includes('歌割変更があります（1件）'));
 c.S.subs['show|song'][2]=['m3'];assert.equal(c.memberReviewNav(),'','A stale receipt is not a new manual change');
 c.recordAssignmentChange(song,'lines',2,['m3']);assert.equal(c.memberAbsenceChanges(song).length,1);
 c.S.subs['show|song'][2]=['m1'];c.recordAssignmentChange(song,'lines',2,['m1']);assert.equal(c.memberReviewNav(),'','Reverting to original removes the notice');
});

test('explicit successful absence export confirms resolved assignments only; passive data stays hidden',()=>{
 const c=fixture(),so=c.S.songs[0];c.S.assignmentEdits={};c.S.shows[0].absent=[];
 assert.equal(c.memberAbsenceChanges(so).length,0);
 assert.equal(c.confirmAbsentAssignments([so]),false,'Members cannot confirm changes');
 c.viewer=false;c.S.subs['show|song'][2]=['m1'];
 assert.equal(c.confirmAbsentAssignments([so]),true);
 assert.deepEqual(json(c.memberAbsenceChanges(so).flatMap(e=>e.lineIndices)),[0,1,3]);
 assert.equal(c.confirmAbsentAssignments([so]),false,'Repeat export is idempotent');
});
test('explicit absence selection confirms only changed assignments and restoration clears the receipt',()=>{
 const c=fixture(),so=c.S.songs[0];c.viewer=false;c.S.assignmentEdits={};c.S.shows[0].absent=[];
 const previous=new Map([[so.id,{lines:so.lines.map((_,i)=>c.partsOf(so,i).slice()),blocks:{A:['m2']}}]]);
 c.S.subs['show|song'][1]=['m3'];
 assert.equal(c.confirmAbsentAssignments([so],previous),true);
 assert.deepEqual(json(c.memberAbsenceChanges(so).flatMap(e=>e.lineIndices)),[1]);
 const changed=new Map([[so.id,{lines:so.lines.map((_,i)=>c.partsOf(so,i).slice()),blocks:{A:['m2']}}]]);
 c.S.subs['show|song'][1]=['m1','m2'];c.confirmAbsentAssignments([so],changed);
 assert.equal(c.memberAbsenceChanges(so).length,0);
});

test('already-created absence changes remain visible without newer confirmation receipts',()=>{
 const c=fixture(),so=c.S.songs[0];c.S.assignmentEdits={};const before=JSON.stringify(c.S);
 assert.deepEqual(json(c.memberAbsenceChanges(so).flatMap(e=>e.lineIndices)),[0,1,2,3]);
 assert(c.memberReviewNav().includes('歌割変更があります'));
 assert.equal(c.memberAbsenceChanges(so,'m2',true).some(e=>e.lineIdx===0),false,'3+ unisons remain song-only');
 assert.equal(JSON.stringify(c.S),before,'Reading existing changes never mutates assignments');
 c.S.subs['show|song']={0:['m1','m2','m3'],1:['m1'],2:[],3:['m1']};c.S.gsubs={};
 assert.equal(c.memberReviewNav(),'','Unchanged, absent-still-assigned and empty unresolved rows stay hidden');
});
test('changes on another performance are accessible even when current performance has none',()=>{
 const c=fixture();c.S.shows.push({id:'newest',name:'Newest',absent:[]});c.S.showId='newest';
 assert(c.memberReviewNav().includes('data-id="show"'));
 assert(c.viewMemberAbsence().includes('id="summary-show"'));
});
