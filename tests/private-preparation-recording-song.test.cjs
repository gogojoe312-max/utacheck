const {test}=require('node:test'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),P=require('../private-preparation.js');
const packet=()=>({app:'utacheck-recording-song',version:1,group:{id:'private-rec',name:'配信しない',nopub:true},song:{id:'new-rec',title:'Synthetic song',artist:'Synthetic artist',credit:'Synthetic credit',lines:[{t:'Synthetic lyric',parts:[]}]},source:{file:'synthetic.docx',revision:'r1'}});
test('lyrics-only recording preserves existing data, reuses private group and has no fabricated timing',async()=>{
 const current={groups:[{id:'existing-private',name:'配信しない',nopub:1}],rsongs:[{id:'old',lines:[{t:'old',parts:[]}]}],notes:[{songId:'old',text:'preserve'}],recs:[{songId:'old',clipId:'clip'}],plan:{slots:[{id:'existing-slot'}]}};
 const before=JSON.stringify(current),p=packet(),op={id:'new-operation',type:'recording-song',packet:p,sha256:await P.digest(p,webcrypto)};
 await P.validate({app:'utacheck-private-preparation',version:1,owner:'owner',revision:'r1',createdAt:'2031-01-01',operations:[op]},'owner',webcrypto);
 const next=P.apply(current,op).state;assert.equal(JSON.stringify(current),before);assert.deepEqual(next.groups,current.groups);assert.deepEqual(next.rsongs[0],current.rsongs[0]);for(const k of ['notes','recs','plan'])assert.deepEqual(next[k],current[k]);
 const added=next.rsongs[1];assert.equal(added.groupId,'existing-private');for(const k of ['intro','bars','duration','start','end'])assert.equal(Object.hasOwn(added,k),false);assert.deepEqual(added.lines,p.song.lines);assert.equal(P.apply(next,op).state,next);
});
test('ambiguous or connected private group and any assignments or timing are rejected',()=>{
 const p=packet();assert.throws(()=>P.mergeRecordingSong({groups:[{id:'a',name:'配信しない',nopub:true,gistId:'existing'}]},p));
 assert.throws(()=>P.mergeRecordingSong({groups:[{id:'a',name:'配信しない',nopub:true},{id:'b',name:'配信しない',nopub:true}]},p));
 p.song.lines[0].parts=['person'];assert.throws(()=>P.mergeRecordingSong({},p));p.song.lines[0].parts=[];p.song.lines[0].bars=4;assert.throws(()=>P.mergeRecordingSong({},p));
});
