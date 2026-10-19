# Design: Community Read Path Rollout Gate

## Technical Approach

Keep `communitySummaries.readPath.enabled` as the existing global, reversible
operator opt-in and add a second, per-project eligibility gate at the read-path
boundary. The gate is computed on demand from existing community state and
readiness evidence rather than stored as a new per-project decision. This avoids
schema and lifecycle risk while still ensuring that global config alone cannot
enable community evidence for every project.

The implementation will introduce shared rollout constants and a small eligibility
helper, then call it from the existing community-summary read-path path in
`src/store/index.ts`. Eligible community summaries continue to produce
`LaneCandidate` entries with `lane: 'kg'` and `source: 'kg_community_summary'`.
No MCP tool, lane, admin surface, persisted config field, or GraphRAG synthesis
path is added.

The rollout gate uses these named constants:

- `COMMUNITY_ROLLOUT_MIN_COMMUNITIES = 1`
- `COMMUNITY_ROLLOUT_MIN_KG_TRIPLES = 1`
- `COMMUNITY_ROLLOUT_MIN_SOURCE_OBSERVATIONS = 1`
- `COMMUNITY_ROLLOUT_MIN_COMMUNITY_SOURCE_OBSERVATIONS = 1`
- `COMMUNITY_ROLLOUT_MIN_COMMUNITY_ENTITY_COUNT = 1`
- `COMMUNITY_ROLLOUT_MIN_COMMUNITY_TRIPLE_COUNT = 1`
- `COMMUNITY_ROLLOUT_MIN_SOURCE_ATTRIBUTION_RATE = 1`
- `COMMUNITY_ROLLOUT_RECALL_REGRESSION_TOLERANCE = 0`
- `COMMUNITY_ROLLOUT_RANK_REGRESSION_TOLERANCE = 0`
- `COMMUNITY_ROLLOUT_TOKEN_RETURNED_CHARS_REGRESSION_TOLERANCE = 0`
- `COMMUNITY_ROLLOUT_TOKEN_EVIDENCE_CHARS_REGRESSION_TOLERANCE = 0`

The coverage constants are intentionally minimal because current deterministic
fixtures only prove sparse one-community/one-triple cases. They are conservative
for an opt-in-only rollout because every gate also requires explicit opt-in,
fresh committed state, non-degraded state, source attribution, same-corpus A/B
no-regression, token no-regression, and fallback proof before eligibility can be
reported.

Constitution Check self-review:

- P1 Compact MCP surface: pass. The design preserves exactly the six existing
  tools and routes rollout evidence through config, eval, README, store, and
  existing tool output.
- P2 Deterministic-first retrieval: pass. Community evidence is optional and
  degrades to lexical/KG baseline with explicit degraded markers.
- P3 Harness-agnostic memory contract: pass. No harness-specific fields or MCP
  shapes are introduced.
- P4 Token-efficient bounded recall: pass. The rollout gate requires P4
  full/evidence/returned/saved/compression metrics with named threshold and
  observed values.
- P5 Stable public contract: pass. No public tool, CLI command, HTTP route, or
  observation taxonomy breaking change is planned.

## Architecture Decisions

### Decision: Compute Project Eligibility On Demand

**Choice**: Evaluate eligibility at retrieval/eval time from
`getCommunitySummaryState()`, the current graph signature, committed run metadata,
summary candidate metadata, and the explicit read-path opt-in.

**Alternatives considered**: Store a per-project rollout decision; add a new
config map of eligible projects; add a new admin command/tool to mark eligibility.

**Rationale**: Existing state already records freshness, committed run id,
current graph signature, counts, degradation, and errors. On-demand evaluation is
lower risk, reversible by clearing the existing opt-in, avoids schema migration,
and cannot go stale independently of the graph signature. A stored decision would
need invalidation on every graph/community rebuild and would create a second
source of truth.

### Decision: Add a Shared Rollout Helper and Constants

**Choice**: Create a focused helper module, planned as
`src/retrieval/community-rollout.ts`, exporting named threshold constants,
eligibility result types, and pure evaluators for readiness, A/B no-regression,
token no-regression, and fallback status.

**Alternatives considered**: Inline constants in `src/store/index.ts` and
`src/evals/retrieval.ts`; put constants in config; put constants in README only.

**Rationale**: The store and eval suite must report the same gate names,
thresholds, and observed values. A shared pure helper prevents drift without
turning rollout thresholds into operator config before broader evidence exists.
Keeping them out of persisted config also preserves the existing explicit
opt-in path without adding a second operator knob.

### Decision: Freshness Requires Current Graph Signature and Non-Degraded State

**Choice**: A project is eligible only when community summaries are enabled,
read-path opt-in is true, `getCommunitySummaryState()` reports `state: 'fresh'`,
`run_id` equals `latest_committed_run_id`, `graph_signature` equals
`current_graph_signature`, all minimum coverage constants pass, and
`degraded === false` with no degraded reasons.

**Alternatives considered**: Accept `degraded` or enrichment-unavailable
extractive summaries; accept stale committed summaries when
`staleBehavior = 'include-degraded'`; rely only on `getCommunitySummariesForRetrieval()`.

**Rationale**: The clarified specs exclude stale, rebuilding, failed, degraded,
and enrichment-unavailable states from eligibility. Current code can still keep
committed degraded/failed summaries for inspection, but rollout eligibility must
not rank them as fresh read-path evidence.

### Decision: Community Evidence Remains a KG Sub-Source

**Choice**: Preserve the existing `queryCommunitySummaryLane()` behavior shape:
community candidates are fused through the KG lane with
`source: 'kg_community_summary'`, `DEFAULT_LANE_ORDER` remains
`['sentence', 'kg', 'chunk', 'lexical']`, and source priority keeps
`kg_triples` above `kg_multi_hop` above `kg_community_summary`.

**Alternatives considered**: Add a community lane; add GraphRAG/global-answer
synthesis; promote community summaries above direct KG when highly relevant.

**Rationale**: The no-fifth-lane requirement and current ranking code already
support the desired behavior. Changing lanes or synthesis would expand public
semantics, risk P1/P4 violations, and make direct KG/B2 regression gates harder
to reason about.

### Decision: Same-Corpus A/B Evidence Is an Eval Contract

**Choice**: Extend `src/evals/retrieval.ts` so rollout reporting contains paired
disabled and enabled measurements for the same project, corpus, query set,
retrieval limits, and configured community budgets. Reports include gate name,
threshold, disabled observed value, enabled observed value, and pass/fail.

**Alternatives considered**: Keep current aggregate readiness rates only; compare
different fixture projects; rely on manual README instructions.

**Rationale**: Existing readiness rates prove pieces of behavior but do not yet
make the disabled baseline and enabled candidate distinguishable enough for a
rollout decision. Pairing the same corpus/query/budgets is the only reliable way
to detect recall, rank, token, lane-truth, and fallback regressions.

## Data Flow

1. Config resolution remains unchanged: `resolveCommunitySummariesConfig()`
   keeps `communitySummaries.readPath.enabled` default `false`, with env
   overriding persisted config.
2. `Store.hybridRetrieve()` calls `queryCommunitySummaryLane()` only as part of
   the existing fused retrieval path.
3. `queryCommunitySummaryLane()` returns no candidates unless the global
   read-path opt-in is true and a project filter exists.
4. The new helper evaluates project readiness from `getCommunitySummaryState()`
   and bounded candidates from `getCommunitySummariesForRetrieval()`.
5. If eligibility fails, `queryCommunitySummaryLane()` returns no community
   candidates and appends a specific degraded marker such as
   `kg_communities_missing`, `kg_communities_stale`,
   `kg_communities_rebuilding`, `kg_communities_failed`,
   `kg_communities_degraded`, `kg_communities_ineligible_coverage`, or
   `kg_communities_ineligible_signature`.
6. If eligibility passes, matching summaries are converted to KG lane candidates
   with bounded summary text, source observation ids, entity/triple counts, and
   `source: 'kg_community_summary'`.
7. `fuseCandidates()` ranks community evidence under the existing KG lane source
   priority, preserving direct KG and B2 multi-hop rank safety.
8. `runRetrievalEval()` executes paired disabled/enabled retrieval cases over
   the same corpus/query/budgets, builds the P4 token-savings envelope, and
   reports threshold plus observed values for every rollout gate.

Text sequence:

```text
operator opt-in/env or persisted config
  -> resolveCommunitySummariesConfig(default readPath false)
  -> Store.hybridRetrieve(project, query, budgets)
  -> queryCommunitySummaryLane
  -> evaluateCommunityReadPathEligibility(project state + summaries)
  -> eligible: KG sub-source candidates
  -> ineligible: baseline lanes + degradedFallback marker
  -> fuseCandidates(sentence/kg/chunk/lexical)
  -> mem_recall/mem_project existing bounded output
```

## File Changes

Create:

- `src/retrieval/community-rollout.ts` - named rollout constants, eligibility
  result types, pure readiness/token/A-B/fallback evaluators.

Modify:

- `src/store/index.ts` - call the shared eligibility helper from
  `queryCommunitySummaryLane()`, require fresh committed non-degraded state tied
  to the current graph signature, preserve baseline fallback markers, and keep
  candidate lane/source unchanged.
- `src/store/types.ts` - add narrow exported types only if needed for the helper
  inputs/results; no schema-backed type or persisted decision type is planned.
- `src/evals/retrieval.ts` - replace aggregate-only community readiness with
  same-corpus disabled/enabled rollout gate reporting, P4 token threshold/observed
  values, coverage threshold/observed values, fallback state evidence, and direct
  KG/B2 no-regression gates.
- `tests/store/community-summaries.test.ts` - cover on-demand eligibility for
  fresh committed state, graph-signature drift, stale/rebuilding/failed/degraded
  and enrichment-unavailable states, sparse coverage blocking, and baseline
  fallback when disabled baseline has hits.
- `tests/evals/retrieval.test.ts` - assert A/B report shape, threshold constants,
  observed values, zero-regression deterministic fixture gates, P4 token metrics,
  fallback states, no-fifth-lane, direct KG, and B2 no-regression.
- `tests/config.test.ts` - keep/strengthen assertions that default read path is
  false and env/persisted config remain the only explicit opt-in.
- `tests/tools/mem-recall.test.ts` - keep existing additive annotation tests and
  add assertions only if the output gains bounded rollout/degraded annotations.
- `tests/tools/mem-project.test.ts` - keep summary-only community annotations and
  assert `action=graph` remains a KG ledger if touched.
- `README.md` - document the rollout gate as opt-in-only, same-corpus A/B gated,
  reversible through existing env/persisted config, and not global default-on.
- `config.schema.json` - only update descriptions if needed to clarify that
  `readPath.enabled` is an opt-in and not eligibility by itself; no new config
  property is planned.

Delete:

- None.

## Interfaces / Contracts

Planned helper exports in `src/retrieval/community-rollout.ts`:

```ts
export const COMMUNITY_ROLLOUT_MIN_COMMUNITIES = 1;
export const COMMUNITY_ROLLOUT_MIN_KG_TRIPLES = 1;
export const COMMUNITY_ROLLOUT_MIN_SOURCE_OBSERVATIONS = 1;
export const COMMUNITY_ROLLOUT_MIN_COMMUNITY_SOURCE_OBSERVATIONS = 1;
export const COMMUNITY_ROLLOUT_MIN_COMMUNITY_ENTITY_COUNT = 1;
export const COMMUNITY_ROLLOUT_MIN_COMMUNITY_TRIPLE_COUNT = 1;
export const COMMUNITY_ROLLOUT_MIN_SOURCE_ATTRIBUTION_RATE = 1;
export const COMMUNITY_ROLLOUT_RECALL_REGRESSION_TOLERANCE = 0;
export const COMMUNITY_ROLLOUT_RANK_REGRESSION_TOLERANCE = 0;
export const COMMUNITY_ROLLOUT_TOKEN_RETURNED_CHARS_REGRESSION_TOLERANCE = 0;
export const COMMUNITY_ROLLOUT_TOKEN_EVIDENCE_CHARS_REGRESSION_TOLERANCE = 0;
```

Planned readiness result shape:

```ts
export interface CommunityReadPathEligibilityResult {
  eligible: boolean;
  gates: Array<{
    name: string;
    passed: boolean;
    threshold: number | string | boolean;
    observed: number | string | boolean | null;
    reason?: string;
  }>;
  degradedFallbackMarker?: string;
}
```

Store contract:

- `communitySummaries.readPath.enabled === false` means no community-summary
  read-path query is attempted.
- `communitySummaries.readPath.enabled === true` is necessary but insufficient;
  project eligibility must pass on demand.
- Ineligible states never emit `kg_community_summary` candidates.
- Fallback non-empty behavior is required only when the disabled baseline for
  the same project/corpus/query/budgets has non-empty source-attributed hits.

Eval contract:

- The eval report must make disabled baseline and enabled candidate metrics
  distinguishable for the same project/corpus/query/budgets.
- Each rollout gate row must include gate name, threshold, observed disabled
  value when applicable, observed enabled value when applicable, and pass/fail.
- P4 token rows must include `full_chars`, `evidence_chars`, `returned_chars`,
  `saved_chars`, `compression_ratio`, recall/rank quality, lane truth, and
  community safety rates.
- Deterministic fixture regression tolerance is zero unless a future change adds
  a separately named tolerance with tests and rationale.

Public surface contract:

- MCP tools remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`,
  `mem_project`, and `mem_session`.
- `mem_recall` and `mem_project action=summary` may surface existing bounded
  community annotations only from eligible KG-lane evidence.
- `mem_project action=graph` remains a KG fact ledger and does not become a P5
  graph navigation or community visualization surface.

## Testing Strategy

Focused tests first:

```bash
pnpm exec vitest run tests/config.test.ts tests/evals/retrieval.test.ts tests/store/community-summaries.test.ts tests/tools/mem-recall.test.ts tests/tools/mem-project.test.ts
```

Retrieval eval gate:

```bash
pnpm run eval:retrieval
```

Build and full regression:

```bash
pnpm run build
pnpm test
```

Test coverage will include:

- Default-off config and reversible env/persisted opt-in.
- Per-project eligibility does not leak from one project to another.
- Fresh committed state requires matching current graph signature and
  non-degraded status.
- Stale, rebuilding, failed, degraded, enrichment-unavailable, missing, and
  coverage-insufficient states emit no community candidates and preserve baseline
  hits when disabled baseline has hits.
- Same-corpus disabled/enabled A/B report rows include threshold and observed
  values.
- Zero regression for recall@1, recall@k, MRR/rank, direct KG, B2 multi-hop,
  lane truth, no-fifth-lane, returned/evidence chars, compression, and saved
  chars on deterministic fixtures.
- Community candidates remain bounded by count, char, source observation, entity,
  and triple coverage constants.
- Existing tool registry and existing output contracts remain unchanged.

## Migration / Rollout

No database migration is planned. Rollout remains configuration-driven and
reversible through the existing `THOTH_COMMUNITY_READ_PATH_ENABLED` env var or
persisted `communitySummaries.readPath.enabled` setting.

Operational sequence:

1. Keep the global default OFF.
2. Rebuild community summaries for a project through existing CLI/HTTP/admin
   paths.
3. Run same-corpus retrieval evals with disabled and enabled read-path settings.
4. Confirm all rollout gates pass with threshold and observed values in the
   report.
5. Opt in the project by enabling the existing read-path config in that runtime.
6. Roll back by clearing the env/persisted opt-in; community metadata remains
   available for inspection and rebuild.

Broader global default-on remains deferred until multiple real projects show
stable wins with the same evidence shape. P5 graph navigation v2, multi-harness
support, G3 harness parity, MemoryIntegrationCore migration, and GraphRAG
global-answer synthesis remain deferred.

## Open Questions

- The initial minimum coverage constants are intentionally sparse-fixture
  compatible. Future real-project evidence may justify stricter values, but that
  should be a separate change with named constants and updated eval fixtures.
- README wording should be careful to call `readPath.enabled` an opt-in, not an
  eligibility guarantee.
- If future operators need persisted per-project approvals, that should be a
  separate proposal because it introduces invalidation and public configuration
  semantics not needed for this rollout gate.
