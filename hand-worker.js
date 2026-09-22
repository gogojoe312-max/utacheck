/* Japanese stroke recognition runs off the UI thread; nothing leaves the device. */
"use strict";
importScripts("hand-data.js", "vendor/kanjicanvas.js");
const patternsReady = fetch("vendor/hand-patterns.json").then(r => {
  if (!r.ok) throw new Error("patterns unavailable");
  return r.json();
}).then(patterns => { KanjiCanvas.refPatterns = patterns; });
// A failed download is reported per request, without an unhandled rejection.
patternsReady.catch(() => {});
self.onmessage = async ({data}) => {
  const {id, hand} = data;
  try {
    await patternsReady;
    const ink = HandData.clean(hand);
    if (!ink) throw new Error("empty ink");
    const result = ink.cells.map(cell => {
      if (!cell.length) return "";
      KanjiCanvas.recordedPattern_note = cell;
      const features = KanjiCanvas.extractFeatures(KanjiCanvas.momentNormalize("note"), 20);
      if (!features.flat().every(p => p.every(Number.isFinite))) return "□";
      const coarse = KanjiCanvas.coarseClassification(features);
      return Array.from(KanjiCanvas.fineClassification(features, coarse).trim())[0] || "□";
    }).join("");
    self.postMessage({id, text:result});
  } catch (_) { self.postMessage({id, error:true}); }
};
