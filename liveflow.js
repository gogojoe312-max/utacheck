/* ライブ中の仮メモと前回確認。仮メモ・確認結果はメンバー配信から独立。 */
"use strict";
const LiveFlow = (() => {
  const defaults = ["pLo", "slow", "diction", "good"];
  let activeKey = "", selected = "pending", lastTag = "", message = "", lastUndo = "";
  const allowed = () => !S.recMode && !VIEW() && !preview;
  const keyOf = (so) => JSON.stringify([S.showId, so && so.id]);
  const tags = () => {
    const a = S.liveQuickTags;
    return Array.isArray(a) && a.length === 4 && new Set(a).size === 4 && a.every((id) => TAGS.some((x) => x.id === id)) ? a : defaults;
  };
  const drafts = (so) => (S.livePending || []).filter((x) => x.showId === S.showId && x.songId === so.id);
  function syncContext(so) {
    if (activeKey !== keyOf(so)) { activeKey = keyOf(so); selected = "pending"; lastTag = ""; message = ""; lastUndo = ""; }
  }
  function before() { pushUndo(); lastUndo = undoStack[undoStack.length - 1]; }
  function persist(text, publish) { message = text; save(); if (publish) schedulePush(); render(); }
  function prior(so) {
    const old = prevSongOf(so); if (!old || old.id === so.id) return [];
    const sameLayout = JSON.stringify(old.lines.map((x) => x.t || "")) === JSON.stringify(so.lines.map((x) => x.t || ""));
    return NOTES().filter((n) => n.songId === old.id && !n.tk && !(n.tags || []).includes("good")).map((n) => {
      const text = (old.lines[n.lineIdx] || {}).t || "";
      const targets = so.lines.map((l, i) => l.t === text && !l.gap ? i : -1).filter((i) => i >= 0);
      const uniqueOld = old.lines.filter((l) => l.t === text && !l.gap).length === 1;
      // 繰り返し歌詞や版変更を曖昧に自動対応させない。
      const lineIdx = sameLayout && so.lines[n.lineIdx] && !so.lines[n.lineIdx].gap ? n.lineIdx
        : text && uniqueOld && targets.length === 1 ? targets[0] : null;
      const fingerprint = JSON.stringify([text, n.tags, n.memo, n.memberIds, n.from, n.to, n.lineEnd]);
      const check = (S.liveChecks || []).find((x) => x.showId === S.showId && x.songId === so.id && x.sourceSongId === old.id && x.noteId === n.id && x.fingerprint === fingerprint);
      return { kind: "prior", id: n.id, sourceSongId: old.id, text, lineIdx, fingerprint,
        memberIds: n.memberIds || [], tags: n.tags || [], memo: n.memo || "", status: check ? check.status : "pending" };
    });
  }
  function items(so) {
    return drafts(so).map((x) => ({ ...x, kind: "draft", status: "pending" })).concat(prior(so));
  }
  const pending = (so) => items(so).filter((x) => x.status === "pending");
  function lineButton(so, i) {
    if (!allowed() || U.draw) return "";
    syncContext(so);
    const marked = drafts(so).some((x) => x.lineIdx === i && x.text === so.lines[i].t);
    const label = marked ? "仮チェックを外す" : selected === "pending" ? "あとで確認に追加" : tagName(selected) + "を記録";
    return `<button class="lf-line ${marked ? "lf-marked" : ""}" data-act="lf-line" data-i="${i}" aria-label="${i + 1}行目を${h(label)}" title="${h(label)}" aria-pressed="${marked}">${marked ? "✓" : "+"}</button>`;
  }
  function bar() {
    const so = song(); if (!allowed() || !so) return "";
    syncContext(so);
    const count = pending(so).length;
    selected = "pending";
    return `<section class="lf-dock lf-compact" aria-label="ライブの確認">
      <span class="lf-status" role="status">${message ? h(message) : ""}</span>
      <button data-act="lf-next"${count ? "" : " disabled"}>未確認 ${count}</button>
      <button data-act="lf-list">一覧</button>
    </section>`;
  }

  function getSong(m) { return m && m.showId === S.showId ? S.songs.find((x) => x.id === m.songId && x.showId === m.showId) : null; }
  function getItem(so, m) { return items(so).find((x) => x.id === m.itemId && x.kind === m.itemKind && (x.kind !== "prior" || x.sourceSongId === m.sourceSongId)); }
  function openItem(so, x) {
    U.menu = { kind: "lf-item", showId: S.showId, songId: so.id, itemId: x.id, itemKind: x.kind, sourceSongId: x.sourceSongId, tag: x.tag != null ? x.tag : tags()[0], memo: x.memo || "" };
    renderSheet();
  }
  function next(so) {
    const x = pending(so)[0];
    if (x) openItem(so, x);
    else { U.menu = { kind: "lf-list", showId: S.showId, songId: so.id }; render(); }
  }
  function heading(so, title) {
    return `<header class="lf-heading"><div><h2>${title}</h2><p>${h(showName())} · ${h(so.title)}</p></div><button data-act="lf-close">閉じる</button></header>`;
  }
  function sheet(m) {
    const so = getSong(m);
    if (!so) return '<p>対象の曲が見つかりません。</p><button class="lf-wide" data-act="lf-close">閉じる</button>';
    if (m.kind === "lf-settings") return heading(so, "よく使う4つの指摘") + `<p class="lf-description">左からこの順で固定します。本番中に自動で並びは変わりません。</p>
      ${m.tags.map((id, i) => `<label class="lf-setting">${i + 1}番目<select data-lf-pref="${i}">${TAGS.map((t) => `<option value="${t.id}"${t.id === id ? " selected" : ""}>${h(t.l)}</option>`).join("")}</select></label>`).join("")}
      <p id="lf-error" role="alert"></p><button class="lf-wide lf-primary" data-act="lf-save-settings">この並びにする</button>`;
    if (m.kind === "lf-list") {
      const all = items(so), left = all.filter((x) => x.status === "pending").length;
      return heading(so, "ライブの確認一覧") + `<div class="lf-count"><b>${left}</b> 未確認 <span>仮メモ ${drafts(so).length} ／ 前回の指摘 ${prior(so).length}</span></div>
        <p class="lf-description">仮メモはメンバーに配信しません。前回の指摘は残し、今回の確認結果を記録します。</p>
        ${!left ? '<p class="lf-empty">✓ この曲の未確認はありません</p>' : '<button class="lf-wide lf-primary" data-act="lf-next">次の未確認をひらく</button>'}
        ${all.map((x) => `<button class="lf-item" data-act="lf-open" data-id="${h(x.id)}" data-kind="${x.kind}" data-source="${h(x.sourceSongId || "")}">
          <span class="lf-item-head">${x.kind === "draft" ? "⚑ 仮メモ" : "前回の指摘"}<b>${x.status === "improved" ? "✓ 改善済み" : x.status === "continue" ? "↻ 継続" : "未確認"}</b></span>
          <span class="lf-lyric">${h(x.text || "歌詞なし")}</span><small>${h(names(x.memberIds))}${x.tags && x.tags.length ? " · " + h(x.tags.map(tagName).join(" / ")) : ""}${x.at != null ? " · " + mmss(x.at) : ""}</small></button>`).join("")}`;
    }
    const x = getItem(so, m);
    if (!x) return heading(so, "確認") + '<p class="lf-description">この項目は処理済みです。</p><button class="lf-wide" data-act="lf-list">一覧に戻る</button>';
    const validLine = x.lineIdx != null && so.lines[x.lineIdx] && so.lines[x.lineIdx].t === x.text;
    const replayable = x.kind === "draft" && x.recKey && S.recs[x.recKey] && x.at != null;
    return heading(so, x.kind === "draft" ? "仮メモを指摘にする" : "前回の指摘を確認") + `
      <p class="lf-description">${h(names(x.memberIds))}${x.tags && x.tags.length ? " · " + h(x.tags.map(tagName).join(" / ")) : ""}</p>
      <blockquote class="lf-quote">${h(x.text || "歌詞なし")}</blockquote>
      ${x.kind === "prior" && x.memo ? `<p class="lf-description">${h(x.memo)}</p>` : ""}
      ${validLine ? '<button class="lf-wide" data-act="lf-jump">この歌詞を表示</button>' : '<p class="lf-warning">歌詞の版が変わっています。現在の行を確認してください。自動では移動しません。</p>'}
      ${replayable ? `<button class="lf-wide" data-act="lf-play"${REC ? " disabled" : ""}>${REC ? "録音停止後に聴けます" : mmss(x.at) + " の録音を聴く"}</button>` : x.at != null ? `<p class="lf-description">録音位置 ${mmss(x.at)}（対応する音声がある端末で再生できます）</p>` : ""}
      ${x.kind === "draft" ? `<p class="lf-description">確定した指摘は、既存の配信設定に従って送られます。</p>
        <label class="lf-setting">指摘<select id="lf-tag"><option value="">メモのみ</option>${TAGS.map((t) => `<option value="${t.id}"${m.tag === t.id ? " selected" : ""}>${h(t.l)}</option>`).join("")}</select></label>
        <label class="lf-description" for="lf-memo">補足メモ</label><textarea class="field" id="lf-memo" rows="3" placeholder="語尾だけ低くなる、など">${h(m.memo || "")}</textarea>
        <p id="lf-error" role="alert"></p><button class="lf-wide lf-primary" data-act="lf-confirm"${validLine ? "" : " disabled"}>指摘に確定して次へ</button>
        <button class="lf-wide" data-act="lf-discard">仮メモを取り消す</button>`
      : `<div class="lf-judgement"><button data-act="lf-check" data-id="improved">✓ 改善済み</button><button data-act="lf-check" data-id="continue">↻ 継続</button></div><p class="lf-description">元の指摘やメンバーへの配信内容は変更しません。</p>`}
      <button class="lf-wide" data-act="lf-list">確認一覧へ</button>`;
  }
  function addLine(so, i) {
    const l = so.lines[i]; if (!l || l.gap || l.cut) return;
    const at = recAt(), captured = at != null ? recKey : null;
    // 別の曲を録音中なら、この曲の時刻として結び付けない。
    const sameRecording = captured && captured.startsWith(S.showId + "|" + so.id + "|");
    const base = { id: uid(), showId: S.showId, songId: so.id, lineIdx: i,
      memberIds: partsOf(so, i).slice(), at: sameRecording ? at : null, recKey: sameRecording ? captured : null, ts: Date.now() };
    if (selected === "pending") {
      const existing = drafts(so).find((x) => x.lineIdx === i && x.text === l.t);
      if (existing) {
        before(); S.livePending = S.livePending.filter((x) => x.id !== existing.id);
        persist(`${i + 1}行目の仮チェックを外しました`, false); return;
      }
      before(); S.livePending = (S.livePending || []).concat({ ...base, text: l.t });
      persist(`${i + 1}行目をあとで確認（配信しません）`, false);
    } else if (TAGS.some((t) => t.id === selected)) {
      const draft = drafts(so).find((x) => x.lineIdx === i && x.text === l.t);
      before();
      const captured = draft ? { memberIds: draft.memberIds, at: draft.at, recKey: draft.recKey, ts: draft.ts } : {};
      S.notes.push({ ...base, ...captured, tags: [selected], memo: draft ? draft.memo || "" : "", pitch: null, lineEnd: null, from: null, to: null });
      if (draft) S.livePending = S.livePending.filter((x) => x.id !== draft.id);
      lastTag = selected; persist(`${i + 1}行目：${tagName(selected)}を記録`, true);
    }
  }
  let draftTimer = null;
  function rememberDraft() {
    clearTimeout(draftTimer);
    const m = U.menu;
    if (!allowed() || !m || m.kind !== "lf-item" || m.itemKind !== "draft") return;
    const so = getSong(m); if (!so) return;
    const d = drafts(so).find((x) => x.id === m.itemId); if (!d) return;
    if (d.memo !== m.memo || d.tag !== m.tag) { d.memo = m.memo || ""; d.tag = m.tag; save(); }
  }
  function handle(a, id, i, button) {
    if (!a.startsWith("lf-")) return false;
    rememberDraft();
    if (a === "lf-close") { U.menu = null; renderSheet(); return true; }
    if (!allowed()) return true;
    const m = U.menu && U.menu.kind.startsWith("lf-") ? U.menu : null;
    const so = m ? getSong(m) : song(); if (!so) return true;
    syncContext(so);
    const x = m ? getItem(so, m) : null;
    if (a === "lf-select") { if (id === "pending" || TAGS.some((t) => t.id === id)) { selected = id; message = ""; render(); } }
    else if (a === "lf-line") addLine(so, i);
    else if (a === "lf-list") { U.menu = { kind: "lf-list", showId: S.showId, songId: so.id }; renderSheet(); }
    else if (a === "lf-next") next(so);
    else if (a === "lf-open") { const item = items(so).find((v) => v.id === id && v.kind === button.dataset.kind && (v.kind !== "prior" || v.sourceSongId === button.dataset.source)); if (item) openItem(so, item); }
    else if (a === "lf-settings") { U.menu = { kind: "lf-settings", showId: S.showId, songId: so.id, tags: tags().slice() }; renderSheet(); }
    else if (a === "lf-save-settings" && m) {
      if (new Set(m.tags).size !== 4 || !m.tags.every((t) => TAGS.some((x) => x.id === t))) { document.getElementById("lf-error").textContent = "4つの異なる指摘を選んでください。"; return true; }
      S.liveQuickTags = m.tags.slice(); U.menu = null; persist("指摘の並びを保存しました", false);
    } else if (a === "lf-confirm" && x && x.kind === "draft") {
      if (!so.lines[x.lineIdx] || so.lines[x.lineIdx].t !== x.text) return true;
      const memo = (m.memo || "").trim(), tag = m.tag;
      if (!tag && !memo) { document.getElementById("lf-error").textContent = "指摘を選ぶか、メモを入力してください。"; return true; }
      if (tag && !TAGS.some((t) => t.id === tag)) return true;
      before();
      S.notes.push({ id: uid(), songId: so.id, showId: S.showId, lineIdx: x.lineIdx,
        memberIds: x.memberIds.slice(), tags: tag ? [tag] : [], memo, pitch: null,
        lineEnd: null, from: null, to: null, at: x.at, recKey: x.recKey, ts: x.ts });
      S.livePending = (S.livePending || []).filter((d) => d.id !== x.id);
      if (tag) lastTag = tag;
      U.menu = null; persist("仮メモを指摘にしました", true); next(so);
    } else if (a === "lf-discard" && x && x.kind === "draft") {
      before(); S.livePending = (S.livePending || []).filter((d) => d.id !== x.id);
      U.menu = null; persist("仮メモを取り消しました", false); next(so);
    } else if (a === "lf-check" && x && x.kind === "prior" && ["improved", "continue"].includes(id)) {
      before(); S.liveChecks = (S.liveChecks || []).filter((c) => !(c.showId === S.showId && c.songId === so.id && c.noteId === x.id && c.sourceSongId === x.sourceSongId));
      S.liveChecks.push({showId:S.showId,songId:so.id,noteId:x.id,sourceSongId:x.sourceSongId,fingerprint:x.fingerprint,status:id,at:Date.now()});
      U.menu = null; persist(id === "improved" ? "改善済みを記録しました" : "継続を記録しました", false); next(so);
    } else if (a === "lf-jump" && x && x.lineIdx != null && so.lines[x.lineIdx] && so.lines[x.lineIdx].t === x.text) {
      U.menu = null; U.overview = false; U.view = "live"; U.songIdx = SONGS().findIndex((s) => s.id === so.id); U.secView = "";
      render(); setTimeout(() => { const e = app.querySelector(`.txt[data-l="${x.lineIdx}"]`); if (e) { e.scrollIntoView({block:"center"}); e.classList.add("lf-target"); } }, 0);
    } else if (a === "lf-play" && x && x.recKey && !REC && S.recs[x.recKey]) {
      const index = recKeysOf(so).indexOf(x.recKey); if (index >= 0) { U.recPick = index; openPlayer(x.at); }
    } else if (a === "lf-undo" && lastUndo && lastUndo === undoStack[undoStack.length - 1]) {
      message = "直前の操作を取り消しました"; lastUndo = "";
      const b = document.createElement("button"); b.dataset.act = "undo"; b.hidden = true; document.body.appendChild(b); b.click(); b.remove();
    }
    return true;
  }
  document.addEventListener("input", (e) => {
    const m = U.menu; if (!m || !m.kind.startsWith("lf-")) return;
    if (e.target.id === "lf-tag") m.tag = e.target.value;
    if (e.target.id === "lf-memo") m.memo = e.target.value;
    if (e.target.id === "lf-memo" || e.target.id === "lf-tag") { clearTimeout(draftTimer); draftTimer = setTimeout(rememberDraft, 500); }
    if (e.target.matches("[data-lf-pref]")) m.tags[Number(e.target.dataset.lfPref)] = e.target.value;
  });
  window.addEventListener("pagehide", () => { rememberDraft(); saveNow(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { rememberDraft(); saveNow(); } });
  return { bar, lineButton, sheet, handle, prior, pending };
})();
