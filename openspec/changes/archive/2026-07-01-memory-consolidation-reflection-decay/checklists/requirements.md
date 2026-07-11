# Requirements Quality Checklist: memory-consolidation-reflection-decay

## Domain: store
- [x] Completeness: covers deterministic maintenance runs, source-preserving consolidation, reflected durable records, reversible decay, and export/import behavior.
- [x] Clarity: uses explicit defaults for preservation, portability, and decay semantics.
- [x] Measurability: scenarios define dry-run/apply parity, source reachability, idempotency, rollback, and export/import checks.
- [x] Testability: requirements map to focused store, export/import, and transaction tests.

## Domain: knowledge-graph
- [x] Completeness: preserves KG source-of-truth, graph provenance, and decay composition with supersession/pruning.
- [x] Clarity: distinguishes consolidation/reflection/decay from KG fact storage and prior B/C contracts.
- [x] Measurability: scenarios assert no parallel fact source, source-linked graph evidence, and no decay-triggered pruning.
- [x] Testability: requirements map to KG read, provenance, and ranking-state tests.

## Domain: indexing
- [x] Completeness: covers admin entry points, dry-run/apply, automatic job bounds, retry/idempotency, and degraded optional signals.
- [x] Clarity: keeps maintenance outside MCP and preserves save responsiveness.
- [x] Measurability: scenarios specify preview counts, tool-registry absence, retry convergence, and degraded-state reporting.
- [x] Testability: requirements map to CLI/HTTP/admin, queue/job, and degraded capability tests.

## Domain: retrieval
- [x] Completeness: covers duplicate suppression, reflection promotion, decay down-weighting, baseline disablement, and four-lane preservation.
- [x] Clarity: maintenance modifies ranking/evidence without adding a retrieval lane or hiding sources globally.
- [x] Measurability: scenarios assert ranking preferences, lineage, recoverability, and baseline-disabled parity.
- [x] Testability: requirements map to hybrid retrieval ranking and context assembly tests.

## Domain: config
- [x] Completeness: covers deterministic resolution, disablement, decay policy, rollback, and schema documentation.
- [x] Clarity: states conservative defaults and separate switches for automatic work and read-path consumption.
- [x] Measurability: scenarios verify env precedence, default behavior, disablement, explainable policy, and schema validation.
- [x] Testability: requirements map to config resolver and config.schema.json tests.

## Domain: tools
- [x] Completeness: covers compact MCP registry, transparent tool output, mem_get recoverability, and mem_project boundaries.
- [x] Clarity: separates tool rendering/recoverability from storage and ranking behavior.
- [x] Measurability: scenarios assert exact registry, annotations, id fetch, summary budget preservation, and graph non-dashboard behavior.
- [x] Testability: requirements map to tool registration and rendered-output tests.

## Domain: evals
- [x] Completeness: covers duplicate suppression, reflection, decay, no-regression gates, and export/import semantics.
- [x] Clarity: states duplicate suppression is the only allowed ranking/output exception when answer reachability remains.
- [x] Measurability: scenarios define pass/rank comparisons, idempotency, source reachability, and round-trip behavior.
- [x] Testability: requirements map to retrieval eval fixtures and store export/import eval cases.

