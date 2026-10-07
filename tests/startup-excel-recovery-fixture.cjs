'use strict';
// This fixture runs the whole application against a transaction-local synthetic
// IDB and its actual checked-in SheetJS/parser. No user files or keys are read.
const fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const Inventory=require('../startup-local-storage-inventory.js');
const Recovery=require('../startup-local-publication-recovery.js');
const ExcelRecovery=require('../startup-local-excel-recovery.js');
const Reader=require('../startup-saved-publication-reader.js');
const Restoration=require('../startup-file-restoration.js');
const Inspection=require('../startup-file-inspection.js');
const Bounded=require('../startup-backup-inspection.js');
const XLSX=require('../vendor/xlsx.full.min.js');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const PRIVATE='PRIVATE_SYNTHETIC_EXCEL_RECOVERY';
function documentFixture(){
  const elements=new Map(),messages=[],handlers=new Map();
  const element=tag=>({tagName:tag.toUpperCase(),id:'',value:'',type:'password',dataset:{},disabled:false,hidden:false,inert:false,
    textContent:'',innerHTML:'',style:{setProperty(){},removeProperty(){}},children:[],
    classList:{add(){},remove(){},contains(){return false;},toggle(){}},setAttribute(name,value){this[name]=value;},getAttribute(name){return this[name];},
    append(...nodes){this.children.push(...nodes);},appendChild(node){this.children.push(node);if(node.id)elements.set(node.id,node);messages.push(node);return node;},
    remove(){if(this.id)elements.delete(this.id);},querySelector(){return null;},querySelectorAll(){return [];},closest(){return null;},
    addEventListener(){},removeEventListener(){},blur(){},focus(){},setSelectionRange(){},
    getBoundingClientRect(){return {x:0,y:0,top:0,left:0,right:390,bottom:844,width:390,height:844};}});
  const app=element('main');app.id='app';elements.set(app.id,app);const body=element('body');
  const document={hidden:false,body,activeElement:body,title:'',documentElement:element('html'),getElementById:id=>elements.get(id)||null,
    createElement:element,querySelector(){return null;},querySelectorAll(){return [];},
    addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},removeEventListener(){}};
  for(const name of ['input','password','label','visibility','visible-notice','check','cancel','restore','result']){
    const node=element(['input','password'].includes(name)?'input':'button');node.id='startup-file-'+name;node.hidden=name==='restore';node.disabled=['check','restore'].includes(name);elements.set(node.id,node);
  }
  for(const id of ['startup-local-recovery-result','startup-backup-check','startup-backup-result']){const node=element('pre');node.id=id;elements.set(id,node);}
  return {document,app,elements,messages,handlers};
}
function appContext(idb,options={}){
  const dom=documentFixture(),localValues=new Map(Object.entries(options.localValues||{})),localWrites=[],windowHandlers=new Map();
  const calls={network:[],saves:0,reloads:0,inventory:0,build:0,excelBuild:0,parse:0,packets:[],excelPackets:[]};
  const excelRecovery={build:(...args)=>{calls.excelBuild++;const result=ExcelRecovery.build(...args);if(result.packet)calls.excelPackets.push(clone(result.packet));return result;}};
  const localStorage={get length(){return localValues.size;},key:i=>[...localValues.keys()][i]??null,getItem:key=>localValues.get(key)??null,
    setItem(key,value){localWrites.push([key,value]);localValues.set(key,String(value));},removeItem(){throw Error(PRIVATE+'_DELETE_FORBIDDEN');}};
  class FileReader{readAsArrayBuffer(file){file.arrayBuffer().then(bytes=>{this.result=bytes;this.onload?.();});}abort(){this.onabort?.();}}
  const window={addEventListener(name,fn){if(!windowHandlers.has(name))windowHandlers.set(name,[]);windowHandlers.get(name).push(fn);},
    removeEventListener(){},innerWidth:390,innerHeight:844,scrollY:0,visualViewport:null,indexedDB:{databases:async()=>[{name:'utacheck',version:1}]}};
  const inventory=options.inventory||{inspect:async input=>{calls.inventory++;return Inventory.inspect(input);}};
  const recovery={build:(...args)=>{calls.build++;const result=Recovery.build(...args);if(result.packet)calls.packets.push(clone(result.packet));return result;}};
  const c=vm.createContext({window,document:dom.document,navigator:{},location:{hash:'',origin:'https://synthetic.invalid',pathname:'/',reload:()=>calls.reloads++},
    localStorage,sessionStorage:localStorage,indexedDB:{open(){throw Error(PRIVATE+'_NEW_DATABASE_FORBIDDEN');}},syntheticDatabase:idb.database,
    StartupLocalStorageInventory:inventory,StartupLocalPublicationRecovery:recovery,StartupSavedPublicationReader:options.reader||Reader,
    StartupFileRestoration:options.restorer||Restoration,StartupFileInspection:Inspection,StartupBackupInspection:Bounded,StartupLocalExcelRecovery:excelRecovery,XLSX,...(options.cacheStorage?{caches:options.cacheStorage}:{}),
    crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,File,FileReader,AbortController,
    btoa,atob,structuredClone,URL,URLSearchParams,performance:{now:()=>0},innerWidth:390,innerHeight:844,
    setTimeout:(fn,ms)=>ms===0?setTimeout(fn,0):0,clearTimeout,setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
    fetch:(url,input)=>{calls.network.push({url,input});if(options.fetch)return options.fetch(url,input);throw Error(PRIVATE+'_NETWORK_FORBIDDEN');},
    alert(){throw Error(PRIVATE+'_UNEXPECTED_ALERT');},prompt(){throw Error(PRIVATE+'_UNEXPECTED_PROMPT');},confirm(){throw Error(PRIVATE+'_UNEXPECTED_CONFIRM');},callsForQA:calls});
  vm.runInContext(source,c);vm.runInContext('DB=syntheticDatabase;save=()=>{callsForQA.saves++;throw Error("PRIVATE_NORMAL_SAVE_FORBIDDEN");};saveNow=save;',c);
  const realParse=c.parseXLSX;
  c.parseXLSX=async(...args)=>{calls.parse++;await options.beforeParse?.({args,c,calls,document:dom.document});const result=await realParse(...args);await options.afterParse?.({args,result,c,calls,document:dom.document});return result;};
  options.configure?.({c,document:dom.document,run:text=>vm.runInContext(text,c)});
  return {c,...dom,calls,localWrites,localValues,windowHandlers,run:text=>vm.runInContext(text,c)};
}

async function settle(f){
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,5));
    if(f.run('startupPhase')!=='loading'&&!f.run('startupAutomaticRecoveryActive')){
      await new Promise(resolve=>setImmediate(resolve));return;
    }
  }
  throw Error('synthetic Excel startup did not settle');
}
async function until(predicate){
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}
  throw Error('synthetic Excel startup did not reach gate');
}
module.exports={appContext,settle,until,XLSX,clone};
