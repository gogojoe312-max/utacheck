const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

function sheet() {
 let click,html='',memo='';
 const c=vm.createContext({U:{sheet:{lineIdx:0,range:[1,3],tags:[],sel:['member'],memo:'',seq:['C4']}},S:{notes:[],showId:'show'},overlay:null,
  VIEW:()=>false,typingNow:()=>false,NOTES:()=>[],song:()=>({id:'song',lines:[{t:'新しい歌をここから始めます'}]}),labelOf:()=> '山田',rowNo:()=>1,
  pitchLabel:seq=>seq.join('-'),pianoHTML:()=>'<div id="pno"></div>',showPianoAtC4(){},
  document:{addEventListener(name,fn){click=fn;},getElementById:id=>id==='memo'&&c.U.sheet.detail?{value:memo}:null,
   createElement(){return {innerHTML:'',remove(){},querySelector(selector){return this.innerHTML.includes('note-details-content')?{open:true,addEventListener(){},scrollIntoView(){}}:null;}};},body:{appendChild(el){html=el.innerHTML;}}},
  commitFields(){if(c.U.sheet.detail)c.U.sheet.memo=memo;}});
 vm.runInContext(src.slice(0,src.indexOf('/* ---------------- state')),c);
 vm.runInContext(src.slice(src.indexOf('function renderSheet()'),src.indexOf('/* ---- summary ---- */')),c);
 const start=src.indexOf('document.addEventListener("click", (e) => {');vm.runInContext(src.slice(start,src.indexOf('\n});',start)+4),c);
 const render=()=>{vm.runInContext('renderSheet()',c);return html;};
 function act(action,id=''){const button={dataset:{act:action,id}};click({target:{closest:sel=>sel==='[data-act]'?button:null}});return html;}
 return {c,render,act,memo:value=>{memo=value;},html:()=>html,run:code=>vm.runInContext(code,c)};
}

test('all 33 choices are directly available in the main palette, separate from scrolling tools',()=>{
 const s=sheet(),html=s.render();
 const ids=[...html.matchAll(/data-act="tag-choice" data-id="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual([...new Set(ids)].sort(),Array.from(s.run('TAGS.map(t=>t.id)')).sort());
 assert.equal((html.match(/class="swipe-row"/g)||[]).length,7);
 assert(!/<input[^>]* id="memo"/.test(html));assert(!html.includes('id="pno"'));
 assert(html.includes('note-choice-content'));assert(html.includes('note-sheet-foot'));
});

test('returning from optional tools keeps the lyric range, memo and correct pitch',()=>{
 const s=sheet();s.render();const sh=s.c.U.sheet;
 const details=s.act('note-detail','memo');
 assert(details.includes('note-details-content'));assert(details.includes('id="memo"'));assert(!details.includes('data-swipe='));
 s.memo('語尾を確認');const main=s.act('note-detail-back');
 assert.equal(s.c.U.sheet,sh);assert.equal(sh.memo,'語尾を確認');assert.deepEqual(Array.from(sh.range),[1,3]);assert.deepEqual(Array.from(sh.seq),['C4']);
 assert(main.includes('入力あり'));assert(main.includes('note-choice-content'));
});
