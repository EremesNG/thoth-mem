# Implementation Plan: Compare Lexical Query Strategies

## Technical context

The authoritative runtime path is `MemoryService.recall()` over SQLite FTS5. `buildFtsQuery()` currently normalizes at most 12 terms and joins quoted prefixes with `AND`; the archived official control therefore returned a ranked item for only 62/470 eligible LongMemEval-S questions. The report and local reference implementations support testing a broader lexical path without adding a semantic dependency: Engram exposes explicit all/any FTS5 matching, while AgentMemory's seven-tool local fallback confirms that a small tool surface does not itself provide stronger retrieval (`memory_smart_search` and `memory_recall` share the same literal filter there).

This change keeps the exact six MCP tools and introduces an internal lexical strategy seam. It compares three deterministic strategies:

- `all-prefix-v1`: the byte-compatible current control;
- `any-prefix-v1`: candidate normalization deduplicates the bounded prefix terms and joins them with `OR`;
- `all-then-any-prefix-v1`: legacy-compatible strict results first, then deterministic deduplicated relaxed results only until the existing limit is filled.

The LongMemEval runner will evaluate each strategy through the real built `MemoryService`, not a benchmark-only ranker. A comparison envelope will embed individually valid retrieval reports and evaluate the predeclared promotion policy. No schema migration or new package dependency is needed.

Implementation ownership remains with root because query normalization, service ordering, benchmark execution, report validation, and the conditional runtime default form one coupled contract and root has already loaded the relevant source and archived evidence. A single writer avoids incompatible intermediate strategy/report shapes. Independent final verification remains Oracle-owned.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — all strategy selection is internal to `MemoryService` and benchmark code; `src/tools/index.ts` and the six public names remain unchanged.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — every candidate is deterministic SQLite FTS5, the current control remains executable, and no optional projection or remote dependency becomes load-bearing.
- **P3 — Harness-Agnostic Memory Contract**: PASS — the strategy seam is host-neutral and below MCP/native adapters; no harness field or behavior enters storage or retrieval contracts.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — all candidates retain the existing result limit, compact/context budgets, surgical snippets, and measurement envelope.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — there is no compatibility shim or schema migration; a default change occurs only through an explicit evidence gate and has a one-constant rollback.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Define a frozen strategy registry and a query-plan builder that returns one or two safe FTS5 stages with stable IDs and hashes. | `src/memory-core/sqlite/fts.ts` | Focused exported-function tests in `tests/memory-core/retrieval.test.ts` or a dedicated `fts.test.ts` |
| FR-002 | Preserve a legacy-compatible NFKC token stream for `all-prefix-v1`; derive a separately identified deduplicated candidate token stream for `any-prefix-v1` and the relaxed stage of `all-then-any-prefix-v1`; keep phrase handling, 12-term bounds, quoted prefixes, and explicit `AND`/`OR` composition syntax-safe. | `src/memory-core/sqlite/fts.ts` | Unicode/operator/phrase/duplicate/empty query cases execute against SQLite, and repeated terms remain byte-compatible only in the control |
| FR-003 | Pin `all-prefix-v1` output to the current `buildFtsQuery()` behavior for all existing fixtures before adding candidates. | `src/memory-core/sqlite/fts.ts`, `tests/memory-core/retrieval.test.ts` | Compatibility assertions for archived control strings and recall ordering |
| FR-004 | Parameterize `runLongMemEval()` with an allowed strategy ID while retaining the same source inspection, ingestion, Top-20, 20,000-unit measurement, 4,000-unit delivery, and scoring paths. | `benchmarks/longmemeval/run.mjs`, `tests/benchmarks/longmemeval-runner.test.ts` | Miniature fixture runs each strategy and compares dataset/conditions/provenance identities |
| FR-005 | Include the strategy ID/config/hash plus per-question query-plan hash in each lane report; comparison validation requires identical authoritative mappings and query order across lanes. | `benchmarks/retrieval-report.mjs`, `benchmarks/longmemeval/run.mjs`, `benchmarks/lexical-comparison-report.mjs` | Strict validators reject changed mappings, missing hashes, label leakage, and cross-lane drift |
| FR-006 | Add a comparison runner that evaluates all three lanes into a disposable directory, embeds their valid reports, validates the envelope, and atomically writes one non-overwriting result. | `benchmarks/longmemeval/compare.mjs`, `benchmarks/lexical-comparison-report.mjs`, `benchmarks/lexical-comparison-report.schema.json` | Existing-output, interrupted-lane, schema, cleanup, and atomic-write tests |
| FR-007 | Implement a pure promotion function with the exact coverage/ranking gates, candidate p95 at most `2 * control p95` (zero requires zero), exact aggregate SQLite-byte equality, zero errors/calls, valid provenance, completeness, and a unique winner. | `benchmarks/lexical-comparison-report.mjs` | Synthetic winning/regressing/incomplete/tied report tests, including exact latency and byte boundaries |
| FR-008 | Add an optional internal `lexicalStrategy` recall input; default it through one exported constant. After the official comparison, change only that constant if a unique candidate passes FR-007. | `src/memory-core/service.ts`, `src/memory-core/sqlite/fts.ts` | Runtime recall tests plus official comparison decision |
| FR-009 | Keep MCP schemas, lifecycle adapters, SQLite schema, taxonomy, and dependencies unchanged. | `src/tools/index.ts` (assert unchanged), `package.json`, packaging tests | Existing six-tool, build, integration, smoke, and prepublish checks |

### Retrieval sequence

```text
caller query
  -> legacy-compatible normalization for control/strict stage
  -> deduplicate/cap only candidate relaxed terms
  -> strategy query plan
       all-prefix-v1:          [AND]
       any-prefix-v1:          [OR]
       all-then-any-prefix-v1: [AND, OR-fill]
  -> exact ID/topic candidates
  -> execute lexical stage(s)
  -> deterministic dedupe and limit
  -> existing snippet/budget/telemetry rendering
```

For the adaptive plan, structured exact matches remain highest priority, strict lexical results retain their current order, and relaxed results are appended only when not already selected and only until `limit`. Scores remain observable lane measurements; they are never compared across separate FTS expressions to reorder the strict stage.

### Comparison and conditional promotion

`compare.mjs` invokes the parameterized runner once per strategy using the same prepared file and source contract. Each lane remains a complete `thoth-mem.retrieval-benchmark-report.v1` report. The new comparison envelope stores shared identity hashes, the three lane reports, and one pure promotion decision. This deliberately reuses the proven lane validator rather than weakening it into a new partial summary.

The official run is an outcome check. If exactly one candidate passes every FR-007 threshold, implementation updates `DEFAULT_LEXICAL_QUERY_STRATEGY` and reruns focused/full verification. If none or multiple pass, the default stays `all-prefix-v1`; the comparison report and rejection reasons still complete the experiment.

### Verification order

1. Query builder/plan unit tests.
2. `MemoryService.recall()` strategy ordering and backward-compatibility tests.
3. LongMemEval miniature runner and report-validator tests.
4. Comparison/promotion-policy tests.
5. Build the package, then run the offline official comparison against the already prepared pinned corpus.
6. Apply the conditional one-constant default decision and rerun focused tests.
7. Run `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke`, `pnpm run benchmark:fixture`, `pnpm run prepublishOnly`, `git diff --check`, and independent Oracle verification.

## Optional support artifacts

- `research.md`: Not needed; the attached research, archived baseline, current source, and two local reference repositories already resolve the design question, and their relevant conclusions are captured in this plan.
- `data-model.md`: Not needed; no durable SQLite table, migration, or record identity changes.
- `contracts/`: Not needed as an SDD sub-artifact; the executable JSON Schema and validators are the authoritative comparison contract.
- `quickstart.md`: Not needed; the existing benchmark section and testing guide will document the single new opt-in command.

## Risks and migrations

- Broader `OR` matching may increase noise. Mitigation: compare NDCG@10 and fractional Recall@20 in addition to coverage; the adaptive candidate preserves strict results first.
- Control compatibility and candidate deduplication can drift. Mitigation: keep separate named token streams, pin repeated-term control output, and include the distinction in strategy configuration hashes.
- Separate FTS5 queries produce non-comparable BM25 values. Mitigation: the adaptive strategy never interleaves by cross-query score; it appends relaxed unique results after strict results.
- Re-running the full corpus per strategy increases wall time. Mitigation: keep the implementation simple and auditable first, use disposable per-question databases, report all resource samples, and avoid parallel database pressure that would bias latency.
- A benchmark-specific option could leak into MCP. Mitigation: `lexicalStrategy` remains an internal `MemoryService` input and is absent from zod tool schemas.
- The comparison result may not select a winner. This is an accepted outcome, not a failure; runtime remains unchanged and the report records reasons.
- No database migration exists. Rollback after a promoted default is a one-line restoration of `DEFAULT_LEXICAL_QUERY_STRATEGY` to `all-prefix-v1`; all saved data and the comparison evidence remain valid.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the design modifies no MCP registration or schema and explicitly tests the unchanged six-name inventory.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — the three lanes use only deterministic SQLite FTS5 and a fail-closed equal-budget evidence gate.
- **P3 — Harness-Agnostic Memory Contract**: PASS — all affected interfaces are shared core/benchmark seams with no host-specific branch.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Top-K, compact/context budgets, snippets, delivery budget, and payload telemetry are invariant across candidates.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — no legacy path or data migration is added; conditional promotion and rollback are explicit and independently testable.
