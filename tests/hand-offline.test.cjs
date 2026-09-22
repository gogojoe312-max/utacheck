const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
function setup({offline=false,status=200}={}){
 const events={},puts=[],matches=[];
 const c=vm.createContext({URL,Response,self:{location:{origin:'https://test.example'},addEventListener:(type,handler)=>events[type]=handler},
  fetch:async()=>{if(offline)throw new Error('offline');return new Response('body',{status});},
  caches:{open:async()=>({put:(req,res)=>{puts.push(req.url);return Promise.resolve();}}),
   match:async req=>{matches.push(req);return req==='./index.html'?new Response('APP HTML'):undefined;}},
 });vm.runInContext(source,c);
 return {c,puts,matches,async request(file,mode='cors'){let promise;events.fetch({request:{method:'GET',url:'https://test.example/'+file,mode},respondWith:p=>promise=p});return promise;}};
}
test('offline non-navigation assets fail rather than returning app HTML; navigation keeps its fallback',async()=>{
 const s=setup({offline:true});const script=await s.request('hand-model-worker.js');
 assert.equal(script.type,'error');assert(!s.matches.includes('./index.html'));
 const navigation=await s.request('index.html','navigate');assert.equal(await navigation.text(),'APP HTML');
});
test('HTTP errors cannot poison the handwriting vendor cache',async()=>{
 const s=setup({status:503});const response=await s.request('vendor/handwriting/char_classifier.onnx');
 assert.equal(response.status,503);await new Promise(resolve=>setImmediate(resolve));assert.equal(s.puts.length,0);
});
test('core offline assets exist and the optional large model is not downloaded during installation',()=>{
 const s=setup();const assets=vm.runInContext('ASSETS',s.c);
 for(const file of assets)assert(fs.existsSync(path.join(root,file)),file);
 assert(assets.includes('./hand-model-worker.js'));assert(assets.includes('./hand-model.js'));
 assert(!assets.some(file=>/\.onnx$|\.wasm$|ort\.wasm/.test(file)));
});
