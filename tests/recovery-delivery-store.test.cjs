'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const API = require('../recovery-delivery-store.js');
const { indexedFixture, copy } = require('./startup-file-restoration-fixture.cjs');

const sha = raw => createHash('sha256').update(raw).digest('hex');
const flush = () => new Promise(resolve => setImmediate(resolve));
const gistA = '0123456789abcdef0123456789abcdef';
const gistB = 'fedcba9876543210fedcba9876543210';
const state = extra => ({ songs: [{ id: 'PRIVATE_SONG', title: 'PRIVATE_TITLE' }],
  shows: [{ id: 'PRIVATE_SHOW', name: 'PRIVATE_NAME' }], ghToken: 'PRIVATE_OLD_TOKEN',
  unknown: { setting: 'PRIVATE_SETTING' }, ...extra });

function fixture(settings = {}) {
  const originalStateRaw = settings.originalStateRaw ?? JSON.stringify(state(), null, 2) + '\n';
  const nextStateRaw = settings.nextStateRaw ?? JSON.stringify(state({ ghToken: 'PRIVATE_EXPLICIT_NEW_TOKEN',
    groups: [{ id: 'PRIVATE_GROUP', gistId: gistA, key: 'PRIVATE_KEY' }] }));
  const slots = settings.slots || [{ seq: 42, at: 1000, txt: JSON.stringify(state()) },
    { seq: 43, at: 1100, txt: JSON.stringify(state({ selection: 'PRIVATE_SELECTION' })) }];
  const hold = settings.hold === undefined ? { v: 1, seq: 41, slot: 1,
    copyKey: 'preserved:recovery:v1:' + sha('PRIVATE_PRIOR_ORIGINAL'),
    startupKey: 'preserved:startup:v1:' + sha('PRIVATE_PRIOR_STARTUP'),
    candidateDigest: sha('PRIVATE_PRIOR_STATE'), sourceKind: 'cloud-publication' } : settings.hold;
  const existing = {
    'preserved:recovery:v1:unchanged': { slots: 'PRIVATE_OLDER_ORIGINAL' },
    'preserved:excel:v1:unchanged': new Blob(['PRIVATE_ORIGINAL_EXCEL']),
    'PRIVATE_UNRELATED_KEY': 'PRIVATE_UNRELATED_VALUE', ...(settings.existing || {})
  };
  slots.forEach((value, index) => { if (value !== undefined) existing['state:' + index] = value; });
  if (!settings.noHold) existing[API.HOLD] = hold;
  const idb = indexedFixture({ state: existing, clips: {
    'PRIVATE_CLIP': new Blob(['PRIVATE_AUDIO'], { type: 'audio/wav' }),
    'xls:PRIVATE_SOURCE': new Blob(['PRIVATE_EXCEL'])
  } }, settings.idb);
  let active = true, legacy = settings.legacy === undefined ? null : settings.legacy;
  let database = idb.database;
  const hashes = [];
  const options = {
    database: () => database, hash: async raw => { hashes.push(raw); return settings.hash ? settings.hash(raw) : sha(raw); },
    isActive: () => active, readLegacy: () => legacy,
    expectedSlotsRaw: JSON.stringify(slots), expectedHoldRaw: JSON.stringify(hold),
    originalStateRaw, nextStateRaw,
    remoteCopies: [{ gistId: gistA, raw: ' { "PRIVATE_REMOTE_A" : true }\n' },
      { gistId: gistB, raw: '{"PRIVATE_REMOTE_B":true}' }],
    ...(settings.options || {})
  };
  const before = idb.snapshot(), initialOptions = copy({
    expectedSlotsRaw: options.expectedSlotsRaw, expectedHoldRaw: options.expectedHoldRaw,
    originalStateRaw: options.originalStateRaw, nextStateRaw: options.nextStateRaw,
    remoteCopies: options.remoteCopies
  });
  const records = () => [
    { key: API.PREFIX + 'slots:' + sha(JSON.stringify(slots)), value: slots.map(value => value === undefined ? null : value) },
    { key: API.PREFIX + 'legacy:' + sha(JSON.stringify(settings.legacy === undefined ? null : settings.legacy)),
      value: settings.legacy === undefined ? null : settings.legacy },
    { key: API.PREFIX + 'hold:' + sha(JSON.stringify(hold)), value: hold },
    { key: API.PREFIX + 'editor:' + sha(originalStateRaw), value: originalStateRaw },
    ...initialOptions.remoteCopies.map(value => ({ key: API.PREFIX + 'remote:' + sha(JSON.stringify(value)), value }))
  ];
  function safe(result, unchangedInputs = true) {
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|ghToken|bkKey|preserved:|recovery:|0123456789abcdef/);
    assert.deepEqual(idb.snapshot().clips, before.clips);
    assert.equal(idb.events.filter(event => event.store === 'clips' || event.scope?.includes('clips')).length, 0);
    assert.deepEqual(idb.record(API.HOLD), settings.noHold ? undefined : hold, 'network hold is unchanged');
    assert.equal(idb.events.filter(event => event.key === API.HOLD && ['add', 'put', 'delete'].includes(event.op)).length, 0);
    for (const [key, value] of before.state) if (!key.startsWith('state:')) assert.deepEqual(idb.record(key), value);
    if (unchangedInputs) for (const key of Object.keys(initialOptions)) assert.deepEqual(options[key], initialOptions[key]);
  }
  return { idb, options, before, hold, slots, hashes, originalStateRaw, nextStateRaw, records, safe,
    commit: () => API.commit(options), setActive: value => { active = value; },
    setLegacy: value => { legacy = value; }, getLegacy: () => legacy, setDatabase: value => { database = value; } };
}
const writes = fixture => fixture.idb.events.filter(event => ['add', 'put', 'delete'].includes(event.op));
const rejected = (result, reason) => { assert.equal(result.status, 'rejected'); assert.equal(result.committed, false);
  if (reason) assert.equal(result.reason, reason); };

test('commits exact supplied state and atomically preserves every original without releasing the hold', async () => {
  const f = fixture({ legacy: '  PRIVATE_LEGACY_BYTES\n' });
  const result = await f.commit(); assert.deepEqual(result, { status: 'committed', committed: true, seq: 44, slot: 0 });
  const envelope = f.idb.record('state:0');
  assert.equal(envelope.txt, f.nextStateRaw); assert.equal(envelope.seq, 44); assert(Number.isSafeInteger(envelope.at));
  assert.equal(JSON.parse(envelope.txt).ghToken, 'PRIVATE_EXPLICIT_NEW_TOKEN');
  assert.deepEqual(f.idb.record('state:1'), f.slots[1]);
  for (const record of f.records()) assert.deepEqual(f.idb.record(record.key), record.value);
  assert.equal(f.getLegacy(), '  PRIVATE_LEGACY_BYTES\n');
  assert.equal(new Set(writes(f).map(event => event.tx)).size, 1);
  assert.deepEqual(writes(f).map(event => event.op), ['add', 'add', 'add', 'add', 'add', 'add', 'put']);
  assert(f.idb.transactions.every(tx => tx.scope.join() === 'state'));
  const tx = f.idb.transactions.find(tx => tx.mode === 'readwrite');
  const events = f.idb.events.filter(event => event.tx === tx.id);
  assert.equal(events.filter(event => event.op === 'get').length, 10, 'nine validation reads and one final guard read');
  assert(events.findIndex(event => event.op === 'add') > events.findIndex(event => event.key === f.records().at(-1).key));
  assert.equal(f.idb.transactions.filter(tx => tx.mode === 'readwrite').length, 1);
  assert.equal(f.idb.transactions.at(-1).mode, 'readonly'); f.safe(result);
});

test('all hashes are computed before the only write transaction starts', async () => {
  let f;
  f = fixture({ hash: async raw => { assert.equal(f.idb.transactions.filter(tx => tx.mode === 'readwrite').length, 0);
    await flush(); return sha(raw); } });
  assert.equal((await f.commit()).status, 'committed'); assert.equal(f.hashes.length, 6);
});

for (const slots of [[undefined, undefined], [undefined, { seq: 8, txt: '{}' }], [{ seq: 9, txt: '{}' }, undefined],
  [{ seq: 10, txt: '{}' }, { seq: 10, txt: '{}' }]]) test('missing slots and tied sequences preserve exact absence and choose highest plus one: ' + JSON.stringify(slots), async () => {
  const f = fixture({ slots }); const result = await f.commit();
  const seq = Math.max(0, ...slots.map(value => value?.seq || 0)) + 1;
  assert.deepEqual(result, { status: 'committed', committed: true, seq, slot: seq % 2 });
  assert.deepEqual(f.idb.record(f.records()[0].key), slots.map(value => value === undefined ? null : value)); f.safe(result);
});

test('identical immutable addresses are reused with no rewriting', async () => {
  const f = fixture(); for (const record of f.records()) f.idb.replace(record.key, record.value);
  const result = await f.commit(); assert.equal(result.status, 'committed');
  assert.deepEqual(writes(f).map(event => [event.op, event.key]), [['put', 'state:0']]); f.safe(result);
});

test('duplicate identical remote copies share one immutable record', async () => {
  const f = fixture(); f.options.remoteCopies.push(copy(f.options.remoteCopies[0]));
  const result = await f.commit(); assert.equal(result.status, 'committed'); assert.equal(writes(f).length, 7); f.safe(result, false);
});

test('the supplied next JSON is never normalized, including a deliberately entered credential', async () => {
  const nextStateRaw = ' \n { "ghToken" : "PRIVATE_ENTERED_TOKEN", "unknown" : [null,0,false], "songs" : [] } \n';
  const f = fixture({ nextStateRaw }); const result = await f.commit();
  assert.equal(result.status, 'committed'); assert.equal(f.idb.record('state:0').txt, nextStateRaw); f.safe(result);
});

for (const name of ['slots', 'hold', 'legacy']) test('stale expected ' + name + ' rejects before writes', async () => {
  const f = fixture();
  if (name === 'slots') f.options.expectedSlotsRaw = JSON.stringify([null, null]);
  if (name === 'hold') f.options.expectedHoldRaw = JSON.stringify({ ...f.hold, seq: f.hold.seq + 1 });
  if (name === 'legacy') f.options.expectedLegacyRaw = 'PRIVATE_EXPECTED_LEGACY';
  rejected(await f.commit(), 'storage-changed'); assert.deepEqual(f.idb.snapshot(), f.before); assert.equal(writes(f).length, 0);
});

test('an explicit null expected legacy rejects present legacy, while a matching legacy is allowed', async () => {
  const f = fixture({ legacy: 'PRIVATE_LEGACY' }); f.options.expectedLegacyRaw = null;
  rejected(await f.commit(), 'storage-changed'); assert.deepEqual(f.idb.snapshot(), f.before);
  f.options.expectedLegacyRaw = 'PRIVATE_LEGACY'; assert.equal((await f.commit()).status, 'committed');
});

for (const hold of [null, [], false, 1, 'PRIVATE_HOLD', {}, { v: 2 },
  { v: 1, seq: 4, slot: 0, copyKey: 'PRIVATE_BAD_COPY' },
  { v: 1, seq: -1, slot: 0, copyKey: 'preserved:recovery:v1:' + sha('x') },
  { v: 1, seq: 4, slot: 3, copyKey: 'preserved:recovery:v1:' + sha('x') },
  { v: 1, seq: 4, slot: 0, copyKey: 'preserved:recovery:v1:' + sha('x'), startupKey: 'PRIVATE_BAD_STARTUP' }])
  test('malformed hold never enables a commit: ' + JSON.stringify(hold), async () => {
    const f = fixture({ hold }); rejected(await f.commit(), 'hold-invalid'); assert.equal(writes(f).length, 0);
    assert.deepEqual(f.idb.snapshot(), f.before);
  });

test('a missing hold rejects even if the caller retained an earlier valid hold', async () => {
  const f = fixture({ noHold: true }); rejected(await f.commit(), 'storage-changed');
  assert.equal(writes(f).length, 0); assert.deepEqual(f.idb.snapshot(), f.before);
});

for (const value of [null, false, { seq: -1, txt: '{}' }, { seq: 1.5, txt: '{}' }, { seq: 1, txt: 1 },
  { seq: 1, at: -1, txt: '{}' }, { seq: Number.MAX_SAFE_INTEGER, at: 0, txt: '{}' }])
  test('invalid slot rejects without modifying originals: ' + JSON.stringify(value), async () => {
    const f = fixture({ slots: [value, undefined] }); rejected(await f.commit());
    assert.equal(writes(f).length, 0); assert.deepEqual(f.idb.snapshot(), f.before);
  });

for (const raw of ['', '{', 'null', '[]', 'true', '1', '"PRIVATE_JSON_STRING"',
  '{"__proto__":{"polluted":true}}', '{"unknown":[{"constructor":{}}]}', '{"unknown":{"prototype":[]}}'])
  test('invalid next JSON and pollution keys reject: ' + raw, async () => {
    const f = fixture({ nextStateRaw: raw }); const result = await f.commit(); rejected(result, 'candidate-invalid');
    assert.equal(writes(f).length, 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
  });

test('UTF-8 next-state size is bounded to twenty MiB before hashes or writes', async () => {
  const f = fixture({ nextStateRaw: JSON.stringify({ text: 'あ'.repeat(Math.ceil(20 * 1024 * 1024 / 3)) }) });
  rejected(await f.commit(), 'candidate-invalid'); assert.equal(f.hashes.length, 0); assert.equal(writes(f).length, 0);
});

test('exactly twenty MiB JSON is accepted without normalizing its bytes', async () => {
  const nextStateRaw = '{"text":"' + 'a'.repeat(20 * 1024 * 1024 - 11) + '"}';
  assert.equal(Buffer.byteLength(nextStateRaw), 20 * 1024 * 1024);
  const f = fixture({ nextStateRaw }); assert.equal((await f.commit()).status, 'committed');
  assert.equal(f.idb.record('state:0').txt, nextStateRaw);
});

for (const raw of ['', '{', 'null', '[]', '1']) test('invalid original editor JSON is not silently discarded: ' + raw, async () => {
  const f = fixture({ originalStateRaw: raw }); rejected(await f.commit(), 'candidate-invalid');
  assert.equal(writes(f).length, 0); assert.deepEqual(f.idb.snapshot(), f.before);
});

test('existing editor JSON containing a pollution-key spelling is preserved without interpreting it', async () => {
  const originalStateRaw = ' { "__proto__" : { "polluted" : "PRIVATE_VALUE" }, "songs" : [] }\n';
  const f = fixture({ originalStateRaw }); assert.equal((await f.commit()).status, 'committed');
  assert.equal(f.idb.record(f.records()[3].key), originalStateRaw); assert.equal({}.polluted, undefined);
});

for (const remoteCopies of [null, {}, [null], [{ gistId: 'bad', raw: '{}' }], [{ gistId: gistA, raw: 1 }]])
  test('invalid remote copy arguments reject without writes: ' + JSON.stringify(remoteCopies), async () => {
    const f = fixture({ options: { remoteCopies } }); rejected(await f.commit(), 'candidate-invalid');
    assert.equal(writes(f).length, 0); assert.deepEqual(f.idb.snapshot(), f.before);
  });

test('remote raw bytes may be empty or non-JSON and are preserved verbatim', async () => {
  const f = fixture({ options: { remoteCopies: [{ gistId: gistA.toUpperCase(), raw: '' },
    { gistId: gistB, raw: 'PRIVATE_NON_JSON_REMOTE\r\n' }] } });
  assert.equal((await f.commit()).status, 'committed');
  for (const record of f.records().slice(4)) assert.deepEqual(f.idb.record(record.key), record.value);
});

for (const digest of [null, undefined, false, 1, '', 'a'.repeat(63), 'g'.repeat(64), 'A'.repeat(64)])
  test('invalid hashes cannot create preservation addresses: ' + String(digest), async () => {
    const f = fixture({ hash: () => digest }); rejected(await f.commit(), 'hash-invalid');
    assert.equal(writes(f).length, 0); assert.deepEqual(f.idb.snapshot(), f.before);
  });

test('hash exceptions never leak private messages', async () => {
  const f = fixture({ hash: () => { throw Error('PRIVATE_HASH_TOKEN'); } });
  const result = await f.commit(); rejected(result, 'hash-invalid'); f.safe(result);
});

test('different remote originals with the same computed address reject before a transaction can write', async () => {
  const f = fixture({ hash: () => '1'.repeat(64) }); const result = await f.commit();
  rejected(result, 'immutable-conflict'); assert.equal(writes(f).length, 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});

for (let index = 0; index < 6; index++) test('a conflicting immutable record ' + index + ' blocks every queued write', async () => {
  const f = fixture(); const record = f.records()[index]; f.idb.replace(record.key, 'PRIVATE_IMMUTABLE_COLLISION');
  const before = f.idb.snapshot(), result = await f.commit(); rejected(result, 'immutable-conflict');
  assert.equal(writes(f).length, 0); assert.deepEqual(f.idb.snapshot(), before); f.safe(result);
});

for (const name of ['state:0', 'state:1', API.HOLD, 'legacy', 'database', 'active'])
  test('a ' + name + ' change while hashing is rechecked before the commit', async () => {
    let changed = false, f;
    f = fixture({ hash: raw => {
      if (!changed) {
        changed = true;
        if (name.startsWith('state:')) f.idb.replace(name, { ...f.idb.record(name), txt: 'PRIVATE_CHANGED_STATE' });
        else if (name === API.HOLD) f.idb.replace(name, { ...f.hold, seq: f.hold.seq + 1 });
        else if (name === 'legacy') f.setLegacy('PRIVATE_CHANGED_LEGACY');
        else if (name === 'database') f.setDatabase(indexedFixture().database);
        else f.setActive(false);
      }
      return sha(raw);
    } });
    const result = await f.commit(); rejected(result, name === 'active' ? 'cancelled' : 'storage-changed');
    assert.equal(writes(f).length, 0);
  });

test('a legacy change during the initial read is rejected', async () => {
  let f;
  f = fixture({ idb: { afterRequest: ({ tx }) => { if (tx.id === 0) f.setLegacy('PRIVATE_CHANGED'); } } });
  rejected(await f.commit(), 'storage-changed'); assert.equal(writes(f).length, 0); assert.deepEqual(f.idb.snapshot(), f.before);
});

test('inputs are captured before awaiting so caller mutation never swaps approved bytes', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ hash: async raw => { await gate; return sha(raw); } });
  const pending = f.commit(); await flush();
  f.options.nextStateRaw = '{"PRIVATE_UNAPPROVED":true}';
  f.options.originalStateRaw = '{}'; f.options.remoteCopies[0].raw = 'PRIVATE_SWAPPED_REMOTE';
  release(); const result = await pending; assert.equal(result.status, 'committed');
  assert.equal(f.idb.record('state:0').txt, f.nextStateRaw);
  for (const record of f.records()) assert.deepEqual(f.idb.record(record.key), record.value);
  f.safe(result, false);
});

for (const changed of ['active', 'legacy', 'database']) test('a changed ' + changed + ' guard during transaction reads aborts before writes', async () => {
  let f;
  f = fixture({ idb: { afterRequest: ({ tx, key }) => {
    if (tx.mode === 'readwrite' && key === 'state:0') {
      if (changed === 'active') f.setActive(false);
      else if (changed === 'legacy') f.setLegacy('PRIVATE_CHANGED');
      else f.setDatabase(indexedFixture().database);
    }
  } } });
  const result = await f.commit(); rejected(result, changed === 'active' ? 'cancelled' : 'storage-changed');
  assert.equal(writes(f).length, 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});

for (const changed of ['active', 'legacy']) for (const after of ['add', 'put'])
  test('a changed ' + changed + ' guard after queued ' + after + ' rolls back the whole transaction', async () => {
    let f;
    f = fixture({ idb: { afterRequest: ({ op }) => { if (op === after) {
      if (changed === 'active') f.setActive(false); else f.setLegacy('PRIVATE_LATE_LEGACY');
    } } } });
    const result = await f.commit(); rejected(result, changed === 'active' ? 'cancelled' : 'storage-changed');
    assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
  });

for (const mode of ['throwWrite', 'failWrite']) for (let index = 1; index <= 7; index++)
  test(mode + ' at write ' + index + ' atomically rolls back every new record and keeps existing originals', async () => {
    const f = fixture({ idb: { [mode]: index } }); const result = await f.commit(); rejected(result, 'preservation-failed');
    assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
  });

test('explicit IDB abort during a write rolls back every new record', async () => {
  const f = fixture({ idb: { afterRequest: ({ tx, op }) => { if (op === 'add') tx.abort(); } } });
  const result = await f.commit(); rejected(result, 'preservation-failed'); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});

for (const tx of [0, 1]) test('a read failure in transaction ' + tx + ' never touches stored state', async () => {
  const f = fixture({ idb: { failRead: request => request.tx === tx && request.op === 'get' } });
  const result = await f.commit(); rejected(result, tx ? 'preservation-failed' : 'storage-read');
  assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});

test('a transaction-open exception is sanitized and does not retry', async () => {
  const f = fixture(); let calls = 0;
  f.options.database = () => ({ transaction() { calls++; throw Error('PRIVATE_DATABASE_ERROR'); } });
  const result = await f.commit(); rejected(result, 'storage-read'); assert.equal(calls, 1); f.safe(result);
});

test('a write transaction-open exception is sanitized and does not retry', async () => {
  const f = fixture(), database = f.idb.database, original = database.transaction;
  database.transaction = (...args) => { if (args[1] === 'readwrite') throw Error('PRIVATE_OPEN_WRITE_FAILURE'); return original(...args); };
  const result = await f.commit(); rejected(result, 'preservation-failed'); assert.equal(writes(f).length, 0); f.safe(result);
});

test('failed post-commit reread reports committed and unverified, never retries or releases the hold', async () => {
  const f = fixture({ idb: { failRead: request => request.tx === 2 && request.op === 'get' } });
  const result = await f.commit(); assert.deepEqual(result, { status: 'unverified', committed: true, seq: 44, slot: 0, reason: 'storage-read' });
  assert.equal(f.idb.record('state:0').txt, f.nextStateRaw); assert.equal(writes(f).length, 7); f.safe(result);
});

for (const target of ['state:0', 'state:1', API.HOLD, 'slots', 'legacy', 'hold', 'editor', 'remote'])
  test('post-commit verification detects changed ' + target + ' and reports committed unverified', async () => {
    const f = fixture({ idb: { transformRead: ({ tx, key, value }) => {
      if (tx === 2 && (key === target || key.startsWith(API.PREFIX + target + ':'))) return 'PRIVATE_VERIFY_CHANGE'; return value;
    } } });
    const result = await f.commit(); assert.equal(result.status, 'unverified'); assert.equal(result.committed, true);
    assert.equal(result.reason, 'verify-failed'); assert.equal(writes(f).length, 7); f.safe(result);
  });

test('late cancellation at transaction completion accurately reports that writes committed', async () => {
  let f;
  f = fixture({ idb: { afterRequest: ({ tx, op, key }) => {
    if (tx.mode === 'readwrite' && op === 'get' && key === API.HOLD && writes(f).length) f.setActive(false);
  } } });
  const result = await f.commit(); assert.deepEqual(result, { status: 'unverified', committed: true, seq: 44, slot: 0, reason: 'cancelled' });
  assert.equal(f.idb.record('state:0').txt, f.nextStateRaw); assert.equal(writes(f).length, 7); f.safe(result);
});

for (const changed of ['active', 'legacy', 'database']) test('a post-commit ' + changed + ' change blocks editor adoption', async () => {
  let f;
  f = fixture({ idb: { afterRequest: ({ tx }) => { if (tx.id === 2) {
    if (changed === 'active') f.setActive(false);
    else if (changed === 'legacy') f.setLegacy('PRIVATE_CHANGED');
    else f.setDatabase(indexedFixture().database);
  } } } });
  const result = await f.commit(); assert.equal(result.status, 'unverified'); assert.equal(result.committed, true); f.safe(result);
});

test('reusing stale expected slots after success is rejected and never overwrites the new state', async () => {
  const f = fixture(); assert.equal((await f.commit()).status, 'committed'); const after = f.idb.snapshot();
  const result = await f.commit(); rejected(result, 'storage-changed'); assert.equal(writes(f).length, 7);
  assert.deepEqual(f.idb.snapshot(), after); f.safe(result);
});

test('API is available as a frozen browser global without logging or network APIs', () => {
  const context = vm.createContext({ TextEncoder, console: { log() { assert.fail('must not log'); } } });
  vm.runInContext(fs.readFileSync(require.resolve('../recovery-delivery-store.js'), 'utf8'), context);
  assert.equal(typeof context.RecoveryDeliveryStore.commit, 'function'); assert(Object.isFrozen(context.RecoveryDeliveryStore));
  assert.equal(context.RecoveryDeliveryStore.HOLD, API.HOLD);
});

test('invalid options and callback failures expose only fixed reason codes', async () => {
  for (const options of [null, undefined, {}, [], { database() { throw Error('PRIVATE_FAILURE'); } }]) {
    rejected(await API.commit(options), 'candidate-invalid');
  }
  for (const name of ['isActive', 'readLegacy', 'database']) {
    const f = fixture(); f.options[name] = () => { throw Error('PRIVATE_CALLBACK_TOKEN'); };
    const result = await f.commit(); rejected(result); f.safe(result);
  }
});

test('unpacked editor original above 20 MiB is preserved while packed next-state bound stays 20 MiB',async()=>{
 const raw=JSON.stringify(state({preservedLarge:'x'.repeat(21*1024*1024)}));const f=fixture({originalStateRaw:raw});const result=await API.commit(f.options);
 assert.equal(result.status,'committed');assert.equal(f.idb.record(API.PREFIX+'editor:'+sha(raw)),raw);
 const tooLarge=fixture({nextStateRaw:raw});const before=tooLarge.idb.snapshot();const refused=await API.commit(tooLarge.options);assert.equal(refused.status,'rejected');assert.equal(refused.reason,'candidate-invalid');assert.deepEqual(tooLarge.idb.snapshot(),before);
});
