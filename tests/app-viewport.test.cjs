const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','ui.js'),'utf8');
const component=source.slice(0,source.indexOf('/* Presentation only:'));
function setup({ua='iPhone',platform='iPhone',touch=5,standalone=false,media=false,inset=62}={}){
 const classes={},events={},frames=[],probe={};let observer;
 const root={classList:{toggle:(name,value)=>classes[name]=value}};
 const mq={matches:media,addEventListener:(name,fn)=>events['display-'+name]=fn};
 const c=vm.createContext({document:{documentElement:root,getElementById:()=>probe},
  navigator:{userAgent:ua,platform,maxTouchPoints:touch,standalone},
  window:{innerHeight:812,matchMedia:()=>mq,addEventListener:(name,fn)=>events[name]=fn},
  getComputedStyle:()=>({paddingTop:String(inset)+'px'}),
  requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},
  ResizeObserver:class{constructor(fn){observer=fn;}observe(el){assert.equal(el,probe);}}});
 vm.runInContext(component,c);
 return {classes,events,frames,c,setInset(value){inset=value;observer();},flush(){const pending=frames.splice(0);pending.forEach(fn=>fn());}};
}
test('Safari browsing retains the dynamic viewport even on a notched iPhone',()=>{
 const s=setup();assert.equal(s.classes['ios-standalone'],false);assert.equal(s.classes['ios-status-overlay'],false);
});
test('a Home Screen app drawing behind the status bar uses the full viewport',()=>{
 const s=setup({standalone:true});assert.equal(s.classes['ios-standalone'],true);assert.equal(s.classes['ios-status-overlay'],true);
});
test('an OS-reserved status bar does not make the app taller than its usable viewport',()=>{
 const s=setup({media:true,inset:0});assert.equal(s.classes['ios-standalone'],true);assert.equal(s.classes['ios-status-overlay'],false);
});
test('late safe-area initialization and rotation update without redrawing application data',()=>{
 const s=setup({standalone:true,inset:0});s.setInset(62);s.events.pageshow();s.events.resize();assert.equal(s.frames.length,1);
 s.flush();assert.equal(s.classes['ios-status-overlay'],true);
 s.setInset(0);s.events.orientationchange();s.flush();assert.equal(s.classes['ios-status-overlay'],false);
});
test('keyboard resizes do not select a shorter application height',()=>{
 const s=setup({standalone:true});s.c.window.innerHeight=360;s.events.resize();s.flush();assert.equal(s.classes['ios-status-overlay'],true);
 s.c.window.innerHeight=812;s.events.resize();s.flush();assert.equal(s.classes['ios-status-overlay'],true);
});
test('iPad desktop UA is supported while desktop and Android installations stay unchanged',()=>{
 const ipad=setup({ua:'Macintosh',platform:'MacIntel',media:true});assert.equal(ipad.classes['ios-standalone'],true);
 for(const options of [{ua:'Macintosh',platform:'MacIntel',touch:0},{ua:'Android',platform:'Linux',touch:5}]){
  const s=setup({...options,media:true});assert.equal(s.classes['ios-standalone'],false);assert.equal(s.classes['ios-status-overlay'],false);
 }
});
