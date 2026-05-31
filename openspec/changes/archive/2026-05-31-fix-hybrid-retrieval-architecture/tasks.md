# Tasks: Fix Hybrid Retrieval Architecture

## Phase 1: RED Regression Coverage for Freshness, Provenance, and Lane Truth
- [x] 1.1 Add RED tests for stale semantic artifact cleanup after save/update/delete/rebuild flows in `tests/store/index.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "stale semantic cleanup"`
  - Expected: New tests fail first, proving stale `semantic_chunks`, `semantic_sentences`, and `semantic_vector_rowids` evidence can currently survive source updates/deletes/rebuild completion.

- [x] 1.2 Add RED tests for KG extraction source-safe/upsert-safe behavior and stale triple removal in `tests/store/index.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "kg source-safe"`
  - Expected: New tests fail first, proving retries/updates can currently keep wrong-source or stale `kg_triples` rows.

- [x] 1.3 Add RED tests for truthful observatory lanes using real hybrid evidence in `tests/store/visualization.test.ts` and `tests/http-viz.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/visualization.test.ts tests/http-viz.test.ts -t "observatory lane truth"`
  - Expected: New tests fail first, proving `sentence-vector`, `chunk-vector`, and `fact-kg` lanes are currently populated from lexical clones instead of lane-specific evidence.

- [x] 1.4 Add RED eval assertions for non-zero semantic/HyDE/KG contributions where fixtures support those lanes in `tests/evals/retrieval.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/evals/retrieval.test.ts -t "lane contribution gates"`
  - Expected: New tests fail first when semantic/HyDE/KG contribution rates are zero despite fixture coverage.

- [x] 1.5 Add RED tests for multi-process-safe semantic job claiming in `tests/store/index.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "atomic claim"`
  - Expected: New tests fail first, proving separate workers can claim the same pending semantic job when selection and state update are not atomic.

- [x] 1.6 Add RED tests for explicit fusion policy and lane-order/weight effects in `tests/store/index.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "fusion policy"`
  - Expected: New tests fail first, proving raw max-score fusion can ignore the configured lane policy and produce misleading primary evidence.

## Phase 2: Semantic + KG Correctness Implementation
- [x] 2.1 Implement source-revision-aware semantic invalidation and cleanup across indexing paths in `src/indexing/jobs.ts` and `src/store/index.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "stale semantic cleanup"`
  - Expected: Semantic cleanup tests pass; updated/deleted observations no longer return stale semantic evidence after declared completion.

- [x] 2.2 Implement deterministic KG lineage/upsert/tombstone lifecycle for update/retry convergence in `src/indexing/kg-extractor.ts` and `src/store/index.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "kg source-safe"`
  - Expected: KG tests pass; triples are source-correct after updates/retries and stale triples are removed deterministically.

- [x] 2.3 Implement atomic semantic job claiming suitable for multi-process workers in `src/indexing/jobs.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "atomic claim"`
  - Expected: Concurrent claim tests pass with exactly-once-at-a-time claim semantics and idempotent retry behavior.

## Phase 3: Fusion, Lane Semantics, and Evidence Policy
- [x] 3.1 Implement explicit fusion/ranking policy with comparable lane semantics, lane-order enforcement, and configurable lane weights in `src/retrieval/ranking.ts` and `src/store/index.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "fusion policy"`
  - Expected: Fusion tests pass with deterministic ranking where configured lane order/weights materially affect tie-breaking and final ordering.

- [x] 3.2 Consolidate `observation_facts` behavior as deterministic KG evidence fallback/sublane without masking stronger KG evidence in `src/store/index.ts` and `src/store/types.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts -t "observation_facts fallback"`
  - Expected: Retrieval tests pass with explicit provenance for `kg_triples` vs `observation_facts`, and no hidden useful facts.

- [x] 3.3 Fix observatory lane construction to report only truthful lane evidence and explicit lane state reasons in `src/store/index.ts`, `src/http-routes.ts`, and `src/http-openapi.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/visualization.test.ts tests/http-viz.test.ts -t "observatory lane truth"`
  - Expected: Observatory lane tests pass with accurate lane presence and state (`ready`, `pending`, `degraded`, `unavailable`) backed by real evidence.

## Phase 4: Naming, Compatibility, and Public Contract Cleanup
- [x] 4.1 Rename public docs/types/API language from graph-lite-first to KG/ledger canonical terminology while preserving compatibility routes/contracts in `src/http-openapi.ts`, `src/tools/mem-recall.ts`, `src/tools/project-views.ts`, and `README.md`
  **Verification**:
  - Run: `pnpm test -- tests/http-viz.test.ts tests/dashboard/api-client.test.ts tests/store/graph-lite.test.ts`
  - Expected: Compatibility tests pass for legacy `/graph` and graph-lite consumers while canonical KG/ledger naming is exposed in current interfaces.

## Phase 5: Evals and Release Gates
- [x] 5.1 Expand retrieval eval logic and assertions for stale-data prevention, provenance integrity, lane truth, and contribution minima in `src/evals/retrieval.ts` and `tests/evals/retrieval.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/evals/retrieval.test.ts`
  - Expected: Eval tests pass and fail deterministically when semantic/HyDE/KG lanes should contribute but do not.

- [x] 5.2 Run focused hybrid architecture regression suites
  **Verification**:
  - Run: `pnpm test -- tests/store/index.test.ts tests/store/visualization.test.ts tests/http-viz.test.ts tests/evals/retrieval.test.ts tests/store/graph-lite.test.ts`
  - Expected: Focused suites pass for semantic freshness, KG lineage, fusion policy, observatory lane truth, and compatibility.

- [x] 5.3 Run build and full test release gates
  **Verification**:
  - Run: `pnpm run build && pnpm test`
  - Expected: TypeScript/dashboard build and full Vitest suite pass with no regressions.
