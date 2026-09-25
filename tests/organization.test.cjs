const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function fn(n){const i=src.indexOf('function '+n+'(');return src.slice(src.lastIndexOf('\n',i)+1,src.indexOf('\n}',i)+2);}
function setup(){let id=0;const c=vm.createContext({S:{shows:[{id:'old',name:'前の公演',folder:'春'}],rsongs:[],songs:[],groups:[{id:'ocha',name:'OCHA NORMA'},{id:'rose',name:'ロージークロニクル'}],groupId:'rose',showId:'old',folders:{春:true},folderOrder:['春'],rfolders:{},rfolderOrder:[]},U:{},VIEW:()=>false,pushUndo(){},save(){},uid:()=>String(++id),selectShow:who=>{c.S.showId=who;},folderOf:x=>x?.folder||''});for(const n of ['folderNames','rememberFolder','saveOrganization','autoShowGroupId','groupShows','groupRSongs'])vm.runInContext(fn(n),c);return c;}
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
