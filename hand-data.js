/* Compact vector handwriting. Shared by the UI and recognition worker. */
"use strict";
const HandData = (() => {
  const MAX_CELLS = 36, MAX_STROKES = 32, MAX_POINTS = 64;
  const hasInk = hand => Array.isArray(hand?.cells) && hand.cells.some(c => Array.isArray(c) && c.some(s => Array.isArray(s) && s.length));
  function clean(hand) {
    if (!hand || hand.v !== 1 || !Array.isArray(hand.cells)) return null;
    const cells = hand.cells.slice(0, MAX_CELLS).map(cell => !Array.isArray(cell) ? [] : cell.slice(0, MAX_STROKES).map(stroke => {
      if (!Array.isArray(stroke)) return [];
      const pts = stroke.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
        .map(p => p.map(v => Math.round(Math.max(0, Math.min(255, v)))));
      if (pts.length <= MAX_POINTS) return pts;
      return Array.from({length:MAX_POINTS}, (_, i) => pts[Math.round(i * (pts.length - 1) / (MAX_POINTS - 1))]);
    }).filter(s => s.length));
    while (cells.length && !cells.at(-1).length) cells.pop();
    if (!hasInk({cells})) return null;
    return {v:1, cells, text:String(hand.text || "").slice(0, 1000),
      state:["pending","draft","manual","unread"].includes(hand.state) ? hand.state : "unread"};
  }
  function svg(hand) {
    const ink = clean(hand); if (!ink) return "";
    const count = ink.cells.length, cols = Math.min(6, count), rows = Math.ceil(count / cols);
    const paths = ink.cells.map((cell, i) => `<g transform="translate(${(i % cols) * 48},${Math.floor(i / cols) * 48}) scale(.1875)">${cell.map(s =>
      `<path d="M${s.map(p => p.join(",")).join(" L")}${s.length === 1 ? " l.1,.1" : ""}"/>`).join("")}</g>`).join("");
    return `<svg class="hand-original" role="img" aria-label="手書きの原文" viewBox="0 0 ${cols * 48} ${rows * 48}" width="${cols * 48}" height="${rows * 48}" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }
  return {MAX_CELLS, MAX_STROKES, MAX_POINTS, hasInk, clean, svg};
})();
