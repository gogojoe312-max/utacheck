'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const A=require('../arrangement-verification.js');
async function fixture(){
 const song={id:'song',sheetName:'Sheet',lines:[{lcell:'B1',t:'Synthetic first',labelRaw:'A',parts:['one']},{lcell:'B2',t:'Synthetic cut',labelRaw:'B',parts:['two']},{lcell:'B3',t:'Synthetic last',labelRaw:'A',parts:['one']}]};
 const rule={id:'synthetic',sheetName:'Sheet',rowCount:3,fingerprint:await A.digest(A.canonical(song),webcrypto),cutCells:['B2'],sourceCutCells:[]};
 return {song,rule};
}
test('offline cut plan requires exact lyrics, cells and source singer labels, never a title match',async()=>{
 const {song,rule}=await fixture(),before=JSON.stringify(song),planned=await A.plan(song,[rule],webcrypto);
 assert.deepEqual(planned.indices,[1]);assert.equal(planned.lines[1].cut,1);assert.equal(planned.lines[1].sourceCut,false);assert.equal(JSON.stringify(song),before);
 for(const [field,value]of [['t','Different lyric'],['lcell','B9'],['labelRaw','C']]){
  const other=structuredClone(song);other.lines[1][field]=value;assert.equal(await A.plan(other,[rule],webcrypto),null);
 }
 assert.equal(await A.plan({...song,sheetName:'Other'},[rule],webcrypto),null);
 assert(await A.plan({...song,title:'Renamed title'},[rule],webcrypto));
});
test('audit rejects memory-only success, stale DOM and a changed source identity',async()=>{
 const {song,rule}=await fixture(),planned=await A.plan(song,[rule],webcrypto);
 assert.equal(A.audit(song,planned).ok,false);
 const applied={...song,lines:planned.lines};assert.equal(A.audit(applied,planned,[0,2]).ok,true);
 assert.deepEqual(A.audit(applied,planned,[0,1,2]).visible,[1]);assert.equal(A.audit(applied,planned,[0,1,2]).ok,false);
 const edited=structuredClone(applied);edited.lines[0].t='Changed';assert.equal(A.audit(edited,planned).identity,false);
});
test('source gray cuts and explicit display cuts retain distinct original Excel metadata',async()=>{
 const {song,rule}=await fixture();rule.sourceCutCells=['B2'];
 const planned=await A.plan(song,[rule],webcrypto);assert.equal(planned.lines[1].sourceCut,true);
 assert.deepEqual(planned.lines.map(l=>[l.t,l.lcell,l.parts]),song.lines.map(l=>[l.t,l.lcell,l.parts]));
 assert.equal((await A.plan({...song,lines:planned.lines},[rule],webcrypto)).changed,false);
});
test('ambiguous rules and duplicate original addresses are refused',async()=>{
 const {song,rule}=await fixture();await assert.rejects(A.plan(song,[rule,{...rule,id:'other'}],webcrypto),/AMBIGUOUS/);
 song.lines[0].lcell='B2';rule.fingerprint=await A.digest(A.canonical(song),webcrypto);
 await assert.rejects(A.plan(song,[rule],webcrypto),/CELL_AMBIGUOUS/);
});
test('shipped catalog contains fingerprints and addresses without source lyrics or user credentials',()=>{
 const rules=require('../arrangement-catalog.js');assert.equal(rules.length,7);
 for(const rule of rules){assert.match(rule.fingerprint,/^[a-f0-9]{64}$/);assert(rule.cutCells.length>0);assert(rule.cutCells.every(c=>/^[A-Z]+[1-9]\d*$/.test(c)));
  assert.deepEqual(Object.keys(rule).sort(),['id','sheetName','rowCount','fingerprint','cutCells','sourceCutCells'].sort());}
});
