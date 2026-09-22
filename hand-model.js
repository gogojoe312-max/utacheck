/* Raster input for DaKanji. White ink on black; preserve the original vectors. */
"use strict";
const HandModel = (() => {
  const SIZE = 64;
  function raster(cell, normalized = false) {
    const canvas = new OffscreenCanvas(SIZE, SIZE), ctx = canvas.getContext("2d", {willReadFrequently:true});
    if (!ctx) throw new Error("handwriting canvas unavailable");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.lineCap = ctx.lineJoin = "round";
    const points = cell.flat(), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const span = Math.max(right-left, bottom-top, 1);
    const point = ([x,y]) => normalized
      ? [(x-(left+right)/2)*52/span+32,(y-(top+bottom)/2)*52/span+32]
      : [x/4,y/4];
    for (const stroke of cell) {
      if (!stroke.length) continue;
      ctx.beginPath(); const first = point(stroke[0]); ctx.moveTo(...first);
      for (const p of stroke.slice(1)) ctx.lineTo(...point(p));
      if (stroke.length === 1) ctx.lineTo(first[0]+.1,first[1]+.1);
      ctx.stroke();
    }
    const rgba = ctx.getImageData(0,0,SIZE,SIZE).data;
    return Float32Array.from({length:SIZE*SIZE},(_,i)=>rgba[i*4]/255);
  }
  function choices(scores, labels) {
    return Array.from(scores, (score,i)=>({text:labels[i],score:Number(score)}))
      .filter(x=>x.text && Number.isFinite(x.score) && x.score>0)
      .sort((a,b)=>b.score-a.score).slice(0,5);
  }
  return {SIZE,raster,choices};
})();
