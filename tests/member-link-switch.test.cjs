'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
const fn=name=>{const at=source.indexOf('function '+name+'(');assert(at>=0);return source.slice(at,source.indexOf('\n}',at)+2);};
test('the actual duplicate date picker distinguishes absence versions and 20/26 song sets without removing records',()=>{
 const shows=[['o25a','10/25',26,['m','short']],['o25','10/25',26,[]],['o2425a','10/24.25',27,['m']],['o2425','10/24.25',46,[]],['o24','10/24',26,[]],['o24s','10/24',20,[]]].map(([id,name,count,absent])=>({id,name,count,absent,folder:'Original CHAracter'}));
 const S={shows,groupId:'g',songs:shows.flatMap(sw=>Array.from({length:sw.count},(_,i)=>({id:sw.id+i,showId:sw.id,groupId:'g',lines:[{t:'保持する元歌詞'}]}))),notes:[{memo:'保持する指摘'}]};const c={S,U:{},VIEW:()=>true,h:String,member:id=>({name:id==='short'?'北':'北原'}),summaryShows:()=>shows};vm.createContext(c);
 for(const name of ['performanceDateOrder','performanceSelectionOrder','performanceFolderGroups','absentVersionNames','summaryShowPicker'])vm.runInContext(fn(name),c);
 const before=JSON.stringify(S),html=c.summaryShowPicker();const labels=[...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(x=>x[1]);assert.deepEqual(labels,['全公演をまとめる','10/25（北原欠席）','10/25（通常）','10/24.25（北原欠席）','10/24.25（通常）','10/24（26曲）','10/24（20曲）']);assert.equal(JSON.stringify(S),before);assert.equal(S.shows.length,6);assert.equal(S.songs.length,171);
});
for(const stage of ['response','body'])test('a late previous-source '+stage+' cannot return Rosie under the OCHA link or overwrite receipt metadata',async()=>{
 const c={S:{src:'https://example.test/rosie',key:'',syncAt:1},Date,srcUrl:()=>c.S.src,startupCanCommunicate:()=>true};vm.createContext(c);const at=source.indexOf('let syncErr =');vm.runInContext(source.slice(at,source.indexOf('// 受け取り専用',at)),c);
 let release,started;const ready=new Promise(r=>started=r),old={groupName:'ロージークロニクル',songs:[{}]},next={groupName:'OCHA NORMA',songs:[{}]};c.fetch=async url=>{if(url.startsWith('https://example.test/rosie')){if(stage==='response')return new Promise(r=>{release=()=>r({ok:true,json:async()=>old});started();});return {ok:true,json:()=>new Promise(r=>{release=()=>r(old);started();})};}return {ok:true,json:async()=>next};};
 const pending=c.fetchSetlist();await ready;c.S.src='https://example.test/ocha';assert.equal((await c.fetchSetlist()).groupName,'OCHA NORMA');const metadata=c.S.syncAt;release();assert.equal(await pending,null,'A stale previous group must never reach applySetlist');assert.equal(c.S.syncAt,metadata);
});

for(const same of [false,true])test('pasting a '+(same?'current':'different')+' member URL starts exactly one receive',async()=>{
 let hash=same?'#g=new':'#g=old',queued=[],receives=0;const c={prompt:()=> 'https://app.test/#g=new',render(){},importFromLink:async()=>{receives++;},location:{get hash(){return hash;},set hash(value){if(value!==hash){hash=value;queued.push(()=>c.onHash());}}},window:{addEventListener(name,handler){if(name==='hashchange')c.onHash=handler;}},alert(){}};vm.createContext(c);
 const at=source.indexOf('window.addEventListener("hashchange"');vm.runInContext(source.slice(at,source.indexOf('\n});',at)+4),c);
 const start=source.indexOf('    case "pastelink": {');await vm.runInContext('(async()=>{switch("pastelink"){'+source.slice(start,source.indexOf('    case "askkey":',start))+'}})()',c);for(const work of queued)await work();assert.equal(hash,'#g=new');assert.equal(receives,1,'The hashchange handler and explicit paste action must not both receive the same source');
});
