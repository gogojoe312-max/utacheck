/* 歌チェック → Pro Tools 連動  v2.0
   app.js の後ろに置く。app.js 本体には手を入れない。

   送り方は2つ。
     ブリッジ … iPhone でもMacでも使える。Mac側で ptbridge.js を走らせる。
     MIDI    … Mac の Chrome / Edge のみ。iOSは全ブラウザがWebKit製なので使えない。
   既定は「自動」で、Web MIDI が無ければブリッジに落ちる。
*/
(function () {
  "use strict";

  var PT_VER = 2;
  var PT_APPVER = "4.4";

  /* 区切り名は Pro Tools のマーカー名と同一。送るのはこの配列の位置(index)で、
     名前からロケーション番号への解決は SoundFlow 側がやる。
     番号を持たないので、曲が変わっても設定は要らない。 */
  var SECTIONS = ["RH","1A","1B","1C","2A","2B","2C","T","TRap","2ARap","D","DRap","3C","3C'","Inter","Outro"];

  var midi = null, midiErr = "";
  var lastSent = "", lastSentAt = 0, lastErr = "";
  var panel = null, pill = null, bar = null;
  var resetArm = false;
  var lastRecMode = null;

  /* ---------------- 設定 ---------------- */
  function cfg() {
    if (typeof S === "undefined" || !S) return null;
    var p = S.pt;
    if (!p || typeof p !== "object") p = S.pt = { ver: PT_VER };
    /* 移行：足りないものを足すだけ。既存の値は消さない */
    /* 旧版の map / pre は使わなくなった。消さずに残す（巻き戻せるように） */
    if (typeof p.on !== "boolean") p.on = false;
    if (["auto", "direct", "gist", "bridge", "midi"].indexOf(p.mode) < 0) p.mode = "auto";
    if (typeof p.gistId !== "string") p.gistId = "";
    if (!(p.seq >= 0)) p.seq = 0;
    if (typeof p.url !== "string") p.url = "";
    if (typeof p.token !== "string") p.token = "";
    if (typeof p.portName !== "string") p.portName = "";
    if (!(p.ch >= 1 && p.ch <= 16)) p.ch = 1;
    if (!(p.ccSec >= 0 && p.ccSec <= 127)) p.ccSec = 20;
    if (!(p.ccTake >= 0 && p.ccTake <= 127)) p.ccTake = 21;
    p.pill = true;   /* 隠せると PWA で戻せなくなるので、常に出す */
    if (typeof p.bar !== "boolean") p.bar = false;
    /* Pro Tools がいま表示していると思われるプレイリストの番号（1始まり） */
    if (!(p.plCur >= 0 && p.plCur <= 32)) p.plCur = 1;
    if (typeof p.autoSync !== "boolean") p.autoSync = true;
    if (!(p.plMax >= 1 && p.plMax <= 32)) p.plMax = 10;
    p.ver = PT_VER;
    return p;
  }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function store() { try { if (typeof save === "function") save(); } catch (e) { /* 保存できなくても操作は続ける */ } }

  /* ---------------- いま録っているところ ---------------- */
  function liveSlot() {
    try {
      var sl = (S.plan && S.plan.slots) || [];
      for (var i = 0; i < sl.length; i++) if (sl[i].a0 != null && sl[i].a1 == null) return sl[i];
    } catch (e) { /* 進行表がまだ無い */ }
    return null;
  }
  function curSec() { var s = liveSlot(); return (s && s.secCur) || ""; }
  var REH = "RH";   /* リハーサル。テイク0（プレイリストの無印）で録る */

  function curTake() {
    var s = liveSlot();
    if (!s || !s.secCur) return 1;
    var v = (s.takes || {})[s.secCur];
    if (v == null) return s.secCur === REH ? 0 : 1;   /* 未設定なら RH は 0、他は 1 */
    return Math.max(0, Number(v));
  }
  function secIndex(name) { return SECTIONS.indexOf(name); }

  /* 区切り名を14bitの数値にする。CC番号と値に分けて1メッセージで運べる。
     SoundFlow はメッセージごとに状態を保持できないため、必ず1発で送りきる。 */
  function secHash(name) {
    var x = 0;
    for (var i = 0; i < name.length; i++) x = (x * 131 + name.charCodeAt(i)) % 8192;
    return x;
  }

  /* app.js の SECDEF を正準リストに揃える。const でも中身の差し替えは効く。
     歌詞データは区切り名を文字列で持っているので壊れない。 */
  function alignSecdef() {
    if (typeof SECDEF === "undefined" || !Array.isArray(SECDEF)) return false;
    var same = SECDEF.length === SECTIONS.length &&
      SECDEF.every(function (v, i) { return v === SECTIONS[i]; });
    if (same) return true;
    try {
      SECDEF.length = 0;
      SECTIONS.forEach(function (x) { SECDEF.push(x); });
      return true;
    } catch (e) { return false; }
  }


  /* ---------------- 送り口：MIDI ---------------- */
  function midiUsable() { return !!navigator.requestMIDIAccess; }
  function connectMidi() {
    if (midi) return Promise.resolve(midi);
    if (!midiUsable()) {
      midiErr = "このブラウザは Web MIDI に対応していません。iPhone / iPad は全ブラウザが対象外なので、ブリッジを使ってください。";
      return Promise.resolve(null);
    }
    return navigator.requestMIDIAccess({ sysex: false }).then(function (a) {
      midi = a; midiErr = ""; a.onstatechange = paint; return a;
    }).catch(function () {
      midiErr = "MIDI の使用が許可されませんでした。アドレスバー左の設定から許可してください。";
      return null;
    });
  }
  function midiPorts() {
    if (!midi) return [];
    var out = []; midi.outputs.forEach(function (p) { out.push(p); }); return out;
  }
  function midiPort() {
    var list = midiPorts(); if (!list.length) return null;
    var want = (cfg() || {}).portName || "";
    return list.filter(function (p) { return p.name === want; })[0]
      || list.filter(function (p) { return /IAC|loopMIDI|SoundFlow/i.test(p.name); })[0]
      || list[0];
  }
  function midiSend(num, take) {
    var p = cfg(), out = midiPort();
    if (!out) return Promise.reject(new Error("MIDIポートがありません"));
    var ch = (p.ch - 1) & 0x0F;
    out.send([0xB0 | ch, p.ccSec, Math.max(0, Math.min(127, num))]);
    out.send([0xB0 | ch, p.ccTake, Math.max(0, Math.min(127, take))]);
    return Promise.resolve();
  }

  /* ---------------- 送り口：ブリッジ ---------------- */
  function bridgeSend(payload) {
    var p = cfg();
    var url = String(p.url || "").replace(/\/+$/, "");
    if (!url) return Promise.reject(new Error("ブリッジのアドレスが空です"));
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 5000);
    return fetch(url + "/cmd", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-PT-Token": p.token || "" },
      body: JSON.stringify(payload),
      signal: ctl.signal,
      cache: "no-store",
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "返事が読めません（HTTP " + r.status + "）" }; });
    }).then(function (j) {
      if (!j.ok) throw new Error(j.error || "失敗しました");
      return j;
    }).catch(function (e) {
      if (e.name === "AbortError") throw new Error("返事がありません。Macでブリッジが動いているか確認してください。");
      if (e instanceof TypeError) throw new Error("繋がりません。アドレスが https か、Macと同じ経路にいるか確認してください。");
      throw e;
    }).finally(function () { clearTimeout(timer); });
  }

  /* ---------------- 送り口：直結（WebRTC） ----------------
     Mac の Chrome で受け側ページを開いておくと、そこと直接繋がる。
     最初の顔合わせだけ Gist を使い、繋がった後はクラウドを通らない。 */
  var rtc = null, chan = null, rtcState = "off", rtcAnswerTimer = null, pingAt = 0, rtcRtt = null;

  function rtcReady() { return chan && chan.readyState === "open"; }

  function rtcSend(obj) {
    if (!rtcReady()) return Promise.reject(new Error("Mac と繋がっていません"));
    chan.send(JSON.stringify(obj));
    return Promise.resolve();
  }

  function rtcStop() {
    clearTimeout(rtcAnswerTimer);
    if (rtc) { try { rtc.close(); } catch (e) { /* すでに閉じている */ } }
    rtc = null; chan = null; rtcState = "off"; rtcRtt = null;
  }

  function rtcConnect() {
    var p = cfg();
    if (!p.gistId) return Promise.reject(new Error("先に Gist を作ってください"));
    if (!S.ghToken) return Promise.reject(new Error("先に自動公開のトークンを入れてください"));
    rtcStop();
    rtcState = "connecting"; paint();

    rtc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    chan = rtc.createDataChannel("pt", { ordered: true });
    chan.onopen = function () { rtcState = "on"; lastErr = ""; flash("Mac と繋がりました"); paint(); rtcPing(); };
    chan.onclose = function () { rtcState = "off"; paint(); };
    chan.onmessage = function (e) {
      try {
        var m = JSON.parse(e.data);
        if (m.t === "pong" && m.at === pingAt) { rtcRtt = Date.now() - pingAt; paint(); }
      } catch (err) { /* 壊れた返事は捨てる */ }
    };
    rtc.onconnectionstatechange = function () {
      if (rtc && (rtc.connectionState === "failed" || rtc.connectionState === "disconnected")) {
        rtcState = "off"; paint();
      }
    };

    return rtc.createOffer()
      .then(function (o) { return rtc.setLocalDescription(o); })
      .then(function () {
        /* ICE を集めきってから一度だけ送る。やりとりが1往復で済む */
        return new Promise(function (res) {
          if (rtc.iceGatheringState === "complete") return res();
          var t = setTimeout(res, 3000);
          rtc.onicegatheringstatechange = function () {
            if (rtc && rtc.iceGatheringState === "complete") { clearTimeout(t); res(); }
          };
        });
      })
      .then(function () { return gistWrite({ offer: rtc.localDescription.sdp, answer: null }); })
      .then(function () { return waitAnswer(0); });
  }

  function waitAnswer(tries) {
    var p = cfg();
    if (!rtc || rtcState !== "connecting") return Promise.resolve();
    if (tries > 20) { rtcStop(); paint(); throw new Error("Mac から応答がありません。受け側ページが開いているか確認してください。"); }
    return new Promise(function (res) { rtcAnswerTimer = setTimeout(res, 1200); })
      .then(function () {
        return fetch("https://api.github.com/gists/" + p.gistId, {
          headers: { "Authorization": "Bearer " + S.ghToken, "Accept": "application/vnd.github+json" },
          cache: "no-store",
        });
      })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var f = j.files && j.files[GFILE];
        var body = f && f.content ? JSON.parse(f.content) : null;
        if (body && body.answer && rtc && !rtc.currentRemoteDescription) {
          return rtc.setRemoteDescription({ type: "answer", sdp: body.answer });
        }
        return waitAnswer(tries + 1);
      });
  }

  function rtcPing() {
    if (!rtcReady()) return;
    pingAt = Date.now();
    try { chan.send(JSON.stringify({ t: "ping", at: pingAt })); } catch (e) { /* 測れなくても支障なし */ }
  }

  /* ---------------- 送り口：Gist ----------------
     状態をGistに書くだけ。読みに来るのは Mac 側の SoundFlow。
     Mac に常駐させるものが無いので、外のスタジオでも使える。 */
  var GFILE = "utacheck-pt.json";

  function gistWrite(extra) {
    var p = cfg();
    if (!p.gistId) return Promise.reject(new Error("Gist がまだありません。設定画面で作ってください。"));
    if (!S.ghToken) return Promise.reject(new Error("先に自動公開のトークンを入れてください。"));
    var sec = curSec();
    p.seq = (p.seq || 0) + 1;
    var body = Object.assign({
      seq: p.seq,
      sec: sec,
      loc: sec ? secIndex(sec) : -1,
      take: curTake(),
      sections: SECTIONS,
      plMax: p.plMax,
      at: Date.now(),
    }, extra || {});
    var files = {};
    files[GFILE] = { content: JSON.stringify(body) };
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 8000);
    return fetch("https://api.github.com/gists/" + p.gistId, {
      method: "PATCH",
      headers: {
        "Authorization": "Bearer " + S.ghToken,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ files: files }),
      signal: ctl.signal,
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
        throw new Error("Gist に書けません（" + r.status + "）" + (j.message ? "：" + j.message : ""));
      });
      store();
      return body;
    }).catch(function (e) {
      if (e.name === "AbortError") throw new Error("Gist が重いです。電波を確認してください。");
      throw e;
    }).finally(function () { clearTimeout(timer); });
  }

  function gistCreate() {
    if (!S.ghToken) return Promise.reject(new Error("先に自動公開のトークンを入れてください。"));
    var files = {};
    files[GFILE] = { content: JSON.stringify({ seq: 0, at: Date.now() }) };
    return fetch("https://api.github.com/gists", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + S.ghToken,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description: "歌チェック → Pro Tools", public: false, files: files }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.id) throw new Error("作れませんでした" + (j.message ? "：" + j.message : ""));
      cfg().gistId = j.id; store();
      return j.id;
    });
  }

  /* ---------------- 送る ---------------- */
  function mode() {
    var p = cfg();
    return "direct";
    /* 直結のみ使う */
    if (p.mode !== "auto") return p.mode;
    if (p.gistId) return "direct";
    return midiUsable() ? "midi" : "gist";
  }
  function ok(msg) { lastErr = ""; flash(msg); paint(); }
  function ng(e) { lastErr = String(e.message || e); flash(lastErr); paint(); }

  function sendLocate(force, loud) {
    var p = cfg();
    if (!p) return Promise.resolve();
    if (!recMode()) return Promise.resolve();
    if (!p.on) { if (loud) flash("連動がオフです"); return Promise.resolve(); }
    var sec = curSec();
    if (!sec) { if (loud) flash("進行中の曲がありません"); return Promise.resolve(); }
    var num = secIndex(sec);   /* 旧経路（MIDI直送）用。無くても送る */
    if (mode() === "direct" && !rtcReady()) { if (loud) flash("Mac と繋がっていません"); return Promise.resolve(); }
    /* 初めて選んだ区切りには既定のテイクを入れておく。RH は 0、他は 1。 */
    var ls = liveSlot();
    if (ls) {
      if (!ls.takes) ls.takes = {};
      if (ls.takes[sec] == null) {
        ls.takes[sec] = (sec === REH ? 0 : 1);
        store();
        if (typeof render === "function") { try { render(); } catch (e) { /* 描画失敗は無視 */ } }
      }
    }
    var take = curTake(), sig = sec + "#" + take;
    /* クリック検知と save() フックの両方から呼ばれるので、
       同じ区切りへの連続した送信は 800ms 以内なら捨てる。 */
    var now = Date.now();
    if (sig === lastSent && now - (lastSentAt || 0) < 800) return Promise.resolve();
    if (!force && sig === lastSent) return Promise.resolve();
    lastSent = sig; lastSentAt = now;

    var md = mode();
    var run = md === "midi"
      ? connectMidi().then(function () { return midiSend(num, take); })
      : md === "direct" && rtcReady()
        ? rtcSend({ t: "locate", n: num, take: take, sec: sec, hash: secHash(sec) })
        : (md === "direct" || md === "gist")
          ? gistWrite(null)
          : bridgeSend({ type: "locate", n: num, take: take });

    return run.then(function () {
      ok(sec + " → " + num);
      if (p.autoSync && md === "bridge") return syncPlaylist(take);
      /* ロケートだけ送る。プレイリストは録音時に合わせるので、ここでは動かさない。
         2つ続けて送ると SoundFlow が二重に起動してトラック移動が重なる。 */
      p.plCur = Math.max(0, Math.min(p.plMax, take)); store();
    }).catch(function (e) { lastSent = ""; ng(e); });
  }

  /* Pro Tools のプレイリストを、いまのテイク番号に合わせる。
     Shift+↑/↓ は相対移動しかできないので、こちらで現在位置を覚えて差分だけ送る。 */
  function syncPlaylist(target) {
    var p = cfg();
    var n = Math.max(0, Math.min(p.plMax, Math.round(Number(target) || 0)));
    var delta = n - p.plCur;
    if (!delta) return Promise.resolve({ moved: 0 });
    return bridgeSend({ type: "playlist", delta: delta }).then(function (r) {
      p.plCur = n; store(); paint();
      return r;
    });
  }

  function transport(kind) {
    var p = cfg(); if (!p) return;
    var md = mode();
    if (md === "midi") { flash("再生・録音は Gist かブリッジで動きます"); return; }

    if (md === "direct" && rtcReady()) {
      /* 1操作＝1メッセージにする。録音中に別の指示が割り込むと音が途切れるため、
         プレイリスト合わせもテイク送りもここでは送らない。 */
      return rtcSend({ t: "cmd", c: kind })
        .then(function () { ok({ play: "再生", stop: "停止", record: "録音", ok: "OKトラックへ" }[kind] || kind); })
        .catch(ng);
    }

    if (md === "gist" || md === "direct") {
      /* 単発の指示としてGistに載せる。プレイリスト合わせは見張り役がやる */
      return gistWrite({ cmd: kind })
        .then(function () { ok({ play: "再生", stop: "停止", record: "録音 テイク" + curTake() }[kind] || kind); })
        .catch(ng);
    }

    if (kind === "record") {
      var t = curTake();
      return syncPlaylist(t)
        .then(function () { return bridgeSend({ type: "record" }); })
        .then(function () { ok("録音 テイク" + t); setTimeout(function(){ takeStep(1); }, 400); })
        .catch(ng);
    }
    bridgeSend({ type: kind })
      .then(function () { ok({ play: "再生", stop: "停止" }[kind] || kind); })
      .catch(ng);
  }

  /* テイクを1つ進める。アプリ側の数字とPro Tools側のプレイリストを同時に動かす */
  function takeStep(dir) {
    var p = cfg(), s = liveSlot();
    if (!s || !s.secCur) { flash("進行中の曲がありません"); return; }
    if (!s.takes) s.takes = {};
    var now = curTake();
    var next = Math.max(1, Math.min(p.plMax, now + dir));
    if (next === now) { flash(dir > 0 ? "テイクの上限です" : "テイク1です"); return; }
    s.takes[s.secCur] = next;
    store();
    if (typeof render === "function") { try { render(); } catch (e) { /* 描画は失敗しても値は入っている */ } }
    var md = mode();
    if (!p.on) { paint(); flash("テイク" + next); return; }
    if (p.autoSync && md === "bridge") syncPlaylist(next).catch(ng);
    else if (md === "direct" && rtcReady()) {
      var d = next - p.plCur;
      if (d) rtcSend({ t: "pl", d: d });
      p.plCur = next; store(); ok("テイク" + next);
    }
    else if (md === "gist" || md === "direct") gistWrite(null).then(function () { p.plCur = next; store(); ok("テイク" + next); }).catch(ng);
    else { paint(); flash("テイク" + next); }
  }

  /* 区切りが変わったら送る。save() を包んで拾う */
  function hookSave() {
    if (typeof save !== "function" || save.__pt) return;
    var orig = save;
    var w = function () {
      var r = orig.apply(this, arguments);
      try { paint(); } catch (e) { /* 描画の失敗で保存を壊さない */ }
      try { sendLocate(false); } catch (e) { /* 送信の失敗で保存を壊さない */ }
      return r;
    };
    w.__pt = true;
    try { window.save = w; } catch (e) { /* 差し替えられない環境 */ }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest('[data-act="jumpsec"]');
    if (b) setTimeout(function () { sendLocate(true, true); }, 0);
  }, true);

  /* ---------------- 見た目 ---------------- */
  var CSS = ''
    + '#ptpill{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:9998;'
    + 'height:26px;padding:0 10px;border-radius:999px;background:var(--panel2,#1B1E25);color:var(--dim,#79808B);'
    + 'font-size:11px;font-weight:700;letter-spacing:.04em;display:flex;align-items:center;gap:6px;'
    + 'border:1px solid var(--line,#242830);opacity:.9}'
    + '#ptpill .dot{width:7px;height:7px;border-radius:50%;background:currentColor}'
    + '#ptpill.on{color:var(--good,#5BC98A)}#ptpill.err{color:var(--bad,#FF5C42)}'
    + '#ptbar{position:fixed;left:0;right:0;bottom:0;z-index:9998;display:flex;gap:6px;'
    + 'padding:6px 8px calc(6px + env(safe-area-inset-bottom));box-sizing:border-box;'
    + 'background:rgba(7,8,10,.92);border-top:1px solid var(--line,#242830);'
    + '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}'
    + '#ptbar button{flex:1;height:56px;border-radius:12px;background:var(--panel2,#1B1E25);'
    + 'border:1px solid var(--line,#242830);color:var(--text,#EAE6DE);font-size:22px;'
    + 'display:flex;align-items:center;justify-content:center}'
    + '#ptbar button.rec{color:var(--bad,#FF5C42);font-size:30px;flex:1.4}'
    + '#ptbar button.tk{flex:.7;font-size:20px;color:var(--dim,#79808B)}'
    + '#ptbar button.ok{flex:1;font-size:18px;font-weight:700;color:var(--good,#5BC98A)}'
    + '#ptbar button:active{background:var(--accent,#F0B23C);color:#0A0A0A}'
    + '#ptwrap{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.62);display:flex;align-items:flex-end;justify-content:center}'
    + '#ptbox{width:100%;max-width:520px;max-height:90vh;overflow:auto;background:var(--panel,#13151A);'
    + 'border-radius:16px 16px 0 0;border-top:1px solid var(--line,#242830);padding:16px 16px calc(22px + env(safe-area-inset-bottom))}'
    + '#ptbox h3{font-size:15px;font-weight:700}'
    + '#ptbox .sub{font-size:11px;color:var(--dim,#79808B);margin-bottom:14px}'
    + '#ptbox .grp{margin-bottom:16px}'
    + '#ptbox .lbl{font-size:11px;color:var(--dim,#79808B);margin-bottom:6px;font-weight:700}'
    + '#ptbox .fld{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}'
    + '#ptbox input,#ptbox select{background:var(--panel2,#1B1E25);border:1px solid var(--line,#242830);'
    + 'border-radius:9px;padding:9px 10px;font-size:13px;color:var(--text,#EAE6DE);min-width:0}'
    + '#ptbox input:focus-visible,#ptbox select:focus-visible,#ptbox button:focus-visible{outline:2px solid var(--accent,#F0B23C);outline-offset:2px}'
    + '#ptbox .btn{border-radius:9px;padding:9px 14px;font-size:13px;font-weight:700;background:var(--panel2,#1B1E25);color:var(--text,#EAE6DE)}'
    + '#ptbox .btn.acc{background:var(--accent,#F0B23C);color:#0A0A0A}'
    + '#ptbox .btn.warn{color:var(--bad,#FF5C42)}'
    + '#ptbox .seg{display:flex;border:1px solid var(--line,#242830);border-radius:9px;overflow:hidden}'
    + '#ptbox .seg button{padding:8px 12px;font-size:12px;font-weight:700;color:var(--dim,#79808B);background:transparent}'
    + '#ptbox .seg button.on{background:var(--accent,#F0B23C);color:#0A0A0A}'
    + '#ptbox .maprow{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line,#242830)}'
    + '#ptbox .maprow b{flex:0 0 68px;font-size:13px;font-weight:600}'
    + '#ptbox .maprow input{width:66px;text-align:center;font-variant-numeric:tabular-nums}'
    + '#ptbox .maprow span{font-size:10px;color:var(--dim,#79808B)}'
    + '#ptbox .empty{padding:14px;border:1px dashed var(--line,#242830);border-radius:10px;font-size:12px;color:var(--dim,#79808B);line-height:1.7}'
    + '#ptbox .note{font-size:11px;color:var(--dim,#79808B);line-height:1.7}'
    + '#ptbox .bad{color:var(--bad,#FF5C42)}'
    + '#pttoast{position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:10000;max-width:88vw;'
    + 'background:var(--accent,#F0B23C);color:#0A0A0A;font-size:12px;font-weight:700;padding:8px 14px;'
    + 'border-radius:999px;pointer-events:none;transition:opacity .25s;text-align:center}'
    + '@media (prefers-reduced-motion:reduce){#pttoast{transition:none}}'
    /* 操作バーがアプリの下端を隠さないよう、実測した高さぶん下げる */
    + 'body.ptbar-on #app{bottom:var(--ptbar-h,68px)!important}'
    + 'body.ptbar-on .bottom{padding-bottom:6px}'
    + '#ptpill{bottom:calc(var(--ptbar-h,68px) + 8px)}';

  function injectCSS() {
    if (document.getElementById("ptcss")) return;
    var s = document.createElement("style"); s.id = "ptcss"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var toastT = null;
  function flash(msg) {
    var el = document.getElementById("pttoast");
    if (!el) { el = document.createElement("div"); el.id = "pttoast"; document.body.appendChild(el); }
    el.textContent = msg; el.style.opacity = "1";
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.style.opacity = "0"; }, 1600);
  }

  function status() {
    var p = cfg();
    if (!p) return { cls: "", txt: "PT —" };
    if (!p.on) return { cls: "", txt: "PT 切" };
    if (lastErr) return { cls: "err", txt: "PT 不通" };
    if (mode() === "midi") {
      if (midiErr) return { cls: "err", txt: "PT 不可" };
      var o = midiPort();
      return o ? { cls: "on", txt: "PT " + o.name.slice(0, 10) } : { cls: "err", txt: "PT 未接続" };
    }
    if (mode() === "direct") {
      if (rtcState === "on") return { cls: "on", txt: "PT 直結" + (rtcRtt != null ? " " + rtcRtt + "ms" : "") };
      if (rtcState === "connecting") return { cls: "", txt: "PT 接続中" };
      return p.gistId ? { cls: "err", txt: "PT 未接続" } : { cls: "err", txt: "PT 未設定" };
    }
    if (mode() === "gist") return p.gistId ? { cls: "on", txt: "PT Gist" } : { cls: "err", txt: "PT 未設定" };
    return p.url ? { cls: "on", txt: "PT ブリッジ" } : { cls: "err", txt: "PT 未設定" };
  }

  /* Pro Tools 連動はレコーディング専用。ライブモードでは一切出さない。 */
  function recMode() {
    try { return !!S.recMode; } catch (e) { return false; }
  }

  function paint() {
    var p = cfg(); if (!p) return;
    if (!recMode()) {
      if (pill) pill.style.display = "none";
      if (bar) bar.style.display = "none";
      document.body.classList.remove("ptbar-on");
      document.documentElement.style.removeProperty("--ptbar-h");
      if (panel) panel.style.display = "none";
      return;
    }
    if (!pill) {
      pill = document.createElement("button");
      pill.id = "ptpill";
      pill.innerHTML = '<span class="dot"></span><span class="tx"></span>';
      pill.addEventListener("click", open);
      document.body.appendChild(pill);
    }
    var st = status();
    pill.className = st.cls;
    pill.querySelector(".tx").textContent = st.txt;
    pill.style.display = p.pill ? "flex" : "none";
    pill.setAttribute("aria-label", "Pro Tools 連動の設定を開く（" + st.txt + "）");

    if (!bar) {
      bar = document.createElement("div");
      bar.id = "ptbar";
      bar.innerHTML =
        '<button data-k="stop" aria-label="停止">■</button>'
        + '<button data-k="play" aria-label="再生">▶</button>'
        + '<button data-k="record" class="rec" aria-label="録音">●</button>'
        + '<button data-k="ok" class="ok" aria-label="OKトラックへ送る">OK</button>';
      bar.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        transport(b.dataset.k);
      });
      document.body.appendChild(bar);
    }
    var showBar = (p.on && p.bar && mode() !== "midi");
    bar.style.display = showBar ? "flex" : "none";
    document.body.classList.toggle("ptbar-on", showBar);
    if (showBar) {
      /* 実際に描かれた高さを測る。端末のセーフエリアぶんも込みになる */
      requestAnimationFrame(function () {
        var h = bar.offsetHeight;
        if (h) document.documentElement.style.setProperty("--ptbar-h", h + "px");
      });
    } else {
      document.documentElement.style.removeProperty("--ptbar-h");
    }

    if (panel && panel.style.display !== "none") drawPanel();
  }

  function open() {
    if (!recMode()) return;
    injectCSS(); resetArm = false;
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "ptwrap";
      panel.innerHTML = '<div id="ptbox"></div>';
      panel.addEventListener("click", function (e) { if (e.target === panel) close(); });
      document.body.appendChild(panel);
    }
    panel.style.display = "flex";
    if (mode() === "midi") connectMidi().then(paint);
    drawPanel();
  }
  function close() { if (panel) panel.style.display = "none"; resetArm = false; }

  function drawPanel() {
    var p = cfg(); if (!p || !panel) return;
    var box = panel.querySelector("#ptbox");
    var md = mode();

    /* 送り口ごとの中身。実際に見つかったポート／入れてあるアドレスを出す */
    var wayHtml;
    if (md === "midi") {
      var list = midiPorts(), sel = midiPort();
      if (midiErr) wayHtml = '<div class="empty bad">' + esc(midiErr) + '</div>';
      else if (!list.length) wayHtml = '<div class="empty">送り先の MIDI ポートがありません。<br>'
        + 'Mac：Audio MIDI 設定 → ウインドウ → MIDI スタジオを表示 → IAC ドライバ → 「装置はオンライン」にチェック。<br>'
        + '作ったらこの画面を開き直してください。</div>';
      else wayHtml = '<div class="fld"><select id="ptport" style="flex:1">'
        + list.map(function (o) { return '<option' + (sel && o.name === sel.name ? " selected" : "") + '>' + esc(o.name) + '</option>'; }).join("")
        + '</select></div>'
        + '<div class="fld"><span class="note">ch</span><input id="ptch" type="number" min="1" max="16" style="width:62px" value="' + p.ch + '">'
        + '<span class="note">区切りCC</span><input id="ptccs" type="number" min="0" max="127" style="width:68px" value="' + p.ccSec + '">'
        + '<span class="note">テイクCC</span><input id="ptcct" type="number" min="0" max="127" style="width:68px" value="' + p.ccTake + '"></div>';
    } else if (md === "direct") {
      wayHtml = '<div class="fld"><input id="ptgid" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" '
        + 'style="flex:1 1 100%" placeholder="Gist ID（もう一方の端末に出ているもの）" value="' + esc(p.gistId) + '" aria-label="Gist ID"></div>'
        + (p.gistId ? '' : '<div class="empty">まだ Gist がありません。片方の端末で作り、出てきた ID をもう一方に貼ってください。</div>'
          + '<div class="fld"><button class="btn acc" id="ptgnew">この端末で作る</button></div>')
        + '<div class="fld">'
        + '<button class="btn ' + (rtcState === "on" ? "" : "acc") + '" id="ptrtc">'
        + (rtcState === "on" ? "繋ぎ直す" : rtcState === "connecting" ? "接続中…" : "Mac に繋ぐ") + '</button>'
        + (rtcState === "on" ? '<button class="btn" id="ptping">往復時間を測る</button>' : '')
        + '</div>'
        + '<div class="note">Mac の Chrome で <b>ptmac.html</b> を開き、同じ Gist ID とトークンを入れて「待ち受けを始める」を押しておいてください。'
        + (rtcRtt != null ? '<br>いまの往復時間：<b>' + rtcRtt + 'ms</b>' : '') + '</div>';
    } else if (md === "gist") {
      wayHtml = p.gistId
        ? '<div class="fld"><input id="ptgid" type="text" style="flex:1 1 100%" value="' + esc(p.gistId) + '" readonly aria-label="Gist ID"></div>'
          + '<div class="note">この ID と、自動公開のトークンを SoundFlow の見張りスクリプトに貼ってください。'
          + 'Mac 側に常駐させるものはありません。外のスタジオでも SoundFlow にサインインすれば動きます。</div>'
        : '<div class="empty">まだ Gist がありません。下のボタンで作ります。'
          + '（歌チェックの自動公開トークンをそのまま使うので、追加の登録は要りません）</div>'
          + '<div class="fld"><button class="btn acc" id="ptgnew">Gist を作る</button></div>';
    } else {
      wayHtml = '<div class="fld"><input id="pturl" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" '
        + 'style="flex:1 1 100%" placeholder="https://mac.xxxx.ts.net" value="' + esc(p.url) + '"></div>'
        + '<div class="fld"><input id="pttok" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" '
        + 'style="flex:1 1 100%" placeholder="合言葉（ptbridge-token.txt の中身）" value="' + esc(p.token) + '"></div>'
        + (p.url ? '' : '<div class="empty">Macで <b>node ptbridge.js</b> を動かし、<b>tailscale serve --bg 8765</b> で https のアドレスを出してください。'
          + 'そのアドレスと、画面に出る合言葉をここに入れます。</div>');
    }

    var sec = curSec();
    var nowTxt = sec
      ? esc(sec) + "（テイク " + curTake() + " / プレイリスト .0" + p.plCur + "）"
        + (secIndex(sec) >= 0 ? " → Pro Tools の「" + esc(sec) + "」へ" : " → この区切りは送りません")
      : "進行中の曲がありません。録音モードで曲を始めると、選んだ区切りをここに出します。";

    box.innerHTML =
      '<h3>Pro Tools 連動</h3>'
      + '<div class="sub">区切りを選ぶと Pro Tools が飛びます　v' + PT_APPVER + '</div>'

      + '<div class="grp"><div class="fld">'
      + '<button class="btn ' + (p.on ? "acc" : "") + '" id="pton">' + (p.on ? "オン" : "オフ") + '</button>'
      + '<button class="btn" id="pttest">いまの区切りを送る</button>'
      + '</div><div class="note">' + nowTxt + '</div>'
      + (lastErr ? '<div class="note bad" style="margin-top:6px">' + esc(lastErr) + '</div>' : '')
      + '</div>'


      + '<div class="grp"><div class="lbl">' + (md === "midi" ? "MIDI の送り先" : "ブリッジ") + '</div>' + wayHtml + '</div>'


      + (md !== "midi" ? '<div class="grp"><div class="lbl">テイク同期</div>'
        + '<div class="fld">'
        + '<button class="btn ' + (p.autoSync ? "acc" : "") + '" id="ptsync">' + (p.autoSync ? "オン" : "オフ") + '</button>'
        + '<span class="note">Pro Tools の表示中プレイリスト</span>'
        + '<input id="ptplcur" type="number" inputmode="numeric" min="1" max="' + p.plMax + '" style="width:66px;text-align:center" value="' + p.plCur + '">'
        + '</div>'
        + '<div class="fld"><span class="note">プレイリストの用意枚数</span>'
        + '<input id="ptplmax" type="number" inputmode="numeric" min="1" max="32" style="width:66px;text-align:center" value="' + p.plMax + '">'
        + '<button class="btn" id="ptplfix">テイク' + curTake() + 'に合わせ直す</button></div>'
        + '<div class="note">区切りを選んだ時と録音する時に、プレイリストをテイク番号へ合わせます。'
        + 'Pro Tools 側で手動でプレイリストを動かした後は、上の数字を実際の表示に直すか「合わせ直す」を押してください。</div></div>' : '')

      + '<div class="grp"><div class="lbl">表示</div><div class="fld">'
      + '<button class="btn" id="ptbart">操作ボタンを' + (p.bar ? "隠す" : "出す") + '</button>'
      + '</div><div class="note">操作ボタンは画面下部に出ます。右端の「設定」からいつでもここに戻れます。</div></div>'

      + '<div class="grp"><div class="fld">'
      + '<button class="btn" id="ptclose" style="flex:1">閉じる</button>'
      + '</div></div>';

    /* --- 操作 --- */
    box.querySelector("#pton").onclick = function () {
      p.on = !p.on; store();
      if (p.on && mode() === "midi") connectMidi().then(paint); else paint();
      drawPanel();
    };
    box.querySelector("#pttest").onclick = function () { sendLocate(true, true); };
    box.querySelector("#ptclose").onclick = close;
    box.querySelector("#ptbart").onclick = function () { p.bar = !p.bar; store(); paint(); drawPanel(); };
    Array.prototype.forEach.call(box.querySelectorAll("[data-mode]"), function (b) {
      b.onclick = function () {
        p.mode = b.dataset.mode; lastErr = ""; store();
        if (mode() === "midi") connectMidi().then(paint); else paint();
        drawPanel();
      };
    });

    var u = box.querySelector("#pturl");
    if (u) u.onchange = function () { p.url = u.value.trim(); lastErr = ""; store(); paint(); };
    var t = box.querySelector("#pttok");
    if (t) t.onchange = function () { p.token = t.value.trim(); lastErr = ""; store(); paint(); };
    var gn = box.querySelector("#ptgnew");
    if (gn) gn.onclick = function () {
      gn.disabled = true; gn.textContent = "作っています…";
      gistCreate().then(function () { flash("Gist を作りました"); drawPanel(); paint(); })
        .catch(function (e) { ng(e); drawPanel(); });
    };
    var rb = box.querySelector("#ptrtc");
    if (rb) rb.onclick = function () {
      rb.disabled = true;
      rtcConnect().then(function () { drawPanel(); }).catch(function (e) { ng(e); drawPanel(); });
    };
    var pb = box.querySelector("#ptping");
    if (pb) pb.onclick = function () { rtcPing(); setTimeout(drawPanel, 400); };

    var gi = box.querySelector("#ptgid");
    if (gi) {
      gi.onfocus = function () { gi.select(); };
      gi.onchange = function () {
        p.gistId = gi.value.trim(); lastErr = ""; rtcStop(); store(); paint(); drawPanel();
      };
    }

    var ps = box.querySelector("#ptport");
    if (ps) ps.onchange = function () { p.portName = ps.value; store(); paint(); };

    var sy = box.querySelector("#ptsync");
    if (sy) sy.onclick = function () { p.autoSync = !p.autoSync; store(); drawPanel(); paint(); };
    bindNum(box.querySelector("#ptplcur"), 1, p.plMax, function (v) { p.plCur = v; });
    bindNum(box.querySelector("#ptplmax"), 1, 32, function (v) {
      p.plMax = v; if (p.plCur > v) p.plCur = v;
    });
    var fx = box.querySelector("#ptplfix");
    if (fx) fx.onclick = function () {
      /* Pro Tools は動かさず、アプリ側の認識だけを合わせる */
      p.plCur = curTake(); store(); drawPanel(); paint(); flash("認識を .0" + p.plCur + " に直しました");
    };

    bindNum(box.querySelector("#ptch"), 1, 16, function (v) { p.ch = v; });
    bindNum(box.querySelector("#ptccs"), 0, 127, function (v) { p.ccSec = v; });
    bindNum(box.querySelector("#ptcct"), 0, 127, function (v) { p.ccTake = v; });

  }

  function bindNum(el, lo, hi, set) {
    if (!el) return;
    el.onchange = function () {
      var v = Math.max(lo, Math.min(hi, Math.round(Number(el.value) || lo)));
      el.value = v; set(v); store(); paint();
    };
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------- 起動 ---------------- */
  function boot() {
    if (typeof S === "undefined") { setTimeout(boot, 400); return; }
    injectCSS(); alignSecdef(); hookSave();
    var p = cfg();
    if (p && p.on && mode() === "midi") connectMidi().then(paint); else paint();
    if (location.hash === "#ptlink") open();
  }
  window.addEventListener("hashchange", function () { if (location.hash === "#ptlink") open(); });

  /* レコーディング／ライブの切り替えは save() を伴わないことがあるので、
     モードが変わった時だけ描画し直す。 */
  setInterval(function () {
    var now = recMode();
    if (now !== lastRecMode) { lastRecMode = now; try { paint(); } catch (e) { /* 無視 */ } }
  }, 700);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 600); });
  else setTimeout(boot, 600);

  window.PTLink = { open: open, locate: function () { return sendLocate(true); }, transport: transport, cfg: cfg };
})();
