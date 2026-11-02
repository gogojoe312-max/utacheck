'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(process.env.QA_APP_SOURCE||__dirname+'/../app.js','utf8');
function make(rec=false){
 const c=vm.createContext({S:{groups:[{id:'a',name:'A'},{id:'b',name:'B'}],shows:[{id:'sa',groupId:'a',name:'11/4',folder:'整理前'},{id:'sb',groupId:'b',name:'11/5',folder:'共通'}],songs:[],rsongs:[{id:'a',recArtist:'A',recSession:{id:'ra',label:'2026/11/4'},lines:[{t:'Aの歌詞'}]},{id:'b',recArtist:'B',recSession:{id:'rb',label:'2026/11/5',displayLabel:'共通'},lines:[{t:'Bの歌詞'}]}],notes:[{id:'kept',memo:'保持'}],recs:{kept:{dur:3}},plan:{slots:[{id:'slot',songId:'b'}]},folderOrder:['整理前','共通'],folders:{整理前:true,共通:true},performanceFolderOrders:{},rfolderOrder:[],rfolders:{},recordingFolders:['共通'],recordingDateFolderOrders:{},recMode:rec},U:{showFilter:'a',recArtistFilter:'A',menu:null},preview:null,VIEW:()=>false,recordingInboxCanWrite:()=>true,folderOf:x=>x?.folder||'',pushUndo(){},save(){},render(){},renderSheet(){},document:{activeElement:null},automaticBackupBeforeEdit:async()=>true,confirm:()=>true,alert(){}});
 const names=['groupDisplayName','privateDeliveryGroup','autoShowGroupId','recoveryMaterialShow','showDeliveryGroupId','songDeliveryGroupId','showGroupIds','performanceDateOrder','performanceSelectionOrder','performanceEmptyFolderNames','rememberPerformanceEmptyFolder','performanceFolderStillUsed','performanceFolderGroups','folderNames','rememberFolder','performanceFolderContext','updatePerformanceFolderReference','performanceFolderChangeKeepsDelivery','saveOrganization','removePerformanceFolder','changePerformanceFolderOrder','recordingClassification','recordingSelectionSongs','recordingDateInfo','canonicalRecordingFolderKey','recordingFolderKey','recordingDateBuckets','recordingDateHeading','recordingDateContext','recordingFolderError','recordingFolderDraftSnapshot','recordingFolderEditAllowed','recordingFolderNameConflict','setRecordingSongFolder','rememberRecordingFolder','updateRecordingFolderReferences','forgetEmptyRecordingFolder','finishRecordingFolderEdit','renameRecordingDateBucket','createRecordingFolder','removeRecordingDateFolder','packState','unpackState'];
 for(const n of names){const i=source.indexOf('function '+n+'(');if(i<0)continue;vm.runInContext(source.slice(source.lastIndexOf('\n',i)+1,source.indexOf('\n}',i)+2),c);}
 c.showsFor=()=>c.S.shows.filter(s=>!c.U.showFilter||c.showGroupIds(s).includes(c.U.showFilter));return c;
}
const snap=c=>JSON.stringify([c.S.shows.find(s=>s.id==='sb'),c.S.rsongs.find(s=>s.id==='b'),c.S.notes,c.S.recs,c.S.plan]);
test('LIVE same-name folders in another group do not block scoped rename or change that group',()=>{
 const c=make(),kept=snap(c),m=c.performanceFolderContext('整理前');m.mode='folder';assert.equal(c.saveOrganization(m,{name:'共通'}),'');assert.equal(c.S.shows[0].folder,'共通');assert.equal(snap(c),kept);
 assert.equal(c.saveOrganization({kind:'organize',mode:'folder',scope:'a'},{name:'共通'}),'同じ名前のフォルダがあります。');
});
test('LIVE creation, empty rename/delete and manual ordering keep another group separate after serialization',async()=>{
 const c=make(),kept=snap(c);assert.equal(c.saveOrganization({kind:'organize',mode:'folder',scope:'a'},{name:'共通'}),'');
 const names=()=>Array.from(c.performanceFolderGroups(c.showsFor(),true,c.U.showFilter),b=>b[0]);assert(names().includes('共通'));c.S=c.unpackState(JSON.parse(JSON.stringify(c.packState(c.S))));assert(names().includes('共通'));
 let m=c.performanceFolderContext('共通');m.mode='folder';assert.equal(c.saveOrganization(m,{name:'変更後'}),'');assert(names().includes('変更後'));assert(!names().includes('共通'));assert.equal(snap(c),kept);
 c.U.menu=c.performanceFolderContext('変更後');assert.equal(await c.changePerformanceFolderOrder('move','変更後','整理前'),true);assert(names().includes('変更後'));
 c.U.menu=c.performanceFolderContext('変更後');assert.equal(await c.removePerformanceFolder(c.U.menu),true);assert(!names().includes('変更後'));assert.equal(snap(c),kept);
});
