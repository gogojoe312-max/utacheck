const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function fixture(){
 const c=vm.createContext({S:{songs:[{id:'a',showId:'show',title:'長い曲名 A'},{id:'foreign',showId:'other',title:'Other'},{id:'b',showId:'show',title:'長い曲名 B'},{id:'c',showId:'show',title:'長い曲名 C'}],notes:[],recs:{keep:1},staffMemos:{keep:'memo'}},U:{menu:{kind:'song',id:'b'},songIdx:1},h:x=>x,songName:x=>x.title,overlay:null,save(){},schedulePush(){},render(){},renderSheet(){},document:{createElement:()=>({innerHTML:''}),body:{appendChild(){}}}});
 c.SONGS=()=>c.S.songs.filter(x=>x.showId==='show');return c;
}
test('song menu retains accessible order changes while the list reserves width for the full title',()=>{
 const c=fixture(),start=source.indexOf('  if (U.menu) {\n    const many'),end=source.indexOf('\n  if (U.picker && S.recMode)',start);
 const draw=()=>{vm.runInContext('(()=>{'+source.slice(start,end)+'})()',c);return c.overlay.innerHTML;};
 const middle=draw();assert(middle.includes('曲順を1つ上へ'));assert(middle.includes('曲順を1つ下へ'));assert(middle.includes('PDFにする'));assert(middle.includes('aria-label="曲の操作"'));assert(!middle.includes('grow trunc'));
 c.U.menu.id='a';assert(!draw().includes('曲順を1つ上へ'));c.U.menu.id='c';assert(!draw().includes('曲順を1つ下へ'));
 const rows=source.slice(source.indexOf('  const songs = cur.map((x0, i0)'),source.indexOf('  const bar =',source.indexOf('  const songs = cur.map((x0, i0)')));
 assert(rows.includes('settings-song-title'));assert(rows.includes('class="organize-more"'));assert(rows.includes('data-drag="song:'));assert(!rows.includes('data-act="up"'));assert(!rows.includes('data-act="down"'));assert(!rows.includes('clamp2'));
});
test('menu reorder uses the chosen song ID and preserves other groups, metadata and selected song',()=>{
 const c=fixture(),start=source.indexOf('    case "up": case "down": {'),end=source.indexOf('    case "pickfile":',start);c.a='up';c.i=0;
 const protectedBefore=JSON.stringify([c.S.notes,c.S.recs,c.S.staffMemos]);vm.runInContext('switch(a){'+source.slice(start,end)+'}',c);
 assert.deepEqual(c.S.songs.map(x=>x.id),['b','foreign','a','c']);assert.equal(c.U.songIdx,0);assert.equal(c.U.menu,null);assert.equal(JSON.stringify([c.S.notes,c.S.recs,c.S.staffMemos]),protectedBefore);
});
