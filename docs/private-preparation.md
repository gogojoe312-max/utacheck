# Owner-only preparation delivery

The public application contains generic validation and reception code. Lyrics,
people, schedules and source documents live only in the owner's existing private
repository. The public member-delivery path is not a preparation destination.

## Private source contract

If the device cannot read the private repository or share 進行 browser storage,
it can use the owned `https://shinkou-secure.onrender.com/utacheck/prepared` relay.
The same saved 進行 login (when configured), or the existing editor login, is used only for fixed-owner identity verification. The 進行 reader rechecks its connection before and after relay access; its token never enters application state. The relay
reads via its configured private repository credential, or decrypts a deployed
AES-GCM bundle using a separate server key. No GitHub credential is embedded in
the public app or bundle. Each received manifest is validated and rechecked before
the existing transactional commit. An unavailable relay is reported as a server
delivery problem; it is not disguised as a successful receipt.

The settings screen displays automatic reception status. The obsolete dot update
and connection controls are removed. The receiver reuses the connection explicitly
configured in 進行 in the same browser storage: only IndexedDB `shinkou`, store
`kv`, record `state`, and its `settings.sync` fields. The enabled connection must
match `gogojoe312-max/shinkou-data`, `data.json`, and branch `main`. It uses the
credential transiently; it is never copied into 歌チェック state or backups.
Missing databases are not created. Locked, disabled or mismatched connections
are reported, and changed connections invalidate an in-flight read.

A previously saved device-local read credential continues to work. If that read
fails, the receiver can try the configured 進行 connection. When 進行 has no saved
connection, the existing editor token remains a compatibility fallback. The
application cannot create tokens or expand permissions. It reads the authenticated identity,
verifies the configured repository is private and owned by that identity, then
reads the fixed `utacheck/prepared.json` path. Large files use the exact verified
blob SHA in the same repository. Redirects and alternate/public URLs are rejected.
Missing access is reported without applying or publishing data.

The retained legacy connection handler validates the identity, private repository, fixed manifest
path and manifest before storing the credential. It uses the exclusive writer
gate, saves under IndexedDB state key `private-preparation:read-credential:v1`,
and rereads the saved record before reporting success. The credential never
enters application state, exported/cloud backups, member payloads, diagnostics
or rendered HTML. The Gist/member token is not replaced. Rejected replacements
keep the earlier credential; an uncertain write prevents reception until reload.
The password input lives in a separate dialog so app rerenders cannot erase it;
it is cleared on submission or closing. Closing during validation cancels saving. A corrupt saved credential fails
closed rather than silently falling back to a different connection.

A version-1 manifest has `app: utacheck-private-preparation`, `version`, `owner`,
`revision`, `createdAt` and `operations`. Each operation has a permanent ASCII
`id`, a `type`, the SHA-256 of UTF-8 `JSON.stringify(packet)` as `sha256`, and
`packet`. IDs are never reused with different content. Retain earlier operations
when adding a new one so another authorized device can catch up.

Supported types:
- `recording-schedule`: existing v1 narrow schedule packet; every target must match.
- `recording-addition`: existing v1 recording packet, with strict person IDs and
  validated dates/times. Fully present identical source identities are adopted
  without replacing later local notes, takes or timing changes.
- `live-addition`: new private group/show/member/song identities, append-only.
  Show dates and source lyrics must already be confirmed. No inferred song cuts,
  setlist order, singer assignments or dates belong in the queue.
- `live-update`: narrow corrections to existing private group/show/song identities,
  with complete before values and no deletion or inferred lyric mapping.
- `original-excel`: one immutable original workbook per operation. Its packet has
  `app: utacheck-original-excel`, `version: 1`, `name`, decoded-byte `size`, binary
  `sha256`, and canonical `base64`. XLS/XLSB originals may also have an `exportFile`
  containing those four file fields for a separately preserved XLSX copy. Each
  file is bounded to 16 MiB; the existing private manifest limit remains 15 MiB.
  The device verifies the bytes and exact existing workbook layout before linking
  any song. It preserves unmatched files without creating songs. Source files
  and export copies are stored by digest and read back before the state/receipt
  transaction. A receipt records `linked`, `stored`, and `unmatched` counts and a
  `targetSha256` fingerprint of eligible existing song identities, matching
  material/cell metadata, and member names. New songs, changed matching material,
  or restored receipts without that fingerprint trigger another exact match.
  Later matches update the counts and target fingerprint while preserving the
  original operation hash, type and first receipt time. Notes, recordings and
  attachment timestamps do not trigger workbook parsing.

Original workbooks use one rechecked private source snapshot per reception batch,
with a validated immutable packet hash for every file. This avoids repeatedly
transferring all workbooks and exceeding the relay's request limit. Each file
gets an exact match and verified immutable blob save while the editor remains
interactive, yielding between workbooks. Any concurrent edit cancels the staged
batch. One short exclusive state backup and receipt transaction commits all
original links, with one final target fingerprint shared by the batch receipts.
An interruption or quota failure leaves no partial links or receipts. Other preparation types retain their
per-operation source check. A changed source at snapshot confirmation aborts the
batch. Matching original receipts do not hide missing or corrupted file blobs:
the device checks both original and export hashes and receives them again when
needed, preserving the existing receipt and later song edits.

An export can call `readOriginalExcelPackets({isActive})` while its result menu
or busy state is open. This uses the same owner-only source authentication and
packet validation, but never changes songs, receipts, menus or editor storage.

## Existing LIVE correction contract

A `live-update` packet has `app: utacheck-live-update`, `version: 1`, `groupId`,
`showId`, and one or both of `order` and `songs`. Optional `source` metadata is
informational only; it cannot supply credentials, publication destinations or
permissions. The entire packet is protected by the operation's existing SHA-256.
The receiver never discovers a target by a title, surname, filename or similarity.

- `order` contains `before` and `after`, each a complete ordered array of existing
  song IDs in that show. `before` must match the current show exactly; `after`
  must be a permutation of those same unique IDs. No song is created, removed,
  copied to another show, or omitted. Songs belonging to other shows stay in
  their existing array slots. All song objects remain intact unless separately
  covered by an explicit text correction.
- `songs` is a nonempty array of at most 300 unique patches. Each patch contains
  only `id`, `expectedTitle`, `beforeLines`, and `afterText`. `beforeLines` is the
  entire existing array of line objects, including assignments and import
  metadata, and must match the current song exactly (object-key ordering does
  not matter). `afterText` is an equally sized array of strings. Only the `t`
  value at each explicit numeric index can change. Line count, row ordering,
  singer assignments, section labels, cuts, gaps, metadata and song identity
  cannot be changed through this operation. A gap cannot become a lyric row.
  The derived song signature is refreshed using the app's native algorithm.

Both the group and show must already be explicitly non-publishing (`nopub: true`
or `nopub: 1`), and the show's `groupId` must match. Every song in that show must
have a unique LIVE-only ID and the same group membership. A mixed-group show,
missing target, duplicate ID or RECORDING/LIVE ID collision is a conflict. For
lyric patches, every retained roster, block, and line-assignment member reference
must resolve to one existing person ID. Sharing settings are never changed to
make a target qualify.

Numeric lyric addresses remain unchanged. A correction fails if any affected
row is covered by an existing local or received note, including multi-row ranges
and character selections. Unrecognizable note addresses fail closed. Pixel-based
handwriting anywhere on a corrected song also blocks its lyric correction,
because changed wrapping could move a stroke. Notes on unchanged rows and all
recordings, takes, summaries, staff memos, substitutions, import originals and
unrelated user edits are retained. This intentionally does not implement wholesale
lyric replacement, title-based matching, line insertion/deletion, assignment
replacement, or automatic note relocation.

Every target and before condition is checked before a result is returned. A
conflict in any patch prevents the entire operation, including its setlist
permutation and receipt. The shared reception transaction supplies the original
backup, concurrency check and saved-result verification. Once its receipt exists,
a repeat preserves later local edits. An apparent after state with no matching
receipt is not assumed to prove the operation was safely applied.

## Local safety

Reception waits for recording, microphone start/finalization, input, restore,
import, synchronization and other exclusive operations to finish. It shares the
existing editor gate. Initial writer enrollment verifies a single app client via
the service worker both before and after setting the existing writer marker.
Hidden/uncontrolled legacy app windows count as clients. A timeout, storage
failure or competing window does not permit applying data.

Every applied operation preserves original editor/storage snapshots in IndexedDB,
compares existing revisions inside the transaction and rereads the saved result.
Receipts make retries idempotent. Inconclusive committed writes block further
editing until reload. The old recovery network hold, clips, unrelated songs,
notes, actual takes and sharing settings are retained.

Each pending operation is checked against the current state independently. An
older operation conflicting with a local edit stays pending without blocking a
later compatible addition. Failed operations get no receipt; reused operation
IDs with changed hashes still stop reception. Newly added REC songs clear the
artist filter so the new artist is visible. Each write rechecks the private
source before committing.

A recording addition entirely on explicit dates after an unfinished earlier
slot can be appended without closing or rewriting that slot. Actual recording
and editing still defer writes, as do same-day corrections or unknown dates.
Each REC song with exact linked slot IDs offers its own progression table.
Its date filter is transient and independent of the global table; an active
recording can preview it without changing the selected song, focus or takes.

Prepared content remains personal. New groups/shows are non-publishing. After
private preparation, the existing full-cloud-backup path permits only the
existing nonpublic Gist and verified encryption under the existing backup key;
unconnected, plaintext, public or changed destinations are refused. An older
whole-state backup missing preparation receipts cannot silently replace them.

## Verification boundary

A published app and saved queue do not prove a particular phone has received
anything. The phone must have suitable existing private-repository access (or
the configured, unlocked 進行 connection in the same browser storage), be
online and reach a safe editor state. The settings status distinguishes applied,
unconnected, deferred, conflicting and unverified outcomes. No new permissions
are silently acquired to hide that boundary.

