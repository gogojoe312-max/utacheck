'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
const fn=name=>{const at=source.indexOf('function '+name+'(');assert(at>=0);return source.slice(at,source.indexOf('\n}',at)+2);};
test('the member picker lists each same-folder performance once while preserving all source versions',()=>{
 const shows=[['o25a','10/25',26,['m','short']],['o25','10/25',26,[]],['o2425a','10/24.25',27,['m']],['o2425','10/24.25',46,[]],['o24','10/24',26,[]],['o24s','10/24',20,[]]].map(([id,name,count,absent])=>({id,name,count,absent,folder:'Original CHAracter'}));
 shows.push({id:'other-folder',name:'10/25',count:1,absent:[],folder:'自分で作った別フォルダ'});
 const S={shows,groupId:'g',songs:shows.flatMap(sw=>Array.from({length:sw.count},(_,i)=>({id:sw.id+i,showId:sw.id,groupId:'g',lines:[{t:'保持する元歌詞'}]}))),notes:[{memo:'保持する指摘'}]};const c={S,U:{},VIEW:()=>true,h:String,member:id=>({name:id==='short'?'北':'北原'}),showsNewestFirst:()=>shows};vm.createContext(c);
 for(const name of ['performanceDateOrder','performanceSelectionOrder','performanceFolderGroups','absentVersionNames','memberPerformanceGroups','memberAvailableShows','summaryShows','summaryShowPicker'].filter(name=>source.includes('function '+name+'(')))vm.runInContext(fn(name),c);
 const before=JSON.stringify(S),html=c.summaryShowPicker();const labels=[...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(x=>x[1]);assert.deepEqual(labels,['全公演をまとめる','10/25','10/24.25','10/24','10/25']);assert.equal(JSON.stringify(S),before);assert.deepEqual([...html.matchAll(/<optgroup label="([^"]*)">([\s\S]*?)<\/optgroup>/g)].map(x=>[x[1],[...x[2].matchAll(/value="([^"]*)"/g)].map(v=>v[1])]),[['Original CHAracter',['o25a','o2425a','o24']],['自分で作った別フォルダ',['other-folder']]]);assert.equal(S.shows.length,7);assert.equal(S.songs.length,172);
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

test('the sender focus selects the current same-name version without mutating sources or combining different folders',()=>{
 const c={S:{memberSourceFocusShow:'normal'},U:{},VIEW:()=>true},shows=[{id:'normal',name:'10/25',folder:'Original CHAracter',ts:1,absent:[]},{id:'absence',name:'10/25',folder:'Original CHAracter',ts:2,absent:['北原']},{id:'other',name:'10/25',folder:'自分で作った別フォルダ',ts:3}];vm.createContext(c);if(!source.includes('function memberPerformanceGroups('))return assert.fail('The previous picker cannot resolve an active performance version');vm.runInContext(fn('memberPerformanceGroups'),c);
 const before=JSON.stringify(shows);assert.deepEqual(JSON.parse(JSON.stringify(c.memberPerformanceGroups(shows).map(row=>row.show.id))),['normal','other']);c.S.memberSourceFocusShow='';assert.deepEqual(JSON.parse(JSON.stringify(c.memberPerformanceGroups(shows).map(row=>row.show.id))),['absence','other']);assert.equal(JSON.stringify(shows),before);
});
