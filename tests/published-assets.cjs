'use strict';
// Read-only verification of the existing site. No user data or credentials.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base='https://gogojoe312-max.github.io/utacheck/';
const paths=['index.html','app.js','sw.js','operation-progress.js','manifest.webmanifest','startup/iphone-1206x2622.png','recovery-delivery.js','ui.js','ui.css','absence-changes.js','private-preparation-source.js','private-preparation-ui.js'];
const hash=content=>createHash('sha256').update(content).digest('hex');
(async()=>{
 const expected=new Map(paths.map(path=>[path,hash(fs.readFileSync(require('node:path').join(__dirname,'..',path)))]));
 let last=[];
 for(let attempt=0;attempt<45;attempt++){
  last=await Promise.all(paths.map(async path=>{
   try{const response=await fetch(base+path+'?verify='+Date.now(),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200);const actual=hash(Buffer.from(await response.arrayBuffer()));
    return {path,match:actual===expected.get(path),sha256:actual};
   }catch(error){return {path,match:false,error:error.name};}
  }));
  if(last.every(item=>item.match)){console.log(JSON.stringify({publishedAssetsVerified:true,files:last}));return;}
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
 console.error(JSON.stringify({publishedAssetsVerified:false,files:last}));process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
