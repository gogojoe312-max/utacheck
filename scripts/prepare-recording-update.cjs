'use strict';
// Offline authoring only. Original private queue is never overwritten. dot
// publishes the reviewed output with the existing GitHub Contents API blob CAS.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const P=require('../private-preparation.js'),U=require('../recording-preparation-update.js');
const clone=v=>JSON.parse(JSON.stringify(v)),digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function prepare(manifest,request){
 const stream=manifest.operations.filter(op=>op.type==='recording-update'&&op.packet.sessionId===request.sessionId);
 const superseded=new Set(stream.map(op=>op.packet.supersedes?.id).filter(Boolean)),heads=stream.filter(op=>!superseded.has(op.id)).sort((a,b)=>a.packet.revision-b.packet.revision);
 const replacement=request.supersedesId?stream.find(op=>op.id===request.supersedesId):null;
 if(request.supersedesId&&!replacement)throw Error('Held operation not found');
 let head=request.previousId?stream.find(op=>op.id===request.previousId):heads.at(-1);
 if(request.previousId&&!head)throw Error('Explicit previous update not found');
 const anchor=manifest.operations.find(op=>op.id===request.anchorId&&['recording-addition','recording-song'].includes(op.type));
 if(!anchor)throw Error('The explicit original anchor was not found');
 if(!replacement&&!request.previousId&&heads.some((op,i)=>op.packet.revision!==i+1))throw Error('Version chain is incomplete or ambiguous; select the reported previousId');
 const ref=op=>{if(!op)throw Error('Explicit predecessor not found');return {id:op.id,sha256:op.sha256};},revision=replacement?.packet.revision||((head?.packet.revision||0)+1);
 const packet={app:'utacheck-recording-update',version:1,sessionId:request.sessionId,revision,groupId:request.groupId,timezone:request.timezone,anchor:ref(anchor),previous:replacement?clone(replacement.packet.previous):ref(head||((request.bootstrap||[]).length?manifest.operations.find(op=>op.id===request.bootstrap.at(-1).id):anchor)),before:clone(replacement?.packet.before||head?.packet.after||request.before||U.snapshot(anchor)),after:clone(request.after),source:clone(request.source)};
 if(replacement)packet.supersedes=ref(replacement);
 for(const field of ['bootstrap','members','lineMaps'])if(request[field]!==undefined)packet[field]=clone(request[field]);
 U.validate(packet);if(!head&&!replacement&&!packet.bootstrap?.length&&!U.equal(packet.before,U.snapshot(anchor)))throw Error('Initial before must be the original source');
 const operation={id:request.operationId||request.sessionId+'-update-'+revision,type:'recording-update',packet,sha256:digest(packet)};
 if(manifest.operations.some(op=>op.id===operation.id))throw Error('Operation ID already exists');
 return {...clone(manifest),revision:'dot-rec-'+operation.id,createdAt:new Date().toISOString(),operations:[...clone(manifest.operations),operation]};
}
async function main(args){
 const get=key=>{const i=args.indexOf(key);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+key);return args[i+1];};
 const source=JSON.parse(fs.readFileSync(get('--manifest'),'utf8'));await P.validate(source,'gogojoe312-max');
 const request=JSON.parse(fs.readFileSync(get('--request'),'utf8')),result=prepare(source,request);await P.validate(result,'gogojoe312-max');
 const output=path.resolve(get('--output'));if(output===path.resolve(get('--manifest')))throw Error('Use a different output; preserve the original queue');
 fs.writeFileSync(output,JSON.stringify(result),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({output,operationId:result.operations.at(-1).id,revision:result.operations.at(-1).packet.revision,sha256:result.operations.at(-1).sha256,published:false}));
}
module.exports={prepare};if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(e.preparationCode||e.message);process.exitCode=1;});
