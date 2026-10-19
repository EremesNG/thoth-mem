# Data Model: Revision 10 Pi Harness Constraint

## Existing revision-9 boundary

`sessions.harness` is not free text. The current table is generated with a
`CHECK(harness IN (...))` from `HARNESS_VALUES`, whose revision-9 set excludes
`pi`. `lifecycle_receipts.harness` is unconstrained, but every lifecycle call
first resolves or creates a session, so adding only the TypeScript value would
fail on existing databases.

The sessions table owns these values and constraints:

- immutable `id` primary key;
- `project_id` foreign key and unique identity with `root_session_key` plus
  `harness`;
- state in `active`, `compacted`, `ended`, or `degraded`;
- `started_at`, nullable `ended_at`, and non-negative `next_event_sequence`.

It is referenced by evidence, ordered session events, session summaries, and
other lifecycle projections/receipts through their existing foreign keys.

## Revision-10 target

Revision 10 changes only the generated harness allowlist so it includes `pi`.
Every column order, type, nullability rule, key, uniqueness rule, state check,
timestamp, sequence value, identifier, and dependent relationship remains
unchanged. No existing harness value is renamed or removed, and no Pi-specific
column or table is added.

## Migration transaction

1. Verify the source is exactly revision 9 and create a retained
   `memory.sqlite.pre-v10.bak` through `VACUUM INTO` plus read-only integrity,
   foreign-key, and revision checks. Reuse never means trust: an existing backup
   receives the same structural verification and is never overwritten.
2. Outside any active transaction, disable foreign-key enforcement for only the
   table-swap window, then acquire one immediate transaction before the first
   source recheck or mutation. That transaction is the write-excluding lock for
   the remainder of the migration.
3. While holding the immediate transaction, compare a deterministic logical
   snapshot of every live revision-9 table, including `sqlite_sequence` and FTS
   rows, with the retained backup. Reject a structurally valid backup whose data
   differs and reject drift that occurred after backup creation. Only an exact
   match may proceed. Preserve that locked live snapshot as the pre-mutation
   baseline.
4. Create a revision-10 sessions replacement, copy every row explicitly by
   named column, replace the old table without relying on implicit rename
   retargeting, and restore all indexes/constraints.
5. Before recording revision 10, compare the captured session/dependent logical
   baselines and row counts, inspect the target table SQL for the complete
   current harness allowlist, run integrity and foreign-key checks, and prove FTS
   output is unchanged.
6. Commit the revision row only with all assertions passing. Always restore
   foreign-key enforcement in a `finally` path. An injected error rolls back the
   table swap and leaves revision 9 plus its verified backup; a later retry is
   safe.

## Verification fixtures

- A revision-9 database with multiple harness sessions in every state, ordered
  events, root/checkpoint evidence, supported summaries, lifecycle receipts,
  promoted memories, and populated FTS.
- An injected interruption after backup verification and another during the
  table swap.
- An existing exact pre-v10 backup, an invalid/tampered backup, and a
  structurally valid revision-9 backup from a logically different source.
- A writer that changes the source after backup verification but before lock
  acquisition, proving the in-lock recheck rejects drift before table mutation.
- A successful migration followed by a second open and a complete Pi
  enroll/capture/checkpoint/guide/finalize path.
- Assertions for exact IDs, values, relations, sequence counters, logical row
  hashes, memory search results, integrity, foreign keys, revision number, and
  accepted/rejected harness values.

## Rollback boundary

The transaction is the first rollback boundary; the verified pre-v10 backup is
the retained recovery artifact if an external interruption occurs outside
SQLite's atomic transaction guarantee. Implementation must never overwrite an
existing exact backup or silently accept an invalid or merely structurally valid
but logically mismatched one. The live-to-backup comparison occurs after the
immediate write-excluding lock is acquired, so the accepted source cannot drift
before the table swap. No automatic downgrade from revision 10 is provided.
