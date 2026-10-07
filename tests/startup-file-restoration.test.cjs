'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const API = require('../startup-file-restoration.js');
const { indexedFixture, copy } = require('./startup-file-restoration-fixture.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const sha = value => createHash('sha256').update(value).digest('hex');
const work = extra => ({
  songs: [{ id: 'PRIVATE_FILE_SONG', lines: [{ t: 'PRIVATE_FILE_LYRIC' }] }],
  notes: [{ id: 'PRIVATE_FILE_NOTE', memo: 'PRIVATE_FILE_MEMO' }],
  rsongs: [], recs: { 'PRIVATE_RECORDING_KEY': { name: 'PRIVATE_AUDIO_METADATA' } },
  ghToken: 'PRIVATE_FILE_TOKEN', bkKey: 'PRIVATE_FILE_KEY',
  unknown: { private: 'PRIVATE_UNKNOWN_FIELD' }, ...extra
});
function fixture(options = {}) {
  let active = options.active !== false;
  let legacy = options.legacy === undefined ? null : options.legacy;
  const slots = options.slots || [
    { seq: 20, at: 1000, txt: '{"PRIVATE_MALFORMED_JSON":' },
    { seq: 19, at: 900, txt: JSON.stringify(work({ bkKey: 'PRIVATE_OLD_SAVED_KEY' })) }
  ];
  const state = { 'unrelated-original': { nested: 'PRIVATE_UNRELATED_RECORD' }, ...(options.state || {}) };
  slots.forEach((value, index) => { if (value !== undefined) state['state:' + index] = value; });
  const idb = indexedFixture({ state, clips: {
    'PRIVATE_AUDIO_KEY': new Uint8Array([0, 1, 254, 255]),
    'xls:PRIVATE_WORKBOOK_KEY': new Uint8Array([9, 8, 7])
  } }, options.idb || {});
  const context = { signal: new AbortController().signal, isActive: () => active };
  const hashes = [];
  const api = API.create({
    database: () => options.noDatabase ? null : idb.database,
    readLegacy: () => { if (options.legacyReadFailure) throw Error('PRIVATE_LEGACY_READ'); return legacy; },
    validate: value => {
      if (!value || !Array.isArray(value.songs) || !Array.isArray(value.notes)) throw Error('PRIVATE_BAD_STATE');
      options.validate?.(value);
    },
    hasWork: value => !!(value.songs.length || value.notes.length),
    hash: async value => { hashes.push(value); return options.hash ? options.hash(value) : sha(value); },
    isActive: () => active
  });
  const packet = { app: 'utacheck', at: 1791300000000, state: work() };
  const before = idb.snapshot(), packetBefore = JSON.stringify(packet);
  const safe = result => {
    assert.doesNotMatch(JSON.stringify(result ?? {}), /PRIVATE_|ghToken|bkKey|preserved:|recovery:/);
    assert.equal(JSON.stringify(packet), packetBefore, 'the source packet must stay unchanged');
    assert.deepEqual(idb.snapshot().clips, before.clips, 'every ancillary byte must stay unchanged');
    assert.equal(idb.events.filter(event => event.store === 'clips' || event.scope?.includes('clips')).length, 0);
  };
  return { api, idb, context, packet, before, hashes, safe, slots,
    deactivate: () => { active = false; }, activate: () => { active = true; },
    setLegacy: value => { legacy = value; },
    prepare: () => api.prepare(packet, context), commit: () => api.commit(context)
  };
}
test('restoration is lazy and prepare only reads existing state records', async () => {
  const f = fixture(); assert.equal(f.idb.transactions.length, 0);
  assert.equal(await f.prepare(), true); assert.equal(f.idb.writeCount(), 0);
  assert.deepEqual(f.idb.snapshot(), f.before);
  assert.deepEqual(f.idb.events.filter(event => event.op === 'get').map(event => event.key), ['state:0', 'state:1', API.HOLD]);
  assert(f.idb.transactions.every(tx => tx.mode === 'readonly' && tx.scope.join() === 'state'));
  f.safe();
});
test('explicit commit atomically adds original copies, highest sequence plus one, and the network hold', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true);
  const result = await f.commit(); assert.deepEqual(result, { status: 'restored' });
  const txs = f.idb.events.filter(event => event.op === 'transaction');
  assert.deepEqual(txs.map(tx => tx.mode), ['readonly', 'readwrite', 'readonly']);
  assert(txs.every(tx => tx.scope.join() === 'state'));
  const written = f.idb.events.filter(event => ['add', 'put', 'delete'].includes(event.op));
  assert.equal(new Set(written.map(event => event.tx)).size, 1);
  assert.deepEqual(written.map(event => event.op), ['add', 'add', 'add', 'put']);
  const newest = f.idb.record('state:1'); assert.equal(newest.seq, 21);
  assert.deepEqual(f.idb.record('state:0'), f.slots[0]);
  assert.deepEqual(f.idb.record('unrelated-original'), Object.fromEntries(f.before.state)['unrelated-original']);
  const restored = JSON.parse(newest.txt), expected = copy(f.packet.state); delete expected.ghToken;
  assert.deepEqual(restored, expected);
  const hold = f.idb.record(API.HOLD);
  assert.equal(hold.seq, 21); assert.equal(hold.slot, 1); assert.equal(hold.sourceAt, f.packet.at);
  assert.equal(hold.candidateDigest, sha(newest.txt));
  const original = { slots: f.slots.map(value => ({ present: true, value })), legacy: null };
  assert.equal(JSON.stringify(f.idb.record(hold.copyKey)), JSON.stringify(original));
  assert.equal(hold.copyKey, 'preserved:recovery:v1:' + sha(JSON.stringify(original)));
  const after = copy(original); after.slots[1] = { present: true, value: newest };
  assert.equal(JSON.stringify(f.idb.record(hold.startupKey)), JSON.stringify(after));
  assert.equal(hold.startupKey, 'preserved:startup:v1:' + sha(JSON.stringify(after)));
  const reread = f.idb.events.filter(event => event.op === 'get' && event.tx === 2).map(event => event.key);
  assert.deepEqual(reread, ['state:0', 'state:1', hold.copyKey, hold.startupKey, API.HOLD]);
  assert.equal(await f.prepare(), false, 'persistent hold denies a second restore after reload');
  f.safe(result);
});
test('restoration with two absent slots still preserves explicit absence and starts at sequence one', async () => {
  const f = fixture({ slots: [undefined, undefined] }); assert.equal(await f.prepare(), true);
  assert.equal((await f.commit()).status, 'restored');
  assert.equal(f.idb.record('state:0'), undefined); assert.equal(f.idb.record('state:1').seq, 1);
  const hold = f.idb.record(API.HOLD); assert.deepEqual(f.idb.record(hold.copyKey), { slots: [{ present: false }, { present: false }], legacy: null });
  f.safe();
});
test('an identical existing immutable original copy is reused without overwriting', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true);
  const original = JSON.parse(f.hashes[0]), key = 'preserved:recovery:v1:' + sha(f.hashes[0]);
  f.idb.replace(key, original); assert.equal((await f.commit()).status, 'restored');
  assert.equal(f.idb.events.filter(event => event.key === key && ['add', 'put'].includes(event.op)).length, 0);
  assert.deepEqual(f.idb.record(key), original); f.safe();
});
test('different data at an immutable copy key aborts instead of replacing any record', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true);
  f.idb.replace('preserved:recovery:v1:' + sha(f.hashes[0]), { private: 'PRIVATE_COLLISION' });
  const before = f.idb.snapshot(); const result = await f.commit();
  assert.equal(result.status, 'storage-changed'); assert.deepEqual(f.idb.snapshot(), before); assert.equal(f.idb.writeCount(), 0); f.safe(result);
});
for (let index = 1; index <= 4; index++) test('synchronous quota error at write ' + index + ' rolls every record back', async () => {
  const f = fixture({ idb: { throwWrite: index } }); assert.equal(await f.prepare(), true);
  const result = await f.commit(); assert.equal(result.status, 'preservation-failed');
  assert.deepEqual(f.idb.snapshot(), f.before); assert.equal(f.idb.record(API.HOLD), undefined); f.safe(result);
});
for (let index = 1; index <= 4; index++) test('asynchronous quota error at write ' + index + ' rolls every record back', async () => {
  const f = fixture({ idb: { failWrite: index } }); assert.equal(await f.prepare(), true);
  const result = await f.commit(); assert.equal(result.status, 'preservation-failed');
  assert.deepEqual(f.idb.snapshot(), f.before); assert.equal(f.idb.record(API.HOLD), undefined); f.safe(result);
});
for (const index of [0, 1]) test('a changed generation ' + index + ' denies commit with no writes', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true);
  f.idb.replace('state:' + index, { ...f.slots[index], txt: f.slots[index].txt + ' ' });
  const changed = f.idb.snapshot(), result = await f.commit();
  assert.equal(result.status, 'storage-changed'); assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), changed); f.safe(result);
});
test('an intervening network hold denies commit and keeps the hold and generations unchanged', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true); f.idb.replace(API.HOLD, { v: 1, private: 'PRIVATE_PREVIOUS_HOLD' });
  const changed = f.idb.snapshot(), result = await f.commit(); assert.equal(result.status, 'recovery-held');
  assert.deepEqual(f.idb.snapshot(), changed); assert.equal(f.idb.writeCount(), 0); f.safe(result);
});
test('legacy must be exactly null, and a legacy change after prepare aborts without writes', async () => {
  for (const legacy of ['', 'PRIVATE_LEGACY_BYTES', undefined]) {
    const f = fixture({ legacy }); if (legacy === undefined) f.setLegacy(undefined);
    assert.equal(await f.prepare(), false); assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe();
  }
  const f = fixture(); assert.equal(await f.prepare(), true); f.setLegacy('PRIVATE_LATER_LEGACY');
  const result = await f.commit(); assert.equal(result.status, 'storage-changed'); assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});
test('unreadable legacy and generation records never count as absent', async () => {
  for (const extra of [{ legacyReadFailure: true }, { idb: { failRead: ({ key }) => key === 'state:0' } }, { noDatabase: true }]) {
    const f = fixture(extra); assert.equal(await f.prepare(), false); assert.equal((await f.commit()).status, 'candidate-invalid');
    assert.deepEqual(f.idb.snapshot(), f.before); assert.equal(f.idb.writeCount(), 0); f.safe();
  }
});
test('malformed sequence metadata cannot manufacture a newer generation', async () => {
  for (const seq of [undefined, null, -1, '20', 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    const f = fixture({ slots: [{ seq, txt: '{' }, undefined] }); assert.equal(await f.prepare(), false);
    assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe();
  }
});
test('empty or structurally invalid candidate stays unavailable without mutating originals', async () => {
  for (const state of [work({ songs: [], notes: [] }), work({ songs: {} }), null]) {
    const f = fixture(); f.packet.state = state; assert.equal(await f.prepare(), false);
    assert.equal((await f.commit()).status, 'candidate-invalid'); assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before);
  }
});
test('inactive, cancelled, and aborted candidates cannot enter the write transaction', async () => {
  const hidden = fixture({ active: false }); assert.equal(await hidden.prepare(), false); assert.equal(hidden.idb.transactions.length, 0);
  for (const mode of ['hidden', 'cancel', 'signal']) {
    const f = fixture(); assert.equal(await f.prepare(), true);
    if (mode === 'hidden') f.deactivate(); else if (mode === 'cancel') f.api.cancel();
    else { const controller = new AbortController(); controller.abort(); f.context.signal = controller.signal; }
    const result = await f.commit(); assert(['cancelled', 'candidate-invalid'].includes(result.status));
    assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
  }
});
test('abort after a queued write rolls back copies, slot, and hold together', async () => {
  const controller = new AbortController();
  const f = fixture({ idb: { afterRequest: ({ op }) => { if (op === 'add') controller.abort(); } } });
  f.context.signal = controller.signal; assert.equal(await f.prepare(), true);
  const result = await f.commit(); assert.equal(result.status, 'cancelled'); assert.deepEqual(f.idb.snapshot(), f.before); f.safe(result);
});
test('concurrent commit requests cannot create duplicate restoration writes', async () => {
  const f = fixture(); assert.equal(await f.prepare(), true); const pending = f.commit();
  assert.equal(f.api.busy, true); assert.equal((await f.commit()).status, 'candidate-invalid');
  assert.equal((await pending).status, 'restored'); assert.equal(f.idb.writeCount(), 4); assert.equal(f.api.busy, false); f.safe();
});
test('cancellation during hashing discards the prepared candidate', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ hash: async value => { await gate; return sha(value); } });
  const pending = f.prepare(); await flush(); f.api.cancel(); release(); assert.equal(await pending, false);
  assert.equal((await f.commit()).status, 'candidate-invalid'); assert.equal(f.idb.writeCount(), 0); assert.deepEqual(f.idb.snapshot(), f.before); f.safe();
});
for (const target of ['slot', 'remaining-slot', 'original', 'startup', 'hold']) test('readonly reread mismatch in ' + target + ' cannot report restored', async () => {
  const f = fixture({ idb: { transformRead: ({ tx, key, value }) => {
    const selected = target === 'slot' ? key === 'state:1' : target === 'remaining-slot' ? key === 'state:0' : target === 'original' ? key.startsWith('preserved:recovery:')
      : target === 'startup' ? key.startsWith('preserved:startup:') : key === API.HOLD;
    return tx === 2 && selected ? (target === 'remaining-slot' ? { seq: 100, at: 2000, txt: JSON.stringify(work()) } : { private: 'PRIVATE_VERIFICATION_MISMATCH' }) : value;
  } } });
  assert.equal(await f.prepare(), true); const result = await f.commit(); assert.equal(result.status, 'verify-failed');
  assert.equal(f.idb.record(API.HOLD).v, 1, 'a completed commit keeps network disabled even when verification fails'); f.safe(result);
});
test('readonly verification failure cannot report restored, while committed preservation remains', async () => {
  const f = fixture({ idb: { failRead: ({ tx }) => tx === 2 } }); assert.equal(await f.prepare(), true);
  const result = await f.commit(); assert.notEqual(result.status, 'restored'); assert.equal(f.idb.record(API.HOLD).v, 1); f.safe(result);
});
test('restoration module has no app state, normal save, clips, network, or reload capability', () => {
  const source = fs.readFileSync(__dirname + '/../startup-file-restoration.js', 'utf8');
  assert.doesNotMatch(source, /\b(?:S|U)\s*[.=\[]|\b(?:fetch|save|saveNow|idbPut|putClip|delClip|restoreBackupFile|reload)\s*\(/);
  assert.doesNotMatch(source, /transaction\([^\n]*clips|objectStore\(['"]clips/);
  const body = source.slice(source.indexOf('await new Promise'), source.indexOf('// Never change S'));
  assert.equal((body.match(/\bawait\b/g) || []).length, 1, 'no await may occur inside the readwrite transaction callbacks');
});
