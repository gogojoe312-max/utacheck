'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const a=source.indexOf('async function verifyPublicationSnapshot('),b=source.indexOf('function payloadKey(',a);
function fixture(previous){
 const requests=[],state={shows:[{id:'old'}],songs:[{id:'song',showId:'old'}],notes:[{id:'note',memo:'本人編集'}],recs:{audio:{size:123}},key:''};
 const c=vm.createContext({S:state,JSON,Set,Error,gh:async(path,opts)=>{requests.push({path,opts});return {files:{'utacheck.json':{content:JSON.stringify(previous)}}};},gistRawSource:()=>null,boundedPublicationRequest:()=>{throw Error('unexpected raw');},openJSON:()=>{throw Error('unexpected decrypt');}});
 vm.runInContext(source.slice(a,b),c);return {c,state,requests,g:{gistId:'a'.repeat(32)},run:()=>c.verifyPublicationSnapshot({gistId:'a'.repeat(32)},{songs:[]},()=>{})};
}
test('a stale device cannot replace published shows missing from its local state; annotations and audio stay untouched',async()=>{
 const f=fixture({shows:[{id:'old'},{id:'new-phone-show'}],songs:[{showId:'old'},{showId:'new-phone-show'}]}),before=JSON.stringify(f.state);
 await assert.rejects(f.run(),e=>e.code==='PUBLICATION_SOURCE_INCOMPLETE');assert.equal(JSON.stringify(f.state),before);assert.equal(f.requests.length,1);assert.equal(f.requests[0].opts,undefined);
});
test('known local shows can publish, without changing local data or inventing a remote baseline',async()=>{
 const f=fixture({shows:[{id:'old'}],songs:[{showId:'old'}]}),before=JSON.stringify(f.state);await f.run();assert.equal(JSON.stringify(f.state),before);
});
test('legacy publication song show IDs also protect missing performances',async()=>{
 const f=fixture({songs:[{showId:'new-phone-show'}]});await assert.rejects(f.run(),/この端末にない配信済み公演/);
});
test('source read failure and changed destination abort before any publication',async()=>{
 const f=fixture({songs:[]});f.c.gh=async()=>{throw Error('read failed');};await assert.rejects(f.run(),/read failed/);
 const g=fixture({songs:[]});await assert.rejects(g.c.verifyPublicationSnapshot(g.g,{},()=>{throw Error('target changed');}),/target changed/);
});
test('explicit sends use the same preservation preflight before constructing a PATCH body',()=>{
 const start=source.indexOf('async function gistPush('),end=source.indexOf('// 送りすぎるとGitHub',start),body=source.slice(start,end);
 assert(body.indexOf('await verifyPublicationSnapshot(g, d, checkTarget)')<body.indexOf('const body = JSON.stringify'));
 assert(!body.includes('force && verifyPublicationSnapshot'));
});
