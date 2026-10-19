# Tasks: Reliable embedding-lineage rebuild detection

## Authoring contract

Task identifiers are sequential across the file. Every implementation task is preceded by a failing regression test, and task completion moves from `[ ]` to `[~]` while in progress and to `[x]` only after its stated verification evidence exists.

## MVP scope

US1 is the MVP: reopening a persistent database under a different active embedding hash must preserve the old lineage long enough to enqueue exactly 1 rebuild and mark both semantic lanes pending and stale.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012`; the store initialization and queue surfaces overlap, so all tasks remain sequential.

## Story US1

- [x] T001 [US1] Add a failing migration regression proving existing lane hashes survive a later migration with a different active hash, covering FR-001/SC-001 in `tests/store/migration.test.ts` | Verify: the named test fails because the current migration overwrites the stored hash.
- [x] T002 [US1] Preserve the existing lane hash on semantic migration conflicts while retaining new-lane initialization and dimension handling, covering FR-001/SC-001 in `src/store/migrations.ts` | Verify: T001 passes and existing dimension-change tests remain green.
- [x] T003 [US1] Add a failing persistent-store regression for hash A to hash B startup, active rebuild deduplication, and stale/pending lane state, covering FR-002/FR-004/SC-001 in `tests/store/index.test.ts` | Verify: the named test fails before store mismatch and queue behavior are corrected.
- [x] T004 [US1] Correct metadata mismatch evaluation and idempotent rebuild enqueue behavior for a changed active hash, covering FR-002/FR-004/SC-001 in `src/store/index.ts` | Verify: T003 observes exactly 1 active rebuild row and stale/pending chunk and sentence lanes.

## Story US2

- [x] T005 [US2] Add failing regressions for active lane metadata with old or null live vector hashes and for complete-count mixed-lineage readiness, covering FR-002/FR-003/SC-002 in `tests/store/index.test.ts` | Verify: the tests reproduce the falsely healthy state and fail while readiness ignores vector lineage.
- [x] T006 [US2] Include live vector embedding hashes in startup mismatch detection and semantic readiness reconciliation, covering FR-002/FR-003/SC-002 in `src/store/index.ts` | Verify: T005 passes for old and null lineage and neither affected lane reports ready.

## Story US3

- [x] T007 [US3] Add failing queue regressions for terminal rebuild reactivation, pending/running preservation, and vector-only mismatch while semantic child jobs are active, covering FR-004/SC-003 in `tests/store/index.test.ts` | Verify: the terminal-row case fails under conflict-ignore behavior while active rows remain singular.
- [x] T008 [US3] Make rebuild deduplication reactivate terminal rows without resetting active work and suppress startup requeue churn during active current-lineage child work, covering FR-004/SC-003 in `src/store/index.ts` | Verify: all T007 cases pass with one row per dedupe key and stable pending/running state.

## Parallel execution

- None: migration and store changes share startup ordering, while all store regressions modify the same test file and must remain test-first relative to their implementation.

## Final verification

- [x] T009 Simplify the completed semantic-lineage control flow without changing behavior, covering FR-001/FR-002/FR-003/FR-004 in `src/store/index.ts` | Verify: focused regressions remain green and the diff contains no unrelated refactor.
- [x] T010 Run the focused store and migration suites covering SC-001/SC-002/SC-003/SC-004 in `tests/store/index.test.ts` | Verify: pnpm exec vitest run tests/store/index.test.ts tests/store/migration.test.ts exits 0.
- [x] T011 Run the repository build gate covering SC-004 in `package.json` | Verify: pnpm run build exits 0.
- [x] T012 Run the complete Vitest suite covering SC-004 in `package.json` | Verify: pnpm test exits 0 with no new failures.

SC-005 remains an outcome verification target for the separately authorized real-database rebuild after implementation, independent verification, and archive.
