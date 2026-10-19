# Implementation Plan: Optimize Stable Recall Latency

## Technical context

The current `strict-selected-any-cap5-stable-v1` path calls the deterministic SQLite scalar `thoth_stable_rank(query,title,content,topic)` from both strict and relaxed FTS statements and orders every matching row by that JavaScript result before applying `LIMIT 5`. The 470-question LongMemEval-S run measured stable retrieval p95 at 13.0459 ms versus 1.9818 ms for RRF (6.5829x). Aggregate diagnostics place approximately 11.59 ms p95 in the relaxed stage, while exact lookup is about 0.23 ms and post-query work about 0.62 ms. The slowest questions score five returned sessions containing roughly 51k-90k UTF-16 units.

Source inspection initially identified three repeated costs inside each SQLite callback: `stableLexicalRank` normalizes and tokenizes the unchanged query for every matching row; `fieldScore` normalizes each candidate field and then calls `tokens`, which normalizes that field a second time; and prefix frequency uses a query-term-by-document-token nested scan. Independent verification later proved that the second field normalization is only redundant on the guarded ASCII path and can change token composition under Azerbaijani defaults, so it remains for non-ASCII fields. Candidates present in both strict and relaxed stages can repeat the full score. RRF performs its BM25 scoring natively in SQLite and therefore does not pay these JavaScript normalization/tokenization and callback costs. The empty import-cohort CTE is present in LongMemEval, but the stage evidence and candidate text-size correlation make scorer work the primary hypothesis; it remains a measured secondary target rather than an assumed fix.

The implementation retains the exact score formula and order while introducing a service-local stable ranker with bounded last-query compilation. Query normalization, distinct ordered terms, specificity values, and first-character prefix buckets are compiled once. Each candidate field is tokenized once; guarded ASCII fields use one equivalent normalization, while non-ASCII fields retain the historical second normalization before tokenization. Only terms sharing a token's first character use V8's native `startsWith` to reproduce the same per-term frequencies. Final score accumulation remains in original query-term order to preserve floating-point results. The SQLite function receives the memory ID so a bounded per-query score cache can reuse the same deterministic result when strict and relaxed stages overlap. Cache capacity and reset behavior are fixed and test-covered; overflow falls back to recomputation without changing results.

The first implementation round used a JavaScript prefix trie. Its same-build LongMemEval run preserved every output but reduced stable p95 only from 13.0459 ms to 10.1615 ms against RRF 1.8583 ms, so it missed the absolute 10-ms budget. A controlled long-ASCII microprofile showed the trie scorer slower than the frozen nested `startsWith` loop, while compiled first-character buckets plus the ASCII fast path reduced scorer time by approximately 36%. The refined round preserved every output and reached 9.4380 ms p95 against RRF 1.9762 ms, followed by a confirmation at 8.8932 ms against RRF 1.5019 ms. Oracle round 1 rejected the unconditional ASCII shortcut because default Turkish/Azeri locale folding differs for ASCII `I`; TDD reproduced `5` versus the frozen scorer's `0`, and a full ASCII uppercase probe now guards the shortcut. Oracle round 2 then found that Azerbaijani combining marks make the historical second non-ASCII field normalization semantically significant; TDD reproduced optimized `0` versus frozen `2`. The final implementation retains that second normalization outside the proven-safe ASCII path, preserves every output, and measures 9.3504 ms against RRF 1.6164 ms, a 28.3% baseline reduction and an absolute-budget pass. A separate empty-import profile did not show a consistent benefit from bypassing the cohort CTE, so the optional SQL slice remains unselected.

External primary-source comparison places the corrected sub-10-ms p95 within or below the published range for local persistent agent-memory retrieval. The user therefore accepted an absolute p95 budget of 10 ms and retained the same-build RRF ratio as diagnostic evidence. Further implementation is unnecessary while the absolute budget, exact output parity, locale semantics, and quality gates hold. Native addons or extensions are explicitly excluded.

The pre-optimization stable report at SHA-256 `7c52da902418bcdf6c89f5c55713631ca406d95a0ae76d78406e5f928e873fda` is the output oracle. The contemporaneous RRF report at SHA-256 `e587514b8d3d8ab5f8b6590e2fdffdcf58e8979d6775c43f6e2a27c9ecb2d9e4` is the performance control. Both are immutable inputs.

**Implementation ownership**: root owns scorer, service registration/SQL, tests, benchmark contract, and SDD artifacts. The optimization is one coupled reasoning chain with already-loaded profiling evidence; delegation would add rediscovery and overlapping ownership. A fresh Oracle reviews the plan if selected and a different fresh Oracle performs mandatory final verification.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — optimization is internal to the existing `MemoryService.recall`; no MCP tool or schema changes.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — the score remains deterministic local SQLite/JavaScript work with no model, network, vector, graph, or optional dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — all hosts continue through the same shared scorer and service; no host payload enters ranking.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — result limits, compact/context/get behavior, payload trimming, and telemetry remain unchanged; only internal scoring work is reduced.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — no compatibility path, dual read/write, migration, or implicit legacy-home operation is introduced.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Freeze score/order semantics and all strategy/config/plan identities; compare optimized results to the immutable stable report and existing retrieval fixtures. | `src/memory-core/retrieval/stable-lexical-rank.ts`, `src/memory-core/service.ts` | Pure scorer equivalence tests, public `MemoryService.recall`, and all 470 complete LongMemEval ranked/delivered lists. |
| FR-002 | Run optimized stable and RRF sequentially inside one Node process that imports one built `dist`, seals its SHA-256 before and after both lanes, and accepts only stable p95 ≤10 ms with identical corpus, conditions, mappings, and SQLite footprint; retain the RRF ratio as diagnostic evidence. | `benchmarks/longmemeval/run.mjs`, existing result validator, fresh create-only reports | One paired invocation plus an exact assertion check over build digest, report validity, raw samples, quality, all per-query sequences, absolute stable p95, and diagnostic ratio. |
| FR-003 | Compile one normalized query into ordered terms, specificity, and first-character prefix buckets; use exact ASCII fast paths when valid; tokenize candidate fields once while retaining the historical second normalization for non-ASCII token sources; preserve term-ordered score accumulation; use a service-local bounded last-query/memory-ID score cache for strict/relaxed overlap. | `src/memory-core/retrieval/stable-lexical-rank.ts`, `src/memory-core/service.ts` | Golden scores, locale-aware reference-equivalence corpus, cache reset/overflow cases, repeated-stage recall, diagnostics, and micro-profile evidence. |
| FR-004 | Keep existing strict report semantics, add stable strategy support already required by the authorized eval, and produce fresh immutable reports without changing archived evidence. | `benchmarks/retrieval-report.mjs`, `benchmarks/retrieval-report.schema.json`, `tests/benchmarks/retrieval-report.test.ts`, `tests/benchmarks/longmemeval-runner.test.ts`, `benchmarks/results/` | Validator tests, 75-test LongMemEval suite, hashes, zero external calls, and refusal to overwrite. |
| SC-001 / SC-003 | Test-first scorer and public-recall parity lock before implementation; preserve import-ranking outputs and identities. | `tests/memory-core/retrieval.test.ts`, `tests/benchmarks/longmemeval-runner.test.ts` | Red equivalence/work test, then green focused retrieval/import ranking checks and exact baseline comparison. |
| SC-002 / SC-005 | Treat performance as an observed outcome; no task may mark it complete from microbenchmarks alone. | fresh LongMemEval reports and `openspec/changes/optimize-stable-recall-latency/verify-report.md` | Full 470-question same-build co-run; stable p95 ≤10 ms, diagnostic RRF ratio recorded, and every evidence identity reconciled. |
| SC-004 | Preserve full repository and packaging contract with no schema/public-tool change. | `package.json`, existing integration/package suites | Build, full Vitest, integration verify/smoke, prepublish, six-tool audit, status/diff, and secret/generated-output review. |

### Scorer compilation and cache boundary

`createStableLexicalRanker` returns a deterministic function registered once per `MemoryService`. It holds only the last raw query's compiled representation and a bounded map from memory ID to numeric score. A query change clears both. The cache key includes the raw query and memory ID through the reset boundary; the score remains a function only of query/title/content/topic and never uses time, corpus statistics, or cache order. Tests deliberately reuse one ID with changed content only outside a recall boundary; production immutable memories make ID reuse safe within one query, and the ranker API exposes an explicit query reset to prevent stale cross-recall reuse.

Query compilation preserves the existing sequence: NFKC normalization, locale lowercase, trim for phrase matching, first 32 normalized tokens, insertion-order deduplication, and Unicode code-point specificity capped at 12. Candidate scoring preserves phrase bonuses, field weights, field token count length normalization, prefix frequencies, saturation, and term-order addition. First-character buckets change only which impossible prefix comparisons are skipped; native `startsWith` still performs the accepted comparison. The ASCII path is selected only when NFKC and locale lowercase are equivalent to ASCII lowercase and the Unicode token expression is equivalent to its ASCII specialization.

### Measurement flow

1. Lock pre-optimization scorer values and the complete stable report as baseline.
2. Add deterministic scorer-work instrumentation in tests or a test-only wrapper; do not expose new public telemetry.
3. Implement query compilation, guarded single-normalization ASCII scoring, preserved non-ASCII second normalization, and first-character prefix buckets; run focused equivalence and micro-profile checks.
4. Integrate the service-local ranker and bounded overlap cache; run public recall/import-ranking regressions.
5. In one Node process, hash `dist/index.js`, import `runLongMemEval` once, run one fresh optimized stable lane followed by one fresh RRF lane, hash `dist/index.js` again, and fail unless the two build digests are identical.
6. In that same paired check, validate both new reports, validate the frozen stable baseline, assert identical dataset/conditions/mappings and literal zero external calls, compare all 470 ranked/delivered source and session ID arrays plus aggregate quality to the frozen stable baseline, recompute p50/p95 from raw samples, and fail unless stable p95 is at most 10 ms. Record RRF p95 and the stable/RRF ratio without making the ratio a promotion blocker.
7. If the absolute gate fails in a future run, treat it as a regression and reopen bounded JavaScript/SQLite profiling; do not introduce a native addon or reinterpret immutable evidence.

### Paired build-identity evidence

The final evaluation is one indivisible invocation, not two manually related reports. It starts only after `pnpm run build`, reads the exact bytes of `dist/index.js`, records their SHA-256, imports the runner once, and executes stable then RRF sequentially with explicit fresh output paths. No build command or source mutation may occur between lanes. After RRF finishes it re-hashes `dist/index.js`; a mismatch invalidates both lanes. The verification assertion then reads the two newly published reports and the immutable pre-optimization stable baseline and exits nonzero on any failed semantic validation, build mismatch, corpus/condition/mapping/SQLite mismatch, nonzero error/call counter, changed stable aggregate quality, changed ranked or delivered source/session sequence, incorrect p95 recomputation, or stable p95 above 10 ms. `verify-report.md` records the invocation, both build digests, all three report hashes, raw p95 values, diagnostic ratio, and assertion result.

## Optional support artifacts

- `research.md`: not needed; measured LongMemEval diagnostics and current source establish the bounded root-cause hypothesis locally.
- `data-model.md`: not needed; schema revision 9 and all persisted rows remain unchanged.
- `contracts/`: not needed; public MCP/CLI and report shapes remain unchanged, while the existing report strategy enum receives only the already-tested stable ID.
- `quickstart.md`: not needed; no operator workflow changes.

## Risks and migrations

- **Ranking drift from optimized token matching**: prefix-bucket or normalization changes could alter prefix counts or floating-point addition. Mitigation: reference/golden score tests and exact all-470 ranked/delivered parity; rollback restores the prior scorer implementation.
- **Stale or unbounded cache state**: cross-query or ID/content reuse could return an invalid score or grow memory. Mitigation: service-local last-query reset, explicit fixed capacity, immutable-memory assumption only within a recall, and reset/overflow tests; rollback disables candidate caching while retaining compiled-query scoring.
- **Locale portability**: current `toLocaleLowerCase` semantics are preserved rather than changed during a latency-only task. Locale hardening would change the scorer contract and requires separate evaluation.
- **Misleading microbenchmark success**: isolated scorer gains may not reduce SQLite p95. Mitigation: SC-002 remains outcome-only and requires the full sequential LongMemEval co-run.
- **Benchmark noise**: p95 varies with environment. Mitigation: same build/corpus, sequential lanes, 470 raw samples, contemporaneous RRF diagnostics, archived output parity, and a fixed absolute budget; a marginal pass should be repeated before archive.
- **Evaluation artifact growth**: full reports are multi-megabyte. Mitigation: create-only named files, hash and validate each, retain only declared evidence, and never rewrite archived reports.
- **Migration**: none. No SQLite schema, data, import receipt, or active database is mutated by implementation or evaluation; all benchmark databases are disposable.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — mapped files affect only internal scoring, evaluation contracts, and tests; six tools stay exact.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — compiled queries, first-character buckets, and bounded caches are local optimizations over the same deterministic FTS5 eligibility and immutable SQLite truth.
- **P3 — Harness-Agnostic Memory Contract**: PASS — the service-local ranker is host-neutral and no adapter behavior changes.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — scoring work is reduced without widening candidates, limits, payload budgets, or progressive output.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — design adds no hidden compatibility or data mutation and keeps real legacy import/cutover out of scope.
