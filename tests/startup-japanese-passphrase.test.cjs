'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {deflateRawSync}=require('node:zlib');
const path=require('node:path');
const root=process.env.UTA_QA_ROOT||path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const API=require(path.join(root,'startup-file-inspection.js'));
const bounded=require(path.join(root,'startup-backup-inspection.js'));
const block=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start,a);return source.slice(start,end);};
const clone=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const payload=()=>({app:'utacheck',at:1791300000000,state:{shows:[{id:'SYNTHETIC_QA_SHOW',name:'SYNTHETIC_QA_PRIVATE_NAME'}],songs:[{id:'SYNTHETIC_QA_SONG',lines:[{t:'SYNTHETIC_QA_PRIVATE_LYRIC'}]}],notes:[{memo:'SYNTHETIC_QA_PRIVATE_MEMO'}],recs:{'SYNTHETIC_QA_SHOW|SYNTHETIC_QA_SONG|123':{name:'SYNTHETIC_QA_PRIVATE_AUDIO'}}}});
const compressed=value=>({bk:1,z:true,data:deflateRawSync(Buffer.from(JSON.stringify(value))).toString('base64url')});
const localFile=raw=>new File([JSON.stringify(raw)],'SYNTHETIC_QA_LOCAL_BACKUP.json',{type:'application/json'});
function appCrypto(){
 let touched=0;const shared={bkKey:'SYNTHETIC_QA_EXISTING_KEY',notes:[{memo:'SYNTHETIC_QA_EXISTING_NOTE'}]},before=JSON.stringify(shared);
 const deny=()=>{touched++;throw Error('forbidden shared/storage/network access');};
 const c=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,
  S:new Proxy(shared,{get:deny,set:deny}),U:new Proxy({},{get:deny,set:deny}),fetch:deny,save:deny,saveNow:deny,
  localStorage:new Proxy({},{get:deny,set:deny}),sessionStorage:new Proxy({},{get:deny,set:deny}),indexedDB:new Proxy({},{get:deny,set:deny})});
 vm.runInContext(block('const b64e = (u8) => {','function connectLink('),c);
 vm.runInContext(block('async function deriveKey(','async function wrap('),c);
 const base64Decode=vm.runInContext('b64d',c);
 return{c,decodeBackup:(raw,key,context)=>bounded.decodeBackup(raw,key,{...context,openJSON:c.openJSON,base64Decode}),
  safe(){assert.equal(touched,0);assert.equal(JSON.stringify(shared),before);}};
}
function inspector(crypto){
 const updates=[];let reads=0,ancillary=0;const api=API.create({readFile:async file=>{reads++;return file.arrayBuffer();},decodeBackup:crypto.decodeBackup,
  counts:bounded.counts,isActive:()=>true,onUpdate:value=>updates.push(clone(value)),readAncillary:async()=>{ancillary++;return{total:124,audio:20,workbooks:100,other:4,unclassified:0,bytes:1234567,matchedRecordings:1};}});
 return{api,updates,reads:()=>reads,ancillary:()=>ancillary,safe(...keys){const text=JSON.stringify(updates);assert(!text.includes('SYNTHETIC_QA_'));for(const key of keys)assert(!text.includes(key));crypto.safe();}};
}
const exactCases=[
 {name:'hiragana',key:'疑似QA_ひらがなけんしょう',wrong:'疑似QA_ひらがなけんしよう'},
 {name:'katakana',key:'疑似QA_カタカナケンショウ',wrong:'疑似QA_かたかなけんしょう'},
 {name:'kanji',key:'疑似QA_漢字合言葉確認',wrong:'疑似QA_漢字合言葉確忍'},
 {name:'full-width and half-width',key:'疑似QA_ＡＢＣ１２３ｶﾀｶﾅ',wrong:'疑似QA_ABC123カタカナ'},
 {name:'leading and trailing whitespace',key:' \t疑似QA_前後空白\u3000 ',wrong:'疑似QA_前後空白'},
 {name:'Japanese combining mark',key:'疑似QA_か\u3099くにん',wrong:'疑似QA_がくにん別'},
 {name:'Latin combining mark',key:'疑似QA_e\u0301日本語',wrong:'疑似QA_é日本語別'},
 {name:'mixed astral Unicode',key:'疑似QA_🎵日本語とｶﾀｶﾅ',wrong:'疑似QA_🎶日本語とｶﾀｶﾅ'}
];
for(const sample of exactCases)test('fresh synthetic real encrypted file preserves exact '+sample.name+' passphrase',async()=>{
 const crypt=appCrypto(),packet=payload(),packetBefore=JSON.stringify(packet),raw=await crypt.c.sealJSON(compressed(packet),sample.key),rawBefore=JSON.stringify(raw),file=localFile(raw),bytesBefore=Buffer.from(await file.arrayBuffer());
 const f=inspector(crypt);f.api.select(file);assert.equal((await f.api.check(sample.wrong)).status,'decrypt-failed');assert.equal(f.ancillary(),0);
 const result=await f.api.check(sample.key);assert.equal(result.status,'checked');assert.equal(result.counts.shows,1);assert.equal(result.counts.songs,1);assert.equal(result.counts.notes,1);assert.equal(result.counts.recs,1);
 assert.equal(result.ancillary.total,124);assert.equal(f.ancillary(),1);assert.equal(f.reads(),2);
 assert.equal(JSON.stringify(packet),packetBefore);assert.equal(JSON.stringify(raw),rawBefore);assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytesBefore);f.safe(sample.key,sample.wrong);
});

function controlHarness(extra={}){
 const markup=source.match(/const fileInspection='([^']*)';/)?.[1];assert(markup,'dedicated local-file protection markup');
 const elements={},listeners={document:{},window:{}},calls=[];let forbidden=0;
 const deny=()=>{forbidden++;throw Error('forbidden shared/storage/network/logging action');};
 for(const match of markup.matchAll(/<([a-z]+)\b[^>]*id="(startup-file-[^"]+)"[^>]*>/g)){
  const attrs={};for(const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g))attrs[attr[1]]=attr[2];
  const e={id:match[2],value:'',disabled:/\bdisabled(?:\s|>)/.test(match[0]),hidden:/\bhidden(?:\s|>)/.test(match[0]),textContent:'',
   type:attrs.type||'',inputMode:attrs.inputmode||'',lang:attrs.lang||'',autocomplete:attrs.autocomplete||'',autocapitalize:attrs.autocapitalize||'',autocorrect:attrs.autocorrect||'',
   selectionStart:0,selectionEnd:0,handlers:{},addEventListener(type,handler){(this.handlers[type]??=[]).push(handler);},blur(){calls.push(['blur',this.id]);},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;calls.push(['selection',start,end]);},focus(options){calls.push(['focus',this.id,options]);},setAttribute(key,value){attrs[key]=String(value);if(key==='type')this.type=String(value);if(key==='inputmode')this.inputMode=String(value);if(key==='lang')this.lang=String(value);},
   getAttribute:key=>attrs[key]??null,removeAttribute(key){delete attrs[key];},closest:selector=>selector==='#startup-protection'?{id:'startup-protection'}:null};
  elements[e.id]=e;
 }
 const toggleId=markup.match(/<button\b[^>]*id="([^"]+)"[^>]*>日本語で入力/)?.[1];assert(toggleId,'Japanese input display toggle');
 const c=vm.createContext({startupPhase:'blocked',recordingInboxCanWrite:()=>false,
  document:{hidden:false,getElementById:id=>elements[id]||null,addEventListener:(type,fn)=>{(listeners.document[type]??=[]).push(fn);}},
  window:{addEventListener:(type,fn)=>{(listeners.window[type]??=[]).push(fn);}},
  StartupFileInspection:{create:deps=>{calls.push(['create']);return API.create({...deps,...extra});}},
  StartupBackupInspection:{counts:bounded.counts,decodeBackup:extra.decodeBackup||((raw,key,context)=>{calls.push(['decode',key]);return bounded.decodeBackup(raw,key,{...context,openJSON:async()=>({bk:1,data:Buffer.from(JSON.stringify(payload())).toString('base64url')}),base64Decode:x=>new Uint8Array(Buffer.from(x,'base64url'))});})},
  startupCancelBackupInspection:()=>calls.push(['backup-cancel']),openJSON:()=>{},b64d:()=>{},
  FileReader:class{readAsArrayBuffer(file){calls.push(['read']);Promise.resolve(file.arrayBuffer()).then(bytes=>{if(!this.aborted){this.result=bytes;this.onload?.();}});}abort(){this.aborted=true;this.onabort?.();}},
  Blob,ArrayBuffer,Uint8Array,AbortController,Number,Date,Object,Set,JSON,TextDecoder,
  S:new Proxy({},{get:deny,set:deny}),U:new Proxy({},{get:deny,set:deny}),DB:null,console:new Proxy({},{get:deny}),
  db:deny,idbGet:deny,idbPut:deny,putClip:deny,delClip:deny,save:deny,saveNow:deny,restoreBackupFile:deny,fetch:deny,
  localStorage:new Proxy({},{get:deny,set:deny}),sessionStorage:new Proxy({},{get:deny,set:deny}),indexedDB:new Proxy({},{get:deny,set:deny})});
 vm.runInContext(block('let startupFileInspector=null;','function startupSafeError('),c);
 vm.runInContext(block("if(typeof window!=='undefined')window.addEventListener('pagehide'",'let startupFileInspector=null;'),c);
 vm.runInContext(block("for (const type of ['click','input'",'recordingInboxOwnerUI();'),c);
 const fire=(id,type,extraEvent={})=>{const actions=[],control=elements[id],target=control?{closest:selector=>selector==='#startup-protection'?{id:'startup-protection'}:selector.split(',').includes('#'+id)?control:null}:{closest:()=>null};
  const event={target,...extraEvent,stopImmediatePropagation:()=>actions.push('stop'),preventDefault:()=>actions.push('prevent')};
  const global=listeners.document[type]||[],local=control?.handlers[type]||[];assert(global.length||local.length,'event listener for '+type);for(const handler of global)handler(event);if(!actions.includes('stop'))for(const handler of local)handler(event);return{actions,event};};
 return{c,elements,calls,listeners,markup,toggleId,password:elements['startup-file-password'],toggle:elements[toggleId],
  fire,clickToggle:()=>fire(toggleId,'click'),safe(...keys){assert.equal(forbidden,0);const rendered=Object.values(elements).map(x=>x.textContent).join('\n');assert(!rendered.includes('SYNTHETIC_QA_'));for(const key of keys)assert(!rendered.includes(key));}};
}

test('passphrase is masked by default with exact text input hints and a nearby visibility warning',()=>{
 const f=controlHarness(),field=f.password;assert.equal(field.type,'password');assert.equal(field.inputMode,'text');assert.equal(field.lang,'ja');
 for(const attr of ['autocomplete','autocapitalize','autocorrect'])assert.equal(field.getAttribute(attr),'off',attr);
 assert.equal(field.getAttribute('spellcheck'),'false');assert.equal(field.getAttribute('maxlength'),'4096');assert.equal(f.toggle.getAttribute('aria-pressed'),'false');
 assert.equal(f.elements['startup-file-visible-notice'].hidden,true);assert.match(f.markup,/日本語入力中は合言葉が画面に表示されます/);
 assert(!f.calls.some(x=>['read','decode'].includes(x[0])));f.safe();
});
test('explicit visibility toggle keeps the same input, exact Unicode value and native selection range',()=>{
 const f=controlHarness(),field=f.password,key=' \t疑似QA_か\u3099ＡＢＣｶﾀｶﾅ\u3000 ';field.value=key;field.selectionStart=2;field.selectionEnd=10;
 assert.deepEqual(f.clickToggle().actions,['stop','prevent']);assert.equal(f.password,field);assert.equal(field.type,'text');assert.equal(field.value,key);
 assert.equal(field.selectionStart,2);assert.equal(field.selectionEnd,10);assert.equal(f.elements['startup-file-visible-notice'].hidden,false);assert.equal(f.toggle.getAttribute('aria-pressed'),'true');assert.equal(f.toggle.textContent,'合言葉を隠す');
 assert(f.calls.some(x=>x[0]==='blur'));assert(f.calls.some(x=>x[0]==='focus'));assert(f.calls.some(x=>x[0]==='selection'));
 f.clickToggle();assert.equal(f.password,field);assert.equal(field.type,'password');assert.equal(field.value,key);assert.equal(f.elements['startup-file-visible-notice'].hidden,true);assert.equal(f.toggle.getAttribute('aria-pressed'),'false');
 assert(!f.calls.some(x=>['read','decode'].includes(x[0])));f.safe(key);
});
test('IME, beforeinput, paste, cut and selection events keep native defaults and stop downstream handlers',()=>{
 const f=controlHarness();f.clickToggle();const field=f.password,id=field.id;
 for(const type of ['compositionstart','compositionupdate','compositionend','paste','cut','select'])assert.deepEqual(f.fire(id,type).actions,['stop'],type);
 for(const inputType of ['insertText','insertCompositionText','insertFromPaste','deleteContentBackward','deleteContentForward'])assert.deepEqual(f.fire(id,'beforeinput',{inputType}).actions,['stop'],inputType);
 for(const [type,extra] of [['input',{}],['change',{}],['keydown',{key:'a'}],['keydown',{key:'Backspace'}],['keydown',{key:'Delete'}],['keydown',{key:'ArrowLeft'}],['keydown',{key:'a',ctrlKey:true}],['keydown',{key:'v',metaKey:true}],['keydown',{key:'Tab'}],['pointerdown',{}],['click',{}]])assert.deepEqual(f.fire(id,type,extra).actions,['stop'],type+' '+(extra.key||''));
 assert(!f.calls.some(x=>['read','decode'].includes(x[0])));f.safe();
});
test('IME confirmation Enter and keyCode229 never check, and composition blocks toggling or direct checking',async()=>{
 const f=controlHarness();f.c.startupSelectLocalFile(localFile(compressed(payload())));f.clickToggle();const key='疑似QA_日本語変換候補';f.password.value=key;
 f.fire(f.password.id,'compositionstart');assert.equal(f.c.startupFileIMEActive(),true);
 for(const event of [{key:'Enter',isComposing:true},{key:'Enter',isComposing:false,keyCode:229},{key:'Enter',isComposing:false,keyCode:13}])assert.deepEqual(f.fire(f.password.id,'keydown',event).actions,['stop']);
 f.clickToggle();assert.equal(f.password.type,'text');assert.equal(f.password.value,key);await f.c.startupCheckLocalFile();assert.equal(f.password.type,'text');assert.equal(f.password.value,key);assert(!f.calls.some(x=>x[0]==='read'));
 f.fire(f.password.id,'compositionend');assert.equal(f.c.startupFileIMEActive(),false);
 assert.deepEqual(f.fire(f.password.id,'keydown',{key:'Enter',keyCode:229}).actions,['stop']);assert(!f.calls.some(x=>x[0]==='read'));
 let checks=0;f.c.startupCheckLocalFile=()=>{checks++;};assert.deepEqual(f.fire(f.password.id,'keydown',{key:'Enter',isComposing:false,keyCode:13}).actions,['stop','prevent']);assert.equal(checks,1);f.safe(key);
});
test('committed Japanese input reaches the decoder exactly and clears the displayed field before any await',async()=>{
 const key=' \t疑似QA_ひらがな漢字ＡＢＣｶﾀｶﾅか\u3099\u3000 ';let received;
 const f=controlHarness({decodeBackup:async(raw,password)=>{received=password;return payload();}}),file=localFile(compressed(payload())),before=Buffer.from(await file.arrayBuffer());
 f.c.startupSelectLocalFile(file);f.clickToggle();f.fire(f.password.id,'compositionstart');f.password.value='疑似QA_変換前';f.fire(f.password.id,'input');f.fire(f.password.id,'compositionend');f.password.value=key;f.fire(f.password.id,'input');
 const pending=f.c.startupCheckLocalFile();assert.equal(f.password.value,'');assert.equal(f.password.type,'password');assert.equal(f.elements['startup-file-visible-notice'].hidden,true);assert.equal(f.toggle.getAttribute('aria-pressed'),'false');
 await pending;assert.equal(received,key);assert.match(f.elements['startup-file-result'].textContent,/候補確認ができました/);assert.deepEqual(Buffer.from(await file.arrayBuffer()),before);f.safe(key);
});
for(const action of ['check','cancel','new selection','hidden','pagehide'])test('displayed secret is cleared and remasked on '+action,async()=>{
 const f=controlHarness(),file=localFile(compressed(payload())),before=Buffer.from(await file.arrayBuffer());f.c.startupSelectLocalFile(file);f.clickToggle();const key='疑似QA_表示消去対象';f.password.value=key;
 if(action==='check')await f.c.startupCheckLocalFile();
 if(action==='cancel')f.c.startupCancelLocalFileInspection();
 if(action==='new selection')f.c.startupSelectLocalFile(localFile(compressed(payload())));
 if(action==='hidden'){f.c.document.hidden=true;for(const handler of f.listeners.document.visibilitychange)handler();}
 if(action==='pagehide')for(const handler of f.listeners.window.pagehide)handler();
 assert.equal(f.password.value,'');assert.equal(f.password.type,'password');assert.equal(f.toggle.getAttribute('aria-pressed'),'false');assert.equal(f.elements['startup-file-visible-notice'].hidden,true);assert.equal(f.c.startupFileIMEActive(),false);
 assert.deepEqual(Buffer.from(await file.arrayBuffer()),before);f.safe(key);
});
test('failed decryption leaves no displayed secret and still permits a fresh exact entry',async()=>{
 const key='疑似QA_再入力の日本語';let decoded=0;
 const f=controlHarness({decodeBackup:async(raw,password)=>{decoded++;if(password!==key)throw Object.assign(Error('SYNTHETIC_QA_DECRYPT_DETAIL'),{inspectionCode:'decrypt-failed'});return payload();}});
 f.c.startupSelectLocalFile(localFile(compressed(payload())));f.clickToggle();f.password.value='疑似QA_間違った日本語';await f.c.startupCheckLocalFile();assert.equal(f.password.value,'');assert.equal(f.password.type,'password');assert.match(f.elements['startup-file-result'].textContent,/復号を確認できません/);
 f.clickToggle();f.password.value=key;await f.c.startupCheckLocalFile();assert.equal(decoded,2);assert.equal(f.password.value,'');assert.equal(f.password.type,'password');assert.match(f.elements['startup-file-result'].textContent,/候補確認ができました/);f.safe(key);
});
test('a cancelled older check cannot clear a newer key and the exact new key can be shown after drain',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const f=controlHarness({decodeBackup:async()=>{await gate;return payload();}});
 f.c.startupSelectLocalFile(localFile(compressed(payload())));f.clickToggle();f.password.value='疑似QA_旧入力';const pending=f.c.startupCheckLocalFile();await flush();
 f.c.startupSelectLocalFile(localFile(compressed(payload())));const key='疑似QA_新しい日本語入力';f.password.value=key;
 // Toggling while the previous crypto work drains is intentionally guarded.
 f.clickToggle();assert.equal(f.password.type,'password');assert.equal(f.password.value,key);release();await pending;
 assert.equal(f.password.type,'password');assert.equal(f.password.value,key);assert.match(f.elements['startup-file-result'].textContent,/選択/);
 f.clickToggle();assert.equal(f.password.type,'text');assert.equal(f.password.value,key);f.safe(key);
});
test('a blocked, hidden or busy toggle cannot reveal an entered passphrase',async()=>{
 for(const condition of ['not blocked','hidden','busy']){let release;const gate=new Promise(resolve=>release=resolve);const f=controlHarness({decodeBackup:async()=>{await gate;return payload();}});
  let pending;if(condition==='busy'){f.c.startupSelectLocalFile(localFile(compressed(payload())));f.password.value='疑似QA_検査中';pending=f.c.startupCheckLocalFile();await flush();}
  if(condition==='not blocked')f.c.startupPhase='ready';if(condition==='hidden')f.c.document.hidden=true;
  const key='疑似QA_隠すべき入力';f.password.value=key;f.c.startupTogglePassphrase();assert.equal(f.password.type,'password');assert.equal(f.password.value,key);assert.equal(f.elements['startup-file-visible-notice'].hidden,true);
  if(pending){release();await pending;}f.safe(key);
 }
});
test('new local passphrase code has no normalization, persistent state writes, network or logging path',()=>{
 const local=block('let startupFileInspector=null;','function startupReadSavedLocalKeys(');
 assert.doesNotMatch(local,/\b(?:fetch|save|saveNow|idbPut|putClip|delClip|restoreBackupFile|backupDigest|alert|prompt)\s*\(/);
 assert.doesNotMatch(local,/\b(?:console|localStorage|sessionStorage|indexedDB)\s*\./);assert.doesNotMatch(local,/\.\s*(?:trim|normalize|toLowerCase|toUpperCase)\s*\(/);
 assert.doesNotMatch(local,/\b(?:S|U)\s*\./);
});

test('IME binding is idempotent across repeated toggles and file selection',()=>{
 const f=controlHarness();for(let i=0;i<4;i++){f.clickToggle();f.c.startupSelectLocalFile(localFile(compressed(payload())));}
 for(const type of ['compositionstart','compositionupdate','compositionend','beforeinput','paste','cut','select'])assert.equal(f.password.handlers[type].length,1,type);f.safe();
});
for(const action of ['check','cancel','new selection','hidden','pagehide'])test('native blur composition commit is completed before passphrase clearing on '+action,async()=>{
 const f=controlHarness();f.c.startupSelectLocalFile(localFile(compressed(payload())));f.clickToggle();f.password.value='疑似QA_入力中';f.fire(f.password.id,'compositionstart');
 if(action==='check')f.fire(f.password.id,'compositionend');
 const trace=[];let value=f.password.value;Object.defineProperty(f.password,'value',{get:()=>value,set:next=>{value=next;trace.push(next===''?'clear':'value');},configurable:true});
 f.password.blur=()=>{trace.push('blur');f.password.value='疑似QA_ネイティブ確定文字';f.fire(f.password.id,'compositionend');};
 if(action==='check')await f.c.startupCheckLocalFile();
 if(action==='cancel')f.c.startupCancelLocalFileInspection();
 if(action==='new selection')f.c.startupSelectLocalFile(localFile(compressed(payload())));
 if(action==='hidden'){f.c.document.hidden=true;for(const handler of f.listeners.document.visibilitychange)handler();}
 if(action==='pagehide')for(const handler of f.listeners.window.pagehide)handler();
 assert.equal(trace[0],'blur');assert(trace.indexOf('clear')>trace.indexOf('blur'));assert.equal(f.password.value,'');assert.equal(f.password.type,'password');assert.equal(f.c.startupFileIMEActive(),false);
 assert.equal(f.toggle.getAttribute('aria-pressed'),'false');assert.equal(f.elements['startup-file-visible-notice'].hidden,true);f.safe();
});

