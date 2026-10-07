/* Pure recovery of locally cached publication bodies. No storage or shared state. */
(function(root){
  'use strict';
  const MAX=20*1024*1024, own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const fail=code=>{const e=new Error(code);e.localRecoveryCode=code;throw e;};
  const id=v=>typeof v==='string'&&v.length>0&&v.length<4096&&!v.includes('|')&&!['__proto__','prototype','constructor'].includes(v);
  const strings=v=>Array.isArray(v)&&v.every(x=>typeof x==='string');
  const date=v=>Number.isSafeInteger(v)&&v>0&&v<=8640000000000000;
  function boundedText(text){
    if(typeof text!=='string'||text.length>MAX)return false;
    let bytes=0;for(const char of text){const code=char.codePointAt(0);bytes+=code<128?1:code<2048?2:code<65536?3:4;if(bytes>MAX)return false;}
    return true;
  }
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function safeJSON(v){
    if(Array.isArray(v)){for(const x of v)safeJSON(x);return;}
    if(object(v))for(const k of Object.keys(v)){
      if(['__proto__','prototype','constructor'].includes(k))fail('candidate-invalid');
      safeJSON(v[k]);
    }
  }
  function canonical(v){
    if(Array.isArray(v))return v.map(canonical);
    if(object(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
    return v;
  }
  const key=v=>JSON.stringify(canonical(v));
  function stateCheck(s){
    if(!object(s))fail('candidate-invalid');safeJSON(s);
    for(const k of ['members','groups','shows','songs','rsongs','notes','pubNotes','trash'])
      if(s[k]!==undefined&&(!Array.isArray(s[k])||s[k].some(x=>!object(x))))fail('candidate-invalid');
    for(const k of ['memos','staffMemos','draws','recs','folders','rfolders','subs','subsMan','subLib','gsubs','rosters','plan'])
      if(s[k]!==undefined&&!object(s[k]))fail('candidate-invalid');
    if(s.plan?.slots!==undefined&&(!Array.isArray(s.plan.slots)||s.plan.slots.some(x=>!object(x))))fail('candidate-invalid');
    if(s.songLib!==undefined&&(!Array.isArray(s.songLib)||s.songLib.some(x=>!Array.isArray(x)||x.some(l=>!object(l)))))fail('candidate-invalid');
    for(const k of ['songs','rsongs'])for(const song of s[k]||[]){
      const lines=k==='songs'&&song.L!=null?s.songLib?.[song.L]:song.lines;
      if(k==='songs'&&song.L!=null&&(!Number.isSafeInteger(song.L)||song.L<0))fail('candidate-invalid');
      if(!Array.isArray(lines)||lines.some(l=>!object(l)))fail('candidate-invalid');
    }
    for(const m of s.members||[])if(!id(m.id)||!id(m.name))fail('candidate-invalid');
    for(const g of s.groups||[])if(!id(g.id)||typeof g.name!=='string'||(g.lastKey!==undefined&&typeof g.lastKey!=='string'))fail('candidate-invalid');
    for(const sh of s.shows||[])if(!id(sh.id))fail('candidate-invalid');
  }
  function unpack(s){
    if(!Array.isArray(s.songLib))return s;
    for(const so of s.songs||[])if(so.L!=null){so.lines=copy(s.songLib[so.L]);delete so.L;}
    delete s.songLib;return s;
  }
  function hasWork(s){
    return ['songs','rsongs','notes','pubNotes','trash'].some(k=>s[k]?.length)
      ||!!s.plan?.slots?.length||['memos','staffMemos','draws','recs'].some(k=>Object.keys(s[k]||{}).length);
  }
  function counts(s){
    const c={};for(const k of ['shows','songs','rsongs','notes','pubNotes','trash','members','groups'])c[k]=(s[k]||[]).length;
    for(const k of ['memos','staffMemos','draws','recs','subs','gsubs'])c[k]=Object.keys(s[k]||{}).length;
    c.planSlots=s.plan?.slots?.length||0;return c;
  }
  function publicationCheck(d,g){
    if(!object(d)||d.groupName!==g.name||!Array.isArray(d.lib)||!Array.isArray(d.songs)||!Array.isArray(d.shows))fail('publication-invalid');
    safeJSON(d);
    if(d.authorId!==undefined&&typeof d.authorId!=='string')fail('publication-invalid');
    const shows=new Map();
    for(const sh of d.shows){
      if(!object(sh)||!id(sh.id)||shows.has(sh.id)||(sh.absent!==undefined&&!strings(sh.absent)))fail('publication-invalid');
      shows.set(sh.id,sh);
    }
    for(const lib of d.lib){
      if(!object(lib)||typeof lib.title!=='string'||!Array.isArray(lib.lines)
        ||lib.lines.some(row=>!Array.isArray(row)||row.length<2||row.length>9||row.some(x=>x!==null&&typeof x!=='string'))
        ||(lib.order!==undefined&&!strings(lib.order))||(lib.groups!==undefined&&!object(lib.groups)))fail('publication-invalid');
      for(const names of Object.values(lib.groups||{}))if(!strings(names))fail('publication-invalid');
      if(lib.sections!==undefined&&(!Array.isArray(lib.sections)||lib.sections.some(x=>!object(x)||!Number.isSafeInteger(x.lineIdx)
        ||x.lineIdx<0||x.lineIdx>=lib.lines.length||typeof x.name!=='string')))fail('publication-invalid');
    }
    for(const [i,so] of d.songs.entries()){
      if(!object(so)||!Number.isSafeInteger(so.libIdx)||so.libIdx<0||so.libIdx>=d.lib.length||!shows.has(so.showId)
        ||(so.fromIdx!=null&&(!Number.isSafeInteger(so.fromIdx)||so.fromIdx<0||so.fromIdx>=d.songs.length||so.fromIdx===i))
        ||(so.take!==undefined&&(!Number.isSafeInteger(so.take)||so.take<1)))fail('publication-invalid');
    }
    const visited=new Set();
    for(let i=0;i<d.songs.length;i++){
      let j=i;const path=new Set();
      while(j!=null&&!visited.has(j)){
        if(path.has(j))fail('publication-invalid');path.add(j);j=d.songs[j].fromIdx;
      }
      for(const n of path)visited.add(n);
    }
    if(d.members!==undefined&&(!Array.isArray(d.members)||d.members.some(x=>!object(x)||!id(x.name))))fail('publication-invalid');
    if(d.rosters!==undefined&&(!object(d.rosters)||Object.entries(d.rosters).some(([name,names])=>name!==g.name||!strings(names))))fail('publication-invalid');
    for(const k of ['groupOrder','folderOrder'])if(d[k]!==undefined&&!strings(d[k]))fail('publication-invalid');
    for(const field of ['notes','memos','subs','gsubs']){
      if(d[field]!==undefined&&!Array.isArray(d[field]))fail('publication-invalid');
      const seen=new Map();
      for(const x of d[field]||[]){
        if(!object(x)||!Number.isSafeInteger(x.songIdx)||x.songIdx<0||x.songIdx>=d.songs.length)fail('publication-invalid');
        const so=d.songs[x.songIdx],lines=d.lib[so.libIdx].lines;
        if(x.showId!=null&&x.showId!==''&&x.showId!==so.showId)fail('publication-invalid');
        if(field==='notes'||field==='subs'){
          if(!Number.isSafeInteger(x.lineIdx)||x.lineIdx<0||x.lineIdx>=lines.length)fail('publication-invalid');
        }
        if(field==='notes'){
          if((x.memberNames!==undefined&&!strings(x.memberNames))||(x.tags!==undefined&&!strings(x.tags))
            ||(x.memo!==undefined&&typeof x.memo!=='string')||(x.pitch!=null&&typeof x.pitch!=='string')
            ||(x.lineEnd!=null&&(!Number.isSafeInteger(x.lineEnd)||x.lineEnd<x.lineIdx||x.lineEnd>=lines.length))
            ||(x.at!=null&&(typeof x.at!=='number'||!Number.isFinite(x.at)||x.at<0)))fail('publication-invalid');
          for(const v of [x.from,x.to])if(v!=null&&(!Number.isSafeInteger(v)||v<0||v>lines[x.lineIdx][1].length))fail('publication-invalid');
          if((x.from==null)!==(x.to==null)||(x.from!=null&&x.from>x.to))fail('publication-invalid');
        }else{
          if(field==='memos'&&typeof x.text!=='string')fail('publication-invalid');
          if((field==='subs'||field==='gsubs')&&!strings(x.names))fail('publication-invalid');
          if(field==='gsubs'&&(!id(x.block)||!own(d.lib[so.libIdx].groups||{},x.block)))fail('publication-invalid');
          const k=x.songIdx+'|'+(field==='subs'?x.lineIdx:field==='gsubs'?x.block:'');
          if(seen.has(k)&&seen.get(k)!==key(x))fail('publication-conflict');seen.set(k,key(x));
        }
      }
    }
    if(d.focusShow!==undefined&&(typeof d.focusShow!=='string'||(d.focusShow&&!shows.has(d.focusShow))))fail('publication-invalid');
    return shows;
  }
  function build(records,defaults,options={}){
    let valid=[],invalid=0,duplicates=0,pubs=[];
    const result=(status,state,packet)=>({status,summary:{status,records:valid.length,invalidRecords:invalid,
      publications:pubs.length,duplicates,counts:state?counts(state):{}},...(packet?{packet}:{})});
    try{
      if(!Array.isArray(records)||records.length>1024||!object(defaults))return result('candidate-invalid');
      const baseline=copy(defaults);stateCheck(baseline);
      for(const record of records){
        try{
          if(!object(record)||!Number.isSafeInteger(record.seq)||record.seq<0||!Number.isSafeInteger(record.ordinal)||record.ordinal<0)fail('candidate-invalid');
          const raw=JSON.stringify(record.state);if(!raw||!boundedText(raw))fail('candidate-invalid');
          const s=JSON.parse(raw);stateCheck(s);
          if(options.validateState)options.validateState(copy(s));
          valid.push({state:unpack(s),seq:record.seq,ordinal:record.ordinal});
        }catch(_){invalid++;}
      }
      if(!valid.length)return result('no-valid-state');
      valid.sort((a,b)=>b.seq-a.seq||a.ordinal-b.ordinal);
      const highest=valid[0].seq,baseKey=key(valid[0].state);
      if(valid.some(r=>r.seq===highest&&key(r.state)!==baseKey))return result('base-conflict');
      if(valid.some(r=>(options.hasWork||hasWork)(copy(r.state))))return result('original-nonempty');
      const base=Object.assign(baseline,copy(valid[0].state));
      for(const k of ['members','groups','shows','songs','notes'])base[k]=base[k]||[];
      for(const k of ['memos','subs','gsubs','rosters'])base[k]=base[k]||{};
      const byGroup=new Map(),publishedShows=new Map(),authors=new Set();let identityUnconfirmed=false;
      for(const record of [...valid].sort((a,b)=>a.ordinal-b.ordinal||b.seq-a.seq))for(const [groupIndex,g] of (record.state.groups||[]).entries()){
        if(!g.lastKey)continue;
        let d;try{if(!boundedText(g.lastKey))fail('publication-invalid');d=JSON.parse(g.lastKey);}catch(_){fail('publication-invalid');}
        publicationCheck(d,g);
        if(!base.deviceId||!d.authorId)identityUnconfirmed=true;
        if(d.authorId){authors.add(d.authorId);if((base.deviceId&&base.deviceId!==d.authorId)
          ||(record.state.deviceId&&record.state.deviceId!==d.authorId))fail('identity-conflict');}
        if(base.deviceId&&record.state.deviceId&&base.deviceId!==record.state.deviceId)fail('identity-conflict');
        const body=copy(d);delete body.version;const bodyKey=key(body);
        if(byGroup.has(g.id)){
          if(byGroup.get(g.id).bodyKey!==bodyKey)fail('publication-conflict');duplicates++;continue;
        }
        const source={g:copy(g),d,bodyKey,ordinal:record.ordinal,groupIndex};byGroup.set(g.id,source);pubs.push(source);
        for(const sh of d.shows){
          const meta=copy(sh);delete meta.groupId;delete meta.deliveryGroupId;delete meta.deliveryMode;
          const previous=publishedShows.get(sh.id);
          if(previous&&previous.key!==key(meta))fail('show-conflict');
          if(previous)previous.groups.add(g.id);else publishedShows.set(sh.id,{show:meta,key:key(meta),groups:new Set([g.id])});
        }
      }
      if(authors.size>1)fail('identity-conflict');
      if(!pubs.length||!pubs.some(p=>p.d.songs.length))return result('publication-empty',base);
      if(identityUnconfirmed){
        const pending=result('identity-unconfirmed');
        pending.summary.counts={shows:publishedShows.size,songs:pubs.reduce((n,p)=>n+p.d.songs.length,0),notes:pubs.reduce((n,p)=>n+(p.d.notes||[]).length,0)};
        return pending;
      }
      if(typeof options.buildSong!=='function')return result('builder-required');
      // payloadKey removes the publication version. A saved-state date cannot
      // establish when these lyrics were published, including across groups.
      const sourceDateUnknown=true,at=options.now;
      if(!date(at))return result('creation-time-required');
      const used=new Set(),members=new Map(),memberIds=new Map();
      for(const list of ['members','groups','shows','songs','rsongs','notes','pubNotes','trash'])for(const x of base[list]||[])if(id(x.id))used.add(x.id);
      // Orphaned private maps may still refer to IDs absent from the lists.
      // Reserve their components before assigning any new local identifiers.
      for(const field of ['memos','staffMemos','draws','recs','subs','subsMan','gsubs','subLib'])
        for(const k of Object.keys(base[field]||{}))for(const component of k.split('|'))if(id(component))used.add(component);
      for(const m of base.members){
        if((members.has(m.name)&&members.get(m.name).id!==m.id)||(memberIds.has(m.id)&&memberIds.get(m.id)!==m.name))fail('member-conflict');
        members.set(m.name,m);memberIds.set(m.id,m.name);
      }
      let memberIndex=0;
      function unique(prefix){let suffix=0,value=prefix;while(used.has(value))value=prefix+'-'+(++suffix);used.add(value);return value;}
      function addMember(name){
        if(!id(name))fail('publication-invalid');if(members.has(name))return members.get(name);
        const m={id:unique('local-pub-member-'+valid[0].ordinal+'-'+memberIndex++),name};base.members.push(m);members.set(name,m);return m;
      }
      const localGroups=new Map();for(const g of base.groups){if(localGroups.has(g.id)&&key(localGroups.get(g.id))!==key(g))fail('publication-conflict');localGroups.set(g.id,g);}
      const existingShows=new Map();for(const sh of base.shows){if(existingShows.has(sh.id)&&key(existingShows.get(sh.id))!==key(sh))fail('show-conflict');existingShows.set(sh.id,sh);}
      for(const p of pubs){
        const existing=localGroups.get(p.g.id);if(existing&&existing.name!==p.g.name)fail('publication-conflict');
        if(!existing){base.groups.push(copy(p.g));localGroups.set(p.g.id,base.groups.at(-1));}
        for(const m of p.d.members||[])addMember(m.name);
        for(const [name,names] of Object.entries(p.d.rosters||{}))if(!own(base.rosters,name))base.rosters[name]=copy(names);
        for(const field of ['groupOrder','folderOrder']){
          if(base[field]===undefined)base[field]=[];
          if(!strings(base[field]))fail('candidate-invalid');
          for(const item of p.d[field]||[])if(!base[field].includes(item))base[field].push(item);
        }
      }
      for(const [sid,entry] of publishedShows)if(!existingShows.has(sid)){
        const show=copy(entry.show);show.groupId=[...entry.groups][0];
        show.absent=(show.absent||[]).map(name=>addMember(name).id);
        if(entry.groups.size>1)show.deliveryMode='song';
        base.shows.push(show);existingShows.set(sid,show);
      }
      for(const p of pubs){
        const added=[];
        for(const [i,sg] of p.d.songs.entries()){
          const prefix='local-pub-'+p.ordinal+'-'+p.groupIndex+'-'+i;let counter=0;
          const generated=options.buildSong(copy(p.d.lib[sg.libIdx]),Object.freeze({addMember,uid:()=>unique(prefix+'-uid-'+counter++),
            groupId:p.g.id,sourceOrdinal:p.ordinal,songIndex:i}));
          if(!object(generated)||!Array.isArray(generated.lines)||generated.lines.length!==p.d.lib[sg.libIdx].lines.length
            ||generated.lines.some(line=>!object(line)))fail('candidate-invalid');
          const so=Object.assign(copy(generated),{id:unique(prefix+'-song'),groupId:p.g.id,showId:sg.showId,take:sg.take||1});
          let signatureChanged=false;
          for(const [lineIndex,line] of so.lines.entries()){
            const row=p.d.lib[sg.libIdx].lines[lineIndex];
            // The ordinary import builder trims text. Recovery must retain
            // exact publication characters because note ranges index them.
            const exactText=row[1]==null?'':row[1],gap=(row[0]==null||row[0]==='')&&exactText==='';
            if(line.t!==exactText||!!line.gap!==gap)signatureChanged=true;
            line.t=exactText;if(gap)line.gap=true;else delete line.gap;
          }
          // sigOf recomputes a zero signature from the restored exact text.
          if(signatureChanged&&own(so,'sig'))so.sig=0;
          delete so.from;delete so.deliveryGroupId;
          if(publishedShows.get(sg.showId).groups.size>1)so.deliveryGroupId=p.g.id;
          base.songs.push(so);added.push(so);
        }
        for(const [i,sg] of p.d.songs.entries())if(sg.fromIdx!=null)added[i].from=added[sg.fromIdx].id;
        for(const [i,n] of (p.d.notes||[]).entries()){
          const so=added[n.songIdx],note=copy(n);delete note.songIdx;delete note.memberNames;
          Object.assign(note,{id:unique('local-pub-'+p.ordinal+'-'+p.groupIndex+'-note-'+i),songId:so.id,showId:n.showId||so.showId,
            memberIds:(n.memberNames||[]).map(name=>addMember(name).id),tags:copy(n.tags||[]),memo:n.memo||'',ts:at});base.notes.push(note);
        }
        for(const m of p.d.memos||[]){const so=added[m.songIdx];base.memos[(m.showId||so.showId)+'|'+so.id]=m.text;}
        for(const field of ['subs','gsubs'])for(const x of p.d[field]||[]){
          const so=added[x.songIdx],k=(x.showId||so.showId)+'|'+so.id;const map=base[field][k]||(base[field][k]={});
          map[field==='subs'?x.lineIdx:x.block]=x.names.map(name=>addMember(name).id);
        }
      }
      const hasRecoveredSongs=sid=>existingShows.has(sid)&&base.songs.some(so=>so.showId===sid);
      if(!hasRecoveredSongs(base.showId)){
        const groupFocus=[...new Set(pubs.filter(p=>p.g.id===base.groupId).map(p=>p.d.focusShow).filter(hasRecoveredSongs))];
        const focus=[...new Set(pubs.map(p=>p.d.focusShow).filter(hasRecoveredSongs))];
        base.showId=groupFocus.length===1?groupFocus[0]:focus.length===1?focus[0]:base.songs[0].showId;
      }
      // Verified owner publications reopen the recovered live editing view.
      base.viewer=false;base.recMode=false;
      stateCheck(base);if(options.validateState)options.validateState(copy(base));
      if(!(options.hasWork||hasWork)(copy(base)))fail('candidate-invalid');
      const packet={app:'utacheck',at,sourceDateUnknown,state:base};
      if(!boundedText(JSON.stringify(packet)))fail('candidate-invalid');
      return result('ready',base,packet);
    }catch(error){
      const codes=['candidate-invalid','publication-invalid','publication-conflict','show-conflict','member-conflict','identity-conflict'];
      return result(codes.includes(error?.localRecoveryCode)?error.localRecoveryCode:'candidate-invalid');
    }
  }
  const api=Object.freeze({build});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupLocalPublicationRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this);
