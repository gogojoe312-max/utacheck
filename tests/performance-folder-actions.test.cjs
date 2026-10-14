const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
function fn(name){const i=source.indexOf('function '+name+'(');return source.slice(source.lastIndexOf('\n',i)+1,source.indexOf('\n}',i)+2);}
const json=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const c=vm.createContext({S:{shows:[{id:'r-new',groupId:'r',name:'10/10',folder:'新しい'},{id:'r-old',groupId:'r',name:'9/27',folder:'共通'},{id:'o',groupId:'o',name:'10/12',folder:'共通'},{id:'hidden',groupId:'r',hidden:true,name:'10/13',folder:'共通'}],songs:[{id:'song',showId:'r-old',groupId:'r',lines:[{id:'line',t:'保持'}]}],notes:[{id:'note',showId:'r-old',songId:'song',memo:'保持'}],recs:{clip:{id:'voice',duration:4}},staffMemos:{song:'保持'},members:[{id:'member'}],groups:[{id:'r',name:'Rosy'},{id:'o',name:'OCHA'}],folders:{共通:true,新しい:true,空:true},folderOrder:['共通','新しい','空'],performanceFolderOrders:{},rsongs:[],plan:{},showId:'r-old',groupId:'r'},U:{showFilter:'r',menu:null},viewer:false,preview:null,canWrite:true,backupResult:true,confirmResult:true,confirmations:[],alerts:[],backups:[],undoStack:[],saves:0,renders:0,startupRecoveryNetworkHold:true,
  folderOf:x=>x?.folder||'',h:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')});
 c.VIEW=()=>c.viewer;c.recordingInboxCanWrite=()=>c.canWrite;c.save=()=>c.saves++;c.render=()=>c.renders++;c.alert=x=>c.alerts.push(x);c.confirm=x=>(c.confirmations.push(x),c.confirmResult);
 c.automaticBackupBeforeEdit=async reason=>{c.backups.push(reason);if(c.duringBackup)c.duringBackup();return c.backupResult;};
 for(const n of ['groupDisplayName','privateDeliveryGroup','performanceDateOrder','performanceSelectionOrder','performanceFolderGroups','groupedPerformanceHTML','autoShowGroupId','recoveryMaterialShow','showDeliveryGroupId','songDeliveryGroupId','showGroupIds','performanceFolderContext','updatePerformanceFolderReference','changePerformanceFolderOrder','performanceFolderChangeKeepsDelivery','removePerformanceFolder','pushUndo','organizeSheetHTML','folderNames'])vm.runInContext(fn(n),c);
 c.showsFor=()=>c.S.shows.filter(sw=>!sw.hidden&&!c.recoveryMaterialShow(sw)&&(!c.U.showFilter||c.showGroupIds(sw).includes(c.U.showFilter)));
 c.open=name=>(c.U.menu=c.performanceFolderContext(name));return c;
}
test('default folder order uses latest parsed performance date, with undated/empty/unfiled last and no state mutation',()=>{
 const c=setup();c.S.shows.push({id:'unknown',name:'研修生発表会2612',groupId:'r',folder:'日付なし',ts:999999},{id:'unfiled',name:'10/14',groupId:'r',folder:''});
 const before=JSON.stringify(c.S), groups=json(c.performanceFolderGroups(c.showsFor(),true,'r'));
 assert.deepEqual(groups.map(x=>x[0]),['新しい','共通','日付なし','空','']);assert.equal(JSON.stringify(c.S),before);
});
test('manual up/down order is saved only for the current group, with undo and return-to-date order',async()=>{
 const c=setup();c.S.performanceFolderOrders['["o"]']={mode:'manual',names:['共通']};const before=JSON.stringify(c.S),hidden=JSON.stringify(c.S.performanceFolderOrders['["o"]']);
 c.open('共通');assert.equal(await c.changePerformanceFolderOrder('up','共通'),true);
 assert.deepEqual(json(c.performanceFolderGroups(c.showsFor(),true,'r')).map(x=>x[0]),['共通','新しい','空']);
 assert.equal(JSON.stringify(c.S.performanceFolderOrders['["o"]']),hidden);assert.deepEqual(c.S.folderOrder,['共通','新しい','空']);assert.deepEqual(JSON.parse(c.undoStack[0]).performanceFolderOrders,JSON.parse(before).performanceFolderOrders);
 c.open('共通');assert.equal(await c.changePerformanceFolderOrder('down','共通'),true);assert.deepEqual(json(c.performanceFolderGroups(c.showsFor(),true,'r')).map(x=>x[0]),['新しい','共通','空']);
 assert.equal(await c.changePerformanceFolderOrder('date'),true);assert.equal(c.S.performanceFolderOrders['["r"]'].mode,'date');assert.deepEqual(c.backups,['folder-order','folder-order','folder-order']);
});
test('owner picker and summary use matching saved scope, while members use derived dates',()=>{
 const c=setup();c.S.performanceFolderOrders['["r"]']={mode:'manual',names:['共通','新しい']};
 let html=c.groupedPerformanceHTML(c.showsFor(),x=>x.id);assert(html.indexOf('data-performance-folder="共通"')<html.indexOf('data-performance-folder="新しい"'));
 c.summaryShows=()=>c.showsFor();vm.runInContext(fn('summaryShowPicker'),c);html=c.summaryShowPicker();assert(html.indexOf('label="共通"')<html.indexOf('label="新しい"'));
 c.viewer=true;html=c.groupedPerformanceHTML(c.showsFor(),x=>x.id);assert(html.indexOf('data-performance-folder="新しい"')<html.indexOf('data-performance-folder="共通"'));
 html=c.summaryShowPicker();assert(html.indexOf('label="新しい"')<html.indexOf('label="共通"'));
});
test('delete only moves visible scoped shows to folderless and preserves all content, other groups and hidden material',async()=>{
 const c=setup(), before=json(c.S);c.open('共通');assert.equal(await c.removePerformanceFolder(c.U.menu),true);
 before.shows.find(sw=>sw.id==='r-old').folder='';assert.deepEqual(json(c.S),before);assert.equal(c.startupRecoveryNetworkHold,true);
 assert.match(c.confirmations[0],/Rosy/);assert.match(c.confirmations[0],/1公演/);assert.match(c.confirmations[0],/対象外/);assert.deepEqual(c.backups,['folder-delete']);assert.equal(c.saves,1);assert.equal(c.undoStack.length,1);
});
test('all-groups delete excludes hidden and recovery originals and warns about its whole visible scope',async()=>{
 const c=setup();c.U.showFilter='';c.S.shows.push({id:'source',groupId:'r',folder:'共通',recoverySource:'original-workbooks'});c.open('共通');
 assert.deepEqual(json(c.U.menu.showIds),['r-old','o']);assert.equal(await c.removePerformanceFolder(c.U.menu),true);
 assert.equal(c.S.shows.find(sw=>sw.id==='source').folder,'共通');assert.equal(c.S.shows.find(sw=>sw.id==='hidden').folder,'共通');assert.match(c.confirmations[0],/全グループの表示中/);
});
test('last use and true empty folder deletion clean metadata and references, retaining other folder order',async()=>{
 const c=setup();c.S.performanceFolderOrders={'["r"]':{mode:'manual',names:['空','新しい','共通']},'["o"]':{mode:'manual',names:['空','共通']}};const shows=JSON.stringify(c.S.shows);
 c.open('空');assert.equal(await c.removePerformanceFolder(c.U.menu),true);assert.equal(JSON.stringify(c.S.shows),shows);assert(!c.S.folderOrder.includes('空'));assert.equal(c.S.folders.空,undefined);assert.match(c.confirmations[0],/全グループ共通/);
 assert.deepEqual(json(c.S.performanceFolderOrders['["r"]'].names),['新しい','共通']);assert.deepEqual(json(c.S.performanceFolderOrders['["o"]'].names),['共通']);
 c.open('新しい');assert.equal(await c.removePerformanceFolder(c.U.menu),true);assert.equal(c.S.shows[0].folder,'');assert(!c.S.folderOrder.includes('新しい'));
});
test('cancel, backup failure, viewer, preview, read lock, stale scope and concurrent edit never remove a folder',async()=>{
 for(const variant of ['cancel','backup','viewer','preview','lock','scope','new-show','edit-during-backup','menu-during-backup']){
  const c=setup();c.open('共通');const menu=c.U.menu;
  if(variant==='cancel')c.confirmResult=false;if(variant==='backup')c.backupResult=false;if(variant==='viewer')c.viewer=true;if(variant==='preview')c.preview={};if(variant==='lock')c.canWrite=false;
  if(variant==='scope')c.U.showFilter='o';if(variant==='new-show')c.S.shows.push({id:'late',groupId:'r',folder:'共通'});
  if(variant==='edit-during-backup')c.duringBackup=()=>c.S.notes.push({id:'new-note',memo:'新しい編集'});if(variant==='menu-during-backup')c.duringBackup=()=>c.U.menu=null;
  const before=JSON.stringify(c.S);assert.equal(await c.removePerformanceFolder(menu),false,variant);assert.equal(c.S.shows.find(sw=>sw.id==='r-old').folder,'共通',variant);assert.equal(c.saves,0,variant);
  if(variant==='edit-during-backup')assert.equal(c.S.notes.at(-1).id,'new-note');else assert.equal(JSON.stringify(c.S),before,variant);
 }
});
test('deletion re-reads current objects after a same-content state replacement during backup',async()=>{
 const c=setup();c.open('共通');c.duringBackup=()=>{c.S=json(c.S);};assert.equal(await c.removePerformanceFolder(c.U.menu),true);assert.equal(c.S.shows.find(sw=>sw.id==='r-old').folder,'');
});
test('legacy folder-derived group changes are blocked before confirmation, backup or data edits',async()=>{
 const c=setup();c.S.shows=[{id:'legacy',name:'10/1 東京',folder:'Rosy'}];c.S.songs=[{id:'song',showId:'legacy',groupId:'o'}];c.S.folderOrder=['Rosy'];c.open('Rosy');const before=JSON.stringify(c.S);
 assert.equal(c.showDeliveryGroupId(c.S.shows[0]),'r');assert.equal(await c.removePerformanceFolder(c.U.menu),false);assert.equal(JSON.stringify(c.S),before);assert.equal(c.confirmations.length,0);assert.equal(c.backups.length,0);assert.match(c.alerts[0],/グループを保存/);
});
test('shared mixed-group performances require explicit warning, while archive and duplicate IDs cannot be targeted',async()=>{
 const c=setup();c.S.shows=[{id:'shared',folder:'共通',deliveryMode:'song'}];c.S.songs=[{id:'r',showId:'shared',groupId:'r'},{id:'o',showId:'shared',groupId:'o'}];c.open('共通');assert.equal(await c.removePerformanceFolder(c.U.menu),true);assert.match(c.confirmations[0],/他グループにも表示される共有公演/);
 c.U.showFilter='__archive__';assert.equal(c.performanceFolderContext('空'),null);assert.equal(await c.changePerformanceFolderOrder('date'),false);
 const d=setup();d.S.shows.push({id:'r-old',hidden:true,folder:'共通'});assert.equal(d.performanceFolderContext('共通'),null);
});
test('manual order rejects backup failure and concurrent group changes without affecting saved content',async()=>{
 for(const variant of ['backup','scope','edit']){const c=setup();c.open('共通');if(variant==='backup')c.backupResult=false;if(variant==='scope')c.duringBackup=()=>c.U.showFilter='o';if(variant==='edit')c.duringBackup=()=>c.S.notes.push({id:'late'});const order=JSON.stringify(c.S.performanceFolderOrders);assert.equal(await c.changePerformanceFolderOrder('up','共通'),false);assert.equal(JSON.stringify(c.S.performanceFolderOrders),order);assert.equal(c.saves,0);}
});
test('compact folder menu includes rename, scoped reorder and safe delete without a separate management screen',()=>{
 const c=setup();c.open('新しい');const html=c.organizeSheetHTML(c.U.menu);assert.match(html,/data-act="fup"[^>]*disabled/);for(const act of ['frename','fup','fdown','fdelete'])assert(html.includes('data-act="'+act+'"'));assert(!html.includes('manage-folders'));assert.match(html,/公演・曲・記録・録音は残ります/);
});
