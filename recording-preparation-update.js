/* Versioned, private REC updates. Permanent IDs and explicit source snapshots
 * identify targets. Three-way merging preserves unrelated local edits; an
 * ambiguous identity, annotation or history blocks the entire operation. */
(function(root){
 'use strict';
 const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const clone=v=>JSON.parse(JSON.stringify(v));
 const fail=(code,target)=>{throw Object.assign(new Error(code),{preparationCode:code,...(target?{targetId:target}:{})});};
 const SONG=['id','title','credit','artist','recArtist','recSession','roster','blocks','lines','intro','order','sections','xlsSourceId','xlsName','xlsSheet','xls'];
 const SLOT=['id','name','kind','date','day','at','min','place','songId','memberId','scheduleTimeUnconfirmed'];
 const LINE=new Set(['id','t','parts','main','extra','label','labelRaw','raw','extraRaw','sec','bars','cut','gap','cont','tag','recAssignmentHint','cell','lcell','extraCell','source','assignmentUnresolved','sourceCut','recAssignmentGroup']);
 function equal(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>own(b,k)&&equal(a[k],b[k]));
 }
 function only(v,required,optional=[]){
  if(!object(v)||required.some(k=>!own(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))fail('REC_UPDATE_FORMAT');
 }
 function unique(items,key='id'){
  if(!Array.isArray(items))fail('REC_UPDATE_FORMAT');const seen=new Set();
  for(const item of items){if(!object(item)||!id(item[key])||seen.has(item[key]))fail('REC_UPDATE_IDENTITY',item?.[key]);seen.add(item[key]);}
  return seen;
 }
 const project=(v,keys)=>Object.fromEntries(keys.filter(k=>own(v,k)).map(k=>[k,clone(v[k])]));
 const snapshot=packet=>packet.type==='recording-song'
  ? {songs:[project(packet.packet.song,SONG)],slots:[]}
  : {songs:packet.packet.songs.map(so=>project(so,SONG)),slots:packet.packet.plan.slots.map(slot=>project(slot,SLOT))};
 function date(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
 function clock(slot){return Number.isInteger(slot.at)&&slot.at>=0&&slot.at<2880&&Number.isInteger(slot.min)&&slot.min>0&&slot.min<=1440&&slot.at+slot.min<=2880;}
 const start=slot=>Date.parse(slot.date+'T00:00:00Z')/60000+slot.at;
 function validateSnapshot(value){
  only(value,['songs','slots']);if(!Array.isArray(value.songs)||!value.songs.length||value.songs.length>300||!Array.isArray(value.slots)||value.slots.length>500)fail('REC_UPDATE_FORMAT');
  const songs=unique(value.songs);unique(value.slots);
  for(const so of value.songs){
   only(so,['id','title','lines'],SONG.filter(k=>!['id','title','lines'].includes(k)));
   if(typeof so.title!=='string'||!so.title.trim()||!Array.isArray(so.lines)||!so.lines.length||so.lines.length>5000||so.lines.some(l=>!object(l)||typeof l.t!=='string'||!Array.isArray(l.parts)))fail('REC_UPDATE_FORMAT');
   for(const key of ['credit','artist','recArtist','xlsSourceId','xlsName','xlsSheet'])if(own(so,key)&&typeof so[key]!=='string')fail('REC_UPDATE_FORMAT');
   if(own(so,'intro')&&(!Number.isInteger(so.intro)||so.intro<0)||own(so,'recSession')&&!object(so.recSession))fail('REC_UPDATE_FORMAT');
   for(const l of so.lines){if(own(l,'bars')&&(!Number.isFinite(l.bars)||l.bars<0)||['sec','label','labelRaw','raw','extraRaw','cell','lcell','extraCell'].some(k=>own(l,k)&&typeof l[k]!=='string'))fail('REC_UPDATE_FORMAT');}
   const lineIds=so.lines.filter(l=>own(l,'id'));if(lineIds.length)unique(lineIds);
  }
  for(const slot of value.slots){
   only(slot,['id','name','kind','date','day','at','min','place'],SLOT.filter(k=>!['id','name','kind','date','day','at','min','place'].includes(k)));
   if(typeof slot.name!=='string'||!slot.name.trim()||typeof slot.place!=='string'||!['member','break'].includes(slot.kind)||!date(slot.date)||!clock(slot))fail('REC_UPDATE_FORMAT');
   const day=/^(\d{1,2})\/(\d{1,2})$/.exec(slot.day||'');if(!day||Number(day[1])!==Number(slot.date.slice(5,7))||Number(day[2])!==Number(slot.date.slice(8,10)))fail('REC_UPDATE_FORMAT');
   if(own(slot,'songId')&&!songs.has(slot.songId)||own(slot,'memberId')&&!id(slot.memberId)||own(slot,'scheduleTimeUnconfirmed')&&typeof slot.scheduleTimeUnconfirmed!=='boolean')fail('REC_UPDATE_IDENTITY');
  }
 }
 function validate(packet){
  only(packet,['app','version','sessionId','revision','groupId','timezone','anchor','previous','before','after','source'],['bootstrap','members','lineMaps','supersedes']);
  if(packet.app!=='utacheck-recording-update'||packet.version!==1||!id(packet.sessionId)||!id(packet.groupId)||!Number.isSafeInteger(packet.revision)||packet.revision<1)fail('REC_UPDATE_FORMAT');
  try{new Intl.DateTimeFormat('en',{timeZone:packet.timezone});}catch(_){fail('REC_UPDATE_FORMAT');}
  if(own(packet,'bootstrap')&&(!Array.isArray(packet.bootstrap)||packet.bootstrap.length>100))fail('REC_UPDATE_FORMAT');
  for(const ref of [packet.anchor,packet.previous,...(packet.bootstrap||[]),...(packet.supersedes?[packet.supersedes]:[])]){only(ref,['id','sha256']);if(!id(ref.id)||!hash(ref.sha256))fail('REC_UPDATE_FORMAT');}
  if(own(packet,'bootstrap')&&(!Array.isArray(packet.bootstrap)||packet.bootstrap.length>100))fail('REC_UPDATE_FORMAT');
  only(packet.source,['revision','files']);if(typeof packet.source.revision!=='string'||!packet.source.revision.trim()||!Array.isArray(packet.source.files)||!packet.source.files.length||packet.source.files.length>100)fail('REC_UPDATE_SOURCE');
  for(const file of packet.source.files){only(file,['name','sha256']);if(typeof file.name!=='string'||!file.name.trim()||!hash(file.sha256))fail('REC_UPDATE_SOURCE');}
  validateSnapshot(packet.before);validateSnapshot(packet.after);
  if(!equal(packet.before.songs.map(s=>s.id),packet.after.songs.map(s=>s.id)))fail('REC_UPDATE_IDENTITY');
  if(own(packet,'members')){if(!Array.isArray(packet.members)||packet.members.length>500)fail('REC_UPDATE_FORMAT');unique(packet.members);for(const m of packet.members){only(m,['id','name']);if(typeof m.name!=='string'||!m.name.trim())fail('REC_UPDATE_FORMAT');}}
  if(own(packet,'lineMaps')){if(!object(packet.lineMaps)||Object.keys(packet.lineMaps).some(k=>!packet.before.songs.some(s=>s.id===k)))fail('REC_UPDATE_LINE_MAP');}
  let previous=-Infinity;for(const slot of packet.after.slots){if(start(slot)<previous)fail('REC_UPDATE_ORDER');previous=start(slot);}
  return packet;
 }
 // Only fields actually changed by the source participate in a conflict. A
 // person's independent label, section, break or timing edit remains intact.
 function merge(local,before,after,keys,target){
  const out={...local};
  for(const key of keys){
   const b=own(before,key),a=own(after,key),l=own(local,key);
   if(b===a&&equal(before[key],after[key]))continue;
   if(a===l&&equal(local[key],after[key]))continue;
   if(b===l&&equal(local[key],before[key])){if(a)out[key]=clone(after[key]);else delete out[key];continue;}
   if(b&&a&&l&&object(before[key])&&object(after[key])&&object(local[key])){out[key]=merge(local[key],before[key],after[key],new Set([...Object.keys(before[key]),...Object.keys(after[key])]),target);continue;}
   fail('REC_UPDATE_LOCAL_EDIT',target);
  }
  return out;
 }
 function sourceBaseline(packet,operations){
  const lookup=ref=>{const hits=operations.filter(op=>op.id===ref.id&&op.sha256===ref.sha256);if(hits.length!==1)fail('REC_UPDATE_PREDECESSOR');return hits[0];};
  const anchor=lookup(packet.anchor);
  if(!['recording-addition','recording-song'].includes(anchor.type))fail('REC_UPDATE_PREDECESSOR');
  let base=snapshot(anchor);
  for(const ref of packet.bootstrap||[]){
   const op=lookup(ref);
   if(op.type==='recording-schedule'){
    for(const entry of op.packet.updates||[]){const slots=base.slots.filter(s=>s.id===entry.id);if(slots.length!==1||!Object.keys(entry.expected).every(k=>equal(slots[0][k],entry.expected[k])))fail('REC_UPDATE_BASELINE');Object.assign(slots[0],entry.next);}
    for(const entry of op.packet.unconfirmed||[]){const slots=base.slots.filter(s=>s.id===entry.id);if(slots.length!==1||!Object.keys(entry.expected).every(k=>equal(slots[0][k],entry.expected[k])))fail('REC_UPDATE_BASELINE');slots[0].scheduleTimeUnconfirmed=true;}
   }else if(op.type==='material-update'&&op.packet.scope==='recording'){
    const so=base.songs.find(s=>s.id===op.packet.songId);if(!so||!equal(so.lines,op.packet.beforeLines)||so.title!==op.packet.expectedTitle)fail('REC_UPDATE_BASELINE');so.lines=clone(op.packet.afterLines);
   }else fail('REC_UPDATE_BASELINE');
  }
  const last=(packet.bootstrap||[]).at(-1)||packet.anchor;if(!equal(last,packet.previous))fail('REC_UPDATE_PREDECESSOR');
  return {base,anchor};
 }
 function mapping(before,after,supplied){
  let map=supplied;
  if(map===undefined){
   if(before.every(l=>id(l.id))&&after.every(l=>id(l.id)))map=before.map(l=>{const i=after.findIndex(n=>n.id===l.id);return i<0?null:i;});
   else if(before.length===after.length)map=before.map((_,i)=>i);
   else fail('REC_UPDATE_LINE_MAP');
  }
  if(!Array.isArray(map)||map.length!==before.length||map.some(v=>v!==null&&(!Number.isInteger(v)||v<0||v>=after.length))||new Set(map.filter(v=>v!==null)).size!==map.filter(v=>v!==null).length)fail('REC_UPDATE_LINE_MAP');
  before.forEach((l,i)=>{if(map[i]!==null&&own(l,'id')&&l.id!==after[map[i]].id)fail('REC_UPDATE_LINE_MAP');});return map;
 }
 const meaningful=v=>v!==undefined&&v!==null&&v!==false&&v!==0&&v!==''&&(Array.isArray(v)?v.length>0:object(v)?Object.keys(v).length>0:true);
 function mergeLines(current,so,before,after,map,notes,pubNotes){
  if(equal(before,after)&&map.every((v,i)=>v===i))return {lines:so.lines,notes,pubNotes};
  if(!Array.isArray(so.lines)||so.lines.length!==before.length)fail('REC_UPDATE_LOCAL_STRUCTURE',so.id);
  const out=Array(after.length),used=new Set();
  before.forEach((line,i)=>{
   const j=map[i],local=so.lines[i];
   if(j===null){if(!equal(local,line))fail('REC_UPDATE_LOCAL_EDIT',so.id);return;}
   for(const key of new Set([...Object.keys(line),...Object.keys(after[j])]))if(!LINE.has(key)&&!equal(line[key],after[j][key]))fail('REC_UPDATE_LINE_MAP',so.id);
   if(local.t!==after[j].t&&(['lyricBreaks','recBarOverrides'].some(k=>meaningful(local[k]))||!equal(local.cut,line.cut)||own(local,'sourceCut')&&!own(line,'sourceCut')))fail('REC_UPDATE_LOCAL_EDIT',so.id);
   out[j]=merge(local,line,after[j],LINE,so.id);used.add(j);
  });
  after.forEach((line,i)=>{if(!used.has(i)){if(Object.keys(line).some(k=>!LINE.has(k)))fail('REC_UPDATE_FORMAT');out[i]=clone(line);}});
  const hasHand=Object.entries(current.draws||{}).some(([k,v])=>k.split('|').includes(so.id)&&meaningful(v))||[...notes,...pubNotes].some(n=>n.songId===so.id&&meaningful(n.hand));
  if(hasHand)fail('REC_UPDATE_HANDWRITING',so.id);
  const remap=items=>items.map(note=>{
   if(note.songId!==so.id)return note;
   const first=note.lineIdx,last=note.lineEnd==null?first:note.lineEnd;
   if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last<first||last>=before.length)fail('REC_UPDATE_ANNOTATION',so.id);
   if(note.from!=null&&(!Number.isInteger(note.from)||!Number.isInteger(note.to)||note.from<0||note.to<note.from||note.to>=Array.from(so.lines[first].t).length))fail('REC_UPDATE_ANNOTATION',so.id);
   for(let i=first;i<=last;i++)if(map[i]===null||map[i]!==map[first]+i-first||so.lines[i].t!==out[map[i]].t)fail('REC_UPDATE_ANNOTATION',so.id);
   return map[first]===first&&map[last]===last?note:{...note,lineIdx:map[first],...(note.lineEnd!=null?{lineEnd:map[last]}:{})};
  });
  const sectionKeys=lines=>[...new Set(lines.map(l=>l.sec).filter(Boolean))];
  const history=(current.plan?.slots||[]).some(s=>s.songId===so.id&&[s.takes,s.secLog,s.sectionChecks].some(meaningful));
  if(history&&!equal(sectionKeys(so.lines),sectionKeys(out)))fail('REC_UPDATE_SECTION_HISTORY',so.id);
  return {lines:out,notes:remap(notes),pubNotes:remap(pubNotes)};
 }
 function apply(current,packet,{operation,operations=[]}={}){
  validate(packet);
  if(!operation||operation.type!=='recording-update'||!id(operation.id)||!hash(operation.sha256)||!object(current)||!Array.isArray(current.rsongs)||!Array.isArray(current.plan?.slots))fail('REC_UPDATE_FORMAT');
  const heads=current.recordingUpdateHeads||{};if(!object(heads))fail('REC_UPDATE_STATE');
  const head=heads[packet.sessionId];
  if(packet.supersedes){
   const prior=operations.find(op=>op.id===packet.supersedes.id&&op.sha256===packet.supersedes.sha256);
   if(!prior||prior.type!=='recording-update'||prior.packet.sessionId!==packet.sessionId||prior.packet.revision!==packet.revision||!equal(prior.packet.previous,packet.previous)||!equal(prior.packet.before,packet.before)||!equal(prior.packet.anchor,packet.anchor))fail('REC_UPDATE_PREDECESSOR');
   if(current.privatePreparations?.[prior.id])fail('REC_UPDATE_ALREADY_APPLIED');
  }
  if(head){
   if(packet.revision<=head.revision)fail('REC_UPDATE_STALE');
   if(packet.revision!==head.revision+1||packet.groupId!==head.groupId||packet.previous.id!==head.operationId||packet.previous.sha256!==head.sha256||!equal(packet.anchor,head.anchor)||!equal(packet.before,head.snapshot)||packet.bootstrap?.length)fail('REC_UPDATE_PREDECESSOR');
   const receipt=current.privatePreparations?.[head.operationId];if(!receipt||receipt.sha256!==head.sha256||receipt.type!=='recording-update')fail('REC_UPDATE_PREDECESSOR');
  }else{
   if(packet.revision!==1)fail('REC_UPDATE_PREDECESSOR');
   const baseline=sourceBaseline(packet,operations);if(!equal(packet.before,baseline.base))fail('REC_UPDATE_BASELINE');
   if(baseline.anchor.packet.group.id!==packet.groupId&&!(baseline.anchor.type==='recording-song'&&baseline.anchor.packet.group.name==='配信しない'))fail('REC_UPDATE_IDENTITY');
   for(const prior of Object.values(heads))if(prior.snapshot.songs.some(s=>packet.before.songs.some(other=>other.id===s.id))||prior.snapshot.slots.some(s=>packet.before.slots.some(other=>other.id===s.id)))fail('REC_UPDATE_SESSION_CONFLICT');
  }
  const groups=(current.groups||[]).filter(g=>g.id===packet.groupId);if(groups.length!==1||![true,1].includes(groups[0].nopub))fail('REC_UPDATE_NOT_PRIVATE');
  if(current.plan.timezone&&current.plan.timezone!==packet.timezone)fail('REC_UPDATE_TIMEZONE');
  unique(current.rsongs);unique(current.plan.slots);const members=[...(current.members||[])];unique(members);
  for(const person of packet.members||[]){const local=members.find(m=>m.id===person.id);if(local&&local.name!==person.name)fail('REC_UPDATE_MEMBER',person.id);if(!local)members.push(clone(person));}
  const known=new Set(members.map(m=>m.id)),refs=ids=>{if(!Array.isArray(ids)||ids.some(mid=>!known.has(mid)))fail('REC_UPDATE_MEMBER');};
  for(const slot of packet.after.slots)if(slot.memberId&&!known.has(slot.memberId))fail('REC_UPDATE_MEMBER',slot.id);
  let notes=current.notes||[],pubNotes=current.pubNotes||[];const changedSongs=new Map();
  for(let n=0;n<packet.before.songs.length;n++){
   const before=packet.before.songs[n],after=packet.after.songs[n],so=current.rsongs.find(s=>s.id===before.id);
   if(!so||so.groupId!==packet.groupId||(current.songs||[]).some(s=>s.id===so.id))fail('REC_UPDATE_IDENTITY',before.id);
   if(!equal(before,after)&&so.xlsSourceId&&(current.rsongs||[]).some(other=>other.id!==so.id&&other.xlsSourceId===so.xlsSourceId))fail('REC_UPDATE_LOCAL_COPY',so.id);
   const next=merge(so,before,after,SONG.filter(k=>!['id','lines'].includes(k)),so.id);
   const map=mapping(before.lines,after.lines,packet.lineMaps?.[so.id]);
   const result=mergeLines(current,so,before.lines,after.lines,map,notes,pubNotes);next.lines=result.lines;notes=result.notes;pubNotes=result.pubNotes;
   if(own(next,'roster'))refs(next.roster);for(const ids of Object.values(next.blocks||{}))refs(ids);for(const l of next.lines)for(const k of ['parts','main','extra'])if(own(l,k))refs(l[k]);
   if(!equal(next,so)||map.some((v,i)=>v!==i)){
    if((current.plan.slots||[]).some(s=>(!s.songId||s.songId===so.id)&&s.a0!=null&&s.a1==null))fail('REC_UPDATE_ACTIVE_SLOT',so.id);
    if(own(so,'sig')){const text=next.lines.map(l=>l.gap?'':(l.parts||[]).join(',')+'\u0001'+(l.t||'')).join('\u0002');let sig=0;for(let i=0;i<text.length;i++)sig=(sig*31+text.charCodeAt(i))|0;next.sig=sig;}
    changedSongs.set(so.id,next);
   }
  }
  const oldIds=new Set(packet.before.slots.map(s=>s.id)),afterIds=new Set(packet.after.slots.map(s=>s.id)),slotChanges=new Map();
  for(const before of packet.before.slots){
   const local=current.plan.slots.find(s=>s.id===before.id),after=packet.after.slots.find(s=>s.id===before.id);if(!local)fail('REC_UPDATE_IDENTITY',before.id);
   if(!after){if(before.kind!=='break'||!equal(project(local,SLOT),before)||Object.keys(local).some(k=>!SLOT.includes(k)&&meaningful(local[k])))fail('REC_UPDATE_BREAK_HISTORY',before.id);slotChanges.set(before.id,null);continue;}
   if(['kind','name'].some(k=>!equal(before[k],after[k]))||['memberId','songId'].some(k=>own(before,k)&&!equal(before[k],after[k])))fail('REC_UPDATE_SLOT_IDENTITY',before.id);
   const next=merge(local,before,after,SLOT.filter(k=>k!=='id'),before.id);
   if((local.a0!=null||local.a1!=null)&&['date','day','at','min','place'].some(k=>!equal(next[k],local[k]))&&!own(local,'recActualSchedule'))next.recActualSchedule=project(local,['date','day','at','min','place']);
   if(!equal(next,local)){if(!next.songId)fail('REC_UPDATE_SLOT_IDENTITY',next.id);if(local.a0!=null&&local.a1==null)fail('REC_UPDATE_ACTIVE_SLOT',local.id);slotChanges.set(local.id,next);}
  }
  for(const after of packet.after.slots)if(!oldIds.has(after.id)){
   if(current.plan.slots.some(s=>s.id===after.id))fail('REC_UPDATE_IDENTITY',after.id);
   if(!after.songId)fail('REC_UPDATE_SLOT_IDENTITY',after.id);
   if(after.kind==='member'&&(!after.songId||!after.memberId||!members.some(m=>m.id===after.memberId&&m.name===after.name)))fail('REC_UPDATE_MEMBER',after.id);
   slotChanges.set(after.id,clone(after));
  }
  const localOrder=current.plan.slots.filter(s=>oldIds.has(s.id)).map(s=>s.id),beforeOrder=packet.before.slots.map(s=>s.id),afterOrder=packet.after.slots.map(s=>s.id);
  let slots;
  if(!equal(beforeOrder,afterOrder)){
   if(!equal(localOrder,beforeOrder)&&!equal(localOrder.filter(id=>afterIds.has(id)),afterOrder.filter(id=>oldIds.has(id))))fail('REC_UPDATE_LOCAL_ORDER');
   const indices=current.plan.slots.map((s,i)=>oldIds.has(s.id)?i:-1).filter(i=>i>=0);
   if(indices.length&&indices.at(-1)-indices[0]+1!==indices.length)fail('REC_UPDATE_LOCAL_ORDER');
   const at=indices[0]??current.plan.slots.length;slots=current.plan.slots.filter(s=>!oldIds.has(s.id));
   slots.splice(at,0,...packet.after.slots.map(s=>slotChanges.has(s.id)?slotChanges.get(s.id):current.plan.slots.find(l=>l.id===s.id)));
  }else slots=current.plan.slots.map(s=>slotChanges.get(s.id)||s);
  for(const [sid,next]of slotChanges){
   if(!next||next.scheduleArchived||next.scheduleTimeUnconfirmed)continue;
   for(const other of slots){
    if(other.id===sid||other.scheduleArchived||other.scheduleTimeUnconfirmed)continue;
    if(!date(other.date)||!clock(other))fail('REC_UPDATE_UNKNOWN_SCHEDULE',other.id);
    if(next.day===other.day&&next.date!==other.date)fail('REC_UPDATE_DAY_AMBIGUOUS',other.id);
    if(Math.max(start(next),start(other))<Math.min(start(next)+next.min,start(other)+other.min))fail('REC_UPDATE_OVERLAP',sid);
   }
  }
  const nextHead={revision:packet.revision,operationId:operation.id,sha256:operation.sha256,groupId:packet.groupId,anchor:clone(packet.anchor),snapshot:clone(packet.after)};
  return {state:{...current,members,rsongs:current.rsongs.map(s=>changedSongs.get(s.id)||s),plan:{...current.plan,timezone:current.plan.timezone||packet.timezone,slots,songIds:[...new Set([...(current.plan.songIds||[]),...packet.after.songs.map(s=>s.id)])]},notes,pubNotes,
   recordingUpdateHeads:{...heads,[packet.sessionId]:nextHead}},songs:changedSongs.size,slots:slotChanges.size,sessionId:packet.sessionId,revision:packet.revision};
 }
 const api=Object.freeze({validate,apply,snapshot,equal});if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RecordingPreparationUpdate=api;
})(typeof globalThis!=='undefined'?globalThis:this);
