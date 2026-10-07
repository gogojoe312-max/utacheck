/* Pure reconstruction from parsed original workbooks. No storage or network. */
(function(root){
  'use strict';
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const bad=new Set(['__proto__','prototype','constructor']);
  const validId=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[|\x00-\x1f]/.test(value)&&!bad.has(value);
  const copy=value=>JSON.parse(JSON.stringify(value));
  function safe(value){
    if(Array.isArray(value)){for(const item of value)safe(item);return;}
    if(object(value))for(const key of Object.keys(value)){if(bad.has(key))throw Error('unsafe-key');safe(value[key]);}
  }
  function defaultHasWork(state){
    return ['songs','rsongs','notes','pubNotes','trash'].some(k=>state[k]?.length)
      ||!!state.plan?.slots?.length||['memos','staffMemos','draws','recs'].some(k=>Object.keys(state[k]||{}).length);
  }
  const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  function counts(state){
    const out={};for(const field of ['shows','songs','rsongs','notes','pubNotes','trash','members','groups'])out[field]=(state[field]||[]).length;
    for(const field of ['memos','staffMemos','draws','recs','subs','gsubs'])out[field]=Object.keys(state[field]||{}).length;
    out.planSlots=state.plan?.slots?.length||0;return out;
  }
  function build(records,defaults,entries,options={}){
    let checked=0;
    const result=status=>({status,summary:{status,records:checked,workbooks:Array.isArray(entries)?entries.length:0,counts:{}}});
    try{
      if(!Array.isArray(records)||!records.length||records.length>1024||!object(defaults)||!Array.isArray(entries)||entries.length<1||entries.length>1024
        ||typeof options.buildSong!=='function'||typeof options.validateState!=='function')return result('candidate-invalid');
      if(!Number.isSafeInteger(options.now)||options.now<=0)return result('creation-time-required');
      const baseline=copy(defaults);safe(baseline);options.validateState(copy(baseline));
      const valid=[];
      for(const record of records){
        if(!object(record)||!Number.isSafeInteger(record.seq)||record.seq<0||!Number.isSafeInteger(record.ordinal)||record.ordinal<0)return result('candidate-invalid');
        const state=copy(record.state);safe(state);options.validateState(copy(state));
        if((options.hasWork||defaultHasWork)(copy(state)))return result('original-nonempty');
        valid.push({state,seq:record.seq,ordinal:record.ordinal});checked++;
      }
      valid.sort((a,b)=>b.seq-a.seq||a.ordinal-b.ordinal);
      const selected=valid[0],same=JSON.stringify(canonical(selected.state));
      if(valid.some(record=>record.seq===selected.seq&&JSON.stringify(canonical(record.state))!==same))return result('base-conflict');
      if(valid.some(record=>record.state.deviceId&&selected.state.deviceId&&record.state.deviceId!==selected.state.deviceId))return result('identity-conflict');
      const state=Object.assign(baseline,copy(selected.state));
      if((options.hasWork||defaultHasWork)(copy(state)))return result('original-nonempty');
      entries=entries.map(entry=>({...entry,id:typeof entry?.key==='string'&&entry.key.startsWith('xls:')?entry.key.slice(4):null}));
      if(entries.every(entry=>Number.isSafeInteger(entry.index)&&entry.index>=0))entries.sort((a,b)=>a.index-b.index);
      for(const field of ['members','groups','shows','songs']){
        if(state[field]===undefined)state[field]=[];
        if(!Array.isArray(state[field]))return result('candidate-invalid');
      }
      const used=new Set(),members=new Map(),memberIds=new Map(),sourceIds=new Set();
      for(const field of ['members','groups','shows','songs','rsongs','notes','pubNotes','trash']){
        for(const value of state[field]||[])if(validId(value?.id))used.add(value.id);
      }
      for(const field of ['memos','staffMemos','draws','recs','subs','subsMan','gsubs','subLib']){
        for(const key of Object.keys(state[field]||{}))for(const part of key.split('|'))if(validId(part))used.add(part);
      }
      for(const entry of entries){
        if(!object(entry)||!validId(entry.id)||entry.key!=='xls:'+entry.id||sourceIds.has(entry.id))return result('source-identity-conflict');
        // Existing list identities must not be overwritten/reused for a new song.
        if(['members','groups','shows','songs','rsongs','notes','pubNotes','trash'].some(field=>(state[field]||[]).some(value=>value?.id===entry.id)))return result('source-identity-conflict');
        sourceIds.add(entry.id);used.add(entry.id);
      }
      function unique(prefix){let id=prefix,n=0;while(used.has(id))id=prefix+'-'+(++n);used.add(id);return id;}
      for(const member of state.members){
        if(!object(member)||!validId(member.id)||typeof member.name!=='string'||!member.name.trim()
          ||(members.has(member.name)&&members.get(member.name).id!==member.id)
          ||(memberIds.has(member.id)&&memberIds.get(member.id)!==member.name))return result('member-conflict');
        members.set(member.name,member);memberIds.set(member.id,member.name);
      }
      let memberIndex=0;
      function addMember(name){
        if(typeof name!=='string'||!name.trim()||name.length>512||bad.has(name))throw Error('invalid-member');
        if(members.has(name))return members.get(name);
        const member={id:unique('local-workbook-member-'+memberIndex++),name};
        state.members.push(member);members.set(name,member);return member;
      }
      const groupId=unique('local-workbook-group'),showId=unique('local-workbook-show');
      const baseName='元Excelから復旧した資料',usedNames=new Set([
        ...state.groups.map(group=>group.name),...Object.keys(state.rosters||{})]);
      let name=baseName,nameSuffix=1;while(usedNames.has(name))name=baseName+' ('+(++nameSuffix)+')';
      state.groups.push({id:groupId,name,nopub:true});
      state.shows.push({id:showId,name,groupId,nopub:true,ts:options.now,recoverySource:'original-workbooks'});
      for(const entry of entries){
        const parsed=copy(entry.parsed);safe(parsed);
        if(!object(parsed)||!Array.isArray(parsed.lines)||parsed.lines.length<1||parsed.lines.length>100000
          ||parsed.lines.some(row=>!Array.isArray(row)||row.length<2||row.length>9||row.some(v=>v!==null&&typeof v!=='string'))
          ||!parsed.lines.some(row=>typeof row[1]==='string'&&row[1].trim()))return result('parsed-workbook-invalid');
        // The caller must label absent source titles explicitly rather than infer a file name.
        if(typeof parsed.title!=='string'||!parsed.title.trim())return result('parsed-workbook-invalid');
        const generated=options.buildSong(parsed,Object.freeze({addMember,uid:()=>entry.id}));
        if(!object(generated)||!Array.isArray(generated.lines)||generated.lines.length!==parsed.lines.length
          ||generated.lines.some(line=>!object(line)))return result('builder-invalid');
        const song=Object.assign(copy(generated),{id:entry.id,groupId,showId,xls:1,recoveredFromOriginalExcel:true});
        delete song.from;delete song.xlsSourceId;delete song.xlsAt;delete song.deliveryGroupId;
        state.songs.push(song);
      }
      state.groupId=groupId;state.showId=showId;state.viewer=false;state.recMode=false;
      safe(state);options.validateState(copy(state));
      if(!(options.hasWork||defaultHasWork)(copy(state)))return result('candidate-invalid');
      if(new TextEncoder().encode(JSON.stringify(state)).byteLength>20*1024*1024)return result('candidate-too-large');
      return {status:'ready',summary:{status:'ready',records:checked,workbooks:entries.length,counts:counts(state),sourceDateUnknown:true},
        packet:{app:'utacheck',at:options.now,sourceDateUnknown:true,sourceKind:'local-excel',state}};
    }catch(_){return result('candidate-invalid');}
  }
  const api=Object.freeze({build});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupLocalExcelRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this);
