'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(source.lastIndexOf('\n',i)+1,source.indexOf('\n}',i)+2);};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(rec=false){
 const calls={backup:0,save:0,publish:0,undo:[]};let finish;
 const line={id:'line',t:'合成😀歌詞を保持',parts:['member'],at:9,bars:4,cs:[{f:0,t:3,c:'#123456'}]};
 const item=id=>({id,title:'合成曲',take:2,showId:'show',lines:[clone(line),{t:'次の行',parts:[]}]});
 const S={recMode:rec,songs:[item('live')],rsongs:[item('rec')],notes:[{songId:rec?'rec':'live',lineIdx:0,from:3,to:6,memo:'指摘を保持'}],draws:{},recs:{audio:{id:'keep'}},plan:{slots:[{songId:'rec',takes:{A:3}}]}};
 const fields={'#lyric-break-text':{value:''},'#lyric-break-error':{hidden:true,textContent:''},'[type="submit"]':{disabled:false}};
 const form={isConnected:true,querySelector:selector=>fields[selector],setAttribute(){},removeAttribute(){}};
 const c=vm.createContext({S,U:{menu:null},song:()=>S[rec?'rsongs':'songs'][0],VIEW:()=>false,preview:null,recordingInboxCanWrite:()=>true,
  REC:null,recordingStartPending:false,recordingFinalizePending:false,pitchStartPending:false,PT:{on:false},micStream:null,
  h:s=>String(s).replace(/[<>&"]/g,x=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[x])),WeakSet,document:{activeElement:{blur(){}}},draftFormIsComposing:()=>false,
  commitFields(){},flushSheet(){},clearTimeout(){},sheetTimer:null,renderSheet(){},render(){},save(){calls.save++;},schedulePush(){calls.publish++;},pushUndo(id){calls.undo.push(id);},
  automaticBackupBeforeEdit(){calls.backup++;return new Promise(resolve=>{finish=resolve;});}});
 vm.runInContext('const lyricBreakSubmissions=new WeakSet();',c);
 for(const name of ['lyricBreakOffsets','lyricBreakDraft','lyricBreaksFromDraft','lyricTextHTML','lyricBreakTarget','openLyricBreaks','lyricBreakSheetHTML','submitLyricBreakForm'])vm.runInContext(read(name),c);
 return {c,S,form,fields,calls,line:S[rec?'rsongs':'songs'][0].lines[0],finish:value=>finish(value),open(){assert(c.openLyricBreaks(0));fields['#lyric-break-text'].value=c.lyricBreakDraft(c.song().lines[0]);},draft(){fields['#lyric-break-text'].value='合成😀\n歌詞を保持';}};
}
test('Unicode positions preserve lyric characters and normalize repeated or edge blank lines',()=>{
 const {c,line}=fixture();
 assert.deepEqual(clone(c.lyricBreaksFromDraft(line,'\n合成😀\r\n\n歌詞を\n保持\n')),[3,6]);
 assert.equal(c.lyricBreakDraft({...line,lyricBreaks:[6,3,3,0,100,-1,2.5,'2']}),'合成😀\n歌詞を\n保持');
 assert.equal(c.lyricBreaksFromDraft(line,'合成\n歌詞を保持'),null);
 assert.equal(c.lyricBreaksFromDraft(line,'合成😀\n歌詞 を保持'),null);
 assert.equal(c.lyricTextHTML({t:'甲<&😀乙',lyricBreaks:[3,4]}),'甲&lt;&amp;<br>😀<br>乙');
 assert.equal(c.lyricTextHTML({t:'甲乙',lyricBreaks:[1]},true),'（甲<br>乙）');
});
test('LIVE and REC use the same prefilled editor without changing data or starting backup',()=>{
 for(const rec of [false,true]){const f=fixture(rec),before=JSON.stringify(f.S);f.line.lyricBreaks=[3];const expected=JSON.stringify(f.S);f.open();
  assert.equal(f.fields['#lyric-break-text'].value,'合成😀\n歌詞を保持');assert.equal(f.calls.backup,0);assert.equal(JSON.stringify(f.S),expected);
  const html=f.c.lyricBreakSheetHTML(f.c.U.menu);assert(html.includes('id="lyric-break-form" data-save-on-submit'));assert(html.includes('<textarea'));assert(html.includes('歌詞の改行'));
  assert.notEqual(before,expected);
 }
});
test('saving waits for backup and changes only display offsets, retaining lyric and note anchors',async()=>{
 for(const rec of [false,true]){const f=fixture(rec),expected=clone(f.S);f.open();f.draft();const pending=f.c.submitLyricBreakForm(f.form);
  assert.equal(f.calls.save,0);assert.deepEqual(clone(f.S),expected);f.finish(true);assert.equal(await pending,true);
  expected[rec?'rsongs':'songs'][0].lines[0].lyricBreaks=[3];assert.deepEqual(clone(f.S),expected);
  assert.equal(f.calls.save,1);assert.equal(f.calls.publish,rec?0:1);assert.deepEqual(f.calls.undo,[rec?undefined:'live']);
  f.open();assert.equal(f.fields['#lyric-break-text'].value,'合成😀\n歌詞を保持');
 }
});
test('removing breaks deletes only the display metadata',async()=>{
 const f=fixture(true);f.line.lyricBreaks=[3];const expected=clone(f.S);delete expected.rsongs[0].lines[0].lyricBreaks;
 f.open();f.fields['#lyric-break-text'].value=f.line.t;const pending=f.c.submitLyricBreakForm(f.form);f.finish(true);assert.equal(await pending,true);assert.deepEqual(clone(f.S),expected);
});
test('unchanged, composing or altered lyric text cannot mutate or create unnecessary backups',async()=>{
 for(const rec of [false,true]){const f=fixture(rec),before=JSON.stringify(f.S);f.open();f.fields['#lyric-break-text'].value='違う歌詞';assert.equal(await f.c.submitLyricBreakForm(f.form),false);assert.equal(f.fields['#lyric-break-error'].hidden,false);
  f.draft();f.c.draftFormIsComposing=()=>true;assert.equal(await f.c.submitLyricBreakForm(f.form),false);f.c.draftFormIsComposing=()=>false;f.fields['#lyric-break-text'].value=f.line.t;
  assert.equal(await f.c.submitLyricBreakForm(f.form),true);assert.equal(f.calls.backup,0);assert.equal(f.calls.save,0);assert.equal(JSON.stringify(f.S),before);
 }
});
test('backup failure keeps the draft, and duplicate submit cannot write twice',async()=>{
 const f=fixture();f.open();f.draft();let pending=f.c.submitLyricBreakForm(f.form);assert.equal(await f.c.submitLyricBreakForm(f.form),false);
 f.finish(false);assert.equal(await pending,false);assert.equal(f.calls.backup,1);assert.equal(f.calls.save,0);assert.equal(f.fields['#lyric-break-text'].value,'合成😀\n歌詞を保持');assert.equal(f.fields['[type="submit"]'].disabled,false);
 pending=f.c.submitLyricBreakForm(f.form);f.finish(true);assert.equal(await pending,true);assert.equal(f.calls.save,1);
});
test('cancel, stale state, permission loss, draft changes and recording start during backup cannot commit',async()=>{
 for(const change of [f=>{f.c.U.menu=null;},f=>{f.form.isConnected=false;},f=>{f.S.notes.push({memo:'new'});},f=>{f.fields['#lyric-break-text'].value='合成\n😀歌詞を保持';},f=>{f.c.recordingInboxCanWrite=()=>false;},f=>{f.c.VIEW=()=>true;},f=>{f.S.recMode=false;},f=>{f.c.REC={};},f=>{f.c.PT.on=true;},f=>{f.line.t='別の歌詞';}]){
  const f=fixture(true);f.open();f.draft();const pending=f.c.submitLyricBreakForm(f.form);change(f);f.finish(true);assert.equal(await pending,false);assert.equal(f.calls.save,0);assert.equal(f.line.lyricBreaks,undefined);
 }
});
test('absolute freehand ink and active microphone state retain the original layout',async()=>{
 const f=fixture(true);f.S.draws['old-take|rec']=[{points:[[5,100]]}];f.open();f.draft();const before=JSON.stringify(f.S);
 assert.equal(await f.c.submitLyricBreakForm(f.form),false);assert.equal(f.fields['#lyric-break-error'].hidden,false);assert.equal(JSON.stringify(f.S),before);assert.equal(f.calls.backup,0);
 for(const key of ['REC','recordingStartPending','recordingFinalizePending','pitchStartPending','micStream']){const g=fixture();g.c[key]=true;assert.equal(g.c.openLyricBreaks(0),false);assert.equal(g.calls.backup,0);}
});
