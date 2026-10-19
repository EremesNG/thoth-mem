# Implementation Plan: Optimize Relaxed Lexical Latency

## Technical context

The official LongMemEval-S comparison established that OR-prefix retrieval supplies the missing quality but spends most of its time ranking broad FTS matches and hydrating 20 long memory/evidence rows. Read-only profiling isolated four removable costs: FTS prefix range scans, sorting/hydrating full rows, N+1 evidence queries, and repeated snippet scans. Their exact-output composite still measured ~3.17x the co-run control, so the candidate must also bound its internal lexical work. Archived Top-10 rescoring preserves NDCG@10 and remains far above control on every promotion quality metric.

Affected surfaces are the internal query-plan contract, SQLite revision 5 FTS projection, `MemoryService.recall` ranking/hydration path, benchmark-only diagnostics, comparison report v2, official runner, focused tests, canonical retrieval/eval deltas, and generated build output only through the normal build. The MCP inventory remains exactly six and no public tool schema changes.

## Ownership

- **Owner**: adaptive root implementation writer.
- **Net-gain rationale**: this is one ordered, coupled contract across query planning, one derived SQLite projection, recall hydration, and its benchmark evidence; the root already holds the profiling context and one writer avoids schema/service/report drift. A fresh Oracle remains the independent plan reviewer and a different fresh Oracle performs final verification, so the writer never self-verifies.
- **Mutable surface**: `src/memory-core/sqlite/{fts,schema,migrations,ledger}.ts`, `src/memory-core/service.ts`, benchmark/report modules and schemas, their focused tests, routed docs, and this change's artifacts.
- **Checks**: TDD at each behavior seam, focused Vitest suites, build, required broader test contracts from `docs/agent/testing.md`, official 470-question comparison, report validation, diff/status review, and independent Oracle verification.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the work changes no tool registration or public MCP schema and tests continue to assert exactly six tools.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — the optimization remains deterministic SQLite/FTS5, changes only a rebuildable FTS projection, and adds no optional or remote dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — query strategy and diagnostics live below every harness adapter and authoritative memory/evidence schemas retain their meaning.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — the strategy-owned lexical cap tightens internal work, retains compact/context/get progression, and preserves honest source/evidence/budget measurements.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — SQLite revision 5 is explicit and transactional, the prior database remains valid on rollback, and no compatibility shim or dual read/write is added.

## Design

### 1. Lock deterministic strategy and diagnostic contracts with tests

Use TDD to extend the internal query plan with `maxLexicalResults`. Keep `all-prefix-v1` and `all-then-any-prefix-v1` uncapped; declare ten for `any-prefix-v1` and include it in the configuration/plan hashes. Add adversarial normalization, exact-first, overlap, small caller limit, and capped-prefix cases. Define an opt-in typed recall observer and prove enabled/disabled public results are deeply equal, skipped stages are honest, timing is monotonic/non-negative, work counters reconcile, and observer data contains no content.

### 2. Install and migrate the shared FTS prefix projection

Raise the schema revision to 5 and add FTS5 prefix indexes 2 through 12 for all databases and all comparison lanes. Rebuild only `memory_fts` transactionally from `memories`, recreate its maintenance triggers, verify counts/foreign keys/revision, and prove inserts/deletes remain searchable after migration. Keep explicit revision constants per migration step so revision 2 executes 2→3→4→5, revision 3 executes 3→4→5, and revision 4 executes 4→5; no earlier step may stamp the global current revision. Add fresh-install, revision-2/revision-3/revision-4 upgrade, rollback-on-failure, repeat-open, Unicode/prefix, and authoritative-row preservation tests. Do not create a backup or compatibility table for this rebuildable projection.

### 3. Separate ranking from bounded hydration

Change lexical SQL to rank only ID, score, and deterministic tie-break fields. Apply the stage/caller limit before content hydration, deduplicate in existing stage order, fetch selected memory rows in one bounded statement, and fetch their evidence IDs/character sums in one bounded statement. Reassemble through an ID map in original exact/strict/relaxed rank order. Replace snippet token mapping with an early-exit scan that is output-compatible for retained rows. Preserve project/history/status filters, exact precedence, warnings, score semantics, provenance, and budget calculations. Ledger helpers accept only non-empty bounded ID sets and parameterize every placeholder.

### 4. Emit privacy-safe stage evidence and comparison v2

Measure exact lookup, each actually executed lexical stage, post-query hydration/snippet/budget work, and total with the monotonic performance clock. The normal service has no observer. The benchmark runner enables it for ranking recall, associates exactly one observation with each question, records the declared internal cap, and aggregates p50/p95/work totals. Extend the comparison report/schema to v2 while leaving the archived v1 file immutable; JSON Schema owns structural constraints, while the JavaScript semantic validator binds diagnostics to lane query order/configuration and recomputes aggregate diagnostics and promotion. Add the archived report hash and diagnostic quality deltas without using historical values as promotion gates.

### 5. Verify locally, then run the official fail-closed outcome

Run focused tests and deterministic work-counter fixtures first, then build and the broader suites required by `docs/agent/testing.md`. Run `simplify` over the new implementation without behavior change and rerun affected checks. Only after those pass, execute the official three isolated 470-question lanes sequentially with the same public Top-20 and 4,000-unit delivery budgets. The programmatic runner accepts an `outputPath` option for tests and orchestration; its zero-argument CLI default is the new `benchmarks/results/longmemeval-s-lexical-latency-report.json`. Both paths retain atomic create-only publication and reject an existing target. Validate the new report and require exactly one eligible candidate. If quality, footprint equality, p95 ≤2x, provenance, calls, errors, or report consistency fails, keep `all-prefix-v1`, record the exact blocker, and enter the SDD convergence loop rather than weakening a threshold.

### 6. Promote the default only from validated evidence

If and only if the validated v2 report selects `any-prefix-v1` uniquely, change `DEFAULT_LEXICAL_QUERY_STRATEGY` in a separate evidence-gated patch, update default-behavior tests and routed docs, and rerun build/focused/broader checks. The explicit strategy selector used by the benchmark remains internal. No benchmark branch or environment switch exists in production retrieval.

### 7. Converge failed round-1 evidence without weakening gates

Preserve the valid failed round-1 artifact. First close Oracle findings F-002/F-003 and W-001 by reconciling diagnostic work to stage rows, binding archived baselines to a committed report manifest, and completing both-candidate behavior coverage. Then change only `any-prefix-v1` to a configuration-hashed four-term/five-result candidate; control and adaptive remain unchanged. Run the complete verification envelope and publish round 2 to `benchmarks/results/longmemeval-s-lexical-latency-report-r2.json`. Only its validated unique-winner decision may change the default.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Keep corpus/order/public Top-20/delivery/scoring fixed; add only internal strategy cap and diagnostics to declared config | `benchmarks/longmemeval/run.mjs`, `benchmarks/longmemeval/compare.mjs`, comparison report/schema | Runner/comparison tests plus shared-identity validator |
| FR-002 | Preserve tokenizer/query strings; hash the candidate cap into plan identity; add shared prefix indexes | `src/memory-core/sqlite/fts.ts`, `src/memory-core/sqlite/schema.ts` | Query-plan adversarial tests and migration prefix search tests |
| FR-003 | Byte-compatible control, deterministic Top-10 lexical prefix for candidate, exact-first precedence, ordered batch hydration | `src/memory-core/service.ts`, `src/memory-core/sqlite/ledger.ts` | Retrieval fixtures compare control bytes and candidate prefixes across overlaps/limits |
| FR-004 | Comparison v2 records reconciled per-query and aggregate stage/work diagnostics plus archived deltas | `benchmarks/lexical-comparison-report.mjs`, schema files, result file | Schema/semantic mutation tests and official report validation |
| FR-005 | Typed opt-in observer, monotonic timers, skipped-stage reasons, no content | `src/memory-core/service.ts`, internal contracts | Observer on/off deep equality, privacy-key scan, counter reconciliation |
| FR-006 | Keep control default through implementation; apply a separate promotion patch only after a unique validated winner | `src/memory-core/sqlite/fts.ts`, canonical retrieval spec/docs | Promotion unit tests and default integration test before/after evidence |
| FR-007 | No MCP/CLI/public selector/dependency expansion | `src/index.ts`, packaging tests, package manifests | Exact-six tool test, zero-call report counters, dependency diff review |

## Optional support artifacts

- `research.md`: required because root-cause attribution, rejected alternatives, storage trade-offs, and the non-obvious Top-10 quality evidence determine the implementation.
- `data-model.md`: required because SQLite revision 5 rebuilds the FTS projection and introduces ephemeral diagnostic records.
- `contracts/`: required for the observer/reconciliation/privacy/report contract shared by service and benchmark code.
- `quickstart.md`: not needed; this is internal runtime/evaluation behavior with no new operator workflow.

## Risks and migrations

- **Relative latency remains host-sensitive**: only the same-run official ratio decides; absolute timings are diagnostics. Keep the control unchanged until the new report passes.
- **Prefix indexes increase disk use**: preliminary whole-database estimate is ~1.43x. Record the official footprint and require equal bytes across lanes; if the migration materially exceeds the predeclared 1.5x archived total, verification fails and convergence must choose a smaller shared prefix set or abandon promotion.
- **Candidate returns fewer than public Top-20 maximum**: expose the cap in strategy config/diagnostics, preserve exact matches and final limit semantics, and require the unchanged co-run quality gates. Do not relabel K or alter scoring.
- **Migration interruption/corruption**: rebuild the derived FTS table inside one transaction and validate row counts/searchability; authoritative tables are untouched and failed migration remains revision 4.
- **SQLite variable limits during batch hydration**: cap selected IDs at the existing caller limit plus bounded exact results, reject empty lists, and keep statements below SQLite's parameter ceiling.
- **Diagnostics perturb timing**: keep work counters simple, use one observer callback after assembly, compare on/off behavior, and time every lane with identical diagnostic configuration.
- **Both candidates become eligible**: the frozen decision retains control on multiple eligible candidates. The cap belongs only to `any-prefix-v1`; `all-then-any-prefix-v1` remains an uncapped comparison lane, and no tie-break rule is added.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — every new interface is internal to service construction or benchmark code; the plan explicitly gates the unchanged six-tool inventory.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — ranking remains local BM25 with deterministic tie-breaks and the only migration rebuilds the derived FTS5 table from authoritative memories.
- **P3 — Harness-Agnostic Memory Contract**: PASS — no harness payload or adapter behavior enters the storage/retrieval contract, and one shared core serves all clients.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — exact-first compact retrieval, surgical snippets, caller budgets, source/evidence counts, and progressive full fetch remain intact while candidate work becomes more tightly bounded.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — revision 5, report v2, migration/rollback, and promotion boundary are explicit; no hidden fallback, alias, or dual storage path is planned.
