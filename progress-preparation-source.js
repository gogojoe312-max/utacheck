/* Reuse only the explicitly configured, same-origin 進行 connection. The
 * credential stays in this read call; only the validated preparation is returned. */
(function (root) {
  'use strict';
  const OWNER = 'gogojoe312-max', REPO = 'shinkou-data';
  const STORAGE_TIMEOUT_MS = 3000;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const unavailable = code => ({status:'unavailable', code});
  const validToken = token => typeof token === 'string' && token.length > 0 && token.length <= 8192 && !/[\x00-\x20\x7f]/.test(token);

  function connection(state) {
    if (object(state) && state.enc) return {code:'PROGRESS_LOCKED'};
    if (!object(state) || !object(state.settings) || state.settings.sync == null) return {code:'PROGRESS_UNLINKED', missing:true};
    const c = state.settings.sync;
    if (!object(c) || c.on !== true || c.owner !== OWNER || c.repo !== REPO
        || c.path !== 'data.json' || (c.branch || 'main') !== 'main' || !validToken(c.token)) return {code:'PROGRESS_UNLINKED'};
    // Copy only the connection fields. Song data, backups and other settings
    // never leave the one state-record read or participate in credential lookup.
    return {token:c.token, snapshot:JSON.stringify([c.on,c.owner,c.repo,c.path,c.branch || 'main',c.token])};
  }

  function readConnection(active) {
    return new Promise(resolve => {
      let db, request, settled = false, absent = false;
      const done = value => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        try { db?.close(); } catch (_) {}
        resolve(value);
      };
      const timer = setTimeout(() => done({code:'PROGRESS_STORAGE_UNAVAILABLE'}), STORAGE_TIMEOUT_MS);
      try {
        if (!active()) { done({code:'INACTIVE'}); return; }
        if (!root.indexedDB || typeof root.indexedDB.open !== 'function') { done({code:'PROGRESS_STORAGE_UNAVAILABLE'}); return; }
        request = root.indexedDB.open('shinkou');
        request.onupgradeneeded = () => {
          // Opening an absent database must not create one or alter its schema.
          absent = true;
          try { request.transaction.abort(); } catch (_) {}
          try { request.result.close(); } catch (_) {}
        };
        request.onerror = () => done(absent ? {code:'PROGRESS_UNLINKED', missing:true} : {code:'PROGRESS_STORAGE_UNAVAILABLE'});
        request.onblocked = () => done({code:'PROGRESS_STORAGE_UNAVAILABLE'});
        request.onsuccess = () => {
          db = request.result;
          if (settled) { db.close(); return; }
          if (!active()) { done({code:'INACTIVE'}); return; }
          if (!db.objectStoreNames.contains('kv')) { done({code:'PROGRESS_UNLINKED', missing:true}); return; }
          try {
            const transaction = db.transaction('kv', 'readonly');
            const state = transaction.objectStore('kv').get('state');
            let result;
            state.onsuccess = () => { result = connection(state.result); };
            state.onerror = () => done({code:'PROGRESS_STORAGE_UNAVAILABLE'});
            transaction.onabort = transaction.onerror = () => done({code:'PROGRESS_STORAGE_UNAVAILABLE'});
            transaction.oncomplete = () => done(active() ? result || {code:'PROGRESS_STORAGE_UNAVAILABLE'} : {code:'INACTIVE'});
          } catch (_) { done({code:'PROGRESS_STORAGE_UNAVAILABLE'}); }
        };
      } catch (_) { done({code:'PROGRESS_STORAGE_UNAVAILABLE'}); }
    });
  }

  async function read(options = {}) {
    if (!object(options) || options.owner !== OWNER || options.repo !== REPO
        || (options.isActive !== undefined && typeof options.isActive !== 'function')) return unavailable('INVALID_CONFIG');
    const active = () => {
      try { return !options.signal?.aborted && (!options.isActive || options.isActive() === true); }
      catch (_) { return false; }
    };
    if (!active()) return unavailable(options.signal?.aborted ? 'ABORTED' : 'INACTIVE');
    const before = await readConnection(active);
    if (!active()) return unavailable(options.signal?.aborted ? 'ABORTED' : 'INACTIVE');
    // An absent connection may retain the existing 歌チェック source. A locked,
    // disabled or different 進行 connection never triggers a credential fallback.
    if (before.code && (!before.missing || !validToken(options.token))) return unavailable(before.code);
    const token = before.token || options.token;
    const source = root.PrivatePreparationSource || (typeof module !== 'undefined' && module.exports ? require('./private-preparation-source.js') : null);
    if (typeof source?.read !== 'function') return unavailable('UNSUPPORTED');
    let result;
    try {
      result = await source.read({owner:OWNER, repo:REPO, token, fetch:options.fetch, signal:options.signal, isActive:active});
    } catch (_) { return unavailable('FETCH_FAILED'); }
    if (!active()) return unavailable(options.signal?.aborted ? 'ABORTED' : 'INACTIVE');
    const after = await readConnection(active);
    if (!active()) return unavailable(options.signal?.aborted ? 'ABORTED' : 'INACTIVE');
    if (before.snapshot ? after.snapshot !== before.snapshot : !after.missing) return unavailable('INACTIVE');
    // The saved progress login can prove the owner even when its repository
    // permission cannot read the preparation file. Keep that same credential
    // inside this call; the caller's unrelated Gist login is not a substitute.
    if (before.snapshot && result.status !== 'ready' && typeof root.PreparationRelaySource?.read === 'function'
        && !['ABORTED','INACTIVE','OWNER_MISMATCH','INVALID_CONFIG'].includes(result.code)) {
      try { result = await root.PreparationRelaySource.read({owner:OWNER,repo:REPO,token,fetch:options.fetch,signal:options.signal,isActive:active}); }
      catch (_) { return unavailable('FETCH_FAILED'); }
      if (!active()) return unavailable(options.signal?.aborted ? 'ABORTED' : 'INACTIVE');
      const confirmed = await readConnection(active);
      if (!active()) return unavailable(options.signal?.aborted ? 'ABORTED' : 'INACTIVE');
      if (confirmed.snapshot !== before.snapshot) return unavailable('INACTIVE');
    }
    return result;
  }

  const api = Object.freeze({read});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ProgressPreparationSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
