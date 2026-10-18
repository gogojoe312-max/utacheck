'use strict';
// A receipt is produced only after every required check exits successfully.
const fs=require('node:fs'),path=require('node:path'),{spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const checks={
 pre:[['behavior',['--test',...fs.readdirSync(path.join(root,'tests')).filter(p=>p.endsWith('.test.cjs')).sort().map(p=>'tests/'+p)]],
  ['chromium',['tests/settings-rec-browser.cjs'],{BROWSER_ENGINE:'chromium'}],
  ['webkit',['tests/settings-rec-browser.cjs'],{BROWSER_ENGINE:'webkit'}]],
 post:[['published-assets',['tests/published-assets.cjs']],
  ['published-chromium',['tests/settings-rec-browser.cjs'],{BROWSER_ENGINE:'chromium',QA_BASE_URL:'https://gogojoe312-max.github.io/utacheck/'}],
  ['published-webkit',['tests/settings-rec-browser.cjs'],{BROWSER_ENGINE:'webkit',QA_BASE_URL:'https://gogojoe312-max.github.io/utacheck/'}]]
};
function validatePreflight(receipt,revision){
 if(receipt?.revision!==revision||receipt?.stage!=='pre'||receipt?.passed!==true||JSON.stringify(receipt.checks)!==JSON.stringify(checks.pre.map(c=>c[0])))throw Error('This revision has no complete pre-publication verification');
}
function executeChecks(stage,run){
 if(!checks[stage])throw Error('Unknown release stage');
 const passed=[];
 for(const [name,args,env] of checks[stage]){
  const result=run(name,args,env||{});
  if(result!==0)throw Error('Release verification failed: '+name);
  passed.push(name);
 }
 return passed;
}
function main(stage){
 const out=path.join(root,'release-evidence');fs.mkdirSync(out,{recursive:true});
 const target=path.join(out,stage==='pre'?'preflight.json':'verified-release.json');fs.rmSync(target,{force:true});
 const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 if(stage==='post')validatePreflight(JSON.parse(fs.readFileSync(path.join(out,'preflight.json'),'utf8')),revision);
 const passed=executeChecks(stage,(name,args,env)=>{
  const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
  const log=fs.openSync(path.join(dir,'check.log'),'w');
  console.log('Checking '+name+'…');
  try{return spawnSync(process.execPath,args,{cwd:root,env:{...process.env,...env,QA_OUTPUT:dir},stdio:['ignore',log,log]}).status;}
  finally{fs.closeSync(log);}
 });
 const version=/utacheck-([0-9.]+)/.exec(fs.readFileSync(path.join(root,'sw.js'),'utf8'))?.[1];
 const receipt={stage,revision,version,passed:true,checks:passed,checkedAt:new Date().toISOString(),
  scope:'Automated desktop Chromium and WebKit, synthetic publication/receive/save/reload/member UI. Actual phone receipt is not established.'};
 fs.writeFileSync(target,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
module.exports={executeChecks,validatePreflight};
if(require.main===module){try{main(process.argv[2]);}catch(error){console.error(error.message);process.exitCode=1;}}
