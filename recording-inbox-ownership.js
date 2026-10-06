/* Enrolled-profile writer ownership. No lock means no write authority. */
(function (root) {
  'use strict';
  const LOCK_NAME = 'utacheck:recording-inbox:authoritative-writer-v1';
  function create(options = {}) {
    const locks = options.locks;
    let state = 'pending', epoch = 0, releaseHold = null, pending = null, settlePending = null;
    const publish = value => {
      state = value;
      try { if (options.onChange) options.onChange({status:value, canWrite:value === 'owned'}); } catch (_) { /* UI cannot grant ownership. */ }
    };
    const settle = (value, resolve) => {
      if (settlePending === resolve) { pending = null; settlePending = null; }
      resolve(value);
    };
    const api = {
      get canWrite() { return state === 'owned'; },
      get status() { return state; },
      acquire() {
        if (state === 'owned') return Promise.resolve(true);
        if (pending) return pending;
        if (!locks || typeof locks.request !== 'function') {
          publish('unsupported');
          return Promise.resolve(false);
        }
        if (typeof options.reloadLatest !== 'function') {
          publish('reload-required');
          return Promise.resolve(false);
        }
        const turn = ++epoch;
        publish('pending');
        let ready;
        const answer = new Promise(resolve => { ready = resolve; });
        pending = answer; settlePending = ready;
        let request;
        try {
          request = locks.request(LOCK_NAME, {mode:'exclusive', ifAvailable:true}, async lock => {
            if (turn !== epoch) { settle(false, ready); return; }
            if (!lock) { publish('secondary'); settle(false, ready); return; }
            let endHold;
            const held = new Promise(resolve => { endHold = resolve; });
            releaseHold = endHold;
            try {
              publish('reloading');
              // The integrator must read the latest durable editor state while
              // holding the lock and return true only after adopting it safely.
              // It must not save a stale in-memory snapshot during this phase.
              const fresh = await options.reloadLatest({isCurrent:() => turn === epoch});
              if (turn !== epoch) { settle(false, ready); return; }
              if (fresh !== true) { publish('reload-required'); settle(false, ready); return; }
              publish('owned');
              settle(true, ready);
              await held;
            } catch (_) {
              if (turn === epoch) publish('reload-required');
              settle(false, ready);
            } finally {
              if (releaseHold === endHold) releaseHold = null;
              if (turn === epoch && state === 'owned') publish('released');
            }
          });
        } catch (_) {
          publish('unavailable'); settle(false, ready); return answer;
        }
        Promise.resolve(request).catch(() => {
          if (turn === epoch) {
            publish('unavailable');
            if (releaseHold) releaseHold();
          }
          settle(false, ready);
        });
        return answer;
      },
      // Before calling, the integrator MUST deny new mutations and await every
      // admitted IDB/remote write. This helper cannot cancel or drain app writes.
      // Do not release from pagehide while async saveNow/PATCH remains in flight;
      // retain the lock until context destruction instead. Configuration changes
      // need the same deny/drain barrier before an explicit release and reload.
      // Release never grants ordinary writes to a stale tab. Reacquisition needs
      // another successful disk reload; there is no automatic owner takeover.
      release() {
        epoch++;
        publish('released');
        if (settlePending) settle(false, settlePending);
        if (releaseHold) releaseHold();
      },
    };
    return api;
  }
  const api = Object.freeze({create, LOCK_NAME});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecordingInboxOwnership = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
