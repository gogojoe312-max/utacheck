'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {executeChecks,validatePreflight}=require('../scripts/release-gate.cjs');
test('a failed or interrupted check stops the release gate before any later checks',()=>{
 for(const status of [1,null]){
  const seen=[];assert.throws(()=>executeChecks('pre',name=>{seen.push(name);return name==='chromium'?status:0;}),/chromium/);
  assert.deepEqual(seen,['behavior','chromium']);
 }
});
test('public verification cannot borrow an old, partial or failed preflight receipt',()=>{
 const good={revision:'a',stage:'pre',passed:true,checks:['behavior','chromium','webkit']};
 validatePreflight(good,'a');
 for(const bad of [{...good,revision:'old'},{...good,passed:false},{...good,checks:['behavior']},{...good,stage:'post'},null])assert.throws(()=>validatePreflight(bad,'a'));
 assert.throws(()=>executeChecks('other',()=>0));
});
