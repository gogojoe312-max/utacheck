/* Owner-only prepared changes. Data stays in the authenticated private source.
 * Every operation has an immutable content hash and a local receipt. Never
 * replace the editor, alter sharing, or infer a schedule/lyric assignment. */
(function(root){
 'use strict';
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const bad=new Set(['__proto__','constructor','prototype']);
 const secrets=new Set(['ghToken','bkKey','bkGistId','editPass','token','password','secret','credentials','gistId','src','key','deliveryGroupId','deliveryMode']);
 const fail=code=>{throw Object.assign(new Error(code),{preparationCode:code});};
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(v)&&!bad.has(v);
 function check(value,depth=0){
  if(depth>60)fail('INVALID_MANIFEST');
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
  if(!value||typeof value!=='object')fail('INVALID_MANIFEST');
  const p=Object.getPrototypeOf(value);if(!Array.isArray(value)&&p!==null&&Object.getPrototypeOf(p)!==null)fail('INVALID_MANIFEST');
  for(const k of Reflect.ownKeys(value)){if(Array.isArray(value)&&k==='length')continue;
   const d=Object.getOwnPropertyDescriptor(value,k);
   if(typeof k!=='string'||bad.has(k)||!d.enumerable||!own(d,'value'))fail('INVALID_MANIFEST');
   if(Array.isArray(value)&&(!/^(0|[1-9]\d*)$/.test(k)||Number(k)>=value.length))fail('INVALID_MANIFEST');
   check(d.value,depth+1);
  }
  if(Array.isArray(value))for(let i=0;i<value.length;i++)if(!own(value,i))fail('INVALID_MANIFEST');
 }
 const clone=v=>JSON.parse(JSON.stringify(v));
 function only(value,required,optional=[]){if(!object(value)||Object.keys(value).some(k=>![...required,...optional].includes(k))||required.some(k=>!own(value,k)))fail('INVALID_MANIFEST');}
 function safePacket(v){check(v);const todo=[v];while(todo.length){const x=todo.pop();for(const [k,val]of Object.entries(x)){if(secrets.has(k))fail('PRIVATE_CONNECTION_FIELD');if(val&&typeof val==='object')todo.push(val);}}}
 async function digest(value,cryptoProvider=root.crypto){const result=await cryptoProvider.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(result)].map(x=>x.toString(16).padStart(2,'0')).join('');}
 async function validate(input,owner,cryptoProvider=root.crypto){
  check(input);only(input,['app','version','owner','revision','createdAt','operations']);
  if(input.app!=='utacheck-private-preparation'||input.version!==1||input.owner!==owner||!id(input.revision)||typeof input.createdAt!=='string'||!Number.isFinite(Date.parse(input.createdAt))||!Array.isArray(input.operations)||input.operations.length>100)fail('INVALID_MANIFEST');
  if(new TextEncoder().encode(JSON.stringify(input)).byteLength>20*1024*1024)fail('MANIFEST_TOO_LARGE');
  const manifest=clone(input),seen=new Set();
  for(const op of manifest.operations){
   only(op,['id','type','sha256','packet']);
   if(!id(op.id)||seen.has(op.id)||!['recording-schedule','recording-addition','live-addition','live-update'].includes(op.type)||!/^[a-f0-9]{64}$/.test(op.sha256))fail('INVALID_OPERATION');
   seen.add(op.id);safePacket(op.packet);if(await digest(op.packet,cryptoProvider)!==op.sha256)fail('HASH_MISMATCH');
  }
  return manifest;
 }
 function mergeLive(current,packet){
  only(packet,['app','version','group','show','members','songs'],['source']);
  if(packet.app!=='utacheck-live-addition'||packet.version!==1)fail('INVALID_OPERATION');
  only(packet.group,['id','name','nopub']);only(packet.show,['id','name'],['date','ts','folder']);
  if(!id(packet.group.id)||typeof packet.group.name!=='string'||!packet.group.name.trim()||packet.group.nopub!==true||!id(packet.show.id)||typeof packet.show.name!=='string'||!packet.show.name.trim())fail('INVALID_OPERATION');
  if(own(packet.show,'date')){const date=packet.show.date;if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)fail('INVALID_OPERATION');}
  if(own(packet.show,'ts')&&(!Number.isSafeInteger(packet.show.ts)||packet.show.ts<0))fail('INVALID_OPERATION');
  if(own(packet.show,'folder')&&typeof packet.show.folder!=='string')fail('INVALID_OPERATION');
  if(!Array.isArray(packet.members)||!Array.isArray(packet.songs)||!packet.songs.length||packet.songs.length>300)fail('INVALID_OPERATION');
  const next={...current},groups=current.groups||[],shows=current.shows||[],songs=current.songs||[],members=current.members||[];
  if(groups.some(x=>x.id===packet.group.id)||shows.some(x=>x.id===packet.show.id))fail('ADDITION_CONFLICT');
  const newIds=new Set(),map=new Map(),newMembers=[];
  for(const m of packet.members){only(m,['id','name']);if(!id(m.id)||typeof m.name!=='string'||!m.name.trim()||newIds.has(m.id))fail('INVALID_OPERATION');newIds.add(m.id);
   // New private groups keep their explicit IDs; never merge people by surname.
   if(members.some(x=>x.id===m.id))fail('ADDITION_CONFLICT');map.set(m.id,m.id);newMembers.push(clone(m));
  }
  const refs=v=>{if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!map.has(x)))fail('UNKNOWN_MEMBER');return v.slice();};
  const added=[],songIds=new Set();
  for(const song of packet.songs){
   only(song,['id','title','lines','roster'],['credit','blocks','take']);
   if(!id(song.id)||typeof song.title!=='string'||!song.title.trim()||songIds.has(song.id)||songs.some(x=>x.id===song.id)||(current.rsongs||[]).some(x=>x.id===song.id)||!Array.isArray(song.lines)||!song.lines.length||song.lines.length>5000)fail('ADDITION_CONFLICT');
   songIds.add(song.id);if(own(song,'take')&&(!Number.isSafeInteger(song.take)||song.take<1))fail('INVALID_OPERATION');
   const out={...clone(song),groupId:packet.group.id,showId:packet.show.id,take:song.take||1};out.roster=refs(song.roster);
   out.blocks={};for(const [k,v]of Object.entries(song.blocks||{})){if(!k||bad.has(k))fail('INVALID_OPERATION');out.blocks[k]=refs(v);}
   out.lines=song.lines.map(line=>{only(line,['t','parts'],['sec','label','main','extra','cut','gap','cont','tag']);if(typeof line.t!=='string')fail('INVALID_OPERATION');const l=clone(line);l.parts=refs(line.parts);for(const k of ['main','extra'])if(own(l,k))l[k]=refs(l[k]);return l;});added.push(out);
  }
  next.groups=[...groups,clone(packet.group)];next.shows=[...shows,{...clone(packet.show),groupId:packet.group.id,nopub:true}];next.songs=[...songs,...added];next.members=[...members,...newMembers];
  return {state:next,songs:added.length,shows:1};
 }
 // Existing LIVE material has numeric line addresses, not durable lyric IDs.
 // Permit explicit permutations and same-index text corrections only. Check the
 // complete prior material before building a new state; never remap annotations.
 function mergeLiveUpdate(current,packet){
  if(!object(packet))fail('INVALID_MANIFEST');
  safePacket(packet);only(packet,['app','version','groupId','showId'],['order','songs','source']);
  if(packet.app!=='utacheck-live-update'||packet.version!==1||!id(packet.groupId)||!id(packet.showId)
   ||!own(packet,'order')&&!own(packet,'songs'))fail('INVALID_OPERATION');
  const rows=key=>{const value=current[key]===undefined?[]:current[key];if(!Array.isArray(value))fail('LIVE_IDENTITY_CONFLICT');return value;};
  const groups=rows('groups'),shows=rows('shows'),songs=rows('songs'),rsongs=rows('rsongs');
  const unique=(list,target)=>{const hits=list.filter(x=>x?.id===target);if(hits.length!==1)fail('LIVE_IDENTITY_CONFLICT');return hits[0];};
  const group=unique(groups,packet.groupId),show=unique(shows,packet.showId);
  if(![true,1].includes(group.nopub)||![true,1].includes(show.nopub))fail('LIVE_NOT_PRIVATE');
  if(show.groupId!==group.id)fail('LIVE_MEMBERSHIP_CONFLICT');
  const inShow=songs.filter(song=>song?.showId===show.id);
  if(!inShow.length)fail('LIVE_IDENTITY_CONFLICT');
  for(const song of inShow){
   if(!id(song.id)||unique(songs,song.id)!==song||rsongs.some(x=>x?.id===song.id))fail('LIVE_IDENTITY_CONFLICT');
   if(song.groupId!==group.id)fail('LIVE_MEMBERSHIP_CONFLICT');
  }
  const ids=inShow.map(song=>song.id),same=(a,b)=>{
   if(a===b)return true;
   if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
   const ak=Object.keys(a),bk=Object.keys(b);
   return ak.length===bk.length&&ak.every(k=>own(b,k)&&same(a[k],b[k]));
  };
  let order=ids;
  if(own(packet,'order')){
   only(packet.order,['before','after']);
   const {before,after}=packet.order;
   for(const value of [before,after])if(!Array.isArray(value)||value.length!==ids.length||value.some(x=>!id(x))||new Set(value).size!==value.length)fail('INVALID_OPERATION');
   if(!same(before,ids))fail('LIVE_BEFORE_CONFLICT');
   if(after.some(value=>!ids.includes(value)))fail('LIVE_MEMBERSHIP_CONFLICT');
   order=after;
  }
  const patches=own(packet,'songs')?packet.songs:[];
  if(!Array.isArray(patches)||own(packet,'songs')&&!patches.length||patches.length>300)fail('INVALID_OPERATION');
  const seen=new Set(),prepared=new Map();
  for(const patch of patches){
   only(patch,['id','expectedTitle','beforeLines','afterText']);
   if(!id(patch.id)||seen.has(patch.id)||typeof patch.expectedTitle!=='string'||!patch.expectedTitle.trim()
    ||!Array.isArray(patch.beforeLines)||!patch.beforeLines.length||patch.beforeLines.length>5000
    ||!Array.isArray(patch.afterText)||patch.afterText.length!==patch.beforeLines.length||patch.afterText.some(t=>typeof t!=='string'))fail('INVALID_OPERATION');
   seen.add(patch.id);
   const song=unique(songs,patch.id);
   if(song.groupId!==group.id||song.showId!==show.id||!ids.includes(song.id))fail('LIVE_MEMBERSHIP_CONFLICT');
   if(song.title!==patch.expectedTitle||!same(song.lines,patch.beforeLines))fail('LIVE_BEFORE_CONFLICT');
   const members=rows('members'),refs=value=>{
    if(!Array.isArray(value)||value.some(mid=>!id(mid)||members.filter(m=>m?.id===mid).length!==1))fail('LIVE_IDENTITY_CONFLICT');
   };
   if(own(song,'roster'))refs(song.roster);
   if(own(song,'blocks')){if(!object(song.blocks))fail('LIVE_IDENTITY_CONFLICT');Object.values(song.blocks).forEach(refs);}
   const changed=new Set();
   patch.beforeLines.forEach((line,i)=>{
    if(!object(line)||typeof line.t!=='string')fail('INVALID_OPERATION');refs(line.parts);
    for(const key of ['main','extra'])if(own(line,key))refs(line[key]);
    if(line.t!==patch.afterText[i]){if(line.gap)fail('INVALID_OPERATION');changed.add(i);}
   });
   if(!changed.size)continue;
   for(const note of [...rows('notes'),...rows('pubNotes')]){
    if(note?.songId!==song.id)continue;
    const start=note.lineIdx,end=note.lineEnd==null?start:note.lineEnd;
    if(note.showId!==show.id||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=song.lines.length
     ||[...changed].some(i=>i>=start&&i<=end))fail('LIVE_ANNOTATION_CONFLICT');
   }
   // Handwriting uses pixel positions, so even an unannotated text correction
   // can move a later stroke. Keep the entire song unchanged in that case.
   const draws=current.draws===undefined?{}:current.draws;
   if(!object(draws))fail('LIVE_ANNOTATION_CONFLICT');
   for(const [key,value]of Object.entries(draws))if(key.split('|')[1]===song.id&&(!Array.isArray(value)||value.length))fail('LIVE_ANNOTATION_CONFLICT');
   const lines=song.lines.map((line,i)=>changed.has(i)?{...line,t:patch.afterText[i]}:line);
   // Match app.js songSig exactly so cached previous-song matching stays valid.
   const body=lines.map(line=>line.gap?'':(line.parts||[]).join(',')+'\u0001'+(line.t||'')).join('\u0002');
   let sig=0;for(let i=0;i<body.length;i++)sig=(sig*31+body.charCodeAt(i))|0;
   prepared.set(song.id,{...song,lines,sig});
  }
  const byId=new Map(inShow.map(song=>[song.id,prepared.get(song.id)||song]));let index=0;
  const nextSongs=songs.map(song=>song?.showId===show.id?byId.get(order[index++]):song);
  return {state:{...current,songs:nextSongs},songs:prepared.size,orderChanged:!same(order,ids)};
 }
 function checkedRecording(packet,current){
  if(!packet||packet.app!=='utacheck-recording-addition'||packet.version!==1||!id(packet.group?.id)||typeof packet.group.name!=='string'||!packet.group.name.trim()||![true,1].includes(packet.group.nopub)
   ||!Array.isArray(packet.members)||packet.members.length>500||!Array.isArray(packet.roster)||packet.roster.some(x=>typeof x!=='string')
   ||!Array.isArray(packet.songs)||!packet.songs.length||packet.songs.length>300||!Array.isArray(packet.plan?.slots)||!packet.plan.slots.length||packet.plan.slots.length>500
   ||!Number.isInteger(packet.plan.year)||packet.plan.year<1900||packet.plan.year>9999||typeof packet.plan.timezone!=='string')fail('INVALID_OPERATION');
  try{new Intl.DateTimeFormat('en',{timeZone:packet.plan.timezone});}catch(_){fail('INVALID_OPERATION');}
  const mids=new Set(),songIds=new Set(),slotIds=new Set();
  for(const m of packet.members){if(!id(m.id)||mids.has(m.id)||typeof m.name!=='string'||!m.name.trim())fail('INVALID_OPERATION');mids.add(m.id);}
  for(const song of packet.songs){
   if(!id(song.id)||songIds.has(song.id)||typeof song.title!=='string'||!song.title.trim()||song.groupId!==packet.group.id||!Array.isArray(song.lines)||!song.lines.length||song.lines.length>5000
    ||song.lines.some(l=>!object(l)||typeof l.t!=='string'||!Array.isArray(l.parts)))fail('INVALID_OPERATION');
   if((current.songs||[]).some(x=>x.id===song.id))fail('ADDITION_CONFLICT');songIds.add(song.id);
  }
  for(const slot of packet.plan.slots){const date=slot.date,day=/^(\d{1,2})\/(\d{1,2})$/.exec(slot.day||'');
   if(!id(slot.id)||slotIds.has(slot.id)||typeof slot.name!=='string'||!slot.name.trim()||!['member','break'].includes(slot.kind)||typeof slot.place!=='string'
    ||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date
    ||Number(date.slice(0,4))!==packet.plan.year||!day||Number(day[1])!==Number(date.slice(5,7))||Number(day[2])!==Number(date.slice(8,10))
    ||!Number.isInteger(slot.at)||slot.at<0||slot.at>=2880||!Number.isInteger(slot.min)||slot.min<=0||slot.min>1440||slot.at+slot.min>2880)fail('INVALID_OPERATION');slotIds.add(slot.id);
  }
 }
 function apply(current,operation,adapters={},now=Date.now()){
  const ledger=current.privatePreparations||{};if(!object(ledger))fail('INVALID_RECEIPTS');
  if(own(ledger,operation.id)){const old=ledger[operation.id];if(old?.sha256!==operation.sha256||old?.type!==operation.type)fail('OPERATION_ID_REUSED');return {state:current,status:'already-applied'};}
  let result;
  if(operation.type==='recording-schedule'){
   result=adapters.schedule(current,operation.packet);
   if(result.skipped?.length)fail('SCHEDULE_TARGET_MISSING');
  }else if(operation.type==='recording-addition'){
   checkedRecording(operation.packet,current);
   const packet=operation.packet,groups=(current.groups||[]).filter(g=>g.id===packet.group?.id);if(groups.length>1)fail('ADDITION_CONFLICT');const group=groups[0];
   const already=group&&group.nopub&&Array.isArray(packet.songs)&&packet.songs.length&&Array.isArray(packet.plan?.slots)&&packet.plan.slots.length
    &&packet.songs.every(so=>{const hits=(current.rsongs||[]).filter(x=>x.id===so.id);return hits.length===1&&hits[0].title===so.title&&hits[0].groupId===so.groupId&&Array.isArray(hits[0].lines)&&hits[0].lines.length===so.lines?.length&&hits[0].lines.every((l,i)=>l.t===so.lines[i].t);})
    &&packet.plan.slots.every(slot=>{const hits=(current.plan?.slots||[]).filter(x=>x.id===slot.id);return hits.length===1&&['name','date','day','kind','place'].every(k=>hits[0][k]===slot[k]);});
   if(group&&!already)fail('ADDITION_CONFLICT');
   result=already?{state:{...current},songs:0,slots:0}:adapters.recording(current,packet,{strictMemberIdentity:true});
   // This preparation is personal; all new recording groups must remain private.
   if(result.state.groups.slice((current.groups||[]).length).some(g=>!g.nopub||g.src||g.gistId||g.key))fail('PRIVATE_CONNECTION_FIELD');
  }else if(operation.type==='live-addition')result=mergeLive(current,operation.packet);
  else if(operation.type==='live-update')result=mergeLiveUpdate(current,operation.packet);
  else fail('INVALID_OPERATION');
  if(!result?.state||result.state===current&&operation.type!=='recording-schedule')fail('INVALID_OPERATION');
  return {...result,status:'applied',state:{...result.state,privatePreparations:{...ledger,[operation.id]:{sha256:operation.sha256,type:operation.type,at:now}}}};
 }
 const api=Object.freeze({validate,apply,digest,mergeLive,mergeLiveUpdate});if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PrivatePreparation=api;
})(typeof globalThis!=='undefined'?globalThis:this);

