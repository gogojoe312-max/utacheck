const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function context(){const c=vm.createContext({Date,S:{shows:[],showId:'night',songs:[],notes:[],recs:[{id:'keep'}]},U:{showFilter:'rosy'},h:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),folderOf:x=>x.folder||'',showsFor:()=>c.S.shows.filter(x=>x.groupId==='rosy')});vm.runInContext(source.slice(source.indexOf('function performanceDateOrder('),source.indexOf('// Each show owns')),c);return c;}
test('date labels order newest first, unknown and invalid dates last, independent of creation timestamps',()=>{const c=context();c.S.shows=[{id:'unknown',name:'研修生発表会2612',ts:999},{id:'sep',name:'Bookmark9/27',ts:200},{id:'aug',name:'260804なじられリハ',ts:300},{id:'night',name:'10/10 新宿Reny 夜公演',ts:1},{id:'oct',name:'10/4 熊谷昼公演',ts:500},{id:'invalid',name:'2/30',ts:1000}];const before=JSON.stringify(c.S);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(performanceSelectionOrder(S.shows).map(x=>x.id))',c)),['night','oct','sep','aug','unknown','invalid']);assert.equal(JSON.stringify(c.S),before);assert.equal(vm.runInContext('performanceDateOrder({name:"10/10"}).year',c),null);});
test('folder groups keep date order and every show exactly once without changing stored order',()=>{
 const c=context();c.S.shows=[{id:'old',name:'2025/12/1',folder:'Blueprint'},{id:'new',name:'2026/1/1',folder:'Blueprint'},{id:'same',name:'2026/1/1',folder:'Blueprint'}];c.S.folderOrder=['Blueprint','Blueprint'];const before=JSON.stringify(c.S);
 const groups=JSON.parse(vm.runInContext('JSON.stringify(performanceFolderGroups(S.shows).map(([name,shows])=>[name,shows.map(x=>x.id)]))',c));assert.deepEqual(groups,[['Blueprint',['new','same','old']]]);assert.equal(JSON.stringify(c.S),before);
});
test('selected folder opens initially, other folders collapse, and toggling is only transient UI state',()=>{
 const c=context();c.S.shows=[{id:'night',name:'10/10',folder:'Blueprint'},{id:'b',name:'9/27',folder:'Bookmark'}];const before=JSON.stringify(c.S);
 const render=()=>vm.runInContext('groupedPerformanceHTML(S.shows,x=>x.id+";",{editable:true})',c);
 assert.match(render(),/data-performance-folder="Blueprint"[^>]* open/);assert.doesNotMatch(render(),/data-performance-folder="Bookmark"[^>]* open/);
 c.U.performanceFolderOpen={showId:'night',folders:{'["rosy","Blueprint"]':false,'["rosy","Bookmark"]':true}};
 assert.doesNotMatch(render(),/data-performance-folder="Blueprint"[^>]* open/);assert.match(render(),/data-performance-folder="Bookmark"[^>]* open/);assert.equal(JSON.stringify(c.S),before);
 c.S.showId='b';assert.match(render(),/data-performance-folder="Bookmark"[^>]* open/);
});
test('filtered folders exclude other groups while saved empty folders remain usable',()=>{
 const c=context();c.S.shows=[{id:'r',groupId:'rosy',folder:'Blueprint'},{id:'o',groupId:'ocha',folder:'OCHAリリイベ'},{id:'r2',groupId:'rosy',folder:'Bookmark'}];c.S.folderOrder=['OCHAリリイベ','Blueprint','空の予定'];const before=JSON.stringify(c.S);
 const html=vm.runInContext('groupedPerformanceHTML(showsFor(),x=>x.id+";",{editable:true})',c);assert(!html.includes('OCHAリリイベ'));assert(html.includes('data-drop="f:空の予定"'));assert(html.includes('data-folder="空の予定"'));assert(!html.includes('フォルダなし'));assert(html.includes('名前を変更'));assert.equal(JSON.stringify(c.S),before);
 assert(!source.includes('manage-folders'));assert(!source.includes('selectionFolderNames'));assert(!source.includes('公演を選ぶ ·'));
});
test('existing unfiled performances have an explicit folderless heading and drop target',()=>{
 const c=context();c.S.shows=[{id:'night',name:'10/10'}];const html=vm.runInContext('groupedPerformanceHTML(S.shows,x=>x.id+";",{editable:true})',c);
 assert(html.includes('フォルダなし'));assert(html.includes('data-drop="f:"'));assert(!html.includes('data-act="frename"'));
});
test('folder labels and drop attributes escape saved text without losing any show',()=>{
 const c=context();c.S.shows=[{id:'night',name:'10/10',folder:'A"<B'}];const html=vm.runInContext('groupedPerformanceHTML(S.shows,x=>x.id+";",{editable:true})',c);
 assert(html.includes('data-drop="f:A&quot;&lt;B"'));assert(html.includes('A&quot;&lt;B'));assert.equal((html.match(/night;/g)||[]).length,1);
});
test('member optgroups retain all 22 show IDs, the selected show and the all-shows option',()=>{
 const c=context();c.S.shows=Array.from({length:22},(_,i)=>({id:'show-'+i,name:'10/'+(i+1),folder:i%2?'Bookmark':'Blueprint'}));c.S.showId='show-4';c.summaryShows=()=>c.S.shows;
 const start=source.indexOf('function summaryShowPicker(');vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),c);const before=JSON.stringify(c.S),html=c.summaryShowPicker();
 assert.equal((html.match(/<optgroup /g)||[]).length,2);assert.equal((html.match(/<option value="show-/g)||[]).length,22);assert(html.includes('<option value=""'));assert(html.includes('<option value="show-4" selected>'));
 for(let i=0;i<22;i++)assert.equal((html.match(new RegExp('value="show-'+i+'"','g'))||[]).length,1);assert.equal(JSON.stringify(c.S),before);
});
