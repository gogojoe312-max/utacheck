const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const source = fs.readFileSync(path.join(__dirname,'../recovery-delivery.js'),'utf8');

async function checkReceipt(source, readback, state, storageFailure=false) {
  const gid='ocha', gistId='12345', src='https://gist.githubusercontent.com/test/12345/raw/utacheck.json';
  const target={groupId:gid,groupName:'OCHA',gistId,src,status:state,expectedRemoteSha256:'baseline',pendingDigest:'receipt',pendingKey:'submitted'};
  const group={id:gid,name:'OCHA',gistId,src,lastKey:'before',publishKeyPending:true};
  const S={groups:[group],recoveryDelivery:{version:2,targets:[target]},deviceId:'owner',deliveryOwnerDeviceId:'owner',ghToken:'fixture'};
  const root={}, reads=[], snapshot=JSON.stringify(S);
  const env={globalThis:root,S,document:{hidden:false,addEventListener(){}},startupRecoveryNetworkHold:true,
    recordingInboxCanWrite:()=>true,VIEW:()=>false,preview:false,publishInFlight:false,recordingInboxAdmitWriter:()=>()=>{},
    RecoveryDeliveryScope:{plan(){throw new Error('new local edits invalidate the old plan');}},
    gistRawSource:()=>({id:gistId,url:src}),backupDigest:async()=>readback,
    fetch:async(url,options)=>{reads.push(options.method||'GET');return {ok:true,text:async()=>JSON.stringify({id:gistId,public:false,files:{'utacheck.json':{raw_url:src,content:'{}'}}})};},
    TextEncoder,AbortController,setTimeout,clearTimeout,save(){},saveNow:async()=>{},saveErr:storageFailure,saveSeq:1,
    packState:value=>value,idbGet:async()=>({txt:JSON.stringify(S)}),render(){}};
  Function(...Object.keys(env),source)(...Object.values(env));
  const confirmed=await root.RecoveryDelivery.reconcile({groupId:gid,silent:true,onlyUncertain:true,includeBlocked:true});
  assert.deepEqual(reads,['GET']);
  if(readback==='receipt'&&!storageFailure){
    assert.equal(confirmed,true);assert.equal(target.status,'ready');assert.equal(group.lastKey,'submitted');
    assert.equal(group.publishKeyPending,false);assert.equal(target.expectedRemoteSha256,'receipt');assert.equal(target.pendingDigest,undefined);
  }else{
    assert.equal(confirmed,false);assert.equal(JSON.stringify(S),snapshot);
  }
}

for(const state of ['sending','uncertain']) {
  for(const digest of ['receipt','baseline','changed']) {
    test(state+' readback '+digest,()=>checkReceipt(source,digest,state));
  }
}
test('restore uncertain receipt on local persistence failure',()=>checkReceipt(source,'receipt','uncertain',true));
