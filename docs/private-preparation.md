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
