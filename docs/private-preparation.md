# Owner-only preparation delivery

The public application contains generic validation and reception code. Lyrics,
people, schedules and source documents live only in the owner's existing private
repository. The public member-delivery path is not a preparation destination.

## Private source contract

The receiver uses the editor's already-stored GitHub token. It does not discover,
create, store, expand or request credentials. It reads the authenticated identity,
verifies the configured repository is private and owned by that identity, then
reads the fixed `utacheck/prepared.json` path. Large files use the exact verified
blob SHA in the same repository. Redirects and alternate/public URLs are rejected.
Missing access is reported without applying or publishing data.

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

Prepared content remains personal. New groups/shows are non-publishing. After
private preparation, the existing full-cloud-backup path permits only the
existing nonpublic Gist and verified encryption under the existing backup key;
unconnected, plaintext, public or changed destinations are refused. An older
whole-state backup missing preparation receipts cannot silently replace them.

## Verification boundary

A published app and saved queue do not prove a particular phone has received
anything. The phone must have suitable existing private-repository access, be
online and reach a safe editor state. The settings status distinguishes applied,
unconnected, deferred, conflicting and unverified outcomes. No new permissions
are silently acquired to hide that boundary.

