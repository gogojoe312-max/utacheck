const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
const block=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const id='a'.repeat(32),other='b'.repeat(32);
const raw=n=>`https://gist.githubusercontent.com/example/${n}/raw/utacheck.json`;
const pinned=raw(id).replace('/raw/','/raw/'+'c'.repeat(40)+'/');
function setup(){
 let next=0;const calls=[];
 const S={groups:[{id:'g',name:'Group',gistId:id,src:pinned}],groupId:'g',ghToken:'synthetic',shows:[],songs:[],notes:[],members:[],gsubs:{},subs:{},memos:{},src:pinned};
 const c=vm.createContext({S,U:{},URL,Date,VIEW:()=>true,save(){},render(){},restoreViewSelection(){},h:String,todayLabel:()=> 'Today',
  group:()=>S.groups[0],member:mid=>S.members.find(m=>m.id===mid),addMember:name=>{let m=S.members.find(m=>m.name===name);if(!m)S.members.push(m={id:String(++next),name});return m;},uid:()=>String(++next),
  buildSong:s=>({...s,id:String(++next),lines:[],blocks:{},roster:[]}),songSig:()=>'',NOTES:()=>S.pubNotes||[],showsNewestFirst:()=>S.shows,
  wrap:async d=>d,gh:async(path,opts)=>{calls.push({path,opts});return {};}});
 for(const [a,b] of [['function gistRawSource(','// 入れたトークン'],['function autoShowGroupId(', 'function showGroupIds('],['function publicationData(', 'async function gh('],['function payloadKey(', '// 送りすぎるとGitHub'],['const srcUrl =','// 受け取り専用の端末'],['function applySetlist(d)','async function syncSetlist'],['function summaryShows()','function selectSummaryShow(']])vm.runInContext(block(a,b),c);
 return {c,S,calls};
}
test('strict raw parser unpins only GitHub data URLs, retaining original query and dropping fragments',()=>{
 const {c}=setup();assert.equal(c.gistRawSource(pinned+'?t=1#private').url,raw(id)+'?t=1');
 for(const u of ['http:'+pinned.slice(6),pinned.replace('gist.githubusercontent.com','evil.example'),pinned.replace('https://','https://user:pass@'),pinned.replace('utacheck.json','other.json')])assert.equal(c.gistRawSource(u),null);
});
test('publisher rejects a source on another Gist before PATCH and normalizes its own pinned source',async()=>{
 const {c,S,calls}=setup();S.groups[0].src=raw(other);
 await assert.rejects(c.gistPush('g',true),/一致しない/);assert.equal(calls.length,0);
 S.groups[0].src=pinned;await c.gistPush('g',true);
 assert.equal(S.groups[0].src,raw(id));assert.equal(JSON.parse(JSON.parse(calls[0].opts.body).files['utacheck.json'].content).src,raw(id));
});
test('publisher rejects unverifiable GitHub raw URLs but retains custom-source compatibility',async()=>{
 for(const url of [raw(id).replace('utacheck.json','other.json'),raw(id).replace('/raw/','/%72aw/'),raw(id).replace('https:','http:'),raw(id).replace('https://','https://user:pass@')]){
  const {c,S,calls}=setup();S.groups[0].src=url;
  await assert.rejects(c.gistPush('g',true),/形式を確認できない/);assert.equal(calls.length,0);
 }
 const {c,S,calls}=setup();S.groups[0].src='https://custom.example/setlist.json';await c.gistPush('g',true);assert.equal(calls.length,1);
});
for(const stage of ['previous GET','wrap'])test('source edited during '+stage+' stops before PATCH',async()=>{
 const {c,S,calls}=setup();let finish;
 if(stage==='previous GET'){
  c.publicationData=(gid,previous)=>{if(previous)return {songs:[],src:S.groups[0].src};const e=new Error('need previous');e.code='NEED_PREVIOUS_PUBLICATION';throw e;};
  c.gh=async(path,opts)=>{if(opts?.method==='PATCH')calls.push({path,opts});return new Promise(resolve=>{finish=()=>resolve({files:{'utacheck.json':{content:'{"songs":[]}'}}});});};
 }else c.wrap=async d=>new Promise(resolve=>{finish=()=>resolve(d);});
 const pending=c.gistPush('g',true);await new Promise(resolve=>setImmediate(resolve));
 S.groups[0].src=raw(other);finish();await assert.rejects(pending,/接続設定が変わった/);assert.equal(calls.length,0);
});
test('fetch unpins source and received metadata cannot redirect refreshes',async()=>{
 const {c,S}=setup();let requested;c.fetch=async url=>{requested=url;return {ok:true,json:async()=>({songs:[]})};};
 await c.fetchSetlist();assert(requested.startsWith(raw(id)+'?t='));
 c.applySetlist({songs:[],shows:[],src:raw(other)});assert.equal(S.src,raw(id));
 c.applySetlist({songs:[],shows:[],src:'https://other.example/data.json'});assert.equal(S.src,raw(id));
});
test('five permitted shows retain 19/20/19 songs and 146/172/70 notes through publish, fetch, apply and picker',async()=>{
 const {c,S,calls}=setup();const songCounts=[19,20,19,2,3],noteCounts=[146,172,70,1,2];
 for(let i=0;i<5;i++){
  const sid='show'+i;S.shows.push({id:sid,name:'Performance '+i,folder:'Collection',groupId:'g'});
  for(let j=0;j<songCounts[i];j++)S.songs.push({id:sid+'song'+j,title:'Song '+j,showId:sid,groupId:'g',lines:[],blocks:{}});
  for(let j=0;j<noteCounts[i];j++)S.notes.push({songId:sid+'song'+(j%songCounts[i]),showId:sid,memberIds:[],tags:[],lineIdx:0,memo:'Feedback '+j});
 }
 await c.gistPush('g',true);const wire=JSON.parse(JSON.parse(calls[0].opts.body).files['utacheck.json'].content);
 S.groups=[{id:'member'}];S.groupId='member';S.songs=[];S.notes=[];S.shows=[];
 c.fetch=async()=>({ok:true,json:async()=>wire});c.applySetlist(await c.fetchSetlist());
 assert.equal(S.shows.length,5);assert.equal(c.summaryShows().length,5);
 for(let i=0;i<5;i++){
  assert.equal(S.songs.filter(s=>s.showId==='show'+i).length,songCounts[i]);
  assert.equal(S.pubNotes.filter(n=>n.showId==='show'+i).length,noteCounts[i]);
  assert(c.summaryShowPicker().includes('Performance '+i));
 }
});
test('recovery trusts matching metadata instead of embedded source and rejects mismatched metadata before mutation',()=>{
 const {c,S}=setup();vm.runInContext(block('function mergeDelivery(', 'async function restoreFromId('),c);
 const d={groupName:'Group',src:raw(other),songs:[],shows:[]};
 const before=JSON.stringify(S);assert.throws(()=>c.mergeDelivery(d,{id,files:{'utacheck.json':{raw_url:raw(other)}}},'Group'),/確認できない/);assert.equal(JSON.stringify(S),before);
 c.mergeDelivery(d,{id,files:{'utacheck.json':{raw_url:pinned}}},'Group');assert.equal(S.groups[0].src,raw(id));
});
test('reopening the same chosen link repairs a previous payload redirect before syncing without resetting records',async()=>{
 const {c,S}=setup();S.groups=[{id:'member'}];S.songs=[{id:'kept'}];S.linkSrc=pinned;S.src=raw(other);
 let synced,reset=0;
 Object.assign(c,{preview:null,TextDecoder,location:{hash:'#g=synthetic'},b64d:()=>new TextEncoder().encode(JSON.stringify({src:pinned})),keepLinkInURL(){},syncSetlist:async()=>{synced=S.src;},resetForNewSource(){reset++;},alert(){}});
 vm.runInContext(block('async function importFromLink()', 'function copyText('),c);
 await c.importFromLink();assert.equal(synced,raw(id));assert.equal(S.songs[0].id,'kept');assert.equal(reset,0);
 c.preview='active-preview';S.src=raw(other);await c.importFromLink();assert.equal(synced,raw(other));
});
