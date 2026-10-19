# Tasks: Stabilize Import Recall Ranking

## Authoring contract

Task IDs are sequential, test-first work precedes implementation, every mutable surface has one root writer, and every verification claim requires observed evidence.

## MVP scope

US1 is the MVP: revision 9 provides durable monotonic import cohorts, the new default strategy has a pure corpus-independent scorer, and public MemoryService recall proves that 17 complete pre-existing Top-K lists remain identical after at least 1,000 matching imported memories are added.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016 -> T017 -> T018 -> T019 -> T020 -> T021 -> T022 -> T023 -> T024 -> T025`; schema/migration and writer/verifier cohort authority precede the strategy and public retrieval slices that consume it, and US3 consumes the integrated behavior before final verification.

## Story US1

- [x] T001 [US1] Add failing pure scorer cases for normalization, Unicode, phrase bonus, fixed field weights, saturated term frequency, length normalization, deterministic bounds, and corpus independence covering FR-001/SC-001 in `tests/memory-core/retrieval.test.ts` | Verify: the focused test fails because no stable scorer or strategy exists.
- [x] T002 [US1] Implement the pure fixed-field corpus-independent lexical scorer with closed constants and finite output covering FR-001/SC-001 in `src/memory-core/retrieval/stable-lexical-rank.ts` | Verify: every T001 scorer case passes and identical query/document input always yields the same score without corpus state.
- [x] T003 [US1] Add failing revision-8 migration and clean-schema cases for one-to-one positive gap-free cohorts, equal/backward timestamps, backup preservation, idempotent reopen, and immutable cohort rows covering FR-004/SC-003 in `tests/memory-core/schema-migration.test.ts` | Verify: revision 8 and clean schema lack the required durable monotonic cohort authority.
- [x] T004 [US1] Define revision-9 clean-schema import cohorts, one-to-one/positive/unique guards, and immutability triggers covering FR-004/SC-003 in `src/memory-core/sqlite/schema.ts` | Verify: a clean current database contains the guarded cohort table without changing memory/FTS or the six-tool surface.
- [x] T005 [US1] Implement verified revision-8-to-9 deterministic backfill, backup preservation, current revision wiring, and idempotent reopen covering FR-004/SC-003 in `src/memory-core/sqlite/migrations.ts` | Verify: migrated databases sequence existing imports by created-at/ID, preserve authoritative/FTS rows and a verified pre-revision backup, and reopen without delta.
- [x] T006 [US1] Add failing importer cases for transactional max-plus-one allocation under equal/backward timestamps, replay without allocation, missing/gapped/duplicate cohort corruption, linked-row fabrication, and earliest memory cohort covering FR-003/FR-004/SC-003 in `tests/memory-core/importer.test.ts` | Verify: valid allocation behavior is absent and every explicitly corrupted candidate is rejected.
- [x] T007 [US1] Allocate one strictly increasing cohort sequence inside each new committed import transaction and reuse it on replay covering FR-003/FR-004/SC-003 in `src/memory-core/import/writer.ts` | Verify: equal/backward timestamps produce sequence one then two, replay retains the original sequence, and failed transactions consume no durable cohort.
- [x] T008 [US1] Strengthen independent candidate verification for complete gap-free cohort coverage and derivable earliest imported-memory membership covering FR-003/FR-004/SC-003 in `src/memory-core/import/verify.ts` | Verify: T006 corruptions fail closed, valid mapped/isolated/linked histories pass, and collective memory/FTS equality remains exact.
- [x] T009 [US1] Add a failing public recall regression with 17 protected memories, at least 1,000 matching imported rows, 17 fixed probes, exact Top-K/inversion comparison, and exact stable strategy/config/plan identity assertions covering FR-001/FR-002/FR-005/SC-001/SC-002 in `tests/memory-core/retrieval.test.ts` | Verify: the current BM25 default reproduces drift and lacks the declared stable identity against valid revision-9 cohort data.
- [x] T010 [US1] Register strict-selected-any-cap5-stable-v1, its closed scorer/cohort configuration, stable query plan, and new internal default while preserving archived strategy identities covering FR-001/FR-005/SC-001 in `src/memory-core/sqlite/fts.ts` | Verify: T009 sees the exact stable strategy/config/plan hashes while every frozen strategy retains its prior configuration identity.
- [x] T011 [US1] Wire fixed scoring plus numeric oldest-first cohort fusion into normal recall covering FR-001/FR-002/FR-005/SC-001/SC-002 in `src/memory-core/service.ts` | Verify: all 17 pre-existing lists are identical before/after corpus extension, exact ID/topic precedence remains first, and repeated calls are byte-equivalent.

## Story US2

- [x] T012 [US2] Add failing public recall/get cases for imported heads, superseded history, mapped/isolated projects, exact-linked rows, two cohorts, exact ID/topic access, capacity-dependent distinctive text access, and intentional full-capacity lexical starvation covering FR-002/FR-003/SC-002/SC-003 in `tests/memory-core/retrieval.test.ts` | Verify: tests expose any changed older Top-K, duplicate result, broken lineage, false unconditional text-access claim, or failed exact access.
- [x] T013 [US2] Add failing deterministic assertions for bounded cohort stages, work counts, query shape, limits, and zero calls covering FR-005/SC-004/SC-005 in `tests/memory-core/retrieval.test.ts` | Verify: tests fail until multi-cohort traversal reports aggregate diagnostics truthfully without wall-clock assertions.

## Story US3

- [x] T014 [US3] Complete indexed numeric cohort derivation and per-cohort strict/relaxed fusion without row-wise queries or public payload changes covering FR-002/FR-003/FR-005/SC-002/SC-003/SC-004/SC-005 in `src/memory-core/service.ts` | Verify: earlier cohorts retain Top-K, later cohorts fill only unused positions, noisy full-capacity queries exclude later lexical rows, diagnostics reconcile every visited cohort, and existing query-shape cases pass.
- [x] T015 [US3] Add failing report-validation tests for paired control/candidate identity, fixed warmup/sample counts, complete timing samples, p95 recomputation, stability counts, diagnostics, create-only output, and zero calls covering SC-004/SC-005 in `tests/benchmarks/import-ranking-report.test.ts` | Verify: tests fail because the dedicated benchmark report contract does not exist.
- [x] T016 [US3] Implement the deterministic synthetic corpus/query manifest and paired warmup/measured benchmark runner covering SC-005 in `benchmarks/import-ranking/run.mjs` | Verify: control and candidate use identical 17-probe inputs, fixed 10 warmups and 100 measured samples per lane, and emit complete raw samples plus aggregate evidence.
- [x] T017 [US3] Implement semantic report recomputation and the candidate-p95-at-most-2x-control gate covering SC-005 in `benchmarks/import-ranking/report.mjs` | Verify: valid reports pass and tampered counts, hashes, samples, percentiles, stability results, diagnostics, or call counters fail.
- [x] T018 [US3] Close the create-only benchmark envelope with a strict versioned JSON schema covering SC-005 in `benchmarks/import-ranking/report.schema.json` | Verify: missing, extra, or malformed report fields are rejected and schema validation agrees with semantic validation.
- [x] T019 [US3] Register the named offline create-only benchmark command without adding it to networked preparation or real-home workflows covering SC-004/SC-005 in `package.json` | Verify: benchmark:import-ranking writes only its explicit fresh output, validates it, and makes zero model/network calls.
- [x] T020 [US3] Document stable strategy identity, revision-9 numeric cohort precedence, protected-capacity boundary, and separate rehearsal/cutover authorization covering FR-001/FR-002/FR-003/FR-004/FR-005/SC-004 in `docs/agent/persistence-retrieval.md` | Verify: documentation guarantees exact ID/topic access, conditions textual access on capacity, and does not claim rehearsal or cutover success.
- [x] T021 [US3] Document the focused stable-ranking tests and named offline benchmark command with fixed warmup/sample/report rules covering FR-005/SC-004/SC-005 in `docs/agent/testing.md` | Verify: guidance names the new runtime default and executable benchmark lane without changing immutable historical benchmark evidence.
- [x] T022 [US3] Run focused retrieval, importer, import CLI, schema, benchmark-report, and diagnostic suites covering all FRs and SC-001/SC-002/SC-003/SC-004/SC-005 in `vitest.unit.config.ts` | Verify: every focused test passes with exact strategy/schema/report identities and no unrelated fixture rewrite.
- [x] T023 [US3] Apply the mandatory simplify review across the completed scorer, schema, import, retrieval, diagnostic, and benchmark diff, limiting any behavioral cleanup to the ranking service boundary covering all FRs and SC-001/SC-003/SC-005 in `src/memory-core/service.ts` | Verify: implementation is minimal and readable, followed by green focused and benchmark reruns.

## Parallel execution

- None: scorer, schema migration, import allocation/verification, strategy registry, public retrieval, diagnostics, benchmark, and documentation form one ordered contract with downstream dependencies; one root writer avoids conflicting retrieval/import surfaces and stale artifact evidence.

## Final verification

- [x] T024 Run build, full Vitest, integration verification/smoke, import-ranking benchmark, benchmark fixture, prepublish verification, exact six-tool audit, status/diff review, and whitespace hygiene covering all FRs and SC-001/SC-002/SC-003/SC-004/SC-005 in `package.json` | Verify: every repository gate and validated p95 report pass with no unrelated, dependency, live-data, or secret material in the diff.
- [x] T025 Obtain fresh read-only Oracle verification and persist requirement-by-requirement evidence while retaining SC-006 as an authorized operational target covering all FRs and SC-001/SC-002/SC-003/SC-004/SC-005 in `openspec/changes/stabilize-import-recall-ranking/verify-report.md` | Verify: Oracle returns PASS with no unresolved repository blocker and distinguishes certification from the unexecuted isolated rehearsal and real cutover.

SC-006 remains an outcome target: after repository PASS, a fresh isolated-copy rehearsal requires separate user authorization and must preserve all 17 exact Top-K lists, sampled imported bugfix recall, import integrity/replay, and byte-identical originals. It does not authorize production cutover.
