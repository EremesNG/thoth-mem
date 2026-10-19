# Tasks: Atomic Observation Writes

> **Branch-topology note (resolves proposal's "Deferred / Needs Discovery" blocker).**
> `proposal.md` flagged that its authoring worktree had a different branch checked
> out where the synchronous KG chain (`refreshGraphFacts` -> `writeDeterministicKgFacts`
> -> `persistKgExtraction` -> `kgSupersedeEnabled`) does not exist, and asked the
> orchestrator to confirm tasks are authored against `full-graph`. This is
> confirmed: the current worktree is on branch `atomic-observation-writes`
> (based on `full-graph @ aee8131`), and `src/store/index.ts` was read directly —
> the full chain exists exactly as the proposal's primary scenario describes.
> Tasks below are authored and verified against this branch's actual source.

> **Additional discovery: `recordMutation` is not a future coordination risk —
> it is present NOW.** The proposal's Affected Areas section frames the sibling
> `sync-and-resilience` change's `recordMutation` journal write as a FUTURE
> merge-coordination concern ("if `sync-and-resilience` lands first... if this
> change lands first..."). Reading `src/store/index.ts` on this branch shows
> `this.recordMutation(...)` calls ALREADY present inside both writers, inside
> the exact regions this change wraps:
> - `saveObservation`: line 1491 (deduplicated branch, before the read-only
>   early return — stays outside the tx, see Task 1.1), line 1525 (topic_key
>   upsert path), line 1555 (new-insert path).
> - `updateObservation`: line 1674 (post-update branch).
>
> `recordMutation` (defined at :791) wraps a single `INSERT INTO sync_mutations`
> in a try/catch that swallows and logs errors — it does not open a nested
> transaction and is safe to include inside the new `db.transaction()` boundary.
> Because these calls already exist in the write paths being wrapped, they will
> be swept inside the transaction as a natural consequence of wrapping "the
> existing statements... verbatim" (proposal Approach step 2) — no extra code
> change is needed for this. Task 1.2 and 1.4 make this explicit and Task 2.x
> asserts the mutation-journal row participates in rollback too, closing the
> proposal's own coordination flag rather than deferring it.

## Phase 1: Implementation (wrap-only, no restructuring)

- [x] 1.1 Wrap `saveObservation`'s topic_key upsert path in `src/store/index.ts`
  (`observation_versions` INSERT :1511-1513 + `observations` UPDATE :1515-1517
  + `this.getObservation` reload :1519 + `this.recordMutation(...)` :1525 +
  `this.refreshGraphFacts(observation)` :1526 + `this.planSemanticJobsForObservation(...)`
  :1527) in a single `this.db.transaction(() => { ... })()`, mirroring the
  `deleteObservation` hard-delete pattern at :1594-1599 (immediately-invoked,
  no `.immediate`/`.exclusive` option). The read-only duplicate-detection
  block (:1473-1494, including its own `recordMutation` at :1491 on the
  `deduplicated` early-return) stays OUTSIDE and BEFORE this transaction —
  it is a pure read plus a swallowed-error mutation-log write on an
  already-committed row, not part of the new write's atomic unit. Thread the
  `{ observation, action: 'upserted' }` return value out of the callback
  exactly as today.
  **[USN-1]** | Priority: P1
  **Independent Test:** `new Store(':memory:')`, call `saveObservation` twice
  with the same `topic_key` (second call exercises the upsert branch), assert
  `action === 'upserted'` and the returned `observation` fields match current
  behavior — runs standalone without any other task.
  **Verification**:
  - Run: `pnpm test -- tests/store/observations.test.ts`
  - Expected: All existing `saveObservation` tests (including the "deduplicates
    within window" and upsert-path tests) still pass unchanged.

- [x] 1.2 Wrap `saveObservation`'s new-insert path in `src/store/index.ts`
  (`observations` INSERT :1534-1547 + `this.getObservation` reload :1549 +
  `this.recordMutation(...)` :1555 + `this.refreshGraphFacts(observation)`
  :1556 + `this.planSemanticJobsForObservation(...)` :1557) in its own
  `this.db.transaction(() => { ... })()`, following the same immediately-invoked
  pattern as 1.1. Thread `{ observation, action: 'created' }` out of the
  callback unchanged. This is the branch reached when `input.topic_key` is
  absent OR no existing row matches it (falls through from the 1.1 block).
  **[USN-1]** | Priority: P1
  **Independent Test:** `new Store(':memory:')`, call `saveObservation` with a
  fresh (non-duplicate, no matching `topic_key`) input, assert
  `action === 'created'` and `observation.id > 0` — standalone from 1.1.
  **Verification**:
  - Run: `pnpm test -- tests/store/observations.test.ts`
  - Expected: The "creates a new observation" and "strips private tags" tests
    (and all other new-insert-path tests) pass unchanged.

- [x] 1.3 Wrap `updateObservation` in `src/store/index.ts` (`observation_versions`
  INSERT :1628-1630 + dynamic `setClauses` UPDATE :1669 + `this.getObservation`
  reload :1671 + the `if (updated) { recordMutation :1674 + refreshGraphFacts
  :1675 + planSemanticJobsForObservation :1676 }` block) in a single
  `this.db.transaction(() => { ... })()`. Preserve the `if (!current) return null`
  not-found early-return at :1624-1626 OUTSIDE the transaction (no writes have
  occurred yet at that point) and preserve the `if (updated)` guard's semantics
  exactly — `recordMutation`/`refreshGraphFacts`/`planSemanticJobsForObservation`
  only run when the post-update reload succeeds. Thread `Observation | null`
  out of the callback for both the found and updated cases.
  **[USN-1]** | Priority: P1
  **Independent Test:** `new Store(':memory:')`, call `updateObservation` with
  a valid `id` and a bogus/nonexistent `id`; assert the valid call returns the
  updated `Observation` with expected field changes and the bogus call returns
  `null` — standalone from 1.1/1.2.
  **Verification**:
  - Run: `pnpm test -- tests/store/observations.test.ts`
  - Expected: All existing `updateObservation` tests pass unchanged, including
    the not-found-returns-null case.

- [x] 1.4 Full-suite regression pass over the wrapped writers — no other files.
  Confirms 1.1-1.3 introduced no incidental regression elsewhere in the store
  layer (e.g. `kg-facts-cutover.test.ts`'s synchronous-save/-update assertions
  at lines 314-359 and 361-388, which directly exercise `saveObservation` /
  `updateObservation` write-then-read-back behavior).
  **[USN-1]** | Priority: P1
  **Independent Test:** N/A (aggregation checkpoint over 1.1-1.3); rerun is
  idempotent and side-effect-free.
  **Verification**:
  - Run: `pnpm test -- tests/store/`
  - Expected: Every test file under `tests/store/` passes, in particular
    `observations.test.ts` and `kg-facts-cutover.test.ts` with zero
    modifications to either file at this phase.

## Phase 2: Rollback regression test (new coverage)

- [x] 2.1 Add a mid-write-failure rollback test for `saveObservation`'s
  new-insert path in `tests/store/observations.test.ts`. Use `vi.spyOn` (or
  `vi.mock('../../src/indexing/jobs.js', ...)` with `importOriginal`) on the
  exported `writeDeterministicKgFacts` function (`src/indexing/jobs.ts:484`,
  called from `refreshGraphFacts` at `src/store/index.ts:1125` on the default
  `graphFactsSource: 'kg'` path) to throw after being invoked. Call
  `store.saveObservation({...})` inside `expect(() => ...).toThrow()`, then
  assert: (a) `SELECT COUNT(*) FROM observations WHERE title = ?` returns 0
  (no observation row survives), (b) `SELECT COUNT(*) FROM kg_triples WHERE
  source_type = 'observation'` is unchanged from the pre-call baseline
  (0, since this is the new-insert path), and (c) `SELECT COUNT(*) FROM
  sync_mutations WHERE entity_type = 'observation'` is unchanged from baseline
  (proves the already-present `recordMutation` call at :1555 rolls back too,
  closing the proposal's Affected-Areas coordination note rather than leaving
  it open).
  **[USN-2]** | Priority: P1
  **Spec:** `store/Transactional Observation Writes` (capability ownership per
  proposal's Affected Areas note; no delta spec file exists in this accelerated
  pipeline — this tag documents intended archive-time linkage)
  **Independent Test:** Runs in isolation as a single `it(...)` block using its
  own fresh `new Store(':memory:')`; does not depend on 1.1-1.4 test state.
  **Verification**:
  - Run: `pnpm test -- tests/store/observations.test.ts -t "rolls back"`
  - Expected: New test passes AFTER Task 1.2 lands; if run against
    pre-Task-1.2 code the observation row would NOT roll back (red-before-fix
    behavior is acceptable evidence but not required to be separately
    demonstrated, since 1.2 is a small mechanical wrap — do not block on
    reproducing the pre-fix failure if time-constrained).

- [x] 2.2 Add the equivalent mid-write-failure rollback test for
  `saveObservation`'s topic_key-upsert path (seed an existing observation with
  a `topic_key` first, then re-save with the same `topic_key` and the
  `writeDeterministicKgFacts` throw-spy active). Assert: (a) the observation
  row's `title`/`content`/`revision_count`/`updated_at` are unchanged from the
  pre-call snapshot (the UPDATE at :1516-1517 rolled back), (b) no new
  `observation_versions` row was inserted for this call (the :1512-1513 INSERT
  rolled back), and (c) `kg_triples` for that observation are unchanged from
  the pre-call snapshot.
  **[USN-2]** | Priority: P1
  **Spec:** `store/Transactional Observation Writes`
  **Independent Test:** Own `it(...)` block, own `new Store(':memory:')` and
  own seed observation; independent of 2.1.
  **Verification**:
  - Run: `pnpm test -- tests/store/observations.test.ts -t "rolls back"`
  - Expected: Both 2.1 and 2.2's new tests pass; upsert-path row is
    byte-identical to its pre-call state after the forced throw.

- [x] 2.3 Add the equivalent mid-write-failure rollback test for
  `updateObservation` (seed an observation, call `updateObservation` with a
  content change and the `writeDeterministicKgFacts` throw-spy active).
  Assert: (a) the observation row is unchanged from its pre-call snapshot
  (the :1669 UPDATE rolled back), (b) no new `observation_versions` row exists
  for this call, and (c) `kg_triples` for that observation are unchanged.
  **[USN-2]** | Priority: P1
  **Spec:** `store/Transactional Observation Writes`
  **Independent Test:** Own `it(...)` block and own seed; independent of
  2.1/2.2.
  **Verification**:
  - Run: `pnpm test -- tests/store/observations.test.ts -t "rolls back"`
  - Expected: All three rollback tests (2.1, 2.2, 2.3) pass together.

## Phase 3: Nested-transaction and mode-safety verification

- [x] 3.1 Add (or extend an existing test in) `tests/store/observations.test.ts`
  or `tests/store/kg-facts-cutover.test.ts` proving no "cannot start a
  transaction within a transaction" error and full atomicity on the DEFAULT
  `graphFactsSource: 'kg'` mode (`new Store(':memory:')` — matches config.ts:299
  default). This is the PRIMARY mode: on this branch, `refreshGraphFacts`
  (:1119) calls `writeDeterministicKgFacts` -> `persistKgExtraction`
  (`src/indexing/jobs.ts:503`), which uses only `.run()`/`.get()` and opens NO
  inner `db.transaction()` — so no nesting occurs on this path and this task
  is confirmatory, not exploratory. Reuse the throw-spy tests from 2.1-2.3 as
  the primary evidence (no error message about nested transactions surfaces;
  the `expect(() => ...).toThrow()` assertion catches ONLY the injected error,
  not a better-sqlite3 transaction-nesting error) and add one explicit
  happy-path assertion that a normal (non-throwing) `saveObservation` call
  still commits successfully post-wrap.
  **[USN-3]** | Priority: P1
  **Independent Test:** Standalone `it(...)` using `new Store(':memory:')`;
  asserts a successful non-throwing `saveObservation` call still returns
  `action: 'created'` and the row + triples are persisted — independent of
  Phase 2's throw-based tests.
  **Verification**:
  - Run: `pnpm test -- tests/store/observations.test.ts tests/store/kg-facts-cutover.test.ts`
  - Expected: No test failure or thrown error mentions "transaction within a
    transaction"; all default-mode (`'kg'`) tests pass.

- [x] 3.2 Add a legacy-mode smoke check using
  `new Store(':memory:', { graphFactsSource: 'legacy' })` (construction
  pattern already proven at `tests/store/kg-facts-cutover.test.ts:226`). On
  this path, `refreshGraphFacts` (:1120-1122) calls `refreshObservationFacts`
  -> `replaceObservationFacts` (:1081), which OPENS ITS OWN
  `this.db.transaction()` at :1088 — this NESTS inside the new outer
  transaction from Tasks 1.1-1.3. Assert: (a) `saveObservation` and
  `updateObservation` both complete successfully in legacy mode post-wrap (no
  thrown nesting error — better-sqlite3 `^12.10.0` converts the inner
  `transaction()` call to a SAVEPOINT automatically, which is safe), and (b)
  the `observation_facts` table rows for a given observation are fully
  replaced (old rows deleted, new rows inserted) exactly as before the wrap.
  This is a SMOKE check, not a full rollback-parity requirement — Phase 2's
  rollback tests target the default `'kg'` mode only, per proposal scope.
  **[USN-3]** | Priority: P2
  **Independent Test:** Standalone `it(...)` block with its own
  `graphFactsSource: 'legacy'` store instance; independent of 3.1 and Phase 2.
  **Verification**:
  - Run: `pnpm test -- tests/store/kg-facts-cutover.test.ts -t "legacy"`
  - Expected: Legacy-mode save/update tests pass with no nested-transaction
    error; `observation_facts` rows match pre-wrap expected content.

## Phase 4: Flag-off (`kgSupersedeEnabled=false`) parity

- [x] 4.1 Add or extend a test using
  `new Store(':memory:', { knowledgeGraph: { kgSupersedeEnabled: false } } as any)`
  (construction pattern already proven at `tests/indexing/jobs.test.ts:389-393`,
  "uses legacy delete-and-reinsert behavior when supersession is disabled").
  Save an observation, then re-save/update it to trigger the KG diff path with
  `kgSupersedeEnabled: false` active (flag read inside `persistKgExtraction`
  at `src/indexing/jobs.ts:506`, and inside `deleteKnowledgeArtifactsForObservation`
  at `src/store/index.ts:1150`). Assert the resulting `kg_triples` rows show
  the DELETE-then-insert behavior (no `superseded_by_triple_id`/`superseded_at`
  markers set) — identical to pre-wrap behavior. This proves the transaction
  wrap changed ONLY atomicity, not which statements execute under the flag,
  per proposal's explicit Out-of-Scope constraint.
  **[USN-4]** | Priority: P1
  **Spec:** `knowledge-graph/KG Extraction MUST Be Idempotent and Update-Safe`
  (reinforced, not altered, per proposal's Affected Areas capability note)
  **Independent Test:** Standalone `it(...)` with its own
  `kgSupersedeEnabled: false` store instance; independent of Phases 2-3.
  **Verification**:
  - Run: `pnpm test -- tests/indexing/jobs.test.ts tests/store/observations.test.ts`
  - Expected: Flag-off behavior test(s) pass with no supersession markers set;
    no regression in `tests/indexing/jobs.test.ts`'s existing
    "uses legacy delete-and-reinsert behavior when supersession is disabled"
    test.

## Phase 5: Full verification gate

- [x] 5.1 Run the complete test suite to confirm no regression anywhere
  (semantic-job processing, retrieval, visualization, and other consumers of
  `saveObservation`/`updateObservation` beyond the store-layer tests already
  targeted in Phases 1-4).
  **[USN-5]** | Priority: P1
  **Independent Test:** N/A (full-suite aggregation gate); rerunning is
  side-effect-free.
  **Verification**:
  - Run: `pnpm test`
  - Expected: `vitest run` reports all test files green, zero failures.

- [x] 5.2 Run the full build/typecheck pipeline to confirm the transaction-wrap
  callback signatures type-check correctly (in particular that
  `this.db.transaction(() => { ...; return X; })()` infers the correct
  `SaveResult` / `Observation | null` return types with no `any` widening).
  **[USN-5]** | Priority: P1
  **Independent Test:** N/A (full-suite aggregation gate); rerunning is
  side-effect-free.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: `tsc --noEmit && node scripts/build.mjs && pnpm --dir dashboard
    build` completes with exit code 0 and no TypeScript diagnostics in
    `src/store/index.ts`.

## Phase 6: Coordination note (no code change)

- [x] 6.1 Record, for the archive step, that this change's wrap ALREADY
  encloses the pre-existing `recordMutation` calls at `src/store/index.ts`
  lines 1491 (deduplicated branch, stays outside the tx per Task 1.1), 1525,
  1555, and 1674 (all three inside the tx per Tasks 1.1-1.3) — see the note at
  the top of this file. This supersedes the proposal's forward-looking
  "if `sync-and-resilience` lands first / if this change lands first"
  framing: there is no longer a race to coordinate for the `recordMutation`
  calls THIS change touches, because they are already inside the new
  transaction boundary as a direct consequence of the wrap-only approach. If
  `sync-and-resilience` later adds ADDITIONAL journal writes (e.g. new
  mutation kinds or additional call sites) to these same two methods after
  this change lands, those new calls must also be placed inside the existing
  `this.db.transaction(() => { ... })()` boundaries rather than around them —
  flag this note to whoever authors that change's tasks.
  **[USN-6]** | Priority: P3
  **Independent Test:** N/A (documentation/coordination task, no code or test
  artifact produced).
  **Verification**:
  - Run: `git log --oneline -1 -- openspec/changes/sync-and-resilience/proposal.md`
  - Expected: Confirms whether `sync-and-resilience`'s proposal has been
    updated since this note was written (informational check only, not a
    pass/fail gate).
