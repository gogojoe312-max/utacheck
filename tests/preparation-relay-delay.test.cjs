'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(process.env.QA_RELAY_SOURCE||__dirname+'/../preparation-relay-source.js','utf8');
const owner='gogojoe312-max',repo='shinkou-data',token='synthetic-delay-token';
const ready={status:'ready',manifest:{app:'utacheck-private-preparation',version:1,owner,operations:[]},sourceSha:'a'.repeat(40),sourcePath:'utacheck/prepared.json'};
function setup(fetch){
 let now=0,next=0,result;const timers=new Map(),phases=[],calls=[];
 const timeout=(fn,ms)=>{const id=++next;timers.set(id,{at:now+ms,fn});return id;};
 const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
 const advance=async ms=>{const end=now+ms;await flush();while(true){const hit=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!hit)break;timers.delete(hit[0]);now=hit[1].at;hit[1].fn();await flush();}now=end;await flush();};
 const delay=(ms,signal)=>new Promise((resolve,reject)=>{const id=timeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms),abort=()=>{timers.delete(id);reject(Error('aborted'));};signal?.addEventListener('abort',abort,{once:true});});
 class ClockDate extends Date{static now(){return now;}}
 const c={AbortController,Response,ReadableStream,Uint8Array,TextDecoder,Date:ClockDate,setTimeout:timeout,clearTimeout:id=>timers.delete(id),fetch:async(url,init)=>{calls.push({url,init});return fetch({call:calls.length,init,delay,now:()=>now});}};vm.createContext(c);vm.runInContext(script,c);
 const begin=(extra={})=>{c.PreparationRelaySource.read({owner,repo,token,onProgress:p=>phases.push(p.phase),...extra}).then(r=>result=r);};
 return {begin,advance,delay,calls,phases,get result(){return result;},get pendingTimers(){return timers.size;}};
}
test('a 35-second server response reaches receipt instead of the screenshot TIMEOUT at 30 seconds',async()=>{
 const f=setup(async({init,delay})=>{await delay(35000,init.signal);return new Response(JSON.stringify(ready));});f.begin();await f.advance(31000);assert.equal(f.result,undefined,'still waiting, without the TIMEOUT error');assert(f.phases.includes('waiting'));await f.advance(5000);assert.equal(f.result?.status,'ready');assert.equal(f.calls.length,1);assert.equal(f.pendingTimers,0);
});
test('a first response deadline automatically retries the same authenticated endpoint and receives the schedule',async()=>{
 const f=setup(async({call,init,delay})=>{if(call===1)await delay(200000,init.signal);return new Response(JSON.stringify(ready));});f.begin();await f.advance(92000);assert.equal(f.result?.status,'ready');assert.equal(f.calls.length,2);assert(f.phases.includes('retrying'));for(const c of f.calls){assert.equal(c.url,'https://shinkou-secure.onrender.com/utacheck/prepared');assert.equal(c.init.headers.Authorization,'Bearer '+token);assert.equal(c.init.credentials,'omit');assert.equal(c.init.method,'GET');}assert.equal(f.pendingTimers,0);
});
test('a stalled response body is bounded and retried even if its stream ignores abort',async()=>{
 const f=setup(async({call})=>call===1?new Response(new ReadableStream({start(){}})):new Response(JSON.stringify(ready)));f.begin();await f.advance(32000);assert.equal(f.result?.status,'ready');assert.equal(f.calls.length,2);assert.equal(f.pendingTimers,0);
});
test('network and temporary server failures retry, but identity, configuration and invalid payload failures do not',async()=>{
 for(const mode of ['network','server','proxy','identity','config','invalid']){
  const f=setup(async({call})=>{if(call>1)return new Response(JSON.stringify(ready));if(mode==='network')throw Error(token);if(mode==='proxy')return new Response('Starting up',{status:503});if(mode==='server')return new Response('{}',{status:504});if(mode==='identity')return new Response(JSON.stringify({code:'HTTP_401'}),{status:401});if(mode==='config')return new Response(JSON.stringify({code:'RELAY_NOT_CONFIGURED'}),{status:503});return new Response('{}');});f.begin();await f.advance(2000);assert.equal(f.calls.length,['network','server','proxy'].includes(mode)?2:1,mode);assert.equal(f.result?.status,['network','server','proxy'].includes(mode)?'ready':'unavailable',mode);assert(!JSON.stringify(f.result).includes(token));assert.equal(f.pendingTimers,0);
 }
});
test('total wait stays bounded; cancellation and obsolete owner state stop retrying without leaking credentials',async()=>{
 const slow=setup(async()=>new Promise(()=>{}));slow.begin();await slow.advance(181000);assert.equal(slow.result?.code,'TIMEOUT');assert.equal(slow.calls.length,2);assert.equal(slow.pendingTimers,0);
 for(const mode of ['abort','inactive']){
  const controller=new AbortController();let active=true;const f=setup(async({init,delay})=>{await delay(35000,init.signal);return new Response(JSON.stringify(ready));});f.begin({signal:controller.signal,isActive:()=>active});await f.advance(31000);if(mode==='abort')controller.abort();else active=false;await f.advance(5000);assert.equal(f.result?.code,mode==='abort'?'ABORTED':'INACTIVE');assert.equal(f.calls.length,1);assert.equal(f.pendingTimers,0);
 }
});

test('a slowly transferring manifest keeps its inactivity allowance without a 30-second total cutoff',async()=>{
 const f=setup(async({delay})=>{const bytes=new TextEncoder().encode(JSON.stringify(ready)),mid=Math.floor(bytes.length/2);return new Response(new ReadableStream({async start(c){await delay(20000);c.enqueue(bytes.slice(0,mid));await delay(20000);c.enqueue(bytes.slice(mid));c.close();}}));});f.begin();await f.advance(41000);assert.equal(f.result?.status,'ready');assert.equal(f.calls.length,1);assert.equal(f.pendingTimers,0);
});
