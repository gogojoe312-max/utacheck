'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const API = require('../startup-file-inspection.js');
const bounded = require('../startup-backup-inspection.js');
const { indexedFixture } = require('./startup-file-restoration-fixture.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const failure = code => Object.assign(new Error('PRIVATE_DECODER_DETAIL'), { inspectionCode: code });
const packet = () => ({ app: 'utacheck', at: 1791300000000, state: { songs: [{ id: 'PRIVATE_SONG', lines: [] }], bkKey: 'PRIVATE_PACKET_KEY' } });
const encrypted = () => ({ enc: 1, salt: Buffer.alloc(16).toString('base64url'), iv: Buffer.alloc(12).toString('base64url'), data: Buffer.alloc(32).toString('base64url') });
const mockFile = () => new File([JSON.stringify(encrypted())], 'PRIVATE_LOCAL_FILENAME.json');
function inspection(extra = {}) {
  let active = true, prepared = 0;
  const attempts = [], updates = [], contexts = [];
  const api = API.create({
    isActive: () => active, readFile: file => file.arrayBuffer(), counts: bounded.counts,
    readSavedKeys: async context => { contexts.push(context); return extra.saved || []; },
    decodeBackup: async (raw, key) => { attempts.push(key); return extra.decode ? extra.decode(raw, key, attempts.length) : packet(); },
    prepareRestore: async (value, context) => { prepared++; assert.equal(value.app, 'utacheck'); assert(context.signal); return extra.prepared !== false; },
    onDiscard: () => extra.onDiscard?.(), onUpdate: value => updates.push(value)
  });
  return { api, attempts, updates, contexts, prepared: () => prepared, deactivate: () => { active = false; },
    safe: result => assert.doesNotMatch(JSON.stringify({ result, updates }), /PRIVATE_|ghToken|bkKey|key:|salt|iv|filename/),
    check: async password => { api.select(mockFile()); return api.check(password); }
  };
}
function keyProvider(slots, extra = {}) {
  const state = {};
  slots.forEach((value, index) => { if (value !== undefined) state['state:' + index] = value; });
  const idb = indexedFixture({ state, clips: { 'PRIVATE_CLIP': new Uint8Array([1, 2, 3]) } }, extra.idb);
  let forbidden = 0, active = true;
  const deny = () => { forbidden++; throw Error('PRIVATE_FORBIDDEN_ACCESS'); };
  const context = vm.createContext({ DB: extra.noDatabase ? null : idb.database, startupStateObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    S: new Proxy({}, { get: deny, set: deny }), U: new Proxy({}, { get: deny, set: deny }),
    localStorage: new Proxy({}, { get: deny, set: deny }), sessionStorage: new Proxy({}, { get: deny, set: deny }),
    indexedDB: new Proxy({}, { get: deny }), fetch: deny, save: deny, saveNow: deny, idbPut: deny
  });
  const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
  const start = source.indexOf('function startupReadSavedLocalKeys(context)'), end = source.indexOf('async function startupPrepareLocalRestore', start);
  assert(start >= 0 && end > start); vm.runInContext(source.slice(start, end), context);
  const before = idb.snapshot();
  const safe = () => { assert.equal(forbidden, 0); assert.deepEqual(idb.snapshot(), before); assert.equal(idb.writeCount(), 0);
    assert(idb.events.filter(event => event.op === 'transaction').every(event => event.mode === 'readonly' && event.scope.join() === 'state'));
    assert.equal(idb.events.filter(event => event.store === 'clips').length, 0);
  };
  const signal = new AbortController().signal;
  return { idb, context, signal, safe, deactivate: () => { active = false; }, read: ctx => context.startupReadSavedLocalKeys(ctx || { signal, isActive: () => active }) };
}
const slot = state => ({ seq: 10, txt: JSON.stringify(state) });
test('saved keys come only from existing bkKey, key, and groups key values in both readonly slots', async () => {
  const f = keyProvider([
    slot({ bkKey: ' PRIVATE_BK_WITH_SPACES ', key: 'PRIVATE_LINK_KEY', groups: [{ key: 'PRIVATE_GROUP_KEY' }, { key: 'PRIVATE_GROUP_KEY' }],
      ghToken: 'PRIVATE_NOT_A_KEY', nested: { key: 'PRIVATE_NOT_A_SOURCE' }, password: 'PRIVATE_NOT_A_SOURCE' }),
    slot({ bkKey: 'PRIVATE_SECOND_BK', key: 'PRIVATE_LINK_KEY', groups: [{ key: 'PRIVATE_SECOND_GROUP' }] })
  ]);
  assert.deepEqual(Array.from(await f.read()), [' PRIVATE_BK_WITH_SPACES ', 'PRIVATE_LINK_KEY', 'PRIVATE_GROUP_KEY', 'PRIVATE_SECOND_BK', 'PRIVATE_SECOND_GROUP']);
  assert.deepEqual(f.idb.events.filter(event => event.op === 'get').map(event => event.key), ['state:0', 'state:1']); f.safe();
});
test('saved values are exact, unique, valid strings and capped at twenty-four', async () => {
  const exact = [' 秘密の合言葉 ', 'ひみつ\u3099', 'ひみつ\u309b', 'PRIVATE_CASE', 'private_case'];
  const f = keyProvider([slot({ bkKey: exact[0], key: exact[1], groups: [null, {}, { key: 123 }, { key: '' }, { key: 'x'.repeat(4097) },
    ...exact.slice(2).map(key => ({ key })), ...Array.from({ length: 80 }, (_, index) => ({ key: 'PRIVATE_GROUP_' + index }))] }), slot({ bkKey: 'PRIVATE_LATE_SLOT' })]);
  const keys = Array.from(await f.read()); assert.equal(keys.length, 24); assert.deepEqual(keys.slice(0, exact.length), exact);
  assert(!keys.includes('PRIVATE_LATE_SLOT')); assert.equal(new Set(keys).size, 24); f.safe();
});
test('one malformed slot never invents keys, while the other confirmed slot stays available', async () => {
  for (const value of [undefined, null, {}, { txt: '{PRIVATE_BAD_JSON' }, { txt: 'null' }, { txt: '[]' }, { txt: '123' }]) {
    const f = keyProvider([value, slot({ bkKey: 'PRIVATE_CONFIRMED_KEY' })]);
    assert.deepEqual(Array.from(await f.read()), ['PRIVATE_CONFIRMED_KEY']); f.safe();
  }
});
test('slot read failure, hidden completion, and missing database return no keys', async () => {
  for (const extra of [{ idb: { failRead: ({ key }) => key === 'state:0' } }, { noDatabase: true }]) {
    const f = keyProvider([slot({ bkKey: 'PRIVATE_KEY' }), undefined], extra); assert.deepEqual(Array.from(await f.read()), []); f.safe();
  }
  const f = keyProvider([slot({ bkKey: 'PRIVATE_KEY' }), undefined]); const pending = f.read(); f.deactivate();
  assert.deepEqual(Array.from(await pending), []); f.safe();
});
test('cancellation aborts the saved-key readonly transaction and emits no usable key', async () => {
  const f = keyProvider([slot({ bkKey: 'PRIVATE_KEY' }), undefined]), controller = new AbortController();
  const pending = f.read({ signal: controller.signal, isActive: () => !controller.signal.aborted }); controller.abort();
  assert.deepEqual(Array.from(await pending), []); assert.equal(f.idb.transactions[0].aborted, true); f.safe();
});
test('blank manual input can use an existing saved key without changing or exposing it', async () => {
  const f = inspection({ saved: [' PRIVATE_SAVED_EXACT '], decode: (raw, key) => { assert.equal(key, ' PRIVATE_SAVED_EXACT '); return packet(); } });
  const result = await f.check(''); assert.equal(result.status, 'checked'); assert.equal(result.restoreAvailable, true);
  assert.deepEqual(f.attempts, [' PRIVATE_SAVED_EXACT ']); assert.equal(f.prepared(), 1); f.safe(result);
});
test('manual exact input precedes at most nine existing variants, then exact saved values', async () => {
  const password = ' か\u3099 私　 ', saved = [' PRIVATE_SAVED_EXACT ', 'PRIVATE_SECOND_SAVED'];
  const f = inspection({ saved, decode: (raw, key) => { if (key !== saved[0]) throw failure('decrypt-failed'); return packet(); } });
  const result = await f.check(password); assert.equal(result.status, 'checked'); assert.equal(f.attempts[0], password);
  assert.equal(f.attempts.at(-1), saved[0]); assert(f.attempts.length <= 10); assert.equal(f.attempts.filter(key => key === saved[0]).length, 1);
  assert(!f.attempts.includes(saved[0].trim())); assert.equal(new Set(f.attempts).size, f.attempts.length); f.safe(result);
});
test('key attempts stop on successful exact manual decode', async () => {
  const f = inspection({ saved: ['PRIVATE_SAVED_KEY'] }); const result = await f.check(' PRIVATE_MANUAL_KEY ');
  assert.equal(result.status, 'checked'); assert.deepEqual(f.attempts, [' PRIVATE_MANUAL_KEY ']); f.safe(result);
});
test('only confirmed decrypt failure may advance to a later key', async () => {
  for (const code of ['backup-format', 'backup-limit', 'state-format', 'compression-unavailable']) {
    const f = inspection({ saved: ['PRIVATE_SECOND_KEY'], decode: () => { throw failure(code); } });
    const result = await f.check('PRIVATE_FIRST_KEY'); assert.equal(result.status, code); assert.equal(f.attempts.length, 1); assert.equal(f.prepared(), 0); f.safe(result);
  }
  const f = inspection({ saved: ['PRIVATE_SECOND_KEY'], decode: () => { throw Error('PRIVATE_UNKNOWN_DECODER_ERROR'); } });
  const result = await f.check('PRIVATE_FIRST_KEY'); assert.equal(result.status, 'backup-format'); assert.equal(f.attempts.length, 1); assert.equal(f.prepared(), 0); f.safe(result);
});
test('a legacy badKey-only decoder marker advances without revealing its error details', async () => {
  const f = inspection({ saved: ['PRIVATE_SECOND_KEY'], decode: (raw, key) => { if (key === 'PRIVATE_FIRST_KEY') throw Object.assign(Error('PRIVATE_BAD_KEY'), { badKey: 1 }); return packet(); } });
  const result = await f.check('PRIVATE_FIRST_KEY'); assert.equal(result.status, 'checked'); assert.deepEqual(f.attempts, ['PRIVATE_FIRST_KEY', 'PRIVATE_SECOND_KEY']); f.safe(result);
});
test('a confirmed non-decryption failure overrides a legacy badKey marker and stops fallback', async () => {
  const f = inspection({ saved: ['PRIVATE_SECOND_KEY'], decode: () => { throw Object.assign(failure('backup-limit'), { badKey: 1 }); } });
  const result = await f.check('PRIVATE_FIRST_KEY'); assert.equal(result.status, 'backup-limit'); assert.equal(f.attempts.length, 1); assert.equal(f.prepared(), 0); f.safe(result);
});
test('saved candidate count is limited and values are never normalized or deduplicated into new strings', async () => {
  const saved = Array.from({ length: 30 }, (_, index) => ' PRIVATE_EXACT_' + index + ' ');
  const f = inspection({ saved, decode: () => { throw failure('decrypt-failed'); } });
  const result = await f.check(''); assert.equal(result.status, 'decrypt-failed'); assert.deepEqual(f.attempts, saved.slice(0, 24)); assert.equal(f.prepared(), 0); f.safe(result);
});
test('no saved key leaves restoration unavailable and never invokes the decoder', async () => {
  const f = inspection(); const result = await f.check(''); assert.equal(result.status, 'saved-key-missing');
  assert.equal(f.attempts.length, 0); assert.equal(f.prepared(), 0); f.safe(result);
});
test('a checked file can stay comparison-only when safe restoration preparation is denied', async () => {
  const f = inspection({ prepared: false }); const result = await f.check('PRIVATE_EXACT_KEY');
  assert.equal(result.status, 'checked'); assert.equal(result.restoreAvailable, false); assert.equal(f.prepared(), 1); f.safe(result);
});
test('in-flight cancellation drops the late candidate and never prepares restoration', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = inspection({ decode: async () => { await gate; return packet(); } });
  const pending = f.check('PRIVATE_EXACT_KEY'); await flush(); f.api.cancel(); release();
  const result = await pending; assert.equal(result.status, 'cancelled'); assert.equal(f.prepared(), 0); f.safe(result);
});
