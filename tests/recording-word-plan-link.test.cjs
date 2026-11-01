'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
const start=source.indexOf('function recordingPlanSourceId('),code=source.slice(start,source.indexOf('\n}',start)+2);
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){
 const body=Array.from({length:63},(_,i)=>'原本の合成本文'+i+'を変更せず保持');
 const proof={app:'utacheck-word-import',version:1,parser:'utacheck-word-v1',sha256:'a'.repeat(64),title:'取り込み済みの合成曲',cols:2,perLine:23,rowsPerCol:53,lines:body};
 const manual={id:'manual-random',title:proof.title,recArtist:'合成アーティスト',at:Date.parse('2026-11-01T00:00:00Z'),cols:2,perLine:23,rowsPerCol:53,colBreaks:[53],intro:8,
  lines:body.map((t,i)=>({t,bars:1,...(i===4?{at:61,sec:'手元の区切り',lyricBreaks:[2]}:{})}))};
 manual.lines.splice(60,0,{t:'煽り',add:1,bars:0,sec:'煽り'},{t:'合成追加二',add:1,bars:2,at:64},{t:'合成追加三',add:1,bars:0});
 const session={id:'source-session',label:'2026/11/4・5',sourceImport:proof},received={id:'received-fixed',title:proof.title,groupId:'private-group',recArtist:manual.recArtist,recSession:session,
  lines:[...Array.from({length:18},(_,i)=>({t:'受信側だけの見出し'+i,parts:[]})),...body.map(t=>({t,parts:[]}))]};
 const head={revision:2,operationId:'trusted-source-link',sha256:'b'.repeat(64),groupId:'private-group',snapshot:{songs:[clone(received)],slots:[]}};
 const S={rsongs:[manual,received],groups:[{id:'private-group',nopub:true}],privatePreparations:{'trusted-source-link':{type:'recording-update',sha256:head.sha256}},recordingUpdateHeads:{'source-session':head},
  plan:{slots:[{id:'planned',songId:received.id,date:'2026-11-04',day:'11/4',at:780,min:90}]},notes:[{id:'note',songId:manual.id,lineIdx:4,from:0,to:1}],recs:{kept:{size:4}}};
 const c=vm.createContext({S,Date,JSON});vm.runInContext(code,c);const a=source.indexOf('function recordingScheduleBackingHidden(');if(a>=0)vm.runInContext(source.slice(a,source.indexOf('\n}',a)+2),c);return {c,S,manual,received,proof,head,resolve:()=>c.recordingPlanSourceId(manual.id)};
}
test('the restored 66-line two-column Word copy opens its authenticated original schedule without replacing either song or local edits',()=>{
 const f=fixture(),before=JSON.stringify(f.S);assert.equal(f.manual.lines.filter(l=>!l.gap).length,66);assert.equal(f.received.lines.length,81);
 assert.equal(f.resolve(),'received-fixed');assert.equal(JSON.stringify(f.S),before);
});
test('Word display cuts, bar edits, added cues, breaks and original note addresses are retained during read-only resolution',()=>{
 const f=fixture();Object.assign(f.manual.lines[2],{cut:1,sourceCut:false,bars:2,at:40,sec:'本人の区切り'});f.manual.lines.splice(5,0,{gap:true,t:''});
 const before=JSON.stringify(f.S);assert.equal(f.resolve(),'received-fixed');assert.equal(JSON.stringify(f.S),before);
});
test('a future hashed Word import can keep its renamed title but rejects a different original hash',()=>{
 const f=fixture();f.manual.recordingSource={parser:'utacheck-word-v1',sha256:f.proof.sha256};f.manual.title='本人が変更した表示名';assert.equal(f.resolve(),'received-fixed');
 f.manual.recordingSource.sha256='c'.repeat(64);assert.equal(f.resolve(),f.manual.id);
});
for(const [name,change] of [
 ['same title with different source lyrics',f=>f.manual.lines[0].t='別の原文'],
 ['different import layout',f=>f.manual.perLine=24],['unverified source hash',f=>f.head.snapshot.songs[0].recSession.sourceImport.sha256='invalid'],
 ['missing authenticated receipt',f=>delete f.S.privatePreparations['trusted-source-link']],['mismatched receipt',f=>f.S.privatePreparations['trusted-source-link'].sha256='d'.repeat(64)],
 ['public group',f=>f.S.groups[0].nopub=false],['malformed saved head',f=>f.head.snapshot.songs={}],['explicit different session',f=>f.manual.recSession={id:'user-session'}],
 ['past schedule',f=>f.S.plan.slots[0].date='2026-10-27'],['distant future session',f=>f.S.plan.slots[0].date='2027-11-04'],
 ['ambiguous matching sessions',f=>{const other=clone(f.received);other.id='other-received';f.S.rsongs.push(other);f.S.plan.slots.push({...f.S.plan.slots[0],id:'other-slot',songId:other.id});f.head.snapshot.songs.push(clone(other));}],
 ['renamed legacy document without byte provenance',f=>f.manual.title='別の曲名'],['short generic legacy source',f=>{const rows=['ラララ'];f.manual.lines=rows.map(t=>({t}));f.head.snapshot.songs[0].recSession.sourceImport.lines=rows;}]
])test(name+' cannot silently borrow the prepared session',()=>{const f=fixture();change(f);const before=JSON.stringify(f.S);assert.equal(f.resolve(),f.manual.id);assert.equal(JSON.stringify(f.S),before);});
test('an already linked manual song always keeps its own explicit schedule',()=>{const f=fixture();f.S.plan.slots.push({...f.S.plan.slots[0],id:'own',songId:f.manual.id});assert.equal(f.resolve(),f.manual.id);});
test('only an untouched schedule companion is hidden from the normal manual-document list',()=>{
 const f=fixture();f.S.rsongId=f.manual.id;assert.equal(f.c.recordingScheduleBackingHidden(f.received),true);
 f.S.notes.push({songId:f.received.id,memo:'source-owned note'});assert.equal(f.c.recordingScheduleBackingHidden(f.received),false);f.S.notes.pop();
 f.received.lines[0].sec='source-owned edit';assert.equal(f.c.recordingScheduleBackingHidden(f.received),false);delete f.received.lines[0].sec;
 f.S.rsongId=f.received.id;assert.equal(f.c.recordingScheduleBackingHidden(f.received),false);
});
