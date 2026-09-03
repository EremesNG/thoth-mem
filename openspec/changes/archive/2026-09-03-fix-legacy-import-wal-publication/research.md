# Research: WAL Publication Failure

## Confirmed observations

- The failed real import reached a fully verified candidate with every integrity flag true, then failed before publication with `committed=false`, `published=null`, and no durable `legacy_imports` receipt.
- The sealed target plan contained a non-empty WAL fingerprint. The active target and retained backup were later verified with `integrity_check=ok`, zero foreign-key violations, schema revision 9, and no committed legacy import.
- `assertStoppedTarget` currently validates logical and physical fingerprints while `BEGIN EXCLUSIVE` is active, then rolls back and closes its connection before `targetFileSet` is enumerated.
- A controlled disposable reproduction using the same SQLite driver showed the physical main/WAL fingerprint changing when that exclusive checker closed, while the WAL-backed logical row remained present. This isolates an importer-controlled checkpoint/close transition rather than a content mutation.
- The recovery directory contained only empty WAL/SHM reader sidecars after failure, consistent with the original non-empty WAL having been checkpointed before file enumeration and `verifySqlite` later opening the moved main file.

## Options considered

### Preserve the sealed pre-checkpoint byte fingerprint

Rejected. SQLite is allowed to checkpoint a committed WAL into the main file without changing the logical database. Requiring the old main/WAL bytes after the importer opens and closes the target reproduces the defect and cannot establish a stronger no-data-loss guarantee.

### Verify only the sealed logical plan baseline

Insufficient alone. Logical equality correctly tolerates WAL normalization, but a post-check gap still needs a stable custody snapshot and explicit target-path occupancy checks so an observable concurrent change cannot be silently published over.

### Create a post-quiescence logical and physical snapshot

Selected. Apply first proves the target still matches the sealed plan, completes a non-busy WAL checkpoint under a bounded quiescence barrier, proves the logical baseline did not change, and captures the resulting normalized file representation. Publication moves and validates that exact normalized custody snapshot. Restoration proves SQLite integrity, foreign keys, and logical equality with the captured recovery snapshot; it does not require the original pre-checkpoint bytes.

### Add native or OS-specific locking

Rejected by product direction and portability constraints. Multi-file rename after closing SQLite cannot be made universally race-free without a stronger native primitive. The implementation therefore retains the stopped-host precondition, minimizes the handoff, detects observable changes/occupancy, and fails closed without claiming an impossible guarantee.

## Verification implications

- Regression coverage must construct a plan that genuinely binds a non-empty WAL while leaving no live test connection at publication time.
- Successful publication and all restoration failure points must be exercised for that fixture through `applyLegacyImport`.
- A held read transaction must make the checkpoint/quiescence barrier fail as locked/busy with no published candidate.
- Existing DELETE/no-WAL, absent-target, plan/apply, one-command, replay, custody, taxonomy, quarantine, and ranking coverage remains authoritative.

## Residual limitation

Another process can attempt to open the target after the SQLite barrier is released. The importer can detect changed recovery contents or newly occupied target paths and restore/fail, but it cannot promise a cross-platform atomic lock across SQLite close and filesystem rename without a native locking mechanism. Public documentation must continue to require stopped hosts.
