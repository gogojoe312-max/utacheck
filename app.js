/* 歌チェック — ライブ本番用 歌割チェックアプリ (offline PWA) */
"use strict";

const KEY = "utacheck.v1";
const APP_VER = "2026-08-03-41";
const uid = () => Math.random().toString(36).slice(2, 9);
const h = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TAGS = [
  { c: "音程",    id: "pitch",  l: "音程"       },
  { c: "音程",    id: "pHi",    l: "音程高"     },
  { c: "音程",    id: "pLo",    l: "音程低"     },

  { c: "タイミング", id: "rhythm", l: "リズム"   },
  { c: "タイミング", id: "fast",   l: "速い"     },
  { c: "タイミング", id: "slow",   l: "遅い"     },
  { c: "タイミング", id: "long",   l: "長い"     },
  { c: "タイミング", id: "short",  l: "短い"     },

  { c: "出音",    id: "attack", l: "アタック"   },
  { c: "出音",    id: "accent", l: "アクセント" },
  { c: "出音",    id: "diction",l: "滑舌"       },

  { c: "表情",    id: "strong", l: "強い"       },
  { c: "表情",    id: "weak",   l: "弱い"       },
  { c: "表情",    id: "nuance", l: "ニュアンス" },
  { c: "表情",    id: "dark",   l: "暗い"       },
  { c: "表情",    id: "bright", l: "明るい"     },
  { c: "表情",    id: "face",   l: "顔"         },

  { c: "ミス",    id: "flip",   l: "裏返り"     },
  { c: "ミス",    id: "nuke",   l: "抜けた"     },
  { c: "ミス",    id: "lyric",  l: "歌詞"       },
  { c: "ミス",    id: "mic",    l: "マイク"     },

  { c: "良い",    id: "good",   l: "◎良い"     },
];
const CATCOL = {
  "音程": "#FF6B4A", "タイミング": "#F0B23C", "出音": "#3FC7C0",
  "表情": "#A98BFF", "ミス": "#FF3B6B", "良い": "#5BC98A",
};
const catOf = (id) => (TAGS.find((t) => t.id === id) || {}).c || "";
const noteColor = (n) => {
  if (n.tags.includes("good")) return CATCOL["良い"];
  const c = (n.tags || []).map(catOf).find(Boolean);
  return CATCOL[c] || "var(--bad)";
};
// 上=高い/速い/強い/明るい、下=低い/遅い/弱い/暗い で統一
const SWIPES = [
  { id: "pitch",  up: "pHi",    dn: "pLo" },
  { id: "rhythm", up: "fast",   dn: "slow",   lf: "short",  rt: "long" },
  { id: "attack", up: "strong", dn: "weak",   lf: "accent", rt: "diction" },
  { id: "nuance", up: "bright", dn: "dark",   lf: "face" },
  { id: "lyric",  up: "flip",   dn: "nuke",   lf: "mic" },
  { id: "good" },
];
const TAGCATS = TAGS.reduce((a, t) => {
  if (!a.length || a[a.length - 1].c !== t.c) a.push({ c: t.c, items: [] });
  a[a.length - 1].items.push(t);
  return a;
}, []);
// 以前つけた記録が生IDで出ないように
const LEGACY = { breath: "ブレス", volume: "声量", tone: "声色" };
const tagName = (id) => (TAGS.find((t) => t.id === id) || {}).l || LEGACY[id] || id;

/* ---------------- state ---------------- */
let S = {
  members: [], songs: [], notes: [],
  shows: [], showId: "",
  src: "", setlistVer: 0,
  deviceId: "", pubNotes: [], pubBy: "",
  ghToken: "", autoPub: true,
  groups: [], groupId: "",
  src: "", key: "", keyInLink: true,
  memos: {}, recs: {}, kbps: 128, preroll: 5, viewer: false, srcGroup: "",
  draws: {},
  size: 19,
};
let U = { view: "live", songIdx: 0, sheet: null, mode: "member", allShows: false, picker: false, overview: false, ovSize: 9, draw: false, erase: false, pick: [], busy: "", incoming: null, allShowList: false };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) S = Object.assign(S, JSON.parse(raw));
  } catch (e) { /* 初回 */ }
  // 旧データの引き継ぎ：公演名の文字列しか無かったものを公演として作り直す
  if (!S.shows || !S.shows.length) {
    const id = uid();
    S.shows = [{ id, name: S.show || todayLabel(), ts: Date.now() }];
    S.notes.forEach((n) => { if (!n.showId) n.showId = id; });
  }
  if (!S.shows.some((x) => x.id === S.showId)) S.showId = S.shows[0].id;
  if (!S.deviceId) S.deviceId = uid() + uid();
  if (!S.memos) S.memos = {};
  if (!S.recs) S.recs = {};
  if (!S.draws) S.draws = {};
  if (!S.kbps) S.kbps = 128;
  if (S.preroll == null) S.preroll = 5;
  // 旧データの引き継ぎ：グループが無ければ1つ作り、既存の曲と配信設定を移す
  if (!S.groups || !S.groups.length) {
    const gid = uid();
    S.groups = [{ id: gid, name: "グループ1", gistId: S.gistId || "", src: S.src || "", key: S.key || "", keyInLink: S.keyInLink !== false }];
    S.groupId = gid;
    S.songs.forEach((x) => { if (!x.groupId) x.groupId = gid; });
    if (S.gistId) { S.src = ""; S.key = ""; }
    delete S.gistId;
  }
  if (!S.groups.some((g) => g.id === S.groupId)) S.groupId = S.groups[0].id;
  S.songs.forEach((x) => { if (!x.groupId) x.groupId = S.groupId; });
  // 曲は公演ごとに持つ。旧データは今の公演に入れる。
  S.songs.forEach((x) => { if (!x.showId) x.showId = S.showId; });
  // 「全（データ）」等が人名として登録されてしまった分を掃除し、全員扱いに直す
  const zen = S.members.filter((m) => /^全/.test(m.name));
  if (zen.length) {
    const zids = zen.map((m) => m.id);
    S.members = S.members.filter((m) => !/^全/.test(m.name));
    const all = S.members.map((m) => m.id);
    S.songs.forEach((sg) => sg.lines.forEach((l) => {
      if (l.parts && l.parts.some((x) => zids.includes(x))) l.parts = all.slice();
    }));
    const strip = (n) => { n.memberIds = (n.memberIds || []).filter((x) => !zids.includes(x)); };
    S.notes.forEach(strip);
    (S.pubNotes || []).forEach(strip);
  }
  if (!Array.isArray(S.pubNotes)) S.pubNotes = [];
  delete S.show;
}
function todayLabel() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()} 公演`;
}
// 接続リンクから開いた端末は閲覧専用。配信元（Gistを持つ端末）は編集できる。
const VIEW = () => !!S.viewer && !S.groups.some((g) => g.gistId);
const group = (id) => S.groups.find((g) => g.id === (id || S.groupId)) || S.groups[0] || {};
const groupOfSong = (sid) => (S.songs.find((x) => x.id === sid) || {}).groupId;
const showsNewestFirst = () => S.shows.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
const showName = (id) => (S.shows.find((x) => x.id === (id || S.showId)) || {}).name || "";
const NOTES = () => S.notes.concat(S.pubNotes);
const covers = (n, i) => i >= n.lineIdx && i <= (n.lineEnd != null ? n.lineEnd : n.lineIdx);
// 同じ曲の同じ行に、過去の公演でも指摘があったか
function pastHits(songId, lineIdx) {
  const me = S.songs.find((x) => x.id === songId);
  if (!me) return { count: 0, notes: [] };
  const cur = S.shows.find((x) => x.id === S.showId) || { ts: 0 };
  const older = new Set(S.shows.filter((x) => (x.ts || 0) < (cur.ts || 0)).map((x) => x.id));
  const anc = ancestorsOf(me);
  // 同じ公演の中で複製した元、または前の公演の同じ曲
  const ids = S.songs.filter((x) => x.id !== me.id &&
    (anc.includes(x.id) || (x.title === me.title && x.groupId === me.groupId && older.has(x.showId)))
  ).map((x) => x.id);
  const ns = NOTES().filter((n) => ids.includes(n.songId) && n.lineIdx === lineIdx && !n.tags.includes("good"));
  return { count: [...new Set(ns.map((n) => n.songId))].length, notes: ns };
}
const memoKey = (songId) => S.showId + "|" + songId;
const songMemo = (songId) => (S.memos || {})[memoKey(songId)] || "";
const shownNotes = () => (U.allShows ? NOTES() : NOTES().filter((n) => n.showId === S.showId));
let pushTimer = null, pushState = "";
let undoStack = [];
function pushUndo() {
  undoStack.push(JSON.stringify(S.notes));
  if (undoStack.length > 40) undoStack.shift();
}
let saveErr = false;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); saveErr = false; }
  catch (e) { saveErr = true; }
}

const SONGS = () => S.songs.filter((x) => x.showId === S.showId);
const songName = (x) => x ? (x.title + ((x.take || 1) > 1 ? `　テイク${x.take}` : "")) : "";
function ancestorsOf(so) {
  const out = []; let cur = so;
  while (cur && cur.from) {
    const p = S.songs.find((x) => x.id === cur.from);
    if (!p || out.includes(p.id)) break;
    out.push(p.id); cur = p;
  }
  return out;
}
// 前の回：同じ公演で複製した元 → なければ前の公演の同じ曲
function prevSongOf(so) {
  if (!so) return null;
  if (so.from) { const p = S.songs.find((x) => x.id === so.from); if (p) return p; }
  const pid = prevShowId();
  return pid ? S.songs.find((x) => x.showId === pid && x.title === so.title && x.groupId === so.groupId) : null;
}
// この曲をもう1回ぶん複製する（歌割りだけ引き継ぎ、記録は空）
const nextTake = (so) => so
  ? Math.max(...S.songs.filter((x) => x.showId === so.showId && x.title === so.title && x.groupId === so.groupId)
      .map((x) => x.take || 1)) + 1
  : 2;

// この公演の曲を曲名順に並べ替える（数字は数として扱う）
function sortSongsByTitle() {
  const cur = SONGS();
  if (cur.length < 2) return;
  const sorted = cur.slice().sort((a, b) =>
    a.title.localeCompare(b.title, "ja", { numeric: true }) || ((a.take || 1) - (b.take || 1)));
  const idxs = cur.map((x) => S.songs.indexOf(x)).sort((a, b) => a - b);
  idxs.forEach((pos, i) => { S.songs[pos] = sorted[i]; });
  save();
}

function dupSong(id) {
  if (VIEW()) return;
  const src = S.songs.find((x) => x.id === id) || song();
  if (!src) return;
  const same = S.songs.filter((x) => x.showId === src.showId && x.title === src.title && x.groupId === src.groupId);
  const take = Math.max(...same.map((x) => x.take || 1)) + 1;
  const copy = {
    id: uid(), showId: src.showId, groupId: src.groupId, title: src.title, credit: src.credit,
    take, from: src.id,
    lines: src.lines.map((l) => Object.assign({}, l, { parts: (l.parts || []).slice() })),
  };
  const at = S.songs.indexOf(same[same.length - 1]);
  S.songs.splice(at + 1, 0, copy);
  U.songIdx = SONGS().indexOf(copy);
  U.picker = false;
  save(); schedulePush(); render();
}
const song = () => { const a = SONGS(); return a[Math.min(U.songIdx, a.length - 1)] || null; };
const member = (id) => S.members.find((m) => m.id === id);
const names = (ids) => (ids || []).map((i) => (member(i) || {}).name).filter(Boolean).join("・");
const notesOf = (sid, li) => S.notes.filter((n) => n.songId === sid && n.lineIdx === li);

function addMember(name) {
  let m = S.members.find((x) => x.name === name);
  if (!m) { m = { id: uid(), name }; S.members.push(m); }
  return m;
}

/* ---------------- 歌割データ → 曲 ---------------- */
// rows: [[label, text], ...]  label "→" は上の行の続き、["",""] は段落の切れ目
function buildSong(parsed) {
  const groups = parsed.groups || {};
  (parsed.order || []).forEach(addMember);
  let carry = [];
  const lines = (parsed.lines || []).map((r) => {
    const label = (r[0] || "").trim(), t = (r[1] || "").trim();
    if (!label && !t) return { gap: true, label: "", t: "", parts: [] };
    if (label === "→") return { label: "", t, parts: carry.slice(), cont: true };
    let parts = [];
    if (/^全/.test(label)) parts = S.members.map((m) => m.id);
    else splitNames(label).forEach((k) => {
      if (groups[k]) groups[k].forEach((n) => parts.push(addMember(n).id));
      else parts.push(addMember(k).id);
    });
    parts = [...new Set(parts)];
    carry = parts;
    return { label, t, parts };
  });
  return { id: uid(), title: parsed.title || "無題", credit: parsed.credit || "", lines };
}

// 拡張子が二重についていても落とす
// 名前欄の区切りは「・」「、」「,」「/」「空白」いずれもあり得る
// 資料によって、部首だけの異体字・全角記号・変換できない文字が混ざる
function cleanText(t) {
  t = String(t == null ? "" : t);
  if (t.normalize) t = t.normalize("NFKC");           // ⼭→山、⼸→弓、全角→半角
  t = t.replace(/\(cid:\d+\)/g, "");                  // 対応表のない文字
  t = t.replace(/[\uFFFD\u0000-\u001F\uE000-\uF8FF]/g, " "); // 化けた文字・外字
  return t.replace(/\s+/g, " ").trim();
}

const NAMESEP = /[・、，,･\/／\s]+/;
// 括弧は、短ければ人名（(平)）、長ければ指示（(ウィスパー里)）とみなす
function stripParens(t) {
  return t.replace(/[（(]([^）)]*)[）)]/g, (m, inner) => (inner.trim().length <= 3 ? inner.trim() : ""));
}
function splitNames(label) {
  return label.split(NAMESEP)
    .map((t) => stripParens(t).trim())
    .filter((t) => t && t.length < 6); // 長いものは名前ではなく注記とみなす
}

const cleanName = (n) => String(n || "").replace(/(\.(pdf|xlsx|xlsm|xls|csv|json))+$/i, "").trim() || "無題";

/* ---------------- PDF 取り込み ---------------- */
async function parsePDF(file) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let title = "", credit = "", allRows = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vh = page.getViewport({ scale: 1 }).height;
    const tc = await page.getTextContent();
    const INK = /^[ー－—~〜√ノヽ丶'`|\\\/]$/; // 手書きの線が1文字として拾われることがある
    const items = tc.items
      .map((i) => ({ x: i.transform[4], top: vh - i.transform[5], s: cleanText(i.str) }))
      .filter((i) => i.s && !INK.test(i.s));
    const r = parsePage(items, p === 1, vh);
    if (p === 1) { title = r.title; credit = r.credit; }
    allRows = allRows.concat(r.rows);
  }
  // 曲名はファイル名。内題は歌詞から外すためだけに使う。
  const readable = allRows.filter((r) => r[1] && r[1].length >= 4).length;
  if (readable < 5) {
    const e = new Error("この資料からは文字を取り出せませんでした。フォントの都合でブラウザが読めない資料です。Excelで渡すか、変換を依頼してください。");
    e.unreadable = true;
    throw e;
  }
  return finalize(cleanName(file.name), [title, credit].filter(Boolean).join("　"), allRows);
}

function parsePage(items, isFirstPage, pageH) {
  if (!items.length) return { title: "", credit: "", rows: [] };
  // 行にまとめる
  const rowMap = new Map();
  items.forEach((i) => {
    const k = Math.round(i.top / 4);
    if (!rowMap.has(k)) rowMap.set(k, []);
    rowMap.get(k).push(i);
  });
  const rows = [...rowMap.entries()].map(([k, v]) => ({ top: Math.min(...v.map((i) => i.top)), items: v.sort((a, b) => a.x - b.x) }))
    .sort((a, b) => a.top - b.top);

  // 歌詞列の開始 x を推定（同じ x に何度も揃う位置）
  const hist = new Map();
  items.forEach((i) => { const k = Math.round(i.x / 3) * 3; hist.set(k, (hist.get(k) || 0) + 1); });
  // 名前は右揃え、歌詞は左揃えで並ぶ。近い候補はひとつの段とみなし、その中で最も右＝歌詞の開始位置を採る。
  const cand = [...hist.entries()].filter(([, c]) => c >= 4).sort((a, b) => a[0] - b[0]);
  const clusters = [];
  cand.forEach((e) => {
    const last = clusters[clusters.length - 1];
    if (last && e[0] - last[last.length - 1][0] < 100) last.push(e);
    else clusters.push([e]);
  });
  let lyricX = clusters.map((cl) => {
    const best = cl.reduce((a, b) => (b[1] > a[1] ? b : a));
    const right = cl[cl.length - 1];
    return right[1] >= best[1] / 3 ? right[0] : best[0];
  });
  if (!lyricX.length) lyricX.push(0);

  const colOf = (x) => {
    let best = 0, bd = Infinity;
    lyricX.forEach((lx, j) => { const d = Math.abs(x - lx); if (d < bd) { bd = d; best = j; } });
    return best;
  };

  // 各列ごとに 行 → {label, text}
  const per = lyricX.map(() => []);
  rows.forEach((row) => {
    const bucket = new Map();
    row.items.forEach((i) => {
      const c = colOf(i.x);
      if (!bucket.has(c)) bucket.set(c, []);
      bucket.get(c).push(i);
    });
    bucket.forEach((its, c) => {
      const lab = its.filter((i) => i.x < lyricX[c] - 6);
      const txt = its.filter((i) => i.x >= lyricX[c] - 6);
      per[c].push({
        top: row.top,
        label: lab.map((i) => i.s).join(" ").trim(),
        t: txt.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim(),
      });
    });
  });

  // ヘッダ（最初にラベルが出る行より上）
  const firstLabelTop = Math.min(...per.flat().filter((r) => r.label).map((r) => r.top), Infinity);
  const head = [];

  // 右端が名前ばかりの欄（コーラス指定など）は歌詞列ではない。近い行の名前に足す。
  if (per.length > 1) {
    let main = 0, best = -1;
    per.forEach((l, c) => {
      const v = l.reduce((a, r) => a + r.t.length, 0);
      if (v > best) { best = v; main = c; }
    });
    for (let c = per.length - 1; c >= 0; c--) {
      if (c === main) continue;
      const txts = per[c].filter((r) => r.t);
      if (txts.length < 3) continue;
      const nameish = txts.filter((r) => r.t.length <= 12 && NAMECELL.test(r.t)).length;
      if (nameish / txts.length < 0.75) continue;
      txts.forEach((r) => {
        if (!(r.t.length <= 12 && NAMECELL.test(r.t))) return; // 欄の見出しなどは捨てる
        let near = null, nd = Infinity;
        per[main].forEach((m) => { const d = Math.abs(m.top - r.top); if (d < nd) { nd = d; near = m; } });
        if (near && nd < 14) near.label = near.label ? near.label + "・" + r.t : r.t;
      });
      per.splice(c, 1);
      lyricX.splice(c, 1);
    }
  }

  // 曲名・作家名は紙の上でも下でも出る。作家名らしい行と、その隣の題名らしい行を外す
  const CREDIT2 = /作詞|作曲|編曲|訳詞|Words|Music|Arr/i;
  per.forEach((list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (!CREDIT2.test(list[i].label + " " + list[i].t)) continue;
      head.unshift((list[i].label + " " + list[i].t).trim());
      list.splice(i, 1);
      // 作家名の直前にある、名前の付いていない行（題名・副題）も外す
      let k = i - 1, took = 0;
      while (k >= 0 && took < 2 && !list[k].label && list[k].t
             && (/[／/]/.test(list[k].t) || took === 0 || list[k].t.length < 30)) {
        head.unshift(list[k].t); list.splice(k, 1); k--; took++; i--;
      }
    }
  });

  // 誤って歌詞を題名として抜かないよう、紙の上端にあり、かつ題名・クレジットらしい行だけを外す
  const CREDIT = /作詞|作曲|編曲|訳詞|Words|Music|Arr/i;
  if (isFirstPage) {
    const limit = (pageH || 842) * 0.16;
    per.forEach((list) => {
      for (let i = list.length - 1; i >= 0; i--) {
        if (head.length >= 2) break;
        const r = list[i];
        if (r.label || r.top >= firstLabelTop - 2 || r.top > limit) continue;
        const isTop = r.top < limit * 0.55;
        if (!isTop && !CREDIT.test(r.t)) continue;
        head.unshift(r.t); list.splice(i, 1);
      }
    });
  }

  // ラベルなしの行を、最も近いラベル行にぶら下げる
  const out = [];
  per.forEach((list) => {
    if (!list.length) return;
    const labeled = list.filter((r) => r.label);
    list.forEach((r) => {
      if (r.label) { r.owner = r; return; }
      let best = null, bd = Infinity;
      labeled.forEach((L) => { const d = Math.abs(L.top - r.top); if (d < bd) { bd = d; best = L; } });
      r.owner = bd <= 26 ? best : null;
    });
    // 段落の切れ目
    const gaps = [];
    for (let i = 1; i < list.length; i++) gaps.push(list[i].top - list[i - 1].top);
    const med = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 12;
    const seen = new Set();
    list.forEach((r, i) => {
      if (i > 0 && list[i].top - list[i - 1].top > med * 1.7) out.push(["", ""]);
      if (!r.t) return;
      if (r.owner && !seen.has(r.owner)) { seen.add(r.owner); out.push([r.owner.label, r.t]); }
      else out.push(["→", r.t]);
    });
    out.push(["", ""]);
  });

  return { title: head[0] || "", credit: head.slice(1).join(" "), rows: out };
}

/* ---------------- Excel 取り込み ---------------- */
// 社内の歌割は「名前・空白・歌詞」の3列を1組として、横に2〜3組並ぶ形。
// 列位置は資料ごとに違うので、中身から名前列と歌詞列を見分ける。
const NAMECELL = /^[^\s、,，・･\/／]{1,4}([\s、,，・･\/／]+[^\s、,，・･\/／]{1,4})*$/;
const looksName = (v) => !!v && v.length <= 12 && NAMECELL.test(v);

async function parseXLSX(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sh, { header: 1, blankrows: true, defval: "" })
    .map((r) => (r || []).map((v) => cleanText(String(v == null ? "" : v).replace(/\s*\n\s*/g, " "))));
  const w = grid.reduce((m, r) => Math.max(m, r.length), 0);
  grid.forEach((r) => { while (r.length < w) r.push(""); });

  const kind = [];
  for (let c = 0; c < w; c++) {
    const vals = grid.map((r) => r[c]).filter(Boolean);
    if (vals.length < 3) { kind.push("."); continue; }
    kind.push(vals.filter(looksName).length / vals.length >= 0.6 ? "N" : "L");
  }
  // 名前列の右隣（2列以内）にある歌詞列を組にする
  const blocks = [];
  for (let c = 0; c < w; c++) {
    if (kind[c] !== "N") continue;
    for (let d = c + 1; d < Math.min(c + 3, w); d++) if (kind[d] === "L") { blocks.push([c, d]); break; }
  }
  if (!blocks.length) {
    const L = kind.indexOf("L");
    if (L >= 0) blocks.push([Math.max(0, L - 2), L]);
  }

  const CREDIT = /作詞|作曲|編曲|訳詞|Words|Music|Arr/i;
  const head = [];
  const rows = [];
  blocks.forEach(([nc, lc]) => {
    grid.forEach((r) => {
      const nv = r[nc] || "", lv = r[lc] || "";
      if (!nv && !lv) {
        const last = rows[rows.length - 1];
        if (rows.length && (last[0] || last[1])) rows.push(["", ""]);
        return;
      }
      if (!nv && CREDIT.test(lv)) { head.push(lv); return; }
      if (!nv && !rows.length && /[／/]/.test(lv)) { head.unshift(lv); return; }
      rows.push([nv || "→", lv]);
    });
  });
  // 題名に「／」が無い資料では、クレジットの直前の行が題名
  if (rows.length && rows[0][0] === "→" && head.length === 1 && CREDIT.test(head[0])) {
    head.unshift(rows.shift()[1]);
  }
  return finalize(cleanName(file.name), head.join("　"), rows);
}

/* ---------------- A/B などのブロック定義を拾う ---------------- */
function finalize(title, credit, rows) {
  rows = rows.filter((r, i) => !(r[0] === "" && r[1] === "" && (i === 0 || (rows[i - 1][0] === "" && rows[i - 1][1] === ""))));
  while (rows.length && !rows[rows.length - 1][0] && !rows[rows.length - 1][1]) rows.pop();

  const labelNames = new Set();
  rows.forEach((r) => splitNames(r[0]).forEach((t) => labelNames.add(t)));

  // 「A ＝ 小野田・植村・島川・相馬」のようなブロック定義行を拾って、歌詞から外す
  const groups = {};
  rows = rows.filter((r) => {
    const toks = splitNames(r[1]);
    if (!r[0] || r[0] === "→" || r[0].length > 2 || toks.length < 2) return true;
    if (!toks.every((t) => t.length <= 5 && !/[。、！？「」ぁ-ん]{3,}/.test(t))) return true;
    const known = toks.filter((t) => labelNames.has(t)).length;
    if (known / toks.length < 0.5) return true;
    groups[r[0]] = toks;
    return false;
  });

  const order = [];
  Object.values(groups).forEach((g) => g.forEach((n) => order.includes(n) || order.push(n)));
  rows.forEach((r) => {
    if (/^全/.test(r[0]) || r[0] === "→") return;
    splitNames(r[0]).forEach((t) => {
      if (!groups[t] && !order.includes(t)) order.push(t);
    });
  });

  return { title: (title || "").trim() || "無題", credit: (credit || "").trim(), groups, order, lines: rows };
}

/* ---------------- ピアノ ---------------- */
// 正しい音を鳴らして、その音を指摘に添える
let AC = null;
const SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function freqOf(id) {
  const m = id.match(/^([A-G]#?)(\d)$/);
  if (!m) return 440;
  return 440 * Math.pow(2, ((SCALE.indexOf(m[1]) - 9) + (Number(m[2]) - 4) * 12) / 12);
}
// iPhoneの消音スイッチはWeb Audioを黙らせるが、音声ファイルの再生は黙らせない。
// そこで、押された音の波形をその場でWAVにして鳴らす。
const wavCache = new Map();
function toneURL(id) {
  if (wavCache.has(id)) return wavCache.get(id);
  const sr = 22050, dur = 1.35, n = Math.floor(sr * dur), f = freqOf(id);
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const W = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  W(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); W(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  W(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ph = (t * f) % 1;
    const tri = 4 * Math.abs(ph - 0.5) - 1;
    const env = Math.exp(-t * 2.4) * (t < 0.006 ? t / 0.006 : 1);
    let x = tri * env * 0.4;
    if (x > 1) x = 1; if (x < -1) x = -1;
    v.setInt16(44 + i * 2, x * 32767, true);
  }
  const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  if (wavCache.size > 40) { const k = wavCache.keys().next().value; URL.revokeObjectURL(wavCache.get(k)); wavCache.delete(k); }
  wavCache.set(id, url);
  return url;
}
const pianoPool = [];
let poolAt = 0;
function tone(id) {
  try {
    if (!pianoPool.length) for (let i = 0; i < 4; i++) { const a = new Audio(); a.preload = "auto"; pianoPool.push(a); }
    const a = pianoPool[poolAt = (poolAt + 1) % pianoPool.length];
    a.src = toneURL(id);
    a.currentTime = 0;
    const pr = a.play();
    if (pr && pr.catch) pr.catch(() => {});
  } catch (e) { /* 鳴らせない端末では無音 */ }
}

// 表示は音名だけ（オクターブの数字は出さない）
const pitchLabel = (p) => {
  if (!p) return "";
  const arr = Array.isArray(p) ? p : String(p).split("-");
  return arr.map((x) => String(x).replace(/\d+/g, "")).join("-");
};

function playSeq(arr, i) {
  if (!arr || !arr.length) return;
  i = i || 0;
  if (i >= arr.length) return;
  tone(arr[i]);
  if (i + 1 < arr.length) setTimeout(() => playSeq(arr, i + 1), 420);
}

function pianoHTML(sel) {
  const W = ["C", "D", "E", "F", "G", "A", "B"], B = ["C", "D", "F", "G", "A"];
  let white = "", black = "", i = 0;
  [3, 4, 5].forEach((o) => {
    W.forEach((n) => {
      const id = n + o;
      white += `<button class="wk${sel === id ? " on" : ""}" data-act="key" data-id="${id}">${n === "C" ? "C" : ""}</button>`;
      if (B.includes(n)) {
        const bid = n + "#" + o;
        black += `<button class="bk${sel === bid ? " on" : ""}" data-act="key" data-id="${bid}" style="left:${(i + 1) * 34 - 11}px"></button>`;
      }
      i++;
    });
  });
  return `<div class="pno" id="pno"><div class="pnoin" style="width:${i * 34}px">${white}${black}</div></div>`;
}

/* ---------------- 音声メモ（この端末の中だけ） ---------------- */
let DB = null;
function db() {
  return new Promise((res, rej) => {
    if (DB) return res(DB);
    if (!window.indexedDB) return rej(new Error("この端末では音声を保存できません。"));
    const r = indexedDB.open("utacheck", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("clips"); };
    r.onsuccess = () => { DB = r.result; res(DB); };
    r.onerror = () => rej(r.error);
  });
}
async function putClip(id, blob) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("clips", "readwrite");
    t.objectStore("clips").put(blob, id);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
async function getClip(id) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("clips", "readonly");
    const q = t.objectStore("clips").get(id);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
function delClip(id) { db().then((d) => d.transaction("clips", "readwrite").objectStore("clips").delete(id)).catch(() => {}); }

let REC = null, recChunks = [], recTick = null, recT0 = 0, recKey = "";
let AU = null, auKey = "", auTick = null;

const recKeyOf = (so) => S.showId + "|" + (so ? so.id : "");
const hasRec = (so) => !!(S.recs || {})[recKeyOf(so)];
const mmss = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
};

async function startRec() {
  if (VIEW()) return;
  const so = song();
  if (!so) return;
  if (hasRec(so) && !confirm("この曲の録音を録り直しますか？\n前の録音は消えます。")) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) { alert("この端末では録音できません。"); return; }
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    // エコー除去・ノイズ抑制・自動音量は通話用の加工で、歌が潰れる原因になる
    const st = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        channelCount: 2, sampleRate: 48000,
      },
    });
    const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
    const mt = types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    const opt = { audioBitsPerSecond: (S.kbps || 128) * 1000 };
    if (mt) opt.mimeType = mt;
    REC = new MediaRecorder(st, opt);
    recChunks = [];
    recKey = recKeyOf(so);
    REC.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    REC.onstop = async () => {
      st.getTracks().forEach((t) => t.stop());
      const blob = new Blob(recChunks, { type: (REC && REC.mimeType) || "audio/mp4" });
      const dur = (Date.now() - recT0) / 1000;
      clearInterval(recTick); REC = null; recChunks = [];
      if (blob.size) {
        try {
          await putClip(recKey, blob);
          S.recs[recKey] = { size: blob.size, dur, ts: Date.now() };
          save();
        } catch (e) { alert("保存できませんでした。端末の空き容量を確認してください。"); }
      }
      render();
    };
    REC.start(1000);
    recT0 = Date.now();
    recTick = setInterval(() => {
      const el = document.getElementById("rectime");
      if (el) el.textContent = "● " + mmss((Date.now() - recT0) / 1000);
    }, 500);
    render();
  } catch (e) {
    alert("マイクを使えませんでした。\niPhoneの設定 → Safari → マイク の許可を確認してください。");
  }
}
function stopRec() { if (REC && REC.state === "recording") REC.stop(); }
const recAt = () => (REC && REC.state === "recording" && recKey === recKeyOf(song())) ? (Date.now() - recT0) / 1000 : null;

async function openPlayer(seek) {
  const so = song(); if (!so) return;
  const key = recKeyOf(so);
  if (!S.recs[key]) { alert("この曲の録音がありません。"); return; }
  try {
    if (auKey !== key) {
      const b = await getClip(key);
      if (!b) { alert("録音が見つかりません。"); return; }
      if (AU) { AU.pause(); URL.revokeObjectURL(AU.src); }
      AU = new Audio(URL.createObjectURL(b));
      auKey = key;
      AU.onended = () => render();
      clearInterval(auTick);
      auTick = setInterval(() => {
        const el = document.getElementById("autime");
        const bar = document.getElementById("aubar");
        if (el && AU) el.textContent = mmss(AU.currentTime) + " / " + mmss(AU.duration || S.recs[key].dur);
        if (bar && AU && AU.duration) bar.value = String(Math.round((AU.currentTime / AU.duration) * 1000));
      }, 250);
    }
    if (seek != null) AU.currentTime = Math.max(0, seek - (S.preroll || 5));
    AU.play();
    render();
  } catch (e) { alert("再生できませんでした。"); }
}
function pauseAudio() { if (AU) AU.pause(); render(); }
function seekAudio(v) {
  if (!AU || !AU.duration) return;
  AU.currentTime = (Number(v) / 1000) * AU.duration;
}
async function delRec(key) {
  delClip(key); delete S.recs[key];
  if (auKey === key) { if (AU) AU.pause(); AU = null; auKey = ""; clearInterval(auTick); }
  save(); render();
}

/* ---------------- render ---------------- */
const app = document.getElementById("app");
let overlay = null;

function render() {
  const keep = app.querySelector(".scroll");
  const st = keep ? keep.scrollTop : 0;
  const sig = U.view + U.songIdx + U.mode + U.allShows + U.overview;
  const sameView = app.dataset.view === sig;
  app.dataset.view = sig;

  if (U.view === "print") app.innerHTML = viewPrint();
  else if (U.view === "live") app.innerHTML = viewLive();
  else if (U.view === "summary") app.innerHTML = viewSummary();
  else app.innerHTML = viewSetup();

  const sc = app.querySelector(".scroll");
  if (sc && sameView) sc.scrollTop = st;
  renderSheet();
  if (U.view === "live" && !U.overview) setTimeout(paintInk, 0);
}

/* ---- live ---- */
// 何行にまたがる歌割かを求める。1行目に名前、続きは括弧で束ねる。
function groupPos(lines) {
  const pos = lines.map(() => "single");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].gap || lines[i].cont) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].cont && !lines[j].gap) j++;
    const n = j - i;
    if (n > 1) {
      pos[i] = "first";
      for (let k = i + 1; k < j - 1; k++) pos[k] = "mid";
      pos[j - 1] = "last";
    }
    i = j - 1;
  }
  return pos;
}

function markStyle(n) {
  const c = noteColor(n);
  return `border-bottom-color:${c};background:color-mix(in srgb,${c} 22%,transparent)`;
}

function viewLive() {
  const s = song();
  if (U.overview && s) return viewOverview(s);

  let body = "";
  if (!s) {
    body = `<div style="padding:40px 26px;color:var(--dim);line-height:2;font-size:14px">
      <div style="font-size:17px;color:var(--text);font-weight:600;margin-bottom:14px">はじめに</div>
      セットリストは自動で届きます。まだ何も無い場合は、電波のある所で
      設定の「最新のセットリストを取得」を押してください。<br><br>
      並んだら、気になった所を<b>横になぞる</b>と、その範囲だけを指摘できます。
      タグを押すとその場で記録され、自動で戻ります。<br><br>
      チェックが配信されている場合は、歌詞に色と印が付いた状態で届きます。
      「集計」を開けば、自分の名前で絞って見られます。電波が無くても動きます。
      </div>`;
  } else {
    const ns0 = NOTES().filter((n) => n.songId === s.id && n.showId === S.showId);
    const gp = groupPos(s.lines);
    body = s.lines.map((l, i) => {
      if (l.gap) return `<div class="gap"></div>`;
      const ns = ns0.filter((n) => covers(n, i));
      const chars = Array.from(l.t);
      const badge = (n) => {
        const c = noteColor(n);
        const txt = n.tags.length ? n.tags.map(tagName).join("/") : (n.memo ? "メモ" : "・");
        return `<b class="mk" style="background:${c}">${h(txt)}${n.pitch ? " " + h(pitchLabel(n.pitch)) : ""}</b>`;
      };
      let cells = chars.map((ch, ci) => {
        const mk = ns.find((n) => n.from != null && ci >= n.from && ci <= n.to);
        const st = mk ? markStyle(mk) : "border-bottom-color:transparent";
        const tail = ns.filter((n) => n.from != null && n.to === ci).map(badge).join("");
        return `<span data-c="${ci}" style="${st}">${ch === " " ? "&nbsp;" : h(ch)}</span>${tail}`;
      }).join("");
      cells += ns.filter((n) => n.from == null && n.lineIdx === i).map(badge).join("");
      const past = pastHits(s.id, i);
      if (past.count) {
        const t = [...new Set(past.notes.flatMap((n) => n.tags))].map(tagName).slice(0, 2).join("/");
        cells += `<b class="mk pastmk">前${past.count} ${h(t)}</b>`;
      }
      const pills = ns.filter((n) => n.lineIdx === i && (n.memo || (n.at != null && hasRec(s)))).map((n) => `
        ${n.at != null && hasRec(s) ? `<button class="tagpill" data-act="playfrom" data-id="${n.id}"
            style="color:var(--good)">🔊 ${mmss(n.at)}</button>` : ""}
        ${n.memo ? `<button class="tagpill" data-act="note" data-i="${i}" style="color:var(--dim)">${n.from != null ? `「${h(chars.slice(n.from, n.to + 1).join(""))}」 ` : ""}${h(n.memo)}</button>` : ""}`).join("");
      const tint = ns.length ? noteColor(ns[0]) : "";
      return `<div class="ln" style="${tint ? `background:color-mix(in srgb,${tint} 9%,transparent)` : ""}">
        <button class="lbl" data-act="noteblock" data-i="${i}">${h(l.label)}</button>
        <div class="brk ${gp[i]}"></div>
        <div class="grow" style="min-width:0">
          <div class="txt" data-l="${i}" style="font-size:${S.size}px">${cells}</div>${pills}
        </div></div>`;
    }).join("");
  }

  return `
  <div class="hd">
    <button class="grow" style="text-align:left" data-act="picker">
      <div class="t1 trunc">${s ? `<b style="color:var(--accent)">${h((S.groups.find((x) => x.id === s.groupId) || {}).name || "")}</b> ・ ` : ""}${h(showName() || "公演名未設定")}${SONGS().length ? ` ・ ${U.songIdx + 1}/${SONGS().length}` : ""}${pushState ? ` ・ <span style="color:${pushState === "未送信" ? "var(--bad)" : "var(--dim)"}">${h(pushState)}</span>` : ""}</div>
      <div class="t2 trunc">${h(s ? songName(s) : "曲がありません")}</div>
    </button>
    <button class="ic" data-act="size">A</button>
  </div>
  ${saveErr ? `<div class="banner">保存できませんでした。端末の空き容量を確認してください。</div>` : ""}
  ${U.incoming ? `<div class="banner" style="background:var(--accent)">
      <span>${U.incoming.notes && U.incoming.notes.length
        ? `チェック済みのセットリスト（${U.incoming.songs.length}曲・${U.incoming.notes.length}件の指摘）が届いています`
        : `新しいセットリスト（${U.incoming.songs.length}曲）が届いています`}</span>
      <button data-act="takeincoming" style="font-weight:700;text-decoration:underline;margin-left:10px">入れ替える</button>
      <button data-act="dropincoming" style="margin-left:10px;opacity:.7">あとで</button>
    </div>` : ""}
  <div class="scroll" style="position:relative">
    <canvas id="ink" class="ink" style="pointer-events:${U.draw && !VIEW() ? "auto" : "none"};touch-action:${U.draw ? "none" : "auto"}"></canvas>
    ${body}
    ${s ? `<div class="card" style="margin:18px 12px 0">
      <h4 style="font-size:11px;color:var(--dim);margin-bottom:8px">総括</h4>
      ${VIEW()
        ? `<div style="font-size:13px;white-space:pre-wrap">${h(songMemo(s.id)) || "—"}</div>`
        : `<textarea class="field" id="songmemo" rows="4" style="resize:none">${h(songMemo(s.id))}</textarea>`}
    </div>` : ""}
    ${s && !VIEW() ? `<div class="pull" id="pull">
      <div class="pullbar"><i id="pullfill"></i></div>
      <div class="pulltx" id="pulltx">引き上げて テイク${nextTake(s)} を作る</div>
    </div>` : `<div style="height:120px"></div>`}</div>
  ${U.draw && !VIEW() ? `<div class="aubar">
    <button data-act="pen" class="aub" style="${U.erase ? "" : "background:var(--bad);color:#0A0A0A"}">✎</button>
    <button data-act="eraser" class="aub" style="${U.erase ? "background:var(--accent);color:#0A0A0A" : ""}">消</button>
    <span class="grow" style="font-size:11px;color:var(--dim)">なぞって書く。書いている間は画面が動きません</span>
    <button data-act="clearink" class="aub" style="font-size:12px;color:var(--dim)">全消</button>
  </div>` : ""}
  ${s && !VIEW() && !U.draw ? `<div class="aubar">
    ${REC
      ? `<button data-act="recstop" class="aub" style="background:var(--bad);color:#0A0A0A">■</button>
         <span class="grow" id="rectime" style="color:var(--bad);font-weight:600">● 0:00</span>
         <span style="font-size:11px;color:var(--dim)">録音中</span>`
      : hasRec(s)
        ? `<button data-act="${AU && !AU.paused ? "pauseau" : "playtop"}" class="aub">${AU && !AU.paused ? "❚❚" : "▶"}</button>
           <input id="aubar" type="range" min="0" max="1000" value="0" class="grow" data-act="seek">
           <span id="autime" style="font-size:11px;color:var(--dim);min-width:74px;text-align:right">0:00 / ${mmss(S.recs[recKeyOf(s)].dur)}</span>
           <button data-act="delrec" class="aub" style="font-size:13px;color:var(--dim)">✕</button>`
        : `<button data-act="recstart" class="aub" style="color:var(--bad)">●</button>
           <span class="grow" style="font-size:11px;color:var(--dim)">この曲を録音（リハの聴き返し用・端末内のみ）</span>`}
  </div>` : ""}
  <div class="bottom">
    <button data-act="prev" class="${U.songIdx <= 0 ? "off" : ""}">‹</button>
    <button data-act="next" class="${U.songIdx >= SONGS().length - 1 ? "off" : ""}">›</button>
    ${VIEW() ? "" : `<button data-act="draw" class="${U.draw ? "on" : ""}">${U.draw ? "✎中" : "✎"}</button>`}
    <button data-act="overview" class="wide">全体</button>
    ${undoStack.length && !VIEW() ? `<button data-act="undo" style="color:var(--accent)">取消</button>` : ""}
    <button data-act="go-summary">集計</button>
    <button data-act="go-setup">設定</button>
  </div>`;
}

/* ---- 全体表示（1曲まるごと見渡す）---- */
function viewOverview(s) {
  const ns0 = NOTES().filter((n) => n.songId === s.id && n.showId === S.showId);
  const gp = groupPos(s.lines);
  const rows = s.lines.map((l, i) => {
    if (l.gap) return `<div style="height:7px"></div>`;
    const ns = ns0.filter((n) => covers(n, i));
    const chars = Array.from(l.t);
    const cells = chars.map((ch, ci) => {
      const mk = ns.find((n) => n.from != null && ci >= n.from && ci <= n.to);
      return mk ? `<span style="${markStyle(mk)}">${ch === " " ? "&nbsp;" : h(ch)}</span>` : (ch === " " ? "&nbsp;" : h(ch));
    }).join("");
    const tail = ns.map((n) => {
      const c = noteColor(n);
      const txt = n.tags.length ? n.tags.map(tagName).join("/") : (n.memo ? "メモ" : "・");
      return `<b class="mk ovm" style="background:${c}">${h(txt)}${n.pitch ? " " + h(pitchLabel(n.pitch)) : ""}</b>`;
    }).join("");
    const past = pastHits(s.id, i);
    const pb = past.count ? `<b class="mk ovm pastmk">前${past.count}</b>` : "";
    return `<button class="ovl" data-act="jumpline" data-i="${i}">
      <span class="ovn">${h(l.label)}</span><span class="ovb ${gp[i]}"></span><span class="ovt">${cells}${tail}${pb}</span></button>`;
  }).join("");

  return `
  <div class="hd">
    <div class="grow"><div class="t1 trunc">${h(showName())} ・ 全体表示</div>
      <div class="t2 trunc">${h(songName(s))}</div></div>
    <button class="ic" data-act="ovsize">${U.ovSize}px</button>
  </div>
  <div class="scroll" style="padding:8px 10px"><div class="ovcols" style="font-size:${U.ovSize}px">${rows}</div>
    ${songMemo(s.id) ? `<div class="card" style="margin-top:12px">
      <h4 style="font-size:11px;color:var(--dim);margin-bottom:6px">総括</h4>
      <div style="font-size:13px;white-space:pre-wrap">${h(songMemo(s.id))}</div></div>` : ""}
    <div style="height:30px"></div></div>
  <div class="bottom">
    <button data-act="prev" class="${U.songIdx <= 0 ? "off" : ""}">‹</button>
    <button data-act="next" class="${U.songIdx >= SONGS().length - 1 ? "off" : ""}">›</button>
    <button data-act="overview" class="wide on">一覧に戻る</button>
    <button data-act="go-summary">集計</button>
  </div>`;
}

/* ---- sheet ---- */
function renderSheet() {
  if (overlay) { overlay.remove(); overlay = null; }

  if (U.picker) {
    const shows = showsNewestFirst().map((sw) => `<button class="chip sm" data-act="jumpshow" data-id="${sw.id}"
        style="${sw.id === S.showId ? "background:var(--accent);color:#0A0A0A" : ""}">${h(sw.name)}</button>`).join("");
    const list = SONGS().map((x, i) => {
      const gn = (S.groups.find((g) => g.id === x.groupId) || {}).name || "";
      const cnt = NOTES().filter((n) => n.songId === x.id && n.showId === S.showId).length;
      return `<button class="ghost" data-act="jump" data-i="${i}"
        style="text-align:left;margin-bottom:6px;${i === U.songIdx ? "background:var(--accent);color:#0A0A0A" : ""}">
        <span style="opacity:.6">${i + 1}.</span> ${h(songName(x))}
        <span style="font-size:11px;opacity:.7">　${h(gn)}${cnt ? " ・ " + cnt + "件" : ""}</span></button>`;
    }).join("") || `<p class="note">曲がありません</p>`;
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="close"></button><div class="sheet">
      <div class="row" style="margin-bottom:12px"><span class="grow" style="font-size:11px;color:var(--dim)">公演と曲を選ぶ</span>
      <button data-act="cancel" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button></div>
      <div class="sec"><h4>公演</h4><div class="chips">${shows}</div>
        ${VIEW() ? "" : `<button class="ghost" data-act="dupshow" style="margin-top:8px">今のセットリストを複製して新しい公演にする</button>`}

      </div>
      <div class="sec"><h4>曲</h4>${list}
        ${song() && !VIEW() ? `<button class="ghost" data-act="dupsong" data-id="${song().id}" style="margin-top:8px">
          テイク${nextTake(song())} を作る</button>
  ` : ""}
      </div></div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (!U.sheet) return;
  const s = song(); if (!s) return;
  const l = s.lines[U.sheet.lineIdx];
  const chars = Array.from(l.t);
  const sh = U.sheet;

  const rangeHtml = chars.map((ch, ci) => {
    const on = sh.range && ci >= sh.range[0] && ci <= sh.range[1];
    return `<span data-r="${ci}" style="${on ? "background:color-mix(in srgb,var(--accent) 30%,transparent);border-bottom-color:var(--bad)" : ""}">${ch === " " ? "&nbsp;" : h(ch)}</span>`;
  }).join("");
  const ex = NOTES().filter((n) => n.songId === s.id && n.showId === S.showId && covers(n, sh.lineIdx));

  const inner = `
    <div class="row" style="margin-bottom:12px">
      <span class="grow" style="font-size:11px;color:var(--dim)">${h(l.label || "続き")} · ${sh.lineEnd ? `${sh.lineIdx + 1}〜${sh.lineEnd + 1}行目（まとめて）` : `${sh.lineIdx + 1}行目`}</span>
      <button data-act="cancel" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button>
    </div>
    <div class="sec"><h4>${sh.lineEnd ? "この歌割り全体につきます" : "文字をタップすると一部だけ指定できます"}</h4>
      <div class="range">${rangeHtml}</div>
      ${sh.range ? `<button class="chip sm" data-act="rangeoff" style="margin-top:8px;color:var(--dim)">行全体に戻す</button>` : ""}
    </div>
    <div class="sec"><h4>何　${sh.tags.length ? `<b style="color:var(--accent)">${h(sh.tags.map(tagName).join("・"))}</b>` : "タップ、または上下左右になぞる"}</h4>
      <div class="tiles">
        ${SWIPES.map((sw) => {
          const col = CATCOL[catOf(sw.id)] || "var(--accent)";
          const on = sh.tags.includes(sw.id);
          const sub = (k) => sw[k] ? `<span class="t${k}">${tagName(sw[k])}</span>` : "";
          return `<div class="tile" data-swipe="${sw.id}"
            style="box-shadow:inset 0 0 0 1.5px ${col};${on ? `background:${col}` : ""}">
            ${sub("up")}${sub("lf")}
            <span class="tmid" style="${on ? "color:#0A0A0A" : `color:${col}`}">${tagName(sw.id)}</span>
            ${sub("rt")}${sub("dn")}
          </div>`;
        }).join("")}
      </div>
    </div>
    <div class="sec">
      <h4>正しい音（任意）　${sh.rec ? "録音中。押した音が順に入ります" : "押すと鳴るだけ。残したい時は録音を押す"}</h4>
      <div class="row" style="margin-bottom:8px">
        <button class="chip sm" id="recbtn" data-act="rec"
          style="${sh.rec ? "background:var(--bad);color:#0A0A0A;border-color:var(--bad)" : ""}">${sh.rec ? "● 録音中" : "● 録音"}</button>
        <span class="grow" id="seqtxt" style="font-size:15px;font-weight:600;color:var(--accent)">${h(pitchLabel(sh.seq))}</span>
        <button class="chip sm" id="seqplay" data-act="playseq" style="${sh.seq.length ? "" : "display:none"}">▶</button>
        <button class="chip sm" id="seqclr" data-act="clearseq" style="color:var(--dim);${sh.seq.length ? "" : "display:none"}">消す</button>
      </div>
      ${pianoHTML(sh.rec ? sh.seq[sh.seq.length - 1] : null)}
    </div>
    <div class="sec"><h4>メモ（任意）</h4>
      <input class="field" id="memo" placeholder="語尾が落ちる / 出が半拍遅い など" value="${h(sh.memo)}"></div>
    ${ex.length ? `<div class="sec"><h4>この行の記録</h4>${ex.map((n) => `
      <div class="row" style="background:var(--panel2);border-radius:10px;padding:8px 10px;margin-bottom:6px;font-size:13px">
        <span class="grow trunc">${n.from != null ? `<span style="color:var(--dim)">「${h(chars.slice(n.from, n.to + 1).join(""))}」</span> ` : ""}${h(names(n.memberIds) || "—")} ${h(n.tags.map(tagName).join("/"))}${n.pitch ? " " + h(pitchLabel(n.pitch)) : ""}${n.memo ? " " + h(n.memo) : ""}</span>
        ${n.pitch ? `<button data-act="playnote" data-id="${n.id}" style="color:var(--accent);padding:0 6px">▶</button>` : ""}
        ${n.at != null && !n.ro ? `<button data-act="playfrom" data-id="${n.id}" style="color:var(--good);padding:0 6px">🔊 ${mmss(n.at)}</button>` : ""}
        ${n.ro ? `<span style="color:var(--dim);font-size:11px">配信</span>`
               : `<button data-act="delnote" data-id="${n.id}" style="color:var(--bad);padding:0 4px">✕</button>`}
      </div>`).join("")}</div>` : ""}`;

  overlay = document.createElement("div");
  overlay.className = "mask";
  overlay.innerHTML = `<button class="sp" data-act="close"></button><div class="sheet">${inner}</div>`;
  document.body.appendChild(overlay);
  const pno = overlay.querySelector("#pno");
  if (pno) pno.scrollLeft = 34 * 7 - 20; // C4 のあたりから見せる
}

/* ---- summary ---- */
const lyricOf = (n) => {
  const so = S.songs.find((x) => x.id === n.songId);
  return so ? (so.lines[n.lineIdx] || {}).t || "" : "";
};
const partOf = (n) => (n.from != null ? Array.from(lyricOf(n)).slice(n.from, n.to + 1).join("") : "");
const songTitle = (n) => { const so = S.songs.find((x) => x.id === n.songId); return so ? songName(so) : "?"; };


function viewSummary() {
  const ns0 = shownNotes();
  const detail = (n, withShow) => `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:13px">
      <div style="font-size:11px;color:var(--dim)">${h(songTitle(n))}${withShow ? " ・ " + h(showName(n.showId)) : ""}${
        (() => { const p = pastHits(n.songId, n.lineIdx); return p.count ? `<span style="color:var(--bad)">　前の公演でも${p.count}回</span>` : ""; })()}</div>
      <div>${h(lyricOf(n))}${partOf(n) ? `<span style="color:var(--dim)">　→ ${h(partOf(n))}</span>` : ""}</div>
      <div style="font-size:11px;color:${noteColor(n)};margin-top:2px">${h(n.tags.map(tagName).join("・"))}${n.pitch ? "（正しい音 " + h(pitchLabel(n.pitch)) + "）" : ""}${n.memo ? " — " + h(n.memo) : ""}</div>
    </div>`;

  let body = "";
  if (!ns0.length) body = `<p style="padding:40px;text-align:center;color:var(--dim);font-size:14px">この公演の記録はまだありません。</p>`;
  else if (U.mode === "member") {
    body = S.members.map((m) => {
      const ns = ns0.filter((n) => n.memberIds.includes(m.id));
      if (!ns.length) return "";
      const counts = TAGS.map((t) => ({ l: t.l, id: t.id, n: ns.filter((x) => x.tags.includes(t.id)).length })).filter((c) => c.n);
      return `<div class="card">
        <div class="row" style="margin-bottom:8px"><b class="grow">${h(m.name)}</b>
          <span style="color:var(--dim);font-size:13px">${ns.length}件</span></div>
        <div>${counts.map((c) => `<span class="tagpill" style="color:${c.id === "good" ? "var(--good)" : "var(--text)"}">${c.l} ${c.n}</span>`).join("")}</div>
        ${ns.map((n) => detail(n, U.allShows)).join("")}</div>`;
    }).join("");
  } else if (U.mode === "song") {
    body = (U.allShows ? S.songs : SONGS()).map((so) => {
      const ns = ns0.filter((n) => n.songId === so.id).sort((a, b) => a.lineIdx - b.lineIdx);
      if (!ns.length) return "";
      const mm = (S.memos || {})[S.showId + "|" + so.id];
      return `<div class="card"><b>${h(songName(so))}</b> <span style="color:var(--dim);font-size:13px">${ns.length}件</span>
        ${mm ? `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--panel2);font-size:13px;white-space:pre-wrap">${h(mm)}</div>` : ""}
        ${ns.map((n) => `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:13px">
          <div>${h(lyricOf(n))}${partOf(n) ? `<span style="color:var(--dim)">　→ ${h(partOf(n))}</span>` : ""}</div>
          <div style="font-size:11px;color:${noteColor(n)};margin-top:2px">${h(names(n.memberIds) || "—")} / ${h(n.tags.map(tagName).join("・"))}${n.memo ? " — " + h(n.memo) : ""}</div>
        </div>`).join("")}</div>`;
    }).join("");
  } else {
    body = showsNewestFirst().map((sw) => {
      const ns = ns0.filter((n) => n.showId === sw.id);
      if (!ns.length) return "";
      const counts = S.members.map((m) => ({ name: m.name, n: ns.filter((x) => x.memberIds.includes(m.id)).length })).filter((c) => c.n);
      return `<div class="card">
        <div class="row" style="margin-bottom:8px"><b class="grow">${h(sw.name)}</b>
          <span style="color:var(--dim);font-size:13px">${ns.length}件</span></div>
        <div>${counts.map((c) => `<span class="tagpill">${h(c.name)} ${c.n}</span>`).join("")}</div>
        ${ns.map((n) => detail(n, false)).join("")}</div>`;
    }).join("");
  }

  if (U.mode === "diff") return viewDiff();
  const tab = (id, label) => `<button class="chip sm" data-act="mode" data-id="${id}"
    style="${U.mode === id ? "background:var(--accent);color:#0A0A0A" : ""}">${label}</button>`;

  return `
  <div class="hd"><button class="ic" data-act="go-live">‹</button><b>集計</b>
    <span class="grow"></span>
    <span style="font-size:11px;color:var(--dim)" class="trunc">${h(U.allShows ? "全公演" : showName())}</span></div>
  <div class="tabs">${tab("member", "メンバー別")}${tab("song", "曲別")}${tab("show", "公演別")}${tab("diff", "前回との差")}</div>
  <div class="tabs" style="padding-top:0">
    <button class="chip sm" data-act="allshows"
      style="${U.allShows ? "background:var(--accent);color:#0A0A0A" : ""}">全公演をまとめる</button>
    <span class="grow"></span>
  </div>
  <div class="scroll pad">${body}<div style="height:40px"></div></div>`;
}

/* ---- 前回との差 ---- */
function prevShowId() {
  const cur = S.shows.find((x) => x.id === S.showId);
  if (!cur) return "";
  if (cur.from && S.shows.some((x) => x.id === cur.from)) return cur.from;
  const older = S.shows.filter((x) => (x.ts || 0) < (cur.ts || 0)).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return older.length ? older[0].id : "";
}

function viewDiff() {
  const pid = prevShowId();
  const tab = (id, label) => `<button class="chip sm" data-act="mode" data-id="${id}"
    style="${U.mode === id ? "background:var(--accent);color:#0A0A0A" : ""}">${label}</button>`;
  const head = `
  <div class="hd"><button class="ic" data-act="go-live">‹</button><b>集計</b>
    <span class="grow"></span>
    <span style="font-size:11px;color:var(--dim)" class="trunc">${h(showName())}</span></div>
  <div class="tabs">${tab("member", "メンバー別")}${tab("song", "曲別")}${tab("show", "公演別")}${tab("diff", "前回との差")}</div>`;

  const key = (n) => n.lineIdx + "|" + (n.lineEnd || "");
  const cards = SONGS().map((so) => {
    const prevSong = prevSongOf(so);
    if (!prevSong) return "";
    const now = NOTES().filter((n) => n.songId === so.id && n.showId === S.showId && !n.tags.includes("good"));
    const bef = NOTES().filter((n) => n.songId === prevSong.id && !n.tags.includes("good"));
    const nowK = new Set(now.map(key)), befK = new Set(bef.map(key));
    const fixed = bef.filter((n) => !nowK.has(key(n)));
    const kept = now.filter((n) => befK.has(key(n)));
    const fresh = now.filter((n) => !befK.has(key(n)));
    if (!fixed.length && !kept.length && !fresh.length) return "";
    const row = (n, src, col) => {
      const sg2 = src === "now" ? so : prevSong;
      const t = (sg2.lines[n.lineIdx] || {}).t || "";
      return `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--line);font-size:13px">
        <div>${h(t)}</div>
        <div style="font-size:11px;color:${col};margin-top:2px">${h(names(n.memberIds) || "—")} / ${h(n.tags.map(tagName).join("・"))}${n.memo ? " — " + h(n.memo) : ""}</div>
      </div>`;
    };
    const sec = (title, arr, col, src) => arr.length
      ? `<div style="margin-top:10px"><b style="font-size:12px;color:${col}">${title} ${arr.length}</b>${arr.map((n) => row(n, src, col)).join("")}</div>`
      : "";
    return `<div class="card"><b>${h(songName(so))}</b>
      <span style="font-size:11px;color:var(--dim)">　← ${h(songName(prevSong))}${prevSong.showId !== so.showId ? "（" + h(showName(prevSong.showId)) + "）" : ""}</span>
      ${sec("直った", fixed, "var(--good)", "prev")}
      ${sec("続いている", kept, "var(--bad)", "now")}
      ${sec("新しく出た", fresh, "var(--accent)", "now")}
    </div>`;
  }).join("");

  return head + `<div class="scroll pad">
    ${cards || `<p style="padding:30px;text-align:center;color:var(--dim);font-size:14px">比べられる前の回がありません。<br>曲を複製するか、前の公演があれば比較できます。</p>`}
    <div style="height:40px"></div></div>`;
}

/* ---- 紙／PDF ---- */
function viewPrint() {
  const g = group();
  const songs = SONGS().filter((x) => x.groupId === g.id);
  const body = songs.map((so) => {
    const ns0 = NOTES().filter((n) => n.songId === so.id && n.showId === S.showId);
    const live = so.lines.filter((l) => l.t).length;
    const mm = songMemo(so.id);
    // A4縦1枚に収まるよう、行数から文字サイズと段数を決める
    const twoCol = live > 34;
    const per = twoCol ? Math.ceil(live / 2) : live;
    const room = 960 - (mm ? 90 : 0);
    let fs = Math.floor((room / Math.max(per, 1)) / 1.85 * 10) / 10;
    fs = Math.max(5.5, Math.min(12, fs));

    const rows = so.lines.map((l, i) => {
      if (l.gap) return `<div style="height:${(fs * 0.5).toFixed(1)}px"></div>`;
      const ns = ns0.filter((n) => covers(n, i));
      const chars = Array.from(l.t);
      const mark = (n) => {
        const t = n.tags.length ? n.tags.map(tagName).join("・") : (n.memo ? "メモ" : "");
        return `[${t}${n.pitch ? " " + pitchLabel(n.pitch) : ""}${n.memo ? " " + n.memo : ""}]`;
      };
      let cells = chars.map((ch, ci) => {
        const mk = ns.find((n) => n.from != null && ci >= n.from && ci <= n.to);
        const tail = ns.filter((n) => n.from != null && n.to === ci).map((n) => `<b class="prt">${h(mark(n))}</b>`).join("");
        return (mk ? `<u>${ch === " " ? "&nbsp;" : h(ch)}</u>` : (ch === " " ? "&nbsp;" : h(ch))) + tail;
      }).join("");
      cells += ns.filter((n) => n.from == null && n.lineIdx === i).map((n) => `<b class="prt">${h(mark(n))}</b>`).join("");
      const past = pastHits(so.id, i);
      if (past.count) cells += `<span class="prp">（前${past.count}）</span>`;
      return `<div class="prl"><span class="prn">${h(l.label)}</span><span class="prx">${cells}</span></div>`;
    }).join("");

    return `<section class="prs" style="font-size:${fs}px">
      <h3>${h(songName(so))}<span class="prc">　${h(g.name)}　${h(showName())}　${ns0.length}件</span></h3>
      <div class="prbody" style="${twoCol ? "column-count:2;column-gap:14px" : ""}">${rows}</div>
      ${mm ? `<div class="prm"><b>総括</b>　${h(mm)}</div>` : ""}
    </section>`;
  }).join("");

  return `
  <div class="hd noprint"><button class="ic" data-act="go-live">‹</button><b>PDF・印刷</b>
    <span class="grow"></span>
    <button class="chip sm" data-act="doprint" style="background:var(--accent);color:#0A0A0A">PDFで保存</button></div>
  <div class="scroll pr">
    ${body || `<p style="padding:30px">このグループの曲がありません。</p>`}
    <div style="height:40px"></div>
  </div>`;
}

/* ---- setup ---- */
function viewSetup() {
  if (VIEW()) {
    const list = showsNewestFirst().map((sw) => `<div class="row card" style="margin-bottom:8px;padding:12px;${sw.id === S.showId ? "outline:1px solid var(--accent)" : ""}">
      <button class="grow" style="text-align:left" data-act="useshow" data-id="${sw.id}">
        <div class="trunc" style="${sw.id === S.showId ? "color:var(--accent)" : ""}">${h(sw.name)}</div>
        <div style="font-size:11px;color:var(--dim)">${S.songs.filter((x) => x.showId === sw.id).length}曲 ・ ${NOTES().filter((n) => n.showId === sw.id).length}件</div>
      </button></div>`).join("");
    return `
    <div class="hd"><button class="ic" data-act="go-live">‹</button><b>公演</b>
      <span class="grow"></span>
      <span style="font-size:11px;color:var(--dim)">${APP_VER}</span></div>
    <div class="scroll pad"><div style="height:6px"></div>${list}<div style="height:40px"></div></div>`;
  }

  const allShows = showsNewestFirst();
  const shownShows = U.allShowList ? allShows : allShows.slice(0, 6);
  const shows = shownShows.map((sw) => `<div class="row card" style="margin-bottom:8px;padding:10px 12px;${sw.id === S.showId ? "outline:1px solid var(--accent)" : ""}">
      <button class="grow" style="text-align:left" data-act="useshow" data-id="${sw.id}">
        <div class="trunc" style="${sw.id === S.showId ? "color:var(--accent)" : ""}">${h(sw.name)}</div>
        <div style="font-size:11px;color:var(--dim)">${S.songs.filter((x) => x.showId === sw.id).length}曲 ・ ${NOTES().filter((n) => n.showId === sw.id).length}件${sw.id === S.showId ? " ・ 記録中" : ""}</div>
      </button>
      <button data-act="copyshow" data-id="${sw.id}" style="padding:4px 8px;color:var(--dim)">複製</button>
      <button data-act="renameshow" data-id="${sw.id}" style="padding:4px 8px;color:var(--dim)">名前</button>
      <button data-act="delshow" data-id="${sw.id}" style="padding:4px 6px;color:var(--bad)">✕</button>
    </div>`).join("");

  const cur = SONGS();
  const songs = cur.map((x, i) => {
    const on = U.pick.includes(x.id);
    return `<div class="row card" style="margin-bottom:8px;${on ? "outline:1px solid var(--accent)" : ""}">
      <button data-act="picksong" data-id="${x.id}" style="width:26px;flex:0 0 26px;font-size:15px;color:${on ? "var(--accent)" : "var(--dim)"}">${on ? "☑" : "☐"}</button>
      <button class="grow" style="text-align:left;min-width:0" data-act="opensong" data-i="${i}">
        <div class="trunc">${h(songName(x))}</div>
        <div class="trunc" style="font-size:11px;color:var(--dim)">${x.lines.filter((l) => l.t).length}行 ・ ${h((S.groups.find((g) => g.id === x.groupId) || {}).name || "—")}</div>
      </button>
      <button data-act="up" data-i="${i}" style="padding:4px 5px;color:var(--dim)">↑</button>
      <button data-act="down" data-i="${i}" style="padding:4px 5px;color:var(--dim)">↓</button>
      <button data-act="songmenu" data-i="${i}" style="padding:4px 8px;color:var(--dim)">…</button>
    </div>`;
  }).join("");
  const bar = `<div class="row" style="margin-bottom:10px">
      <button class="chip sm" data-act="pickall">${U.pick.length === cur.length && cur.length ? "選択を解除" : "すべて選ぶ"}</button>
      <button class="chip sm" data-act="sorttitle">曲名順に並べる</button>
      <span class="grow"></span>
      ${U.pick.length ? `<button class="chip sm" data-act="delpicked" style="background:var(--bad);color:#0A0A0A">${U.pick.length}曲を削除</button>` : ""}
    </div>`;

  return `
  <div class="hd"><button class="ic" data-act="go-live">‹</button><b>設定</b>
    <span class="grow"></span>
    ${U.busy ? `<span style="font-size:12px;color:var(--accent)">${h(U.busy)}</span>`
             : `<span style="font-size:11px;color:var(--dim)">${APP_VER}</span>`}</div>
  <div class="scroll pad">
    <h4 class="head">公演</h4>
    ${shows}
    ${allShows.length > 6 ? `<button class="ghost" data-act="allshowlist" style="margin-bottom:10px">${U.allShowList ? "最近の6公演だけ表示" : `すべて表示（全${allShows.length}公演）`}</button>` : ""}
    <div class="row" style="margin-bottom:22px">
      <input class="field grow" id="newshow" placeholder="8/3 ○○ホール 昼公演">
      <button class="chip" data-act="addshow">追加</button>
    </div>

    <h4 class="head">グループ</h4>
    ${S.groups.map((g) => {
      const n = SONGS().filter((x) => x.groupId === g.id).length;
      const cur = g.id === S.groupId;
      return `<div class="card" style="${cur ? "outline:1px solid var(--accent)" : ""}">
        <div class="row" style="margin-bottom:8px">
          <button class="grow" style="text-align:left" data-act="usegroup" data-id="${g.id}">
            <div style="${cur ? "color:var(--accent)" : ""}">${h(g.name)}</div>
            <div style="font-size:11px;color:var(--dim)">${n}曲 ・ ${g.gistId ? "配信中" : "未接続"}${cur ? " ・ 取り込み先" : ""}</div>
          </button>
          <button data-act="renamegroup" data-id="${g.id}" style="padding:4px 8px;color:var(--dim)">名前</button>
          <button data-act="delgroup" data-id="${g.id}" style="padding:4px 6px;color:var(--bad)">✕</button>
        </div>
        ${g.gistId ? `
          <button class="primary" data-act="connectlink" data-id="${g.id}" style="margin-bottom:8px">${h(g.name)} の接続リンクを作る</button>
          <div class="row" style="margin-bottom:6px">
            <span class="grow" style="font-size:11px;color:var(--dim)">暗号化</span>
            <button class="chip sm" data-act="encoff" data-id="${g.id}" style="${!g.key ? "background:var(--accent);color:#0A0A0A" : ""}">なし</button>
            <button class="chip sm" data-act="enclink" data-id="${g.id}" style="${g.key && g.keyInLink !== false ? "background:var(--accent);color:#0A0A0A" : ""}">同梱</button>
            <button class="chip sm" data-act="encsep" data-id="${g.id}" style="${g.key && g.keyInLink === false ? "background:var(--accent);color:#0A0A0A" : ""}">別に伝える</button>
          </div>
          ${g.key ? `<div class="row"><span class="grow" style="font-size:13px;word-break:break-all">${h(g.key)}</span>
            <button class="chip sm" data-act="newkey" data-id="${g.id}">作り直す</button></div>` : ""}
        ` : (S.ghToken ? `<button class="primary" data-act="ghstart" data-id="${g.id}">${h(g.name)} の自動公開を始める</button>`
                       : "")}
      </div>`;
    }).join("")}
    <div class="row" style="margin-bottom:22px">
      <input class="field grow" id="newgroup" placeholder="グループ名">
      <button class="chip" data-act="addgroup">追加</button>
    </div>

    <h4 class="head">セットリスト</h4>
    ${cur.length ? bar : ""}
    ${songs}
    <div class="card">
      <button class="primary" data-act="pickfile" style="margin-bottom:8px">歌割のPDF / Excel を選ぶ（複数可）</button>
      <input type="file" id="file" multiple style="display:none"
        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls,.csv,application/json,.json">
      <div style="font-size:11px;color:var(--dim);margin-top:6px">→ ${h(group().name || "")}</div>
    </div>

    <h4 class="head">自動公開</h4>
    <div class="card">
      ${S.ghToken ? `<div class="row" style="margin-bottom:10px">
          <span class="grow" style="font-size:13px">トークン設定済み　<span style="color:var(--dim)">${h(pushState || "待機中")}</span></span>
          <button class="chip sm" data-act="autopub" style="${S.autoPub ? "background:var(--accent);color:#0A0A0A" : ""}">自動${S.autoPub ? "オン" : "オフ"}</button>
        </div>
        <button class="ghost" data-act="ghpush" style="margin-bottom:8px">今すぐ送信</button>
        <button class="ghost" data-act="ghverify" style="margin-bottom:8px">トークンを確認する</button>
        <button class="ghost" data-act="ghclear" style="color:var(--bad)">トークンを入れ直す</button>
        <p class="note" style="margin-top:8px">配信中：${S.groups.filter((x) => x.gistId).map((x) => h(x.name)).join("、") || "なし"}</p>`
        : `<div class="row" style="margin-bottom:8px">
            <input class="field grow" id="ghtoken" type="password" placeholder="ghp_ で始まる文字列" value="">
            <button class="chip" data-act="ghtoken">確認して保存</button>
          </div>
          <div style="font-size:11px;color:var(--dim);margin-top:6px">Tokens (classic) / gist</div>`}
    </div>

    <h4 class="head">録音データ</h4>
    <div class="card" style="margin-bottom:10px">
      <div class="row" style="margin-bottom:8px">
        <span class="grow" style="font-size:13px">音質</span>
        ${[[64, "節約"], [128, "標準"], [192, "高音質"]].map(([k, l]) => `<button class="chip sm" data-act="kbps" data-id="${k}"
          style="${S.kbps === k ? "background:var(--accent);color:#0A0A0A" : ""}">${l}</button>`).join("")}
      </div>
      <div class="row" style="margin-bottom:8px">
        <span class="grow" style="font-size:13px">頭出しの巻き戻し</span>
        ${[3, 5, 10, 15].map((k) => `<button class="chip sm" data-act="preroll" data-id="${k}"
          style="${S.preroll === k ? "background:var(--accent);color:#0A0A0A" : ""}">${k}秒</button>`).join("")}
      </div>
      <div style="font-size:11px;color:var(--dim)">8分あたり ${(S.kbps * 1000 / 8 * 480 / 1048576).toFixed(1)}MB</div>
    </div>
    <div class="card">
      ${(() => {
        const ks = Object.keys(S.recs || {});
        if (!ks.length) return `<p class="note">録音なし</p>`;
        const total = ks.reduce((a, k) => a + (S.recs[k].size || 0), 0);
        const rows = ks.map((k) => {
          const [sid, gid] = k.split("|");
          const so = S.songs.find((x) => x.id === gid);
          return `<div class="row" style="font-size:13px;padding:6px 0;border-top:1px solid var(--line)">
            <span class="grow trunc">${h(so ? so.title : "削除された曲")}<span style="color:var(--dim)">　${h(showName(sid))}</span></span>
            <span style="color:var(--dim);font-size:11px">${mmss(S.recs[k].dur)}・${(S.recs[k].size / 1048576).toFixed(1)}MB</span>
            <button data-act="delreckey" data-id="${k}" style="color:var(--bad);padding:0 6px">✕</button>
          </div>`;
        }).join("");
        return `<div style="font-size:13px;margin-bottom:6px">${ks.length}件　合計 ${(total / 1048576).toFixed(1)}MB</div>${rows}`;
      })()}
    </div>

    <h4 class="head">紙で渡す</h4>
    <div class="card">
      <button class="primary" data-act="goprint">チェック結果をPDFにする</button>
    </div>

    <div style="height:40px"></div>
  </div>`;
}

/* ---------------- events ---------------- */
function commitFields() {
  const memo = document.getElementById("memo");
  if (memo && U.sheet) U.sheet.memo = memo.value;
  const sm = document.getElementById("songmemo");
  const so = song();
  if (sm && so) {
    const k = memoKey(so.id);
    if ((S.memos[k] || "") !== sm.value) {
      S.memos[k] = sm.value;
      save(); schedulePush();
    }
  }
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  // 範囲指定（シート内の文字タップ）
  const rc = e.target.closest("[data-r]");
  if (rc && U.sheet) {
    const ci = +rc.dataset.r;
    if (U.sheet.anchor == null) { U.sheet.anchor = ci; U.sheet.range = [ci, ci]; }
    else { U.sheet.range = [Math.min(U.sheet.anchor, ci), Math.max(U.sheet.anchor, ci)]; U.sheet.anchor = null; }
    commitFields(); renderSheet(); return;
  }
  if (!b) return;
  const a = b.dataset.act, i = +b.dataset.i, id = b.dataset.id;
  const s = song();

  switch (a) {
    case "size": S.size = S.size >= 26 ? 15 : S.size + 2; save(); render(); break;
    case "prev": if (U.songIdx > 0) { commitFields(); U.songIdx--; render(); } break;
    case "next": if (U.songIdx < SONGS().length - 1) { commitFields(); U.songIdx++; render(); } break;
    case "go-summary": commitFields(); U.view = "summary"; render(); break;
    case "go-setup": commitFields(); U.view = "setup"; render(); break;
    case "go-live": commitFields(); U.view = "live"; render(); break;
    case "note": openSheet(i, null); break;
    case "noteblock": {
      // その行が属する歌割りのかたまり（名前が付いた行＋続きの行）をまとめて選ぶ
      const so = song(); if (!so) break;
      let st = i;
      while (st > 0 && so.lines[st].cont && !so.lines[st].gap) st--;
      let en = st;
      while (en + 1 < so.lines.length && so.lines[en + 1].cont && !so.lines[en + 1].gap) en++;
      openSheet(st, null, en);
      break;
    }
    // ✕ と背景タップは、記録せずに閉じる
    case "cancel":
    case "close":
      clearTimeout(sheetTimer);
      U.picker = false; U.sheet = null; renderSheet();
      break;
    case "picker": U.picker = true; renderSheet(); break;
    case "draw": U.draw = !U.draw; U.erase = false; render(); break;
    case "pen": U.erase = false; render(); break;
    case "eraser": U.erase = true; render(); break;
    case "clearink":
      if (confirm("この曲の手書きをすべて消しますか？")) { delete S.draws[drawKey()]; save(); render(); }
      break;
    case "overview": U.overview = !U.overview; render(); break;
    case "ovsize": U.ovSize = U.ovSize >= 14 ? 8 : U.ovSize + 2; render(); break;
    case "jumpline": {
      U.overview = false; render();
      const el = app.querySelector(`.txt[data-l="${i}"]`);
      if (el) el.scrollIntoView({ block: "center" });
      break;
    }
    case "undo":
      if (undoStack.length) { S.notes = JSON.parse(undoStack.pop()); save(); schedulePush(); render(); }
      break;
    case "jump": U.picker = false; U.songIdx = i; render(); break;
    case "dupsong": dupSong(id); break;
    case "picksong": U.pick = U.pick.includes(id) ? U.pick.filter((x) => x !== id) : U.pick.concat(id); render(); break;
    case "pickall": {
      const cur2 = SONGS().map((x) => x.id);
      U.pick = U.pick.length === cur2.length ? [] : cur2;
      render(); break;
    }
    case "delpicked": {
      const n = U.pick.length;
      if (n && confirm(`${n}曲 をこの公演から削除しますか？\n記録も一緒に消えます。`)) {
        S.songs = S.songs.filter((x) => !U.pick.includes(x.id));
        S.notes = S.notes.filter((x) => !U.pick.includes(x.songId));
        U.pick = []; U.songIdx = 0; save(); schedulePush(); render();
      }
      break;
    }
    case "sorttitle": sortSongsByTitle(); schedulePush(); render(); break;
    case "songmenu": {
      const x = SONGS()[i]; if (!x) break;
      const c = prompt(`「${songName(x)}」\n1 名前を変える\n2 テイクを増やす\n3 グループを変える\n4 削除\n\n番号を入れてください`, "");
      if (c === "1") { const nm = prompt("曲名", x.title); if (nm && nm.trim()) { x.title = nm.trim(); save(); schedulePush(); render(); } }
      else if (c === "2") dupSong(x.id);
      else if (c === "3") {
        const names2 = S.groups.map((g, k) => `${k + 1}. ${g.name}`).join("\n");
        const pk = prompt(`どのグループにしますか？\n\n${names2}`, "1");
        const k2 = Number(pk) - 1;
        if (S.groups[k2]) { x.groupId = S.groups[k2].id; save(); schedulePush(); render(); }
      }
      else if (c === "4" && confirm(`「${songName(x)}」を削除しますか？`)) {
        S.songs = S.songs.filter((y) => y.id !== x.id);
        S.notes = S.notes.filter((n2) => n2.songId !== x.id);
        save(); schedulePush(); render();
      }
      break;
    }
    case "dupshow": { U.picker = false; dupShow(S.showId); break; }
    case "jumpshow": S.showId = id; U.songIdx = 0; save(); renderSheet(); render(); break;

    case "key": {
      tone(id);
      clearTimeout(sheetTimer);
      if (!U.sheet || !U.sheet.rec) break;
      U.sheet.seq.push(id);
      // 画面を作り直すとスクロール位置が飛ぶので、必要な所だけ書き換える
      const st = document.getElementById("seqtxt");
      if (st) st.textContent = pitchLabel(U.sheet.seq);
      ["seqplay", "seqclr"].forEach((x) => { const el = document.getElementById(x); if (el) el.style.display = ""; });
      if (overlay) {
        overlay.querySelectorAll(".wk.on,.bk.on").forEach((el) => el.classList.remove("on"));
        const k = overlay.querySelector(`[data-act="key"][data-id="${id}"]`);
        if (k) k.classList.add("on");
      }
      break;
    }
    case "rec": {
      clearTimeout(sheetTimer);
      if (!U.sheet.rec) {
        U.sheet.seq = [];
        const st3 = document.getElementById("seqtxt"); if (st3) st3.textContent = "";
        ["seqplay", "seqclr"].forEach((x) => { const el = document.getElementById(x); if (el) el.style.display = "none"; });
      }
      U.sheet.rec = !U.sheet.rec;
      const rb = document.getElementById("recbtn");
      if (rb) {
        rb.textContent = U.sheet.rec ? "● 録音中" : "● 録音";
        rb.style.background = U.sheet.rec ? "var(--bad)" : "";
        rb.style.color = U.sheet.rec ? "#0A0A0A" : "";
        rb.style.borderColor = U.sheet.rec ? "var(--bad)" : "";
      }
      break;
    }
    case "playnote": {
      const nn = NOTES().find((x) => x.id === id);
      if (nn && nn.pitch) playSeq(String(nn.pitch).split("-"));
      clearTimeout(sheetTimer);
      break;
    }
    case "recstart": startRec(); break;
    case "recstop": stopRec(); break;
    case "playfrom": { const n = NOTES().find((x) => x.id === id); if (n) openPlayer(n.at || 0); break; }
    case "playtop": openPlayer(0); break;
    case "pauseau": pauseAudio(); break;
    case "kbps": S.kbps = Number(id); save(); render(); break;
    case "preroll": S.preroll = Number(id); save(); render(); break;
    case "delreckey": if (confirm("この録音を削除しますか？")) delRec(id); break;
    case "delrec": { const so = song(); if (so && confirm("この曲の録音を削除しますか？")) delRec(recKeyOf(so)); break; }
    case "playseq": clearTimeout(sheetTimer); playSeq(U.sheet ? U.sheet.seq : []); break;
    case "clearseq":
      U.sheet.seq = []; U.sheet.rec = false; clearTimeout(sheetTimer);
      { const st2 = document.getElementById("seqtxt"); if (st2) st2.textContent = ""; }
      ["seqplay", "seqclr"].forEach((x) => { const el = document.getElementById(x); if (el) el.style.display = "none"; });
      { const rb = document.getElementById("recbtn"); if (rb) { rb.textContent = "● 録音"; rb.style.background = ""; rb.style.color = ""; rb.style.borderColor = ""; } }
      if (overlay) overlay.querySelectorAll(".wk.on,.bk.on").forEach((el) => el.classList.remove("on"));
      break;
    case "rangeoff": U.sheet.range = null; U.sheet.anchor = null; commitFields(); renderSheet(); break;
    case "delnote": pushUndo(); delClip(id); S.notes = S.notes.filter((n) => n.id !== id); save(); schedulePush(); commitFields(); render(); break;
    case "mode": U.mode = id; render(); break;
    case "allshows": U.allShows = !U.allShows; render(); break;

    case "opensong": commitFields(); U.songIdx = i; U.view = "live"; render(); break;
    case "up": case "down": {
      const cur = SONGS(); const j = a === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= cur.length) break;
      const p1 = S.songs.indexOf(cur[i]), p2 = S.songs.indexOf(cur[j]);
      const tmp = S.songs[p1]; S.songs[p1] = S.songs[p2]; S.songs[p2] = tmp;
      save(); schedulePush(); render(); break;
    }
    case "delsong": {
      const x = SONGS()[i];
      if (x && confirm(`「${x.title}」をこの公演から削除しますか？`)) {
        S.songs = S.songs.filter((y) => y.id !== x.id);
        S.notes = S.notes.filter((n) => n.songId !== x.id);
        save(); schedulePush(); render();
      }
      break;
    }
    case "pickfile": document.getElementById("file").click(); break;
    case "goprint": commitFields(); U.view = "print"; render(); break;
    case "doprint": window.print(); break;
    case "ghstart": gistStart(id); break;
    case "ghpush": doPush("force"); break;
    case "ghverify": verifyToken(); break;
    case "ghclear":
      if (confirm("トークンを消して入れ直します。\n配信先の設定は残ります。")) { S.ghToken = ""; save(); render(); }
      break;
    case "ghtoken": {
      const el = document.getElementById("ghtoken");
      const v = el ? el.value.trim() : "";
      if (!v) break;
      if (/^github_pat_/.test(v)) {
        alert("これは fine-grained トークンです。Gistには使えません。\n\nGitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) で作った、ghp_ で始まる方を貼ってください。");
        break;
      }
      S.ghToken = v; save(); render();
      verifyToken();
      break;
    }
    case "autopub": S.autoPub = !S.autoPub; save(); render(); break;
    case "connectlink": connectLink(id); break;
    case "newkey": {
      const g = group(id);
      if (confirm(`${g.name} の合言葉を作り直します。\n古い接続リンクでは読めなくなります。`)) {
        g.key = newPassphrase(); save(); doPush(false); render();
      }
      break;
    }
    case "encoff": {
      const g = group(id);
      if (!g.key || confirm("暗号化をやめます。\nGistのURLを知っていれば誰でも中身を読めるようになります。")) {
        g.key = ""; save(); doPush(false); render();
      }
      break;
    }
    case "enclink": { const g = group(id); if (!g.key) g.key = newPassphrase(); g.keyInLink = true; save(); doPush(false); render(); break; }
    case "encsep": { const g = group(id); if (!g.key) g.key = newPassphrase(); g.keyInLink = false; save(); doPush(false); render(); break; }
    case "addgroup": {
      const el = document.getElementById("newgroup");
      const nm = el && el.value.trim();
      if (nm) { const ngid = uid(); S.groups.push({ id: ngid, name: nm, gistId: "", src: "", key: "", keyInLink: true }); S.groupId = ngid; save(); render(); }
      break;
    }
    case "allshowlist": U.allShowList = !U.allShowList; render(); break;
    case "usegroup": S.groupId = id; save(); render(); break;
    case "renamegroup": {
      const g = group(id);
      const nm = prompt("グループ名", g.name);
      if (nm != null && nm.trim()) { g.name = nm.trim(); save(); render(); }
      break;
    }
    case "delgroup": {
      if (S.groups.length <= 1) { alert("グループは1つ以上必要です。"); break; }
      const g = group(id);
      const cnt = S.songs.filter((x) => x.groupId === id).length;
      if (confirm(`「${g.name}」を削除しますか？\nこのグループの ${cnt}曲 と、その記録も消えます。\nGist自体はGitHub側に残るので、不要なら別途削除してください。`)) {
        const sids = S.songs.filter((x) => x.groupId === id).map((x) => x.id);
        S.songs = S.songs.filter((x) => x.groupId !== id);
        S.notes = S.notes.filter((n) => !sids.includes(n.songId));
        S.groups = S.groups.filter((x) => x.id !== id);
        if (S.groupId === id) S.groupId = S.groups[0].id;
        save(); render();
      }
      break;
    }
    case "songgroup": {
      const sg = SONGS()[i]; if (!sg) break;
      const names2 = S.groups.map((g, k) => `${k + 1}. ${g.name}`).join("\n");
      const pick = prompt(`「${sg.title}」をどのグループにしますか？\n番号を入れてください。\n\n${names2}`, "1");
      const k2 = Number(pick) - 1;
      if (S.groups[k2]) { sg.groupId = S.groups[k2].id; save(); schedulePush(); render(); }
      break;
    }
    case "setsrc": {
      const el = document.getElementById("src");
      if (el) { S.src = el.value.trim(); S.setlistVer = 0; save(); syncSetlist(true); }
      break;
    }
    case "takeincoming": applySetlist(U.incoming); break;
    case "dropincoming": U.incoming = null; render(); break;
    case "ghstart": gistStart(id); break;
    case "ghpush": doPush("force"); break;
    case "ghverify": verifyToken(); break;
    case "ghclear":
      if (confirm("トークンを消して入れ直します。\n配信先の設定は残ります。")) { S.ghToken = ""; save(); render(); }
      break;
    case "ghtoken": {
      const el = document.getElementById("ghtoken");
      const v = el ? el.value.trim() : "";
      if (!v) break;
      if (/^github_pat_/.test(v)) {
        alert("これは fine-grained トークンです。Gistには使えません。\n\nGitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) で作った、ghp_ で始まる方を貼ってください。");
        break;
      }
      S.ghToken = v; save(); render();
      verifyToken();
      break;
    }
    case "autopub": S.autoPub = !S.autoPub; save(); render(); break;
    case "connectlink": connectLink(id); break;
    case "newkey": {
      const g = group(id);
      if (confirm(`${g.name} の合言葉を作り直します。\n古い接続リンクでは読めなくなります。`)) {
        g.key = newPassphrase(); save(); doPush(false); render();
      }
      break;
    }
    case "encoff": {
      const g = group(id);
      if (!g.key || confirm("暗号化をやめます。\nGistのURLを知っていれば誰でも中身を読めるようになります。")) {
        g.key = ""; save(); doPush(false); render();
      }
      break;
    }
    case "enclink": { const g = group(id); if (!g.key) g.key = newPassphrase(); g.keyInLink = true; save(); doPush(false); render(); break; }
    case "encsep": { const g = group(id); if (!g.key) g.key = newPassphrase(); g.keyInLink = false; save(); doPush(false); render(); break; }
    case "addgroup": {
      const el = document.getElementById("newgroup");
      const nm = el && el.value.trim();
      if (nm) { const ngid = uid(); S.groups.push({ id: ngid, name: nm, gistId: "", src: "", key: "", keyInLink: true }); S.groupId = ngid; save(); render(); }
      break;
    }
    case "allshowlist": U.allShowList = !U.allShowList; render(); break;
    case "usegroup": S.groupId = id; save(); render(); break;
    case "renamegroup": {
      const g = group(id);
      const nm = prompt("グループ名", g.name);
      if (nm != null && nm.trim()) { g.name = nm.trim(); save(); render(); }
      break;
    }
    case "delgroup": {
      if (S.groups.length <= 1) { alert("グループは1つ以上必要です。"); break; }
      const g = group(id);
      const cnt = S.songs.filter((x) => x.groupId === id).length;
      if (confirm(`「${g.name}」を削除しますか？\nこのグループの ${cnt}曲 と、その記録も消えます。\nGist自体はGitHub側に残るので、不要なら別途削除してください。`)) {
        const sids = S.songs.filter((x) => x.groupId === id).map((x) => x.id);
        S.songs = S.songs.filter((x) => x.groupId !== id);
        S.notes = S.notes.filter((n) => !sids.includes(n.songId));
        S.groups = S.groups.filter((x) => x.id !== id);
        if (S.groupId === id) S.groupId = S.groups[0].id;
        save(); render();
      }
      break;
    }
    case "songgroup": {
      const sg = SONGS()[i]; if (!sg) break;
      const names2 = S.groups.map((g, k) => `${k + 1}. ${g.name}`).join("\n");
      const pick = prompt(`「${sg.title}」をどのグループにしますか？\n番号を入れてください。\n\n${names2}`, "1");
      const k2 = Number(pick) - 1;
      if (S.groups[k2]) { sg.groupId = S.groups[k2].id; save(); schedulePush(); render(); }
      break;
    }
    case "setsrc": {
      const el = document.getElementById("src");
      if (el) { S.src = el.value.trim(); S.setlistVer = 0; save(); syncSetlist(true); }
      break;
    }
    case "takeincoming": applySetlist(U.incoming); break;
    case "dropincoming": U.incoming = null; render(); break;
    case "refresh":
      commitFields(); save();
      (async () => {
        try {
          if (caches && caches.keys) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
          if (navigator.serviceWorker) {
            const rs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(rs.map((r) => r.unregister()));
          }
        } catch (err) { /* オフラインなら何もしない */ }
        location.reload(true);
      })();
      break;
    case "addshow": {
      const el = document.getElementById("newshow");
      const nm = el && el.value.trim();
      if (nm) { const nid = uid(); S.shows.push({ id: nid, name: nm, ts: Date.now() }); S.showId = nid; U.songIdx = 0; save(); render(); }
      break;
    }
    case "useshow": S.showId = id; save(); U.view = "live"; render(); break;
    case "copyshow": { dupShow(id); break; }
    case "copyshowOld": {
      const sw = S.shows.find((x) => x.id === id);
      const nm = prompt("新しい公演名", (sw ? sw.name : "") + " 夜");
      if (nm != null && nm.trim()) {
        const nid = uid();
        S.shows.push({ id: nid, name: nm.trim(), ts: Date.now() });
        // 複製した時だけセットリストを引き継ぐ（記録は引き継がない）
        S.songs.filter((x) => x.showId === id).forEach((x) => {
          S.songs.push({ id: uid(), showId: nid, groupId: x.groupId, title: x.title, credit: x.credit,
            lines: x.lines.map((l) => Object.assign({}, l, { parts: (l.parts || []).slice() })) });
        });
        S.showId = nid; U.songIdx = 0; save(); render();
      }
      break;
    }
    case "renameshow": {
      const sw = S.shows.find((x) => x.id === id);
      const nm = prompt("公演名", sw ? sw.name : "");
      if (sw && nm != null && nm.trim()) { sw.name = nm.trim(); save(); render(); }
      break;
    }
    case "delshow": {
      if (S.shows.length <= 1) { alert("公演は1つ以上必要です。"); break; }
      const sw = S.shows.find((x) => x.id === id);
      const cnt = S.notes.filter((n) => n.showId === id).length;
      const scnt = S.songs.filter((x) => x.showId === id).length;
      if (confirm(`「${sw.name}」を削除しますか？\nこの公演の ${scnt}曲 と 記録 ${cnt}件 が消えます。`)) {
        const sids = S.songs.filter((x) => x.showId === id).map((x) => x.id);
        S.songs = S.songs.filter((x) => x.showId !== id);
        S.shows = S.shows.filter((x) => x.id !== id);
        S.notes = S.notes.filter((n) => n.showId !== id && !sids.includes(n.songId));
        if (S.showId === id) S.showId = S.shows[0].id;
        save(); render();
      }
      break;
    }


  }
});

document.addEventListener("focusin", (e) => { if (e.target.id === "memo") clearTimeout(sheetTimer); });
document.addEventListener("keydown", (e) => { if (e.target.id === "memo" && e.key === "Enter") commitNote(); });

document.addEventListener("input", (e) => { if (e.target.id === "aubar") seekAudio(e.target.value); });
document.addEventListener("change", (e) => {
  if (e.target.id === "file") handleFiles(e.target.files);
  if (e.target.id === "songmemo") commitFields();
});

// タグを押したらその場で確定して戻る
let sheetTimer = null;
function scheduleCommit() { clearTimeout(sheetTimer); commitNote(); }
function commitNote() {
  clearTimeout(sheetTimer);
  const s = song(), sh = U.sheet;
  U.sheet = null;
  if (!s || !sh) { renderSheet(); return; }
  const memo = (document.getElementById("memo") || {}).value || sh.memo || "";
  if (sh.sel.length || sh.tags.length || memo.trim() || (sh.seq && sh.seq.length)) {
    pushUndo();
    S.notes.push({
      id: uid(), songId: s.id, lineIdx: sh.lineIdx, memberIds: sh.sel, tags: sh.tags,
      memo: memo.trim(), pitch: sh.seq && sh.seq.length ? sh.seq.join("-") : null,
      lineEnd: sh.lineEnd || null,
      from: sh.range ? sh.range[0] : null, to: sh.range ? sh.range[1] : null,
      at: recAt(),
      showId: S.showId, ts: Date.now(),
    });
    save();
    schedulePush();
  }
  render();
}

// 今のセットリストをそのまま新しい公演に引き継ぐ
function dupShow(fromId) {
  if (VIEW()) return;
  const sw = S.shows.find((x) => x.id === fromId);
  const base = sw ? sw.name : "公演";
  const m = base.match(/^(.*?)(\d+)回目$/);
  const suggest = m ? `${m[1]}${Number(m[2]) + 1}回目` : `${base} 2回目`;
  const nm = prompt("新しい公演名", suggest);
  if (nm == null || !nm.trim()) return;
  const nid = uid();
  S.shows.push({ id: nid, name: nm.trim(), ts: Date.now(), from: fromId });
  S.songs.filter((x) => x.showId === fromId).forEach((x) => {
    S.songs.push({ id: uid(), showId: nid, groupId: x.groupId, title: x.title, credit: x.credit,
      lines: x.lines.map((l) => Object.assign({}, l, { parts: (l.parts || []).slice() })) });
  });
  S.showId = nid; U.songIdx = 0; U.picker = false;
  save(); schedulePush(); render();
}

function openSheet(lineIdx, range, lineEnd) {
  if (VIEW()) return;
  const s = song(); if (!s) return;
  const l = s.lines[lineIdx];
  // 誰が歌う行かは歌割から自明なので、その行の担当をそのまま記録に入れる
  U.sheet = { lineIdx, lineEnd: (lineEnd != null && lineEnd > lineIdx) ? lineEnd : null,
    range: range || null, anchor: null, tags: [], memo: "", seq: [], rec: false,
    sel: (l.parts || []).slice() };
  renderSheet();
}

// 最初の操作で音の準備をしておく（iOSは操作なしでは音を出せない）

/* ---- タグをなぞって選ぶ ---- */
let swOrg = null;
document.addEventListener("pointerdown", (e) => {
  const t = e.target.closest && e.target.closest("[data-swipe]");
  swOrg = t ? { id: t.dataset.swipe, x: e.clientX, y: e.clientY } : null;
});
document.addEventListener("pointerup", (e) => {
  const o = swOrg; swOrg = null;
  if (!o || !U.sheet) return;
  const sw = SWIPES.find((x) => x.id === o.id);
  if (!sw) return;
  const dx = e.clientX - o.x, dy = e.clientY - o.y;
  let id = sw.id;
  if (Math.abs(dx) > 24 || Math.abs(dy) > 24) {
    if (Math.abs(dy) >= Math.abs(dx)) id = (dy < 0 ? sw.up : sw.dn) || sw.id;
    else id = (dx < 0 ? sw.lf : sw.rt) || sw.id;
  }
  U.sheet.tags = U.sheet.tags.includes(id) ? U.sheet.tags.filter((x) => x !== id) : U.sheet.tags.concat(id);
  commitFields();
  scheduleCommit();
});

/* ---- 一番下まで来たら、引き上げてテイクを増やす ---- */
let pull = null;
const PULLMAX = 90;
function setPull(v) {
  const f = document.getElementById("pullfill");
  const tx = document.getElementById("pulltx");
  if (!f) return;
  const r = Math.max(0, Math.min(1, v / PULLMAX));
  f.style.width = (r * 100) + "%";
  if (tx) {
    tx.style.color = r >= 1 ? "var(--accent)" : "var(--dim)";
    tx.textContent = r >= 1 ? `離すと テイク${nextTake(song())} を作ります` : `引き上げて テイク${nextTake(song())} を作る`;
  }
}
document.addEventListener("pointerdown", (e) => {
  if (U.draw || VIEW() || U.sheet || U.picker || U.overview) { pull = null; return; }
  const t = e.target.closest && e.target.closest("#pull");
  pull = t ? { y: e.clientY, d: 0 } : null;
});
document.addEventListener("pointermove", (e) => {
  if (!pull) return;
  pull.d = Math.max(0, pull.y - e.clientY);
  if (pull.d > 4) e.preventDefault();
  setPull(pull.d);
}, { passive: false });
document.addEventListener("pointerup", () => {
  const q = pull; pull = null;
  if (!q) return;
  setPull(0);
  if (q.d >= PULLMAX) { const so = song(); if (so) dupSong(so.id); }
});

/* ---- 手書き ---- */

const drawKey = () => { const so = song(); return so ? S.showId + "|" + so.id : ""; };
let inkPath = null;

function paintInk() {
  const cv = document.getElementById("ink");
  const sc = app.querySelector(".scroll");
  if (!cv || !sc) return;
  const w = sc.clientWidth, hgt = sc.scrollHeight;
  if (cv.width !== w || cv.height !== hgt) { cv.width = w; cv.height = hgt; }
  cv.style.width = w + "px"; cv.style.height = hgt + "px";
  const g = cv.getContext("2d");
  g.clearRect(0, 0, w, hgt);
  g.lineCap = "round"; g.lineJoin = "round";
  (S.draws[drawKey()] || []).forEach((st) => {
    g.strokeStyle = st.c; g.lineWidth = st.w;
    g.beginPath();
    for (let i = 0; i < st.p.length; i += 2) {
      const x = st.p[i] * w, y = st.p[i + 1];
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  });
  if (inkPath && inkPath.p.length >= 4) {
    g.strokeStyle = inkPath.c; g.lineWidth = inkPath.w;
    g.beginPath();
    for (let i = 0; i < inkPath.p.length; i += 2) {
      const x = inkPath.p[i] * w, y = inkPath.p[i + 1];
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
}

function inkPos(e) {
  const sc = app.querySelector(".scroll");
  const r = sc.getBoundingClientRect();
  return [(e.clientX - r.left) / sc.clientWidth, e.clientY - r.top + sc.scrollTop];
}
function eraseAt(e) {
  const [nx, y] = inkPos(e);
  const sc = app.querySelector(".scroll");
  const x = nx * sc.clientWidth;
  const arr = S.draws[drawKey()] || [];
  const keep = arr.filter((st) => {
    for (let i = 0; i < st.p.length; i += 2) {
      const px = st.p[i] * sc.clientWidth, py = st.p[i + 1];
      if (Math.abs(px - x) < 16 && Math.abs(py - y) < 16) return false;
    }
    return true;
  });
  if (keep.length !== arr.length) { S.draws[drawKey()] = keep; save(); paintInk(); }
}

document.addEventListener("pointerdown", (e) => {
  if (!U.draw || VIEW()) return;
  const cv = e.target.closest && e.target.closest("#ink");
  if (!cv) return;
  e.preventDefault();
  if (U.erase) { eraseAt(e); inkPath = "erasing"; return; }
  inkPath = { c: "#FF5C42", w: 3, p: inkPos(e) };
}, { passive: false });

document.addEventListener("pointermove", (e) => {
  if (!U.draw || !inkPath) return;
  e.preventDefault();
  if (inkPath === "erasing") { eraseAt(e); return; }
  const q = inkPos(e);
  const n = inkPath.p.length;
  if (n < 2 || Math.abs(q[1] - inkPath.p[n - 1]) > 1.2 || Math.abs(q[0] - inkPath.p[n - 2]) > 0.002) {
    inkPath.p.push(Math.round(q[0] * 10000) / 10000, Math.round(q[1]));
    paintInk();
  }
}, { passive: false });

document.addEventListener("pointerup", () => {
  if (!U.draw || !inkPath) return;
  if (inkPath !== "erasing" && inkPath.p.length >= 4) {
    const k = drawKey();
    (S.draws[k] = S.draws[k] || []).push(inkPath);
    save();
  }
  inkPath = null;
  paintInk();
});

/* ---- なぞって範囲指定 ---- */
let org = null, dragOn = false;

// 指の位置から、その行の何文字目かを求める。
// 文字の上を外れても（バッジの上、行の外、折り返しの先でも）必ず一番近い文字を返す。
function charAtX(row, x, y) {
  const sp = row.querySelectorAll("[data-c]");
  if (!sp.length) return null;
  let best = null, bestD = Infinity;
  for (const el of sp) {
    const r = el.getBoundingClientRect();
    const dy = y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0);
    const dx = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
    const d = dy * 1000 + dx; // まず同じ段、その中で横に一番近い文字
    if (d < bestD) { bestD = d; best = Number(el.dataset.c); }
  }
  return best;
}

document.addEventListener("pointerdown", (e) => {
  if (U.draw) return;
  const t = e.target.closest && e.target.closest(".txt");
  if (!t || U.sheet || U.picker || U.overview) { org = null; return; }
  const row = t;
  org = { l: Number(row.dataset.l), row, x: e.clientX, y: e.clientY, c: null, end: null };
  org.c = charAtX(row, e.clientX, e.clientY);
  dragOn = false;
});

document.addEventListener("pointermove", (e) => {
  if (!org) return;
  const dx = e.clientX - org.x, dy = e.clientY - org.y;
  if (!dragOn) {
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { org = null; clearHl(); return; }
    if (Math.abs(dx) < 8) return;
    dragOn = true;
    if (org.c == null) org.c = 0;
  }
  e.preventDefault();
  const c = charAtX(org.row, e.clientX, e.clientY);
  if (c != null) { org.end = c; highlight(org.l, org.c, c); }
}, { passive: false });

document.addEventListener("pointerup", (e) => {
  const o = org; org = null;
  if (!o) { dragOn = false; return; }
  if (dragOn) {
    // 指を離した時点でそのまま選択画面へ。もう一度タップする必要はない。
    const a = o.c == null ? 0 : o.c;
    const b = o.end == null ? a : o.end;
    openSheet(o.l, [Math.min(a, b), Math.max(a, b)]);
  } else {
    openSheet(o.l, null);
  }
  dragOn = false; clearHl();
});

function highlight(l, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const row = app.querySelector(`.txt[data-l="${l}"]`);
  if (!row) return;
  row.querySelectorAll("[data-c]").forEach((sp) => {
    const i = Number(sp.dataset.c);
    sp.style.background = i >= lo && i <= hi ? "color-mix(in srgb,var(--accent) 34%,transparent)" : "";
  });
}
function clearHl() {
  app.querySelectorAll(".txt [data-c]").forEach((sp) => { sp.style.background = ""; });
}

/* ---------------- files ---------------- */
async function handleFiles(files) {
  const list = [...files].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const failed = [];
  for (let k = 0; k < list.length; k++) {
    const f = list[k];
    U.busy = `${k + 1}/${list.length} ${f.name}`; render();
    try {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (ext === "json") {
        const d = JSON.parse(await f.text());
        (d.members || []).forEach((m) => addMember(m.name));
        (d.songs || []).forEach((sg) => S.songs.push(Object.assign(buildSong(sg), { groupId: S.groupId, showId: S.showId })));
      } else if (ext === "pdf") {
        S.songs.push(Object.assign(buildSong(await parsePDF(f)), { groupId: S.groupId, showId: S.showId }));
      } else {
        S.songs.push(Object.assign(buildSong(await parseXLSX(f)), { groupId: S.groupId, showId: S.showId }));
      }
      save();
    } catch (err) {
      failed.push(f.name + (err && err.unreadable ? "（文字を取り出せません）" : ""));
    }
  }
  // 入れ替えたら曲名順に並べ直す
  sortSongsByTitle();
  U.busy = ""; render();
  const el = document.getElementById("file"); if (el) el.value = "";
  if (failed.length) alert("読み込めませんでした：\n" + failed.join("\n"));
}



/* ---- 暗号化：合言葉を知っている人だけが読める ---- */
async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function sealJSON(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return { enc: 1, salt: b64e(salt), iv: b64e(iv), data: b64e(ct) };
}
async function openJSON(o, pass) {
  const key = await deriveKey(pass, b64d(o.salt));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(o.iv) }, key, b64d(o.data));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)));
}
function newPassphrase() {
  const cs = "abcdefghjkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(r, (b, i) => (i && i % 5 === 0 ? "-" : "") + cs[b % cs.length]).join("");
}
async function wrap(obj, g) {
  const k = g ? g.key : S.key;
  if (!k) return obj;
  if (!crypto || !crypto.subtle) throw new Error("暗号化はhttpsのページでしか使えません。");
  return sealJSON(obj, k);
}

/* ---- GitHub Gist：グループごとに配信する ---- */
function publicationData(gid) {
  const g = group(gid);
  // 直近5公演ぶんだけ配る（際限なく増えないように）
  const recent = showsNewestFirst().slice(0, 5).map((x) => x.id);
  const songs = S.songs.filter((x) => x.groupId === g.id && recent.includes(x.showId));
  const idx = new Map(songs.map((x, i) => [x.id, i]));
  const used = [];
  songs.forEach((x) => x.lines.forEach((l) => (l.parts || []).forEach((pid) => {
    const nm = (member(pid) || {}).name;
    if (nm && !used.includes(nm)) used.push(nm);
  })));
  return {
    version: Date.now(), authorId: S.deviceId, src: g.src || "", groupName: g.name || "",
    members: used.map((n) => ({ name: n })),
    songs: songs.map((x) => ({
      title: x.title, credit: x.credit, showId: x.showId, take: x.take || 1,
      fromIdx: x.from != null ? idx.get(x.from) : null, groups: {}, order: used,
      lines: x.lines.map((l) => (l.gap ? ["", ""] : [l.cont ? "→" : l.label, l.t])),
    })),
    shows: S.shows.filter((x) => recent.includes(x.id)),
    notes: S.notes.filter((n) => idx.has(n.songId)).map((n) => ({
      songIdx: idx.get(n.songId), lineIdx: n.lineIdx,
      memberNames: n.memberIds.map((mid) => (member(mid) || {}).name).filter(Boolean),
      tags: n.tags, memo: n.memo, pitch: n.pitch || null, lineEnd: n.lineEnd || null,
      from: n.from, to: n.to, showId: n.showId,
    })),
    memos: Object.entries(S.memos || {}).map(([k, v]) => {
      const [sid, sgid] = k.split("|");
      return idx.has(sgid) ? { showId: sid, songIdx: idx.get(sgid), text: v } : null;
    }).filter((x) => x && x.text),
  };
}

async function gh(path, opts) {
  const r = await fetch("https://api.github.com" + path, Object.assign({
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + S.ghToken,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
  }, opts || {}));
  if (!r.ok) {
    const body = (await r.text()).slice(0, 200);
    let msg = "GitHub " + r.status + "：" + body;
    if (r.status === 401) msg = "トークンが違います（401）。classic トークンを作り直して貼り直してください。";
    if (r.status === 403 || r.status === 429) {
      msg = /rate limit/i.test(body)
        ? "GitHubへの送信回数の上限に達しました。しばらく待つと自動で送り直します。"
        : "gist の権限がありません（403）。classic トークンで gist にチェックが要ります。\n" + body;
      if (/rate limit/i.test(body)) { const e2 = new Error(msg); e2.status = 429; e2.reset = Number(r.headers.get("x-ratelimit-reset")) || 0; throw e2; }
    }
    if (r.status === 404) msg = "配信先のGistが見つかりません（404）。削除された可能性があります。";
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// raw_url は .../raw/<コミットID>/utacheck.json 形式。IDを外すと常に最新を指す。
const latestRaw = (u) => (u || "").replace(/\/raw\/[0-9a-f]{6,}\//, "/raw/");

// 入れたトークンが本当にGistを扱えるか、その場で確かめる
async function verifyToken() {
  U.busy = "トークンを確認中…"; render();
  try {
    await gh("/gists?per_page=1");
    U.busy = ""; render();
    alert("このトークンでGistを扱えます。\nグループの「自動公開を始める」を押してください。");
  } catch (e) {
    U.busy = ""; render();
    alert("このトークンでは配信できません。\n\n" + e.message);
  }
}

async function gistStart(gid) {
  const g = group(gid);
  if (!S.ghToken) { alert("先にアクセストークンを入れてください。"); return; }
  U.busy = `${g.name} のGistを作成中…`; render();
  try {
    const body = { description: `歌チェック 配信データ / ${g.name}`, public: false,
      files: { "utacheck.json": { content: JSON.stringify(await wrap(publicationData(g.id), g)) } } };
    const res = await gh("/gists", { method: "POST", body: JSON.stringify(body) });
    g.gistId = res.id;
    g.src = latestRaw(res.files["utacheck.json"].raw_url);
    S.autoPub = true;
    await gistPush(g.id);
    U.busy = ""; pushState = "公開しました"; save(); render();
    alert(`${g.name} の自動公開を始めました。\n「接続リンクを作る」でこのグループのメンバーにリンクを送ってください。`);
  } catch (e) {
    U.busy = ""; render();
    alert("失敗しました。\n" + e.message);
  }
}

// version は毎回変わるので、それ以外が同じなら送る必要はない
function payloadKey(d) {
  const c = Object.assign({}, d); delete c.version; return JSON.stringify(c);
}

async function gistPush(gid, force) {
  const g = group(gid);
  if (!g.gistId || !S.ghToken) return "skip";
  const d = publicationData(g.id);
  const key = payloadKey(d);
  if (!force && g.lastKey === key) return "same";
  await gh("/gists/" + g.gistId, {
    method: "PATCH",
    body: JSON.stringify({ files: { "utacheck.json": { content: JSON.stringify(await wrap(d, g)) } } }),
  });
  g.lastKey = key;
  return "sent";
}

// 送りすぎるとGitHubの上限に当たるので、30秒まとめてから1回だけ送る
let lastPushAt = 0, limitedAt = "";
function schedulePush() {
  if (!S.ghToken || !S.autoPub || !S.groups.some((g) => g.gistId)) return;
  pushState = "未送信";
  clearTimeout(pushTimer);
  const wait = Math.max(30000 - (Date.now() - lastPushAt), 8000);
  pushTimer = setTimeout(() => doPush(true), wait);
}

async function doPush(silent) {
  const live = S.groups.filter((g) => g.gistId);
  if (!S.ghToken || !live.length) return;
  pushState = "送信中"; render();
  lastPushAt = Date.now();
  const failed = [];
  const gone = [];
  let sent = 0, limited = 0;
  for (const g of live) {
    try { if ((await gistPush(g.id, silent === "force")) === "sent") sent++; }
    catch (e) {
      if (e.status === 404) { gone.push(g); }
      else if (e.status === 429) {
        limited++;
        const wait = e.reset ? Math.min(Math.max(e.reset * 1000 - Date.now() + 3000, 20000), 3900000) : 90000;
        const rt = new Date(Date.now() + wait);
        limitedAt = `${String(rt.getHours()).padStart(2, "0")}:${String(rt.getMinutes()).padStart(2, "0")}`;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => doPush(true), wait);
      }
      else failed.push(g.name + "：" + e.message);
    }
  }
  if (limited) {
    pushState = "順番待ち" + (limitedAt ? " " + limitedAt + "頃" : "");
    if (silent !== true) alert("GitHubへの送信が混み合っています。\n記録は端末に残っていて、少し待つと自動で送り直します。");
    render();
    return;
  }
  // 配信先が消えていたら、その場で作り直す
  for (const g of gone) {
    g.gistId = ""; g.src = "";
    save();
    if (silent !== true && confirm(`${g.name} の配信先が見つかりません。削除された可能性があります。\n作り直しますか？\n（作り直すと接続リンクが変わるので、メンバーに配り直しが必要です）`)) {
      await gistStart(g.id);
    } else {
      failed.push(g.name + "：配信先が消えています。設定から「自動公開を始める」をやり直してください。");
    }
  }
  if (failed.length) {
    pushState = "未送信";
    if (silent !== true) alert("送信できませんでした。\n\n" + failed.join("\n"));
  } else {
    const d = new Date();
    pushState = `公開済 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (silent === "force" && !sent) pushState += "（変更なし）";
  }
  render();
}

window.addEventListener("online", () => { if (pushState === "未送信") doPush(true); });

/* ---- 受け取り：配信されたものを取り込む ---- */
const srcUrl = () => S.src || "./setlist.json";

async function fetchSetlist() {
  const u = srcUrl();
  const url = u + (u.includes("?") ? "&" : "?") + "t=" + Date.now();
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    let d = await r.json();
    if (d && d.enc) {
      if (!S.key) return "nokey";
      if (!crypto || !crypto.subtle) return "badkey";
      try { d = await openJSON(d, S.key); } catch (e) { return "badkey"; }
    }
    return d && Array.isArray(d.songs) ? d : null;
  } catch (e) { return null; }
}

// 受け取り専用の端末で、つなぎ先が変わった時に前のグループを消す
function resetForNewSource() {
  if (S.groups.some((g) => g.gistId)) return; // 配信元の端末では絶対に消さない
  Object.keys(S.recs || {}).forEach((k) => delClip(k));
  S.songs = []; S.notes = []; S.pubNotes = []; S.memos = {}; S.recs = {};
  const nid = uid();
  S.shows = [{ id: nid, name: todayLabel(), ts: Date.now() }];
  S.showId = nid; S.setlistVer = 0; U.songIdx = 0; U.incoming = null;
}

function applySetlist(d) {
  if (!S.groups.some((g) => g.gistId)) { S.songs = []; S.memos = {}; S.pubNotes = []; }
  S.songs = [];
  (d.members || []).forEach((x) => addMember(x.name));
  const added = [];
  (d.songs || []).forEach((sg) => {
    const o = Object.assign(buildSong(sg), { groupId: S.groupId, showId: sg.showId || S.showId, take: sg.take || 1 });
    S.songs.push(o); added.push(o);
  });
  (d.songs || []).forEach((sg, i) => { if (sg.fromIdx != null && added[sg.fromIdx]) added[i].from = added[sg.fromIdx].id; });
  S.setlistVer = d.version || Date.now();
  if (d.src && d.src !== S.src) S.src = d.src;
  if (d.groupName) { const g = group(); if (g && g.id) g.name = d.groupName; S.srcGroup = d.groupName; }

  const mine = d.authorId && d.authorId === S.deviceId;
  if (!mine && !S.groups.some((g) => g.gistId)) S.viewer = true;
  if (!mine && Array.isArray(d.notes) && d.notes.length) {
    S.pubNotes = d.notes.map((n) => {
      const so = S.songs[n.songIdx];
      if (!so) return null;
      const ids = (n.memberNames || []).map((nm) => addMember(nm).id);
      return Object.assign({}, n, { id: "p" + uid(), songId: so.id, memberIds: ids, ro: true });
    }).filter(Boolean);
    (d.memos || []).forEach((m) => {
      const so = S.songs[m.songIdx];
      if (so) S.memos[m.showId + "|" + so.id] = m.text;
    });
    if (Array.isArray(d.shows) && d.shows.length) {
      const own = S.shows.filter((x) => S.notes.some((n) => n.showId === x.id));
      S.shows = d.shows.concat(own.filter((o) => !d.shows.some((x) => x.id === o.id)));
      const newest = showsNewestFirst()[0];
      if (newest) S.showId = newest.id;
    }
  } else {
    S.pubNotes = [];
  }
  U.songIdx = 0; U.incoming = null;
  save(); render();
}

async function syncSetlist(manual) {
  const d = await fetchSetlist();
  if (d === "nokey" || d === "badkey") {
    const pw = prompt(d === "nokey"
      ? "この配信には合言葉が必要です。Joeから聞いた合言葉を入れてください。"
      : "合言葉が合いません。もう一度入れてください。", "");
    if (pw && pw.trim()) { S.key = pw.trim(); save(); return syncSetlist(manual); }
    return;
  }
  if (!d || !d.songs.length) { if (manual) alert("配信されているセットリストが見つかりませんでした。"); return; }
  if (d.authorId && d.authorId === S.deviceId) {
    if (manual) alert("この端末が配信元です。手元の内容が最新です。");
    return;
  }
  if (!S.songs.length) { applySetlist(d); return; }
  // 別グループの配信につながっていたら、混ざらないよう丸ごと入れ替える
  if (d.groupName && S.srcGroup && d.groupName !== S.srcGroup) {
    resetForNewSource(); applySetlist(d); return;
  }
  if (manual || (d.version && d.version !== S.setlistVer)) { U.incoming = d; render(); }
}

/* ---- 共有リンク：セットリストをURLに入れて渡す ---- */
const b64e = (u8) => {
  let str = "";
  u8.forEach((b) => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64d = (t) => {
  const str = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
  const u8 = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
  return u8;
};


function connectLink(gid) {
  const g = group(gid);
  if (!g.src) { alert("先にこのグループの自動公開を始めてください。"); return; }
  const inLink = g.key && g.keyInLink !== false;
  const payload = JSON.stringify({ src: g.src, key: inLink ? g.key : "" });
  const url = location.origin + location.pathname + "#g=" + b64e(new TextEncoder().encode(payload));
  const msg = !g.key
    ? `${g.name} の接続リンクをコピーしました。\nこのグループのメンバーにだけ送ってください。`
    : inLink
      ? `${g.name} の接続リンクをコピーしました。\n合言葉もリンクに入っているので別送は不要です。`
      : `${g.name} の接続リンクをコピーしました。\n合言葉は別途伝えてください：\n\n${g.key}`;
  copyText(url, msg);
}

async function importFromLink() {
  const g = location.hash.match(/^#g=(.+)$/);
  if (g) {
    history.replaceState(null, "", location.pathname);
    try {
      const before = S.src;
      const txt = new TextDecoder().decode(b64d(g[1]));
      if (txt.charAt(0) === "{") { const o = JSON.parse(txt); S.src = o.src || ""; S.key = o.key || ""; }
      else S.src = txt; // 旧いリンク
      if (!S.groups.some((g) => g.gistId)) {
        S.viewer = true;
        if (before && before !== S.src) resetForNewSource(); // 別グループのリンク
      }
      S.setlistVer = 0; save();
      await syncSetlist(true);
    } catch (e) { alert("接続リンクを読み取れませんでした。"); }
    return;
  }
}

function copyText(t, msg) {
  const done = () => alert(msg || "コピーしました");
  if (navigator.clipboard) { navigator.clipboard.writeText(t).then(done).catch(done); return; }
  const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta);
  ta.select(); document.execCommand("copy"); ta.remove(); done();
}

/* ---------------- boot ---------------- */
load();
render();
importFromLink();
syncSetlist(false);
window.addEventListener("pagehide", () => { commitFields(); save(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { commitFields(); save(); } });
if ("serviceWorker" in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return; reloaded = true; location.reload();
  });
  navigator.serviceWorker.register("sw.js").then((r) => r.update()).catch(() => {});
}
