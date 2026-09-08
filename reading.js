/* メンバー画面では、絞り込み行を出さず歌詞の下に指摘を表示する。 */
const Reading = (() => {
 function apply() {
  app.dataset.readingFilter = '0';
  if (U.view !== 'live' || S.recMode || U.overview || U.draw || !song() || !VIEW()) return;
  const so = song();
  const notes = NOTES().filter(n => n.songId === so.id && n.showId === S.showId && inTake(n));
  for (const el of app.querySelectorAll('.ln')) {
   const i = Number(el.querySelector('[data-i]')?.dataset.i);
   if (!Number.isInteger(i)) continue;
   const ns = notes.filter(n => covers(n,i));
   if (!ns.length) continue;
   const detail = document.createElement('div');detail.className='reading-notes';
   for (const n of ns) {
    const line = document.createElement('div');
    line.textContent = [(n.tags || []).map(tagName).join('・'),n.memo].filter(Boolean).join(' — ');
    detail.append(line);
   }
   el.querySelector('.grow')?.append(detail);
  }
 }
 return {apply};
})();
if (typeof render === 'function') render();
