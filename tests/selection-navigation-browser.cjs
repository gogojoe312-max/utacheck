// Synthetic local-browser regression checks. Never loads real user data or publishes.
// NODE_PATH must include Playwright. CHROMIUM_PATH can select a local Chromium.
// This exercises Chromium mobile emulation, not a physical iPhone or installed iOS PWA.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const root = path.resolve(__dirname, '..');
const out = process.env.QA_OUTPUT || path.join(os.tmpdir(), 'utacheck-selection-qa');
fs.mkdirSync(out, { recursive: true });
const requests = [], blocked = [], errors = [], results = [];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  requests.push({ method: req.method, url: req.url });
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  // Keep viewer refreshes inert. Tests deliver publications with applySetlist explicitly.
  if (pathname.startsWith('/fixture-')) { res.writeHead(503).end('Synthetic fixture: delayed publication'); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});

function seedEditor(origin) {
  S = Object.assign(structuredClone(S0), {
    viewer: false, groupId: 'ga', showId: 'a-new', deviceId: 'synthetic-device', autoPub: false,
    src: origin + '/fixture-editor.json', linkSrc: '',
    groups: [{ id: 'ga', name: '検証グループA', src: origin + '/fixture-a.json', gistId: '' },
      { id: 'gb', name: '検証グループB', src: origin + '/fixture-b.json', gistId: '' }],
    members: [{ id: 'ma', name: '検証メンバーA' }, { id: 'mb', name: '検証メンバーB' }],
    rosters: { '検証グループA': ['検証メンバーA'], '検証グループB': ['検証メンバーB'] },
    shows: [{ id: 'a-old', name: 'A 前回の公演', groupId: 'ga', ts: 1, folder: 'A公演' },
      { id: 'a-new', name: 'A 本日の公演', groupId: 'ga', ts: 3, folder: 'A公演' },
      { id: 'b-show', name: 'B 別グループの公演', groupId: 'gb', ts: 2, folder: 'B公演' },
      { id: 'mixed', name: '曲ごとに配信する公演', groupId: 'ga', deliveryMode: 'song', ts: 4 },
      { id: 'hidden', name: '非表示の公演', groupId: 'ga', hidden: true, ts: 5 }],
    folders: { A公演: true, B公演: true },
    memos: { 'a-old|song-a-old': '合成データの総括' },
    staffMemos: { 'a-old|song-a-old': '合成データのスタッフメモ' },
  });
  S.songs = ['a-old', 'a-new', 'b-show', 'mixed', 'hidden'].map(showId => ({
    id: 'song-' + showId, title: showId === 'b-show' ? 'Bの確認用楽曲' : 'Aの確認用楽曲', showId,
    groupId: showId === 'b-show' ? 'gb' : 'ga', take: 1, blocks: {}, roster: ['ma'],
    lines: [{ t: '合成データの歌詞一行目', label: '検証メンバーA', parts: ['ma'], sec: '1A' },
      { t: '確認用の歌詞二行目', label: '全員', parts: ['ma'] }],
  }));
  S.notes = [{ id: 'note-a-old', songId: 'song-a-old', showId: 'a-old', lineIdx: 0, memberIds: ['ma'], tags: ['rhythm'], memo: '合成の指摘' }];
  migrate();
  Object.assign(U, { view: 'live', mode: 'member', showFilter: '', songIdx: 0, menu: null, sheet: null, picker: false,
    overview: false, allShows: false, summaryReturn: null, summaryScroll: null, sumOpen: '', memberScope: '' });
  if (typeof viewSelections !== 'undefined') viewSelections.clear();
  for (const key of Object.keys(localStorage)) if (key.startsWith('utacheck.selection:')) localStorage.removeItem(key);
  renderPointers.clear(); scrollingUntil = 0; pendingRender = false; render(true); save();
  return saveNow();
}
function contentSnapshot() {
  return JSON.stringify({
    groups: S.groups, shows: S.shows, songs: S.songs, notes: S.notes, pubNotes: S.pubNotes,
    memos: S.memos, staffMemos: S.staffMemos, subs: S.subs, gsubs: S.gsubs,
    src: S.src, linkSrc: S.linkSrc, key: S.key, ghToken: S.ghToken, bkGistId: S.bkGistId,
    destinations: S.songs.map(so => [so.id, songDeliveryGroupId(so)]),
  });
}
function selection() { return { showId: S.showId, groupId: S.groupId, showFilter: U.showFilter }; }
function publication(ids = ['v-old', 'v-new']) {
  return { version: 1234, groupName: '閲覧用グループ', focusShow: ids.includes('v-new') ? 'v-new' : ids[0],
    shows: ids.map((id, i) => ({ id, name: id === 'v-old' ? '閲覧・前回の公演' : '閲覧・本日の公演', ts: i + 1 })),
    members: [{ name: '閲覧メンバー' }], rosters: { '閲覧用グループ': ['閲覧メンバー'] },
    songs: ids.map(id => ({ showId: id, title: '閲覧用の確認曲', order: ['閲覧メンバー'], lines: [['閲覧メンバー', '合成データの歌詞です']], take: 1 })),
    notes: ids.map((showId, songIdx) => ({ showId, songIdx, lineIdx: 0, memberNames: ['閲覧メンバー'], tags: ['rhythm'], memo: '閲覧用の合成指摘' })),
    memos: [{ showId: ids[0], songIdx: 0, text: '閲覧用の合成総括' }],
  };
}
async function configure(context, origin) {
  await context.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === origin) return route.continue();
    blocked.push({ method: route.request().method(), url });
    return route.abort();
  });
  context.on('page', page => { page.setDefaultTimeout(7000); page.on('pageerror', error => errors.push(error.message)); });
}
async function ready(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => typeof booted !== 'undefined' && booted && document.querySelector('#app')?.children.length);
}
async function openPicker(page) {
  if (!await page.evaluate(() => U.picker)) await page.locator('[data-act="picker"]').tap();
  await page.waitForSelector('.sheet [data-act="showfilter"]');
}
async function chooseFilter(page, id) {
  await openPicker(page);
  await page.locator(`.sheet [data-act="showfilter"][data-id="${id}"]`).tap();
  await page.waitForFunction(id => U.showFilter === id, id);
}
async function chooseShow(page, id) {
  await openPicker(page);
  await page.locator(`.sheet [data-act="jumpshow"][data-id="${id}"]`).tap();
  await page.waitForFunction(id => S.showId === id, id);
}
async function expectSelection(page, showId, groupId, showFilter) {
  assert.deepEqual(await page.evaluate(selection), { showId, groupId, showFilter });
}
async function assertUnchanged(page, before, label) { assert.equal(await page.evaluate(contentSnapshot), before, label); }
async function screenshot(page, name) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page horizontal overflow');
  const filename = path.join(out, name + '.png'); await page.screenshot({ path: filename }); return filename;
}

(async () => {
  let browser, persistent;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const launch = { headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] };
    browser = await chromium.launch(launch);
    for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await configure(context, origin);
      let page = await context.newPage(); await ready(page, origin);
      await page.evaluate(seedEditor, origin); await page.reload();
      await page.waitForFunction(() => booted && S.showId === 'a-new');
      const before = await page.evaluate(contentSnapshot);
      await chooseFilter(page, 'ga'); await chooseShow(page, 'a-old');
      await expectSelection(page, 'a-old', 'ga', 'ga');
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem(viewSelectionKey()))), {
        version: 1, showId: 'a-old', groupId: 'ga', showFilter: 'ga',
      }, 'selection stored synchronously before the state-save debounce');
      await page.reload(); await page.waitForFunction(() => booted && S.showId === 'a-old');
      await expectSelection(page, 'a-old', 'ga', 'ga');
      await openPicker(page);
      assert.equal(await page.locator('.sheet [data-act="jumpshow"][data-id="b-show"]').count(), 0);
      await screenshot(page, `editor-retained-${width}`);
      // Filtering by a different group does not reroute the currently selected show.
      await chooseFilter(page, 'gb'); await expectSelection(page, 'a-old', 'ga', 'gb');
      await assertUnchanged(page, before, 'group filter must not modify sources, destinations, or content');
      await chooseShow(page, 'b-show'); await expectSelection(page, 'b-show', 'gb', 'gb');
      // Close immediately after deliberate selection, then reopen in the same context.
      await page.close(); page = await context.newPage(); await ready(page, origin + '/index.html?launch=home');
      await expectSelection(page, 'b-show', 'gb', 'gb');
      await chooseFilter(page, ''); await expectSelection(page, 'b-show', 'gb', '');
      assert(await page.locator('.sheet [data-act="jumpshow"][data-id="a-old"]').isVisible());
      assert(await page.locator('.sheet [data-act="jumpshow"][data-id="b-show"]').isVisible());
      await page.reload(); await page.waitForFunction(() => booted && S.showId === 'b-show');
      await expectSelection(page, 'b-show', 'gb', '');
      await openPicker(page); await screenshot(page, `all-groups-retained-${width}`);
      await assertUnchanged(page, before, 'reload/page reopen/All must preserve all source, routing, and content data');
      // A mixed-delivery show permits a deliberate import-group switch without rerouting songs.
      await chooseShow(page, 'mixed');
      await page.locator('.sheet [data-act="cancel"]').tap();
      await page.locator('[data-act="go-setup"]').tap();
      await page.locator('details').filter({ has: page.locator('[data-act="usegroup"]') }).locator('summary').tap();
      await page.locator('[data-act="usegroup"][data-id="ga"]').tap();
      await expectSelection(page, 'mixed', 'ga', '');
      await page.reload(); await page.waitForFunction(() => booted && S.showId === 'mixed');
      await expectSelection(page, 'mixed', 'ga', '');
      await assertUnchanged(page, before, 'explicit mixed-show group switch must not reroute or edit content');
      results.push({ width, height, editorReload: true, closeReopen: true, groupFiltersAndAll: true, explicitGroupSwitch: true,
        sourcesRoutingContentUnchanged: true, horizontalOverflow: false });
      await context.close();
    }

    // A fresh Chromium process reuses its real on-disk browser profile and a root launch URL.
    const profile = fs.mkdtempSync(path.join(out, 'profile-'));
    const persistentOptions = { ...launch, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' };
    persistent = await chromium.launchPersistentContext(profile, persistentOptions); await configure(persistent, origin);
    let page = await persistent.newPage(); await ready(page, origin); await page.evaluate(seedEditor, origin);
    await chooseFilter(page, 'gb'); await chooseShow(page, 'b-show');
    const restartBefore = await page.evaluate(contentSnapshot);
    await page.evaluate(() => saveNow()); await persistent.close(); persistent = null;
    persistent = await chromium.launchPersistentContext(profile, persistentOptions); await configure(persistent, origin);
    page = await persistent.newPage(); await ready(page, origin + '/');
    await expectSelection(page, 'b-show', 'gb', 'gb'); await assertUnchanged(page, restartBefore, 'browser restart preserves data');
    await openPicker(page); await screenshot(page, 'home-launch-browser-restart-390');
    results.push({ persistentChromiumProfileRestart: true, cleanHomeLaunchURL: true, retained: ['show', 'group', 'filter'], nativeInstalledPWA: false });
    await persistent.close(); persistent = null;

    // Viewer restore waits for its source's delayed publication and cannot select foreign shows.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await configure(context, origin); page = await context.newPage(); await ready(page, origin);
    await page.evaluate(({ origin, data }) => {
      S = Object.assign(structuredClone(S0), { viewer: true, groupId: 'viewer-group', showId: '', deviceId: 'viewer-fixture',
        src: origin + '/fixture-viewer-a.json', linkSrc: origin + '/fixture-viewer-a.json',
        groups: [{ id: 'viewer-group', name: '閲覧用グループ', gistId: '' }] });
      Object.assign(U, { view: 'summary', mode: 'member', showFilter: '', menu: null, sheet: null, picker: false, allShows: false, summaryReturn: null });
      applySetlist(data); U.view = 'summary'; render(true);
    }, { origin, data: publication() });
    await page.locator('#summary-show').selectOption('v-old');
    const sourceBefore = await page.evaluate(() => JSON.stringify([S.src, S.linkSrc, S.groups, S.key, S.ghToken, S.bkGistId]));
    await page.evaluate(async () => {
      // Simulate cached state missing the chosen show while its local preference survives.
      S.shows = S.shows.filter(sw => sw.id !== 'v-old'); S.songs = S.songs.filter(so => so.showId !== 'v-old');
      S.showId = 'v-new'; save(); await saveNow();
    });
    await page.reload(); await page.waitForFunction(() => booted && S.showId === 'v-new');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(viewSelectionKey())).showId), 'v-old');
    await page.evaluate(async data => { await new Promise(resolve => setTimeout(resolve, 80)); applySetlist(data); }, publication());
    await expectSelection(page, 'v-old', 'viewer-group', '');
    assert.equal(await page.evaluate(() => JSON.stringify([S.src, S.linkSrc, S.groups, S.key, S.ghToken, S.bkGistId])), sourceBefore);
    assert.equal(await page.locator('#summary-show').inputValue(), 'v-old');
    await screenshot(page, 'viewer-delayed-restore-390');
    await page.evaluate(data => applySetlist(data), publication(['v-new']));
    await expectSelection(page, 'v-new', 'viewer-group', '');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(viewSelectionKey())).showId), 'v-old', 'missing preference survives until user chooses again');
    await page.evaluate(data => applySetlist(data), publication());
    await expectSelection(page, 'v-old', 'viewer-group', '');
    await page.locator('#summary-show').selectOption('v-new');
    await page.evaluate(data => applySetlist(data), publication());
    await expectSelection(page, 'v-new', 'viewer-group', '');
    await page.close(); page = await context.newPage(); await ready(page, origin + '/');
    await expectSelection(page, 'v-new', 'viewer-group', '');
    const viewerData = await page.evaluate(contentSnapshot);
    await page.evaluate(() => {
      const preference = { version: 1, showId: 'foreign-show', groupId: 'foreign-group', showFilter: 'deleted-group' };
      localStorage.setItem(viewSelectionKey(), JSON.stringify(preference));
      if (typeof viewSelections !== 'undefined') viewSelections.clear();
      restoreViewSelection();
    });
    await expectSelection(page, 'v-new', 'viewer-group', '');
    await assertUnchanged(page, viewerData, 'unavailable viewer preference cannot change data or source group');
    // Preferences for a different source must not override this source.
    await page.evaluate(origin => {
      localStorage.setItem('utacheck.selection:viewer:' + origin + '/fixture-viewer-b.json', JSON.stringify({ version: 1, showId: 'v-old', groupId: 'viewer-group', showFilter: '' }));
      localStorage.removeItem(viewSelectionKey());
      if (typeof viewSelections !== 'undefined') viewSelections.clear();
      restoreViewSelection();
    }, origin);
    await expectSelection(page, 'v-new', 'viewer-group', '');
    results.push({ viewerDelayedPublication: true, missingShowFallback: true, preferencePreservedUntilExplicitChoice: true,
      viewerCloseReopen: true, sourceIsolation: true, sourceRoutingUnchanged: true });
    await context.close();

    // Editor missing/deleted/hidden selection fallback, including an invalid group filter.
    const fallbackContext = await browser.newContext({ serviceWorkers: 'block' }); await configure(fallbackContext, origin);
    page = await fallbackContext.newPage(); await ready(page, origin); await page.evaluate(seedEditor, origin);
    const fallbackBefore = await page.evaluate(contentSnapshot);
    for (const missing of ['deleted-show', 'hidden']) {
      await page.evaluate(showId => {
        localStorage.setItem(viewSelectionKey(), JSON.stringify({ version: 1, showId, groupId: 'deleted-group', showFilter: 'deleted-group' }));
        if (typeof viewSelections !== 'undefined') viewSelections.clear();
        S.showId = showId; S.groupId = 'deleted-group'; restoreViewSelection(); render(true);
      }, missing);
      await expectSelection(page, 'a-old', 'ga', '');
      await assertUnchanged(page, fallbackBefore, 'fallback cannot mutate stored show/song ownership or content');
    }
    results.push({ deletedShowFallback: true, hiddenShowFallback: true, deletedGroupFilterFallback: true, dataUnchanged: true });
    await fallbackContext.close();
    assert.deepEqual(errors, [], 'no uncaught page errors');
    assert(!requests.some(r => r.method !== 'GET'), 'no local mutation requests');
    assert(!blocked.some(r => !['GET', 'HEAD'].includes(r.method)), 'no attempted external writes');
    const report = { engine: 'Chromium', nativeIPhone: false, serviceWorkers: 'blocked', realUserData: false, productionPublication: false,
      results, errors, network: { localRequests: requests.length, blockedExternalRequests: blocked.length, externalWrites: 0 }, output: out };
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await persistent?.close(); await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
