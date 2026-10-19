# Tasks: Idempotent semantic rebuild detection

## Authoring contract

Task identifiers are repository-wide within this change, sequential, and executed test-first. Each story reaches an observable public seam before the next story begins.

## MVP scope

US1 is the MVP: `rebuild-index --status` reports the persisted semantic snapshot while a before/after database comparison proves zero semantic job or lane-state mutations.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008`; T004 contains both the zero-unit convergence failure and the preserved genuine-repair control so T005 cannot make the suite green by disabling automatic repair.

## Story US1

- [x] T001 [US1] Add a failing CLI snapshot regression proving status-only execution produces zero inserts, deletes, updates, recoveries, or rebuild reactivations for FR-001/SC-001 in `tests/cli.test.ts` | Verify: the focused test fails against the current normal Store startup and identifies durable semantic-state mutation rather than output text.
- [x] T002 [US1] Add the minimum SQLite-enforced read-only Store opening mode and non-reconciling progress/state reads for FR-001/SC-001 in `src/store/index.ts` | Verify: the read-only Store can report a seeded file database while any attempted write is rejected and startup leaves semantic snapshots unchanged.
- [x] T003 [US1] Route only the status-only CLI branch through read-only Store opening while preserving normal manual rebuild behavior for FR-001/SC-001 in `src/cli.ts` | Verify: the T001 regression turns green and the existing queue-and-process CLI rebuild test still passes.

## Story US2

- [x] T004 [US2] Add a failing disposable-database regression with one nonblank observation and one blank or whitespace-only observation, then reopen twice; include a nonblank missing-coverage control for FR-002/FR-003/FR-004 and SC-002/SC-003 in `tests/store/index.test.ts` | Verify: current code falsely reactivates missing-semantic-coverage for the valid zero-unit observation while the control still requests exactly 1 active rebuild.
- [x] T005 [US2] Align automatic structural-coverage eligibility with semantic splitting so zero-unit normalized content is terminal, while retaining vector and lineage repair for FR-002/FR-003/FR-004 and SC-002/SC-003 in `src/store/index.ts` | Verify: two consecutive clean reopenings produce zero active rebuilds and ready lanes, while the nonblank missing-coverage control produces exactly 1 deduplicated active rebuild.
- [x] T006 [US2] Extend configuration regression coverage with the supplied LM Studio model/profile/dimensions/normalization shape and device-only variations for FR-005/SC-004 in `tests/config.test.ts` | Verify: 3 repeated materializations yield one identical hash and changing only device yields zero hash changes without provider network access.

## Story US3

- [x] T007 [US3] Run the focused configuration, Store, and CLI suites together to prove read-only status, clean-start idempotency, and genuine-repair preservation for FR-001/FR-002/FR-003/FR-004/FR-005 and SC-001/SC-002/SC-003/SC-004 in `package.json` | Verify: all focused Vitest files pass in one run with no live data directory or provider access.

## Parallel execution

- None: The implementation intentionally forms sequential RED/GREEN vertical slices over shared Store/CLI behavior, the exact-configuration check follows the root-cause fix, and final checks depend on the complete diff.

## Final verification

- [x] T008 Simplify only the changed implementation without behavior drift, then obtain independent Oracle review of focused tests, required broader tests, build, diagnostics, diff hygiene, and outcome limits for FR-001/FR-002/FR-003/FR-004/FR-005 and SC-001/SC-002/SC-003/SC-004/SC-005 in `openspec/changes/semantic-rebuild-idempotency/verify-report.md` | Verify: Oracle reports PASS for all buildable criteria, records that SC-005 remains a post-upgrade real-host outcome, and no live database mutation was performed.
