/* 歌チェック — ライブ本番用 歌割チェックアプリ (offline PWA) */
"use strict";

const KEY = "utacheck.v1";
const APP_VER = "15.2";
const uid = () => Math.random().toString(36).slice(2, 9);
const h = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TAGS = [
  { c: "音程",    id: "pitch",  l: "音程"       },
  { c: "音程",    id: "pHi",    l: "音程高"     },
  { c: "音程",    id: "pLo",    l: "音程低"     },
  { c: "音程",    id: "pUn",    l: "不自然"     },
  { c: "音程",    id: "pWob",   l: "揺れ"       },

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
  { c: "ミス",    id: "gara",   l: "ガラつき"   },
  { c: "ミス",    id: "mic",    l: "マイク"     },
  { c: "ミス",    id: "noise",  l: "ノイズ"     },
  { c: "ミス",    id: "level",  l: "レベル"     },

  { c: "良い",    id: "good",   l: "◎良い"     },
  { c: "良い",    id: "close",  l: "惜しい"     },
  { c: "良い",    id: "oke",    l: "オケ聴く"   },
  { c: "良い",    id: "swap",   l: "差し替え"   },
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
  { id: "pitch",  up: "pHi",    dn: "pLo",    lf: "pUn",    rt: "pWob" },
  { id: "rhythm", up: "fast",   dn: "slow",   lf: "short",  rt: "long" },
  { id: "attack", up: "strong", dn: "weak",   lf: "accent", rt: "diction" },
  { id: "nuance", up: "bright", dn: "dark",   lf: "face",   rt: "mic" },
  { id: "lyric",  up: "flip",   dn: "nuke",   lf: "noise",  rt: "gara" },
  { id: "good",   up: "close",  dn: "level",  lf: "oke",    rt: "swap" },
];
// 以前つけた記録が生IDで出ないように
const LEGACY = { breath: "ブレス", volume: "声量", tone: "声色" };
const tagName = (id) => (TAGS.find((t) => t.id === id) || {}).l || LEGACY[id] || id;

/* ---------------- state ---------------- */
let S = {
  members: [], songs: [], notes: [],
  shows: [], showId: "",
  src: "", setlistVer: 0,
  deviceId: "", pubNotes: [], alertMsg: null, pubAlert: null, alertSeen: "",
  bkGistId: "", bkAt: 0, bkKey: "", bkHash: 0, bkSeen: 0, editPass: "",
  ghToken: "", autoPub: true,
  groups: [], groupId: "",
  src: "", key: "", keyInLink: true,
  memos: {}, recs: {}, kbps: 128, preroll: 5, viewer: false, srcGroup: "",
  draws: {}, showFilter: "", folders: {}, folderOrder: [], rfolders: {}, rfolderOrder: [], subs: {}, subsMan: {}, subLib: {}, gsubs: {},
  recMode: false, recOvSize: 14, rsongs: [], rsongId: "", recBars: true, liveShow: "", recEdit: false, linkSrc: "", groupOrder: [], pubAt: 0, syncAt: 0, seen: {}, planMin: 90, planPrep: 10, rosters: {}, secWords: [], trash: [], secAll: false, secHide: [], tagHide: [],
  plan: { start: "10:00", slots: [] },
  size: 19,
};
let U = { view: "live", songIdx: 0, sheet: null, mode: "member", allShows: false, picker: false, overview: false, ovSize: 9, recPick: null, sumOpen: "", draw: false, erase: false, pick: [], menu: null, printPick: null, focus: "", busy: "", allShowList: false, pdfBack: "", swapId: "", markOnly: false, planDay: "", planSec: "", vtN: 1, rmore: false, wordEdit: "", secOrd: false, secView: "" };

const S0 = JSON.parse(JSON.stringify(S));

async function loadRaw() {
  // まずIndexedDB。新しい方を採り、読めなければ古い方。
  try {
    const a = await idbGet("state:0"), b = await idbGet("state:1");
    idbOK = true;
    const cands = [a, b].filter((x) => x && x.txt).sort((x, y) => (y.seq || 0) - (x.seq || 0));
    for (const c of cands) {
      try { JSON.parse(c.txt); saveSeq = Math.max(saveSeq, c.seq || 0); return c.txt; }
      catch (e) { /* 壊れていたら次 */ }
    }
  } catch (e) { idbOK = false; }
  try { return localStorage.getItem(KEY); } catch (e) { return null; }
}
let booted = false;      // 起動の読み込みが済んだか
let touched = false;     // 読み込みの前に、こちらで何か触ったか
async function load() {
  let raw = null;
  try {
    raw = await loadRaw();
    // 読み込みを待っている間に取り込みなどをしていたら、その内容を消さない
    if (raw && !touched) S = Object.assign(S, unpackState(JSON.parse(raw)));
  } catch (e) { /* 初回、または壊れている */ }
  try {
    migrate();
  } catch (e) {
    // 古いデータの変換でつまずいた場合。消さずに横に退避して、まっさらで開く。
    try {
      if (raw) localStorage.setItem(KEY + ":broken:" + Date.now(), raw);
      localStorage.removeItem(KEY);
    } catch (e2) { /* 保存できない場合は諦める */ }
    S = JSON.parse(JSON.stringify(S0));
    bootErr = "前のデータを読めなかったため、まっさらで開きました。\n古いデータは端末内に残してあります。";
    try { migrate(); } catch (e3) { /* ここで転ぶなら何もできない */ }
  }
}

let bootErr = "";
function migrate() {
  // 表記を日本語から英語へ、そして連番へ。
  // 「ガヤ」が2行あれば Gaya1 Gaya2 になる。Pro Tools のマーカー名と揃えるため。
  try {
    [S.songs, S.rsongs].forEach((list) => {
      (list || []).forEach((so) => {
        const cnt = {};
        (so.lines || []).forEach((l) => {
          if (!l || !l.tag) return;
          if (/\d$/.test(l.tag)) return;               // すでに番号付きなら触らない
          const base = TAGMAP[l.tag] || l.tag;
          cnt[base] = (cnt[base] || 0) + 1;
          l.tag = base + cnt[base];
        });
      });
    });
    S.tagWords = (S.tagWords || []).map((x) => TAGMAP[x] || x);
  } catch (e) { /* 変換できないものはそのまま残す */ }

  // 旧データの引き継ぎ：公演名の文字列しか無かったものを公演として作り直す
  if (!S.shows || !S.shows.length) {
    const id = uid();
    S.shows = [{ id, name: S.show || todayLabel(), ts: Date.now() }];
    S.notes.forEach((n) => { if (!n.showId) n.showId = id; });
  }
  if (!S.shows.some((x) => x.id === S.showId)) S.showId = S.shows[0].id;
  if (!S.deviceId) S.deviceId = uid() + uid();
  if (!S.memos) S.memos = {};
  // 差し替えの時に一時的にメモへ書き足していた ［元：〜］ を片付ける。
  // 元の歌詞が残っているので、合う行があればそこへ戻してから消す。
  // メンバー側の指摘は S.pubNotes に入る。両方を見る。
  [].concat(S.notes || [], S.pubNotes || []).forEach((n) => {
    const m = /^［元：([\s\S]*?)］[\s　]*/.exec(n.memo || "");
    if (!m) return;
    n.memo = String(n.memo).slice(m[0].length);
    const so = (S.songs || []).find((x) => x.id === n.songId);
    if (!so || !so.lines) return;
    const a = normT(m[1]);
    let j = so.lines.findIndex((l) => aliveLine(l) && normT(l.t) === a);
    if (j < 0) {
      let bv = 0.6;
      so.lines.forEach((l, k) => {
        if (!aliveLine(l)) return;
        const v = overlapRate(a, normT(l.t));
        if (v > bv) { bv = v; j = k; }
      });
    }
    if (j >= 0) { n.lineIdx = j; n.lineEnd = null; n.from = null; n.to = null; }
  });
  if (!S.recs) S.recs = {};
  if (!S.draws) S.draws = {};
  if (!S.folders) S.folders = {};
  if (!S.folderOrder) S.folderOrder = [];
  if (!S.rfolders) S.rfolders = {};
  if (!S.rfolderOrder) S.rfolderOrder = [];
  if (!S.subs) S.subs = {};
  if (!S.subsMan) S.subsMan = {};
  if (!S.subLib) S.subLib = {};
  if (!S.gsubs) S.gsubs = {};
  if (!S.rsongs) S.rsongs = [];
  if (!S.recOvSize) S.recOvSize = 14;
  if (!S.plan) S.plan = { start: "10:00", slots: [] };
  if (S.planAuto == null) S.planAuto = false;
  if (!S.planMin) S.planMin = 90;
  if (S.planPrep == null) S.planPrep = 10;
  if (!S.secWords) S.secWords = [];
  if (!S.trash) S.trash = [];
  purgeTrash();
  if (!S.rosters) S.rosters = {};
  if (!S.seen) S.seen = {};
  purgeRecs();
  if (!S.plan.slots) S.plan.slots = [];
  if (S.recBars == null) S.recBars = true;
  if (S.secAll == null) S.secAll = false;
  if (!S.secHide) S.secHide = [];
  if (!S.tagHide) S.tagHide = [];
  // 「ソロ想定」だけだった頃のデータを、想定の一つとして引き継ぐ
  [].concat(S.rsongs || [], S.songs || []).forEach((so) => {
    (so.lines || []).forEach((l) => { if (l.solo && !l.vt) l.vt = "ソロ"; });
  });
  // 古いデータにも、その曲に出てくる人の名簿を持たせる
  if (orderTakes()) save();
  S.songs.forEach((so) => {
    if (!so.roster || !so.roster.length) so.roster = songRoster(so);
    if (!so.sig) so.sig = songSig(so);
    // 古い取り込みには歌詞のセル番地が無い。名前の列から推し量って補う。
    if (so.lines.some((l) => l.cell && !l.lcell)) {
      const cn = (t) => { let n = 0; for (let i = 0; i < t.length; i++) n = n * 26 + (t.charCodeAt(i) - 64); return n; };
      const cs = (n) => { let t = ""; while (n > 0) { const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = (n - m - 1) / 26; } return t; };
      const cols = [];
      so.lines.forEach((l) => {
        const m = /^([A-Z]+)(\d+)$/.exec(l.cell || "");
        if (m && !cols.includes(m[1])) cols.push(m[1]);
      });
      cols.sort((a, b) => cn(a) - cn(b));
      // 名前の列が2つなら、その間隔から歌詞の列を割り出す（名前・空欄・歌詞 の並び）
      const gap = cols.length >= 2 ? cn(cols[1]) - cn(cols[0]) : 3;
      so.lines.forEach((l) => {
        const m = /^([A-Z]+)(\d+)$/.exec(l.cell || "");
        if (!m || l.lcell) return;
        l.lcell = cs(cn(m[1]) + Math.max(1, Math.min(3, gap - 1))) + m[2];
      });
    }
  });
  sweep();
  S.kbps = 128;
  if (S.preroll == null || S.preroll > 10) S.preroll = 5;
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
// 選んだグループの曲がある公演だけを出す（曲がまだ無い公演と、今開いている公演は常に出す）
// 歌詞と担当の並びから、その曲の指紋を作る。曲名は見ない。
function songSig(so) {
  if (!so) return 0;
  const body = so.lines.map((l) => (l.gap ? "" : ((l.parts || []).join(",") + "\u0001" + (l.t || "")))).join("\u0002");
  return hash32(body);
}
const sigOf = (so) => { if (!so) return 0; if (!so.sig) so.sig = songSig(so); return so.sig; };

// その曲に出てくる人
function songRoster(so) {
  if (!so) return [];
  if (so.roster && so.roster.length) return so.roster;
  const out = [];
  so.lines.forEach((l) => {
    if (/^全/.test(l.label || "")) return;      // 「全」の行は全員が入っているので数えない
    (l.parts || []).forEach((p) => { if (!out.includes(p)) out.push(p); });
  });
  return out;
}
const showRoster = () => {
  const out = [];
  SONGS().forEach((so) => songRoster(so).forEach((p) => { if (!out.includes(p)) out.push(p); }));
  return out;
};

const folderOf = (sw) => (sw && sw.folder) ? sw.folder : "";
// レコーディングの曲をフォルダごとにまとめる（ライブの公演と同じ並べ方）
function groupRSongs(list) {
  const map = new Map();
  list.forEach((x) => {
    const k = folderOf(x);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(x);
  });
  const keys = [...map.keys()].filter(Boolean);
  const newest = (k) => Math.max.apply(null, map.get(k).map((x) => Number(x.at || 0)));
  const ord = S.rfolderOrder || [];
  keys.sort((a, b) => {
    const ia = ord.indexOf(a), ib = ord.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    return newest(b) - newest(a);
  });
  if (map.has("")) keys.push("");
  return keys.map((k) => [k, map.get(k)]);
}
function groupShows(list) {
  const map = new Map();
  list.forEach((sw) => {
    const k = folderOf(sw);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(sw);
  });
  const keys = [...map.keys()].filter(Boolean);
  const newest = (k) => Math.max.apply(null, map.get(k).map((x) => Number(x.ts || 0)));
  const ord = S.folderOrder || [];
  keys.sort((a, b) => {
    const ia = ord.indexOf(a), ib = ord.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);   // 手で並べたものが先
    return newest(b) - newest(a);                                              // それ以外は新しい順
  });
  if (map.has("")) keys.push("");
  return keys.map((k) => [k, map.get(k)]);
}

function showsFor() {
  const gid = S.showFilter;
  const all = showsNewestFirst().filter((x) => !x.hidden);
  if (!gid || !S.groups.some((g) => g.id === gid)) return all;
  return all.filter((sw) => sw.id === S.showId
    || !S.songs.some((x) => x.showId === sw.id)
    || S.songs.some((x) => x.showId === sw.id && x.groupId === gid));
}
const showsNewestFirst = () => S.shows.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
const showName = (id) => (S.shows.find((x) => x.id === (id || S.showId)) || {}).name || "";
const NOTES = () => S.notes.concat(S.pubNotes);
// いま録っているテイク。指摘や手書きは、テイクごとに分けて覚える。
// ライブモードでは使わない（空文字＝テイクの区別なし）。
function takeCtx() {
  if (!S.recMode || !S.plan) return "";
  const live = (S.plan.slots || []).find((x) => x.a0 != null && x.a1 == null);
  if (!live || !live.secCur) return "";
  const n = Math.max(1, Number((live.takes || {})[live.secCur] || 1));
  return live.id + "/" + live.secCur + "#" + n;
}
// その指摘が、いま見ているテイクのものか
const inTake = (n) => {
  const t = takeCtx();
  if (!t) return !n.tk;             // ライブモードでは、テイク付きの記録は出さない
  return (n.tk || "") === t;
};

/* ---- 欠席対応 ---- */
const absentIds = (showId) => ((S.shows.find((x) => x.id === (showId || S.showId)) || {}).absent || []);
const subKey = (songId) => S.showId + "|" + songId;
// A/B などのブロックは、ブロックの中身から欠席者を抜く（行ごとには触らない）
const blockOf = (so, i) => {
  const l = so.lines[i] || {};
  const lb = (l.label || "").trim();
  return (so.blocks && so.blocks[lb]) ? lb : "";
};
const gsubOf = (songId, b) => {
  const m = S.gsubs[subKey(songId)];
  return m && m[b] ? m[b] : null;
};
const blockParts = (so, b) => gsubOf(so.id, b) || (so.blocks ? so.blocks[b] : []) || [];
const subOf = (songId, i) => {
  const m = S.subs[subKey(songId)];
  return m && m[i] ? m[i] : null;
};
// その行を実際に歌う人
const partsOf = (so, i) => {
  const sub = subOf(so.id, i);
  if (sub) return sub;
  const b = blockOf(so, i);
  if (b) return blockParts(so, b);
  return (so.lines[i] || {}).parts || [];
};
// 画面に出す名前。差し替えがあればその名前を出す。
// 差し替え後の顔ぶれを、本編とハモに振り分ける。
// 欠けたのがハモ側だけなら、補充した人もハモ側に置く。
function splitAssign(so, i) {
  const l = so.lines[i] || {};
  const now = partsOf(so, i);
  const oldMain = l.main || l.parts || [];
  const oldExtra = l.extra || [];
  if (!oldExtra.length) return { main: now, extra: [] };
  const ab = absentIds();
  const lostMain = oldMain.filter((p) => ab.includes(p)).length;
  const lostExtra = oldExtra.filter((p) => ab.includes(p)).length;
  const keepMain = now.filter((p) => oldMain.includes(p));
  const keepExtra = now.filter((p) => oldExtra.includes(p));
  const added = now.filter((p) => !oldMain.includes(p) && !oldExtra.includes(p));
  const toExtra = (lostExtra && !lostMain);
  return {
    main: toExtra ? keepMain : keepMain.concat(added),
    extra: toExtra ? keepExtra.concat(added) : keepExtra,
  };
}

// その曲の指摘の中身をひとまとめにした印。変わったかどうかの判定に使う。
function noteSig(so) {
  if (!so) return 0;
  const ns = NOTES().filter((n) => n.songId === so.id)
    .map((n) => [n.lineIdx, n.lineEnd, n.from, n.to, (n.tags || []).join(","), n.memo, n.pitch,
      (n.memberIds || []).map((m) => (member(m) || {}).name).sort().join("・")].join(":"))
    .sort().join("|");
  // 曲は公演に属するので、今どの公演を開いているかに関係なく、その曲の総括を見る
  const mk = (so.showId || S.showId) + "|" + so.id;
  return hash32(ns + "//" + ((S.memos || {})[mk] || ""));
}
const seenKey = (so) => so ? (so.showId + "|" + so.title + "|" + (so.take || 1)) : "";
const isUnread = (so) => VIEW() && so && noteSig(so) !== (S.seen || {})[seenKey(so)];
const unreadSongs = () => (VIEW() ? SONGS().filter(isUnread) : []);
function markRead(so) {
  if (!VIEW() || !so) return;
  const k = seenKey(so), sig = noteSig(so);
  if ((S.seen || {})[k] === sig) return;
  S.seen = S.seen || {};
  S.seen[k] = sig;
  // もう無い曲の分は捨てる。
  // ここで今の公演の曲だけを見ると、他の公演の既読が毎回消えて、
  // 公演を切り替えるたびに全部が未読に戻ってしまう。全公演を対象にする。
  const alive = S.songs.map(seenKey);
  Object.keys(S.seen).forEach((x) => { if (!alive.includes(x)) delete S.seen[x]; });
  save();
}

// メンバーが「最新を見ているか」を一目で分かるようにする
function freshLine() {
  if (!VIEW() || !S.pubAt) return "";
  const when = new Date(S.pubAt);
  const stamp = `${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  const last = S.syncAt || syncAt || 0;
  const late = last ? Math.floor((Date.now() - last) / 60000) : 999;
  const un = unreadSongs().length;
  const stale = late >= 3 ? `<span style="color:var(--bad)">　${late > 60 ? "1時間以上" : late + "分"}前から未接続</span>` : "";
  return un
    ? `<span style="color:var(--accent);font-weight:700">未読 ${un}曲</span><span style="color:var(--dim)">　${stamp} の歌割</span>${stale}`
    : `<span style="color:var(--good)">すべて確認済み</span><span style="color:var(--dim)">　${stamp} の歌割</span>${stale}`;
}

// 注目するメンバーは、その曲のグループの名簿にいる人だけ
function focusList() {
  const so = song();
  if (!so) return [];
  const gn = (S.groups.find((g) => g.id === so.groupId) || {}).name || "";
  const ros = (S.rosters || {})[gn];
  const inSong = songRoster(so).map((mid) => member(mid)).filter(Boolean);
  if (!ros || !ros.length) return inSong;
  return ros.map((nm) => inSong.find((m) => m.name === nm)).filter(Boolean);
}

const isAgeri = (l) => (l || {}).label === "煽り" || (l || {}).labelRaw === "煽り";
// 歌詞の無い空きにも指摘を付けられる。
// 何の区間かは資料に書いていないので、こちらで名前を付けない（間奏とは限らない）。
// 記録シートでだけ、前後の歌詞から場所が分かるようにする。
function gapWhere(so, i) {
  if (!so || !(so.lines[i] || {}).gap) return "";
  const has = (l) => l && !l.gap && l.t;
  for (let k = i - 1; k >= 0; k--) if (has(so.lines[k])) return "「" + so.lines[k].t + "」のあと";
  for (let k = i + 1; k < so.lines.length; k++) if (has(so.lines[k])) return "「" + so.lines[k].t + "」のまえ";
  return "";
}
// 名前を出す。「ハモ ◯◯」の部分は色を変えて、ひと目で分かるようにする。
function labelHTML(so, i) {
  const t = labelOf(so, i);
  if (!t) return "";
  const m = /^([\s\S]*?)[\s　]*((?:ハモ|コーラス|Cho)[\s\S]*)$/.exec(t);
  if (!m) return h(t);
  return `${h(m[1])}${m[1] ? "<br>" : ""}<b class="hamomk">${h(m[2])}</b>`;
}

function labelOf(so, i) {
  const l = so.lines[i] || {};
  if (S.recMode) {
    const b = barsOf(so)[i];
    return (l.sec ? l.sec + " " : "") + (S.recBars && b != null ? b : "");
  }
  // 続きの行（結合セルの2行目以降）は、元と同じで名前を出さない。
  // ここで名前を出すと、ひとまとまりの歌割が行ごとに分かれて見える。
  if (l.cont) return l.label || "";
  if (subOf(so.id, i)) {
    const sp = splitAssign(so, i);
    return (names(sp.main) || "—") + (sp.extra.length ? "　ハモ " + names(sp.extra) : "");
  }
  return l.label || "";
}

// 赤＝まだ決まっていない、黄＝変更済み
function lineStatus(so, i) {
  const l = so.lines[i] || {};
  if (l.gap) return "";
  if (/^全/.test(l.labelRaw || l.label || "")) return "";   // 「全」は見れば分かるので触らない
  // 歌割が書かれていない行（カットした所など）は触らない
  if (!(l.parts || []).length && !(l.labelRaw || l.label)) return "";
  if (subOf(so.id, i)) return "changed";
  const ab = absentIds();
  if (!ab.length) return "";
  if (blockOf(so, i)) return "";   // A/B の行は「全」と同じ。ブロックの中身の方を直す。
  return (l.parts || []).some((p) => ab.includes(p)) ? "need" : "";
}
// ブロックの状態
function blockStatus(so, b) {
  const ab = absentIds();
  if (!ab.length) return "";
  if (gsubOf(so.id, b)) return "changed";
  return ((so.blocks && so.blocks[b]) || []).some((p) => ab.includes(p)) ? "need" : "";
}
const blocksOf = (so) => Object.keys((so && so.blocks) || {});
// その歌割をいつ取り込んだか。古いデータは xlsAt しか持っていない。
const impOf = (so) => (so && (so.impAt || so.xlsAt)) || 0;
const impLabel = (t) => t ? new Date(t).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "";
// 同じ曲名で、もっと新しく取り込んだものが他の公演にあるか
function staleBy(so) {
  const mine = impOf(so);
  if (!mine) return 0;
  let newest = 0;
  S.songs.forEach((x) => {
    if (x.id === so.id || x.title !== so.title) return;
    const t = impOf(x);
    if (t > newest) newest = t;
  });
  return newest > mine ? newest : 0;
}
// A / B などのブロックの中身を、歌詞の上に細く出す
function blockBar(so) {
  const bs = blocksOf(so);
  if (!bs.length) return "";
  return `<div class="blk">${bs.map((b) => {
    const st = blockStatus(so, b);
    const col = st === "need" ? "var(--bad)" : st === "changed" ? "#F0B23C" : "var(--dim)";
    return `<button class="blkc" ${VIEW() ? "" : `data-act="assignblock" data-id="${so.id}" data-b="${h(b)}"`}
      style="color:${col}"><b style="color:${st ? col : "var(--text)"}">${h(b)}</b> ${h(names(blockParts(so, b)) || "—")}</button>`;
  }).join("")}</div>`;
}
// 2人以上の行から欠席者を抜く。ソロと全員欠席の行は赤のまま残す。
function autoSubs() {
  const ab = absentIds();
  if (!ab.length) return 0;
  let n = 0;
  SONGS().forEach((so) => {
    const k = subKey(so.id);
    // まずブロックの中身から欠席者を抜く
    blocksOf(so).forEach((b) => {
      const g = S.gsubs[k];
      if (g && g[b]) return;
      const cur = so.blocks[b] || [];
      if (!cur.some((p) => ab.includes(p))) return;
      const rest = cur.filter((p) => !ab.includes(p));
      if (!rest.length) return;                // 全員抜けたら赤のまま
      S.gsubs[k] = S.gsubs[k] || {};
      S.gsubs[k][b] = rest;
      n++;
    });
    so.lines.forEach((l, i) => {
      if (l.gap || !l.parts || !l.parts.length) return;
      if (/^全/.test(l.labelRaw || l.label || "")) return;   // 「全」は触らない
      if (blockOf(so, i)) return;              // ブロックの行はブロック側で扱う
      if (S.subs[k] && S.subs[k][i]) return;
      if (!l.parts.some((p) => ab.includes(p))) return;
      const rest = l.parts.filter((p) => !ab.includes(p));
      if (l.parts.length > 1 && rest.length) {
        S.subs[k] = S.subs[k] || {};
        S.subs[k][i] = rest;
        n++;
      }
    });
  });
  if (n) save();
  return n;
}
// 一度決めた振り分けは覚えておく。曲名・グループ・欠席の顔ぶれが同じなら次も使う。
const libKey = (so) => `${sigOf(so)}|${so.groupId}|${absentIds().slice().sort().join(",")}`;
function rememberSub(so, i, ids) {
  const l = so.lines[i] || {};
  const k = libKey(so);
  const e = S.subLib[k] && S.subLib[k].lines ? S.subLib[k] : { lines: {} };
  e.lines[i] = { t: l.t || "", from: (l.parts || []).join(","), to: ids.slice() };
  e.showId = S.showId;
  e.name = showName();
  e.at = Date.now();
  S.subLib[k] = e;
}
// 覚えている振り分けを当てはめる。歌詞と元の歌割が一致する行だけ。
function applyLib() {
  if (!absentIds().length) return { n: 0, from: "" };
  let n = 0, from = "", at = 0;
  SONGS().forEach((so) => {
    const box = S.subLib[libKey(so)];
    if (!box) return;
    const lib = box.lines || box;
    if (box.showId === S.showId) return;      // 同じ公演のものは引き継ぎではない
    if ((box.at || 0) > at) { at = box.at || 0; from = box.name || ""; }
    const k = subKey(so.id);
    Object.keys(lib).forEach((i) => {
      const e = lib[i], l = so.lines[i];
      if (!l || l.t !== e.t || (l.parts || []).join(",") !== e.from) return;
      if (S.subsMan[k] && S.subsMan[k][i]) return;
      S.subs[k] = S.subs[k] || {};
      S.subs[k][i] = e.to.slice();
      S.subsMan[k] = S.subsMan[k] || {};
      S.subsMan[k][i] = 1;
      n++;
    });
  });
  return { n, from };
}
let libFrom = "";

// 欠席が変わった時に組み直す。自分で決めた分は、まだ必要なときだけ残す。
function rebuildSubs() {
  const ab = absentIds();
  SONGS().forEach((so) => {
    const k = subKey(so.id);
    // ブロックは自動で作り直すので、いったん全部捨てる
    if (S.gsubs[k]) {
      Object.keys(S.gsubs[k]).forEach((b) => {
        const cur = (so.blocks && so.blocks[b]) || [];
        if (!ab.length || !cur.some((p) => ab.includes(p))) delete S.gsubs[k][b];
      });
      if (!Object.keys(S.gsubs[k]).length) delete S.gsubs[k];
    }
    const m = S.subs[k];
    if (!m) return;
    Object.keys(m).forEach((i) => {
      const l = so.lines[i] || {};
      const still = ab.length && (l.parts || []).some((p) => ab.includes(p));
      const manual = S.subsMan[k] && S.subsMan[k][i];
      if (!still || !manual) {
        delete m[i];
        if (S.subsMan[k]) delete S.subsMan[k][i];
      }
    });
    if (!Object.keys(m).length) delete S.subs[k];
    if (S.subsMan[k] && !Object.keys(S.subsMan[k]).length) delete S.subsMan[k];
  });
  autoSubs();
  libFrom = applyLib().from;
}

// 同じ歌割が続く行のまとまりを返す
function runAt(so, i) {
  const st = lineStatus(so, i);
  if (!st) return [i];
  const sig = (j) => ((so.lines[j] || {}).parts || []).join(",") + "|" + lineStatus(so, j);
  const base = sig(i);
  const idx = [i];
  for (let j = i - 1; j >= 0 && sig(j) === base; j--) idx.unshift(j);
  for (let j = i + 1; j < so.lines.length && sig(j) === base; j++) idx.push(j);
  return idx;
}

const needCount = () => SONGS().reduce((a, so) => a
  + so.lines.filter((l, i) => lineStatus(so, i) === "need" && !blockOf(so, i)).length
  + blocksOf(so).filter((b) => blockStatus(so, b) === "need").length, 0);
const changedCount = () => SONGS().reduce((a, so) => a
  + so.lines.filter((l, i) => lineStatus(so, i) === "changed" && !blockOf(so, i)).length
  + blocksOf(so).filter((b) => blockStatus(so, b) === "changed").length, 0);

// 録音は30日で自動的に消す（容量を食うため）
const REC_DAYS = 30;
function purgeRecs() {
  const lim = Date.now() - REC_DAYS * 86400000;
  const keep = trashClips();
  let n = 0;
  Object.keys(S.recs || {}).forEach((k) => {
    const r = S.recs[k];
    if (!r || !r.ts || r.ts >= lim) return;
    if (keep.indexOf(k) >= 0) return;          // ゴミ箱にある分は残す
    delClip(k); delete S.recs[k]; n++;
  });
  if (n) save();
  return n;
}

/* ---- ゴミ箱（30日は戻せる） ---- */
const TRASH_DAYS = 30;
const trashClips = () => {
  const out = [];
  (S.trash || []).forEach((t) => (t.clips || []).forEach((k) => out.push(k)));
  return out;
};
function purgeTrash() {
  const lim = Date.now() - TRASH_DAYS * 86400000;
  const keep = [], gone = [];
  (S.trash || []).forEach((t) => (t.at < lim ? gone.push(t) : keep.push(t)));
  if (!gone.length) return;
  gone.forEach((t) => (t.clips || []).forEach((k) => delClip(k)));
  S.trash = keep;
  save();
}
// 消す前に、戻せるように控えておく
function toTrash(kind, label, songs, shows) {
  const sids = songs.map((x) => x.id);
  const shids = (shows || []).map((x) => x.id);
  const pick = (obj) => {
    const o = {};
    Object.keys(obj || {}).forEach((k) => {
      const p = k.split("|");
      if (sids.includes(p[1]) || shids.includes(p[0])) o[k] = obj[k];
    });
    return o;
  };
  const clips = [];
  songs.forEach((x) => { if (x.xls) clips.push("xls:" + x.id); });
  const recs = pick(S.recs);
  Object.keys(recs).forEach((k) => clips.push(k));
  S.trash.unshift({
    id: uid(), at: Date.now(), kind, label,
    songs: JSON.parse(JSON.stringify(songs)),
    shows: JSON.parse(JSON.stringify(shows || [])),
    notes: JSON.parse(JSON.stringify(S.notes.filter((n) => sids.includes(n.songId) || shids.includes(n.showId)))),
    memos: pick(S.memos), draws: pick(S.draws), subs: pick(S.subs),
    subsMan: pick(S.subsMan), gsubs: pick(S.gsubs), recs,
    clips,
  });
  if (S.trash.length > 200) S.trash.pop();
}
function fromTrash(tid) {
  const t = (S.trash || []).find((x) => x.id === tid);
  if (!t) return;
  (t.shows || []).forEach((sw) => { if (!S.shows.some((x) => x.id === sw.id)) S.shows.push(sw); });
  (t.songs || []).forEach((so) => {
    if (t.kind === "rec") { if (!S.rsongs.some((x) => x.id === so.id)) S.rsongs.push(so); }
    else if (!S.songs.some((x) => x.id === so.id)) S.songs.push(so);
  });
  (t.notes || []).forEach((n) => { if (!S.notes.some((x) => x.id === n.id)) S.notes.push(n); });
  ["memos", "draws", "subs", "subsMan", "gsubs", "recs"].forEach((k) => {
    Object.keys(t[k] || {}).forEach((kk) => { S[k][kk] = t[k][kk]; });
  });
  S.trash = S.trash.filter((x) => x.id !== tid);
  save(); schedulePush();
}
function dropTrash(tid) {
  const t = (S.trash || []).find((x) => x.id === tid);
  if (!t) return;
  (t.clips || []).forEach((k) => delClip(k));
  S.trash = S.trash.filter((x) => x.id !== tid);
  save();
}

// 同じ曲のテイクは、新しいものから順に並べる
function orderTakes() {
  const key = (x) => x.showId + "|" + x.groupId + "|" + x.title;
  const groups = {};
  S.songs.forEach((x, i) => { const k = key(x); (groups[k] = groups[k] || []).push(i); });
  let moved = false;
  Object.keys(groups).forEach((k) => {
    const pos = groups[k];
    if (pos.length < 2) return;
    const items = pos.map((i) => S.songs[i]);
    const sorted = items.slice().sort((a, b) => Number(b.take || 1) - Number(a.take || 1));
    if (sorted.some((x, i) => x !== items[i])) moved = true;
    pos.forEach((i, n) => { S.songs[i] = sorted[n]; });
  });
  return moved;
}

// 曲や公演を消したときに残る、行き場のないデータを片付ける
function sweep() {
  // レコーディングの曲は S.songs に居ない。ここに入れ忘れると、
  // その曲に付けた手書き・メモ・録音・指摘が起動のたびに消える。
  const songIds = S.songs.map((x) => x.id).concat((S.rsongs || []).map((x) => x.id));
  const showIds = S.shows.map((x) => x.id);
  const alive = (k) => {
    const p = String(k).split("|");
    return showIds.includes(p[0]) && (p.length < 2 || songIds.includes(p[1]));
  };
  ["subs", "subsMan", "gsubs", "memos", "draws"].forEach((name) => {
    Object.keys(S[name] || {}).forEach((k) => { if (!alive(k)) delete S[name][k]; });
  });
  const keepClips = trashClips();
  Object.keys(S.recs || {}).forEach((k) => {
    if (!alive(k)) { if (!keepClips.includes(k)) delClip(k); delete S.recs[k]; }
  });
  songIds.forEach(() => {});
  S.notes = S.notes.filter((n) => songIds.includes(n.songId) && showIds.includes(n.showId));
}

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
    (anc.includes(x.id) || (sigOf(x) === sigOf(me) && x.groupId === me.groupId && older.has(x.showId)))
  ).map((x) => x.id);
  const ns = NOTES().filter((n) => ids.includes(n.songId) && n.lineIdx === lineIdx && !n.tags.includes("good"));
  return { count: [...new Set(ns.map((n) => n.songId))].length, notes: ns };
}
const memoKey = (songId) => S.showId + "|" + songId;
const songMemo = (songId) => (S.memos || {})[memoKey(songId)] || "";
const shownNotes = () => (U.allShows ? NOTES() : NOTES().filter((n) => n.showId === S.showId));
let pushTimer = null, pushState = "";
let undoStack = [];
let readTimer = null;
function pushUndo(songId) {
  const snap = { notes: S.notes, rsongs: S.rsongs, plan: S.plan,
    shows: S.shows, folders: S.folders, folderOrder: S.folderOrder };
  // 歌割を差し替える時だけ、その1曲と代役も控える。
  // 全曲を毎回控えるとメモリを食うので、必要な時に限る。
  if (songId) {
    const so = S.songs.find((x) => x.id === songId);
    if (so) snap.song = so;
    snap.subs = S.subs; snap.subsMan = S.subsMan;
  }
  undoStack.push(JSON.stringify(snap));
  if (undoStack.length > 40) undoStack.shift();
}
let saveErr = false;
let preview = null;                    // メンバーの見え方を確認中は、手元に保存しない

// 同じ曲を公演の数だけ持つと、歌詞が丸ごと複製されて保存領域を食い潰す。
// 保存する時だけ歌詞を1か所にまとめ、読み込む時に配り直す。
// （曲ごとに別の複製を渡すので、片方を直してももう片方は変わらない）
function packState(src) {
  const c = Object.assign({}, src);
  const lib = [], seen = new Map();
  c.songs = (src.songs || []).map((x) => {
    const y = Object.assign({}, x);
    const k = JSON.stringify(x.lines || []);
    let i = seen.get(k);
    if (i == null) { i = lib.length; lib.push(x.lines || []); seen.set(k, i); }
    delete y.lines; y.L = i;
    return y;
  });
  c.songLib = lib;
  return c;
}
function unpackState(o) {
  if (!o || !Array.isArray(o.songLib)) return o;
  const lib = o.songLib;
  o.songs = (o.songs || []).map((x) => {
    const y = Object.assign({}, x);
    if (y.L != null) {
      y.lines = JSON.parse(JSON.stringify(lib[y.L] || []));
      delete y.L;
    }
    if (!Array.isArray(y.lines)) y.lines = [];
    return y;
  });
  delete o.songLib;
  return o;
}

// 保存に失敗したら、まず自分で空きを作ってから もう一度試す。
// 消すのは「読めなくなった取り残し」だけ。中身が残っているものは勝手に消さない。
function freeSpace() {
  let freed = 0;
  try {
    const junk = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf(KEY + ":broken:") !== 0) continue;
      const v = localStorage.getItem(k) || "";
      let empty = true;
      try {
        const o = unpackState(JSON.parse(v));
        empty = !((o.songs || []).length || (o.notes || []).length);
      } catch (e) { empty = true; }      // 読めないものは残しても使えない
      if (empty) junk.push(k);
    }
    junk.forEach((k) => { localStorage.removeItem(k); freed++; });
  } catch (e) { /* 数えられない端末もある */ }
  return freed;
}
// 保存はIndexedDBへ。書き込みは非同期なので、呼ばれた直後の分をまとめて書く。
// 交互に2か所へ書き、片方が途中で切れても もう片方が残るようにする。
let idbOK = false;                 // IndexedDBが使えるか（起動時に判定）
let saveTimer = null, saveSeq = 0, saving = false, savePend = null;
async function flushSave() {
  if (saving || savePend == null) return;
  saving = true;
  const txt = savePend; savePend = null;
  try {
    saveSeq++;
    await idbPut("state:" + (saveSeq % 2), { at: Date.now(), seq: saveSeq, txt });
    saveErr = false;
  } catch (e) {
    // IndexedDBが使えない端末では、今まで通りlocalStorageに置く
    try { localStorage.setItem(KEY, txt); saveErr = false; }
    catch (e2) {
      if (freeSpace()) { try { localStorage.setItem(KEY, txt); saveErr = false; } catch (e3) { saveErr = true; } }
      else saveErr = true;
    }
  }
  saving = false;
  if (savePend != null) flushSave();
}
function save() {
  if (preview) return;
  if (!booted) touched = true;      // 起動の読み込みより先に触った
  const txt = JSON.stringify(packState(S));
  if (!idbOK) {                    // IndexedDBが使えない時だけ、今まで通り
    try { localStorage.setItem(KEY, txt); saveErr = false; return; }
    catch (e) { /* 空きを作って もう一度 */ }
    if (freeSpace()) {
      try { localStorage.setItem(KEY, txt); saveErr = false; return; }
      catch (e) { /* それでも足りない */ }
    }
    saveErr = true;
    return;
  }
  savePend = txt;
  saveErr = false;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 120);
}
// 画面を閉じる時など、待たずに書き切る
function saveNow() { clearTimeout(saveTimer); return flushSave(); }

const REC_SHOW = "rec";
const SONGS = () => (S.recMode
  ? S.rsongs.slice()
  : S.songs.filter((x) => x.showId === S.showId));
// 同じ曲に複数テイクがあれば、テイク1にも番号を出す。
// 1本しかない曲には付けない（全曲に「テイク1」が並ぶと読みにくいため）。
// レコーディングでは常に番号を出す（テイク1も）。
// ライブでは、同じ曲に複数テイクがある時だけ出す。
const takeLabel = (x) => {
  if (!x) return "";
  const n = Number(x.take || 1);
  if (S.recMode || n > 1) return `テイク${n}`;
  const same = (S.songs || []).filter((y) => y && y.title === x.title
    && y.showId === x.showId && y.groupId === x.groupId);
  return same.length > 1 ? `テイク${n}` : "";
};
const songName = (x) => x ? ((takeLabel(x) ? takeLabel(x) + "　" : "") + x.title) : "";
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
  return pid ? S.songs.find((x) => x.showId === pid && sigOf(x) === sigOf(so) && x.groupId === so.groupId) : null;
}
// この曲をもう1回ぶん複製する（歌割りだけ引き継ぎ、記録は空）
const nextTake = (so) => {
  if (!so) return 2;
  if (S.recMode) return Number(so.take || 1) + 1;          // レコーディングは曲ごとの通し番号
  const same = S.songs.filter((x) => x.showId === so.showId && x.title === so.title && x.groupId === so.groupId);
  if (!same.length) return Number(so.take || 1) + 1;
  return Math.max.apply(null, same.map((x) => Number(x.take || 1))) + 1;
};

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
  // 新しいテイクを、その曲のかたまりの先頭に置く（最新から順に見えるように）
  const at = Math.min.apply(null, same.map((x) => S.songs.indexOf(x)));
  S.songs.splice(Math.max(0, at), 0, copy);
  U.songIdx = SONGS().indexOf(copy);
  U.picker = false;
  autoSubs();
  save(); schedulePush(); render();
}
const song = () => { const a = SONGS(); return a[Math.min(U.songIdx, a.length - 1)] || null; };
const member = (id) => S.members.find((m) => m.id === id);
const names = (ids) => (ids || []).map((i) => (member(i) || {}).name).filter(Boolean).join("・");

function addMember(name) {
  let m = S.members.find((x) => x.name === name);
  if (!m) { m = { id: uid(), name }; S.members.push(m); }
  return m;
}

/* ---------------- 歌割データ → 曲 ---------------- */
// rows: [[label, text], ...]  label "→" は上の行の続き、["",""] は段落の切れ目
function buildSong(parsed) {
  const groups = {};
  Object.keys(parsed.groups || {}).forEach((k) => { groups[k] = (parsed.groups[k] || []).map((n) => addMember(n).id); });

  // この曲に出てくる人だけを名簿にする。他の曲・他のグループの人は入れない。
  const roster = [];
  const put = (id) => { if (id && !roster.includes(id)) roster.push(id); };
  (parsed.order || []).forEach((n) => put(addMember(n).id));
  Object.keys(groups).forEach((k) => groups[k].forEach(put));
  (parsed.lines || []).forEach((r) => {
    const label = (r[0] || "").trim();
    if (!label || label === "→" || /^全/.test(label)) return;
    splitNames(label).forEach((k) => { if (!groups[k]) put(addMember(k).id); });
  });

  let carry = [];
  const lines = (parsed.lines || []).map((r) => {
    const label = (r[0] || "").trim();
    const t = (r[1] || "").trim();
    if (!label && !t) return { gap: true, label: "", t: "", parts: [], cell: "" };
    const exRaw = r[4] || "";
    const exIds = [];
    if (exRaw) splitNames(exRaw.replace(/(ハモ|ハーモニー|コーラス|ｺｰﾗｽ|Cho|cho)/gi, " ")).forEach((k) => {
      (groups[k] || [addMember(k).id]).forEach((n) => { if (!exIds.includes(n)) exIds.push(n); });
    });
    if (label === "→") {
      return { label: exRaw ? "　" + exRaw : "", raw: "", labelRaw: "", extraRaw: r[7] || "", t,
        parts: carry.concat(exIds.filter((x) => !carry.includes(x))),
        main: carry.slice(), extra: exIds, cont: true, cell: r[2] || "", lcell: r[3] || "", extraCell: r[5] || "" };
    }
    let parts = [];
    if (/^全/.test(label)) {
      parts = roster.slice();
      // 「全（広本以外）」のような書き方は、その人を外す
      const ex = label.match(/[（(]([^）)]*)以外[）)]/);
      if (ex) {
        const out2 = splitNames(ex[1]).map((n) => addMember(n).id);
        parts = parts.filter((p) => !out2.includes(p));
      }
      // 「全（広本以外）・広本」のように後ろに名前が続く場合（ハモなど）は足す
      splitNames(label).filter((n) => !/^全/.test(n)).forEach((k) => {
        (groups[k] || [addMember(k).id]).forEach((n) => { if (!parts.includes(n)) parts.push(n); });
      });
    }
    else splitNames(label).forEach((k) => {
      if (groups[k]) groups[k].forEach((n) => parts.push(n));
      else parts.push(addMember(k).id);
    });
    carry = parts.slice();
    const all2 = parts.concat(exIds.filter((x) => !parts.includes(x)));
    return { label: label + (exRaw ? "　" + exRaw : ""), raw: label, labelRaw: r[6] || label, extraRaw: r[7] || "", t, parts: all2,
      main: parts.slice(), extra: exIds, cell: r[2] || "", lcell: r[3] || "", extraCell: r[5] || "" };
  });
  const so = { id: uid(), title: parsed.title || "無題", credit: parsed.credit || "", lines,
    roster, blocks: groups, blockCells: parsed.groupCells || {}, blockRows: parsed.groupRows || [], sheetName: parsed.sheetName || "",
    micSheet: parsed.micSheet || "", micMap: parsed.micMap || null };
  so.sig = songSig(so);
  return so;
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

// 歌詞は元の表記を保つ。直すのは部首だけの異体字と、化けた文字だけ。
function softText(t) {
  t = String(t == null ? "" : t);
  t = t.replace(/[\u2E80-\u2FDF\uFF66-\uFF9F]/g, (ch) => (ch.normalize ? ch.normalize("NFKC") : ch));
  t = t.replace(/\(cid:\d+\)/g, "");
  t = t.replace(/[\uFFFD\u0000-\u001F\uE000-\uF8FF]/g, " ");
  return t.replace(/[ \t\u00A0]+/g, " ").trim();
}

const NAMESEP = /[・、，,･\/／\s]+/;
// 括弧は、短ければ人名（(平)）、長ければ指示（(ウィスパー里)）とみなす
function stripParens(t) {
  return t.replace(/[（(]([^）)]*)[）)]/g, (m, inner) => (inner.trim().length <= 3 ? inner.trim() : ""));
}
function splitNames(label) {
  return label.split(NAMESEP)
    .map((t) => stripParens(t).trim())
    .filter((t) => t && t.length < 6 && !/[（()）※★☆]/.test(t)); // 長いもの・括弧や記号は名前ではない
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

// 歌割表の名前は、そのまとまりの縦の「真ん中」に置かれる（結合セル＋中央揃え）。
// 近い方の名前にぶら下げるだけだと、3行のまとまりの一番下の行が
// 次の名前とほぼ等距離になり、そちらに取られてしまう。
// （例：上村［吹き硝子／映らない／透明水晶］の「透明水晶」が
//   次の「小野田・松原」に0.6pt差で取られていた）
// そこで、名前の位置を中心にして、上下へ同時に広げていく。
function assignOwners(list, med) {
  const lyr = [];
  list.forEach((r) => { r.owner = null; if (r.t) lyr.push(r); });
  const labels = list.filter((r) => r.label);
  if (!lyr.length || !labels.length) return;
  const far = med * 1.7;                        // これ以上あいていたら段落の切れ目
  const owner = new Array(lyr.length).fill(null);

  const runs = labels.map((L) => {
    let k = 0, bd = Infinity;
    lyr.forEach((r, i) => { const d = Math.abs(r.top - L.top); if (d < bd) { bd = d; k = i; } });
    let lo = k, hi = k;
    // 行と行のちょうど間にいるなら、上下2行でひとまとまり（偶数行のまとまり）
    if (bd > med * 0.35) {
      if (lyr[k].top < L.top) hi = Math.min(k + 1, lyr.length - 1);
      else lo = Math.max(k - 1, 0);
    }
    return { L, lo, hi, k };
  });

  // まず名前そのものの位置を押さえる
  runs.forEach((rn) => {
    for (let i = rn.lo; i <= rn.hi; i++) if (owner[i] == null) owner[i] = rn.L;
    while (rn.lo <= rn.hi && owner[rn.lo] !== rn.L) rn.lo++;
    while (rn.hi >= rn.lo && owner[rn.hi] !== rn.L) rn.hi--;
  });
  // 取り合いに負けて行が無くなった名前は、近くの空いている行を拾う
  runs.forEach((rn) => {
    if (rn.lo <= rn.hi) return;
    for (let d = 1; d <= 2; d++) {
      for (const i of [rn.k - d, rn.k + d]) {
        if (i >= 0 && i < lyr.length && owner[i] == null) {
          owner[i] = rn.L; rn.lo = rn.hi = i; return;
        }
      }
    }
  });
  // 上下へ同時に広げる。片側でも埋まっていたら止める（＝中央揃えの対称性を保つ）
  let moved = true;
  while (moved) {
    moved = false;
    runs.forEach((rn) => {
      if (rn.lo > rn.hi) return;
      const a = rn.lo - 1, b = rn.hi + 1;
      if (a < 0 || b >= lyr.length) return;
      if (owner[a] != null || owner[b] != null) return;
      if (lyr[a + 1].top - lyr[a].top > far) return;      // 段落をまたがない
      if (lyr[b].top - lyr[b - 1].top > far) return;
      owner[a] = rn.L; owner[b] = rn.L; rn.lo = a; rn.hi = b;
      moved = true;
    });
  }
  // どこにも入らなかった行は、すぐ上の名前の続きとして扱う
  let cur = null;
  lyr.forEach((r, i) => {
    if (owner[i]) cur = owner[i];
    r.owner = owner[i] || cur;
  });
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

  const out = [];
  per.forEach((list) => {
    if (!list.length) return;
    // 段落の切れ目
    const gaps = [];
    for (let i = 1; i < list.length; i++) gaps.push(list[i].top - list[i - 1].top);
    const med = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 12;
    assignOwners(list, med);
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

/* ---------------- Excel の書き換え ---------------- */
// ZIP の読み書き。圧縮はブラウザ標準の deflate-raw を使う。
const CRCT = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
async function inflateRaw(u8) {
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function deflateRaw(u8) {
  const cs = new CompressionStream("deflate-raw");
  const w = cs.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function unzip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Excelのファイルとして読めません。");
  const n = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out = {}, order = [];
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const cmtLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));
    const lnl = dv.getUint16(lho + 26, true), lel = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnl + lel;
    const raw = u8.subarray(start, start + csize);
    out[name] = method === 0 ? raw : await inflateRaw(raw);
    order.push(name);
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return { files: out, order };
}
async function zip(files, order) {
  const names = order || Object.keys(files);
  const chunks = [], central = [];
  let off = 0;
  for (const name of names) {
    const raw = files[name];
    if (!raw) continue;
    const comp = await deflateRaw(raw);
    const use = comp.length < raw.length ? comp : raw;
    const method = use === comp ? 8 : 0;
    const crc = crc32(raw);
    const nb = new TextEncoder().encode(name);
    const lh = new Uint8Array(30 + nb.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, use.length, true); lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nb.length, true);
    lh.set(nb, 30);
    chunks.push(lh, use);
    const ch = new Uint8Array(46 + nb.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, use.length, true); cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nb.length, true);
    cv.setUint32(42, off, true);
    ch.set(nb, 46);
    central.push(ch);
    off += lh.length + use.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  const all = chunks.concat(central, [end]);
  const total = all.reduce((a, c) => a + c.length, 0);
  const res = new Uint8Array(total);
  let p = 0;
  for (const c of all) { res.set(c, p); p += c.length; }
  return res;
}



const dec = (u8) => new TextDecoder().decode(u8);
const enc = (s) => new TextEncoder().encode(s);
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// 元のExcelに「○○欠席ver」タブを一番左に足す。元のタブと書式には一切触らない。
// edits: { "A7": "島川", "E12": "" } セル番地 → 新しい名前
async function addVersionTab(buf, tabName, edits, srcSheet) {
  const { files, order } = await unzip(buf);
  const names = order.slice();
  const wbxml = dec(files['xl/workbook.xml']);
  const rels  = dec(files['xl/_rels/workbook.xml.rels']);
  const ct    = dec(files['[Content_Types].xml']);

  // 元にするシート。指定がなければ一番左。
  let first = null;
  if (srcSheet) {
    const re = new RegExp('<sheet [^>]*name="' + srcSheet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*r:id="([^"]+)"');
    first = wbxml.match(re);
  }
  if (!first) first = wbxml.match(/<sheet [^>]*r:id="([^"]+)"/);
  if (!first) throw new Error('シートが見つかりません。');
  const relm = new RegExp('Id="' + first[1] + '"[^>]*Target="([^"]+)"').exec(rels);
  const srcPath = 'xl/' + relm[1].replace(/^\/?xl\//, '');
  let sheet = dec(files[srcPath]);

  // 共有文字列に新しい名前を足す
  let ss = files['xl/sharedStrings.xml'] ? dec(files['xl/sharedStrings.xml']) : null;
  if (!ss) {
    ss = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"></sst>';
    names.push('xl/sharedStrings.xml');
  }
  let count = (ss.match(/<si>/g) || []).length;
  // edits は { セル番地: "文字" } か { セル番地: {v:"文字", fill:"FFFFF3B0"} }
  const norm = {};
  Object.keys(edits).forEach((ref) => {
    const e = edits[ref];
    norm[ref] = (e && typeof e === "object") ? { v: e.v == null ? "" : String(e.v), fill: e.fill || "FFFFF3B0" }
                                            : { v: String(e == null ? "" : e), fill: "FFFFF3B0" };
  });
  const add = [];
  const idxOf = {};
  Object.keys(norm).forEach((ref) => {
    const v = norm[ref].v;
    if (v === '') return;
    if (idxOf[v] == null) { idxOf[v] = count + add.length; add.push('<si><t xml:space="preserve">' + esc(v) + '</t></si>'); }
  });
  if (add.length) {
    ss = ss.replace('</sst>', add.join('') + '</sst>');
    const total = count + add.length;
    ss = ss.replace(/count="\d+"/, 'count="' + total + '"').replace(/uniqueCount="\d+"/, 'uniqueCount="' + total + '"');
  }

  // 黄色の塗りを「追加」する（既存の書式番号はずらさない）
  let st = dec(files['xl/styles.xml']);
  const fillsM = /<fills count="(\d+)">([\s\S]*?)<\/fills>/.exec(st);
  const xfsM   = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(st);
  let fillCount = Number(fillsM[1]);
  const newFills = [];
  const fillIdOf = {};
  const ensureFill = (rgb) => {
    if (fillIdOf[rgb] != null) return fillIdOf[rgb];
    const id = fillCount + newFills.length;
    newFills.push('<fill><patternFill patternType="solid"><fgColor rgb="' + rgb + '"/><bgColor indexed="64"/></patternFill></fill>');
    fillIdOf[rgb] = id;
    return id;
  };
  const xfList = xfsM[2].match(/<xf [^>]*\/>|<xf [^>]*>[\s\S]*?<\/xf>/g) || [];
  const baseXfCount = xfList.length;
  const styleOf = {};           // 元の書式番号＋色 → 新しい書式番号
  const newXfs = [];
  const ensureStyle = (base, rgb) => {
    const key = base + "/" + rgb;
    if (styleOf[key] != null) return styleOf[key];
    const fid = ensureFill(rgb);
    let x = xfList[base] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    x = /fillId="\d+"/.test(x) ? x.replace(/fillId="\d+"/, 'fillId="' + fid + '"')
                              : x.replace('<xf ', '<xf fillId="' + fid + '" ');
    x = /applyFill=/.test(x) ? x.replace(/applyFill="\d"/, 'applyFill="1"') : x.replace('<xf ', '<xf applyFill="1" ');
    const id = baseXfCount + newXfs.length;
    newXfs.push(x);
    styleOf[key] = id;
    return id;
  };

  // セルを差し替える
  let changed = 0;
  Object.keys(norm).forEach((ref) => {
    const v = norm[ref].v;
    const re = new RegExp('<c r="' + ref + '"([^>]*?)(/>|>([\\s\\S]*?)</c>)');
    const m = re.exec(sheet);
    let attr = m ? m[1] : '';
    const sm = /s="(\d+)"/.exec(attr);
    const yid = ensureStyle(sm ? Number(sm[1]) : 0, norm[ref].fill);
    attr = attr.replace(/\s*s="\d+"/, '').replace(/\s*t="\w+"/, '');
    const body = v === '' ? '' : '<v>' + idxOf[v] + '</v>';
    const cell = '<c r="' + ref + '"' + attr + ' s="' + yid + '"' + (v === '' ? '' : ' t="s"') + '>' + body + '</c>';
    if (m) sheet = sheet.slice(0, m.index) + cell + sheet.slice(m.index + m[0].length);
    else {
      // セルが無い場合は、その行の末尾に足す（列の順序を崩さないため）
      const row = ref.match(/\d+$/)[0];
      const rre = new RegExp('<row r="' + row + '"[^>]*>[\\s\\S]*?</row>');
      const rm = rre.exec(sheet);
      if (rm) {
        sheet = sheet.slice(0, rm.index) + rm[0].replace('</row>', cell + '</row>') + sheet.slice(rm.index + rm[0].length);
      } else {
        // 行ごと無い場合は、最後の行の後ろに作る
        const last = /<\/row>(?![\s\S]*<\/row>)/.exec(sheet);
        if (last) sheet = sheet.slice(0, last.index + 6) + '<row r="' + row + '">' + cell + '</row>' + sheet.slice(last.index + 6);
      }
    }
    changed++;
  });
  if (newFills.length) {
    st = st.replace(/<fills count="\d+">/, '<fills count="' + (fillCount + newFills.length) + '">')
           .replace('</fills>', newFills.join('') + '</fills>');
  }
  if (newXfs.length) {
    st = st.replace(/<cellXfs count="\d+">/, '<cellXfs count="' + (baseXfCount + newXfs.length) + '">')
           .replace('</cellXfs>', newXfs.join('') + '</cellXfs>');
  }
  // 追加した列が読み飛ばされないよう、シートの範囲と行の幅を広げる
  const colNum = (t) => { let n = 0; for (let i = 0; i < t.length; i++) n = n * 26 + (t.charCodeAt(i) - 64); return n; };
  const colStr = (n) => { let t = ''; while (n > 0) { const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = (n - m - 1) / 26; } return t; };
  let maxC = 1, maxR = 1;
  Object.keys(norm).forEach((ref) => {
    const m2 = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m2) return;
    maxC = Math.max(maxC, colNum(m2[1]));
    maxR = Math.max(maxR, Number(m2[2]));
  });
  const dm = /<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\s*\/>/.exec(sheet);
  if (dm) {
    const ec = Math.max(colNum(dm[3]), maxC), er = Math.max(Number(dm[4]), maxR);
    sheet = sheet.replace(dm[0], '<dimension ref="' + dm[1] + dm[2] + ':' + colStr(ec) + er + '"/>');
  }
  sheet = sheet.replace(/<row r="(\d+)"([^>]*?)spans="(\d+):(\d+)"/g, (all, r, rest, a, b) => {
    const need = Object.keys(norm).some((ref) => {
      const m3 = /^([A-Z]+)(\d+)$/.exec(ref);
      return m3 && m3[2] === r && colNum(m3[1]) > Number(b);
    });
    if (!need) return all;
    let mx = Number(b);
    Object.keys(norm).forEach((ref) => {
      const m3 = /^([A-Z]+)(\d+)$/.exec(ref);
      if (m3 && m3[2] === r) mx = Math.max(mx, colNum(m3[1]));
    });
    return '<row r="' + r + '"' + rest + 'spans="' + a + ':' + mx + '"';
  });

  sheet = sheet.replace(/<drawing[^>]*\/>/g, '').replace(/<legacyDrawing[^>]*\/>/g, '');

  // 新しいシートを登録して一番左に置く
  const nums = names.map((n) => (/xl\/worksheets\/sheet(\d+)\.xml/.exec(n) || [])[1]).filter(Boolean).map(Number);
  const newNum = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
  const rids = (rels.match(/Id="rId(\d+)"/g) || []).map((x) => Number(x.replace(/\D/g, '')));
  const newRid = 'rId' + ((rids.length ? Math.max.apply(null, rids) : 0) + 1);
  const sids = (wbxml.match(/sheetId="(\d+)"/g) || []).map((x) => Number(x.replace(/\D/g, '')));
  const newSid = (sids.length ? Math.max.apply(null, sids) : 0) + 1;
  const safe = tabName.replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31);

  files['xl/workbook.xml'] = enc(wbxml.replace('<sheets>', '<sheets><sheet name="' + esc(safe) + '" sheetId="' + newSid + '" r:id="' + newRid + '"/>'));
  files['xl/_rels/workbook.xml.rels'] = enc(rels.replace('</Relationships>',
    '<Relationship Id="' + newRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + newNum + '.xml"/></Relationships>'));
  files['[Content_Types].xml'] = enc(ct.replace('</Types>',
    '<Override PartName="/xl/worksheets/sheet' + newNum + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'));
  files['xl/styles.xml'] = enc(st);
  files['xl/sharedStrings.xml'] = enc(ss);
  const newPath = 'xl/worksheets/sheet' + newNum + '.xml';
  files[newPath] = enc(sheet);
  if (names.indexOf(newPath) < 0) names.push(newPath);
  return { data: await zip(files, names), changed };
}


/* ---------------- Excel 取り込み ---------------- */
// 社内の歌割は「名前・空白・歌詞」の3列を1組として、横に2〜3組並ぶ形。
// 列位置は資料ごとに違うので、中身から名前列と歌詞列を見分ける。
const NAMECELL = /^[^\s、,，・･\/／]{1,4}([\s、,，・･\/／]+[^\s、,，・･\/／]{1,4})*$/;
const looksName = (v) => !!v && v.length <= 12 && NAMECELL.test(v);

// どのシートが歌割かを選ぶ。
// 1枚目が「マイク番号」のように番号だけの表のことがあるため。
function pickSheet(wb) {
  const names = wb.SheetNames;
  const score = (sn) => {
    const sh2 = wb.Sheets[sn];
    if (!sh2 || !sh2["!ref"]) return -1e9;
    let pt = 0;
    if (/歌割|唄割|うたわり/.test(sn)) pt += 1000;
    if (/マイク|ﾏｲｸ|番号|MC|表紙|メモ/i.test(sn)) pt -= 800;
    if (/^(sheet|シート)\s*\d*$/i.test(sn.trim())) pt -= 600;   // 名前を付けていない予備のシート
    // グループ名が付いたシートは、その曲の歌割である見込みが高い
    if ((S.groups || []).some((g) => g.name && sn.indexOf(g.name) >= 0)) pt += 500;
    (Object.keys(S.rosters || {})).forEach((gn) => { if (gn && sn.indexOf(gn) >= 0) pt += 500; });
    // 名前らしい文字（漢字・かな）が入った短いセルを数える
    const g = XLSX.utils.sheet_to_json(sh2, { header: 1, blankrows: false, defval: "" });
    let nameLike = 0, numLike = 0;
    g.forEach((r) => (r || []).forEach((v) => {
      const t = String(v == null ? "" : v).trim();
      if (!t || t.length > 24) return;
      if (/^[\d０-９１-９・\s]+$/.test(t)) numLike++;
      else if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(t) && t.length <= 12) nameLike++;
    }));
    return pt + nameLike - numLike * 2;
  };
  // 基本は1枚目。1枚目が明らかに歌割でない時だけ、他を探す。
  const first = names[0];
  const bad = /マイク|ﾏｲｸ|番号/i.test(first) || score(first) < 0;
  if (!bad) return first;
  let best = first, bs = score(first);
  names.forEach((sn) => { const v = score(sn); if (v > bs) { bs = v; best = sn; } });
  return best;
}

// Excelの吹き出し（テキストボックス）を読む。煽りがここに書かれていることがある。
async function readBubbles(raw, sheetIdx) {
  try {
    const { files } = await unzip(raw);
    const dec3 = (u8) => new TextDecoder().decode(u8);
    const relPath = "xl/worksheets/_rels/sheet" + (sheetIdx + 1) + ".xml.rels";
    if (!files[relPath]) return [];
    const m = /Target="([^"]*drawings\/drawing\d+\.xml)"/.exec(dec3(files[relPath]));
    if (!m) return [];
    const key = "xl/" + m[1].replace(/^\.\.\//, "");
    if (!files[key]) return [];
    const x = dec3(files[key]);
    const out = [];
    const re2 = /<xdr:(?:two|one)CellAnchor[\s\S]*?<\/xdr:(?:two|one)CellAnchor>/g;
    let g;
    while ((g = re2.exec(x))) {
      const seg = g[0];
      const f2 = /<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(seg);
      if (!f2) continue;
      const t = (seg.match(/<a:t>([^<]*)<\/a:t>/g) || []).map((y) => y.replace(/<[^>]+>/g, "")).join("");
      const txt = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
      if (txt) out.push({ c: Number(f2[1]), r: Number(f2[2]), t: txt });
    }
    return out;
  } catch (e) { return []; }
}

async function parseXLSX(file, buf) {
  const raw0 = buf || new Uint8Array(await file.arrayBuffer());
  // cellStyles を付けると、セルの塗りつぶしの色が読める。
  // 歌割表ではワンハーフでカットした箇所をグレーで塗ってあるので、それを歌詞から外す。
  let wb;
  try { wb = XLSX.read(raw0, { type: "array", cellStyles: true }); }
  catch (e) { wb = XLSX.read(raw0, { type: "array" }); }
  const pickedName = pickSheet(wb);
  const sh = wb.Sheets[pickedName];
  const bubbles = await readBubbles(raw0, wb.SheetNames.indexOf(pickedName));
  const isGray = (ri, ci) => {
    const cell = sh[XLSX.utils.encode_cell({ r: ri, c: ci })];
    const f = cell && cell.s && (cell.s.fgColor || (cell.s.fill && cell.s.fill.fgColor));
    let rgb = f && f.rgb;
    if (!rgb || typeof rgb !== "string") return false;
    if (rgb.length === 8) rgb = rgb.slice(2);            // 先頭は透明度
    if (rgb.length !== 6) return false;
    const R = parseInt(rgb.slice(0, 2), 16), G = parseInt(rgb.slice(2, 4), 16), B = parseInt(rgb.slice(4, 6), 16);
    if ([R, G, B].some((x) => isNaN(x))) return false;
    // 色味が無く（R≒G≒B）、白でも黒でもない＝グレー
    const flat = Math.abs(R - G) < 18 && Math.abs(G - B) < 18 && Math.abs(R - B) < 18;
    const mid = R > 0x40 && R < 0xF0;
    return flat && mid;
  };
  const grid = XLSX.utils.sheet_to_json(sh, { header: 1, blankrows: true, defval: "" })
    .map((r) => (r || []).map((v) => String(v == null ? "" : v).replace(/\s*\n\s*/g, " ")));
  const w = grid.reduce((m, r) => Math.max(m, r.length), 0);
  grid.forEach((r) => { while (r.length < w) r.push(""); });

  const kind = [];
  for (let c = 0; c < w; c++) {
    const vals = grid.map((r) => cleanText(r[c])).filter(Boolean);
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
  // 歌詞列のすぐ右にある「名前だけの列」は、ハモなどの追加担当とみなす
  const inBlock = new Set();
  blocks.forEach(([a, b]) => { inBlock.add(a); inBlock.add(b); });
  const annex = blocks.map(() => []);
  blocks.forEach(([nc, lc], bi) => {
    for (let c = lc + 1; c < Math.min(lc + 3, w); c++) {
      if (inBlock.has(c) || kind[c] !== "N") continue;
      annex[bi].push(c);
      inBlock.add(c);
    }
  });
  const HAMO = /(ハモ|ハーモニー|コーラス|ｺｰﾗｽ|Cho|cho)/gi;

  const CREDIT = /作詞|作曲|編曲|訳詞|Words|Music|Arr/i;
  const col = (n) => { let t = ""; n++; while (n > 0) { const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = (n - m - 1) / 26; } return t; };
  const head = [];
  const rows = [];
  let lead = [];              // 作家名より前の、名前の付いていない行（題名・副題）
  const bubbleAt = {};
  bubbles.forEach((b) => { (bubbleAt[b.r] = bubbleAt[b.r] || []).push(b.t); });
  let cutRows = 0;            // グレー＝ワンハーフでカットした行
  const pend = [];            // まだ入れていない煽り
  const flushPend = () => {
    while (pend.length) rows.push(["煽り", softText(pend.shift()), "", "", "", "", "煽り", ""]);
  };
  blocks.forEach(([nc, lc], bi) => {
    let topRun = true;        // いちばん上から途切れずに続く、名前の無い行（＝見出し）
    grid.forEach((r, ri) => {
      let nv = cleanText(r[nc] || "");
      let nvRaw = softText(r[nc] || "");
      const lv = softText(r[lc] || "");
      // 「（空欄） A  吉田・服部…」のように、間の列にブロック名が書かれていることがある
      if (!nv && lv) {
        for (let c = nc + 1; c < lc; c++) {
          const v2 = cleanText(r[c] || "");
          if (v2 && v2.length <= 2) { nv = v2; nvRaw = softText(r[c] || ""); break; }
        }
      }
      const ac = annex[bi].find((c) => cleanText(r[c] || ""));
      const extraRaw = ac != null ? cleanText(r[ac] || "") : "";
      const extraCell = ac != null ? col(ac) + (ri + 1) : "";
      if (!nv && !lv) {
        topRun = false;                    // 空行で見出しの連なりは終わり
        flushPend();
        const last = rows[rows.length - 1];
        if (rows.length && (last[0] || last[1])) rows.push(["", ""]);
        return;
      }
      if (!nv && CREDIT.test(lv)) { head.push(lv); lead.forEach((x) => head.unshift(x[1])); lead = []; return; }
      // ワンハーフでカットした箇所（グレー）は歌詞に出さない
      if (lv && isGray(ri, lc)) { cutRows++; return; }
      if (bi === 0 && bubbleAt[ri]) {
        // 吹き出し（煽り）は別の行として入れる。ただしすぐには入れない。
        // ひとつの歌割のまとまり（名前の無い続きの行）の途中に割り込ませると
        // まとまりが分断されるので、まとまりが終わるまで持っておく。
        bubbleAt[ri].forEach((t2) => pend.push(t2));
        delete bubbleAt[ri];
      }
      // 新しいまとまりが始まる行の手前で、持っていた煽りを出す
      if (pend.length && nv) flushPend();
      if (nv) topRun = false;
      // いちばん上から続く、名前の無い行は見出し（曲名・メンバー一覧など）
      if (!nv && topRun && bi > 0) { head.push(lv); return; }
      if (!nv && !rows.length && lead.length < 3) { lead.push(["→", lv, col(nc) + (ri + 1), col(lc) + (ri + 1), "", "", "", ""]); return; }
      rows.push([nv || "→", lv, col(nc) + (ri + 1), col(lc) + (ri + 1), extraRaw, extraCell, nvRaw, softText(ac != null ? (r[ac] || "") : "")]);
    });
    flushPend();
  });
  // 作家名が見つからなかった場合、拾っておいた行は歌詞に戻す
  lead.reverse().forEach((x) => rows.unshift(x));
  // 一番左のシートを読んでいる
  const sheetName = pickedName;
  // マイク番号のシートは歌割と同じ並びで、名前の代わりに番号が入っている。
  // 書き出しの時に、そちらも直せるよう覚えておく。
  const micName = wb.SheetNames.find((n) => n !== pickedName && /マイク|ﾏｲｸ/i.test(n)) || "";
  // どの行にも当てはまらなかった吹き出しは、最後にまとめて入れる
  Object.keys(bubbleAt).forEach((k) => bubbleAt[k].forEach((t2) => rows.push(["煽り", softText(t2), "", "", "", "", "煽り", ""])));
  const parsed0 = finalize(cleanName(file.name), head.join("　"), rows);
  if (cutRows) parsed0.cutRows = cutRows;   // グレー＝カットとして外した行数
  parsed0.sheetName = sheetName;
  parsed0.micSheet = micName;
  if (micName) {
    // 名前 ↔ マイク番号 の対応を、同じ行の同じ列から拾う
    const msh = wb.Sheets[micName];
    const mg = XLSX.utils.sheet_to_json(msh, { header: 1, blankrows: true, defval: "" })
      .map((r) => (r || []).map((v) => String(v == null ? "" : v).trim()));
    const map = {};
    grid.forEach((r, ri) => {
      const mr = mg[ri]; if (!mr) return;
      r.forEach((v, ci) => {
        const nm = cleanText(v), mv = mr[ci];
        if (!nm || !mv || nm === mv) return;
        if (!looksName(nm)) return;
        splitNames(nm).forEach((one) => { if (!map[one]) map[one] = mv; });
      });
    });
    parsed0.micMap = map;
  }
  return parsed0;
}

/* ---------------- A/B などのブロック定義を拾う ---------------- */
function finalize(title, credit, rows) {
  rows = rows.filter((r, i) => !(r[0] === "" && r[1] === "" && (i === 0 || (rows[i - 1][0] === "" && rows[i - 1][1] === ""))));
  while (rows.length && !rows[rows.length - 1][0] && !rows[rows.length - 1][1]) rows.pop();

  const labelNames = new Set();
  const labelUse = {};
  rows.forEach((r) => {
    const lb = (r[0] || "").trim();
    if (lb && lb !== "→") labelUse[lb] = (labelUse[lb] || 0) + 1;
    splitNames(lb).forEach((t) => labelNames.add(t));
  });

  // 煽りは「広本　オイ！オイ！」のように、担当と掛け声が1つの吹き出しに入っている。
  // 先頭が名前なら切り離して、その人の担当として扱う（集計にも出るようにする）。
  rows.forEach((r) => {
    if (r[0] !== "煽り") return;
    const t = String(r[1] || "").trim();
    // 資料ごとに書き方が違うので、担当と掛け声の区切り方を一通り見る。
    //   島川：盛り上がっていくぞー！ ／ 広本　「オイ！」 ／ 広本「オイ！」 ／ （島川）オイ！
    // 「・」は名前どうしの区切り（小野田・植村）なので、ここには入れない
    const SEP = "：:／/→⇒>＞";
    const m = new RegExp(`^([^\\s　${SEP}「『”"]+)[\\s　]*[${SEP}][\\s　]*(.+)$`).exec(t)
      || /^[（(]([^）)]{1,14})[）)][\s　]*(.+)$/.exec(t)
      || /^([^\s　「『”"]+)[\s　]+(.+)$/.exec(t)
      || /^([^\s　「『”"]{1,14})([「『”"].+)$/.exec(t);
    if (!m) return;
    const who = splitNames(m[1]);
    // 全部が既に出てくる名前の時だけ切り離す（掛け声を名前と読み違えないように）
    if (!who.length || !who.every((n) => labelNames.has(n))) return;
    r[0] = m[1];          // 表示上の担当
    r[6] = "煽り";        // 煽りであることは別に持っておく
    r[1] = m[2].trim();
  });

  // 「A ＝ 小野田・植村・島川・相馬」のようなブロック定義行を拾って、歌詞から外す
  const groups = {};
  const groupCells = {};
  const groupRows = [];
  rows = rows.filter((r) => {
    const toks = splitNames(r[1]);
    if (r[6] === "煽り") return true;
    if (!r[0] || r[0] === "→" || r[0].length > 2 || toks.length < 2) return true;
    if (!toks.every((t) => t.length <= 5 && !/[。、！？「」ぁ-ん]{3,}/.test(t))) return true;
    const known = toks.filter((t) => labelNames.has(t)).length;
    if (known / toks.length < 0.5) {
      // 「B ＝ 坂本・大野・樋口・染谷」のように、その4人が他で歌っていない場合もある。
      // 記号1文字の見出し＋中黒で区切られた短い名前が3つ以上、なら定義行とみなす。
      const isTag = /^[A-Za-zＡ-Ｚａ-ｚ]$/.test(r[0]) && (labelUse[r[0]] || 0) >= 2;
      const listy = /[・、]/.test(r[1]) && toks.length >= 3 && toks.every((t) => t.length <= 4);
      if (!(isTag && listy)) return true;
    }
    groups[r[0]] = toks;
    groupCells[r[0]] = r[3] || "";
    groupRows.push({ b: r[0], ncell: r[2] || "", lcell: r[3] || "" });
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

  return { title: (title || "").trim() || "無題", credit: (credit || "").trim(), groups, groupCells, groupRows, order, lines: rows };
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
// iPhoneの消音スイッチはWeb Audioを黙らせる。
// 無音の音声を鳴らしっぱなしにすると音声セッションが「再生」に切り替わり、
// Web Audioの音も消音スイッチを無視して鳴るようになる。
const SILENT_WAV = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
let silentEl = null;
let micStream = null;
function unlockAudio() {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state !== "running" && AC.resume) AC.resume();
    if (!silentEl) {
      silentEl = new Audio(SILENT_WAV);
      silentEl.loop = true;
      silentEl.setAttribute("playsinline", "");
      const pr = silentEl.play();
      if (pr && pr.catch) pr.catch(() => {});
    } else if (silentEl.paused) {
      const pr = silentEl.play();
      if (pr && pr.catch) pr.catch(() => {});
    }
  } catch (e) { /* 音を出せない端末 */ }
}
document.addEventListener("pointerdown", unlockAudio, true);

// 使っている間は画面を消させない
let wakeLock = null;
async function keepAwake() {
  try {
    if (!navigator.wakeLock || document.hidden) return;
    if (wakeLock && !wakeLock.released) return;
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch (e) { /* 対応していない端末では何もしない */ }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { if (VIEW()) markRead(song()); return; }
  keepAwake();
  // ホーム画面から開き直した時に、待たずに最新を取りに行く
  if (S.src && !S.groups.some((g) => g.gistId)) syncSetlist(false);
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
    navigator.serviceWorker.getRegistration().then((r) => { if (r) r.update(); }).catch(() => {});
  }
});
// どこかで例外が出ても、真っ白のままにしない
function showFatal(msg) {
  try {
    document.body.innerHTML = `<div style="padding:40px 24px;color:#EDEDED;font:15px/1.7 -apple-system,sans-serif">
      <div style="font-size:17px;font-weight:700;margin-bottom:12px">うまく開けませんでした</div>
      <div style="color:#9A9A9A;font-size:13px;white-space:pre-wrap;margin-bottom:20px">${String(msg || "").slice(0, 300)}</div>
      <button onclick="location.reload()" style="width:100%;padding:14px;border-radius:12px;background:#D97757;color:#0A0A0A;font-weight:700;border:0;margin-bottom:10px">開き直す</button>
      <button onclick="try{var k='utacheck.v1';localStorage.setItem(k+':broken:'+Date.now(),localStorage.getItem(k)||'');localStorage.removeItem(k);}catch(e){};location.reload()"
        style="width:100%;padding:14px;border-radius:12px;background:#1C1C1C;color:#9A9A9A;border:0">データを退避してまっさらで開く</button>
    </div>`;
  } catch (e) { /* これ以上は打つ手なし */ }
}
window.addEventListener("error", (e) => {
  if (document.getElementById("app") && document.getElementById("app").innerHTML) return;
  showFatal((e && e.message) || "不明な理由");
});
window.addEventListener("unhandledrejection", (e) => {
  if (document.getElementById("app") && document.getElementById("app").innerHTML) return;
  showFatal((e && e.reason && e.reason.message) || "不明な理由");
});

window.addEventListener("pageshow", () => {
  keepLinkInURL();
  if (S.ghToken && S.bkGistId) checkOther();
  if (S.src && !S.groups.some((g) => g.gistId)) syncSetlist(false);
});
document.addEventListener("pointerdown", keepAwake, true);

function tone(id) {
  try {
    freeMic();
    unlockAudio();
    if (!AC) return;
    const t = AC.currentTime;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = "triangle";
    o.frequency.value = freqOf(id);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + 1.35);
  } catch (e) { /* 無音 */ }
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

// どの画面でも同じ位置（C4のあたり）から鍵盤を見せる
function showPianoAtC4(root) {
  const el = (root || document).querySelector("#pno");
  if (el) el.scrollLeft = 34 * 7 - 20;
}

// 設定の一番下に置く署名と版
const footerHTML = () => `
    <div style="text-align:center;color:var(--dim);font-size:11px;letter-spacing:.04em;margin:26px 0 4px">
      Created by Joe Takasaki
    </div>
    <div style="text-align:center;color:var(--dim);font-size:10px;opacity:.6;margin-bottom:2px">${APP_VER}</div>
    <div style="text-align:center;color:var(--dim);font-size:10px;opacity:.5;margin-bottom:10px">${h(vpInfo)}</div>`;

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

/* ---------------- レコーディング：Wordの歌詞 ---------------- */
// .docx は zip の中の XML。既に持っている zip の読み書きをそのまま使う。
async function parseDocx(file, buf) {
  const { files } = await unzip(buf || new Uint8Array(await file.arrayBuffer()));
  const dec2 = (u8) => new TextDecoder().decode(u8);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("Wordの中身が見つかりません。");
  const xml = dec2(doc);

  const unesc = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
  const textOf = (p) => {
    const q = p.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, "");
    const parts = [];
    q.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (m, t) => { parts.push(t); return ""; });
    return softText(unesc(parts.join("")));
  };
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || [];

  // 空段落が続いても、区切りは1つにまとめる
  const lines = [];
  paras.forEach((p) => {
    const t = textOf(p);
    const hasBrk = /w:type="column"/.test(p);
    if (t) lines.push(hasBrk ? { t, bars: 4, brk: 1 } : { t, bars: 4 });
    else if (hasBrk) lines.push({ gap: true, t: "", brk: 1 });
    else if (lines.length && !lines[lines.length - 1].gap) lines.push({ gap: true, t: "" });
  });
  while (lines.length && lines[lines.length - 1].gap) lines.pop();
  while (lines.length && lines[0].gap) lines.shift();

  // 曲名と作家名はヘッダに入っていることが多い
  let head = "";
  Object.keys(files).forEach((n) => {
    if (/^word\/header\d+\.xml$/.test(n)) head += textOf(dec2(files[n]));
  });
  const m = head.match(/[「『]([^」』]+)[」』]/);
  const title = m ? m[1] : cleanName(file.name);
  const credit = head.replace(/^.*?[」』]/, "").trim() || head.trim();

  // Wordの段組を読み取り、紙面の設定から「どこで段が変わるか」も割り出す
  let cols = 1, colSpace = 425;
  const cm = xml.match(/<w:cols[^>]*w:num="(\d+)"/);
  if (cm) cols = Math.max(1, Math.min(4, Number(cm[1])));
  const cs = xml.match(/<w:cols[^>]*w:space="(\d+)"/);
  if (cs) colSpace = Number(cs[1]);

  const num = (re2, dflt) => { const m2 = xml.match(re2); return m2 ? Number(m2[1]) : dflt; };
  const pgW = num(/<w:pgSz[^>]*w:w="(\d+)"/, 11906);
  const pgH = num(/<w:pgSz[^>]*w:h="(\d+)"/, 16838);
  const mTop = num(/<w:pgMar[^>]*w:top="(\d+)"/, 720);
  const mBot = num(/<w:pgMar[^>]*w:bottom="(-?\d+)"/, 720);
  const mLef = num(/<w:pgMar[^>]*w:left="(\d+)"/, 720);
  const mRig = num(/<w:pgMar[^>]*w:right="(\d+)"/, 720);
  const pitch = num(/w:linePitch="(\d+)"/, 290);
  let pt = 10.5;
  const stf = Object.keys(files).find((n2) => n2 === "word/styles.xml");
  if (stf) { const m3 = dec2(files[stf]).match(/<w:sz w:val="(\d+)"/); if (m3) pt = Number(m3[1]) / 2; }

  const colW = (pgW - mLef - mRig - colSpace * (cols - 1)) / cols;
  const perLine = Math.max(8, Math.floor(colW / 20 / pt));      // 1行に入る全角の文字数
  const rowsPerCol = Math.max(5, Math.floor((pgH - mTop - mBot) / pitch));

  // 明示的な改段があればそれを優先、無ければ紙面の高さから割り出す
  const colBreaks = [];
  let used = 0;
  lines.forEach((l, i) => {
    if (l.brk) { colBreaks.push(i); used = 0; return; }
    const n2 = l.gap ? 1 : Math.max(1, Math.ceil(Array.from(l.t).length / perLine));
    if (used + n2 > rowsPerCol) { colBreaks.push(i); used = n2; return; }
    used += n2;
  });

  return { id: uid(), title, credit, intro: 8, lines, cols, colBreaks, perLine, rowsPerCol, at: Date.now() };
}

// 1行4小節を基本に、直した行を基点にして振り直す
function barsOf(so) {
  let b = Number(so.intro || 0) + 1;
  return (so.lines || []).map((l) => {
    if (l.gap) return null;
    if (l.add) return null;                    // 足した行は小節を数えない
    if (l.at != null) b = Number(l.at);
    const cur = b;
    b += Number(l.bars || 4);
    return cur;
  });
}
const recSong = () => (S.recMode ? (SONGS()[U.songIdx] || S.rsongs.find((x) => x.id === S.rsongId) || S.rsongs[0] || null) : null);

/* ---------------- ピッチを見る ---------------- */
const PT = { on: false, rec: null, chunks: [], buf: null, notes: [], t0: 0, playing: false, sel: -1, dur: 0, hist: [] };

const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE_JP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const midiName = (m) => {
  const r = Math.round(m);
  return NOTE_JP[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
};

// 1フレームぶんの基本周波数を求める（YINを簡略にしたもの）
function detectHz(buf, rate) {
  const n = buf.length;
  const maxLag = Math.min(Math.floor(rate / 65), n - 1);     // 65Hzまで
  const minLag = Math.max(2, Math.floor(rate / 1200));       // 1200Hzまで
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.008) return 0;                                 // 無音

  const d = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) { const x = buf[i] - buf[i + lag]; sum += x * x; }
    d[lag] = sum;
  }
  const cum = new Float32Array(maxLag + 1);
  let run = 0;
  cum[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) { run += d[lag]; cum[lag] = run ? d[lag] * lag / run : 1; }

  let best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cum[lag] < 0.15) {
      while (lag + 1 <= maxLag && cum[lag + 1] < cum[lag]) lag++;
      best = lag; break;
    }
  }
  if (best < 0) {
    let mn = Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) if (cum[lag] < mn) { mn = cum[lag]; best = lag; }
    if (mn > 0.5) return 0;
  }
  // 山の頂点を放物線で補う
  const a = cum[best - 1], b2 = cum[best], c = cum[best + 1];
  const shift = (a + c - 2 * b2) ? (a - c) / (2 * (a + c - 2 * b2)) : 0;
  return rate / (best + shift);
}

// 録音全体を音高の並びにして、言葉のかたまりに分ける
function analyzePitch(chan, rate) {
  const hop = Math.floor(rate * 0.01);          // 10ms
  const win = Math.floor(rate * 0.046);         // 46ms
  const pts = [];
  for (let i = 0; i + win < chan.length; i += hop) {
    const hz = detectHz(chan.subarray(i, i + win), rate);
    pts.push({ t: i / rate, hz, m: hz ? hzToMidi(hz) : 0 });
  }
  // オクターブの取り違えを直す（周りと12半音ずれていたら寄せる）
  const near = (i) => {
    const w = [];
    for (let k = Math.max(0, i - 6); k < Math.min(pts.length, i + 7); k++) if (pts[k].m) w.push(pts[k].m);
    if (!w.length) return 0;
    w.sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  };
  for (let i = 0; i < pts.length; i++) {
    if (!pts[i].m) continue;
    const c = near(i);
    if (!c) continue;
    let best = pts[i].m, bd = Math.abs(pts[i].m - c);
    [-24, -12, 12, 24].forEach((o) => {
      const v = pts[i].m + o;
      if (Math.abs(v - c) < bd) { bd = Math.abs(v - c); best = v; }
    });
    if (best !== pts[i].m) { pts[i].m = best; pts[i].hz = midiToHz(best); }
  }
  // 細かい揺れを均す（5点の中央値）。ビブラートの形は線の方で見せる。
  const raw = pts.map((p) => p.m);
  const sm = raw.slice();
  for (let i = 0; i < pts.length; i++) {
    if (!raw[i]) continue;
    const w = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(pts.length - 1, i + 2); k++) if (raw[k]) w.push(raw[k]);
    w.sort((a, b) => a - b);
    sm[i] = w[Math.floor(w.length / 2)];
  }
  pts.forEach((p, i) => { p.raw = raw[i]; p.m = sm[i]; });
  // つながっているところをひとかたまりにする
  const notes = [];
  let cur = null;
  pts.forEach((p) => {
    if (!p.m) { if (cur && cur.pts.length >= 4) notes.push(cur); cur = null; return; }
    if (!cur) { cur = { pts: [p], pend: [] }; return; }
    // 今の音の中央値から半音の7割以上ずれた点が2つ続いたら、そこから別の音
    const ms2 = cur.pts.map((x) => x.m).sort((x, y) => x - y);
    const med = ms2[Math.floor(ms2.length / 2)];
    if (Math.abs(p.m - med) < 0.8) { cur.pts = cur.pts.concat(cur.pend, [p]); cur.pend = []; return; }
    cur.pend.push(p);
    if (cur.pend.length >= 3) {
      if (cur.pts.length >= 4) notes.push(cur);
      cur = { pts: cur.pend.slice(), pend: [] };
    }
  });
  if (cur) { cur.pts = cur.pts.concat(cur.pend || []); if (cur.pts.length >= 4) notes.push(cur); }

  // 短すぎるかたまりは、前後の近い方に混ぜる（細切れを防ぐ）
  const MIN = 12;                      // 0.12秒
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].pts.length >= MIN) continue;
    const me = notes[i].pts;
    const mid = (x) => { const a = x.pts.map((y) => y.m).sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
    const prev = notes[i - 1], next = notes[i + 1];
    const gapP = prev ? Math.abs(mid(prev) - mid(notes[i])) : 99;
    const gapN = next ? Math.abs(mid(next) - mid(notes[i])) : 99;
    const near = Math.min(gapP, gapN);
    if (near > 2.5) continue;          // どちらとも離れていれば、そのまま残す
    if (gapP <= gapN) prev.pts = prev.pts.concat(me); else next.pts = me.concat(next.pts);
    notes.splice(i, 1); i--;
  }

  return notes.map((nt) => {
    const ms = nt.pts.map((x) => x.m).sort((a, b) => a - b);
    const mid = ms[Math.floor(ms.length / 2)];               // 中央値（揺れに強い）
    return {
      t0: nt.pts[0].t, t1: nt.pts[nt.pts.length - 1].t + 0.01,
      m: mid, shift: 0, pts: nt.pts,
    };
  });
}

// 音の高さを変えて鳴らす。声の周期に合わせて切り貼りする（PSOLA）。
// 声の周期の「山」に合わせて切り貼りする（PSOLA）。
// 山の位置を実際の波形から探すので、ぶつぶつが出にくい。
function psola(seg, rate, hzAt, outHzAt) {
  const n = seg.length;
  if (!n) return new Float32Array(0);
  const P0 = Math.max(16, Math.round(rate / Math.max(50, hzAt(0))));

  // 最初の山を探す
  let off = 0, best = 0;
  for (let i = 0; i < Math.min(n, P0 * 2); i++) { const v = Math.abs(seg[i]); if (v > best) { best = v; off = i; } }

  // 切り出す位置を、前の周期といちばん形が似た所に合わせる。
  // ここがずれると、周期ごとに波形が変わって声がざらつく。
  const marks = [off];
  let pos = off;
  while (true) {
    const P = Math.max(16, Math.round(rate / Math.max(50, hzAt(pos))));
    const next = pos + P;
    if (next >= n) break;
    const r = Math.max(2, Math.floor(P * 0.3));
    const len = Math.min(P, n - pos - 1);
    if (len < 8) break;
    let bp = next, bs = -2;
    for (let d = -r; d <= r; d++) {
      const c = next + d;
      if (c < pos + 8 || c + len >= n) continue;
      let dot = 0, e1 = 0, e2 = 0;
      for (let k = 0; k < len; k += 2) {          // 1つ飛ばしで足りる（速さのため）
        const a2 = seg[pos + k], b2 = seg[c + k];
        dot += a2 * b2; e1 += a2 * a2; e2 += b2 * b2;
      }
      const sc = (e1 > 0 && e2 > 0) ? dot / Math.sqrt(e1 * e2) : -1;
      if (sc > bs) { bs = sc; bp = c; }
    }
    marks.push(bp);
    pos = bp;
  }
  if (marks.length < 2) return seg.slice();

  const out = new Float32Array(n), acc = new Float32Array(n);
  let sp = marks[0], mi = 0, carry = 0;
  while (sp < n) {
    // その時刻にいちばん近い、元の側の山
    while (mi + 1 < marks.length && Math.abs(marks[mi + 1] - sp) <= Math.abs(marks[mi] - sp)) mi++;
    const am = marks[mi];
    const P = Math.max(16, Math.round(rate / Math.max(50, hzAt(am))));
    const win = P * 2;
    for (let k = 0; k < win; k++) {
      const si = am - P + k, oi = sp - P + k;
      if (si < 0 || si >= n || oi < 0 || oi >= n) continue;
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (win - 1));
      out[oi] += seg[si] * w;
      acc[oi] += w;
    }
    // 端数を持ち越して進める（丸めの積み重ねで音が濁るのを防ぐ）
    carry += rate / Math.max(50, outHzAt(sp));
    const adv = Math.max(8, Math.round(carry));
    carry -= adv;
    sp += adv;
  }
  for (let k = 0; k < n; k++) out[k] = acc[k] > 0.06 ? out[k] / acc[k] : seg[k];
  return out;
}


// その時刻の高さ（録った時の線から）
function hzAtTime(nt, t) {
  const pts = nt.pts;
  if (!pts || !pts.length) return midiToHz(nt.m);
  let k = 0;
  while (k + 1 < pts.length && pts[k + 1].t < t) k++;
  const p0 = pts[k], p1 = pts[Math.min(pts.length - 1, k + 1)];
  const m0 = p0.raw != null ? p0.raw : p0.m;
  const m1 = p1.raw != null ? p1.raw : p1.m;
  const span = p1.t - p0.t;
  const f = span > 0 ? Math.max(0, Math.min(1, (t - p0.t) / span)) : 0;
  return midiToHz(m0 + (m1 - m0) * f);
}

// 録音全体を一度に作り直す。かたまりごとに貼り合わせないので、継ぎ目のノイズが出ない。
function buildPitch(src, rate, notes, from, to) {
  const a = Math.max(0, Math.floor(from * rate));
  const b = Math.min(src.length, Math.ceil(to * rate));
  const seg = src.subarray(a, b);
  if (!seg.length) return new Float32Array(0);
  if (!notes.some((n) => n.shift || n.flat)) return seg.slice();

  // 各サンプルが、どのかたまりに属するか
  const find = (t) => {
    for (let i2 = 0; i2 < notes.length; i2++) if (t >= notes[i2].t0 && t < notes[i2].t1) return notes[i2];
    return null;
  };
  let cache = null, cacheT0 = -1, cacheT1 = -1;
  const noteAt = (t) => {
    if (cache && t >= cacheT0 && t < cacheT1) return cache;
    const n = find(t);
    cache = n; cacheT0 = n ? n.t0 : t; cacheT1 = n ? n.t1 : t + 0.001;
    return n;
  };
  const hzAt = (i2) => {
    const t = from + i2 / rate;
    const n = noteAt(t);
    return n ? hzAtTime(n, t) : 0;
  };
  const one = (n, t) => {
    if (!n) return 0;
    if (n.flat) return midiToHz(n.m + (n.shift || 0));
    return hzAtTime(n, t) * Math.pow(2, (n.shift || 0) / 12);
  };
  // かたまりの境目で高さが急に変わると、そこだけ音がうねる。
  // 20msかけて滑らかにつなぐ。
  const RAMP = 0.02;
  const outHzAt = (i2) => {
    const t = from + i2 / rate;
    const n = noteAt(t);
    if (!n) return 0;
    const v = one(n, t);
    if (!v) return 0;
    let other = null, f = 0;
    if (t - n.t0 < RAMP) { other = find(n.t0 - 0.001); f = 0.5 - 0.5 * ((t - n.t0) / RAMP); }
    else if (n.t1 - t < RAMP) { other = find(n.t1 + 0.001); f = 0.5 - 0.5 * ((n.t1 - t) / RAMP); }
    if (!other || other === n) return v;
    const ov = one(other, t);
    if (!ov) return v;
    return v * (1 - f) + ov * f;
  };
  // 音の無い所は元の周期が測れないので、近くのかたまりの値で埋める
  const fill = (fn) => (i2) => {
    let v = fn(i2);
    if (v) return v;
    for (let d = 1; d < rate; d += 64) {
      v = fn(i2 - d) || fn(i2 + d);
      if (v) return v;
    }
    return 220;
  };
  return psola(seg, rate, fill(hzAt), fill(outHzAt));
}

async function playPitch(only) {
  if (!PT.buf) return;
  freeMic();
  unlockAudio();
  if (!AC) return;
  try { if (AC.state === "suspended") await AC.resume(); } catch (e) {}
  const rate = PT.buf.sampleRate;
  const src = PT.buf.getChannelData(0);
  const t0 = only != null ? PT.notes[only].t0 : 0;
  const t1 = only != null ? PT.notes[only].t1 : PT.dur;
  const list = only != null ? [PT.notes[only]] : PT.notes;
  const dst0 = buildPitch(src, rate, list, t0, t1);

  const off = AC.createBuffer(1, Math.max(1, dst0.length), rate);
  const dst = off.getChannelData(0);
  dst.set(dst0);
  // 頭と終わりを短く絞る（鳴らし始め・鳴らし終わりの「ブチッ」を消す）
  const ed = Math.min(Math.floor(rate * 0.005), Math.floor(dst.length / 4));
  for (let k = 0; k < ed; k++) {
    const w = 0.5 - 0.5 * Math.cos((Math.PI * k) / ed);
    dst[k] *= w;
    dst[dst.length - 1 - k] *= w;
  }

  // 録った声は小さいので持ち上げる（割れないように頭を丸める）
  let peak = 0;
  for (let i = 0; i < dst.length; i += 7) { const v = Math.abs(dst[i]); if (v > peak) peak = v; }
  const gain = Math.max(1, Math.min(12, peak > 0.001 ? 0.9 / peak : 1));

  if (PT.src) { try { PT.src.stop(); } catch (e) {} }
  const node = AC.createBufferSource();
  node.buffer = off;
  const g2 = AC.createGain();
  g2.gain.value = gain;
  const sh = AC.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 1.6); }
  sh.curve = curve;
  node.connect(g2); g2.connect(sh); sh.connect(AC.destination);
  node.onended = () => { PT.playing = false; render(); };
  node.start();
  PT.src = node; PT.playing = true; render();
}

async function startPitch() {
  if (PT.on) return;
  try {
    unlockAudio();
    const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    micStream = st;
    const mr = new MediaRecorder(st);
    PT.chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) PT.chunks.push(e.data); };
    mr.onstop = async () => {
      st.getTracks().forEach((t2) => t2.stop());
      micStream = null;
      resetAudio();                    // 録り終わったらスピーカーに戻す
      PT.on = false;
      U.busy = "調べています…"; render();
      try {
        const blob = new Blob(PT.chunks, { type: mr.mimeType || "audio/webm" });
        PT.buf = await AC.decodeAudioData(await blob.arrayBuffer());
        PT.dur = PT.buf.duration;
        PT.chunks = [];                 // 解析したら、録った断片は捨てる
        PT.notes = analyzePitch(PT.buf.getChannelData(0), PT.buf.sampleRate);
        PT.sel = -1; PT.hist = [];
        pitchFit();
      } catch (e) { alert("うまく調べられませんでした。\n" + e.message); }
      U.busy = ""; render();
    };
    mr.start(200);                       // こまめに受け取る（途中で切れても残る）
    PT.rec = mr; PT.on = true; PT.t0 = Date.now(); render();
    clearInterval(PT.tick); clearTimeout(PT.timer);
    PT.tick = setInterval(() => { if (PT.on) render(); else clearInterval(PT.tick); }, 1000);
    PT.timer = setTimeout(() => { if (PT.on && PT.rec === mr) stopPitch(); }, 10000);
  } catch (e) {
    alert("マイクを使えませんでした。\n設定でマイクを許可してください。");
  }
}
function stopPitch() {
  clearTimeout(PT.timer); clearInterval(PT.tick);
  try { if (PT.rec && PT.rec.state === "recording") PT.rec.stop(); } catch (e) {}
}

// ---- ピッチの画面（Canvasで描いて、指で操作する） ----
const PV = { x0: 0, sec: 4, lo: 55, hi: 72, drag: null, cv: null, w: 0, h: 0 };
// 元に戻せるように、直前の状態を控える
function ptPush() {
  PT.hist.push(PT.notes.map((n) => ({ t0: n.t0, t1: n.t1, m: n.m, shift: n.shift, flat: !!n.flat, pts: n.pts })));
  if (PT.hist.length > 30) PT.hist.shift();
}
function ptPop() {
  const h2 = PT.hist.pop();
  if (!h2) return;
  PT.notes = h2.map((x) => ({ t0: x.t0, t1: x.t1, m: x.m, shift: x.shift, flat: x.flat, pts: x.pts }));
  if (PT.sel >= PT.notes.length) PT.sel = -1;
}

// かたまりを、その時刻で2つに切る
function splitNote(i, t) {
  const n = PT.notes[i];
  if (!n) return false;
  const pad = 0.05;
  if (t <= n.t0 + pad || t >= n.t1 - pad) return false;   // 端すぎる所では切らない
  const a = n.pts.filter((p) => p.t < t);
  const b = n.pts.filter((p) => p.t >= t);
  if (a.length < 4 || b.length < 4) return false;
  const mid = (arr) => { const v = arr.map((x) => x.m).sort((p, q) => p - q); return v[Math.floor(v.length / 2)]; };
  ptPush();
  PT.notes.splice(i, 1,
    { t0: n.t0, t1: t, m: mid(a), shift: n.shift, flat: n.flat, pts: a },
    { t0: t, t1: n.t1, m: mid(b), shift: n.shift, flat: n.flat, pts: b });
  PT.sel = i;
  return true;
}

// 隣とくっつける
function joinNote(i) {
  const a = PT.notes[i], b = PT.notes[i + 1];
  if (!a || !b) return false;
  ptPush();
  const pts = a.pts.concat(b.pts);
  const v = pts.map((x) => x.m).sort((p, q) => p - q);
  PT.notes.splice(i, 2, { t0: a.t0, t1: b.t1, m: v[Math.floor(v.length / 2)], shift: a.shift, flat: a.flat, pts });
  PT.sel = i;
  return true;
}

function pitchHTML() {
  const on = PT.on;
  const has = PT.notes.length > 0;
  const sel = PT.sel >= 0 ? PT.notes[PT.sel] : null;
  return `<div class="card">
    <div class="row" style="margin-bottom:8px;flex-wrap:wrap">
      ${on
        ? `<b class="grow" style="color:var(--bad)">録音中 ${Math.max(0, Math.floor((Date.now() - PT.t0) / 1000))}秒</b>
           <button class="chip sm" data-act="ptstop" style="background:var(--bad);color:#fff">■ 止める</button>`
        : `<button class="chip sm" data-act="ptstart" style="background:var(--bad);color:#fff">● 録音</button>
           ${has ? `<button class="chip sm" data-act="ptplay" style="background:var(--accent);color:#0A0A0A">${PT.playing ? "■" : "▶"}</button>
           <button class="chip sm" data-act="ptundo" ${PT.hist.length ? "" : 'style="opacity:.35"'}>戻る</button>
           <button class="chip sm" data-act="ptreset" style="color:var(--dim)">消す</button>` : ""}
           <span class="grow"></span>
           <button class="chip sm" data-act="ptzoom" data-id="-1">−</button>
           <button class="chip sm" data-act="ptzoom" data-id="1">＋</button>
           <button class="chip sm" data-act="ptfit">全体</button>`}
    </div>
    <canvas id="ptcv" class="ptcv"></canvas>
    ${has ? `<div class="row" style="margin-top:8px;flex-wrap:wrap">
      ${sel
        ? `<b style="font-size:14px;min-width:56px">${midiName(sel.m + sel.shift)}</b>
           <span style="font-size:11px;color:var(--dim);min-width:60px">${(() => { const c = Math.round(((sel.m + sel.shift) - Math.round(sel.m + sel.shift)) * 100); return c ? (c > 0 ? "+" : "") + c + "セント" : "ぴったり"; })()}</span>
           <button class="chip sm" data-act="ptstep" data-id="-1">−1</button>
           <button class="chip sm" data-act="ptstep" data-id="1">＋1</button>
           <button class="chip sm" data-act="ptflat" style="${sel.flat ? "background:var(--accent);color:#0A0A0A" : ""}">まっすぐ</button>
           <button class="chip sm" data-act="ptsplit">切る</button>
           ${PT.sel < PT.notes.length - 1 ? `<button class="chip sm" data-act="ptjoin">つなぐ</button>` : ""}
           <button class="chip sm" data-act="ptclear" style="color:var(--dim)">戻す</button>`
        : `<span style="font-size:11px;color:var(--dim)">音を押すと鳴ります。押したまま上下で高さを変えられます。</span>`}
    </div>` : `<div style="font-size:11px;color:var(--dim);margin-top:8px">「● 録音」を押して歌ってください。止めるまで録れます（最長10秒）。</div>`}
    ${has && PT.dur < 1 ? `<div style="font-size:11px;color:var(--bad);margin-top:6px">${PT.dur.toFixed(1)}秒しか録れていません。</div>` : ""}
  </div>`;
}

// 画面の縦位置と音の高さを行き来する
const pvY = (m) => PV.h - ((m - PV.lo) / Math.max(1, PV.hi - PV.lo)) * PV.h;
const pvX = (t) => ((t - PV.x0) / PV.sec) * PV.w;
const pvT = (x) => PV.x0 + (x / PV.w) * PV.sec;

function drawPitch() {
  const cv = document.getElementById("ptcv");
  if (!cv || typeof cv.getContext !== "function") return;
  PV.cv = cv;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 320, h = 260;
  if (cv.width !== Math.floor(w * dpr) || cv.height !== Math.floor(h * dpr)) {
    cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    cv.style.height = h + "px";
  }
  PV.w = w; PV.h = h;
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  // 鍵盤の帯
  const rowH = h / Math.max(1, PV.hi - PV.lo);
  for (let m = Math.floor(PV.lo); m <= Math.ceil(PV.hi); m++) {
    const black = [1, 3, 6, 8, 10].indexOf(((m % 12) + 12) % 12) >= 0;
    const y = pvY(m + 0.5);
    g.fillStyle = black ? "rgba(255,255,255,.045)" : "rgba(255,255,255,.012)";
    g.fillRect(0, y, w, rowH);
    if (rowH > 11) {
      g.fillStyle = "rgba(255,255,255,.30)";
      g.font = "9px -apple-system,sans-serif";
      g.fillText(midiName(m), 3, y + rowH / 2 + 3);
    }
    g.strokeStyle = ((m % 12) + 12) % 12 === 0 ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.05)";
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }

  if (!PT.notes.length) {
    g.fillStyle = "rgba(255,255,255,.22)";
    g.font = "12px -apple-system,sans-serif";
    const msg = PT.on ? "録音中…" : "ここに歌った音が出ます";
    g.fillText(msg, w / 2 - g.measureText(msg).width / 2, h / 2);
    return;
  }

  // 音のかたまり
  PT.notes.forEach((n, i) => {
    const x1 = pvX(n.t0), x2 = pvX(n.t1);
    if (x2 < -20 || x1 > w + 20) return;
    const sel = i === PT.sel;
    const y = pvY(n.m + n.shift);
    const bh = Math.max(10, rowH * 0.82);
    g.fillStyle = sel ? "rgba(217,119,87,.95)" : "rgba(217,119,87,.42)";
    g.beginPath();
    const r = Math.min(4, (x2 - x1) / 2);
    g.moveTo(x1 + r, y - bh / 2);
    g.arcTo(x2, y - bh / 2, x2, y + bh / 2, r);
    g.arcTo(x2, y + bh / 2, x1, y + bh / 2, r);
    g.arcTo(x1, y + bh / 2, x1, y - bh / 2, r);
    g.arcTo(x1, y - bh / 2, x2, y - bh / 2, r);
    g.fill();
    if (sel) { g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.stroke(); }

    // ビブラートやしゃくりの線
    g.strokeStyle = sel ? "#fff" : "rgba(255,255,255,.55)";
    g.lineWidth = 1.4;
    g.beginPath();
    n.pts.forEach((p, k) => {
      const px = pvX(p.t), py = pvY(n.flat ? (n.m + n.shift) : ((p.raw || p.m) + n.shift));
      if (k) g.lineTo(px, py); else g.moveTo(px, py);
    });
    g.stroke();

    // かたまりの切れ目
    if (i > 0) {
      g.strokeStyle = "rgba(255,255,255,.25)";
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, h - 12); g.stroke();
    }
    if (x2 - x1 > 26 && rowH > 9) {
      g.fillStyle = sel ? "#0A0A0A" : "rgba(0,0,0,.65)";
      g.font = "bold 9px -apple-system,sans-serif";
      g.fillText(midiName(n.m + n.shift), x1 + 3, y + 3);
    }
  });

  // 目盛り（秒）
  g.fillStyle = "rgba(255,255,255,.28)";
  g.font = "9px -apple-system,sans-serif";
  for (let t2 = Math.ceil(PV.x0); t2 <= PV.x0 + PV.sec; t2++) {
    const x = pvX(t2);
    g.fillRect(x, h - 10, 1, 10);
    g.fillText(t2 + "s", x + 2, h - 2);
  }
}

// 表示範囲を中身に合わせる
function pitchFit() {
  if (!PT.notes.length) { PV.x0 = 0; PV.sec = 4; PV.lo = 55; PV.hi = 72; return; }
  const ms = [];
  PT.notes.forEach((n) => n.pts.forEach((p) => ms.push(p.m + n.shift)));
  const lo = Math.min.apply(null, ms), hi = Math.max.apply(null, ms);
  const pad = Math.max(1.5, (hi - lo) * 0.25);
  PV.lo = Math.floor(lo - pad); PV.hi = Math.ceil(hi + pad);
  if (PV.hi - PV.lo < 6) { const c = (PV.hi + PV.lo) / 2; PV.lo = c - 3; PV.hi = c + 3; }
  PV.x0 = 0; PV.sec = Math.max(1, PT.dur);
}

// 指の操作
function pitchTouch(cv) {
  let mode = "", startD = 0, startSec = 0, startSpan = 0, startX = 0, startY = 0, startX0 = 0, startLo = 0, moved = false, hitI = -1, startC = { x: 0, y: 0 }, holdT = null, held = false;
  const pos = (e, k) => {
    const r = cv.getBoundingClientRect();
    const t2 = e.touches ? e.touches[k || 0] : e;
    return { x: t2.clientX - r.left, y: t2.clientY - r.top };
  };
  const hit = (p) => {
    for (let i = PT.notes.length - 1; i >= 0; i--) {
      const n = PT.notes[i];
      const x1 = pvX(n.t0), x2 = pvX(n.t1), y = pvY(n.m + n.shift);
      const bh = Math.max(14, (PV.h / Math.max(1, PV.hi - PV.lo)) * 0.9);
      if (p.x >= x1 - 4 && p.x <= x2 + 4 && Math.abs(p.y - y) <= bh) return i;
    }
    return -1;
  };
  cv.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      mode = "zoom";
      const a = pos(e, 0), b = pos(e, 1);
      startD = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      startSec = PV.sec; startSpan = PV.hi - PV.lo;
      startX0 = PV.x0; startLo = PV.lo;
      startC = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      e.preventDefault(); return;
    }
    const p = pos(e);
    hitI = hit(p);
    moved = false;
    startX = p.x; startY = p.y; startX0 = PV.x0;
    mode = hitI >= 0 ? "note" : "pan";
    clearTimeout(holdT);
    if (hitI >= 0) {
      // 長押しでその場所を切る
      const at = pvT(p.x), idx2 = hitI;
      holdT = setTimeout(() => {
        if (moved || mode !== "note") return;
        if (splitNote(idx2, at)) { held = true; drawPitch(); render(); }
      }, 550);
    }
    if (hitI >= 0) {
      PT.sel = hitI; ptPush();
      PV.drag = { i: hitI, m0: PT.notes[hitI].shift, y0: p.y };
      drawPitch();                       // 描き直すだけ。画面は作り直さない。
    }
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener("touchmove", (e) => {
    if (mode === "zoom" && e.touches.length === 2) {
      const a = pos(e, 0), b = pos(e, 1);
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const k = d / startD;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const tAt = startX0 + (cx / PV.w) * startSec;
      const mAt = startLo + ((PV.h - cy) / PV.h) * startSpan;
      // つまむ動きが小さい時は、2本指の移動として扱う
      if (Math.abs(d - startD) < 12) {
        PV.x0 = startX0 - ((cx - startC.x) / PV.w) * PV.sec;
        PV.lo = startLo + ((cy - startC.y) / PV.h) * startSpan;  // 指を下げたら表示も下がる
        PV.hi = PV.lo + startSpan;
      } else {
        PV.sec = Math.max(0.3, Math.min(30, startSec / k));
        const span = Math.max(3, Math.min(48, startSpan / k));
        PV.x0 = tAt - (cx / PV.w) * PV.sec;
        PV.lo = mAt - ((PV.h - cy) / PV.h) * span;
        PV.hi = PV.lo + span;
      }
      drawPitch(); e.preventDefault(); return;
    }
    const p = pos(e);
    if (Math.abs(p.x - startX) > 4 || Math.abs(p.y - startY) > 4) { moved = true; clearTimeout(holdT); }
    if (mode === "note" && PV.drag) {
      const n2 = PT.notes[PV.drag.i];
      const dm = (startY - p.y) / (PV.h / Math.max(1, PV.hi - PV.lo));
      // 半音ずつ動かし、その音の真ん中にぴたりと合わせる
      const want = n2.m + PV.drag.m0 + dm;
      n2.shift = Math.max(-24, Math.min(24, Math.round(want) - n2.m));
      drawPitch();
    } else if (mode === "pan") {
      PV.x0 = startX0 - ((p.x - startX) / PV.w) * PV.sec;
      drawPitch();
    }
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener("touchend", (e) => {
    clearTimeout(holdT);
    if (held) { held = false; mode = ""; PV.drag = null; e.preventDefault(); return; }
    if (mode === "note" && !moved && hitI >= 0) { PT.hist.pop(); playPitch(hitI); }   // 押しただけなら鳴らす
    if (mode === "note") render();       // 離した時にだけ整える
    mode = ""; PV.drag = null;
    e.preventDefault();
  }, { passive: false });
}

/* ---------------- メトロノーム ---------------- */
// 鳴らす時刻をあらかじめ音の仕組みに渡すので、画面の重さに影響されず正確に刻む。
// 1小節を4拍とし、2＝2分音符 / 4＝4分音符 / 8＝8分音符 / 16＝16分音符 で刻む。
let met = null;
const metBpm = () => S.bpm || 120;
const metSub = () => S.sub || 4;

function metClick(t, accent) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = "square";
  o.frequency.value = accent ? 1800 : 1100;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.24, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + 0.05);
}
const metStep = () => (60 / metBpm()) * 4 / metSub();

function metStart() {
  freeMic();
  unlockAudio();
  if (!AC) return;
  metStop(true);
  met = { next: AC.currentTime + 0.12, n: 0, beat: 0 };
  met.timer = setInterval(() => {
    if (!met || !AC) return;
    const sub = metSub();
    while (met.next < AC.currentTime + 0.15) {
      metClick(met.next, met.n % sub === 0);
      met.beat = met.n % sub;
      met.next += metStep();
      met.n++;
      const el = document.getElementById("metbeat");
      if (el) el.textContent = String(met.beat + 1);
    }
  }, 25);
  keepAwake();
  render();
}
function metStop(quiet) {
  if (met) { clearInterval(met.timer); met = null; }
  if (!quiet) render();
}
function metSet(bpm) {
  S.bpm = Math.max(30, Math.min(280, Math.round(bpm)));
  save(); render();
}
let taps = [];
function metTap() {
  const now = Date.now();
  if (taps.length && now - taps[taps.length - 1] > 2500) taps = [];
  taps.push(now);
  if (taps.length > 5) taps.shift();
  if (taps.length >= 2) {
    let sum = 0;
    for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
    metSet(60000 / (sum / (taps.length - 1)));
  } else render();
}
function metroHTML() {
  return `<div class="card">
    <div class="row" style="margin-bottom:10px">
      <div class="grow" style="font-size:34px;font-weight:700;line-height:1;letter-spacing:-.03em">${metBpm()}<span style="font-size:11px;color:var(--dim);font-weight:400;margin-left:6px">BPM</span></div>
      <div id="metbeat" style="font-size:26px;color:${met ? "var(--accent)" : "var(--dim)"};width:32px;text-align:center">${met ? met.beat + 1 : "–"}</div>
      <button class="chip" data-act="${met ? "metstop" : "metstart"}"
        style="${met ? "background:var(--bad);color:#0A0A0A" : "background:var(--accent);color:#0A0A0A"}">${met ? "停止" : "開始"}</button>
    </div>
    <div class="row" style="margin-bottom:8px">
      <button class="chip sm" data-act="bpm" data-id="-5">−5</button>
      <button class="chip sm" data-act="bpm" data-id="-1">−1</button>
      <button class="chip sm grow" data-act="mettap">タップでテンポ</button>
      <button class="chip sm" data-act="bpm" data-id="1">＋1</button>
      <button class="chip sm" data-act="bpm" data-id="5">＋5</button>
    </div>
    <div class="row">
      ${[2, 4, 8, 16].map((b) => `<button class="chip sm grow" data-act="metsub" data-id="${b}"
        style="${metSub() === b ? "background:var(--accent);color:#0A0A0A" : ""}">${b}ビート</button>`).join("")}
    </div>
  </div>`;
}

/* ---------------- 音声メモ（この端末の中だけ） ---------------- */
let DB = null;
function db() {
  return new Promise((res, rej) => {
    if (DB) return res(DB);
    if (!window.indexedDB) return rej(new Error("この端末では音声を保存できません。"));
    const r = indexedDB.open("utacheck", 2);
    r.onupgradeneeded = () => {
      const d2 = r.result;
      if (!d2.objectStoreNames.contains("clips")) d2.createObjectStore("clips");
      if (!d2.objectStoreNames.contains("state")) d2.createObjectStore("state");
    };
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

// 本体のデータの置き場所。localStorageは端末の上限（数MB）が小さすぎるので、
// IndexedDBに置く。こちらは桁違いに入る。
async function idbPut(key, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("state", "readwrite");
    t.objectStore("state").put(val, key);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
async function idbGet(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("state", "readonly");
    const q = t.objectStore("state").get(key);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}

let REC = null, recChunks = [], recTick = null, recT0 = 0, recKey = "";
let AU = null, auKey = "", auTick = null;

// 録音は押すたびに別のものとして残す
const recKeysOf = (so) => {
  if (!so) return [];
  const pre = S.showId + "|" + so.id;
  return Object.keys(S.recs || {}).filter((k) => k === pre || k.indexOf(pre + "|") === 0)
    .sort((a, b) => (S.recs[a].ts || 0) - (S.recs[b].ts || 0));
};
const recKeyOf = (so) => { const ks = recKeysOf(so); return ks[Math.min(U.recPick != null ? U.recPick : ks.length - 1, ks.length - 1)] || ""; };
const hasRec = (so) => recKeysOf(so).length > 0;
const mmss = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
};

async function startRec() {
  if (VIEW()) return;
  const so = song();
  if (!so) return;

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
    recKey = S.showId + "|" + so.id + "|" + Date.now();
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
          U.recPick = null;
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
const recAt = () => (REC && REC.state === "recording") ? (Date.now() - recT0) / 1000 : null;

function freeMic() {
  // iPhoneはマイクを掴んでいる間、音が受話口から出るので必ず離す
  let had = false;
  const kill = (st) => {
    if (!st || !st.getTracks) return;
    st.getTracks().forEach((t) => { if (t.readyState !== "ended") { had = true; } t.stop(); });
  };
  try { if (REC && REC.state === "recording") REC.stop(); } catch (e) {}
  try { if (REC) kill(REC.stream); } catch (e) {}
  try { if (PT.rec) kill(PT.rec.stream); } catch (e) {}
  try { kill(micStream); micStream = null; } catch (e) {}
  // マイクを離した直後は、音の通り道を作り直さないと受話口のままになる
  if (had) resetAudio();
}

// 音の通り道を作り直す（スピーカーから鳴るように戻す）
function resetAudio() {
  try {
    if (AC && AC.close) { const old = AC; AC = null; old.close(); }
    if (silentEl) { try { silentEl.pause(); } catch (e) {} silentEl = null; }
  } catch (e) { /* 作り直せなくても動く */ }
  unlockAudio();
}

async function openPlayer(seek) {
  const so = song(); if (!so) return;
  freeMic();
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

// ライブ中の緊急メッセージ。メンバーが「確認」を押すまで画面いっぱいに出す。
const alertPending = () => {
  const a = S.pubAlert;
  return VIEW() && a && a.id && S.alertSeen !== a.id ? a : null;
};
function viewAlert(a) {
  return `
  <div class="scroll" style="display:flex;flex-direction:column;justify-content:center;align-items:center;
    background:var(--bad);color:#0A0A0A;padding:28px 22px;text-align:center;gap:22px">
    <div style="font-size:13px;font-weight:700;letter-spacing:.1em;opacity:.75">お知らせ</div>
    <div style="font-size:26px;font-weight:800;line-height:1.5;white-space:pre-wrap;word-break:break-word">${h(a.text)}</div>
    <div style="font-size:12px;opacity:.7">${new Date(a.at || Date.now()).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</div>
    <button data-act="alertok" style="background:#0A0A0A;color:#fff;border-radius:14px;padding:16px 40px;font-size:17px;font-weight:700">確認しました</button>
  </div>`;
}

// 入力中に画面を作り直すと、打っていた文字と入力位置が飛ぶ。
// 誰かが文字を打っている間は組み直さず、離れた時にまとめてやり直す。
let pendingRender = false;
function typingNow() {
  const ae = document.activeElement;
  if (!ae) return false;
  const t = ae.tagName;
  if (t !== "TEXTAREA" && t !== "INPUT") return false;
  if (ae.type === "file") return false;
  return true;
}
function render() {
  // メンバーへのお知らせだけは、打っていても割り込ませる
  if (typingNow() && !alertPending()) { pendingRender = true; return; }
  pendingRender = false;
  const keep = app.querySelector(".scroll");
  const st = keep ? keep.scrollTop : 0;
  const sig = U.view + U.songIdx + U.mode + U.allShows + U.overview;
  const sameView = app.dataset.view === sig;
  app.dataset.view = sig;

  const pend = alertPending();
  if (pend) app.innerHTML = viewAlert(pend);
  else if (S.recMode && U.view === "recplan") app.innerHTML = viewPlan();
  else if (S.recMode && U.view === "recprint") app.innerHTML = viewRecPrint();
  else if (U.view === "absent") app.innerHTML = viewAbsent();
  else if (U.view === "print") app.innerHTML = viewPrint();
  else if (U.view === "live") app.innerHTML = viewLive();
  else if (U.view === "summary") app.innerHTML = viewSummary();
  else app.innerHTML = viewSetup();

  // 保存できていないことは、どの画面にいても分かるようにする（紙面には出さない）
  if (saveErr && U.view !== "print" && U.view !== "recprint") {
    app.insertAdjacentHTML("afterbegin",
      `<button class="banner noprint" data-act="gostorage" style="width:100%;text-align:left">保存できていません。ここを押して空きを作ってください。</button>`);
  }
  const sc = app.querySelector(".scroll");
  if (sc && sameView) sc.scrollTop = st;
  renderSheet();
  if (U.view === "live" && !U.overview) setTimeout(paintInk, 0);
  if (U.view === "print" || U.view === "recprint") setTimeout(fitPrintDOM, 0);
  if (S.recMode) setTimeout(() => { tickPlan(); scrollTab(); }, 0);
  if (U.view === "setup") setTimeout(() => {
    const cv = document.getElementById("ptcv");
    if (cv && !cv.dataset.ready) { cv.dataset.ready = "1"; pitchTouch(cv); }
    drawPitch();
  }, 0);
  if (VIEW() && (U.view === "live" || U.view === "print")) {
    const cur = song();
    clearTimeout(readTimer);
    if (cur && isUnread(cur)) readTimer = setTimeout(() => {
      if (song() && song().id === cur.id) { markRead(cur); render(); }
    }, 700);
  }
  // PDFの名前を決める。1曲だけならその曲名、複数なら公演名。最後に「歌チェック 日付」。
  try {
    document.title = U.view === "recprint" ? ((recSong() || {}).title || "歌詞") + " 歌チェック " + ymd()
      : U.view === "print" ? printTitle() : "歌チェック";
  } catch (e) { /* 名前を変えられない場合は既定のまま */ }
  if (U.view === "setup") setTimeout(() => showPianoAtC4(app), 0);
}

// 今日の日付（ファイル名用）
function ymd(d) {
  const t = d ? new Date(d) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}`;
}
// PDFの名前。1曲だけならその曲名、まとめてなら公演名。
function printTitle() {
  const all = SONGS();
  const picked = U.printPick ? all.filter((x) => U.printPick.includes(x.id)) : all;
  const base = picked.length === 1 ? songName(picked[0]) : (showName() || "歌割");
  // ファイル名に使えない文字だけ置き換える（8/6 → 8-6）
  return `${base} 歌チェック ${ymd()}`.replace(/[\\/:]/g, "-").replace(/[*?"<>|]/g, "");
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

// その行が属している区切り（区切り名は上から引き継がれる）。
// 表記の枠（ガヤなど）は、その表記が付いている行だけを見る。
function secOfLine(so, i) {
  const ls = so.lines || [];
  for (let k = i; k >= 0; k--) if (ls[k].sec) return ls[k].sec;
  return "";
}
function linesInSec(so, nm) {
  const ls = so.lines || [];
  const out = [];
  if (!nm) return out;
  // Gaya1 のような枝番も、表記の枠として扱う
  const isTag = tagSecNames().includes(nm) || tagSecNames().includes(tagBase(nm));
  ls.forEach((l, i) => {
    if (l.gap) return;
    /* Gaya を選べば Gaya1 も Gaya2 も出す。Gaya2 を選べばその分だけ。 */
    if (isTag ? (tagNum(nm) ? l.tag === nm : tagBase(l.tag) === nm)
              : secOfLine(so, i) === nm) out.push(i);
  });
  return out;
}
// いま出している区切り。選んでいなければ全部出す。
function focusSec() {
  if (!S.recMode) return "";
  const ord = sectionOrder();
  if (!U.secView) return "";
  // Gaya1 のような枝番は、並びには Gaya としてしか入っていない。
  // 基底名が並びにあれば、その枝番も出せるようにする。
  if (ord.includes(U.secView) || ord.includes(tagBase(U.secView))) return U.secView;
  return "";
}
function markStyle(n) {
  const c = noteColor(n);
  return `border-bottom-color:${c};background:color-mix(in srgb,${c} 22%,transparent)`;
}

function viewLive() {
  const s = song();
  if (U.overview && s) return viewOverview(s);

  let body = "";
  const fsec = s ? focusSec() : "";
  const fset = fsec ? new Set(linesInSec(s, fsec)) : null;
  if (!s) {
    body = `<div style="padding:64px 26px;text-align:center;color:var(--dim);font-size:14px">曲がありません</div>`;
  } else {
    const ns0 = NOTES().filter((n) => n.songId === s.id && n.showId === S.showId && inTake(n));
    const gp = groupPos(s.lines);
    const vm = S.recMode ? vtMarks(s) : { head: [], info: [] };
    // 表記の枠（ガヤなど）から飛べるよう、最初に出てくる行に目印を置く
    const tanc = {};
    if (S.recMode) {
      const tg = tagSecNames();
      s.lines.forEach((l, k) => { if (l.tag && tg.includes(l.tag) && tanc[l.tag] == null) tanc[l.tag] = k; });
    }
    body = s.lines.map((l, i) => {
      if (fset && !fset.has(i)) return "";
      if (l.gap) {
        const gns = ns0.filter((n) => covers(n, i));
        if (VIEW() && !gns.length) return `<div class="gap"></div>`;
        const gm = gns.map((n) => {
          const c = noteColor(n);
          const txt = n.tags.length ? n.tags.map(tagName).join("/") : (n.memo ? "メモ" : "・");
          return `<b class="mk" style="background:${c}">${h(txt)}${n.pitch ? " ♪" + h(pitchLabel(n.pitch)) : ""}</b>`;
        }).join("");
        const gp2 = gns.filter((n) => n.memo).map((n) =>
          `<button class="tagpill" data-act="note" data-i="${i}" style="color:var(--dim)">${h(n.memo)}</button>`).join("");
        const gt = gns.length ? noteColor(gns[0]) : "";
        return `<div class="ln lngap" style="${gt ? `background:color-mix(in srgb,${gt} 9%,transparent)` : ""}">
          <button class="lbl" data-act="noteblock" data-i="${i}"></button>
          <div class="brk"></div>
          <div class="grow" style="min-width:0"><button data-act="noteblock" data-i="${i}"
            style="display:block;width:100%;text-align:left;min-height:14px">${gm}</button>${gp2}</div></div>`;
      }
      const ns = ns0.filter((n) => covers(n, i));
      const chars = Array.from(S.recMode && l.add ? "（" + l.t + "）" : l.t);
      const badge = (n) => {
        const c = noteColor(n);
        const txt = n.tags.length ? n.tags.map(tagName).join("/") : (n.memo ? "メモ" : "・");
        const body = `${h(txt)}${n.pitch ? " ♪" + h(pitchLabel(n.pitch)) : ""}`;
        return n.pitch
          ? `<button class="mk" data-act="playnote" data-id="${n.id}" style="background:${c}">${body}</button>`
          : `<b class="mk" style="background:${c}">${body}</b>`;
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
      const st2 = lineStatus(s, i);
      const newSec = S.recMode && l.sec && l.sec !== (s.lines[i - 1] || {}).sec;
      const foc = U.focus && partsOf(s, i).includes(U.focus);
      const tint = st2 === "need" ? "var(--bad)" : st2 === "changed" ? "#F0B23C"
        : foc ? "#4C9BFF" : (ns.length ? noteColor(ns[0]) : "");
      const strength = (st2 || foc) ? 18 : 9;
      const vtc = S.recMode ? vtColor(vtOf(l)) : "";
      const vh = vm.info[i];
      return `${newSec ? `<div class="secdiv" id="sec-${h(l.sec)}"><span>${h(l.sec)}</span></div>` : ""}
      ${vh ? `<div class="vtdiv" style="color:${vh.c}"><span>${h(vh.vt)}</span></div>` : ""}
      <div class="ln${S.recMode && l.add ? " lnadd" : ""}${S.recMode && l.skip ? " lnskip" : ""}${isAgeri(l) ? " lnage" : ""}"${
        l.tag && tanc[l.tag] === i ? ` id="sec-${h(l.tag)}"` : ""} style="${tint ? `background:color-mix(in srgb,${tint} ${strength}%,transparent);` : ""}${vtc ? `box-shadow:inset 3px 0 0 ${vtc}` : ""}">
        <button class="lbl" data-act="${S.recMode ? "rbar" : (VIEW() ? "noteblock" : "assignline")}" data-i="${i}"
          style="${st2 ? `color:${st2 === "need" ? "var(--bad)" : "#F0B23C"}` : ""}">${S.recMode && l.tag ? `<b class="tagmk">${h(l.tag)}</b>` : ""}${labelHTML(s, i)}</button>
        <div class="brk ${gp[i]}"></div>
        <div class="grow" style="min-width:0">
          <div class="txt" data-l="${i}" style="font-size:${S.size}px">${cells}</div>${pills}
        </div></div>`;
    }).join("");
  }

  if (fset && !body.trim()) {
    body = `<div style="padding:56px 26px;text-align:center;color:var(--dim);font-size:14px">
      「${h(fsec)}」の歌詞がありません</div>`;
  }
  const noSong = VIEW() && !SONGS().length;
  return `
  ${preview ? `<div class="noprint" style="padding:10px 12px;background:#1F2E24;color:#8FD9A8;font-size:12px">
      メンバーの見え方を確認中（手元のデータは変わりません／既読も残りません）
      <button data-act="endpv" style="float:right;color:#8FD9A8;font-weight:700">終わる</button></div>` : ""}
  ${otherAt ? `<div class="noprint" style="padding:10px 12px;background:#2A2118;color:#F0C089;font-size:12px;line-height:1.7">
      別の端末で更新されています（${new Date(otherAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）。この端末にも変更があります。
      <div class="row" style="margin-top:8px">
        <button class="chip sm" data-act="takeother" style="background:var(--accent);color:#0A0A0A">別の端末の内容にする</button>
        <button class="chip sm" data-act="keepmine">この端末の内容を送る</button>
      </div>
    </div>` : ""}
  ${bootErr ? `<div style="padding:10px 12px;background:#3A2420;color:#FFB4A2;font-size:12px;white-space:pre-wrap">${h(bootErr)}<button data-act="bootok" style="float:right;color:#FFB4A2">✕</button></div>` : ""}
  ${!noSong && /合言葉/.test(syncErr) ? `<div class="noprint" style="padding:10px 12px;background:#2A2118;color:#F0C089;font-size:12px">
      ${h(syncErr)}表示中の内容は古いままです。
      <button class="chip sm" data-act="askkey" style="margin-left:8px">合言葉を入れる</button>
    </div>` : ""}
  ${noSong ? `<div style="padding:12px;background:#2A2118;color:#F0C089;font-size:12px;line-height:1.7">
      ${h(syncErr || (S.src ? "まだ受け取れていません。" : "接続リンクから開いてください。"))}
      ${syncAt ? `<div style="color:var(--dim);font-size:11px;margin-top:4px">最後に受け取れたのは ${new Date(syncAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>` : ""}
      <div class="row" style="margin-top:8px">
        ${S.src ? `<button class="chip sm" data-act="synow" style="background:var(--accent);color:#0A0A0A">今すぐ受け取る</button>` : ""}
        <button class="chip sm" data-act="pastelink" style="${S.src ? "" : "background:var(--accent);color:#0A0A0A"}">リンクを貼って つなぐ</button>
        ${/合言葉/.test(syncErr) ? `<button class="chip sm" data-act="askkey">合言葉を入れる</button>` : ""}
      </div>
    </div>` : ""}
  <div class="hd">
    <button class="grow" style="text-align:left" data-act="picker">
      <div class="t1" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px">${S.recMode
        ? `<b style="color:var(--accent)">レコーディングモード</b>${s ? " ・ " + h((S.groups.find((x) => x.id === s.groupId) || {}).name || s.folder || "") : ""}`
        : `<b style="color:var(--accent)">ライブモード</b>${s ? " ・ " + h((S.groups.find((x) => x.id === s.groupId) || {}).name || "") : ""} ・ ${h(showName() || "公演名未設定")}${SONGS().length ? ` ・ ${U.songIdx + 1}/${SONGS().length}` : ""}${pushState ? ` ・ <span style="color:${pushState === "未送信" ? "var(--bad)" : "var(--dim)"}">${h(pushState)}</span>` : ""}`}${recWho()}</div>
      ${VIEW() && S.pubAt ? `<div style="font-size:10px;line-height:1.4">${freshLine()}</div>` : ""}
      <div class="t2 clamp2">${s && s.mark ? `<b style="color:var(--accent)">★</b> ` : ""}${s && !S.recMode && takeLabel(s) ? `<b class="tkmk">${h(takeLabel(s))}</b>` : ""}${h(s ? s.title : "曲がありません")}</div>
    </button>
    ${S.recMode ? `<span id="pcd2" style="font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums;margin-right:4px"></span>` : ""}
    ${s ? `<button class="ic" data-act="overview" style="font-size:12px">全体</button>` : ""}
    ${!VIEW() && !S.recMode && s ? `<button class="ic" data-act="songmenu" data-i="${U.songIdx}">⋯</button>` : ""}
    <button class="ic" data-act="go-setup" style="font-size:12px">設定</button>
  </div>
  ${s ? blockBar(s) : ""}
  <div class="scroll" style="position:relative">
    <canvas id="ink" class="ink" style="pointer-events:${U.draw && !VIEW() ? "auto" : "none"};touch-action:${U.draw ? "none" : "auto"}"></canvas>
    ${body}
    ${s && !S.recMode ? `<div class="card" style="margin:18px 12px 0">
      <h4 style="font-size:11px;color:var(--dim);margin-bottom:8px">総括</h4>
      ${VIEW()
        ? `<div style="font-size:13px;white-space:pre-wrap">${h(songMemo(s.id)) || "—"}</div>`
        : `<textarea class="field" id="songmemo" rows="4" style="resize:none">${h(songMemo(s.id))}</textarea>`}
    </div>` : ""}
    ${s && !VIEW() && !S.recMode ? `<div class="pull" id="pull">
      <div class="pullbar"><i id="pullfill"></i></div>
      <div class="pulltx" id="pulltx">引き上げて テイク${nextTake(s)} を作る</div>
    </div>` : `<div style="height:120px"></div>`}</div>
  ${S.recMode ? recBar() : (s && !VIEW() && !U.draw ? `<div class="aubar">
    ${REC
      ? `<button data-act="recstop" class="aub" style="background:var(--bad);color:#0A0A0A">■</button>
         <span class="grow" id="rectime" style="color:var(--bad);font-weight:600">● 0:00</span>
         <span style="font-size:11px;color:var(--dim)">録音中</span>`
      : hasRec(s)
        ? `<button data-act="${AU && !AU.paused ? "pauseau" : "playtop"}" class="aub">${AU && !AU.paused ? "❚❚" : "▶"}</button>
           <input id="aubar" type="range" min="0" max="1000" value="0" class="grow">
           ${recKeysOf(s).length > 1 ? `<button class="chip sm" data-act="recprev">◀</button>
             <span style="font-size:11px;color:var(--dim)">${recKeysOf(s).indexOf(recKeyOf(s)) + 1}/${recKeysOf(s).length}</span>
             <button class="chip sm" data-act="recnext">▶</button>` : ""}
           <span id="autime" style="font-size:11px;color:var(--dim);min-width:74px;text-align:right">0:00 / ${mmss((S.recs[recKeyOf(s)] || {}).dur)}</span>
           <button data-act="delrec" class="aub" style="font-size:13px;color:var(--dim)">✕</button>`
        : `<button data-act="recstart" class="aub" style="color:var(--bad)">●</button>
           <span class="grow" style="font-size:11px;color:var(--dim)">録音</span>`}
  </div>` : "")}
  <div class="bottom">
    ${S.recMode
      ? `<button data-act="rtakedn" class="${Number((s || {}).take || 1) <= 1 ? "off" : ""}">‹</button>
         <button data-act="rtakeup">›</button>`
      : `<button data-act="prev" class="${U.songIdx <= 0 ? "off" : ""}">‹</button>
         <button data-act="next" class="${U.songIdx >= SONGS().length - 1 ? "off" : ""}">›</button>`}
    ${VIEW() ? "" : `<button data-act="draw" class="${U.draw ? "on" : ""}">✎</button>`}
    ${U.draw && !VIEW() ? `
      <button data-act="eraser" class="${U.erase ? "on" : ""}">
        <svg viewBox="0 0 24 24" width="16" height="16" style="pointer-events:none">
          <path d="M4 16.5 12.5 8l5 5L11 19.5H6.5z" fill="currentColor" opacity=".95"/>
          <path d="M12.5 8 16 4.5a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8L17.5 13z" fill="currentColor" opacity=".55"/>
          <path d="M4 20.5h16" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        </svg></button>
      ` : ""}
    ${VIEW() && unreadSongs().length ? `<button data-act="nextunread" style="color:var(--accent);font-weight:700">未読${unreadSongs().length}</button>` : ""}
    ${S.recMode ? "" : `<button data-act="go-summary">集計</button>`}
    <span class="grow"></span>
    ${(U.draw && (S.draws[drawKey()] || []).length) || (undoStack.length && !VIEW())
      ? `<button data-act="undoall" class="wide" style="color:var(--accent)">取消</button>`
      : `<button data-act="undoall" class="wide" style="opacity:.3">取消</button>`}
  </div>`;
}

/* ---- 全体表示（1曲まるごと見渡す）---- */
function viewOverview(s) {
  const ns0 = NOTES().filter((n) => n.songId === s.id && n.showId === S.showId && inTake(n));
  const gp = groupPos(s.lines);
  const rows = s.lines.map((l, i) => {
    if (l.gap) {
      const gns = ns0.filter((n) => covers(n, i));
      if (!gns.length) return `<div style="height:7px"></div>`;
      return `<button class="ovl" data-act="jumpline" data-i="${i}">
        <span class="ovn"></span><span class="ovb"></span><span class="ovt">${
        gns.map((n) => `<b class="mk ovm" style="background:${noteColor(n)}">${h(n.tags.length ? n.tags.map(tagName).join("/") : "メモ")}</b>`).join("")}</span></button>`;
    }
    const ns = ns0.filter((n) => covers(n, i));
    const chars = Array.from(l.t);
    const cells = chars.map((ch, ci) => {
      const mk = ns.find((n) => n.from != null && ci >= n.from && ci <= n.to);
      return mk ? `<span style="${markStyle(mk)}">${ch === " " ? "&nbsp;" : h(ch)}</span>` : (ch === " " ? "&nbsp;" : h(ch));
    }).join("");
    const tail = ns.map((n) => {
      const c = noteColor(n);
      const txt = n.tags.length ? n.tags.map(tagName).join("/") : (n.memo ? "メモ" : "・");
      const body2 = `${h(txt)}${n.pitch ? " ♪" + h(pitchLabel(n.pitch)) : ""}`;
      return n.pitch
        ? `<button class="mk ovm" data-act="playnote" data-id="${n.id}" style="background:${c}">${body2}</button>`
        : `<b class="mk ovm" style="background:${c}">${body2}</b>`;
    }).join("");
    const past = pastHits(s.id, i);
    const pb = past.count ? `<b class="mk ovm pastmk">前${past.count}</b>` : "";
    const ost = lineStatus(s, i);
    const oc = ost === "need" ? "var(--bad)" : ost === "changed" ? "#F0B23C" : "";
    return `<button class="ovl" data-act="jumpline" data-i="${i}"
      style="${oc ? `background:color-mix(in srgb,${oc} 16%,transparent);border-radius:4px` : ""}">
      <span class="ovn${isAgeri(l) ? " ovage" : ""}" style="${oc ? `color:${oc}` : ""}">${labelHTML(s, i)}</span><span class="ovb ${gp[i]}"></span><span class="ovt">${cells}${tail}${pb}</span></button>`;
  });

  // 元のExcelの並びを再現できるなら、そちらで出す
  const ref = (x) => { const m = /^([A-Z]+)(\d+)$/.exec(x || ""); return m ? { c: m[1], r: Number(m[2]) } : null; };
  const withT = s.lines.filter((l) => l.t);
  const withBoth = withT.filter((l) => ref(l.cell) && ref(l.lcell));
  const useGrid = withT.length > 0 && withBoth.length >= withT.length * 0.8;
  let bodyHTML;
  if (S.recMode) {
    const bars = barsOf(s);
    const vm2 = vtMarks(s);
    const nc = Math.max(1, Math.min(4, Number(s.cols || 1)));
    const one = (l, i) => {
      if (l.gap) return `<div style="height:1em"></div>`;
      const newSec = l.sec && l.sec !== (s.lines[i - 1] || {}).sec;
      const vh2 = vm2.info[i];
      return `${newSec ? `<div class="secdiv" id="sec-${h(l.sec)}"><span>${h(l.sec)}</span></div>` : ""}
        ${vh2 ? `<div class="vtdiv vtdivov" style="color:${vh2.c}"><span>${h(vh2.vt)}</span></div>` : ""}
        <button class="ovw${l.add ? " lnadd" : ""}${S.recMode && l.skip ? " lnskip" : ""}" data-act="jumpline" data-i="${i}"
          style="${vtColor(vtOf(l)) ? `box-shadow:inset 3px 0 0 ${vtColor(vtOf(l))}` : ""}">
          <span class="ovwn">${l.tag ? `<b class="tagmk">${h(l.tag)}</b>` : ""}${S.recBars && bars[i] != null ? bars[i] : ""}</span>
          <span>${h(l.add ? "（" + l.t + "）" : l.t)}</span></button>`;
    };
    const brks = (s.colBreaks || []).filter((x) => x > 0 && x < s.lines.length);
    if (nc > 1 && brks.length) {
      // Wordが段を変える位置で分ける
      const parts = [];
      let from = 0;
      brks.concat([s.lines.length]).forEach((to) => {
        if (to > from) parts.push(s.lines.slice(from, to).map((l, k) => one(l, from + k)).join(""));
        from = to;
      });
      bodyHTML = `<div class="ovpage" style="font-size:${S.recOvSize}px">${
        parts.map((p2) => `<div class="ovcol">${p2}</div>`).join("")}</div>`;
    } else {
      bodyHTML = `<div class="ovword" style="font-size:${S.recOvSize}px">${s.lines.map(one).join("")}</div>`;
    }
  } else if (useGrid) {
    const colNum = (t) => { let n = 0; for (let i = 0; i < t.length; i++) n = n * 26 + (t.charCodeAt(i) - 64); return n; };
    const spec = [];
    const put = (c, kind) => { if (c && !spec.some((x) => x.c === c)) spec.push({ c, kind }); };
    s.lines.forEach((l) => {
      const a = ref(l.cell), b = ref(l.lcell), e = ref(l.extraCell);
      if (a) put(a.c, "name"); if (b) put(b.c, "lyric"); if (e) put(e.c, "extra");
    });
    (s.blockRows || []).forEach((br) => {
      const a = ref(br.ncell), b = ref(br.lcell);
      if (a) put(a.c, "name"); if (b) put(b.c, "lyric");
    });
    spec.sort((x, y) => colNum(x.c) - colNum(y.c));
    let minR = Infinity, maxR = 0;
    const byName = {}, byLyric = {}, byExtra = {}, bat = {};
    s.lines.forEach((l, i) => {
      const a = ref(l.cell), b = ref(l.lcell), x = ref(l.extraCell);
      const any = a || b; if (!any) return;
      if (any.r < minR) minR = any.r;
      if (any.r > maxR) maxR = any.r;
      if (a) byName[a.c + ":" + a.r] = { l, i };
      if (b) byLyric[b.c + ":" + b.r] = { l, i };
      if (x) byExtra[x.c + ":" + x.r] = { l, i };
    });
    (s.blockRows || []).forEach((br) => {
      const a = ref(br.ncell), b = ref(br.lcell);
      const any = a || b; if (!any) return;
      if (a) bat[a.c + ":" + a.r] = { br, kind: "name" };
      if (b) bat[b.c + ":" + b.r] = { br, kind: "lyric" };
      if (any.r < minR) minR = any.r;
      if (any.r > maxR) maxR = any.r;
    });
    const trs = [];
    for (let rn = minR; rn <= maxR; rn++) {
      let has = false;
      const tds = spec.map((sp) => {
        const key = sp.c + ":" + rn;
        const bb = bat[key];
        if (bb) {
          has = true;
          const st3 = blockStatus(s, bb.br.b);
          const col3 = st3 === "need" ? "var(--bad)" : st3 === "changed" ? "#F0B23C" : "";
          return bb.kind === "name"
            ? `<td class="ogn"><b>${h(bb.br.b)}</b></td>`
            : `<td class="ogx"${col3 ? ` style="color:${col3}"` : ""}>${h(names(blockParts(s, bb.br.b)) || "—")}</td>`;
        }
        const en = byName[key], el = byLyric[key], ex = byExtra[key];
        if (el && el.l.t) {
          has = true;
          const st4 = lineStatus(s, el.i);
          const c4 = st4 === "need" ? "var(--bad)" : st4 === "changed" ? "#F0B23C" : "";
          return `<td class="ogx"><button data-act="jumpline" data-i="${el.i}"
            style="text-align:left;${c4 ? `background:color-mix(in srgb,${c4} 16%,transparent);border-radius:4px` : ""}">${rows[el.i].replace(/^[\s\S]*?<span class="ovt">/, "").replace(/<\/span><\/button>$/, "")}</button></td>`;
        }
        if (en && en.l.t) {
          has = true;
          const st5 = lineStatus(s, en.i);
          const c5 = st5 === "need" ? "var(--bad)" : st5 === "changed" ? "#F0B23C" : "";
          return `<td class="ogn${isAgeri(s.lines[en.i]) ? " ovage" : ""}"${c5 ? ` style="color:${c5}"` : ""}>${labelHTML(s, en.i)}</td>`;
        }
        if (ex && ex.l.extraRaw) { has = true; return `<td class="ogn"><b class="hamomk">${h(ex.l.extraRaw)}</b></td>`; }
        return `<td class="${sp.kind === "lyric" ? "ogx" : "ogn"}"></td>`;
      }).join("");
      trs.push(`<tr${has ? "" : ' class="ogz"'}>${tds}</tr>`);
    }
    bodyHTML = `<table class="ogrid" style="font-size:${U.ovSize}px">${trs.join("")}</table>`;
  } else {
    bodyHTML = `<div class="ovcols" style="font-size:${U.ovSize}px">${rows.join("")}</div>`;
  }

  return `
  <div class="hd">
    <div class="grow"><div class="t1 clamp2"><b style="color:var(--accent)">${S.recMode ? "レコーディングモード" : "ライブモード"}</b> ・ ${h(showName())} ・ 全体表示</div>
      <div class="t2 trunc">${h(songName(s))}</div></div>
    <button class="ic" data-act="ovsize">${S.recMode ? S.recOvSize : U.ovSize}px</button>
  </div>
  ${blockBar(s)}
  <div class="scroll" style="padding:8px 10px">${bodyHTML}
    ${songMemo(s.id) && !S.recMode ? `<div class="card" style="margin-top:12px">
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
  // 記録シートの中で打っている最中も、組み直すと文字が飛ぶ
  if (typingNow() && overlay && overlay.contains(document.activeElement)) { pendingRender = true; return; }
  if (overlay) { overlay.remove(); overlay = null; }

  if (U.menu && U.menu.kind === "sched") {
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="closemenu"></button><div class="sheet">
      <div class="row" style="margin-bottom:8px"><span class="grow" style="font-size:13px;font-weight:700">予定表を貼る</span>
        <button class="chip sm" data-act="closemenu">閉じる</button></div>
      <textarea class="field" id="schedtx" rows="10" style="resize:none;line-height:1.6"
        placeholder="8/19＠高輪スタジオ&#10;11:00~12:30 斉藤&#10;12:45~14:15 筒井&#10;（休憩）&#10;14:45~16:15 米村"></textarea>
      <button class="primary" data-act="schedgo" style="margin-top:10px">この内容で組む</button>
    </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => { const e2 = document.getElementById("schedtx"); if (e2) e2.focus(); }, 30);
    return;
  }

  if (U.menu && U.menu.kind === "pedit") {
    const s2 = S.plan.slots.find((x) => x.id === U.menu.id) || {};
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="closemenu"></button><div class="sheet">
      <div class="row" style="margin-bottom:12px"><span class="grow trunc" style="font-size:13px">${h(s2.name || "")}</span>
      <button data-act="closemenu" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button></div>
      <div style="text-align:center;font-size:40px;font-weight:700;line-height:1;margin-bottom:14px">${s2.min}<span style="font-size:13px;font-weight:400;color:var(--dim)">分</span></div>
      <div class="row" style="margin-bottom:10px">
        ${[-15, -5, -1, 1, 5, 15].map((v) => `<button class="chip grow" data-act="pset" data-id="${v}">${v > 0 ? "＋" + v : v}</button>`).join("")}
      </div>
      <div class="row" style="margin-bottom:10px">
        <input class="field grow" id="pnamev" value="${h(s2.name || "")}">
        <input class="field" id="pminv" type="number" inputmode="numeric" value="${s2.min}" style="width:74px">
        <button class="chip sm" data-act="psetv">決定</button>
      </div>
      <button class="ghost" data-act="pdel" style="color:var(--bad)">この枠を消す</button>
    </div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (U.menu && U.menu.kind === "gmenu") {
    const g = group(U.menu.id) || {};
    const B2 = (a, t2, st) => `<button class="ghost" data-act="${a}" data-id="${g.id}" style="text-align:left;margin-bottom:8px;${st || ""}">${t2}</button>`;
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="closemenu"></button><div class="sheet">
      <div class="row" style="margin-bottom:12px"><span class="grow trunc" style="font-size:13px">${h(g.name || "")}</span>
      <button data-act="closemenu" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button></div>
      ${B2("renamegroup", "名前を変える")}
      ${g.nopub ? `<div style="font-size:12px;color:var(--dim);padding:6px 2px">このグループは配信されません</div>`
        : g.gistId ? `
        ${B2("connectlink", "接続リンクを作る", "background:var(--accent);color:#0A0A0A;font-weight:700")}
        ${B2("pvnow", "メンバーの見え方を確認")}
        <div class="row" style="margin:10px 0 6px">
          <span style="font-size:11px;color:var(--dim);width:52px">合言葉</span>
          <input class="field grow" id="key-${g.id}" placeholder="未設定（誰でも開けます）" value="${h(g.key || "")}">
          <button class="chip sm" data-act="setkey" data-id="${g.id}">保存</button>
        </div>
        <div style="font-size:11px;color:${g.key ? "var(--good)" : "var(--bad)"};margin-bottom:8px">${g.key ? "合言葉を入れないと開けません" : "リンクを知っていれば誰でも開けます"}</div>`
        : (S.ghToken ? B2("ghstart", "自動公開を始める", "background:var(--accent);color:#0A0A0A;font-weight:700")
                     : `<div style="font-size:12px;color:var(--dim);padding:6px 2px">先にGitHubのトークンを入れてください。</div>`)}
      ${B2("nopubtoggle", g.nopub ? "配信するようにする" : "配信しないようにする", "color:var(--dim)")}
      ${S.groups.length > 1 ? B2("gdel", "このグループを消す", "color:var(--bad)") : ""}
    </div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (U.menu && U.menu.kind === "trash") {
    const kindName = { song: "曲", show: "公演", rec: "レコーディングの曲" };
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="closemenu"></button><div class="sheet">
      <div class="row" style="margin-bottom:12px"><span class="grow" style="font-size:13px">ゴミ箱</span>
      <button data-act="closemenu" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button></div>
      <div class="sec">
        ${(S.trash || []).map((t) => {
          const days = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - t.at) / 86400000));
          return `<div class="row card" style="margin-bottom:8px;padding:10px 12px">
            <div class="grow" style="min-width:0">
              <div class="trunc">${h(t.label || "（名前なし）")}</div>
              <div style="font-size:11px;color:var(--dim)">${kindName[t.kind] || ""}　${new Date(t.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}　あと${days}日</div>
            </div>
            <button class="chip sm" data-act="trashback" data-id="${t.id}" style="background:var(--accent);color:#0A0A0A">戻す</button>
            <button data-act="trashdrop" data-id="${t.id}" style="padding:4px 6px;color:var(--bad)">✕</button>
          </div>`;
        }).join("") || `<p class="note">ゴミ箱は空です</p>`}
      </div></div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (U.menu && U.menu.kind === "rlist") {
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="closemenu"></button><div class="sheet">
      <div class="row" style="margin-bottom:12px"><span class="grow" style="font-size:13px">曲</span>
      <button data-act="closemenu" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button></div>
      <div class="sec">
        ${S.rsongs.map((x) => `<div class="row card" style="margin-bottom:8px;padding:10px 12px;${x.id === S.rsongId ? "outline:1px solid var(--accent)" : ""}">
          <button class="grow trunc" style="text-align:left" data-act="ruse" data-id="${x.id}">${h(x.title)}</button>
          <button data-act="rdel" data-id="${x.id}" style="padding:4px 6px;color:var(--bad)">✕</button>
        </div>`).join("") || `<p class="note">曲がありません</p>`}
        <button class="primary" data-act="rpick">歌詞のWordを読み込む（複数可）</button>
      </div></div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (U.menu && U.menu.kind === "rbar") {
    const so = recSong();
    const l = so ? so.lines[U.menu.i] : null;
    const cur = so ? barsOf(so)[U.menu.i] : 0;
    const vt = (l || {}).vt || "";
    const hdr = (t) => `<div style="font-size:10px;color:var(--dim);margin:14px 0 6px">${t}</div>`;
    const secs = paletteSec();
    const tags = paletteTag();
    const edSec = U.wordEdit === "sec", edTag = U.wordEdit === "tag";
    const hdr2 = (t, kind, hidden) => `<div class="row" style="margin:14px 0 6px">
      <span class="grow" style="font-size:10px;color:var(--dim)">${t}</span>
      ${hidden.length && U.wordEdit === kind ? `<button data-act="rwordback" data-id="${kind}"
        style="font-size:11px;color:var(--dim);padding:2px 6px">消したのを戻す</button>` : ""}
      <button data-act="rwordedit" data-id="${kind}"
        style="font-size:11px;padding:2px 6px;color:${U.wordEdit === kind ? "var(--accent)" : "var(--dim)"}">${
        U.wordEdit === kind ? "おわり" : "整理"}</button>
    </div>`;
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="closemenu"></button><div class="sheet">
      <div class="row" style="margin-bottom:4px">
        <span class="grow trunc" style="font-size:13px">${h(l ? l.t : "")}</span>
        <button data-act="closemenu" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button>
      </div>

      ${hdr2("区切り", "sec", S.secHide || [])}
      <div class="chips">
        ${secs.map((x) => `<button class="chip sm" data-act="${edSec ? "rworddel" : "rsecq"}" data-id="${edSec ? "sec|" : ""}${h(x)}"
          style="${edSec ? "color:var(--bad);border:1px solid var(--bad)"
            : (l || {}).sec === x ? "background:var(--accent);color:#0A0A0A;font-weight:700" : ""}">${h(x)}${edSec ? " ✕" : ""}</button>`).join("")}
        ${edSec ? "" : `<button class="chip sm" data-act="rsecfree" style="color:var(--dim)">その他…</button>`}
        ${!edSec && (l || {}).sec ? `<button class="chip sm" data-act="rsecq" data-id="" style="color:var(--dim)">外す</button>` : ""}
      </div>
      ${edSec ? `<div style="font-size:10px;color:var(--dim);margin-top:6px">押すと選べる一覧から消えます。行に付いている区切りは消えません</div>` : ""}

      ${hdr(`想定　<b style="color:var(--text)">${U.vtN === "sec" ? "この区切り全部" : "ここから " + Number(U.vtN || 1) + "行"}</b> に付ける`)}
      <div class="row" style="margin-bottom:8px">
        ${[{ v: 1, t: "1行" }, { v: 2, t: "2行" }, { v: 3, t: "3行" }, { v: 4, t: "4行" }, { v: "sec", t: "区切り" }]
          .map((x) => `<button class="chip sm grow" data-act="rvtn" data-id="${x.v}"
            style="${String(U.vtN || 1) === String(x.v) ? "background:var(--panel2);color:var(--text);font-weight:700;border:1px solid var(--accent)" : "color:var(--dim)"}">${x.t}</button>`).join("")}
      </div>
      <div class="chips">
        ${VTDEF.map((x) => `<button class="chip sm" data-act="rvt" data-id="${h(x.id)}"
          style="${vt === x.id ? `background:${x.c};color:#0A0A0A;font-weight:700` : `color:${x.c};border:1px solid ${x.c}`}">${h(x.id)}</button>`).join("")}
        ${vt ? `<button class="chip sm" data-act="rvt" data-id="" style="color:var(--dim)">外す</button>` : ""}
      </div>

      ${hdr("小節")}
      <div class="row" style="margin-bottom:8px">
        <button class="chip" data-act="rbarset" data-id="-4">−4</button>
        <button class="chip" data-act="rbarset" data-id="-1">−1</button>
        <button class="grow" data-act="rbarnum"
          style="text-align:center;font-size:30px;font-weight:800;line-height:1.1;padding:4px 0;border-radius:10px;background:var(--panel2)">${cur}</button>
        <button class="chip" data-act="rbarset" data-id="1">＋1</button>
        <button class="chip" data-act="rbarset" data-id="4">＋4</button>
      </div>
      <div class="row">
        <span style="font-size:11px;color:var(--dim);width:64px">1行の長さ</span>
        ${[1, 2, 4, 8].map((b) => `<button class="chip sm grow" data-act="rlen" data-id="${b}"
          style="${Number((l || {}).bars || 4) === b ? "background:var(--accent);color:#0A0A0A" : ""}">${b}</button>`).join("")}
      </div>

      <button class="chip" data-act="rskip" style="width:100%;margin-top:14px;${
        (l || {}).skip ? "background:var(--dim);color:#0A0A0A;font-weight:700" : ""}">${
        (l || {}).skip ? "コピー扱い（録りません）" : "コピーで済ませる"}</button>

      ${hdr2("表記（歌メロに足すもの）", "tag", S.tagHide || [])}
      <div class="chips">
        ${tags.map((x) => `<button class="chip sm" data-act="${edTag ? "rworddel" : "rtagq"}" data-id="${edTag ? "tag|" : ""}${h(x)}"
          style="${edTag ? "color:var(--bad);border:1px solid var(--bad)"
            : tagBase((l || {}).tag) === x ? "background:var(--accent);color:#0A0A0A;font-weight:700" : ""}">${h(x)}${edTag ? " ✕" : ""}</button>`).join("")}
        ${edTag ? "" : `<button class="chip sm" data-act="rtagfree" style="color:var(--dim)">その他…</button>`}
      </div>

      <button class="ghost" data-act="rmore" style="margin-top:12px;color:var(--dim);font-size:12px">${U.rmore ? "▲ とじる" : "▼ そのほか"}</button>
      ${U.rmore ? `
        ${hdr("下に行を足す")}
        <div class="chips">
          ${["フェイク", "ガヤ", "コーラス", "掛け声"].map((x) => `<button class="chip sm" data-act="raddline" data-id="${x}">${x}</button>`).join("")}
          <button class="chip sm" data-act="raddfree" style="color:var(--dim)">自由に…</button>
        </div>

        ${hdr("イントロ（歌い出しまでの長さ）")}
        <div class="row">
          <button class="chip sm" data-act="rintro" data-id="-4">−4</button>
          <button class="chip sm" data-act="rintro" data-id="-1">−1</button>
          <span class="grow" style="text-align:center;font-size:13px;font-weight:600">${Number((so || {}).intro || 0)}小節</span>
          <button class="chip sm" data-act="rintro" data-id="1">＋1</button>
          <button class="chip sm" data-act="rintro" data-id="4">＋4</button>
        </div>

        ${l && l.at != null ? `<div class="row" style="margin-top:16px">
          <button class="chip sm grow" data-act="rbarclear" style="color:var(--dim)">小節の手直しを取り消す</button>
        </div>` : ""}
        <button class="ghost" data-act="rdelline" style="margin-top:10px;color:var(--bad)">この行を消す</button>
      ` : ""}
    </div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (U.menu && U.menu.kind === "block") {
    const so = S.songs.find((x) => x.id === U.menu.id);
    const b = U.menu.b;
    const cur7 = so ? blockParts(so, b) : [];
    const ab3 = absentIds();
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="closemenu"></button><div class="sheet">
      <div class="row" style="margin-bottom:10px"><span class="grow trunc" style="font-size:13px">${h(songName(so))}</span>
      <button data-act="closemenu" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button></div>
      <div class="sec"><h4>ブロック ${h(b)} は誰ですか</h4>
        <div class="chips">${songRoster(so).map((mid) => member(mid)).filter(Boolean).map((m) => `<button class="chip sm" data-act="setblock" data-id="${m.id}"
          style="${cur7.includes(m.id) ? "background:var(--accent);color:#0A0A0A" : ab3.includes(m.id) ? "color:var(--bad);opacity:.5" : ""}">${h(m.name)}</button>`).join("")}</div>
      </div></div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (U.menu && U.menu.kind === "assign") {
    const so = S.songs.find((x) => x.id === U.menu.id);
    const l = so ? so.lines[U.menu.i] : null;
    const cur5 = so ? partsOf(so, U.menu.i) : [];
    const ab2 = absentIds();
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="closemenu"></button><div class="sheet">
      <div class="row" style="margin-bottom:10px"><span class="grow trunc" style="font-size:13px">${h((U.menu.idx || [U.menu.i]).map((x) => (so.lines[x] || {}).t).join(" / "))}</span>
      <button data-act="closemenu" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button></div>
      <div class="sec"><h4>${h((l && l.label) || "続き")}${(U.menu.idx || []).length > 1 ? `（${U.menu.idx.length}行まとめて）` : ""}</h4>
        <div class="chips">${(so ? songRoster(so) : showRoster()).map((mid) => member(mid)).filter(Boolean)
          .map((m) => `<button class="chip sm" data-act="setassign" data-id="${m.id}"
          style="${cur5.includes(m.id) ? "background:var(--accent);color:#0A0A0A" : ab2.includes(m.id) ? "color:var(--bad);opacity:.5" : ""}">${h(m.name)}</button>`).join("")}</div>
      </div>
      ${subOf(so.id, U.menu.i) ? `<button class="ghost" data-act="unassign" style="color:var(--dim)">元の歌割に戻す</button>` : ""}
      </div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (U.menu) {
    const many = U.menu.ids && U.menu.ids.length;
    const x = S.songs.find((y) => y.id === (many ? U.menu.ids[0] : U.menu.id));
    const B = (act, label, col) => `<button class="ghost" data-act="${act}" style="text-align:left;margin-bottom:8px;${col ? "color:" + col : ""}">${label}</button>`;
    const inner = U.menu.kind === "group"
      ? `<div class="sec"><h4>どのグループにしますか</h4>
          ${S.groups.map((g) => `<button class="ghost" data-act="m-setgroup" data-id="${g.id}"
            style="text-align:left;margin-bottom:8px;${!many && x && x.groupId === g.id ? "background:var(--accent);color:#0A0A0A" : ""}">${h(g.name)}</button>`).join("")}
          <button class="ghost" data-act="m-setgroup" data-id="" style="text-align:left;color:var(--dim);${!many && x && !x.groupId ? "background:var(--accent);color:#0A0A0A" : ""}">なし（配信しない）</button></div>`
      : `<div class="sec">
          ${B("m-mark", (many ? "印を付ける／外す" : ((S.songs.find((y) => y.id === U.menu.id) || {}).mark ? "★ 印を外す" : "★ 印を付ける")))}
          ${B("m-rename", "曲名を変える")}
          ${B("m-take", "テイクを増やす")}
          ${many ? "" : B("m-takenum", "テイク番号を変える")}
          ${B("m-pdf", "この曲をPDFにする")}
          ${many ? "" : B("m-swap", "歌割を差し替える（記録はそのまま）")}
          ${(() => { const n = S.notes.filter((y) => y.songId === U.menu.id && y.showId === S.showId).length;
            return n ? B("m-chk", `チェックをExcelに書き込む（${n}件）`) : ""; })()}
          ${(() => { const n = S.notes.filter((y) => y.songId === U.menu.id && y.showId === S.showId).length;
            return n ? B("m-clear", `この曲の記録を消す（${n}件）`, "var(--bad)") : ""; })()}
          ${B("m-group", "グループを変える")}
          ${B("m-del", "削除する", "var(--bad)")}
        </div>`;
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="closemenu"></button><div class="sheet">
      <div class="row" style="margin-bottom:12px"><span class="grow trunc" style="font-size:13px">${many ? `${U.menu.ids.length}曲` : h(x ? songName(x) : "")}</span>
      <button data-act="closemenu" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button></div>
      ${inner}</div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (U.picker && S.recMode) {
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="close"></button><div class="sheet">
      <div class="row" style="margin-bottom:12px"><span class="grow" style="font-size:13px;color:var(--dim)">曲を選ぶ</span>
      <button data-act="close" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button></div>

      <div class="sec"><h4>曲</h4>
        ${groupRSongs(SONGS()).map(([fname, songs2]) => {
          const rows = songs2.map((x) => {
            const i = SONGS().findIndex((y) => y.id === x.id);
            return `<button class="ghost" data-act="ruse" data-id="${x.id}"
              style="text-align:left;margin-bottom:6px;${i === U.songIdx ? "background:var(--accent);color:#0A0A0A" : ""}">${h(x.title)}</button>`;
          }).join("");
          if (!fname) return rows;
          const open = S.rfolders[fname] === true || fname === folderOf(recSong());
          return `<button class="ghost row" data-act="rfolder" data-id="${h(fname)}" style="text-align:left;margin-bottom:6px;color:var(--dim)">
              <span style="width:16px">${open ? "▾" : "▸"}</span><span class="grow trunc">${h(fname)}</span>
              <span style="font-size:11px">${songs2.length}曲</span></button>
            ${open ? `<div style="margin-left:12px">${rows}</div>` : ""}`;
        }).join("") || `<p class="note">曲がありません</p>`}
      </div>
      <div class="sec"><button class="primary" data-act="goplan">進行表</button></div>
      ${VIEW() && unreadSongs().length ? `<div class="sec">
        <button class="ghost" data-act="readall" style="text-align:left;color:var(--accent)">未読 ${unreadSongs().length}曲 をすべて既読にする</button>
      </div>` : ""}
      ${S.members.length && !S.recMode ? `<div class="sec"><h4>注目するメンバー</h4><div class="chips">
        <button class="chip sm" data-act="focus" data-id="" style="${!U.focus ? "background:var(--accent);color:#0A0A0A" : ""}">なし</button>
        ${focusList().map((m) => `<button class="chip sm" data-act="focus" data-id="${m.id}"
            style="${U.focus === m.id ? "background:#4C9BFF;color:#0A0A0A" : ""}">${h(m.name)}</button>`).join("")}
      </div></div>` : ""}
    </div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (U.picker) {
    const gfil = S.groups.length > 1 ? `<div class="chips" style="margin-bottom:8px">
        <button class="chip sm" data-act="showfilter" data-id="" style="${!S.showFilter ? "background:var(--accent);color:#0A0A0A" : ""}">すべて</button>
        ${S.groups.map((g) => `<button class="chip sm" data-act="showfilter" data-id="${g.id}"
          style="${S.showFilter === g.id ? "background:var(--accent);color:#0A0A0A" : ""}">${h(g.name)}</button>`).join("")}
      </div>` : "";
    const shows = groupShows(showsFor()).map(([fname, list]) => `
      ${fname ? `<div style="font-size:10px;color:var(--dim);width:100%;margin:6px 0 2px">${h(fname)}</div>` : ""}
      ${list.map((sw) => `<button class="chip sm" data-act="jumpshow" data-id="${sw.id}"
        style="${sw.id === S.showId ? "background:var(--accent);color:#0A0A0A" : ""}">${h(sw.name)}</button>`).join("")}`).join("");
    const list = SONGS().map((x, i) => {
      const gn = (S.groups.find((g) => g.id === x.groupId) || {}).name || "";
      const cnt = NOTES().filter((n) => n.songId === x.id && n.showId === S.showId).length;
      return `<button class="ghost" data-act="jump" data-i="${i}"
        style="text-align:left;margin-bottom:6px;${i === U.songIdx ? "background:var(--accent);color:#0A0A0A" : ""}">
        <span style="opacity:.6">${i + 1}.</span> ${isUnread(x) ? `<b class="newmk">新</b>` : ""}${h(songName(x))}
        <span style="font-size:11px;opacity:.7">　${h(gn)}${cnt ? " ・ " + cnt + "件" : ""}</span></button>`;
    }).join("") || `<p class="note">曲がありません</p>`;
    overlay = document.createElement("div");
    overlay.className = "mask";
    overlay.innerHTML = `<button class="sp" data-act="close"></button><div class="sheet">
      <div class="row" style="margin-bottom:12px"><span class="grow" style="font-size:11px;color:var(--dim)">公演と曲を選ぶ</span>
      <button data-act="cancel" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button></div>
      ${(changedCount() || needCount()) ? `<div class="sec">
        <button class="ghost" data-act="goabsent" style="text-align:left">
          歌割の変更 ${changedCount()}件${needCount() ? `　<span style="color:var(--bad)">未決 ${needCount()}</span>` : ""}</button>
      </div>` : ""}
      <div class="sec"><h4>公演</h4>${gfil}<div class="chips">
${shows}</div>
        ${VIEW() ? "" : `<button class="ghost" data-act="dupshow" style="margin-top:8px">今のセットリストを複製して新しい公演にする</button>`}

      </div>
      <div class="sec"><h4>曲</h4>${list}
        ${song() && !VIEW() ? `<button class="ghost" data-act="dupsong" data-id="${song().id}" style="margin-top:8px">
          テイク${nextTake(song())} を作る</button>
  ` : ""}
      </div>
      ${VIEW() && unreadSongs().length ? `<div class="sec">
        <button class="ghost" data-act="readall" style="text-align:left;color:var(--accent)">未読 ${unreadSongs().length}曲 をすべて既読にする</button>
      </div>` : ""}
      ${S.members.length && !S.recMode ? `<div class="sec"><h4>注目するメンバー</h4><div class="chips">
        <button class="chip sm" data-act="focus" data-id="" style="${!U.focus ? "background:var(--accent);color:#0A0A0A" : ""}">なし</button>
        ${focusList().map((m) => `<button class="chip sm" data-act="focus" data-id="${m.id}"
            style="${U.focus === m.id ? "background:#4C9BFF;color:#0A0A0A" : ""}">${h(m.name)}</button>`).join("")}
      </div></div>` : ""}
      </div>`;
    document.body.appendChild(overlay);
    return;
  }

  if (!U.sheet) return;
  const s = song(); if (!s) return;
  const l = s.lines[U.sheet.lineIdx];
  const chars = Array.from(l.t);
  const sh = U.sheet;

  // まとめて選んだ時は、その範囲の行を全部出す
  const rl0 = sh.lineIdx, rl1 = sh.lineEnd != null ? sh.lineEnd : sh.lineIdx;
  const rangeLine = sh.rangeLine != null ? sh.rangeLine : rl0;
  const lineHtml = (li) => {
    const cs = Array.from(s.lines[li] ? s.lines[li].t : "");
    return cs.map((ch, ci) => {
      const on = sh.range && li === rangeLine && ci >= sh.range[0] && ci <= sh.range[1];
      return `<span data-r="${ci}" data-rl="${li}" style="${on ? "background:color-mix(in srgb,var(--accent) 30%,transparent);border-bottom-color:var(--bad)" : ""}">${ch === " " ? "&nbsp;" : h(ch)}</span>`;
    }).join("");
  };
  const rangeHtml = l.gap
    ? `<span class="rgtx" style="color:var(--dim)">${h(gapWhere(s, sh.lineIdx)) || "歌詞のない箇所"}</span>`
    : rl1 > rl0
    ? Array.from({ length: rl1 - rl0 + 1 }, (_, k) => rl0 + k)
        .filter((li) => s.lines[li] && !s.lines[li].gap)
        .map((li) => `<div class="rgline"><span class="rgn">${li + 1}</span><span class="rgtx" data-rl="${li}">${lineHtml(li)}</span></div>`).join("")
    : `<span class="rgtx" data-rl="${rl0}">${lineHtml(rl0)}</span>`;
  const ex = NOTES().filter((n) => n.songId === s.id && n.showId === S.showId && covers(n, sh.lineIdx));

  const inner = `
    <div class="row" style="margin-bottom:12px">
      <span class="grow" style="font-size:11px;color:var(--dim)">${h(labelOf(s, sh.lineIdx) || "続き")} · ${sh.lineEnd ? `${sh.lineIdx + 1}〜${sh.lineEnd + 1}行目（まとめて）` : `${sh.lineIdx + 1}行目`}</span>
      <button data-act="cancel" style="width:36px;height:36px;border-radius:10px;background:var(--panel2);font-size:17px">✕</button>
    </div>
    <div class="sec"><h4>${sh.lineEnd ? "文字をタップするとその一部だけ、押さなければ全体につきます" : "文字をタップすると一部だけ指定できます"}</h4>
      <div class="range">${rangeHtml}</div>
      ${sh.range ? `<button class="chip sm" data-act="rangeoff" style="margin-top:8px;color:var(--dim)">行全体に戻す</button>` : ""}
    </div>
    <div class="sec"><h4>何　${sh.tags.length ? `<b style="color:var(--accent)">${h(sh.tags.map(tagName).join("・"))}</b>` : "タップ、または上下左右になぞる"}</h4>
      <div class="tiles">
        ${SWIPES.map((sw) => {
          const col = CATCOL[catOf(sw.id)] || "var(--accent)";
          const on = sh.tags.includes(sw.id);
          const sub = (k) => {
            if (!sw[k]) return "";
            const nm = tagName(sw[k]);
            // 長い語は詰めて出す（はみ出して切れないように）
            const cls = Array.from(nm).length >= 5 ? " tlong" : Array.from(nm).length === 4 ? " tmid4" : "";
            return `<span class="t${k}${cls}">${h(nm)}</span>`;
          };
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
  showPianoAtC4(overlay);
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
    // 登録した名簿の順（＝年齢順）に並べ、グループごとに見出しを付ける
    const named = S.groups.map((g) => g.name).filter(Boolean);
    const gorder = named.length > 1 ? named : ((S.groupOrder || []).length ? S.groupOrder : named);
    const gnames = Object.keys(S.rosters || {}).filter((k) => (S.rosters[k] || []).length)
      .sort((a, b) => {
        const ia = gorder.indexOf(a), ib = gorder.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
    const seen = new Set();
    const ordered = [];
    gnames.forEach((gn) => {
      const list = (S.rosters[gn] || []).map((nm) => S.members.find((m) => m.name === nm)).filter(Boolean);
      if (list.length) ordered.push({ gn, list });
      list.forEach((m) => seen.add(m.id));
    });
    const rest = S.members.filter((m) => !seen.has(m.id));
    if (rest.length) ordered.push({ gn: gnames.length ? "その他" : "", list: rest });

    const card = (m) => {
      const takeOf = (n) => {
        const so2 = S.songs.find((x) => x.id === n.songId);
        return so2 ? Number(so2.take || 1) : 1;
      };
      const ns = ns0.filter((n) => n.memberIds.includes(m.id))
        .sort((a, b) => (takeOf(b) - takeOf(a)) || (a.lineIdx - b.lineIdx));
      if (!ns.length) return "";
      const open = U.sumOpen === m.id;
      const counts = TAGS.map((t) => ({ l: t.l, id: t.id, n: ns.filter((x) => x.tags.includes(t.id)).length })).filter((c) => c.n);
      return `<div class="card" style="padding:${open ? "12px" : "2px 12px"};margin-bottom:6px">
        <button class="row" style="width:100%;padding:10px 0" data-act="sumopen" data-id="${m.id}">
          <b class="grow" style="text-align:left;${open ? "color:var(--accent)" : ""}">${h(m.name)}</b>
          <span style="color:var(--dim);font-size:13px">${ns.length}件</span>
          <span style="color:var(--dim);font-size:12px;margin-left:10px">${open ? "▾" : "▸"}</span>
        </button>
        ${open ? `<div style="margin-bottom:6px">${counts.map((c) => `<span class="tagpill" style="color:${c.id === "good" ? "var(--good)" : "var(--text)"}">${c.l} ${c.n}</span>`).join("")}</div>
        ${ns.map((n) => detail(n, U.allShows)).join("")}` : ""}</div>`;
    };
    body = ordered.map((sec) => {
      const inner = sec.list.map(card).join("");
      if (!inner) return "";
      return `${sec.gn ? `<div style="font-size:11px;color:var(--dim);margin:14px 2px 6px">${h(sec.gn)}</div>` : ""}${inner}`;
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

// 古い曲から新しい曲へ、記録・総括・振り替えを写す。古い曲はそのまま残す。
function copyRecords(oldSo, newSo) {
  // 歌詞で行を突き合わせる
  const map = new Map();
  const used = new Set();
  oldSo.lines.forEach((l, i) => {
    if (l.gap || !l.t) return;
    let j = newSo.lines.findIndex((x, k) => !x.gap && x.t === l.t && !used.has(k));
    if (j < 0) return;
    used.add(j);
    map.set(i, j);
  });

  let moved = 0, lost = 0;
  S.notes.filter((n) => n.songId === oldSo.id).forEach((n) => {
    if (!map.has(n.lineIdx)) { lost++; return; }
    const c = Object.assign({}, n, { id: uid(), songId: newSo.id, lineIdx: map.get(n.lineIdx) });
    if (n.lineEnd != null) c.lineEnd = map.has(n.lineEnd) ? map.get(n.lineEnd) : map.get(n.lineIdx);
    S.notes.push(c);
    moved++;
  });

  Object.keys(S.memos || {}).forEach((k) => {
    const [sid, gid] = k.split("|");
    if (gid === oldSo.id) S.memos[sid + "|" + newSo.id] = S.memos[k];
  });

  Object.keys(S.gsubs || {}).forEach((k) => {
    const [sid, gid] = k.split("|");
    if (gid !== oldSo.id) return;
    const src = S.gsubs[k], dst = {};
    Object.keys(src).forEach((b) => { if ((newSo.blocks || {})[b]) dst[b] = src[b].slice(); });
    if (Object.keys(dst).length) S.gsubs[sid + "|" + newSo.id] = dst;
  });

  Object.keys(S.subs || {}).forEach((k) => {
    const [sid, gid] = k.split("|");
    if (gid !== oldSo.id) return;
    const src = S.subs[k], dst = {};
    Object.keys(src).forEach((i) => { if (map.has(Number(i))) dst[map.get(Number(i))] = src[i].slice(); });
    if (Object.keys(dst).length) S.subs[sid + "|" + newSo.id] = dst;
  });

  return { moved, lost };
}

/* ---- チェック結果を元のExcelに書き込む ---- */
// 元の体裁をそのまま保ったまま、指摘のあった歌詞セルを色づけし、右の空き列に内容を書く。
const CHKCOL = { "音程": "FFFFD5CC", "タイミング": "FFFDEBC7", "出音": "FFD3F2F0",
  "表情": "FFE7DEFF", "ミス": "FFFFD3DE", "良い": "FFD6F2E2" };

async function exportCheckXlsx(songId) {
  const so = S.songs.find((x) => x.id === songId);
  if (!so) return;
  const blob = await getClip("xls:" + so.id).catch(() => null);
  if (!blob) { alert("この曲の元のExcelが見つかりません。\nExcelから読み込み直してください。"); return; }
  const ns0 = NOTES().filter((n) => n.songId === so.id && n.showId === S.showId);
  if (!ns0.length) { alert("この曲に記録がありません。"); return; }

  try {
    U.busy = "Excelを作成中…"; render();
    const buf = new Uint8Array(await blob.arrayBuffer());

    // 空いている列を探して、そこに指摘を書く
    const wb = XLSX.read(buf, { type: "array" });
    const sh = wb.Sheets[wb.SheetNames[0]];
    const ref = XLSX.utils.decode_range(sh["!ref"] || "A1");
    const colName = (n) => { let t = ""; n++; while (n > 0) { const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = (n - m - 1) / 26; } return t; };
    const memoCol = colName(ref.e.c + 1);

    const edits = {};
    so.lines.forEach((l, i) => {
      const ns = ns0.filter((n) => covers(n, i));
      if (!ns.length || !l.lcell) return;
      const chars = Array.from(l.t);
      const txt = ns.map((n) => {
        const where = n.from != null ? `「${chars.slice(n.from, n.to + 1).join("")}」` : "";
        const tag = n.tags.map(tagName).join("・");
        return where + tag + (n.pitch ? " " + pitchLabel(n.pitch) : "") + (n.memo ? " " + n.memo : "");
      }).join(" / ");
      edits[l.lcell] = { v: l.t, fill: CHKCOL[catOf((ns[0].tags || [])[0])] || "FFFFF3B0" };
      const row = (l.lcell.match(/\d+$/) || [""])[0];
      if (row) edits[memoCol + row] = { v: txt, fill: "FFFFFFFF" };
    });
    const mm = songMemo(so.id);
    if (mm) {
      const last = ref.e.r + 2;
      edits[memoCol + last] = { v: "総括：" + mm, fill: "FFFFFFFF" };
    }

    const tab = "チェック " + (showName() || "").slice(0, 18);
    const res = await addVersionTab(buf, tab, edits);
    downloadBlob(`${so.title}_チェック.xlsx`,
      new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    U.busy = ""; render();
  } catch (e) {
    U.busy = ""; render();
    alert("作れませんでした。\n" + e.message);
  }
}


/* ---- 欠席verのExcelを書き出す ---- */
// 変更のある行だけを、セル番地→新しい名前の形にする
function absentEdits(so) {
  const edits = {};
  // ブロックは定義の行だけを書き換える（Aの行そのものは触らない）
  blocksOf(so).forEach((b) => {
    const cell = (so.blockCells || {})[b];
    if (!cell) return;
    const g = gsubOf(so.id, b);
    if (!g) return;
    const before = ((so.blocks || {})[b] || []).map((x) => (member(x) || {}).name).filter(Boolean).join("・");
    const after = g.map((x) => (member(x) || {}).name).filter(Boolean).join("・");
    if (before !== after) edits[cell] = after;
  });
  so.lines.forEach((l, i) => {
    if (blockOf(so, i)) return;   // ブロックの行は書き換えない
    if (!l.cell) return;
    // 続きの行（結合セルの2行目以降）に書くと、まとまりが割れて2行に分かれる。
    // 名前は先頭の行にだけ書く。
    if (l.cont) return;
    // 「全」はそのまま。欠席がいても書き換えない。
    if (/^全/.test(l.labelRaw || l.label || "")) return;
    // 歌割が書かれていない行（ワンハーフでカットした所など）は、誰の名前も入れない
    if (!(l.main || l.parts || []).length && !(l.labelRaw || l.label)) return;
    const sub = subOf(so.id, i);
    if (!sub) return;
    const nm = (a) => a.map((x) => (member(x) || {}).name).filter(Boolean).join("・");
    if (l.extraCell && (l.extra || []).length) {
      // ハモは別のセルなので分けて書き戻す
      const sp = splitAssign(so, i);
      if (nm(sp.main) !== nm(l.main || [])) edits[l.cell] = nm(sp.main);
      if (nm(sp.extra) !== nm(l.extra || [])) edits[l.extraCell] = sp.extra.length ? "ハモ " + nm(sp.extra) : "";
    } else {
      const before = nm(l.main || l.parts || []);
      const after = nm(sub);
      if (before !== after) edits[l.cell] = after;
    }
  });
  return edits;
}
const absentTab = () => absentIds().map((x) => (member(x) || {}).name).filter(Boolean).join("・") + "欠席ver";
function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
}

// この公演の曲をまとめて1つのzipにする
async function exportAllAbsentXlsx() {
  if (!absentIds().length) { alert("欠席者が設定されていません。"); return; }
  const tab = absentTab();
  const files = {};
  let skipped = 0;
  U.busy = "Excelを作成中…"; render();
  try {
    for (const so of SONGS()) {
      const edits = absentEdits(so);
      if (!Object.keys(edits).length) continue;
      if (!so.xls) { skipped++; continue; }
      const blob = await getClip("xls:" + so.id).catch(() => null);
      if (!blob) { skipped++; continue; }
      const res = await addVersionTab(new Uint8Array(await blob.arrayBuffer()), tab, edits);
      files[`${so.title}_${tab}.xlsx`] = res.data;
    }
    const n = Object.keys(files).length;
    if (!n) { U.busy = ""; render(); alert("書き出せる曲がありません。\nExcelから読み込んだ曲だけが対象です。"); return; }
    const data = await zip(files);
    downloadBlob(`${showName() || "公演"}_${tab}.zip`, new Blob([data], { type: "application/zip" }));
    U.busy = ""; render();
    if (skipped) alert(`${n}曲を書き出しました。\n${skipped}曲は元のExcelが無いため除きました。`);
  } catch (e) {
    U.busy = ""; render();
    alert("作れませんでした。\n" + e.message);
  }
}

async function exportAbsentXlsx(songId) {
  const so = S.songs.find((x) => x.id === songId);
  if (!so) return;
  const ab = absentIds();
  if (!ab.length) { alert("欠席者が設定されていません。"); return; }
  const blob = await getClip("xls:" + so.id).catch(() => null);
  if (!blob) { alert("この曲の元のExcelが見つかりません。\nExcelから読み込み直してください。"); return; }

  const edits = absentEdits(so);
  if (!Object.keys(edits).length) { alert("変更された行がありません。"); return; }
  const tab = absentTab();
  try {
    U.busy = "Excelを作成中…"; render();
    let data = new Uint8Array(await blob.arrayBuffer());
    // 歌割のシートを直したタブ
    data = (await addVersionTab(data, tab, edits, so.sheetName)).data;
    // マイク番号のシートがあれば、そちらも同じ行を直したタブを足す
    if (so.micSheet) {
      const me = micEdits(so, edits);
      if (Object.keys(me).length) {
        data = (await addVersionTab(data, tab + " マイク", me, so.micSheet)).data;
      }
    }
    downloadBlob(`${so.title}_${tab}.xlsx`,
      new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    U.busy = ""; render();
  } catch (e) {
    U.busy = ""; render();
    alert("Excelを作れませんでした。\n" + e.message);
  }
}

// 歌割の直しを、マイク番号のシート用に置き換える。
// 「橋田」→「3」のように、覚えておいた対応で名前を番号にする。
function micEdits(so, edits) {
  const map = so.micMap || {};
  const out = {};
  Object.keys(edits).forEach((ref) => {
    const e = edits[ref];
    const v = (e && typeof e === "object") ? e.v : e;
    const names = splitNames(String(v == null ? "" : v));
    if (!names.length) return;
    // 全員ぶんの番号が分かる時だけ直す（分からないまま書くと誤りになる）
    const nums = names.map((n) => map[n]).filter(Boolean);
    if (nums.length !== names.length) return;
    out[ref] = { v: nums.join("・"), fill: (e && e.fill) || "FFFFF3B0" };
  });
  return out;
}

/* ---- 欠席対応 ---- */
function viewAbsent() {
  const ab = absentIds();
  const chips = VIEW() ? "" : showRoster().map((mid) => member(mid)).filter(Boolean)
    .map((m) => `<button class="chip sm" data-act="toggleabsent" data-id="${m.id}"
      style="${ab.includes(m.id) ? "background:var(--bad);color:#0A0A0A" : ""}">${h(m.name)}</button>`).join("");

  const body = !ab.length ? `<p style="padding:40px;text-align:center;color:var(--dim);font-size:14px">${VIEW() ? "歌割の変更はありません" : "上から欠席者を選んでください"}</p>`
    : SONGS().map((so) => {
      // 同じ歌割が続く行はひとまとめにして、一度で直せるようにする
      // ブロックの変更を先に出す
      const brows = blocksOf(so).map((b) => {
        const st3 = blockStatus(so, b);
        if (st3 !== "need" && st3 !== "changed") return "";
        const col = st3 === "need" ? "var(--bad)" : "#F0B23C";
        return `<button class="row" ${VIEW() ? "" : `data-act="assignblock" data-id="${so.id}" data-b="${h(b)}"`}
          style="width:100%;text-align:left;padding:8px 10px;margin-bottom:6px;border-radius:10px;
                 background:color-mix(in srgb,${col} 16%,transparent);box-shadow:inset 2px 0 0 ${col}">
          <span style="flex:0 0 100px;font-size:11px;color:${col};text-align:right">ブロック ${h(b)}</span>
          <span class="grow trunc" style="font-size:13px">${h(names((so.blocks || {})[b] || []))} → <b>${h(names(blockParts(so, b)) || "—")}</b></span>
        </button>`;
      }).join("");

      const runs = [];
      const seen2 = new Set();
      so.lines.forEach((l, i) => {
        const st2 = lineStatus(so, i);
        if ((st2 !== "need" && st2 !== "changed") || seen2.has(i)) return;
        const idx = runAt(so, i);
        idx.forEach((j) => seen2.add(j));
        runs.push({ st: st2, idx });
      });
      const rows = runs.map((r) => {
        const col = r.st === "need" ? "var(--bad)" : "#F0B23C";
        const i0 = r.idx[0];
        const now = names(partsOf(so, i0)) || "—";
        const txt = r.idx.map((i) => so.lines[i].t).join(" / ");
        return `<button class="row" ${VIEW() ? "" : `data-act="assign" data-id="${so.id}" data-i="${i0}" data-idx="${r.idx.join(",")}"`}
          style="width:100%;text-align:left;padding:8px 10px;margin-bottom:6px;border-radius:10px;
                 background:color-mix(in srgb,${col} 16%,transparent);box-shadow:inset 2px 0 0 ${col}">
          <span style="flex:0 0 100px;font-size:11px;color:${col};text-align:right">${h(so.lines[i0].label || "続き")}${r.idx.length > 1 ? `<br>${r.idx.length}行` : ""} → ${h(now)}</span>
          <span class="grow trunc" style="font-size:13px">${h(txt)}</span>
        </button>`;
      }).join("");
      if (!rows && !brows) return "";
      const need = so.lines.filter((l, i) => lineStatus(so, i) === "need").length
        + blocksOf(so).filter((b) => blockStatus(so, b) === "need").length;
      return `<div class="card"><div class="row" style="margin-bottom:8px">
          <b class="grow trunc">${h(songName(so))}</b>
          ${need ? `<span style="font-size:11px;color:var(--bad)">未決 ${need}</span>`
                 : `<span style="font-size:11px;color:var(--good)">完了</span>`}
          ${so.xls && !VIEW() ? `<button class="chip sm" data-act="xlsout" data-id="${so.id}">Excel</button>` : ""}
        </div>${brows}${rows}</div>`;
    }).join("");

  return `
  <div class="hd"><button class="ic" data-act="go-live">‹</button><b>${VIEW() ? "歌割の変更" : "欠席対応"}</b>
    <span class="grow"></span>
    <span style="font-size:11px;color:var(--dim)" class="trunc">${h(showName())}</span></div>
  <div class="scroll pad">
    ${VIEW() ? `<div class="card"><div style="font-size:12px;color:var(--dim)">${ab.length ? h(ab.map((x) => (member(x) || {}).name).join("・")) + " が欠席" : "欠席なし"}</div></div>`
      : `<div class="card"><h4 style="font-size:11px;color:var(--dim);margin-bottom:8px">欠席するメンバー</h4>
      <div class="chips">${chips || ``}</div>
      ${ab.length ? `<div class="row" style="margin-top:10px;font-size:12px">
        <span class="grow"><b style="color:var(--bad)">未決 ${needCount()}</b>　<b style="color:#F0B23C">変更済 ${changedCount()}</b>${libFrom ? `　<span style="color:var(--good)">前回：${h(libFrom)}</span>` : ""}</span>
        <button class="chip sm" data-act="xlsall">まとめてExcel</button>
        <button class="chip sm" data-act="resetsubs" style="color:var(--dim)">やり直す</button></div>` : ""}
    </div>`}
    ${body}
    <div style="height:40px"></div>
  </div>`;
}

/* ---- レコーディングの設定 ---- */
function viewSetupRec() {
  const cur = SONGS();
  const songRow = (x) => `<div class="row card" data-drop="r:${x.id}" style="margin-bottom:8px;padding:10px 12px;${x.id === S.rsongId ? "outline:1px solid var(--accent)" : ""}">
      <span class="grip" data-drag="rec:${x.id}">⣿</span>
      <button class="grow" style="text-align:left;min-width:0" data-act="ruse" data-id="${x.id}">
        <div class="trunc" style="${x.id === S.rsongId ? "color:var(--accent)" : ""}">${h(x.title)}</div>
        <div class="trunc" style="font-size:11px;color:var(--dim)">${x.lines.filter((l) => !l.gap).length}行${x.cols > 1 ? ` ・ ${x.cols}段` : ""}</div>
      </button>
      <button data-act="rpdf" data-id="${x.id}" style="padding:4px 7px;color:var(--dim);font-size:12px">PDF</button>
      <button data-act="rfset" data-id="${x.id}" style="padding:4px 7px;color:var(--dim);font-size:12px">箱</button>
      <button data-act="rdel" data-id="${x.id}" style="padding:4px 6px;color:var(--bad)">✕</button>
    </div>`;
  const curFolder = folderOf(recSong());
  const list = groupRSongs(cur).map(([fname, songs2]) => {
    if (!fname) return songs2.map(songRow).join("");
    const open = S.rfolders[fname] === true || fname === curFolder;
    return `<div class="row card" data-drop="rf:${h(fname)}" style="margin-bottom:8px;padding:8px 12px">
        <button class="grow row" data-act="rfolder" data-id="${h(fname)}" style="text-align:left;min-width:0">
          <span style="width:18px;color:var(--dim)">${open ? "▾" : "▸"}</span>
          <span class="grow trunc">${h(fname)}</span>
          <span style="font-size:11px;color:var(--dim)">${songs2.length}曲</span>
        </button>
        <button data-act="rfup" data-id="${h(fname)}" style="padding:4px 6px;color:var(--dim)">↑</button>
        <button data-act="rfdown" data-id="${h(fname)}" style="padding:4px 6px;color:var(--dim)">↓</button>
        <button data-act="rfrename" data-id="${h(fname)}" style="padding:4px 6px;color:var(--dim);font-size:12px">名前</button>
      </div>
      ${open ? `<div style="margin-left:14px">${songs2.map(songRow).join("")}</div>` : ""}`;
  }).join("");

  return `
  <div class="hd"><button class="ic" data-act="go-live">‹</button><b>設定</b>
    <span class="grow"></span>
    ${U.busy ? `<span style="font-size:12px;color:var(--accent)">${h(U.busy)}</span>`
             : `<button data-act="recon" class="chip sm" style="color:var(--accent)">レコーディングモード ⇄</button>`}</div>
  <div class="scroll pad">
    <h4 class="head">曲</h4>
    ${list || `<p class="note">曲がありません</p>`}
    <div class="card"><button class="primary" data-act="rpick">歌詞のWordを読み込む（複数可）</button></div>

    <h4 class="head">進行</h4>
    <div class="card"><button class="primary" data-act="goplan">進行表をひらく</button></div>

    <h4 class="head">音を確かめる</h4>
    <div class="card">${pianoHTML(null)}</div>

    <h4 class="head">ピッチを見る</h4>
    ${pitchHTML()}

    <h4 class="head">メトロノーム</h4>
    ${metroHTML()}

    <h4 class="head">保存領域</h4>
    <div class="card" style="margin-bottom:22px">
      ${(() => {
        // Safariは保存領域を「この場所ぜんぶ」で数える。今のデータだけ見ても実態は分からない。
        const enc = new TextEncoder();
        let total = 0, mine = 0;
        const stray = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const v = localStorage.getItem(k) || "";
            const b = enc.encode(k).length + enc.encode(v).length;
            total += b;
            if (k === KEY) mine = b;
            else if (k.indexOf(KEY + ":broken:") === 0) {
              const at = Number(k.split(":broken:")[1] || 0);
              let n = null;
              try { const o = unpackState(JSON.parse(v)); n = { sh: (o.shows || []).length, sg: (o.songs || []).length, nt: (o.notes || []).length }; }
              catch (e) { /* 読めなくても大きさは分かる */ }
              stray.push({ k, at, b, n });
            }
          }
        } catch (e) { /* 数えられない端末もある */ }
        stray.sort((a, b2) => b2.at - a.at);
        const mb = (x) => (x / 1048576).toFixed(2);
        const cur = enc.encode(JSON.stringify(packState(S))).length;
        const over = saveErr;
        return `<div class="row" style="margin-bottom:6px">
          <span class="grow" style="font-size:13px">いまのデータ</span>
          <span style="font-size:13px;color:${over ? "var(--bad)" : "var(--dim)"};font-weight:700">${mb(cur)} MB</span>
        </div>
        <div style="font-size:11px;color:var(--dim);line-height:1.7;margin-bottom:${stray.length || total ? 10 : 0}px">
          公演${S.shows.length}件・曲${S.songs.length}件・記録${S.notes.length}件<br>
          ${idbOK ? "保存先は端末のデータベースです。上限はほぼ気にしなくて構いません。"
                  : "<b style=\"color:var(--bad)\">この端末ではデータベースが使えず、上限5MBの場所に保存しています。</b>"}
          ${over ? "<br><b style=\"color:var(--bad)\">いま保存できていません。</b>" : ""}
        </div>
        ${total ? `<div style="font-size:11px;color:var(--dim);margin-bottom:8px">古い置き場所に ${mb(total)} MB 残っています。${stray.length ? "" : "次に開いた時に自動で片付きます。"}</div>` : ""}
        ${over ? `<button class="primary" data-act="shrinknow" style="margin-bottom:10px">いま空きを作る（古い公演を消す）</button>` : ""}
        ${stray.length ? `<div style="font-size:11px;color:var(--accent);margin-bottom:6px">
          取り残しのデータが ${stray.length}件 あります（合計 ${mb(stray.reduce((a, x) => a + x.b, 0))} MB）。<br>
          読み込みでつまずいた時に、消さずに横へ避けたものです。中身が残っていれば戻せます。</div>
        ${stray.map((x) => `<div class="row card" style="padding:8px 10px;margin-bottom:6px">
          <div class="grow" style="min-width:0">
            <div style="font-size:12px">${x.at ? new Date(x.at).toLocaleString("ja-JP") : "日時不明"}　${mb(x.b)} MB</div>
            <div style="font-size:11px;color:var(--dim)">${x.n ? `公演${x.n.sh}件・曲${x.n.sg}件・記録${x.n.nt}件` : "中身を読み取れません"}</div>
          </div>
          ${x.n && (x.n.sg || x.n.nt) ? `<button class="chip sm" data-act="strayuse" data-id="${h(x.k)}">戻す</button>` : ""}
          <button class="chip sm" data-act="straydel" data-id="${h(x.k)}" style="color:var(--bad)">消す</button>
        </div>`).join("")}` : ""}`;
      })()}
    </div>

    <h4 class="head">バックアップ</h4>
    <div class="card">
      <div class="row" style="margin-bottom:10px">
        <span class="grow" style="font-size:13px">${S.bkAt ? "最終 " + new Date(S.bkAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "まだ取っていません"}</span>
      </div>
      <button class="primary" data-act="bknow" style="margin-bottom:8px">今すぐバックアップ</button>
      <button class="ghost" data-act="bkfile">ファイルに書き出す</button>

    </div>

    ${(S.trash || []).length ? `<h4 class="head">ゴミ箱</h4>
    <div class="card"><button class="primary" data-act="gotrash">ゴミ箱（${S.trash.length}件）</button></div>` : ""}


    ${footerHTML()}
    <div style="height:40px"></div>
  </div>`;
}

// いま録っている人（進行で開いた人があればその人）。曲名と同じ大きさで出す。
function recWho() {
  if (!S.recMode) return "";
  const rows = planRows();
  const foc = S.planFocus ? rows.find((r) => r.s.id === S.planFocus) : null;
  const r = foc || rows.find((x) => x.live);
  if (!r || r.s.kind === "break") return "";
  const tail = foc && !foc.live ? "" : "";
  return `<span style="color:var(--accent);font-weight:700">　${h(r.s.name)}${tail}</span>`;
}

// 歌詞画面の下に、今の枠と残り時間を出す
// 録りのテイク番号。区切りごとに数え、区切りが変わると1に戻る。
function takeNo(slot) {
  if (!slot || !slot.secCur) return 1;
  const v = (slot.takes || {})[slot.secCur];
    // RH（リハ）はテイク0。Pro Tools のプレイリスト無印に当たる。
    if (v == null) return slot.secCur === PREP ? 0 : 1;
    return Math.max(0, Number(v));
}

function recBar() {
  const rows = planRows();
  const now = nowMin();
  const live = rows.find((r) => r.live);
  const next = rows.find((r) => !r.done && !r.live);
  const secs = live ? sectionsOf(live.s) : [];
  const cur = secs.find((x) => x.live);
  const tk = live ? takeNo(live.s) : 1;

  const tabList = secs.length ? secs : sectionOrder().map((nm) => ({ name: nm }));
  const tabs = tabList.map((e) => {
    const cls = (e.live || e.name === U.secView || tagBase(U.secView) === e.name) ? "on" : e.done ? "dn" : "";
    return `<button class="sectab ${cls}" id="tab-${h(e.name)}" data-act="jumpsec" data-id="${h(e.name)}">${e.done ? "✓" : ""}${h(e.name)}${false ? `<i>${e.done ? e.used : e.min}</i>` : ""}</button>`;
  }).join("");

  /* Gaya のような表記を選んでいる時は、Gaya1 Gaya2 … を小さく並べる。
     ひとつずつ順に録れるようにするため。 */
  const openTag = tagBase(U.secView || (cur ? cur.name : ""));
  let subTabs = "";
  if (openTag && isTagSec(openTag)) {
    const so2 = recSong();
    const nums = [];
    (so2 && so2.lines || []).forEach((l) => {
      if (l && l.tag && tagBase(l.tag) === openTag && !nums.includes(l.tag)) nums.push(l.tag);
    });
    nums.sort((a, b) => (tagNum(a) || 0) - (tagNum(b) || 0));
    if (nums.length > 1) {
      subTabs = `<div class="sectabs" style="padding-top:0">` + nums.map((nm) =>
        `<button class="sectab ${U.secView === nm ? "on" : ""}" data-act="jumpsec" data-id="${h(nm)}"
          style="font-size:11px;padding:4px 10px">${h(nm)}</button>`).join("") + `</div>`;
    }
  }

  return `${tabs ? `<div class="sectabs">${tabs}</div>` : ""}${subTabs}
  <div class="aubar">
    ${live ? `<span id="pcd" style="font-size:13px;font-variant-numeric:tabular-nums">—</span>
      ${cur ? `<span style="font-size:11px;color:var(--dim)">${h(cur.name)}</span>` : ""}
      <button class="tkbtn" data-act="takedown"${tk > 0 ? "" : ' style="opacity:.3"'}>−</button>
      <button class="tknow" data-act="takeup"><i>テイク</i><b>${tk}</b></button>
      <span class="grow"></span>
      <button class="chip sm" data-act="pnextsec" style="background:var(--accent);color:#0A0A0A">次へ</button>`
    : next ? `<span style="color:var(--dim);font-size:12px">次 ${h(next.s.name)}　${min2hm(next.aS)}</span>
      <span class="grow"></span>
      <button class="chip sm" data-act="pstart" data-id="${next.s.id}" style="background:var(--accent);color:#0A0A0A">開始</button>`
    : `<span class="grow" style="color:var(--dim);font-size:12px">進行表に誰も入っていません</span>`}
  </div>`;
}

// 秒でカウントダウンする
// 進行中の区切りのタブを、見える位置まで横に送る
function scrollTab() {
  const live = planRows().find((r) => r.live);
  if (!live || !live.s.secCur) return;
  const el = document.getElementById("tab-" + live.s.secCur);
  const box = el && el.parentNode;
  if (!el || !box) return;
  const x = (el.offsetLeft || 0) - Math.max(0, ((box.clientWidth || 0) - (el.offsetWidth || 0)) / 2);
  try { box.scrollTo({ left: Math.max(0, x), behavior: "smooth" }); } catch (e) { box.scrollLeft = Math.max(0, x); }
}

function fmtLeft(sec) {
  const neg = sec < 0, v = Math.abs(Math.round(sec));
  return (neg ? "−" : "") + Math.floor(v / 60) + ":" + String(v % 60).padStart(2, "0");
}
// 予定の時刻になったら、その枠を自動で始める。
// 自動を止めていれば何もしない。手で始めた枠には触らない。
// その枠が今日のものか。日付が書かれていなければ、いつでも良いものとして扱う。
function isToday(sw) {
  if (!sw || !sw.day) return true;
  const m = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(String(sw.day).trim());
  if (!m) return true;
  const d = new Date();
  return Number(m[1]) === d.getMonth() + 1 && Number(m[2]) === d.getDate();
}

function autoPlan() {
  if (!S.recMode || !S.planAuto || !S.plan) return;
  const slots = S.plan.slots || [];
  const now = nowMin();
  const live = slots.find((x) => x.a0 != null && x.a1 == null);
  if (live) {
    // 次の枠の時刻が来たら、いまの枠を終えて次へ移る
    const i = slots.indexOf(live);
    const nx = slots.slice(i + 1).find((x) => x.at != null && x.a1 == null && isToday(x));
    if (nx && nx.at != null && now >= nx.at && nx.a0 == null) {
      live.a1 = now;
      startSlot(nx, true);
      save(); render();
    }
    return;
  }
  const nx = slots.find((x) => x.a0 == null && x.at != null && now >= x.at && isToday(x));
  if (!nx) return;
  // だいぶ過ぎている枠は勝手に始めない（アプリを開き直した時など）
  if (now - nx.at > 30) return;
  startSlot(nx, true);
  save(); render();
}

function startSlot(s2, auto) {
  s2.a0 = nowMin(); delete s2.a1;
  s2.startAt = Date.now(); s2.secStart = Date.now();
  s2.secLog = {}; s2.takes = {};
  const ss1 = sectionsOf(s2);
  s2.secCur = (ss1.find((x) => x.prep) || ss1.find((x) => !x.skip) || ss1[0] || {}).name || "";
  U.secView = s2.secCur;
  if (auto) autoMsg = `${s2.name} を始めました（${min2hm(s2.a0)}）`;
}
let autoMsg = "";

function tickPlan() {
  autoPlan();
  const el = document.getElementById("pcd");
  const el2 = document.getElementById("pcd2");
  const live = planRows().find((r) => r.live);
  if (!live) { if (el) el.textContent = "—"; if (el2) el2.textContent = ""; return; }
  if (el2 && !live.s.startAt) { el2.textContent = ""; }
  else if (el2) {
    const all = Number(live.s.min || 0) * 60 - (live.s.startAt ? (Date.now() - live.s.startAt) / 1000 : 0);
    const g = slotGap(live.s);
    el2.textContent = fmtLeft(all) + (g != null && g !== 0 ? (g > 0 ? "  +" + g + "分" : "  −" + (-g) + "分") : "");
    el2.style.color = g != null && g !== 0 ? (g > 0 ? "var(--bad)" : "var(--good)") : (all < 0 ? "var(--bad)" : "var(--dim)");
  }
  if (!el) return;
  const secs = sectionsOf(live.s);
  const cur = secs.find((x) => x.live);
  const base = cur ? (live.s.secStart || 0) : (live.s.startAt || 0);
  const total = (cur ? cur.min : Number(live.s.min || 0)) * 60;
  const left = base ? Math.round(total - (Date.now() - base) / 1000) : total;
  el.textContent = fmtLeft(left);
  el.style.color = left < 0 ? "var(--bad)" : "var(--text)";
}
setInterval(() => { if (S.recMode && !document.hidden) tickPlan(); }, 1000);

// 曲の区切り（1A・1B…）と、その持ち時間
// 歌詞に出てくる順
function sectionNames() {
  const so = recSong();
  if (!so) return [];
  const out = [];
  so.lines.forEach((l) => { if (!l.gap && l.sec && !out.includes(l.sec)) out.push(l.sec); });
  return out;
}
// 区切りになっていない表記（ガヤ・フェイクなど）も、録る時間が要るので枠として立てる。
// 歌詞の行にちょこちょこ付けているだけでも、まとめて録る分の時間を見込む。
function tagSecNames() {
  const so = recSong();
  if (!so) return [];
  const secs = sectionNames();
  const out = [];
  (so.lines || []).forEach((l) => {
    if (l.gap || !l.tag) return;
    const b = tagBase(l.tag);          /* Gaya1 も Gaya2 も「Gaya」ひとつにまとめる */
    if (secs.includes(b) || out.includes(b)) return;
    out.push(b);
  });
  return out;
}
const isTagSec = (nm) => tagSecNames().includes(nm);
// 録る順（1A → 2A → 1B → 2B … 最後に ガヤ・フェイク）
function sectionOrder() {
  const ns = sectionNames().concat(tagSecNames());
  // 手で並べ替えた順があればそれを使う。曲に無い区切りは飛ばし、後から増えた分は末尾に足す。
  const cust = ((recSong() || {}).secOrder || []).filter((x) => ns.includes(x));
  if (cust.length) return cust.concat(ns.filter((x) => !cust.includes(x)));
  const key = (x) => {
    const m = /^(\d+)\s*([A-Za-zＡ-Ｚａ-ｚ])/.exec(x);
    return m ? { g: m[2].toUpperCase(), n: Number(m[1]) } : null;
  };
  const withKey = ns.map((x, i) => ({ x, i, k: key(x) }));
  const named = withKey.filter((v) => v.k).sort((a, b) => (a.k.g < b.k.g ? -1 : a.k.g > b.k.g ? 1 : a.k.n - b.k.n));
  const rest = withKey.filter((v) => !v.k);
  return named.concat(rest).map((v) => v.x);
}
// 区切りごとの持ち時間。既定は均等割り、直した分だけ覚える。
const PREP = "RH";
const SECDEF = ["1A", "1B", "1C", "2A", "2B", "2C", "D", "落ち", "大サビ", "間奏"];
// 歌メロに足すもの。区切りとは別に、行へ付ける表記。
// 歌メロに足すもの。Pro Tools のマーカー名と揃えるため英語で持つ。
// 実際に行へ付くときは Gaya1 Gaya2 … と連番になる。
const TAGDEF = ["Gaya", "Fake", "Hamo", "Cho", "Kakegoe", "Adlib"];
// 旧版の日本語表記を英語に読み替える
const TAGMAP = { "ガヤ": "Gaya", "フェイク": "Fake", "ハモ": "Hamo", "コーラス": "Cho", "掛け声": "Kakegoe", "アドリブ": "Adlib" };
// "Gaya3" → "Gaya"、"Gaya" → "Gaya"
const tagBase = (t) => String(t || "").replace(/\d+$/, "");
const tagNum = (t) => { const m = /(\d+)$/.exec(String(t || "")); return m ? Number(m[1]) : 0; };
// その曲で、その種類の次の番号
function nextTagNo(so, base) {
  let mx = 0;
  (so && so.lines || []).forEach((l) => {
    if (l && l.tag && tagBase(l.tag) === base) mx = Math.max(mx, tagNum(l.tag) || 1);
  });
  return mx + 1;
}
// 録りの想定。行ごとに「どう歌うか」を決めておくと、当日その場で迷わない。
// 色は行の左端の帯と、名前欄の札に出る。同じ想定が続けば一本の帯になって、まとまりが見える。
// 選べるのはこの2つ。以前の版で付けた他の想定も、色だけは残して表示できるようにする。
const VTDEF = [
  { id: "ソロ", c: "#F0B23C" },
  { id: "ユニゾン", c: "#5BC98A" },
];
const VTOLD = [
  { id: "掛け合い", c: "#C58BFF" },
  { id: "全員", c: "#FF8A5C" },
  { id: "ハモ", c: "#7FB3FF" },
  { id: "ダブル", c: "#E86FA8" },
];
const vtColor = (v) => (v ? (VTDEF.concat(VTOLD).find((x) => x.id === v) || {}).c || "#8A8F99" : "");
const vtOf = (l) => (l && l.vt) || "";
// 「この行が入っている区切り」の範囲。区切り名は上から引き継がれる。
function secRange(so, i) {
  const ls = so.lines || [];
  let a = i;
  while (a > 0 && !ls[a].sec) a--;
  let b = i + 1;
  while (b < ls.length && !ls[b].sec) b++;
  return [a, b - 1];
}
// 想定を書き込む行を決める。空行と、あとから足した行（フェイク等）は数に入れない。
function vtTargets(so, i) {
  const ls = so.lines || [];
  const out = [];
  if (U.vtN === "sec") {
    const [a, b] = secRange(so, i);
    for (let k = a; k <= b; k++) if (!ls[k].gap && !ls[k].add) out.push(k);
    return out.length ? out : [i];
  }
  const want = Math.max(1, Number(U.vtN || 1));
  for (let k = i; k < ls.length && out.length < want; k++) {
    if (ls[k].gap || ls[k].add) continue;
    out.push(k);
  }
  return out.length ? out : [i];
}
// 想定のまとまり。想定を付けた回ごとに一つのまとまりにする。
// 同じ「ソロ」を続けて選んでも、選んだ回が違えばつながらない（頭に印を残す）。
const vtHead = (so, i) => {
  const ls = so.lines || [];
  const l = ls[i];
  if (!l || l.gap || !vtOf(l)) return false;
  if (l.vh) return true;
  const p = ls[i - 1];
  return !p || p.gap || vtOf(p) !== vtOf(l);
};
// まとまりの頭の行に、見出し（想定と小節数）を持たせる
function vtMarks(so) {
  const ls = so.lines || [];
  const info = [];
  for (let i = 0; i < ls.length; i++) {
    if (!vtHead(so, i)) continue;
    info[i] = { vt: vtOf(ls[i]), c: vtColor(vtOf(ls[i])) };
  }
  return { info };
}

function rememberTag(nm) {
  const v = String(nm || "").trim();
  if (v) S.tagHide = (S.tagHide || []).filter((x) => x !== v);
  if (!v || TAGDEF.indexOf(v) >= 0) return;
  S.tagWords = (S.tagWords || []).filter((x) => x !== v);
  S.tagWords.unshift(v);
  if (S.tagWords.length > 12) S.tagWords.length = 12;
}
// 使った区切り名を覚えておき、次からボタンに出す
// palette に出す言葉。消したものは出さない。
const paletteSec = () => SECDEF.concat((S.secWords || []).filter((x) => SECDEF.indexOf(x) < 0))
  .filter((x) => (S.secHide || []).indexOf(x) < 0);
const paletteTag = () => TAGDEF.concat((S.tagWords || []).filter((x) => TAGDEF.indexOf(x) < 0))
  .filter((x) => (S.tagHide || []).indexOf(x) < 0);
function rememberSec(nm) {
  const v = String(nm || "").trim();
  if (v) S.secHide = (S.secHide || []).filter((x) => x !== v);   // 消したものを使い直したら戻す
  if (!v || SECDEF.indexOf(v) >= 0) return;
  S.secWords = (S.secWords || []).filter((x) => x !== v);
  S.secWords.push(v);
  if (S.secWords.length > 20) S.secWords.shift();
}
// 区切り（と表記）ごとの、録る小節数
function secBars() {
  const so2 = recSong();
  const out = {};
  if (!so2) return out;
  const tg = tagSecNames();
  let cur = "";
  (so2.lines || []).forEach((l) => {
    if (l.gap) return;
    const b = Number(l.bars || 4);
    // 表記が付いている行は、その表記の枠にも小節を足す（本編の分はそのまま）
    if (l.tag && tg.includes(l.tag)) {
      if (out[l.tag] == null) out[l.tag] = { all: 0, live: 0 };
      out[l.tag].all += b || 4;
      if (!l.skip) out[l.tag].live += b || 4;
    }
    if (l.sec) cur = l.sec;
    if (!cur) return;
    if (out[cur] == null) out[cur] = { all: 0, live: 0 };
    out[cur].all += b;
    if (!l.skip) out[cur].live += b;
  });
  return out;
}
// 何も指定していない区切りの、既定の持ち時間
const SEC_MIN = 5;
function sectionsOf(slot) {
  if (!slot) return [];
  const names2 = sectionOrder();
  const log = slot.secLog || {};
  const adj = slot.sec || {};
  const prep = adj[PREP] != null ? Number(adj[PREP]) : (slot.prep != null ? Number(slot.prep) : Number(S.planPrep || 0));
  // コピーで済ませるところは録らないので、時間を割り当てない。
  // 区切りごとの指定に加えて、歌詞の行ごとの「録らない」も見る。
  const skip = Object.assign({}, slot.skip || {});
  const barsBy = secBars();
  // その区切りの行が全部「録らない」なら、区切りごと外す
  names2.forEach((n) => { const v = barsBy[n]; if (v && v.all > 0 && v.live === 0) skip[n] = 1; });
  const mk = (nm, mi, isPrep) => ({
    name: nm, min: mi, prep: !!isPrep,
    skip: !!skip[nm],
    live: slot.secCur === nm,
    done: log[nm] != null,
    used: log[nm] != null ? Number(log[nm]) : 0,
  });
  // 既定は 準備10分＋区切りごと5分。余りは埋めずにそのまま残す（押した時の余裕になる）。
  const out = prep > 0 ? [mk(PREP, prep, true)] : [];
  names2.forEach((nm) => out.push(mk(nm, skip[nm] ? 0
    : (adj[nm] != null ? Number(adj[nm]) : SEC_MIN))));
  return out;
}
// 持ち時間いっぱいを、録る小節数の多さで割り振る。端数は大きい順に1分ずつ。
function secSplitByBars(slot) {
  const names2 = sectionOrder();
  const skip = Object.assign({}, slot.skip || {});
  const barsBy = secBars();
  names2.forEach((n) => { const v = barsBy[n]; if (v && v.all > 0 && v.live === 0) skip[n] = 1; });
  const prep = (slot.sec || {})[PREP] != null ? Number(slot.sec[PREP])
    : (slot.prep != null ? Number(slot.prep) : Number(S.planPrep || 0));
  const pool = Math.max(0, Number(slot.min || 0) - prep);
  const free = names2.filter((n) => !skip[n]);
  const out = {};
  if (!free.length) return out;
  let wsum = 0;
  const raw = free.map((n) => { const w = (barsBy[n] && barsBy[n].live) || 0; wsum += w; return { n, w }; });
  if (wsum <= 0) { raw.forEach((r) => { r.w = 1; }); wsum = raw.length; }
  let acc = 0;
  raw.forEach((r) => { r.v = pool * r.w / wsum; r.f = Math.max(1, Math.floor(r.v)); acc += r.f; });
  let rest = pool - acc;
  const byFrac = raw.slice().sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)));
  while (rest > 0) { let moved = 0; byFrac.forEach((r) => { if (rest > 0) { r.f++; rest--; moved++; } }); if (!moved) break; }
  raw.forEach((r) => { out[r.n] = r.f; });
  return out;
}
// 配分を直す相手。開いている枠、無ければ今やっている枠。
function planSlot() {
  const rows = planRows();
  if (U.planSec) { const r = rows.find((x) => x.s.id === U.planSec); if (r) return r.s; }
  const lv = rows.find((x) => x.live);
  return lv ? lv.s : null;
}
// 「全員」にしている時は、同じ直しを他の人の枠にも入れる。休憩は触らない。
function secApply(t, fn) {
  if (!t) return;
  fn(t);
  if (!S.secAll) return;
  (S.plan.slots || []).forEach((sl) => { if (sl !== t && sl.kind !== "break") fn(sl); });
}
// 区切りの合計と、その人の持ち時間（準備を含む）
function secSum(slot) {
  return sectionsOf(slot).reduce((a, x) => a + Number(x.min || 0), 0);
}
// 録り終わった区切りの、予定と実際の差（−なら巻き）
function slotGap(slot) {
  const ss = sectionsOf(slot);
  const done = ss.filter((x) => x.done);
  if (!done.length) return null;
  return done.reduce((a, x) => a + x.used - x.min, 0);
}

/* ---- 進行表 ---- */
function hm2min(t) {
  const x = String(t == null ? "" : t).trim().replace(/[：．。\.]/g, ":").replace(/[^\d:]/g, "");
  let m = /^(\d{1,2}):(\d{1,2})$/.exec(x);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d{3,4})$/.exec(x);                 // 1000 / 930
  if (m) { const v = m[1]; return Number(v.slice(0, v.length - 2)) * 60 + Number(v.slice(-2)); }
  m = /^(\d{1,2})$/.exec(x);                 // 10 → 10:00
  if (m) return Number(m[1]) * 60;
  return 600;
}
const min2hm = (v) => { const x = ((Math.round(v) % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const dmin = (v) => (v > 0 ? "+" + v : String(v)) + "分";

// 予定と、実際の進み具合から見込みを出す
function planRows() {
  const p = S.plan || { slots: [] };
  const slots = p.slots || [];
  const start = hm2min(p.start);
  const now = nowMin();
  let plan = start, cursor = start;
  let lastDay = null;
  return slots.map((s) => {
    // 予定表から取り込んだ枠は自分の開始時刻を持っている。
    // 日が変わった時や、前の枠と繋がっていない時は、その時刻から数え直す。
    if (s.at != null) {
      const dayChanged = s.day && s.day !== lastDay;
      if (dayChanged || plan !== s.at) { plan = s.at; cursor = s.at; }
    }
    if (s.day) lastDay = s.day;

    const pS = plan, pE = plan + Number(s.min || 0);
    plan = pE;
    const r = { s, pS, pE };
    // 巻いても押しても、後ろの枠の時刻は動かさない。
    // 予定は予定として残し、実績はその枠の中だけに出す。
    if (s.a0 != null && s.a1 != null) { r.aS = s.a0; r.aE = s.a1; cursor = pE; r.done = true; }
    else if (s.a0 != null) {
      r.aS = s.a0;
      r.aE = s.a0 + Number(s.min || 0);       // 表示は予定の終わり
      cursor = pE;                            // 後ろは予定どおりのまま
      r.live = true;
    }
    else { r.aS = cursor; r.aE = cursor + Number(s.min || 0); cursor = r.aE; }
    return r;
  });
}

// 送られてきた予定表の文をそのまま読み取る。
//   8/19＠高輪スタジオ
//   11:00~12:30 斉藤
//   (休憩)
// のような形。日付ごとにまとめ、時刻の空きは休憩として入れる。
function parseSchedule(text) {
  const zen = (t) => String(t).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[：]/g, ":").replace(/[〜～－ー–—]/g, "~").replace(/[＠]/g, "@");
  // 貼り付けで改行が消えることがあるので、日付と時刻の前で切り直す
  let body = zen(text)
    .replace(/(\d{1,2}\s*[\/月]\s*\d{1,2}日?\s*(?:\(.\)|（.）)?\s*@)/g, "\n$1")
    .replace(/(\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2})/g, "\n$1")
    .replace(/([（(]\s*(?:休憩|休み|昼|昼食|夕食|ブレイク)\s*[）)])/g, "\n$1\n");
  const lines = body.split(/\r?\n/).map((x) => x.trim());
  const days = [];
  let day = null;
  let title = "";
  lines.forEach((raw) => {
    if (!raw) return;
    const d = /^(\d{1,2})\s*[\/月]\s*(\d{1,2})日?\s*(?:\(.\)|（.）)?\s*@?\s*(.*)$/.exec(raw);
    const tm = /^(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})\s*(.*)$/.exec(raw);
    if (tm) {
      if (!day) { day = { label: "", place: "", items: [] }; days.push(day); }
      const a = Number(tm[1]) * 60 + Number(tm[2]);
      let b = Number(tm[3]) * 60 + Number(tm[4]);
      if (b <= a) b += 1440;                       // 日をまたぐ
      let nm = tm[5].replace(/[（(].*?[）)]/g, "").trim();
      nm = nm.split(/[\s　]+/)[0] || nm;        // 「斉藤 ○○」なら先頭だけ
      nm = nm.replace(/^[@＠].*$/, "").trim();
      day.items.push({ a, b, name: nm });
      return;
    }
    if (d) {                                       // 日付の行
      day = { label: `${Number(d[1])}/${Number(d[2])}`, place: (d[3] || "").trim(), items: [] };
      days.push(day);
      return;
    }
    if (/^[（(]?\s*(休憩|休み|昼|昼食|夕食|ブレイク)\s*[）)]?$/.test(raw)) {
      if (day) day.items.push({ brk: true });
      return;
    }
    if (!day && !title) title = raw;               // いちばん上は見出しとみなす
  });
  const out = [];
  days.forEach((dd) => {
    const items = dd.items.filter((x) => !x.brk || true);
    let prev = null;
    items.forEach((x) => {
      if (x.brk) return;                           // 空きから自動で作るので、印だけの行は使わない
      if (prev != null && x.a > prev) {
        out.push({ kind: "break", name: "休憩", min: x.a - prev, day: dd.label, place: dd.place });
      }
      out.push({ kind: "member", name: x.name || "（名前なし）", min: x.b - x.a,
        at: x.a, day: dd.label, place: dd.place });
      prev = x.b;
    });
  });
  return { title, days, slots: out };
}

function applySchedule(text) {
  const r = parseSchedule(text);
  if (!r.slots.length) { alert("予定を読み取れませんでした。\n「11:00~12:30 斉藤」のような行が要ります。"); return null; }
  const nPerson = r.slots.filter((x) => x.kind === "member").length;
  const brk = r.slots.length - nPerson;
  const dayList = r.days.filter((d) => d.items.length).map((d) => d.label || "（日付なし）").join("、");
  const first = r.slots.find((x) => x.kind === "member");
  const msg = `${r.title ? r.title + "\n\n" : ""}${dayList}\n`
    + `${nPerson}人ぶん・休憩${brk}回\n\n`
    + r.slots.map((x) => `${x.day ? x.day + " " : ""}${x.at != null ? min2hm(x.at) + " " : ""}${x.name}（${x.min}分）`).join("\n")
    + `\n\nこの通りに組みますか？\n（いまの進行表は置き換わります）`;
  if (!confirm(msg)) return null;
  pushUndo();
  S.plan = S.plan || { slots: [] };
  S.plan.start = first && first.at != null ? min2hm(first.at) : (S.plan.start || "10:00");
  S.plan.slots = r.slots.map((x) => ({
    id: uid(), name: x.name, min: x.min, kind: x.kind,
    at: x.at != null ? x.at : null,          // 予定の開始時刻（自動で始める時に使う）
    day: x.day || "", place: x.place || "",
  }));
  save(); render();
  alert(`組みました。\n${dayList}　${nPerson}人ぶん`);
  return r;
}

function viewPlan() {
  const allRows = planRows();
  const dayList = [...new Set(allRows.map((r) => r.s.day).filter(Boolean))];
  // 日付が複数ある時は、その日だけを見られるようにする
  const pickDay = dayList.length > 1 && U.planDay && dayList.includes(U.planDay) ? U.planDay : "";
  /* 終わった枠は出さない。残っているものだけ見えれば足りる。 */
  const shown = allRows.filter((r) => !r.done);
  const rows = pickDay ? shown.filter((r) => r.s.day === pickDay) : shown;
  const now = nowMin();
  // 配分を開く枠。何も開いていなければ、今やっている枠を開いておく。
  const liveSlotId = (rows.find((r) => r.live) || { s: {} }).s.id || "";
  const openSlot = U.planSec && rows.some((r) => r.s.id === U.planSec) ? U.planSec : liveSlotId;
  const liveIdx = rows.findIndex((r) => r.live);
  const nextIdx = rows.findIndex((r) => !r.done && !r.live);
  const last = rows[rows.length - 1];
  const gap = last ? last.aE - last.pE : 0;

  const hasAt = allRows.some((r) => r.s.at != null);
  const autoBar = hasAt ? `<div class="card" style="margin-bottom:10px;padding:10px 12px">
    <div class="row">
      <div class="grow" style="min-width:0">
        <div style="font-size:13px">時刻になったら自動で始める</div>
        <div style="font-size:11px;color:var(--dim);margin-top:2px">${S.planAuto
          ? (autoMsg ? h(autoMsg) : (() => {
              const n = allRows.filter((r) => r.s.at != null && isToday(r.s)).length;
              return n ? `今日の予定 ${n}件。時刻になったら自動で移ります`
                       : "今日の予定はありません。別の日の枠は自動で始めません";
            })())
          : "いまは手で開始する設定です"}</div>
      </div>
      <button class="chip sm" data-act="autotoggle"
        style="${S.planAuto ? "background:var(--accent);color:#0A0A0A" : ""}">${S.planAuto ? "自動オン" : "自動オフ"}</button>
    </div>
  </div>` : "";

  const dayBar = dayList.length > 1 ? `<div class="chips" style="margin-bottom:10px">
    <button class="chip sm" data-act="planday" data-id=""
      style="${pickDay ? "" : "background:var(--accent);color:#0A0A0A"}">すべて</button>
    ${dayList.map((d) => {
      const n = allRows.filter((r) => r.s.day === d && r.s.kind !== "break").length;
      const pl = (allRows.find((r) => r.s.day === d && r.s.place) || { s: {} }).s.place || "";
      return `<button class="chip sm" data-act="planday" data-id="${h(d)}"
        style="${pickDay === d ? "background:var(--accent);color:#0A0A0A" : ""}">${h(d)}${pl ? " " + h(pl) : ""}　${n}人</button>`;
    }).join("")}
  </div>` : "";

  const list = rows.map((r, i) => {
    const s = r.s;
    const newDay = s.day && s.day !== ((rows[i - 1] || {}).s || {}).day;
    const dayHead = newDay ? `<div class="row" style="margin:14px 0 6px">
      <b style="font-size:12px;color:var(--accent)">${h(s.day)}</b>
      ${s.place ? `<span style="font-size:11px;color:var(--dim)">${h(s.place)}</span>` : ""}
    </div>` : "";
    const isBreak = s.kind === "break";
    const col = r.live ? "var(--accent)" : r.done ? "var(--dim)" : isBreak ? "#7FB3FF" : "var(--text)";
    const diff = r.done ? (r.aE - r.aS) - Number(s.min || 0) : 0;
    const rest = r.live ? r.aE - now : 0;
    return `${dayHead}<div class="row card" data-drop="p:${s.id}" style="margin-bottom:8px;padding:11px 12px;flex-wrap:wrap;max-width:100%;${r.live ? "outline:1px solid var(--accent)" : ""}">
      <span class="grip" data-drag="plan:${s.id}">⣿</span>
      <button class="grow" style="text-align:left;min-width:0" data-act="pedit" data-id="${s.id}">
        <div class="row" style="gap:8px;min-width:0">
          <span style="font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums;flex:0 0 auto">${min2hm(r.aS)}–${min2hm(r.aE)}</span>
          <span class="trunc" style="color:${col};font-weight:${r.live ? 700 : 400}">${h(s.name || (isBreak ? "休憩" : "—"))}</span>
        </div>
        <div style="font-size:11px;color:var(--dim);margin-top:2px">
          ${s.min}分
          ${r.done ? `　実際 ${r.aE - r.aS}分 <span style="color:${diff > 0 ? "var(--bad)" : diff < 0 ? "var(--good)" : "var(--dim)"}">${diff ? dmin(diff) : "ぴったり"}</span>` : ""}
          ${r.live ? `　<b style="color:${rest < 0 ? "var(--bad)" : "var(--accent)"}">${rest >= 0 ? "残り " + rest + "分" : "超過 " + (-rest) + "分"}</b>` : ""}
          ${!r.done && !r.live && i === nextIdx ? `　<span style="color:var(--accent)">次</span>` : ""}
        </div>
      </button>
      ${isBreak ? "" : `<button class="chip sm" data-act="psecopen" data-id="${s.id}"
        style="${openSlot === s.id ? "background:var(--panel2);color:var(--accent);border:1px solid var(--accent)" : "color:var(--dim)"}">配分</button>`}
      ${r.live ? `<button class="chip sm" data-act="pretry" data-id="${s.id}" style="color:var(--dim)">やり直す</button>
          <button class="chip sm" data-act="pcancel" data-id="${s.id}" style="color:var(--bad)">取り消す</button>
          <button class="chip sm" data-act="pnext" data-id="${s.id}" style="background:var(--accent);color:#0A0A0A">次へ</button>`
        : !r.done && i === nextIdx ? `<button class="chip sm" data-act="pstart" data-id="${s.id}">開始</button>`
        : r.done ? `<button class="chip sm" data-act="pundo" data-id="${s.id}" style="color:var(--dim)">戻す</button>` : ""}
    </div>
    ${openSlot === s.id && sectionsOf(s).length ? (() => {
      const sum = secSum(s);
      const cap = Number(s.min || 0);
      const over = sum - cap;
      return `<div class="card" style="margin:-4px 0 8px 14px;padding:10px 12px">
      <div class="row" style="margin-bottom:8px">
        <span class="grow trunc" style="font-size:10px;color:var(--dim);min-width:0">${h(recSong() ? recSong().title : "")} の配分</span>
        <button class="chip sm" data-act="psecord"
          style="${U.secOrd ? "color:var(--accent);border:1px solid var(--accent)" : "color:var(--dim)"}">${U.secOrd ? "おわり" : "録る順"}</button>
        ${U.secOrd ? "" : `<button class="chip sm" data-act="psecall" data-id="${s.id}"
          style="${S.secAll ? "background:var(--accent);color:#0A0A0A;font-weight:700" : "color:var(--dim)"}">${S.secAll ? "全員に反映中" : "この人だけ"}</button>`}
      </div>
      ${U.secOrd ? `<div style="font-size:10px;color:var(--dim);margin:-4px 0 8px">上から順に録ります。⣿ をつまんで入れ替え。曲ごとに覚えます</div>`
        : `<div style="font-size:11px;margin:-4px 0 8px;color:${over > 0 ? "var(--bad)" : over < 0 ? "var(--dim)" : "var(--good)"}">
        使う ${sum}分 ／ 持ち時間 ${cap}分${over > 0 ? `　${over}分 はみ出しています` : over < 0 ? `　余裕 ${-over}分` : "　余裕なし"}</div>`}
      ${U.secOrd ? (() => {
        const ord = sectionOrder();
        const tg = tagSecNames();
        return ord.map((nm, k) => `<div class="row" data-drop="sc:${h(nm)}"
          style="margin-bottom:6px;padding:7px 8px;border-radius:8px;background:var(--panel2)">
          <span class="grip" data-drag="sec:${h(nm)}">⣿</span>
          <span style="width:20px;font-size:11px;color:var(--dim);text-align:right">${k + 1}</span>
          <span class="grow trunc" style="font-size:13px;font-weight:600">${h(nm)}</span>
          ${tg.includes(nm) ? `<span style="font-size:10px;color:var(--dim)">表記</span>` : ""}
        </div>`).join("") + ((recSong() || {}).secOrder ? `<button class="chip sm" data-act="psecord0"
          style="margin-top:4px;width:100%;color:var(--dim)">曲の並び順に戻す</button>` : "");
      })() : sectionsOf(s).map((x) => x.skip ? `<div class="row" style="margin-bottom:6px;opacity:.4">
        <span style="width:56px;font-size:12px;text-decoration:line-through">${h(x.name)}</span>
        <span style="font-size:12px;color:var(--dim)">コピー（録らない）</span>
        <span class="grow"></span>
        <button class="chip sm" data-act="pskip" data-id="${h(x.name)}" style="color:var(--dim)">戻す</button>
      </div>` : `<div class="row" style="margin-bottom:6px">
        <span style="width:56px;font-size:12px;color:${x.live ? "var(--accent)" : x.done ? "var(--dim)" : "var(--text)"}">${h(x.name)}</span>
        <button class="chip sm" data-act="psec" data-id="${h(x.name)}|-5">−5</button>
        <button class="chip sm" data-act="psec" data-id="${h(x.name)}|-1">−1</button>
        <button data-act="psecnum" data-id="${h(x.name)}" style="min-width:52px;text-align:center;font-size:13px;font-weight:700;padding:3px 0;border-radius:6px;background:var(--panel2)">${x.min}分</button>
        <button class="chip sm" data-act="psec" data-id="${h(x.name)}|1">＋1</button>
        <button class="chip sm" data-act="psec" data-id="${h(x.name)}|5">＋5</button>
        <span class="grow"></span>
        ${x.live ? `<span style="font-size:11px;color:var(--accent)">ここ</span>`
          : x.prep ? "" : `<button class="chip sm" data-act="pskip" data-id="${h(x.name)}" style="color:var(--dim)">録らない</button>`}
      </div>`).join("")}
      ${U.secOrd ? "" : `<div class="row" style="margin-top:6px">
        <button class="chip sm grow" data-act="pseceven">${SEC_MIN}分ずつに戻す</button>
        <button class="chip sm grow" data-act="psecbars">持ち時間いっぱいに割る</button>
        ${r.live ? `<button class="chip sm grow" data-act="pnextsec">次へ</button>` : ""}
      </div>
      ${S.secAll ? `<div style="font-size:10px;color:var(--accent);margin-top:6px">直した分は、休憩をのぞく全員の枠に同じように入ります</div>`
        : `<button class="chip sm" data-act="pseccopy" style="margin-top:6px;color:var(--dim);width:100%">いまの配分をほかの全員にも配る</button>`}`}
    </div>`; })() : ""}`;
  }).join("");

  // 誰を足すかを、読み込んだ曲のグループから拾う
  // 登録したメンバーだけを出す。自動では拾わない。
  const rosters = {};
  Object.keys(S.rosters || {}).forEach((k) => { if ((S.rosters[k] || []).length) rosters[k] = S.rosters[k]; });
  const used = new Set(S.plan.slots.map((x) => x.name));
  const gorder2 = S.groups.map((g) => g.name).filter(Boolean);
  const memberPick = Object.keys(rosters)
    .sort((x, y) => {
      const ix = gorder2.indexOf(x), iy = gorder2.indexOf(y);
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
    })
    .map((gn) => `
    <div class="row" style="margin:10px 0 4px">
      <span class="grow" style="font-size:10px;color:var(--dim)">${h(gn)}　${rosters[gn].length}人</span>
      <button data-act="proster" data-id="${h(gn)}" style="font-size:11px;color:var(--dim);padding:2px 6px">直す</button>
    </div>
    <div class="chips">${rosters[gn].map((nm) => `<button class="chip sm" data-act="paddm" data-id="${h(nm)}"
      style="${used.has(nm) ? "opacity:.4" : ""}">${h(nm)}</button>`).join("")}</div>`).join("");

  const total = rows.reduce((a, r) => a + Number(r.s.min || 0), 0);
  const doneMin = rows.filter((r) => r.done).reduce((a, r) => a + (r.aE - r.aS), 0);
  const leftSlots = rows.filter((r) => !r.done);
  const leftMin = leftSlots.reduce((a, r) => a + Number(r.s.min || 0), 0);
  const endPlan = last ? last.pE : hm2min(S.plan.start);
  const endNow = last ? last.aE : endPlan;

  return `
  <div class="hd"><button class="ic" data-act="recback">‹</button><b>進行</b>
    <span class="grow"></span>
    <span style="font-size:12px;color:${gap > 0 ? "var(--bad)" : gap < 0 ? "var(--good)" : "var(--dim)"}">
      ${last ? (gap ? dmin(gap) : "予定どおり") : ""}</span></div>
  <div class="scroll pad">
    <div class="card">
      <div class="row" style="gap:10px;margin-bottom:10px">
        <span style="font-size:11px;color:var(--dim);width:40px">開始</span>
        <input class="field" id="pstarttime" value="${h(S.plan.start)}" placeholder="10 / 1000 / 10:00" style="width:110px">
        <button class="chip sm" data-act="psetstart">決定</button>
        <span class="grow"></span>
        <span style="font-size:11px;color:var(--dim)">1人</span>
        <button class="chip sm" data-act="psetdef" data-id="-15">−15</button>
        <b style="min-width:38px;text-align:center">${S.planMin}分</b>
        <button class="chip sm" data-act="psetdef" data-id="15">＋15</button>
        <span style="font-size:11px;color:var(--dim)">RH</span>
        <button class="chip sm" data-act="psetprep" data-id="-5">−5</button>
        <b style="min-width:34px;text-align:center">${S.planPrep}分</b>
        <button class="chip sm" data-act="psetprep" data-id="5">＋5</button>
      </div>
      <div class="row" style="gap:14px;flex-wrap:wrap">
        <div><div style="font-size:10px;color:var(--dim)">終わり</div>
          <b style="font-size:19px;color:${gap > 0 ? "var(--bad)" : "var(--text)"}">${min2hm(endNow)}</b>
          ${gap ? `<span style="font-size:11px;color:${gap > 0 ? "var(--bad)" : "var(--good)"}">　${dmin(gap)}</span>` : ""}</div>
        <div><div style="font-size:10px;color:var(--dim)">残り</div>
          <b style="font-size:19px">${Math.max(0, endNow - now)}分</b></div>
        <div><div style="font-size:10px;color:var(--dim)">未消化</div>
          <b style="font-size:19px">${leftMin}分</b>
          <span style="font-size:11px;color:var(--dim)">　${leftSlots.length}人</span></div>
        <div><div style="font-size:10px;color:var(--dim)">全体</div>
          <b style="font-size:19px">${Math.floor(total / 60)}時間${total % 60 ? (total % 60) + "分" : ""}</b></div>
      </div>
    </div>
    ${rows.some((r) => !r.done) ? `<button class="ghost" data-act="prebal" style="margin-bottom:10px">残り時間で振り直す</button>` : ""}
    ${autoBar}${dayBar}${list || `<p class="note">まだ誰も入っていません</p>`}
    <div class="card">
      ${memberPick || ""}
      <button class="ghost" data-act="prosternew" style="margin-top:10px">メンバーを登録する</button>
      <div class="row" style="gap:8px;margin-top:10px">
        <input class="field grow" id="pname" placeholder="名前を打って足す">
        <input class="field" id="pmin" type="number" inputmode="numeric" placeholder="${S.planMin}" style="width:74px">
        <button class="chip sm" data-act="padd">追加</button>
      </div>
      <button class="ghost" data-act="pbreak" style="margin-top:8px">休憩を入れる</button>
      <button class="ghost" data-act="pastesched" style="margin-top:8px;color:var(--accent)">予定表を貼って組む</button>
    </div>
    <div style="height:40px"></div>
  </div>`;
}

/* ---- レコーディングの歌詞をPDFにする ---- */
function viewRecPrint() {
  const so = recSong();
  if (!so) return `<div class="hd"><button class="ic" data-act="recback">‹</button><b>PDF</b></div>`;
  const bars = barsOf(so);
  const vm3 = vtMarks(so);
  const trs = so.lines.map((l, i) => {
    if (l.gap) return `<tr class="prz"><td class="prn"></td><td class="prx"></td></tr>`;
    const vh3 = vm3.info[i];
    const hd = vh3 ? `<tr class="prv"><td class="prn"></td><td class="prx"><b>${h(vh3.vt)}</b></td></tr>` : "";
    return hd + `<tr><td class="prn">${l.tag ? "［" + h(l.tag) + "］" : ""}${l.sec ? h(l.sec) + " " : ""}${S.recBars && bars[i] != null ? bars[i] : ""}</td><td class="prx">${h(l.add ? "（" + l.t + "）" : l.t)}</td></tr>`;
  });
  return `
  <div class="hd noprint"><button class="ic" data-act="recback">‹</button><b>PDF・印刷</b>
    <span class="grow"></span>
    <button class="chip sm" data-act="rbars" style="${S.recBars ? "background:var(--accent);color:#0A0A0A" : ""}">番号</button>
    <button class="chip sm" data-act="doprint" style="background:var(--accent);color:#0A0A0A">PDFで保存</button></div>
  <div class="scroll">
    <div class="pr" id="prpage"><section class="prs"><div class="prbox"><div class="prin">
      <h3>${h(so.title)}<span class="prc">　${h(so.credit)}</span></h3>
      ${(() => {
        const nc2 = Math.max(1, Math.min(4, Number(so.cols || 1)));
        const bk = (so.colBreaks || []).filter((x) => x > 0 && x < so.lines.length);
        if (nc2 < 2 || !bk.length) return `<table class="prg" style="table-layout:auto">${trs.join("")}</table>`;
        const parts = []; let from = 0;
        bk.concat([so.lines.length]).forEach((to) => { if (to > from) parts.push(trs.slice(from, to).join("")); from = to; });
        return `<div style="display:flex;gap:6mm;align-items:flex-start">${
          parts.map((pp) => `<div style="flex:1;min-width:0"><table class="prg" style="table-layout:auto">${pp}</table></div>`).join("")}</div>`;
      })()}
    </div></div></section></div>
    <div class="noprint" style="height:40px"></div>
  </div>`;
}

/* ---- 紙／PDF ---- */
// 1曲を「A4より一回り小さい箱」に入れ、中身をその箱に収まる倍率まで縮める。
// 紙のサイズはmmで指定するので、端末や印刷時の拡大縮小に左右されない。
// 箱からはみ出た分は切り取られるため、2ページ目が発生しない。


const PR_BASE = 15;   // 画面の基準の文字の大きさ
// 1曲は必ず1枚に収める。紙の幅の中で折り返し、高さに収まるまで文字を小さくする。
function fitPrintDOM() {
  const pr = document.getElementById("prpage");
  if (!pr) return;
  pr.style.transform = "none";
  pr.querySelectorAll(".prs").forEach((sec) => {
    const box = sec.querySelector(".prbox");
    const inner = sec.querySelector(".prin");
    const body = sec.querySelector(".prbody");
    if (!box || !inner) return;
    box.style.height = "";                 // いったん元の高さ（上限）に戻す
    const bw = box.clientWidth, bh = box.clientHeight;
    if (!bw || !bh) return;
    // 幅は紙の幅に固定し、文字の大きさだけで高さを合わせる。
    // 以前は横に引き伸ばしてから縮小していたため、幅の測り方が狂うと
    // 右段（2番）が紙からはみ出して切り落とされていた。
    // この方法なら横にはみ出しようがなく、行が消えることもない。
    inner.style.transform = "none";
    inner.style.transformOrigin = "top left";
    inner.style.width = "";
    if (body) { body.style.columnCount = 1; body.style.columnGap = ""; }
    let f = PR_BASE;
    inner.style.fontSize = f + "px";
    const tooTall = () => inner.scrollHeight > bh - 8;
    const tooWide = () => inner.scrollWidth > bw + 1;
    for (let n = 0; n < 60 && (tooTall() || tooWide()); n++) {
      f *= 0.94;
      if (f < 1.2) break;
      inner.style.fontSize = f.toFixed(2) + "px";
    }
    box.style.height = Math.min(bh, inner.scrollHeight + 6) + "px";
  });
  // 画面では紙全体が見えるように縮める。印刷時は等倍に戻る。
  const sc = app.querySelector(".scroll");
  const w = (sc ? sc.clientWidth : 700) - 10;
  const k2 = Math.min(1, w / Math.max(1, pr.offsetWidth));
  pr.style.transformOrigin = "top left";
  pr.style.transform = "scale(" + k2 + ")";
  pr.style.marginBottom = (-(1 - k2) * pr.offsetHeight) + "px";
}

// 曲はもう決まっているので、確認の画面は挟まずそのまま印刷へ。
// 紙面の組み直し（fitPrintDOM）が終わってから呼ぶ。
// 印刷から戻ったときのために画面自体は残す。
function autoPrint() {
  setTimeout(() => { try { window.print(); } catch (e) { /* 出せなければ画面が残るだけ */ } }, 150);
}

function viewPrint() {
  // この公演の曲すべてが対象。グループでは絞らない。
  const all = SONGS();
  const picked = U.printPick ? all.filter((x) => U.printPick.includes(x.id)) : all;

  let needWide = false;
  const body = picked.map((so) => {
    const ns0 = NOTES().filter((n) => n.songId === so.id && n.showId === S.showId);
    const mm = songMemo(so.id);

    // 1行ぶんの歌詞を、指摘の印つきで組み立てる
    const cellHTML = (l, i) => {
      const ns = ns0.filter((n) => covers(n, i));
      const chars = Array.from(l.t);
      const mark = (n) => {
        const t = n.tags.length ? n.tags.map(tagName).join("・") : (n.memo ? "メモ" : "");
        return `[${t}${n.pitch ? " " + pitchLabel(n.pitch) : ""}${n.memo ? " " + n.memo : ""}]`;
      };
      // 文字を選ばずに行ごと指摘したものは、その行の歌詞ぜんぶに下線を引く。
      // タグだけだとどの行か紙の上で追いにくいため。
      const wholeLine = ns.some((n) => n.from == null);
      let cells = chars.map((ch, ci) => {
        const mk = wholeLine || ns.find((n) => n.from != null && ci >= n.from && ci <= n.to);
        const tail = ns.filter((n) => n.from != null && n.to === ci).map((n) => `<b class="prt">${h(mark(n))}</b>`).join("");
        return (mk ? `<u>${ch === " " ? "&nbsp;" : h(ch)}</u>` : (ch === " " ? "&nbsp;" : h(ch))) + tail;
      }).join("");
      cells += ns.filter((n) => n.from == null && n.lineIdx === i).map((n) => `<b class="prt">${h(mark(n))}</b>`).join("");
      const past = pastHits(so.id, i);
      if (past.count) cells += `<span class="prp">（前${past.count}）</span>`;
      return cells;
    };
    const nameHTML = (l, i) => {
      const st = lineStatus(so, i);
      const sub = subOf(so.id, i);
      const txt = sub ? labelOf(so, i) : (l.labelRaw || l.raw || l.label || "");
      const m = /^([\s\S]*?)[\s　]*((?:ハモ|コーラス|Cho)[\s\S]*)$/.exec(txt);
      // 名前の途中で改行されないよう、「・」の後だけ折り返せるようにする
      const nb = (t) => h(t).replace(/・/g, "・<wbr>");
      const inner2 = m ? `${nb(m[1])}${m[1] ? "<br>" : ""}<b class="hamomk">${nb(m[2])}</b>` : nb(txt);
      return `<span${st ? ' style="font-weight:700;text-decoration:underline"' : ""}>${inner2}</span>`;
    };

    // 元のExcelの列の並びを再現する
    const ref = (x) => { const m = /^([A-Z]+)(\d+)$/.exec(x || ""); return m ? { c: m[1], r: Number(m[2]) } : null; };
    // 歌詞の番地まで揃っている曲だけ、元のExcelの並びを再現する。
    // 古い取り込みでは番地が無いので、その場合は縦に並べる。
    const withT = so.lines.filter((l) => l.t);
    const withBoth = withT.filter((l) => ref(l.cell) && ref(l.lcell));
    const hasGrid = withT.length > 0 && withBoth.length >= withT.length * 0.8;
    let inner;

    if (hasGrid) {
      const colNum = (t) => { let n = 0; for (let i = 0; i < t.length; i++) n = n * 26 + (t.charCodeAt(i) - 64); return n; };
      // 元のExcelにあった列を、そのままの並びで使う
      const spec = [];
      const put = (c, kind) => { if (c && !spec.some((x) => x.c === c)) spec.push({ c, kind }); };
      so.lines.forEach((l) => {
        const a = ref(l.cell), b = ref(l.lcell), e = ref(l.extraCell);
        if (a) put(a.c, "name");
        if (b) put(b.c, "lyric");
        if (e) put(e.c, "extra");
      });
      (so.blockRows || []).forEach((br) => {
        const a = ref(br.ncell), b = ref(br.lcell);
        if (a) put(a.c, "name");
        if (b) put(b.c, "lyric");
      });
      spec.sort((x, y) => colNum(x.c) - colNum(y.c));

      let minR = Infinity, maxR = 0;
      const byName = {}, byLyric = {}, byExtra = {}, bat = {};
      so.lines.forEach((l, i) => {
        const a = ref(l.cell), b = ref(l.lcell), x = ref(l.extraCell);
        const any = a || b;
        if (!any) return;
        if (any.r < minR) minR = any.r;
        if (any.r > maxR) maxR = any.r;
        if (a) byName[a.c + ":" + a.r] = { l, i };
        if (b) byLyric[b.c + ":" + b.r] = { l, i };
        if (x) byExtra[x.c + ":" + x.r] = { l, i };
      });
      (so.blockRows || []).forEach((br) => {
        const a = ref(br.ncell), b = ref(br.lcell);
        const any = a || b;
        if (!any) return;
        if (a) bat[a.c + ":" + a.r] = { br, kind: "name" };
        if (b) bat[b.c + ":" + b.r] = { br, kind: "lyric" };
        if (any.r < minR) minR = any.r;
        if (any.r > maxR) maxR = any.r;
      });

      const rowsSet = [];
      for (let r = minR; r <= maxR; r++) rowsSet.push(r);
      let has = false;
      const gridCell = (sp, rn) => {
          const key = sp.c + ":" + rn;
          const cls = sp.kind === "lyric" ? "prx" : "prn";
          const bb = bat[key];
          if (bb) {
            has = true;
            const st = blockStatus(so, bb.br.b);
            return bb.kind === "name"
              ? `<td class="prn"><b>${h(bb.br.b)}</b></td>`
              : `<td class="prx"${st ? ' style="font-weight:700;text-decoration:underline"' : ""}>${h(names(blockParts(so, bb.br.b)) || "—")}</td>`;
          }
          const en = byName[key], el = byLyric[key], ex = byExtra[key];
          if (el && el.l.t) { has = true; return `<td class="prx">${cellHTML(el.l, el.i)}</td>`; }
          if (en && en.l.t) { has = true; return `<td class="prn">${nameHTML(en.l, en.i)}</td>`; }
          if (ex && ex.l.extraRaw) { has = true; return `<td class="prn"><b class="hamomk">${h(ex.l.extraRaw)}</b></td>`; }
          return `<td class="${cls}"></td>`;
      };
      const trs = rowsSet.map((rn) => {
        has = false;
        const tds = spec.map((sp) => gridCell(sp, rn)).join("");
        return `<tr${has ? "" : ' class="prz"'}>${tds}</tr>`;
      }).join("");
      // 名前＋歌詞の組が2つ以上ある（Excelが横に2段）なら、縦に積む。
      // 横に並べたままだと幅で縮んで、文字が小さく紙が余る。
      const pairs = [];
      spec.forEach((sp, k) => {
        if (sp.kind === "name") pairs.push([k]);
        else if (pairs.length) pairs[pairs.length - 1].push(k);
      });
      if (pairs.length >= 2) needWide = true;   // 名前＋歌詞の組が2つ以上なら、紙を横向きにする
      inner = `<table class="prg">${trs}</table>`;
    } else {
      inner = `<div class="prbody">${so.lines.map((l, i) => {
        if (l.gap) return `<div style="height:0.5em"></div>`;
        return `<div class="prl"><span class="prn">${nameHTML(l, i)}</span><span class="prx">${cellHTML(l, i)}</span></div>`;
      }).join("")}</div>`;
    }

    return `<section class="prs"><div class="prbox"><div class="prin">
      <h3>${h(songName(so))}<span class="prc">　${h((S.groups.find((x) => x.id === so.groupId) || {}).name || "")}　${h(showName())}　${ns0.length}件</span></h3>
      ${blocksOf(so).length && !(hasGrid && (so.blockRows || []).length) ? `<div class="prb">${blocksOf(so).map((b) => `<span><b>${h(b)}</b> ${h(names(blockParts(so, b)) || "—")}</span>`).join("　")}</div>` : ""}
      ${inner}
      ${mm ? `<div class="prm"><b>総括</b>　${h(mm)}</div>` : ""}
    </div></div></section>`;
  }).join("");

  const noGrid = picked.filter((x) => {
    const withT = x.lines.filter((l) => l.t);
    const ok = withT.filter((l) => /^[A-Z]+\d+$/.test(l.cell || "") && /^[A-Z]+\d+$/.test(l.lcell || ""));
    return withT.length && ok.length < withT.length * 0.8;
  });

  return `
  <div class="hd noprint"><button class="ic" data-act="go-live">‹</button><b>PDF・印刷</b>
    <span class="grow"></span>
    <button class="chip sm" data-act="doprint" style="background:var(--accent);color:#0A0A0A">PDFで保存</button></div>
  ${noGrid.length ? `<div class="noprint" style="padding:8px 14px;font-size:11px;color:var(--bad)">
    ${h(noGrid.map((x) => songName(x)).join("、"))} は元の並びを再現できません。Excelから読み込み直すと同じ並びになります。</div>` : ""}
  <div class="scroll">
    ${needWide ? `<style>@page{size:A4 landscape;margin:0}</style>
    <div class="noprint" style="padding:8px 12px;background:#2A2118;color:#F0C089;font-size:12px;line-height:1.6">
      この曲は歌割表が横に2段あるので、紙は<b>横向き</b>で組んでいます。
      印刷／PDFの画面で「方向」が縦向きになっていたら、<b>横向きに変えてください</b>。
      iPhoneは方向の指定を無視することがあり、縦のままだと文字が小さくなります。
    </div>` : ""}
    <div class="pr${needWide ? " land" : ""}" id="prpage">${body}</div>
    ${body ? "" : `<p class="noprint" style="padding:30px;text-align:center;color:var(--dim);font-size:13px">この公演には曲がありません</p>`}
    <div class="noprint" style="height:40px"></div>
  </div>`;
}

/* ---- setup ---- */
function viewSetup() {
  if (VIEW()) {
    // 公演の並びはJoe側と同じにする（フォルダごとにまとめ、新しい順、箱に入っていない分は下）
    const allShows = showsFor();
    const curFolder = folderOf(S.shows.find((x) => x.id === S.showId));
    const unreadIn = (sid) => S.songs.filter((x) => x.showId === sid && isUnread(x)).length;
    const showRow = (sw) => {
      const un = unreadIn(sw.id);
      return `<div class="row card" style="margin-bottom:8px;padding:12px;${sw.id === S.showId ? "outline:1px solid var(--accent)" : ""}">
      <button class="grow" style="text-align:left;min-width:0" data-act="useshow" data-id="${sw.id}">
        <div class="clamp2" style="${sw.id === S.showId ? "color:var(--accent)" : ""}">${h(sw.name)}</div>
        <div style="font-size:11px;color:var(--dim)">${S.songs.filter((x) => x.showId === sw.id).length}曲 ・ ${NOTES().filter((n) => n.showId === sw.id).length}件</div>
      </button>
      ${un ? `<span style="font-size:11px;color:var(--accent);font-weight:700">未読${un}</span>` : ""}</div>`;
    };
    const list = groupShows(U.allShowList ? allShows : allShows.slice(0, 12)).map(([fname, rows]) => {
      if (!fname) return rows.map(showRow).join("");
      const open = S.folders[fname] === true || fname === curFolder;
      const un = rows.reduce((a, sw) => a + unreadIn(sw.id), 0);
      return `<div class="row card" style="margin-bottom:8px;padding:8px 12px">
        <button class="grow row" data-act="folder" data-id="${h(fname)}" style="text-align:left;min-width:0">
          <span style="width:18px;color:var(--dim)">${open ? "▾" : "▸"}</span>
          <span class="grow trunc">${h(fname)}</span>
          ${un ? `<span style="font-size:11px;color:var(--accent);font-weight:700;margin-right:8px">未読${un}</span>` : ""}
          <span style="font-size:11px;color:var(--dim)">${rows.length}公演</span>
        </button>
      </div>
      ${open ? `<div style="margin-left:14px">${rows.map(showRow).join("")}</div>` : ""}`;
    }).join("");
    return `
    <div class="hd"><button class="ic" data-act="go-live">‹</button><b>設定</b>
      <span class="grow"></span>
      <span style="font-size:11px;color:var(--accent)">ライブモード</span></div>
    <div class="scroll pad">
    <h4 class="head">公演</h4>
    ${list || `<p class="note">公演がありません</p>`}
    ${allShows.length > 12 ? `<button class="ghost" data-act="allshowlist" style="margin-bottom:10px">${U.allShowList ? "最近の12公演だけ表示" : `すべて表示（全${allShows.length}公演）`}</button>` : ""}

    <h4 class="head">音を確かめる</h4>
    <div class="card">${pianoHTML(null)}</div>
    <h4 class="head">ピッチを見る</h4>
    ${pitchHTML()}

    <h4 class="head">メトロノーム</h4>
    ${metroHTML()}
    <h4 class="head">歌割をPDFにする</h4>
    <div class="card"><button class="primary" data-act="gopdf">PDFにする</button></div>
    ${footerHTML()}
    <div style="height:40px"></div></div>`;
  }

  if (S.recMode) return viewSetupRec();

  const allShows = showsFor();
  const curFolder = folderOf(S.shows.find((x) => x.id === S.showId));
  const showRow = (sw) => `<div class="row card" data-drop="s:${sw.id}" style="margin-bottom:8px;padding:10px 12px;${sw.id === S.showId ? "outline:1px solid var(--accent)" : ""}">
      <span class="grip" data-drag="show:${sw.id}">⣿</span>
      <button class="grow" style="text-align:left;min-width:0" data-act="useshow" data-id="${sw.id}">
        <div class="clamp2" style="${sw.id === S.showId ? "color:var(--accent)" : ""}">${h(sw.name)}</div>
        <div style="font-size:11px;color:var(--dim)">${S.songs.filter((x) => x.showId === sw.id).length}曲 ・ ${NOTES().filter((n) => n.showId === sw.id).length}件${sw.id === S.showId ? " ・ 記録中" : ""}${sw.nopub ? ` ・ <b style="color:var(--bad)">配信しない</b>` : ""}</div>
      </button>
      <button data-act="showpub" data-id="${sw.id}" style="padding:4px 6px;font-size:12px;color:${sw.nopub ? "var(--bad)" : "var(--dim)"}">${sw.nopub ? "配信×" : "配信○"}</button>
      <button data-act="copyshow" data-id="${sw.id}" style="padding:4px 6px;color:var(--dim);font-size:12px">複製</button>
      <button data-act="renameshow" data-id="${sw.id}" style="padding:4px 6px;color:var(--dim);font-size:12px">名前</button>
      <button data-act="delshow" data-id="${sw.id}" style="padding:4px 6px;color:var(--bad)">✕</button>
    </div>`;
  const shows = groupShows(U.allShowList ? allShows : allShows.slice(0, 12)).map(([fname, list]) => {
    if (!fname) return list.map(showRow).join("");
    const open = S.folders[fname] === true || fname === curFolder;
    return `<div class="row card" data-drop="f:${h(fname)}" style="margin-bottom:8px;padding:8px 12px">
        <button class="grow row" data-act="folder" data-id="${h(fname)}" style="text-align:left;min-width:0">
          <span style="width:18px;color:var(--dim)">${open ? "▾" : "▸"}</span>
          <span class="grow trunc">${h(fname)}</span>
          <span style="font-size:11px;color:var(--dim)">${list.length}公演</span>
        </button>
        <button data-act="fup" data-id="${h(fname)}" style="padding:4px 6px;color:var(--dim)">↑</button>
        <button data-act="fdown" data-id="${h(fname)}" style="padding:4px 6px;color:var(--dim)">↓</button>
        <button data-act="frename" data-id="${h(fname)}" style="padding:4px 6px;color:var(--dim);font-size:12px">名前</button>
      </div>
      ${open ? `<div style="margin-left:14px">${list.map(showRow).join("")}</div>` : ""}`;
  }).join("");

  const all2 = SONGS();
  const cur = U.markOnly ? all2.filter((x) => x.mark) : all2;
  const songs = cur.map((x0, i0) => {
    const x = x0, i = all2.indexOf(x0);
    const on = U.pick.includes(x.id);
    return `<div class="row card" data-drop="g:${x.id}" style="margin-bottom:8px;${on ? "outline:1px solid var(--accent)" : ""}">
      <span class="grip" data-drag="song:${x.id}">⣿</span>
      <button data-act="picksong" data-id="${x.id}" style="width:26px;flex:0 0 26px;font-size:15px;color:${on ? "var(--accent)" : "var(--dim)"}">${on ? "☑" : "☐"}</button>
      <button class="grow" style="text-align:left;min-width:0" data-act="opensong" data-i="${i}">
        <div class="clamp2">${x.mark ? `<b style="color:var(--accent)">★</b> ` : ""}${h(songName(x))}</div>
        <div class="trunc" style="font-size:11px;color:var(--dim)">${x.groupId ? h((S.groups.find((g) => g.id === x.groupId) || {}).name || "—") : "配信しない"}${
        impOf(x) ? ` ・ 取り込み ${impLabel(impOf(x))}` : ""}${
        staleBy(x) ? `<span style="color:#F0B23C"> ・ 古い（別の公演に ${impLabel(staleBy(x))} 版）</span>` : ""}</div>
      </button>
      <button data-act="up" data-i="${i}" style="padding:4px 5px;color:var(--dim)">↑</button>
      <button data-act="down" data-i="${i}" style="padding:4px 5px;color:var(--dim)">↓</button>
      <button data-act="songmenu" data-i="${i}" style="padding:4px 8px;color:var(--dim)">…</button>
    </div>`;
  }).join("");
  const bar = `<div class="chips" style="margin-bottom:10px">
      <button class="chip sm" data-act="pickall">${U.pick.length === cur.length && cur.length ? "選択を解除" : "すべて選ぶ"}</button>
      <button class="chip sm" data-act="sorttitle">曲名順</button>
      ${S.songs.some((x) => x.mark) ? `<button class="chip sm" data-act="markonly" style="${U.markOnly ? "background:var(--accent);color:#0A0A0A" : "color:var(--accent)"}">★だけ</button>` : ""}
      ${U.pick.length ? `<button class="chip sm" data-act="pdfpicked" style="background:var(--accent);color:#0A0A0A">${U.pick.length}曲をPDF</button>
      <button class="chip sm" data-act="picktake">テイク</button>
      <button class="chip sm" data-act="clearpicked">記録を消す</button>
      <button class="chip sm" data-act="pickgroup">グループ</button>
      <button class="chip sm" data-act="delpicked" style="background:var(--bad);color:#0A0A0A">削除</button>` : ""}
    </div>`;

  return `
  <div class="hd"><button class="ic" data-act="go-live">‹</button><b>設定</b>
    <span class="grow"></span>
    ${U.busy ? `<span style="font-size:12px;color:var(--accent)">${h(U.busy)}</span>`
             : `<button data-act="recon" class="chip sm" style="color:var(--accent)">ライブモード ⇄</button>`}</div>
  <div class="scroll pad">
        <h4 class="head">公演</h4>
    ${S.groups.length > 1 ? `<div class="chips" style="margin-bottom:10px">
      <button class="chip sm" data-act="showfilter" data-id="" style="${!S.showFilter ? "background:var(--accent);color:#0A0A0A" : ""}">すべて</button>
      ${S.groups.map((g) => `<button class="chip sm" data-act="showfilter" data-id="${g.id}"
        style="${S.showFilter === g.id ? "background:var(--accent);color:#0A0A0A" : ""}">${h(g.name)}</button>`).join("")}
    </div>` : ""}
    ${shows}
    ${allShows.length > 12 ? `<button class="ghost" data-act="allshowlist" style="margin-bottom:10px">${U.allShowList ? "最近の12公演だけ表示" : `すべて表示（全${allShows.length}公演）`}</button>` : ""}
    <div class="row" style="margin-bottom:22px">
      <input class="field grow" id="newshow" placeholder="">
      <button class="chip" data-act="addshow">追加</button>
    </div>

    <h4 class="head">セットリスト</h4>
    ${cur.length ? bar : ""}
    ${songs}
    <div class="card">
      <button class="primary" data-act="pickfile" style="margin-bottom:8px">歌割のPDF / Excel を選ぶ（複数可）</button>
      <input type="file" id="swapfile" style="display:none"
        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls,.csv">
      <input type="file" id="file" multiple style="display:none"
        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls,.csv,application/json,.json">
      <div style="font-size:11px;color:var(--dim);margin-top:6px">→ ${h(group().name || "")}</div>
    </div>

    <h4 class="head">グループ</h4>
    ${S.groups.map((g) => {
      const n = SONGS().filter((x) => x.groupId === g.id).length;
      const cur = g.id === S.groupId;
      return `<div class="row card" style="padding:9px 12px;margin-bottom:6px;${cur ? "outline:1px solid var(--accent)" : ""}">
        <button class="grow" style="text-align:left;min-width:0" data-act="usegroup" data-id="${g.id}">
          <div class="trunc" style="font-size:14px;${cur ? "color:var(--accent)" : ""}">${h(g.name)}</div>
          <div style="font-size:11px;color:var(--dim)">${n}曲 ・ ${g.nopub ? "配信しない" : g.gistId ? (g.key ? "配信中・合言葉あり" : "配信中") : "未接続"}${cur ? " ・ 取り込み先" : ""}</div>
        </button>
        <button data-act="gmenu" data-id="${g.id}" style="padding:6px 10px;color:var(--dim);font-size:17px">⋯</button>
      </div>`;
    }).join("")}
    <div class="row" style="margin-bottom:22px">
      <input class="field grow" id="newgroup" placeholder="グループ名">
      <button class="chip" data-act="addgroup">追加</button>
    </div>
    <div class="row" style="margin-top:8px">
      ${S.groups.some((g) => g.nopub) ? "" : `<button class="chip sm" data-act="addnopub">「配信しない」グループを作る</button>`}
    </div>

    ${(() => { const gg = group(); return gg && gg.gistId && !gg.nopub; })() ? `
    <h4 class="head">ライブ中のお知らせ</h4>
    <div class="card" style="margin-bottom:22px">
      ${S.alertMsg ? `<div style="background:var(--bad);color:#0A0A0A;border-radius:10px;padding:10px 12px;margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;opacity:.7;margin-bottom:4px">出しています ・ ${new Date(S.alertMsg.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} ・ ${
            h((S.alertMsg.to || []).map((gid) => (group(gid) || {}).name).filter(Boolean).join("、") || "全グループ")}</div>
          <div style="font-size:15px;font-weight:700;white-space:pre-wrap;word-break:break-word">${h(S.alertMsg.text)}</div>
        </div>
        <button class="ghost" data-act="alertclear" style="color:var(--bad);margin-bottom:8px">取り下げる</button>` : ""}
      <textarea class="field" id="alerttx" rows="2" style="resize:none;margin-bottom:8px" placeholder="${h(group().name)} のメンバーへ"></textarea>
      <button class="primary" data-act="alertsend">お知らせ</button>
    </div>` : ""}

    <h4 class="head">欠席対応</h4>
    <div class="card">
      <button class="primary" data-act="goabsent">${absentIds().length
        ? `${h(absentIds().map((x) => (member(x) || {}).name).join("・"))} が欠席${needCount() ? `　未決 ${needCount()}` : "　完了"}`
        : "欠席者を設定する"}</button>
    </div>

    <h4 class="head">音を確かめる</h4>
    <div class="card">${pianoHTML(null)}</div>

    <h4 class="head">ピッチを見る</h4>
    ${pitchHTML()}

    <h4 class="head">メトロノーム</h4>
    ${metroHTML()}

    <h4 class="head">録音データ</h4>
    <div class="card" style="margin-bottom:10px">
      <div class="row" style="margin-bottom:8px">
        <span class="grow" style="font-size:13px">頭出しの巻き戻し</span>
        ${[3, 5, 10].map((k) => `<button class="chip sm" data-act="preroll" data-id="${k}"
          style="${S.preroll === k ? "background:var(--accent);color:#0A0A0A" : ""}">${k}秒</button>`).join("")}
      </div>
    </div>
    <div class="card">
      <div style="font-size:11px;color:var(--dim);margin-bottom:8px">録音は${REC_DAYS}日で自動的に消えます。</div>
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

    <h4 class="head">歌割をPDFにする</h4>
    <div class="card"><button class="primary" data-act="gopdf">PDFにする</button></div>

    <h4 class="head">自動公開</h4>
    <div class="card">
      ${S.ghToken ? `<div class="row" style="margin-bottom:10px">
          <span class="grow" style="font-size:13px">トークン設定済み　<span style="color:var(--dim)">${h(pushState || "待機中")}</span></span>
          <button class="chip sm" data-act="autopub" style="${S.autoPub ? "background:var(--accent);color:#0A0A0A" : ""}">自動${S.autoPub ? "オン" : "オフ"}</button>
        </div>
        <button class="ghost" data-act="ghpush" style="margin-bottom:8px">今すぐ送信</button>
        <button class="ghost" data-act="ghverify" style="margin-bottom:8px">トークンを確認する</button>
        <button class="ghost" data-act="ghclear" style="color:var(--bad)">トークンを入れ直す</button>
        `
        : `<div class="row" style="margin-bottom:8px">
            <input class="field grow" id="ghtoken" type="password" placeholder="ghp_ で始まる文字列" value="">
            <button class="chip" data-act="ghtoken">確認して保存</button>
          </div>
          <div style="font-size:11px;color:var(--dim);margin-top:6px">Tokens (classic) / gist</div>`}
    </div>


    <h4 class="head">保存領域</h4>
    <div class="card" style="margin-bottom:22px">
      ${(() => {
        // Safariは保存領域を「この場所ぜんぶ」で数える。今のデータだけ見ても実態は分からない。
        const enc = new TextEncoder();
        let total = 0, mine = 0;
        const stray = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const v = localStorage.getItem(k) || "";
            const b = enc.encode(k).length + enc.encode(v).length;
            total += b;
            if (k === KEY) mine = b;
            else if (k.indexOf(KEY + ":broken:") === 0) {
              const at = Number(k.split(":broken:")[1] || 0);
              let n = null;
              try { const o = unpackState(JSON.parse(v)); n = { sh: (o.shows || []).length, sg: (o.songs || []).length, nt: (o.notes || []).length }; }
              catch (e) { /* 読めなくても大きさは分かる */ }
              stray.push({ k, at, b, n });
            }
          }
        } catch (e) { /* 数えられない端末もある */ }
        stray.sort((a, b2) => b2.at - a.at);
        const mb = (x) => (x / 1048576).toFixed(2);
        const cur = enc.encode(JSON.stringify(packState(S))).length;
        const over = saveErr;
        return `<div class="row" style="margin-bottom:6px">
          <span class="grow" style="font-size:13px">いまのデータ</span>
          <span style="font-size:13px;color:${over ? "var(--bad)" : "var(--dim)"};font-weight:700">${mb(cur)} MB</span>
        </div>
        <div style="font-size:11px;color:var(--dim);line-height:1.7;margin-bottom:${stray.length || total ? 10 : 0}px">
          公演${S.shows.length}件・曲${S.songs.length}件・記録${S.notes.length}件<br>
          ${idbOK ? "保存先は端末のデータベースです。上限はほぼ気にしなくて構いません。"
                  : "<b style=\"color:var(--bad)\">この端末ではデータベースが使えず、上限5MBの場所に保存しています。</b>"}
          ${over ? "<br><b style=\"color:var(--bad)\">いま保存できていません。</b>" : ""}
        </div>
        ${total ? `<div style="font-size:11px;color:var(--dim);margin-bottom:8px">古い置き場所に ${mb(total)} MB 残っています。${stray.length ? "" : "次に開いた時に自動で片付きます。"}</div>` : ""}
        ${over ? `<button class="primary" data-act="shrinknow" style="margin-bottom:10px">いま空きを作る（古い公演を消す）</button>` : ""}
        ${stray.length ? `<div style="font-size:11px;color:var(--accent);margin-bottom:6px">
          取り残しのデータが ${stray.length}件 あります（合計 ${mb(stray.reduce((a, x) => a + x.b, 0))} MB）。<br>
          読み込みでつまずいた時に、消さずに横へ避けたものです。中身が残っていれば戻せます。</div>
        ${stray.map((x) => `<div class="row card" style="padding:8px 10px;margin-bottom:6px">
          <div class="grow" style="min-width:0">
            <div style="font-size:12px">${x.at ? new Date(x.at).toLocaleString("ja-JP") : "日時不明"}　${mb(x.b)} MB</div>
            <div style="font-size:11px;color:var(--dim)">${x.n ? `公演${x.n.sh}件・曲${x.n.sg}件・記録${x.n.nt}件` : "中身を読み取れません"}</div>
          </div>
          ${x.n && (x.n.sg || x.n.nt) ? `<button class="chip sm" data-act="strayuse" data-id="${h(x.k)}">戻す</button>` : ""}
          <button class="chip sm" data-act="straydel" data-id="${h(x.k)}" style="color:var(--bad)">消す</button>
        </div>`).join("")}` : ""}`;
      })()}
    </div>

    <h4 class="head">ほかの端末と揃える</h4>
    <div class="card" style="margin-bottom:22px">
      ${(() => {
        const linked = !!(S.ghToken && S.bkGistId);
        return `<div class="row" style="margin-bottom:8px">
          <span class="grow" style="font-size:13px">${linked ? "つながっています" : "つながっていません"}</span>
          <span style="font-size:11px;color:${linked ? "var(--good)" : "var(--bad)"};font-weight:700">${linked ? "同期あり" : "同期なし"}</span>
        </div>
        <div style="font-size:11px;color:var(--dim);line-height:1.7;margin-bottom:8px">
          ${linked
            ? `つなぎ先 ${h(String(S.bkGistId).slice(0, 7))}…<br>
               最後のやりとり ${S.bkAt ? new Date(S.bkAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "まだありません"}<br>
               この端末の内容は ${bkSignature() === S.bkHash ? "送信済みです" : "<b style=\"color:var(--accent)\">まだ送っていません</b>"}`
            : `${S.ghToken ? "つなぎ先が決まっていません。" : "GitHubのトークンが入っていません。"}
               MacとiPhoneで同じつなぎ先にすると、公演も曲も揃います。`}
        </div>
        <button class="primary" data-act="syncnow" style="margin-bottom:8px">今すぐ揃える</button>
        <button class="ghost" data-act="bkpick" style="margin-bottom:8px">つなぎ先を変える</button>
        <div style="font-size:11px;color:var(--dim)">つなぎ先がずれていると、片方の内容はもう片方に出てきません。<br>
          両方の端末でこの番号が同じか確かめてください。</div>`;
      })()}
    </div>

    <h4 class="head">バックアップ</h4>
    <div class="card">
      <div class="row" style="margin-bottom:10px">
        <span class="grow" style="font-size:13px">${S.bkAt ? "最終 " + new Date(S.bkAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "まだ取っていません"}</span>
        <span style="font-size:11px;color:${bkSignature() === S.bkHash ? "var(--good)" : "var(--dim)"}">${bkSignature() === S.bkHash ? "最新" : "未反映あり"}</span>
      </div>
      <button class="primary" data-act="bknow" style="margin-bottom:8px">今すぐバックアップ</button>
      <button class="ghost" data-act="bkfile" style="margin-bottom:8px">ファイルに書き出す</button>
      <button class="ghost" data-act="bkrestore" style="color:var(--bad);margin-bottom:6px">バックアップから戻す</button>
      <button class="ghost" data-act="bkfind" style="margin-bottom:6px">バックアップを探す（見つからない時）</button>
      <button class="ghost" data-act="bkfromid" style="margin-bottom:6px">GistのURLを指定して戻す</button>
      <button class="primary" data-act="bkfrompub" style="margin-bottom:10px">配信データから取り戻す</button>
      <button class="primary" data-act="editlink">自分用リンクを作る</button>
      <div style="font-size:11px;color:var(--dim);margin-top:8px">公演・曲・記録・総括・手書きをすべて保存します。録音とトークンは含みません。</div>
    </div>

    ${(S.trash || []).length ? `<h4 class="head">ゴミ箱</h4>
    <div class="card"><button class="primary" data-act="gotrash">ゴミ箱（${S.trash.length}件）</button>
      <div style="font-size:11px;color:var(--dim);margin-top:8px">${TRASH_DAYS}日を過ぎたものから順に消えます</div>
    </div>` : ""}


    ${footerHTML()}
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
  if (e.target.closest("[data-r]") && U.sheet) return;   // 文字の選択はなぞりで扱う
  if (!b) return;
  const a = b.dataset.act, i = +b.dataset.i, id = b.dataset.id;
  const s = song();

  switch (a) {
    case "size": S.size = S.size >= 26 ? 15 : S.size + 2; save(); render(); break;
    case "prev": if (U.songIdx > 0) { commitFields(); markRead(song()); U.songIdx--; render(); } break;
    case "next": if (U.songIdx < SONGS().length - 1) { commitFields(); markRead(song()); U.songIdx++; render(); } break;
    case "go-summary": commitFields(); U.view = "summary"; render(); break;
    case "go-setup": commitFields(); U.view = "setup"; render(); break;
    case "go-live": commitFields(); U.view = "live"; render(); break;
    case "note": openSheet(i, null); break;
    case "assignline": {
      if (VIEW()) break;
      const so2 = song(); if (!so2) break;
      const ln = so2.lines[i] || {};
      // 歌詞だけで歌割が書かれていない行（カットした所など）は触らない
      if (!(ln.parts || []).length && !(ln.labelRaw || ln.label)) { U.menu = null; renderSheet(); break; }
      const bb = blockOf(so2, i);
      if (bb) { U.menu = { kind: "block", id: so2.id, b: bb }; renderSheet(); break; }
      U.menu = { kind: "assign", id: so2.id, i, idx: runAt(so2, i) };
      renderSheet(); break;
    }
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
    case "closemenu": U.menu = null; renderSheet(); break;
    case "cancel":
    case "close":
      clearTimeout(sheetTimer);
      U.picker = false; U.sheet = null; renderSheet();
      break;
    case "picker": U.picker = true; renderSheet(); break;
    case "draw": U.draw = !U.draw; U.erase = false; render(); break;
    case "pen": U.erase = false; render(); break;
    case "eraser": U.erase = true; render(); break;
    case "inkundo": {
      const k = drawKey();
      const arr = S.draws[k] || [];
      if (arr.length) { arr.pop(); if (!arr.length) delete S.draws[k]; save(); paintInk(); render(); }
      break;
    }
    case "clearink":
      if (confirm("この曲の手書きをすべて消しますか？")) { delete S.draws[drawKey()]; save(); render(); }
      break;
    case "overview": U.overview = !U.overview; render(); break;
    case "ovsize":
      if (S.recMode) { S.recOvSize = S.recOvSize >= 22 ? 11 : S.recOvSize + 2; save(); }
      else U.ovSize = U.ovSize >= 14 ? 8 : U.ovSize + 2;
      render(); break;
    case "jumpline": {
      U.overview = false; render();
      const el = app.querySelector(`.txt[data-l="${i}"]`);
      if (el) el.scrollIntoView({ block: "center" });
      break;
    }
    case "undoall": {
      // 手書き中で線があれば線を1本消す。それ以外は操作を1つ戻す。
      if (U.draw && (S.draws[drawKey()] || []).length) {
        const arr = S.draws[drawKey()];
        arr.pop(); if (!arr.length) delete S.draws[drawKey()];
        save(); paintInk(); render();
        break;
      }
      // 続けて undo と同じ動きをする
    }
    case "undo":
      if (undoStack.length) {
        const prev = JSON.parse(undoStack.pop());
        if (Array.isArray(prev)) S.notes = prev;
        else {
          S.notes = prev.notes; S.rsongs = prev.rsongs; S.plan = prev.plan;
          if (prev.shows) S.shows = prev.shows;
          if (prev.folders) S.folders = prev.folders;
          if (prev.folderOrder) S.folderOrder = prev.folderOrder;
          if (prev.subs) S.subs = prev.subs;
          if (prev.subsMan) S.subsMan = prev.subsMan;
          if (prev.song) {                                  // 差し替えを元に戻す
            const k = S.songs.findIndex((x) => x.id === prev.song.id);
            if (k >= 0) S.songs[k] = prev.song;
          }
        }
        save(); schedulePush(); render();
      }
      break;
    case "jump": markRead(song()); U.picker = false; U.songIdx = i; render(); break;
    case "dupsong": dupSong(id); break;
    case "picksong": U.pick = U.pick.includes(id) ? U.pick.filter((x) => x !== id) : U.pick.concat(id); render(); break;
    case "pickall": {
      const cur2 = SONGS().map((x) => x.id);
      U.pick = U.pick.length === cur2.length ? [] : cur2;
      render(); break;
    }
    case "picktake": {
      const ids = U.pick.slice();
      if (!ids.length) break;
      if (confirm(`${ids.length}曲 のテイクを増やしますか？`)) {
        ids.forEach((sid) => dupSong(sid));
        U.pick = []; render();
      }
      break;
    }
    case "clearpicked": {
      const ids = U.pick.slice();
      const n = S.notes.filter((y) => ids.includes(y.songId) && y.showId === S.showId).length;
      if (n && confirm(`選んだ ${ids.length}曲 の記録 ${n}件 を消しますか？`)) {
        pushUndo();
        S.notes = S.notes.filter((y) => !(ids.includes(y.songId) && y.showId === S.showId));
        U.pick = []; save(); schedulePush(); render();
      } else if (!n) alert("選んだ曲に記録がありません。");
      break;
    }
    case "pickgroup":
      if (U.pick.length) { U.menu = { kind: "group", ids: U.pick.slice() }; renderSheet(); }
      break;
    case "delpicked": {
      const n = U.pick.length;
      if (n && confirm(`${n}曲 をこの公演から削除しますか？\n記録も一緒に消えます。`)) {
        const dels = S.songs.filter((x) => U.pick.includes(x.id));
        toTrash("song", dels.map((x) => songName(x)).join("、").slice(0, 40) + (dels.length > 1 ? ` ほか${dels.length}曲` : ""), dels);
        S.songs = S.songs.filter((x) => !U.pick.includes(x.id));
        U.pick = []; U.songIdx = 0; sweep(); save(); schedulePush(); render();
      }
      break;
    }
    case "sorttitle": sortSongsByTitle(); schedulePush(); render(); break;
    case "songmenu": U.menu = { kind: "song", id: SONGS()[i] ? SONGS()[i].id : "" }; renderSheet(); break;
    case "m-mark": {
      const ids = U.menu.ids || [U.menu.id];
      const anyOff = ids.some((sid) => !(S.songs.find((y) => y.id === sid) || {}).mark);
      ids.forEach((sid) => {
        const x = S.songs.find((y) => y.id === sid); if (!x) return;
        if (anyOff) x.mark = 1; else delete x.mark;
      });
      U.menu = null; save(); schedulePush(); renderSheet(); render();
      break;
    }
    case "markonly": U.markOnly = !U.markOnly; render(); break;
    case "m-rename": {
      const x = S.songs.find((y) => y.id === U.menu.id); U.menu = null;
      if (x) { const nm = prompt("曲名", x.title); if (nm && nm.trim()) { x.title = nm.trim(); save(); schedulePush(); } }
      render(); break;
    }
    case "m-take": { const q = U.menu.id; U.menu = null; dupSong(q); break; }
    case "m-takenum": {
      const x = S.songs.find((y) => y.id === U.menu.id); U.menu = null;
      if (x) {
        const v = prompt("テイク番号\n（1にすると「テイク◯」の表記が消えます）", String(x.take || 1));
        if (v != null) {
          const n = Math.max(1, Math.min(99, Math.round(Number(v)) || 1));
          x.take = n;
          orderTakes();
          save(); schedulePush();
        }
      }
      render(); break;
    }
    case "m-group": U.menu = { kind: "group", id: U.menu.id }; renderSheet(); break;
    case "m-chk": { const q = U.menu.id; U.menu = null; exportCheckXlsx(q); render(); break; }
    case "m-pdf": {
      const q = U.menu.id; U.menu = null;
      commitFields();
      U.printPick = [q];
      U.view = "print";
      render();
      autoPrint();
      break;
    }
    case "m-setgroup": {
      const ids = U.menu.ids || [U.menu.id];
      ids.forEach((sid) => { const x = S.songs.find((y) => y.id === sid); if (x) x.groupId = id; });
      if (U.menu.ids) U.pick = [];
      U.menu = null; save(); schedulePush(); render(); break;
    }
    case "m-clear": {
      const q = U.menu.id; U.menu = null;
      const n = S.notes.filter((y) => y.songId === q && y.showId === S.showId).length;
      if (n && confirm(`この曲の記録 ${n}件 を消しますか？`)) {
        pushUndo();
        S.notes = S.notes.filter((y) => !(y.songId === q && y.showId === S.showId));
        save(); schedulePush();
      }
      render(); break;
    }
    case "m-del": {
      const x = S.songs.find((y) => y.id === U.menu.id);
      U.menu = null;
      if (x && confirm(`「${songName(x)}」を削除しますか？\nゴミ箱から${TRASH_DAYS}日以内なら戻せます。`)) {
        toTrash("song", songName(x), [x]);
        S.songs = S.songs.filter((y) => y.id !== x.id);
        sweep(); save(); schedulePush();
      }
      render(); break;
    }
    case "dupshow": { U.picker = false; dupShow(S.showId); break; }
    case "metstart": metStart(); break;
    case "metstop": metStop(); break;
    case "mettap": metTap(); break;
    case "bpm": metSet(metBpm() + Number(id)); break;
    case "metsub": S.sub = Number(id); save(); render(); break;
    case "focus": U.focus = id; U.picker = false; render(); break;
    case "jumpshow": S.showId = (S.showId === id ? "" : id); U.songIdx = 0; save(); renderSheet(); render(); break;

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
    case "recprev": {
      const ks = recKeysOf(song());
      const cur = ks.indexOf(recKeyOf(song()));
      U.recPick = Math.max(0, cur - 1);
      if (AU) { AU.pause(); AU = null; auKey = ""; }
      render(); break;
    }
    case "recnext": {
      const ks = recKeysOf(song());
      const cur = ks.indexOf(recKeyOf(song()));
      U.recPick = Math.min(ks.length - 1, cur + 1);
      if (AU) { AU.pause(); AU = null; auKey = ""; }
      render(); break;
    }
    case "recstop": stopRec(); break;
    case "playfrom": { const n = NOTES().find((x) => x.id === id); if (n) openPlayer(n.at || 0); break; }
    case "playtop": openPlayer(0); break;
    case "pauseau": pauseAudio(); break;
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
    case "rangeoff": U.sheet.rangeLine = null; U.sheet.range = null; U.sheet.anchor = null; commitFields(); renderSheet(); break;
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
    case "pickfile": document.getElementById("file").click(); break;
    case "m-swap": {
      U.swapId = U.menu && U.menu.id;
      U.menu = null; renderSheet(); render();
      const el2 = document.getElementById("swapfile");
      if (el2) el2.click();
      break;
    }
    case "pdfpicked": {
      if (!U.pick.length) break;
      commitFields();
      U.printPick = U.pick.slice();
      U.view = "print";
      render();
      autoPrint();
      break;
    }
    case "goabsent": commitFields(); U.view = "absent"; render(); break;
    case "toggleabsent": {
      const sw = S.shows.find((x) => x.id === S.showId);
      if (!sw) break;
      sw.absent = (sw.absent || []).includes(id) ? sw.absent.filter((x) => x !== id) : (sw.absent || []).concat(id);
      rebuildSubs();
      save(); schedulePush(); render();
      break;
    }
    case "resetsubs":
      if (confirm("この公演の振り替えをすべてやり直しますか？")) {
        SONGS().forEach((so) => {
          delete S.subs[subKey(so.id)];
          delete S.subsMan[subKey(so.id)];
          delete S.subLib[libKey(so)];
        });
        libFrom = ""; autoSubs(); save(); render();
      }
      break;
    case "assignblock": {
      const el3 = e.target.closest("[data-b]");
      U.menu = { kind: "block", id, b: el3 ? el3.dataset.b : "" };
      renderSheet(); break;
    }
    case "setblock": {
      const so5 = S.songs.find((x) => x.id === U.menu.id);
      const b = U.menu.b, k = subKey(U.menu.id);
      const cur8 = blockParts(so5, b);
      S.gsubs[k] = S.gsubs[k] || {};
      S.gsubs[k][b] = cur8.includes(id) ? cur8.filter((x) => x !== id) : cur8.concat(id);
      save(); schedulePush(); renderSheet(); render();
      break;
    }
    case "assign": {
      const el2 = e.target.closest("[data-idx]");
      const list = el2 && el2.dataset.idx ? el2.dataset.idx.split(",").map(Number) : [i];
      U.menu = { kind: "assign", id, i, idx: list };
      renderSheet(); break;
    }
    case "unassign": {
      const sid = U.menu.id, list = U.menu.idx || [U.menu.i];
      const k = subKey(sid);
      if (S.subs[k]) list.forEach((li) => { delete S.subs[k][li]; });
      if (S.subsMan[k]) list.forEach((li) => { delete S.subsMan[k][li]; });
      U.menu = null; save(); schedulePush(); renderSheet(); render();
      break;
    }
    case "setassign": {
      const sid = U.menu.id, list = U.menu.idx || [U.menu.i];
      const k = subKey(sid);
      S.subs[k] = S.subs[k] || {};
      const cur6 = S.subs[k][list[0]] || [];
      const next = cur6.includes(id) ? cur6.filter((x) => x !== id) : cur6.concat(id);
      S.subsMan[k] = S.subsMan[k] || {};
      const so3 = S.songs.find((x) => x.id === sid);
      list.forEach((li) => {
        S.subs[k][li] = next.slice();
        S.subsMan[k][li] = 1;
        if (so3) rememberSub(so3, li, next);   // 次に同じ人が休んだ時のために覚える
      });
      save(); schedulePush(); renderSheet(); render();
      break;
    }
    case "xlsout": exportAbsentXlsx(id); break;
    case "xlsall": exportAllAbsentXlsx(); break;
    case "bootok": bootErr = ""; render(); break;
    case "endpv": endPreview(); break;
    case "takeother": takeOther(); break;
    case "keepmine": { otherAt = 0; S.bkSeen = Date.now(); doBackup(true); render(); break; }
    case "editlink": editLink(); break;
    case "pvnow": {
      const g = group(id) || group(S.groupId);
      if (!g || !g.src) { alert("先にこのグループの自動公開を始めてください。"); break; }
      startPreview(g.src, g.key || "");
      break;
    }
    case "synow": syncSetlist(true); break;
    case "pastelink": {
      // ホーム画面に追加すると、Safariで開いた時の接続情報が引き継がれない。
      // その場でリンクを貼って つなぎ直せるようにする。
      const t = prompt("配ってもらった接続リンクを貼ってください。", "");
      if (t == null) break;
      const m2 = /#g=([A-Za-z0-9\-_]+)/.exec(String(t));
      if (!m2) { alert("リンクの形が違います。\n「#g=」から始まる部分を含めて、全部貼ってください。"); break; }
      try {
        location.hash = "#g=" + m2[1];
        importFromLink();
      } catch (e) { alert("読み取れませんでした。"); }
      break;
    }
    case "askkey": {
      const pw = prompt("合言葉を入れてください。", S.key || "");
      if (pw != null) { S.key = pw.trim(); askedKey = false; save(); keepLinkInURL(); syncSetlist(true); }
      break;
    }
    case "gmenu": U.menu = { kind: "gmenu", id }; renderSheet(); break;
    case "gdel": {
      if (S.groups.length < 2) break;
      const g = group(id); if (!g) break;
      const songs = S.songs.filter((x) => x.groupId === id);
      const ids = songs.map((x) => x.id);
      const notes = S.notes.filter((n) => ids.includes(n.songId)).length;
      if (!confirm(`「${g.name}」を消します。\n\nこのグループの 曲${songs.length}件・記録${notes}件 も一緒に消えます。\n手書き・録音・総括も消えます。\n\n元に戻せません。よろしいですか？`)) break;
      if (songs.length && !confirm(`本当に消しますか？\n\n曲${songs.length}件が消えます。`)) break;
      S.songs = S.songs.filter((x) => x.groupId !== id);
      S.notes = S.notes.filter((n) => !ids.includes(n.songId));
      // その曲にぶら下がっていたものも片付ける（残すと保存領域を食う）
      ids.forEach((sid) => {
        Object.keys(S.memos || {}).forEach((k) => { if (k.split("|")[1] === sid) delete S.memos[k]; });
        Object.keys(S.draws || {}).forEach((k) => { if (k.split("|")[1] === sid) delete S.draws[k]; });
        Object.keys(S.recs || {}).forEach((k) => { if (k.split("|")[1] === sid) { delClip("rec:" + k); delete S.recs[k]; } });
        Object.keys(S.subs || {}).forEach((k) => { if (k.split("|")[1] === sid) delete S.subs[k]; });
        Object.keys(S.subsMan || {}).forEach((k) => { if (k.split("|")[1] === sid) delete S.subsMan[k]; });
        Object.keys(S.gsubs || {}).forEach((k) => { if (k.split("|")[1] === sid) delete S.gsubs[k]; });
        delClip("xls:" + sid);
      });
      S.groups = S.groups.filter((x) => x.id !== id);
      if (S.groupId === id) S.groupId = S.groups[0].id;
      if (S.showFilter === id) S.showFilter = "";
      U.menu = null;
      save(); schedulePush(); renderSheet(); render();
      break;
    }
    case "showpub": {
      const sw = S.shows.find((x) => x.id === id); if (!sw) break;
      if (!sw.nopub) {
        const n = S.songs.filter((x) => x.showId === id).length;
        if (!confirm(`「${sw.name}」を配信しないようにします。\n\nこの公演の 曲${n}件 と記録は、メンバーに見えなくなります。\n手元のデータは消えません。`)) break;
        sw.nopub = 1;
      } else delete sw.nopub;
      save(); schedulePush(); render();
      break;
    }
    case "nopubtoggle": {
      const g = group(id);
      if (!g) break;
      g.nopub = !g.nopub;
      if (g.nopub) { g.gistId = ""; g.lastKey = ""; }
      save(); U.menu = null; renderSheet(); render();
      break;
    }
    case "rtakeup": { const so = recSong(); if (so) { pushUndo(); so.take = Number(so.take || 1) + 1; save(); render(); } break; }
    case "rtakedn": { const so = recSong(); if (so) { pushUndo(); so.take = Math.max(1, Number(so.take || 1) - 1); save(); render(); } break; }
    case "nextunread": {
      const list = SONGS();
      for (let n2 = 1; n2 <= list.length; n2++) {
        const k2 = (U.songIdx + n2) % list.length;
        if (isUnread(list[k2])) { U.songIdx = k2; render(); return; }
      }
      break;
    }
    case "ptstart": startPitch(); break;
    case "ptstop": stopPitch(); break;
    case "ptreset": {
      PT.notes = []; PT.buf = null; PT.chunks = []; PT.hist = []; PT.sel = -1;
      if (PT.src) { try { PT.src.stop(); } catch (e) {} PT.src = null; }
      pitchFit(); render(); break;
    }
    case "ptzoom": {
      const k = Number(id) > 0 ? 1 / 1.6 : 1.6;
      const c = PV.x0 + PV.sec / 2, cm = (PV.lo + PV.hi) / 2;
      PV.sec = Math.max(0.3, Math.min(30, PV.sec * k));
      const span = Math.max(3, Math.min(48, (PV.hi - PV.lo) * k));
      PV.x0 = c - PV.sec / 2; PV.lo = cm - span / 2; PV.hi = cm + span / 2;
      drawPitch(); break;
    }
    case "ptfit": pitchFit(); drawPitch(); break;
    case "ptsplit": {
      const n2 = PT.notes[PT.sel];
      if (n2 && splitNote(PT.sel, (n2.t0 + n2.t1) / 2)) { drawPitch(); render(); }
      else alert("これ以上は切れません。");
      break;
    }
    case "ptjoin": { if (joinNote(PT.sel)) { drawPitch(); render(); } break; }
    case "ptflat": { const n2 = PT.notes[PT.sel]; if (n2) { ptPush(); n2.flat = !n2.flat; drawPitch(); render(); } break; }
    case "ptstep": { const n2 = PT.notes[PT.sel]; if (n2) { ptPush(); n2.shift += Number(id); drawPitch(); render(); } break; }
    case "ptundo": { ptPop(); drawPitch(); render(); break; }
    case "ptclear": { const n2 = PT.notes[PT.sel]; if (n2) { ptPush(); n2.shift = 0; n2.flat = false; drawPitch(); render(); } break; }
    case "ptplay": {
      if (PT.playing) { try { PT.src.stop(); } catch (e) {} PT.playing = false; render(); }
      else playPitch(null);
      break;
    }
    case "readall": {
      SONGS().forEach((x) => { S.seen = S.seen || {}; S.seen[seenKey(x)] = noteSig(x); });
      save(); U.picker = false; renderSheet(); render(); break;
    }
    case "sumopen": U.sumOpen = (U.sumOpen === id ? "" : id); render(); break;
    case "gotrash": U.menu = { kind: "trash" }; renderSheet(); break;
    case "trashback": { fromTrash(id); renderSheet(); render(); break; }
    case "trashdrop": {
      if (confirm("完全に消しますか？\nもう戻せません。")) { dropTrash(id); renderSheet(); render(); }
      break;
    }
    case "recon": {
      if (!S.recMode) {
        S.liveShow = S.showId;
        S.showId = REC_SHOW;
        if (!S.shows.some((x) => x.id === REC_SHOW)) S.shows.push({ id: REC_SHOW, name: "レコーディング", ts: 0, hidden: 1 });
        S.recMode = true;
      } else {
        S.recMode = false;
        S.showId = S.liveShow || (showsNewestFirst().find((x) => x.id !== REC_SHOW) || {}).id || "";
      }
      U.songIdx = 0; U.view = "setup"; save(); render();
      break;
    }
    case "recback": U.view = U.pdfBack || "live"; U.pdfBack = ""; render(); break;
    case "rbars": S.recBars = !S.recBars; save(); render(); break;
    case "rintro": {
      const so = recSong(); if (!so) break;
      pushUndo();
      so.intro = Math.max(0, Number(so.intro || 0) + Number(id));
      save(); renderSheet(); render(); break;
    }
    case "rbar": U.menu = { kind: "rbar", i }; renderSheet(); break;
    case "rbarset": {
      const so = recSong(); if (!so) break;
      const li = U.menu.i;
      const cur = barsOf(so)[li];
      pushUndo();
      so.lines[li].at = Math.max(1, cur + Number(id));
      save(); renderSheet(); render(); break;
    }
    case "rbarclear": {
      const so = recSong(); if (!so) break;
      pushUndo();
      delete so.lines[U.menu.i].at;
      save(); renderSheet(); render(); break;
    }
    case "rbarnum": {
      const so = recSong(); if (!so) break;
      const now = barsOf(so)[U.menu.i];
      const v0 = prompt("この行の小節番号", String(now == null ? "" : now));
      if (v0 == null) break;
      const v = Math.round(Number(String(v0).replace(/[^\d]/g, "")) || 0);
      if (v > 0) { pushUndo(); so.lines[U.menu.i].at = v; save(); renderSheet(); render(); }
      break;
    }
    case "rmore": U.rmore = !U.rmore; renderSheet(); break;
    case "rsecfree": {
      const so = recSong(); if (!so) break;
      const v = prompt("区切りの名前", (so.lines[U.menu.i] || {}).sec || "");
      if (v == null) break;
      pushUndo();
      const t = String(v).trim();
      if (t) { so.lines[U.menu.i].sec = t; rememberSec(t); } else delete so.lines[U.menu.i].sec;
      save(); U.menu = null; renderSheet(); render(); break;
    }
    case "rtagfree": {
      const so = recSong(); if (!so) break;
      const v = prompt("表記（ガヤ / フェイク など）", (so.lines[U.menu.i] || {}).tag || "");
      if (v == null) break;
      pushUndo();
      const t = String(v).trim();
      if (t) { so.lines[U.menu.i].tag = t; rememberTag(t); } else delete so.lines[U.menu.i].tag;
      save(); U.menu = null; renderSheet(); render(); break;
    }
    case "rwordedit": {
      U.wordEdit = U.wordEdit === id ? "" : id;
      renderSheet(); break;
    }
    case "rworddel": {
      const ps = String(id).split("|");
      const kind = ps.shift();
      const nm = ps.join("|");
      if (kind === "tag") {
        S.tagHide = (S.tagHide || []).concat(TAGDEF.indexOf(nm) >= 0 ? [nm] : []);
        S.tagWords = (S.tagWords || []).filter((x) => x !== nm);
      } else {
        S.secHide = (S.secHide || []).concat(SECDEF.indexOf(nm) >= 0 ? [nm] : []);
        S.secWords = (S.secWords || []).filter((x) => x !== nm);
      }
      save(); renderSheet(); break;
    }
    case "rwordback": {
      if (id === "tag") S.tagHide = []; else S.secHide = [];
      save(); renderSheet(); break;
    }
    case "raddline": {
      const so = recSong(); if (!so) break;
      pushUndo();
      so.lines.splice(U.menu.i + 1, 0, { t: id, add: 1, bars: 0, sec: id });
      rememberSec(id);
      save(); U.menu = null; renderSheet(); render(); break;
    }
    case "raddfree": {
      const so = recSong(); if (!so) break;
      const v = prompt("足す文字", "");
      if (v && v.trim()) { pushUndo(); so.lines.splice(U.menu.i + 1, 0, { t: v.trim(), add: 1, bars: 0, sec: v.trim() }); rememberSec(v.trim()); save(); U.menu = null; renderSheet(); render(); }
      break;
    }
    case "rdelline": {
      const so = recSong(); if (!so) break;
      pushUndo();
      so.lines.splice(U.menu.i, 1);
      save(); U.menu = null; renderSheet(); render(); break;
    }
    case "rskip": {
      const so = recSong(); if (!so) break;
      pushUndo();
      const l2 = so.lines[U.menu.i];
      if (l2.skip) delete l2.skip; else l2.skip = 1;
      save(); U.menu = null; renderSheet(); render(); break;
    }
    case "rvtn": {
      U.vtN = id === "sec" ? "sec" : Number(id) || 1;
      renderSheet(); break;
    }
    case "rvt": {
      const so = recSong(); if (!so) break;
      pushUndo();
      const ks = vtTargets(so, U.menu.i);
      // 同じ想定が並んでいるところをもう一度押したら外す。押し間違いを一手で戻せる。
      const off = !id || ks.every((k) => so.lines[k].vt === id
        && (k === ks[0] ? !!so.lines[k].vh : !so.lines[k].vh));
      ks.forEach((k, j) => {
        const l2 = so.lines[k];
        delete l2.solo; delete l2.vcut;
        if (off) { delete l2.vt; delete l2.vh; return; }
        l2.vt = id;
        if (j === 0) l2.vh = 1; else delete l2.vh;   // 選んだ回ごとに一つのまとまり
      });
      // すぐ下が同じ想定なら、そこも頭にしてつながらないようにする
      const nx = ks[ks.length - 1] + 1;
      if (!off && so.lines[nx] && !so.lines[nx].gap && vtOf(so.lines[nx]) === id) so.lines[nx].vh = 1;
      save(); U.menu = null; renderSheet(); render(); break;
    }
    case "rtagq": {
      const so = recSong(); if (!so) break;
      pushUndo();
      const l3 = so.lines[U.menu.i];
      if (l3.tag && tagBase(l3.tag) === tagBase(id)) delete l3.tag;
      else { l3.tag = tagBase(id) + nextTagNo(so, tagBase(id)); rememberTag(tagBase(id)); }
      save(); U.menu = null; renderSheet(); render(); break;
    }
    case "rsecq": {
      const so = recSong(); if (!so) break;
      pushUndo();
      const l4 = so.lines[U.menu.i];
      if (!id || l4.sec === id) delete l4.sec; else { l4.sec = id; rememberSec(id); }
      save(); U.menu = null; renderSheet(); render(); break;
    }
    case "rlen": {
      const so = recSong(); if (!so) break;
      pushUndo();
      const v = Number(id);
      // その行から下も同じ小節数にする（足した行は数えないので触らない）
      for (let k = U.menu.i; k < so.lines.length; k++) {
        const l3 = so.lines[k];
        if (l3.gap || l3.add) continue;
        l3.bars = v;
      }
      save(); U.menu = null; renderSheet(); render(); break;
    }
    case "rpdf": {
      if (id) {
        S.rsongId = id;
        const kp = SONGS().findIndex((x) => x.id === id);
        if (kp >= 0) U.songIdx = kp;
        save();
      }
      const so = recSong(); if (!so) break;
      U.pdfBack = U.view;
      U.view = "recprint"; render();
      break;
    }
    case "goplan": U.view = "recplan"; render(); break;
    case "psec": {
      const ps = String(id).split("|");
      const dv = Number(ps.pop());
      const nm = ps.join("|");                 // 区切り名に | が入っていても壊さない
      const t = planSlot(); if (!t) break;
      pushUndo();
      const cur = sectionsOf(t).find((x) => x.name === nm);
      const v = Math.max(1, (cur ? cur.min : 5) + dv);
      secApply(t, (sl) => { sl.sec = sl.sec || {}; sl.sec[nm] = v; });
      save(); render(); break;
    }
    case "psecnum": {
      const t = planSlot(); if (!t) break;
      const nm = String(id);
      const cur = sectionsOf(t).find((x) => x.name === nm);
      const v0 = prompt(`「${nm}」に何分あてますか`, String(cur ? cur.min : 5));
      if (v0 == null) break;
      const v = Math.max(1, Math.round(Number(String(v0).replace(/[^\d.]/g, "")) || 0));
      if (!v) break;
      pushUndo();
      secApply(t, (sl) => { sl.sec = sl.sec || {}; sl.sec[nm] = v; });
      save(); render(); break;
    }
    case "psecord": U.secOrd = !U.secOrd; render(); break;
    case "psecord0": {
      const so = recSong(); if (!so) break;
      pushUndo();
      delete so.secOrder;
      save(); render(); break;
    }
    case "psecall": {
      U.planSec = id || "";
      S.secAll = !S.secAll;
      save(); render(); break;
    }
    case "psecgo": {
      // 人名を押したら、その人の歌詞画面へ行く。テイクは自分で選ぶ。
      const sl = (S.plan.slots || []).find((x) => x.id === id);
      if (sl) { S.planFocus = sl.id; U.view = "live"; save(); render(); }
      break;
    }
    case "psecopen": {
      U.planSec = U.planSec === id ? "" : id;
      render(); break;
    }
    case "pseccopy": {
      const t = planSlot(); if (!t) break;
      const others = (S.plan.slots || []).filter((sl) => sl !== t && sl.kind !== "break");
      if (!others.length) { alert("ほかに配れる枠がありません。"); break; }
      if (!confirm(`この配分を ほかの${others.length}人にも同じにします。\nそれぞれの手直しは上書きされます。`)) break;
      pushUndo();
      const sec = JSON.parse(JSON.stringify(t.sec || {}));
      const skip = JSON.parse(JSON.stringify(t.skip || {}));
      others.forEach((sl) => { sl.sec = JSON.parse(JSON.stringify(sec)); sl.skip = JSON.parse(JSON.stringify(skip)); });
      save(); render(); break;
    }
    case "takeup": {
      const live = planRows().find((r) => r.live);
      if (!live || !live.s.secCur) break;
      live.s.takes = live.s.takes || {};
      live.s.takes[live.s.secCur] = takeNo(live.s) + 1;
      save(); render(); break;
    }
    case "takedown": {
      const live = planRows().find((r) => r.live);
      if (!live || !live.s.secCur) break;
      const n = takeNo(live.s);
      if (n <= 1) break;
      live.s.takes = live.s.takes || {};
      live.s.takes[live.s.secCur] = n - 1;
      save(); render(); break;
    }
    case "pskip": {
      const t = planSlot(); if (!t) break;
      const nm = String(id);
      const off = !!(t.skip || {})[nm];
      pushUndo();
      secApply(t, (sl) => {
        sl.skip = sl.skip || {};
        if (off) delete sl.skip[nm];
        else {
          sl.skip[nm] = 1;
          if (sl.sec) delete sl.sec[nm];            // 手で決めた分数は捨てる
          // 録らない区切りを開いていたら、次の録る区切りへ移る
          if (sl.secCur === nm) {
            const ns2 = sectionsOf(sl).filter((x) => !x.prep && !x.skip && !x.done);
            sl.secCur = ns2.length ? ns2[0].name : "";
          }
        }
      });
      save(); render(); break;
    }
    case "prebal": {
      const rows = planRows();
      if (!rows.length) break;
      const end = rows[rows.length - 1].pE;          // もともとの終わり
      const now = nowMin();
      const left = rows.filter((r) => !r.done);
      if (!left.length) break;
      const avail = end - now;
      if (avail < left.length) { alert("残り時間が足りません。終わりの時刻を延ばしてください。"); break; }
      const share = Math.floor(avail / left.length);
      if (!confirm(`残り ${avail}分 を ${left.length}人で割り直します。\n1人あたり およそ ${share}分 になります。`)) break;
      pushUndo();
      left.forEach((r, i) => {
        if (r.live) r.s.min = Math.max(1, (now - r.aS) + share);   // 今の人は「ここから share 分」
        else r.s.min = share;
        delete r.s.sec;                                            // 区切りの配分は割り直す
      });
      save(); render(); break;
    }
    case "psecbars": {
      const t = planSlot(); if (!t) break;
      pushUndo();
      secApply(t, (sl) => {
        const v = secSplitByBars(sl);
        sl.sec = sl.sec || {};
        Object.keys(v).forEach((k) => { sl.sec[k] = v[k]; });
      });
      save(); render(); break;
    }
    case "pseceven": {
      const t = planSlot(); if (!t) break;
      pushUndo();
      secApply(t, (sl) => { delete sl.sec; });   // 手で決めた分数だけ捨てる（録らない指定はそのまま）
      save(); render(); break;
    }
    case "pnextsec": {
      const live = planRows().find((r) => r.live);
      if (!live) break;
      pushUndo();
      const ss = sectionsOf(live.s);
      // 今の区切りを「録り終わった」ことにして、実際にかかった分を残す
      if (live.s.secCur) {
        const used = live.s.secStart ? Math.max(1, Math.round((Date.now() - live.s.secStart) / 60000)) : 0;
        live.s.secLog = live.s.secLog || {};
        live.s.secLog[live.s.secCur] = used;
      }
      // 録らない区切りは飛ばす
      const nx = ss.find((x) => !x.done && !x.skip && x.name !== live.s.secCur);
      if (nx) {
        live.s.secCur = nx.name;
        live.s.secStart = Date.now();
        U.secView = nx.name;
        save(); render();
        setTimeout(() => {
          const el = document.getElementById("sec-" + nx.name);
          if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
        }, 0);
        break;
      }
      // 全部終わったら、その人を終えて次の人へ
      live.s.a1 = nowMin();
      delete live.s.secCur;
      const i3 = S.plan.slots.findIndex((x) => x.id === live.s.id);
      const nn = S.plan.slots[i3 + 1];
      if (nn && nn.a0 == null) {
        nn.a0 = live.s.a1; nn.startAt = Date.now(); nn.secStart = Date.now();
        // 準備があれば準備から始める
        const ss0 = sectionsOf(nn);
        const first = (ss0.find((x) => x.prep) || ss0.find((x) => !x.skip) || ss0[0] || {}).name;
        if (first) nn.secCur = first;
      }
      save(); render(); break;
    }
    case "psetstart": {
      const el = document.getElementById("pstarttime");
      if (el && el.value.trim()) { S.plan.start = min2hm(hm2min(el.value)); save(); render(); }
      break;
    }
    case "pastesched": U.menu = { kind: "sched" }; renderSheet(); break;
    case "planday": U.planDay = id || ""; render(); break;
    case "autotoggle": {
      S.planAuto = !S.planAuto;
      autoMsg = "";
      save(); render(); break;
    }
    case "pcancel": {
      // いま動いている枠を、始める前の状態に戻す
      const s2 = S.plan.slots.find((x) => x.id === id);
      if (!s2) break;
      if (!confirm(`「${s2.name}」を取り消して、始める前に戻します。\n\n記録した指摘や手書きは残ります。`)) break;
      pushUndo();
      delete s2.a0; delete s2.a1; delete s2.startAt; delete s2.secStart;
      s2.secLog = {}; s2.takes = {}; s2.secCur = "";
      autoMsg = "";
      save(); render(); break;
    }
    case "pretry": {
      // いまの枠を、いまからやり直す
      const s2 = S.plan.slots.find((x) => x.id === id);
      if (!s2) break;
      if (!confirm(`「${s2.name}」をいまからやり直します。\n\n経過した時間と区切りの記録は消えます。\n指摘や手書きは残ります。`)) break;
      pushUndo();
      startSlot(s2);
      autoMsg = "";
      save(); render(); break;
    }
    case "schedgo": {
      const el6 = document.getElementById("schedtx");
      const t = el6 ? String(el6.value || "") : "";
      if (!t.trim()) { alert("予定表を貼ってください。"); break; }
      U.menu = null; renderSheet();
      applySchedule(t);
      break;
    }
    case "padd": {
      const n = document.getElementById("pname"), m = document.getElementById("pmin");
      const nm = n && n.value.trim();
      const mi = m && Number(m.value);
      if (!nm) break;
      S.plan.slots.push({ id: uid(), name: nm, min: mi > 0 ? Math.round(mi) : (S.planMin || 90), kind: "member" });
      if (n) n.value = "";
      save(); render(); break;
    }
    case "prosternew": {
      const gn = prompt("グループ名", "");
      if (!gn || !gn.trim()) break;
      const v0 = prompt(gn.trim() + " のメンバー（、で区切る）", "");
      if (v0 == null) break;
      const arr0 = v0.split(/[、,・\s]+/).map((x) => x.trim()).filter(Boolean);
      if (arr0.length) { S.rosters[gn.trim()] = arr0; save(); render(); }
      break;
    }
    case "proster": {
      const cur = (S.rosters[id] || []).join("、");
      const v = prompt(id + " のメンバー（、で区切る／空にすると消えます）", cur);
      if (v != null) {
        const arr = v.split(/[、,・\s]+/).map((x) => x.trim()).filter(Boolean);
        if (arr.length) S.rosters[id] = arr; else delete S.rosters[id];
        save(); render();
      }
      break;
    }
    case "paddm": {
      S.plan.slots.push({ id: uid(), name: id, min: S.planMin || 90, kind: "member" });
      save(); render(); break;
    }
    case "psetprep": {
      S.planPrep = Math.max(0, Number(S.planPrep || 0) + Number(id));
      save(); render(); break;
    }
    case "psetdef": {
      const v = Number(id);
      S.planMin = Math.max(5, (S.planMin || 90) + v);
      save(); render(); break;
    }
    case "pbreak":
      S.plan.slots.push({ id: uid(), name: "休憩", min: 30, kind: "break" });
      save(); render(); break;
    case "pstart": {
      const s2 = S.plan.slots.find((x) => x.id === id);
      if (s2) { startSlot(s2); save(); render(); }
      break;
    }
    case "jumpsec": {
      U.secView = U.secView === id ? "" : id;
      const live = planRows().find((r) => r.live);
      if (live) {
        pushUndo();
        live.s.secCur = id;
        live.s.secStart = Date.now();
        save();
      }
      render();
      setTimeout(() => {
        const el = document.getElementById("sec-" + id);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
      }, 0);
      break;
    }
    case "pnext": {
      const i2 = S.plan.slots.findIndex((x) => x.id === id);
      const s2 = S.plan.slots[i2];
      if (s2) {
        s2.a1 = nowMin();
        const nx = S.plan.slots[i2 + 1];
        if (nx && nx.a0 == null) nx.a0 = s2.a1;
        save(); render();
      }
      break;
    }
    case "pundo": {
      const i2 = S.plan.slots.findIndex((x) => x.id === id);
      const s2 = S.plan.slots[i2];
      if (s2) {
        delete s2.a1;
        const nx = S.plan.slots[i2 + 1];
        if (nx) { delete nx.a0; delete nx.a1; }
        save(); render();
      }
      break;
    }
    case "pedit": {
      const _sl = (S.plan.slots || []).find((x) => x.id === id);
      if (_sl && _sl.kind !== "break") { S.planFocus = _sl.id; U.view = "live"; save(); render(); break; }
    }
    case "peditbreak": U.menu = { kind: "pedit", id }; renderSheet(); break;
    case "pset": {
      const s2 = S.plan.slots.find((x) => x.id === U.menu.id);
      if (s2) { s2.min = Math.max(1, Number(s2.min || 0) + Number(id)); save(); renderSheet(); render(); }
      break;
    }
    case "psetv": {
      const s2 = S.plan.slots.find((x) => x.id === U.menu.id);
      const el = document.getElementById("pminv"), en = document.getElementById("pnamev");
      if (s2) {
        if (el && Number(el.value) > 0) s2.min = Math.round(Number(el.value));
        if (en && en.value.trim()) s2.name = en.value.trim();
        save(); U.menu = null; renderSheet(); render();
      }
      break;
    }
    case "pdel": {
      S.plan.slots = S.plan.slots.filter((x) => x.id !== U.menu.id);
      U.menu = null; save(); renderSheet(); render(); break;
    }
    case "rlist": U.menu = { kind: "rlist" }; renderSheet(); break;
    case "ruse": {
      S.rsongId = id;
      const k = SONGS().findIndex((x) => x.id === id);
      if (k >= 0) U.songIdx = k;
      U.menu = null; save(); U.view = "live"; render();
      break;
    }
    case "rfolder": S.rfolders[id] = !(S.rfolders[id] === true); save(); render(); break;
    case "rfset": {
      const so = S.rsongs.find((x) => x.id === id);
      if (!so) break;
      const nm = prompt("フォルダ名（空にすると外に出ます）", so.folder || "");
      if (nm != null) { pushUndo(); so.folder = nm.trim(); save(); render(); }
      break;
    }
    case "rfrename": {
      const nm = prompt("フォルダの名前", id);
      if (nm == null) break;
      const v = nm.trim();
      pushUndo();
      S.rsongs.forEach((x) => { if (folderOf(x) === id) x.folder = v; });
      S.rfolderOrder = (S.rfolderOrder || []).map((x) => (x === id ? v : x)).filter(Boolean);
      if (S.rfolders[id] != null) { S.rfolders[v] = S.rfolders[id]; delete S.rfolders[id]; }
      save(); render(); break;
    }
    case "rfup": case "rfdown": {
      const names = groupRSongs(S.rsongs).map(([k]) => k).filter(Boolean);
      let ord = (S.rfolderOrder || []).filter((x) => names.includes(x));
      names.forEach((x) => { if (!ord.includes(x)) ord.push(x); });
      const i2 = ord.indexOf(id);
      const j2 = a === "rfup" ? i2 - 1 : i2 + 1;
      if (i2 < 0 || j2 < 0 || j2 >= ord.length) break;
      ord.splice(j2, 0, ord.splice(i2, 1)[0]);
      S.rfolderOrder = ord;
      save(); render(); break;
    }
    case "rdel": {
      if (confirm(`この曲を消しますか？\nゴミ箱から${TRASH_DAYS}日以内なら戻せます。`)) {
        const rs = S.rsongs.find((x) => x.id === id);
        if (rs) toTrash("rec", rs.title, [rs]);
        S.rsongs = S.rsongs.filter((x) => x.id !== id);
        if (S.rsongId === id) S.rsongId = (S.rsongs[0] || {}).id || "";
        save(); renderSheet(); render();
      }
      break;
    }
    case "rpick": {
      recFileInput().click();
      break;
    }
    case "gopdf": commitFields(); U.picker = false; U.printPick = null; U.view = "print"; render(); autoPrint(); break;
    case "doprint": window.print(); break;
    case "ghstart": gistStart(id); break;
    case "ghpush": doPush("force"); break;
    case "ghverify": verifyToken(); break;
    case "bknow": doBackup(false); break;
    case "bkfile": backupToFile(); break;
    case "bkrestore": restoreBackup(); break;
    case "bkfind": findBackup(); break;
    case "bkpick": pickTarget(); break;
    case "syncnow": syncNow(); break;
    case "bkfromid": restoreFromId(); break;
    case "bkfrompub": recoverFromDelivery(); break;
    case "alertok": {
      const a = S.pubAlert;
      if (a && a.id) { S.alertSeen = a.id; save(); }
      render(); break;
    }
    case "alertsend": {
      const el4 = document.getElementById("alerttx");
      const tx = el4 ? String(el4.value || "").trim() : "";
      if (!tx) { alert("メッセージを入れてください。"); break; }
      const gg = group();
      if (!gg || !gg.gistId || gg.nopub) { alert("いま選んでいるグループは配信していません。"); break; }
      if (!confirm(`${gg.name} のメンバーの画面に、この内容を全画面で出します。\n\n${tx}\n\n送りますか？`)) break;
      S.alertMsg = { id: uid(), text: tx, at: Date.now(), to: [gg.id] };
      if (el4) el4.value = "";
      save(); render();
      // 送れたかどうかをその場で伝える（黙って失敗すると気づけない）
      pushOne(gg.id).then(() => {
        alert(/公開済/.test(pushState)
          ? `${gg.name} に出しました。\n${pushState}\n\nアプリを開いているメンバーの画面に、数秒〜10秒ほどで出ます。`
          : `出せていません。\n${pushState || "通信できませんでした"}\n\n設定の「今すぐ送信」を試してください。`);
        render();
      });
      break;
    }
    case "alertclear": {
      if (!S.alertMsg) break;
      if (!confirm("お知らせを取り下げます。\nまだ見ていない人には出なくなります。")) break;
      const gone2 = (S.alertMsg.to || [])[0];
      S.alertMsg = null;
      save(); render();
      pushOne(gone2).then(() => {
        alert(/公開済/.test(pushState) ? "取り下げました。" : `取り下げを送れていません。\n${pushState || "通信できませんでした"}`);
        render();
      });
      break;
    }
    case "gostorage": commitFields(); U.view = "setup"; U.focus = "storage"; render(); break;
    case "shrinknow": {
      // 古い公演から順に消して、保存が通るまで小さくする。
      // いま開いている公演と、いちばん新しい公演は残す。
      const keep = [S.showId];
      const order = showsNewestFirst().filter((x) => !x.hidden);
      if (order[0]) keep.push(order[0].id);
      const drop = order.slice().reverse().filter((x) => !keep.includes(x.id));
      if (!drop.length) { alert("消せる古い公演がありません。\nグループを消すか、録音を消してください。"); break; }
      const names = drop.map((x) => x.name).join("、");
      if (!confirm(`古い公演から順に消して、保存できるようにします。\n\n対象（古い順）：\n${names}\n\n必要な分だけ消します。消した公演の曲・記録は戻せません。\n（配信データには残るので、あとから取り戻せます）\n\n進めますか？`)) break;
      let gone = 0;
      for (const sw of drop) {
        const ids = S.songs.filter((x) => x.showId === sw.id).map((x) => x.id);
        S.songs = S.songs.filter((x) => x.showId !== sw.id);
        S.notes = S.notes.filter((n) => n.showId !== sw.id && !ids.includes(n.songId));
        [S.memos, S.draws, S.recs, S.subs, S.subsMan, S.gsubs].forEach((m) => {
          Object.keys(m || {}).forEach((k) => { if (k.split("|")[0] === sw.id) delete m[k]; });
        });
        ids.forEach((sid) => { delClip("xls:" + sid); });
        S.shows = S.shows.filter((x) => x.id !== sw.id);
        gone++;
        save();
        if (!saveErr) break;
      }
      save();
      alert(saveErr
        ? `公演を${gone}件消しましたが、まだ保存できません。\nグループや録音も消してください。`
        : `公演を${gone}件消して、保存できるようになりました。`);
      render();
      break;
    }
    case "strayuse": {
      let o = null;
      try { o = unpackState(JSON.parse(localStorage.getItem(id) || "")); } catch (e) { alert("読み取れませんでした。"); break; }
      if (!o) { alert("読み取れませんでした。"); break; }
      if (!confirm(`この取り残しに戻します。\n公演${(o.shows || []).length}件・曲${(o.songs || []).length}件・記録${(o.notes || []).length}件\n\n今の内容は置き換わります。よろしいですか？`)) break;
      const tk = S.ghToken, bk = S.bkGistId, bkk = S.bkKey;
      Object.keys(S).forEach((k) => { delete S[k]; });
      Object.assign(S, o);
      S.ghToken = tk || S.ghToken; if (bk) S.bkGistId = bk; if (bkk) S.bkKey = bkk;
      S.bkSeen = Date.now(); S.bkAt = S.bkSeen; S.bkHash = bkSignature();
      otherAt = 0;
      save();
      alert("戻しました。");
      location.reload();
      break;
    }
    case "straydel": {
      if (!confirm("この取り残しを消します。元に戻せません。よろしいですか？")) break;
      try { localStorage.removeItem(id); } catch (e) { /* 消せなくても続ける */ }
      save(); render();
      break;
    }
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
    case "setkey": {
      const g = group(id);
      const el = document.getElementById("key-" + id);
      if (!el) break;
      const v = el.value.trim();
      if (v === (g.key || "")) break;
      g.key = v;
      save();
      doPush(false);
      alert(v ? `合言葉を「${v}」にしました。\nメンバーには、リンクとは別にこの合言葉を伝えてください。\n既に開いている人も、次に開いた時に入力を求められます。`
              : "合言葉を外しました。リンクを知っていれば誰でも開けます。");
      render();
      break;
    }
    case "frename": {
      const nm = prompt("フォルダの名前", id);
      if (nm == null) break;
      const v = nm.trim();
      pushUndo();
      S.shows.forEach((sw) => { if (folderOf(sw) === id) sw.folder = v; });
      S.folderOrder = (S.folderOrder || []).map((x) => (x === id ? v : x)).filter(Boolean);
      if (S.folders[id] != null) { S.folders[v] = S.folders[id]; delete S.folders[id]; }
      save(); render(); break;
    }
    case "fup": case "fdown": {
      const names = groupShows(S.shows.filter((x) => !x.hidden)).map(([k]) => k).filter(Boolean);
      let ord = (S.folderOrder || []).filter((x) => names.includes(x));
      names.forEach((x) => { if (!ord.includes(x)) ord.push(x); });   // まだ並べていないものを今の順で足す
      const i2 = ord.indexOf(id);
      const j2 = a === "fup" ? i2 - 1 : i2 + 1;
      if (i2 < 0 || j2 < 0 || j2 >= ord.length) break;
      ord.splice(j2, 0, ord.splice(i2, 1)[0]);
      S.folderOrder = ord;
      save(); render(); break;
    }
    case "folder": S.folders[id] = !(S.folders[id] === true); save(); render(); break;
    case "showfilter": {
      S.showFilter = id;
      // 絞り込みの対象外の公演を開いていたら、対象の中で一番新しいものに移る
      if (id) {
        const ok = (sw) => !S.songs.some((x) => x.showId === sw.id)
          || S.songs.some((x) => x.showId === sw.id && x.groupId === id);
        const cur2 = S.shows.find((x) => x.id === S.showId);
        if (cur2 && !ok(cur2)) {
          const next = showsNewestFirst().find(ok);
          if (next) { S.showId = next.id; U.songIdx = 0; }
        }
      }
      save(); render(); if (U.picker) renderSheet();
      break;
    }
    case "allshowlist": U.allShowList = !U.allShowList; render(); break;
    case "addgroup": {
      const el = document.getElementById("newgroup");
      const nm = el && el.value.trim();
      if (nm) {
        const ngid = uid();
        S.groups.push({ id: ngid, name: nm, gistId: "", src: "", key: "", keyInLink: true });
        S.groupId = ngid; save(); render();
      }
      break;
    }
    case "addnopub": {
      if (S.groups.some((g) => g.nopub)) break;
      const ngid = uid();
      S.groups.push({ id: ngid, name: "配信しない", gistId: "", src: "", key: "", keyInLink: true, nopub: true });
      S.groupId = ngid; save(); render();
      break;
    }
    case "usegroup": S.groupId = id; save(); render(); break;
    case "renamegroup": {
      const g = group(id);
      const nm = prompt("グループ名", g.name);
      if (nm != null && nm.trim()) { g.name = nm.trim(); save(); render(); }
      break;
    }
    case "addshow": {
      const el = document.getElementById("newshow");
      const nm = el && el.value.trim();
      if (nm) { const nid = uid(); S.shows.push({ id: nid, name: nm, ts: Date.now() }); S.showId = nid; U.songIdx = 0; save(); render(); }
      break;
    }
    case "useshow": {
      const off = S.showId === id;
      S.showId = off ? "" : id;
      U.songIdx = 0; save();
      if (!off) U.view = "live";
      render(); break;
    }
    case "copyshow": { dupShow(id); break; }
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
      if (confirm(`「${sw.name}」を削除しますか？\nこの公演の ${scnt}曲 と 記録 ${cnt}件 が消えます。\nゴミ箱から${TRASH_DAYS}日以内なら戻せます。`)) {
        const sw2 = S.shows.find((x) => x.id === id);
        toTrash("show", (sw2 || {}).name || "公演", S.songs.filter((x) => x.showId === id), sw2 ? [sw2] : []);
        S.songs = S.songs.filter((x) => x.showId !== id);
        S.shows = S.shows.filter((x) => x.id !== id);
        sweep();
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
// 入力欄から離れたら、待たせていた画面の組み直しをやる
document.addEventListener("focusout", () => {
  setTimeout(() => { if (pendingRender && !typingNow()) render(); }, 0);
});

document.addEventListener("change", (e) => {
  if (e.target.id === "file") {
    // 一覧を控えてから空にする。同じファイルをもう一度選んでも読み込めるように。
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length) handleFiles(picked);
  }
  if (e.target.id === "recfile") {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length) loadRecDocs(picked);
  }
  if (e.target.id === "swapfile") {
    const one = (e.target.files || [])[0];
    e.target.value = "";
    const sid = U.swapId; U.swapId = "";
    if (one && sid) swapSong(sid, one);
  }
  if (e.target.id === "songmemo") commitFields();
});

// 総括は打ちながら確定する。入力欄から離れるまで送られないと、
// メンバー側に出るまでが遅くなるため。
let memoTimer = null;
document.addEventListener("input", (e) => {
  if (e.target.id !== "songmemo") return;
  clearTimeout(memoTimer);
  memoTimer = setTimeout(() => commitFields(), 600);
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
      id: uid(), songId: s.id,
      lineIdx: sh.range && sh.rangeLine != null ? sh.rangeLine : sh.lineIdx,
      memberIds: sh.sel, tags: sh.tags,
      memo: memo.trim(), pitch: sh.seq && sh.seq.length ? sh.seq.join("-") : null,
      lineEnd: sh.range ? null : (sh.lineEnd || null),   // 文字を選んだ時はその行だけ
      from: sh.range ? sh.range[0] : null, to: sh.range ? sh.range[1] : null,
      at: recAt(),
      tk: takeCtx() || undefined,
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
  S.shows.push({ id: nid, name: nm.trim(), ts: Date.now(), from: fromId, folder: folderOf(sw),
    nopub: sw && sw.nopub ? 1 : undefined });
  S.songs.filter((x) => x.showId === fromId).forEach((x) => {
    // 名簿・ブロック（A/B）・テイク・取り込み日まで引き継ぐ。
    // ここが抜けていると、複製した公演でブロックの行の担当が空になり、
    // 欠席の代役も組めず、いつ取り込んだ歌割かも分からなくなる。
    const blocks = {};
    Object.keys(x.blocks || {}).forEach((b) => { blocks[b] = (x.blocks[b] || []).slice(); });
    S.songs.push({
      id: uid(), showId: nid, groupId: x.groupId, title: x.title, credit: x.credit,
      lines: x.lines.map((l) => Object.assign({}, l, { parts: (l.parts || []).slice() })),
      roster: (x.roster || []).slice(), blocks,
      blockCells: x.blockCells, blockRows: x.blockRows, sheetName: x.sheetName,
      micSheet: x.micSheet, micMap: x.micMap,
      take: x.take || 1, sig: x.sig, cols: x.cols,
      impAt: impOf(x),
    });
  });
  S.showId = nid; U.songIdx = 0; U.picker = false;
  autoSubs();
  save(); schedulePush(); render();
}

// なぞっただけで残す印。中身は空で、色と場所だけ。
// 同じところをもう一度なぞれば消える（中身のある指摘は消さない）。
function quickMark(lineIdx, range) {
  const s = song(); if (!s) return;
  const a = range ? range[0] : null, b = range ? range[1] : null;
  const plain = (n) => !n.tags.length && !String(n.memo || "").trim() && !n.pitch;
  const same = NOTES().filter((n) => n.songId === s.id && n.showId === S.showId
    && n.lineIdx === lineIdx && inTake(n) && plain(n)
    && (a == null ? n.from == null : (n.from != null && n.from <= b && n.to >= a)));
  pushUndo();
  if (same.length) {
    const ids = same.map((n) => n.id);
    S.notes = S.notes.filter((n) => !ids.includes(n.id));
  } else {
    S.notes.push({
      id: uid(), songId: s.id, lineIdx,
      memberIds: partsOf(s, lineIdx).slice(), tags: [], memo: "", pitch: null,
      lineEnd: null, from: a, to: b,
      at: recAt(), tk: takeCtx() || undefined,
      showId: S.showId, ts: Date.now(),
    });
  }
  save(); schedulePush(); render();
}

function openSheet(lineIdx, range, lineEnd) {
  if (VIEW()) return;
  const s = song(); if (!s) return;
  const l = s.lines[lineIdx];
  // 誰が歌う行かは歌割から自明なので、その行の担当をそのまま記録に入れる
  U.sheet = { lineIdx, lineEnd: (lineEnd != null && lineEnd > lineIdx) ? lineEnd : null,
    range: range || null, anchor: null, tags: [], memo: "", seq: [], rec: false,
    sel: partsOf(s, lineIdx).slice() };
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

/* ---- 公演をつまんでフォルダにまとめる ---- */
let sdrag = null;
const clearDrop = () => app.querySelectorAll("[data-drop]").forEach((x) => { x.style.boxShadow = ""; });

document.addEventListener("pointerdown", (e) => {
  const g = e.target.closest && e.target.closest("[data-drag]");
  if (!g) return;
  e.preventDefault();
  sdrag = { id: g.dataset.drag, y: e.clientY, moved: false, el: g.closest("[data-drop]") };
  if (sdrag.el) sdrag.el.style.opacity = "0.5";
}, { passive: false });

document.addEventListener("pointermove", (e) => {
  if (!sdrag) return;
  e.preventDefault();
  if (Math.abs(e.clientY - sdrag.y) > 5) sdrag.moved = true;
  clearDrop();
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const tgt = el && el.closest && el.closest("[data-drop]");
  if (tgt && tgt !== sdrag.el) tgt.style.boxShadow = "inset 0 0 0 2px var(--accent)";
}, { passive: false });

document.addEventListener("pointerup", (e) => {
  const d = sdrag; sdrag = null;
  clearDrop();
  if (!d) return;
  if (d.el) d.el.style.opacity = "";
  if (!d.moved) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const tgt = el && el.closest && el.closest("[data-drop]");
  if (!tgt || tgt === d.el) return;
  onDrop(d.id, tgt.dataset.drop);
});

function onDrop(from, target) {
  if (!from || !target) return;
  if (from.slice(0, 4) === "rec:" && target.slice(0, 2) === "r:") {
    const a = S.rsongs.findIndex((x) => x.id === from.slice(4));
    const b = S.rsongs.findIndex((x) => x.id === target.slice(2));
    if (a < 0 || b < 0 || a === b) return;
    const me = S.rsongs[a], other = S.rsongs[b];
    if (folderOf(me) !== folderOf(other)) {
      // 別のフォルダの曲に重ねたら、そちらへ移す
      pushUndo();
      me.folder = other.folder || "";
      save(); render();
      return;
    }
    S.rsongs.splice(b, 0, S.rsongs.splice(a, 1)[0]);
    save(); render();
    return;
  }
  if (from.slice(0, 4) === "sec:" && target.slice(0, 3) === "sc:") {
    const so = recSong(); if (!so) return;
    const ord = sectionOrder().slice();
    const a = ord.indexOf(from.slice(4)), b = ord.indexOf(target.slice(3));
    if (a < 0 || b < 0 || a === b) return;
    pushUndo();
    ord.splice(b, 0, ord.splice(a, 1)[0]);
    so.secOrder = ord;
    save(); render();
    return;
  }
  if (from.slice(0, 5) === "plan:" && target.slice(0, 2) === "p:") {
    const a = S.plan.slots.findIndex((x) => x.id === from.slice(5));
    const b = S.plan.slots.findIndex((x) => x.id === target.slice(2));
    if (a < 0 || b < 0 || a === b) return;
    S.plan.slots.splice(b, 0, S.plan.slots.splice(a, 1)[0]);
    save(); render();
    return;
  }
  if (from.slice(0, 4) === "rec:" && target.slice(0, 3) === "rf:") {
    // レコーディングの曲をフォルダに入れる
    const so = S.rsongs.find((x) => x.id === from.slice(4));
    if (so) { pushUndo(); so.folder = target.slice(3); save(); render(); }
    return;
  }
  if (from.slice(0, 5) === "song:" && target.slice(0, 2) === "g:") return moveSong(from.slice(5), target.slice(2));
  if (from.slice(0, 5) === "show:") return dropShow(from.slice(5), target);
}
// 曲を別の曲の位置へ移す
function moveSong(id, toId) {
  if (id === toId) return;
  const cur = SONGS();
  const a = cur.findIndex((x) => x.id === id), b = cur.findIndex((x) => x.id === toId);
  if (a < 0 || b < 0) return;
  const order = cur.slice();
  order.splice(b, 0, order.splice(a, 1)[0]);
  const slots = cur.map((x) => S.songs.indexOf(x)).sort((p, q) => p - q);
  slots.forEach((pos, i) => { S.songs[pos] = order[i]; });
  save(); schedulePush(); render();
}

function dropShow(id, target) {
  const sw = S.shows.find((x) => x.id === id);
  if (!sw || !target) return;
  if (target.slice(0, 2) === "f:") {
    sw.folder = target.slice(2);
  } else if (target.slice(0, 2) === "s:") {
    const other = S.shows.find((x) => x.id === target.slice(2));
    if (!other || other.id === sw.id) return;
    if (other.folder) sw.folder = other.folder;
    else {
      // フォルダの無い公演に重ねたら、その場で新しいフォルダを作って両方を入れる
      const base = other.name.replace(/\s*(昼|夜|\d+回目|\d+日目).*$/, "").trim();
      const nm = prompt("新しいフォルダの名前", base || "新しいフォルダ");
      if (nm == null || !nm.trim()) return;
      other.folder = nm.trim();
      sw.folder = nm.trim();
    }
  }
  save(); render();
}

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

const drawKey = () => {
  const so = song(); if (!so) return "";
  const t = takeCtx();
  return S.showId + "|" + so.id + (t ? "|" + t : "");
};
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

// 指の数を数える。2本になったら書くのをやめて、画面を動かす。
const inkPts = new Map();
document.addEventListener("pointerdown", (e) => {
  if (!U.draw || VIEW()) return;
  const cv = e.target.closest && e.target.closest("#ink");
  if (!cv) return;
  e.preventDefault();
  inkPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (inkPts.size >= 2) { inkPath = null; paintInk(); return; }   // 2本目が触れたら、書きかけの線は捨てる
  if (U.erase) { eraseAt(e); inkPath = "erasing"; return; }
  inkPath = { c: "#FF5C42", w: 3, p: inkPos(e) };
}, { passive: false });

document.addEventListener("pointermove", (e) => {
  if (!U.draw) return;
  // 2本指のときは自分で画面を動かす
  if (inkPts.size >= 2 && inkPts.has(e.pointerId)) {
    e.preventDefault();
    const prev = inkPts.get(e.pointerId);
    const dy = e.clientY - prev.y;
    inkPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const sc = app.querySelector(".scroll");
    if (sc) sc.scrollTop -= dy / inkPts.size;
    return;
  }
  if (!inkPath) return;
  e.preventDefault();
  if (inkPath === "erasing") { eraseAt(e); return; }
  const q = inkPos(e);
  const n = inkPath.p.length;
  if (n < 2 || Math.abs(q[1] - inkPath.p[n - 1]) > 1.2 || Math.abs(q[0] - inkPath.p[n - 2]) > 0.002) {
    inkPath.p.push(Math.round(q[0] * 10000) / 10000, Math.round(q[1]));
    paintInk();
  }
}, { passive: false });

document.addEventListener("pointerup", (e) => {
  inkPts.delete(e.pointerId);
  if (!U.draw || !inkPath) return;
  if (inkPath !== "erasing" && inkPath.p.length >= 4) {
    const k = drawKey();
    (S.draws[k] = S.draws[k] || []).push(inkPath);
    save();
  }
  inkPath = null;
  paintInk();
});
document.addEventListener("pointercancel", (e) => { inkPts.delete(e.pointerId); inkPath = null; });

/* ---- 歌詞を2本指で拡大・縮小する ---- */
// ライブ・レコーディング・メンバー側のどれでも効く。
let pinch = null;
function pinchSize(v) {
  if (S.recMode && U.overview) { S.recOvSize = Math.max(9, Math.min(28, Math.round(v))); return S.recOvSize; }
  if (U.overview) { U.ovSize = Math.max(7, Math.min(20, Math.round(v))); return U.ovSize; }
  S.size = Math.max(11, Math.min(34, Math.round(v)));
  return S.size;
}
const pinchNow = () => (S.recMode && U.overview) ? S.recOvSize : (U.overview ? U.ovSize : S.size);
document.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 2) return;
  if (U.sheet || U.menu || U.picker) return;
  if (U.view !== "live") return;
  const t = e.touches;
  pinch = { d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1, base: pinchNow() };
}, { passive: true });
document.addEventListener("touchmove", (e) => {
  if (!pinch || e.touches.length !== 2) return;
  const t = e.touches;
  const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
  const v = pinchSize(pinch.base * (d / pinch.d));
  // 描き直さずに、今出ている文字の大きさだけ変える（指の動きに遅れないように）
  const sel = U.overview ? ".ovcols, .ogrid, .ovword, .ovpage" : ".txt";
  document.querySelectorAll(sel).forEach((el) => { el.style.fontSize = v + "px"; });
  e.preventDefault();
}, { passive: false });
document.addEventListener("touchend", (e) => {
  if (!pinch || e.touches.length) return;
  pinch = null;
  save(); render();
});

/* ---- シートの歌詞をなぞって選ぶ ---- */
let rgDrag = null;

// 指の位置から、その行の何文字目かを求める（普段の歌詞画面と同じ考え方）
function charAtR(row, x, y) {
  const sp = row.querySelectorAll("[data-r]");
  if (!sp.length) return null;
  let best = null, bestD = Infinity;
  for (const el of sp) {
    const r = el.getBoundingClientRect();
    const dy = y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0);
    const dx = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
    const d = dy * 1000 + dx;
    if (d < bestD) { bestD = d; best = Number(el.dataset.r); }
  }
  return best;
}
function paintRange() {
  if (!overlay || !U.sheet) return;
  const sh = U.sheet;
  overlay.querySelectorAll("[data-r]").forEach((el) => {
    const li = Number(el.parentNode && el.parentNode.dataset ? el.parentNode.dataset.rl : sh.lineIdx);
    const ci = Number(el.dataset.r);
    const on = sh.range && li === sh.rangeLine && ci >= sh.range[0] && ci <= sh.range[1];
    el.style.background = on ? "color-mix(in srgb,var(--accent) 30%,transparent)" : "";
    el.style.borderBottomColor = on ? "var(--bad)" : "";
  });
}
document.addEventListener("pointerdown", (e) => {
  if (!U.sheet) return;
  const row = e.target.closest && e.target.closest(".rgtx");
  if (!row) return;
  const li = Number(row.dataset.rl);
  const c = charAtR(row, e.clientX, e.clientY);
  if (c == null) return;
  rgDrag = { row, li, c0: c };
  U.sheet.rangeLine = li;
  U.sheet.range = [c, c];
  U.sheet.anchor = null;
  paintRange();
  e.preventDefault();
}, { passive: false });
document.addEventListener("pointermove", (e) => {
  if (!rgDrag) return;
  const c = charAtR(rgDrag.row, e.clientX, e.clientY);
  if (c == null) return;
  U.sheet.range = [Math.min(rgDrag.c0, c), Math.max(rgDrag.c0, c)];
  paintRange();
  e.preventDefault();
}, { passive: false });
document.addEventListener("pointerup", () => {
  if (!rgDrag) return;
  rgDrag = null;
  commitFields();
  renderSheet();
});
document.addEventListener("pointercancel", () => { rgDrag = null; });

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
  if (e.target.closest("[data-act]")) { org = null; return; }
  const row = t;
  org = { l: Number(row.dataset.l), row, x: e.clientX, y: e.clientY, c: null, end: null };
  org.c = charAtX(row, e.clientX, e.clientY);
  dragOn = false;
});

let holdTimer = null;
const clearHold = () => { clearTimeout(holdTimer); holdTimer = null; };
// なぞったまま指を止めたら、これまでどおりの指摘画面を出す
function armHold() {
  if (!S.recMode) return;
  clearHold();
  holdTimer = setTimeout(() => {
    const o = org;
    if (!o || !dragOn) return;
    const a = o.c == null ? 0 : o.c;
    const b = o.end == null ? a : o.end;
    org = null; dragOn = false;
    clearHl();
    openSheet(o.l, [Math.min(a, b), Math.max(a, b)]);
  }, 500);
}

document.addEventListener("pointermove", (e) => {
  if (!org) return;
  const dx = e.clientX - org.x, dy = e.clientY - org.y;
  if (!dragOn) {
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { org = null; clearHl(); clearHold(); return; }
    if (Math.abs(dx) < 8) return;
    dragOn = true;
    if (org.c == null) org.c = 0;
  }
  e.preventDefault();
  const c = charAtX(org.row, e.clientX, e.clientY);
  if (c != null && c !== org.end) { org.end = c; highlight(org.l, org.c, c); armHold(); }
}, { passive: false });

document.addEventListener("pointerup", (e) => {
  const o = org; org = null;
  clearHold();
  if (!o) { dragOn = false; return; }
  if (dragOn) {
    const a = o.c == null ? 0 : o.c;
    const b = o.end == null ? a : o.end;
    // レコーディング中は、なぞったら印だけ。指を止めれば指摘画面が出る（上の armHold）。
    if (S.recMode) quickMark(o.l, [Math.min(a, b), Math.max(a, b)]);
    else openSheet(o.l, [Math.min(a, b), Math.max(a, b)]);
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
// 歌割だけを新しいファイルに入れ替える。曲のidは変えないので、
// 指摘・総括・手書き・録音・代役・既読の紐付けがそのまま残る。
// 行の対応は歌詞の文字で取る（歌割が変わっても歌詞は同じことがほとんど）。
const normT = (t) => String(t || "").replace(/[\s　、。！？!?,.・：:／/「」『』”"]/g, "");
const aliveLine = (l) => !!(l && !l.gap && l.t);
// 片方がもう片方を丸ごと含んでいるか（煽りから担当名が外れた時など）。
// どのくらい重なっているかを 0〜1 で返す。
function overlapRate(a, b) {
  if (!a || !b) return 0;
  const [sh, lo] = a.length <= b.length ? [a, b] : [b, a];
  if (sh.length < 4 || lo.indexOf(sh) < 0) return 0;
  return sh.length / lo.length;
}
function lineMap(oldLines, newLines) {
  const map = new Map();
  const used = new Set();
  // 1. 完全一致
  oldLines.forEach((l, i) => {
    if (!aliveLine(l)) return;
    const j = newLines.findIndex((x, k) => aliveLine(x) && x.t === l.t && !used.has(k));
    if (j >= 0) { used.add(j); map.set(i, j); }
  });
  // 2. 記号や空白の違いを無視して合わせる
  oldLines.forEach((l, i) => {
    if (!aliveLine(l) || map.has(i)) return;
    const a = normT(l.t); if (!a) return;
    const j = newLines.findIndex((x, k) => aliveLine(x) && !used.has(k) && normT(x.t) === a);
    if (j >= 0) { used.add(j); map.set(i, j); }
  });
  // 3. 片方がもう片方を含む（頭の担当名が外れた等）。いちばん重なるものを選ぶ。
  oldLines.forEach((l, i) => {
    if (!aliveLine(l) || map.has(i)) return;
    const a = normT(l.t); if (!a) return;
    let best = -1, bv = 0.6;
    newLines.forEach((x, k) => {
      if (!aliveLine(x) || used.has(k)) return;
      const v = overlapRate(a, normT(x.t));
      if (v > bv) { bv = v; best = k; }
    });
    if (best >= 0) { used.add(best); map.set(i, best); }
  });
  return map;
}

async function swapSong(songId, file) {
  const so = S.songs.find((x) => x.id === songId);
  if (!so || VIEW()) return;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  let buf = null, parsed = null;
  U.busy = `${file.name} を読んでいます…`; render();
  try {
    if (ext === "pdf") parsed = await parsePDF(file);
    else { buf = await file.arrayBuffer(); parsed = await parseXLSX(file, buf); }
  } catch (err) {
    U.busy = ""; render();
    alert("読み込めませんでした。\n" + ((err && err.message) || ""));
    return;
  }
  const ns = buildSong(parsed);
  U.busy = ""; render();

  const map = lineMap(so.lines, ns.lines);
  const mine = S.notes.filter((n) => n.songId === so.id);
  const lost = mine.filter((n) => !map.has(n.lineIdx)).length;
  const kept = mine.length - lost;
  const msg = `「${songName(so)}」の歌割を\n「${cleanName(file.name)}」に差し替えます。\n\n`
    + (mine.length
        ? `指摘 ${mine.length}件のうち ${kept}件 はそのまま移ります。`
          + (lost ? `\n残り ${lost}件 は歌詞が変わっていて行が合いません。近くの行に移します。` : "")
        : "この曲にはまだ指摘がありません。")
    + `\n\n総括・手書き・録音・代役・既読はそのまま残ります。`;
  if (!confirm(msg)) return;

  pushUndo(so.id);
  // 指摘の行番号を付け替える
  const survivors = [...map.values()].sort((a, b) => a - b);
  const nearest = (j) => {
    if (!survivors.length) return 0;
    return survivors.reduce((a, b) => (Math.abs(b - j) < Math.abs(a - j) ? b : a));
  };
  mine.forEach((n) => {
    if (map.has(n.lineIdx)) {
      const to = map.get(n.lineIdx);
      if (n.lineEnd != null) n.lineEnd = map.has(n.lineEnd) ? map.get(n.lineEnd) : to;
      n.lineIdx = to;
      return;
    }
    n.lineIdx = nearest(n.lineIdx);
    n.lineEnd = null;
    n.from = null; n.to = null;                    // 文字の位置はもう合わない
  });
  // 代役も行番号で持っているので付け替える
  [["subs"], ["subsMan"]].forEach(([name]) => {
    const k = subKey(so.id);
    const src = (S[name] || {})[k];
    if (!src) return;
    const dst = {};
    Object.keys(src).forEach((i) => { const j = map.get(Number(i)); if (j != null) dst[j] = src[i]; });
    S[name][k] = dst;
  });

  // 中身だけ入れ替える。id・公演・グループ・テイクは変えない。
  so.lines = ns.lines;
  so.blocks = ns.blocks;
  so.roster = ns.roster;
  so.credit = ns.credit;
  so.blockCells = ns.blockCells;
  so.blockRows = ns.blockRows;
  so.sheetName = ns.sheetName;
  so.micSheet = ns.micSheet; so.micMap = ns.micMap;
  so.cols = ns.cols;
  so.title = ns.title;
  so.sig = songSig(so);
  so.impAt = Date.now();
  if (buf) {
    try { await putClip("xls:" + so.id, new Blob([buf])); so.xls = 1; so.xlsAt = so.impAt; }
    catch (e) { /* 保管できなくても差し替えは済んでいる */ }
  }
  autoSubs();
  save(); schedulePush(); render();
  alert(lost
    ? `差し替えました。\n${kept}件はそのまま、${lost}件は近くの行に移しました。\n取り消すには「取消」を押してください。`
    : `差し替えました。\n指摘 ${kept}件はそのまま残っています。`);
}

// レコーディングの歌詞（Word）を読み込む
// どの画面からでも使えるよう、本体に1つだけ置いておく。
// 画面の中に書くと、その画面が出ていない時（レコーディング中など）に使えない。
function recFileInput() {
  let el = document.getElementById("recfile");
  if (el && el.tagName === "INPUT") return el;
  el = document.createElement("input");
  el.type = "file";
  el.id = "recfile";
  el.multiple = true;
  el.accept = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  el.style.display = "none";
  document.body.appendChild(el);
  return el;
}

async function loadRecDocs(picked) {
  let last = null, n = 0;
  for (const f of picked) {
    U.busy = `${f.name} を読んでいます…`; render();
    try {
      const so = await parseDocx(f);
      // 今開いている曲と同じフォルダに入れる（続けて読み込む時に散らばらない）
      const near = recSong();
      if (near && near.folder) so.folder = near.folder;
      S.rsongs.push(so);
      S.rsongId = so.id;
      last = so; n++;
    } catch (e) { alert(f.name + " を読めませんでした。\n" + ((e && e.message) || e)); }
  }
  U.busy = "";
  if (last) {
    const k = SONGS().findIndex((x) => x.id === last.id);
    if (k >= 0) U.songIdx = k;
  }
  save(); U.menu = null; render();
  if (n) setTimeout(() => alert(n + "曲を読み込みました。"), 0);
}

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
        (d.songs || []).forEach((sg) => S.songs.push(Object.assign(buildSong(sg), { groupId: S.groupId, showId: S.showId, impAt: Date.now() })));
      } else if (ext === "pdf") {
        S.songs.push(Object.assign(buildSong(await parsePDF(f)), { groupId: S.groupId, showId: S.showId, impAt: Date.now() }));
      } else {
        const buf = await f.arrayBuffer();
        const so = Object.assign(buildSong(await parseXLSX(f, buf)), { groupId: S.groupId, showId: S.showId, impAt: Date.now() });
        // 同じ曲の入れ直しなら、古い方の記録を写せるようにする
        const prevSo = SONGS().find((x) => x.title === so.title || sigOf(x) === sigOf(so));
        const had = prevSo ? S.notes.filter((n) => n.songId === prevSo.id).length : 0;
        S.songs.push(so);
        try { await putClip("xls:" + so.id, new Blob([buf])); so.xls = 1; so.xlsAt = Date.now(); } catch (e) { /* 保管できなくても取り込みは続ける */ }
        if (prevSo && had) {
          if (confirm(`この公演に「${songName(prevSo)}」があります。\nそちらの記録 ${had}件 を新しい方に写しますか？\n\n古い方はそのまま残ります。`)) {
            const r = copyRecords(prevSo, so);
            if (r.lost) alert(`${r.moved}件を写しました。\n${r.lost}件は歌詞が変わっていて写せませんでした。古い方に残っています。`);
          }
        }
      }
      save();
    } catch (err) {
      failed.push(f.name + (err && err.unreadable ? "（文字を取り出せません）" : ""));
    }
  }
  // 読み込んだ曲にも、設定済みの欠席を反映させる
  autoSubs();
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
async function wrap(obj, g) {
  const k = g ? g.key : S.key;
  if (!k) return obj;
  if (!crypto || !crypto.subtle) throw new Error("暗号化はhttpsのページでしか使えません。");
  return sealJSON(obj, k);
}

/* ---- GitHub Gist：グループごとに配信する ---- */
function publicationData(gid) {
  const g = group(gid);
  // 同じ歌詞を公演の数だけ送ると際限なく膨らむので、歌詞は1曲ぶんだけ持ち、
  // 各公演はそれを指す形にする。これで全公演をずっと残せる。
  const build = (showIds) => {
    const songs = S.songs.filter((x) => x.groupId === g.id && showIds.includes(x.showId));
    const idx = new Map(songs.map((x, i) => [x.id, i]));
    const lib = [], libKey = new Map();
    const used = [];
    songs.forEach((x) => x.lines.forEach((l) => (l.parts || []).forEach((pid) => {
      const nm = (member(pid) || {}).name;
      if (nm && !used.includes(nm)) used.push(nm);
    })));
    // その曲に出てくる人だけを、その曲の名簿として送る
    const orderOf = (x) => {
      const o = [];
      const put = (id) => { const nm = (member(id) || {}).name; if (nm && !o.includes(nm)) o.push(nm); };
      Object.keys(x.blocks || {}).forEach((b) => (x.blocks[b] || []).forEach(put));
      (x.roster || []).forEach(put);
      return o;
    };
    const entry = (x) => {
      const lines = x.lines.map((l) => (l.gap ? ["", "", "", "", "", "", "", ""]
        : [l.cont ? "→" : (l.raw != null ? l.raw : l.label), l.t, l.cell || "", l.lcell || "",
           (l.extra || []).length ? "ハモ " + (l.extra || []).map((m) => (member(m) || {}).name).filter(Boolean).join("・") : "",
           l.extraCell || "", l.labelRaw || l.raw || "", l.extraRaw || ""]));
      const key = x.title + "\u0001" + JSON.stringify(lines);
      if (libKey.has(key)) return libKey.get(key);
      const gs = {};
      Object.keys(x.blocks || {}).forEach((b) => {
        gs[b] = (x.blocks[b] || []).map((mid) => (member(mid) || {}).name).filter(Boolean);
      });
      lib.push({ title: x.title, credit: x.credit, groups: gs, order: orderOf(x), lines,
        groupRows: (x.blockRows || []).map((br) => ({ b: br.b, ncell: br.ncell || "", lcell: br.lcell || "" })) });
      libKey.set(key, lib.length - 1);
      return lib.length - 1;
    };
    return {
      version: Date.now(), authorId: S.deviceId, src: g.src || "", groupName: g.name || "",
      members: used.map((n) => ({ name: n })),
      rosters: S.rosters || {},                                   // 名簿の並び（年齢順）
      alert: (S.alertMsg && (!(S.alertMsg.to || []).length || S.alertMsg.to.includes(g.id)))
        ? S.alertMsg : null,                                      // ライブ中のお知らせ（相手を絞れる）
      groupOrder: S.groups.map((x) => x.name).filter(Boolean),    // グループの並び
      folderOrder: (S.folderOrder || []).slice(),                 // 公演の箱の並び
      lib,
      songs: songs.map((x) => ({
        showId: x.showId, libIdx: entry(x), take: x.take || 1,
        fromIdx: x.from != null && idx.has(x.from) ? idx.get(x.from) : null,
      })),
      shows: S.shows.filter((x) => showIds.includes(x.id)).map((x) => Object.assign({}, x, {
        absent: (x.absent || []).map((mid) => (member(mid) || {}).name).filter(Boolean),
      })),
      gsubs: (() => {
        const arr = [];
        showIds.forEach((sid) => {
          songs.forEach((x) => {
            if (x.showId !== sid) return;
            const m = S.gsubs[sid + "|" + x.id];
            if (!m) return;
            Object.keys(m).forEach((b) => {
              arr.push({ showId: sid, songIdx: idx.get(x.id), block: b,
                names: (m[b] || []).map((mid) => (member(mid) || {}).name).filter(Boolean) });
            });
          });
        });
        return arr;
      })(),
      subs: (() => {
        const arr = [];
        showIds.forEach((sid) => {
          songs.forEach((x) => {
            if (x.showId !== sid) return;
            const m = S.subs[sid + "|" + x.id];
            if (!m) return;
            Object.keys(m).forEach((li) => {
              arr.push({ showId: sid, songIdx: idx.get(x.id), lineIdx: Number(li),
                names: (m[li] || []).map((mid) => (member(mid) || {}).name).filter(Boolean) });
            });
          });
        });
        return arr;
      })(),
      notes: S.notes.filter((n) => idx.has(n.songId)).map((n) => ({
        songIdx: idx.get(n.songId), lineIdx: n.lineIdx,
        memberNames: n.memberIds.map((mid) => (member(mid) || {}).name).filter(Boolean),
        tags: n.tags, memo: n.memo, pitch: n.pitch || null, lineEnd: n.lineEnd || null,
        from: n.from, to: n.to, showId: n.showId, at: n.at != null ? n.at : null,
      })),
      memos: Object.entries(S.memos || {}).map(([k, v]) => {
        const [sid, sgid] = k.split("|");
        return idx.has(sgid) ? { showId: sid, songIdx: idx.get(sgid), text: v } : null;
      }).filter((x) => x && x.text),
    };
  };

  // このグループの曲がある公演を、新しい順に全部。大きすぎる時だけ古い方から落とす。
  let ids = showsNewestFirst()
    .filter((sw) => !sw.hidden && !sw.nopub)          // 公演ごとに配信しない設定
    .filter((sw) => S.songs.some((x) => x.showId === sw.id && x.groupId === g.id))
    .map((x) => x.id);
  let d = build(ids);
  while (ids.length > 1 && JSON.stringify(d).length > 700000) {
    ids = ids.slice(0, -1);
    d = build(ids);
  }
  // メンバーが開いた時に最初に出す公演。
  // 公演の ts は「作った日時」なので、単に新しい順の先頭にすると
  // 古い公演を複製して作り直した時などに意図と違うものが出る。
  // こちらで今開いている公演をそのまま指定する。
  d.focusShow = ids.includes(S.showId) ? S.showId : (ids[0] || "");
  return d;
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
      if (/rate limit/i.test(body)) {
        const e2 = new Error(msg); e2.status = 429;
        // 短時間に送りすぎた時（二次的な制限）は Retry-After に秒数が入る。たいてい60秒ほど。
        // 1時間ぶんの上限を使い切った時だけ x-ratelimit-reset を見る。
        const ra = Number(r.headers.get("retry-after")) || 0;
        const remain = Number(r.headers.get("x-ratelimit-remaining"));
        e2.after = ra;
        e2.reset = (!ra && remain === 0) ? (Number(r.headers.get("x-ratelimit-reset")) || 0) : 0;
        throw e2;
      }
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
  // 短い間隔で送り続けるとGitHubに止められる。最短3秒あける。
  const wait = Math.max(8000 - (Date.now() - lastPushAt), 3000);
  pushTimer = setTimeout(() => doPush(true), wait);
}

// 1つのグループにだけ送る。お知らせのように相手が決まっている時に使う。
// 全グループへ送ると、GitHubの送信回数をむだに使って「混み合っています」になりやすい。
async function pushOne(gid) {
  const g = group(gid);
  if (!S.ghToken || !g || !g.gistId || g.nopub) { pushState = "未送信"; return; }
  pushState = "送信中"; render();
  lastPushAt = Date.now();
  try {
    await gistPush(g.id, true);
    const d = new Date();
    pushState = `公開済 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch (e) {
    if (e.status === 429) {
      const wait = e.after ? Math.min(Math.max(e.after * 1000 + 2000, 5000), 300000) : 45000;
      const rt = new Date(Date.now() + wait);
      limitedAt = `${String(rt.getHours()).padStart(2, "0")}:${String(rt.getMinutes()).padStart(2, "0")}`;
      pushState = "順番待ち" + (limitedAt ? " " + limitedAt + "頃" : "");
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => pushOne(gid), wait);
    } else pushState = "未送信";
  }
  render();
}

async function doPush(silent) {
  const live = S.groups.filter((g) => g.gistId && !g.nopub);
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
        const wait = e.after ? Math.min(Math.max(e.after * 1000 + 2000, 5000), 300000)
          : (e.reset ? Math.min(Math.max(e.reset * 1000 - Date.now() + 3000, 20000), 3900000) : 45000);
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

// 変わっていない相手には送らない
function hasPending() {
  return S.groups.some((g) => {
    if (!g.gistId || g.nopub) return false;
    try { return payloadKey(publicationData(g.id)) !== g.lastKey; } catch (e) { return false; }
  });
}

// アプリを開いている間、自動でやりとりする
setInterval(() => {
  if (document.hidden || preview) return;
  if (S.ghToken && S.groups.some((g) => g.gistId)) {
    if (hasPending()) doPush(true);
  } else if (S.src) {
    if (syncBackoff && Date.now() < syncBackoff) return;
    syncSetlist(false);
  }
}, 6000);

setInterval(() => {
  if (document.hidden || preview) return;
  if (VIEW() && S.pubAt && U.view === "live") render();     // 「◯分前」の表示を進める
}, 60000);

setInterval(() => {
  if (document.hidden || preview) return;
  // 変わっていれば送る（別の端末とすぐ揃うように）
  if (S.ghToken && bkSignature() !== S.bkHash && Date.now() - (S.bkAt || 0) > 20000) doBackup(true);
  else checkOther();
}, 30000);

/* ---- バックアップ ---- */
const hash32 = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; };

async function squeeze(u8) {
  if (typeof CompressionStream === "undefined") return null;
  const cs = new CompressionStream("deflate-raw");
  const w = cs.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function unsqueeze(u8) {
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

// トークンは入れない。それ以外の全部（公演・曲・記録・総括・手書き・設定）を1つにまとめる。
function backupState() {
  // 同じ歌詞を曲の数だけ持つと、送る量が何倍にも膨らむ。
  // 保存の時と同じように、歌詞は1か所にまとめてから送る。
  const c = packState(JSON.parse(JSON.stringify(S)));
  delete c.ghToken;
  return c;
}
// 受け取った側で元に戻す
const fromBackup = (st) => unpackState(st || {});
// 署名に自分の値（前回時刻・前回署名）が混ざると毎回変わるので外す
const bkSignature = () => {
  const c = backupState();
  delete c.bkAt; delete c.bkHash; delete c.bkSeen; delete c.editPass;
  return hash32(JSON.stringify(c));
};

async function packBackup() {
  const raw = new TextEncoder().encode(JSON.stringify({ app: "utacheck", ver: APP_VER, at: Date.now(), state: backupState() }));
  const z = await squeeze(raw);
  const body = { bk: 1, z: !!z, data: b64e(z || raw) };
  return S.bkKey ? await sealJSON(body, S.bkKey) : body;
}
async function unpackBackup(o) {
  let b = o;
  if (o && o.enc) {
    // 合言葉が違うのか、そのあとの展開で失敗したのかを区別する。
    // 一緒くたにすると「合言葉が違います」と出続けて原因が分からなくなる。
    try { b = await openJSON(o, S.bkKey); }
    catch (e) { const err = new Error("合言葉が合いません。"); err.badKey = 1; throw err; }
  }
  if (!b || !b.bk) throw new Error("バックアップの形式ではありません。");
  let u8 = b64d(b.data);
  if (b.z) {
    if (typeof DecompressionStream === "undefined") throw new Error("この端末では展開できません（DecompressionStream非対応）。");
    try { u8 = await unsqueeze(u8); }
    catch (e) { throw new Error("中身を展開できませんでした。" + ((e && e.message) ? "（" + e.message + "）" : "")); }
  }
  try { return JSON.parse(new TextDecoder().decode(u8)); }
  catch (e) { throw new Error("中身を読み取れませんでした。"); }
}

// バックアップの置き場所（Gistのid）を見失った時に、GitHubから探し直す。
// 端末のデータが飛んでも、GitHub側のバックアップは残っている。
// 過去の版（Gistの更新履歴）まで遡って探す。
// Gistを直接指定して戻す。探索で見つけられない時の確実な手段。
// 見た目が同じでも内部の文字コードが違うことがある（濁点・長音・前後の空白など）。
// 入れてもらった合言葉から、ありうる形を作って順に試す。
function keyVariants(pw) {
  const base = String(pw == null ? "" : pw);
  const out = [];
  const add = (v) => { if (typeof v === "string" && !out.includes(v)) out.push(v); };
  [base, base.trim(), base.replace(/[\s　]/g, "")].forEach((b) => {
    add(b);
    try { add(b.normalize("NFC")); add(b.normalize("NFD")); } catch (e) {}
  });
  return out;
}
// この端末が知っている合言葉も候補にする（配信用と取り違えていることがある）
function knownKeys() {
  const out = [];
  const add = (v) => { if (v && !out.includes(v)) out.push(v); };
  add(S.bkKey); add(S.key);
  (S.groups || []).forEach((g) => add(g.key));
  return out;
}
async function unpackWithPass(raw, pw, alsoKnown) {
  const cands = keyVariants(pw).concat(alsoKnown ? knownKeys() : []);
  let last = null;
  const keep = S.bkKey;
  for (const k of cands) {
    S.bkKey = k;
    try { return await unpackBackup(raw); }
    catch (e) { last = e; if (!e.badKey) { S.bkKey = keep; throw e; } }
  }
  S.bkKey = keep;
  throw last || new Error("合言葉が合いません。");
}

// 端末のデータが消えた時に、配信データ（メンバーに見えている方）から自分のデータとして取り戻す。
// 手書きと録音は配信に含まれないので戻らない。それ以外（公演・曲・歌割・指摘・総括）は戻る。
async function recoverFromDelivery() {
  try { await recoverInner(); }
  catch (e) { alert("取り込めませんでした。\n" + ((e && e.message) || e)); }
}
async function recoverInner() {
  if (!S.ghToken) { alert("先に自動公開のトークンを入れてください。"); return; }
  alert("配信データを探します。\n少し時間がかかります。");
  const list = await gh("/gists?per_page=100");
  if (!Array.isArray(list)) { alert("GitHubからの返事が想定と違います。"); return; }
  const cands = list.filter((g) => Object.keys(g.files || {}).some((n) => /^utacheck\.json$/i.test(n)));
  if (!cands.length) { alert("配信データが見つかりませんでした。"); return; }
  cands.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  let took = 0;
  for (const g0 of cands) {
    const label = (g0.description || "").replace(/^歌チェック\s*配信データ\s*\/?\s*/, "") || "（名前なし）";
    if (!confirm(`「${label}」\n更新 ${new Date(g0.updated_at).toLocaleString("ja-JP")}\n\nこれを取り込みますか？`)) continue;
    let d = null;
    for (let tryN = 0; tryN < 4 && !d; tryN++) {
      let raw;
      try { raw = JSON.parse((await gh("/gists/" + g0.id)).files["utacheck.json"].content); }
      catch (e) { alert("中身を読めませんでした。"); break; }
      if (!raw || !raw.enc) { d = raw; break; }
      const pw = prompt(`「${label}」の合言葉を入れてください。`
        + (tryN ? "\n（合いませんでした）" : ""), "");
      if (pw == null) break;
      for (const k of keyVariants(pw)) {
        try { d = await openJSON(raw, k); break; } catch (e) { /* 次の形を試す */ }
      }
    }
    if (!d) continue;
    mergeDelivery(d, g0, label);
    took++;
  }
  if (!took) { alert("何も取り込みませんでした。"); return; }
  S.viewer = false;
  S.pubNotes = [];
  sweep();
  // 戻した直後に「別の端末で更新されています」と誤解されないようにする
  S.bkSeen = Date.now(); S.bkAt = S.bkSeen; S.bkHash = bkSignature();
  otherAt = 0;
  save();
  alert(`取り込みました。\n公演${S.shows.length}件・曲${S.songs.length}件・記録${S.notes.length}件\n\n※手書きと録音は配信に含まれないため戻りません。`);
  location.reload();
}

// 配信データ1つぶんを、自分のデータとして足す（すでにある分は消さない）
function mergeDelivery(d, gist, label) {
  (d.members || []).forEach((x) => addMember(x.name));
  if (d.rosters && Object.keys(d.rosters).length) S.rosters = d.rosters;
  if (Array.isArray(d.folderOrder) && d.folderOrder.length) S.folderOrder = d.folderOrder.slice();

  // グループを用意する（配信先の設定もそのまま引き継ぐ）
  let g = S.groups.find((x) => x.name === (d.groupName || label));
  if (!g) { g = { id: uid(), name: d.groupName || label, key: "" }; S.groups.push(g); }
  g.gistId = gist.id;
  if (d.src) g.src = d.src;

  // 公演（同じidがあれば残す）
  (d.shows || []).forEach((x) => {
    if (S.shows.some((y) => y.id === x.id)) return;
    S.shows.push(Object.assign({}, x, {
      absent: (x.absent || []).map((nm) => addMember(nm).id),
    }));
  });

  const lib = Array.isArray(d.lib) ? d.lib : null;
  const added = [];
  (d.songs || []).forEach((sg) => {
    const src = lib ? (lib[sg.libIdx] || { lines: [] }) : sg;
    const o = Object.assign(buildSong(src), {
      groupId: g.id, showId: sg.showId || S.showId, take: sg.take || 1,
    });
    S.songs.push(o); added.push(o);
  });
  (d.songs || []).forEach((sg, i) => { if (sg.fromIdx != null && added[sg.fromIdx]) added[i].from = added[sg.fromIdx].id; });

  // 指摘は「自分の記録」として入れる（読むだけの印は付けない）
  (d.notes || []).forEach((n) => {
    const so = added[n.songIdx];
    if (!so) return;
    S.notes.push({
      id: uid(), showId: n.showId || so.showId, songId: so.id, lineIdx: n.lineIdx,
      lineEnd: n.lineEnd || null, from: n.from, to: n.to,
      memberIds: (n.memberNames || []).map((nm) => addMember(nm).id),
      tags: n.tags || [], memo: n.memo || "", pitch: n.pitch || null,
      at: n.at != null ? n.at : null, ts: Date.now(),
    });
  });
  (d.memos || []).forEach((m) => {
    const so = added[m.songIdx];
    if (so && m.text) S.memos[(m.showId || so.showId) + "|" + so.id] = m.text;
  });
  (d.gsubs || []).forEach((x) => {
    const so = added[x.songIdx]; if (!so) return;
    const k = (x.showId || so.showId) + "|" + so.id;
    S.gsubs[k] = S.gsubs[k] || {};
    S.gsubs[k][x.block] = (x.names || []).map((nm) => addMember(nm).id);
  });
  (d.subs || []).forEach((x) => {
    const so = added[x.songIdx]; if (!so) return;
    const k = (x.showId || so.showId) + "|" + so.id;
    S.subs[k] = S.subs[k] || {};
    S.subs[k][x.lineIdx] = (x.names || []).map((nm) => addMember(nm).id);
  });
  if (d.focusShow && S.shows.some((x) => x.id === d.focusShow)) S.showId = d.focusShow;
}

async function restoreFromId() {
  const inp = prompt("戻したいバックアップのGistを指定します。\nURL か ID を貼ってください。\n例 https://gist.github.com/xxxx/abc123...", "");
  if (inp == null) return;
  const id = (String(inp).trim().split(/[/?#]/).filter(Boolean).pop() || "").trim();
  if (!id) { alert("IDが読み取れませんでした。"); return; }
  try {
    const full = await gh("/gists/" + id);
    const vers = [{ sha: "", at: full.updated_at }]
      .concat((full.history || []).map((h) => ({ sha: h.version, at: h.committed_at })));
    for (const v of vers) {
      let files = full.files;
      if (v.sha) { try { files = (await gh("/gists/" + id + "/" + v.sha)).files; } catch (e) { continue; } }
      const key = Object.keys(files || {}).find((n) => /backup/i.test(n));
      if (!key) continue;
      let raw; try { raw = JSON.parse(files[key].content); } catch (e) { continue; }
      let obj = null;
      for (let tryN = 0; tryN < 3 && !obj; tryN++) {
        if (raw && raw.enc) {
          const pw = prompt(`${new Date(v.at).toLocaleString("ja-JP")} の合言葉を入れてください。`
            + (tryN ? "\n（合いませんでした）" : ""), S.bkKey || "");
          if (pw == null) return;
          S.bkKey = pw.trim();
        }
        try { obj = await unpackWithPass(raw, S.bkKey, tryN > 0); }
        catch (e) {
          if (!e.badKey) { alert(`開けませんでした。\n\n${e.message}`); break; }
        }
      }
      if (!obj) continue;
      const st = fromBackup(obj.state);
      const when = new Date(obj.at || v.at).toLocaleString("ja-JP");
      const n = `公演${(st.shows || []).length}件・曲${(st.songs || []).length}件・記録${(st.notes || []).length}件`;
      if (!confirm(`${when}\n${n}\n\nこれで戻しますか？\n（「いいえ」でもっと古い版を見ます）`)) continue;
      const tk = S.ghToken, bkk = S.bkKey;
      Object.keys(S).forEach((k) => { delete S[k]; });
      Object.assign(S, st);
      S.ghToken = tk; S.bkGistId = id; if (bkk) S.bkKey = bkk;
      save();
      alert("戻しました。");
      location.reload();
      return;
    }
    alert("このGistから使える版が見つかりませんでした。");
  } catch (e) { alert("開けませんでした。\n" + ((e && e.message) || e)); }
}

// つなぎ先を選び直す。中身を入れ替えるか、こちらの内容を送るかを選べる。
async function pickTarget() {
  if (!S.ghToken) { alert("先にGitHubのトークンを入れてください。"); return; }
  let list;
  U.busy = "つなぎ先を探しています…"; render();
  try { list = await gh("/gists?per_page=100"); }
  catch (e) { U.busy = ""; render(); alert("GitHubに接続できませんでした。\n" + e.message); return; }
  U.busy = ""; render();
  const cands = (list || []).filter((g) => Object.keys(g.files || {}).some((n) => /backup/i.test(n)));
  if (!cands.length) { alert("つなぎ先が見つかりませんでした。\n「今すぐバックアップ」を押すと新しく作られます。"); return; }
  cands.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  for (const g of cands) {
    let n = "中身を読み取れません";
    let locked = false;
    try {
      const full = await gh("/gists/" + g.id);
      const key = Object.keys(full.files).find((x) => /backup/i.test(x));
      const obj = await unpackWithPass(JSON.parse(full.files[key].content), S.bkKey, true);
      const st = fromBackup(obj && obj.state);
      n = `公演${(st.shows || []).length}件・曲${(st.songs || []).length}件・記録${(st.notes || []).length}件`;
    } catch (e) {
      if (e && e.badKey) { locked = true; n = "合言葉がかかっています（選ぶと聞きます）"; }
    }
    const cur = g.id === S.bkGistId ? "（いまのつなぎ先）" : "";
    void locked;
    if (!confirm(`${g.id.slice(0, 7)}…${cur}\n${new Date(g.updated_at).toLocaleString("ja-JP")}\n${n}\n\nこれをつなぎ先にしますか？\n（「いいえ」で次の候補）`)) continue;

    const mine = `この端末は 公演${S.shows.length}件・曲${S.songs.length}件・記録${S.notes.length}件`;
    const useThere = confirm(`${mine}\n\nどちらの内容にしますか？\n\n「OK」＝ つなぎ先の内容にする（この端末の内容は置き換わります）\n「キャンセル」＝ この端末の内容を送る（つなぎ先が置き換わります）`);
    S.bkGistId = g.id;
    save();
    if (useThere) {
      S.bkSeen = 0;
      await restoreBackup(true);
    } else {
      S.bkHash = 0;                 // 送るべきものとして扱う
      await doBackup(false);
      alert("この端末の内容を送りました。\nもう一方の端末で「今すぐ揃える」を押してください。");
    }
    render();
    return;
  }
  alert("ほかに候補はありませんでした。");
}

async function findBackup() {
  try { await findBackupInner(); }
  catch (e) { alert("探せませんでした。\n" + ((e && e.message) || e)); }
}
async function findBackupInner() {
  alert("GitHubのバックアップを探します。\n少し時間がかかります。");
  if (!S.ghToken) { alert("先に自動公開のトークンを入れてください。"); return; }
  let list;
  try { list = await gh("/gists?per_page=100"); }
  catch (e) { alert("GitHubに接続できませんでした。\n" + e.message); return; }
  if (!Array.isArray(list)) { alert("GitHubからの返事が想定と違います。\nトークンに gist の権限が付いているか確認してください。"); return; }
  const isBk = (g) => Object.keys((g && g.files) || {}).some((n) => /backup/i.test(n))
    || /歌チェック|utacheck/i.test(g.description || "");
  const cands = (list || []).filter(isBk);
  if (!cands.length) {
    alert(`Gistは ${(list || []).length}件 見つかりましたが、\nバックアップらしいものはありませんでした。`);
    return;
  }
  cands.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  const fails = [];
  let seen = 0;
  for (const g of cands) {
    let full;
    try { full = await gh("/gists/" + g.id); }
    catch (e) { fails.push(`${g.id.slice(0, 7)}：開けません（${e.message}）`); continue; }
    // 最新の版と、過去の版を新しい順に
    const vers = [{ sha: "", at: full.updated_at }]
      .concat((full.history || []).map((h) => ({ sha: h.version, at: h.committed_at })));
    for (const v of vers) {
      let files = full.files;
      if (v.sha) {
        try { files = (await gh("/gists/" + g.id + "/" + v.sha)).files; }
        catch (e) { continue; }
      }
      const key = Object.keys(files || {}).find((n) => /backup/i.test(n));
      if (!key) continue;
      let obj = null;
      let raw = null;
      try { raw = JSON.parse(files[key].content); } catch (e) { continue; }
      // 合言葉が違うことがあるので、失敗したらその場で聞き直す（黙って飛ばさない）
      for (let tryN = 0; tryN < 3 && !obj; tryN++) {
        if (raw && raw.enc && (!S.bkKey || tryN > 0)) {
          const pw = prompt(`${new Date(v.at).toLocaleString("ja-JP")} のバックアップの合言葉を入れてください。`
            + (tryN ? "\n（合いませんでした）" : ""), S.bkKey || "");
          if (pw == null) break;
          S.bkKey = pw.trim();
        }
        try { obj = await unpackWithPass(raw, S.bkKey, tryN > 0); }
        catch (e) {
          if (!e.badKey) {                      // 合言葉の問題ではないので聞き直さない
            alert(`${new Date(v.at).toLocaleString("ja-JP")} の版は開けませんでした。\n\n${e.message}`);
            fails.push(`${g.id.slice(0, 7)}：${e.message}`);
            break;
          }
        }
      }
      if (!obj) continue;
      const st = fromBackup(obj && obj.state);
      const cnt = (st.shows || []).length + (st.songs || []).length + (st.notes || []).length;
      if (!cnt) continue;                       // 空の版は飛ばす
      seen++;
      const when = new Date(obj.at || v.at).toLocaleString("ja-JP");
      const n = `公演${(st.shows || []).length}件・曲${(st.songs || []).length}件・記録${(st.notes || []).length}件`;
      if (confirm(`${seen}件目\n\n${when}\n${n}\n\nこれを使いますか？\n（「いいえ」でもっと古い版を見ます）`)) {
        S.bkGistId = g.id;
        save();
        if (v.sha) {                            // 過去の版はその場で戻す
          const tk = S.ghToken, bk = S.bkGistId, bkk = S.bkKey;
          Object.keys(S).forEach((k) => { delete S[k]; });
          Object.assign(S, st);
          S.ghToken = tk; S.bkGistId = bk; if (bkk) S.bkKey = bkk;
          save();
          alert("戻しました。");
          location.reload();
        } else {
          await restoreBackup();
        }
        return;
      }
    }
  }
  alert(`中身のある版は ${seen}件 見つかりました。\n`
    + (fails.length ? `\n開けなかったもの:\n${fails.slice(0, 6).join("\n")}` : "")
    + `\n\nGist ${cands.length}件を調べました。`);
}

async function doBackup(silent) {
  if (!S.ghToken) { if (!silent) alert("先に自動公開のトークンを入れてください。"); return; }
  try {
    let content = JSON.stringify(await packBackup());
    if (content.length > 950000) {
      // 手書きは容量を食うわりに、他の端末で使うことが少ない。外して入るなら外して送る。
      const keep = S.draws;
      S.draws = {};
      const slim = JSON.stringify(await packBackup());
      S.draws = keep;
      if (slim.length <= 950000) {
        content = slim;
        if (!silent) alert("手書きが大きいので、手書きだけ外して送りました。\n（手書きはこの端末には残っています）");
      } else {
        const mb = (content.length / 1048576).toFixed(1);
        if (!silent) alert(`大きすぎて送れません（${mb} MB）。\n\n公演${S.shows.length}件・曲${S.songs.length}件・記録${S.notes.length}件\n\n設定の「保存領域」から、使わないグループや古い公演を消してください。`);
        return;
      }
    }
    const files = { "utacheck-backup.json": { content } };
    if (S.bkGistId) {
      try { await gh("/gists/" + S.bkGistId, { method: "PATCH", body: JSON.stringify({ files }) }); }
      catch (e) { if (e.status === 404) S.bkGistId = ""; else throw e; }
    }
    if (!S.bkGistId) {
      const g = await gh("/gists", { method: "POST",
        body: JSON.stringify({ description: "歌チェック バックアップ", public: false, files }) });
      S.bkGistId = g.id;
    }
    S.bkAt = Date.now();
    S.bkSeen = S.bkAt;
    S.bkHash = bkSignature();
    save();
    if (!silent) { alert("バックアップしました。"); render(); }
  } catch (e) {
    if (!silent) alert("バックアップできませんでした。\n" + e.message);
  }
}

async function restoreBackup(silent) {
  if (!S.ghToken || !S.bkGistId) { alert("バックアップがありません。"); return; }
  try {
    const g = await gh("/gists/" + S.bkGistId);
    const f = g.files && g.files["utacheck-backup.json"];
    if (!f) throw new Error("中身が見つかりません。");
    const raw = JSON.parse(f.content);
    let obj = null;
    for (let tryN = 0; tryN < 4 && !obj; tryN++) {
      try { obj = await unpackWithPass(raw, S.bkKey, true); }
      catch (e) {
        if (!e.badKey) throw e;                 // 合言葉以外の理由はそのまま知らせる
        if (!raw || !raw.enc) throw e;
        const pw = prompt("このバックアップの合言葉を入れてください。"
          + (tryN ? "\n（合いませんでした）" : ""), S.bkKey || "");
        if (pw == null) return;                 // やめた
        S.bkKey = pw.trim();
      }
    }
    if (!obj) { alert("合言葉が合わないため、戻せませんでした。"); return; }
    const st = fromBackup(obj.state);
    const when = new Date(obj.at || 0).toLocaleString("ja-JP");
    if (!silent && !confirm(`${when} のバックアップから戻します。\n公演${(st.shows || []).length}件・曲${(st.songs || []).length}件・記録${(st.notes || []).length}件\n\n今この端末にある内容は置き換わります。よろしいですか？`)) return;
    const tk = S.ghToken, bk = S.bkGistId, bkk = S.bkKey;
    Object.keys(S).forEach((k) => { delete S[k]; });
    Object.assign(S, st);
    S.ghToken = tk; S.bkGistId = bk; if (bkk) S.bkKey = bkk;
    save();
    alert(silent
      ? `${when} の内容を取り込みました。\nこの端末でも編集できます。\n\n※ 同時に2台で書き換えると、あとから送った方で上書きされます。`
      : "戻しました。");
    location.reload();
  } catch (e) {
    alert("戻せませんでした。\n" + e.message);
  }
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: (type || "text/plain") + ";charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}
async function backupToFile() {
  const d = new Date();
  const nm = `歌チェック_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
  download(nm, JSON.stringify(await packBackup()), "application/json");
}

/* ---- 受け取り：配信されたものを取り込む ---- */
const srcUrl = () => S.src || "./setlist.json";

let syncErr = "", syncAt = 0, syncBackoff = 0, justUpdated = 0, askedKey = false;
async function fetchSetlist() {
  const u = srcUrl();
  if (!u) { syncErr = "つなぎ先がありません。接続リンクを開き直してください。"; return null; }
  const url = u + (u.includes("?") ? "&" : "?") + "t=" + Date.now();
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      if (r.status === 403 || r.status === 429) syncBackoff = Date.now() + 120000;
      syncErr = r.status === 404
        ? "配信元が見つかりません（404）。リンクが古いかもしれません。"
        : r.status === 403 ? "取得を断られました（403）。少し待つと直ることがあります。"
        : "取得できませんでした（" + r.status + "）。";
      return null;
    }
    let d = await r.json();
    if (d && d.enc) {
      if (!S.key) { syncErr = "合言葉が必要です。"; return "nokey"; }
      if (!crypto || !crypto.subtle) { syncErr = "この端末では合言葉を解けません。"; return "badkey"; }
      try { d = await openJSON(d, S.key); } catch (e) { syncErr = "合言葉が違います。"; return "badkey"; }
    }
    if (!(d && Array.isArray(d.songs))) { syncErr = "配信の中身が空です。配信元で「今すぐ送信」を押してもらってください。"; return null; }
    syncErr = ""; syncAt = Date.now(); S.syncAt = syncAt; syncBackoff = 0;
    return d;
  } catch (e) {
    syncErr = "通信できませんでした。電波とネットワークの制限を確認してください。";
    return null;
  }
}

// 受け取り専用の端末で、つなぎ先が変わった時に前のグループを消す
function resetForNewSource() {
  if (S.groups.some((g) => g.gistId)) return; // 配信元の端末では絶対に消さない
  Object.keys(S.recs || {}).forEach((k) => delClip(k));
  S.songs = []; S.notes = []; S.pubNotes = []; S.memos = {}; S.recs = {};
  const nid = uid();
  S.shows = [{ id: nid, name: todayLabel(), ts: Date.now() }];
  S.showId = nid; S.setlistVer = 0; U.songIdx = 0;
}

function applySetlist(d) {
  if (!S.groups.some((g) => g.gistId)) { S.songs = []; S.memos = {}; S.pubNotes = []; }
  S.songs = [];
  (d.members || []).forEach((x) => addMember(x.name));
  if (d.version) {
    if (S.pubAt && d.version !== S.pubAt) justUpdated = Date.now();   // 中身が変わった合図
    S.pubAt = d.version;
  }
  if (d.rosters && Object.keys(d.rosters).length) S.rosters = d.rosters;
  if (d.groupOrder && d.groupOrder.length) S.groupOrder = d.groupOrder;
  if (Array.isArray(d.folderOrder)) S.folderOrder = d.folderOrder.slice();
  S.pubAlert = d.alert || null;
  // 受け取った名簿に、その曲に出てこない人が混ざっていたら削る（古い配信への備え）
  const trimRoster = (o) => {
    const used = [];
    Object.keys(o.blocks || {}).forEach((b) => (o.blocks[b] || []).forEach((x) => { if (!used.includes(x)) used.push(x); }));
    o.lines.forEach((l) => {
      if (/^全/.test(l.label || "")) return;
      (l.parts || []).forEach((x) => { if (!used.includes(x)) used.push(x); });
    });
    if (!used.length || used.length >= (o.roster || []).length) return;
    o.roster = used;
    o.lines.forEach((l) => { if (/^全/.test(l.label || "")) l.parts = used.slice(); });
    o.sig = songSig(o);
  };

  const added = [];
  const lib = Array.isArray(d.lib) ? d.lib : null;
  (d.songs || []).forEach((sg) => {
    const src = lib ? (lib[sg.libIdx] || { lines: [] }) : sg;
    const o = Object.assign(buildSong(src), { groupId: S.groupId, showId: sg.showId || S.showId, take: sg.take || 1 });
    trimRoster(o);
    S.songs.push(o); added.push(o);
  });
  (d.songs || []).forEach((sg, i) => { if (sg.fromIdx != null && added[sg.fromIdx]) added[i].from = added[sg.fromIdx].id; });
  S.setlistVer = d.version || Date.now();
  if (d.src && d.src !== S.src) S.src = d.src;
  if (d.groupName) { const g = group(); if (g && g.id) g.name = d.groupName; S.srcGroup = d.groupName; }

  const mine = d.authorId && d.authorId === S.deviceId;
  if (!mine && !S.groups.some((g) => g.gistId)) S.viewer = true;

  if (mine) {
    S.pubNotes = [];
  } else {
    // 受け取り側は、届いた内容だけにする。公演も届いたものに置き換える。
    S.pubNotes = (d.notes || []).map((n) => {
      const so = S.songs[n.songIdx];
      if (!so) return null;
      const ids = (n.memberNames || []).map((nm) => addMember(nm).id);
      return Object.assign({}, n, { id: "p" + uid(), songId: so.id, memberIds: ids, ro: true });
    }).filter(Boolean);

    S.memos = {};
    (d.memos || []).forEach((m) => {
      const so = S.songs[m.songIdx];
      if (so) S.memos[m.showId + "|" + so.id] = m.text;
    });

    if (Array.isArray(d.shows)) {
      S.shows = d.shows.map((x) => Object.assign({}, x, {
        absent: (x.absent || []).map((nm) => addMember(nm).id),
      }));
    }
    S.gsubs = {};
    (d.gsubs || []).forEach((x) => {
      const so = S.songs[x.songIdx];
      if (!so) return;
      const k = x.showId + "|" + so.id;
      S.gsubs[k] = S.gsubs[k] || {};
      S.gsubs[k][x.block] = (x.names || []).map((nm) => addMember(nm).id);
    });
    S.subs = {};
    (d.subs || []).forEach((x) => {
      const so = S.songs[x.songIdx];
      if (!so) return;
      const k = x.showId + "|" + so.id;
      S.subs[k] = S.subs[k] || {};
      S.subs[k][x.lineIdx] = (x.names || []).map((nm) => addMember(nm).id);
    });
    // 曲も記録も無い公演は、そのグループに関係が無いので残さない
    S.shows = S.shows.filter((sw) =>
      S.songs.some((x) => x.showId === sw.id) || NOTES().some((n) => n.showId === sw.id));
    if (!S.shows.length) {
      const nid = uid();
      S.shows = [{ id: nid, name: todayLabel(), ts: Date.now() }];
    }
    const focus = d.focusShow && S.shows.some((x) => x.id === d.focusShow)
      ? d.focusShow
      : ((showsNewestFirst().filter((x) => !x.hidden)[0] || {}).id || "");
    if (focus) S.showId = focus;
    // 更新が届いたら、開いている画面に関係なく歌詞の1曲目に戻す
    U.view = "live";
    U.menu = null;
    U.sheet = null;
    U.overview = false;
    U.picker = false;
  }
  U.songIdx = 0;
  save(); render();
}

async function syncSetlist(manual) {
  const d = await fetchSetlist();
  if (d === "nokey" || d === "badkey") {
    if (d === "badkey") S.key = "";
    // 裏で回っている同期は15秒ごとなので、毎回聞くと使い物にならない。
    // 自動の時は最初の1回だけ。あとは画面の「合言葉を入れる」から入れてもらう。
    if (!manual && askedKey) { render(); return; }
    askedKey = true;
    const pw = prompt(d === "nokey"
      ? "合言葉を入れてください。"
      : "合言葉が違います。もう一度入れてください。", "");
    if (pw && pw.trim()) { S.key = pw.trim(); save(); askedKey = false; return syncSetlist(manual); }
    render();
    return;
  }
  if (!d || !d.songs.length) {
    if (d && !d.songs.length) syncErr = "配信に曲が入っていません。配信元で「今すぐ送信」を押してもらってください。";
    if (manual) alert(syncErr || "配信されているセットリストが見つかりませんでした。");
    render();
    return;
  }
  if (d.authorId && d.authorId === S.deviceId) {
    if (manual) alert("この端末が配信元です。手元の内容が最新です。");
    return;
  }
  if (!S.songs.length) { applySetlist(d); return; }
  // 別グループの配信につながっていたら、混ざらないよう丸ごと入れ替える
  if (d.groupName && S.srcGroup && d.groupName !== S.srcGroup) {
    resetForNewSource(); applySetlist(d); return;
  }
  // 受け取り側では確認を出さず、そのまま最新に入れ替える
  if (manual || (d.version && d.version !== S.setlistVer)) applySetlist(d);
  render();
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
  const payload = JSON.stringify({ src: g.src, key: "" });
  const url = location.origin + location.pathname + "#g=" + b64e(new TextEncoder().encode(payload));
  const msg = g.key
    ? `${g.name} の接続リンクをコピーしました。\n\n開くには合言葉が要ります。リンクとは別に伝えてください：\n${g.key}\n\n※ メンバーには「リンクを長押し→コピー→Safariに貼って開く」と伝えてください。`
    : `${g.name} の接続リンクをコピーしました。\n\n合言葉が未設定です。リンクを知っていれば誰でも開けます。\n\n※ メンバーには「リンクを長押し→コピー→Safariに貼って開く」と伝えてください。`;
  copyText(url, msg);
}

// URLに接続情報を持たせ続ける。
// こうしておくと、共有・ブックマーク・ホーム画面・別のブラウザ、どれで開いても繋がる。
function keepLinkInURL() {
  try {
    if (!S.linkSrc) return;
    if (S.groups.some((g) => g.gistId)) return;          // 配信元の端末では付けない
    // 合言葉はURLに入れない。
    // 入れてしまうと、メンバーがそのURLを共有・ブックマーク・スクショした時点で
    // 「リンクと合言葉を別々に渡す」という前提が崩れ、暗号化の意味が無くなる。
    const want = "#g=" + b64e(new TextEncoder().encode(JSON.stringify({ src: S.linkSrc })));
    if (location.hash !== want) history.replaceState(null, "", location.pathname + want);
  } catch (e) { /* 付けられなくても動く */ }
}

// メンバーの見え方を確かめる。手元のデータには一切触らない。
async function startPreview(src, key) {
  if (preview) return;
  preview = JSON.stringify(S);
  const keep = { src: S.src, key: S.key };
  S.src = src; S.key = key || "";
  const d = await fetchSetlist();
  if (!d || typeof d === "string" || !d.songs || !d.songs.length) {
    S.src = keep.src; S.key = keep.key;
    preview = null;
    alert(syncErr || "配信の中身を受け取れませんでした。");
    render();
    return;
  }
  S.groups = [{ id: uid(), name: d.groupName || "", gistId: "", src, key: key || "" }];
  S.groupId = S.groups[0].id;
  // 端末IDを変えておく。同じままだと「自分が書いたもの」と見なして記録が取り込まれない。
  S.deviceId = "preview-" + uid();
  S.songs = []; S.notes = []; S.pubNotes = []; S.memos = {}; S.shows = []; S.members = [];
  S.subs = {}; S.subsMan = {}; S.gsubs = {}; S.draws = {}; S.recs = {};
  S.viewer = true; S.recMode = false;
  applySetlist(d);
  U.view = "live"; U.songIdx = 0;
  render();
}
function endPreview() {
  if (!preview) return;
  const back = JSON.parse(preview);
  preview = null;
  Object.keys(S).forEach((k) => { delete S[k]; });
  Object.assign(S, back);
  U.view = "setup"; U.songIdx = 0;
  render();
}

// 別の端末で更新されていないか見に行く。
// 手元に変更が無ければそのまま取り込み、両方変わっていれば選んでもらう。
let otherAt = 0, syncing = false;
// その場で両方向に揃える
async function syncNow() {
  if (!S.ghToken) { alert("GitHubのトークンを入れてください。"); return; }
  if (!S.bkGistId) { alert("つなぎ先がありません。\n「つなぎ先を探す」を押すか、Macで「自分用リンクを作る」を使ってください。"); return; }
  U.busy = "揃えています…"; render();
  try {
    if (bkSignature() !== S.bkHash) await doBackup(true);   // こちらが新しければ送る
    await checkOther();                                      // 向こうが新しければ受け取る
    U.busy = ""; render();
    alert(otherAt
      ? "両方の端末に変更があります。\n上に出る案内から、どちらを採るか選んでください。"
      : `揃いました。\n公演${S.shows.length}件・曲${S.songs.length}件・記録${S.notes.length}件`);
  } catch (e) {
    U.busy = ""; render();
    alert("揃えられませんでした。\n" + ((e && e.message) || e));
  }
}

async function checkOther() {
  if (syncing || preview) return;
  if (!S.ghToken || !S.bkGistId) return;
  syncing = true;
  try {
    const g = await gh("/gists/" + S.bkGistId);
    const f = g.files && g.files["utacheck-backup.json"];
    if (!f) return;
    const obj = await unpackBackup(JSON.parse(f.content));
    const at = Number(obj.at || 0);
    if (at <= (S.bkSeen || 0)) { otherAt = 0; return; }
    const dirty = bkSignature() !== S.bkHash;
    if (!dirty) {
      const tk = S.ghToken, bk = S.bkGistId, bkk = S.bkKey, ep = S.editPass;
      Object.keys(S).forEach((k) => { delete S[k]; });
      Object.assign(S, fromBackup(obj.state));
      S.ghToken = tk; S.bkGistId = bk; S.bkKey = bkk; S.editPass = ep;
      S.bkSeen = at; S.bkAt = at; S.bkHash = bkSignature();
      save(); otherAt = 0; render();
      return;
    }
    otherAt = at;
    render();
  } catch (e) { /* 取れない時は次の機会に */ }
  finally { syncing = false; }
}
async function takeOther() {
  S.bkHash = bkSignature();
  S.bkSeen = 0;
  otherAt = 0;
  await checkOther();
}

/* ---- 自分用リンク：合言葉を入れれば、どの端末でも編集できる ---- */
async function editLink() {
  if (!S.ghToken) { alert("先にGitHubのトークンを入れてください。"); return; }
  if (!S.bkGistId) { await doBackup(true); }
  if (!S.bkGistId) { alert("先に「今すぐバックアップ」を押してください。"); return; }
  const pass = prompt("この端末用の合言葉を決めてください。\nリンクを開いた時にこれを聞かれます。", S.editPass || "");
  if (!pass || !pass.trim()) return;
  S.editPass = pass.trim(); save();
  const sealed = await sealJSON({ t: S.ghToken, b: S.bkGistId, k: S.bkKey || "" }, pass.trim());
  const url = location.origin + location.pathname + "#e=" +
    b64e(new TextEncoder().encode(JSON.stringify(sealed)));
  copyText(url, "自分用のリンクをコピーしました。\n\nMacやiPadで開いて、合言葉を入れれば編集できます。\n合言葉：" + pass.trim() + "\n\n※ 人には渡さないでください。");
}

async function openEditLink(raw) {
  let sealed;
  try { sealed = JSON.parse(new TextDecoder().decode(b64d(raw))); } catch (e) { alert("リンクを読めませんでした。"); return; }
  for (let i = 0; i < 3; i++) {
    const pass = prompt(i ? "合言葉が違います。もう一度入れてください。" : "合言葉を入れてください。", "");
    if (!pass) return;
    try {
      const o = await openJSON(sealed, pass.trim());
      if (!o.t || !o.b) throw new Error("形式");
      S.ghToken = o.t; S.bkGistId = o.b; S.bkKey = o.k || ""; S.editPass = pass.trim();
      save();
      await restoreBackup(true);
      return;
    } catch (e) { /* もう一度 */ }
  }
}


async function importFromLink() {
  const e = location.hash.match(/^#e=(.+)$/);
  if (e) { await openEditLink(e[1]); return; }
  const g = location.hash.match(/^#g=(.+)$/);
  if (!g) return;
  // URLから消さない。消すと「Safariで開く」に接続情報が渡らない。
  try {
    const before = S.src;
    let src = "", key = "";
    const txt = new TextDecoder().decode(b64d(g[1]));
    if (txt.charAt(0) === "{") { const o = JSON.parse(txt); src = o.src || ""; key = o.key || ""; }
    else src = txt; // 旧いリンク
    if (S.linkSrc === src && S.songs.length) {
      // 同じリンクで開き直しただけ。記録を消さないよう、取り込み直さない。
      if (key && !S.key) { S.key = key; save(); }
      keepLinkInURL();
      await syncSetlist(false);
      return;
    }
    if (S.groups.some((x) => x.gistId)) {
      // この端末は配信元。手元を壊さないよう、確認モードで開く。
      if (confirm("この端末は配信元です。\nメンバーの見え方を確かめますか？\n\n手元のデータは変わりません。")) {
        await startPreview(src, key);
      }
      return;
    }
    const changed = S.linkSrc && S.linkSrc !== src;
    S.linkSrc = src; S.src = src;
    // 古い形式のリンクは合言葉を持っている。持っていないリンクで上書きして消さない。
    if (key) S.key = key;
    else if (changed) S.key = "";   // 別のグループにつなぎ直した時だけ捨てる
    if (!S.groups.some((x) => x.gistId)) {
      S.viewer = true;
      if (changed) resetForNewSource(); // 別グループのリンク
    }
    S.setlistVer = 0; save();
    keepLinkInURL();
    await syncSetlist(true);
  } catch (e) { alert("接続リンクを読み取れませんでした。"); }
}

function copyText(t, msg) {
  const done = () => alert(msg || "コピーしました");
  if (navigator.clipboard) { navigator.clipboard.writeText(t).then(done).catch(done); return; }
  const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta);
  ta.select(); document.execCommand("copy"); ta.remove(); done();
}

/* ---------------- 画面の大きさを調べる（表示には使わない） ---------------- */
// 高さは CSS の inset で決める。ここでは、うまく合わない時の手がかりを控えるだけ。
let vpInfo = "";
function readViewport() {
  try {
    const el = document.getElementById("app");
    const r = el ? el.getBoundingClientRect() : null;
    const sc = window.screen || {};
    let safeT = "-", safeB = "-";
    const pr = document.getElementById("safeprobe");
    if (pr && window.getComputedStyle) {
      const cs = window.getComputedStyle(pr);
      safeT = parseInt(cs.paddingTop, 10) || 0;
      safeB = parseInt(cs.paddingBottom, 10) || 0;
    }
    vpInfo = `内 ${Math.round(window.innerHeight || 0)}`
      + ` / 実 ${r ? Math.round(r.height) : "-"}`
      + ` / 画面 ${Math.round(sc.width || 0)}x${Math.round(sc.height || 0)}`
      + ` / 余白 上${safeT} 下${safeB}`
      + ` / 比 ${window.devicePixelRatio || "-"}`;
  } catch (e) { vpInfo = "測れません"; }
}

readViewport();
window.addEventListener("resize", readViewport);
window.addEventListener("orientationchange", () => setTimeout(readViewport, 250));
setTimeout(readViewport, 400);


/* ---------------- boot ---------------- */
(async () => {
  await load();
  booted = true;
  // 前まで localStorage に置いていた分は、IndexedDB へ引っ越す。
  // 移し終えてから消すので、途中で止まっても元は残る。
  if (idbOK) {
    try {
      const old = localStorage.getItem(KEY);
      if (old) {
        await saveNow();
        const back = await idbGet("state:" + (saveSeq % 2));
        if (back && back.txt) localStorage.removeItem(KEY);
      }
    } catch (e) { /* 引っ越せなくても、IndexedDB側で動く */ }
  }
  render();
  importFromLink();
  syncSetlist(false);
})();
window.addEventListener("pagehide", () => { commitFields(); save(); saveNow(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { commitFields(); save(); saveNow(); } });
if ("serviceWorker" in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return; reloaded = true; location.reload();
  });
  navigator.serviceWorker.register("sw.js?v=" + APP_VER).then((r) => r.update()).catch(() => {});
}
