const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const appSrc=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const voiceSrc=fs.readFileSync(path.join(__dirname,'..','voice-notes.js'),'utf8');
function setup() {
 const handlers={},timers=new Map(),recs=[],commits=[],elements={};let timerId=0;
 const eventTarget={addEventListener(name,fn){(handlers[name]||=[]).push(fn);}};
 for(const id of ['voice-text','voice-tags','voice-status','voice-save','voice-mic'])elements[id]={id,value:'',textContent:'',disabled:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){this.focused=true;},blur(){c.document.activeElement=null;}};
 class Recognition {
  constructor(){recs.push(this);}
  start(){this.started=true;}
  stop(){this.stopped=true;this.onend?.();}
  abort(){this.aborted=true;}
 }
 const c=vm.createContext({S:{},U:{sheet:{voice:true,quick:true,range:[2,5],lineIdx:1,sel:['member'],tags:[],memo:''}},overlay:null,REC:null,PT:{rec:false},
  document:{...eventTarget,hidden:false,activeElement:null,getElementById:id=>elements[id],createElement:()=>({innerHTML:'',remove(){}}),body:{appendChild(el){c.html=el.innerHTML;}}},
  window:{...eventTarget,SpeechRecognition:Recognition},VIEW:()=>false,song:()=>({id:'song'}),
  setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
  commitFields(){},typingNow:()=>!!c.document.activeElement,
  scheduleCommit(){commits.push(JSON.parse(JSON.stringify(c.U.sheet)));c.U.sheet=null;},
 });
 vm.runInContext(appSrc.slice(0,appSrc.indexOf('/* ---------------- state')),c);
 // Use the real application click handler first: on iPhone it must blur fields before saving.
 const start=appSrc.indexOf('document.addEventListener("click", (e) => {');
 vm.runInContext(appSrc.slice(start,appSrc.indexOf('\n});',start)+4),c);
 vm.runInContext(voiceSrc,c);
 const run=code=>vm.runInContext(code,c);
 const fire=(name,event={})=>(handlers[name]||[]).forEach(fn=>fn(event));
 const click=(act,id='')=>{const b={tagName:'BUTTON',dataset:{act,id}};fire('click',{target:{closest:s=>s==='[data-act]'?b:null}});};
 const input=value=>{elements['voice-text'].value=value;fire('input',{target:elements['voice-text']});};
 const results=(...texts)=>({results:texts.map(transcript=>[{transcript}])});
 return {c,run,fire,click,input,elements,recs,commits,timers,results,classify(text){c.text=text;return Array.from(run('NoteVoice.classify(text)'));}};
}

test('speech phrases map to specific tags and keep generic categories out of the result',()=>{
 const s=setup();
 assert.deepEqual(s.classify('音程が低い。滑舌をはっきり、語尾が抜ける'),['pLo','diction','nuke']);
 assert.deepEqual(s.classify('ピッチが不安定、リズムが速い'),['pWob','fast']);
 assert.deepEqual(s.classify('もっと明るく、アクセントを強めに'),['bright','strong','accent']);
 assert.deepEqual(s.classify('歌詞を間違えた、ここは歌ってください'),['lyric','sing']);
 assert.deepEqual(s.classify('良かった'),['good']);
 assert.deepEqual(s.classify('音程は高くない\n滑舌をはっきり'),['diction']);
 assert.deepEqual(s.classify('音程じゃなく、リズム'),['rhythm']);
 assert.deepEqual(s.classify('昨日のテイクを確認する'),[]);
});

test('voice text is editable, candidates can be excluded, and one confirmed note keeps the original lyric range',()=>{
 const s=setup();s.c.U.sheet.memo='前のメモ';s.input('滑舌、語尾が抜ける');
 assert(s.elements['voice-tags'].innerHTML.includes('data-id="diction"'));
 s.click('voice-tag','nuke');
 s.c.document.activeElement=s.elements['voice-text'];s.click('voice-save');s.click('voice-save');
 assert.equal(s.commits.length,1);assert.deepEqual(s.commits[0].tags,['diction']);
 assert.equal(s.commits[0].memo,'前のメモ\n滑舌、語尾が抜ける');assert.deepEqual(s.commits[0].range,[2,5]);assert.deepEqual(s.commits[0].sel,['member']);assert.equal(s.c.document.activeElement,null);
 const unknown=setup();unknown.input('昨日のテイクを確認する');unknown.click('voice-save');
 assert.deepEqual(unknown.commits[0].tags,[]);assert.equal(unknown.commits[0].memo,'昨日のテイクを確認する');
 const empty=setup();empty.input('  ');empty.click('voice-save');assert.equal(empty.commits.length,0);assert.equal(empty.elements['voice-save'].disabled,true);
});

test('interim recognition replaces partial results, never auto-saves, and editing cancels late results',()=>{
 const s=setup();s.input('最初のメモ');s.run('NoteVoice.start()');const rec=s.recs[0];
 assert.equal(rec.lang,'ja-JP');assert.equal(rec.continuous,false);
 rec.onresult(s.results('音程'));rec.onresult(s.results('音程が低い','、滑舌'));
 assert.equal(s.elements['voice-text'].value,'最初のメモ\n音程が低い、滑舌');assert.equal(s.commits.length,0);
 const lateResult=rec.onresult;s.input('音程が高い');lateResult(s.results('音程が低い'));
 assert.equal(rec.aborted,true);assert.equal(s.elements['voice-text'].value,'音程が高い');assert.equal(s.timers.size,0);
 s.click('voice-save');assert.deepEqual(s.commits[0].tags,['pHi']);assert.equal(s.commits[0].memo,'音程が高い');
});

test('unsupported, denied and recording-active cases retain manual input without starting another microphone',()=>{
 const s=setup();s.c.window.SpeechRecognition=undefined;s.run('NoteVoice.start()');assert.equal(s.elements['voice-text'].focused,true);assert.equal(s.recs.length,0);
 const denied=setup();denied.run('NoteVoice.start()');denied.recs[0].onerror({error:'not-allowed'});assert.equal(denied.recs[0].aborted,true);assert.equal(denied.timers.size,0);denied.input('滑舌');denied.click('voice-save');assert.deepEqual(denied.commits[0].tags,['diction']);
 const recording=setup();recording.c.REC={};recording.run('NoteVoice.start()');assert.equal(recording.recs.length,0);recording.c.REC=null;recording.c.PT.rec=true;recording.run('NoteVoice.start()');assert.equal(recording.recs.length,0);
 const prefixed=setup();prefixed.c.window.webkitSpeechRecognition=prefixed.c.window.SpeechRecognition;prefixed.c.window.SpeechRecognition=undefined;prefixed.run('NoteVoice.start()');assert.equal(prefixed.recs.length,1);
});

test('sheet changes, visibility and time limits cannot leak results into another note',()=>{
 const s=setup();s.run('NoteVoice.start()');const result=s.recs[0].onresult;s.c.U.sheet={voice:true,voiceText:'次の指摘'};result(s.results('音程低'));assert.equal(s.c.U.sheet.voiceText,'次の指摘');s.run('NoteVoice.stop()');assert.equal(s.recs[0].aborted,true);
 const hidden=setup();hidden.run('NoteVoice.start()');hidden.c.document.hidden=true;hidden.fire('visibilitychange');assert.equal(hidden.recs[0].aborted,true);assert.equal(hidden.timers.size,0);
 const timeout=setup();timeout.run('NoteVoice.start()');timeout.recs[0].onresult(timeout.results('滑舌'));[...timeout.timers.values()][0]();assert.equal(timeout.recs[0].aborted,true);assert.equal(timeout.c.U.sheet.voiceText,'滑舌');assert.equal(timeout.commits.length,0);
});

test('rendered transcripts and lyric context are escaped, and stopping finishes without losing text',()=>{
 const s=setup();s.c.U.sheet.voiceText='<img src=x onerror=alert(1)>';s.run('NoteVoice.render(U.sheet,"<歌詞>")');assert(!s.c.html.includes('<img'));assert(s.c.html.includes('&lt;歌詞&gt;'));
 s.input('語尾が抜ける');s.run('NoteVoice.start()');s.click('voice-start');assert.equal(s.recs[0].stopped,true);assert.equal(s.timers.size,0);assert.equal(s.c.U.sheet.voiceText,'語尾が抜ける');
});
