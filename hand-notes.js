/* Four quick notes + optional handwriting. Save the original before recognition. */
"use strict";
const HandNotes = (() => {
  let worker = null, serial = 0;
  const jobs = new Map(), queued = new WeakSet();
  const status = text => { const el = document.getElementById("hand-status"); if (el) el.textContent = text; };
  function finish(id, text, error) {
    const job = jobs.get(id); if (!job) return;
    jobs.delete(id); clearTimeout(job.timer);
    const {note, hand} = job;
    // Undo, deletion, import, or a manual correction wins over a late recognition result.
    if (!S.notes.includes(note) || note.hand !== hand || hand.state !== "pending") return;
    hand.text = error ? "" : String(text || "").slice(0, 1000);
    hand.state = error || !hand.text ? "unread" : "draft";
    save(); schedulePush();
    if (!U.sheet && !U.menu && !typingNow()) render(true);
  }
  function getWorker() {
    if (worker) return worker;
    try {
      worker = new Worker("hand-worker.js?v=16.36.1");
      worker.onmessage = e => {
        if (!e.data.error) { finish(e.data.id, e.data.text, false); return; }
        worker?.terminate(); worker = null;
        for (const id of [...jobs.keys()]) finish(id, "", true);
      };
      worker.onerror = () => {
        worker?.terminate(); worker = null;
        for (const id of [...jobs.keys()]) finish(id, "", true);
      };
    } catch (_) { worker = null; }
    return worker;
  }
  function recognize(note) {
    if (!HandData.hasInk(note?.hand) || note.hand.state !== "pending" || queued.has(note.hand)) return;
    const hand = note.hand, id = ++serial;
    queued.add(hand);
    const job = {note, hand, timer:setTimeout(() => finish(id, "", true), 25000)};
    jobs.set(id, job);
    try { const w = getWorker(); if (!w) throw new Error("worker unavailable"); w.postMessage({id, hand}); }
    catch (_) { finish(id, "", true); }
  }
  function resume() {
    if (!VIEW()) S.notes.filter(n => n.hand?.state === "pending").forEach(recognize);
  }
  function preview(n, editable = true) {
    const hand = n.hand; if (!HandData.hasInk(hand)) return "";
    const body = `${hand.text ? `<span class="hand-text">${h(hand.text)}</span>` : ""}${HandData.svg(hand)}
      <small>${hand.state === "pending" ? "文字を認識中" : hand.state === "draft" ? "自動認識・未確認" : hand.state === "unread" ? "手書きの原文" : "手書き"}${editable && !VIEW() && !n.ro ? " · 文字を修正" : ""}</small>`;
    return editable && !VIEW() && !n.ro
      ? `<button class="hand-note" data-act="hand-edit" data-id="${h(n.id)}" aria-label="手書きの文字を修正">${body}</button>`
      : `<div class="hand-note">${body}</div>`;
  }
  function renderInput(sh, contextText) {
    sh.hand ||= {v:1, cells:[], text:"", state:"pending"}; sh.handPage ||= 0;
    const page = sh.handPage;
    const pages = Math.max(page + 1, Math.ceil(sh.hand.cells.length / 6), 1);
    overlay = document.createElement("div"); overlay.className = "mask hand-mask";
    overlay.innerHTML = `<button class="sp" data-act="cancel" aria-label="手書きを保存して閉じる"></button>
      <section class="sheet hand-sheet" role="dialog" aria-modal="true" aria-label="手書きで指摘">
        <header><button data-act="hand-back">‹ 戻る</button><h2>手書き</h2><span>試用</span></header>
        <p class="hand-context">${h(contextText)}</p>
        <p class="hand-hint">1マスに1文字 · 左から右へ</p>
        <div class="hand-grid">${Array.from({length:6}, (_, j) => `<canvas width="256" height="256" data-hand-cell="${page * 6 + j}" aria-label="手書き ${page * 6 + j + 1}文字目"></canvas>`).join("")}</div>
        <div class="hand-tools"><button data-act="hand-undo">一筆戻す</button><span>${page + 1} / ${pages}</span><button data-act="hand-page" data-id="${page - 1}" ${page === 0 ? "disabled" : ""}>前へ</button><button data-act="hand-page" data-id="${page + 1}" ${page >= 5 ? "disabled" : ""}>続き</button></div>
        <p id="hand-status" role="status">原文を保存してから、文字に読み取ります。</p>
        <footer><button data-act="note-detail" data-id="memo">文字で入力</button><button class="hand-save" data-act="hand-save" ${!HandData.hasInk(sh.hand) ? "disabled" : ""}>保存して戻る</button></footer>
      </section>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-hand-cell]").forEach(canvas => bindCanvas(canvas, sh));
    getWorker();
  }
  function paint(canvas, strokes) {
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, 256, 256);
    ctx.strokeStyle = "#edf2fa"; ctx.lineWidth = 5; ctx.lineCap = ctx.lineJoin = "round";
    for (const stroke of strokes || []) {
      if (!stroke.length) continue;
      ctx.beginPath(); ctx.moveTo(...stroke[0]);
      for (const p of stroke.slice(1)) ctx.lineTo(...p);
      if (stroke.length === 1) ctx.lineTo(stroke[0][0] + .1, stroke[0][1] + .1);
      ctx.stroke();
    }
  }
  function bindCanvas(canvas, sh) {
    const i = Number(canvas.dataset.handCell);
    let active = null;
    const point = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top].map((v, k) => Math.round(Math.max(0, Math.min(255, v * 256 / (k ? r.height : r.width))))); };
    const strokes = () => sh.hand.cells[i] ||= [];
    paint(canvas, strokes());
    canvas.addEventListener("pointerdown", e => {
      if (e.button !== 0 || !e.isPrimary || active || U.sheet !== sh) return;
      if (strokes().length >= HandData.MAX_STROKES) { status("このマスは一筆戻してから書き直してください。"); return; }
      e.preventDefault(); canvas.setPointerCapture(e.pointerId);
      const stroke = [point(e)]; strokes().push(stroke); active = {id:e.pointerId, stroke};
      (sh.handHistory ||= []).push(i); paint(canvas, strokes());
      const saveButton = overlay?.querySelector('[data-act="hand-save"]'); if (saveButton) saveButton.disabled = false;
    });
    canvas.addEventListener("pointermove", e => {
      if (!active || active.id !== e.pointerId || U.sheet !== sh) return;
      e.preventDefault(); const p = point(e), last = active.stroke.at(-1);
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return;
      if (active.stroke.length >= 512) active.stroke.splice(1, active.stroke.length - 2, ...active.stroke.filter((_, k) => k % 2 && k < active.stroke.length - 1));
      active.stroke.push(p);
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); }
    });
    const end = e => {
      if (!active || active.id !== e.pointerId) return;
      if (e.type === "pointerup") active.stroke.push(point(e));
      // Cancellation retains the partial original instead of losing a stroke.
      active = null; paint(canvas, strokes());
    };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end); canvas.addEventListener("lostpointercapture", end);
  }
  function renderEdit(menu) {
    const n = S.notes.find(n => n.id === menu.id); if (!n?.hand || VIEW()) { U.menu = null; return; }
    if (menu.text == null) menu.text = n.hand.text || "";
    overlay = document.createElement("div"); overlay.className = "mask hand-mask";
    overlay.innerHTML = `<button class="sp" data-act="closemenu" aria-label="閉じる"></button><section class="sheet hand-sheet" role="dialog" aria-modal="true" aria-label="手書きの文字を修正">
      <header><h2>手書きの文字</h2><button data-act="closemenu">閉じる</button></header>
      ${HandData.svg(n.hand)}<label for="hand-text">${n.hand.state === "draft" ? "自動認識・内容を確認してください" : "文字を修正"}</label>
      <textarea id="hand-text" class="field" rows="2" placeholder="手書きの内容を入力">${h(menu.text)}</textarea>
      <footer><button data-act="hand-retry">再認識</button><button class="hand-save" data-act="hand-text-save">保存</button></footer>
    </section>`;
    document.body.appendChild(overlay);
  }
  document.addEventListener("input", e => { if (e.target.id === "hand-text" && U.menu?.kind === "hand-edit") U.menu.text = e.target.value; });
  function handle(action, id) {
    if (!action.startsWith("hand-")) return false;
    if (VIEW()) return true;
    const sh = U.sheet;
    if (action === "hand-open" && sh) { commitFields(); sh.handOpen = true; sh.detail = false; renderSheet(); }
    if (action === "hand-back" && sh) { sh.handOpen = false; renderSheet(); }
    if (action === "hand-save" && sh && HandData.hasInk(sh.hand)) scheduleCommit();
    if (action === "hand-page" && sh && Number.isInteger(+id) && +id >= 0 && +id < 6) { sh.handPage = +id; renderSheet(); }
    if (action === "hand-undo" && sh) {
      const i = sh.handHistory?.pop(); if (i != null) { sh.hand.cells[i]?.pop(); renderSheet(); }
    }
    if (action === "hand-edit") { U.menu = {kind:"hand-edit", id}; renderSheet(); }
    if ((action === "hand-text-save" || action === "hand-retry") && U.menu?.kind === "hand-edit") {
      const n = S.notes.find(n => n.id === U.menu.id);
      if (!n?.hand) { U.menu = null; render(); return true; }
      pushUndo(null, true);
      n.hand = {...n.hand, text:action === "hand-retry" ? "" : String(U.menu.text || "").trim(), state:action === "hand-retry" ? "pending" : "manual"};
      U.menu = null; save(); schedulePush(); render(); if (action === "hand-retry") recognize(n);
    }
    return true;
  }
  if (typeof booted !== "undefined" && booted) resume();
  return {render:renderInput, renderEdit, preview, recognize, resume, handle};
})();
