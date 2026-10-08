const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../print-pdf.js'), 'utf8');

function setup({land = false, count = 1, width = 643, height = 741, boxWidth = width, render, nodes, blob, pdfWidth, pdfHeight, addImage, fonts} = {}) {
  const effects = [], canvases = [], renders = [], pdfs = [];
  const liveStyle = {transform: 'scale(0.48)', margin: '0 auto', marginBottom: '-100px'};
  const innerStyle = {transform: 'none', fontSize: '9.21px', width: '971px'};
  const excelStyle = {transform: 'scale(0.55)', marginBottom: '-140px'};
  const doc = {
    body: {}, fonts,
    createTreeWalker() {
      let i = 0;
      const rows = nodes || [{nodeType: 1}, {nodeType: 3, nodeValue: '歌詞と歌割'}];
      return {nextNode() { return rows[i++] || null; }};
    },
  };
  const pages = Array.from({length: count}, () => ({
    offsetWidth: width, offsetHeight: height, isConnected: true,
    querySelector(selector) { assert.equal(selector, '.prbox'); return {offsetWidth: boxWidth, offsetHeight: height}; },
  }));
  const root = {
    id: 'prpage', nodeType: 1, ownerDocument: doc, isConnected: true, style: liveStyle,
    classList: {contains(name) { assert.equal(name, 'land'); return land; }},
    querySelectorAll(selector) { assert.equal(selector, '.prs'); return pages; },
  };
  class MockPDF {
    constructor(options) {
      this.options = options; this.images = []; this.added = []; this.outputs = [];
      this.internal = {pageSize: {getWidth: () => pdfWidth ?? (land ? 297 : 210), getHeight: () => pdfHeight ?? (land ? 210 : 297)}};
      pdfs.push(this);
    }
    addPage(...args) { this.added.push(args); }
    addImage(...args) { if (addImage) addImage(...args); this.images.push(args); }
    output(kind) { this.outputs.push(kind); return blob || new Blob(['%PDF-1.3\nlocal fixture'], {type: 'application/pdf'}); }
    save() { effects.push('save'); throw Error('Must return a blob without triggering a download'); }
  }
  const context = vm.createContext({
    Blob, Uint8Array,
    fetch() { effects.push('network'); throw Error('Network forbidden'); },
    XMLHttpRequest() { effects.push('network'); throw Error('Network forbidden'); },
    localStorage: {setItem() { effects.push('storage'); throw Error('Writes forbidden'); }},
    navigator: {share() { effects.push('share'); throw Error('Sharing is a separate user action'); }},
    jspdf: {jsPDF: MockPDF},
    async html2canvas(page, options) {
      for (const old of canvases) assert.equal(old.width * old.height, 0, 'Previous canvas must be released before the next render');
      const preview = {style: {...liveStyle}, inner: {...innerStyle}, excel: {...excelStyle}};
      const clone = {getElementById(id) { assert.equal(id, 'prpage'); return preview; }};
      options.onclone(clone);
      assert.equal(preview.style.transform, 'none'); assert.equal(preview.style.margin, '0');
      assert.deepEqual(preview.inner, innerStyle); assert.deepEqual(preview.excel, excelStyle);
      renders.push({page, options});
      if (render) return render({page, options, renders, canvases});
      const canvas = {width: options.width * options.scale, height: options.height * options.scale,
        toDataURL(type, quality) { assert.equal(type, 'image/jpeg'); assert.equal(quality, 0.94); return 'data:image/jpeg;base64,' + renders.length; }};
      canvases.push(canvas);
      return canvas;
    },
  });
  vm.runInContext(source, context);
  return {context, root, pages, doc, effects, canvases, renders, pdfs, create: filename => context.PrintPDF.create({root, filename})};
}

test('portrait PDF returns a local PDF blob and sanitized filename without changing live preview or sending it', async () => {
  const c = setup(); const before = {...c.root.style};
  const result = await c.create('公演/歌割:最終.PDF');
  assert.equal(result.filename, '公演_歌割_最終.pdf'); assert.equal(result.pages, 1);
  assert.equal(result.blob.type, 'application/pdf'); assert.match(await result.blob.text(), /^%PDF-/);
  assert.deepEqual(c.root.style, before); assert.deepEqual(c.effects, []);
  assert.equal(c.pdfs[0].options.orientation, 'portrait'); assert.equal(c.pdfs[0].options.format, 'a4');
  assert.deepEqual(c.pdfs[0].outputs, ['blob']);
  const image = c.pdfs[0].images[0];
  assert.equal(image[1], 'JPEG'); assert.equal(image[2], 0); assert(image[3] >= 0);
  assert.equal(image[4], 210); assert(image[5] <= 297);
  assert.equal(c.renders[0].options.backgroundColor, '#fff'); assert.equal(c.renders[0].options.scale, 2);
  assert.equal(c.canvases[0].width, 0); assert.equal(c.canvases[0].height, 0);
});

test('landscape captures the wider overflowing paper box and keeps every image on its own A4 page', async () => {
  const c = setup({land: true, count: 3, width: 643, boxWidth: 971, height: 544});
  assert.equal((await c.create()).filename, '歌割表.pdf');
  assert.equal(c.pdfs[0].options.orientation, 'landscape');
  assert.deepEqual(c.pdfs[0].added, [['a4', 'landscape'], ['a4', 'landscape']]);
  assert.equal(c.pdfs[0].images.length, 3);
  for (const capture of c.renders) assert.equal(capture.options.width, 971);
  for (const image of c.pdfs[0].images) {
    assert(image[2] >= 0); assert(image[3] >= 0);
    assert(image[2] + image[4] <= 297); assert(image[3] + image[5] <= 210);
    assert(Math.abs(image[4] / image[5] - 971 / 544) < 1e-10);
  }
  assert(c.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test('tall content scales down to fit the paper without cropping or distorting it', async () => {
  const c = setup({width: 500, height: 1000}); await c.create();
  const image = c.pdfs[0].images[0];
  assert.equal(image[5], 297); assert.equal(image[4], 148.5); assert(image[2] > 0); assert.equal(image[3], 0);
});

test('a later failed render rejects the whole export and never emits a partial PDF', async () => {
  const c = setup({count: 3, render({options, renders, canvases}) {
    if (renders.length === 2) throw Error('Page render failed');
    const canvas = {width: options.width * 2, height: options.height * 2, toDataURL: () => 'data:image/jpeg;base64,AA=='};
    canvases.push(canvas); return canvas;
  }});
  await assert.rejects(c.create(), /Page render failed/);
  assert.equal(c.renders.length, 2); assert.deepEqual(c.pdfs[0].outputs, []);
  assert(c.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test('canvas is released if encoding or PDF embedding fails, and a retry is allowed', async () => {
  for (const stage of ['encode', 'embed']) {
    let broken = true;
    const c = setup({addImage() { if (broken && stage === 'embed') throw Error('Embed failed'); }, render({options, canvases}) {
      const canvas = {width: options.width * 2, height: options.height * 2,
        toDataURL() { if (broken && stage === 'encode') throw Error('Encode failed'); return 'data:image/jpeg;base64,AA=='; }};
      canvases.push(canvas); return canvas;
    }});
    await assert.rejects(c.create(), /failed/); assert.deepEqual(c.pdfs[0].outputs, []);
    assert.equal(c.canvases[0].width, 0); assert.equal(c.canvases[0].height, 0);
    broken = false; assert.equal((await c.create()).pages, 1);
  }
});

test('all page sizes and DOM limits are validated before the first render', async () => {
  for (const value of [0, -1, Infinity, NaN, 100000]) {
    const c = setup({count: 2}); c.pages[1].offsetHeight = value;
    await assert.rejects(c.create(), /ページ/); assert.equal(c.renders.length, 0);
  }
  for (const options of [{count: 0}, {count: 61}, {nodes: Array(60001).fill({nodeType: 1})}, {nodes: [{nodeType: 3, nodeValue: 'a'.repeat(2000001)}]}]) {
    const c = setup(options); await assert.rejects(c.create()); assert.equal(c.renders.length, 0);
  }
});

test('invalid or oversize render output rejects and still releases its canvas', async () => {
  for (const [width, height, data] of [[0, 100, 'data:image/jpeg;base64,AA=='], [5000, 100, 'data:image/jpeg;base64,AA=='], [2100, 2000, 'data:image/jpeg;base64,AA=='], [100, 100, 'data:,']]) {
    const c = setup({render({canvases}) { const canvas = {width, height, toDataURL: () => data}; canvases.push(canvas); return canvas; }});
    await assert.rejects(c.create()); assert.equal(c.canvases[0].width, 0); assert.equal(c.canvases[0].height, 0);
    assert.deepEqual(c.pdfs[0].outputs, []);
  }
});

test('unavailable libraries, detached roots, invalid paper and invalid PDF bytes cannot report success', async () => {
  const missing = setup(); delete missing.context.html2canvas;
  await assert.rejects(missing.create(), /準備/);
  const detached = setup(); detached.root.isConnected = false;
  await assert.rejects(detached.create(), /画面/);
  await assert.rejects(setup({pdfWidth: NaN}).create(), /用紙/);
  for (const blob of [new Blob([], {type: 'application/pdf'}), new Blob(['%PDF-'], {type: 'text/plain'}), new Blob(['broken'], {type: 'application/pdf'})]) {
    await assert.rejects(setup({blob}).create(), /PDFファイル/);
  }
});

test('concurrent calls cannot allocate parallel canvases; the lock clears after completion', async () => {
  let ready;
  const c = setup({fonts: {ready: new Promise(resolve => { ready = resolve; })}});
  const first = c.create(); await assert.rejects(c.create(), /作成中/);
  assert.equal(c.renders.length, 0); ready(); await first;
  assert.equal((await c.create()).pages, 1);
});

test('vendored jsPDF produces readable multipage A4 PDF bytes in both orientations', async (t) => {
  const {jsPDF} = require('../vendor/jspdf.umd.min.js');
  // A real 1x1 white JPEG keeps this PDF container test independent of a browser.
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AD//Z';
  for (const land of [false, true]) {
    const c = setup({land, count: 3, render({options, canvases}) {
      const canvas = {width: options.width * 2, height: options.height * 2, toDataURL: () => jpeg};
      canvases.push(canvas); return canvas;
    }});
    c.context.jspdf.jsPDF = jsPDF;
    const result = await c.create();
    const data = await result.blob.text();
    assert.match(data, /^%PDF-/); assert.match(data, /%%EOF\s*$/);
    assert.equal((data.match(/\/Type \/Page\b/g) || []).length, 3);
    const boxes = [...data.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
    assert.equal(boxes.length, 3);
    for (const box of boxes) {
      assert(Math.abs(Number(box[1]) - (land ? 297 : 210) * 72 / 25.4) < 0.02);
      assert(Math.abs(Number(box[2]) - (land ? 210 : 297) * 72 / 25.4) < 0.02);
    }
    const parsed = require('node:child_process').spawnSync('pdfinfo', ['-f', '1', '-l', '3', '-'], {
      input: Buffer.from(await result.blob.arrayBuffer()), encoding: 'utf8', timeout: 10000,
    });
    await t.test('Poppler parses all three ' + (land ? 'landscape' : 'portrait') + ' pages', {
      skip: parsed.error && parsed.error.code === 'ENOENT' ? 'Optional local PDF parser is not installed' : false,
    }, () => {
      assert.ifError(parsed.error); assert.equal(parsed.status, 0, parsed.stderr);
      assert.match(parsed.stdout, /^Pages:\s+3$/m);
      const sizes = [...parsed.stdout.matchAll(/^Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/gm)];
      assert.equal(sizes.length, 3);
      for (const size of sizes) {
        assert(Math.abs(Number(size[1]) - (land ? 297 : 210) * 72 / 25.4) < 0.1);
        assert(Math.abs(Number(size[2]) - (land ? 210 : 297) * 72 / 25.4) < 0.1);
      }
    });
    assert(c.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  }
});
