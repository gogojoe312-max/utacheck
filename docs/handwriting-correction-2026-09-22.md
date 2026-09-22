# Saved handwriting correction — 2026-09-22

This is a component update on top of app version 16.36.1. The service-worker cache revision is `utacheck-16.36.1-hand2`.

## User flow

The main choices remain 音程・リズム・ニュアンス・良い. Select a saved handwriting note, open 文字を修正, expand 別方式で読み直す（試用）, and tap 別方式で読み直す. Tap an alternative character or 大小 to fix small kana, then explicitly press 保存. Until that save, model results exist only in the editor; the saved record and its original strokes do not change.

The new model remains opt-in. The existing lightweight recognizer remains the default. Model loading is approximately 17 MB on first use, is performed on this device, and does not send strokes to a recognition service. Large model assets are not added to the app's install-time precache.

## Reliability

A stalled default worker is terminated, retaining all originals and allowing a fresh worker for the next note. Old replies and old worker errors cannot affect replacement workers, deleted notes, read-only notes, or manual corrections. Trial failures retain the previous text; typing wins over an in-flight trial. Correction text is capped at 1,000 characters. Candidate lists are not added to saved records or backups.

HTTP errors are not cached. Offline script requests fail normally instead of receiving app HTML as JavaScript. Offline document navigation retains its HTML fallback.

## Validation

- `node --test tests/*.test.cjs`: 79 passed, 0 failed (63 existing plus 16 new regression tests).
- Chromium component harness: 390×844, 375×667, 320×568, and 844×390. Checked dialog bounds, no horizontal overflow, minimum 44×44 candidate targets, kana taps, and no writes before Save.
- Recognition responses in the new editor tests were controlled fixtures. They test UI/state handling, not real handwriting accuracy.
- Full-site browser navigation in the working environment was administratively blocked. Component DOM tests used in-memory HTML without network navigation. Real iPhone/Safari and live model inference were not validated in this session.
- `app.js`, `setlist.json`, existing user data formats, and the vendored model/runtime are unchanged.
