# Testing and verification

Use the nearest terminating Vitest file first. Unit tests are the memory-core, tool, and benchmark suites; integration tests are under `tests/integration/`, `tests/setup/`, and `tests/packaging/`.

Verified commands:

```sh
pnpm exec vitest run <test-file> --config vitest.unit.config.ts
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run integration:verify
pnpm run integration:smoke
pnpm run benchmark:fixture
pnpm run prepublishOnly
git diff --check
```

The opt-in LongMemEval-S lane separates networked preparation from both offline evaluations:

```sh
pnpm run benchmark:prepare:longmemeval
pnpm run benchmark:longmemeval
pnpm run benchmark:compare:longmemeval
```

`benchmark:prepare:longmemeval` is stateful and networked. Run it only with explicit authorization; it writes only the pinned, SHA-verified cleaned-S file and receipt beneath the gitignored `benchmarks/.cache/longmemeval/` boundary. `benchmark:longmemeval` is the archived all-prefix control. `benchmark:compare:longmemeval` sequentially evaluates `all-prefix-v1`, `any-prefix-v1`, `all-then-any-prefix-v1`, and `strict-selected-any-cap5-rrf-v1` through the same built `MemoryService`, corpus, query order, occurrence mappings, Top-20 measurement allowance, and 4,000-UTF-16-unit delivery budget. Both evaluation commands are offline, use disposable per-question SQLite databases, make zero model/network calls, publish atomically, and refuse to overwrite existing evidence. None of these commands belongs to normal tests, prepublish, package installation, or a real host home.

The comparison's zero-argument create-only default is `benchmarks/results/longmemeval-s-lexical-recall-at-5-report.json`; programmatic callers provide a fresh `outputPath` for later immutable rounds. The immutable v3 report's frozen hybrid-parity policy treats only `strict-selected-any-cap5-rrf-v1` as promotable. It requires at least 447 RecallAny@5 hits among the same 470 questions; no fractional Recall@5, RecallAll@5, or NDCG@10 regression against the best co-run default/broad reference; retrieval p95 no greater than twice the co-run control (zero requires zero); exactly equal four-lane aggregate SQLite bytes; matching configuration identity; complete provenance; zero errors; and literal zero network/model/LLM calls. Under that historical policy a failed gate retains `any-prefix-v1`; its report and validator remain immutable. This policy does not add an MCP tool or expose strategy selection through the six-tool contract.

A later explicit product decision separates lexical and semantic targets. The embeddings-free phase compares against agentmemory BM25-only: `86.2%` RecallAny@5 over its published 500 questions and `409/470 = 87.021%` on the common non-abstention subset. E0 reaches `419/470 = 89.149%`, passes the frozen same-run latency, equal-byte, provenance, and zero-call gates, and is therefore the runtime lexical default despite the older report's attributable `retain_default` field. Agentmemory's `95.2%` result is BM25+Vector with local `all-MiniLM-L6-v2` embeddings and explicitly no LLM in that retrieval loop; it is reserved for a future semantic SDD if embeddings are reconsidered.

The pinned 470-question report retained `all-prefix-v1`. `any-prefix-v1` and `all-then-any-prefix-v1` each reached RecallAny@20 `0.993617` versus control `0.129787`, while NDCG@10 reached `0.853698` and `0.853829` versus `0.104505`. Both failed only `retrieval_p95_above_2x_control`: control p95 was `1.4320 ms`, compared with `6.8333 ms` and `8.1297 ms`. Every lane had identical aggregate SQLite bytes (`1,028,173,824`), provenance coverage `1`, zero errors, and zero network/model/LLM calls. Treat the quality result as input to a separate latency-focused change; do not change this experiment's frozen gate or runtime default retrospectively.

The latency-focused follow-up preserves that baseline and its thresholds in immutable reports. The passing round-4 artifact is `benchmarks/results/longmemeval-s-lexical-latency-report-r4.json`, SHA-256 `842805cc423cc48d33cf07b05e73c25967f532b79e24131b44407d87b1e6fe36`. Its unique eligible `any-prefix-v1` lane records RecallAny@20 `0.825532`, fractional Recall@20 `0.677021`, NDCG@10 `0.696544`, and p95 `1.3659 ms` versus control `0.129787`, `0.098014`, `0.104505`, and `0.9527 ms`. All lanes have equal aggregate SQLite bytes (`1,519,955,968`), provenance coverage `1`, zero errors, and zero network/model/LLM calls. The selected configuration hash is `d31ca3f7d1a0fd6662af2148cd51d1f3149b681012f8f756629d6bdd67aeb553`; prior failed rounds remain valid historical evidence and MUST NOT be overwritten.

The separate Top-5 reference manifest is `benchmarks/lexical-recall-at-5-baseline.json`; it binds that exact round-4 report, its three configuration hashes, Top-5 quality metrics, MRR, and `1,519,955,968` bytes per lane without replacing `benchmarks/lexical-comparison-baseline.json`. The official four-lane E0 artifact is `benchmarks/results/longmemeval-s-lexical-recall-at-5-report.json`, SHA-256 `de9137eaba9cdeb30db14f2f315c23fddbf6ea5da75804a0dc59ad36b11faa17`. E0 configuration `5ba29df9811fbf3f5bc7d770738b961cc4ea7dd933f424f77ff1414dd39e17d9` reached 419/470 RecallAny@5 (`0.891489`), fractional Recall@5 `0.796809`, RecallAll@5 `0.682979`, NDCG@10 `0.770008`, MRR `0.817730`, and p95 `2.0552 ms`. The broad reference reached 446/470 (`0.948936`), `0.879255`, `0.787234`, `0.853829`, `0.871665`, and p95 `3.9512 ms`; control p95 was `1.1471 ms`. All four lanes had identical aggregate SQLite bytes (`1,519,955,968`), provenance coverage `1`, zero errors, and zero network/model/LLM calls. E0 passed latency, footprint, identity, provenance, and purity gates but failed the historical 447-hit and three best-reference quality floors, so the immutable report's validated decision remains `retain_default`. The later lexical-only product decision promotes E0 over agentmemory BM25-only without rewriting that evidence; `strict-selected-any-cap5-rrf-v1` is now the runtime default. The experiment and promotion add no embedding, vector state, projection, or schema migration.

Focused implementation checks for this lane are:

```sh
pnpm exec vitest run tests/memory-core/retrieval.test.ts tests/benchmarks/longmemeval-contract.test.ts tests/benchmarks/longmemeval-prepare.test.ts tests/benchmarks/longmemeval-runner.test.ts tests/benchmarks/retrieval-report.test.ts tests/benchmarks/lexical-comparison-report.test.ts tests/benchmarks/longmemeval-compare.test.ts tests/benchmarks/adapters.test.ts --config vitest.unit.config.ts
```

The real-dataset outcome is observed only when the prepared file matches revision `98d7416c24c778c2fee6e6f3006e7a073259d48f`, SHA-256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`, and the resulting retrieval-only report validates. Keep the product profile (`sqlite-fts5-bm25-session-full`) distinct from the official `rank_bm25` implementation, preserve repeated base session IDs as separate occurrence source IDs and Top-K positions, accept string-typed empty turn content, preserve Top-20 and the separate 4,000-UTF-16-unit delivery budget, reconcile per-query ranking/delivery source/returned/truncated evidence with report aggregates, and do not infer optional-module promotion from a baseline-only report.

There is no lint or browser lane. `integration:smoke` packs the real tarball, installs it in a disposable directory, verifies all three native inventories, cold-starts its CLI, and executes every packaged lifecycle runner with host-shaped fixtures without touching real host homes. It does not launch real host binaries or prove host-model consumption. External benchmark lanes may remain unavailable only when the report says so explicitly.

Memory-operating-model seams are covered by:

- `tests/integration/lifecycle.test.ts` for the automatic-capture allowlist, private/recognizable-credential filtering, one-state-change idempotency, restart/post-compaction recovery, degraded identity, and truthful no-fit delivery;
- `tests/memory-core/context.test.ts` for handoff-first selection, failed/mixed lessons, temporal truth, deterministic aggregate budgets, hidden actions, and project isolation;
- `tests/memory-core/continuation.test.ts` for Unicode caps, useful-content floors/ratio, metadata-starvation abstention, complete metadata, trust delimiters, poisoning/control characters, and embedded supporting-evidence omission;
- `tests/tools/mcp.test.ts` for the compact → context → get funnel, shared briefing selection, deferred evidence IDs, and history provenance;
- `tests/integration/adapters.test.ts`, `tests/integration/opencode-native-plugin.test.ts`, and `tests/integration/public-plugin-runner.test.ts` for pre-hash credential sanitation, verbatim final-context injection, and identity-only fallback across all hosts;
- `tests/benchmarks/report.test.ts` and `tests/benchmarks/runner.test.ts` for hidden actionable fields, abstention, poisoning, isolation, injected characters/tokens, useful-content ratio, and equal Top-K/final-context comparability.

Ordered session events and summaries add this focused verification lane:

```sh
pnpm exec vitest run tests/memory-core/contracts.test.ts tests/memory-core/schema-migration.test.ts tests/memory-core/service.test.ts tests/memory-core/session-summaries.test.ts --config vitest.unit.config.ts
pnpm exec vitest run tests/memory-core/context.test.ts tests/memory-core/continuation.test.ts tests/tools/mcp.test.ts --config vitest.unit.config.ts
pnpm exec vitest run tests/integration/lifecycle.test.ts tests/integration/adapters.test.ts tests/integration/opencode-native-plugin.test.ts tests/integration/public-plugin-runner.test.ts --config vitest.unit.config.ts
pnpm exec vitest run tests/benchmarks/report.test.ts tests/benchmarks/runner.test.ts tests/packaging/first-product.test.ts --config vitest.unit.config.ts
```

The committed summary outcome fixture is offline and deterministic. For each OpenCode, Codex, and Claude-shaped harness it uses isolated control and candidate projects, identical five-field actionable source values, and the same 1,000-code-point delivery cap. It requires ordered idempotency, same-scope claim support, version precedence, three-host recovery, non-empty checkpoint capture, zero automatic handoff promotion, zero support leakage, zero mixed candidate memories, zero model/network calls, and a candidate useful-content ratio no lower than the handoff control. `benchmarks/report.mjs` and `benchmarks/report.schema.json` close that summary envelope; missing, extra, incoherent, contaminated, or non-inferior-by-assertion-only reports fail validation.

Run the nearest file first, then `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke`, `pnpm run benchmark:fixture`, and `pnpm run prepublishOnly`. The committed fixture must make zero network/model calls and must not claim external quality while LongMemEval-S, LoCoMo, AMB/BEAM/PersonaMem, or SDEBench lanes are unavailable.
