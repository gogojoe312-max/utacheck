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
  const nav = document.createElement('nav');
  nav.className = 'settings-nav';
  nav.setAttribute('aria-label', '設定項目へ移動');
  const groups = [
    ['管理', ['公演','曲']], ['音の確認', ['音を確かめる']],
    ['データ', ['録音データ','保存領域']], ['バックアップ', ['バックアップ']]
  ];
  for (const [label, names] of groups) {
    const heading = headings.find(e => names.includes(e.textContent));
    if (!heading) continue;
    const button = document.createElement('button');
    button.textContent = label;
    button.type = 'button';
    button.addEventListener('click', () => {
      heading.parentElement.scrollIntoView({behavior:'instant',block:'start'});
      heading.tabIndex = -1;
      heading.focus({preventScroll:true});
    });
    nav.append(button);
  }
  sc.before(nav);
  const input = sc.querySelector('#newshow');
  if (input) { input.placeholder = '新しい公演名'; input.setAttribute('aria-label','新しい公演名'); }
  app.querySelectorAll('[data-act="go-live"]').forEach(e => e.setAttribute('aria-label','歌詞に戻る'));
}
if (typeof render === 'function') render();
