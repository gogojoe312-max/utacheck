'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function checkMemberRoster(page,{legacy=false}={}){
 const saved=await page.evaluate(()=>({state:JSON.stringify(S),ui:JSON.stringify(U),hold:startupRecoveryNetworkHold}));
 const expected=['全員','斉藤','広本','米村','窪田','中山','西﨑','北原','筒井'];
 const options=()=>page.locator('#summary-member option').allTextContents();
 try{
  await page.evaluate(async legacy=>{
   document.activeElement?.blur();await saveNow();
   const formal=['斉藤','広本','米村','窪田','中山','西﨑','北原','筒井'];
   const junk=['上窪田','下斉藤','中窪','広西','広西米','斉中','広西北','ア','エ','イ','オ','お客さん','筒井ハモ','間奏','*回替わり','A','B','北'];
   S=Object.assign(structuredClone(S0),{viewer:false,ghToken:'',bkGistId:'',src:'',linkSrc:'',autoPub:false,
    groups:[{id:'qa-roster',name:'OCHA NORMA'}],groupId:'qa-roster',showId:'qa-show',
    rosters:{'OCHA NORMA':[...formal,...junk]},members:[...formal,...junk].map((name,i)=>({id:'person-'+i,name})),
    shows:[{id:'qa-show',name:'検証公演',absent:['person-6']}],
    songs:[{id:'qa-song',showId:'qa-show',groupId:'qa-roster',title:'名簿の検証',roster:[...formal,...junk].map((_,i)=>'person-'+i),blocks:{},
     lines:[...formal,...junk].map((name,i)=>({t:'合成歌詞 '+i,parts:['person-'+i],raw:name,label:name}))}],
    notes:[],pubNotes:[],subs:{'qa-show|qa-song':{6:['person-0']}},gsubs:{},assignmentEdits:{},recs:{},memos:{},plan:{slots:[]}});
   startupRecoveryNetworkHold=true;
   const wire=publicationData('qa-roster');
   // A real legacy publication: source members contains every imported label,
   // including a contaminated registered roster or missing roster metadata.
   // Do not pre-clean either failing input.
   if(legacy)delete wire.rosters;
   S.viewer=true;S.rosters={};S.members=[];applySetlist(wire);
   Object.assign(U,{view:'absent',mode:'song',songIdx:0,memberScope:'',memberName:'',sumOpen:'',sheet:null,menu:null,picker:false,overview:false});
   renderPointers.clear();scrollingUntil=0;pendingRender=false;render(true);
  },legacy);
  assert.deepEqual(await options(),expected,'Received publication must contain only formal members');
  const content=await page.evaluate(()=>JSON.stringify([S.members,S.notes,S.pubNotes,S.songs,S.subs,S.gsubs,S.rosters]));
  await page.locator('#summary-member').selectOption({label:'北原'});
  assert.equal(await page.locator('.member-absence-change').count(),1,'Formal selection still finds the actual assignment change');
  await page.evaluate(async()=>{save();await saveNow();if(saveErr)throw Error('Save failed');});
  await page.reload();await page.waitForFunction(()=>typeof normalStartupInitialized!=='undefined'&&normalStartupInitialized);
  await page.evaluate(()=>{startupRecoveryNetworkHold=true;Object.assign(U,{view:'absent',songIdx:0,memberScope:'',memberName:'',sumOpen:''});renderPointers.clear();scrollingUntil=0;render(true);});
  assert.deepEqual(await options(),expected,'Saved state after actual reload must keep the formal roster');
  await page.evaluate(()=>{U.view='summary';renderPointers.clear();scrollingUntil=0;render(true);});
  assert.deepEqual(await options(),expected,'Feedback and assignment-change selectors must agree');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify([S.members,S.notes,S.pubNotes,S.songs,S.subs,S.gsubs,S.rosters]))),JSON.parse(content),'Filtering must preserve original assignments and feedback');
  const output=process.env.QA_OUTPUT||path.join(require('node:os').tmpdir(),'utacheck-roster-qa');fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,`member-roster-${legacy?'legacy':'polluted'}-${page.viewportSize().width}.png`)});
  return {memberOptions:await options(),legacyPublicationReceived:legacy,pollutedRosterReceived:!legacy,formalMemberOptions:true,reloaded:true,bothMemberScreens:true,assignmentsPreserved:true};
 }finally{
  await page.evaluate(async saved=>{S=JSON.parse(saved.state);U=JSON.parse(saved.ui);startupRecoveryNetworkHold=saved.hold;saveErr=false;save();await saveNow();if(saveErr)throw Error('Could not restore synthetic state');renderPointers.clear();scrollingUntil=0;render(true);},saved);
 }
}
module.exports={checkMemberRoster};
