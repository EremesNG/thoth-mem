# Proposal: Atomic Observation Writes

## Intent

The synchronous observation writers `Store.saveObservation` and
`Store.updateObservation` in `src/store/index.ts` perform a multi-statement
persistence sequence WITHOUT a surrounding database transaction. Each body runs,
synchronously and un-wrapped: the observation-row upsert/insert, the
`observation_versions` history write, the deterministic knowledge-graph facts
write (via `refreshGraphFacts` -> `writeDeterministicKgFacts` ->
`persistKgExtraction`), and the semantic-job enqueue (via
`planSemanticJobsForObservation`).

Post-B3, `persistKgExtraction` performs a DELETE / insert / mark-superseded
sequence (supersede-on-update), which WIDENED the non-atomic window — more
statements now execute between the first and last write. A process crash or a
thrown error mid-sequence can leave `kg_triples` partially updated and the
observation row inconsistent with its own facts, with no rollback. An oracle B3
code review (2026-06-30) flagged this as pre-existing non-atomicity and
explicitly scoped it OUT of B3.

The goal of this change is to make each synchronous observation write
all-or-nothing: on any failure mid-write, the observation row, its version
history, its KG-triple diff, and its queued semantic jobs all roll back
together, eliminating the partial-write window.

## Scope

### In Scope

- Wrap the synchronous body of `Store.saveObservation` in a single
  `this.db.transaction(() => { ... })()`, covering BOTH internal write paths:
  1. the `topic_key` upsert path (`observation_versions` insert + `observations`
     UPDATE + deterministic KG facts write + `planSemanticJobsForObservation`),
     and
  2. the new-insert path (`observations` INSERT + deterministic KG facts write +
     `planSemanticJobsForObservation`).
  The read-only duplicate-detection early-return that precedes the writes stays
  outside / benign; the transaction must thread the `SaveResult` return value
  (including the `upserted`, `created`, and any early-return branches) correctly
  out of the callback.
- Wrap the synchronous body of `Store.updateObservation` in a single
  `this.db.transaction(() => { ... })()` (`observation_versions` insert +
  `observations` UPDATE + deterministic KG facts write +
  `planSemanticJobsForObservation`), threading its `Observation | null` return
  value correctly out of the callback (the `null` current-not-found branch
  returns before any write).
- Mirror the existing, proven hard-delete pattern in `deleteObservation`
  (`src/store/index.ts`, the `hardDelete` branch: `const result =
  this.db.transaction(() => { ... })();` — callback invoked immediately, no
  `.immediate` / `.exclusive` option).
- Add ONE focused regression test proving that a mid-write failure rolls back
  BOTH the observation row AND its `kg_triples` changes (see Success Criteria).

### Deferred / Needs Discovery

- **Branch topology reconciliation (blocker to resolve before tasks).** The
  problem statement, the confirmed-code-facts, and the B3 supersede-on-update
  behavior describe the `full-graph` branch. The physical worktree used for this
  proposal has `claude/cranky-austin-3c9eb1` checked out (based on master /
  0.3.6), where the synchronous KG chain does NOT exist: there,
  `saveObservation` / `updateObservation` call `refreshObservationFacts` ->
  `replaceObservationFacts` (which writes only `observation_facts` and is ALREADY
  transaction-wrapped), and `kg_triples` is written exclusively by the
  asynchronous `processKgJob` in `src/indexing/jobs.ts`. This proposal targets
  the `full-graph` shape per the dispatch. The orchestrator must confirm tasks
  are authored/applied against `full-graph` (where `refreshGraphFacts` /
  `writeDeterministicKgFacts` / `persistKgExtraction` / `kgSupersedeEnabled`
  actually exist), not this worktree's branch.

### Out of Scope

- The rebuild-graph per-observation KG writer (`src/store/index.ts`, the
  full-graph rebuild path ~:3473) — a separate, out-of-scope KG writer.
- The hard-delete path in `deleteObservation` — already transaction-wrapped;
  used only as the reference pattern.
- B3 itself (supersede-on-update semantics) — this change only adds atomicity
  around the statements B3 introduced; it does not alter what B3 does.
- Asynchronous embedding / semantic-job EXECUTION. The sync path only ENQUEUES
  semantic jobs; embedding vectors are computed and written LATER by
  `processNextSemanticJob`. That async compute stays OUTSIDE the transaction
  (correct and unavoidable). This proposal makes no claim that embedding vectors
  are inside the write transaction.
- Any change to WHICH statements execute under either value of
  `kgSupersedeEnabled` (see Risks / Success Criteria — flag-off behavior must be
  byte-identical).
- The `store` and `knowledge-graph` capability work already owned by the sibling
  active change `sync-and-resilience` (mutation journal, tombstones, FTS,
  incremental sync). This change does not modify sync/migration behavior.

## Approach

1. **Establish the precise atomic unit.** The single all-or-nothing unit per
   write is: the observation row (INSERT or UPDATE) + its `observation_versions`
   row(s) + its `kg_triples` diff (the DELETE/insert/mark-superseded produced by
   `persistKgExtraction`) + the semantic-job queue rows enqueued by
   `planSemanticJobsForObservation`. Embedding VECTORS are explicitly NOT in this
   unit — only the job-queue rows are.
2. **Wrap, do not restructure.** Move the existing statements of each writer
   body inside a `this.db.transaction(() => { ... })()` callback verbatim,
   preserving statement order and the values passed. Return values are produced
   inside the callback and returned from the immediately-invoked transaction, so
   `saveObservation` still yields its `SaveResult` and `updateObservation` still
   yields `Observation | null`.
3. **Confirm synchronous-callback safety.** better-sqlite3 transactions REQUIRE
   a fully synchronous callback; both writers are already non-`async` with no
   `await` in their bodies, so this constraint is satisfied.
4. **Confirm no nested-transaction hazard on the target branch.** On
   `full-graph`, `persistKgExtraction` / `writeDeterministicKgFacts` use only
   direct `.run()` / `.get()` and do NOT open their own `db.transaction()`, so
   wrapping the caller is safe. (Note: on the current worktree branch,
   `replaceObservationFacts` DOES open its own transaction at
   `src/store/index.ts:1074`; better-sqlite3 flattens nested `transaction()`
   calls into savepoints, but the target code path on `full-graph` has no such
   nesting — this must be re-verified against `full-graph` during tasks.)
5. **Add the rollback regression test.** In `tests/store/observations.test.ts`
   (store tests use `new Store(':memory:')`), mock `writeDeterministicKgFacts`
   (or `persistKgExtraction`) to throw mid-write, invoke the writer, assert the
   throw propagates, and assert BOTH the observation row AND its `kg_triples`
   rows are unchanged from their pre-call state.

## Affected Areas

- `src/store/index.ts` — `saveObservation` (both write paths) and
  `updateObservation` bodies wrapped in `this.db.transaction(() => { ... })()`.
- `tests/store/observations.test.ts` — new mid-write rollback regression test.
- **Capability placement:** the behavior belongs primarily to the **store**
  capability (transactional persistence of the observation write;
  `openspec/specs/store/spec.md`). It reinforces the **knowledge-graph**
  capability's existing requirement "KG Extraction MUST Be Idempotent and
  Update-Safe" (`openspec/specs/knowledge-graph/spec.md`) by making the
  update-safe write atomic. Because this is the accelerated route, NO formal
  spec delta is produced in this phase; this note records ownership for the
  archive step.
- **Sibling-change overlap:** `openspec/changes/sync-and-resilience` also edits
  `src/store/index.ts` (mutation-journal `recordMutation` writes inside these
  same writer methods, plus structured migrations). Wrapping the writer bodies
  will co-locate the `recordMutation` journal write inside the new transaction —
  which is desirable (the mutation journal entry should commit atomically with
  the row it describes) but is a coordination point: if `sync-and-resilience`
  lands first, its `recordMutation` calls must remain inside the transaction
  boundary; if this change lands first, `sync-and-resilience` must add its
  journal writes inside the existing transaction rather than around it. Flag to
  avoid a merge that leaves `recordMutation` half in / half out of the tx.

## Risks

- **Behavior drift under `kgSupersedeEnabled=false`.** Wrapping changes ONLY
  atomicity, not which statements run. The flag is read INSIDE
  `persistKgExtraction`; flag-off (DELETE prior triples + insert, no
  supersession marking) must remain byte-identical.
  - *Mitigation*: wrap-only (no statement reordering/removal); existing tests
    plus the new rollback test must stay green with the flag both on and off.
- **Nested-transaction / savepoint surprise.** If any callee on the target
  branch opens its own `db.transaction()`, better-sqlite3 converts it to a
  savepoint; an inner rollback would not necessarily abort the outer tx.
  - *Mitigation*: verified on `full-graph` that the KG chain uses only direct
    `.run()` / `.get()`; re-verify during tasks and keep the wrap at the outer
    writer level only.
- **Return-value threading regression.** `saveObservation` has multiple return
  branches (`deduplicated` early-return, `upserted`, `created`);
  `updateObservation` has a `null` early-return. A careless wrap could drop or
  mis-thread a branch.
  - *Mitigation*: return values are computed inside and returned from the IIFE
    transaction; existing action-assertion tests guard each branch.
- **Long-transaction hold.** The KG diff + job enqueue run inside the tx,
  slightly lengthening the write lock. Acceptable: all work is already
  synchronous and in-process on a single connection; async embedding compute
  stays outside.

## Rollback Plan

1. The change is additive and isolated to two method bodies plus one test.
   Reverting is a single-commit revert of the `src/store/index.ts` wrap and the
   added test — no schema, data, or config migration is involved.
2. If the transaction wrap surfaces an unexpected nested-savepoint or
   locking regression in production, revert the wrap to restore the prior
   (non-atomic but functionally unchanged) statement sequence; no data cleanup is
   required because no statements were added, removed, or reordered.

## Success Criteria

- `Store.saveObservation` (both the `topic_key` upsert path and the new-insert
  path) and `Store.updateObservation` execute their write statements inside a
  single `this.db.transaction(() => { ... })()` each, mirroring the hard-delete
  pattern, and return the same values as before for every branch.
- A NEW focused test in `tests/store/observations.test.ts` forces a mid-write
  failure (mocking `writeDeterministicKgFacts` / `persistKgExtraction` to throw)
  and asserts that BOTH the observation row AND its `kg_triples` changes roll
  back to their pre-call state.
- Behavior under `kgSupersedeEnabled=false` is byte-identical to pre-change
  (same statements execute; only atomicity is added).
- `pnpm test` (`vitest run`) is green.
- `pnpm run build` (`tsc --noEmit && node scripts/build.mjs && pnpm --dir
  dashboard build`) is green.
