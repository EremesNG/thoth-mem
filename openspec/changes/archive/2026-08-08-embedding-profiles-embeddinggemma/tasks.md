# Tasks: Model-aware embedding profiles and three-model default gate

## Authoring contract

Task identifiers are sequential across the change. Every behavior task starts with a failing focused test, one root writer owns all mutable product surfaces, and outcome-only evidence is recorded by the live benchmark and independent verification rather than invented as implementation work.

## MVP scope

US1 is the MVP: deterministic Nomic/EmbeddingGemma/Qwen/raw profile resolution, exact idempotent query/document formatting, structured inputs, role-correct HyDE, and explicit semantic degradation during recall. Completion evidence is the focused profile suite plus the existing HyDE/store suite passing with raw-query and hypothetical-document roles and lexical/KG fallback after provider/validation failure.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006`; US2 depends on the US1 structured-input contract; US3 depends on both provider adapters and resolved config lineage; the durable live gate precedes every conditional default task; all product tasks precede simplification and final verification.

## Story US1

- [x] T001 [US1] Add failing profile tests for automatic/explicit Nomic, EmbeddingGemma, Qwen3-Embedding, aliases, raw fallback, exact idempotent formatting, titles, query-only Qwen instruction, and FR-001/FR-003 with SC-001 in `tests/retrieval/embedding-profile.test.ts` | Verify: focused test run fails only for the missing profile behavior
- [x] T002 [US1] Implement the immutable versioned Nomic/EmbeddingGemma/Qwen/raw profile registry, resolver, fallback metadata, and formatters for FR-001/FR-003 with SC-001 in `src/retrieval/embedding-profile.ts` | Verify: all profile resolution and exact-string tests pass
- [x] T003 [US1] Add failing tests for ordered structured inputs, raw-query versus HyDE-document roles, and provider/vector-validation failure during recall for FR-002/FR-004/FR-007 with SC-002/SC-003 in `tests/store/index.test.ts` | Verify: focused tests expose the current batch-wide query role and uncaught semantic error while requiring explicit degradation plus continued lexical/KG results
- [x] T004 [US1] Define the provider-neutral retrieval intent, role, title, and ordered embedding input contract for FR-002 with SC-002 in `src/retrieval/providers.ts` | Verify: typecheck identifies every legacy adapter/caller that still uses the string-array contract
- [x] T005 [US1] Assign query role to raw input and document role to successful HyDE answers while preserving degraded behavior for FR-004 with SC-002 in `src/retrieval/hyde.ts` | Verify: HyDE construction tests pass for success, disabled, empty, failure, and timeout paths
- [x] T006 [US1] Submit ordered structured semantic inputs, retain source-to-vector mapping, and catch provider/validation errors at the recall boundary with explicit semantic degradation while lexical/KG continue for FR-002/FR-004/FR-007 with SC-002/SC-003 in `src/store/index.ts` | Verify: focused store tests pass, raw/HyDE candidates retain source labels, and semantic failure cannot abort hybrid recall

## Story US2

- [x] T007 [US2] Add failing batch validation tests for row count/order, finite non-zero values, dimensions, normalization, and FR-007 with SC-003 in `tests/retrieval/vector-processing.test.ts` | Verify: focused tests fail before the shared validator exists
- [x] T008 [US2] Implement provider-neutral ordered vector validation and optional L2 normalization for FR-007 with SC-003 in `src/retrieval/vector-processing.ts` | Verify: all validator tests pass including zero, NaN, infinity, row mismatch, and dimension mismatch rejection
- [x] T009 [US2] Expand failing remote-provider tests for EmbeddingGemma/Qwen payloads, titles, mixed roles, response indexes, native 768/1024 dimensions, normalization, and malformed batches for FR-007/FR-008 with SC-003 in `tests/retrieval/remote-provider.test.ts` | Verify: focused tests fail only where the legacy remote adapter lacks the new contract
- [x] T010 [US2] Migrate LM Studio and Ollama transport to structured profile-formatted inputs and validated ordered output for FR-007/FR-008 with SC-003 in `src/retrieval/remote-provider.ts` | Verify: all remote-provider tests pass without changing HTTP failure messages or exact model IDs
- [x] T011 [US2] Add failing local-provider tests for profile parity, Q8 EmbeddingGemma sentence-embedding extraction, Q8 Qwen hidden-state/attention-mask last-token pooling, mixed sequence lengths, native dimensions, normalization, and invalid output for FR-007/FR-008 with SC-003 in `tests/retrieval/local-transformers-provider.test.ts` | Verify: focused tests fail on both missing candidate executors while preserving Nomic expectations
- [x] T012 [US2] Add the EmbeddingGemma and Qwen3-Embedding Transformers.js Q8 tokenizer/model executors, including attention-mask-aware Qwen last-token pooling, and retain compatible Nomic/raw execution for FR-008 with SC-003 in `src/retrieval/local-transformers-provider.ts` | Verify: mocked local provider tests pass at 768/1024 native dimensions and no unsafe type suppression is introduced
- [x] T013 [US2] Add failing configuration tests for all profiles, normalize persistence, environment precedence, auto resolution, backward compatibility, 768/1024 known dimensions, hash lineage, and FR-005/FR-006 with SC-004 in `tests/config.test.ts` | Verify: focused tests fail only for missing additive fields and preprocessing-aware hash behavior
- [x] T014 [US2] Implement profile/normalize resolution, resolved metadata, environment overrides, candidate model aliases/native dimensions, and preprocessing-aware hashing for FR-005/FR-006 with SC-004 in `src/config.ts` | Verify: all configuration tests pass and old configuration fixtures resolve without migration errors
- [x] T015 [US2] Add profile and normalization properties to the persisted JSON contract for FR-005 with SC-004 in `config.schema.json` | Verify: schema tests accept valid new fields and reject unsupported profile or non-boolean normalization values
- [x] T016 [US2] Add failing indexing tests proving observation titles are ephemeral embedding metadata for chunks/sentences without changing stored text and provider/validation errors reach the established retry path for FR-007/FR-009 with SC-003 in `tests/store/index.test.ts` | Verify: focused tests capture formatted title input, unchanged semantic content, no partial vector writes, and retryable job failure
- [x] T017 [US2] Select and propagate observation titles through ordered document inputs while preserving provider/validation error propagation to indexing retries for FR-007/FR-009 with SC-003 in `src/indexing/jobs.ts` | Verify: indexing tests pass for present, empty, and missing titles and vector writes remain atomic per validated batch

## Story US3

- [x] T018 [US3] Add failing unit tests for three-model metrics, corpus hash, complete/incomplete runs, thresholds, per-candidate no-regression, quality score, deterministic winner/ties, atomic JSON persistence, rendering, and FR-010/FR-011 with SC-005 in `tests/evals/embedding-models.test.ts` | Verify: focused suite fails on missing benchmark contracts, winner, and durable-output behavior
- [x] T019 [US3] Define the committed bilingual technical/code cases and stable identifiers for FR-010 with SC-005 in `src/evals/embedding-model-corpus.ts` | Verify: corpus tests prove every case has one valid expected document and enough candidates for Recall@5
- [x] T020 [US3] Implement three-model provider selection, profiled embedding, cosine ranking, metrics, latency/bytes reporting, corpus identity, candidate eligibility, deterministic winner selection, output-path atomic JSON persistence before exit, Markdown rendering, and fail-closed semantics for FR-010/FR-011 with SC-005 in `src/evals/embedding-models.ts` | Verify: all benchmark unit tests pass for Gemma/Qwen winners, ties, regression, missing model, persistence failure, and invalid-vector scenarios
- [x] T021 [US3] Register the model-comparison development command for FR-010/FR-011 with SC-005 in `package.json` | Verify: the package command invokes the benchmark runner and preserves all existing scripts
- [x] T022 [US3] Document profile configuration, all three provider model IDs, 768/1024 native dimensions, benchmark inputs/outputs, operational cost, and fail-closed default semantics for FR-005/FR-008/FR-010/FR-011 with SC-005 in `README.md` | Verify: documented commands and field names match manifests, schema, and benchmark help exactly
- [x] T023 [US3] Run the live Nomic-versus-EmbeddingGemma-versus-Qwen comparison with the output option for FR-010/FR-011/FR-012 and persist outcome SC-006 in `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json` | Verify: the durable report exists before exit and records all three model IDs/profiles, quality, latency, bytes when available, dimensions, norms, corpus hash, eligibility/reasons, `gate.passed`, and `gate.defaultDecision`
- [x] T024 [US3] Add or update a failing permanent test for the expected shipped product default and its native dimensions, without reading OpenSpec at test/runtime, for FR-012 with SC-007 in `tests/config.test.ts` | Verify: focused config test fails until the product constant reflects the recorded workflow decision
- [x] T025 [US3] Read the durable evidence during implementation and apply only its conditional winner as a static product default with native 768/1024-dimensional metadata for FR-012 with SC-007 in `src/config.ts` | Verify: true gate applies the recorded EmbeddingGemma/Qwen winner; false, missing, or inconsistent evidence preserves Nomic; source has no OpenSpec runtime dependency
- [x] T026 [US3] Update operator documentation with the actual persisted default outcome, candidate eligibility, footprint/latency context, and migration/rebuild note for FR-012 with SC-007 in `README.md` | Verify: README states the same `gate.passed`/`gate.defaultDecision` outcome as the artifact and configuration tests

## Parallel execution

- None: profile types, config hashing, both providers, indexing callers, benchmark construction, and the conditional default share mutable interfaces and must remain under one writer in dependency order.

## Final verification

- [x] T027 Simplify recently changed implementation without altering profile, provider, benchmark, or gate behavior for SC-001/SC-002/SC-003/SC-004/SC-005/SC-007 in `src` | Verify: diff becomes no more complex and all focused tests remain green
- [x] T028 Create change-local durable deltas for every modified capability and FR-001 through FR-012 in `openspec/changes/embedding-profiles-embeddinggemma/specs` | Verify: config, retrieval, indexing, and eval deltas match implemented behavior and contain no aspirational claims
- [x] T029 Run all focused profile, provider, config, indexing, HyDE, and benchmark tests for SC-001/SC-002/SC-003/SC-004/SC-005/SC-007 in `package.json` | Verify: every focused test exits zero
- [x] T030 Run the repository build for SC-008 in `package.json` | Verify: TypeScript no-emit, package build, and dashboard build exit zero
- [x] T031 Run the full Vitest suite and existing retrieval eval for SC-008 in `package.json` | Verify: both commands exit zero without retrieval regression
- [x] T032 Review working-tree status, durable benchmark evidence, generated output, secrets, unrelated changes, and task evidence for SC-008 in `openspec/changes/embedding-profiles-embeddinggemma/tasks.md` | Verify: only intentional source, test, documentation, active change artifacts, and complete non-secret benchmark evidence remain and completed boxes have evidence
- [x] T033 Delegate independent Oracle verification of all FRs and SCs, explicitly compare the durable gate evidence with the shipped static constant before archive, and persist the verdict in `openspec/changes/embedding-profiles-embeddinggemma/verify-report.md` | Verify: Oracle returned PASS after convergence with all FRs/SCs passing, artifact-to-constant consistency, no product OpenSpec dependency, and SC-006 observed

## Execution evidence

- T001–T017: profile, structured-input, vector-validation, remote/local provider, configuration, HyDE, recall-degradation, and title-aware indexing tests were observed red before implementation and pass in the focused suite.
- T018–T022: the committed corpus and benchmark contracts pass `tests/evals/embedding-models.test.ts`, including incomplete runs, weak Nomic comparator, candidate eligibility, deterministic ties, and atomic persistence.
- T023: the final explicit LM Studio run exited `0` and persisted all three complete models, corpus hash `999df2b0b74e396128bb3d9d9bd49155a2b8ed8c639499e84dfa1ba83664f1f1`, Qwen bytes `639150592`, `gate.passed: true`, and `gate.defaultDecision: embeddinggemma`.
- T024–T026: permanent config tests were observed red against Nomic and now pass with static default `onnx-community/embeddinggemma-300m-ONNX`; source and tests contain no active OpenSpec read, and README matches the report.
- T027: simplification centralized family resolution and removed the obsolete baseline-threshold branch; no further behavior-preserving reduction was warranted after the final one-line default and injection seam.
- T028: config, retrieval, indexing, and eval deltas exist under `specs/` and describe only implemented behavior.
- T029: 8 focused files pass with 149 tests; `tsc --noEmit` passes.
- T030: `pnpm run build` passes TypeScript, package bundling, and dashboard Vite build.
- T031: `pnpm test` passes 73 files with 1091 passed and 1 skipped; `pnpm run eval:retrieval` passes with Recall@1 `95.7%`, Recall@5 `100%`, and MRR `0.978`.
- T032: `git diff --check` passes; status contains only scoped source, tests, documentation, and active change artifacts; generated output is ignored; the only secret-pattern matches are synthetic `api-key` fixture text.

## Convergence

- [x] T034 [US3] Resolve OVR-001 (partial) by rendering every contract-required per-model operational field plus candidate eligibility, threshold/no-regression comparisons, and rejection reasons in the human benchmark report for FR-010/SC-005 in `src/evals/embedding-models.ts` | Verify: the focused renderer test was observed red, then passed with complete/rejected candidate parity and valid table ordering
- [x] T035 [US3] Resolve OVR-002 (missing) with fail-closed benchmark coverage for invalid provider vectors and report-persistence failure, including non-zero CLI status without a partial/default-authorizing artifact, for SC-005 in `tests/evals/embedding-models.test.ts` | Verify: the missing CLI boundary was observed red; invalid-vector and persistence-failure tests now pass with fail-closed decisions/status
- [x] T036 [US3] Resolve OVR-003 (partial) by distinguishing invalid response indexes from valid out-of-order LM Studio rows that are restored to input order for FR-007 in `README.md` | Verify: wording now matches the remote-provider implementation and ordering tests
- [x] T037 [US2] Run real local Transformers.js inference twice for EmbeddingGemma and Qwen3 after Oracle verification and record the operational evidence in `verify-report.md` | Verify: both Q8 models return two finite, normalized rows at native 768/1024 dimensions, including a second process with artifacts already cached
- [x] T038 Correct closeout-only delta metadata and consolidate the pre-existing duplicate indexing requirement blocking transactional archive in `openspec/specs/indexing/spec.md` | Verify: all declared deltas target new requirement names, affected canonical specs contain unique requirement headings, and the closeout validator passes

### Convergence evidence

- OVR-001: `tests/evals/embedding-models.test.ts` passes a rejected-candidate parity case covering timestamp, IDs/profiles, dimensions, norms, quality, requests, elapsed/latency, bytes, thresholds, tolerance, eligibility, per-metric comparisons, reasons, and table order.
- OVR-002: the same file passes 15 tests total, including non-finite provider vector rejection and CLI persistence failure returning status `1` without a report or rendered default decision; `tsc --noEmit` passes.
- OVR-003: README now states that valid indexed LM Studio rows are restored while missing, duplicate, or invalid indexes are rejected.
- T037: real Transformers.js inference returned two finite normalized vectors per model. The initial pass measured EmbeddingGemma `[768, 768]` in `2674 ms` and Qwen3 `[1024, 1024]` in `18554 ms`; a second fresh process with cached artifacts measured `1883 ms` and `1636 ms`, respectively, with identical dimensions/norms.
- T038: change requirements with new canonical titles use `ADDED` metadata; the richer synchronous-KG version of the duplicate indexing requirement was retained; duplicate-heading scan reports none for config, retrieval, indexing, or evals.
