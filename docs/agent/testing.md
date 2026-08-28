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

`benchmark:prepare:longmemeval` is stateful and networked. Run it only with explicit authorization; it writes only the pinned, SHA-verified cleaned-S file and receipt beneath the gitignored `benchmarks/.cache/longmemeval/` boundary. `benchmark:longmemeval` is the archived all-prefix control. `benchmark:compare:longmemeval` sequentially evaluates `all-prefix-v1`, `any-prefix-v1`, and `all-then-any-prefix-v1` through the same built `MemoryService`, corpus, query order, occurrence mappings, Top-20 measurement allowance, and 4,000-UTF-16-unit delivery budget. Both evaluation commands are offline, use disposable per-question SQLite databases, make zero model/network calls, publish atomically, and refuse to overwrite existing evidence. None of these commands belongs to normal tests, prepublish, package installation, or a real host home.

The comparison's zero-argument create-only default is `benchmarks/results/longmemeval-s-lexical-latency-report.json`; programmatic callers provide a fresh `outputPath` for later immutable rounds. A candidate is eligible only with at least `0.05` absolute RecallAny@20 gain, no NDCG@10 or fractional Recall@20 regression, retrieval p95 no greater than twice the co-run control (zero requires zero), exactly equal aggregate SQLite bytes, complete provenance, zero errors, and literal zero network/model/LLM calls. Exactly one candidate must be eligible; no eligible candidate or multiple eligible candidates retain the current default. This policy does not add an MCP tool or expose strategy selection through the six-tool contract.

The pinned 470-question report retained `all-prefix-v1`. `any-prefix-v1` and `all-then-any-prefix-v1` each reached RecallAny@20 `0.993617` versus control `0.129787`, while NDCG@10 reached `0.853698` and `0.853829` versus `0.104505`. Both failed only `retrieval_p95_above_2x_control`: control p95 was `1.4320 ms`, compared with `6.8333 ms` and `8.1297 ms`. Every lane had identical aggregate SQLite bytes (`1,028,173,824`), provenance coverage `1`, zero errors, and zero network/model/LLM calls. Treat the quality result as input to a separate latency-focused change; do not change this experiment's frozen gate or runtime default retrospectively.

The latency-focused follow-up preserves that baseline and its thresholds in immutable reports. The passing round-4 artifact is `benchmarks/results/longmemeval-s-lexical-latency-report-r4.json`, SHA-256 `842805cc423cc48d33cf07b05e73c25967f532b79e24131b44407d87b1e6fe36`. Its unique eligible `any-prefix-v1` lane records RecallAny@20 `0.825532`, fractional Recall@20 `0.677021`, NDCG@10 `0.696544`, and p95 `1.3659 ms` versus control `0.129787`, `0.098014`, `0.104505`, and `0.9527 ms`. All lanes have equal aggregate SQLite bytes (`1,519,955,968`), provenance coverage `1`, zero errors, and zero network/model/LLM calls. The selected configuration hash is `d31ca3f7d1a0fd6662af2148cd51d1f3149b681012f8f756629d6bdd67aeb553`; prior failed rounds remain valid historical evidence and MUST NOT be overwritten.

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
