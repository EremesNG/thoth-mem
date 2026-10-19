# Proposal: Token Savings Metrics

## Intent

Establish a token-savings and recall-efficiency measurement foundation for thoth-mem before broader community-summary read-path rollout. The product goal remains broad: agents should avoid rereading or rediscovering prior decisions by using bounded, graph-backed memory, but this first accelerated slice measures that effect rather than expanding rollout scope.

Current evidence shows the need and the starting point:

- The roadmap names token efficiency as a core product goal and calls out token-efficient bounded recall as P4 (`IMPROVEMENT_ROADMAP.md:26`, `IMPROVEMENT_ROADMAP.md:64`).
- P4 `token-savings-metrics` is the recommended next item before broader community-summary read-path rollout (`IMPROVEMENT_ROADMAP.md:96`, `IMPROVEMENT_ROADMAP.md:423`).
- The README already documents token-efficient recall and retrieval eval baselines, including compression and graph-quality benchmarks (`README.md:49`, `README.md:50`).
- `mem_recall mode=context` already emits per-hit `retrieval_contract`, `compression_ratio`, `evidence_chars`, and `full_chars` metadata (`src/tools/mem-recall.ts:77`, `src/tools/mem-recall.ts:81`).
- The retrieval eval already reports recall, `context_compression`, `surgical_compression`, hybrid fallback, KG, and community read-path rates (`src/evals/retrieval.ts:45`, `src/evals/retrieval.ts:70`, `src/evals/retrieval.ts:100`, `src/evals/retrieval.ts:1799`).

## Scope

This accelerated change defines the `Envelope eval+tool` slice: a canonical metrics envelope across the retrieval eval and existing recall/tool surfaces.

### In Scope

- Define a stable token-savings metrics envelope that can be produced by the retrieval eval and reflected in existing recall/tool metadata without adding a new MCP tool.
- Normalize names and meanings for measured fields such as full content size, returned evidence size, saved characters, compression ratio, recall/rank quality, lane participation, degraded fallback, and community read-path rates.
- Specify how existing `mem_recall mode=context` metadata maps into the envelope, preserving `compression_ratio`, `evidence_chars`, and `full_chars` as backwards-compatible surface data (`src/tools/mem-recall.ts:81`).
- Specify how the retrieval eval summary maps into the same envelope, including `context_compression`, `surgical_compression`, recall, hybrid fallback, KG, and community rates (`src/evals/retrieval.ts:47`, `src/evals/retrieval.ts:50`, `src/evals/retrieval.ts:85`, `src/evals/retrieval.ts:100`).
- Preserve current community-summary safety gates: community evidence stays inside the existing KG lane, no fifth lane is introduced, and default-on read-path rollout remains deferred (`openspec/specs/evals/spec.md:356`, `openspec/specs/evals/spec.md:365`, `openspec/specs/tools/spec.md:360`).
- Establish measurable verification targets for later tasks using the existing scripts `pnpm run eval:retrieval`, focused Vitest tests, `pnpm test`, and `pnpm run build` (`package.json:24`, `package.json:25`, `package.json:29`, `package.json:32`).

### Deferred / Needs Discovery

- Multi-harness metrics transport and presentation are deferred. The envelope should be compatible with future harness integrations, but this slice does not implement Claude/Codex hook parity.
- Moving `MemoryIntegrationCore` into thoth-mem is deferred.
- Community-summary read-path default-on rollout is deferred and remains gated by no-regression and bounded-output evidence.
- Longitudinal production telemetry, dashboards, and persisted operation-trace aggregation are deferred unless later tasks prove they are needed for the canonical envelope.
- Exact token counting by model tokenizer needs discovery. This slice may use deterministic character-based estimates already present in the code, with field names that leave room for later tokenizer-specific metrics.

### Out of Scope

- Turning on `communitySummaries.readPath.enabled` by default. This proposal explicitly does not change the default; the README documents that retrieval/context read-path usage remains opt-in with default `false` to avoid token-cost regressions (`README.md:511`, `README.md:533`).
- Creating a new MCP tool. Existing surfaces are sufficient because `mem_recall` already emits context-mode size/compression metadata, and the retrieval eval already produces quality/compression/read-path metrics. The compact six-tool MCP registry is an active project invariant (`openspec/specs/tools/spec.md:184`, `openspec/specs/tools/spec.md:360`).
- Changing retrieval ranking, KG lane semantics, community summary ranking weight, or community rebuild behavior.
- Changing stored memory schemas unless later tasks discover that the envelope cannot be represented without additive fields.
- Editing README, roadmap, code, tests, `dist/`, or archive artifacts during this proposal phase.

## Approach

Define a canonical metrics envelope with three layers:

1. **Envelope identity:** source surface (`retrieval_eval`, `mem_recall_context`, or future existing tool surface), run/case/hit identity where available, project/scope filters where available, and whether the measurement is per-hit, per-case, or aggregate.
2. **Savings metrics:** `full_chars`, `evidence_chars`, `returned_chars`, `saved_chars`, `compression_ratio`, and `compression_basis`. For existing `mem_recall mode=context`, `full_chars`, `evidence_chars`, and `compression_ratio` map directly from current metadata (`src/tools/mem-recall.ts:81`).
3. **Efficiency and safety metrics:** recall/rank quality (`recall_at_1`, `recall_at_k`, mean reciprocal rank), lane participation (`kg_hit_rate`, `kg_primary_rate`, `sentence_primary_rate`), degraded fallback rates, and community safety rates. These map from existing retrieval eval summary fields (`src/evals/retrieval.ts:1801`, `src/evals/retrieval.ts:1824`, `src/evals/retrieval.ts:1854`).

Behavior changes:

| Area | From | To | Reason | Impact |
| --- | --- | --- | --- | --- |
| Metrics vocabulary | Eval and tool metadata use related but scattered field names. | A canonical envelope defines field meanings and mappings across eval and existing tool surfaces. | Later verification needs to compare token savings and recall quality without bespoke interpretation per surface. | Lower ambiguity; no client-breaking rename required in this slice. |
| Recall context metadata | `mem_recall mode=context` emits per-hit size/compression metadata as rendered text. | The proposal treats those values as first-class envelope inputs. | The existing tool surface is already sufficient for the first measurement slice. | No new MCP tool; clients can keep using current output. |
| Community read-path rollout | Community read-path remains opt-in and protected by eval gates. | This proposal measures readiness but does not enable it by default. | P4 must establish evidence before rollout. | Avoids token-cost regression while preserving future rollout path. |

The first implementation tasks should prefer additive helpers/types and focused tests over broad refactors. If an implementation discovers that current text-only `mem_recall` metadata cannot be reliably consumed, it should first consider adding structured internal/test helpers or eval output fields before proposing any new MCP surface.

## Affected Areas

- `src/evals/retrieval.ts`: canonical aggregate envelope mapping for recall, compression, hybrid, KG, and community metrics.
- `tests/evals/retrieval.test.ts`: expectations for the envelope and no-regression metrics; current tests already assert community default-off/no-regression/bounds evidence (`tests/evals/retrieval.test.ts:377`).
- `src/tools/mem-recall.ts`: existing context-mode per-hit compression metadata; any change should preserve current text fields (`src/tools/mem-recall.ts:49`, `src/tools/mem-recall.ts:81`).
- `src/store/index.ts`: community-summary retrieval gating remains relevant context; retrieval returns no community-summary lane candidates unless the read path is enabled and the input is project-scoped (`src/store/index.ts:2668`, `src/store/index.ts:4119`).
- OpenSpec domains likely touched by later tasks: `evals`, `retrieval`, and `tools`, while respecting existing language about compression, community evidence in KG lane, and compact MCP surface (`openspec/specs/evals/spec.md:44`, `openspec/specs/retrieval/spec.md:64`, `openspec/specs/tools/spec.md:360`).

## Risks

- **Metric drift:** Changing names or formulas inconsistently could make eval output and tool metadata disagree.
- **False precision:** Character-based metrics are deterministic but not exact model-token counts. The envelope should label the basis so later tokenizer-specific metrics can be added without invalidating current evidence.
- **Surface expansion pressure:** A new MCP tool could fragment the compact agent workflow. Current evidence does not justify one because the retrieval eval and `mem_recall` already expose the needed first-slice data.
- **Community rollout confusion:** Metrics work could be mistaken for default-on enablement. This proposal explicitly keeps community-summary read-path default-off.
- **Regression masking:** Compression improvements are only useful if recall and rank quality remain above existing gates.

## Rollback Plan

- If envelope implementation regresses retrieval quality, revert the additive envelope/reporting changes and keep the existing retrieval eval summary fields.
- If tool output compatibility is affected, restore the current `mem_recall mode=context` metadata lines and move envelope generation behind eval/test-only helpers.
- If community read-path behavior changes accidentally, restore `communitySummaries.readPath.enabled` to default `false` and rely on existing default-off/no-regression tests.
- Because this slice should be additive and should not change persisted data semantics, rollback should not require database migration rollback.

## Success Criteria

- A canonical metrics envelope is specified and later tasks can implement it for retrieval eval aggregates and `mem_recall mode=context` per-hit data without adding an MCP tool.
- The envelope includes deterministic savings fields: `full_chars`, `evidence_chars` or returned evidence equivalent, `returned_chars` where applicable, `saved_chars`, `compression_ratio`, and `compression_basis`.
- The envelope includes recall-efficiency fields from the current eval: `recall_at_1`, `recall_at_k`, `mean_reciprocal_rank`, `context_compression`, `surgical_compression`, hybrid degraded/pending rates, KG lane rates, and community read-path rates.
- Existing `mem_recall mode=context` output remains backward-compatible, including `compression_ratio`, `evidence_chars`, and `full_chars`.
- `pnpm run eval:retrieval` can verify the envelope while preserving existing recall gates (`RETRIEVAL_EVAL_MIN_RECALL_AT_1 = 0.95`, `RETRIEVAL_EVAL_MIN_RECALL_AT_K = 0.9`; `src/evals/retrieval.ts:119`, `src/evals/retrieval.ts:120`).
- Focused tests cover the envelope mapping and community read-path no-regression/default-off metrics; broader `pnpm test` and `pnpm run build` remain the baseline before completion.
- Community-summary read-path remains default-off after the change, and the proposal/tasks do not introduce a fifth retrieval lane or a new MCP tool.
