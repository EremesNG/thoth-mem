# Tasks: Establish Ordered Session Summaries

## Authoring contract

Every task is testable, ordered, and owned by one writer. Test tasks precede the behavior they constrain. Outcome SC-005 remains a final evidence gate and does not create product behavior by itself.

## MVP scope

US1 plus US4 form the first independently testable slice: a revision-3 database upgrades with a verified backup, and every new verified session evidence write receives one replay-stable ordered event with closed trust metadata. Completion evidence is focused migration/service PASS with no summary tables populated by inference.

## Dependencies

T001 -> T002; T003 -> T004 -> T005 -> T006; T002 + T005 -> T007 -> T008 -> T009; T009 -> T010 -> T011 -> T012; T012 -> T013 -> T014; T014 -> T015 -> T016 -> T017; T017 -> T018 -> T019 -> T020 -> T021 -> T022; T022 -> T023 -> T024; T024 -> T025 -> T026 -> T027 -> T028; T028 -> T029 -> T030 -> T031 -> T032; T032 -> T033 -> T034 -> T035 -> T036.

## Shared contract foundation

- [x] T001 Add failing closed-taxonomy, record-union, lifecycle-summary, and protocol-discriminator tests covering FR-001, FR-003, FR-006, FR-007, FR-008, and SC-004 in `tests/memory-core/contracts.test.ts` | Verify: RED confirmed by `pnpm exec vitest run tests/memory-core/contracts.test.ts --config vitest.unit.config.ts` (protocol remained 2 and summary taxonomy was absent).
- [x] T002 Implement event/summary taxonomies, inputs, records, context unions, lifecycle results, limits, and the coordinated protocol revision for FR-001, FR-003, FR-006, FR-007, and FR-008 in `src/memory-core/contracts.ts` | Verify: contract test passes (4/4) and `pnpm run build` passes.

## Story US4 - Upgrade the current ledger without inventing history

- [x] T003 [US4] Add failing clean, in-memory, v3-upgrade, verified-backup, injected-failure, no-backfill, FTS, foreign-key, restore, and idempotent-reopen tests for FR-005 and SC-001 in `tests/memory-core/schema-migration.test.ts` | Verify: RED showed revision 3 and missing fixture SQL; GREEN passes clean/in-memory, backup, no-backfill, rollback, FTS, FK, restore, and reopen cases (3/3).
- [x] T004 [US4] Define revision-4 tables, checks, indexes, immutable-content triggers, summary references, and clean-schema SQL for FR-001, FR-003, FR-004, FR-005, SC-001, and SC-002 in `src/memory-core/sqlite/schema.ts` | Verify: direct-SQL test rejects invalid taxonomy, duplicate sequence/current summary, mutation, and foreign support; schema suite passes 4/4.
- [x] T005 [US4] Implement verified pre-upgrade SQLite backup and transactional v3-to-v4 no-backfill migration for FR-005 and SC-001 in `src/memory-core/sqlite/migrations.ts` | Verify: schema/taxonomy migration suites pass 7/7 and build passes, including backup integrity, rollback, preservation, v2→v4 convergence, and reopen.
- [x] T006 [US4] Align importer target revision/report truth without mapping legacy prompts, observations, or handoffs into new events or summaries for FR-005 and SC-001 in `src/memory-core/import/legacy-v1.ts` | Verify: importer suite passes 3/3 with target revision 4, unchanged dispositions, and zero session event/summary projections.

## Story US1 - Record authoritative session events in deterministic order

- [x] T007 [US1] Add failing tests for atomic sequence allocation, duplicate-first replay, concurrent writes, project-only evidence, privacy filtering before hashes, excluded capture, and closed trust classes covering FR-001, FR-003, SC-001 in `tests/memory-core/service.test.ts` | Verify: RED confirmed four failures: absent returned events, empty ledger, and no sequence allocation.
- [x] T008 [US1] Implement immutable event row mapping and transaction-local next-sequence allocation after receipt lookup for FR-001, FR-003, and SC-001 in `src/memory-core/sqlite/ledger.ts` | Verify: service/importer suites pass 12/12; two connections allocate 1,2,3 and duplicate/rollback consume no sequence.
- [x] T009 [US1] Integrate workflow-owned actor, authority, retention, and privacy defaults into save/retract/lifecycle evidence writes for FR-001, FR-003, and SC-001 in `src/memory-core/service.ts` | Verify: service suite passes session/project, privacy-before-hash, forged metadata, lifecycle allowlist, and legacy exclusion; build passes.

## Story US2 - Preserve a source-supported versioned session summary

- [x] T010 [US2] Add failing canonicalization, privacy, size, same-scope support, range, version, late-arrival, rebuild, transaction rollback, and zero-model/network tests for FR-004, FR-007, SC-002 in `tests/memory-core/session-summaries.test.ts` | Verify: RED was missing module; GREEN suite passes 3/3 including unchanged projection counts after invalid submissions.
- [x] T011 [US2] Implement deterministic summary canonicalization, stable IDs, support validation, version transitions, current selection, and rebuild from submission evidence for FR-004 and SC-002 in `src/memory-core/session-summaries.ts` | Verify: current/history and byte-stable rebuild pass with no model/network dependency; FK check is clean.
- [x] T012 [US2] Make checkpoint/final summary submission atomic with evidence, session state, supersession, receipt, and result while removing automatic checkpoint handoff promotion for FR-002, FR-007, SC-002, and SC-003 in `src/memory-core/service.ts` | Verify: duplicate returns original summary ID, coverage/payload drift fail closed, and checkpoint summaries create zero memories.
- [x] T013 [US2] Add failing exact-six-tool, closed nested schema, submit/get/summaries/history, scope, budget, deferred-support, and zero-side-effect tests for FR-006, FR-007, FR-008, FR-009, and SC-004 in `tests/tools/mcp.test.ts` | Verify: RED exposed missing summary schema and identity-pair validation; GREEN MCP suite passes 8/8.
- [x] T014 [US2] Extend mem_session, mem_context, mem_project, and mem_get schemas/handlers with the discriminated summary contract for FR-006, FR-007, FR-008, FR-009, and SC-004 in `src/tools/index.ts` | Verify: exact six names remain, strict nested input rejects unknown fields without persistence, summaries/get defer support content, and build passes.

## Story US3 - Resume from the newest truthful session projection

- [x] T015 [US3] Add failing summary-first precedence, session-scope, final/checkpoint tie-break, handoff fallback, claim-priority, Unicode cap, stable ID, withheld support, poisoning, and truthful selected-ID tests for FR-008, FR-011, FR-012, and SC-003 in `tests/memory-core/continuation.test.ts` | Verify: RED selected only handoff/identity; GREEN renderer suite passes 9/9.
- [x] T016 [US3] Generalize bounded continuation rendering to summary-or-memory items while preserving trust boundaries, complete IDs, actionable claim order, and separate selected ID categories for FR-008, FR-011, and SC-003 in `src/memory-core/continuation.ts` | Verify: summary claims are whole-or-omitted, next_action and IDs remain complete, poisoning is normalized, and all outputs remain at/below 1,000 code points.
- [x] T017 [US3] Implement verified-session summary selection before current memory plus no-session project-only behavior and legacy handoff fallback for FR-009, FR-012, and SC-003 in `src/memory-core/service.ts` | Verify: context/continuation/MCP suites pass 21/21; exact session final wins ties, foreign summary is excluded, project-only context never guesses, and legacy handoff remains fallback.
- [x] T018 [US3] Add failing root/degraded/replay/checkpoint/final/recover/post-compaction fixtures with structured summaries, no-generation fallback, and capability truth for FR-010, FR-011, FR-012, and SC-003 in `tests/integration/lifecycle.test.ts` | Verify: lifecycle suite passes 11/11; summary recovery and no-summary fallback are truthful and modelConsumed remains false.
- [x] T019 [US3] Extend the host-neutral lifecycle intent/result and shared execution boundary for optional externally supplied summaries and truthful selected IDs for FR-010, FR-011, and SC-003 in `src/integration/core/lifecycle.ts` | Verify: LifecycleRuntime passes the common LifecycleInput/Result v3 contract; no harness-specific type enters memory-core.
- [x] T020 [US3] Normalize the same optional summary envelope and root-authority checks across OpenCode, Codex, and Claude adapters for FR-010 and SC-003 in `src/integration/adapters/index.ts` | Verify: adapter suite passes 7/7 with identical three-host shape and delegated/degraded rejection.
- [x] T021 [US3] Update the OpenCode node lifecycle client to send/parse the coordinated summary and selected-record fields without generating semantics for FR-010, FR-011, and SC-003 in `src/integration/opencode/node-lifecycle-client.ts` | Verify: native OpenCode suite passes 15/15 including version-3 summary serialization/parsing and no-generation fallback.
- [x] T022 [US3] Update the canonical shared native hook runner envelope used by Codex and Claude without adding model or network behavior for FR-010, FR-011, and SC-003 in `integrations/shared/hook-runner.mjs` | Verify: public runner suite passes 8/8 for summary-present, summary-absent, bounded fallback, and host-shaped fixtures.
- [x] T023 [US3] Add failing packed inventory and three-host lifecycle contract assertions for the unchanged tool names and updated summary envelope covering FR-006, FR-010, SC-003, and SC-004 in `tests/packaging/first-product.test.ts` | Verify: first-product contract now pins six names, three harnesses, lifecycle protocol 3, and selected record fields while preserving the LongMemEval packaging addition.
- [x] T024 [US3] Align package inventory and canonical integration assets with the host-neutral summary contract for FR-006, FR-010, and SC-004 in `src/integration/package-inventory.ts` | Verify: integration package suites pass 13/13 and public runner suite passes 8/8; packed smoke remains final-gate work.

## Evaluation and durable documentation

- [x] T025 [US3] Add failing equal-budget fixture tests for ordered idempotency, supported claims, cross-scope rejection, version precedence, no auto-promotion, three-host recovery, useful-content ratio, and zero calls covering FR-013 and SC-003 in `tests/benchmarks/runner.test.ts` | Verify: corrected isolated control/candidate assertions pass; the historical 0.5846883242300996 failure remains recorded in `verify-report.md` and was not overwritten.
- [x] T026 [US3] Extend the committed offline benchmark runner with summary recovery measurements and baseline-relative gates for FR-013 and SC-003 in `benchmarks/run.mjs` | Verify: fixture execution is offline, deterministic, equal-budget, and reports zero unsupported claims, leakage, promoted handoffs, mixed candidate memories, model calls, and network calls.
- [x] T027 [US3] Extend strict report validation for summary fidelity, selected record types, no-promotion truth, and useful-content non-inferiority covering FR-013 and SC-003 in `benchmarks/report.mjs` | Verify: seven report contract tests pass; forged shape, support, scope, checkpoint, promotion, contamination, accounting, non-inferiority, and call values fail closed.
- [x] T028 [US3] Update the closed committed fixture report schema for the new summary outcome envelope covering FR-013 and SC-003 in `benchmarks/report.schema.json` | Verify: JSON parsing passes, summary is required, every property is required, and additional properties are rejected.
- [x] T029 Document ordered evidence, summary authority, rebuildability, memory separation, and staged observation/governance boundaries for FR-001, FR-002, FR-004, and FR-012 in `docs/agent/persistence-retrieval.md` | Verify: documentation distinguishes evidence, events, summaries, and promoted memory and keeps observations/governance staged.
- [x] T030 Document checkpoint/final summary submission, no-summary degradation, three-host recovery, support withholding, and harness capability ownership for FR-007, FR-010, and FR-011 in `docs/agent/native-lifecycle.md` | Verify: guidance matches structured external summaries, identity-only fallback, support withholding, and the packed smoke behavior.
- [x] T031 Document focused migration, summary, lifecycle, tool, benchmark, packed-smoke, and full verification commands for FR-005 and FR-013 in `docs/agent/testing.md` | Verify: documented commands exist and the offline isolated summary fixture remains distinct from external LongMemEval evidence.
- [x] T032 Update public product behavior and the six-tool workflow examples for ordered summaries, progressive expansion, and no automatic promotion covering FR-002, FR-006, FR-008, and FR-009 in `README.md` | Verify: the closed snake-case `mem_session` example uses `root_agent`, support IDs, coverage, exact six tools, and no unimplemented observation/governance claim.

## Parallel execution

- None: schema, contracts, lifecycle transaction, public envelopes, continuation rendering, native adapters, and benchmark evidence share one ordered contract and overlap mutable types/tests; a single writer avoids incompatible intermediate states and preserves the uncommitted LongMemEval baseline.

## Final verification

- [x] T033 Run focused unit/contract/integration/package/benchmark tests plus IDE diagnostics for every touched TypeScript file and record task evidence for FR-001 through FR-013 and SC-001 through SC-004 in `openspec/changes/establish-ordered-session-summaries/tasks.md` | Verify: focused lane passes 50/50; WebStorm diagnostics report zero errors across 26 touched TypeScript files.
- [x] T034 Run build, full test suite, integration verify, packed three-host smoke, offline benchmark fixture, prepublish verification, strict report validation, and diff hygiene while observing SC-005 in `openspec/changes/establish-ordered-session-summaries/tasks.md` | Verify: build PASS; full suite 194/194 PASS; integration verify PASS; packed smoke PASS; benchmark fixture PASS; prepublish PASS; diff check PASS; corrected SC-005 ratio is 0.4576092680358083 vs control 0.4362449799196787.
- [x] T035 Apply the mandatory simplify pass without behavior changes and rerun affected focused checks in `src/memory-core/service.ts` | Verify: review found no safe simplification that improved the explicit integrity flow; no behavior-changing cleanup was made and focused/full suites remained PASS.
- [x] T036 Delegate fresh independent Oracle verification and persist requirement/SC evidence only after its verdict in `openspec/changes/establish-ordered-session-summaries/verify-report.md` | Verify: fresh read-only Oracle `oracle_final_verification_round2` returned PASS with complete FR/buildable-SC evidence and observed PASS evidence for SC-005; the exact verdict and residual risks are persisted in `verify-report.md`.

## Convergence 2 — User-authorized corrective pivot

Authorization received after the SC-005 pause. This convergence repairs the integrity and measurement contracts identified by the fresh Oracle; it does not relax SC-005 or replace the recorded failed measurements.

T037 -> T038; T039 -> T040 -> T041; T042 -> T043; T038 + T041 + T043 -> T044 -> T045.

- [x] T037 [US1] Add the RED public-seam regression for the partial FR-003 / SC-001 finding in `tests/memory-core/service.test.ts` | Verify: RED reproduced cross-session receipt reuse; GREEN proves rejection, original replay stability, root-2 sequence 1, and root-1 sequence 2.
- [x] T038 [US1] Bind duplicate save receipts to canonical session identity for the partial FR-003 / SC-001 finding in `src/memory-core/service.ts` | Verify: session identity is resolved and compared inside the transaction before a duplicate receipt can return; MemoryService passes 10/10.
- [x] T039 [US3] Add RED forged/missing summary outcome cases for the partial FR-013 / SC-005 finding in `tests/benchmarks/report.test.ts` | Verify: RED accepted a missing summary field; GREEN contract suite passes 7/7.
- [x] T040 [US3] Enforce summary integrity, isolation, promotion, budget, zero-call, and non-inferiority invariants for the partial FR-013 / SC-005 finding in `benchmarks/report.mjs` | Verify: exact shape and coherent accounting are enforced; forged summary cases return actionable error categories.
- [x] T041 [US3] Close the committed summary outcome envelope for the partial FR-013 / SC-005 finding in `benchmarks/report.schema.json` | Verify: the summary object is closed, every field is required, checkpoint/host counts are fixed, and candidate memory contamination is forbidden.
- [x] T042 [US3] Add RED clean-control, equivalent-field, symmetric-accounting, non-empty-checkpoint, and three-host assertions for the contradicts FR-013 / SC-005 finding in `tests/benchmarks/runner.test.ts` | Verify: RED failed against the contaminated/incomplete report; GREEN passes the corrected runner contract.
- [x] T043 [US3] Rebuild the isolated equal-budget control and summary candidate experiment for the contradicts FR-013 / SC-005 finding in `benchmarks/run.mjs` | Verify: three isolated control/candidate pairs recover the same 869 useful code points; candidate uses 1,899 total vs control 1,992 and improves ratio to 0.4576092680358083 from 0.4362449799196787.
- [x] T044 [US3] Align packed lifecycle smoke with explicit summaries and truthful no-summary fallback for the contradicts FR-002 / FR-010 / SC-003 finding in `scripts/verify-packed-plugins.mjs` | Verify: RED reproduced obsolete OpenCode checkpoint expectation; GREEN packed smoke proves identity fallback without promotion plus supported Claude summary recovery without mixed memory.
- [x] T045 [US3] Complete the missing convergence evidence, mandatory simplify pass, fresh Oracle verification, and final verdict in `openspec/changes/establish-ordered-session-summaries/verify-report.md` | Verify: focused, build, full, integration, packed-smoke, benchmark, prepublish, diagnostics, and diff-hygiene gates pass; corrected SC-005 is observed; fresh independent Oracle returns PASS before closeout/archive.
