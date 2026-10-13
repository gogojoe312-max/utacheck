const {test}=require('node:test'),assert=require('node:assert/strict');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs'),{appContext,settle,clone}=require('./startup-excel-recovery-fixture.cjs');
test('ordinary boot preserves whole-label IDs and assignments without expanding into other groups',async()=>{
 const idb=indexedFixture({state:{},clips:{}}),f=appContext(idb),state=clone(f.run('S0'));
 Object.assign(state,{deviceId:'synthetic-owner',groups:[{id:'rosy',name:'Rosy',nopub:true},{id:'ocha',name:'OCHA',nopub:true}],groupId:'rosy',shows:[{id:'show',name:'Original',groupId:'rosy'}],showId:'show',members:[{id:'whole',name:'全'},{id:'roman-whole',name:'zenn'},{id:'other-person',name:'Other group person'}],songs:[{id:'song',title:'Original',showId:'show',groupId:'rosy',roster:['whole','roman-whole'],blocks:{},lines:[{t:'Synthetic whole lyric',label:'全',parts:['whole']},{t:'Synthetic roman lyric',label:'zenn',parts:['roman-whole']}]}],notes:[{id:'note',songId:'song',showId:'show',memberIds:['whole'],tags:[],memo:'Keep annotation',lineIdx:0}],recs:{audio:{dur:12}}});
 idb.replace('state:0',{seq:2,at:1,txt:JSON.stringify(state)});idb.replace('state:1',{seq:1,at:1,txt:JSON.stringify(state)});await settle(f);const next=clone(f.run('S'));
 assert.deepEqual(next.members,state.members);assert.deepEqual(next.songs[0].lines,state.songs[0].lines);assert.deepEqual(next.notes,state.notes);assert.deepEqual(next.recs,state.recs);assert.equal(next.songs[0].lines.some(l=>l.parts.includes('other-person')),false);
});
