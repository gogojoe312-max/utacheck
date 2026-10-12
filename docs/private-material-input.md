# Dot file input contract (16.41.58)

The existing private destination remains `gogojoe312-max/shinkou-data`, file
`utacheck/prepared.json`. This change does not write that file or a member Gist.

Use `PrivateMaterialInput.append(existingManifest, candidate)` to preserve every
old operation unchanged and reject duplicate IDs with altered content.

The consuming operator can call `preparePrivateMaterialFile(file, binding,
sourceRevision, expectedSourceSha)` in the owner app. It reuses the existing
Word/PDF/Excel parser and returns `{expectedSourceSha, operation}` for review.
`expectedSourceSha` must be the just-read prepared.json blob SHA and must be used
as the lease for a separately authorized private source update. Keep every old
operation exactly as it was; append the new immutable operation.

`binding` specifies `scope` (`live` or `recording`), original `groupId`, `songId`,
and original `showId` for LIVE. Explicit `assignments` can map exact source
labels to existing roster member IDs. No song, member, line, or show ID is made.
The new `material-update` operation has the full original lines, proposed lines,
source revision, exact source-file SHA-256, and immutable packet hash. The
receiving app rechecks the prepared source blob SHA immediately before its
existing verified atomic commit and records an idempotent receipt.

Only already-private material, unchanged row identities/count, exact current
original text, and existing roster IDs are accepted. Corrections intersecting
annotations, handwriting, substitutions, or recordings stop. Ambiguous titles,
versions, assignments, changed block definitions, or missing original IDs require
confirmation; they are never handled by duplicating a song under a new ID.
Word/PDF with no assignment information preserves existing assignments. Original
`全` remains written as `全`. Existing `live-update` operations retain their old
contract; they are not rewritten into the new type.

Before manual editing, absence handling, file import/replacement, and restoration,
the app adds a verified restore point to its existing private IndexedDB state
store. It uses the existing backup envelope/key, verifies decoding on reread, and
never deletes old points or clip data. Storage, quota, concurrent-state and
verification errors stop the requested operation. Existing automatic cloud
backup continues to its existing non-public target, verifies uploaded contents,
and retains previous/interrupted part generations. A missing or invalid target
is not silently replaced with a new one.

This contract does not recover missing original IDs from publication copies.
The canonical iPhone backup is still needed for missing ReNY/owner material.
