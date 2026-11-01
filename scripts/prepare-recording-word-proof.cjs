'use strict';
// Offline evidence for the app's own Word import. No network, state edits,
// publication or title-based matching. Keep the generated proof private.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createHash}=require('node:crypto');
const XLSX=require('../vendor/xlsx.full.min.js');
async function wordImportProof(bytes,name){
 const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context=vm.createContext({XLSX,Uint8Array,DataView,TextDecoder,Date,uid:()=> 'proof-only',NAMECELL:/^[A-Z]$/});
 const clean=source.split('\n').find(line=>line.startsWith('const cleanName = '));if(!clean)throw Error('Word name parser missing');vm.runInContext(clean,context);
 for(const name of ['cleanText','softText','wordParagraphText','parseLegacyDoc','parseDocx']){
  const start=source.indexOf('function '+name+'(');if(start<0)throw Error('Word parser missing');
  vm.runInContext(source.slice(source.lastIndexOf('\n',start)+1,source.indexOf('\n}',start)+2),context);
 }
 const so=await context.parseDocx({name,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
 if(![so.cols,so.perLine,so.rowsPerCol].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Unsupported Word layout');
 return {app:'utacheck-word-import',version:1,parser:'utacheck-word-v1',sha256:createHash('sha256').update(bytes).digest('hex'),title:so.title,cols:so.cols,perLine:so.perLine,rowsPerCol:so.rowsPerCol,lines:Array.from(so.lines).filter(l=>!l.gap&&l.t.trim()).map(l=>l.t)};
}
async function main(args){
 if(args.length!==3)throw Error('Usage: node scripts/prepare-recording-word-proof.cjs PRIVATE_WORD ORIGINAL_FILENAME PRIVATE_OUTPUT');
 const [input,name,output]=args;if(path.resolve(input)===path.resolve(output))throw Error('Preserve the original');
 const proof=await wordImportProof(fs.readFileSync(input),name);fs.writeFileSync(output,JSON.stringify(proof),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({created:true,sha256:proof.sha256,rows:proof.lines.length,columns:proof.cols,published:false}));
}
module.exports={wordImportProof};if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
