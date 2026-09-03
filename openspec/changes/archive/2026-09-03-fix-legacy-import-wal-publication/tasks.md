# Tasks: Safe WAL Publication for Legacy Import

## Authoring contract

Root owns task state and SDD artifacts. One `deep` implementation writer owns the coupled publication/recovery runtime and focused tests, must preserve the existing uncommitted one-command import work, and must execute every behavior slice red before green through the confirmed public seams.

## MVP scope

US1 is the MVP: an import plan that genuinely binds a non-empty WAL publishes a verified candidate successfully while preserving the complete current logical baseline. Completion evidence is the new exported-apply regression failing with the current stale physical comparison and passing after the post-quiescence snapshot implementation.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012`; no task is safely parallel because one writer and one ordered publication/recovery state machine own all mutable code and each later test consumes the preceding behavior.

## Story US1

- [x] T001 [US1] Add the failing non-empty-WAL publication tracer for FR-001/FR-002/SC-001 in `tests/memory-core/importer.test.ts` | Verify: the sealed plan contains a non-null WAL fingerprint and the current implementation fails only at publication after candidate integrity passes.
- [x] T002 [US1] Implement sealed-plan validation plus a normalized post-quiescence publication snapshot for FR-001/FR-002/SC-001 in `src/memory-core/import/backup.ts` | Verify: the T001 tracer commits once, preserves every baseline row, retains a valid recovery database, and reports all integrity booleans true.

## Story US2

- [x] T003 [US2] Add failing non-empty-WAL recovery tracers at target-move, candidate-move, and pre-reopen failure boundaries for FR-003/SC-002 in `tests/memory-core/importer.test.ts` | Verify: current byte-bound restoration is exposed by false or failed restoration while expected logical baseline evidence remains explicit.
- [x] T004 [US2] Implement one no-overwrite recovery path with integrity, foreign-key, and logical snapshot proof for FR-003/SC-002 in `src/memory-core/import/backup.ts` | Verify: all T003 cases restore the pre-import logical baseline, retain zero committed import receipts, and report `priorTargetRestored=true` without requiring pre-checkpoint bytes.

## Story US3

- [x] T005 [US3] Add the failing held-reader/checkpoint-busy tracer and observable target-state guards for FR-004/SC-003 in `tests/memory-core/importer.test.ts` | Verify: the fixture reaches publication with a plan-bound WAL, keeps a read transaction open, and exposes any false commit, partial receipt, or non-actionable failure classification.
- [x] T006 [US3] Make incomplete quiescence, changed recovery custody, and occupied target paths fail closed for FR-002/FR-004/SC-003 in `src/memory-core/import/backup.ts` | Verify: busy or mismatched states publish zero candidates, preserve authoritative contents and the verified backup, and surface a bounded locked/changed error.
- [x] T007 [US3] Cover the one-command close-host-and-rerun result for checkpoint-busy publication under FR-001/FR-004/SC-003 in `tests/cli/import-legacy.test.ts` | Verify: `runCli` exits nonzero, writes no success envelope or import receipt, retains its failure report, and emits the existing bounded retry action.

## Regression and cleanup

- [x] T008 Simplify only the new publication snapshot and restoration code while preserving FR-001/FR-002/FR-003/FR-004 behavior in `src/memory-core/import/backup.ts` | Verify: the diff has one explicit snapshot model, no duplicated restoration proof, no weakened no-overwrite guard, and focused tests remain green.
- [x] T009 Run the complete focused core importer suite for FR-001/FR-002/FR-003/FR-004 and SC-001/SC-002/SC-003/SC-004 in `tests/memory-core/importer.test.ts` | Verify: every importer test passes, including DELETE/no-WAL, absent target, mutation, replay, taxonomy, quarantine, WAL success, recovery, and busy cases.
- [x] T010 [US5] Run the complete one-command and advanced CLI import suite for FR-001/FR-004 and SC-003/SC-004 in `tests/cli/import-legacy.test.ts` | Verify: defaults, mapping, plan/apply, retry, replay, custody, privacy, bounded output, and actionable locked-WAL failures all pass.

## Parallel execution

- None: `src/memory-core/import/backup.ts` and the two importer public-seam test files describe one ordered high-risk publication/recovery state machine; splitting writers would create overlapping dependencies and unsafe reconciliation.

## Final verification

- [x] T011 Run TypeScript build, full unit/integration/packed-smoke/fixture/prepublish checks, and diff hygiene for SC-004 in `package.json` | Verify: every repository-required command passes or an exact unrelated/pre-existing failure is recorded without touching the real legacy or current user database.
- [x] T012 [US4] Record complete FR and buildable/outcome-SC evidence plus a fresh independent Oracle verdict for SC-001/SC-002/SC-003/SC-004/SC-005 in `openspec/changes/fix-legacy-import-wal-publication/verify-report.md` | Verify: Oracle returns PASS for implementation criteria, SC-005 remains an explicit unexecuted outcome until separately authorized, and closeout validation is structurally ready.
