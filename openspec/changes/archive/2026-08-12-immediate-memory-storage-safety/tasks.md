# Tasks: Immediate Memory Storage Safety

## Authoring contract

Task identifiers are global and sequential. Every behavior slice starts with a failing public-contract test, then implements only enough behavior to make that slice pass. No task may target the operator's live data directory.

## MVP scope

US1 is the MVP: a legacy database converges before use, and every representative locally-originated observation, prompt, session, maintenance-reflection, project-migration, and deletion write either commits with its non-empty-identity journal event or rolls back completely, while inbound imports produce no outbound mutations. Completion evidence is SC-001 and SC-002 passing against disposable fixtures.

## Dependencies

T001 -> T002 -> T003 -> T004; T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014; T014 -> T015 -> T016; T004 -> T017 -> T018 -> T019 -> T020 -> T021 -> T022 -> T023 -> T024 -> T025 -> T026 -> T027 -> T028 -> T029 -> T030; T014 + T016 + T030 -> T031 -> T032 -> T033 -> T034. US2 depends on the corrected schema and fail-closed journal. US4 Store behavior depends on resolved retention configuration. HTTP/CLI registration is serialized because stories share dispatch, routing, catalog, and OpenAPI surfaces.

## Story US1

- [x] T001 [US1] Add a failing populated-legacy migration test for FR-001 and SC-001 in `tests/store/migration.test.ts` | Verify: opening the fixture twice preserves legacy rows and indexes, exposes project, and permits a project-bearing mutation.
- [x] T002 [US1] Add the idempotent sync-mutation project-column migration for FR-001 and SC-001 in `src/store/migrations.ts` | Verify: T001 passes and read-only startup remains mutation-free.
- [x] T003 [US1] Add failing abort-trigger, stable-identity, and inbound-origin tests across representative writers/imports for FR-002, FR-003, SC-002 in `tests/store/sync-journal-atomicity.test.ts` | Verify: each local failure rolls back; project migration rejects an affected observation/prompt with missing identity before any write and journals a soft-deleted observation as `delete`; successful controls journal non-empty identities; legacy/V2 inbound application creates zero outbound mutations including implicit sessions.
- [x] T004 [US1] Make mutation persistence fail closed, add origin-aware session persistence, preflight project-migration identities, and move all local primary/journal changes into one transaction for FR-002, FR-003, SC-002 in `src/store/index.ts` | Verify: T003 plus existing observation, prompt, session, maintenance, migration, deletion, and sync-import suites pass without partial commits or replication loops.

## Story US2

- [x] T005 [US2] Add failing Store repair and sync round-trip tests for FR-004, FR-005, SC-003 in `tests/store/sync-journal-repair.test.ts` | Verify: preview is read-only; missing/stale fingerprints write zero; matching apply covers create/update/delete and ineligible identities, reports `skipped` as already-covered rows with `scanned = candidates + skipped + ineligible_identity`, batches at 10,000, and restores an active source over a tombstoned target idempotently.
- [x] T006 [US2] Define repair scope, preview/apply, result, fingerprint, sample, stale-preview, and exact skipped-count types for FR-004, FR-005, SC-003 in `src/store/types.ts` | Verify: T005 compiles against explicit non-null fingerprint, required apply preconditions, and the reconciled count invariant.
- [x] T007 [US2] Implement fingerprint-bound repair, immediate apply, and inbound observation upsert/resurrection for FR-004, FR-005, SC-003 in `src/store/index.ts` | Verify: T005 passes with exact scope, continuation, zero source-memory changes, zero inbound journal growth, and replay convergence.
- [x] T008 [US2] Add failing preview-bound CLI contract tests for FR-006 and SC-008 in `tests/cli.test.ts` | Verify: exact scope, preview default, required apply fingerprint, bounded/copyable output, stale rejection, and propagated failure are observable.
- [x] T009 [US2] Implement repair-sync-journal CLI parsing, output, and Store invocation for FR-006 and SC-008 in `src/cli.ts` | Verify: T008 passes for preview, matching apply, malformed input, and stale failure.
- [x] T010 [US2] Register repair-sync-journal process dispatch for FR-006 and SC-008 in `src/index.ts` | Verify: CLI entrypoint dispatches the new command and the MCP registry remains exactly six tools.
- [x] T011 [US2] Add failing repair REST, conflict, catalog, and OpenAPI tests for FR-007 and SC-008 in `tests/http-server.test.ts` | Verify: preview/apply validate scope/preconditions, stale apply returns 409 with zero writes, shared fields agree, and both routes appear in catalog/OpenAPI.
- [x] T012 [US2] Implement journal-repair handlers, validation, conflict mapping, and operation-catalog entries for FR-007 and SC-008 in `src/http-routes.ts` | Verify: handler tests pass for preview, matching apply, malformed input, and stale conflict.
- [x] T013 [US2] Register journal-repair preview/apply route definitions for FR-007 and SC-008 in `src/http-server.ts` | Verify: both exact POST paths resolve to their handlers without changing existing route behavior.
- [x] T014 [US2] Add journal-repair request, result, and 409 response schemas for FR-007 and SC-008 in `src/http-openapi.ts` | Verify: OpenAPI tests expose both exact paths and required apply fingerprint.

## Story US3

- [x] T015 [US3] Add failing owner/non-owner liveness trace tests for FR-008, FR-014, SC-005 in `tests/http-server.test.ts` | Verify: repeated successful and failed health handling creates zero health traces while a non-health route remains sanitized and queryable.
- [x] T016 [US3] Add route-level health trace exclusion without changing health or takeover behavior for FR-008, FR-014, SC-005 in `src/http-server.ts` | Verify: T015 and existing operation-trace, health, takeover, and MCP trace tests pass.

## Story US4

- [x] T017 [US4] Add failing retention default, precedence, validation, and schema tests for FR-011 and SC-009 in `tests/config.test.ts` | Verify: 7-day success, 30-day error, 50,000-row defaults and env-over-persisted precedence are exact, with invalid values safely falling back.
- [x] T018 [US4] Implement operation-trace retention configuration, resolution, persistence merge, and Store default merging for FR-011 and SC-009 in `src/config.ts` | Verify: runtime and persisted defaults/overrides satisfy T017.
- [x] T019 [US4] Add the public persisted retention configuration shape for FR-011 and SC-009 in `config.schema.json` | Verify: default and overridden config documents validate with no unknown-property failure.
- [x] T020 [US4] Add failing fixed-preview retention Store tests for FR-009, FR-010, SC-007 in `tests/store/operation-traces.test.ts` | Verify: matching fingerprint/effective-now agrees exactly; missing/stale/policy-drift preconditions delete zero; strict boundaries, malformed timestamps, scopes, 50,000-row continuation, rollback, unrelated-table preservation, and repeat safety are proven.
- [x] T021 [US4] Define retention policy, preview/apply, result, fingerprint, and stale-preview types for FR-009, FR-010, SC-007 in `src/store/types.ts` | Verify: T020 compiles against exact effective-now and required apply precondition contracts.
- [x] T022 [US4] Implement canonical-time preview fingerprints and precondition-bound immediate trace deletion for FR-009, FR-010, SC-007 in `src/store/index.ts` | Verify: T020 passes with deterministic oldest-first selection, exact instant/policy binding, and deletion limited to operation_traces.
- [x] T023 [US4] Add failing preview-bound prune-operation-traces CLI tests for FR-012 and SC-008 in `tests/cli.test.ts` | Verify: exact scope, preview default, required fingerprint/effective-now apply inputs, policy output, bounded continuation, stale rejection, and failure behavior are observable.
- [x] T024 [US4] Implement prune-operation-traces CLI parsing, output, and Store invocation for FR-012 and SC-008 in `src/cli.ts` | Verify: T023 passes for preview, matching apply, malformed preconditions, and stale failure.
- [x] T025 [US4] Register prune-operation-traces process dispatch for FR-012 and SC-008 in `src/index.ts` | Verify: CLI entrypoint dispatches the new command and the MCP registry remains exactly six tools.
- [x] T026 [US4] Add failing retention REST conflict, catalog, OpenAPI, and registry tests for FR-013, FR-014, SC-008 in `tests/http-server.test.ts` | Verify: matching apply shares Store semantics; stale apply returns 409 with zero deletes; the snapshot boundary and existing trace APIs remain intact; exactly six MCP tools remain.
- [x] T027 [US4] Implement retention handlers, validation, conflict mapping, and operation-catalog entries for FR-013, FR-014, SC-008 in `src/http-routes.ts` | Verify: handler tests pass for preview, matching apply, malformed input, and stale conflict.
- [x] T028 [US4] Register retention preview/apply route definitions for FR-013, FR-014, SC-008 in `src/http-server.ts` | Verify: both exact POST paths resolve and the route's own recent trace remains outside the Store commit snapshot.
- [x] T029 [US4] Add retention request, policy, result, and 409 response schemas for FR-013, FR-014, SC-008 in `src/http-openapi.ts` | Verify: OpenAPI tests expose both exact paths, fingerprint/effective-now requirements, and stale conflict.
- [x] T030 [US4] Lock the public registry at six tools after all administrative additions for FR-014 and SC-008 in `tests/tools/registry.test.ts` | Verify: no repair or retention command appears as an MCP tool and all existing six names remain.

Outcome-only targets are retained for later authorized operations: SC-004 validates the known 44 reflection gaps against the operator database, SC-006 requires a 24-hour non-owner observation window, and SC-010 requires a production retention preview. They do not authorize live mutation and do not create repository implementation tasks.

## Parallel execution

- None: The Store transaction foundation gates repair and retention, while CLI dispatch, HTTP routing, operation catalog, OpenAPI, and shared tests are overlapping mutable surfaces that require one writer and serialized contract updates.

## Final verification

- [x] T031 Audit the completed implementation and disposable fixtures for FR-015 in `openspec/changes/immediate-memory-storage-safety/plan.md` | Verify: no code, test, or executed command targets the live database, performs VACUUM, or deletes any non-trace durable domain.
- [x] T032 Run the mandatory behavior-preserving simplify pass over the completed source change in `src/store/index.ts` | Verify: duplication and accidental complexity are reduced where safe and all focused behavior remains unchanged.
- [x] T033 Run focused migration, writer, repair, sync, trace, config, CLI, HTTP, and registry suites for SC-001, SC-002, SC-003, SC-005, SC-007, SC-008, SC-009 in `package.json` | Verify: every named focused suite passes and exact command evidence is captured without claiming unrun checks.
- [x] T034 Run the required build and full Vitest gates, then hand evidence to a fresh Oracle for independent verification in `openspec/changes/immediate-memory-storage-safety/verify-report.md` | Verify: build and full tests pass, Oracle returns PASS with no unresolved contract defect, or failures are recorded for convergence before closeout.
- [x] T035 [US1] Repair the partial FR-002/SC-002 verification finding by preserving historical placeholder session identity during atomic local session persistence in `src/store/index.ts` | Verify: the pre-fix identity regression fails with project derived-project, then passes with project unknown; ordinary enrichment, inbound non-journaling, and atomic rollback tests remain green.
- [x] T036 [US2] Converge V-HTTP-001 by rejecting every repair and retention HTTP scope that contains both selector keys or a false all selector in `src/http-routes.ts` | Verify: new preview/apply contract tests fail before the fix, then pass with HTTP 400 and zero Store writes for invalid selector combinations.
- [x] T037 [US2] Resolve W-CLI-001 by rejecting retention-only effective-now input for repair-sync-journal in `src/cli.ts` | Verify: a new CLI grammar test fails before the fix, then passes with a non-zero validation result and zero Store invocation.
- [x] T038 Normalize the convergence task grammar for V-SDD-001 in `openspec/changes/immediate-memory-storage-safety/tasks.md` | Verify: the Full SDD ready validator passes with no task-format errors.
