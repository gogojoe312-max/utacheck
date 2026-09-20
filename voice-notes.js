/* 音声を指摘候補と原文メモにする。意味が曖昧な内容を無理に分類しない。 */
"use strict";
const NoteVoice = (() => {
  let active = null;
  const normalize = s => String(s || "").normalize("NFKC").replace(/\s/g, "").toLowerCase();
  const rules = [
    ["pHi", /(?:音程|ピッチ|音)が?高い|上ず(?:る|って)/],
    ["pLo", /(?:音程|ピッチ|音)が?低い|フラットして/],
    ["pWob", /(?:音程|ピッチ).{0,3}(?:不安定|揺れ)|音が揺れ/],
    ["fast", /速い|早い|走(?:る|って|り気味)/],
    ["slow", /遅い|もた(?:る|って|り気味)/],
    ["nuke", /抜け(?:る|た|て)/],
    ["flip", /裏返(?:る|った|り)/],
    ["diction", /滑舌|かつぜつ/],
    ["strong", /強く|強め/],
    ["weak", /弱く|弱め/],
    ["bright", /明るく|明るめ/],
    ["dark", /暗く|暗め/],
    ["long", /長く|伸ばして/],
    ["short", /短く|短め/],
    ["lyric", /^(?:歌詞|かし)$|歌詞.{0,6}(?:間違|違う|ミス|忘|注意)/],
    ["sing", /^歌う$|歌って(?:ください|ほしい)?/],
    ["good", /^(?:いい|良かった|よかった|良い)$/],
  ];
  function classify(text) {
    const found = new Set();
    for (const clause of String(text || "").split(/[、。，,.!！?？\n]+/)) {
      const part = normalize(clause);
      if (!part || /ない|ません|じゃなく|ではなく/.test(part)) continue;
      for (const [id, pattern] of rules) if (pattern.test(part)) found.add(id);
      for (const tag of TAGS) {
        if (tag.id === "lyric" || tag.id === "sing") continue;
        const label = normalize(tag.l).replace(/^◎/, "");
        if (part === label || (label.length >= 2 && part.includes(label))) found.add(tag.id);
      }
    }
    if (["pHi","pLo","pWob","pUn"].some(x => found.has(x))) found.delete("pitch");
    if (["fast","slow","long","short"].some(x => found.has(x))) found.delete("rhythm");
    return [...found].filter(id => TAGS.some(t => t.id === id));
  }
  const current = () => U.sheet?.voice && !VIEW() ? U.sheet : null;
  const field = () => document.getElementById("voice-text");
  function status(text) { const el = document.getElementById("voice-status"); if (el) el.textContent = text; }
  function refresh() {
    const sh = current(); if (!sh) return;
    const tags = classify(sh.voiceText);
    const chosen = tags.filter(id => !(sh.voiceOmit || []).includes(id));
    const list = document.getElementById("voice-tags");
    if (list) list.innerHTML = tags.length ? tags.map(id => `<button data-act="voice-tag" data-id="${id}" aria-pressed="${chosen.includes(id)}">${h(tagName(id))}</button>`).join("")
      : '<span>メモとして保存</span>';
    const saveButton = document.getElementById("voice-save");
    if (saveButton) saveButton.disabled = !String(sh.voiceText || "").trim();
    const mic = document.getElementById("voice-mic");
    if (mic) { mic.textContent = active ? "認識を止める" : "話す"; mic.setAttribute("aria-pressed", String(!!active)); }
  }
  function stop() {
    const a = active; active = null;
    if (a) { clearTimeout(a.timer); a.rec.onresult = a.rec.onerror = a.rec.onend = null; try { a.rec.abort(); } catch (_) {} }
    refresh();
  }
  function start() {
    const sh = current(); if (!sh) return;
    if (active) { const rec = active.rec; try { rec.stop(); } catch (_) { stop(); } return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { status("キーボードのマイクで入力できます。"); field()?.focus(); return; }
    if ((typeof REC !== "undefined" && REC) || (typeof PT !== "undefined" && PT.rec)) {
      status("録音中です。入力欄から指摘を入力できます。"); return;
    }
    try {
      const rec = new Recognition();
      rec.lang = "ja-JP"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      const a = {rec, sh, prefix:String(sh.voiceText || "").trim(), timer:0}; active = a;
      rec.onresult = e => {
        if (active !== a || current() !== sh) return;
        const transcript = Array.from(e.results).map(result => result[0]?.transcript || "").join("");
        sh.voiceText = [a.prefix, transcript].filter(Boolean).join("\n");
        const input = field(); if (input) input.value = sh.voiceText;
        refresh();
      };
      rec.onerror = e => {
        if (active !== a) return;
        stop();
        status(e.error === "no-speech" ? "声を聞き取れませんでした。もう一度話すか、入力してください。"
          : "音声認識を使えません。キーボードのマイクでも入力できます。");
      };
      rec.onend = () => { if (active === a) { active = null; clearTimeout(a.timer); status(sh.voiceText ? "内容を確認して保存してください。" : "話すか、入力してください。"); refresh(); } };
      rec.start();
      a.timer = setTimeout(() => { if (active === a) { stop(); status("認識を終了しました。内容を確認してください。"); } }, 15000);
      status("聞き取り中…"); refresh();
    } catch (_) { stop(); status("音声認識を開始できません。入力欄をお使いください。"); }
  }
  function render(sh, contextText) {
    overlay = document.createElement("div"); overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="cancel" aria-label="指摘画面を閉じる"></button><section class="sheet voice-sheet" role="dialog" aria-modal="true" aria-label="音声で指摘">
      <header><button data-act="note-voice-back">‹ 戻る</button><h2>音声で指摘</h2></header>
      <p class="voice-context">${h(contextText)}</p>
      <textarea id="voice-text" class="field" rows="3" aria-label="話した指摘" placeholder="滑舌をはっきり、語尾が抜ける など">${h(sh.voiceText || "")}</textarea>
      <div id="voice-tags" class="voice-tags" aria-label="指摘候補"></div>
      <p id="voice-status" role="status">話すか、キーボードのマイクで入力してください。</p>
      <p class="voice-service">音声認識にはブラウザーのサービスを使います。</p>
      <footer><button id="voice-mic" data-act="voice-start">話す</button><button id="voice-save" data-act="voice-save" class="rec-primary">保存</button><button data-act="cancel" aria-label="指摘画面を閉じる">閉じる</button></footer>
    </section>`;
    document.body.appendChild(overlay); refresh();
  }
  document.addEventListener("input", e => {
    if (e.target.id !== "voice-text" || !current()) return;
    stop(); const sh = current(); sh.voiceText = e.target.value; sh.voiceOmit = []; refresh();
  });
  document.addEventListener("click", e => {
    const b = e.target.closest?.("[data-act]"), sh = current(); if (!b || !sh) return;
    if (b.dataset.act === "voice-start") start();
    if (b.dataset.act === "voice-tag") {
      const id = b.dataset.id; if (!classify(sh.voiceText).includes(id)) return;
      sh.voiceOmit = (sh.voiceOmit || []).includes(id) ? sh.voiceOmit.filter(x => x !== id) : [...sh.voiceOmit || [], id]; refresh();
    }
    if (b.dataset.act === "voice-save") {
      const text = String(field()?.value ?? sh.voiceText ?? "").trim(); if (!text) return;
      stop(); sh.tags = classify(text).filter(id => !(sh.voiceOmit || []).includes(id));
      sh.memo = [sh.memo, text].filter(Boolean).join("\n"); scheduleCommit();
    }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  window.addEventListener("pagehide", stop);
  return {render, start, stop, classify};
})();
