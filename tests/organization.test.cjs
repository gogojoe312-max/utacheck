const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function fn(n){const i=src.indexOf('function '+n+'(');return src.slice(src.lastIndexOf('\n',i)+1,src.indexOf('\n}',i)+2);}
function setup(){let id=0;const c=vm.createContext({S:{shows:[{id:'old',name:'前の公演',folder:'春'}],rsongs:[],songs:[],groups:[{id:'ocha',name:'OCHA NORMA'},{id:'rose',name:'ロージークロニクル'}],groupId:'rose',showId:'old',folders:{春:true},folderOrder:['春'],rfolders:{},rfolderOrder:[]},U:{},VIEW:()=>false,syncShowGroup(){},schedulePush(){},pushUndo(){},save(){},uid:()=>String(++id),selectShow:who=>{c.S.showId=who;},folderOf:x=>x?.folder||''});for(const n of ['folderNames','rememberFolder','saveOrganization','autoShowGroupId','groupShows','groupRSongs'])vm.runInContext(fn(n),c);return c;}
test('create an empty folder then create a show inside it with automatic group selection',()=>{
 const c=setup();assert.equal(c.saveOrganization({mode:'folder'},{name:'OCHA 秋ツアー'}),'');
 assert(c.groupShows(c.S.shows).some(([name,shows])=>name==='OCHA 秋ツアー'&&shows.length===0));
 assert.equal(c.saveOrganization({mode:'show'},{name:'東京 昼公演',folder:'OCHA 秋ツアー'}),'');
 const show=c.S.shows.at(-1);assert.equal(show.folder,'OCHA 秋ツアー');assert.equal(show.groupId,'ocha');assert.equal(c.S.showId,show.id);assert.equal(c.S.shows[0].name,'前の公演');
});
test('manual group, existing folder moves and folder renaming preserve show identity',()=>{
 const c=setup();c.saveOrganization({mode:'show'},{name:'OCHA公演',folder:'秋',groupId:'rose'});
 const id=c.S.shows.at(-1).id;c.saveOrganization({mode:'move',id},{folder:'春'});c.saveOrganization({mode:'folder',id:'春'},{name:'春ツアー'});
 assert.equal(c.S.shows.find(x=>x.id===id).groupId,'rose');assert.equal(c.S.shows.find(x=>x.id===id).folder,'春ツアー');assert.equal(c.S.shows[0].folder,'春ツアー');assert.equal(c.folderNames().filter(x=>x==='春ツアー').length,1);
});
test('empty or duplicate folder names never mutate existing data; recording folders stay separate',()=>{
 const c=setup();const before=JSON.stringify(c.S);assert.match(c.saveOrganization({mode:'folder'},{name:' '}),/入力/);assert.match(c.saveOrganization({mode:'folder'},{name:'春'}),/同じ名前/);assert.equal(JSON.stringify(c.S),before);
 c.saveOrganization({mode:'folder',rec:true},{name:'録音用'});assert(c.groupRSongs([]).some(([name])=>name==='録音用'));assert(!c.folderNames().includes('録音用'));
});

test('release event creation uses the displayed Rosy group even when the current import group is OCHA',()=>{
 const c=setup();c.S.groupId='ocha';c.U.showFilter='rose';
 assert.equal(c.saveOrganization({mode:'show'},{name:'リリイベ',folder:''}),'');
 const event=c.S.shows.at(-1);assert.equal(event.groupId,'rose');assert.equal(c.S.showId,event.id);
});

function openFolderRename(c,id){
 c.id=id;c.renderSheet=()=>{};c.showsFor=()=>c.S.shows.filter(x=>!c.U.showFilter||x.groupId===c.U.showFilter);
 const start=src.indexOf('    case "frename":'),end=src.indexOf('    case "fup":',start);
 vm.runInContext('switch("frename"){'+src.slice(start,end)+'}',c);
 return c.U.menu;
}
test('group folder rename keeps other groups, saved order, IDs, lyrics, notes and recordings intact',()=>{
 const c=setup();c.S.shows=[{id:'r1',groupId:'rose',folder:'リリイベ'},{id:'r2',groupId:'rose',folder:'リリイベ'},{id:'o1',groupId:'ocha',folder:'リリイベ'}];
 c.S.folderOrder=['前','リリイベ','後'];c.S.folders={前:true,リリイベ:false,後:true};
 c.S.songs=[{id:'song',showId:'o1',lines:[{id:'line',t:'keep lyric'}]}];c.S.notes=[{id:'note',showId:'r1',songId:'song',memo:'keep correction'}];c.S.recs={clip:{dur:23}};c.S.staffMemos={song:'keep memo'};
 const preserved=JSON.stringify([c.S.songs,c.S.notes,c.S.recs,c.S.staffMemos]);c.U.showFilter='rose';const menu=openFolderRename(c,'リリイベ');
 assert.equal(c.saveOrganization(menu,{name:'Rosyリリイベ'}),'');
 assert.deepEqual(c.S.shows.map(x=>[x.id,x.groupId,x.folder]),[['r1','rose','Rosyリリイベ'],['r2','rose','Rosyリリイベ'],['o1','ocha','リリイベ']]);
 assert.deepEqual(c.S.folderOrder,['前','リリイベ','後','Rosyリリイベ']);assert.equal(c.S.folders.リリイベ,false);assert.equal(c.S.folders.Rosyリリイベ,true);
 assert.equal(JSON.stringify([c.S.songs,c.S.notes,c.S.recs,c.S.staffMemos]),preserved);
});
test('rename scope stays fixed after the group filter changes or more shows arrive',()=>{
 const c=setup();c.S.shows=[{id:'r',groupId:'rose',folder:'春'},{id:'o',groupId:'ocha',folder:'春'}];c.U.showFilter='rose';const menu=openFolderRename(c,'春');
 c.U.showFilter='';c.S.shows.push({id:'new',groupId:'rose',folder:'春'});
 assert.equal(c.saveOrganization(menu,{name:'春ツアー'}),'');
 assert.deepEqual(c.S.shows.map(x=>x.folder),['春ツアー','春','春']);
});
test('all-group folder rename retains its complete scope and replaces folder metadata in place',()=>{
 const c=setup();c.S.shows=[{id:'r',groupId:'rose',folder:'春'},{id:'o',groupId:'ocha',folder:'春'}];c.S.folderOrder=['前','春','後'];c.U.showFilter='';const menu=openFolderRename(c,'春');
 c.U.showFilter='rose';assert.equal(c.saveOrganization(menu,{name:'春ツアー'}),'');
 assert.deepEqual(c.S.shows.map(x=>x.folder),['春ツアー','春ツアー']);assert.deepEqual(c.S.folderOrder,['前','春ツアー','後']);assert.equal(c.S.folders.春,undefined);
});
test('stale or missing group rename scope cannot fall back to renaming every group',()=>{
 const c=setup();c.S.shows=[{id:'r',groupId:'rose',folder:'春'},{id:'o',groupId:'ocha',folder:'春'}];c.U.showFilter='rose';const menu=openFolderRename(c,'春');c.S.shows[0].folder='秋';
 let before=JSON.stringify(c.S);assert.match(c.saveOrganization(menu,{name:'春ツアー'}),/見つかりません/);assert.equal(JSON.stringify(c.S),before);
 assert.match(c.saveOrganization({mode:'folder',id:'春'},{name:'春ツアー'}),/開き直して/);assert.equal(JSON.stringify(c.S),before);
});
test('a truly empty saved folder can be renamed in a filtered list without touching other groups',()=>{
 const c=setup();c.S.folderOrder.push('空の予定');c.S.folders['空の予定']=true;c.U.showFilter='rose';const before=JSON.stringify(c.S.shows);
 const menu=openFolderRename(c,'空の予定');assert.equal(menu.showIds,null);assert.equal(c.saveOrganization(menu,{name:'次の公演'}),'');
 assert.equal(JSON.stringify(c.S.shows),before);assert(c.S.folderOrder.includes('次の公演'));assert(!c.S.folderOrder.includes('空の予定'));
});
