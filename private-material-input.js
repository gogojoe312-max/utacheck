/* Dot-side/file-consumer adapter. Produces a reviewable operation only; never
 * edits state, writes prepared.json, publishes, or creates identity records. */
(function(root){
 'use strict';
 const fail=(code,detail)=>{throw Object.assign(new Error(code),{preparationCode:code,detail});};
 const clone=value=>JSON.parse(JSON.stringify(value));
 async function prepare({current,file,binding,parse,digest,sourceRevision,expectedSourceSha,cryptoProvider=root.crypto}){
  if(!binding||!['live','recording'].includes(binding.scope)||!binding.songId||!binding.groupId)fail('TARGET_REQUIRED');
  if(!/^[a-f0-9]{40}$/.test(expectedSourceSha||'')||typeof sourceRevision!=='string'||!sourceRevision.trim())fail('SOURCE_REQUIRED');
  const list=current[binding.scope==='live'?'songs':'rsongs']||[],targets=list.filter(song=>song.id===binding.songId);
  if(targets.length!==1)fail('TARGET_REQUIRED',{songId:binding.songId});
  const song=targets[0],before=JSON.stringify(current),bytes=new Uint8Array(await file.arrayBuffer());
  const fileHash=[...new Uint8Array(await cryptoProvider.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const parsed=await parse({name:file.name,arrayBuffer:async()=>bytes.buffer});
  if(JSON.stringify(current)!==before)fail('SOURCE_CHANGED');
  if(parsed.title!==song.title)fail('VERSION_CONFIRMATION_REQUIRED',{file:file.name,expectedTitle:song.title,parsedTitle:parsed.title});
  if(!Array.isArray(parsed.lines)||parsed.lines.length!==song.lines.length)fail('LINE_IDENTITY_CONFIRMATION_REQUIRED',{file:file.name,songId:song.id});
  for(const [label,names] of Object.entries(parsed.groups||{})) {
   const expected=(song.blocks||{})[label]||[];
   const currentNames=expected.map(id=>(current.members||[]).find(m=>m.id===id)?.name);
   if(JSON.stringify(names)!==JSON.stringify(currentNames))fail('ASSIGNMENT_GROUP_CONFIRMATION_REQUIRED',{file:file.name,songId:song.id,label});
  }
  const lines=parsed.lines.map((row,i)=>{
   const original=song.lines[i],line=clone(original),text=Array.isArray(row)?row[1]:row.t,label=Array.isArray(row)?row[0]:row.labelRaw||row.raw||row.label||'';
   if(typeof text!=='string')fail('INVALID_INPUT');line.t=text;
   if(label && label!=='→' && label!==(original.labelRaw||original.raw||original.label||'')){
    const parts=(label==='全'||/^zenn$/i.test(label))?song.roster:binding.assignments?.[label];
    if(!Array.isArray(parts))fail('ASSIGNMENT_CONFIRMATION_REQUIRED',{file:file.name,songId:song.id,label});
    line.parts=parts.slice();line.main=parts.slice();line.extra=[];line.label=label;line.labelRaw=label;line.raw=label;
   }
   return line;
  });
  const packet={app:'utacheck-material-update',version:1,scope:binding.scope,groupId:binding.groupId,songId:song.id,expectedTitle:song.title,beforeLines:clone(song.lines),afterLines:lines,
   source:{revision:sourceRevision,files:[{name:file.name,sha256:fileHash}]}};
  if(binding.scope==='live')packet.showId=binding.showId;
  const sha256=await digest(packet,cryptoProvider);
  const operation={id:'material-'+sha256,type:'material-update',sha256,packet};
  return {expectedSourceSha,operation};
 }
 function append(existing,candidate){
  if(!existing||existing.app!=='utacheck-private-preparation'||existing.version!==1||!Array.isArray(existing.operations)||!candidate?.operation||!/^[a-f0-9]{40}$/.test(candidate.expectedSourceSha||''))fail('INVALID_INPUT');
  const operation=candidate.operation,prior=existing.operations.filter(op=>op.id===operation.id);
  if(prior.length){if(prior.length!==1||JSON.stringify(prior[0])!==JSON.stringify(operation))fail('OPERATION_ID_REUSED');return {expectedSourceSha:candidate.expectedSourceSha,manifest:clone(existing),status:'already-present'};}
  const manifest=clone(existing);manifest.operations.push(clone(operation));manifest.revision='material-'+operation.sha256.slice(0,24);
  return {expectedSourceSha:candidate.expectedSourceSha,manifest,status:'prepared'};
 }
 const api=Object.freeze({prepare,append});if(typeof module==='object'&&module.exports)module.exports=api;root.PrivateMaterialInput=api;
})(typeof globalThis==='object'?globalThis:this);
