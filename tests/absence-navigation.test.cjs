'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const start=source.indexOf('function '+name+'(');return source.slice(start,source.indexOf('\n}',start)+2);};
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const songs=['first','target'].map(id=>({id,lines:[{t:'重複'},{t:'重複'},{t:'hidden',cut:true},{t:'gap',gap:true}]}));
 const S={showId:'show',recMode:false,songs,notes:[{id:'keep'}]},U={view:'absent',songIdx:0,focus:'北原',draw:true,overview:true},scroll={scrollTop:740};
 let renders=0,saves=0;
 const c={S,U,preview:false,VIEW:()=>false,SONGS:()=>songs,song:()=>songs[U.songIdx],app:{querySelector:()=>scroll},render:()=>renders++,save:()=>saves++};
 vm.createContext(c);for(const name of ['ownerAbsenceBackButton','openAbsenceLyric','backToAbsence','applyAbsenceNavigation'])vm.runInContext(read(name),c);
 return {c,S,U,scroll,renders:()=>renders,saves:()=>saves};
}
test('absence lyric jump uses song identity and row indices, keeps data and restores UI context',()=>{
 const f=fixture(),before=plain(f.S);assert(f.c.openAbsenceLyric('target',[1]));
 assert.equal(f.U.view,'live');assert.equal(f.U.songIdx,1);assert.equal(f.U.overview,false);assert.equal(f.U.focus,'');assert.equal(f.U.draw,false);
 assert.deepEqual(plain(f.U.absenceLyricTarget),{songId:'target',indices:[1],pending:true});assert.match(f.c.ownerAbsenceBackButton(),/欠席対応に戻る/);
 assert(f.c.backToAbsence());assert.equal(f.U.view,'absent');assert.equal(f.U.songIdx,0);assert.equal(f.U.focus,'北原');assert.equal(f.U.draw,true);assert.equal(f.U.overview,true);
 f.scroll.scrollTop=0;f.c.applyAbsenceNavigation();assert.equal(f.scroll.scrollTop,740);assert.equal(f.U.absenceReturn,null);assert.equal(f.U.absenceLyricTarget,null);assert.deepEqual(f.S,before);assert.equal(f.saves(),0);assert.equal(f.renders(),2);
});
test('foreign songs, invalid or hidden rows, REC/member/preview and open draft cannot start a jump',()=>{
 for(const [id,indices] of [['foreign',[0]],['target',[]],['target',[2]],['target',[3]],['target',[-1]],['target',[4]],['target',[0.5]],['target',['1']]]){
  const f=fixture(),before=plain(f.U);assert.equal(f.c.openAbsenceLyric(id,indices),false);assert.deepEqual(f.U,before);assert.equal(f.renders(),0);
 }
 for(const change of [f=>f.S.recMode=true,f=>f.c.VIEW=()=>true,f=>f.c.preview=true,f=>f.U.sheet={draft:true},f=>f.U.menu={kind:'assign'},f=>f.U.view='setup']){
  const f=fixture();change(f);const before=plain(f.U);assert.equal(f.c.openAbsenceLyric('target',[1]),false);assert.deepEqual(f.U,before);
 }
});
test('deferred render retains target until exact row exists and only scrolls once',()=>{
 const f=fixture();f.c.openAbsenceLyric('target',[1]);let available=false,scrolls=0,highlights=0;
 f.c.app.querySelector=selector=>selector==='[data-lyric-line="1"]'&&available?{classList:{add:name=>{assert.equal(name,'absence-lyric-target');highlights++;}},scrollIntoView:()=>scrolls++}:null;
 f.c.applyAbsenceNavigation();assert(f.U.absenceLyricTarget.pending);available=true;f.c.applyAbsenceNavigation();f.c.applyAbsenceNavigation();assert.equal(scrolls,1);assert.equal(highlights,2);
});
test('a changed performance cannot expose or restore a stale absence return',()=>{
 const f=fixture();f.c.openAbsenceLyric('target',[1]);f.S.showId='other';assert.equal(f.c.ownerAbsenceBackButton(),'');assert.equal(f.c.backToAbsence(),false);
});
