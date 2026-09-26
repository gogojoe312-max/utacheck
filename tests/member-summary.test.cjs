const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
function fixture(){
 const stored=new Map();
 const c=vm.createContext({S:{groupId:'g',showId:'day1',linkSrc:'source1',members:[{id:'a',name:'山田'},{id:'b',name:'田中'}],rosters:{},groups:[],
 shows:[{id:'day1',name:'初日'},{id:'day2',name:'二日目'}],songs:[{id:'s1',title:'一曲目',showId:'day1',groupId:'g'},{id:'s2',title:'総括だけの曲',showId:'day1',groupId:'g'},{id:'s3',title:'翌日の曲',showId:'day2',groupId:'g'},{id:'other',title:'別グループ',showId:'day1',groupId:'other'}],memos:{'day1|s1':'共通の総括\n二行目','day1|s2':'指摘ゼロでも表示','day2|s3':'二日目の総括','day1|other':'漏らさない'}},U:{mode:'member',sumOpen:'',allShows:false},preview:null,
 notes:[{songId:'s1',showId:'day1',memberIds:['a'],lineIdx:1,tags:['音程'],memo:'山田向け'},{songId:'s1',showId:'day1',memberIds:['b'],lineIdx:2,tags:['リズム'],memo:'田中向け'}],
 localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},VIEW:()=>true,group:()=>({name:'グループ'}),h:x=>String(x??'').replace(/</g,'&lt;'),render(){},save(){},handHTML:()=>'',noteColor:()=>'',tagName:x=>x,pitchLabel:x=>x,lyricOf:n=>'歌詞'+n.lineIdx,partOf:()=>'',songName:so=>so.title,names:ids=>(ids||[]).join('・')});
 c.NOTES=()=>c.notes;c.songDeliveryGroupId=so=>so.groupId;c.showsNewestFirst=()=>c.S.shows;c.shownNotes=()=>c.notes.filter(n=>c.U.allShows||n.showId===c.S.showId);c.showName=id=>c.S.shows.find(sw=>sw.id===(id||c.S.showId))?.name;c.SONGS=()=>c.S.songs.filter(so=>so.showId===c.S.showId&&so.groupId===c.S.groupId);
 vm.runInContext(src.slice(src.indexOf('const songMemo ='),src.indexOf('const shownNotes =')),c);
 vm.runInContext(src.slice(src.indexOf('function summaryShows()'),src.indexOf('function viewSummary()')),c);
 return {c,stored,run:code=>vm.runInContext(code,c)};
}
test('personal view displays shared summaries including songs with zero notes',()=>{
 const {run}=fixture();run("selectViewerMember('a')");const html=run('viewerSummaryBody()');
 for(const text of ['共通の総括','指摘ゼロでも表示','全員共通','山田向け'])assert(html.includes(text),text);
 assert(!html.includes('田中向け'));assert(!html.includes('二日目の総括'));assert(!html.includes('漏らさない'));
});
test('summary-only publication renders even when there are no notes at all',()=>{
 const {c,run}=fixture();c.notes=[];const html=run('viewerSummaryBody()');assert(html.includes('指摘ゼロでも表示'));assert(!html.includes('member-empty'));
});
test('all shows use each song own memo key and continue filtering group',()=>{
 const {c,run}=fixture();c.U.allShows=true;const html=run('viewerSummaryBody()');assert(html.includes('二日目の総括'));assert(html.includes('共通の総括'));assert(!html.includes('漏らさない'));
});
test('name survives relaunch and regenerated member IDs but stays scoped to source',()=>{
 const {c,run}=fixture();run("selectViewerMember('a')");c.U={mode:'member'};c.S.members[0].id='new-a';assert.equal(run('restoreViewerMember().id'),'new-a');
 c.S.linkSrc='source2';assert.equal(run('restoreViewerMember()'),null);
 c.S.linkSrc='source1';assert.equal(run('restoreViewerMember().id'),'new-a');
});
test('preview never overwrites remembered name and denied storage remains usable',()=>{
 const {c,run,stored}=fixture();run("selectViewerMember('a')");c.preview='snapshot';run("selectViewerMember('b')");assert.equal(stored.get('utacheck.member:source1'),'山田');
 c.preview=null;c.localStorage={getItem(){throw Error()},setItem(){throw Error()}};c.U={mode:'member'};run("selectViewerMember('b')");assert.equal(run('restoreViewerMember().name'),'田中');
});
test('song view shows every member and opening a historic song changes the correct show',()=>{
 const {c,run}=fixture();run("selectViewerMember('a')");c.U.mode='song';const html=run('viewerSummaryBody()');assert(html.includes('田中向け'));assert(html.includes('指摘ゼロでも表示'));
 c.U.allShows=true;run("openSummarySong('s3')");assert.equal(c.S.showId,'day2');assert.equal(c.U.songIdx,0);assert.equal(c.U.view,'live');
});
test('summary header keeps member tabs simple and editor show tab available',()=>{
 const {c,run}=fixture();assert(!run('summaryHeader()').includes('公演別'));c.VIEW=()=>false;assert(run('summaryHeader()').includes('公演別'));
});
test('a feedback point opens its exact line and back restores the summary context and scroll',()=>{
 const {c,run}=fixture();let sc={scrollTop:360},jumped=0,highlighted=0;
 c.app={querySelector:q=>q==='.scroll'?sc:{classList:{add(){highlighted++;}},scrollIntoView(){jumped++;}}};
 c.song=()=>c.SONGS()[c.U.songIdx||0];c.S.songs[2].lines=[{},{}];
 c.U.view='summary';c.U.mode='diff';c.U.overview=true;
 run("openSummarySong('s3',1)");
 assert.equal(c.S.showId,'day2');assert.equal(c.U.overview,false);assert.equal(c.U.lyricTarget.lineIdx,1);
 run('applyMemberNavigation();applyMemberNavigation()');assert.equal(jumped,1);assert.equal(highlighted,2);
 sc.scrollTop=0;run('backToSummary();applyMemberNavigation()');
 assert.equal(c.S.showId,'day1');assert.equal(c.U.mode,'diff');assert.equal(c.U.view,'summary');assert.equal(sc.scrollTop,360);assert.equal(c.U.lyricTarget,null);
});
test('summary uses feedback links and a single lyric tab after comparison',()=>{
 const {run}=fixture();const body=run('viewerSummaryBody()'),head=run('summaryHeader()');
 assert(body.includes('data-act="summary-note" data-id="s1" data-i="1"'));assert(!body.includes('data-act="summary-song"'));
 assert(head.indexOf('前回との差')<head.indexOf('data-act="summary-lyrics"'));assert.equal((head.match(/>歌詞</g)||[]).length,1);
 assert(run('viewerBackButton()').includes('指摘に戻る'));
});
test('lyric entry without a note opens current song, handles empty songs, and rejects other groups',()=>{
 const {c,run}=fixture();c.app={querySelector:()=>({scrollTop:20})};c.U.view='summary';c.U.songIdx=1;
 run('openSummarySong()');assert.equal(c.U.view,'live');assert.equal(c.U.songIdx,1);assert.equal(c.U.lyricTarget,null);
 c.U.view='summary';run("openSummarySong('other',0)");assert.equal(c.U.view,'summary');
 c.S.songs=[];run('openSummarySong()');assert.equal(c.U.view,'summary');
});
test('remembered member opens on another performance after relaunch and a roster refresh',()=>{
 const {c,run}=fixture();run("selectViewerMember('b')");c.S.showId='day2';c.S.members=[{id:'new-b',name:'田中'},{id:'new-a',name:'山田'}];c.U={view:'summary',mode:'member',allShows:false};
 const html=run('viewerSummaryBody()');assert(html.includes('田中さんへの指摘と'));assert(html.includes('二日目の総括'));assert.equal(c.U.sumOpen,'new-b');
});
test('the exact selected substring is highlighted in context without a duplicate target line',()=>{
 const {c,run}=fixture();c.S.songs[0].lines=[{t:'大空目掛けて羽ばたくけれど (Yeah)'}];
 c.notes=[{songId:'s1',showId:'day1',memberIds:['a','b'],lineIdx:0,from:11,to:12,tags:['音程']}];
 const html=run('viewerSummaryBody()');
 assert(html.includes('大空目掛けて羽ばたくけ<mark class="member-target">れど</mark> (Yeah)'));
 assert(!html.includes('対象：'));assert.equal((html.match(/大空目掛けて/g)||[]).length,1);
 assert(html.includes('対象メンバー'));assert(html.includes('member-note-tag">音程'));
 run("selectViewerMember('a')");assert(!run('viewerSummaryBody()').includes('対象メンバー'));
});
test('selection uses Unicode characters and escapes imported lyric markup',()=>{
 const {c,run}=fixture();c.S.songs[0].lines=[{t:'A🎵<歌詞>終'}];
 // Use the application escape helper as well as the production renderer.
 vm.runInContext(src.slice(src.indexOf('const h ='),src.indexOf('\n\n',src.indexOf('const h ='))),c);
 assert.equal(run("memberLyricHTML({songId:'s1',lineIdx:0,from:1,to:5})"),'A<mark class="member-target">🎵&lt;歌詞&gt;</mark>終');
});
test('whole-line and multi-line notes show the complete marked range',()=>{
 const {c,run}=fixture();c.S.songs[0].lines=[{t:'最初の行'},{t:'次の行'},{t:'範囲外'}];
 assert.equal(run("memberLyricHTML({songId:'s1',lineIdx:0})"),'<mark class="member-target">最初の行</mark>');
 assert.equal(run("memberLyricHTML({songId:'s1',lineIdx:0,lineEnd:1})"),'<mark class="member-target">最初の行\n次の行</mark>');
});
test('invalid old offsets never highlight a different phrase or stop the other notes',()=>{
 const {c,run}=fixture();c.S.songs[0].lines=[{t:'短い歌詞'}];
 for(const [from,to] of [[-1,2],[9,12],[2,1],[1,null]])assert.equal(run(`memberLyricHTML({songId:'s1',lineIdx:0,from:${from},to:${to}})`),'短い歌詞');
});
test('choosing a member keeps shared feedback and excludes another member and another group',()=>{
 const {c,run}=fixture();
 c.notes.push({id:'shared',songId:'s1',showId:'day1',memberIds:[],lineIdx:0,tags:['音程'],memo:'全員への指摘'},
  {id:'legacy-shared',songId:'s1',showId:'day1',lineIdx:0,tags:[],memo:'旧データの全員向け'},
  {id:'foreign',songId:'other',showId:'day1',memberIds:[],lineIdx:0,tags:[],memo:'別グループ向け'});
 run("selectViewerMember('a')");const html=run('viewerSummaryBody()');
 for(const text of ['山田向け','全員への指摘','旧データの全員向け','対象メンバー','<span>全員</span>'])assert(html.includes(text),text);
 assert(!html.includes('田中向け'));assert(!html.includes('別グループ向け'));
 assert(html.includes('data-note="shared"'));
});
function lyricDOM(c){
 const rows=c.S.songs[0].lines.map(line=>{
  const classes=new Set(),marks=new Set();let jumps=0;
  const chars=Array.from(line.t).map((t,i)=>({t,dataset:{c:String(i)},classList:{add:()=>marks.add(i)}}));
  return {classes,chars,marks,classList:{add:name=>classes.add(name)},querySelectorAll:()=>chars,scrollIntoView(){jumps++;},get jumps(){return jumps;}};
 });
 c.app={querySelector:q=>q==='.scroll'?{scrollTop:100}:rows[Number(q.match(/"(\d+)"/)?.[1])]};
 c.song=()=>c.SONGS()[c.U.songIdx||0];return rows;
}
test('two points on one line open the tapped Unicode range and highlight only those characters',()=>{
 const {c,run}=fixture();c.S.songs[0].lines=[{t:'A🎵歌詞終'}];
 c.notes=[{id:'first',songId:'s1',showId:'day1',lineIdx:0,from:0,to:0},
  {id:'second',songId:'s1',showId:'day1',lineIdx:0,from:1,to:3}];
 const rows=lyricDOM(c);c.U.view='summary';
 run("openSummarySong('s1',0,'second');applyMemberNavigation();applyMemberNavigation()");
 assert.equal(c.U.lyricTarget.noteId,'second');assert.deepEqual([...rows[0].marks],[1,2,3]);assert.equal(rows[0].jumps,1);
 run('backToSummary()');assert.equal(c.U.lyricTarget,null);assert.equal(c.U.view,'summary');
});
test('whole multi-line feedback highlights each selected row but not the following line',()=>{
 const {c,run}=fixture();c.S.songs[0].lines=[{t:'最初'},{t:''},{t:'最後'},{t:'範囲外'}];
 c.notes=[{id:'multi',songId:'s1',showId:'day1',lineIdx:0,lineEnd:2}];
 const rows=lyricDOM(c);run("openSummarySong('s1',0,'multi');applyMemberNavigation()");
 for(let i=0;i<3;i++)assert(rows[i].classes.has('member-lyric-target'));
 assert.deepEqual([...rows[0].marks],[0,1]);assert.deepEqual([...rows[2].marks],[0,1]);assert.equal(rows[3].marks.size,0);assert.equal(rows[3].classes.size,0);
});
test('invalid offsets and mismatched feedback never highlight a different phrase',()=>{
 const {c,run}=fixture();c.S.songs[0].lines=[{t:'短い歌詞'}];
 c.notes=[{id:'broken',songId:'s1',showId:'day1',lineIdx:0,from:-1,to:2},
  {id:'other-song',songId:'s2',showId:'day1',lineIdx:0,from:0,to:1}];
 const rows=lyricDOM(c);run("openSummarySong('s1',0,'broken');applyMemberNavigation()");assert.equal(rows[0].marks.size,0);
 run("openSummarySong('s1',0,'other-song');applyMemberNavigation()");assert.equal(c.U.lyricTarget.noteId,undefined);assert.equal(rows[0].marks.size,0);
});
test('repeated lyrics show surrounding lines without occurrence or row-number labels',()=>{
 const {c,run}=fixture();c.S.songs[0].lines=[{t:'最初の歌詞'},{t:'ラ'},{gap:true,t:''},{t:'二度目の前'},{t:'ラ'},{t:'続く歌詞'}];
 const at=run("memberNoteLocation({songId:'s1',lineIdx:4})");
 assert.equal(at.label,'');assert.equal(at.detail,undefined);
 assert.equal(at.previous,'二度目の前');assert.equal(at.next,'続く歌詞');
 assert(!JSON.stringify(at).includes('2番'));
 const first=run("memberNoteLocation({songId:'s1',lineIdx:0})");assert.equal(first.label,'');assert.equal(first.previous,'');
 const html=run("memberNoteBody({songId:'s1',lineIdx:4,tags:[]},false)");
 assert(!html.includes('member-note-location'));assert(!html.includes('member-note-top'));assert(!html.includes('回目'));assert(!html.includes('行目'));
});
test('explicit verse sections remain accurate and C is not assumed to mean chorus',()=>{
 const {c,run}=fixture();c.S.songs[0].lines=[{t:'始まり',sec:'１Ａ'},{t:'次の歌詞'},{t:'二番',sec:'2サビ'},{t:'終わり',sec:'2C'}];
 assert.equal(run("memberNoteLocation({songId:'s1',lineIdx:1}).label"),'1番・Aメロ');
 assert.equal(run("memberNoteLocation({songId:'s1',lineIdx:2}).label"),'2番・サビ');
 assert.equal(run("memberNoteLocation({songId:'s1',lineIdx:3}).label"),'2番・C');
});
test('context skips blanks and section-only headings, and brackets the entire selected range',()=>{
 const {c,run}=fixture();c.S.songs[0].lines=[{sec:'2B',t:'2B'},{t:'直前'},{gap:true,t:''},{t:'対象の頭'},{t:'対象の終わり'},{t:'直後'}];
 const at=run("memberNoteLocation({songId:'s1',lineIdx:3,lineEnd:4})");
 assert.equal(at.label,'2番・Bメロ');assert.equal(at.detail,undefined);assert.equal(at.previous,'直前');assert.equal(at.next,'直後');
 assert.equal(run("memberNoteLocation({songId:'s1',lineIdx:2}).detail"),undefined);
 assert.equal(run("memberNoteLocation({songId:'s1',lineIdx:99})"),null);
});
test('source section metadata restores on import and older publications remain readable',()=>{
 const {c,run}=fixture();c.addMember=name=>({id:name});c.uid=()=> 'import';c.splitNames=s=>s.split('・');c.songSig=()=>1;
 vm.runInContext(src.slice(src.indexOf('function buildSong('),src.indexOf('// 拡張子が二重')),c);
 const so=run("buildSong({lines:[['全','最初'],['',''],['→','次']],sections:[{lineIdx:0,name:'1A'},{lineIdx:1,name:'2サビ'},{lineIdx:99,name:'範囲外'}]})");
 assert.equal(so.lines[0].sec,'1A');assert.equal(so.lines[1].sec,'2サビ');assert.equal(so.lines.length,3);
 assert.equal(run("buildSong({lines:[['全','古い形式']]}).lines[0].sec"),undefined);
});
