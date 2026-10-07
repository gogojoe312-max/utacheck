'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const Inspection = require('../startup-file-inspection.js');
const Bounded = require('../startup-backup-inspection.js');
const Restoration = require('../startup-file-restoration.js');
const { indexedFixture } = require('./startup-file-restoration-fixture.cjs');
const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exactKey = ' 合成の旧合言葉 ';
const oldWork = () => ({
  shows: [{ id: 'PRIVATE_SHOW', name: 'PRIVATE_SHOW_NAME', groupId: 'PRIVATE_GROUP' }], showId: 'PRIVATE_SHOW',
  members: [{ id: 'PRIVATE_MEMBER', name: 'PRIVATE_MEMBER_NAME' }],
  groups: [{ id: 'PRIVATE_GROUP', name: 'PRIVATE_GROUP_NAME', key: 'PRIVATE_GROUP_KEY', gistId: 'PRIVATE_OLD_GIST' }], groupId: 'PRIVATE_GROUP',
  songs: [{ id: 'PRIVATE_SONG', title: 'PRIVATE_SONG_TITLE', showId: 'PRIVATE_SHOW', groupId: 'PRIVATE_GROUP', L: 0, roster: ['PRIVATE_MEMBER'] }],
  songLib: [[{ t: 'PRIVATE_LYRIC', parts: ['PRIVATE_MEMBER'], tag: 'ガヤ', cell: 'A3' }, { t: 'PRIVATE_SECOND_LYRIC', parts: ['PRIVATE_MEMBER'], tag: 'ガヤ', cell: 'A4' }]],
  rsongs: [{ id: 'PRIVATE_RECORDING_SONG', title: 'PRIVATE_RECORDING_TITLE', lines: [{ t: 'PRIVATE_RECORDING_LYRIC', solo: true }] }],
  notes: [{ id: 'PRIVATE_NOTE', songId: 'PRIVATE_SONG', showId: 'PRIVATE_SHOW', lineIdx: 0, memberIds: ['PRIVATE_MEMBER'], tags: [], memo: 'PRIVATE_NOTE_TEXT' }],
  pubNotes: [{ id: 'PRIVATE_PUB_NOTE', songId: 'PRIVATE_SONG', memberIds: ['PRIVATE_MEMBER'], tags: [], memo: 'PRIVATE_MEMBER_NOTE' }],
  memos: { 'PRIVATE_SHOW|PRIVATE_SONG': 'PRIVATE_MEMO' }, staffMemos: { 'PRIVATE_SHOW|PRIVATE_SONG': 'PRIVATE_STAFF_MEMO' },
  draws: { 'PRIVATE_SHOW|PRIVATE_SONG': [{ pts: [[0.1, 0.2]] }] },
  recs: { 'PRIVATE_SHOW|PRIVATE_SONG|0': { name: 'PRIVATE_AUDIO_METADATA', at: 123 } },
  plan: { start: '10:00', slots: [{ id: 'PRIVATE_SLOT', name: 'PRIVATE_MEMBER_NAME', min: 90 }] },
  trash: [{ id: 'PRIVATE_TRASH_ITEM', at: 1, songs: [] }],
  bkKey: exactKey, bkGistId: 'PRIVATE_BACKUP_GIST', ghToken: 'PRIVATE_EXPORT_TOKEN',
  unknown: { preserved: 'PRIVATE_UNKNOWN' }
});
function syntheticDocument() {
  const elements = new Map(), messages = [], handlers = new Map();
  const element = tag => ({
    tagName: tag.toUpperCase(), id: '', value: '', type: 'password', dataset: {}, disabled: false, hidden: false, inert: false,
    textContent: '', innerHTML: '', style: { setProperty() {}, removeProperty() {} }, children: [],
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    setAttribute(name, value) { this[name] = value; }, getAttribute(name) { return this[name]; },
    append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); messages.push(child); return child; },
    remove() { if (this.id) elements.delete(this.id); },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    addEventListener() {}, removeEventListener() {}, blur() {}, focus() {}, setSelectionRange() {},
    getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 390, bottom: 844, width: 390, height: 844 }; }
  });
  const app = element('main'); app.id = 'app'; elements.set('app', app);
  const body = element('body');
  const document = { hidden: false, body, activeElement: body, title: '', documentElement: element('html'),
    getElementById: id => elements.get(id) || null, createElement: element, querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener: (name, fn) => { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); }, removeEventListener() {} };
  for (const name of ['input', 'password', 'label', 'visibility', 'visible-notice', 'check', 'cancel', 'restore', 'result']) {
    const control = element(name === 'input' || name === 'password' ? 'input' : 'button');
    control.id = 'startup-file-' + name; control.hidden = name === 'restore'; control.disabled = name === 'check' || name === 'restore';
    elements.set(control.id, control);
  }
  return { document, app, elements, messages, handlers };
}
function appContext(idb, options = {}) {
  const dom = syntheticDocument(), reads = [], localWrites = [], calls = { network: 0, saves: 0, reloads: 0 }, windowHandlers = new Map();
  class Reader { readAsArrayBuffer(file) { file.arrayBuffer().then(bytes => { this.result = bytes; this.onload?.(); }); } abort() { this.onabort?.(); } }
  const localStorage = { getItem: () => null, setItem: (key, value) => localWrites.push([key, value]), removeItem: () => { throw Error('PRIVATE_DELETE_FORBIDDEN'); } };
  const window = { addEventListener: (name, fn) => { if (!windowHandlers.has(name)) windowHandlers.set(name, []); windowHandlers.get(name).push(fn); },
    removeEventListener() {}, innerWidth: 390, innerHeight: 844, scrollY: 0, visualViewport: null, indexedDB: {} };
  const c = vm.createContext({ window, document: dom.document, navigator: {}, location: { hash: '', origin: 'https://synthetic.invalid', pathname: '/', reload: () => calls.reloads++ },
    localStorage, sessionStorage: localStorage, indexedDB: { open: () => { throw Error('PRIVATE_NEW_DATABASE_FORBIDDEN'); } },
    syntheticDatabase: idb.database, StartupFileInspection: Inspection, StartupFileRestoration: Restoration, StartupBackupInspection: Bounded,
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, Blob, File, FileReader: Reader, AbortController,
    btoa, atob, structuredClone, URL, URLSearchParams, performance: { now: () => 0 }, innerWidth: 390, innerHeight: 844,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    fetch: () => { calls.network++; throw Error('PRIVATE_NETWORK_FORBIDDEN'); },
    alert: () => { throw Error('PRIVATE_UNEXPECTED_ALERT'); }, prompt: () => { throw Error('PRIVATE_UNEXPECTED_PROMPT'); }, confirm: () => { throw Error('PRIVATE_UNEXPECTED_CONFIRM'); }
  });
  vm.runInContext(source, c);
  vm.runInContext("DB=syntheticDatabase; save=()=>{callsForQA.saves++;throw Error('PRIVATE_NORMAL_SAVE_FORBIDDEN');}; saveNow=save;", Object.assign(c, { callsForQA: calls }));
  return { c, ...dom, calls, reads, localWrites, windowHandlers, run: text => vm.runInContext(text, c) };
}
async function waitBoot(f) {
  for (let i = 0; i < 300; i++) { if (f.run('startupPhase') !== 'loading') { await flush(); return; } await flush(); }
  throw Error('synthetic boot did not settle');
}
async function clipDigest(idb) {
  return Promise.all([...idb.stores.get('clips')].map(async ([key, value]) => [key, value.type, value.size, sha(new Uint8Array(await value.arrayBuffer()))]));
}
function database(extra = {}) {
  const clips = {};
  for (let i = 0; i < 100; i++) clips['xls:PRIVATE_WORKBOOK_' + i] = new Blob(['workbook-' + i]);
  for (let i = 0; i < 20; i++) clips['PRIVATE_SHOW|PRIVATE_SONG|' + i] = new Blob(['audio-' + i], { type: 'audio/mp4' });
  for (let i = 0; i < 4; i++) clips['PRIVATE_OTHER_' + i] = new Blob(['other-' + i], { type: 'application/octet-stream' });
  return indexedFixture({ state: {
    'state:0': { seq: 42, at: 1000, txt: '{"PRIVATE_BROKEN":' },
    'state:1': { seq: 41, at: 900, txt: JSON.stringify({ songs: [], notes: [], bkKey: exactKey }) },
    'unrelated-original': { value: 'PRIVATE_UNRELATED' }
  }, clips }, extra);
}
test('blank-password file check restores only on explicit button, then actual v36 load and migrate render the legacy work with all 124 clips preserved', async () => {
  const idb = database(), beforeClips = await clipDigest(idb), originals = idb.snapshot(), first = appContext(idb);
  await waitBoot(first); assert.equal(first.run('startupPhase'), 'blocked'); assert.equal(idb.writeCount(), 0);
  const sharedBefore = first.run('JSON.stringify(S)');
  const packet = { app: 'utacheck', ver: '16.41.23', at: 1791300000000, state: oldWork() }, packetBefore = JSON.stringify(packet);
  const packed = { bk: 1, z: false, data: Buffer.from(packetBefore).toString('base64url') };
  const encrypted = await first.c.sealJSON(packed, exactKey);
  const file = new File([JSON.stringify(encrypted)], 'PRIVATE_LEGACY_BACKUP.json'), fileBefore = Buffer.from(await file.arrayBuffer());
  first.c.startupSelectLocalFile(file); assert.equal(first.elements.get('startup-file-password').value, '');
  await first.c.startupCheckLocalFile();
  assert.equal(first.elements.get('startup-file-restore').hidden, false); assert.equal(first.elements.get('startup-file-restore').disabled, false);
  assert.match(first.elements.get('startup-file-result').textContent, /端末ファイル：124 \/ 音声形式 20 \/ Excelキー 100/);
  assert.doesNotMatch(first.elements.get('startup-file-result').textContent, /PRIVATE_|合成の旧合言葉/);
  assert.equal(first.run('JSON.stringify(S)'), sharedBefore); assert.equal(idb.writeCount(), 0); assert.deepEqual(idb.snapshot(), originals);
  assert.equal(first.calls.network, 0); assert.equal(first.calls.saves, 0); assert.equal(first.calls.reloads, 0);
  await first.c.startupRestoreLocalFile(); assert.equal(first.calls.reloads, 1); assert.equal(first.run('startupPhase'), 'blocked');
  assert.equal(first.run('JSON.stringify(S)'), sharedBefore); assert.equal(first.calls.network, 0); assert.equal(first.calls.saves, 0);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), fileBefore); assert.equal(JSON.stringify(packet), packetBefore);
  assert.deepEqual(await clipDigest(idb), beforeClips); assert.equal(idb.writeCount(), 4);
  const afterRestore = idb.snapshot(), second = appContext(idb); await waitBoot(second);
  assert.equal(second.run('startupPhase'), 'ready'); assert.equal(second.run('startupRecoveryNetworkHold'), true);
  assert.equal(second.run('booted'), true); assert.equal(second.app.inert, false);
  assert.match(second.app.innerHTML, /PRIVATE_SONG_TITLE/); assert.match(second.app.innerHTML.replace(/<[^>]*>/g, ''), /PRIVATE_LYRIC/);
  assert.equal(second.document.title, '歌チェック');
  const restored = JSON.parse(second.run('JSON.stringify(S)'));
  assert.equal(restored.songs[0].lines[0].tag, 'Gaya1'); assert.equal(restored.songs[0].lines[1].tag, 'Gaya2');
  assert.equal(restored.songs[0].lines[0].lcell, 'C3'); assert.equal(restored.rsongs[0].lines[0].vt, 'ソロ');
  assert.equal(restored.notes[0].memo, 'PRIVATE_NOTE_TEXT'); assert.equal(restored.pubNotes[0].memo, 'PRIVATE_MEMBER_NOTE');
  assert.equal(restored.staffMemos['PRIVATE_SHOW|PRIVATE_SONG'], 'PRIVATE_STAFF_MEMO'); assert.equal(restored.memos['PRIVATE_SHOW|PRIVATE_SONG'], 'PRIVATE_MEMO');
  assert.equal(restored.trash.length, 1); assert.equal(restored.ghToken, ''); assert.equal(restored.unknown.preserved, 'PRIVATE_UNKNOWN');
  assert.equal(second.run('startupCanCommunicate()'), false); assert.equal(second.calls.network, 0); assert.equal(second.calls.saves, 0);
  assert.equal(idb.writeCount(), 4, 'the preadded startup copy avoids extra startup quota writes');
  assert.deepEqual(idb.snapshot(), afterRestore); assert.deepEqual(await clipDigest(idb), beforeClips);
  assert(second.messages.some(node => node.textContent.includes('自動送受信は停止中')));
});
async function preparedApp(idb) {
  const f = appContext(idb); await waitBoot(f); assert.equal(f.run('startupPhase'), 'blocked');
  const packet = { app: 'utacheck', at: 1791300000000, state: oldWork() };
  const file = new File([JSON.stringify({ bk: 1, z: false, data: Buffer.from(JSON.stringify(packet)).toString('base64url') })], 'PRIVATE_BACKUP.json');
  f.c.startupSelectLocalFile(file); await f.c.startupCheckLocalFile();
  assert.equal(f.elements.get('startup-file-restore').disabled, false);
  return f;
}
for (const mode of ['quota', 'slot-change', 'verify']) test('app ' + mode + ' failure keeps protection, shared state, and network intact with zero reloads', async () => {
  const idb = database(mode === 'quota' ? { throwWrite: 2 } : mode === 'verify' ? { transformRead: ({ key, mode, value }) => mode === 'readonly' && key === Restoration.HOLD && value?.v === 1 ? { v: 9 } : value } : {});
  const f = await preparedApp(idb), sharedBefore = f.run('JSON.stringify(S)'), clipsBefore = await clipDigest(idb);
  if (mode === 'slot-change') idb.replace('state:0', { ...idb.record('state:0'), txt: '{"PRIVATE_CHANGED":' });
  const before = idb.snapshot(); await f.c.startupRestoreLocalFile();
  assert.equal(f.run('startupPhase'), 'blocked'); assert.equal(f.run('JSON.stringify(S)'), sharedBefore); assert.equal(f.app.inert, true);
  assert.equal(f.calls.reloads, 0); assert.equal(f.calls.network, 0); assert.equal(f.calls.saves, 0);
  assert.match(f.elements.get('startup-file-result').textContent, /保護停止を維持/); assert.doesNotMatch(f.elements.get('startup-file-result').textContent, /PRIVATE_|合成の旧合言葉/);
  assert.deepEqual(await clipDigest(idb), clipsBefore);
  if (mode === 'verify') assert.equal(idb.record(Restoration.HOLD).v, 1); else assert.deepEqual(idb.snapshot(), before);
});
for (const mode of ['hidden', 'stale', 'owner-denied', 'cancel']) test('app ' + mode + ' state cannot trigger restoration or reload', async () => {
  const idb = database(), f = await preparedApp(idb), sharedBefore = f.run('JSON.stringify(S)'), before = idb.snapshot();
  if (mode === 'hidden') f.document.hidden = true;
  else if (mode === 'stale') f.run('recordingInboxStale=true');
  else if (mode === 'owner-denied') f.run('recordingInboxProfileRequired=true;recordingInboxOwner={canWrite:false}');
  else f.c.startupCancelLocalFileInspection();
  await f.c.startupRestoreLocalFile(); assert.equal(f.run('startupPhase'), 'blocked'); assert.equal(f.run('JSON.stringify(S)'), sharedBefore);
  assert.equal(idb.writeCount(), 0); assert.deepEqual(idb.snapshot(), before); assert.equal(f.calls.reloads, 0); assert.equal(f.calls.network, 0); assert.equal(f.calls.saves, 0);
});
test('a migration exception after a committed recovery retains the network hold and all clips while blocking reload startup', async () => {
  const idb = database(), f = appContext(idb); await waitBoot(f);
  const state = oldWork(); state.tagWords = {};
  const file = new File([JSON.stringify({ bk: 1, z: false, data: Buffer.from(JSON.stringify({ app: 'utacheck', at: 1791300000000, state })).toString('base64url') })], 'PRIVATE_BAD_MIGRATION.json');
  const clipsBefore = await clipDigest(idb); f.c.startupSelectLocalFile(file); await f.c.startupCheckLocalFile();
  await f.c.startupRestoreLocalFile(); assert.equal(f.calls.reloads, 1);
  const before = idb.snapshot(), reopened = appContext(idb); await waitBoot(reopened);
  assert.equal(reopened.run('startupPhase'), 'blocked'); assert.equal(reopened.run('startupRecoveryNetworkHold'), true); assert.equal(reopened.app.inert, true);
  assert.equal(reopened.calls.network, 0); assert.equal(reopened.calls.saves, 0); assert.deepEqual(idb.snapshot(), before); assert.deepEqual(await clipDigest(idb), clipsBefore);
  assert.equal(reopened.run('startupDiagnostic.failure.stage'), 'prepare-state');
});
