/* Match an entire source arrangement before changing display metadata. No I/O. */
(function(root){
 'use strict';
 const canonical=song=>JSON.stringify((song.lines||[]).filter(line=>String(line.t||'').trim())
  .map(line=>[String(line.lcell||''),String(line.t||''),String(line.labelRaw??line.raw??line.label??'')]));
 const digest=async(value,cryptoProvider=root.crypto)=>[...new Uint8Array(await cryptoProvider.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 async function plan(song,catalog,cryptoProvider=root.crypto){
  if(!Array.isArray(song?.lines))return null;
  const count=song.lines.filter(line=>String(line.t||'').trim()).length;
  const candidates=catalog.filter(rule=>rule.sheetName===song.sheetName&&rule.rowCount===count);
  if(!candidates.length)return null;
  const content=canonical(song),fingerprint=await digest(content,cryptoProvider);
  const matches=candidates.filter(rule=>rule.fingerprint===fingerprint);
  if(!matches.length)return null;
  if(matches.length!==1)throw Error('ARRANGEMENT_AMBIGUOUS');
  const rule=matches[0],indices=[];
  for(const cell of rule.cutCells){
   const found=song.lines.flatMap((line,i)=>line.lcell===cell?[i]:[]);
   // Blank separators were not preserved consistently by old imports. They
   // have no lyric to hide. A duplicate address must never be guessed.
   if(found.length>1)throw Error('ARRANGEMENT_CELL_AMBIGUOUS');
   if(found.length)indices.push(found[0]);
  }
  const sourceCuts=new Set(rule.sourceCutCells||[]),selected=new Set(indices);
  const lines=song.lines.map((line,i)=>selected.has(i)?{...line,cut:1,sourceCut:sourceCuts.has(line.lcell)}:line);
  return {rule,content,indices,lines,changed:indices.some(i=>song.lines[i].cut!==1||song.lines[i].sourceCut!==lines[i].sourceCut)};
 }
 function audit(song,planned,rendered=[]){
  const identity=canonical(song)===planned.content;
  const missing=planned.indices.filter(i=>!song.lines[i]?.cut);
  const shown=new Set(rendered),visible=planned.indices.filter(i=>shown.has(i));
  return {identity,missing,visible,ok:identity&&!missing.length&&!visible.length};
 }
 const api={canonical,digest,plan,audit};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ArrangementVerification=api;
})(typeof globalThis!=='undefined'?globalThis:this);
