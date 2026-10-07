'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const inboxAPI = require('../recording-inbox.js');
const appSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const ptSource = fs.readFileSync(path.join(__dirname, '../ptlink.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

// Execute the shipped function bodies, including their guards. These functions
// close at their declaration indentation; no browser boot or network is run.
function functionSource(name, source = appSource, indent = '') {
  const declaration = new RegExp('^' + indent + '(?:async )?function ' + name + '\\(', 'm');
  const match = declaration.exec(source);
  assert(match, 'missing shipped function: ' + name);
  const start = match.index, nextLine = source.indexOf('\n', start);
  if (source.slice(start, nextLine).trimEnd().endsWith('}')) return source.slice(start, nextLine);
  const closing = new RegExp('^' + indent + '}[;\\t ]*(?:\\r?\\n|$)', 'm').exec(source.slice(nextLine));
  assert(closing, 'missing closing body: ' + name);
  return source.slice(start, nextLine + closing.index + closing[0].length);
}
function sourceBlock(start, end, source = appSource) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, 'missing integration block');
  return source.slice(a, b);
}
function fixture(extra = {}) {
  const effects = [], network = [], writes = [], timers = new Map(), intervals = new Map();
  let timerId = 0;
  const trackState = (value, seen = new WeakMap(), at = 'S') => {
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const proxy = new Proxy(value, {
      get(target, key, receiver) { return trackState(Reflect.get(target, key, receiver), seen, at + '.' + String(key)); },
      set(target, key, value) { writes.push(['set', at + '.' + String(key)]); return Reflect.set(target, key, value); },
      deleteProperty(target, key) { writes.push(['delete', at + '.' + String(key)]); return Reflect.deleteProperty(target, key); },
      defineProperty(target, key, descriptor) { writes.push(['define', at + '.' + String(key)]); return Reflect.defineProperty(target, key, descriptor); },
    });
    seen.set(value, proxy); return proxy;
  };
  const forbidden = name => (...args) => { effects.push(name); throw new Error('unexpected synthetic effect: ' + name); };
  const state = {
    songs: [{ id: 'synthetic-song', lines: [{ t: 'synthetic lyric' }] }], notes: [], rsongs: [], shows: [],
    groups: [{ id: 'synthetic-group', name: 'synthetic group', gistId: 'abc123',
      src: 'https://gist.githubusercontent.com/synthetic/abc123/raw/abcdef/utacheck.json', key: 'synthetic-key' }],
    groupId: 'synthetic-group', ghToken: 'synthetic-token', bkGistId: 'abc124', bkKey: 'synthetic-key',
    bkError: 'synthetic existing status', bkHash: 'synthetic-hash', bkSeen: 10,
    src: 'https://gist.githubusercontent.com/synthetic/abc123/raw/utacheck.json', linkSrc: 'synthetic old source',
    recs: { 'synthetic-old-recording': { ts: 1 } }, trash: [{ at: 1, clips: ['synthetic-trash-clip'] }],
    pt: { on: true, url: 'https://synthetic.invalid', gistId: 'abc125', token: 'synthetic-pt-token', seq: 7 },
    privateUnknownField: { retained: true }, autoPub: true,
    ...extra.appState,
  };
  const c = vm.createContext({
    startupPhase: 'ready', startupRecoveryNetworkHold: true,
    recordingInboxStale: false, recordingInboxProfileRequired: false, recordingInboxOwner: null,
    recordingInboxWriters: 0, recordingInboxDrainWaiters: [], recordingInboxIntegration: null,
    recordingInboxInvalidated: () => {},
    S: trackState(state), U: { view: 'live' },
    document: { hidden: false, addEventListener() {}, querySelector: () => null },
    window: { addEventListener() {} },
    location: { hash: '#g=synthetic-connection' },
    localStorage: { getItem: () => null, setItem: forbidden('localStorage.setItem'), removeItem: forbidden('localStorage.removeItem') },
    fetch: async (url, options) => { network.push({ url, options }); throw new Error('unexpected synthetic fetch'); },
    save: forbidden('save'), saveNow: forbidden('saveNow'), idbPut: forbidden('idbPut'), db: forbidden('db'),
    commitFields: forbidden('commitFields'), flushSheet: forbidden('flushSheet'),
    queuePublication: forbidden('queuePublication'), publishGroups: forbidden('publishGroups'),
    readSyncBackup: forbidden('readSyncBackup'), openEditLink: forbidden('openEditLink'), b64d: forbidden('b64d'),
    srcUrl: forbidden('srcUrl'), resetForNewSource: forbidden('resetForNewSource'), applySetlist: forbidden('applySetlist'),
    render: forbidden('render'), renderBackupStatus: forbidden('renderBackupStatus'), alert: forbidden('alert'),
    prompt: forbidden('prompt'), confirm: forbidden('confirm'),
    syncing: false, manualSync: false, backupInFlight: false, publishInFlight: false, preview: null,
    booted: true, bootErr: false, saving: false, saveErr: false, REC: null,
    renderPointers: new Set(), scrollingUntil: 0, typingNow: () => false, VIEW: () => false,
    mergeRecordingAddition: forbidden('mergeRecordingAddition'), loadRaw: forbidden('loadRaw'),
    syncErr: 'synthetic prior sync status', syncAt: 4, syncBackoff: 5, otherAt: 6,
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) { const id = ++timerId; intervals.set(id, { fn, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
    AbortController, AbortSignal, URL, TextDecoder, TextEncoder, Date, Promise, Error, TypeError,
    ...extra,
  });
  for (const name of ['startupCanCommunicate', 'recordingInboxCanWrite', 'recordingInboxAssertWriter',
    'recordingInboxAdmitWriter', 'enterRecordingInboxEditor']) vm.runInContext(functionSource(name), c);
  const before = JSON.stringify(c.S);
  return {
    c, network, effects, writes, timers, intervals,
    load: (...names) => names.forEach(name => vm.runInContext(functionSource(name), c)),
    loadPT: (...names) => names.forEach(name => vm.runInContext(functionSource(name, ptSource, '  '), c)),
    unchanged() {
      assert.equal(JSON.stringify(c.S), before, 'saved application state remains byte-for-byte unchanged');
      assert.deepEqual(writes, [], 'no transient state write is allowed before the hold check');
      assert.deepEqual(effects, [], 'no save, database write, prompt, or downstream operation');
      assert.equal(c.recordingInboxWriters, 0, 'no admitted writer leaks');
    },
    sealed() { this.unchanged(); assert.deepEqual(network, [], 'no fetch, MIDI, WebRTC send or connection'); },
  };
}

test('recovered ready state keeps local editing available while communication is denied', () => {
  const f = fixture();
  assert.equal(f.c.recordingInboxCanWrite(), true);
  assert.equal(f.c.startupCanCommunicate(), false);
  f.c.startupRecoveryNetworkHold = false;
  assert.equal(f.c.startupCanCommunicate(), true);
  for (const condition of [{ startupPhase: 'loading' }, { startupPhase: 'blocked' }, { recordingInboxStale: true },
    { recordingInboxProfileRequired: true, recordingInboxOwner: null },
    { recordingInboxProfileRequired: true, recordingInboxOwner: { canWrite: false } }]) {
    const denied = fixture({ startupRecoveryNetworkHold: false, ...condition });
    assert.equal(denied.c.startupCanCommunicate(), false); denied.sealed();
  }
  f.sealed();
});

for (const method of ['GET', 'HEAD', 'PATCH', 'POST', 'DELETE']) test('gh ' + method + ' rejects before admission, timers, fetch or state mutation', async () => {
  const f = fixture(); f.load('gh', 'boundedPublicationRequest');
  await assert.rejects(f.c.gh('/gists/abc123', { method, body: 'synthetic body' }), /recovery-network-held/);
  assert.equal(f.timers.size, 0); f.sealed();
});

test('bounded raw/API request denies direct callers before fetch and response-body handling', async () => {
  const f = fixture(); f.load('boundedPublicationRequest'); let read = 0;
  await assert.rejects(f.c.boundedPublicationRequest('https://synthetic.invalid/raw', {}, () => { read++; }), /recovery-network-held/);
  assert.equal(read, 0); assert.equal(f.timers.size, 0); f.sealed();
});

for (const [name, args, expected] of [
  ['fetchSetlist', [], null], ['importFromLink', [], false], ['doPush', [true], false],
  ['doPush', ['force'], false], ['doBackup', [true], false], ['doBackup', [false], false],
  ['checkOther', [], false], ['checkOther', [true], false], ['syncSetlist', [false], false], ['syncSetlist', [true], false],
]) test(name + '(' + args.join(',') + ') stops before fetching, applying or saving', async () => {
  const f = fixture(); f.load(name);
  assert.equal(await f.c[name](...args), expected);
  assert.equal(f.c.syncErr, 'synthetic prior sync status'); assert.equal(f.c.syncAt, 4);
  assert.equal(f.c.syncBackoff, 5); assert.equal(f.c.otherAt, 6); f.sealed();
});

test('edit-link imports also stop before the edit-link restoration path', async () => {
  const f = fixture({ location: { hash: '#e=synthetic-edit-link' } }); f.load('importFromLink');
  assert.equal(await f.c.importFromLink(), false); f.sealed();
});

test('truncated cloud backup raw retrieval is sealed independently of gh', async () => {
  const f = fixture(); f.load('backupFileText');
  f.c.cloudReadStageError = (_stage, error) => error;
  await assert.rejects(f.c.backupFileText({ truncated: true, raw_url: 'https://gist.githubusercontent.com/synthetic/abc123/raw/file' }), /recovery-network-held/);
  f.sealed();
});

for (const [name, args] of [
  ['publicationDiagnosticReadGist', ['abc123', 'synthetic-token']],
  ['publicationDiagnosticReadFile', [{ truncated: true, raw_url: 'https://gist.githubusercontent.com/synthetic/abc123/raw/utacheck.json' }, 'abc123']],
]) test('read-only ' + name + ' cannot bypass the raw/API communication hold', async () => {
  const f = fixture(); f.load(name, 'boundedPublicationRequest');
  f.c.publicationDiagnosticError = code => Object.assign(new Error(code), { code });
  await assert.rejects(f.c[name](...args), /recovery-network-held/); f.sealed();
});

test('normal ready gh traffic still reaches the injected fetch and reads the response when the hold is absent', async () => {
  const f = fixture({ startupRecoveryNetworkHold: false }); f.load('gh', 'boundedPublicationRequest');
  const response = { ok: true, json: async () => ({ id: 'synthetic-read-response' }) };
  f.c.fetch = async (url, options) => { f.network.push({ url, options }); return response; };
  assert.deepEqual(await f.c.gh('/gists/abc123'), { id: 'synthetic-read-response' });
  assert.equal(f.network.length, 1); assert.equal(f.network[0].url, 'https://api.github.com/gists/abc123');
  assert.equal(f.timers.size, 0); f.unchanged();
});

function inboxFixture(extra) {
  const f = fixture(extra); let inbox, options;
  f.c.RecordingInbox = {
    createGate: inboxAPI.createGate, createLocalAdapter: inboxAPI.createLocalAdapter,
    create(value) { options = value; inbox = inboxAPI.create({ ...value, fetch: f.c.fetch,
      timers: { setTimeout: f.c.setTimeout, clearTimeout: f.c.clearTimeout,
        setInterval: f.c.setInterval, clearInterval: f.c.clearInterval } }); return inbox; },
  };
  f.c.localStorage.getItem = () => JSON.stringify({ endpoint: 'https://synthetic.invalid', token: 'synthetic-device-token' });
  vm.runInContext(sourceBlock('function setupRecordingInboxIntegration() {',
    'try { recordingInboxIntegration = setupRecordingInboxIntegration();'), f.c);
  const integration = f.c.setupRecordingInboxIntegration();
  return { ...f, inbox, options, integration };
}
test('real recording inbox receive, scheduled polling, apply gate and local adapter stay sealed', async () => {
  const f = inboxFixture(); assert.equal(f.inbox.enrolled, true);
  assert.equal(f.options.canPoll(), false); assert.equal(f.integration.gate.acquire(), null);
  assert.equal((await f.inbox.receive()).status, 'busy');
  await assert.rejects(f.options.local.apply({}), /EDITOR_BUSY/);
  assert.equal(f.intervals.size, 1);
  for (const timer of f.intervals.values()) { assert.equal(timer.ms, 60000); timer.fn(); }
  await flush(); assert.equal(f.integration.gate.applying, false); f.sealed(); f.inbox.stop();
});
test('normal ready recording inbox can poll and apply gate can acquire when the hold is absent', async () => {
  const calls = [];
  const f = inboxFixture({ startupRecoveryNetworkHold: false, fetch: async (url, options) => {
    calls.push({ url, options }); return { ok: true, text: async () => '{"operation":null}' };
  } });
  assert.equal(f.options.canPoll(), true);
  const release = f.integration.gate.acquire(); assert.equal(typeof release, 'function'); release();
  assert.equal((await f.inbox.receive()).status, 'idle'); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://synthetic.invalid/v1/inbox');
  assert.equal(calls[0].options.method, 'GET'); assert.equal(f.timers.size, 0); f.unchanged(); f.inbox.stop();
});

function ptFixture(extra) {
  const f = fixture(extra);
  Object.assign(f.c, {
    cfg: () => f.c.S.pt, midiPort: () => ({ send: value => f.network.push({ midi: value }) }),
    rtcReady: () => true, chan: { send: value => f.network.push({ rtc: value }) },
    RTCPeerConnection: function () { f.network.push({ rtcConnection: true }); throw new Error('synthetic RTC trap'); },
    curSec: () => '1A', curTake: () => 2, secIndex: () => 1, SECTIONS: ['RH', '1A'], GFILE: 'utacheck-pt.json',
    rtc: { currentRemoteDescription: null, setRemoteDescription: async () => {} }, rtcState: 'connecting', rtcAnswerTimer: null,
    rtcStop: () => {}, paint: () => {}, store: () => { f.effects.push('PT store'); },
  });
  f.loadPT('inboxWritable', 'inboxTransport'); return f;
}
test('PT transport denies its callback before writer admission', async () => {
  const f = ptFixture(); let ran = 0;
  await assert.rejects(f.c.inboxTransport(() => { ran++; }), /recovery-network-held/);
  assert.equal(ran, 0); f.sealed();
});
for (const [name, args] of [
  ['midiSend', [1, 2]], ['bridgeSend', [{ synthetic: true }]], ['rtcSend', [{ t: 'locate' }]],
  ['rtcConnect', []], ['gistWrite', [{ synthetic: true }]], ['gistCreate', []],
]) test('PT ' + name + ' denies every device/network effect and seq mutation', async () => {
  const f = ptFixture(); f.loadPT(name);
  await assert.rejects(f.c[name](...args), /recovery-network-held/);
  assert.equal(f.timers.size, 0); f.sealed();
});
test('normal ready PT transport executes the callback once and drains writer admission', async () => {
  const f = ptFixture({ startupRecoveryNetworkHold: false }); let ran = 0;
  assert.equal(await f.c.inboxTransport(() => { ran++; return 'synthetic sent'; }), 'synthetic sent');
  assert.equal(ran, 1); f.unchanged();
});

test('PT automatic RTC ping respects the hold even with an already-open channel', () => {
  const f = ptFixture(); f.loadPT('rtcPing'); f.c.pingAt = 9;
  assert.equal(f.c.inboxWritable(), false); f.c.rtcPing();
  assert.equal(f.c.pingAt, 9); f.sealed();
});
test('PT answer polling stops before scheduling or fetch when already held', async () => {
  const f = ptFixture(); f.loadPT('waitAnswer');
  await assert.rejects(f.c.waitAnswer(0), /recovery-network-held/);
  assert.equal(f.timers.size, 0); f.sealed();
});
test('PT queued answer poll rechecks the hold before its delayed fetch', async () => {
  const f = ptFixture({ startupRecoveryNetworkHold: false }); f.loadPT('waitAnswer');
  const pending = f.c.waitAnswer(0); assert.equal(f.timers.size, 1);
  f.c.startupRecoveryNetworkHold = true;
  for (const [id, timer] of f.timers) { assert.equal(timer.ms, 1200); f.timers.delete(id); timer.fn(); }
  await assert.rejects(pending, /recovery-network-held/); f.sealed();
});
test('direct Gist publication cannot canonicalize a source or mutate publication metadata while held', async () => {
  const f = fixture(); f.load('gistPush');
  assert.equal(await f.c.gistPush('synthetic-group', true), false); f.sealed();
});

// Exercise automatic entry points with real downstream guards. Timer execution
// is explicit, so these tests never create real timers or make external calls.
test('automatic publication, member sync, backup/check and online event remain sealed', async () => {
  for (const appState of [{}, { ghToken: '', groups: [], src: 'https://synthetic.invalid/setlist.json' }]) {
    const f = fixture({ appState }); const online = [];
    Object.assign(f.c, { window: { addEventListener: (name, handler) => { if (name === 'online') online.push(handler); } },
      pushState: '未送信', pushTimer: null, lastPushAt: 0, backupRetryAt: 0,
      hasPending: () => true, bkSignature: () => 'synthetic changed signature' });
    f.load('doPush', 'doBackup', 'checkOther', 'syncSetlist');
    vm.runInContext(sourceBlock('window.addEventListener("online",', '// 変わっていない相手には送らない'), f.c);
    vm.runInContext(sourceBlock('// アプリを開いている間、自動でやりとりする', '/* ---- バックアップ ---- */'), f.c);
    for (const handler of online) handler();
    for (const timer of f.intervals.values()) if ([6000, 30000].includes(timer.ms)) timer.fn();
    await flush(); f.sealed();
  }
});

for (const [name, args, expected] of [
  ['purgeRecs', [], 0], ['purgeTrash', [], undefined], ['sweep', [], undefined], ['delClip', ['synthetic-old-recording'], undefined],
]) test('emergency recovery also preserves ancillary data against ' + name, () => {
  const f = fixture(); f.load(name);
  assert.equal(f.c[name](...args), expected); f.sealed();
});
