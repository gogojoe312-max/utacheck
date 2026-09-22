const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function sheet(){
 let click,html='',memo='',commits=[];
 const c=vm.createContext({U:{sheet:{lineIdx:0,range:[1,3],tags:[],sel:['member'],memo:'',seq:['C4']}},S:{notes:[],showId:'show'},overlay:null,
  window:{},resumeRender(){},VIEW:()=>false,typingNow:()=>false,NOTES:()=>[],song:()=>({id:'song',lines:[{t:'新しい歌をここから始めます'}]}),labelOf:()=> '山田',rowNo:()=>1,
  pitchLabel:seq=>seq.join('-'),pianoHTML:()=>'<div id="pno"></div>',showPianoAtC4(){},
  scheduleCommit(){commits.push(c.U.sheet);c.U.sheet=null;},
  document:{addEventListener(name,fn){click=fn;},getElementById:id=>id==='memo'&&c.U.sheet?.detail?{value:memo}:null,
   createElement(){return {innerHTML:'',remove(){},querySelector(){return this.innerHTML.includes('note-details-content')?{open:true,addEventListener(){},scrollIntoView(){}}:null;}};},body:{appendChild(el){html=el.innerHTML;}}},
  commitFields(){if(c.U.sheet?.detail)c.U.sheet.memo=memo;}});
 vm.runInContext(src.slice(0,src.indexOf('/* ---------------- state')),c);
 vm.runInContext(src.slice(src.indexOf('function renderSheet()'),src.indexOf('/* ---- summary ---- */')),c);
 const start=src.indexOf('document.addEventListener("click", (e) => {');vm.runInContext(src.slice(start,src.indexOf('\n});',start)+4),c);
 const render=()=>{vm.runInContext('renderSheet()',c);return html;};
 function act(action,id=''){const button={dataset:{act:action,id}};click({target:{closest:sel=>sel==='[data-act]'?button:null},detail:1});return html;}
 return {c,render,act,memo:value=>{memo=value;},commits,run:code=>vm.runInContext(code,c)};
}
test('only four fixed choices appear; history cannot move their positions',()=>{
 const s=sheet(),html=s.render();
 const ids=[...html.matchAll(/data-act="tag-choice" data-id="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(ids,['pitch','rhythm','nuance','good']);assert(html.includes('しい歌'));assert(html.includes('hand-open'));
 assert(!html.includes('data-swipe'));assert(!html.includes('id="pno"'));
 s.c.S.notes=[{tags:['pLo','pHi','lyric']}];assert.equal(s.render(),html);
 // Detailed historical tags still have their names.
 assert.equal(s.run('tagName("pLo")'),'音程低');assert.equal(s.run('tagName("breath")'),'ブレス');
});
test('one button press immediately commits the chosen tag and selected lyric range',()=>{
 for(const id of ['pitch','rhythm','nuance','good']){
  const s=sheet();s.render();s.act('tag-choice',id);s.act('tag-choice',id);
  assert.equal(s.commits.length,1);assert.deepEqual(Array.from(s.commits[0].tags),[id]);assert.deepEqual(Array.from(s.commits[0].range),[1,3]);
 }
});
test('optional memo and pitch tools return to four choices without losing the selected range or ink',()=>{
 const s=sheet(),sh=s.c.U.sheet;sh.hand={v:1,cells:[[[[20,30],[30,40]]]]};s.render();
 assert(s.act('note-detail','memo').includes('id="memo"'));s.memo('語尾を確認');
 const html=s.act('note-detail-back');assert(html.includes('quick-four'));assert.equal(sh.memo,'語尾を確認');
 assert.equal(s.c.U.sheet,sh);assert.equal(sh.hand.cells.length,1);assert.deepEqual(Array.from(sh.seq),['C4']);
});
