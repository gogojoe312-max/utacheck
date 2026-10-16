const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const start=source.indexOf('function rememberFolderExpansion('),end=source.indexOf('\ndocument.addEventListener("focusin", (e) =>',start);
function fixture(rec){
 const events={},S={showId:'show',rsongId:'song'},U={};
 const folder={isConnected:true,open:true,dataset:rec?{recordingScope:'Artist',recordingFolder:'["Folder"]'}:{performanceScope:'group',performanceFolder:'Folder'},
  matches:selector=>selector===(rec?'details.rec-date':'details.performance-folder')};
 const summary={parentElement:folder,get isConnected(){return folder.isConnected;}};
 const target={closest:selector=>selector.startsWith('details.')?summary:null};
 const c=vm.createContext({S,U,document:{addEventListener(type,listener){events[type]=listener;}}});vm.runInContext(source.slice(start,end),c);
 return {S,U,folder,summary,target,click(extra={}){events.click({target,button:0,...extra});},toggle(){events.toggle({target:folder});},get remembered(){return rec?U.recordingFolderOpen:U.performanceFolderOpen;},key:JSON.stringify(rec?['Artist','["Folder"]']:['group','Folder'])};
}
test('LIVE and REC remember a summary close synchronously before a redraw or the queued native toggle',()=>{
 for(const rec of [false,true]){const f=fixture(rec),before=JSON.stringify(f.S);f.click();assert.equal(f.remembered.folders[f.key],false);assert.equal(f.folder.open,true,'native default has not run yet');f.folder.isConnected=false;f.toggle();assert.equal(f.remembered.folders[f.key],false,'late old-node toggle cannot reopen the folder');assert.equal(JSON.stringify(f.S),before);}
});
test('keyboard-generated summary clicks preserve native opening and closing semantics',()=>{
 for(const rec of [false,true]){const f=fixture(rec);f.folder.open=false;f.click({detail:0});assert.equal(f.remembered.folders[f.key],true);f.folder.open=true;f.toggle();assert.equal(f.remembered.folders[f.key],true);f.click({detail:0});assert.equal(f.remembered.folders[f.key],false);}
});
test('folder actions, drag handles, interactive children and cancelled clicks never change disclosure preference',()=>{
 for(const rec of [false,true]){const f=fixture(rec);f.target.closest=selector=>selector.startsWith('details.')?f.summary:{control:true};f.click();assert.equal(f.remembered,undefined);
  f.target.closest=selector=>selector.startsWith('details.')?f.summary:null;f.click({defaultPrevented:true});f.click({button:1});assert.equal(f.remembered,undefined);
 }
});
test('connected native toggle fallback updates preference and selection changes reset the remembered scope',()=>{
 for(const rec of [false,true]){const f=fixture(rec);f.folder.open=false;f.toggle();assert.equal(f.remembered.folders[f.key],false);f.remembered.folders.other=true;if(rec)f.S.rsongId='next-song';else f.S.showId='next-show';f.folder.open=true;f.toggle();assert.equal(f.remembered.folders[f.key],true);assert.equal(f.remembered.folders.other,undefined);}
});
