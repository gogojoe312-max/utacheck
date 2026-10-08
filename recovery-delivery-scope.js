/* Plan a bounded reconnection to existing delivery destinations. No I/O or credentials. */
(function(root){
  'use strict';
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const unsafe=new Set(['__proto__','prototype','constructor']);
  const privateFields=new Set(['creds','credentials','ghToken','token','apiKey','password','passphrase','secret','key',
    'bkKey','bkGistId','editPass','srcKey','srcGist','srcGroup','linkSrc','lastKey','gistId','recs','rsongs','rsongId',
    'staffMemos','draws','trash','plan','subLib','subsMan','pubNotes','songLib','xls','xlsAt','xlsSourceId','micSheet','micMap',
    'originalText','recoveredShowSources','recoveredFromOriginalExcel','archive','archived']);
  const HASH=/^[a-f0-9]{64}$/;
  const GIST=/^[a-f0-9]{32}$/;
  const MAX_DEPTH=128,MAX_NODES=1000000,MAX_STATE_NODES=2000000,MAX_STATE_BYTES=100*1024*1024,MAX_PUBLICATION_BYTES=20*1024*1024;
  const failures=new WeakSet();
  // Capture this engine's intrinsic formatting: WebKit uses multiline native bodies.
  const functionSource=Function.prototype.toString;
  const nativeObjectSource=functionSource.call(Object),nativeArraySource=functionSource.call(Array);
  const fail=(code,targetNumber)=>{const error=new Error(code);error.code=code;error.recoveryDeliveryCode=code;if(Number.isSafeInteger(targetNumber)&&targetNumber>0&&targetNumber<=100)error.targetNumber=targetNumber;failures.add(error);throw error;};
  const ident=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[|\x00-\x1f]/.test(value)&&!unsafe.has(value);
  const name=value=>typeof value==='string'&&value.trim().length>0&&value.length<=4096&&!/[\x00-\x1f]/.test(value)&&!unsafe.has(value);
  const strings=value=>Array.isArray(value)&&value.every(item=>typeof item==='string');
  function plainPrototype(value){
    const proto=Object.getPrototypeOf(value);
    if(proto===null)return !Array.isArray(value);
    const descriptor=Object.getOwnPropertyDescriptor(proto,'constructor');
    if(!descriptor||!own(descriptor,'value')||typeof descriptor.value!=='function')return false;
    if(functionSource.call(descriptor.value)!==(Array.isArray(value)?nativeArraySource:nativeObjectSource))return false;
    const prototype=Object.getOwnPropertyDescriptor(descriptor.value,'prototype');
    return !!prototype&&own(prototype,'value')&&prototype.value===proto;
  }
  // Inspect descriptors first. No accessor, toJSON, or inherited hook is executed.
  function copy(value,mode='json'){
    let nodes=0;
    const ancestors=new Set();
    function visit(item,depth){
      if(++nodes>(mode==='state'?MAX_STATE_NODES:MAX_NODES)||depth>MAX_DEPTH)fail('data-limit');
      if(item===undefined&&mode==='state')return undefined;
      if(item===undefined&&mode==='publication')return null;
      if(item===null||typeof item==='string'||typeof item==='boolean')return item;
      if(typeof item==='number'){if(!Number.isFinite(item))fail('unsafe-data');return item;}
      if(typeof item!=='object'||ancestors.has(item)||!plainPrototype(item))fail('unsafe-data');
      ancestors.add(item);
      const array=Array.isArray(item),out=array?[]:Object.getPrototypeOf(item)===null?Object.create(null):{};
      const keys=Reflect.ownKeys(item);
      if(array&&keys.length!==item.length+1)fail('unsafe-data');
      for(const key of keys){
        if(array&&key==='length')continue;
        if(typeof key!=='string'||unsafe.has(key))fail('unsafe-key');
        if(mode==='publication'&&privateFields.has(key))fail('publication-private-field');
        const descriptor=Object.getOwnPropertyDescriptor(item,key);
        if(!descriptor||!own(descriptor,'value')||!descriptor.enumerable)fail('unsafe-data');
        if(array&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=item.length))fail('unsafe-data');
        // publicationData intentionally leaves optional object fields undefined.
        // The actual JSON wire representation omits those fields.
        if(!array&&mode==='publication'&&descriptor.value===undefined)continue;
        out[key]=visit(descriptor.value,depth+1);
      }
      ancestors.delete(item);return out;
    }
    return visit(value,0);
  }
  function bytes(value,limit){if(new TextEncoder().encode(JSON.stringify(value)).byteLength>limit)fail('data-limit');}
  function only(value,allowed,code){if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(code);}
  function exact(value,allowed,code){only(value,allowed,code);if(allowed.some(key=>!own(value,key)))fail(code);}
  function ids(value,code){
    if(!Array.isArray(value)||!value.length||value.some(id=>!ident(id))||new Set(value).size!==value.length)fail(code);
    return new Set(value);
  }
  function source(src,gistId){
    // Matching the original string rejects ports, query strings, fragments,
    // escaped separators, revision URLs, and URL-normalized traversal.
    if(typeof src!=='string'||src.length>2048||!GIST.test(gistId))fail('destination-invalid');
    const match=src.match(/^https:\/\/gist\.githubusercontent\.com\/([A-Za-z0-9_-]+)\/([a-f0-9]{32})\/raw\/utacheck\.json$/);
    if(!match||match[2]!==gistId)fail('destination-invalid');
    return src;
  }
  function existingSourceId(value){
    if(typeof value!=='string'||!value)return '';
    // Collision detection is deliberately broader than target validation: an
    // old cache query, fragment, explicit port or pinned revision must not hide
    // another binding to the same Gist. Never use this normalization for I/O.
    try{
      const url=new URL(value);
      if(!['https:','http:'].includes(url.protocol)||url.hostname.toLowerCase()!=='gist.githubusercontent.com')return '';
      const parts=[];
      for(const part of decodeURIComponent(url.pathname).split('/')){
        if(!part||part==='.')continue;
        if(part==='..')parts.pop();else parts.push(part);
      }
      const path='/'+parts.join('/');
      const match=path.match(/^\/[A-Za-z0-9_-]+\/([a-f0-9]{32})\/raw\/(?:[a-f0-9]{40}\/)?utacheck\.json$/i);
      return match?match[1].toLowerCase():'';
    }catch(_){return '';}
  }
  function index(rows,claimed){
    if(!Array.isArray(rows))fail('state-invalid');
    const result=new Map();
    for(const row of rows){
      if(!object(row)||!ident(row.id))fail('state-identity');
      if(result.has(row.id)||claimed.has(row.id))fail('state-identity-collision');
      result.set(row.id,row);claimed.add(row.id);
    }
    return result;
  }
  const excluded=show=>!!show.hidden||show.recoverySource==='original-workbooks'||!!show.archive||!!show.archived;
  function implementationPlan(current,packet){
    const next=copy(current,'state'),input=copy(packet);
    if(!object(next))fail('state-invalid');
    bytes(next,MAX_STATE_BYTES);bytes(input,1024*1024);
    exact(input,['app','version','targets'],'packet-invalid');
    if(input.app==='utacheck-existing-delivery'&&input.version===1)fail('packet-version');
    if(input.app!=='utacheck-existing-delivery'||input.version!==2||!Array.isArray(input.targets)||!input.targets.length||input.targets.length>100)fail('packet-invalid');
    const claimed=new Set(),groups=index(next.groups,claimed),shows=index(next.shows,claimed),songs=index(next.songs,claimed);
    if(!object(next.recoveredShowSources))fail('source-receipt-missing');
    const showSongs=new Map();
    for(const song of songs.values()){
      if(!showSongs.has(song.showId))showSongs.set(song.showId,[]);
      showSongs.get(song.showId).push(song);
    }
    const ownership=show=>{
      if(show.groupId!=null&&show.groupId!=='')return groups.has(show.groupId)?show.groupId:'';
      const rows=showSongs.get(show.id)||[];
      const groupIds=new Set(rows.map(song=>song.groupId));
      return groupIds.size===1&&groups.has(rows[0]?.groupId)?rows[0].groupId:'';
    };
    const targets=[],targetGroups=new Set(),targetGists=new Set(),targetShows=new Set();
    const changes={groups:0,shows:0,songs:0,connections:0,groupFlags:0,showFlags:0};
    for(const [targetIndex,target] of input.targets.entries()){
      exact(target,['sourceSha256','expectedRemoteSha256','groupName','gistId','src','sourceShowIds'],'target-invalid');
      if(typeof target.sourceSha256!=='string'||!HASH.test(target.sourceSha256)||typeof target.expectedRemoteSha256!=='string'||!HASH.test(target.expectedRemoteSha256))fail('source-hash-invalid');
      if(!name(target.groupName))fail('group-name-invalid');
      source(target.src,target.gistId);
      const requested=ids(target.sourceShowIds,'source-show-identity');
      const receipt=own(next.recoveredShowSources,target.sourceSha256)?next.recoveredShowSources[target.sourceSha256]:null;
      if(!object(receipt)||!object(receipt.source)||receipt.source.sha256!==target.sourceSha256||!ident(receipt.focusGroupId)||!groups.has(receipt.focusGroupId))fail('source-receipt-mismatch',targetIndex+1);
      const group=groups.get(receipt.focusGroupId);
      if(group.name!==target.groupName)fail('group-name-mismatch');
      if(targetGroups.has(group.id))fail('duplicate-target-group');
      if(targetGists.has(target.gistId))fail('duplicate-target-destination');
      targetGroups.add(group.id);targetGists.add(target.gistId);
      if(group.key!=null&&group.key!==''||group.enc||group.encrypted)fail('encrypted-destination-unsupported');
      for(const field of ['gistId','src'])if(group[field]!=null&&group[field]!==''&&group[field]!==target[field])fail('existing-destination-conflict');
      for(const other of groups.values())if(other.id!==group.id&&(
        typeof other.gistId==='string'&&other.gistId.toLowerCase()===target.gistId||existingSourceId(other.src)===target.gistId))fail('destination-collision');
      const matches=new Map();
      for(const show of shows.values()){
        if(excluded(show)||!own(show,'recoveredSourceShowId')||ownership(show)!==group.id)continue;
        if(!ident(show.recoveredSourceShowId))fail('source-show-identity');
        if(matches.has(show.recoveredSourceShowId))fail('source-show-collision');
        matches.set(show.recoveredSourceShowId,show);
      }
      if(matches.size!==requested.size||[...matches.keys()].some(id=>!requested.has(id)))fail('source-show-set-mismatch');
      const localIds=[];
      for(const id of target.sourceShowIds){
        const show=matches.get(id);
        if(!show)fail('source-show-set-mismatch');
        if(targetShows.has(show.id))fail('duplicate-target-show');
        targetShows.add(show.id);localIds.push(show.id);
        if(show.deliveryMode!=null&&show.deliveryMode!==''&&show.deliveryMode!=='show')fail('show-delivery-conflict');
        if(own(show,'deliveryGroupId')&&show.deliveryGroupId!==undefined&&show.deliveryGroupId!==null&&show.deliveryGroupId!==group.id)fail('show-delivery-conflict');
        const rows=showSongs.get(show.id)||[];
        if(!rows.length)fail('show-has-no-songs');
        for(const song of rows){
          if(song.recoveredFromOriginalExcel||song.hidden||song.archived||song.archive)fail('song-not-public');
          if(song.deliveryMode!=null&&song.deliveryMode!==''&&song.deliveryMode!=='show')fail('song-delivery-conflict');
          if(own(song,'deliveryGroupId')&&song.deliveryGroupId!==undefined&&song.deliveryGroupId!==null&&song.deliveryGroupId!==group.id)fail('song-delivery-conflict');
          if(song.groupId!=null&&song.groupId!==''&&!groups.has(song.groupId))fail('song-group-unresolved');
          if(song.groupId&&song.groupId!==group.id&&groups.get(song.groupId)?.nopub)fail('song-delivery-conflict');
          // Explicit show ownership (or all songs' one valid group) is required.
          // Unlike the UI, this planner never guesses a group from a title.
          if(ownership(show)!==group.id)fail('song-group-unresolved');
        }
        changes.songs+=rows.length;
      }
      targets.push({groupId:group.id,groupName:target.groupName,gistId:target.gistId,src:target.src,
        showIds:localIds,sourceShowIds:target.sourceShowIds.slice(),sourceSha256:target.sourceSha256,expectedRemoteSha256:target.expectedRemoteSha256});
    }
    // All destinations and routes are validated before changing even the copy.
    for(const target of targets){
      const group=groups.get(target.groupId);
      if(group.gistId!==target.gistId||group.src!==target.src)changes.connections++;
      if(group.nopub!==false)changes.groupFlags++;
      group.nopub=false;group.gistId=target.gistId;group.src=target.src;
      for(const id of target.showIds){const show=shows.get(id);if(show.nopub!==false)changes.showFlags++;show.nopub=false;}
      changes.groups++;changes.shows+=target.showIds.length;
    }
    return {state:next,targets,changes};
  }
  const fields={
    publication:['version','authorId','src','groupName','members','rosters','alert','groupOrder','folderOrder','lib','songs','shows','gsubs','subs','notes','memos','focusShow'],
    show:['id','name','ts','folder','from','nopub','hidden','absent','recoveredSourceShowId','recoverySource'],
    song:['showId','libIdx','take','fromIdx'],
    library:['title','credit','groups','order','lines','sections','groupRows'],
    note:['songIdx','lineIdx','memberNames','tags','memo','hand','pitch','lineEnd','from','to','showId','at'],
    memo:['showId','songIdx','text'],sub:['showId','songIdx','lineIdx','names'],gsub:['showId','songIdx','block','names']
  };
  function validateHand(hand,bad){
    // Historical public handwriting is kept intact, but it is not an escape
    // hatch for arbitrary editor/private objects. These legacy shapes are
    // covered by the app's recovery, note-layout and recording fixtures.
    only(hand,['text','state','v','cells','paths','points','strokes','x'],bad);
    for(const key of ['text','state'])if(hand[key]!=null&&typeof hand[key]!=='string')fail(bad);
    if(hand.v!=null&&(!Number.isSafeInteger(hand.v)||hand.v<0))fail(bad);
    function geometry(value){
      if(value===null||typeof value==='number')return;
      if(Array.isArray(value)){value.forEach(geometry);return;}
      if(object(value)){
        only(value,['x','y'],bad);
        if(!own(value,'x')||!own(value,'y')||typeof value.x!=='number'||typeof value.y!=='number')fail(bad);
        return;
      }
      fail(bad);
    }
    for(const key of ['cells','paths','points','strokes','x'])if(hand[key]!=null){
      if(!Array.isArray(hand[key]))fail(bad);geometry(hand[key]);
    }
  }
  function validatePublication(publication,target,remote){
    const bad=remote?'remote-publication-invalid':'payload-publication-invalid';
    only(publication,fields.publication,bad);
    if(publication.groupName!==target.groupName)fail(remote?'remote-group-mismatch':'payload-group-mismatch');
    if(!Array.isArray(publication.shows)||!Array.isArray(publication.songs)||!Array.isArray(publication.lib))fail(bad);
    if(!publication.shows.length||!publication.songs.length||!publication.lib.length)fail(remote?'remote-publication-empty':'payload-publication-empty');
    if(own(publication,'version')&&(!Number.isSafeInteger(publication.version)||publication.version<0))fail(bad);
    if(own(publication,'authorId')&&typeof publication.authorId!=='string')fail(bad);
    if(own(publication,'src')&&(typeof publication.src!=='string'||publication.src&&publication.src!==target.src))fail(remote?'remote-source-mismatch':'payload-source-mismatch');
    const sourceIds=new Set(target.sourceShowIds),localIds=new Set(target.showIds),localToSource=new Map(target.showIds.map((id,i)=>[id,target.sourceShowIds[i]]));
    const showMap=new Map(),sourceSeen=new Set();
    for(const show of publication.shows){
      only(show,fields.show,bad);
      if(!ident(show.id)||showMap.has(show.id)||typeof show.name!=='string'||!show.name||excluded(show)||show.nopub)fail(bad);
      if(own(show,'hidden')&&![false,0,null].includes(show.hidden)||own(show,'nopub')&&![false,0,null].includes(show.nopub))fail(bad);
      if(show.ts!=null&&(typeof show.ts!=='number'||!Number.isFinite(show.ts)||show.ts<0))fail(bad);
      if(show.folder!=null&&typeof show.folder!=='string'||own(show,'absent')&&!strings(show.absent))fail(bad);
      if(own(show,'from')&&show.from!==null&&show.from!==''&&!ident(show.from))fail(bad);
      if(show.recoverySource!=null&&typeof show.recoverySource!=='string')fail(bad);
      if(show.recoveredSourceShowId!=null&&show.recoveredSourceShowId!==''&&!ident(show.recoveredSourceShowId))fail(bad);
      if(remote){
        const original=show.recoveredSourceShowId||show.id;
        if(!sourceIds.has(original)||sourceSeen.has(original)||show.id!==original&&localToSource.get(show.id)!==original)fail('remote-show-out-of-scope');
        sourceSeen.add(original);
      }else if(!localIds.has(show.id)||show.recoveredSourceShowId&&show.recoveredSourceShowId!==localToSource.get(show.id))fail('payload-show-out-of-scope');
      showMap.set(show.id,show);
    }
    if(!remote&&(showMap.size!==localIds.size||[...localIds].some(id=>!showMap.has(id))))fail('payload-show-set-mismatch');
    if(!remote&&[...showMap.values()].some(show=>show.from!=null&&show.from!==''&&!localIds.has(show.from)))fail('payload-show-reference-out-of-scope');
    for(const entry of publication.lib){
      only(entry,fields.library,bad);
      if(typeof entry.title!=='string'||!Array.isArray(entry.lines)||entry.lines.some(row=>!Array.isArray(row)||row.length<2||row.length>9||row[0]!==null&&typeof row[0]!=='string'||typeof row[1]!=='string'||row.some(cell=>cell!==null&&typeof cell!=='string')))fail(bad);
      if(entry.credit!=null&&typeof entry.credit!=='string'||own(entry,'order')&&!strings(entry.order)||own(entry,'groups')&&!object(entry.groups))fail(bad);
      for(const names of Object.values(entry.groups||{}))if(!strings(names))fail(bad);
      if(own(entry,'sections')){
        if(!Array.isArray(entry.sections))fail(bad);
        for(const section of entry.sections){only(section,['lineIdx','name'],bad);if(!Number.isSafeInteger(section.lineIdx)||section.lineIdx<0||section.lineIdx>=entry.lines.length||typeof section.name!=='string')fail(bad);}
      }
      if(own(entry,'groupRows')){
        if(!Array.isArray(entry.groupRows))fail(bad);
        for(const row of entry.groupRows){only(row,['b','ncell','lcell'],bad);if(typeof row.b!=='string'||own(row,'ncell')&&typeof row.ncell!=='string'||own(row,'lcell')&&typeof row.lcell!=='string')fail(bad);}
      }
    }
    const usedShows=new Set(),usedLib=new Set();
    for(const [i,song] of publication.songs.entries()){
      only(song,fields.song,bad);
      if(!showMap.has(song.showId)||!Number.isSafeInteger(song.libIdx)||song.libIdx<0||song.libIdx>=publication.lib.length)fail(bad);
      if(own(song,'take')&&(!Number.isSafeInteger(song.take)||song.take<1))fail(bad);
      if(song.fromIdx!=null&&(!Number.isSafeInteger(song.fromIdx)||song.fromIdx<0||song.fromIdx>=publication.songs.length||song.fromIdx===i))fail(bad);
      usedShows.add(song.showId);usedLib.add(song.libIdx);
    }
    if(usedShows.size!==showMap.size||usedLib.size!==publication.lib.length)fail(bad);
    const visited=new Set();
    for(let i=0;i<publication.songs.length;i++){
      let at=i;const path=new Set();
      while(at!=null&&!visited.has(at)){if(path.has(at))fail(bad);path.add(at);at=publication.songs[at].fromIdx;}
      for(const at of path)visited.add(at);
    }
    if(own(publication,'members')){
      if(!Array.isArray(publication.members))fail(bad);
      for(const member of publication.members){only(member,['name'],bad);if(!name(member.name))fail(bad);}
    }
    if(own(publication,'rosters')&&(!object(publication.rosters)||Object.entries(publication.rosters).some(([key,names])=>key!==target.groupName||!strings(names))))fail(bad);
    for(const field of ['folderOrder','groupOrder'])if(own(publication,field)&&!strings(publication[field]))fail(bad);
    if(publication.groupOrder?.some(value=>value!==target.groupName))fail(bad);
    if(!remote){
      const folders=new Set([...showMap.values()].map(show=>show.folder).filter(Boolean));
      if(publication.folderOrder?.some(value=>!folders.has(value)))fail('payload-folder-out-of-scope');
    }
    if(own(publication,'focusShow')&&(typeof publication.focusShow!=='string'||publication.focusShow&&!showMap.has(publication.focusShow)))fail(bad);
    if(publication.alert!=null){
      only(publication.alert,['id','text','at','to'],bad);
      if(!ident(publication.alert.id)||typeof publication.alert.text!=='string'||!Number.isSafeInteger(publication.alert.at)||publication.alert.at<0||own(publication.alert,'to')&&!strings(publication.alert.to))fail(bad);
      if(!remote&&publication.alert.to?.some(id=>id!==target.groupId))fail('payload-alert-out-of-scope');
    }
    for(const field of ['notes','memos','subs','gsubs']){
      if(own(publication,field)&&!Array.isArray(publication[field]))fail(bad);
      const seen=new Set();
      for(const row of publication[field]||[]){
        only(row,fields[field==='notes'?'note':field==='memos'?'memo':field==='subs'?'sub':'gsub'],bad);
        if(!Number.isSafeInteger(row.songIdx)||row.songIdx<0||row.songIdx>=publication.songs.length)fail('publication-song-reference');
        const song=publication.songs[row.songIdx],entry=publication.lib[song.libIdx];
        if(row.showId!=null&&row.showId!==''&&row.showId!==song.showId)fail('publication-show-reference');
        if((field==='notes'||field==='subs')&&(!Number.isSafeInteger(row.lineIdx)||row.lineIdx<0||row.lineIdx>=entry.lines.length))fail('publication-line-reference');
        if(field==='notes'){
          if(own(row,'memberNames')&&!strings(row.memberNames)||own(row,'tags')&&!strings(row.tags)||own(row,'memo')&&typeof row.memo!=='string'||row.pitch!=null&&typeof row.pitch!=='string'||row.hand!=null&&!object(row.hand))fail(bad);
          if(row.hand!=null)validateHand(row.hand,bad);
          if(row.lineEnd!=null&&(!Number.isSafeInteger(row.lineEnd)||row.lineEnd<row.lineIdx||row.lineEnd>=entry.lines.length)||row.at!=null&&(typeof row.at!=='number'||!Number.isFinite(row.at)||row.at<0))fail(bad);
          for(const position of [row.from,row.to])if(position!=null&&(!Number.isSafeInteger(position)||position<0||position>entry.lines[row.lineIdx][1].length))fail(bad);
          if((row.from==null)!==(row.to==null)||row.from!=null&&row.from>row.to)fail(bad);
        }else{
          if(field==='memos'&&typeof row.text!=='string'||(field==='subs'||field==='gsubs')&&!strings(row.names)||field==='gsubs'&&(!ident(row.block)||!own(entry.groups||{},row.block)))fail(bad);
          const key=row.songIdx+'|'+(field==='subs'?row.lineIdx:field==='gsubs'?row.block:'');
          if(seen.has(key))fail('publication-reference-collision');seen.add(key);
        }
      }
    }
    return {shows:publication.shows.length,songs:publication.songs.length,notes:(publication.notes||[]).length,memos:(publication.memos||[]).length};
  }
  function validatedScope(target){
    const scope=copy(target);
    exact(scope,['groupId','groupName','gistId','src','showIds','sourceShowIds','sourceSha256','expectedRemoteSha256'],'target-invalid');
    if(!ident(scope.groupId)||!name(scope.groupName)||!HASH.test(scope.sourceSha256)||!HASH.test(scope.expectedRemoteSha256))fail('target-invalid');
    source(scope.src,scope.gistId);ids(scope.showIds,'target-invalid');ids(scope.sourceShowIds,'target-invalid');
    if(scope.showIds.length!==scope.sourceShowIds.length)fail('target-invalid');
    return scope;
  }
  // This is a shape/scope check, not an authenticity or freshness check.
  // The transport must hash the exact fetched bytes against expectedRemoteSha256
  // and check that same version again immediately before writing.
  function implementationVerify(target,remote,payload){
    const scope=validatedScope(target),prior=copy(remote,'publication'),next=copy(payload,'publication');
    bytes(prior,MAX_PUBLICATION_BYTES);bytes(next,MAX_PUBLICATION_BYTES);
    return {ok:true,remote:validatePublication(prior,scope,true),payload:validatePublication(next,scope,false)};
  }
  // Compare validated wire content, not editor IDs, global array indexes or
  // compact-library layout. Only explicit, known wire defaults are equivalent.
  // No text trimming, title matching, arbitrary omission or roster sorting is used.
  function canonicalShows(publication,libraryIdentities){
    const sources=new Map(publication.shows.map(show=>[show.id,show.recoveredSourceShowId||show.id]));
    const positions=new Map(),counts=new Map(),songsByShow=new Map(),records=new Map();
    const stable=value=>{
      if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
      if(object(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
      return JSON.stringify(value);
    };
    const optional=value=>value==null?null:value;
    const empty=value=>value==null?'':value;
    const sourceReference=value=>value==null||value===''?null:(sources.get(value)||value);
    publication.songs.forEach((song,index)=>{
      const ordinal=counts.get(song.showId)||0;counts.set(song.showId,ordinal+1);
      positions.set(index,[sources.get(song.showId),ordinal]);
      if(!songsByShow.has(song.showId))songsByShow.set(song.showId,[]);
      songsByShow.get(song.showId).push(index);
      records.set(index,{notes:[],memos:[],subs:[],gsubs:[]});
    });
    for(const field of ['notes','memos','subs','gsubs'])for(const row of publication[field]||[]){
      // showId is a checked, redundant locator and songIdx becomes this bucket.
      let normalized;
      if(field==='notes')normalized={lineIdx:row.lineIdx,memberNames:row.memberNames||[],tags:row.tags||[],memo:empty(row.memo),
        hand:optional(row.hand),pitch:row.pitch||null,lineEnd:optional(row.lineEnd),
        from:optional(row.from),to:optional(row.to),at:optional(row.at)};
      else if(field==='memos')normalized={text:row.text};
      else if(field==='subs')normalized={lineIdx:row.lineIdx,names:row.names};
      else normalized={block:row.block,names:row.names};
      records.get(row.songIdx)[field].push(normalized);
    }
    for(const rows of records.values()){
      // These two collections are keyed dictionaries in the editor. Their
      // iteration order is wire layout; singer order inside each value is not.
      rows.subs.sort((a,b)=>a.lineIdx-b.lineIdx);
      rows.gsubs.sort((a,b)=>a.block<b.block?-1:a.block>b.block?1:0);
    }
    const libraries=publication.lib.map(entry=>{
      const content=stable({title:entry.title,credit:empty(entry.credit),
      // Block insertion order can affect performer ordering, so retain it too.
      groups:Object.entries(entry.groups||{}),order:entry.order||[],
      lines:entry.lines.map(row=>Array.from({length:9},(_,index)=>index===1?row[index]:empty(row[index]))),
      sections:entry.sections||[],groupRows:(entry.groupRows||[]).map(row=>({b:row.b,ncell:empty(row.ncell),lcell:empty(row.lcell)}))});
      // Intern full strings across both sides, without lossy hashes or expanding
      // a large aliased library again for every show/song that references it.
      if(!libraryIdentities.has(content))libraryIdentities.set(content,libraryIdentities.size);
      return libraryIdentities.get(content);
    });
    const result=new Map();
    for(const show of publication.shows){
      const content={show:{id:sources.get(show.id),name:show.name,ts:optional(show.ts),folder:empty(show.folder),
        from:sourceReference(show.from),absent:show.absent||[]},songs:(songsByShow.get(show.id)||[]).map(index=>{
          const song=publication.songs[index];
          return {library:libraries[song.libIdx],take:song.take==null?1:song.take,
            from:song.fromIdx==null?null:positions.get(song.fromIdx),...records.get(index)};
        })};
      // The library token identifies its full exact canonical content. Song
      // and note order stays meaningful, without global wire index coupling.
      result.set(sources.get(show.id),stable(content));
    }
    return result;
  }
  function implementationMerge(target,remote,local,preservedShowIds){
    const scope=validatedScope(target),prior=copy(remote,'publication'),candidate=copy(local,'publication');
    bytes(prior,MAX_PUBLICATION_BYTES);bytes(candidate,MAX_PUBLICATION_BYTES);
    const sourceId=show=>show.recoveredSourceShowId||show.id;
    function snapshotScope(value){
      if(!object(value)||!Array.isArray(value.shows)||!value.shows.length)fail('remote-publication-invalid');
      const showIds=[],sourceShowIds=[];
      for(const show of value.shows){
        if(!object(show)||!ident(show.id)||!ident(sourceId(show)))fail('remote-publication-invalid');
        showIds.push(show.id);sourceShowIds.push(sourceId(show));
      }
      if(new Set(showIds).size!==showIds.length||new Set(sourceShowIds).size!==sourceShowIds.length)fail('merge-remote-identity-collision');
      // This expanded scope is derived solely from the exact fetched snapshot,
      // never from a caller-supplied extra destination or guessed show name.
      return {...scope,showIds,sourceShowIds};
    }
    validatePublication(prior,snapshotScope(prior),true);
    validatePublication(candidate,scope,false);
    const remoteShows=new Map(prior.shows.map(show=>[show.id,show]));
    const localSourceMap=new Map(scope.showIds.map((id,i)=>[id,scope.sourceShowIds[i]]));
    for(const show of candidate.shows)if(sourceId(show)!==localSourceMap.get(show.id))fail('merge-local-source-mismatch');
    const equivalentIds=new Set();
    let protectedIds;
    if(preservedShowIds===undefined){
      const libraryIdentities=new Map(),remoteContent=canonicalShows(prior,libraryIdentities),localContent=canonicalShows(candidate,libraryIdentities);
      protectedIds=[];
      for(const show of prior.shows){
        const original=sourceId(show);
        if(localContent.has(original)&&remoteContent.get(original)===localContent.get(original))equivalentIds.add(show.id);
        else protectedIds.push(show.id);
      }
      // Existing protected content must retain its ancestry. The merge cannot
      // map song links across protected/managed subsets, so hold both ends of
      // such links; for show links only a protected child's ancestor needs to
      // stay at its old ID (managed show links can already be mapped safely).
      const held=new Set(protectedIds),dependencies=[];
      for(const show of prior.shows)if(remoteShows.has(show.from))dependencies.push([show.id,show.from]);
      for(const song of prior.songs)if(song.fromIdx!=null){
        const ancestor=prior.songs[song.fromIdx].showId;
        if(song.showId!==ancestor){dependencies.push([song.showId,ancestor]);dependencies.push([ancestor,song.showId]);}
      }
      const dependents=new Map();
      for(const [from,to] of dependencies){if(!dependents.has(from))dependents.set(from,[]);dependents.get(from).push(to);}
      const pending=[...held];
      for(let at=0;at<pending.length;at++)for(const id of dependents.get(pending[at])||[])if(!held.has(id)){held.add(id);pending.push(id);}
      protectedIds=prior.shows.filter(show=>held.has(show.id)).map(show=>show.id);
      for(const id of protectedIds)equivalentIds.delete(id);
    }else{
      protectedIds=copy(preservedShowIds);
      if(!Array.isArray(protectedIds)||protectedIds.some(id=>!ident(id))||new Set(protectedIds).size!==protectedIds.length)fail('merge-protection-invalid');
      if(protectedIds.some(id=>!remoteShows.has(id)))fail('merge-protected-show-missing');
    }
    const protectedSet=new Set(protectedIds);
    for(const show of prior.shows)if(!protectedSet.has(show.id)&&!equivalentIds.has(show.id)&&localSourceMap.get(show.id)!==sourceId(show))fail('merge-unidentified-remote-show');
    const protectedSources=new Map(prior.shows.filter(show=>protectedSet.has(show.id)).map(show=>[sourceId(show),show.id]));
    const heldSet=new Set(),managedSet=new Set(),localToOutput=new Map();
    for(const show of candidate.shows){
      if(protectedSources.has(sourceId(show))){heldSet.add(show.id);localToOutput.set(show.id,protectedSources.get(sourceId(show)));}
      else{
        if(protectedSet.has(show.id))fail('merge-show-identity-collision');
        managedSet.add(show.id);localToOutput.set(show.id,show.id);
      }
    }
    // publicationData's ordinary compact library can alias multiple shows
    // without considering every metadata field. A held show must never supply
    // a managed show's credit, roster or block metadata through that alias.
    // Reconnection uses the app's isolated-library publication path instead.
    const heldLibrary=new Set(candidate.songs.filter(song=>heldSet.has(song.showId)).map(song=>song.libIdx));
    if(candidate.songs.some(song=>managedSet.has(song.showId)&&heldLibrary.has(song.libIdx)))fail('merge-shared-local-library');
    const payload=copy(prior,'publication');
    payload.shows=[];payload.songs=[];payload.lib=[];
    for(const field of ['notes','memos','subs','gsubs'])payload[field]=[];
    function append(value,selected,protectedPart){
      const songMap=new Map(),libraryMap=new Map(),libraryUsed=new Set();
      value.songs.forEach((song,index)=>{if(selected.has(song.showId)){songMap.set(index,payload.songs.length+songMap.size);libraryUsed.add(song.libIdx);}});
      value.lib.forEach((entry,index)=>{if(libraryUsed.has(index)){libraryMap.set(index,payload.lib.length);payload.lib.push(copy(entry,'publication'));}});
      for(const show of value.shows)if(selected.has(show.id)){
        const next=copy(show,'publication');
        if(!protectedPart&&next.from!=null&&next.from!==''){
          if(!localToOutput.has(next.from))fail('merge-local-show-reference');
          next.from=localToOutput.get(next.from);
        }
        payload.shows.push(next);
      }
      value.songs.forEach((song,index)=>{
        if(!songMap.has(index))return;
        const next=copy(song,'publication');next.libIdx=libraryMap.get(song.libIdx);
        if(song.fromIdx!=null){
          if(!songMap.has(song.fromIdx)){if(protectedPart)fail('merge-protected-song-reference');next.fromIdx=null;}
          else next.fromIdx=songMap.get(song.fromIdx);
        }
        payload.songs.push(next);
      });
      for(const field of ['notes','memos','subs','gsubs'])for(const row of value[field]||[])if(songMap.has(row.songIdx)){
        payload[field].push({...copy(row,'publication'),songIdx:songMap.get(row.songIdx)});
      }
      return libraryUsed;
    }
    append(prior,protectedSet,true);
    const managedLibrary=append(candidate,managedSet,false);
    const requiredNames=new Set();
    const addNames=values=>{for(const value of values||[])if(typeof value==='string'&&value)requiredNames.add(value);};
    for(const index of managedLibrary){
      const entry=candidate.lib[index];addNames(entry.order);
      for(const names of Object.values(entry.groups||{}))addNames(names);
    }
    for(const show of candidate.shows)if(managedSet.has(show.id))addNames(show.absent);
    for(const field of ['notes','subs','gsubs'])for(const row of candidate[field]||[]){
      if(managedSet.has(candidate.songs[row.songIdx].showId))addNames(field==='notes'?row.memberNames:row.names);
    }
    // Direct labels can name singers without a block/order entry. Adding only
    // known names actually present in a managed label avoids held-only names.
    const knownNames=[...(candidate.members||[]).map(member=>member.name),...Object.values(candidate.rosters||{}).flat()];
    const labelNames=new Set();
    for(const index of managedLibrary){
      const entry=candidate.lib[index],blocks=entry.groups||{};
      for(const row of entry.lines)for(const column of [0,4,6,7])if(typeof row[column]==='string'){
        const label=row[column].trim();
        if(label&&!own(blocks,label))labelNames.add(label);
        for(const token of label.split(/[・、，,･\/／＋+\s]+/))if(token&&!own(blocks,token))labelNames.add(token);
      }
    }
    for(const known of knownNames)if(known&&labelNames.has(known))requiredNames.add(known);
    payload.members=copy(prior.members||[],'publication');
    const memberNames=new Set(payload.members.map(member=>member.name));
    const localNames=[...(candidate.members||[]).map(member=>member.name),...requiredNames];
    for(const name of localNames)if(requiredNames.has(name)&&!memberNames.has(name)){payload.members.push({name});memberNames.add(name);}
    payload.rosters=copy(prior.rosters||{},'publication');
    const remoteRoster=payload.rosters[scope.groupName]||[],rosterNames=new Set(remoteRoster);
    const extraRoster=[...(candidate.rosters?.[scope.groupName]||[]),...requiredNames];
    for(const name of extraRoster)if(requiredNames.has(name)&&!rosterNames.has(name)){remoteRoster.push(name);rosterNames.add(name);}
    if(own(payload.rosters,scope.groupName)||remoteRoster.length)payload.rosters[scope.groupName]=remoteRoster;
    payload.groupName=scope.groupName;payload.src=scope.src;payload.groupOrder=[scope.groupName];
    const folders=new Set(payload.shows.map(show=>show.folder).filter(Boolean));
    payload.folderOrder=[];
    for(const folder of [...(prior.folderOrder||[]),...(candidate.folderOrder||[]),...folders])if(folders.has(folder)&&!payload.folderOrder.includes(folder))payload.folderOrder.push(folder);
    // Metadata describing this new version can advance. Current alerts, even
    // null or absent alerts, are retained exactly and never replaced locally.
    for(const field of ['version','authorId'])if(own(candidate,field))payload[field]=candidate[field];
    const outputIds=new Set(payload.shows.map(show=>show.id));
    if(own(prior,'focusShow')&&(prior.focusShow===''||outputIds.has(prior.focusShow)))payload.focusShow=prior.focusShow;
    else if(managedSet.has(candidate.focusShow))payload.focusShow=candidate.focusShow;
    else payload.focusShow=payload.shows[0]?.id||'';
    bytes(payload,MAX_PUBLICATION_BYTES);validatePublication(payload,snapshotScope(payload),true);
    return {payload,preservedShowIds:protectedIds.slice(),heldLocalShowIds:scope.showIds.filter(id=>heldSet.has(id)),
      managedLocalShowIds:scope.showIds.filter(id=>managedSet.has(id)),preservedShowNames:protectedIds.map(id=>remoteShows.get(id).name),
      equivalentRemoteShowIds:[...equivalentIds]};
  }
  function guarded(fn,args){try{return fn(...args);}catch(error){if(failures.has(error))throw error;fail('unsafe-data');}}
  const api=Object.freeze({plan:(...args)=>guarded(implementationPlan,args),verifyPublication:(...args)=>guarded(implementationVerify,args),mergePublication:(...args)=>guarded(implementationMerge,args)});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RecoveryDeliveryScope=api;
})(typeof globalThis!=='undefined'?globalThis:this);
