# Requirements Quality Checklist

## Domain: knowledge-graph

- [x] Completeness: Covers KG-only source, project scope, deterministic partitioning, extractive summaries, optional enrichment, freshness, and supersession/pruning interaction.
- [x] Clarity: Requirements use RFC 2119 terms and distinguish source KG facts from derived community artifacts.
- [x] Measurability: Scenarios define observable partition, provenance, boundedness, freshness, and no-`observation_facts` outcomes.
- [x] Testability: Offline fallback, same-input determinism, stale-state, and current-vs-superseded behavior can be tested with deterministic KG fixtures.

## Domain: store

- [x] Completeness: Covers derived artifact storage, rebuild lifecycle, transactionality, idempotency, rollback, export/import stability, and stale/degraded reads.
- [x] Clarity: Separates source memories/KG rows from rebuildable community artifacts.
- [x] Measurability: Scenarios assert committed-version behavior, duplicate prevention, export shape stability, and explicit stale states.
- [x] Testability: Store tests can exercise failed rebuild transactions, identical rebuild convergence, and export/import payload assertions.

## Domain: retrieval

- [x] Completeness: Covers KG-lane-only integration, no fifth lane, bounded/rank-safe evidence, graceful degradation, no global synthesis, and annotations.
- [x] Clarity: Defines community summaries as KG sub-source evidence, not a retrieval lane or answer generator.
- [x] Measurability: Scenarios assert lane set, direct-KG precedence, output bounds, stale handling, and absence of subquery generation.
- [x] Testability: Retrieval evals can inspect lane attribution, ranking order, fallback output, and annotations.

## Domain: tools

- [x] Completeness: Covers unchanged six-tool MCP registry, CLI/HTTP-only admin boundary, and existing tool output consumption.
- [x] Clarity: Separates admin rebuild/inspection from workflow-level MCP tools.
- [x] Measurability: Scenarios assert exact MCP registry and admin-only behavior.
- [x] Testability: Tool registry tests and CLI/HTTP route tests can verify the boundary.

## Domain: evals

- [x] Completeness: Covers deterministic construction, bounded extractive summaries, no-regression gates, degraded states, no fifth lane, and optional enrichment failure.
- [x] Clarity: Names the required fixture categories and gate purpose without prescribing implementation internals.
- [x] Measurability: Scenarios define pass/fail outcomes for offline construction, retrieval regression, stale fallback, and default gating.
- [x] Testability: Evals can run with small deterministic fixtures and provider-disabled modes.

## Domain: config

- [x] Completeness: Covers deterministic resolution, algorithm fallback, finite budgets, and optional enrichment configuration.
- [x] Clarity: Uses semantic requirements while leaving exact knob names to design.
- [x] Measurability: Scenarios assert env precedence, offline defaults, fallback behavior, finite budgets, and enrichment-disabled baseline.
- [x] Testability: Config unit tests can validate precedence, schema/defaults, invalid algorithm handling, and no-provider operation.

## Domain: indexing

- [x] Completeness: Covers admin rebuild workflow, KG input, no indexing-time LLM dependency, stale tracking, idempotency, and retryability.
- [x] Clarity: Identifies operator-triggered rebuild plus required stale signaling as the MVP default.
- [x] Measurability: Scenarios assert project scoping, provider-free rebuild, invalidation after KG changes, and retry convergence.
- [x] Testability: Indexing/admin tests can simulate project rebuilds, KG mutations, provider absence, and interrupted retries.

## Overall Notes

- [-] waived: No `[NEEDS CLARIFICATION]` markers were added because each ambiguity had a defensible default recorded in `## Assumptions`; sdd-clarify may still promote defaults into resolved decisions.
- [-] waived: Exact algorithm dependency selection is deferred to design/clarify because the spec requires a deterministic fallback and does not make exact Leiden load-bearing.
