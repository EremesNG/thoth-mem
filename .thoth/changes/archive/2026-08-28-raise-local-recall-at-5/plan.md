# Implementation Plan: Raise Local Recall at 5

## Technical context

The current default `any-prefix-v1` sanitizes a bounded 32-term window, selects the three longest unique terms, executes one relaxed OR-prefix query, and retains at most two lexical rows. It reaches RecallAny@5 `82.553%` with p95 `1.3659 ms`. The existing `all-then-any-prefix-v1` strict/relaxed path reaches `94.894%` but costs p95 `3.6591 ms`. Per-question comparison proves the lists are complementary: the default alone wins 8 questions, the broad path alone wins 66, and their oracle union reaches `96.596%`.

`MemoryService.recall` currently executes strict then relaxed stages, excludes all prior IDs from the next stage, and appends rows to an insertion-ordered `Map`. It therefore cannot observe cross-stage agreement and does not implement an explicit fusion policy. E0 introduces a distinct internal candidate with a strict query over the existing sanitized control terms, a relaxed query over the current three selected terms, bounded per-stage rank lists, and a final five-row lexical cap. Existing strategies retain byte-for-byte plan configuration and service behavior until a validated outcome promotes E0.

The implementation remains TypeScript/ESM, local SQLite FTS5, schema revision 5, and the exact six-tool MCP surface. It adds no persisted row, migration, dependency, projection, embedding, vector extension, network path, or model call. The comparison report advances from v2 to v3 because its lane inventory, Top-5 promotion evidence, and fusion-work reconciliation change structurally; every earlier report remains immutable.

## Ownership

- **Owner**: adaptive root implementation writer.
- **Net-gain rationale**: planner identity, recall ranking, diagnostics, report semantics, and benchmark promotion are one ordered behavioral contract. Root continuity avoids drift between coupled surfaces already loaded during Full exploration; separate Oracle instances retain independent plan and final judgments.
- **Mutable surface**: `src/memory-core/sqlite/fts.ts`, `src/memory-core/service.ts`, an optional focused helper under `src/memory-core/retrieval/`, retrieval/report/runner tests and benchmark modules, routed testing documentation, the package file inventory for the new immutable baseline, and this change's artifacts. No persistence-schema, dependency, or runtime-package expansion is planned.
- **Checks**: vertical TDD through the confirmed seams below, focused Vitest, TypeScript/build, broader repository checks from `docs/agent/testing.md`, one create-only offline 470-question comparison, report validation, source/schema/dependency/tool inventory review, `simplify`, and independent Oracle verification.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — E0 is selected only through the existing internal `MemoryService` benchmark option; public schemas and the six registered tools remain unchanged.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — all candidate generation and fusion remain deterministic SQLite FTS5 behavior and require no optional projection, embedding, model, or remote service.
- **P3 — Harness-Agnostic Memory Contract**: PASS — the change is below every harness adapter and modifies neither authoritative records nor harness-specific payload handling.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — final lexical output is capped at five, caller limits and character budgets remain authoritative, and compact/context/get progression is unchanged.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — E0 has an explicit new internal strategy/report identity, preserves immutable evidence, and adds no compatibility alias, dual path, or hidden persistence behavior.

## Design

### 1. Add a distinct E0 plan without changing the default

Extend `LEXICAL_QUERY_STRATEGY_IDS` with `strict-selected-any-cap5-rrf-v1`. Add a frozen configuration that declares:

- the existing control tokenizer for the strict expression;
- the current candidate tokenizer, deduplication, 32-term input window, three-longest selection, and original-position restoration for the relaxed expression;
- strict `AND` followed by relaxed `OR` stage topology;
- per-stage candidate cap `5` and final lexical cap `5` bounded again by the caller's remaining limit;
- fusion `rrf-v1`, rank constant `60`, equal strict/relaxed weights, exact-first precedence, and deterministic tie fields.

Extend `LexicalQueryPlan` with an optional immutable fusion contract and per-stage cap. Include all ranking constants and topology in the configuration hash and include the resolved stages/fusion in the plan hash for every non-empty normalized plan. Preserve the current empty-query behavior: `buildFtsQueryPlan` returns `null`, lexical stages are skipped as `empty_query`, and diagnostic configuration/plan hashes are `null`. Existing three strategy objects, hashes, query expressions, caps, and `DEFAULT_LEXICAL_QUERY_STRATEGY = 'any-prefix-v1'` remain unchanged during implementation.

### 2. Execute independent bounded stage lists and fuse only for E0

Preserve the current append/exclude algorithm for plans without fusion. For E0:

1. keep exact structured matches in their current authoritative order;
2. compute the remaining caller capacity and skip lexical work when it is zero;
3. execute strict and relaxed queries independently, excluding only exact IDs, with each stage bounded by `min(5, remainingCapacity)`;
4. assign one-based rank positions and compute reciprocal-rank-fusion score `weight / (60 + rank)` per stage;
5. sum contributions by memory ID, retaining the best source row for hydration metadata;
6. sort lexical candidates by fused score descending, best stage rank ascending, strict rank ascending, relaxed rank ascending, `created_at` descending, then ID ascending;
7. take at most `min(5, remainingCapacity)`, append after exact matches, hydrate once, and expose the fused value as the lexical score component.

This makes agreement observable without comparing raw BM25 values from different queries. It preserves existing project/history/status filters, exact priority, memory/evidence hydration, source identity, snippets, budget accounting, and result order. The helper may live in `src/memory-core/retrieval/rank-fusion.ts` only if that reduces service complexity; it remains internal and is verified primarily through `MemoryService.recall`.

### 3. Make fusion work auditable without exposing private content

Keep the fixed exact/strict/relaxed/post-query stage sequence. Add one internal `fusedLexicalRows` work counter:

- `strict.rows + relaxed.rows` equals raw ranked FTS rows for E0, including cross-list duplicates;
- `fusedLexicalRows` equals the final unique lexical rows admitted after RRF and cap;
- hydrated/post-query/returned rows reconcile with exact rows plus fused lexical rows, subject only to the existing character-budget truncation of returned items;
- non-fusion strategies report `fusedLexicalRows` equal to their admitted lexical rows so one fixed diagnostic schema remains usable.

The observer remains opt-in, monotonic, behavior-neutral, and privacy-safe. No query text, content, title, topic, memory ID, or source ID is added to diagnostic aggregates beyond the existing benchmark provenance structures.

### 4. Admit E0 in the base retrieval report contract

Before comparison v3, extend the closed lexical-strategy allowlist in `benchmarks/retrieval-report.mjs` and the matching enum in `benchmarks/retrieval-report.schema.json` with `strict-selected-any-cap5-rrf-v1`. Add red/green cases in `tests/benchmarks/retrieval-report.test.ts` that accept a structurally valid E0 lane, reject an unknown strategy, and continue validating representative committed v1 lane reports. The retrieval report remains `thoth-mem.retrieval-benchmark-report.v1`: only the closed strategy value set expands, while its document shape, metrics, provenance, budgets, and promotion placeholder remain unchanged.

### 5. Introduce lexical comparison report v3

Preserve the v2 validator for immutable historical reports and add v3 semantics for four exact lane keys:

1. `all-prefix-v1` — latency/coverage control;
2. `any-prefix-v1` — current default reference;
3. `all-then-any-prefix-v1` — broad quality reference;
4. `strict-selected-any-cap5-rrf-v1` — sole promotion candidate.

Historical provenance is split explicitly:

- keep `benchmarks/lexical-comparison-baseline.json` unchanged and bound to `benchmarks/results/longmemeval-s-lexical-comparison-report.json`, schema v1, SHA-256 `319dd6155059afcc180f7638deb841a9ca56c1c242f8d63c6a6c87209c9cb358`;
- add `benchmarks/lexical-recall-at-5-baseline.json` with schema `thoth-mem.lexical-recall-at-5-baseline.v1`, bound to `benchmarks/results/longmemeval-s-lexical-latency-report-r4.json`, schema v2, SHA-256 `842805cc423cc48d33cf07b05e73c25967f532b79e24131b44407d87b1e6fe36`;
- record in the new manifest the exact r4 lane config hashes and metrics: control `e792c3009bbab297d654684da8b4ad1b6463277716aed860f765f9dbc38714e6` / RecallAny@5 `0.12978723404255318`, fractional `0.09801418439716311`, RecallAll `0.06595744680851064`, NDCG `0.10450544310213`, MRR `0.12872340425531914`; default `d31ca3f7d1a0fd6662af2148cd51d1f3149b681012f8f756629d6bdd67aeb553` / `0.825531914893617`, `0.6770212765957448`, `0.5404255319148936`, `0.6965441169016003`, `0.7946808510638298`; broad `40cd3522257085172694037746cc7cd720ded68f65c5d6bae1f514cf273eb443` / `0.948936170212766`, `0.8792553191489364`, `0.7872340425531915`, `0.8538289016145295`, `0.8716652534643773`; every lane SQLite total `1,519,955,968` bytes.

V3 validates both manifests independently, never rewrites them, and adds the candidate's declared cap/fusion identity, the new work counter, and promotion evidence for RecallAny@5 hit count, fractional Recall@5, RecallAll@5, NDCG@10, MRR, p95, SQLite bytes, provenance, errors, and calls. Promotion recomputes:

- at least 447 RecallAny@5 hits out of the same 470 questions using integer arithmetic;
- candidate fractional Recall@5, RecallAll@5, and NDCG@10 no lower than the maximum co-run value across the current-default and broad-reference lanes;
- candidate p95 no greater than two times the co-run `all-prefix-v1` control;
- exactly equal aggregate SQLite bytes across all four lanes;
- complete provenance, matching configuration identity, and literal zero errors/model/network/LLM calls.

Only E0 participates as a promotion candidate, so the two reference lanes cannot create a false multiple-winner decision. Structural and semantic validators reject unknown/missing lanes, stale hashes, mismatched fusion/caps, compensated diagnostic fabrication, persisted promotion tampering, unequal budgets, invalid Top-5 counts, and non-finite measurements.

### 6. Drive implementation through agreed behavioral seams

The TDD seams proposed for user confirmation are:

- **Product retrieval seam**: construct `MemoryService` against a disposable SQLite database, save memories through the service, invoke `recall` with an internal E0 strategy only from tests/benchmark code, and assert returned public `RecallResult` order, scores, provenance, limits, and budgets.
- **Evaluation seam**: validate individual E0 lanes through `validateRetrievalReport`, then create and validate v3 reports through `createLexicalComparisonReport`/`validateLexicalComparisonReport` and the programmatic LongMemEval comparison runner; assert recomputed evidence and fail-closed decisions.
- **Public-boundary seam**: inspect the registered MCP tool inventory and packed/source dependency/schema contracts to prove exactly six tools and zero vector/schema/dependency expansion.

Planner-level assertions remain narrow support for stable configuration/query identity; they do not replace service behavior tests. Each vertical slice follows red, minimal green, then the next behavior. No test queries private tables as the primary assertion for retrieval ordering.

### 7. Verify E0 offline and promote only on evidence

After focused and broader checks pass, run one create-only offline four-lane comparison to a new immutable path such as `benchmarks/results/longmemeval-s-lexical-recall-at-5-report.json`. Do not prepare or download data and do not overwrite any prior report. Validate v3 and independently recompute its SHA-256.

If E0 passes every gate, update `DEFAULT_LEXICAL_QUERY_STRATEGY` to E0 in a separate evidence-gated patch, update default-behavior tests and routed retrieval/testing documentation, rebuild, and rerun the full verification envelope. If E0 fails, keep `any-prefix-v1`; persist the valid failed evidence and exact criterion. IDF selection, impact projections, or a router require a revised spec/plan and a fresh Oracle review before implementation.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add a distinct frozen E0 configuration with strict/all-term and relaxed/three-selected-term stages, per-stage/final cap 5, RRF constants, and hashed identity | `src/memory-core/sqlite/fts.ts` | Planner identity support tests plus `MemoryService.recall` behavior |
| FR-002 | Reuse current tokenizers/sanitization; make fusion part of plan identity and never compare raw cross-query BM25 scores | `src/memory-core/sqlite/fts.ts`, `src/memory-core/service.ts` | Adversarial query cases through service recall |
| FR-003 | Conditional independent stage collection, exact-first RRF merge, one bounded hydration, no persisted state | `src/memory-core/service.ts`, optional `src/memory-core/retrieval/rank-fusion.ts` | Disposable service fixture across overlap, limits, project, history, provenance |
| FR-004 | Admit E0 in the base v1 retrieval-report value set, then run four sequential isolated lanes with unchanged corpus/order/Top-20/delivery/timing boundaries and separately bound v1/r4 baselines | `benchmarks/retrieval-report.mjs`, `benchmarks/retrieval-report.schema.json`, `benchmarks/lexical-recall-at-5-baseline.json`, comparison/runner modules | Retrieval-report tests, programmatic runner tests, exact baseline digest tests, and official create-only report |
| FR-005 | Add Top-5 hit/fractional/all metrics and integer 447/470 gate without relabelling K | `benchmarks/lexical-comparison-report.mjs`, retrieval report structures/schema | Known-answer metric fixtures and mutation tests |
| FR-006 | V3 admits only E0 as candidate and requires quality floor, p95 ratio, bytes, provenance, identity, errors/calls | comparison validator/schema, default constant/docs | Passing/failing promotion fixtures, source-hash match, pre/post default test |
| FR-007 | No tool/schema/dependency/vector change | `src/tools/index.ts`, `src/memory-core/sqlite/schema.ts`, manifests/packaging inventory | Exact-six test, schema revision assertion, dependency/status/diff review |

## Optional support artifacts

- `research.md`: not needed; the completed Deep Research decision memo under `docs/research/recall-at-5-latency-2026-08-28/` is canonical and the plan records the selected E0 design.
- `data-model.md`: not needed; E0 adds zero tables, columns, projection records, or schema revisions.
- `contracts/`: not needed; the internal fusion/diagnostic/report contracts are fully mapped above and remain covered by source types plus executable validators.
- `quickstart.md`: not needed; there is no new public command, tool, configuration, or operator workflow.

## Risks and migrations

- **RRF constants overfit the corpus**: use the conventional fixed rank constant `60`, equal weights, and no learned feature or gold-aware tuning. Any later weight change receives a new config hash and evidence.
- **Two stage queries exceed p95**: bound each list and final hydration at caller capacity/five, retain same-run diagnostics, and fail without promotion. The gate is never weakened.
- **Raw stage rows exceed final cap**: v3 distinguishes raw ranked FTS rows from fused/admitted rows and validates both; no diagnostic may imply that ten ranked rows are five units of work.
- **Reference lane accidentally becomes promotable**: v3 separates reference IDs from the sole candidate ID and rejects any persisted selection outside E0.
- **Public score semantics drift**: only E0 exposes the versioned RRF value as `scoreComponents.lexical`; existing strategies remain unchanged and item order is asserted at the service seam.
- **Footprint regression**: no schema or dependency changes are permitted and all four lanes must report exactly equal aggregate SQLite bytes. Any difference is a hard failure.
- **Report format incompatibility**: base retrieval report remains v1 with one admitted strategy value; comparison v3 uses a new schema identifier and validator path; all committed retrieval v1 and comparison v1/v2 reports and hashes remain untouched. Separate baseline manifests prevent r4 evidence from being confused with the original comparison. Rollback removes only E0/v3 code, the new r4 baseline manifest, and the new unpromoted report.
- **Packed evidence drift**: include the new r4 baseline manifest beside the existing lexical baseline in `package.json#files`; packaging tests keep this inventory exact without adding a dependency or executable runtime surface.
- **Outcome fails at E0**: preserve valid evidence, leave the default untouched, revise canonical artifacts for E1 rather than silently adding IDF, projections, a router, or embeddings.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the design confines strategy selection and diagnostics to internal service/benchmark interfaces and verifies the unchanged six-tool registry.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — fixed RRF over bounded SQLite FTS5 ranks is deterministic, local, and projection-free; embeddings and semantic lanes are explicit non-goals.
- **P3 — Harness-Agnostic Memory Contract**: PASS — no storage, taxonomy, adapter, or harness payload changes occur and all clients retain one shared core behavior.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — E0's final lexical cap is five, smaller caller limits win, compact/context character budgets and surgical snippets remain enforced, and diagnostics report raw versus admitted work honestly.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — candidate/report identities, promotion and rollback are explicit, immutable prior reports remain valid, and no alias, fallback, or dual storage is introduced.
