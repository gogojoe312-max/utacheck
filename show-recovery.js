/* Recover one missing performance without replacing newer work or connection settings. */
const ShowRecovery = (() => {
  const clone = x => JSON.parse(JSON.stringify(x));
  const dictionaries = ["memos", "staffMemos", "draws", "subs", "subsMan", "gsubs"];
  const normalize = x => String(x || "").normalize("NFKC").replace(/\s/g, "").toLowerCase();
  function find(state, query) {
    const q = normalize(query);
    return (state.shows || []).filter(sw => !sw.hidden && q && normalize(sw.name + " " + (sw.folder || "")).includes(q));
  }
  function snapshot(state, id) {
    const show = (state.shows || []).find(sw => sw.id === id);
    if (!show) throw new Error("公演が見つかりません。");
    const songs = (state.songs || []).filter(so => so.showId === id), ids = new Set(songs.map(so => so.id));
    const out = {shows:[show], songs, notes:(state.notes || []).filter(n => n.showId === id && ids.has(n.songId)),
      groups:(state.groups || []).map(g => ({id:g.id, name:g.name, nopub:g.nopub})), members:state.members || []};
    for (const key of dictionaries) out[key] = Object.fromEntries(Object.entries(state[key] || {}).filter(([k]) => {
      const [sid, song] = k.split("|"); return sid === id && ids.has(song);
    }));
    return clone(out);
  }
  function restore(current, state, id, makeId) {
    if (current.shows.some(sw => sw.id === id)) throw new Error("同じ公演がすでにあります。保存済みの公演を開いてください。");
    const data = snapshot(state, id), sw = data.shows[0];
    const next = {...current};
    for (const key of ["shows", "songs", "notes", "members", "groups"]) next[key] = [...(current[key] || [])];
    const mapGroups = new Map(), mapMembers = new Map(), mapSongs = new Map();
    const fresh = list => { let id; do { id = makeId(); } while (list.some(x => x.id === id)); return id; };
    for (const g of data.groups) {
      let same = next.groups.find(x => x.id === g.id && x.name === g.name) || next.groups.find(x => x.name === g.name);
      if (!same) { same = {...g,id:next.groups.some(x => x.id === g.id) ? fresh(next.groups) : g.id}; next.groups.push(same); }
      mapGroups.set(g.id, same.id);
    }
    for (const m of data.members) {
      let same = next.members.find(x => x.name === m.name);
      if (!same) { same = {...m,id:next.members.some(x => x.id === m.id) ? fresh(next.members) : m.id}; next.members.push(same); }
      mapMembers.set(m.id, same.id);
    }
    const ids = list => (list || []).map(id => {
      if (!mapMembers.has(id)) throw new Error("担当メンバーの情報が欠けています。別の履歴を選んでください。");
      return mapMembers.get(id);
    });
    const route = obj => {
      if (obj.groupId) obj.groupId = mapGroups.get(obj.groupId) || "";
      if (obj.deliveryGroupId) obj.deliveryGroupId = mapGroups.get(obj.deliveryGroupId) || "";
    };
    for (const so of data.songs) {
      const old = so.id; so.id = next.songs.some(x => x.id === old) ? fresh(next.songs) : old;
      mapSongs.set(old, so.id); route(so);
      so.roster = ids(so.roster);
      so.blocks = Object.fromEntries(Object.entries(so.blocks || {}).map(([k,v]) => [k,ids(v)]));
      for (const line of so.lines || []) for (const key of ["parts", "main", "extra"]) if (line[key]) line[key] = ids(line[key]);
      next.songs.push(so);
    }
    for (const so of data.songs) { if (so.from) { if (mapSongs.has(so.from)) so.from = mapSongs.get(so.from); else delete so.from; } }
    for (const n of data.notes) {
      n.id = fresh(next.notes); n.songId = mapSongs.get(n.songId); n.memberIds = ids(n.memberIds); next.notes.push(n);
    }
    route(sw); sw.absent = ids(sw.absent); sw.nopub = true; next.shows.push(sw);
    for (const key of dictionaries) {
      next[key] = {...(current[key] || {})};
      for (const [k,v] of Object.entries(data[key])) {
        const songId = mapSongs.get(k.split("|")[1]);
        const value = ["subs", "gsubs"].includes(key) ? Object.fromEntries(Object.entries(v).map(([i,p]) => [i,ids(p)])) : v;
        next[key][id + "|" + songId] = value;
      }
    }
    next.folders = {...current.folders}; if (sw.folder) next.folders[sw.folder] = true;
    next.folderOrder = [...(current.folderOrder || [])]; if (sw.folder && !next.folderOrder.includes(sw.folder)) next.folderOrder.push(sw.folder);
    next.showId = id;
    return next;
  }
  function add(state, label, at) {
    const r = U.showRecovery;
    for (const sw of find(state, r.query)) {
      const data = snapshot(state, sw.id);
      const existing = r.items.find(x => x.show.id === sw.id && x.label === label);
      if (existing && existing.data.songs.length >= data.songs.length && existing.data.notes.length >= data.notes.length) continue;
      if (existing) r.items.splice(r.items.indexOf(existing), 1);
      r.items.push({show:data.shows[0],data,label,at});
    }
  }
  function open() {
    if (VIEW()) return;
    U.showRecovery = {query:"",items:[],errors:[],queue:[],running:false,status:"公演名を入力すると、全グループとゴミ箱・保存履歴を調べます。"};
    U.menu = {kind:"show-recovery"}; renderSheet();
  }
  function html() {
    const r = U.showRecovery;
    return `<button class="sp" data-act="recovery-close" aria-label="閉じる"></button><div class="sheet organize-sheet" role="dialog" aria-modal="true" aria-label="公演を探す・復元">
      <div class="row"><b class="grow">公演を探す・復元</b><button class="chip" data-act="recovery-close">閉じる</button></div>
      <form id="show-recovery-form"><label class="organize-field">公演名<input class="field" id="recovery-query" value="${h(r.query)}" placeholder="例：リリイベ" ${r.running ? "disabled" : ""} required></label>
      <button class="primary" ${r.running ? "disabled" : ""}>${r.running ? "探しています…" : "保存データと履歴を探す"}</button></form>
      <p role="status" class="note" style="margin:12px 0">${h(r.status)}</p>
      ${r.items.map((x,i) => { const present = S.shows.some(sw => sw.id === x.show.id); return `<div class="card"><b>${h(x.show.name)}</b><p class="note">${h(x.label)}${x.at ? " ・ " + h(new Date(x.at).toLocaleString("ja-JP")) : ""}<br>${x.data.songs.length}曲 ・ 指摘${x.data.notes.length}件</p>
        <button class="primary" data-act="recovery-use" data-i="${i}" ${r.running ? "disabled" : ""}>${present ? "保存済みの公演を開く" : "この公演だけ復元"}</button></div>`; }).join("")}
      ${r.queue.length && !r.running ? '<button class="ghost" data-act="recovery-more">さらに古い履歴を探す</button>' : ""}
      ${r.errors.length ? `<details><summary>確認できなかった保存先（${r.errors.length}件）</summary>${r.errors.map(e => `<p class="note">${h(e)}</p>`).join("")}</details>` : ""}
      <p class="note">ほかの公演・指摘は変更しません。復元した公演は配信停止で追加します。グループを確認してから配信を有効にしてください。音声や元Excelが端末に残っていない場合、そのファイルは戻りません。</p></div>`;
  }
  function refresh() { if (U.menu?.kind === "show-recovery") renderSheet(); }
  async function search(query) {
    const r = U.showRecovery; if (!r || r.running || !query.trim()) return;
    Object.assign(r,{query:query.trim(),items:[],errors:[],queue:[],running:true,status:"端末の保存データを確認しています…"}); refresh();
    try {
      add(S,"この端末に保存済み",0);
      for (const t of S.trash || []) add({...S,...t,groups:S.groups,members:S.members},"ゴミ箱",t.at);
      for (const key of ["state:0","state:1"]) try {
        const raw = await idbGet(key); if (raw?.txt) add(unpackState(JSON.parse(raw.txt)),"端末の保存履歴",raw.at);
      } catch (e) { r.errors.push("端末の保存履歴：" + e.message); }
      try {
        for (let i=0;i<localStorage.length;i++) {
          const key = localStorage.key(i);
          if (key === KEY || key.startsWith(KEY + ":")) try { add(unpackState(JSON.parse(localStorage.getItem(key))),"端末の旧データ",0); } catch (e) { r.errors.push("端末の旧データ：" + e.message); }
        }
      } catch (e) { r.errors.push("端末の旧データを開けませんでした。"); }
      if (S.ghToken) {
        r.status = "クラウドの保存履歴を確認しています…"; refresh();
        let list = [];
        try { list = await gh("/gists?per_page=100",{signal:AbortSignal.timeout(30000)}); }
        catch (e) { r.errors.push("クラウドの一覧：" + e.message); }
        const sources = [...new Set([S.bkGistId,...list.filter(g => backupIndexFile(g.files)).map(g => g.id)].filter(Boolean))];
        for (const id of sources) try {
          const full = await gh("/gists/" + id,{signal:AbortSignal.timeout(30000)});
          r.queue.push({id,files:full.files,at:full.updated_at});
          for (const v of (full.history || []).slice(1)) r.queue.push({id,sha:v.version,at:v.committed_at});
        } catch (e) { r.errors.push("クラウド保存先：" + e.message); }
        r.queue.sort((a,b) => new Date(b.at) - new Date(a.at));
      }
    } catch (e) { r.errors.push(e.message || String(e)); }
    r.running = false;
    await more();
  }
  async function more() {
    const r = U.showRecovery; if (!r || r.running) return;
    r.running = true;
    const keepPass = S.bkKey;
    try {
      for (let n=0;n<12 && r.queue.length;n++) {
        if (U.showRecovery !== r) return;
        const item = r.queue.shift(); r.status = `保存履歴を確認しています（今回${n+1}件目）…`; refresh();
        try {
          const files = item.files || (await gh("/gists/" + item.id + "/" + item.sha,{signal:AbortSignal.timeout(30000)})).files;
          if (!backupIndexFile(files)) continue;
          const obj = await unpackWithPass(await readCloudBackup(files),keepPass,true);
          if (!obj?.state) throw new Error("保存データの形式が違います。");
          add(fromBackup(obj.state),"クラウドの保存履歴",obj.at || item.at);
          if (r.items.some(x => !S.shows.some(sw => sw.id === x.show.id))) break;
        } catch (e) { r.errors.push(new Date(item.at).toLocaleString("ja-JP") + "：" + (e.badKey ? "保存済みの合言葉では開けません。" : e.message)); }
        finally { S.bkKey = keepPass; }
      }
    } finally {
      r.running = false;
      r.status = r.items.length ? `${r.items.length}件見つかりました。公演名と曲数を確認してください。`
        : r.queue.length ? "ここまでの履歴には見つかりません。さらに古い履歴も探せます。"
        : "確認できた保存データには見つかりませんでした。別の端末のバックアップがあれば、そこも確認できます。";
      if (!S.ghToken) r.status += " クラウドは未接続のため、端末内だけ確認しました。";
      refresh();
    }
  }
  function use(i) {
    const r = U.showRecovery, item = r?.items[i]; if (!item || r.running || VIEW()) return;
    try {
      if (!S.shows.some(sw => sw.id === item.show.id)) {
        const next = restore(S,item.data,item.show.id,uid); Object.assign(S,next); save();
      }
      U.showFilter = ""; U.showRecovery = null; U.menu = null; U.view = "setup";
      selectShow(item.show.id); if (item.show.folder) S.folders[item.show.folder] = true; render();
    } catch (e) { r.status = "復元できませんでした：" + e.message; refresh(); }
  }
  document.addEventListener("submit",e => {
    if (e.target.id !== "show-recovery-form") return;
    e.preventDefault(); const q = document.getElementById("recovery-query").value;
    document.activeElement?.blur(); search(q);
  });
  document.addEventListener("click",e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "show-recovery") open();
    if (b.dataset.act === "recovery-more") more();
    if (b.dataset.act === "recovery-use") use(Number(b.dataset.i));
    if (b.dataset.act === "recovery-close") {
      if (U.showRecovery?.running) { U.showRecovery.status = "確認が終わるまでお待ちください。"; refresh(); return; }
      U.showRecovery = null; U.menu = null; renderSheet();
    }
  });
  return {find,snapshot,restore,html};
})();
