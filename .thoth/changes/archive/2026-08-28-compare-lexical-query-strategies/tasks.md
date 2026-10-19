# Tasks: Compare Lexical Query Strategies

## Authoring contract

Task identifiers are globally sequential. Each task names one literal mutable or verification surface, keeps behavior work test-first, and carries explicit FR/SC traceability.

## MVP scope

US1 is the MVP: the current all-prefix control plus deterministic any-prefix and all-then-any query plans are independently testable, syntax-safe, bounded, and executable through `MemoryService.recall()` without changing the six-tool surface.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016 -> T017 -> T018 -> T019 -> T020 -> T021 -> T022 -> T023`; the strategy and service contracts must stabilize before benchmark/report work, and the official result must exist before the conditional default decision.

## Story US1

- [x] T001 [US1] Add failing deterministic query-plan tests for the archived repeated-term control, candidate-only deduplication, any-prefix candidate, adaptive strict-then-relaxed plan, Unicode, quotes, operators, overlong input, single terms, and empty normalization covering FR-001, FR-002, FR-003, and SC-001 in `tests/memory-core/retrieval.test.ts` | Verify: focused tests failed in 3 query-plan cases because the strategy registry and distinct legacy/candidate token streams did not yet exist
- [x] T002 [US1] Implement the frozen lexical strategy registry, legacy-compatible control tokenizer, candidate-only deduplicated tokenizer, safe AND/OR expressions, plan hashes, and control-compatible wrapper covering FR-001, FR-002, and FR-003 in `src/memory-core/sqlite/fts.ts` | Verify: `pnpm exec vitest run tests/memory-core/retrieval.test.ts --config vitest.unit.config.ts` passed 6/6 with byte-compatible repeated-term control output and no raw FTS operator leakage
- [x] T003 [US1] Add failing service tests for explicit strategy selection, exact/strict/relaxed precedence, deterministic deduplication, limit enforcement, unchanged default behavior, and payload measurements covering FR-001, FR-008, FR-009, and SC-001 in `tests/memory-core/retrieval.test.ts` | Verify: the explicit relaxed-strategy assertion failed because recall still executed the single hard-coded control query
- [x] T004 [US1] Implement the internal strategy-aware lexical stage executor and single default constant while retaining exact lookup, snippet, budget, telemetry, project, and history semantics covering FR-008 and FR-009 in `src/memory-core/service.ts` | Verify: `pnpm exec vitest run tests/memory-core/retrieval.test.ts --config vitest.unit.config.ts` passed 8/8 with the default still set to all-prefix-v1

## Story US2

- [x] T005 [US2] Add failing exact-shape lane-report tests for strategy IDs/configuration hashes, per-question query-plan hashes, forbidden-label isolation, and unchanged quality/resource reconciliation covering FR-004, FR-005, FR-006, and SC-002 in `tests/benchmarks/retrieval-report.test.ts` | Verify: the strategy-aware valid fixture failed with `queries` before the executable contract was extended
- [x] T006 [US2] Extend the executable lane-report validator for the strategy-aware candidate and per-query plan-hash contract covering FR-005 and FR-006 in `benchmarks/retrieval-report.mjs` | Verify: `pnpm exec vitest run tests/benchmarks/retrieval-report.test.ts --config vitest.unit.config.ts` passed 7/7 without weakening malformed-report cases
- [x] T007 [US2] Extend the machine-readable lane-report schema to match the executable strategy-aware contract covering FR-005, FR-006, and SC-002 in `benchmarks/retrieval-report.schema.json` | Verify: the focused report suite passed 7/7 after the schema required an exact lexical strategy object and per-query plan hash
- [x] T008 [US2] Add failing miniature-runner tests for allowed strategy IDs, per-question plan hashes, identical corpus/order/budgets/mappings, cleanup, and non-overwriting outputs covering FR-003, FR-004, FR-005, FR-006, and SC-002 in `tests/benchmarks/longmemeval-runner.test.ts` | Verify: two runner cases failed because the hard-coded report lacked strategy and query-plan evidence
- [x] T009 [US2] Parameterize the LongMemEval lane runner through the built MemoryService while preserving the archived CLI default and complete lane-report validation covering FR-003, FR-004, FR-005, and FR-006 in `benchmarks/longmemeval/run.mjs` | Verify: build passed and the focused runner suite passed 3/3; all strategies shared identities/mappings and had distinct configuration/plan hashes
- [x] T010 [US2] Add failing strict comparison-envelope tests for exact lane inventory, embedded lane validity, shared corpus/order/budget/provenance, incomplete lanes, and schema parity covering FR-004, FR-005, FR-006, SC-002, and SC-003 in `tests/benchmarks/lexical-comparison-report.test.ts` | Verify: the new focused suite initially failed because the comparison contract module did not exist
- [x] T011 [US2] Implement the pure comparison validator with shared-identity and cross-lane reconciliation covering FR-004, FR-005, FR-006, and SC-002 in `benchmarks/lexical-comparison-report.mjs` | Verify: the comparison suite passed 3/3 while unequal corpus, query order, budgets, mappings, labels, or lane inventory failed closed
- [x] T012 [US2] Add the machine-readable comparison-envelope schema covering FR-004, FR-005, FR-006, and SC-002 in `benchmarks/lexical-comparison-report.schema.json` | Verify: the focused suite confirmed the exact three-lane inventory and schema identifier alongside executable validation
- [x] T013 [US2] Add failing orchestration tests for disposable per-lane outputs, sequential evaluation, cleanup, final atomic write, refusal to overwrite, and zero model/network calls covering FR-004, FR-006, FR-009, and SC-002 in `tests/benchmarks/longmemeval-compare.test.ts` | Verify: the focused suite initially failed because the comparison runner module did not exist
- [x] T014 [US2] Implement the three-lane comparison runner without touching preparation or normal test/install flows covering FR-004, FR-006, and FR-009 in `benchmarks/longmemeval/compare.mjs` | Verify: the miniature comparison suite passed 2/2, cleaned caller-visible work state after success/failure, refused overwrite, and published one valid offline envelope
- [x] T015 [US2] Register the opt-in comparison command without changing normal test, install, or prepublish behavior covering FR-006 and FR-009 in `package.json` | Verify: `pnpm run` lists `benchmark:compare:longmemeval`; normal test/install/prepublish scripts remain unchanged and the comparison schema is packaged

## Story US3

- [x] T016 [US3] Add failing promotion-policy tests for the 0.05 coverage gain, NDCG/fractional-recall non-regression, exact two-times latency boundary including zero, exact aggregate SQLite-byte equality, errors/calls, provenance, completeness, ties, and explicit reasons covering FR-007, FR-008, SC-003, and SC-005 in `tests/benchmarks/lexical-comparison-report.test.ts` | Verify: three policy cases failed because no promotion assessor existed
- [x] T017 [US3] Implement unique-winner fail-closed promotion assessment and persist its evidence in the comparison envelope covering FR-007, FR-008, and SC-003 in `benchmarks/lexical-comparison-report.mjs` | Verify: the comparison suite passed 6/6 and the orchestration suite passed 2/2 with deterministic boundary, rejection, incomplete, and multiple-eligible reason codes
- [x] T018 [US3] Document the strategy experiment, opt-in command, conditional default rule, unchanged six tools, and focused verification commands covering FR-004, FR-007, FR-008, and FR-009 in `docs/agent/testing.md` | Verify: instructions name the registered opt-in script, exact gates, output path, focused tests, offline boundary, and unchanged six tools without a pre-result winner claim
- [x] T019 [US3] Document the user-facing local lexical comparison and evidence-gated default behavior covering FR-004, FR-007, FR-008, and FR-009 in `README.md` | Verify: README names the validated three strategies and fail-closed conditional rule without claiming an observed winner before the official run

## Parallel execution

- None: the strategy registry, service input, lane report, comparison envelope, promotion decision, and conditional runtime default are one ordered contract with overlapping fixtures; parallel writers would create invalid intermediate shapes and duplicate full-corpus work.

## Final verification

- [x] T020 Execute the official offline three-strategy comparison against the already prepared pinned corpus and capture SC-004 and SC-005 outcome evidence in `benchmarks/results/longmemeval-s-lexical-comparison-report.json` | Verify: all 470 eligible questions completed per lane with shared hashes/budgets/provenance, zero errors/calls, validation `{ valid: true, errors: [] }`, and decision `retain_control`
- [x] T021 Apply the report's conditional default decision and rerun focused runtime and benchmark tests covering FR-007, FR-008, FR-009, and SC-003 in `src/memory-core/sqlite/fts.ts` | Verify: neither candidate cleared the 2x latency gate, so `DEFAULT_LEXICAL_QUERY_STRATEGY` remains `all-prefix-v1`; the pre-decision focused suite passed 26/26 and will be repeated in T022
- [x] T022 Run build, full unit/integration/smoke/fixture/prepublish verification and diff hygiene covering every FR and buildable SC in `openspec/changes/compare-lexical-query-strategies/verify-report.md` | Verify: build, 213 tests, integration verify/smoke, fixture, prepublish, official report validation, and diff hygiene passed with residual risks recorded
- [x] T023 Obtain a fresh read-only Oracle verdict and persist complete FR/buildable-SC/outcome-SC evidence covering every requirement in `openspec/changes/compare-lexical-query-strategies/verify-report.md` | Verify: fresh Oracle round 4 returned PASS after independently closing F-001 through F-005 and validating every FR and SC

## Convergence after Oracle verification round 1

- [x] T024 [US3] Close convergence finding F-001, classified as contradicts, by replacing final report publication with an atomic no-clobber commit, including race regression coverage for both runners and covering FR-006 and SC-004 in `benchmarks/longmemeval/run.mjs` | Verify: both race tests first failed with two successful overwrites, then passed 7/7 using same-directory atomic hard-link publication with exactly one winner
- [x] T025 [US3] Close convergence finding F-003, classified as contradicts, by removing permissive epsilon promotion comparisons, adding immediately-below and negative-regression tests, and covering FR-007 and SC-003 in `benchmarks/lexical-comparison-report.mjs` | Verify: the adversarial case first promoted a sub-threshold candidate, then the focused suite passed 7/7 with exact conservative comparisons and no epsilon admission
- [x] T026 [US3] Close convergence finding F-002, classified as partial, by requiring exact exclusions and non-strategy candidate-configuration equality across lanes, covering FR-004 and FR-007 in `benchmarks/lexical-comparison-report.mjs` | Verify: both adversarial drifts first validated, then the focused suite passed 7/7 with full dataset, conditions, provenance, and base-config equality

## Convergence after Oracle verification round 2

- [x] T027 [US3] Close convergence finding F-003, classified as partial, by replacing floating-point coverage admission with exact rational hit-count comparison, covering nonzero exact and below-threshold boundaries, FR-007, and SC-003 in `benchmarks/lexical-comparison-report.mjs` | Verify: the nonzero exact boundary first rejected, then the focused suite passed 7/7 with 10/100 to 15/100 eligible and 100/1000 to 149/1000 rejected without an epsilon
- [x] T028 [US3] Close convergence finding F-004, classified as contradicts, by normalizing every convergence task to the validator's one-literal-path contract while preserving IDs, status, ordering, intent, evidence, and artifact coherence in `openspec/changes/compare-lexical-query-strategies/tasks.md` | Verify: Accelerated SDD validation through ready returned valid with no errors or warnings

## Convergence after Oracle verification round 3

- [x] T029 [US3] Close convergence finding F-005, classified as contradicts, by making any control-lane error fail the validated-envelope and pure promotion-policy paths closed, covering FR-007, SC-003, and SC-005 in `benchmarks/lexical-comparison-report.mjs` | Verify: regression first reproduced promotion from an error-containing control, then 30/30 focused tests passed with both paths returning incomplete
