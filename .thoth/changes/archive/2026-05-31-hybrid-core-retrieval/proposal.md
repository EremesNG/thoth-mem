# Proposal: Hybrid Core Retrieval for thoth-mem

## Intent
Adopt hybrid retrieval as the branch scope for thoth-mem: real SQLite-native vector KNN via `sqlite-vec`, multi-lane fusion (sentence/chunk semantic + FTS5 + graph/KG), resilient degraded fallback, HyDE, surgical sentence trimming, small-to-big retrieval, background indexing, and broad knowledge-graph extraction beyond graph-lite only.

## Scope
### In Scope
- Add `sqlite-vec` as a required runtime dependency for semantic retrieval/indexing.
- Load `sqlite-vec` with `better-sqlite3` at store startup using the official package flow (`import * as sqliteVec from 'sqlite-vec'`; `sqliteVec.load(db)`).
- Create required `vec0` virtual tables for chunk vectors and sentence vectors, dimensioned from active embedding metadata.
- Add `@huggingface/transformers` for local Transformers.js embedding fallback only when no remote provider is configured.
- Index chunk and sentence vectors in background workers with deterministic rowid mappings and lineage metadata.
- Query semantic lanes with real sqlite-vec KNN (`MATCH`, `distance`, bounded `LIMIT`/`k`) for sentence and chunk retrieval lanes.
- Use tuned hybrid retrieval defaults unless explicitly reconfigured: sentence top-k `100`, chunk top-k `20`, lexical limit `20`, minimum semantic score `0.30`, and sqlite-vec L2 distance score conversion `score = exp(-distance / 20)`.
- Fuse sentence-vector, chunk-vector, lexical FTS5, and graph/KG lanes into one ranked retrieval output.
- Preserve degraded fallback when semantic lanes are unavailable (sqlite-vec load failure, vec tables unavailable, stale/rebuilding index, provider timeout): lexical FTS5 + graph/KG remain available and non-fatal.
- Add HyDE query augmentation as dual semantic inputs: always embed the raw query, and when HyDE succeeds embed the hypothetical answer separately; fuse both semantic result sets without making HyDE a hard dependency.
- Add surgical sentence trimming as mandatory behavior when sentence evidence meets explicit score/confidence conditions, with small-to-big parent promotion as separate context expansion.
- Use sanitized FTS5 prefix matching for lexical recall (`token*` joined with `OR` for eligible tokens) so lexical recall catches variants such as `encrypt*` -> `encryption`.
- Clarify post-save consistency: primary persistence, FTS5, and graph/KG-compatible state are available immediately, while chunk/sentence semantic recall is eventual until background indexing completes and must be signaled as pending/degraded.
- Expand graph scope to a broader knowledge graph layer: extract subject-relation-object triples from saved prompts, observations, session-summary-like memory content, and conversation-like text into typed entities and typed relations with provenance and confidence.
- Define a thoth-mem adapted KG taxonomy with at least 22 entity categories and at least 20 relation categories, preserving compatibility with existing `observation_facts` as graph-lite fallback/source.
- Keep configurable embedding provider resolution under data-dir config (`~/.thoth` via resolved data dir) with env overrides, remote embeddings (Ollama/LM Studio-compatible), provider/model/dimensions/config-hash lineage, automatic background rebuild on hash mismatch, and manual `thoth-mem rebuild-index`.

### Out of Scope
- Dashboard UI, Chrome extension, or other product-surface UX work.
- Non-SQLite vector engines (Chroma/Neo4j/etc.).
- Full Hybrid Retrieval parity outside core retrieval/indexing/KG behavior listed above.
- Requiring manual rebuild after provider/model changes as the only recovery path; auto rebuild is required.

## Approach
1. Make sqlite-vec mandatory in schema and runtime boot path, while treating load/table failures as semantic lane degradation rather than process-fatal errors.
2. Resolve embedding provider config and dimensions before semantic indexing; persist canonical provider/model/dimensions/config-hash metadata.
3. Add deterministic rowid mapping tables for sentence/chunk vector records and provenance lineage.
4. Build async idempotent background indexing for chunks, sentences, config-hash rebuilds, and KG extraction.
5. Run raw-query and optional HyDE-answer embeddings through sentence and chunk semantic KNN via sqlite-vec `MATCH` + `distance` queries; run FTS5 prefix matching and graph/KG in parallel.
6. Fuse all four lanes with deterministic scoring defaults, citations, mandatory surgical sentence trimming under the defined conditions, and small-to-big parent promotion.
7. Detect stale semantic index by embedding config hash mismatch and auto-enqueue rebuild; keep manual `rebuild-index` for repair/control.
8. Maintain retrieval availability when semantic lanes are degraded and clearly report eventual semantic indexing state after saves.
9. Expand evals to validate semantic KNN correctness, fusion quality, HyDE dual embedding fallback, FTS5 prefix recall, KG contribution, context compression, and degraded fallback resilience.

## Affected Areas
- `package.json` and `pnpm-lock.yaml` for `sqlite-vec` and `@huggingface/transformers`.
- `src/config.ts` for embedding provider resolution, config-file loading, env overrides, retrieval defaults, and hash metadata.
- `src/store/schema.ts` / `src/store/migrations.ts` for vec0 tables, metadata tables, job queue tables, and KG tables.
- `src/store/index.ts` for sqlite-vec load, staleness detection, indexing orchestration, hybrid retrieval fusion, degraded fallback, and save-path queue hooks.
- `src/store/types.ts` for semantic/KG/index state contracts.
- `src/retrieval/*` for embedding providers, HyDE, sentence splitting, sqlite-vec query helpers, FTS5 prefix query building, ranking/fusion, and context assembly.
- `src/indexing/*` for background indexing, rebuild jobs, and KG extraction workers.
- `src/tools/*` and `src/cli.ts` / `src/index.ts` for search/recall exposure, pending/degraded signaling, and rebuild surfaces.
- `src/evals/retrieval.ts`, retrieval tests, store tests, config tests, CLI tests, and docs.

## Risks
- sqlite extension load failures on unsupported environments.
- Embedding dimension/config drift causing stale or invalid vector indexes.
- KG extraction noise (entity/relation false positives) affecting ranking quality.
- Local Transformers.js fallback can increase install size and cold-start cost.
- Dynamic vec0 table recreation must be idempotent when dimensions change.
- Eventual semantic indexing can surprise callers if pending/degraded state is not explicit.

## Rollback Plan
1. Mark semantic lanes degraded if sqlite-vec, vec tables, or provider calls are unavailable.
2. Continue serving FTS5 + graph/KG retrieval.
3. Disable HyDE and semantic lane fusion while keeping persisted observations, facts, KG records, and vector metadata intact.
4. Pause background workers if needed; manual rebuild can resume later without corrupting rowid lineage.

## Success Criteria
- `sqlite-vec` is installed, loaded, and used for semantic retrieval in supported runtime paths.
- Sentence and chunk semantic lanes use vec0 KNN (`MATCH`/`distance`) instead of Node-side similarity.
- Retrieval defaults are implemented and tested: sentence k=100, chunk k=20, lexical limit=20, score threshold=0.30, distance score `exp(-distance / 20)`.
- Fused retrieval includes sentence vectors, chunk vectors, FTS5 prefix matching, and graph/KG lanes.
- HyDE uses raw-query plus hypothetical-answer semantic inputs with raw-query fallback.
- Surgical sentence trimming is mandatory when matching sentence evidence meets the defined threshold conditions, with small-to-big promotion available separately.
- KG extraction covers saved memory content with at least 22 entity categories and 20 relation categories, plus provenance/confidence.
- Degraded semantic states and post-save pending semantic indexing do not hard-fail retrieval; lexical + graph/KG remain functional.
- Config hash mismatch triggers automatic idempotent rebuild enqueue; manual `thoth-mem rebuild-index` works.
