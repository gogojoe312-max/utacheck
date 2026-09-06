/* Local reading filters never change notes or member publication data. */
const Reading = (() => {
 let only = false, who = '', cursor = -1, context = '';
 function apply() {
  app.dataset.readingFilter = '0';
  if (U.view !== 'live' || S.recMode || U.overview || U.draw || !song()) return;
  const so = song(), key = S.showId + '|' + so.id;
  if (context !== key) {context = key; cursor = -1;}
  const notes = NOTES().filter(n => n.songId === so.id && n.showId === S.showId && inTake(n));
  const members = focusList();
  if (who && !members.some(m => m.id === who)) who = '';
  const matching = notes.filter(n => !who || (n.memberIds || []).includes(who));
  const prior = !VIEW() && typeof LiveFlow !== 'undefined' ? LiveFlow.prior(so).filter(n => n.lineIdx != null && (!who || (n.memberIds || []).includes(who))) : [];
  const drafts = !VIEW() ? (S.livePending || []).filter(n => n.songId === so.id && n.showId === S.showId && (!who || (n.memberIds || []).includes(who))) : [];
  const marked = i => matching.some(n => covers(n,i)) || prior.some(n => n.lineIdx === i) || drafts.some(n => n.lineIdx === i);
  const rows = [...app.querySelectorAll('.ln')].map(el => ({el,i:Number(el.querySelector('[data-i]')?.dataset.i)})).filter(x => Number.isInteger(x.i));
  const targets = rows.filter(x => marked(x.i));
  for (const {el,i} of rows) {
   el.classList.toggle('reading-hidden', (only && !marked(i)) || (!!who && !partsOf(so,i).includes(who) && !marked(i)));
   if (VIEW()) {
    const ns = matching.filter(n => covers(n,i));
    if (ns.length) {
     const detail = document.createElement('div');detail.className='reading-notes';
     for(const n of ns){const line=document.createElement('div');line.textContent=[(n.tags || []).map(tagName).join('・'),n.memo].filter(Boolean).join(' — ');detail.append(line);}
     el.querySelector('.grow')?.append(detail);
    }
   }
  }
  app.dataset.readingFilter = only || who ? '1' : '0';
  const dock = app.querySelector('.lf-dock');
  const bar = document.createElement('div');bar.className='reading-bar';bar.setAttribute('aria-label','歌詞の絞り込み');
  const select=document.createElement('select');select.setAttribute('aria-label',VIEW()?'自分の名前で絞る':'担当者で絞る');
  select.add(new Option(VIEW()?'全員 / 自分の名前':'全員', ''));
  members.forEach(m=>select.add(new Option(m.name,m.id)));select.value=who;
  select.onchange=()=>{who=select.value;cursor=-1;render();};
  const filter=document.createElement('button');filter.textContent=only?'全文に戻す':'指摘のみ';filter.setAttribute('aria-pressed',String(only));filter.onclick=()=>{only=!only;cursor=-1;render();};
  const next=document.createElement('button');next.textContent=`次の指摘 ${targets.length}`;next.disabled=!targets.length;
  next.onclick=()=>{const x=targets.find(x=>x.i>cursor)||targets[0];if(!x)return;cursor=x.i;app.querySelectorAll('.reading-current').forEach(e=>e.classList.remove('reading-current'));x.el.classList.add('reading-current');x.el.scrollIntoView({block:'center',behavior:'instant'});x.el.tabIndex=-1;x.el.focus({preventScroll:true});};
  bar.append(select,filter,next);
  if(dock){dock.querySelector('.lf-status')?.remove();dock.prepend(bar);}
  else app.querySelector('.bottom')?.before(bar);
  if(!rows.some(x=>!x.el.classList.contains('reading-hidden'))){const empty=document.createElement('p');empty.className='reading-empty';empty.textContent='この条件に合う歌詞・指摘はありません。絞り込みを解除すると全文を表示します。';app.querySelector('.scroll')?.prepend(empty);}
 }
 return {apply};
})();
if (typeof render === 'function') render();
