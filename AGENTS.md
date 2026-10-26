# Release completion requirements

The user authorizes routine fixes and publication without another permission question.
Do not claim a fix is complete solely because code was edited, unit tests passed,
or a commit was pushed. Do not equate a deployed version with receipt on the user's phone.

For every fix:
1. Record the user's observable acceptance condition in a regression test. Include
   the failing input shape (legacy/restored data and aliases where relevant), not
   just a cleaned synthetic state. Do not commit private uploads or real lyrics.
2. Verify the real operation path: owner action -> publication payload -> member
   receive -> rendered screen. For saved behavior, save and actually reload.
   Verify related screens and preserve lyrics, assignments, notes and original files.
3. Add the browser scenario to tests/settings-rec-browser.cjs so both engines and
   the published site execute it. A script only in /tmp is not a lasting check.
4. Commit the changes and run `node scripts/publish-verified.cjs`. This pushes a
   candidate branch, waits for its exact-commit CI preflight, and only then pushes
   that same commit to main (the existing Pages source). Do not push directly to
   main: this account cannot change Pages settings or branch protection.
   Wait for final-check and its exact-revision verified-release.json receipt before
   saying publication and final verification are complete. Keep logs/screenshots
   in workflow artifacts. On failure, fix the failure; do not report completion.
5. Report the verified version and material limits honestly. Desktop WebKit is
   not an actual iPhone. If the phone has not received the version, say that its
   receipt remains unverified. Never ask the user to repeat an already supplied detail.

Release evidence must match the current commit and all required checks. A pending,
failed, skipped or older run is not completion evidence. Changes that cannot be
fully exercised with synthetic data need a scoped private check and an explicit
unverified boundary; they must not be described as fully working end to end.

REC split-section / background refresh acceptance:
- Open the continuation paragraph's number on the REC lyric screen and select Rap.
  Its section divider and number belong to that Unicode character offset, not the
  original source row. Verify all lyrics, Rap-only filter, overview, print, save
  and actual reload; preserve source text, note offsets and other numbering edits.
- With restored unrelated LIVE arrangements requiring correction, keep the same
  REC lyric DOM and scroll position while the corrections are saved. Exercise the
  periodic arrangement audit as well. Retain the previous-code failing checks and
  fixed-code browser screenshots. A real phone remains a separate verification.

LIVE feedback input acceptance:
- Use the LIVE lyric character tap and its actual memo input with a restored-size
  library. Inspect writable focus inside the original trusted gesture, repeated
  opening, retained input DOM, Japanese input, close/save, real reload and member
  publication/receive. Never use asynchronous unlock as proof of native keyboard
  availability. Keep persisted-field checkpoint protection intact.
- Draft focus must not serialize/copy the whole library. Background cloud backup
  and remote checks must pause while a draft, keyboard or interaction is active;
  local note save and later cloud synchronization must remain functional. Unrelated
  worksheets must not be canonicalized for every new feedback note.

REC scheduled start acceptance (supersedes the former display-only schedule mode):
- On the actual REC progression screen, cross a confirmed Tokyo start time using
  the real one-second clock loop. The slot must become started, its countdown must
  run from the planned timestamp, and no Start tap is required. Retain screen
  evidence, save and reload without resetting the start or takes, and verify the
  next scheduled slot, explicit pause, manual starts, ambiguous dates/overlaps,
  active microphone and editing guards. Clock ticks must preserve the screen DOM.
- Automatic start/finish is owner-side progression metadata; preserve lyrics,
  assignments, notes, recordings and scheduled times. Suspended/closed apps cannot
  run JS timers; resume catches up only to the current confirmed slot, never marks
  every missed slot as recorded or invokes the microphone.

Absence additions / lyric-name assignment acceptance:
- Create absence settings first, then add a song using the actual file picker.
  Verify the target show's absence rules also apply when another show or REC was
  selected at the save boundary. Preserve manual overrides, original lyrics and
  linked Excel bytes; unresolved solos must remain visibly pending.
- On the LIVE lyric card, hold the actual performer-name control while moving
  two pixels, then change its assignment. A short tap remains feedback and a
  scrolling gesture must not open assignment editing. Toggle an already selected
  original singer before any override exists; the displayed selection is the
  starting assignment. Save, reload, export the original-format version sheet,
  and receive/render the new song's changes on the member screen.

REC provisional headcounts acceptance:
- Import a two-panel Excel with numeric assignment columns A/D, lyric columns
  C/F, merged cells, continuation blanks and A/B placeholders. Digits must never
  appear as lyric-only rows or become member IDs. Preserve source lyric order,
  display predicted headcounts separately from bar numbers, and keep unknown A/B
  membership and headcounts explicitly tentative. Ordinary LIVE/microphone sheets
  retain their parser contract. Preserve and reread immutable workbook bytes.
- Exercise the actual REC file picker, lyric view, settings, overview/print,
  private receive with song-linked schedule, save and reload. Include the supplied
  workbook in a scoped private check; no private lyrics/schedules go in public code.

Sparse REC cues / imported schedule acceptance:
- Use ソロ for one singer and ユニゾン for multiple singers; show a label only
  when the source category/count/group changes. Continuations retain thin blue
  or green rails. Scroll within each category and verify the current cue stays
  visible without replacing the lyric DOM. Keep source counts and A/B intact.
- A manual import may have a random ID and filename title while the received
  schedule uses a fixed ID and song title. From the manually imported song's
  actual 進行表 button, open both scheduled days when one exact immutable
  workbook hash and unchanged source lyrics identify the schedule. Preserve
  both song records, notes, recordings and the original file. Different files,
  changed lyrics, explicit other sessions, past-only and ambiguous schedules
  must remain separate. Ordinary navigation must not save or change an active
  session merely to display its plan. Phone receipt still requires separate evidence.

REC preparation credential acceptance:
- Receive a scheduled REC through the real saved 進行 IndexedDB connection with
  an empty 歌チェック token and a private repository 404. The owned relay must
  use that same transient 進行 credential; never substitute a Gist credential.
  Recheck the saved connection before and after relay access. On the actual
  imported song, open 進行表, inspect the planned day/member/time, save and
  reload. Test changed connection and rejected relay without mutation/leaks.

Delayed REC reception acceptance:
- Reproduce the provided settings screen: an imported provisional REC with no
  linked schedule and a relay TIMEOUT. The old 30-second reader must fail the
  regression. Hold the first real receiver response beyond 30 seconds; inspect
  the rendered waiting message and responsive controls with zero new slots.
  Then release it, or exhaust the first response and recover by automatic retry.
  Use the same token/endpoint, validate source identity, commit once, open that
  song's actual progression button, save and reload. Preserve the full prior
  source queue and restored private input in scoped checks. Test stalled bodies,
  trickle transfer, total deadline, cancellation and non-retryable auth failures.
  Fast mocked replies alone are insufficient; actual phone connectivity is separate.

REC simplification / section-strip acceptance:
- On the active REC lyric screen with an existing legacy section/take history,
  scroll the actual bottom section strip sideways so the chosen section is near
  its edge; click it and retain both scrollLeft and that button's screen position.
  Check another render as well. Main and tag strips have separate positions;
  changing song must not reuse the previous song's strip. Preserve source lyrics,
  prior recordings, take counts and saved PT configuration through save/reload.
- Do not load the Pro Tools transport script or show its controls. Remove new
  recording/take controls without deleting historical media or version data.
  REC overview has no Solo/Unison badge, rail or floating cue; normal REC retains
  those provisional cues and the original section/lyric metadata.

- Solo/Unison separation is a display filter within the selected section, with
  no recorder, take counter or Pro Tools action. Verify Unison then Solo using
  the actual filter controls, stable source row/bar numbers, unknown groups,
  a full overview of all lyrics and save/reload with original data unchanged.

- Removal of Pro Tools must include the REC settings 操作パネル entry, not just
  the lyric toolbar and script. Open REC settings and the practice disclosure;
  verify no PT settings or microphone recording start control remains. Retain
  piano note entry, metronome and historical media; do not erase their data.

- A restored REC state can still retain the previous LIVE showId. REC overview
  must label its own mode and must not show that LIVE show's title/date. Keep
  this failing state in the receive/overview/reload fixture; do not normalize it
  away to satisfy the caption check. LIVE overview retains its show caption.

REC section completion / plan navigation / assignment boundaries acceptance:
- Completion defaults to the whole selected section. Only an explicit
  ソロ／ユニゾンに分ける action exposes category filters and independent completion.
  Complete with the existing OK action. Do not add a separate completion button.
  Verify Unison-only OK stays in the same section and selects remaining Solo,
  merge/resplit retains partial status, both completed advances normally, another
  person/section and actual save/reload. Preserve completion from prior OK secLog.
  Only show splitting controls when the selected section contains BOTH kinds.
  Preserve legacy takes, media, PT settings, source lyrics and source numbering.
- With separate manual-import and received IDs for the same exact workbook,
  create a section through the REC lyric number control, open that song's actual
  進行表, return and select a person from that table. Retain the manual song,
  created section and selected section; scheduled automatic start must retain it
  as well. Different/ambiguous originals must remain separate. Keep the failing
  previous-code regression and exact-screen browser evidence.
- Horizontal lines must follow assignment groups in the ORIGINAL Excel, not
  each lyric row or repeated count. Reproduce the supplied three-row merged solo
  followed by a two-row merged solo with missing legacy cont flags. Restore
  boundaries from the pinned original bytes without reupload or lyric mutations.
  Inspect the exact REC lyric screen, its lines and row numbers, then OK,
  mixed-section splitting, save/reload and publication. Preserve source bytes
  and handwriting geometry. Unknown boundaries must never be guessed.

Passive app audio acceptance:
- With native reference audio already playing in another browser tab, open the
  actual app, tap LIVE settings, practice disclosure without playing, REC song
  selection, then save/reload and switch away/back, including pageshow restore.
  Retain legacy saved audio/PT flags and existing notes/recording metadata.
- Startup, ordinary taps, received member screen controls and reopening must
  not create/resume AudioContext, play media, start speech recognition or request
  microphone capture. No silent looping audio may acquire an iPhone audio session.
  Keep the previous-code failing native-call audit and exact-screen evidence.
- Instrument native media calls without substituting playback behavior. Verify
  real reference playback continues; explicit piano and metronome must still
  run, stop and avoid automatic restart on returning. Keep the scenario in both
  local and published browser gates. Real iPhone/native-other-app audio focus
  remains unverified unless actually tested on that device; browser tabs are
  separate evidence and must never be described as a native-device test.

Reversible song-size display acceptance:
- Import an original Excel through the actual LIVE and REC file picker, including
  duplicate lyric text, merged assignment continuations, existing gray-cut rows,
  manual lyric breaks and notes. From that song's actual ⋯ menu open 歌詞の表示範囲
  and select the first/last rows in either direction. Hide, cancel, save, restore
  one range and reset the original size. Draft selection must survive a render.
- Preserve source rows, lyric text, character note anchors, assignment cells,
  hidden notes, other songs, original gray-cut flags and immutable Excel bytes.
  Restoring source gray rows must also remain possible. Size cuts must not break
  exact original matching or reattachment. Handwriting geometry remains guarded.
- Verify actual owner lyric/overview/PDF and member publication -> receive ->
  lyric and feedback screens -> save and native reload. Hidden-only feedback
  must not appear; remaining merged continuations keep their performer label.
  REC numbering skips display cuts and a hidden section header still anchors its
  remaining visible lyrics. Keep screenshots and the previous-code missing-control
  regression. Browser verification does not establish receipt on the actual phone.
