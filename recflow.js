/* レコーディングの判断と交代確認。記録は曲と進行枠に紐づけ、時間の実績とは分ける。 */
"use strict";
const RecFlow = (() => {
  const labels = { unknown: "未確認", candidate: "候補あり", retake: "録り直し", partial: "一部再録", done: "完了" };
  const icons = { unknown: "○", candidate: "◇", retake: "↻", partial: "↻", done: "✓" };
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const entry = (so, sl, sec) => (so.recChecks || []).find((x) => x.slotId === sl.id && x.section === sec);
  const stateOf = (x) => x && labels[x.status] ? x.status : "unknown";
  let undo = null;
  let notice = "";
  let noticeKey = "";
  const contextKey = (c) => JSON.stringify([c.so.id, c.sl.id, c.sl.secCur]);

  function context(menu) {
    const so = menu ? S.rsongs.find((x) => x.id === menu.songId) : recSong();
    const sl = menu ? (S.plan.slots || []).find((x) => x.id === menu.slotId) : (focusRow() || {}).s;
    if (!S.recMode || !so || !sl || sl.kind === "break") return null;
    return { so, sl };
  }
  function linesFor(so, sec) {
    let current = "";
    return (so.lines || []).map((l, i) => {
      if (l.sec) current = l.sec;
      const hit = current === sec || l.tag === sec;
      return hit && !l.gap && !l.cut && !l.skip && l.t ? { index: i, text: l.t } : null;
    }).filter(Boolean);
  }
  function sections(so, sl) {
    const out = [];
    for (const x of sectionsOf(sl)) {
      if (x.prep || x.skip) continue;
      const tags = [...new Set((so.lines || []).filter((l) => !l.gap && !l.cut && !l.skip && l.tag && tagBase(l.tag) === x.name).map((l) => l.tag))];
      const names = isTagSec(x.name) && tags.length ? tags : [x.name];
      for (const name of names) {
        const e = entry(so, sl, name);
        out.push({ name, entry: e, status: stateOf(e) });
      }
    }
    return out;
  }
  function current(c) {
    // 判断の対象は実際に選択した区切り。表示フィルターだけでは変更しない。
    const name = c.sl.secCur || "";
    return sections(c.so, c.sl).find((x) => x.name === name);
  }
  function counts(list) {
    return list.reduce((o, x) => { o[x.status]++; return o; }, { unknown: 0, candidate: 0, retake: 0, partial: 0, done: 0 });
  }
  function tab(sl, name) {
    const so = recSong();
    if (!so || name === PREP) return "";
    const list = sections(so, sl).filter((x) => x.name === name || (isTagSec(name) && tagBase(x.name) === name));
    if (!list.length) return "";
    const st = list.some((x) => x.status === "retake" || x.status === "partial") ? "retake"
      : list.every((x) => x.status === "done") ? "done"
      : list.some((x) => x.status === "candidate") ? "candidate" : "unknown";
    return `<span class="rf-dot rf-${st}" aria-label="${labels[st]}">${icons[st]}</span>`;
  }
  function bar() {
    const c = context();
    if (!c) return `<div class="rf-empty"><span>進行表で録る人を選ぶと、判断と録り残しを記録できます。</span><button data-act="goplan">進行表</button></div>`;
    const list = sections(c.so, c.sl), n = counts(list), cur = current(c);
    const ready = !!cur && c.sl.a0 != null && c.sl.a1 == null;
    const disabled = ready ? "" : " disabled";
    const showNotice = noticeKey === contextKey(c) ? notice : "";
    const canUndo = undo && undo.songId === c.so.id && undo.slotId === c.sl.id && undo.stack === undoStack[undoStack.length - 1];
    return `<section class="rf-dock" aria-label="テイクの判断">
      <div class="rf-context"><strong>${h(c.sl.name)}</strong><span>${h(c.sl.secCur || "区切り未選択")} · Take ${takeNo(c.sl)}</span>
        <button data-act="rf-review">録り残し <b>${list.length - n.done}</b></button></div>
      <div class="rf-actions">
        <button data-act="rf-mark" data-id="candidate"${disabled}>◇ 採用候補</button>
        <button data-act="rf-mark" data-id="retake"${disabled}>↻ もう一度</button>
        <button data-act="rf-partial"${disabled}>一部再録</button>
        <button data-act="rf-mark" data-id="done"${disabled}>✓ 完了</button>
      </div>
      <div class="rf-feedback"><span role="status">${saveErr ? "保存できていません。バックアップしてください。" : showNotice ? h(showNotice) : cur ? `${h(labels[cur.status])}${cur.entry && cur.entry.candidates && cur.entry.candidates.length ? " · 候補 T" + cur.entry.candidates.join(" / T") : ""}` : "区切りを選んで開始すると判断を残せます"}</span>
        ${canUndo ? '<button data-act="rf-undo">取消</button>' : ""}<button data-act="rf-review">交代前の確認</button></div>
    </section>`;
  }
  function openReview(slotId, endAction) {
    const so = recSong(), sl = (S.plan.slots || []).find((x) => x.id === slotId) || (focusRow() || {}).s;
    if (!so || !sl || sl.kind === "break") return false;
    commitFields();
    U.menu = { kind: "rf-review", songId: so.id, slotId: sl.id, endAction: endAction || "" };
    renderSheet();
    return true;
  }
  function snapshot(so, sl, sec) {
    pushUndo();
    undo = { songId: so.id, slotId: sl.id, section: sec, stack: undoStack[undoStack.length - 1] };
  }
  function setStatus(c, sec, status, extra) {
    if (!sections(c.so, c.sl).some((x) => x.name === sec) || !labels[status]) return;
    snapshot(c.so, c.sl, sec);
    if (!Array.isArray(c.so.recChecks)) c.so.recChecks = [];
    let e = entry(c.so, c.sl, sec);
    if (!e) { e = { slotId: c.sl.id, section: sec, candidates: [] }; c.so.recChecks.push(e); }
    // 交代確認で別の区切りを直す場合、その区切りのテイクを採る。
    const take = Number((c.sl.takes || {})[sec] == null ? 1 : c.sl.takes[sec]);
    if (status === "candidate") e.candidates = [...new Set([...(e.candidates || []), take])].sort((a, b) => a - b);
    e.status = status; e.take = take; e.at = Date.now();
    if (extra) Object.assign(e, extra);
    // 完了しても再録箇所の履歴を消さない。表示時は現在の状態と区別する。
    noticeKey = contextKey(c);
    notice = `${sec} · Take ${take} を「${labels[status]}」にしました`;
    save(); render();
  }
  function reviewHTML(c, m) {
    const list = sections(c.so, c.sl), n = counts(list);
    return `<div class="rf-summary"><div><b>${n.done}</b> 完了</div><div><b>${n.candidate}</b> 候補</div><div><b>${n.retake + n.partial}</b> 再録</div><div><b>${n.unknown}</b> 未確認</div></div>
      <p class="rf-help">候補を付けても完了にはなりません。以前の録音状況は「未確認」で残しています。</p>
      ${list.length ? `<button class="rf-wide" data-act="rf-next">次の要確認箇所をひらく</button>` : '<p class="rf-help">録る区切りがありません。歌詞と配分の「録らない」指定を確認してください。</p>'}
      <div class="rf-review-list">${list.map((x) => {
        const e = x.entry || {};
        return `<article class="rf-review-item"><div class="row"><button class="rf-section" data-act="rf-jump" data-id="${h(x.name)}">${h(x.name)} <span>歌詞へ ›</span></button><span class="rf-badge rf-${x.status}">${icons[x.status]} ${labels[x.status]}</span></div>
          ${e.candidates && e.candidates.length ? `<p class="rf-help">採用候補：${e.candidates.map((t) => "Take " + t).join(" / ")}</p>` : ""}
          ${e.punch && e.punch.length && x.status === "partial" ? `<ul class="rf-punch">${e.punch.map((l) => `<li>${h(l.text)}</li>`).join("")}</ul>` : ""}
          ${e.memo && x.status === "partial" ? `<p class="rf-memo">${h(e.memo)}</p>` : ""}
          <div class="rf-row-actions"><button data-act="rf-detail" data-id="${h(x.name)}">${x.status === "partial" ? "再録箇所を編集" : "一部再録"}</button>
          ${x.status !== "done" ? `<button data-act="rf-done" data-id="${h(x.name)}">完了にする</button>` : `<button data-act="rf-reopen" data-id="${h(x.name)}">未確認に戻す</button>`}</div></article>`;
      }).join("")}</div>
      <div class="rf-sheet-footer"><button class="rf-wide" data-act="rf-copy">この人の確認メモをコピー</button>
      ${m.endAction ? `<button class="rf-wide rf-primary" data-act="rf-finish">${list.length - n.done ? "残りを記録したまま交代する" : "確認を終えて交代する"}</button>` : ""}</div>`;
  }
  function sheet(m) {
    const c = context(m);
    if (!c) return '<p>対象の曲・進行枠が見つかりません。</p><button class="rf-wide" data-act="closemenu">閉じる</button>';
    const partial = m.kind === "rf-partial";
    const title = partial ? `${m.section} の一部を録り直す` : "交代前の確認";
    let body;
    if (partial) {
      const lines = linesFor(c.so, m.section);
      body = `<p class="rf-help">録り直す行を選択します。語尾や単語だけの場合は、下のメモに残せます。</p>
        <div class="rf-lines">${lines.map((l) => `<label><input type="checkbox" data-rf-line="${l.index}"${(m.punch || []).some((p) => p.index === l.index && p.text === l.text) ? " checked" : ""}><span>${h(l.text)}</span></label>`).join("")}</div>
        <label class="rf-help" for="rf-memo">録り直す箇所のメモ</label><textarea class="field" id="rf-memo" rows="3" placeholder="最後の「ありがとう」の語尾だけ">${h(m.memo || "")}</textarea>
        <p id="rf-error" role="alert" class="rf-error"></p><button class="rf-wide rf-primary" data-act="rf-save-partial">再録箇所を記録する</button>`;
    } else body = reviewHTML(c, m);
    return `<div class="rf-sheet" role="dialog" aria-modal="true" aria-labelledby="rf-title"><div class="rf-sheet-head"><div><h2 id="rf-title">${title}</h2><p>${h(c.sl.name)} · ${h(c.so.title)}</p></div><button data-act="rf-close" aria-label="閉じる">閉じる</button></div>${body}</div>`;
  }
  function jump(c, sec) {
    // 他の人の枠を参照している時は表示だけ。進行中の別人やPro Toolsを動かさない。
    S.planFocus = c.sl.id;
    U.songIdx = S.rsongs.findIndex((x) => x.id === c.so.id); S.rsongId = c.so.id;
    if (c.sl.a0 != null && c.sl.a1 == null) { c.sl.secCur = sec; c.sl.secStart = Date.now(); }
    U.secView = sec; U.menu = null; U.overview = false; U.view = "live";
    notice = ""; save(); render();
    setTimeout(() => { const el = document.getElementById("sec-" + sec); if (el) el.scrollIntoView({ block: "start" }); }, 0);
  }
  function memoText(c) {
    const list = sections(c.so, c.sl);
    return [`${c.so.title} / ${c.sl.name}`, ...list.map((x) => {
      const e = x.entry || {};
      return `${x.name}：${labels[x.status]}${e.candidates && e.candidates.length ? "（候補 " + e.candidates.map((t) => "T" + t).join(" / ") + "）" : ""}`
        + (x.status === "partial" ? (e.punch || []).map((l) => "\n  ・" + l.text).join("") + (e.memo ? "\n  メモ：" + e.memo : "") : "");
    })].join("\n");
  }
  function handle(action, id) {
    if (!action.startsWith("rf-")) return false;
    const m = U.menu && U.menu.kind.startsWith("rf-") ? U.menu : null;
    const c = context(m);
    if (action === "rf-close") { U.menu = null; renderSheet(); return true; }
    if (!c) return true;
    if (action === "rf-review") { notice = ""; openReview(c.sl.id); }
    else if (action === "rf-mark") {
      const cur = current(c);
      if (cur && c.sl.a0 != null && c.sl.a1 == null) setStatus(c, cur.name, id);
    } else if (action === "rf-partial" || action === "rf-detail") {
      const sec = action === "rf-detail" ? id : (current(c) || {}).name;
      if (sec) {
        const e = entry(c.so, c.sl, sec) || {};
        U.menu = { kind: "rf-partial", songId: c.so.id, slotId: c.sl.id, section: sec, memo: e.memo || "", punch: copy(e.punch || []), back: m && m.kind === "rf-review" ? copy(m) : null };
        renderSheet();
      }
    } else if (action === "rf-save-partial") {
      if (!m || m.kind !== "rf-partial") return true;
      const punch = linesFor(c.so, m.section).filter((l) => (m.punch || []).some((p) => p.index === l.index && p.text === l.text));
      const memo = (m.memo || "").trim();
      if (!punch.length && !memo) { document.getElementById("rf-error").textContent = "行を選ぶか、録り直す箇所をメモしてください。"; return true; }
      U.menu = m.back || null;
      setStatus(c, m.section, "partial", { punch, memo });
    } else if (action === "rf-done" || action === "rf-reopen") {
      setStatus(c, id, action === "rf-done" ? "done" : "unknown");
    } else if (action === "rf-undo" && undo && undo.stack === undoStack[undoStack.length - 1]) {
      noticeKey = contextKey(c);
      notice = `${undo.section} の判断を取り消しました`; undo = null;
      const button = document.createElement("button");
      button.dataset.act = "undo"; button.hidden = true;
      document.body.appendChild(button); button.click(); button.remove();
    } else if (action === "rf-next") {
      const list = sections(c.so, c.sl).filter((x) => x.status !== "done");
      const i = list.findIndex((x) => x.name === c.sl.secCur);
      const next = list.length ? list[(i + 1) % list.length] : null;
      if (next) jump(c, next.name);
      else { noticeKey = contextKey(c); notice = "すべて完了しています"; U.menu = null; render(); }
    } else if (action === "rf-jump") jump(c, id);
    else if (action === "rf-copy") copyText(memoText(c), "確認メモをコピーしました。");
    else if (action === "rf-finish" && m && m.endAction) {
      const endAction = m.endAction;
      const live = planRows().find((x) => x.live);
      if (!live || live.s.id !== c.sl.id) { U.menu = null; render(); return true; }
      U.menu = null; renderSheet();
      // 既存の進行処理へ戻す。確認を通過したこのクリックだけ再表示を抑える。
      const button = document.createElement("button");
      button.dataset.act = endAction; button.dataset.id = c.sl.id; button.dataset.rfApproved = "1";
      button.hidden = true; document.body.appendChild(button); button.click(); button.remove();
    }
    return true;
  }
  function guard(action, id, approved) {
    if (approved || !S.recMode || !recSong()) return false;
    if (action === "pnext") return openReview(id, action);
    if (action === "pnextsec") {
      const row = planRows().find((x) => x.live);
      if (!row || row.s.kind === "break") return false;
      const next = sectionsOf(row.s).find((x) => !x.done && !x.skip && x.name !== row.s.secCur);
      if (!next) return openReview(row.s.id, action);
    }
    return false;
  }
  document.addEventListener("input", (e) => {
    const m = U.menu;
    if (!m || m.kind !== "rf-partial") return;
    if (e.target.id === "rf-memo") m.memo = e.target.value;
    if (e.target.matches("[data-rf-line]")) {
      const c = context(m); if (!c) return;
      const l = linesFor(c.so, m.section).find((x) => x.index === Number(e.target.dataset.rfLine));
      m.punch = (m.punch || []).filter((x) => x.index !== Number(e.target.dataset.rfLine));
      if (e.target.checked && l) m.punch.push(l);
    }
  });
  return { bar, tab, sheet, handle, guard, sections, memoText };
})();
