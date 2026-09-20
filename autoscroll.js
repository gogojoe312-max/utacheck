/* 手で動かした歌詞の速度を引き継ぐ。速度は端末内の、この起動中だけ保持する。 */
"use strict";
const LyricScroll = (() => {
  let sc = null, context = "", speed = 0, enabled = false, running = false;
  let frame = 0, lastFrame = 0, position = 0, manual = null;
  let settleTimer = 0, wheelTimer = 0, pendingStart = false, lastManualScroll = -Infinity;
  const now = () => performance.now();
  const key = () => JSON.stringify([S.showId, song()?.id, takeCtx(), S.recMode, U.mode, U.secView, U.view, U.overview, VIEW()]);
  const available = () => U.view === "live" && !!song() && !U.overview && !U.draw && !document.hidden;
  const allowed = () => available() && !U.sheet && !U.menu && !U.picker && !typingNow();
  const button = () => app.querySelector('[data-act="auto-scroll"]');

  function updateButton() {
    const b = button(); if (!b) return;
    b.textContent = enabled ? speed ? "停止" : "待機" : "自動";
    b.setAttribute("aria-pressed", String(enabled));
    b.setAttribute("aria-label", enabled ? "自動スクロールを停止" : "自動スクロールを開始");
    b.title = enabled && !speed ? "歌詞を上下にスクロールして速さを指定" : "直前の手動スクロールの速さで再生";
    b.dataset.state = enabled ? speed ? "running" : "waiting" : "off";
  }
  function pause() {
    cancelAnimationFrame(frame); frame = 0; running = false;
    clearTimeout(settleTimer); settleTimer = 0; pendingStart = false;
  }
  function stop() {
    pause(); clearTimeout(wheelTimer); wheelTimer = 0;
    enabled = false; manual = null; updateButton();
  }
  function tick(t) {
    frame = 0;
    if (!running || !allowed() || !sc?.isConnected || context !== key()) { stop(); return; }
    // 戻ってきたタブや一時的な処理落ちで、歌詞を一気に飛ばさない。
    const dt = Math.min(Math.max(t - lastFrame, 0), 64); lastFrame = t;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    position = Math.min(max, Math.max(0, position + speed * dt / 1000));
    sc.scrollTop = position;
    if ((speed > 0 && position >= max) || (speed < 0 && position <= 0)) { stop(); return; }
    frame = requestAnimationFrame(tick);
  }
  function start() {
    pendingStart = false; settleTimer = 0;
    if (!enabled || !speed || manual || !allowed() || !sc?.isConnected || context !== key()) { stop(); return; }
    position = Math.max(0, sc.scrollTop); lastFrame = now(); running = true;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick); updateButton();
  }
  function afterMomentum() {
    if (!enabled || !speed) return;
    pendingStart = true; clearTimeout(settleTimer);
    // iPhoneの慣性スクロールと同時にscrollTopを書き換えない。
    settleTimer = setTimeout(start, 120);
  }
  function toggle() {
    if (enabled) { stop(); return; }
    if (!allowed() || !sc) return;
    enabled = true; updateButton();
    if (speed) { if (now() - lastManualScroll < 140) afterMomentum(); else start(); }
  }
  function sample(g, time = now()) {
    if (!sc || sc !== g.sc) return;
    const top = Math.min(Math.max(0, sc.scrollTop), Math.max(0, sc.scrollHeight - sc.clientHeight));
    const prev = g.samples.at(-1);
    if (top === prev.top) return;
    // 向きを変えた場合は、直前の方向だけを使う。
    const direction = Math.sign(top - prev.top);
    if (g.direction && direction !== g.direction) g.samples = [prev];
    g.direction = direction;
    g.samples.push({top, time});
    while (g.samples.length > 2 && (g.samples[1].time < time - 320 || g.samples.length > 64)) g.samples.shift();
    lastManualScroll = time;
  }
  function velocity(g) {
    const a = g.samples[0], b = g.samples.at(-1), dt = b.time - a.time;
    if (g.samples.length < 2 || dt < 35 || Math.abs(b.top - a.top) < 2 || now() - b.time > 220) return 0;
    const v = (b.top - a.top) * 1000 / dt;
    return Number.isFinite(v) ? v : 0;
  }
  function begin(kind, x, y, id) {
    pause(); clearTimeout(wheelTimer);
    manual = {kind, x, y, id, sc, context, samples:[{top:sc.scrollTop, time:now()}], vertical:kind === "wheel"};
  }
  function move(x, y) {
    if (!manual || manual.kind === "wheel") return;
    const dx = x - manual.x, dy = y - manual.y;
    if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy)) { stop(); return; }
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) manual.vertical = true;
  }
  function finish() {
    const g = manual; manual = null;
    if (!g || !g.vertical || g.sc !== sc || g.context !== key() || !allowed()) { stop(); return; }
    const v = velocity(g);
    if (!v) { stop(); return; }
    speed = v; updateButton();
    if (enabled) afterMomentum();
  }
  const inLyrics = target => allowed() && target.closest?.("#app > .scroll") === sc
    && !target.closest("button,input,textarea,select,[contenteditable],.pull");

  document.addEventListener("pointerdown", e => {
    if (e.target.closest?.('[data-act="auto-scroll"]')) return;
    if (e.isPrimary === false || e.button !== 0 || !inLyrics(e.target)) { stop(); return; }
    begin(e.pointerType === "touch" ? "touch" : "pointer", e.clientX, e.clientY, e.pointerId);
  }, true);
  document.addEventListener("pointermove", e => {
    if (manual?.kind === "pointer" && e.pointerId === manual.id) move(e.clientX, e.clientY);
  }, true);
  document.addEventListener("pointerup", e => {
    if (manual?.kind === "pointer" && e.pointerId === manual.id) finish();
  }, true);
  document.addEventListener("pointercancel", () => {
    // ネイティブの縦スクロールではpointercancelが来る。touchendまで計測を続ける。
    if (manual?.kind === "pointer") stop();
  }, true);
  document.addEventListener("touchstart", e => {
    if (e.touches.length !== 1) { stop(); return; }
    if (e.target.closest?.('[data-act="auto-scroll"]')) return;
    if (!inLyrics(e.target)) { stop(); return; }
    const p = e.touches[0];
    if (!manual || manual.kind !== "touch") begin("touch", p.clientX, p.clientY, p.identifier);
    manual.touchId = p.identifier;
  }, {capture:true, passive:true});
  document.addEventListener("touchmove", e => {
    if (manual?.kind !== "touch") return;
    if (e.touches.length !== 1) { stop(); return; }
    const p = e.touches[0]; if (p.identifier === manual.touchId) move(p.clientX, p.clientY);
  }, {capture:true, passive:true});
  document.addEventListener("touchend", e => { if (manual?.kind === "touch" && !e.touches.length) finish(); }, {capture:true, passive:true});
  document.addEventListener("touchcancel", stop, {capture:true, passive:true});
  document.addEventListener("wheel", e => {
    if (!inLyrics(e.target) || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { stop(); return; }
    if (manual?.kind !== "wheel") begin("wheel");
    clearTimeout(wheelTimer); wheelTimer = setTimeout(finish, 120);
  }, {capture:true, passive:true});
  document.addEventListener("scroll", e => {
    if (e.target !== sc || running) return;
    if (manual) sample(manual);
    else if (pendingStart) { lastManualScroll = now(); afterMomentum(); }
  }, {capture:true, passive:true});
  document.addEventListener("click", e => { if (e.target.closest?.('[data-act="auto-scroll"]')) toggle(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") stop(); }, true);
  document.addEventListener("focusin", e => { if (e.target.matches?.("input,textarea,select,[contenteditable]")) stop(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  window.addEventListener("blur", stop);
  window.addEventListener("pagehide", stop);
  window.addEventListener("resize", stop);

  function mount() {
    const next = app.querySelector("#app > .scroll"), nextKey = key();
    const resume = running && nextKey === context && allowed();
    if (nextKey !== context || !allowed()) stop();
    else if (next !== sc) { pause(); manual = null; }
    sc = next; context = nextKey;
    const dock = app.querySelector(S.recMode ? ".rec-tools-meta" : ".bottom");
    if (available() && dock && !button()) {
      const b = document.createElement("button"); b.className = "auto-scroll"; b.dataset.act = "auto-scroll";
      dock.insertBefore(b, dock.querySelector('[data-act="undoall"]'));
    }
    updateButton();
    if (resume) start();
  }
  return {mount, stop, isDriving: target => running && target === sc};
})();
