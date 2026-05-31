# Verification Report: Hybrid Core Retrieval for thoth-mem

## Completeness
- Change: `hybrid-core-retrieval`
- Pipeline: full SDD
- Tasks artifact status: all checklist items are marked complete in `openspec/changes/hybrid-core-retrieval/tasks.md`.
- Artifact set reviewed: proposal, design, tasks, and all spec deltas under `specs/**/spec.md`.

## Build and Test Evidence
- Root-provided evidence accepted and cross-checked against scope:
  - `pnpm test -- tests/config.test.ts tests/store/migration.test.ts tests/store/index.test.ts tests/tools/mem-search.test.ts tests/evals/retrieval.test.ts tests/cli.test.ts` (93 passed)
  - `pnpm run eval:retrieval` (completed; hybrid retrieval metrics produced)
  - `pnpm run build` (passed)
  - `pnpm test` (44 files, 412 passed)
  - Guardrails G1/G2 passed (no dashboard/chrome-extension scope drift; no non-SQLite vector backend deps)

## Compliance Matrix
Legend: PASS = scenario satisfied with code and/or test evidence.

### Config (5/5)
- PASS `Environment overrides win` -> `src/config.ts`, `tests/config.test.ts` (`embedding` cases).
- PASS `Persisted config used when env unset` -> `src/config.ts`, `tests/config.test.ts`.
- PASS `Local fallback only when provider unset` -> `src/config.ts`, `tests/config.test.ts`.
- PASS `Config hash stable for equivalent config` -> `src/config.ts`, `tests/config.test.ts`.
- PASS `Config hash changes on embedding identity change` -> `src/config.ts`, `tests/config.test.ts`.

### Store (6/6)
- PASS `sqlite-vec load succeeds` -> `src/retrieval/sqlite-vec.ts`, store startup in `src/store/index.ts`.
- PASS `sqlite-vec load fails degrades semantic lanes` -> `src/retrieval/sqlite-vec.ts`, `src/store/index.ts`, `tests/store/migration.test.ts`.
- PASS `vec0 tables exist for sentence/chunk` -> `src/store/migrations.ts`, `tests/store/migration.test.ts`.
- PASS `deterministic rowid mapping + lineage` -> `src/indexing/jobs.ts`, `tests/store/index.test.ts`.
- PASS `hash mismatch marks stale` -> `src/store/index.ts`, `src/indexing/jobs.ts`, `tests/store/index.test.ts`.
- PASS `lexical + graph-lite compatibility preserved` -> `src/store/schema.ts`, `src/store/index.ts`, tests around `observation_facts` and lexical search.

### Indexing (7/7)
- PASS `save completes before deep indexing` -> job enqueue flow in `src/store/index.ts`; tests in `tests/store/index.test.ts`.
- PASS `save returns pending semantic state` -> `src/store/index.ts`; tests in `tests/store/index.test.ts`.
- PASS `retrieval observes pending coverage` -> retrieval metadata in `src/store/index.ts`; tool surfacing in `src/tools/mem-search.ts` and `src/tools/mem-context.ts`.
- PASS `chunk-before-sentence priority` -> priorities and claim order in `src/store/index.ts`, `src/indexing/jobs.ts`; tested in `tests/store/index.test.ts`.
- PASS `sqlite-vec write includes rowid + lineage` -> `src/indexing/jobs.ts` upsert flow; `tests/store/index.test.ts`.
- PASS `hash mismatch auto-enqueues rebuild` -> `src/store/index.ts` (`enqueueRebuildOnConfigMismatch`), `src/indexing/jobs.ts`; tested.
- PASS `jobs idempotent/retryable` -> `src/indexing/jobs.ts`; tests for dedupe/convergence.

### Retrieval (14/14)
- PASS four-lane fusion -> `src/store/index.ts` + `src/retrieval/ranking.ts`.
- PASS sentence lane vec0 MATCH k=100 -> query in `src/store/index.ts`; tested.
- PASS chunk lane vec0 MATCH k=20 -> query in `src/store/index.ts`; tested.
- PASS low-score semantic filter at threshold -> filtering in semantic lane mapping; tested.
- PASS distance conversion `exp(-distance/20)` default -> `src/retrieval/sqlite-vec.ts` + defaults.
- PASS HyDE dual-input contribution -> `src/retrieval/hyde.ts`, `src/store/index.ts`, tests.
- PASS HyDE failure fallback to raw query -> same modules/tests.
- PASS sanitized FTS5 prefix lexical matching -> via `sanitizeFTSPrefix` usage in `src/store/index.ts`; tests cover prefix behavior.
- PASS unsafe/short tokens omitted -> sanitize path + tests.
- PASS mandatory sentence-first trimming on strong sentence evidence -> assembly behavior in `src/store/index.ts` + `tests/store/index.test.ts`.
- PASS parent context promoted separately (small-to-big) -> `src/retrieval/ranking.ts` + store assembly/tests.
- PASS degraded-by-lane fallback -> `src/store/index.ts` degraded semantics + lexical/KG fallback.
- PASS recent saves explicit eventual semantic consistency -> pending signaling across retrieval/tool outputs.
- PASS output contains lane/source attribution and lineage fields -> ranking/store/tool outputs + eval assertions.

### Knowledge Graph (7/7)
- PASS typed triples extracted from memory content -> `src/indexing/kg-extractor.ts`, job pipeline.
- PASS session/prompt-like content eligible via save/indexing surfaces -> extraction integrated in indexing flow.
- PASS taxonomy breadth >=22 entities and >=20 relations -> `src/indexing/kg-extractor.ts` constants.
- PASS provenance/confidence persisted and consumable -> KG candidate fields in retrieval flow.
- PASS idempotent dedupe behavior -> triple hash + dedupe key strategy.
- PASS `observation_facts` graph-lite fallback remains -> schema and retrieval queries in `src/store/index.ts`.
- PASS KG lane participates in fused ranking -> retrieval fusion includes kg lane.

### Tools (5/5)
- PASS search/recall expose fused evidence -> `src/tools/mem-search.ts`, `src/tools/mem-recall.ts`, `src/tools/mem-context.ts`.
- PASS degraded semantic state signaled with fallback -> tools include pending/degraded metadata.
- PASS pending state after save surfaced -> tools include `pending` signal.
- PASS manual `rebuild-index` available -> `src/cli.ts`, `src/index.ts`, `tests/cli.test.ts`.
- PASS backward compatibility for `mem_search`/`mem_context` with additive fields -> tests pass.

### Evals (7/7)
- PASS KNN defaults validated -> `src/evals/retrieval.ts`, `tests/evals/retrieval.test.ts`.
- PASS HyDE success/failure both measured -> eval pipeline and tests.
- PASS FTS prefix recall measured -> eval metrics and tests.
- PASS hybrid vs lexical baseline measured -> eval summary fields/tests.
- PASS citation/lineage measured -> eval assertions.
- PASS sentence trimming + parent promotion metrics measured -> eval report sections/tests.
- PASS degraded/pending fallback measured without fatal failure -> eval report and tests.

## Design Coherence (full pipeline only)
- The implementation reflects design decisions for: sqlite-vec mandatory semantic engine with degraded fallback, Hybrid Retrieval defaults, dual-input HyDE, sentence-first precision with small-to-big promotion, eventual semantic consistency, auto/manual rebuild, and expanded KG lane.
- No evidence of out-of-scope drift into dashboard/chrome-extension areas.

## Issues Found
- Warning: Hybrid persistence expected a thoth-mem save (`topic_key: sdd/hybrid-core-retrieval/verify-report`), but `mem_save` tooling was not callable in this delegated environment. OpenSpec artifact persisted successfully.

## Verdict
- **pass with warnings**
- Scenario compliance: **51/51 PASS**
