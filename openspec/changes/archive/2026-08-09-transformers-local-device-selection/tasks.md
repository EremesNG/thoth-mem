# Tasks: Transformers local execution device selection

## MVP scope

US1 is the first independently testable story: all five explicit device values materialize with environment precedence and the selected value reaches both local Transformers.js model-loading paths alongside the existing dtype.

## Dependencies

T001 -> T005; T002 -> T007; T003 -> T005 -> T006; T004 -> T007; T005 -> T008 -> T009 -> T010; T006 -> T011; T007 -> T013; T010 -> T014; T011 -> T012 -> T014 -> T015 -> T016.

## Story US1

- [x] T001 [US1] Add failing table-driven configuration tests for all five values, normalization, environment precedence, and invalid-value rejection covering FR-001, FR-002, SC-001 in `tests/config.test.ts` | Verify: focused tests fail only because device parsing/materialization is absent.
- [x] T002 [US1] Add failing executor-option tests for the pipeline-backed and direct-model paths covering FR-003, SC-002 in `tests/retrieval/local-transformers-provider.test.ts` | Verify: focused tests fail only on missing device forwarding across both model-loading paths and the explicit initialization-error case.
- [x] T003 [US2] Add failing compatibility tests for CPU default, editable-config backfill, schema default, and device-independent semantic hash covering FR-004, FR-005, SC-003, SC-004 in `tests/config.test.ts` | Verify: focused tests demonstrate the missing CPU field while the hash equality expectation remains explicit.
- [x] T004 [US3] Add a failing runtime initialization propagation test with one executor attempt and zero fallback attempts covering FR-006, SC-005 in `tests/retrieval/local-transformers-provider.test.ts` | Verify: the test captures the original runtime error contract and exact attempt count.
- [x] T005 Implement the exported device taxonomy, strict parser, precedence, CPU materialization/backfill, and deliberate hash exclusion covering FR-001, FR-002, FR-004, FR-005, SC-001, SC-003, SC-004 in `src/config.ts` | Verify: configuration tests pass with five accepted values, one rejected unknown value, CPU defaults, and byte-identical hashes across devices.
- [x] T006 [US1] Add the five-value device property and CPU default to the public schema covering FR-001, FR-004, SC-003, SC-007 in `config.schema.json` | Verify: schema assertions enumerate exactly five values and one CPU default.
- [x] T007 [US1] Forward the selected device with existing dtype options through both executor paths without fallback covering FR-003, FR-006, SC-002, SC-005 in `src/retrieval/local-transformers-provider.ts` | Verify: focused provider tests pass for both loading paths and propagated initialization failure.
- [x] T008 Update the embedding benchmark's complete typed configuration with the CPU default covering FR-001, FR-004, SC-003 in `src/evals/embedding-models.ts` | Verify: the benchmark configuration satisfies required EmbeddingConfig without changing benchmark CLI scope or results.
- [x] T009 Update remote-provider test configurations with the materialized CPU field covering FR-001, FR-004, SC-003 in `tests/retrieval/remote-provider.test.ts` | Verify: remote-provider tests compile and retain unchanged remote request behavior because device is not consumed remotely.
- [x] T010 Update all complete typed store-test configurations with the CPU field covering FR-001, FR-004, SC-003 in `tests/store/index.test.ts` | Verify: every EmbeddingConfig literal compiles while existing lineage and fallback expectations remain unchanged.

## Story US2

- [x] T011 [US2] Document persisted and environment selection, platform guidance, CPU default, auto semantics, cold-start tradeoff, and no-rebuild behavior covering FR-007, SC-007 in `README.md` | Verify: documentation and schema contain the same five values and state CPU as the single default.

## Story US3

- [x] T012 Run the focused configuration suite covering FR-001, FR-002, FR-004, FR-005, FR-007, SC-001, SC-003, SC-004, SC-007 in `tests/config.test.ts` | Verify: the complete configuration test file passes.
- [x] T013 Run the focused local provider suite covering FR-003, FR-006, SC-002, SC-005 in `tests/retrieval/local-transformers-provider.test.ts` | Verify: the complete provider test file passes.

## Parallel execution

- None: configuration tests and implementation overlap one public contract, provider tests precede the sole provider implementation, and documentation depends on the finalized names and semantics; a single writer avoids contradictory edits.

## Final verification

- [x] T014 Run the repository build/type/package gate covering SC-001, SC-002, SC-003, SC-004, SC-005, SC-007 in `package.json` | Verify: the packaged build completes with zero TypeScript or dashboard build errors.
- [x] T015 Run the full Vitest regression suite covering SC-001, SC-002, SC-003, SC-004, SC-005, SC-007 in `vitest.config.ts` | Verify: all non-skipped tests pass and any skipped tests are reported exactly.
- [x] T016 Verify the outcome criterion through configured DirectML on the available Windows host covering SC-006 in `src/retrieval/local-transformers-provider.ts` | Verify: a two-input batch returns two finite 768-dimensional vectors with norms within 1 ± 0.0001.
