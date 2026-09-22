/* Separate handwriting trial. Only its own draft key is ever read or written. */
"use strict";
(() => {
  const STORAGE_KEY = "utacheck.handwriting-lab.v1", CELL_COUNT = 6, TIMEOUT_MS = 90000;
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const blankCells = () => Array.from({length:CELL_COUNT}, () => []);
  let cells = blankCells(), history = [], revision = 0, serial = 0, comparison = null, active = null;
  const canvases = [], clearButtons = [];
  const engines = [
    {name:"legacy", file:"hand-worker.js", worker:null, pending:new Map()},
    {name:"model", file:"hand-model-worker.js", worker:null, pending:new Map()},
  ];

  function storageMessage(message, error = false) {
    $("lab-storage").textContent = message;
    $("lab-storage").classList.toggle("is-error", error);
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = HandData.clean(JSON.parse(raw));
      if (!saved) return;
      cells = Array.from({length:CELL_COUNT}, (_,i) => saved.cells[i] || []);
      storageMessage("このページで前に書いた筆跡を復元しました。");
    } catch (_) { storageMessage("端末への保存が使えません。この画面ではそのまま試せます。", true); }
  }
  function save() {
    try {
      const ink = HandData.clean({v:1,cells,state:"unread"});
      if (ink) localStorage.setItem(STORAGE_KEY, JSON.stringify(ink));
      else localStorage.removeItem(STORAGE_KEY);
      storageMessage(ink ? "このページの筆跡を端末に保存しました。" : "このページの筆跡を消しました。");
    } catch (_) { storageMessage("筆跡を端末に保存できませんでした。この画面では残っています。", true); }
  }
  function remember() {
    history.push(clone(cells));
    if (history.length > 120) history.shift();
  }
  function resetResult(engine, message) {
    const card = $("lab-result-" + engine.name);
    card.querySelector(".lab-result-state").textContent = message;
    const result = card.querySelector(".lab-result-text"), choices = card.querySelector(".lab-candidates");
    result.textContent = ""; result.hidden = true;
    choices.replaceChildren(); choices.hidden = true;
  }
  function invalidate() {
    revision++;
    if (comparison) {
      comparison = null;
      for (const engine of engines) {
        for (const [id, job] of engine.pending) {
          clearTimeout(job.timer); engine.pending.delete(id);
          job.reject(new Error("superseded"));
        }
      }
    }
    engines.forEach(engine => resetResult(engine, "筆跡を比較すると、ここに表示します。"));
    $("lab-status").textContent = "筆跡を変えました。書き終えたら、もう一度比較してください。";
    updateButtons();
  }
  function updateButtons() {
    const hasInk = cells.some(cell => cell.length);
    $("lab-undo").disabled = !history.length || !!active;
    $("lab-clear").disabled = !hasInk || !!active;
    $("lab-compare").disabled = !hasInk || !!active || !!comparison;
    $("lab-compare").textContent = comparison ? "読み取り中…" : "読み取りを比較";
    clearButtons.forEach((button, i) => { button.disabled = !cells[i].length || !!active; });
  }
  function paint(index) {
    const ctx = canvases[index].getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0,0,256,256);
    ctx.strokeStyle = "#f3f7ff"; ctx.lineWidth = 5; ctx.lineCap = ctx.lineJoin = "round";
    for (const stroke of cells[index]) {
      if (!stroke.length) continue;
      ctx.beginPath(); ctx.moveTo(...stroke[0]);
      for (const point of stroke.slice(1)) ctx.lineTo(...point);
      if (stroke.length === 1) ctx.lineTo(stroke[0][0]+.1,stroke[0][1]+.1);
      ctx.stroke();
    }
  }
  function point(event, canvas) {
    const bounds = canvas.getBoundingClientRect();
    return [event.clientX-bounds.left,event.clientY-bounds.top].map((v,i) => Math.round(Math.min(255,Math.max(0,v*256/(i ? bounds.height : bounds.width)))));
  }
  function appendPoint(event) {
    if (!active) return;
    const p = point(event, canvases[active.index]), stroke = active.stroke, last = stroke.at(-1);
    if (Math.hypot(p[0]-last[0],p[1]-last[1]) < 1.5) return;
    if (stroke.length >= 512) {
      const reduced = stroke.filter((_,i) => i===0 || i===stroke.length-1 || i%2===0);
      stroke.splice(0,stroke.length,...reduced);
    }
    stroke.push(p);
  }
  function finishStroke(event) {
    if (!active || (event && event.pointerId !== active.pointerId)) return;
    const {index,pointerId} = active, canvas = canvases[index];
    if (event?.type === "pointerup") appendPoint(event);
    active = null;
    try { if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); } catch (_) {}
    paint(index); save(); updateButtons();
  }
  function buildCanvases() {
    const grid = $("lab-grid");
    for (let i=0; i<CELL_COUNT; i++) {
      const cell = document.createElement("div"); cell.className = "lab-cell";
      const head = document.createElement("div"); head.className = "lab-cell-head";
      const label = document.createElement("span"); label.textContent = `${i+1}文字目`;
      const hint = document.createElement("span"); hint.textContent = "指・ペンで入力";
      head.append(label,hint);
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
      canvas.dataset.cell = i; canvas.setAttribute("aria-label", `${i+1}文字目の手書き欄`);
      canvas.textContent = `${i+1}文字目の手書き欄です。`;
      const clear = document.createElement("button"); clear.type = "button"; clear.className = "lab-cell-clear";
      clear.textContent = "この字を消す"; clear.setAttribute("aria-label", `${i+1}文字目を消す`);
      clear.addEventListener("click", () => {
        if (active || !cells[i].length) return;
        remember(); cells[i] = []; invalidate(); paint(i); save(); updateButtons();
      });
      canvas.addEventListener("pointerdown", event => {
        if (!event.isPrimary || event.button !== 0 || active) return;
        event.preventDefault();
        if (cells[i].length >= HandData.MAX_STROKES) {
          $("lab-status").textContent = "このマスは筆画が多いため、一度消してから書き直してください。"; return;
        }
        remember(); invalidate();
        const stroke = [point(event,canvas)]; cells[i].push(stroke);
        active = {index:i,pointerId:event.pointerId,stroke};
        try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
        paint(i); updateButtons();
      });
      canvas.addEventListener("pointermove", event => {
        if (!active || active.pointerId !== event.pointerId || active.index !== i) return;
        event.preventDefault();
        const events = event.getCoalescedEvents?.() || [];
        (events.length ? events : [event]).forEach(appendPoint); paint(i);
      });
      canvas.addEventListener("pointerup", finishStroke);
      canvas.addEventListener("pointercancel", finishStroke);
      canvas.addEventListener("lostpointercapture", finishStroke);
      cell.append(head,canvas,clear); grid.append(cell); canvases.push(canvas); clearButtons.push(clear);
    }
  }
  function stopEngine(engine, error) {
    engine.worker?.terminate(); engine.worker = null;
    for (const [id, job] of engine.pending) {
      clearTimeout(job.timer); engine.pending.delete(id); job.reject(error);
    }
  }
  function workerFor(engine) {
    if (engine.worker) return engine.worker;
    const worker = new Worker(engine.file); engine.worker = worker;
    worker.onmessage = ({data}) => {
      if (engine.worker !== worker || !data) return;
      const job = engine.pending.get(data.id); if (!job) return;
      clearTimeout(job.timer); engine.pending.delete(data.id);
      if (data.error) { job.reject(new Error("recognition failed")); stopEngine(engine,new Error("recognition failed")); }
      else job.resolve(data);
    };
    worker.onerror = event => { event.preventDefault(); if (engine.worker === worker) stopEngine(engine,new Error("worker unavailable")); };
    worker.onmessageerror = () => { if (engine.worker === worker) stopEngine(engine,new Error("invalid response")); };
    return worker;
  }
  function recognize(engine, ink) {
    return new Promise((resolve,reject) => {
      const id = ++serial;
      try {
        const worker = workerFor(engine);
        const timer = setTimeout(() => stopEngine(engine,new Error("timeout")), TIMEOUT_MS);
        engine.pending.set(id,{resolve,reject,timer});
        worker.postMessage({id,hand:ink});
      } catch (error) {
        const job = engine.pending.get(id); if (job) { clearTimeout(job.timer); engine.pending.delete(id); }
        reject(error);
      }
    });
  }
  function renderResult(engine, ink, response, elapsed) {
    const result = HandData.clean({...ink,text:response.text,state:"draft"});
    if (!result?.text) throw new Error("empty result");
    const card = $("lab-result-" + engine.name), output = card.querySelector(".lab-result-text"), list = card.querySelector(".lab-candidates");
    card.querySelector(".lab-result-state").textContent = `${(elapsed/1000).toFixed(1)}秒 · 自動認識・未確認`;
    output.textContent = result.text; output.hidden = false; list.replaceChildren();
    const chars = Array.from(result.text); let position = 0;
    ink.cells.forEach((cell,index) => {
      if (!cell.length) return;
      const fallback = chars[position++] || "□";
      // Keep compatible with the deployed HandData, which intentionally stores
      // no candidates. Candidate lists are display-only and never persisted.
      const entry = Array.isArray(response.candidates) ? response.candidates.find(item => item?.index===index) : null;
      const seen = new Set();
      const choices = (Array.isArray(entry?.choices) ? entry.choices : []).slice(0,5)
        .map(choice => choice?.text).filter(text => {
          if (typeof text!=="string" || Array.from(text).length!==1 || /[\s\u0000-\u001f\u007f]/u.test(text) || seen.has(text)) return false;
          seen.add(text); return true;
        });
      if (!choices.length) choices.push(fallback);
      const row = document.createElement("li"), number = document.createElement("span"), values = document.createElement("span");
      number.className = "lab-candidate-index"; number.textContent = `${index+1}文字目`;
      values.className = "lab-candidate-choices";
      choices.forEach((text,i) => {
        const item = document.createElement(i ? "span" : "b"); item.textContent = text; values.append(item);
      });
      row.append(number,values); list.append(row);
    });
    list.hidden = false;
  }
  async function compare() {
    if (active || comparison) return;
    const ink = HandData.clean({v:1,cells,state:"unread"}); if (!ink) return;
    save();
    const run = {revision}; comparison = run;
    $("lab-status").textContent = "同じ筆跡を読み取り中です。新しい方式の初回は、認識データの読み込みに時間がかかります。";
    engines.forEach(engine => resetResult(engine,"読み取り中…")); updateButtons();
    const outcomes = await Promise.all(engines.map(async engine => {
      const started = performance.now();
      try {
        const result = await recognize(engine,ink);
        if (comparison !== run || revision !== run.revision) return "superseded";
        renderResult(engine,ink,result,performance.now()-started); return "ok";
      } catch (error) {
        if (comparison !== run || revision !== run.revision) return "superseded";
        resetResult(engine,error.message === "timeout"
          ? "90秒以内に読み取れませんでした。通信状態を確認して、もう一度比較してください。"
          : "読み取れませんでした。筆跡は残っています。もう一度比較してください。");
        return "error";
      }
    }));
    if (comparison !== run || revision !== run.revision) return;
    comparison = null; updateButtons();
    $("lab-status").textContent = outcomes.every(value => value === "ok")
      ? "比較できました。下の結果が、書いた文字と合っているか確認してください。"
      : "一部を読み取れませんでした。筆跡を残したまま、もう一度比較できます。";
    $("lab-results").scrollIntoView({behavior:"auto",block:"start"});
  }

  load(); buildCanvases(); cells.forEach((_,i) => paint(i)); updateButtons();
  $("lab-undo").addEventListener("click", () => {
    if (active || !history.length) return;
    cells = history.pop(); invalidate(); cells.forEach((_,i) => paint(i)); save(); updateButtons();
  });
  $("lab-clear").addEventListener("click", () => {
    if (active || !cells.some(cell => cell.length)) return;
    remember(); cells = blankCells(); invalidate(); cells.forEach((_,i) => paint(i)); save(); updateButtons();
    $("lab-status").textContent = "筆跡を消しました。「一つ戻す」で元に戻せます。";
  });
  $("lab-compare").addEventListener("click", compare);
  window.addEventListener("pointerup", finishStroke);
  window.addEventListener("pointercancel", finishStroke);
  window.addEventListener("pagehide", () => { finishStroke(); save(); });
})();
