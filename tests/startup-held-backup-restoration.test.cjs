'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const API = require('../startup-file-restoration.js');
const { indexedFixture, copy } = require('./startup-file-restoration-fixture.cjs');

const sha = value => createHash('sha256').update(value).digest('hex');
const flush = () => new Promise(resolve => setImmediate(resolve));
const work = extra => ({
  songs: [{ id: 'PRIVATE_FULL_SONG', title: 'PRIVATE_FULL_TITLE', lines: [{ t: 'PRIVATE_FULL_LYRIC' }] }],
  notes: [{ id: 'PRIVATE_FULL_NOTE', memo: 'PRIVATE_FULL_MEMO' }],
  groups: [{ id: 'PRIVATE_GROUP', src: 'PRIVATE_GROUP_SOURCE', key: 'PRIVATE_GROUP_KEY' }],
  shows: [{ id: 'PRIVATE_SHOW', name: 'PRIVATE_SHOW_NAME', memo: 'PRIVATE_SHOW_MEMO' }],
  members: [{ id: 'PRIVATE_MEMBER', name: 'PRIVATE_MEMBER_NAME' }], rsongs: [],
  recs: { PRIVATE_RECORDING: { name: 'PRIVATE_AUDIO_METADATA' } },
  ghToken: 'PRIVATE_CLOUD_TOKEN', bkKey: 'PRIVATE_BACKUP_KEY',
  unknown: { nested: { value: 'PRIVATE_SETTING' } }, ...extra
});
const hashBlob = async blob => sha(new Uint8Array(await blob.arrayBuffer()));

function fixture(options = {}) {
  const initial = work({ songs: [], notes: [], ghToken: 'PRIVATE_ORIGINAL_TOKEN' });
  const partial = work({
    songs: Array.from({ length: 82 }, (_, n) => ({ id: 'PRIVATE_EXCEL_' + n, lines: [{ t: 'PRIVATE_EXCEL_LYRIC_' + n }] })),
    notes: [], ghToken: undefined
  });
  const originals = { slots: [
    { present: true, value: { seq: 82, at: 1000, txt: JSON.stringify(initial) } },
    { present: true, value: { seq: 81, at: 900, txt: JSON.stringify(initial) } }
  ], legacy: null };
  const originalConnectionCopyKey = 'preserved:recovery:v1:' + sha(JSON.stringify(originals));
  const slots = options.slots || [originals.slots[0].value, { seq: 83, at: 1100, txt: JSON.stringify(partial) }];
  const priorStartup = { slots: slots.map(value => value === undefined ? { present: false } : { present: true, value }), legacy: null };
  const oldHold = options.oldHold === undefined ? {
    v: 1, seq: 83, slot: 1, copyKey: originalConnectionCopyKey,
    startupKey: 'preserved:startup:v1:' + sha(JSON.stringify(priorStartup)),
    candidateDigest: sha(slots[1].txt), sourceAt: null, sourceKind: 'local-excel', sourceDateUnknown: true,
    excelSummary: { total: 124, read: 82, failed: 42 },
    excelSources: [{ key: 'xls:PRIVATE_EXCEL_SOURCE', bytes: 4, digest: sha(new Uint8Array([1, 2, 3, 4])) }]
  } : options.oldHold;
  const state = {
    [originalConnectionCopyKey]: originals,
    'unrelated-original': { value: 'PRIVATE_UNRELATED_VALUE' }, ...(options.state || {})
  };
  slots.forEach((value, index) => { if (value !== undefined) state['state:' + index] = value; });
  if (!options.noHold) state[API.HOLD] = oldHold;
  if (oldHold && typeof oldHold === 'object' && typeof oldHold.startupKey === 'string') state[oldHold.startupKey] = priorStartup;
  const source = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/vnd.ms-excel' });
  const sourceDigest = sha(new Uint8Array([1, 2, 3, 4]));
  const idb = indexedFixture({ state, clips: {
    'xls:PRIVATE_EXCEL_SOURCE': source,
    'PRIVATE_RECORDING': new Blob([new Uint8Array([0, 255, 8])], { type: 'audio/wav' })
  } }, options.idb || {});
  let active = true, guard = true, legacy = null;
  let memory = options.editorRaw === undefined ? JSON.stringify(partial, null, 2) : options.editorRaw;
  const expectedMemory = memory;
  const context = {
    signal: new AbortController().signal,
    expectedHoldRaw: JSON.stringify(oldHold), editorOriginalRaw: memory,
    isActive: () => guard && memory === expectedMemory,
    ...(options.context || {})
  };
  if (options.sources) {
    context.sourceSnapshots = [{ key: 'xls:PRIVATE_EXCEL_SOURCE', blob: source, bytes: source.size, digest: sourceDigest }];
    context.hashBlob = hashBlob;
    context.verifySources = async () => true;
  }
  const hashes = [];
  const api = API.create({
    database: () => idb.database, readLegacy: () => legacy,
    validate: value => {
      if (!value || !Array.isArray(value.songs) || !Array.isArray(value.notes)) throw Error('PRIVATE_INVALID_STATE');
    }, hasWork: value => !!(value.songs.length || value.notes.length),
    isActive: () => active,
    hash: async raw => { hashes.push(raw); return options.hash ? options.hash(raw) : sha(raw); }
  });
  const packet = { app: 'utacheck', at: 1791300000000, sourceKind: 'cloud-backup', state: work() };
  const before = idb.snapshot(), packetBefore = JSON.stringify(packet);
  const safe = result => {
    assert.doesNotMatch(JSON.stringify(result ?? {}), /PRIVATE_|ghToken|bkKey|preserved:|recovery:/);
    assert.equal(JSON.stringify(packet), packetBefore, 'the full candidate remains unchanged');
    assert.deepEqual(idb.snapshot().clips, before.clips, 'all Excel and recording bytes remain unchanged');
    assert.equal(idb.events.filter(event => event.store === 'clips' || event.scope?.includes('clips')).length, 0);
  };
  return {
    api, idb, context, packet, before, oldHold, slots, hashes, safe, originalConnectionCopyKey,
    source, sourceDigest, editorOriginalRaw: expectedMemory,
    prepare: () => api.prepare(packet, context), commit: () => api.commit(context),
    setMemory: value => { memory = value; }, setGuard: value => { guard = value; },
    setActive: value => { active = value; }, setLegacy: value => { legacy = value; },
    keys: () => ({
      original: 'preserved:recovery:v1:' + sha(hashes[0]),
      startup: 'preserved:startup:v1:' + sha(hashes[1]),
      oldHold: 'preserved:recovery-hold:v1:' + sha(JSON.stringify(oldHold)),
      editor: 'preserved:editor:v1:' + sha(expectedMemory)
    })
  };
}

test('an existing hold stays closed unless its exact raw JSON is explicitly supplied', async () => {
  for (const supplied of [undefined, '', '{}', null, 123, JSON.stringify({ v: 1 })]) {
    const f = fixture(); f.context.expectedHoldRaw = supplied;
    assert.equal(await f.prepare(), false); assert.equal((await f.commit()).status, 'candidate-invalid');
    assert.deepEqual(f.idb.snapshot(), f.before); assert.equal(f.idb.writeCount(), 0); f.safe();
  }
  const absent = fixture({ noHold: true });
  assert.equal(await absent.prepare(), false); assert.equal(absent.idb.writeCount(), 0);
  assert.deepEqual(absent.idb.snapshot(), absent.before); absent.safe();
});

test('held backup prepare only reads and does not change partial recovery, old hold, clips or candidate', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true);
  assert.deepEqual(f.idb.snapshot(), f.before); assert.equal(f.idb.writeCount(), 0);
  assert.deepEqual(f.idb.events.filter(event => event.op === 'get').map(event => event.key), ['state:0', 'state:1', API.HOLD]);
  assert(f.idb.transactions.every(tx => tx.mode === 'readonly' && tx.scope.join() === 'state')); f.safe();
});

test('a full cloud candidate atomically preserves partial slots, old hold, exact editor bytes and original connection settings', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true);
  const keys = f.keys(), result = await f.commit(); assert.deepEqual(result, { status: 'restored' });
  const hold = f.idb.record(API.HOLD), restored = f.idb.record('state:0');
  assert.equal(hold.sourceKind, 'cloud-backup'); assert.equal(hold.sourceAt, f.packet.at);
  assert.equal(hold.seq, 84); assert.equal(hold.slot, 0); assert.equal(restored.seq, 84);
  assert.equal(hold.originalConnectionCopyKey, f.oldHold.copyKey);
  assert.equal(hold.copyKey, keys.original); assert.equal(hold.startupKey, keys.startup);
  assert.notEqual(hold.copyKey, hold.originalConnectionCopyKey);
  const expected = copy(f.packet.state); delete expected.ghToken;
  assert.deepEqual(JSON.parse(restored.txt), expected, 'all full backup settings and work are retained');
  assert.equal(JSON.parse(restored.txt).ghToken, undefined); assert.equal(hold.candidateDigest, sha(restored.txt));
  assert.deepEqual(f.idb.record(keys.original), { slots: f.slots.map(value => ({ present: true, value })), legacy: null });
  assert.deepEqual(f.idb.record(keys.startup), { slots: ['state:0', 'state:1'].map(key => ({ present: true, value: f.idb.record(key) })), legacy: null });
  assert.deepEqual(f.idb.record(keys.oldHold), f.oldHold);
  assert.equal(f.idb.record(keys.editor), f.editorOriginalRaw, 'the exact memory JSON whitespace survives');
  assert.equal(JSON.parse(f.idb.record(hold.originalConnectionCopyKey).slots[0].value.txt).ghToken, 'PRIVATE_ORIGINAL_TOKEN');
  for (const [key, value] of f.before.state) if (!['state:0', API.HOLD].includes(key)) assert.deepEqual(f.idb.record(key), value);
  const writes = f.idb.events.filter(event => ['add', 'put', 'delete'].includes(event.op));
  assert.equal(new Set(writes.map(event => event.tx)).size, 1); assert.equal(writes.length, 6);
  assert.deepEqual(writes.map(event => event.op), ['add', 'add', 'add', 'add', 'put', 'put']);
  const commitEvents = f.idb.events.filter(event => event.tx === writes[0].tx);
  assert.equal(commitEvents.filter(event => event.op === 'get').length, 7);
  assert(commitEvents.findIndex(event => event.op === 'put') > commitEvents.findLastIndex(event => event.op === 'get'));
  const reads = f.idb.events.filter(event => event.op === 'get' && event.tx === 2).map(event => event.key);
  assert.deepEqual(reads, ['state:0', 'state:1', keys.original, keys.startup, API.HOLD, keys.oldHold, keys.editor]);
  delete f.context.expectedHoldRaw; assert.equal(await f.prepare(), false, 'the replacement never releases the network hold');
  f.safe(result);
});

test('a second held recovery retains the original connection-copy chain instead of switching to the partial slots', async () => {
  const originalConnectionCopyKey = 'preserved:recovery:v1:' + sha('PRIVATE_FIRST_CONNECTION_COPY');
  const oldHold = { v: 1, seq: 83, slot: 1, copyKey: 'PRIVATE_INTERMEDIATE_COPY', originalConnectionCopyKey, sourceKind: 'local-excel' };
  const f = fixture({ oldHold }); assert.equal(await f.prepare(), true); assert.equal((await f.commit()).status, 'restored');
  assert.equal(f.idb.record(API.HOLD).originalConnectionCopyKey, originalConnectionCopyKey);
  assert.deepEqual(f.idb.record(f.keys().oldHold), oldHold); f.safe();
});

test('optional editor preservation may be omitted while exact old-hold preservation remains required', async () => {
  const f = fixture(); delete f.context.editorOriginalRaw;
  assert.equal(await f.prepare(), true); assert.equal((await f.commit()).status, 'restored');
  assert.equal(f.idb.record(f.keys().editor), undefined); assert.deepEqual(f.idb.record(f.keys().oldHold), f.oldHold);
  assert.equal(f.idb.writeCount(), 5); f.safe();
});

for (const oldHold of [null, [], 'PRIVATE_HOLD_STRING', 1, false]) test('non-object old hold ' + JSON.stringify(oldHold) + ' is never replaced', async () => {
  const f = fixture({ oldHold }); assert.equal(await f.prepare(), false);
  assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe();
});

test('old hold JSON is bounded by UTF-8 bytes before replacement', async () => {
  const f = fixture({ oldHold: { v: 1, memo: 'あ'.repeat(Math.ceil(20 * 1024 * 1024 / 3)) } });
  assert.equal(await f.prepare(), false); assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe();
});

for (const editorRaw of [null, 3, '', '{', 'null', '[]', '"PRIVATE_TEXT"', 'false']) test('invalid editor raw ' + JSON.stringify(editorRaw) + ' denies the candidate without writes', async () => {
  const f = fixture({ editorRaw }); assert.equal(await f.prepare(), false);
  assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe();
});

test('editor JSON is bounded by UTF-8 bytes and accepted bytes are hashed without normalization', async () => {
  const tooLarge = fixture({ editorRaw: JSON.stringify({ memo: 'あ'.repeat(Math.ceil(20 * 1024 * 1024 / 3)) }) });
  assert.equal(await tooLarge.prepare(), false); assert.equal(tooLarge.idb.writeCount(), 0); tooLarge.safe();
  const raw = '  { "notes" : [], "songs" : [], "memo" : "PRIVATE_WHITESPACE" }\n';
  const f = fixture({ editorRaw: raw }); assert.equal(await f.prepare(), true); assert.equal((await f.commit()).status, 'restored');
  assert.equal(f.idb.record('preserved:editor:v1:' + sha(raw)), raw); f.safe();
});

for (const mode of ['changed', 'missing', 'primitive']) test('an old hold ' + mode + ' after prepare aborts with no writes', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true);
  if (mode === 'missing') f.idb.stores.get('state').delete(API.HOLD);
  else f.idb.replace(API.HOLD, mode === 'primitive' ? 'PRIVATE_CHANGED_HOLD' : { ...f.oldHold, seq: f.oldHold.seq + 1 });
  const before = f.idb.snapshot(), result = await f.commit();
  assert.equal(result.status, 'storage-changed'); assert.equal(f.idb.writeCount(), 0);
  assert.deepEqual(f.idb.snapshot(), before); f.safe(result);
});

for (const index of [0, 1]) test('a changed partial generation ' + index + ' denies held replacement', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true);
  f.idb.replace('state:' + index, { ...f.slots[index], txt: f.slots[index].txt + ' ' });
  const before = f.idb.snapshot(), result = await f.commit(); assert.equal(result.status, 'storage-changed');
  assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), before); f.safe(result);
});

test('legacy changes deny held replacement while the original hold stays closed', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true); f.setLegacy('PRIVATE_LATER_LEGACY');
  const result = await f.commit(); assert.equal(result.status, 'storage-changed');
  assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});

for (const mode of ['memory', 'context', 'owner', 'cancel', 'signal']) test('a changed ' + mode + ' guard denies held replacement', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true);
  if (mode === 'memory') f.setMemory(f.editorOriginalRaw + ' ');
  else if (mode === 'context') f.setGuard(false);
  else if (mode === 'owner') f.setActive(false);
  else if (mode === 'cancel') f.api.cancel();
  else { const controller = new AbortController(); controller.abort(); f.context.signal = controller.signal; }
  const result = await f.commit(); assert(['cancelled', 'candidate-invalid'].includes(result.status));
  assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});

test('a memory guard changed during async preparation cannot leave a candidate ready', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ hash: async raw => { await gate; return sha(raw); } });
  const pending = f.prepare(); await flush(); f.setMemory(f.editorOriginalRaw + ' '); release();
  assert.equal(await pending, false); assert.equal((await f.commit()).status, 'candidate-invalid');
  assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe();
});

test('the last transaction validation rechecks the app memory guard before queueing writes', async () => {
  let f;
  f = fixture({ idb: { afterRequest: ({ tx, key }) => {
    if (tx.mode === 'readwrite' && key === 'state:0') f.setMemory(f.editorOriginalRaw + ' ');
  } } });
  assert.equal(await f.prepare(), true); const result = await f.commit(); assert.equal(result.status, 'cancelled');
  assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});

for (const target of ['original', 'startup', 'oldHold', 'editor']) test('a conflicting immutable ' + target + ' address prevents every held-replacement write', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true); const key = f.keys()[target];
  f.idb.replace(key, target === 'editor' ? 'PRIVATE_CONFLICTING_EDITOR' : { value: 'PRIVATE_CONFLICTING_COPY' });
  const before = f.idb.snapshot(), result = await f.commit(); assert.equal(result.status, 'storage-changed');
  assert.equal(f.idb.writeCount(), 0, 'even earlier immutable records may not be queued before all conflicts are checked');
  assert.deepEqual(f.idb.snapshot(), before); f.safe(result);
});

test('identical prior immutable snapshots are reused without any add or put to those keys', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true); const keys = f.keys();
  f.idb.replace(keys.original, JSON.parse(f.hashes[0])); f.idb.replace(keys.startup, JSON.parse(f.hashes[1]));
  f.idb.replace(keys.oldHold, f.oldHold); f.idb.replace(keys.editor, f.editorOriginalRaw);
  assert.equal((await f.commit()).status, 'restored'); assert.equal(f.idb.writeCount(), 2);
  assert(f.idb.events.filter(event => ['add', 'put'].includes(event.op)).every(event => event.key === API.HOLD || event.key === 'state:0'));
  f.safe();
});

for (const mode of ['throwWrite', 'failWrite']) for (let index = 1; index <= 7; index++) test(mode + ' at held-replacement write ' + index + ' atomically retains slots, hold, editor and Excel originals', async () => {
  const f = fixture({ sources: true, idb: { [mode]: index } }); assert.equal(await f.prepare(), true);
  const result = await f.commit(); assert.equal(result.status, 'preservation-failed');
  assert.equal(result.committed, false, 'a rolled-back transaction is explicitly marked uncommitted');
  assert.deepEqual(f.idb.snapshot(), f.before); assert.deepEqual(f.idb.record(API.HOLD), f.oldHold);
  assert.equal(f.idb.record(f.keys().oldHold), undefined); assert.equal(f.idb.record(f.keys().editor), undefined); f.safe(result);
});

test('held replacement keeps existing Excel archive behavior and original clip bytes', async () => {
  const f = fixture({ sources: true }); assert.equal(await f.prepare(), true); assert.equal((await f.commit()).status, 'restored');
  const archive = f.idb.record('preserved:excel:v1:' + f.sourceDigest);
  assert(archive instanceof Blob); assert.equal(archive.type, f.source.type); assert.equal(await hashBlob(archive), f.sourceDigest);
  assert.deepEqual(f.idb.record(API.HOLD).excelSources, [{ key: 'xls:PRIVATE_EXCEL_SOURCE', bytes: f.source.size, digest: f.sourceDigest }]);
  assert.equal(f.idb.writeCount(), 7); f.safe();
});

test('a conflicting existing Excel archive denies a held replacement without overwriting it', async () => {
  const f = fixture({ sources: true }); assert.equal(await f.prepare(), true);
  f.idb.replace('preserved:excel:v1:' + f.sourceDigest, new Blob(['PRIVATE_ARCHIVE_CONFLICT']));
  const before = f.idb.snapshot(), result = await f.commit(); assert.equal(result.status, 'storage-changed');
  assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), before); f.safe(result);
});

test('cancellation after a queued held-replacement write rolls back all new preservation records', async () => {
  const controller = new AbortController();
  const f = fixture({ idb: { afterRequest: ({ op }) => { if (op === 'add') controller.abort(); } } });
  f.context.signal = controller.signal; assert.equal(await f.prepare(), true);
  const result = await f.commit(); assert.equal(result.status, 'cancelled'); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});

for (const target of ['slot', 'remaining-slot', 'original', 'startup', 'hold', 'oldHold', 'editor']) test('post-read mismatch in held ' + target + ' never reports restored or releases the hold', async () => {
  const f = fixture({ idb: { transformRead: ({ tx, key, value }) => {
    const selected = target === 'slot' ? key === 'state:0' : target === 'remaining-slot' ? key === 'state:1'
      : target === 'original' ? key.startsWith('preserved:recovery:v1:')
      : target === 'startup' ? key.startsWith('preserved:startup:v1:')
      : target === 'oldHold' ? key.startsWith('preserved:recovery-hold:v1:')
      : target === 'editor' ? key.startsWith('preserved:editor:v1:') : key === API.HOLD;
    return tx === 2 && selected ? { value: 'PRIVATE_POSTREAD_MISMATCH' } : value;
  } } });
  assert.equal(await f.prepare(), true); const result = await f.commit(); assert.equal(result.status, 'verify-failed');
  assert.equal(result.committed, true, 'the app must keep protection after a committed but unverified replacement');
  assert.equal(f.idb.record(API.HOLD).sourceKind, 'cloud-backup');
  assert.deepEqual(f.idb.record(f.keys().oldHold), f.oldHold); assert.equal(f.idb.record(f.keys().editor), f.editorOriginalRaw); f.safe(result);
});

for (const target of ['state:0', 'state:1', 'hold', 'oldHold', 'editor']) test('failed post-read of ' + target + ' keeps committed preservation and never reports restored', async () => {
  const f = fixture({ idb: { failRead: ({ tx, key }) => tx === 2 && (
    target === 'hold' ? key === API.HOLD : target === 'oldHold' ? key.startsWith('preserved:recovery-hold:v1:')
      : target === 'editor' ? key.startsWith('preserved:editor:v1:') : key === target
  ) } });
  assert.equal(await f.prepare(), true); const result = await f.commit(); assert.notEqual(result.status, 'restored');
  assert.equal(result.committed, true);
  assert.equal(f.idb.record(API.HOLD).sourceKind, 'cloud-backup'); assert.deepEqual(f.idb.record(f.keys().oldHold), f.oldHold); f.safe(result);
});

for (const mode of ['memory', 'cancel', 'signal']) test('post-commit ' + mode + ' cancellation is explicitly marked committed while protection and copies remain', async () => {
  let f, changed = false;
  const controller = new AbortController();
  f = fixture({ idb: { afterRequest: ({ tx, key }) => {
    if (changed || tx.mode !== 'readonly' || key !== 'state:0' || !f.idb.writeCount()) return;
    changed = true;
    if (mode === 'memory') f.setMemory(f.editorOriginalRaw + ' ');
    else if (mode === 'cancel') f.api.cancel();
    else controller.abort();
  } } });
  f.context.signal = controller.signal; assert.equal(await f.prepare(), true);
  const result = await f.commit(); assert.deepEqual(result, { status: 'cancelled', committed: true });
  assert.equal(f.idb.record(API.HOLD).sourceKind, 'cloud-backup');
  assert.deepEqual(f.idb.record(f.keys().oldHold), f.oldHold); assert.equal(f.idb.record(f.keys().editor), f.editorOriginalRaw); f.safe(result);
});

for (const target of ['hold', 'original', 'startup', 'oldHold', 'editor']) test('a failed transaction read of ' + target + ' aborts held replacement before any write', async () => {
  const f = fixture({ idb: { failRead: ({ tx, key }) => tx === 1 && (
    target === 'hold' ? key === API.HOLD : target === 'original' ? key.startsWith('preserved:recovery:v1:')
      : target === 'startup' ? key.startsWith('preserved:startup:v1:')
      : target === 'oldHold' ? key.startsWith('preserved:recovery-hold:v1:') : key.startsWith('preserved:editor:v1:')
  ) } });
  assert.equal(await f.prepare(), true); const result = await f.commit();
  assert.deepEqual(result, { status: 'preservation-failed', committed: false }); assert.equal(f.idb.writeCount(), 0);
  assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});

test('an explicitly unknown cloud-backup date keeps its source identity without inventing a timestamp', async () => {
  const f = fixture(); f.packet.sourceDateUnknown = true;
  assert.equal(await f.prepare(), true); assert.equal((await f.commit()).status, 'restored');
  const hold = f.idb.record(API.HOLD); assert.equal(hold.sourceKind, 'cloud-backup');
  assert.equal(hold.sourceDateUnknown, true); assert.equal(hold.sourceAt, null);
});

for (const mode of ['memory', 'context', 'owner']) test('a changed ' + mode + ' guard during queued writes rolls the entire held replacement back', async () => {
  let f, changed = false;
  f = fixture({ idb: { afterRequest: ({ op }) => {
    if (changed || op !== 'add') return; changed = true;
    if (mode === 'memory') f.setMemory(f.editorOriginalRaw + ' ');
    else if (mode === 'context') f.setGuard(false);
    else f.setActive(false);
  } } });
  assert.equal(await f.prepare(), true); const result = await f.commit();
  assert.deepEqual(result, { status: 'cancelled', committed: false });
  assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});

test('held replacement remains state-only with no app-state, credential adoption, save or network capability and no transaction await', () => {
  const source = fs.readFileSync(__dirname + '/../startup-file-restoration.js', 'utf8');
  assert.doesNotMatch(source, /\b(?:S|U)\s*[.=\[]|\b(?:fetch|save|saveNow|idbPut|putClip|delClip|restoreBackupFile|reload)\s*\(/);
  assert.doesNotMatch(source, /transaction\([^\n]*clips|objectStore\(['"]clips/);
  assert.match(source, /delete state\.ghToken/);
  const body = source.slice(source.indexOf('await new Promise'), source.indexOf('// Never change S'));
  assert.equal((body.match(/\bawait\b/g) || []).length, 1);
});
