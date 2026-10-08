/* Read an owner's already-authorized private preparation source. No storage,
 * writes, token discovery, credential creation, or public/member fallback. */
(function (root) {
  'use strict';
  const ORIGIN = 'https://api.github.com';
  const PATH = 'utacheck/prepared.json';
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const META_BYTES = 64 * 1024;
  const TIMEOUT_MS = 20000;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  function fail(code) { const error = new Error(code); error.preparationSourceCode = code; throw error; }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function config(owner, repo) {
    return typeof owner === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)
      && typeof repo === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(repo) && !['.', '..'].includes(repo);
  }
  async function bytes(response, maximum, active) {
    const header = response.headers?.get?.('content-length');
    if (header !== null && header !== undefined && (!/^\d+$/.test(header) || Number(header) > maximum)) fail('RESPONSE_TOO_LARGE');
    if (!response.body || typeof response.body.getReader !== 'function') fail('BODY_UNREADABLE');
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
      while (true) {
        active();
        const chunk = await reader.read();
        active();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) fail('BODY_UNREADABLE');
        length += chunk.value.byteLength;
        if (length > maximum) fail('RESPONSE_TOO_LARGE');
        chunks.push(chunk.value);
      }
    } catch (error) {
      try { await reader.cancel(); } catch (_) {}
      throw error;
    } finally { reader.releaseLock(); }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    return data;
  }
  async function read(options = {}) {
    if (!object(options)) return {status:'unavailable', code:'INVALID_CONFIG'};
    const {token, owner, repo, signal, isActive} = options;
    if (token === undefined || token === null || token === '') return {status:'unavailable', code:'MISSING_TOKEN'};
    if (typeof token !== 'string' || token.length > 8192 || /[\x00-\x20\x7f]/.test(token) || !config(owner, repo)
        || (isActive !== undefined && typeof isActive !== 'function')) return {status:'unavailable', code:'INVALID_CONFIG'};
    const requestFetch = options.fetch || root.fetch;
    if (typeof requestFetch !== 'function' || typeof root.AbortController !== 'function'
        || typeof root.TextDecoder !== 'function' || typeof root.atob !== 'function') return {status:'unavailable', code:'UNSUPPORTED'};
    const controller = new root.AbortController();
    let timedOut = false, timer;
    const abort = () => controller.abort();
    const active = () => {
      if (timedOut) fail('TIMEOUT');
      if (signal?.aborted || controller.signal.aborted) fail('ABORTED');
      if (isActive && !isActive()) fail('INACTIVE');
    };
    try {
      if (signal) {
        if (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') fail('INVALID_CONFIG');
        signal.addEventListener('abort', abort, {once:true});
      }
      active();
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
      const request = async (path, maximum, accept = 'application/vnd.github+json') => {
        active();
        const url = ORIGIN + path;
        const response = await requestFetch(url, {method:'GET', credentials:'omit', cache:'no-store', redirect:'error', signal:controller.signal,
          headers:{Accept:accept, Authorization:'Bearer ' + token, 'X-GitHub-Api-Version':'2022-11-28'}});
        active();
        if (!response || !Number.isInteger(response.status)) fail('INVALID_RESPONSE');
        if (response.redirected || (response.url && response.url !== url)) fail('REDIRECTED');
        if (response.status !== 200) fail('HTTP_' + response.status);
        const raw = await bytes(response, maximum, active);
        let value;
        try { value = JSON.parse(new root.TextDecoder('utf-8', {fatal:true}).decode(raw)); }
        catch (_) { fail('INVALID_JSON'); }
        if (!object(value)) fail('INVALID_RESPONSE');
        return value;
      };
      const identity = await request('/user', META_BYTES);
      if (typeof identity.login !== 'string' || identity.login.toLowerCase() !== owner.toLowerCase()) fail('OWNER_MISMATCH');
      const prefix = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
      const repository = await request(prefix, META_BYTES);
      if (repository.private !== true) fail('REPOSITORY_NOT_PRIVATE');
      if (typeof repository.full_name !== 'string' || repository.full_name.toLowerCase() !== (owner + '/' + repo).toLowerCase()
          || typeof repository.owner?.login !== 'string' || repository.owner.login.toLowerCase() !== owner.toLowerCase()) fail('REPOSITORY_MISMATCH');
      const file = await request(prefix + '/contents/' + PATH, MAX_BYTES, 'application/vnd.github.object+json');
      if (file.type !== 'file' || file.path !== PATH || file.name !== 'prepared.json' || !['base64','none'].includes(file.encoding)
          || file.truncated === true || own(file, 'target') || own(file, 'submodule_git_url')) fail('INVALID_FILE');
      if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES) fail('INVALID_FILE_SIZE');
      if (typeof file.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(file.sha)) fail('INVALID_FILE_SHA');
      let blob = file;
      if (file.encoding === 'none') {
        if (file.content !== '') fail('INVALID_FILE_CONTENT');
        // Large files have metadata only. Fetch this exact immutable blob from
        // the already-verified repository; never follow a supplied content URL.
        blob = await request(prefix + '/git/blobs/' + file.sha, MAX_BYTES);
        if (blob.sha !== file.sha || blob.size !== file.size || blob.encoding !== 'base64' || blob.truncated === true) fail('BLOB_MISMATCH');
      }
      if (typeof blob.content !== 'string' || blob.content.length > MAX_BYTES) fail('INVALID_FILE_CONTENT');
      const encoded = blob.content.replace(/[\r\n]/g, '');
      if (!encoded || encoded.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail('INVALID_BASE64');
      let decoded;
      try { decoded = root.atob(encoded); } catch (_) { fail('INVALID_BASE64'); }
      if (decoded.length !== file.size || decoded.length > MAX_FILE_BYTES) fail('FILE_SIZE_MISMATCH');
      active();
      let manifest;
      try { manifest = JSON.parse(new root.TextDecoder('utf-8', {fatal:true}).decode(Uint8Array.from(decoded, char => char.charCodeAt(0)))); }
      catch (_) { fail('INVALID_MANIFEST_JSON'); }
      if (!object(manifest)) fail('INVALID_MANIFEST');
      active();
      return {status:'ready', manifest, sourceSha:file.sha, sourcePath:PATH};
    } catch (error) {
      return {status:'unavailable', code:timedOut ? 'TIMEOUT' : signal?.aborted ? 'ABORTED' : error?.preparationSourceCode || 'FETCH_FAILED'};
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (typeof signal?.removeEventListener === 'function') signal.removeEventListener('abort', abort);
      controller.abort();
    }
  }
  const api = Object.freeze({read});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PrivatePreparationSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
