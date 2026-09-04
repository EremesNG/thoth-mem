# Tasks: Establish LongMemEval-S Lexical Baseline

## Authoring contract

Task identifiers are sequential across this file. Every implementation task names one writable path and a concrete observable check. Test tasks precede the behavior they specify.

## MVP scope

US1 is the first independently testable slice: the official cleaned-S identity can be streamed, validated, hash-checked, and prepared atomically outside git, while the normal committed fixture remains offline and unchanged.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007`; `T001 + T003 + T007 -> T008 -> T009`; `T001 -> T010 -> T011 -> T012`; `T012 -> T013 -> T014`; `T007 + T009 + T012 + T014 -> T015 -> T016 -> T017`; `T001-T017 -> T018 -> T019 -> T020`.

## Story US1

- [x] T001 [US1] Add a committed official-shaped mini corpus with multi-session golds, assistant-evidence eligibility, abstention, ordering, unresolved-gold, answer/has-answer leakage markers, and no-hit retrieval covering FR-001, FR-002, FR-003, FR-004, SC-001, and SC-002 in `benchmarks/fixtures/longmemeval-s-mini.json` | Verify: the fixture exposes every declared eligibility and leakage boundary without containing production data
- [x] T002 [US1] Add failing streaming dataset-contract tests for pinned identity, chunk-safe JSON-array parsing, ordered/aligned sessions, unique question/gold IDs, preserved repeated haystack IDs with unique occurrence source IDs, preserved empty string turn content, _abs-only exclusion, nonempty resolvable gold sessions, and wrong-hash rejection covering FR-001, FR-002, and SC-001 in `tests/benchmarks/longmemeval-contract.test.ts` | Verify: focused tests observe failure before repeated-occurrence and empty-content support, then pass without collapsing or dropping corpus positions
- [x] T003 [US1] Implement immutable source constants, streaming top-level record parsing, hashing, record validation, _abs-only eligibility classification, gold-session resolution, and role-labelled session normalization covering FR-001, FR-002, and SC-001 in `benchmarks/longmemeval/contract.mjs` | Verify: focused contract tests pass without reading the complete fixture into one JSON value or using has_answer to select records
- [x] T004 [US1] Add failing preparation tests for injected download streams, temporary-file cleanup, digest mismatch, atomic publication, compact receipts, and cache exclusion covering FR-001, FR-002, FR-008, and SC-001 in `tests/benchmarks/longmemeval-prepare.test.ts` | Verify: the new focused preparation tests fail before the preparation module exists
- [x] T005 [US1] Implement the explicit networked preparation command with streaming SHA-256, pinned immutable URL, validation, atomic rename, and no production CLI override covering FR-001, FR-002, FR-008, and SC-001 in `benchmarks/longmemeval/prepare.mjs` | Verify: preparation tests pass and a failed preparation leaves neither an accepted dataset nor a receipt
- [x] T006 [US1] Exclude only the bounded LongMemEval local cache from version control and preserve report visibility covering FR-002 and SC-001 in `.gitignore` | Verify: a prepared raw dataset path is ignored while the external report path remains trackable
- [x] T007 [US1] Expose explicit preparation and offline-run scripts and publish the retrieval-report schema without changing the default fixture script covering FR-001, FR-002, FR-008, and SC-001 in `package.json` | Verify: manifest assertions show separate commands and the unchanged fixture command

## Story US2

- [x] T008 [US2] Add failing runner tests for one isolated database per eligible question, original occurrence order, deterministic save mappings including repeated base session IDs, assistant-evidence inclusion, answer/gold/has-answer leakage prevention, _abs exclusion accounting, invalid-gold rejection, Top-20 ranking, 4,000-UTF-16-unit delivery, offline execution, cleanup, and atomic output covering FR-003, FR-004, FR-005, SC-002, and SC-003 in `tests/benchmarks/longmemeval-runner.test.ts` | Verify: the focused runner tests observe base-ID collision before occurrence source IDs, then pass with every occurrence preserved
- [x] T009 [US2] Implement the importable retrieval-only LongMemEval runner over the built product MemoryService with exact-once occurrence ingestion, per-question isolation, dual ranking/delivery calls, occurrence-to-base provenance, product-unit resource samples, and cleanup covering FR-003, FR-004, FR-005, SC-002, and SC-003 in `benchmarks/longmemeval/run.mjs` | Verify: runner tests pass with lexical-only lanes, stable unique source mappings, repeated base IDs, _abs-only exclusions, and no evaluation-time network or model calls

## Story US3

- [x] T010 [US3] Add failing retrieval-report and pure scoring tests for positional duplicates, any/fraction/all recall at K=1/5/10/20, first-gold MRR, occurrence-level binary NDCG@10, delivered metrics, per-type aggregation, occurrence provenance, UTF-16 budget units, percentiles, footprints, errors, and fail-closed completeness covering FR-004, FR-005, FR-006, FR-007, FR-008, and SC-004 in `tests/benchmarks/retrieval-report.test.ts` | Verify: the focused report tests observe rank-collapsing before duplicate-aware scoring, then pass exactly
- [x] T011 [US3] Define the retrieval-only JSON report contract with common identity, per-question audit, multi-gold quality, separate delivery, explicit UTF-16 and token units, resource samples, provenance, exclusions, and non-promotion conclusion covering FR-004, FR-005, FR-006, FR-007, FR-008, and SC-004 in `benchmarks/retrieval-report.schema.json` | Verify: valid known reports satisfy the schema shape and omissions, unit ambiguity, or ambiguous metric names are rejected by tests
- [x] T012 [US3] Implement pure multi-gold scoring, aggregation, percentile calculation, and retrieval-report validation without coupling external retrieval to fixture continuity fields covering FR-005, FR-006, FR-007, FR-008, and SC-004 in `benchmarks/retrieval-report.mjs` | Verify: hand-computed scoring and fail-closed report tests pass exactly
- [x] T013 [US3] Add a failing adapter-contract test that requires retrieval-only any/fraction/all recall, MRR, NDCG, and delivery metrics while rejecting answer-generation claims covering FR-006, FR-008, and SC-004 in `tests/benchmarks/adapters.test.ts` | Verify: the focused adapter test fails while LongMemEval still advertises answer exact match
- [x] T014 [US3] Update the declared LongMemEval adapter metrics to retrieval-only any/fraction/all recall, MRR, NDCG, and delivery without answer-generation claims covering FR-006, FR-008, and SC-004 in `benchmarks/adapters.mjs` | Verify: adapter tests pass, retain LongMemEval unavailability by default, and reject answer accuracy as a retrieval metric
- [x] T015 [US3] Document the two-command preparation/offline workflow, pinned cleaned source, product baseline label, budgets and UTF-16 units, metric definitions, expected report, and non-promotion boundary covering FR-001, FR-005, FR-006, FR-007, FR-008, and SC-004 in `README.md` | Verify: operator documentation distinguishes official protocol facts, thoth profile choices, networked preparation, and offline evaluation
- [x] T016 [US3] Add routed benchmark verification guidance, focused tests, full-suite checks, cache safety, and explicit real-dataset outcome evidence covering FR-007, FR-008, and SC-004 in `docs/agent/testing.md` | Verify: agent guidance names only manifest-backed commands and preserves the existing required verification sequence
- [x] T017 [US3] Keep the default lane truthfully unavailable until explicit preparation while recording the retrieval-only adapter contract covering FR-001, FR-008, and SC-004 in `benchmarks/manifest.json` | Verify: the default fixture still reports dataset_not_prepared and makes zero external-quality claim

## Parallel execution

- None: one writer owns a tightly coupled dataset/profile/report contract; later tasks repeatedly consume the same constants, fixtures, and validators, so parallel mutable work would create merge and semantic-drift risk.

## Final verification

- [x] T018 Run the focused benchmark tests first, then build, full tests, integration verification, packed smoke, fixture benchmark, prepublish verification, and diff hygiene covering FR-001 through FR-008 and SC-001 through SC-004 in `package.json` | Verify: every required local command passes and the committed fixture still makes zero network/model calls
- [x] T019 After explicit authorization, reconcile the observed official repeated-session-ID case without corpus collapse, prepare the pinned official cleaned-S dataset, and execute the external runner to observe SC-005 in `benchmarks/results/longmemeval-s-fts5-report.json` | Verify: focused duplicate-occurrence tests pass and the atomic real report validates with the observed denominator, pinned hashes, full occurrence provenance, zero evaluation-time network/model calls, and no optional-module promotion
- [x] T020 Delegate fresh independent Oracle verification of all functional requirements, buildable criteria, the observed or residual outcome criterion, and accepted-scope risks in `openspec/changes/establish-longmemeval-s-lexical-baseline/verify-report.md` | Verify: Oracle returns PASS before closeout or actionable failures return the change to implementation

## Convergence round 1

- [x] T021 [US3] Resolve the Oracle partial finding for FR-007/SC-004 by adding explicit candidate-ranking and delivery truncation measurements from each MemoryService recall result through the runner, schema, validator, focused tests, and durable report in `benchmarks/longmemeval/run.mjs` | Verify: tests fail without truncation fields, then the regenerated report validates and its aggregate truncation values exactly equal the underlying per-query recall budget evidence
- [x] T022 [US3] Resolve the Oracle contradiction finding for SC-004 by making the JavaScript report validator enforce closed report shapes and recompute integrity hashes, including the candidate configuration hash, in `benchmarks/retrieval-report.mjs` | Verify: focused mutations for extra top-level/nested properties and forged configuration hashes fail closed, while the regenerated official report and valid fixture report still pass
