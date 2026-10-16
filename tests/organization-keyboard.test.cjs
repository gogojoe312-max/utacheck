const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function fn(name){const start=source.indexOf('function '+name+'(');return source.slice(source.lastIndexOf('\n',start)+1,source.indexOf('\n}',start)+2);}
function setup(){
 const listeners={},fields={},calls={backups:0,saves:0,renders:0};let finishBackup,now=1000;
 const form={isConnected:true,querySelector:selector=>fields[selector],setAttribute(){},removeAttribute(){}};
 for(const [id,value] of Object.entries({'org-name':'秋ツアー','org-folder':'','org-new-folder':'','org-group':'group','org-delivery':'show'})){
  fields['#'+id]={id,value,tagName:id==='org-name'||id==='org-new-folder'?'INPUT':'SELECT',type:'text',isConnected:true,readOnly:false,closest:selector=>selector==='[data-save-on-submit]'?form:null,
   focus(){c.document.activeElement=this;for(const listener of listeners.focusin||[])listener({target:this});},setSelectionRange(start,end){this.selection=[start,end];}};
 }
 fields['#org-error']={hidden:true,textContent:''};fields['[type="submit"]']={disabled:false};
 const c=vm.createContext({S:{shows:[{id:'show',folder:'春'}]},U:{menu:{kind:'organize',mode:'folder',id:'春'}},VIEW:()=>false,recordingInboxCanWrite:()=>true,preview:false,Date:{now:()=>now},WeakSet,WeakMap,
  document:{activeElement:{blur(){}},addEventListener(type,listener){(listeners[type]||=[]).push(listener);}},
  automaticBackupBeforeEdit(){calls.backups++;return new Promise(resolve=>{finishBackup=resolve;});},
  saveOrganization(menu,values){calls.saves++;calls.saved={menu,values};return '';},render(){calls.renders++;}});
 const start=source.indexOf('const draftFormComposition ='),end=source.indexOf('function organizationFormValues(',start);
 vm.runInContext(source.slice(start,end),c);
 for(const name of ['focusSheetTextInput','organizationFormValues','submitOrganizationForm'])vm.runInContext(fn(name),c);
 const focusStart=source.indexOf("document.addEventListener('focusin', async event =>"),focusEnd=source.indexOf('\n});',focusStart)+4;
 vm.runInContext(source.slice(focusStart,focusEnd),c);
 const fire=(type,props={})=>{const event={target:fields['#org-name'],...props};for(const listener of listeners[type]||[])listener(event);};
 return {c,form,fields,calls,fire,finish:value=>finishBackup(value),advance:ms=>now+=ms};
}
test('opening folder input focuses a writable field synchronously without starting backup',()=>{
 const s=setup();s.c.focusSheetTextInput(s.form,'#org-name');
 assert.equal(s.c.document.activeElement,s.fields['#org-name']);assert.equal(s.fields['#org-name'].readOnly,false);assert.deepEqual(s.fields['#org-name'].selection,[0,4]);assert.equal(s.calls.backups,0);
 const gate=source.match(/if \(new Set\(\[([^\n]+)\]\)\.has\(a\)/)[1];
 for(const action of ['frename','newfolder','newshow'])assert(!gate.includes("'"+action+"'"),action+' must remain inside the opening gesture');
});
test('save waits for a verified backup and ignores duplicate submits',async()=>{
 const s=setup(),pending=s.c.submitOrganizationForm(s.form);await s.c.submitOrganizationForm(s.form);
 assert.equal(s.calls.backups,1);assert.equal(s.calls.saves,0);assert.equal(s.fields['[type="submit"]'].disabled,true);
 s.finish(true);await pending;assert.equal(s.calls.saves,1);assert.equal(s.calls.saved.values.name,'秋ツアー');assert.equal(s.c.U.menu,null);assert.equal(s.calls.renders,1);
});
test('backup failure retains editable text and permits a later retry',async()=>{
 const s=setup(),menu=s.c.U.menu,pending=s.c.submitOrganizationForm(s.form);s.finish(false);await pending;
 assert.equal(s.calls.saves,0);assert.equal(s.c.U.menu,menu);assert.equal(s.fields['#org-name'].value,'秋ツアー');assert.equal(s.fields['#org-name'].readOnly,false);assert.equal(s.fields['[type="submit"]'].disabled,false);assert.equal(s.fields['#org-error'].hidden,false);
 const retry=s.c.submitOrganizationForm(s.form);s.finish(true);await retry;assert.equal(s.calls.saves,1);
});
test('closing, replacing or losing ownership of the dialog while backup waits never saves its stale draft',async()=>{
 for(const change of [s=>{s.form.isConnected=false;},s=>{s.c.U.menu={kind:'organize',mode:'folder',id:'別'};},s=>{s.c.recordingInboxCanWrite=()=>false;}]){
  const s=setup(),pending=s.c.submitOrganizationForm(s.form);change(s);s.finish(true);await pending;assert.equal(s.calls.saves,0);assert.equal(s.calls.renders,0);
 }
});
test('a state change during backup cannot save against a stale folder or show',async()=>{
 const s=setup(),pending=s.c.submitOrganizationForm(s.form);s.c.S.shows=[];s.finish(true);await pending;
 assert.equal(s.calls.saves,0);assert.equal(s.fields['#org-name'].value,'秋ツアー');assert.match(s.fields['#org-error'].textContent,/保存内容が変わりました/);
});
test('editing during backup retains the new draft until the user submits it again',async()=>{
 const s=setup(),pending=s.c.submitOrganizationForm(s.form);s.fields['#org-name'].value='冬ツアー';s.finish(true);await pending;
 assert.equal(s.calls.saves,0);assert.match(s.fields['#org-error'].textContent,/もう一度保存/);
 const retry=s.c.submitOrganizationForm(s.form);s.finish(true);await retry;assert.equal(s.calls.saved.values.name,'冬ツアー');
});
test('background and pending redraw keep an open draft even after a select or Save button blurs its input',()=>{
 const menu={kind:'organize',mode:'folder'},draft={value:'入力中の名前'};let removed=0;
 const overlay={draftMenu:menu,querySelector:selector=>selector==='[data-save-on-submit]'?draft:null,remove(){removed++;}};
 const c=vm.createContext({U:{menu},overlay,pendingRender:false,resumeRender(){},typingNow:()=>false});
 vm.runInContext(fn('renderSheet'),c);c.renderSheet();
 assert.equal(c.overlay,overlay);assert.equal(c.overlay.querySelector('[data-save-on-submit]').value,'入力中の名前');assert.equal(removed,0);assert.equal(c.pendingRender,true);
});
test('Japanese IME Enter, Safari keyCode 229 and immediate composition-end submit preserve the draft',async()=>{
 const s=setup();s.fire('compositionstart');await s.c.submitOrganizationForm(s.form);assert.equal(s.calls.backups,0);
 s.fire('compositionend');await s.c.submitOrganizationForm(s.form);assert.equal(s.calls.backups,0);
 s.advance(101);s.fire('keydown',{key:'Enter',keyCode:229});await s.c.submitOrganizationForm(s.form);assert.equal(s.calls.backups,0);
 s.advance(101);const pending=s.c.submitOrganizationForm(s.form);assert.equal(s.calls.backups,1);s.finish(true);await pending;assert.equal(s.calls.saves,1);
});
