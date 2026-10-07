'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const start=src.indexOf('function '+name+'(');return src.slice(start,src.indexOf('\n}',start)+2);};
function fixture(){const S={groups:[{id:'empty',name:'グループ1'},{id:'archive',name:'元Excelから復旧した資料',nopub:true},{id:'rec',name:'OCHA NORMA（10/8・9 REC）',nopub:true},{id:'live',name:'復旧グループ',nopub:true}],
 shows:[{id:'archiveShow',name:'元Excelから復旧した資料',groupId:'archive',recoverySource:'original-workbooks',nopub:true},{id:'show',name:'本公演',groupId:'live',nopub:true,recoveredSourceShowId:'source-show'}],
 songs:[{id:'original',showId:'archiveShow',groupId:'archive',recoveredFromOriginalExcel:true,lines:[{t:'保持する歌詞'}]},{id:'song',showId:'show',groupId:'live',lines:[]}],
 rsongs:[{id:'rec-song',groupId:'rec',lines:[{t:'REC歌詞'}]}],notes:[{id:'note',songId:'song',showId:'show',memo:'保持'}],plan:{slots:[{id:'slot',songId:'rec-song'}]},folders:{},staffMemos:{'show|song':'PRIVATE'},ghToken:''};
 const c=vm.createContext({S,U:{showFilter:''},VIEW:()=>false,showsNewestFirst:()=>S.shows,rememberViewSelection(){},render(){},renderSheet(){}});
 for(const name of ['autoShowGroupId','recoveryMaterialShow','liveGroups','showDeliveryGroupId','songDeliveryGroupId','showGroupIds','showsFor','setShowFilter','showDeliveryLabel'])vm.runInContext(read(name),c);
 return c;
}
test('live groups omit REC-only, recovery-only and unused migration defaults without mutating data',()=>{const c=fixture(),raw=JSON.stringify(c.S);assert.deepEqual(Array.from(c.liveGroups(),g=>g.id),['live']);assert.equal(JSON.stringify(c.S),raw);});
test('normal live shows exclude recovery originals, archive remains independently accessible',()=>{const c=fixture(),raw=JSON.stringify(c.S);assert.deepEqual(Array.from(c.showsFor(),s=>s.id),['show']);c.setShowFilter('__archive__');assert.deepEqual(Array.from(c.showsFor(),s=>s.id),['archiveShow']);c.setShowFilter('');assert.deepEqual(Array.from(c.showsFor(),s=>s.id),['show']);assert.equal(JSON.stringify(c.S),raw);});
test('REC title never hides a genuine live group and mixed-use group stays live',()=>{const c=fixture();c.S.songs.push({id:'also-live',showId:'show',groupId:'rec'});assert(c.liveGroups().some(g=>g.id==='rec'));});
test('connected or deliberately named empty groups remain available',()=>{const c=fixture();c.S.groups[0].gistId='synthetic-existing';c.S.groups.push({id:'new',name:'新規グループ'});assert(c.liveGroups().some(g=>g.id==='empty'));assert(c.liveGroups().some(g=>g.id==='new'));});
test('viewer cannot access archive even by stale filter or direct action',()=>{const c=fixture();c.VIEW=()=>true;c.setShowFilter('__archive__');assert.equal(c.U.showFilter,'');c.U.showFilter='__archive__';assert.equal(c.showsFor().length,0);});
test('old REC-only filter resolves to normal live list rather than empty content',()=>{const c=fixture();c.U.showFilter='rec';assert.deepEqual(Array.from(c.showsFor(),s=>s.id),['show']);});
test('recovery pending is explicit without clearing opt-out or restoring connectivity',()=>{const c=fixture(),raw=JSON.stringify(c.S);assert.equal(c.showDeliveryLabel(c.S.shows[1]),'復旧済み・配信再接続待ち');assert.equal(c.showDeliveryLabel(c.S.shows[0]),'配信しない');assert.equal(JSON.stringify(c.S),raw);});

test('archived show edit keeps its existing selected group option',()=>{
 const c=fixture();Object.assign(c,{folderNames:()=>[],h:String,folderOf:()=>'',group:()=>c.S.groups[0]});
 c.U.org={mode:'show',id:'archiveShow'};
 vm.runInContext(read('organizeSheetHTML'),c);
 assert.match(c.organizeSheetHTML({mode:'show',id:'archiveShow'}),/<option value="archive" selected>/);
});
test('member preview diagnostics omit empty and REC-only groups',()=>{
 const c=fixture();c.S.groups.forEach(g=>g.nopub=false);c.h=String;
 vm.runInContext(read('memberPreviewSettings'),c);const html=c.memberPreviewSettings();
 assert(!html.includes('グループ1'));assert(!html.includes('10/8'));assert(!html.includes('元Excel'));assert(html.includes('復旧グループ'));
});
test('opening the main picker leaves archive browsing and exposes normal shows',()=>{
 const c=fixture();c.U.showFilter='__archive__';let rendered=false;c.renderSheet=()=>{rendered=true;};
 const start=src.indexOf('case "picker":');vm.runInContext(src.slice(start+'case "picker":'.length,src.indexOf(' break;',start)),c);
 assert.equal(c.U.showFilter,'');assert.equal(c.U.picker,true);assert(rendered);assert.deepEqual(Array.from(c.showsFor(),s=>s.id),['show']);
});

test('hidden recovered history is retained in archive without exposing hidden REC/system shows',()=>{
 const c=fixture();c.S.shows.push({id:'old-version',groupId:'live',hidden:true,recoveredSourceShowId:'source-old'}, {id:'recording-system',hidden:true});
 assert.deepEqual(Array.from(c.showsFor(),s=>s.id),['show']);
 c.setShowFilter('__archive__');assert.deepEqual(Array.from(c.showsFor(),s=>s.id),['archiveShow','old-version']);
});
