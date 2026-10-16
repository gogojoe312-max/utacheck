const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function fixture(){
 const c=vm.createContext({S:{showId:'show',songs:[{id:'a',showId:'show',title:'長い曲名 A'},{id:'foreign',showId:'other',title:'Other'},{id:'b',showId:'show',title:'長い曲名 B'},{id:'c',showId:'show',title:'長い曲名 C'}],notes:[],recs:{keep:1},staffMemos:{keep:'memo'}},U:{menu:{kind:'song',id:'b'},songIdx:1},preview:null,viewer:false,canWrite:true,backupResult:true,backups:[],undoStack:[],saves:0,h:x=>x,songName:x=>x.title,overlay:null,schedulePush(){},render(){},renderSheet(){},document:{createElement:()=>({innerHTML:''}),body:{appendChild(){}}}});
 c.SONGS=()=>c.S.songs.filter(x=>x.showId==='show');c.VIEW=()=>c.viewer;c.recordingInboxCanWrite=()=>c.canWrite;c.save=()=>c.saves++;
 c.automaticBackupBeforeEdit=async reason=>{c.backups.push(reason);if(c.duringBackup)c.duringBackup();return c.backupResult;};
 for(const name of ['moveSong','pushUndo']){const start=source.indexOf('function '+name+'(');vm.runInContext(source.slice(source.lastIndexOf('\n',start)+1,source.indexOf('\n}',start)+2),c);}return c;
}
test('song menu omits one-step order changes and list keeps its drag handle and full title',()=>{
 const c=fixture(),start=source.indexOf('  if (U.menu) {\n    const many'),end=source.indexOf('\n  if (U.picker && S.recMode)',start);
 const draw=()=>{vm.runInContext('(()=>{'+source.slice(start,end)+'})()',c);return c.overlay.innerHTML;};
 const middle=draw();assert(!middle.includes('曲順を1つ上へ'));assert(!middle.includes('曲順を1つ下へ'));assert(middle.includes('PDFにする'));assert(middle.includes('aria-label="曲の操作"'));assert(!middle.includes('grow trunc'));
 c.U.menu.id='a';assert(!draw().includes('曲順を1つ上へ'));c.U.menu.id='c';assert(!draw().includes('曲順を1つ下へ'));
 const rows=source.slice(source.indexOf('  const songs = cur.map((x0, i0)'),source.indexOf('  const bar =',source.indexOf('  const songs = cur.map((x0, i0)')));
 assert(rows.includes('settings-song-title'));assert(rows.includes('class="organize-more"'));assert(rows.includes('data-drag="song:'));assert(!rows.includes('data-act="up"'));assert(!rows.includes('data-act="down"'));assert(!rows.includes('clamp2'));
});
test('drag reorder preserves other groups, metadata and selected song with a verified backup and undo',async()=>{
 const c=fixture(),protectedBefore=JSON.stringify([c.S.notes,c.S.recs,c.S.staffMemos]);
 assert.equal(await c.moveSong('b','a'),true);
 assert.deepEqual(c.S.songs.map(x=>x.id),['b','foreign','a','c']);assert.equal(c.U.songIdx,0);assert.equal(JSON.stringify([c.S.notes,c.S.recs,c.S.staffMemos]),protectedBefore);
 assert.deepEqual(c.backups,['song-order']);assert.deepEqual(JSON.parse(c.undoStack[0]).songOrder,['a','foreign','b','c']);
 const start=source.indexOf('    case "undo":'),end=source.indexOf('    case "jump":',start);vm.runInContext('switch("undo"){'+source.slice(start,end)+'}',c);
 assert.deepEqual(c.S.songs.map(x=>x.id),['a','foreign','b','c']);assert.equal(c.U.songIdx,1);
});
test('drag reorder rejects invalid or stale targets, failed backup and read-only modes',async()=>{
 for(const variant of ['backup','viewer','preview','lock','rec','scope','edit','foreign','same']){
  const c=fixture();if(variant==='backup')c.backupResult=false;if(variant==='viewer')c.viewer=true;if(variant==='preview')c.preview={};if(variant==='lock')c.canWrite=false;if(variant==='rec')c.S.recMode=true;
  if(variant==='scope')c.duringBackup=()=>c.U.showFilter='other';if(variant==='edit')c.duringBackup=()=>c.S.notes.push({id:'keep'});
  assert.equal(await c.moveSong('b',variant==='foreign'?'foreign':variant==='same'?'b':'a'),false,variant);
  assert.deepEqual(c.S.songs.map(x=>x.id),['a','foreign','b','c']);assert.equal(c.saves,0);assert.equal(c.undoStack.length,0);
 }
});
test('drag reorder uses current objects after a same-content state replacement',async()=>{
 const c=fixture();c.duringBackup=()=>c.S=JSON.parse(JSON.stringify(c.S));assert.equal(await c.moveSong('b','a'),true);assert.deepEqual(c.S.songs.map(x=>x.id),['b','foreign','a','c']);
});
