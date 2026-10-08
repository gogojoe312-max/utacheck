/* Render the prepared print pages into a local PDF. No upload or data writes. */
(function (global) {
  'use strict';

  const SCALE = 2;
  const MAX_PAGES = 60;
  const MAX_NODES = 60000;
  const MAX_TEXT = 2000000;
  const MAX_EDGE = 4096;
  const MAX_PIXELS = 4000000;
  const MAX_BYTES = 64 * 1024 * 1024;
  let creating = false;

  function fail(message) { throw new Error(message); }

  function filenameFor(value) {
    let name = typeof value === 'string' ? value : '';
    name = name.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').trim().replace(/\.pdf$/i, '');
    return (name.slice(0, 160).trim() || '歌割表') + '.pdf';
  }

  // html2canvas clones the document, so bound that work as well as the pages.
  function checkDocument(doc) {
    if (!doc.body || typeof doc.createTreeWalker !== 'function') fail('PDFにする画面を開き直してください。');
    const walker = doc.createTreeWalker(doc.body, 5); // SHOW_ELEMENT | SHOW_TEXT
    let count = 0, text = 0, node;
    while ((node = walker.nextNode())) {
      count++;
      if (node.nodeType === 3) text += (node.nodeValue || '').length;
      if (count > MAX_NODES || text > MAX_TEXT) fail('PDFにする内容が多すぎます。曲を少なくしてお試しください。');
    }
  }

  function positive(value) { return Number.isFinite(value) && value > 0; }

  function checkCanvasSize(width, height) {
    if (!positive(width) || !positive(height)) fail('PDFのページサイズを確認できません。画面を開き直してください。');
    if (width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
      fail('PDFのページが大きすぎます。曲を少なくしてお試しください。');
    }
  }

  function pageSize(page) {
    // offset sizes ignore the small-screen transform on #prpage. Landscape
    // .prbox can overflow the 170mm section, and must be included in full.
    let width = page.offsetWidth, height = page.offsetHeight;
    if (!positive(width) || !positive(height)) fail('PDFのページサイズを確認できません。画面を開き直してください。');
    const box = page.querySelector('.prbox');
    if (box) {
      if (!positive(box.offsetWidth) || !positive(box.offsetHeight)) fail('PDFのページサイズを確認できません。画面を開き直してください。');
      width = Math.max(width, box.offsetWidth);
      height = Math.max(height, box.offsetHeight);
    }
    width = Math.ceil(width);
    height = Math.ceil(height);
    checkCanvasSize(width * SCALE, height * SCALE);
    return {width, height};
  }

  async function create(options) {
    if (creating) fail('PDFを作成中です。完了するまでお待ちください。');
    creating = true;
    try {
      const root = options && options.root;
      if (!root || root.nodeType !== 1 || root.id !== 'prpage' || !root.ownerDocument || root.isConnected === false) {
        fail('PDFにする画面を開いてからお試しください。');
      }
      const doc = root.ownerDocument;
      const html2canvas = global.html2canvas;
      const PDF = global.jspdf && global.jspdf.jsPDF;
      if (typeof html2canvas !== 'function' || typeof PDF !== 'function') fail('PDF作成の準備ができていません。アプリを再読み込みしてください。');
      const pages = Array.from(root.querySelectorAll('.prs'));
      if (!pages.length) fail('PDFにする曲がありません。');
      if (pages.length > MAX_PAGES) fail('一度にPDFにできるのは60曲までです。曲を分けてお試しください。');
      checkDocument(doc);
      if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
      const sizes = pages.map(pageSize); // Validate every page before allocating.
      const orientation = root.classList.contains('land') ? 'landscape' : 'portrait';
      const pdf = new PDF({orientation, unit: 'mm', format: 'a4', compress: true});
      const paper = pdf.internal.pageSize;
      const paperWidth = paper.getWidth(), paperHeight = paper.getHeight();
      if (!positive(paperWidth) || !positive(paperHeight)) fail('PDFの用紙サイズを確認できません。');
      let imageBytes = 0;

      for (let i = 0; i < pages.length; i++) {
        if (root.isConnected === false || pages[i].isConnected === false) fail('PDFの画面が変わりました。もう一度お試しください。');
        let canvas;
        try {
          const size = sizes[i];
          canvas = await html2canvas(pages[i], {
            scale: SCALE,
            backgroundColor: '#fff',
            width: size.width,
            height: size.height,
            logging: false,
            allowTaint: false,
            useCORS: false,
            imageTimeout: 10000,
            removeContainer: true,
            onclone(clone) {
              const preview = clone.getElementById('prpage');
              if (!preview) fail('PDFの画面を読み取れません。');
              preview.style.transform = 'none';
              preview.style.margin = '0';
              // Keep .prin/.prxl fonts, widths and transforms from fitPrintDOM.
            },
          });
          if (!canvas) fail('PDFのページを作成できません。');
          checkCanvasSize(canvas.width, canvas.height);
          const jpeg = canvas.toDataURL('image/jpeg', 0.94);
          if (typeof jpeg !== 'string' || !/^data:image\/jpeg;base64,.+/.test(jpeg)) fail('PDFの画像を作成できません。');
          imageBytes += jpeg.length;
          if (imageBytes > MAX_BYTES / 2) fail('PDFファイルが大きすぎます。曲を分けてお試しください。');
          if (i) pdf.addPage('a4', orientation);
          const ratio = Math.min(paperWidth / canvas.width, paperHeight / canvas.height);
          const width = canvas.width * ratio, height = canvas.height * ratio;
          pdf.addImage(jpeg, 'JPEG', (paperWidth - width) / 2, (paperHeight - height) / 2, width, height, undefined, 'FAST');
        } finally {
          // Release each backing buffer before rendering the next page (iOS).
          if (canvas) { canvas.width = 0; canvas.height = 0; }
        }
      }

      const blob = pdf.output('blob');
      if (!blob || blob.type !== 'application/pdf' || !positive(blob.size)) fail('PDFファイルを作成できません。');
      if (blob.size > MAX_BYTES) fail('PDFファイルが大きすぎます。曲を分けてお試しください。');
      const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
      if (header.length !== 5 || ![37, 80, 68, 70, 45].every((byte, i) => header[i] === byte)) fail('PDFファイルを確認できません。');
      return {blob, filename: filenameFor(options.filename), pages: pages.length};
    } finally {
      creating = false;
    }
  }

  global.PrintPDF = Object.freeze({create});
})(typeof window !== 'undefined' ? window : globalThis);
