/* Private recording-addition inbox. Disabled until explicit device enrollment. */
(function (root) {
  'use strict';
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const fields = ['groups', 'members', 'rsongs', 'rosters', 'plan'];
  const fail = code => { throw new Error(code); };
  const clone = value => JSON.parse(JSON.stringify(value));
  const configKey = 'utacheck:recording-inbox:device-v1';
  function configuration(value) {
    if (!value || typeof value.endpoint !== 'string' || typeof value.token !== 'string') fail('ENROLLMENT_REQUIRED');
    let url; try { url = new URL(value.endpoint); } catch (_) { fail('INVALID_ENDPOINT'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) fail('INVALID_ENDPOINT');
    if (!value.token || /[\s\x00-\x1f\x7f]/.test(value.token)) fail('INVALID_DEVICE_TOKEN');
    return {endpoint:url.origin, token:value.token};
  }
  async function packetHash(packet, cryptoProvider = root.crypto) {
    const bytes = new TextEncoder().encode(JSON.stringify(packet));
    if (bytes.length > 4 * 1024 * 1024) fail('INVALID_OPERATION');
    const digest = await cryptoProvider.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  }
  function applyOperation(current, operation, merge, now) {
    const {operationId, hash, packet} = operation;
    if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(operationId) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) fail('INVALID_OPERATION');
    const ledger = current.cloudAdditions || {};
    if (typeof ledger !== 'object' || Array.isArray(ledger)) fail('INVALID_RECEIPTS');
    if (own(ledger, operationId)) {
      if (!ledger[operationId] || ledger[operationId].hash !== hash) fail('OPERATION_ID_REUSED');
      return {status:'already-applied-local', state:current};
    }
    let result;
    try { result = merge(current, packet); } catch (_) { fail('ADDITION_CONFLICT'); }
    // Replace only the merger's five append-only fields. Unknown state stays intact.
    const next = {...current};
    for (const key of fields) next[key] = result.state[key];
    next.cloudAdditions = {...ledger, [operationId]:{hash, at:now}};
    return {...result, state:next, status:'applied-local'};
  }
  // Adapter for the app's real save()/saveNow()/saveErr contract. A failed or
  // uncertain save is never rolled back over edits made while IndexedDB awaited.
  function createLocalAdapter(hooks) {
    return {
      async apply(operation) {
        const release = hooks.acquire();
        if (!release) fail('EDITOR_BUSY');
        try {
          hooks.commitFields();
          const current = hooks.getState();
          const result = applyOperation(current, operation, hooks.merge, hooks.now ? hooks.now() : Date.now());
          if (result.state !== current) {
            for (const key of [...fields, 'cloudAdditions']) current[key] = result.state[key];
          }
          // Always flush retries too: an in-memory receipt may follow a failed save.
          hooks.save();
          await hooks.saveNow();
          if (hooks.hasSaveError() || hooks.getState() !== current
              || current.cloudAdditions?.[operation.operationId]?.hash !== operation.hash) fail('LOCAL_SAVE_UNCONFIRMED');
          // saveErr=false can mean a localStorage fallback hidden by older IDB.
          // Require the receipt in the snapshot that an actual restart would load.
          let verified = false;
          try { verified = await hooks.verifySaved(operation); } catch (_) { /* fail closed */ }
          if (!verified || hooks.getState() !== current
              || current.cloudAdditions?.[operation.operationId]?.hash !== operation.hash) fail('LOCAL_SAVE_UNCONFIRMED');
          hooks.render();
          return {status:result.status, songs:result.songs, slots:result.slots};
        } finally { release(); }
      },
    };
  }
  // The integration wraps every async whole-state replacement with this gate.
  // Ordinary synchronous edits can continue; saving flushes their latest state.
  function createGate(canApply = () => true) {
    let editors = 0, applying = false;
    return {
      get applying() { return applying; },
      get activeEditors() { return editors; },
      acquire() {
        if (applying || editors || !canApply()) return null;
        applying = true;
        return () => { applying = false; };
      },
      acquireEditor() {
        if (applying) return null;
        editors++;
        return () => { editors--; };
      },
      wrapEditor(work) {
        const gate = this;
        return async function (...args) {
          const release = gate.acquireEditor();
          if (!release) return false;
          try { return await work.apply(this, args); }
          finally { release(); }
        };
      },
    };
  }
  function create(options) {
    const storage = options.storage;
    const fetcher = options.fetch || root.fetch.bind(root);
    const timers = options.timers || root;
    const emit = status => { if (options.onStatus) options.onStatus(status); return status; };
    let config = null, generation = 0, busy = false, timer = null;
    try { const saved = storage.getItem(configKey); if (saved) config = configuration(JSON.parse(saved)); } catch (_) { /* remain disabled */ }
    async function request(conf, path, body) {
      const controller = new AbortController();
      let timeout;
      const stopped = new Promise((_, reject) => {
        timeout = timers.setTimeout(() => { controller.abort(); reject(new Error('INBOX_UNAVAILABLE')); }, 30000);
      });
      try {
        return await Promise.race([stopped, (async () => {
          const response = await fetcher(conf.endpoint + path, {
            method:body === undefined ? 'GET' : 'POST',
            headers:{Authorization:'Bearer ' + conf.token, Accept:'application/json', ...(body === undefined ? {} : {'Content-Type':'application/json'})},
            ...(body === undefined ? {} : {body:JSON.stringify(body)}),
            signal:controller.signal, credentials:'omit', redirect:'error', cache:'no-store', referrerPolicy:'no-referrer',
          });
          if (!response.ok) fail(response.status === 401 || response.status === 403 ? 'DEVICE_AUTH_REQUIRED' : 'INBOX_UNAVAILABLE');
          const text = await response.text();
          if (text.length > 4 * 1024 * 1024) fail('INVALID_OPERATION');
          return JSON.parse(text);
        })()]);
      } finally { timers.clearTimeout(timeout); }
    }
    async function receive() {
      if (!config) return emit({status:'not-enrolled'});
      if (busy || (options.canPoll && !options.canPoll())) return {status:'busy'};
      const conf = config, epoch = generation;
      const stillEnrolled = () => { if (epoch !== generation || conf !== config) fail('ENROLLMENT_CHANGED'); };
      busy = true;
      let saved = false, operationId;
      try {
        const envelope = await request(conf, '/v1/inbox');
        stillEnrolled();
        if (!envelope || !own(envelope, 'operation')) fail('INVALID_OPERATION');
        if (envelope.operation === null) return emit({status:'idle'});
        // Copy before asynchronous hashing so the validated packet cannot change.
        const operation = clone(envelope.operation);
        operationId = operation.operationId;
        if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(operationId) || !/^[a-f0-9]{64}$/.test(operation.hash || '')
            || operation.approval?.source !== 'authenticated-submit') fail('INVALID_OPERATION');
        if (await packetHash(operation.packet, options.crypto || root.crypto) !== operation.hash) fail('INVALID_OPERATION');
        stillEnrolled();
        // Provenance is this authenticated configured endpoint, never the marker alone.
        const result = await options.local.apply(operation);
        saved = true;
        stillEnrolled();
        const ack = await request(conf, '/v1/inbox/' + encodeURIComponent(operationId) + '/ack', {hash:operation.hash});
        if (ack.operationId !== operationId || ack.hash !== operation.hash || ack.status !== 'applied-local') fail('ACK_UNCONFIRMED');
        return emit({...result, operationId, cloudStatus:'not-confirmed', memberStatus:'not-requested'});
      } catch (error) {
        const allowed = ['EDITOR_BUSY', 'LOCAL_SAVE_UNCONFIRMED', 'ADDITION_CONFLICT', 'INVALID_OPERATION', 'INVALID_RECEIPTS', 'OPERATION_ID_REUSED', 'ENROLLMENT_CHANGED', 'DEVICE_AUTH_REQUIRED'];
        return emit({status:saved ? 'local-saved-ack-pending' : (allowed.includes(error.message) ? error.message.toLowerCase().replace(/_/g, '-') : 'inbox-unavailable'), ...(saved ? {operationId, cloudStatus:'not-confirmed', memberStatus:'not-requested'} : {})});
      } finally { busy = false; }
    }
    const api = {
      get enrolled() { return !!config; },
      get endpoint() { return config ? config.endpoint : ''; },
      // Call only from explicit enrollment UI; token never enters application state.
      enroll(value) {
        const checked = configuration(value);
        storage.setItem(configKey, JSON.stringify(checked));
        config = checked; generation++;
        return emit({status:'enrolled'});
      },
      disconnect() { storage.removeItem(configKey); config = null; generation++; api.stop(); return emit({status:'not-enrolled'}); },
      receive,
      start() { if (!timer) timer = timers.setInterval(() => { void receive(); }, 60000); },
      stop() { if (timer) timers.clearInterval(timer); timer = null; generation++; },
    };
    return api;
  }
  const api = Object.freeze({create, createLocalAdapter, createGate, packetHash, applyOperation, configuration});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecordingInbox = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
