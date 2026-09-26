const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
function setup(){
 let saves=0,pushes=0;const fields={staffmemo:{value:'スタッフだけへの連絡'}};
 const c=vm.createContext({S:{showId:'show',staffMemos:{},memos:{}},U:{},VIEW:()=>false,song:()=>({id:'song'}),h:s=>s.replaceAll('<','&lt;'),document:{getElementById:id=>fields[id]},save(){saves++;},schedulePush(){pushes++;}});
 vm.runInContext(block('const memoKey =','const shownNotes ='),c);
 vm.runInContext(block('function commitFields()', 'document.addEventListener("click"'),c);
 return {c,fields,run:s=>vm.runInContext(s,c),saves:()=>saves,pushes:()=>pushes};
}
test('staff notes persist separately by show and song, edit and clear without triggering member publication',()=>{
 const {c,fields,run,saves,pushes}=setup();run('commitFields()');assert.equal(c.S.staffMemos['show|song'],'スタッフだけへの連絡');assert.equal(saves(),1);assert.equal(pushes(),0);assert.equal(Object.keys(c.S.memos).length,0);
 c.S.showId='next';run('commitFields()');assert.equal(Object.keys(c.S.staffMemos).length,2);
 fields.staffmemo.value='';run('commitFields()');assert.equal(c.S.staffMemos['next|song'],undefined);assert.equal(c.S.staffMemos['show|song'],'スタッフだけへの連絡');
});
test('staff field escapes saved content and is absent from member and recording views',()=>{
 const {c,run}=setup();c.S.staffMemos['show|song']='<script>private';
 const html=run("staffMemoCard({id:'song'})");assert(html.includes('スタッフ用メモ'));assert(html.includes('&lt;script>private'));assert(!html.includes('<script>'));
 c.VIEW=()=>true;assert.equal(run("staffMemoCard({id:'song'})"),'');run('commitFields()');assert.equal(c.S.staffMemos['show|song'],'<script>private');
 c.VIEW=()=>false;c.S.recMode=true;assert.equal(run("staffMemoCard({id:'song'})"),'');
});
