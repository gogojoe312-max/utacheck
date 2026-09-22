const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const c=vm.createContext({});vm.runInContext(src.slice(0,src.indexOf('function renderQuickMenu')),c);
const parse=value=>{c.value=value;return JSON.parse(vm.runInContext('JSON.stringify(parseNoteInput(value))',c));};
test('requested abbreviations register existing tags, not memo-only substitutes',()=>{
 for(const [word,id,label] of [['はや','fast','リズム速い'],['まい','mic','マイク'],['たか','pHi','音程高い'],['なが','long','長い']]){
  assert.deepEqual(parse(word),{tags:[id],memo:''});c.id=id;assert.equal(vm.runInContext('tagName(id)',c),label);
 }
});
test('full spellings and common script variants use the same existing IDs',()=>{
 for(const word of ['はやい','ハヤ','ﾊﾔ','早い','速い','リズム速い'])assert.deepEqual(parse(word),{tags:['fast'],memo:''});
 for(const word of ['まいく','マイク','ﾏｲｸ'])assert.deepEqual(parse(word),{tags:['mic'],memo:''});
 for(const word of ['たかい','高い','音程高い'])assert.deepEqual(parse(word),{tags:['pHi'],memo:''});
 assert.deepEqual(parse('ひく'),{tags:['pLo'],memo:''});assert.deepEqual(parse('おそ'),{tags:['slow'],memo:''});
});
test('several abbreviations create one note with distinct tags in input order',()=>{
 assert.deepEqual(parse('はや まい たか なが'),{tags:['fast','mic','pHi','long'],memo:''});
 assert.deepEqual(parse('たか、はや / たか'),{tags:['pHi','fast'],memo:''});
});
test('ambiguous or negative prose remains memo text rather than a false tag',()=>{
 for(const word of ['あたたかい','たかい声で','まいにち','ながくしない','はやくしない','たかい 語尾を丸く'])assert.deepEqual(parse(word),{tags:[],memo:word});
 assert.deepEqual(parse(''),{tags:[],memo:''});
});
function commit(value,tags=[]){
 let saves=0,pushes=0,undos=0,renders=0;const ctx=vm.createContext({document:{getElementById:()=>({value})},
  U:{sheet:{lineIdx:2,range:[1,4],sel:['singer'],tags,memo:'',seq:[]}},S:{notes:[],showId:'show'},
  song:()=>({id:'song'}),clearTimeout(){},sheetTimer:null,renderSheet(){},pushUndo(){undos++;},save(){saves++;},schedulePush(){pushes++;},render(){renders++;},recAt:()=>12,takeCtx:()=>3});
 vm.runInContext(src.slice(0,src.indexOf('function renderQuickMenu')),ctx);
 vm.runInContext(src.slice(src.indexOf('function commitNote()'),src.indexOf('// 今のセットリストをそのまま新しい公演')),ctx);
 vm.runInContext('commitNote();commitNote()',ctx);
 return {note:JSON.parse(JSON.stringify(ctx.S.notes[0])),count:ctx.S.notes.length,saves,pushes,undos,renders,sheet:ctx.U.sheet};
}
test('actual save retains range, singer and recording context while publishing canonical tags once',()=>{
 for(const [input,id] of [['はや','fast'],['まい','mic'],['たか','pHi'],['なが','long']]){
  const result=commit(input);assert.deepEqual(result.note.tags,[id]);assert.equal(result.note.memo,'');
  assert.deepEqual(result.note.memberIds,['singer']);assert.equal(result.note.lineIdx,2);assert.equal(result.note.from,1);assert.equal(result.note.to,4);
  assert.equal(result.note.at,12);assert.equal(result.note.tk,3);assert.equal(result.note.songId,'song');assert.equal(result.note.showId,'show');
  assert.equal(result.count,1);assert.equal(result.saves,1);assert.equal(result.pushes,1);assert.equal(result.undos,1);assert.equal(result.sheet,null);
 }
});
test('typed specifics replace matching broad button categories without losing other categories',()=>{
 assert.deepEqual(commit('たか',['pitch']).note.tags,['pHi']);
 assert.deepEqual(commit('はや',['rhythm']).note.tags,['fast']);
 assert.deepEqual(commit('まい',['pitch']).note.tags,['pitch','mic']);
 assert.deepEqual(commit('なが',['long']).note.tags,['long']);
});
