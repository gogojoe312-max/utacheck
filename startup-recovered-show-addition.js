/* Append checked publication history and explicitly archive superseded recoveries. */
(function(root){
  'use strict';
  const MAX_BYTES=20*1024*1024;
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const unsafe=new Set(['__proto__','prototype','constructor']);
  const secret=new Set(['creds','credentials','src','gist','gistId','key','ghToken','bkKey','bkGistId','editPass',
    'srcKey','srcGist','srcGroup','linkSrc','token','apiKey','password','passphrase','secret','lastKey']);
  const lists=['members','groups','shows','songs','notes','pubNotes'];
  const dictionaries=['memos','subs','subsMan','gsubs','seen'];
  const allowed=new Set([...lists,...dictionaries,'rosters','folderOrder','groupOrder','showId','groupId','songLib']);
  const references=['groupId','deliveryGroupId','memberId','roster','absent','memberIds','parts','main','extra','blocks'];
  const rowFields={
    members:new Set(['id','name',...references]),groups:new Set(['id','name','nopub',...references]),
    shows:new Set(['id','name','ts','folder','from','nopub','hidden',...references]),
    songs:new Set(['id','title','credit','lines','L','showId','take','from','sig','blockCells','blockRows','sheetName','micSheet','micMap','deliveryMode',...references]),
    notes:new Set(['id','songId','showId','tags','memo','pitch','hand','lineIdx','lineEnd','from','to','at','ts',...references]),
    lines:new Set(['t','label','raw','labelRaw','extraRaw','cont','cell','lcell','extraCell','cut','gap','sec','tag','solo','vt',...references])
  };
  const validId=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[|\x00-\x1f]/.test(value)&&!unsafe.has(value);
  const fail=code=>{const error=new Error(code);error.recoveryCode=code;throw error;};
  // Validate before copying/stringifying: dangerous JSON keys and accessors never run.
  function copy(value,privateCandidate=false,ancestors=new Set()){
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'){if(!Number.isFinite(value))fail('candidate-invalid');return value;}
    if(typeof value!=='object'||ancestors.has(value))fail('candidate-invalid');
    const prototype=Object.getPrototypeOf(value);
    if(!Array.isArray(value)&&prototype!==null&&Object.getPrototypeOf(prototype)!==null)fail('candidate-invalid');
    ancestors.add(value);
    const out=Array.isArray(value)?[]:{};
    const keys=Reflect.ownKeys(value);
    for(const key of keys){
      if(Array.isArray(value)&&key==='length')continue;
      if(typeof key!=='string'||unsafe.has(key))fail('unsafe-key');
      if(privateCandidate&&secret.has(key))fail('candidate-private-field');
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!descriptor||!own(descriptor,'value')||!descriptor.enumerable)fail('candidate-invalid');
      if(Array.isArray(value)&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length))fail('candidate-invalid');
      out[key]=copy(descriptor.value,privateCandidate,ancestors);
    }
    if(Array.isArray(value)&&keys.length!==value.length+1)fail('candidate-invalid');
    ancestors.delete(value);return out;
  }
  function size(value){if(new TextEncoder().encode(JSON.stringify(value)).byteLength>MAX_BYTES)fail('candidate-too-large');}
  function only(value,keys){if(!object(value)||Object.keys(value).some(key=>!keys.has(key)))fail('candidate-invalid');}
  function archiveSuperseded(next,candidate,entries){
    const targets=[],receipts=new Set(),destinations=new Set(),showIds=new Set();
    function index(rows,key){
      const map=new Map();
      for(const row of rows||[]){const value=row?.[key];if(!map.has(value))map.set(value,[]);map.get(value).push(row);}
      return map;
    }
    const groupsById=index(next.groups,'id'),groupsByName=index(next.groups,'name'),candidateNames=index(candidate.groups,'name');
    const showsById=index(next.shows,'id'),showsByGroup=index(next.shows,'groupId');
    const receiptGroups=index(Object.values(next.recoveredShowSources||{}),'focusGroupId');
    const receiptSources=index(Object.values(next.recoveredShowSources||{}).map(receipt=>receipt?.source),'sha256');
    const names=new Set([...(next.groups||[]).map(group=>group?.name),...Object.keys(next.rosters||{}),
      ...(next.groupOrder||[]),...(candidate.groups||[]).map(group=>group.name)]);
    for(const entry of entries){
      only(entry,new Set(['sourceSha256','groupName','sourceShowIds']));
      if(typeof entry.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sourceSha256)
        ||typeof entry.groupName!=='string'||!entry.groupName||unsafe.has(entry.groupName)
        ||!Array.isArray(entry.sourceShowIds)||!entry.sourceShowIds.length
        ||entry.sourceShowIds.some(id=>!validId(id))||new Set(entry.sourceShowIds).size!==entry.sourceShowIds.length)fail('supersedes-invalid');
      if(receipts.has(entry.sourceSha256))fail('supersedes-receipt-conflict');
      receipts.add(entry.sourceSha256);
      const receipt=next.recoveredShowSources?.[entry.sourceSha256];
      if(!object(receipt)||!object(receipt.source)||receipt.source.sha256!==entry.sourceSha256||!validId(receipt.focusGroupId))fail('supersedes-receipt-mismatch');
      const groups=groupsById.get(receipt.focusGroupId)||[];
      if(groups.length!==1)fail('supersedes-group-identity');
      const group=groups[0];
      if(group.name!==entry.groupName)fail('supersedes-group-name');
      if(destinations.has(group.id))fail('supersedes-receipt-conflict');
      destinations.add(group.id);
      // A shared name cannot safely identify which roster/order label to move.
      if(groupsByName.get(entry.groupName)?.length!==1||candidateNames.get(entry.groupName)?.length!==1)fail('supersedes-group-name');
      if(receiptGroups.get(group.id)?.length!==1||receiptSources.get(entry.sourceSha256)?.length!==1)fail('supersedes-receipt-conflict');
      if(group.nopub!==true||['gistId','src','key'].some(field=>group[field]!=null&&group[field]!==''))fail('supersedes-group-connected');
      const matches=new Map();
      for(const show of showsByGroup.get(group.id)||[]){
        // Ownership is explicit. Never infer a prior recovery from a title.
        if(show?.groupId!==group.id||!own(show,'recoveredSourceShowId'))continue;
        if(!validId(show.recoveredSourceShowId)||matches.has(show.recoveredSourceShowId))fail('supersedes-show-identity');
        matches.set(show.recoveredSourceShowId,show);
      }
      const shows=entry.sourceShowIds.map(sourceId=>{
        const show=matches.get(sourceId);
        if(!show)fail('supersedes-show-missing');
        if(!validId(show.id)||showsById.get(show.id)?.length!==1||showIds.has(show.id))fail('supersedes-show-identity');
        showIds.add(show.id);return show;
      });
      let name=entry.groupName+'（旧資料）',suffix=2;
      while(names.has(name))name=entry.groupName+'（旧資料'+(suffix++)+'）';
      names.add(name);targets.push({group,shows,name});
    }
    const changes={groups:0,shows:0,showFlags:0,rosters:0,groupOrder:0};
    // All archival targets are checked before changing even the current clone.
    // Only labels and selected visibility flags change; all local work survives.
    for(const {group,shows,name} of targets){
      const original=group.name;group.name=name;changes.groups++;
      for(const show of shows){if(show.hidden!==true)changes.showFlags++;show.hidden=true;changes.shows++;}
      if(own(next.rosters||{},original)){
        next.rosters[name]=next.rosters[original];delete next.rosters[original];changes.rosters++;
      }
      if(own(next,'groupOrder'))next.groupOrder=next.groupOrder.map(label=>{
        if(label!==original)return label;changes.groupOrder++;return name;
      });
    }
    return changes;
  }
  function merge(current,packet,options={}){
    if(!object(current)||!object(packet)||!object(options))fail('candidate-invalid');
    // Current credentials and unknown JSON fields remain solely in the current copy.
    const next=copy(current),input=copy(packet);
    size(next);size(input);
    only(input,new Set(['app','version','state','source','originalText','supersedes']));
    if(input.app!=='utacheck-recovered-shows-addition'||![1,2].includes(input.version))fail('candidate-invalid');
    if(input.version===1&&own(input,'supersedes'))fail('candidate-invalid');
    if(input.version===2&&(!Array.isArray(input.supersedes)||!input.supersedes.length))fail('supersedes-invalid');
    if(own(input,'originalText')&&(typeof input.originalText!=='string'||!input.originalText))fail('candidate-invalid');
    only(input.source,new Set(['kind','at','revision','sha256']));
    const source=input.source;
    if(source.kind!=='gist-publication'||!Number.isSafeInteger(source.at)||source.at<=0
      ||typeof source.revision!=='string'||!/^[a-f0-9]{40}$/.test(source.revision)
      ||typeof source.sha256!=='string'||!/^[a-f0-9]{64}$/.test(source.sha256))fail('source-invalid');
    const candidate=copy(input.state,true);only(candidate,allowed);
    for(const field of lists){
      if(own(candidate,field)&&!Array.isArray(candidate[field]))fail('candidate-invalid');
      for(const row of candidate[field]||[])only(row,rowFields[field==='pubNotes'?'notes':field]);
    }
    if(own(candidate,'songLib')&&(!Array.isArray(candidate.songLib)||candidate.songLib.some(lines=>!Array.isArray(lines)||lines.some(line=>!object(line)))))fail('candidate-song');
    let expandedLines=0;
    for(const song of candidate.songs||[]){
      if(!object(song))fail('candidate-song');
      if(own(song,'L')){
        if(!Number.isSafeInteger(song.L)||song.L<0||!Array.isArray(candidate.songLib?.[song.L])||own(song,'lines'))fail('candidate-song');
        song.lines=copy(candidate.songLib[song.L]);delete song.L;
      }
      if(!Array.isArray(song.lines))fail('candidate-song');
      for(const line of song.lines)only(line,rowFields.lines);
      expandedLines+=song.lines.length;if(expandedLines>100000)fail('candidate-too-large');
    }
    // Expansion is bounded independently from the compact import packet.
    delete candidate.songLib;size(candidate);
    if(own(next,'recoveredShowSources')&&!object(next.recoveredShowSources))fail('current-invalid');
    if(own(next.recoveredShowSources||{},source.sha256)){
      const previous=next.recoveredShowSources[source.sha256]?.source;
      const same=object(previous)&&['kind','at','revision','sha256'].every(key=>previous[key]===source[key]);
      fail(same?'source-already-added':'source-receipt-conflict');
    }
    if(input.version===2&&Object.values(next.recoveredShowSources||{}).some(receipt=>receipt?.source?.sha256===source.sha256))fail('source-receipt-conflict');
    const counts={};
    for(const field of lists){
      if(own(next,field)&&!Array.isArray(next[field]))fail('current-invalid');
      counts[field]=(candidate[field]||[]).length;
    }
    for(const field of [...dictionaries,'rosters']){
      if(own(candidate,field)&&!object(candidate[field]))fail('candidate-invalid');
      if(own(next,field)&&!object(next[field]))fail('current-invalid');
      counts[field]=Object.keys(candidate[field]||{}).length;
    }
    if(!(candidate.shows||[]).length||!(candidate.songs||[]).length)fail('candidate-empty');
    for(const field of ['folderOrder','groupOrder']){
      if(own(candidate,field)&&(!Array.isArray(candidate[field])||candidate[field].some(value=>typeof value!=='string'||!value||unsafe.has(value))))fail('candidate-invalid');
      if(own(next,field)&&!Array.isArray(next[field]))fail('current-invalid');
      counts[field]=0;
    }
    const used=new Set(),currentIds=new Set();
    const refKeys=new Set(['id','showId','songId','groupId','deliveryGroupId','memberId','rsongId','xlsSourceId','from']);
    function reserve(value){
      if(Array.isArray(value)){value.forEach(reserve);return;}
      if(!object(value))return;
      for(const [key,item] of Object.entries(value)){
        if(refKeys.has(key)&&validId(item))currentIds.add(item);
        if(key.includes('|'))key.split('|').forEach(id=>{if(validId(id))currentIds.add(id);});
        if(['parts','main','extra','roster','absent','memberIds'].includes(key)&&Array.isArray(item))item.forEach(id=>{if(validId(id))currentIds.add(id);});
        reserve(item);
      }
    }
    reserve(next);for(const id of currentIds)used.add(id);
    // Reserve all candidate originals first, so a generated ID cannot steal a later ID.
    for(const field of lists)for(const row of candidate[field]||[]){
      if(!object(row)||!validId(row.id))fail('candidate-identity');used.add(row.id);
    }
    const maps={},claimed=new Set();
    function fresh(field,index){
      const base='recovered-'+source.sha256.slice(0,12)+'-'+field+'-'+index;
      let id=base,suffix=0;while(used.has(id))id=base+'-'+(++suffix);used.add(id);return id;
    }
    for(const field of lists){
      const map=maps[field]=new Map();
      (candidate[field]||[]).forEach((row,index)=>{
        if(map.has(row.id))fail('candidate-identity');
        const id=currentIds.has(row.id)||claimed.has(row.id)?fresh(field,index):row.id;
        claimed.add(row.id);map.set(row.id,id);
      });
    }
    function ref(value,field,empty=false){
      if(empty&&(value===null||value===''))return value;
      if(!validId(value)||!maps[field].has(value))fail('candidate-reference');return maps[field].get(value);
    }
    function memberIds(value){if(!Array.isArray(value))fail('candidate-reference');return value.map(id=>ref(id,'members'));}
    function memberFields(row){
      for(const field of ['roster','absent','memberIds','parts','main','extra'])if(own(row,field))row[field]=memberIds(row[field]);
      if(own(row,'memberId'))row.memberId=ref(row.memberId,'members',true);
      if(own(row,'blocks')){
        if(!object(row.blocks))fail('candidate-reference');
        for(const key of Object.keys(row.blocks))row.blocks[key]=memberIds(row.blocks[key]);
      }
    }
    function route(row){
      if(own(row,'groupId'))row.groupId=ref(row.groupId,'groups',true);
      if(own(row,'deliveryGroupId'))row.deliveryGroupId=ref(row.deliveryGroupId,'groups',true);
      memberFields(row);
    }
    const archiveChanges=input.version===2?archiveSuperseded(next,candidate,input.supersedes):null;
    const groupNames=new Map(),names=new Set([
      ...(next.groups||[]).map(group=>group?.name),...Object.keys(next.rosters||{}),...(next.groupOrder||[])]);
    for(const group of candidate.groups||[]){
      if(typeof group.name!=='string'||!group.name||unsafe.has(group.name)||groupNames.has(group.name))fail('candidate-group-name');
      const original=group.name;let name=original,suffix=1;
      while(names.has(name)){name=original+'（配信履歴'+(suffix===1?'':suffix)+'）';suffix++;}
      names.add(name);groupNames.set(original,name);group.name=name;group.nopub=true;
      group.id=maps.groups.get(group.id);route(group);
    }
    for(const member of candidate.members||[]){
      if(typeof member.name!=='string'||!member.name)fail('candidate-member-name');
      member.id=maps.members.get(member.id);route(member);
    }
    for(const show of candidate.shows||[]){
      if(typeof show.name!=='string'||!show.name)fail('candidate-show-name');
      const original=show.id;show.id=maps.shows.get(original);show.nopub=true;
      // Locator only; it never aliases an existing show or local material.
      if(own(show,'recoveredSourceShowId'))fail('candidate-invalid');
      show.recoveredSourceShowId=original;route(show);
      if(own(show,'from'))show.from=ref(show.from,'shows',true);
    }
    for(const song of candidate.songs||[]){
      if(typeof song.title!=='string'||!Array.isArray(song.lines))fail('candidate-song');
      song.id=maps.songs.get(song.id);song.showId=ref(song.showId,'shows');route(song);
      if(own(song,'from'))song.from=ref(song.from,'songs',true);
      // Candidate publication must already contain standalone lyrics, never app-library aliases.
      if(own(song,'L')||own(song,'xlsSourceId'))fail('candidate-song');
      for(const line of song.lines){
        if(!object(line)||typeof line.t!=='string'||!Array.isArray(line.parts))fail('candidate-song');memberFields(line);
      }
    }
    for(const field of ['notes','pubNotes'])for(const note of candidate[field]||[]){
      if(!Array.isArray(note.memberIds)||!Array.isArray(note.tags)||note.tags.some(tag=>typeof tag!=='string'))fail('candidate-reference');
      note.id=maps[field].get(note.id);note.songId=ref(note.songId,'songs');note.showId=ref(note.showId,'shows');
      memberFields(note);
      // Character/line positions, text, pitch, legacy hand and zero timestamps stay exact.
    }
    for(const field of dictionaries){
      const additions=candidate[field]||{};
      for(const key of Object.keys(additions)){
        const parts=key.split('|');if(parts.length!==2)fail('candidate-reference');
        const mapped=ref(parts[0],'shows')+'|'+ref(parts[1],'songs');
        const value=additions[key];
        if(field==='subs'||field==='gsubs'){
          if(!object(value))fail('candidate-reference');
          for(const index of Object.keys(value))value[index]=memberIds(value[index]);
        }
        if(own(next[field]||{},mapped))fail('dictionary-conflict');
        if(!own(next,field))next[field]={};next[field][mapped]=value;
      }
    }
    const rosterAdditions=candidate.rosters||{};
    for(const [name,roster] of Object.entries(rosterAdditions)){
      if(!groupNames.has(name)||!Array.isArray(roster)||roster.some(value=>typeof value!=='string'))fail('candidate-reference');
      const mapped=groupNames.get(name);if(own(next.rosters||{},mapped))fail('dictionary-conflict');
      if(!own(next,'rosters'))next.rosters={};next.rosters[mapped]=roster;
    }
    for(const field of ['folderOrder','groupOrder'])for(const original of candidate[field]||[]){
      if(field==='groupOrder'&&!groupNames.has(original))fail('candidate-reference');
      const value=field==='groupOrder'?groupNames.get(original):original;
      if(!(next[field]||[]).includes(value)){if(!own(next,field))next[field]=[];next[field].push(value);counts[field]++;}
    }
    for(const field of lists)if((candidate[field]||[]).length){if(!own(next,field))next[field]=[];next[field].push(...candidate[field]);}
    const focusShowId=own(candidate,'showId')?ref(candidate.showId,'shows'):(candidate.shows[0]?.id||'');
    const focusShow=candidate.shows.find(show=>show.id===focusShowId);
    const focusGroupId=own(candidate,'groupId')?ref(candidate.groupId,'groups'):(focusShow?.groupId||candidate.groups?.[0]?.id||'');
    if(!own(next,'recoveredShowSources'))next.recoveredShowSources={};
    next.recoveredShowSources[source.sha256]={version:input.version,source:copy(source),counts:copy(counts),focusShowId,focusGroupId};
    if(archiveChanges){
      next.recoveredShowSources[source.sha256].supersedes=copy(input.supersedes);
      next.recoveredShowSources[source.sha256].archiveChanges=copy(archiveChanges);
    }
    if(own(options,'packState')){
      if(typeof options.packState!=='function')fail('candidate-invalid');
      let packed;try{packed=copy(options.packState(copy(next)));}catch(_){fail('state-invalid');}
      if(!object(packed))fail('state-invalid');size(packed);
    }else size(next);
    if(own(options,'validateState')){
      if(typeof options.validateState!=='function')fail('candidate-invalid');
      try{if(options.validateState(copy(next))===false)fail('state-invalid');}catch(_){fail('state-invalid');}
    }
    return {state:next,counts,focusShowId,focusGroupId,...(archiveChanges?{archiveChanges}:{})};
  }
  const api=Object.freeze({merge,MAX_BYTES});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupRecoveredShowAddition=api;
})(typeof globalThis!=='undefined'?globalThis:this);
