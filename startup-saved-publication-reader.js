/* Read existing, fixed Gist publications. No credentials, storage or writes. */
(function(root){
  'use strict';
  const ID=/^[a-f0-9]{5,40}$/i, REV=/^[a-f0-9]{40}$/i;
  const LIMITS=Object.freeze({endpoints:4,olderRevisions:10,keys:24,apiBytes:32*1024*1024,rawBytes:20*1024*1024,timeoutMs:20000});
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const strings=v=>Array.isArray(v)&&v.every(x=>typeof x==='string');
  const ident=v=>typeof v==='string'&&v.length>0&&v.length<4096&&!v.includes('|')&&!['__proto__','prototype','constructor'].includes(v);
  const fail=code=>{const e=new Error(code);e.savedPublicationCode=code;throw e;};
  const CODES=['cancelled','stale','source-invalid','response-format','response-limit','publication-missing','publication-invalid',
    'encrypted-unconfirmed','http-401','http-403','http-404','http-429','http-error','network-failed','network-timeout','redirect-denied'];
  const safe=e=>CODES.includes(e?.savedPublicationCode)?e.savedPublicationCode:'network-failed';
  const byteLength=s=>new TextEncoder().encode(s).byteLength;
  const copy=v=>JSON.parse(JSON.stringify(v));
  function safeJSON(value){
    const todo=[{value,depth:0}];
    while(todo.length){
      const {value:v,depth}=todo.pop();if(depth>128)fail('publication-invalid');
      if(v===null||typeof v==='string'||typeof v==='boolean')continue;
      if(typeof v==='number'){if(!Number.isFinite(v))fail('publication-invalid');continue;}
      if(!object(v)&&!Array.isArray(v))fail('publication-invalid');
      for(const k of Object.keys(v)){
        if(['__proto__','prototype','constructor'].includes(k))fail('publication-invalid');
        todo.push({value:v[k],depth:depth+1});
      }
    }
  }
  function publicationCounts(d){
    if(!object(d)||typeof d.groupName!=='string'||!d.groupName.trim()||d.groupName.length>4096
        ||typeof d.authorId!=='string'||!Array.isArray(d.shows)||!Array.isArray(d.lib)||!Array.isArray(d.songs))fail('publication-invalid');
    safeJSON(d);
    if(d.version!==undefined&&(!Number.isSafeInteger(d.version)||d.version<0))fail('publication-invalid');
    const shows=new Set();
    for(const sh of d.shows){
      if(!object(sh)||!ident(sh.id)||shows.has(sh.id)||(sh.absent!==undefined&&!strings(sh.absent)))fail('publication-invalid');
      shows.add(sh.id);
    }
    for(const lib of d.lib){
      if(!object(lib)||typeof lib.title!=='string'||!Array.isArray(lib.lines)
          ||lib.lines.some(row=>!Array.isArray(row)||row.length<2||row.length>9||typeof row[0]!=='string'||typeof row[1]!=='string'
            ||row.some(x=>x!==null&&typeof x!=='string'))
          ||(lib.credit!==undefined&&typeof lib.credit!=='string')||(lib.order!==undefined&&!strings(lib.order))
          ||(lib.groups!==undefined&&!object(lib.groups)))fail('publication-invalid');
      for(const names of Object.values(lib.groups||{}))if(!strings(names))fail('publication-invalid');
      if(lib.sections!==undefined&&(!Array.isArray(lib.sections)||lib.sections.some(x=>!object(x)||!Number.isSafeInteger(x.lineIdx)
          ||x.lineIdx<0||x.lineIdx>=lib.lines.length||typeof x.name!=='string')))fail('publication-invalid');
      if(lib.groupRows!==undefined&&(!Array.isArray(lib.groupRows)||lib.groupRows.some(x=>!object(x)||typeof x.b!=='string'
          ||(x.ncell!==undefined&&typeof x.ncell!=='string')||(x.lcell!==undefined&&typeof x.lcell!=='string'))))fail('publication-invalid');
    }
    for(const [i,so] of d.songs.entries()){
      if(!object(so)||!Number.isSafeInteger(so.libIdx)||so.libIdx<0||so.libIdx>=d.lib.length||!shows.has(so.showId)
          ||(so.fromIdx!=null&&(!Number.isSafeInteger(so.fromIdx)||so.fromIdx<0||so.fromIdx>=d.songs.length||so.fromIdx===i))
          ||(so.take!==undefined&&(!Number.isSafeInteger(so.take)||so.take<1)))fail('publication-invalid');
    }
    const visited=new Set();
    for(let i=0;i<d.songs.length;i++){
      let j=i;const path=new Set();
      while(j!=null&&!visited.has(j)){if(path.has(j))fail('publication-invalid');path.add(j);j=d.songs[j].fromIdx;}
      for(const n of path)visited.add(n);
    }
    if(d.members!==undefined&&(!Array.isArray(d.members)||d.members.some(x=>!object(x)||!ident(x.name))))fail('publication-invalid');
    if(d.rosters!==undefined&&(!object(d.rosters)||Object.entries(d.rosters).some(([name,names])=>name!==d.groupName||!strings(names))))fail('publication-invalid');
    for(const field of ['groupOrder','folderOrder'])if(d[field]!==undefined&&!strings(d[field]))fail('publication-invalid');
    for(const field of ['notes','memos','subs','gsubs']){
      if(d[field]!==undefined&&!Array.isArray(d[field]))fail('publication-invalid');
      const seen=new Map();
      for(const x of d[field]||[]){
        if(!object(x)||!Number.isSafeInteger(x.songIdx)||x.songIdx<0||x.songIdx>=d.songs.length)fail('publication-invalid');
        const so=d.songs[x.songIdx],lines=d.lib[so.libIdx].lines;
        if(x.showId!=null&&x.showId!==''&&x.showId!==so.showId)fail('publication-invalid');
        if((field==='notes'||field==='subs')&&(!Number.isSafeInteger(x.lineIdx)||x.lineIdx<0||x.lineIdx>=lines.length))fail('publication-invalid');
        if(field==='notes'){
          if((x.memberNames!==undefined&&!strings(x.memberNames))||(x.tags!==undefined&&!strings(x.tags))
              ||(x.memo!==undefined&&typeof x.memo!=='string')||(x.pitch!=null&&typeof x.pitch!=='string')
              ||(x.lineEnd!=null&&(!Number.isSafeInteger(x.lineEnd)||x.lineEnd<x.lineIdx||x.lineEnd>=lines.length))
              ||(x.at!=null&&(typeof x.at!=='number'||!Number.isFinite(x.at)||x.at<0)))fail('publication-invalid');
          for(const n of [x.from,x.to])if(n!=null&&(!Number.isSafeInteger(n)||n<0||n>lines[x.lineIdx][1].length))fail('publication-invalid');
          if((x.from==null)!==(x.to==null)||(x.from!=null&&x.from>x.to))fail('publication-invalid');
        }else{
          if(field==='memos'&&typeof x.text!=='string')fail('publication-invalid');
          if((field==='subs'||field==='gsubs')&&!strings(x.names))fail('publication-invalid');
          if(field==='gsubs'&&(!ident(x.block)||!own(d.lib[so.libIdx].groups||{},x.block)))fail('publication-invalid');
          const key=x.songIdx+'|'+(field==='subs'?x.lineIdx:field==='gsubs'?x.block:'');
          const value=JSON.stringify(x);
          if(seen.has(key)&&seen.get(key)!==value)fail('publication-invalid');seen.set(key,value);
        }
      }
    }
    if(d.focusShow!==undefined&&(typeof d.focusShow!=='string'||(d.focusShow&&!shows.has(d.focusShow))))fail('publication-invalid');
    return {shows:d.shows.length,songs:d.songs.length,library:d.lib.length,notes:(d.notes||[]).length,
      memos:(d.memos||[]).length,subs:(d.subs||[]).length,gsubs:(d.gsubs||[]).length};
  }
  function rawSource(text,id,owner,fixed){
    // Match the original string as well as URL components: this rejects default
    // ports, encoded separators and URL-normalized traversal before any request.
    if(typeof text!=='string'||text.length>2048)fail('source-invalid');
    const m=text.match(/^https:\/\/gist\.githubusercontent\.com\/([A-Za-z0-9_-]+)\/([a-f0-9]{5,40})\/raw\/(?:(?<revision>[a-f0-9]{40})\/)?utacheck\.json$/i);
    let u;try{u=new URL(text);}catch(_){fail('source-invalid');}
    if(!m||u.protocol!=='https:'||u.hostname!=='gist.githubusercontent.com'||u.username||u.password||u.port||u.search||u.hash
        ||u.pathname.split('/').at(-1)!=='utacheck.json'||u.pathname.split('/')[3]!=='raw'
        ||m[2].toLowerCase()!==id||(owner&&m[1].toLowerCase()!==owner.toLowerCase())||(fixed&&!m.groups.revision))fail('source-invalid');
    return {url:u.href,owner:m[1]};
  }
  function gistCheck(value,id,revision,owner){
    if(!object(value)||typeof value.id!=='string'||value.id.toLowerCase()!==id||!object(value.files)
        ||!object(value.owner)||typeof value.owner.login!=='string'||!/^[A-Za-z0-9_-]+$/.test(value.owner.login)
        ||(owner&&value.owner.login.toLowerCase()!==owner.toLowerCase())||!Array.isArray(value.history)||!value.history.length)fail('response-format');
    const versions=new Set();
    for(const row of value.history){
      if(!object(row)||typeof row.version!=='string'||!REV.test(row.version)||versions.has(row.version.toLowerCase()))fail('response-format');
      versions.add(row.version.toLowerCase());
    }
    if(revision&&value.history[0].version.toLowerCase()!==revision)fail('response-format');
    return value;
  }
  function encryptedHeader(raw){
    if(!object(raw)||raw.enc!==1||Object.keys(raw).length!==4||['enc','salt','iv','data'].some(k=>!own(raw,k)))fail('publication-invalid');
    const b64=v=>typeof v==='string'&&/^[A-Za-z0-9_+/-]+={0,2}$/.test(v)&&v.replace(/=+$/,'').length%4!==1
      &&(!v.includes('=')||v.length%4===0);
    if(['salt','iv','data'].some(k=>!b64(raw[k]))||raw.salt.length>64||raw.iv.length>64)fail('publication-invalid');
    try{
      const bytes=v=>atob(v.replace(/-/g,'+').replace(/_/g,'/')).length;
      if(bytes(raw.salt)!==16||bytes(raw.iv)!==12||bytes(raw.data)<16)fail('publication-invalid');
    }catch(_){fail('publication-invalid');}
  }
  async function read(endpoints,options={}){
    const summary={status:'checked',endpoints:0,invalidEndpoints:0,duplicates:0,requests:0,publications:0,candidates:[],limited:false,limits:{...LIMITS}};
    const publications=[];
    const result=()=>({publications,summary});
    const check=()=>{
      if(options.signal?.aborted)fail('cancelled');
      if(options.isActive){let active=false;try{active=options.isActive()===true;}catch(_){}if(!active)fail('stale');}
    };
    async function request(url,raw){
      check();summary.requests++;
      const controller=new AbortController();let reader,timer,cancel,timeout=false;
      const stopped=new Promise((_,reject)=>{
        cancel=()=>{controller.abort();reject(Object.assign(new Error('cancelled'),{savedPublicationCode:'cancelled'}));};
        options.signal?.addEventListener('abort',cancel,{once:true});
        timer=setTimeout(()=>{timeout=true;controller.abort();reject(Object.assign(new Error('network-timeout'),{savedPublicationCode:'network-timeout'}));},LIMITS.timeoutMs);
      });
      const limit=raw?LIMITS.rawBytes:LIMITS.apiBytes;
      const work=(async()=>{
        const response=await options.fetch(url,{method:'GET',headers:{Accept:raw?'application/json':'application/vnd.github+json'},
          credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',signal:controller.signal});
        check();if(controller.signal.aborted)fail(timeout?'network-timeout':'cancelled');
        if(!response||response.redirected)fail('redirect-denied');
        if(response.url&&response.url!==url)fail('redirect-denied');
        if(!response.ok)fail([401,403,404,429].includes(response.status)?'http-'+response.status:'http-error');
        const length=response.headers?.get?.('content-length');
        if(length!=null&&length!==''&&(!/^\d+$/.test(length)||Number(length)>limit))fail('response-limit');
        let text;
        if(response.body?.getReader){
          reader=response.body.getReader();const chunks=[];let total=0;
          while(true){check();const next=await reader.read();check();if(controller.signal.aborted)fail(timeout?'network-timeout':'cancelled');if(next.done)break;
            if(!(next.value instanceof Uint8Array))fail('response-format');total+=next.value.byteLength;if(total>limit)fail('response-limit');chunks.push(next.value);}
          const bytes=new Uint8Array(total);let offset=0;
          for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
          try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(_){fail('response-format');}
        }else{
          if(typeof response.text!=='function')fail('response-format');text=await response.text();check();
          if(typeof text!=='string')fail('response-format');if(text.length>limit||byteLength(text)>limit)fail('response-limit');
        }
        check();return text;
      })();
      try{return await Promise.race([work,stopped]);}
      catch(error){check();if(error?.savedPublicationCode)throw error;fail(timeout?'network-timeout':'network-failed');}
      finally{
        clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);
        controller.abort();if(reader){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch(_){}try{reader.releaseLock();}catch(_){}}
      }
    }
    async function gist(endpoint,revision,owner){
      const text=await request('https://api.github.com/gists/'+endpoint.id+(revision?'/'+revision:''),false);
      let value;try{value=JSON.parse(text);}catch(_){fail('response-format');}
      return gistCheck(value,endpoint.id,revision,owner||endpoint.owner);
    }
    async function inspect(endpoint,revision,owner,isHistorical,ordinal){
      const candidate={endpoint:ordinal,isHistorical,status:'checking',counts:null};
      try{
        const fixed=await gist(endpoint,revision,owner);check();
        if(!own(fixed.files,'utacheck.json'))fail('publication-missing');
        const file=fixed.files['utacheck.json'];
        if(!object(file)||file.filename!=='utacheck.json'||typeof file.truncated!=='boolean')fail('response-format');
        let text;
        if(file.truncated){
          const source=rawSource(file.raw_url,endpoint.id,owner,true);
          // The file storage hash may differ from the selected Gist revision.
          // This fixed response, owner and filename establish its provenance.
          text=await request(source.url,true);
        }else{
          if(typeof file.content!=='string')fail('response-format');text=file.content;
          if(text.length>LIMITS.rawBytes||byteLength(text)>LIMITS.rawBytes)fail('response-limit');
        }
        let raw;try{raw=JSON.parse(text);}catch(_){fail('publication-invalid');}
        check();let payload=raw;
        if(object(raw)&&own(raw,'enc')){
          encryptedHeader(raw);
          if(!endpoint.keys.length||typeof options.openJSON!=='function')fail('encrypted-unconfirmed');
          let opened=false;
          for(const key of endpoint.keys){
            check();try{payload=await options.openJSON(copy(raw),key);opened=true;}catch(_){check();continue;}
            check();break;
          }
          if(!opened)fail('encrypted-unconfirmed');
          // Validate before cloning: JSON.stringify would silently coerce a
          // non-finite number or remove unsupported values from decrypted data.
          safeJSON(payload);
          let serialized;try{serialized=JSON.stringify(payload);}catch(_){fail('publication-invalid');}
          if(typeof serialized!=='string')fail('publication-invalid');
          if(serialized.length>LIMITS.rawBytes||byteLength(serialized)>LIMITS.rawBytes)fail('response-limit');
          try{payload=JSON.parse(serialized);}catch(_){fail('publication-invalid');}
        }
        candidate.counts=publicationCounts(payload);
        if(payload.version!==undefined)candidate.publicationVersion=payload.version;
        candidate.status=payload.songs.length?'publication-present':'empty';check();
        if(candidate.status==='publication-present')publications.push({id:endpoint.id,payload:copy(payload),revision,isHistorical});
      }catch(error){candidate.status=safe(error);candidate.counts=null;if(['cancelled','stale'].includes(candidate.status))throw error;
        if(candidate.status==='response-limit')summary.limited=true;}
      summary.candidates.push(candidate);return candidate.status;
    }
    try{
      check();if(!Array.isArray(endpoints)){summary.status='source-invalid';return result();}
      if(typeof options.fetch!=='function'){summary.status='reader-unavailable';return result();}
      const unique=new Map();
      for(const entry of endpoints){
        check();
        if(!object(entry)||typeof entry.id!=='string'||!ID.test(entry.id)||entry.keys!==undefined&&!strings(entry.keys)){
          summary.invalidEndpoints++;continue;
        }
        const id=entry.id.toLowerCase();let source;
        try{if(entry.url!==undefined&&entry.url!=='')source=rawSource(entry.url,id,'',false);}catch(_){summary.invalidEndpoints++;continue;}
        if(unique.has(id))summary.duplicates++;
        else if(unique.size>=LIMITS.endpoints){summary.limited=true;continue;}
        else unique.set(id,{id,owner:source?.owner||'',keys:[]});
        const endpoint=unique.get(id);
        if(source&&endpoint.owner&&source.owner.toLowerCase()!==endpoint.owner.toLowerCase()){summary.invalidEndpoints++;continue;}
        if(source)endpoint.owner=source.owner;
        for(const key of entry.keys||[]){
          if(!key||key.length>4096){if(key.length>4096)summary.invalidEndpoints++;continue;}
          if(endpoint.keys.includes(key))continue;
          if(endpoint.keys.length>=LIMITS.keys){summary.limited=true;continue;}
          endpoint.keys.push(key);
        }
      }
      summary.endpoints=unique.size;
      if(!unique.size){summary.status=summary.invalidEndpoints?'source-invalid':'no-existing-publication';return result();}
      let ordinal=0;
      for(const endpoint of unique.values()){
        check();let metadata;
        try{metadata=await gist(endpoint,'');}catch(error){const status=safe(error);if(['cancelled','stale'].includes(status))throw error;
          if(status==='response-limit')summary.limited=true;summary.candidates.push({endpoint:ordinal++,isHistorical:false,status,counts:null});continue;}
        const revision=metadata.history[0].version.toLowerCase(),owner=metadata.owner.login;
        let status=await inspect(endpoint,revision,owner,false,ordinal);
        if(['empty','publication-invalid','publication-missing'].includes(status)){
          const older=metadata.history.slice(1);
          for(const row of older.slice(0,LIMITS.olderRevisions)){
            status=await inspect(endpoint,row.version.toLowerCase(),owner,true,ordinal);
            if(!['empty','publication-invalid','publication-missing'].includes(status))break;
          }
          if(older.length>LIMITS.olderRevisions&&['empty','publication-invalid','publication-missing'].includes(status))summary.limited=true;
        }
        ordinal++;
      }
      check();summary.publications=publications.length;return result();
    }catch(error){publications.length=0;summary.publications=0;summary.candidates=[];summary.status=safe(error);return result();}
  }
  const api=Object.freeze({read});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupSavedPublicationReader=api;
})(typeof globalThis!=='undefined'?globalThis:this);
