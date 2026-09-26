const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
function setup(){
 let pushes=0;
 const c=vm.createContext({S:{groupId:'rose',showId:'r',groups:[{id:'ocha',name:'OCHA NORMA'},{id:'rose',name:'ロージークロニクル'},{id:'off',name:'配信しない',nopub:true}],
 shows:[{id:'o',name:'OCHA 公演',ts:2},{id:'r',name:'ロージークロニクル 公演',ts:1}],songs:[{id:'a',title:'曲A',showId:'o',groupId:'ocha',lines:[],blocks:{}},{id:'b',title:'曲B',showId:'r',groupId:'rose',lines:[],blocks:{}}],notes:[{songId:'a',showId:'o',memberIds:[],tags:['fast'],lineIdx:0,memo:'指摘A'}],memos:{'o|a':'総括A'},gsubs:{},subs:{}},U:{},VIEW:()=>false,save(){},render(){},schedulePush(){pushes++;},member:()=>null});
 c.group=id=>c.S.groups.find(g=>g.id===id);c.showsNewestFirst=()=>c.S.shows;
 vm.runInContext(block('function autoShowGroupId(', 'function showsFor()'),c);
 vm.runInContext(block('function showsFor()', 'const showsNewestFirst ='),c);
 vm.runInContext(block('function publicationData(', 'async function gh('),c);
 return {c,run:s=>vm.runInContext(s,c),pushes:()=>pushes};
}
test('choosing OCHA show switches import group and publication contains only its songs, notes and summary',()=>{
 const {c,run,pushes}=setup();run("selectShow('o')");assert.equal(c.S.groupId,'ocha');assert.equal(c.S.showId,'o');assert.equal(pushes(),1);
 const p=run("publicationData('ocha')");assert.equal(p.songs.length,1);assert.equal(p.songs[0].showId,'o');assert.equal(p.notes[0].memo,'指摘A');assert.equal(p.memos[0].text,'総括A');assert.equal(p.focusShow,'o');
 assert.equal(run("publicationData('rose').notes.length"),0);
 run("selectShow('o')");assert.equal(c.S.showId,'o');
});
test('explicit override reroutes the whole show without changing source song ownership and auto restores it',()=>{
 const {c,run}=setup();run("selectShow('o');setShowDelivery('o','rose')");assert.equal(c.S.groupId,'rose');assert.equal(c.S.songs[0].groupId,'ocha');
 assert.equal(run("publicationData('ocha').songs.length"),0);assert.equal(run("publicationData('rose').notes.length"),1);
 run("selectShow('r');selectShow('o')");assert.equal(c.S.groupId,'rose');
 run("setShowDelivery('o','')");assert.equal(c.S.groupId,'ocha');assert.equal(run("publicationData('ocha').notes.length"),1);
});
test('legacy single-group shows infer correctly; ambiguous data requires an explicit group before publishing',()=>{
 const {c,run}=setup();c.S.shows[0].name='9/23';assert.equal(run('autoShowGroupId(S.shows[0])'),'ocha');
 c.S.songs.push({id:'mix',showId:'o',groupId:'rose',title:'混合',lines:[],blocks:{}});assert.equal(run('autoShowGroupId(S.shows[0])'),'');
 assert.throws(()=>run("publicationData('ocha')"),/配信先が未設定/);assert.throws(()=>run("publicationData('rose')"),/配信先が未設定/);
 run("setShowDelivery('o','__songs__')");assert.equal(run("publicationData('ocha').songs.length"),1);assert.equal(run("publicationData('rose').songs.length"),2);
});
test('hidden/non-public shows stay excluded, invalid targets do not change routing, viewers never publish',()=>{
 const {c,run,pushes}=setup();run("setShowDelivery('o','missing')");assert.equal(c.S.shows[0].deliveryGroupId,undefined);
 c.S.shows[0].nopub=true;assert.equal(run("publicationData('ocha').songs.length"),0);
 c.S.shows[0].nopub=false;c.S.shows[0].hidden=true;assert.equal(run("publicationData('ocha').songs.length"),0);
 c.VIEW=()=>true;run("selectShow('o');setShowDelivery('o','rose')");assert.equal(pushes(),0);assert.equal(c.S.groupId,'rose');assert.equal(c.S.shows[0].deliveryGroupId,undefined);
});
test('previous correction is automatically fixed if no correction is recorded this time',()=>{
 const {c,run}=setup();c.S.songs[0].lines=[{t:'歌詞'}];c.prevShowId=()=> 'r';c.summaryHeader=()=>'';c.SONGS=()=>[c.S.songs[0]];c.prevSongOf=()=>({id:'prev',title:'前回',showId:'r',lines:[{t:'歌詞'}]});
 c.NOTES=()=>[{id:'n',songId:'prev',showId:'r',lineIdx:0,tags:['fast'],memberIds:[],memo:'前回の指摘'}];
 Object.assign(c,{h:String,names:()=>'',tagName:x=>x,handHTML:()=>'',songName:so=>so.title,showName:()=>''});
 vm.runInContext(block('function viewDiff()', '// 古い曲から'),c);const html=run('viewDiff()');assert(html.includes('直った 1'));assert(!html.includes('未確認'));assert(!html.includes('続いている 1'));
});
test('selecting the group changes both the current show destination and subsequent import group',()=>{
 const {c,run,pushes}=setup();c.S.showId='o';c.S.groupId='ocha';
 run("setCurrentShowGroup('rose')");assert.equal(c.S.groupId,'rose');assert.equal(c.S.shows[0].groupId,'rose');
 assert.equal(run("songDeliveryGroupId(S.songs[0])"),'rose');
 assert.equal(run("publicationData('ocha').songs.length"),0);assert.equal(run("publicationData('rose').notes.length"),1);assert.equal(pushes(),1);
 run("selectShow('r');selectShow('o')");assert.equal(c.S.groupId,'rose');
});
test('loading a saved import selection does not silently rewrite an existing performance destination',()=>{
 const {c,run}=setup();c.S.showId='o';c.S.shows[0].groupId='ocha';c.S.groupId='rose';
 run('syncShowGroup()');assert.equal(c.S.groupId,'ocha');assert.equal(c.S.shows[0].groupId,'ocha');assert.equal(run("publicationData('ocha').songs.length"),1);
});
test('a mixed Hello concert is visible to both groups and each gets only their songs, notes and summaries',()=>{
 const {c,run}=setup();c.S.shows[0].name='ハロコン';c.S.shows[0].groupId='ocha';c.S.showId='o';c.S.songs[1].showId='o';
 c.S.notes.push({songId:'b',showId:'o',memberIds:[],tags:['fast'],lineIdx:0,memo:'指摘B'});c.S.memos['o|b']='総括B';
 run("setShowDelivery('o','__songs__')");
 const a=run("publicationData('ocha')"),b=run("publicationData('rose')");
 assert.equal(a.shows[0].name,'ハロコン');assert.equal(b.shows[0].name,'ハロコン');
 assert.equal(a.songs.length,1);assert.equal(b.songs.length,1);assert.equal(a.notes[0].memo,'指摘A');assert.equal(b.notes[0].memo,'指摘B');
 assert.equal(a.memos[0].text,'総括A');assert.equal(b.memos[0].text,'総括B');
 assert.equal(a.focusShow,'o');assert.equal(b.focusShow,'o');
});
test('explicit song selection beats the show default and no-publication songs remain private',()=>{
 const {c,run}=setup();c.S.showId='o';c.S.shows[0].groupId='ocha';c.S.songs[1].showId='o';
 run("setSongDelivery(['b'],'rose')");assert.equal(run("publicationData('rose').songs.length"),1);assert.equal(run("publicationData('ocha').songs.length"),1);
 run("setSongDelivery(['b'],'')");assert.equal(run("publicationData('rose').songs.length"),0);assert.equal(run("publicationData('ocha').songs.length"),1);
 run("setShowDelivery('o','rose')");assert.equal(run("songDeliveryGroupId(S.songs[1])"),'');assert.equal(run("publicationData('rose').songs.length"),1);
});
test('changing import group in a mixed concert preserves existing per-song destinations',()=>{
 const {c,run}=setup();c.S.showId='o';c.S.shows[0].name='ハロコン';c.S.songs[1].showId='o';
 run("setShowDelivery('o','__songs__');setCurrentShowGroup('rose')");
 assert.equal(c.S.groupId,'rose');assert.equal(c.S.shows[0].deliveryMode,'song');
 assert.equal(run("publicationData('ocha').songs.length"),1);assert.equal(run("publicationData('rose').songs.length"),1);
});
test('staff memos never enter either group publication, even when attached to published songs',()=>{
 const {c,run}=setup();c.S.staffMemos={'o|a':'PRIVATE_STAFF_OCHA','r|b':'PRIVATE_STAFF_ROSE'};
 for(const id of ['ocha','rose']) {
   const payload=run(`publicationData('${id}')`);
   assert.equal(payload.staffMemos,undefined);assert(!JSON.stringify(payload).includes('PRIVATE_STAFF'));
 }
});
test('a release event follows its actual destination and never the stale import group',()=>{
 const {c,run}=setup();c.S.shows[1].name='リリイベ';c.S.shows[1].groupId='rose';c.S.shows[1].deliveryGroupId='ocha';c.S.showId='o';
 run("setShowFilter('rose')");assert(!run('showsFor()').some(sw=>sw.name==='リリイベ'));
 run("setShowFilter('ocha')");assert(run('showsFor()').some(sw=>sw.name==='リリイベ'));
});
test('show filters never change the current performance or publish; all reveals every folder and ignores stale saved filters',()=>{
 const {c,run,pushes}=setup();c.S.showFilter='ocha';c.S.folders={ロージー:false};c.S.shows[1].folder='ロージー';
 assert.equal(run('showsFor().length'),2);
 for(let i=0;i<20;i++)c.S.shows.push({id:'old'+i,name:'古い公演'+i});
 const before=JSON.stringify([c.S.shows,c.S.songs,c.S.notes,c.S.memos]),current=c.S.showId,group=c.S.groupId;
 run("setShowFilter('ocha');setShowFilter('')");assert.equal(run('showsFor().length'),22);assert.equal(c.S.folders.ロージー,true);
 assert.equal(c.S.showId,current);assert.equal(c.S.groupId,group);assert.equal(pushes(),0);assert.equal(JSON.stringify([c.S.shows,c.S.songs,c.S.notes,c.S.memos]),before);
 assert(!src.includes('allShows.slice(0, 12)'));
});

test('OCHA excludes the current Rosy show, stale OCHA song overrides, unrelated empty shows and hidden recording shows',()=>{
 const {c,run}=setup();c.S.showId='r';c.S.shows[1].groupId='rose';c.S.shows[1].name='Bookmark9/6 東京';
 c.S.songs[1].groupId='ocha';c.S.songs[1].deliveryGroupId='ocha';
 c.S.shows.push({id:'empty-rose',name:'リリイベ',groupId:'rose'},{id:'unknown',name:'グループ未設定'},{id:'rec',hidden:true,groupId:'ocha'});
 c.S.folders={};const before=JSON.stringify(c.S);
 run("setShowFilter('ocha')");assert.deepEqual(Array.from(run('showsFor()'),x=>x.id),['o']);
 const pub=run("publicationData('ocha')");assert.equal(pub.songs.length,1);assert.equal(pub.shows[0].id,'o');
 run("setShowFilter('rose')");assert.deepEqual(Array.from(run('showsFor()'),x=>x.id),['r','empty-rose']);
 assert.equal(run("publicationData('rose').songs.length"),1);assert.equal(JSON.stringify(c.S),before);
});
test('mixed concert lists only actual song destinations, plus its organizing group',()=>{
 const {c,run}=setup();c.S.groups.push({id:'hello',name:'ハロコン'});c.S.shows[0].groupId='hello';c.S.shows[0].deliveryMode='song';c.S.songs[1].showId='o';
 run("setShowFilter('ocha')");assert.deepEqual(Array.from(run('showsFor()'),x=>x.id),['o']);
 run("setShowFilter('rose')");assert(run('showsFor()').some(x=>x.id==='o'));
 run("setShowFilter('hello')");assert.deepEqual(Array.from(run('showsFor()'),x=>x.id),['o']);
 run("setShowFilter('off')");assert.equal(run('showsFor().length'),0);
});
