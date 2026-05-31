# Tasks: Hybrid Core Retrieval

## Phase 1: RED Tests and Dependency Baseline
- [x] 1.1 Add embedding config/hash/defaults tests in `tests/config.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/config.test.ts -t "embedding"`
  - Expected: Tests cover env > file > default precedence, local fallback only when provider is unset, config hash stability/change behavior, and retrieval defaults exposure.

- [x] 1.2 Add sqlite-vec schema/readiness tests in `tests/store/migration.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/migration.test.ts -t "sqlite-vec"`
  - Expected: Tests cover vec0 table creation, load-failure degradation, idempotent migration, and dimension mismatch stale behavior.

- [x] 1.3 Add background indexing, eventual semantic consistency, and rebuild tests in `tests/store/index.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "semantic index"`
  - Expected: Tests cover non-blocking save enqueue, pending semantic state after save, chunk-before-sentence priority, deterministic rowid mapping, retry/restart convergence, and auto/manual rebuild dedupe.

- [x] 1.4 Add hybrid retrieval defaults tests in `tests/store/index.test.ts` or nearest retrieval test file
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "hybrid retrieval"`
  - Expected: Tests cover sentence k=100, chunk k=20, lexical limit=20, threshold=0.30, sqlite-vec distance score `exp(-distance / 20)`, FTS5 prefix matching, sentence/chunk/FTS5/KG fusion, and degraded semantic fallback.

- [x] 1.5 Add HyDE dual embedding tests in `tests/store/index.test.ts` or nearest retrieval test file
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "HyDE"`
  - Expected: Tests cover raw-query embedding always running, hypothetical-answer embedding contributing on success, and raw-query-only fallback on HyDE timeout/failure/disablement.

- [x] 1.6 Add surgical sentence trimming and small-to-big tests
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "small-to-big"`
  - Expected: Tests prove thresholded sentence hits MUST return trimmed sentence evidence first, with parent chunk/observation promotion attached separately when needed.

- [x] 1.7 Add KG extraction tests in `tests/store/index.test.ts` or a new focused KG test file
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "knowledge graph"`
  - Expected: Tests cover at least 22 entity categories, at least 20 relation categories, triple provenance/confidence, dedupe, and `observation_facts` fallback.

## Phase 2: Dependencies, Config, and Providers
- [x] 2.1 Add `sqlite-vec` and `@huggingface/transformers` to `package.json` and `pnpm-lock.yaml`
  **Verification**:
  - Run: `pnpm install`
  - Expected: Dependencies install successfully and lockfile is consistent.

- [x] 2.2 Implement embedding/HyDE config resolution and retrieval defaults in `src/config.ts`
  **Verification**:
  - Run: `pnpm test -- tests/config.test.ts -t "embedding"`
  - Expected: Config tests pass for env overrides, `{dataDir}/config.json`, local fallback selection, canonical config hash, and default retrieval tuning values.

- [x] 2.3 Create embedding provider abstraction and remote adapter under `src/retrieval/`
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Provider interfaces and Ollama/LM Studio-compatible adapter compile without module or type errors.

- [x] 2.4 Create local Transformers.js fallback provider under `src/retrieval/`
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Local fallback provider compiles and is selected only when no remote provider is configured.

- [x] 2.5 Create fail-safe HyDE module under `src/retrieval/hyde.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "HyDE"`
  - Expected: Disabled, timeout, and failure cases fall back to raw-query embeddings without retrieval failure.

## Phase 3: Schema, sqlite-vec Runtime, and Metadata Lineage
- [x] 3.1 Add sqlite-vec load/readiness integration in `src/store/index.ts` or a dedicated `src/retrieval/sqlite-vec.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/migration.test.ts -t "sqlite-vec"`
  - Expected: Supported runtime reports sqlite-vec ready; simulated load failure marks semantic lanes degraded while store initialization continues.

- [x] 3.2 Add dimension-aware vec0 virtual table lifecycle for sentence and chunk vectors in `src/store/schema.ts` / `src/store/migrations.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/migration.test.ts -t "vec0"`
  - Expected: `vec_sentences` and `vec_chunks` are created with active dimensions and recreated or marked stale safely on dimension changes.

- [x] 3.3 Add semantic metadata, chunk/sentence unit, deterministic rowid mapping, and pending state tables
  **Verification**:
  - Run: `pnpm test -- tests/store/migration.test.ts -t "semantic"`
  - Expected: Metadata and mapping tables are idempotent, preserve lineage, model pending/stale/rebuilding state, and do not break existing FTS5 or `observation_facts` queries.

- [x] 3.4 Add background job queue tables and priority/state transitions
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "semantic index"`
  - Expected: Queue claims, retry state, dedupe keys, priority for chunk-before-sentence jobs, and completion state converge deterministically.

- [x] 3.5 Add KG entity/triple schema with taxonomy metadata and graph-lite compatibility
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "knowledge graph"`
  - Expected: KG tables persist typed entities/triples with provenance/confidence while `observation_facts` remains queryable.

## Phase 4: Background Indexing, Rebuild, and KG Extraction
- [x] 4.1 Implement deterministic chunk and sentence splitting helpers in `src/retrieval/sentences.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "sentence"`
  - Expected: Sentence/chunk IDs and parent lineage remain stable across repeated indexing.

- [x] 4.2 Implement async chunk and sentence embedding workers in `src/indexing/jobs.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "background indexing"`
  - Expected: Save/update returns before embedding completion and workers write vec0 rows plus mapping metadata.

- [x] 4.3 Implement chunk-before-sentence priority and explicit post-save pending semantic state
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "semantic index"`
  - Expected: Newly saved content reports pending semantic coverage until background jobs finish, and chunk indexing is attempted before sentence indexing for the same source when jobs are split.

- [x] 4.4 Implement automatic rebuild enqueue on config hash mismatch
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "rebuild"`
  - Expected: Provider/model/dimensions/hash changes mark semantic state stale and enqueue one idempotent rebuild per scope/hash.

- [x] 4.5 Implement manual rebuild job path used by CLI/tooling
  **Verification**:
  - Run: `pnpm test -- tests/cli.test.ts -t "rebuild-index"`
  - Expected: Manual rebuild coexists with queued/running auto rebuild and exposes observable status.

- [x] 4.6 Implement KG extractor, taxonomy, normalization, and triple dedupe in `src/indexing/kg-extractor.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "knowledge graph"`
  - Expected: Eligible saved memory content produces deduped typed triples with source linkage and confidence.

## Phase 5: Four-Lane Retrieval and Context Assembly
- [x] 5.1 Implement retrieval defaults and sqlite-vec distance-score conversion in `src/retrieval/sqlite-vec.ts` / `src/retrieval/ranking.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "hybrid retrieval"`
  - Expected: Defaults are sentence k=100, chunk k=20, lexical limit=20, threshold=0.30, and L2 distance conversion is `exp(-distance / 20)`.

- [x] 5.2 Implement raw-query plus HyDE-answer semantic input fusion
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "HyDE"`
  - Expected: Raw query embedding always contributes, hypothetical-answer embedding contributes on success, and candidates retain `raw_query` vs `hyde_answer` attribution.

- [x] 5.3 Implement sentence-lane sqlite-vec KNN query helper
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "sentence KNN"`
  - Expected: Sentence semantic lane queries vec0 with `MATCH`, ranks by `distance`, applies k=100, converts scores, and filters below threshold 0.30.

- [x] 5.4 Implement chunk-lane sqlite-vec KNN query helper
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "chunk KNN"`
  - Expected: Chunk semantic lane queries vec0 with `MATCH`, ranks by `distance`, applies k=20, converts scores, and filters below threshold 0.30.

- [x] 5.5 Implement sanitized FTS5 prefix lexical lane
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "FTS prefix"`
  - Expected: Eligible tokens become sanitized `token*` terms joined with `OR`, lexical limit defaults to 20, and unsafe/short tokens are omitted.

- [x] 5.6 Implement graph/KG lane retrieval with `knowledge_triples` plus `observation_facts` fallback
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "graph lane"`
  - Expected: KG evidence is returned with source attribution and graph-lite facts remain available when KG extraction is partial.

- [x] 5.7 Implement lane fusion and scoring in `src/retrieval/ranking.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "fusion"`
  - Expected: Sentence, chunk, lexical prefix, and graph/KG evidence merge into deterministic ranked outputs with lane and semantic-input attribution.

- [x] 5.8 Implement mandatory surgical sentence trimming and small-to-big parent promotion
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "small-to-big"`
  - Expected: Thresholded sentence hits return targeted sentence snippets as primary evidence, and parent chunks/observations are promoted separately when broader context is required.

- [x] 5.9 Implement degraded-by-lane fallback and pending-state metadata
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "degraded"`
  - Expected: sqlite-vec load failure, vec0 unavailability, stale/rebuilding index, provider timeout, and post-save pending index states return lexical + graph/KG results without global failure.

## Phase 6: Tooling, CLI, and Compatibility
- [x] 6.1 Extend `mem_search` output with additive hybrid evidence/degraded/pending metadata while preserving legacy request contracts
  **Verification**:
  - Run: `pnpm test -- tests/tools/mem-search.test.ts`
  - Expected: Existing search tests pass and new hybrid evidence fields are additive.

- [x] 6.2 Preserve `mem_context` compatibility while optionally using fused recall evidence where appropriate
  **Verification**:
  - Run: `pnpm test -- tests/tools/mem-context.test.ts`
  - Expected: Existing context behavior remains valid and degraded/pending semantic states are handled cleanly.

- [x] 6.3 Add additive `mem_recall` tool if a separate agent-oriented fused recall surface is kept
  **Verification**:
  - Run: `pnpm test -- tests/index.test.ts -t "mem_recall"`
  - Expected: New tool is registered without requiring existing clients to change `mem_search` or `mem_context` usage.

- [x] 6.4 Add `thoth-mem rebuild-index` CLI command and startup worker hooks in `src/cli.ts` / `src/index.ts`
  **Verification**:
  - Run: `pnpm test -- tests/cli.test.ts -t "rebuild-index"`
  - Expected: CLI initiates rebuild/status flow and process startup/shutdown keeps workers recoverable.

## Phase 7: Evals and Documentation
- [x] 7.1 Expand `src/evals/retrieval.ts` and `tests/evals/retrieval.test.ts` for four-lane hybrid metrics and tuned hybrid retrieval defaults
  **Verification**:
  - Run: `pnpm test -- tests/evals/retrieval.test.ts`
  - Expected: Eval tests cover hybrid vs lexical baseline, KNN-bounded outputs, default thresholds/top-k/scoring, citation lineage, and degraded/pending fallback scenarios.

- [x] 7.2 Add FTS prefix, HyDE dual input, compression, and KG contribution metrics to retrieval eval output
  **Verification**:
  - Run: `pnpm run eval:retrieval`
  - Expected: Eval output reports prefix lexical recall, raw vs HyDE semantic contribution, sentence trimming/small-to-big metrics, and graph/KG contribution metrics.

- [x] 7.3 Update `README.md` with embedding config, local fallback, retrieval defaults, eventual semantic indexing, auto rebuild, manual rebuild, sqlite-vec fallback, and compatibility guarantees
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Documented commands and public surfaces match compiled code.

## Phase 8: Release Gates
- [x] 8.1 Run focused regression suites
  **Verification**:
  - Run: `pnpm test -- tests/config.test.ts tests/store/migration.test.ts tests/store/index.test.ts tests/tools/mem-search.test.ts tests/evals/retrieval.test.ts tests/cli.test.ts`
  - Expected: Focused suites pass for config, schema, indexing, retrieval, tooling, evals, and CLI.

- [x] 8.2 Run retrieval eval suite
  **Verification**:
  - Run: `pnpm run eval:retrieval`
  - Expected: Hybrid quality, defaults, FTS prefix recall, HyDE contribution, compression, KG contribution, citation lineage, and degraded/pending fallback metrics are produced without fatal errors.

- [x] 8.3 Run project build gate
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript compile and dashboard build complete successfully.

- [x] 8.4 Run full automated test gate
  **Verification**:
  - Run: `pnpm test`
  - Expected: Full Vitest suite passes with no regressions.

## Explicit Out-of-Scope Guardrails
- [x] G1 Keep dashboard/chrome extension work out of this branch scope.
  **Verification**:
  - Run: `git diff --name-only`
  - Expected: No dashboard/chrome-extension files are changed except incidental build/test outputs explicitly required by this branch.

- [x] G2 Do not add non-SQLite retrieval backend dependencies.
  **Verification**:
  - Run: `pnpm install`
  - Expected: Dependency graph includes SQLite/Transformers.js retrieval dependencies only, not Chroma/Neo4j/external vector DB clients.
