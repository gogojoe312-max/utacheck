'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {wordImportProof}=require('../scripts/prepare-recording-word-proof.cjs'),{wordFixture}=require('./recording-word-plan-browser-helper.cjs');
test('private Word proof uses actual application parsing, full source body and immutable byte identity',async()=>{
 const bytes=wordFixture(),before=Buffer.from(bytes),proof=await wordImportProof(bytes,'合成Word曲.docx');
 assert.deepEqual(bytes,before);assert.equal(proof.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(proof.title,'合成Word曲');assert.equal(proof.cols,2);assert.equal(proof.lines.length,63);
 assert.deepEqual(proof.lines,Array.from({length:63},(_,i)=>'合成の原文'+i+'をそのまま保持します'));assert.equal(proof.parser,'utacheck-word-v1');assert.equal(proof.perLine,23);
});
test('an invalid Word file never produces source-link evidence',async()=>{await assert.rejects(()=>wordImportProof(Buffer.from('not a Word document'),'invalid.docx'));});
