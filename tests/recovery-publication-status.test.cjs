'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const block=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture(statuses=['ready','blocked']) {
 const calls=[],alerts=[],status={textContent:'',style:{}},sheet={memo:'Keep this draft'};
 const S={ghToken:'synthetic',groups:statuses.map((value,i)=>({id:'g'+i,name:'Group '+i,gistId:'existing'+i})),
  recoveryDelivery:{version:2,targets:statuses.map((value,i)=>({groupId:'g'+i,groupName:'Group '+i,status:value}))}};
 const c=require('./inbox-test-context.cjs')({S,U:{view:'live',sheet},startupRecoveryNetworkHold:true,
  pushState:'公開済 12:00',publishIssues:[],lastPushAt:0,pushTimer:null,limitedAt:'',Date,
  app:{querySelector:()=>status},render(){throw Error('must not replace live draft');},
  alert:value=>alerts.push(value),confirm:()=>false,setTimeout:()=>1,clearTimeout(){},
  RecoveryDelivery:{canPublish:id=>S.recoveryDelivery.targets.some(t=>t.groupId===id&&t.status==='ready')},
  gistPush:async id=>{calls.push(id);return 'sent';}});
 vm.runInContext(block('function recoveryPublicationHolds()', 'window.addEventListener("online"'),c);
 return {c,S,calls,alerts,status,sheet};
}
for(const held of ['blocked','prepared','sending','uncertain'])test('ready destination can send while '+held+' destination remains visibly incomplete',async()=>{
 const f=fixture(['ready',held]),before=JSON.stringify(f.S);
 await f.c.publishGroups(true);
 assert.deepEqual(f.calls,['g0']);assert.doesNotMatch(f.c.pushState,/公開済/);
 assert.match(f.c.pushState,held==='sending'||held==='uncertain'?/結果の確認待ち/:/配信保留/);
 assert(f.c.publishIssues.some(text=>text.startsWith('Group 1：')));
 assert.equal(f.status.textContent,' ・ '+f.c.pushState);assert.equal(f.status.style.color,'var(--bad)');
 assert.equal(f.c.U.sheet,f.sheet);assert.equal(JSON.stringify(f.S),before);
});
test('all-held destinations display the blocker without invoking a transport',async()=>{
 const f=fixture(['uncertain','blocked']);await f.c.publishGroups(true);
 assert.equal(f.calls.length,0);assert.match(f.c.pushState,/確認待ち（2件）/);
 assert.equal(f.c.publishIssues.length,2);
});
test('initial status rendering cannot show stale success after a recovery hold',()=>{
 const f=fixture(['uncertain']);f.c.renderPublishStatus();
 assert.match(f.status.textContent,/配信結果の確認待ち/);assert.doesNotMatch(f.status.textContent,/公開済/);
 assert.equal(f.c.U.sheet,f.sheet);
 const live=block('  const noSong = VIEW()', '  <div class="hd song-header">');
 assert(live.includes('const publicationStatus = publicationStatusText()'));
});
for(const result of [false,'skip'])test('declined transport '+String(result)+' never becomes a successful publication',async()=>{
 const f=fixture(['ready']);f.c.gistPush=async id=>{f.calls.push(id);return result;};
 const one=await f.c.publishOne('g0');assert.equal(one.sent,false);assert.match(one.state,/未送信/);assert.doesNotMatch(one.state,/公開済/);
 await f.c.publishGroups(true);assert.match(f.c.pushState,/未送信/);assert.doesNotMatch(f.c.pushState,/公開済/);
});
test('a destination blocked while the batch is in progress is not reported as sent',async()=>{
 const f=fixture(['ready','ready']);f.c.gistPush=async id=>{f.calls.push(id);if(id==='g0'){f.S.recoveryDelivery.targets[1].status='blocked';return 'sent';}return false;};
 await f.c.publishGroups(true);assert.match(f.c.pushState,/配信保留/);assert.doesNotMatch(f.c.pushState,/公開済/);
 assert(f.c.publishIssues.some(text=>text.startsWith('Group 1：')));
});
test('ordinary publishing and verified unchanged publications keep their existing success display',async()=>{
 const f=fixture(['ready']);f.c.startupRecoveryNetworkHold=false;f.c.gistPush=async()=> 'same';
 await f.c.publishGroups('force');assert.match(f.c.pushState,/公開済.*変更なし/);assert.equal(f.c.publishIssues.length,0);
});
