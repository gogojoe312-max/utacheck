/* Recognition stays on this device. Saved originals never depend on model loading. */
"use strict";
importScripts("hand-data.js", "hand-model.js", "vendor/handwriting/ort.wasm.min.js");
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL("vendor/handwriting/", self.location.href).href;
const ready = Promise.all([
  ort.InferenceSession.create(new URL("vendor/handwriting/char_classifier.onnx", self.location.href).href, {executionProviders:["wasm"]}),
  fetch("vendor/handwriting/char_classifier_labels.txt").then(r=>{if(!r.ok)throw new Error("labels unavailable");return r.text();}).then(t=>Array.from(t.trim()))
]);
ready.catch(()=>{});
let queue = Promise.resolve();
self.onmessage = ({data}) => {
  queue = queue.catch(()=>{}).then(async()=>{
    const {id,hand} = data;
    try {
      const ink = HandData.clean(hand); if(!ink)throw new Error("empty ink");
      const [session,labels] = await ready;
      const candidates = [];
      for(let index=0;index<ink.cells.length;index++){
        const cell = ink.cells[index]; if(!cell.length)continue;
        const input = new ort.Tensor("float32",HandModel.raster(cell),[1,1,64,64]);
        let output;
        try {
          output = await session.run({image:input});
          if(output.probs.data.length !== labels.length)throw new Error("labels do not match model");
          candidates.push({index,choices:HandModel.choices(output.probs.data,labels)});
        } finally {input.dispose();if(output)Object.values(output).forEach(t=>t.dispose());}
      }
      self.postMessage({id,text:candidates.map(c=>c.choices[0]?.text||"□").join(""),candidates,engine:"dakanji-v2"});
    } catch (_) {self.postMessage({id,error:true});}
  });
};
