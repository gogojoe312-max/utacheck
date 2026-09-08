/* Presentation only: keep settings values, handlers and storage unchanged. */
function polishUI() {
  app.dataset.screen = U.view;
  app.dataset.viewer = VIEW() ? "1" : "0";
  if (U.view === "live") {
    const idleAudio = app.querySelector('.aubar:has([data-act="recstart"])');
    const bottom = app.querySelector('.bottom');
    if (idleAudio && bottom) {
      const record = idleAudio.querySelector('[data-act="recstart"]');
      record.setAttribute('aria-label','録音を開始');
      bottom.prepend(record);
      idleAudio.remove();
    }
  }
  if (typeof Reading !== "undefined") Reading.apply();
  if (U.view !== "setup") return;
  const sc = app.querySelector('.scroll.pad');
  if (!sc) return;
  if (VIEW() && typeof memberHelpHTML === 'function') sc.insertAdjacentHTML('afterbegin', memberHelpHTML());
  const headings = [...sc.children].filter(e => e.matches('h4.head'));
  headings.forEach((heading, i) => {
    const section = document.createElement('section');
    section.className = 'settings-section';
    section.id = 'settings-section-' + i;
    heading.before(section);
    section.append(heading);
    while (section.nextSibling && !(section.nextSibling.nodeType === 1 && section.nextSibling.matches('h4.head'))) {
      section.append(section.nextSibling);
    }
  });
  // 日常の操作を先頭へ。全項目を展開したまま並べる。
  const order = ['公演','セットリスト','曲','進行','指摘','欠席対応','ライブ中のお知らせ','操作パネル','グループ','自動公開','音を確かめる','ピッチを見る','メトロノーム','録音データ','歌割をPDFにする','ほかの端末と揃える','バックアップ','歌詞の表示','メンバー画面','保存領域','ゴミ箱'];
  const sections = headings.map(heading => ({name:heading.textContent,el:heading.parentElement}));
  // フッターを最終セクションから外し、並べ替えた後も最下部へ置く。
  const last = sections.at(-1)?.el;
  const footer = last ? [...last.children].filter(el => el.tagName === 'DIV' && (el.style.textAlign === 'center' || el.style.height === '40px')) : [];
  footer.forEach(el => sc.append(el));
  sections.sort((a,b) => (order.includes(a.name) ? order.indexOf(a.name) : 99) - (order.includes(b.name) ? order.indexOf(b.name) : 99));
  sections.forEach(x => sc.insertBefore(x.el, footer[0] || null));
  const input = sc.querySelector('#newshow');
  if (input) { input.placeholder = '新しい公演名'; input.setAttribute('aria-label','新しい公演名'); }
  app.querySelectorAll('[data-act="go-live"]').forEach(e => e.setAttribute('aria-label','歌詞に戻る'));
}
if (typeof render === 'function') render();
