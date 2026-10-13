const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('offline code prefers current cache and preserves older caches; live update checks do not fall back',async()=>{
 const events={},calls=[],old={body:'old code'},current={body:'current code'},c=vm.createContext({URL,Response:{error:()=>({error:true})},self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>events[name]=fn},fetch:async()=>{throw Error('offline')},caches:{open:async name=>{calls.push(['open',name]);return{match:async()=>current}},match:async()=>{calls.push(['old-match']);return old}}});vm.runInContext(fs.readFileSync(__dirname+'/../sw.js','utf8'),c);
 let response;events.fetch({request:{method:'GET',url:'https://example.test/app.js?v=16.41.58.5',mode:'cors'},respondWith:p=>response=p});assert.equal(await response,current);assert.equal(calls.some(x=>x[0]==='old-match'),false);
 events.fetch({request:{method:'GET',url:'https://example.test/index.html?app-update-check=123',mode:'cors'},respondWith:p=>response=p});await assert.rejects(response,/offline/);assert.equal(calls.some(x=>x[0]==='old-match'),false);
});
