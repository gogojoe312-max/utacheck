# Local handwriting recognition assets

All handwriting inference runs in the browser's Web Worker. The app sends no handwriting to a recognition API. Files here are downloaded on first use (about 17 MB total), then can be cached for offline use. Browser storage eviction or a first offline visit can still prevent recognition; original ink must always remain saved.

## DaKanji model

- Project: https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition
- Release: v2.0, https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition/releases/tag/v2.0
- Sources: release assets `char_classifier_onnx.zip` and `char_classifier_labels.zip`.
- Model: `char_classifier.onnx`, quantized ONNX model, 6,507 labels.
- License: MIT; original notice is retained in `dakanji-LICENSE.txt`.
- Input: one character per 64×64 grayscale image, white strokes on a black background, NCHW float32. The original 256×256 stroke frame is retained rather than tightly cropping, to preserve cues for small kana.
- Output: five candidates for each nonempty cell. Scores are model scores, not calibrated probabilities of correctness.
- The label file lacks some small katakana. The app's edit UI supports switching large/small kana explicitly.

## ONNX Runtime Web

- Package: `onnxruntime-web@1.30.0` from https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.30.0.tgz
- Sources: package `dist/ort.wasm.min.js`, `dist/ort-wasm-simd-threaded.mjs`, `dist/ort-wasm-simd-threaded.wasm`.
- Project: https://github.com/microsoft/onnxruntime/tree/v1.30.0
- License: MIT; `onnxruntime-LICENSE` and `onnxruntime-ThirdPartyNotices.txt` are included.
- WASM uses one thread so the app works without cross-origin isolation headers.

`SHA256SUMS` records the vendored bytes. Model, labels and runtime files must be updated as a compatible set.

## Validation limits

The comparison fixtures in the development workspace are assistant-designed stroke sequences, not the user's handwriting and not an independent human accuracy benchmark. They verify the image/model connection and regression behavior only. Actual handwriting and real iPhone/Safari performance require hands-on validation before making this the default public app engine.
