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
  const secondary = new Set(['音を確かめる','ピッチを見る','メトロノーム','録音データ','歌割をPDFにする','保存領域','ほかの端末と揃える']);
  const extra = document.createElement('details');extra.className='settings-extra';
  const summary = document.createElement('summary');summary.textContent='その他の設定';extra.append(summary);
  headings.forEach(heading => { if (secondary.has(heading.textContent)) extra.append(heading.parentElement); });
  if (extra.children.length > 1) sc.append(extra);
  const input = sc.querySelector('#newshow');
  if (input) { input.placeholder = '新しい公演名'; input.setAttribute('aria-label','新しい公演名'); }
  app.querySelectorAll('[data-act="go-live"]').forEach(e => e.setAttribute('aria-label','歌詞に戻る'));
}
if (typeof render === 'function') render();
