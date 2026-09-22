# Keyboard-aware note entry — 2026-09-22

Component revision: `utacheck-16.38.0-keyboard1`. The core app remains 16.38.0.

## User-visible changes

The four note categories and memo field remain on the first panel. There is no intermediate text-entry button. Dialog bounds now follow the visual viewport's height and offsets, so the panel stays above the software keyboard, including when the browser pans the viewport. Short landscape viewports use one row of four categories. All category targets remain at least 44 × 44 CSS pixels in the tested conditions.

Pressing a quick-panel button retains input focus until its click resolves, instead of closing the keyboard and moving the target on pointerdown. Viewport updates do not replace the input node or refocus it. Japanese composition confirmation does not save the note; an explicit Done saves once and closes. Clearing all text clears the draft. The right-hand control says 保存 when text exists, otherwise 閉じる.

This is implemented in the existing UI layer. The current core's `positionQuickNote` presentation hook is replaced with viewport fitting only; core code still focuses the input synchronously. This avoids the old inline top calculation adding the viewport offset twice. Concurrent main-branch changes, including shorthand expansion, direct deletion and Undo, are retained. `app.js`, `index.html`, `setlist.json`, stored note formats, recording state, synchronization formats, and user records are unchanged. No dependencies or recognition services were added. The service-worker cache revision changes to deliver the updated UI.

## Validation performed

- `node --test tests/*.test.cjs`: 59 passed, 0 failed. This includes 10 new keyboard/startup checks. Obsolete test assumptions about the removed handwriting button and missing focus/animation-frame stubs were updated, without removing their behavioral checks.
- Full application scripts loaded into an isolated Chromium document: no JavaScript page errors.
- `python tests/note-keyboard-browser.py`: 8 viewport/keyboard conditions, four real browser touch taps each (32 category taps). Every tap saved the intended category once, retained the selected line, and closed the panel. Hit-testing verified the controls were not covered by the simulated keyboard.
- Screen / visible height / top offset (CSS px): 390×844 / 480 / 0; 390×844 / 360 / 80; 375×667 / 315 / 0; 320×568 / 250 / 0; 414×896 / 460 / 80; 844×390 / 175 / 0; 667×375 / 165 / 20; 390×844 / 276 / 100.
- Checked immediate text entry, explicit Done, duplicate Enter, composition Enter and keyCode 229, empty draft, pressed-button stability, save button, background updates, lyric drag range, scroll-position preservation, current shorthand expansion, direct badge/memo deletion, and Undo. Portrait and landscape screenshots were inspected; a wrapping close label was corrected before release.

The browser harness uses Python Playwright and `/usr/bin/chromium`. It loads the shipped HTML, CSS and JavaScript locally, uses synthetic test songs, and blocks external fetches. Visual viewport, keyboard obstruction, and IME events are simulated. It does not operate a real iPhone or Safari and does not establish native keyboard behavior on those devices.
