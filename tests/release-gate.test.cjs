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
const {successfulRun}=require('../scripts/publish-verified.cjs');
test('publication cannot use another commit, branch, skipped or failed candidate run',()=>{
 const good={id:1,head_sha:'a',head_branch:'candidate',name:'Verify and publish',event:'push',status:'completed',conclusion:'success'};
 assert.equal(successfulRun([good],'a','candidate'),good);
 for(const bad of [{...good,head_sha:'old'},{...good,head_branch:'main'},{...good,event:'pull_request'},{...good,status:'in_progress'}])assert.equal(successfulRun([bad],'a','candidate'),null);
 for(const conclusion of ['failure','cancelled','skipped','timed_out'])assert.throws(()=>successfulRun([{...good,conclusion}],'a','candidate'));
});
