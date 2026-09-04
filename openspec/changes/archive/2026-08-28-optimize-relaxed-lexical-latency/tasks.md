# Tasks: Optimize Relaxed Lexical Latency

## Authoring contract

Task identifiers are unique and sequential. Every behavior task is test-first, every path is repository-relative, and outcome-only SC-005/SC-006 remain final verification targets rather than artificial implementation work.

## MVP scope

US1 is the first independently testable slice: an opt-in internal observer attributes exact/strict/relaxed/post-query work, reconciles with total retrieval, exposes no private content, and leaves public recall deeply equal when disabled or enabled.

## Dependencies

T001 -> T002 -> T003 -> T004; T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013; T013 -> T014 -> T015 -> T016 -> T017 -> T018 -> T019 -> T020 -> T021 -> T022 -> T023. The schema, service, and report contracts are intentionally sequential because they share configuration hashes and evidence semantics.

## Story US1

- [x] T001 [US1] Add failing observer on/off equality, stage ordering, skipped-stage, reconciliation, monotonic timing, and privacy tests covering FR-005/SC-001 in `tests/memory-core/retrieval.test.ts` | Verify: the new assertions fail against the current service for the missing diagnostic contract and do not rely on wall-clock thresholds
- [x] T002 [US1] Implement the typed opt-in observer and exact/strict/relaxed/post-query work accounting for FR-005/SC-001 in `src/memory-core/service.ts` | Verify: T001 passes and enabled versus disabled recall responses are deeply equal
- [x] T003 [US1] Add failing structural schema tests for missing fields, negative values, unknown stages, forbidden text-bearing properties, and invalid reason/execution combinations covering FR-004/SC-004 in `tests/benchmarks/lexical-comparison-report.test.ts` | Verify: each structurally invalid diagnostic fixture is rejected while one structurally complete fixture reaches semantic validation
- [x] T004 [US1] Define the closed privacy-safe diagnostic JSON structure and numeric bounds covering FR-004/FR-005/SC-001/SC-004 in `benchmarks/lexical-comparison-report.schema.json` | Verify: T003 structural cases pass and the schema cannot represent query, title, content, topic, source-ref, evidence text, or raw SQL properties

## Story US2

- [x] T005 [US2] Add failing strategy-cap and hash tests for control compatibility, candidate Top-10 prefixes, exact precedence, overlaps, small caller limits, and adversarial inputs covering FR-002/FR-003/SC-002/SC-003 in `tests/memory-core/retrieval.test.ts` | Verify: current uncapped candidate behavior fails only the new bounded-work expectations and frozen control assertions pass
- [x] T006 [US2] Add the configuration-hashed maxLexicalResults plan field with a cap of ten only for any-prefix-v1 covering FR-002/FR-003/SC-002/SC-003 in `src/memory-core/sqlite/fts.ts` | Verify: T005 query-plan/hash/cap assertions pass and all-prefix-v1 query expressions remain byte-compatible
- [x] T007 [US2] Add failing fresh-install and revision-2/revision-3/revision-4 migration tests for shared prefix indexes, sequential version stamps, row preservation, trigger maintenance, Unicode search, repeat open, and rollback covering FR-002/SC-003 in `tests/memory-core/schema-migration.test.ts` | Verify: the current revision-4 schema fails the new prefix-index/revision expectations and no earlier migration can stamp revision 5 before applying 4→5
- [x] T008 [US2] Define the fresh-install revision-5 memory_fts projection with shared prefix lengths 2 through 12 covering FR-002/SC-003 in `src/memory-core/sqlite/schema.ts` | Verify: the fresh-install portion of T007 passes and FTS maintenance triggers keep new/deleted memories synchronized
- [x] T009 [US2] Implement explicit sequential 2→3→4→5, 3→4→5, and transactional 4→5 migration dispatch covering FR-002/SC-003 in `src/memory-core/sqlite/migrations.ts` | Verify: all T007 paths pass with exact version history, foreign-key integrity, equal authoritative counts, searchable migrated rows, and rollback to revision 4 on injected 4→5 failure
- [x] T010 [US2] Add failing ranking/hydration/snippet tests for narrow Top-K selection, one bounded batch per entity type, deterministic order, evidence totals, history/project scope, and snippet equivalence covering FR-003/SC-002/SC-003 in `tests/memory-core/retrieval.test.ts` | Verify: current N+1/full-row behavior fails work-counter assertions while expected public results are captured
- [x] T011 [US2] Implement bounded bulk memory/evidence hydration helpers without changing immutable row mapping covering FR-003/SC-002/SC-003 in `src/memory-core/sqlite/ledger.ts` | Verify: helper tests return complete grouped evidence for non-empty bounded ID sets and issue no per-memory query
- [x] T012 [US2] Rank narrow rows, apply the internal lexical cap before hydration, batch selected IDs, and restore deterministic exact/stage order covering FR-003/FR-005/SC-001/SC-002/SC-003 in `src/memory-core/service.ts` | Verify: T001, T005, and T010 pass with reconciled reduced ranked/hydrated work and unchanged control responses
- [x] T013 [US2] Short-circuit token location without changing retained snippets and complete edge-case coverage for FR-002/FR-003/SC-002/SC-003 in `src/memory-core/sqlite/fts.ts` | Verify: all retrieval tests pass for empty, Unicode, operator-like, repeated, overlong, exact-only, overlap, history, project, and limit-boundary cases

## Story US3

- [x] T014 [US3] Add failing runner tests for identical public budgets, one diagnostic observation per query, declared strategy cap, aggregate reconciliation, and zero external calls covering FR-001/FR-004/FR-007/SC-004 in `tests/benchmarks/longmemeval-runner.test.ts` | Verify: the current runner fails only the new comparison-v2 diagnostic evidence expectations
- [x] T015 [US3] Enable the internal observer in official ranking recall and emit per-query plus aggregate diagnostic evidence covering FR-001/FR-004/FR-005/FR-007/SC-001/SC-004 in `benchmarks/longmemeval/run.mjs` | Verify: T014 passes and all lanes retain candidate_k 20, delivery 4000, identical ordering/provenance, and literal zero call counters
- [x] T016 [US3] Add failing comparison-v2 semantic tests for inconsistent/differently configured/behavior-changing diagnostics, archived hash/deltas, lane identity, footprint ceiling, fail-closed promotion, and non-overwrite covering FR-001/FR-004/FR-006/SC-004 in `tests/benchmarks/lexical-comparison-report.test.ts` | Verify: every reconciliation/configuration/persisted-trust mutation fails for the intended reason and only one fully eligible candidate can be selected
- [x] T017 [US3] Implement comparison-v2 semantic reconciliation, creation/validation, promotion recomputation, and immutable archived-reference evidence covering FR-001/FR-004/FR-006/SC-004 in `benchmarks/lexical-comparison-report.mjs` | Verify: T003/T004 structural tests and T016 semantic tests pass, and archived quality deltas never replace same-run promotion inputs
- [x] T018 [US3] Update the sequential three-lane writer with a programmatic outputPath option and the new atomic no-clobber CLI default covering FR-001/FR-004/FR-006/FR-007/SC-004 in `benchmarks/longmemeval/compare.mjs` | Verify: comparison tests prove isolated databases, shared budgets/configuration, deterministic lane order, cleanup, option override, default latency-report path, and create-only publication
- [x] T019 [US3] Run the mandatory behavior-preserving simplification pass over the implemented retrieval hot path covering FR-003/FR-005/SC-001/SC-003 in `src/memory-core/service.ts` | Verify: focused tests and build pass before and after simplification with no public behavior delta
- [x] T020 [US3] Execute and validate the authorized official 470-question comparison as the SC-005/SC-006 outcome evidence covering FR-001/FR-004/FR-006/FR-007 in `benchmarks/results/longmemeval-s-lexical-latency-report.json` | Verify: all three lanes share corpus/order/public budgets/provenance, have zero errors/calls, equal SQLite bytes, acceptable footprint, and a recomputed fail-closed decision
- [x] T021 [US3] Change the runtime default only if T020 selects one unique eligible candidate covering FR-006/SC-006 in `src/memory-core/sqlite/fts.ts` | Verify: eligible evidence makes any-prefix-v1 the tested default; otherwise the file remains all-prefix-v1 and verification records the unresolved blocker

## Parallel execution

- None: every mutable step consumes the preceding strategy hash, schema revision, service work counters, or report contract; parallel writers would risk evidence drift and violate the one-writer surface rule.

## Final verification

- [x] T022 Run focused tests, build, required broader suites, integration/package checks, exact-six-tool assertions, and diff/status review covering FR-001 through FR-007 and SC-001 through SC-004 in `docs/agent/testing.md` | Verify: every required command passes or the exact failure and unexecuted checks enter convergence with no unrelated/generated/secret material
- [x] T023 Persist independent Oracle findings and final PASS or bounded convergence blockers for SC-005/SC-006 in `openspec/changes/optimize-relaxed-lexical-latency/verify-report.md` | Verify: a fresh read-only Oracle confirms requirement coverage, official evidence, migration safety, checks, and diff integrity before archive

## Convergence round 1

- [x] T024 [US3] Add adversarial reconciliation mutations for F-002 covering FR-004/FR-005/SC-004 in `tests/benchmarks/lexical-comparison-report.test.ts` | Verify: changing ranked FTS rows, hydrated rows, or hydration statements while recomputing aggregates is rejected against unchanged stage evidence
- [x] T025 [US3] Enforce F-002 stage-to-work and post-query hydration reconciliation covering FR-004/FR-005/SC-004 in `benchmarks/lexical-comparison-report.mjs` | Verify: T024 passes without rejecting the immutable round-1 official artifact
- [x] T026 [US3] Add archived baseline/hash tamper tests for F-003 covering FR-004/FR-006/SC-004 in `tests/benchmarks/lexical-comparison-report.test.ts` | Verify: a changed footprint baseline and recomputed promotion cannot validate under the unchanged archived SHA-256
- [x] T027 [US3] Bind archived quality/footprint values to a committed SHA-256 manifest and verify loaded report bytes covering FR-004/FR-006/SC-004 in `benchmarks/lexical-comparison-baseline.json` | Verify: comparison creation and validation accept only the exact archived report identity and derived baseline values
- [x] T028 [US2] Add parameterized both-candidate coverage for W-001 across project isolation, history, query shapes, overlap, and limits covering FR-002/FR-003/SC-002 in `tests/memory-core/retrieval.test.ts` | Verify: all candidate executions remain deterministic, scoped, safe, and bounded
- [x] T029 [US2] Add a failing configuration-hash/work test for the F-001 convergence candidate using four relaxed terms and five lexical results covering FR-002/FR-003/SC-003 in `tests/memory-core/retrieval.test.ts` | Verify: the round-1 12-term/10-result candidate fails the new declared bounds while control and adaptive plans stay unchanged
- [x] T030 [US2] Implement the F-001 deterministic four-term/five-result any-prefix candidate covering FR-002/FR-003/SC-003 in `src/memory-core/sqlite/fts.ts` | Verify: T029 passes, diagnostics report the new cap, and query selection remains independent of gold/answers/corpus labels
- [x] T031 Run focused, build, full, integration, fixture, smoke, packaging, and diff checks for F-001/F-002/F-003/W-001 in `docs/agent/testing.md` | Verify: all checks pass with exact-six tools, zero new dependencies, and no unrelated or generated material
- [x] T032 [US3] Publish and validate the non-overwriting convergence comparison for SC-005/SC-006 in `benchmarks/results/longmemeval-s-lexical-latency-report-r2.json` | Verify: one unique candidate satisfies every unchanged gate or the exact remaining blocker returns to convergence
- [x] T033 [US3] Promote the runtime default only from the validated T032 decision covering FR-006/SC-006 in `src/memory-core/sqlite/fts.ts` | Verify: default changes only for one unique eligible candidate and otherwise remains all-prefix-v1
- [x] T034 Persist a fresh independent Oracle verdict after convergence covering FR-001 through FR-007 and SC-001 through SC-006 in `openspec/changes/optimize-relaxed-lexical-latency/verify-report.md` | Verify: PASS permits archive; FAIL supplies stable findings for another convergence round

## Convergence round 2

- [x] T035 [US3] Attribute the valid round-2 latency miss without changing its artifact covering FR-001/FR-004/SC-006 in `benchmarks/results/longmemeval-s-lexical-latency-report-r2.json` | Verify: report SHA-256 is recorded and diagnostics identify the remaining relaxed/post-query work under unchanged gates
- [x] T036 [US2] Add a failing configuration/work test for a three-term/two-row convergence candidate covering FR-002/FR-003/SC-003 in `tests/memory-core/retrieval.test.ts` | Verify: round-2 four-term/five-row behavior fails the new bound while control/adaptive stay unchanged
- [x] T037 [US2] Implement the configuration-hashed three-term/two-row any-prefix candidate covering FR-002/FR-003/SC-003 in `src/memory-core/sqlite/fts.ts` | Verify: T036 passes and prior round artifacts still validate through their exact historical hashes
- [x] T038 Repeat focused, build, full, integration, fixture, smoke, prepublish, and diff checks covering FR-001 through FR-007 in `docs/agent/testing.md` | Verify: every required check passes before another official measurement
- [x] T039 [US3] Publish and validate round 3 create-only covering SC-005/SC-006 in `benchmarks/results/longmemeval-s-lexical-latency-report-r3.json` | Verify: one unique candidate satisfies every frozen gate or its exact blocker returns to convergence
- [x] T040 [US3] Apply the fail-closed round-3 default decision covering FR-006/SC-006 in `src/memory-core/sqlite/fts.ts` | Verify: only a validated unique winner changes the default

## Convergence round 3

- [x] T041 [US3] Attribute the valid round-3 miss to relaxed-term selectivity covering FR-001/FR-004/SC-006 in `benchmarks/results/longmemeval-s-lexical-latency-report-r3.json` | Verify: reduced hydration and increased relaxed p95 are recorded under immutable SHA-256
- [x] T042 [US2] Add a failing deterministic specificity-selection test covering FR-002/FR-003/SC-003 in `tests/memory-core/retrieval.test.ts` | Verify: any-prefix selects the three longest bounded terms in original order while control/adaptive expressions stay unchanged
- [x] T043 [US2] Implement version-hashed longest-term selection with the existing two-row cap covering FR-002/FR-003/SC-003 in `src/memory-core/sqlite/fts.ts` | Verify: selection is Unicode-safe, answer/corpus independent, bounded, and T042 passes
- [x] T044 Run the focused and complete verification envelope before final measurement covering FR-001 through FR-007 in `docs/agent/testing.md` | Verify: all required checks pass and rounds 1–3 retain validation
- [x] T045 [US3] Publish and validate round 4 create-only covering SC-005/SC-006 in `benchmarks/results/longmemeval-s-lexical-latency-report-r4.json` | Verify: one unique candidate satisfies every frozen gate or its exact blocker returns to convergence
- [x] T046 [US3] Apply the validated round-4 default decision and repeat affected checks covering FR-006/SC-006 in `src/memory-core/sqlite/fts.ts` | Verify: only a unique eligible candidate becomes default

## Convergence round 4

- [x] T047 [US3] Add the four Oracle adversarial validator mutations covering FR-004/FR-005/SC-004 in `tests/benchmarks/lexical-comparison-report.test.ts` | Verify: impossible planned stages, invented exact rows, invented post/hydration rows, and cap-violating reconciled work fail before implementation
- [x] T048 [US3] Enforce strategy stage plans, exact/lexical/post reconciliation, result bounds, and historical cap bounds covering FR-004/FR-005/SC-004 in `benchmarks/lexical-comparison-report.mjs` | Verify: T047 passes and all four immutable latency reports remain valid
- [x] T049 [US2] Add both-candidate empty-normalized-input coverage and correct the comparison default path covering FR-002/SC-002 in `tests/memory-core/retrieval.test.ts` | Verify: both candidates return deterministic empty plans/results and routed documentation names the implemented no-clobber default
- [x] T050 Repeat focused and complete checks after final validator convergence covering FR-001 through FR-007 in `docs/agent/testing.md` | Verify: every required check and Full ready gate passes before T034 Oracle verification

## Convergence round 5

- [x] T051 [US3] Add compensated benchmark-profile adversarial mutations covering FR-004/FR-005/SC-004 in `tests/benchmarks/lexical-comparison-report.test.ts` | Verify: shifted exact/lexical rows, invented in-cap post/hydration work, and invented evidence-link work fail before implementation
- [x] T052 [US3] Bind diagnostic evidence to LongMemEval-S benchmark-profile invariants covering FR-004/FR-005/SC-004 in `benchmarks/lexical-comparison-report.mjs` | Verify: T051 passes and all four immutable reports remain valid
- [x] T053 Bind legacy importer target schema reporting to the authoritative SQLite revision in `src/memory-core/import/legacy-v1.ts` with nearest importer coverage | Verify: the report and created database both equal `SQLITE_SCHEMA_REVISION`
- [x] T054 Repeat focused and complete checks after round-5 convergence covering FR-001 through FR-007 in `docs/agent/testing.md` | Verify: every required check and Full ready gate passes before another Oracle verification
- [x] T055 Persist a fresh independent Oracle verdict after round-5 convergence in `verify-report.md` | Verify: PASS permits archive; FAIL supplies stable findings for another convergence round
