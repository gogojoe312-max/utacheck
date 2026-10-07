'use strict';
// Whole-app UI regressions. Synthetic state only; no user files, credentials,
// browser sign-in or network requests are used.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {indexedFixture}=require('./startup-file-restoration-fixture.cjs');
const {appContext,settle,clone}=require('./startup-excel-recovery-fixture.cjs');

async function fixture({recMode=true}={}){
  const idb=indexedFixture({state:{'recovery:network-hold:v1':{
    v:1,seq:9,sourceKind:'local-excel',excelSummary:{total:124,read:82,failed:42}
  }}});
  const f=appContext(idb),state=clone(f.run('S0'));
  const members=Array.from({length:8},(_,i)=>({id:'member-'+i,name:'担当'+String.fromCharCode(65+i)+'（検証グループ）'}));
  Object.assign(state,{deviceId:'synthetic-device',recMode,showId:recMode?'rec':'show',liveShow:'show',groupId:'group',
    groups:[{id:'group',name:'検証グループ',nopub:1}],members,rosters:{'検証グループ':members.map(m=>m.name)},
    shows:[{id:'show',name:'合成公演',groupId:'group',nopub:1}],
    songs:[{id:'original',title:'既存曲',showId:'show',groupId:'group',roster:['member-0'],blocks:{},lines:[{t:'既存歌詞',parts:['member-0']}]}],
    rsongs:Array.from({length:3},(_,n)=>({id:'rec-song-'+n,title:'録音曲'+n,groupId:'group',roster:members.map(m=>m.id),blocks:{},
      lines:members.map((m,i)=>({t:'歌詞'+n+'-'+i,label:m.name,parts:[m.id],main:[m.id],extra:[],sec:i===0?'1A':undefined}))
        .concat([{t:'未確定の歌詞',parts:[],main:[],extra:[]}])})),rsongId:'rec-song-0',planFocus:'slot-0',
    plan:{start:'10:00',slots:members.map((m,i)=>({id:'slot-'+i,name:'担当'+String.fromCharCode(65+i),kind:'member',at:600+i*90,min:90,
      ...(i===0?{a0:601,startAt:1700000000000,secCur:'RH',secStart:1700000010000,secLog:{'1A':3},takes:{RH:0,'1A':4}}:{})}))},
    notes:[{id:'existing-note',showId:'rec',songId:'rec-song-0',lineIdx:0,tags:['pitch'],memberIds:['member-0'],memo:'既存の指摘',ts:1}],
    memos:{'show|original':'既存総括'},staffMemos:{'show|original':'管理メモ'},draws:{'show|original':[{p:[0.1,4,0.2,8]}]},
    recs:{original:{name:'既存音声',dur:4}}
  });
  idb.replace('state:0',{seq:10,at:100,txt:JSON.stringify(state)});
  idb.replace('state:1',{seq:9,at:90,txt:JSON.stringify(state)});
  await settle(f);
  assert.equal(f.run('startupPhase'),'ready');
  assert.equal(f.run('startupCanCommunicate()'),false);
  assert.equal(f.calls.network.length,0);
  f.click=(act,id='')=>{
    const button={tagName:'BUTTON',dataset:{act,id},closest:selector=>selector==='[data-act]'?button:null};
    const e={target:button,detail:0,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}};
    for(const handler of f.handlers.get('click')||[])handler(e);
  };
  return {...f,idb};
}

function unchanged(f,before,stored,local){
  assert.equal(f.run('JSON.stringify(S)'),before,'navigation/render must preserve work and active recording state');
  assert.deepEqual(f.idb.snapshot(),stored,'navigation/render must not write database');
  assert.deepEqual(f.localWrites,local,'navigation/render must not add localStorage writes');
  assert.equal(f.calls.saves,0);
  assert.equal(f.calls.network.length,0);
}

function capture(f,name){
  if(!process.env.REC_LAYOUT_QA_OUTPUT)return;
  fs.mkdirSync(process.env.REC_LAYOUT_QA_OUTPUT,{recursive:true});
  const notice=f.elements.get('recovery-network-notice');
  fs.writeFileSync(path.join(process.env.REC_LAYOUT_QA_OUTPUT,name+'.json'),JSON.stringify({
    html:f.app.innerHTML,rec:f.app.dataset.rec,notice:notice&&{id:notice.id,text:notice.textContent,style:notice.style.cssText}
  }));
}

test('REC live and overview omit the selector; settings keeps all choices inside its scroll area',async()=>{
  const f=await fixture(),before=f.run('JSON.stringify(S)'),stored=f.idb.snapshot(),local=clone(f.localWrites);
  assert.doesNotMatch(f.app.innerHTML,/rec-member-focus|data-act="recfocus"/);
  assert.match(f.app.innerHTML,/data-act="takeup"/);
  assert.match(f.app.innerHTML,/data-act="takedown"/);
  assert.match(f.app.innerHTML,/data-act="pnextsec"/);
  capture(f,'rec-live');
  f.click('overview');
  assert.equal(f.run('U.overview'),true);
  assert.doesNotMatch(f.app.innerHTML,/rec-member-focus|data-act="recfocus"/);
  capture(f,'rec-overview');
  f.click('overview');f.click('go-setup');
  const html=f.app.innerHTML;
  assert.equal((html.match(/data-act="recfocus"/g)||[]).length,9);
  assert(html.indexOf('class="rec-member-focus"')>html.indexOf('<div class="scroll pad">'));
  for(let i=0;i<8;i++)assert(html.includes('data-act="recfocus" data-id="member-'+i+'"'));
  capture(f,'rec-settings');
  f.click('go-live');
  assert.doesNotMatch(f.app.innerHTML,/rec-member-focus|data-act="recfocus"/);
  unchanged(f,before,stored,local);
});

test('all 24 song/member focuses, unresolved lines and manual override retain their existing behavior',async()=>{
  const f=await fixture(),preserved=clone(f.run('[S.plan,S.notes,S.memos,S.staffMemos,S.draws,S.recs,S.songs,S.rsongs]'));
  for(let n=0;n<3;n++)for(let i=0;i<8;i++){
    f.run('S.rsongId="rec-song-'+n+'";S.planFocus="slot-'+i+'";U.recFocusId="";U.secView="";render()');
    assert.equal(f.run('recFocusMember().id'),'member-'+i);
    const expected=Array.from({length:8},(_,j)=>j===i?'rec-focus-own':'rec-focus-other').concat(['']);
    assert.deepEqual(clone(f.run('song().lines.map((l,i)=>recLineFocus(song(),i))')),expected);
    assert.equal((f.app.innerHTML.match(/class="ln rec-focus-own/g)||[]).length,1);
    assert.equal((f.app.innerHTML.match(/class="ln rec-focus-other/g)||[]).length,7);
  }
  f.run('S.planFocus="slot-0"');f.click('go-setup');f.click('recfocus','member-6');
  assert.equal(f.run('recFocusMember().id'),'member-6');
  assert.match(f.app.innerHTML,/data-id="member-6" aria-pressed="true"/);
  f.click('go-live');assert.equal(f.run('recFocusMember().id'),'member-6');
  assert.doesNotMatch(f.app.innerHTML,/data-act="recfocus"/);
  f.click('go-setup');f.click('recfocus','');f.click('go-live');
  assert.equal(f.run('recFocusMember().id'),'member-0');
  assert.deepEqual(clone(f.run('[S.plan,S.notes,S.memos,S.staffMemos,S.draws,S.recs,S.songs,S.rsongs]')),preserved);
  assert.equal(f.calls.saves,0);assert.equal(f.calls.network.length,0);
});

test('REC boot and repeated navigation retain the recovery status and the REC CSS visibility state without changing work',async()=>{
  const f=await fixture(),notice=f.elements.get('recovery-network-notice');
  assert(notice,'the recovery status must remain available to other views');
  assert.equal(f.app.dataset.rec,'1','first REC boot supplies the existing CSS visibility state');
  assert.match(notice.textContent,/元Excel救出 82 \/ 124資料/);
  const originalNotice=notice.textContent;
  const before=f.run('JSON.stringify(S)'),stored=f.idb.snapshot(),local=clone(f.localWrites);
  for(let i=0;i<3;i++){
    f.click('go-setup');assert.equal(f.app.dataset.rec,'1');f.click('go-live');assert.equal(f.app.dataset.rec,'1');
    f.click('overview');assert.equal(f.app.dataset.rec,'1');f.click('overview');
  }
  assert.equal(f.run('takeNo(focusRow().s)'),0);
  assert.equal(f.run('focusRow().s.a0'),601);
  assert.equal(f.run('focusRow().s.secLog["1A"]'),3);
  assert.equal(f.run('focusRow().s.takes["1A"]'),4);
  assert.equal(f.run('startupRecoveryNetworkHold'),true);
  assert.equal(notice.textContent,originalNotice);
  unchanged(f,before,stored,local);
});

test('leaving REC resets the CSS visibility state and ordinary recovery preserves its status',async()=>{
  const f=await fixture(),notice=f.elements.get('recovery-network-notice'),stored=f.idb.snapshot();
  f.run('S.recMode=false;S.showId="show";U.view="live";render()');
  assert.equal(f.app.dataset.rec,'0');
  assert.equal(f.elements.get('recovery-network-notice'),notice);
  capture(f,'ordinary-live');
  f.run('S.recMode=true;S.showId="rec";render()');assert.equal(f.app.dataset.rec,'1');
  assert.deepEqual(f.idb.snapshot(),stored);assert.equal(f.calls.saves,0);assert.equal(f.calls.network.length,0);
  const ordinary=await fixture({recMode:false});
  assert.equal(ordinary.app.dataset.rec,'0');
  assert.match(ordinary.elements.get('recovery-network-notice').textContent,/元Excel救出 82 \/ 124資料/);
  assert.equal(ordinary.run('startupRecoveryNetworkHold'),true);
});
