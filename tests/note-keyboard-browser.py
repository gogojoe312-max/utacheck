"""Full app Chromium checks. Visual viewport/keyboard and Japanese IME are simulated,
not an iPhone or a claim of native Safari keyboard validation. No external requests."""
from pathlib import Path
import re,json,sys
from playwright.sync_api import sync_playwright
ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'/'keyboard';OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'index.html').read_text()
scripts=re.findall(r'<script\s+src="([^"]+)"\s*></script>',html)
html=re.sub(r'<script\s+src="([^"]+)"\s*></script>','',html)
html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>'+(ROOT/m[1].split('?')[0]).read_text()+'</style>',html)
html=re.sub(r'<link[^>]+>', '',html)
MOCK='''() => {
 const store=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});
 window.fetch=async()=>new Response('{}',{status:404}); window.alert=()=>{};window.confirm=()=>false;
 const vv=Object.assign(new EventTarget(),{height:window.innerHeight,width:window.innerWidth,offsetTop:0,offsetLeft:0,scale:1});
 Object.defineProperty(window,'visualViewport',{value:vv});
 window.resizeVV=(height,top=0,left=0,width=window.innerWidth)=>{
   Object.assign(vv,{height,offsetTop:top,offsetLeft:left,width});
   vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'));
   let kb=document.getElementById('test-keyboard');
   if(!kb){kb=document.createElement('div');kb.id='test-keyboard';document.body.append(kb);}
   kb.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:100000;background:#30333b;color:#ddd;text-align:center;font:14px sans-serif;padding-top:18px;box-sizing:border-box;';
   kb.style.height=Math.max(0,window.innerHeight-height-top)+'px';
   kb.style.display=window.innerHeight-height-top>0?'block':'none';kb.textContent='キーボード表示領域（テスト用）';
 };
}'''
SEED='''() => {
 document.activeElement?.blur();U.sheet=null;U.menu=null;U.picker=false;U.draw=false;U.overview=false;U.view='live';U.songIdx=0;
 S.recMode=false;S.viewer=false;S.members=[{id:'m',name:'検証用'}];S.groups=[{id:'g',name:'テスト'}];S.groupId='g';
 S.shows=[{id:'s',name:'操作検証',ts:1}];S.showId='s';
 S.songs=[{id:'song',title:'キーボード操作確認',groupId:'g',showId:'s',roster:['m'],take:1,
 lines:Array.from({length:40},(_,i)=>({t:'歌詞のテスト '+(i+1)+'行目を確認します',parts:['m']}))}];
 S.notes=[];S.livePending=[];renderPointers.clear();scrollingUntil=0;pendingRender=false;render();document.querySelector('#app>.scroll').scrollTop=0;
}'''
def vv(page,h,top=0):
 page.evaluate('([h,t])=>resizeVV(h,t)',[h,top]);page.wait_for_timeout(40)
def open_note(page):
 # Use real touch input instead of calling openSheet or clicking a magically scrolled element.
 box=page.locator('.txt[data-l="0"] [data-c="2"]').bounding_box()
 page.touchscreen.tap(box['x']+box['width']/2,box['y']+box['height']/2)
 page.wait_for_timeout(30)
 assert page.evaluate('document.activeElement.id')=='memo','autofocus missing'
 assert page.evaluate('U.sheet.lineIdx')==0

def center(page,selector):
 box=page.locator(selector).bounding_box();assert box,selector
 return box,box['x']+box['width']/2,box['y']+box['height']/2

with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
 page.set_default_timeout(2500)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='load');page.evaluate(MOCK)
 for script in scripts: page.add_script_tag(content=(ROOT/script.split('?')[0]).read_text())
 page.wait_for_timeout(160);assert not errors,errors
 rows=[]
 cases=[(390,844,480,0),(390,844,360,80),(375,667,315,0),(320,568,250,0),(414,896,460,80),(844,390,175,0),(667,375,165,20),(390,844,276,100)]
 for w,h,visible,top in cases:
  for tag in ['pitch','rhythm','nuance','good']:
   page.set_viewport_size({'width':w,'height':h});vv(page,h);page.evaluate(SEED);open_note(page);vv(page,visible,top)
   bounds=page.locator('.quick-note').bounding_box()
   buttons=page.locator('.quick-four button').evaluate_all('(bs)=>bs.map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})')
   for r in buttons:
    assert r['width']>=44 and r['height']>=44,(w,h,visible,'small',r)
    assert r['y']>=top and r['y']+r['height']<=visible+top,(w,h,visible,top,'obscured',r)
   assert bounds['y']>=top and bounds['y']+bounds['height']<=top+visible,(bounds,top,visible)
   _,x,y=center(page,f'[data-act="tag-choice"][data-id="{tag}"]')
   hit=page.evaluate('([x,y])=>document.elementFromPoint(x,y)?.closest("[data-id]")?.dataset.id',[x,y])
   assert hit==tag,(tag,hit)
   if tag=='pitch': page.screenshot(path=str(OUT/f'{w}x{h}-visible{visible}-top{top}.png'))
   page.touchscreen.tap(x,y);page.wait_for_timeout(190)
   assert page.evaluate('S.notes.length')==1,('tap did not save',w,h,tag)
   assert page.evaluate('S.notes[0].tags[0]')==tag
   assert page.evaluate('U.sheet===null') and page.locator('.note-quick-mask').count()==0,'stale overlay'
  rows.append({'screen':[w,h],'visible':visible,'offset':top,'categories':'4/4 saved once; >=44px; unobscured'})
 # Text without any text-entry tap; Enter commits once and returns to lyrics.
 page.set_viewport_size({'width':390,'height':844});vv(page,844);page.evaluate(SEED);open_note(page);vv(page,400)
 page.keyboard.insert_text('音程が低い');assert page.locator('.quick-type .note-close').inner_text()=='保存'
 page.keyboard.press('Enter');page.wait_for_timeout(200)
 assert page.evaluate('S.notes.length')==1 and page.evaluate('S.notes[0].memo')=='音程が低い'
 assert page.locator('.note-quick-mask').count()==0
 page.keyboard.press('Enter');assert page.evaluate('S.notes.length')==1
 # Japanese conversion Enter, including Safari-style 229, never submits.
 vv(page,844);page.evaluate(SEED);open_note(page);vv(page,400)
 page.locator('#memo').dispatch_event('compositionstart',{'data':''})
 page.locator('#memo').fill('ひくい')
 page.locator('#memo').dispatch_event('keydown',{'key':'Enter','isComposing':True,'keyCode':229,'bubbles':True})
 assert page.evaluate('S.notes.length')==0 and page.evaluate('U.sheet!==null')
 page.locator('#memo').dispatch_event('compositionend',{'data':'低い'})
 page.locator('#memo').dispatch_event('keydown',{'key':'Enter','keyCode':229,'bubbles':True})
 assert page.evaluate('S.notes.length')==0
 page.wait_for_timeout(90);page.locator('#memo').fill('低い');page.keyboard.press('Enter');page.wait_for_timeout(180)
 assert page.evaluate('S.notes[0].memo')=='音程低い'
 # Clearing text must not resurrect the old draft or create an empty note.
 vv(page,844);page.evaluate(SEED);open_note(page);page.locator('#memo').fill('削除する文字');page.locator('#memo').fill('')
 assert page.evaluate('U.sheet.memo')=='';page.keyboard.press('Enter');page.wait_for_timeout(180)
 assert page.evaluate('S.notes.length')==0 and page.locator('.note-quick-mask').count()==0
 # A press holds keyboard/focus until click; blur would otherwise move the target.
 vv(page,844);page.evaluate(SEED);open_note(page);vv(page,400);page.locator('#memo').fill('メモ付き')
 page.locator('#memo').evaluate('(el)=>el.addEventListener("blur",()=>resizeVV(innerHeight),{once:true})')
 box,x,y=center(page,'[data-act="tag-choice"][data-id="rhythm"]')
 page.mouse.move(x,y);page.mouse.down();page.wait_for_timeout(40)
 assert page.evaluate('document.activeElement.id')=='memo','press hid keyboard'
 assert page.locator('[data-id="rhythm"]').bounding_box()==box,'target moved under held pointer'
 page.mouse.up();page.wait_for_timeout(180)
 assert page.evaluate('S.notes.length')==1 and page.evaluate('S.notes[0].memo')=='メモ付き'
 assert page.evaluate('S.notes[0].tags[0]')=='rhythm'
 # Background renders and viewport changes retain focus, text and the same input node.
 vv(page,844);page.evaluate(SEED);open_note(page);page.locator('#memo').fill('書きかけ')
 page.evaluate('window.originalInput=document.getElementById("memo");render(true)');vv(page,370,40)
 assert page.evaluate('originalInput===document.getElementById("memo")')
 assert page.locator('#memo').input_value()=='書きかけ' and page.evaluate('document.activeElement.id')=='memo'
 _,x,y=center(page,'.quick-type .note-close');page.touchscreen.tap(x,y);page.wait_for_timeout(180)
 assert page.evaluate('S.notes.length')==1 and page.evaluate('S.notes[0].memo')=='書きかけ'
 # Lyric drag still selects the original range and the first new touch saves it.
 vv(page,844);page.evaluate(SEED)
 a=page.locator('.txt[data-l="0"] [data-c="1"]').bounding_box();z=page.locator('.txt[data-l="0"] [data-c="4"]').bounding_box()
 page.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2);page.mouse.down();page.mouse.move(z['x']+z['width']/2,z['y']+z['height']/2,steps=5);page.mouse.up();page.wait_for_timeout(30)
 assert page.evaluate('U.sheet.range')==[1,4];vv(page,390)
 _,x,y=center(page,'[data-id="nuance"]');page.touchscreen.tap(x,y);page.wait_for_timeout(180)
 assert page.evaluate('[S.notes[0].from,S.notes[0].to]')==[1,4]
 # Same-view scroll position survives typing and save.
 vv(page,844);page.evaluate(SEED);page.evaluate('document.querySelector("#app>.scroll").scrollTop=600');page.wait_for_timeout(180)
 row=page.locator('.txt').evaluate_all('(es)=>es.find(e=>{const r=e.getBoundingClientRect();return r.top>160&&r.bottom<500}).dataset.l')
 before=page.evaluate('document.querySelector("#app>.scroll").scrollTop')
 box=page.locator(f'.txt[data-l="{row}"] [data-c="2"]').bounding_box();page.touchscreen.tap(box['x']+3,box['y']+3);vv(page,400)
 page.keyboard.insert_text('確認');page.keyboard.press('Enter');page.wait_for_timeout(200)
 assert page.evaluate('document.querySelector("#app>.scroll").scrollTop')==before
 # Current main's shorthand expansion and one-touch deletion must survive the UI merge.
 vv(page,844);page.evaluate(SEED);open_note(page);vv(page,400)
 page.keyboard.insert_text('たかい');page.keyboard.press('Enter');page.wait_for_timeout(180)
 assert page.evaluate('S.notes[0].memo')=='音程高い'
 vv(page,844)
 for selector in ['.pill-del','.mark-del']:
  _,x,y=center(page,selector);page.touchscreen.tap(x,y);page.wait_for_timeout(180)
  assert page.evaluate('S.notes.length')==0 and page.evaluate('U.sheet===null')
  _,x,y=center(page,'[data-act="undoall"]');page.touchscreen.tap(x,y);page.wait_for_timeout(180)
  assert page.evaluate('S.notes.length')==1 and page.evaluate('S.notes[0].memo')=='音程高い'
 assert not errors,errors
 result={'source':str(ROOT),'engine':'Chromium /usr/bin/chromium','native_iPhone':False,'cases':rows,'category_taps':32,
 'other_checks':['initial boot with every shipped script','automatic focus','Enter saves once and closes','Japanese composition guards','deleted drafts stay empty','pointer hold does not blur/move target','background render keeps same input','save button','lyric drag preserves range','same-view scroll preserved','current shorthand expansion preserved','direct badge and memo deletion plus Undo'],'errors':errors}
 (OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
 b.close()
