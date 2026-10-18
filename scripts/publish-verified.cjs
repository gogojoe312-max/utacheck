'use strict';
// Existing branch-based Pages requires no settings permission. Test a candidate
// commit in CI first; only that exact, successful commit may reach the live branch.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),repo='gogojoe312-max/utacheck';
const command=(bin,args)=>execFileSync(bin,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function successfulRun(runs,sha,branch){
 const run=runs.filter(r=>r.head_sha===sha&&r.head_branch===branch&&r.name==='Verify and publish'&&r.event==='push').sort((a,b)=>b.id-a.id)[0];
 if(run?.status==='completed'&&run.conclusion!=='success')throw Error('Verification failed: '+run.html_url);
 return run?.status==='completed'&&run.conclusion==='success'?run:null;
}
async function waitForRun(sha,branch){
 const until=Date.now()+30*60*1000;
 while(Date.now()<until){
  const result=JSON.parse(command('gh',['api','repos/'+repo+'/actions/runs?head_sha='+sha+'&branch='+encodeURIComponent(branch)+'&event=push&per_page=30']));
  const run=successfulRun(result.workflow_runs||[],sha,branch);if(run)return run;
  console.log('Waiting for verification: '+branch);await new Promise(r=>setTimeout(r,15000));
 }
 throw Error('Verification is still pending; publication is not complete');
}
async function main(){
 if(command('git',['status','--porcelain']))throw Error('Commit the complete change before verifying publication');
 const origin=command('git',['remote','get-url','origin']);
 if(!/^https:\/\/github\.com\/gogojoe312-max\/utacheck(?:\.git)?$/.test(origin))throw Error('Unexpected publication repository');
 const sha=command('git',['rev-parse','HEAD']),candidate='codex/verified-'+sha.slice(0,12);
 command('git',['push','origin','HEAD:refs/heads/'+candidate]);
 const checked=await waitForRun(sha,candidate);console.log('Candidate verified: '+checked.html_url);
 command('git',['fetch','origin','main']);command('git',['merge-base','--is-ancestor','origin/main',sha]);
 if(command('git',['rev-parse','HEAD'])!==sha||command('git',['status','--porcelain']))throw Error('Working revision changed after verification');
 command('git',['push','origin',sha+':refs/heads/main']);
 const final=await waitForRun(sha,'main');
 const out=path.join(root,'release-evidence','remote');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
 command('gh',['run','download',String(final.id),'--repo',repo,'--name','final-release-evidence','--dir',out]);
 const receipt=JSON.parse(fs.readFileSync(path.join(out,'verified-release.json'),'utf8'));
 if(receipt.revision!==sha||receipt.stage!=='post'||receipt.passed!==true||JSON.stringify(receipt.checks)!==JSON.stringify(['published-assets','published-chromium','published-webkit']))throw Error('Missing exact-revision final evidence');
 console.log(JSON.stringify({verified:true,revision:sha,version:receipt.version,evidence:final.html_url,phoneReceiptVerified:false}));
}
module.exports={successfulRun};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
