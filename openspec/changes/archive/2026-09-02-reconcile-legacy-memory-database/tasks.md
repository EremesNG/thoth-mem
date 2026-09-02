# Tasks: Reconcile Legacy Memory Database

## Authoring contract

Task status is root-owned. The implementation owner returns evidence; root alone moves `[ ]` to `[~]` or `[x]` after reconciling the declared verification. One deep owner holds every mutable code/test surface because schema, receipts, temporal lineage, backup/publication, CLI hashes, and fixtures are mutually dependent.

## MVP scope

US1 is the first independently testable slice: a zero-write deterministic plan that inventories a populated target and extension-bearing legacy source without loading virtual modules. MVP evidence is passing plan/CLI fixture tests plus unchanged source/target hashes (SC-001, SC-002).

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005`; `T006 -> T007`; `T008 -> T009 -> T010`; `T011 -> T012 -> T013 -> T014`; `T015 -> T016 -> T017 -> T018`; `T019 -> T020`; all implementation tasks precede `T023 -> T024`.

US2 project reconciliation consumes the US1 plan contract. US3 merge consumes approved mappings and revision-8 audit state. US4 publication consumes the complete candidate writer/verifier. US5 replay consumes committed receipts. SC-010 and SC-011 remain separately authorized outcome verification targets, not implementation tasks.

## Story US1

- [x] T001 [US1] Add failing zero-write, deterministic-plan, schema-classification, stale-input, privacy-disposition, and unavailable-virtual-module tests covering FR-001/FR-002 and SC-001/SC-002 in `tests/memory-core/importer.test.ts` | Verify: focused test run fails only on the missing v3 planning behavior and input hashes remain unchanged.
- [x] T002 [US1] Define closed canonical plan/report/mapping types, enums, normalization, self-hash, and policy hashes for FR-001/FR-002 and SC-001 in `src/memory-core/import/contracts.ts` | Verify: contract tests accept one canonical envelope, reject unknown/tampered fields, and reproduce one plan hash.
- [x] T003 [US1] Implement read-only streaming legacy/current inspection, authoritative logical fingerprints, sqlite_master-based derived/virtual inventory, privacy classification, and before/after fingerprint checks for FR-001/FR-002 and SC-001/SC-002 in `src/memory-core/import/inspect.ts` | Verify: plan fixtures classify every table without selecting a virtual table and perform zero input writes.
- [x] T004 [US1] Add failing CLI parsing/create-only artifact tests for import-legacy plan, duplicate/unknown options, occupied plan paths, and bounded errors covering FR-002 and SC-001 in `tests/cli/import-legacy.test.ts` | Verify: focused CLI tests isolate the missing plan subcommand behavior.
- [x] T005 [US1] Wire import-legacy plan to exact source/target/plan/map options and create-only JSON output without retaining the one-shot compatibility shape for FR-002 and SC-001 in `src/cli.ts` | Verify: CLI plan tests pass and both database hashes remain unchanged.

## Story US2

- [x] T006 [US2] Add failing mapping-matrix tests for explicit selectors, exact keys, exact path aliases, unmatched isolation, placeholders, row/session conflicts, and ambiguous aliases covering FR-001/FR-002 and SC-003 in `tests/memory-core/importer.test.ts` | Verify: no fuzzy/name/basename case auto-maps and every project/row receives one expected disposition.
- [x] T007 [US2] Implement deterministic mapping resolution and plan-bound destination validation with explicit-first precedence, exact-only automatic evidence, isolated legacy identities, and fail-closed conflicts for FR-001/FR-002 and SC-003 in `src/memory-core/import/inspect.ts` | Verify: the complete mapping matrix passes with zero ambiguous automatic mappings.

## Story US3

- [x] T008 [US3] Add failing revision-7-to-8 backup/migration/idempotency tests that require empty import audit tables and preserve all baseline/FTS rows covering FR-001 and SC-005/SC-008 in `tests/memory-core/schema-migration.test.ts` | Verify: the focused migration test fails only because revision 8 is absent.
- [x] T009 [US3] Add closed legacy_imports, legacy_project_mappings, and legacy_import_rows schema, constraints, indexes, and immutability guards for FR-001 and SC-004/SC-008/SC-009 in `src/memory-core/sqlite/schema.ts` | Verify: clean schema exposes the exact audit contract and rejects invalid dispositions or dangling lineage.
- [x] T010 [US3] Implement verified pre-v8 backup plus forward-only revision-8 migration with baseline/FTS preservation and idempotent reopen for FR-001 and SC-005/SC-008 in `src/memory-core/sqlite/migrations.ts` | Verify: revision migration tests pass including injected rollback and backup restoration.
- [x] T011 [US3] Add failing candidate-writer tests for preserved sessions/timestamps, prompts, raw summaries, observation revisions/heads, deleted/unsafe quarantine, exact dedup, temporal chains, existing-winner precedence, receipts, and FTS covering FR-001 and SC-004/SC-005/SC-006/SC-008 in `tests/memory-core/importer.test.ts` | Verify: fixtures reconcile 100% of logical source rows and expose only the missing writer behavior.
- [x] T012 [US3] Implement the candidate-only prepared-statement writer, stable import/source IDs, audit receipts, legacy type mapping, summary handling, exact dedup provenance, and deterministic temporal reconciliation for FR-001 and SC-004/SC-005/SC-006/SC-008 in `src/memory-core/import/writer.ts` | Verify: writer fixtures preserve every supported row/disposition, target baseline hashes, target current winners, provenance, and memory/FTS equality.
- [x] T013 [US3] Add recall/history regression assertions for imported mapped/isolated memories, revision visibility, target-winner stability, and unchanged pre-existing result order covering FR-001 and SC-006 in `tests/memory-core/retrieval.test.ts` | Verify: mapped legacy history is retrievable while the pre-import current-memory ordering fixture is identical.
- [x] T014 [US3] Add importer-specific malformed-private-delimiter validation while reusing canonical credential/private filtering and preserving ordinary save semantics for FR-001 and SC-004 in `src/memory-core/privacy.ts` | Verify: malformed or empty required legacy fields quarantine without raw-content leakage and existing privacy tests remain unchanged.

## Story US4

- [x] T015 [US4] Add failing WAL-aware backup, changed/locked target, candidate cleanup, integrity failure, publication-step failure, restoration, and create-only report tests covering FR-002 and SC-007/SC-008 in `tests/memory-core/importer.test.ts` | Verify: each injected pre-publication failure demonstrates unchanged source/active-target logical hashes.
- [x] T016 [US4] Implement read-only online target backup, backup verification, candidate cloning, WAL checkpoint/single-file closure, safe artifact ownership, stopped-target publication, and restoration for FR-002 and SC-007/SC-008 in `src/memory-core/import/backup.ts` | Verify: WAL/publication fixtures either commit one verified candidate or restore the exact prior target bundle.
- [x] T017 [US4] Implement candidate/base manifest, receipt closure, temporal/provenance, schema, SQLite integrity, foreign-key, baseline, source/target fingerprint, and exact memory/FTS verification for FR-001/FR-002 and SC-005/SC-007/SC-008 in `src/memory-core/import/verify.ts` | Verify: every corrupted candidate class fails before publication with one closed reason code.
- [x] T018 [US4] Orchestrate canonical plan verification, backup, candidate migration/write, re-fingerprinting, verification, publication, bounded reporting, cleanup, and LegacyImportFailure recovery state for FR-001/FR-002 and SC-004/SC-007/SC-008 in `src/memory-core/import/legacy-v1.ts` | Verify: end-to-end fixture publishes only a passing candidate and every injected failure leaves a recoverable target.
- [x] T019 [US4] Complete import-legacy apply parsing and create-only report behavior with no path/policy overrides and bounded sanitized stderr for FR-002 and SC-007/SC-008 in `src/cli.ts` | Verify: CLI apply accepts only a valid bound plan and reports committed state only after verified publication.

## Story US5

- [x] T020 [US5] Add failing same-plan replay, tampered receipt, changed-policy/mapping, overlapping source-ID, and stable destination-ID tests covering FR-001/FR-002 and SC-009 in `tests/memory-core/importer.test.ts` | Verify: only the exact committed plan is an eligible zero-delta replay.
- [x] T021 [US5] Implement committed-source/plan replay lookup and complete child-receipt verification without duplicate evidence, memory, project, session, or FTS writes for FR-001/FR-002 and SC-009 in `src/memory-core/import/legacy-v1.ts` | Verify: identical replay returns the original import IDs with zero logical row changes and tampered/different plans fail closed.

## Documentation

- [x] T022 [US4] Document the revision-8 audit boundary, authoritative/derived legacy classifications, identity/privacy/temporal rules, and no-inferred observation/session-event semantics for FR-001 and SC-004/SC-006/SC-008 in `docs/agent/persistence-retrieval.md` | Verify: routed persistence documentation matches the implemented schema and integrity commands without claiming real-data success.
- [x] T023 [US4] Replace the public one-shot import example with plan/apply, mapping review, stopped-target, backup/recovery, and rehearsal-before-cutover guidance for FR-002 and SC-007/SC-008 in `README.md` | Verify: every documented command exists in CLI help/tests and destructive publication is clearly separated from planning.

## Parallel execution

- None: schema revision, canonical plan hashes, importer fixtures, project mapping, candidate receipts, temporal lineage, backup/publication, CLI envelopes, and recall assertions consume each other's exact outputs; one deep owner and sequential test-first barriers avoid overlapping writers and stale contract assumptions.

## Final verification

- [x] T024 Run focused importer, CLI, schema-migration, privacy, and retrieval tests plus TypeScript build covering FR-001/FR-002 and SC-001 through SC-009 in `package.json` | Verify: every focused command terminates successfully with zero skipped required cases and zero unexpected filesystem residue.
- [x] T025 Run the required broader unit/integration/package verification from the testing guide and review status/diff for generated, secret, real-database, or unrelated material covering FR-001/FR-002 and SC-005/SC-007/SC-008/SC-009 in `docs/agent/testing.md` | Verify: required suites pass or exact failures are recorded, git diff check passes, and no real DB copy or secret appears in the worktree.

## Convergence round 1

- [x] T026 Resolve B-001 (partial) for FR-002 and SC-007 by closing physical source/target alias detection and publication-bound target validation, with coupled publication orchestration and importer fixtures, in `src/memory-core/import/inspect.ts` | Verify: symlink/hardlink aliases fail before planning, and a target mutation injected after candidate verification but before publication cannot publish and leaves the prior target recoverable.
- [x] T027 Resolve B-002 (partial) for FR-001 and SC-005/SC-008 by strengthening candidate verification and adversarial importer fixtures in `src/memory-core/import/verify.ts` | Verify: complete populated-target baseline preservation is exercised, while corrupted transformed hashes/timestamps, payload or scope provenance, branching/cyclic/interval-invalid temporal lineage, current-winner state, and FTS title/content/topic each fail before publication.
- [x] T028 Resolve B-003 (partial) for FR-001 and SC-005/SC-008 by binding pre-v8 backup reuse to the immediate revision-7 state with focused migration fixtures in `src/memory-core/sqlite/migrations.ts` | Verify: migration failure followed by a valid revision-7 write and retry cannot reuse an obsolete backup, while an equivalent verified backup remains idempotently reusable.

## Convergence round 2

- [x] T029 Resolve V2-B001 (partial) for FR-001 and SC-008/SC-009 by binding every planned source key to its exact disposition/reason/scope/hash/destination semantics, verifying the complete import header, and namespacing imported sessions by source fingerprint in `src/memory-core/import/verify.ts` | Verify: swapped row semantics and a tampered source-file fingerprint fail, while two sources sharing project/session keys receive distinct stable session IDs and exact replays remain zero-delta.
- [x] T030 Resolve V2-B002 (partial) for FR-001/FR-002 and SC-008 by holding a write-reserving transaction from revision-7 backup equivalence validation through revision-8 migration in `src/memory-core/sqlite/migrations.ts` | Verify: a coordinated second connection cannot commit between backup validation and migration, and every retained pre-v8 backup exactly matches the migrated pre-state.
- [x] T031 Resolve V2-B003 (contradicts) by repairing convergence-task single-path syntax and rerunning the Full ready gate in `openspec/changes/reconcile-legacy-memory-database/tasks.md` | Verify: the validator passes through ready with no SDD-TASK-FORMAT finding and all prior task IDs, order, status, and semantics remain intact.

## Convergence round 3

- [x] T032 Resolve V3-B001 (partial) for FR-001/FR-002 and SC-008 by including SQLite-maintained AUTOINCREMENT state in immediate revision-7 backup equivalence in `src/memory-core/sqlite/migrations.ts` | Verify: after a retained backup, an insert/delete cycle that advances `change_watermark` causes retry to reject the stale backup, while an unchanged equivalent backup still migrates under the reserved transaction.
