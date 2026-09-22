# Japanese handwriting trial

Recognition math and reference strokes are derived from [KanjiCanvas](https://github.com/asdfjkl/kanjicanvas), revision `a9214105f156def3b96930e5fcf10b7652b7a1f7` (MIT; see `kanjicanvas-LICENSE.txt`).

`kanjicanvas.js` retains the recognition math and removes upstream DOM handlers, drawing UI and debug logging. `hand-patterns.json` combines 2,213 upstream kanji patterns and 144 hiragana/katakana XML samples, using moment normalization and feature extraction at interval 20. Coordinates are rounded to integers to reduce the model from over 6 MB to about 1.6 MB.

The app recognizes individual characters written in separate cells, not unrestricted cursive paragraphs. Results are experimental and can be wrong. There is no language model, sentence correction, audio recording or external recognition service. Small kana, punctuation and characters outside the reference set may require manual correction. Recognition always retains the original vector strokes and labels unreviewed text. Recognition runs in a worker; failed or late results never block note entry or replace manually corrected text.

Run `node --test tests/*.test.cjs`. The independent handwritten kana fixtures exercise the actual bundled recognizer. They do not establish a general Japanese handwriting accuracy rate or iPhone usability.
