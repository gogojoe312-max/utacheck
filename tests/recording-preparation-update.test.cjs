'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require(process.env.QA_PRIVATE_PREP_SOURCE||'../private-preparation.js'),U=require('../recording-preparation-update.js');
const {fixture,clone,digest}=require('./recording-preparation-fixture.cjs');
const adapters=f=>({recordingUpdate:U.apply,operations:f.manifest.operations});
const apply=f=>P.apply(f.state,f.operation,adapters(f));
const rejects=(code,change)=>{const f=fixture();change(f);const previous=clone(f.state);assert.throws(()=>apply(f),e=>e.preparationCode===code);assert.deepEqual(f.state,previous);};
test('dot REC actual dated member reorder, start/end, break deletion/addition, lyric and assignments preserve completed takes, notes, manual cuts and LIVE publication',async()=>{
 const f=fixture();await P.validate(f.manifest,'gogojoe312-max');const before=clone(f.state),r=apply(f).state;
 assert.deepEqual(f.state,before);assert.deepEqual(r.plan.slots.map(s=>[s.id,s.day,s.at,s.min]),[['slot-2','10/28',720,90],['break-2','10/28',810,60],['slot-1','10/28',870,45]]);
 for(const key of ['notes','pubNotes','recs','draws','songs','shows','groups','ghToken','autoPub','bkGistId','unrelated'])assert.deepEqual(r[key],before[key]);
 for(const key of ['a0','a1','takes','secLog'])assert.deepEqual(r.plan.slots[2][key],before.plan.slots[0][key]);
 assert.equal(r.rsongs[0].lines[0].t,'差し替えた歌詞😀');assert.deepEqual(r.rsongs[0].lines[2].parts,['p2']);assert.deepEqual(r.rsongs[0].lines[1],before.rsongs[0].lines[1]);assert.equal(r.rsongs[0].intro,3);
 assert.deepEqual(r.plan.slots[2].recActualSchedule,{date:'2026-10-27',day:'10/27',at:600,min:60,place:'合成会場'});
 assert.equal(r.recordingUpdateHeads['dot-session'].revision,1);assert.equal(P.apply(r,f.operation,adapters(f)).status,'already-applied');
});
test('new protocol cannot silently fall back to old receiver',async()=>{const f=fixture();await P.validate(f.manifest,'gogojoe312-max');assert.equal(apply(f).state.recordingUpdateHeads['dot-session'].operationId,f.operation.id);});
test('ordered revision chain requires exact predecessor and rejects rollback and modified reused operation',()=>{
 const f=fixture();f.state=apply(f).state;const v1=clone(f.operation);f.operation=clone(v1);f.operation.id='dot-update-2';f.operation.packet.revision=2;f.operation.packet.previous={id:v1.id,sha256:v1.sha256};f.operation.packet.before=clone(v1.packet.after);f.operation.packet.after=clone(v1.packet.after);f.operation.packet.after.slots[0].at=710;f.operation.sha256=digest(f.operation.packet);f.manifest.operations.push(f.operation);f.state=apply(f).state;
 assert.equal(f.state.recordingUpdateHeads['dot-session'].revision,2);assert.equal(P.apply(f.state,v1,adapters(f)).status,'already-applied');
 const stale=clone(v1);stale.id='stale-copy';assert.throws(()=>P.apply(f.state,stale,adapters(f)),e=>e.preparationCode==='REC_UPDATE_STALE');
 const reused={...v1,sha256:'b'.repeat(64)};assert.throws(()=>P.apply(f.state,reused,adapters(f)),e=>e.preparationCode==='OPERATION_ID_REUSED');
});
for(const [name,code,edit]of [
 ['local timing','REC_UPDATE_LOCAL_EDIT',f=>f.state.plan.slots[0].at=610],
 ['local lyric','REC_UPDATE_LOCAL_EDIT',f=>f.state.rsongs[0].lines[0].t='本人が変えた歌詞'],
 ['manual break on changed lyric','REC_UPDATE_LOCAL_EDIT',f=>f.state.rsongs[0].lines[0].lyricBreaks=[1]],
 ['annotated changed lyric','REC_UPDATE_ANNOTATION',f=>f.state.notes[0].lineIdx=0],
 ['handwriting','REC_UPDATE_HANDWRITING',f=>f.state.draws['dot-song|sheet']=[{x:1}]],
 ['section history','REC_UPDATE_SECTION_HISTORY',f=>f.update.after.songs[0].lines[0].sec='2A'],
 ['active member slot','REC_UPDATE_ACTIVE_SLOT',f=>delete f.state.plan.slots[0].a1],
 ['started break deletion','REC_UPDATE_BREAK_HISTORY',f=>Object.assign(f.state.plan.slots[1],{a0:660,a1:690})],
 ['member deletion','REC_UPDATE_BREAK_HISTORY',f=>f.update.after.slots.pop()],
 ['identity rename','REC_UPDATE_SLOT_IDENTITY',f=>f.update.after.slots[0].name='別人'],
 ['overlap','REC_UPDATE_OVERLAP',f=>f.update.after.slots[1].at=790],
 ['non chronological','REC_UPDATE_ORDER',f=>f.update.after.slots.reverse()],
 ['wrong source baseline','REC_UPDATE_BASELINE',f=>f.update.before.songs[0].title='異なる元'],
 ['unknown member','REC_UPDATE_MEMBER',f=>f.update.after.songs[0].lines[0].parts=['unknown']],
 ['public group','REC_UPDATE_NOT_PRIVATE',f=>f.state.groups[0].nopub=false],
 ['timezone change','REC_UPDATE_TIMEZONE',f=>f.state.plan.timezone='UTC'],
 ['unmapped insertion','REC_UPDATE_LINE_MAP',f=>f.update.after.songs[0].lines.push({t:'追加',parts:[]})],
 ['source copy ambiguous','REC_UPDATE_LOCAL_COPY',f=>{f.state.rsongs[0].xlsSourceId='sha256-'+'a'.repeat(64);f.state.rsongs.push({...clone(f.state.rsongs[0]),id:'manually-imported-copy'});}],
 ['bad bootstrap','REC_UPDATE_FORMAT',f=>f.update.bootstrap={}]
])test(name+' is held atomically without deleting user state',()=>rejects(code,edit));
test('explicit source-row mapping moves unchanged Unicode note anchors and keeps custom source-independent breaks',()=>{
 const f=fixture();f.update.after.songs[0].lines.splice(0,0,{id:'new-row',t:'追加の行',parts:['p1'],main:['p1'],extra:[],sec:'1A',bars:1});
 const r=apply(f).state;assert.equal(r.notes[0].lineIdx,2);assert.equal(r.notes[0].lineEnd,null);assert.equal(r.notes[0].from,0);assert.deepEqual(r.rsongs[0].lines[2],f.state.rsongs[0].lines[1]);
});
test('legacy schedule packets queued after the new head cannot revert dot version',()=>{
 const f=fixture(),state=apply(f).state,op={id:'late-old-schedule',type:'recording-schedule',sha256:'a'.repeat(64),packet:{updates:[{id:'slot-1'}]}};
 assert.throws(()=>P.apply(state,op,{}),e=>e.preparationCode==='REC_UPDATE_LEGACY_VERSION');
});
test('unchanged source fields retain local timing, label, assignment and edited structure; independent session can update beside unrelated active slot',()=>{
 const f=fixture();f.update.after=clone(f.update.before);f.update.after.songs[0].title='新しい曲名';f.state.rsongs[0].lines.push({t:'本人追加',parts:[]});f.state.plan.slots[0].at=610;f.state.plan.slots.push({id:'unrelated-active',songId:'independent-other-song',date:'2026-10-26',day:'10/26',at:100,min:60,a0:100,kind:'member',name:'甲',place:'会場'});
 const r=apply(f).state;assert.equal(r.rsongs[0].lines.length,4);assert.equal(r.plan.slots[0].at,610);assert.equal(r.plan.slots.at(-1).a0,100);
});

test('active legacy slot without a song identity blocks an ambiguous lyric update',()=>rejects('REC_UPDATE_ACTIVE_SLOT',f=>f.state.plan.slots.push({id:'legacy-active',a0:100,name:'不明な担当'})));
test('a held update can be explicitly superseded using the same unapplied revision, but an applied revision cannot be replaced',()=>{
 const f=fixture();f.state.rsongs[0].lines[0].t='本人の修正';const replacement=clone(f.operation);replacement.id='dot-update-corrected';replacement.packet.supersedes={id:f.operation.id,sha256:f.operation.sha256};replacement.packet.after.songs[0].lines[0].t='本人の修正';replacement.sha256=digest(replacement.packet);f.manifest.operations.push(replacement);
 const r=P.apply(f.state,replacement,adapters(f)).state;assert.equal(r.recordingUpdateHeads['dot-session'].operationId,replacement.id);assert.equal(r.rsongs[0].lines[0].t,'本人の修正');
 const previouslyApplied=fixture();previouslyApplied.state=apply(previouslyApplied).state;assert.throws(()=>P.apply(previouslyApplied.state,replacement,adapters(f)),e=>e.preparationCode==='REC_UPDATE_ALREADY_APPLIED');
});
test('explicitly reordered identical lyric rows retain their distinct manual breaks and note addresses',()=>{
 const f=fixture();for(const lines of [f.anchor.packet.songs[0].lines,f.state.rsongs[0].lines]){lines.forEach(l=>delete l.id);lines[0].t=lines[1].t='同じ😀歌詞';}
 f.anchor.sha256=digest(f.anchor.packet);f.state.privatePreparations[f.anchor.id].sha256=f.anchor.sha256;f.update.anchor.sha256=f.update.previous.sha256=f.anchor.sha256;
 f.update.before.songs=U.snapshot(f.anchor).songs;f.update.after.songs=clone(f.update.before.songs);f.update.lineMaps={'dot-song':[1,0,2]};
 const r=apply(f).state;assert.equal(r.notes[0].lineIdx,0);assert.deepEqual(r.rsongs[0].lines[0].lyricBreaks,[2]);assert.equal(r.rsongs[0].lines[1].lyricBreaks,undefined);
});
