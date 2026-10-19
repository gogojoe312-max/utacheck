/* Device-side arrangement repair and an audit of saved state and actual DOM. */
(function(root){
 'use strict';
 let running=false,timer=null,lastState=null,lastRevision=-1;
 const reports=new Map(),cache=new WeakMap();
 const allowed=()=>typeof S!=='undefined'&&startupPhase==='ready'&&booted&&!bootErr&&recordingInboxCanWrite()
  &&!REC&&!recordingStartPending&&!recordingFinalizePending&&!syncing&&!manualSync&&!U.importing&&!U.busy&&!U.sheet&&!U.menu
  &&!typingNow()&&!recordingInboxIntegration?.gate?.applying;
 const allSongs=()=>[...(S.songs||[]),...(S.rsongs||[])];
 function text(report){
  if(!report)return 'ワンハーフを確認中…';
  if(report.error)return 'ワンハーフの確認を再試行しています';
  if(!report.display)return 'ワンハーフの表示を確認中…';
  if(!VIEW()&&!preview&&!report.saved)return 'ワンハーフの保存を確認中…';
  return 'ワンハーフ ✓';
 }
 function html(so){
  if(!so)return '';
  const report=reports.get(so.id);
  if(!report)return '';
  return '<div data-arrangement-verification data-song="'+h(so.id)+'" role="status" style="font-size:11px;color:var(--dim)">'+h(text(report))+'</div>';
 }
 function auditDOM(){
  const so=typeof song==='function'?song():null,report=so&&reports.get(so.id);
  if(!report)return;
  if(U.view==='live'){
   const rendered=[...app.querySelectorAll('[data-lyric-line],.ovw[data-i],.txt[data-l]')].map(el=>Number(el.dataset.lyricLine??el.dataset.i??el.dataset.l));
   const checked=ArrangementVerification.audit(so,report.plan,rendered);report.display=checked.ok;
   if(checked.identity&&!checked.missing.length&&checked.visible.length&&Date.now()-(report.lastRenderAttempt||0)>5000){
    report.lastRenderAttempt=Date.now();setTimeout(()=>{if(allowed())render();},100);
   }
  }else if(U.view==='summary'){
   const links=[...app.querySelectorAll('[data-act="summary-note"][data-id]')].filter(el=>el.dataset.id===so.id);
   report.display=links.every(el=>{
    const n=NOTES().find(n=>n.id===el.dataset.note&&n.songId===so.id);
    return !n||noteInArrangement(n);
   })&&ArrangementVerification.audit(so,report.plan).ok;
  }
  for(const el of app.querySelectorAll('[data-arrangement-verification]'))if(el.dataset.song===so.id){
   el.textContent=text(report);el.dataset.checkState=report.display&&(VIEW()||preview||report.saved)?'verified':'pending';
  }
  if(report.display&&report.saved&&!VIEW()&&!preview&&!report.recorded){
   report.recorded=true;
   void idbPut('arrangement-check:v1:'+so.id,{version:1,appVersion:APP_VER,rule:report.plan.rule.id,fingerprint:report.plan.rule.fingerprint,
    expectedCuts:report.plan.indices.length,visibleCuts:0,saved:true,checkedAt:Date.now()}).catch(()=>{report.recorded=false;});
  }
 }
 async function check(){
  if(running||!allowed())return;
  const current=typeof song==='function'?song():null;
  const currentReport=current&&reports.get(current.id);
  const intact=!currentReport||ArrangementVerification.audit(current,currentReport.plan).ok;
  if(intact&&lastState===S&&lastRevision===stateRevision&&(!current||reports.has(current.id)||cache.has(current.lines))){auditDOM();return;}
  running=true;const state=S;let release;
  try{
   const ordered=allSongs().sort((a,b)=>(b===current)-(a===current)),plans=[];
   for(const so of ordered){
    if(!Array.isArray(so.lines))continue;
    // Most restored songs have no matching source arrangement. Do not serialize
    // their full lyrics again after every newly saved feedback note.
    const candidates=ArrangementCatalog.filter(rule=>rule.sheetName===so.sheetName);
    if(!candidates.length || !candidates.some(rule=>rule.rowCount===so.lines.filter(line=>String(line.t||'').trim()).length)){
     cache.set(so.lines,{noCandidates:true});reports.delete(so.id);continue;
    }
    const content=ArrangementVerification.canonical(so),addresses=JSON.stringify(so.lines.map(l=>l.lcell||''));
    let cached=cache.get(so.lines);
    if(!cached||cached.content!==content||cached.sheet!==so.sheetName||cached.addresses!==addresses){
     cached={content,addresses,sheet:so.sheetName,plan:await ArrangementVerification.plan(so,ArrangementCatalog)};cache.set(so.lines,cached);
    }
    if(cached.plan)plans.push({so,plan:cached.plan});else reports.delete(so.id);
    if(S!==state||!allowed())return;
   }
   if(S!==state||!allowed())return;
   const writable=!VIEW()&&!preview;
   if(writable)release=recordingInboxAdmitWriter();
   let changed=false,visibleChanged=false,needsSave=false;
   for(const {so,plan}of plans){
    const previous=reports.get(so.id),selected=new Set(plan.indices);
    const differs=plan.indices.some(i=>so.lines[i].cut!==1||so.lines[i].sourceCut!==plan.lines[i].sourceCut);
    if(differs){
     // Merge metadata into the live lines; never replace lyrics, assignments,
     // notes, drawings or a newer edit with a staged whole-state snapshot.
     so.lines=so.lines.map((line,i)=>selected.has(i)?{...line,cut:1,sourceCut:plan.lines[i].sourceCut}:line);changed=true;
     if(U.view==='summary' || so===current)visibleChanged=true;
    }
    const report={plan,saved:!differs&&previous?.saved===true,display:false,recorded:!differs&&previous?.recorded===true};
    reports.set(so.id,report);if(!report.saved)needsSave=true;
   }
   if(changed&&visibleChanged)render(true);
   if(writable&&needsSave){
    save();await saveNow();
    if(saveErr)throw Error('ARRANGEMENT_SAVE_UNVERIFIED');
    const raw=await loadRaw(),saved=unpackState(JSON.parse(raw));
    const stored=new Map([...(saved.songs||[]),...(saved.rsongs||[])].map(so=>[so.id,so]));
    for(const {so,plan}of plans){
     const item=stored.get(so.id),report=reports.get(so.id);
     report.saved=!!item&&ArrangementVerification.audit(item,plan).ok;
     if(!report.saved)throw Error('ARRANGEMENT_SAVE_UNVERIFIED');
    }
   }
   lastState=S;lastRevision=stateRevision;auditDOM();
  }catch(error){
   lastRevision=-1;
   const so=typeof song==='function'?song():null,report=so&&reports.get(so.id);if(report)report.error=error.message;
   auditDOM();
  }finally{release?.();running=false;}
 }
 function notify(){
  auditDOM();
  if(timer!==null||running)return;
  timer=setTimeout(()=>{timer=null;void check();},40);
 }
 root.ArrangementVerificationUI=Object.freeze({html,notify,check,getStatus:id=>{
  const report=reports.get(id);return report?{rule:report.plan.rule.id,expectedCuts:report.plan.indices.length,saved:!!report.saved,display:!!report.display,error:report.error||null}:null;
 }});
 setInterval(notify,5000);document.addEventListener('visibilitychange',notify);notify();
})(typeof globalThis!=='undefined'?globalThis:this);
