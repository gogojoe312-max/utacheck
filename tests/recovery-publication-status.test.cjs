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

// Exercise the actual reconciliation function with isolated storage and transport.
const deliverySource=fs.readFileSync(__dirname+'/../recovery-delivery.js','utf8');
function recoverySlice(text,start,end){
 const a=text.indexOf(start),b=text.indexOf(end,a+start.length);assert(a>=0&&b>a,start);return text.slice(a,b);
}
function reconcileFixture(kind){
 const key=id=>JSON.stringify({groupId:id,work:'latest'}),names=kind==='duplicate-names'?['Same','Same']:['Rosy','OCHA'];
 const target=(id,status)=>({groupId:id,groupName:id==='r'?names[0]:names[1],gistId:'existing-'+id,src:'https://example.invalid/'+id,status,expectedRemoteSha256:id==='r'?'r-seen':'before',heldLocalShowIds:[]});
 const S={ghToken:'SYNTHETIC',autoPub:true,groups:[
  {id:'r',name:names[0],gistId:'existing-r',src:'https://example.invalid/r',lastKey:key('r'),publishKeyPending:false},
  {id:'o',name:names[1],gistId:'existing-o',src:'https://example.invalid/o',lastKey:'old-key',publishKeyPending:true}],
  recoveryDelivery:{version:2,targets:[target('r','ready'),{...target('o','uncertain'),pendingDigest:'sent',pendingKey:key('o')}]},
  rosters:{Rosy:['R'],OCHA:['O']},notes:[{id:'keep'}],staffMemos:{private:'keep'},recs:{private:{size:1}}};
 if(kind==='held-show')S.recoveryDelivery.targets[0].heldLocalShowIds=['r-held'];
 if(kind==='partial-success'){S.groups.push({id:'x',name:'Other',gistId:'existing-x',src:'https://example.invalid/x',lastKey:'old',publishKeyPending:true});S.recoveryDelivery.targets.push({...target('x','uncertain'),groupName:'Other',pendingDigest:'x-sent',pendingKey:key('x')});}
 const unknown='送信結果が未確認です。自動再送せず、結果確認を待っています。',reasons=['配信結果の確認待ち','接続設定の保存確認待ち','配信保留（復旧状況を確認してください）',unknown];
 const issues=(kind==='pending'?reasons:[reasons[0]]).map(reason=>names[1]+'：'+reason);
 if(kind==='other-error')issues.push('Rosy：別の通信エラー');
 if(kind==='partial-success')issues.push('Other：配信結果の確認待ち');
 const calls=[],screen={textContent:'',style:{}},draft={memo:'Keep draft'},privateBefore=JSON.stringify([S.rosters,S.notes,S.staffMemos,S.recs]),rosyBefore=JSON.stringify([S.groups[0],S.recoveryDelivery.targets[0]]);
 const c=vm.createContext({S,U:{view:'live',sheet:draft},startupRecoveryNetworkHold:true,pushState:'配信結果の確認待ち（1件）',publishIssues:issues,
  session:null,pushing:false,publishInFlight:false,ready:()=>true,recordingInboxAdmitWriter:()=>()=>{},RecoveryDeliveryScope:{plan(){}},packetForBindings:()=>({}),
  currentBinding:id=>S.recoveryDelivery.targets.find(t=>t.groupId===id),copy:v=>JSON.parse(JSON.stringify(v)),payloadFor:(_s,id)=>({groupId:id,work:'latest'}),payloadKey:JSON.stringify,
  readTarget:async(t,token,active)=>{assert.equal(token,'SYNTHETIC');assert(active());calls.push('GET:'+t.groupId);return {digest:kind==='old'?'before':kind==='foreign'||t.groupId==='x'?'foreign':'sent'};},
  persist:async()=>{calls.push('persist');if(kind==='persist-fails')throw Error('synthetic-save-failure');},
  fail:code=>{throw Object.assign(Error(code),{reconnectCode:code});},message:e=>e.reconnectCode==='unknown'?unknown:e.reconnectCode||e.message,
  alert(){},render(){},app:{querySelector:()=>screen},fetch(){throw Error('External transport forbidden');}});
 vm.runInContext(recoverySlice(deliverySource,'function canPublish(','\n  // Preview')+'\n'+
  recoverySlice(deliverySource,'function pending(','function packetForBindings(')+'\nglobalThis.RecoveryDelivery={pending,hasResumed};\n'+
  recoverySlice(source,'function recoveryPublicationHolds()','async function pushOne(')+'\n'+
  recoverySlice(deliverySource,'async function reconcile(){',"\n  document.addEventListener('click'"),c);
 c.renderPublishStatus();
 return {c,S,calls,screen,draft,privateBefore,rosyBefore,key};
}
for(const [kind,expected,remaining] of [
 ['pending','配信結果を確認済み',[]],['old','未送信',[]],
 ['foreign','配信結果の確認待ち（1件）',['OCHA：配信結果の確認待ち']],
 ['persist-fails','配信結果の確認待ち（1件）',['OCHA：配信結果の確認待ち']],
 ['partial-success','配信結果の確認待ち（1件）',['Other：配信結果の確認待ち']],
 ['duplicate-names','配信に確認事項あり',['Same：配信結果の確認待ち']],
 ['other-error','配信に確認事項あり',['Rosy：別の通信エラー']],['held-show','配信に確認事項あり',[]]
])test('reconciled status preserves unsent work: '+kind,async()=>{
 const f=reconcileFixture(kind);await f.c.reconcile();
 assert.equal(f.c.publicationStatusText(),expected);assert.equal(f.screen.textContent,' ・ '+expected);
 assert.equal(f.screen.style.color,expected==='配信結果を確認済み'?'var(--dim)':'var(--bad)');
 assert.deepEqual(Array.from(f.c.publishIssues),remaining);assert.equal(f.c.pushState,'配信結果の確認待ち（1件）');
 assert.equal(f.c.U.sheet,f.draft);assert.equal(JSON.stringify([f.S.groups[0],f.S.recoveryDelivery.targets[0]]),f.rosyBefore);
 assert.equal(JSON.stringify([f.S.rosters,f.S.notes,f.S.staffMemos,f.S.recs]),f.privateBefore);assert.equal(f.c.pushing,false);
 assert.deepEqual(f.calls,kind==='partial-success'?['GET:o','persist','GET:x']:kind==='foreign'?['GET:o']:['GET:o','persist']);
 const o=f.S.recoveryDelivery.targets[1],g=f.S.groups[1];
 if(['foreign','persist-fails'].includes(kind)){assert.equal(o.status,'uncertain');assert.equal(o.pendingDigest,'sent');assert.equal(g.lastKey,'old-key');assert.equal(g.publishKeyPending,true);}
 else{assert.equal(o.status,'ready');assert.equal(o.pendingDigest,undefined);assert.equal(g.lastKey,kind==='old'?'old-key':f.key('o'));assert.equal(f.c.RecoveryDelivery.pending('o'),kind==='old');}
});
