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
  const order = ['公演','セットリスト','曲','進行','指摘','欠席対応','ライブ中のお知らせ','操作パネル','グループ','配信設定','自動公開','練習ツール','音を確かめる','ピッチを見る','メトロノーム','録音データ','歌割をPDFにする','ほかの端末と揃える','バックアップ','歌詞の表示','メンバー画面','保存領域','ゴミ箱'];
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
/* Keep note controls in the visible viewport; keyboard changes must not rerender inputs. */
const NoteKeyboard = (() => {
  let frame = 0;
  const composing = new WeakSet(), ended = new WeakMap();
  const numeric = (value, fallback) => Number.isFinite(value) ? value : fallback;
  function fit() {
    const root = document.documentElement, vv = window.visualViewport;
    const height = Math.max(1, numeric(vv?.height, window.innerHeight));
    const width = Math.max(1, numeric(vv?.width, window.innerWidth));
    const top = Math.max(0, numeric(vv?.offsetTop, 0));
    const left = Math.max(0, numeric(vv?.offsetLeft, 0));
    root.style.setProperty('--note-vv-top', top + 'px');
    root.style.setProperty('--note-vv-left', left + 'px');
    root.style.setProperty('--note-vv-height', height + 'px');
    root.style.setProperty('--note-vv-width', width + 'px');
    const keyboard = Math.max(window.innerHeight, root.clientHeight) - height > 100;
    root.style.setProperty('--note-bottom-gap', keyboard ? '8px' : 'calc(8px + env(safe-area-inset-bottom))');
    root.classList.toggle('note-compact', height < 420);
    root.classList.toggle('note-short', height < 280);
  }
  function prepare() {
    fit();
    const field = document.querySelector('.note-quick-mask #memo');
    if (!field) return;
    field.setAttribute('aria-label', '指摘を入力');
    field.setAttribute('inputmode', 'text');
    field.setAttribute('lang', 'ja');
    const recognized = document.getElementById('note-recognized');
    if (recognized && typeof parseNoteInput === 'function') {
      const names = parseNoteInput(field.value).tags.map(tagName);
      recognized.textContent = names.length ? '→ ' + names.join('・') : '';
      recognized.hidden = !names.length;
    }
    const close = field.closest('.quick-type')?.querySelector('.note-close');
    if (close) {
      const hasText = !!field.value.trim();
      close.textContent = hasText ? '保存' : '閉じる';
      close.setAttribute('aria-label', hasText ? '指摘を保存して閉じる' : '指摘画面を閉じる');
    }
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; prepare(); });
  }
  window.visualViewport?.addEventListener('resize', schedule, {passive:true});
  window.visualViewport?.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule, {passive:true});
  window.addEventListener('orientationchange', schedule, {passive:true});
  window.addEventListener('pageshow', schedule, {passive:true});
  // Observe modal insertion/removal only, not every lyric or character mutation.
  new MutationObserver(prepare).observe(document.body, {childList:true});
  document.addEventListener('focusin', e => { if (e.target.id === 'memo') prepare(); }, true);
  document.addEventListener('input', e => {
    if (e.target.id !== 'memo' || !U.sheet) return;
    // Empty strings must replace old text too; no saving or rerendering while typing.
    U.sheet.memo = e.target.value;
    prepare();
  }, true);
  document.addEventListener('compositionstart', e => {
    if (e.target.id === 'memo') composing.add(e.target);
  }, true);
  document.addEventListener('compositionend', e => {
    if (e.target.id !== 'memo') return;
    composing.delete(e.target); ended.set(e.target, performance.now());
    if (U.sheet) U.sheet.memo = e.target.value;
  }, true);
  document.addEventListener('keydown', e => {
    if (e.target.id !== 'memo' || e.key !== 'Enter' || !U.sheet) return;
    // Japanese conversion confirmation is not submission (including Safari's 229 case).
    e.stopImmediatePropagation();
    if (e.isComposing || e.keyCode === 229 || composing.has(e.target)
      || performance.now() - (ended.get(e.target) ?? -Infinity) < 75) return;
    e.preventDefault();
    if (e.repeat) return;
    commitFields();
    const hasInput = sheetHasInput() || U.sheet.tags.length > 0;
    // End input before the core render guard; otherwise Done leaves the old panel on screen.
    e.target.blur();
    if (hasInput) scheduleCommit();
    else { U.sheet = null; renderSheet(); }
  }, true);
  // Preserve focus until click resolves the target. Otherwise the keyboard closes on
  // pointerdown/mousedown and moves the button before the finger is released.
  const keepTarget = e => {
    if (e.button !== 0 || e.isPrimary === false) return;
    if (e.target.closest?.('.note-quick-mask button,.note-sheet button') && document.activeElement?.id === 'memo') e.preventDefault();
  };
  document.addEventListener('pointerdown', keepTarget, {capture:true,passive:false});
  document.addEventListener('mousedown', keepTarget, {capture:true,passive:false});
  prepare();
  return {fit};
})();

// Replace only the quick-panel presentation hook introduced in 16.37.0.
// CSS owns placement; the old inline top calculation must not add the viewport offset twice.
function positionQuickNote() { NoteKeyboard.fit(); }

if (typeof render === 'function') render();
