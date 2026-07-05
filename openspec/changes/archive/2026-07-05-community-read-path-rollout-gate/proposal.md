# Proposal: Community Read Path Rollout Gate

## Intent

Define a concrete, gradual rollout gate for community-summary participation in
the retrieval read path. The prior `community-read-path-readiness` change proved
that readiness metrics and fallback checks exist, but it deliberately kept
`communitySummaries.readPath.enabled` default OFF. This change turns that
readiness foundation into an operator-safe activation policy for opt-in
projects, using A/B eval evidence, token-savings metrics, graph/community
readiness, and regression/fallback gates before broader activation is allowed.

From: community summaries can be rebuilt and evaluated, while read-path usage is
globally opt-in through `communitySummaries.readPath.enabled=false` by default.
To: community-summary read-path usage remains globally default OFF, but a
documented rollout gate can allow eligible projects to participate when evidence
shows no token, recall, ranking, or fallback regression.
Reason: the product should harvest graph-compressed context only when it saves
tokens and preserves recall quality.
Impact: operators get a repeatable activation path without adding MCP tools,
creating a fifth retrieval lane, or prematurely flipping the global default.

## Scope

### In Scope

- Define the rollout policy for `communitySummaries.readPath.enabled=true` as a
  gated, gradual activation path rather than a global default-on change.
- Require A/B retrieval eval evidence comparing community-disabled versus
  community-enabled read-path behavior before any project is considered eligible.
- Require P4 token-savings evidence, including returned-context size,
  compression, saved chars, recall/rank quality, lane truth, and community
  safety rates.
- Define per-project readiness gates that can consider project identity, fresh
  community rebuild state, minimum KG/community size, source-observation
  coverage, and absence of degraded/stale/rebuilding/failed state.
- Preserve the existing documented flag/env/config path for activation, with
  `THOTH_COMMUNITY_READ_PATH_ENABLED` and persisted
  `communitySummaries.readPath.enabled` remaining explicit opt-ins.
- Require regression gates for default-off behavior, disabled no-regression,
  enabled no-regression, direct KG no-regression, B2 multi-hop no-regression,
  no-fifth-lane, summary bounds, coverage bounds, and enrichment-unavailable
  fallback.
- Require fallback gates for missing, stale, rebuilding, failed, degraded, and
  enrichment-unavailable community states so baseline retrieval remains usable.
- Keep community summaries as `kg` lane sub-source evidence
  (`kg_community_summary`) inside the existing fused read path.
- Use existing `mem_recall`, `mem_project`, eval, config, README, and store
  paths; no new MCP tool, lane, or admin surface is proposed.

### Deferred / Needs Discovery

- The exact threshold values for "minimum graph/community size" may need to be
  finalized during spec/design from current fixture and real-project evidence
  (for example, minimum KG triples, committed communities, source observations,
  and coverage ratios).
- Whether eligibility should be represented only as documented operator policy
  or also as a stored per-project readiness decision needs design validation
  against current config persistence patterns.
- Whether rollout evidence should be summarized only in retrieval eval output or
  also surfaced through existing `mem_project` summary/graph views needs design
  review for token budget impact.
- Broader corpus breadth requirements for any future global default-on decision
  remain open until multiple real projects demonstrate stable wins.

### Out of Scope

- Flipping `communitySummaries.readPath.enabled` to default ON globally.
- Adding new MCP tools, changing the compact six-tool MCP registry, or creating
  a community-specific `mem_*` surface.
- Introducing a fifth retrieval lane, a separate community lane, GraphRAG global
  answer synthesis, query-time subquery generation, or LLM query planning.
- Reworking community construction algorithms, storage schema, export/import
  behavior, or CLI/HTTP community admin operations except where existing status
  data is needed for gate evaluation.
- Multi-harness support, G3 harness parity, MemoryIntegrationCore migration, and
  cross-repo hook work.
- P5 graph navigation v2; it remains the next/deferred graph-navigation work
  after this P3 rollout-gate planning change.

## Approach

Use the archived readiness scorecard as the baseline, then specify the missing
activation discipline:

1. Treat global community read-path enablement as a policy decision guarded by
   evidence, not as a default change in this planning phase.
2. Define A/B eval gates that compare community-disabled and community-enabled
   retrieval for the same corpus and queries, using the existing retrieval eval
   envelope and readiness rates.
3. Define per-project eligibility checks before read-path activation: explicit
   operator opt-in, project-scoped community rebuild committed and fresh,
   minimum KG/community/source-observation size, bounded summaries, no stale or
   failed run state, and no degraded fallback that would make the comparison
   unreliable.
4. Define regression gates that block rollout when community-enabled retrieval
   worsens recall@1, recall@k, MRR, direct KG, B2 multi-hop, lane truth, output
   bounds, or token-savings metrics beyond the accepted threshold.
5. Define fallback gates that prove disabled, missing, stale, rebuilding,
   failed, degraded, and enrichment-unavailable states return the existing
   four-lane baseline without global failure.
6. Keep implementation constrained to existing config/eval/store/readme/spec
   surfaces. Community evidence continues to be emitted as KG-lane evidence and
   remains bounded by existing community budgets.
7. Document rollback as clearing the explicit read-path opt-in or reducing
   project eligibility without deleting community metadata or altering source
   memories.

Rejected alternatives:

- **Global default-on now:** rejected because readiness exists, but rollout
  requires project/corpus evidence and a reversible gate.
- **New MCP rollout tool:** rejected because it violates the compact six-tool
  surface and the existing config/eval/admin boundaries are sufficient.
- **Fifth community lane:** rejected because community summaries enrich KG/read
  path evidence and must not become an independent retrieval lane.

## Affected Areas

- `src/config.ts`: existing community-summary config resolution and default-off
  read-path behavior.
- `config.schema.json`: documented config shape and default for
  `communitySummaries.readPath.enabled`.
- `README.md`: operator-facing rollout gate documentation without implying
  global default-on behavior.
- `src/evals/retrieval.ts`: A/B readiness, token-savings, community safety,
  fallback, and no-regression metrics used as rollout evidence.
- `src/store/index.ts`: existing community summary read-path integration,
  freshness/degraded state checks, bounds, and KG-lane sub-source behavior.
- `openspec/specs/retrieval/spec.md`: future delta for gated community
  read-path activation while preserving four-lane fusion.
- `openspec/specs/evals/spec.md`: future delta for rollout eligibility,
  A/B evidence, token-savings, and fallback gates.
- `openspec/specs/tools/spec.md`: future delta preserving the compact MCP
  registry and existing-tool-only consumption.

## Risks

- Token-regression risk: community summaries can add context unless returned
  chars, evidence chars, compression, and saved chars stay gated.
- Ranking-regression risk: community summaries can outrank direct KG or
  multi-hop evidence unless direct KG and B2 multi-hop gates remain explicit.
- False-readiness risk: small deterministic fixtures may pass while real
  project corpora are too sparse, stale, or skewed for safe activation.
- Configuration ambiguity risk: global `communitySummaries.readPath.enabled`
  could be mistaken for broad approval unless documentation distinguishes
  explicit opt-in from passed rollout eligibility.
- Fallback erosion risk: degraded or failed community states could silently
  lower recall quality if fallback gates stop requiring non-empty baseline hits.
- Scope creep risk: rollout gating could drift into graph navigation v2,
  multi-harness work, or a new MCP/admin surface.

## Rollback Plan

- Keep the global default OFF; rollback from any attempted activation is clearing
  `THOTH_COMMUNITY_READ_PATH_ENABLED` or persisted
  `communitySummaries.readPath.enabled`.
- If a per-project eligibility decision is introduced later, mark that project
  ineligible or remove the explicit opt-in without deleting community tables or
  source observations.
- If A/B evals regress, preserve community metadata for rebuild/status
  inspection but exclude it from read-path retrieval.
- If fallback behavior becomes unreliable, disable community read-path
  participation and continue serving the existing sentence, chunk, lexical,
  direct KG, and multi-hop KG baseline.
- If token output grows unexpectedly, lower existing community budgets or keep
  read-path participation disabled until compression gates pass again.

## Success Criteria

- The proposal/spec/design for this change keeps
  `communitySummaries.readPath.enabled` globally default OFF and treats
  activation as explicit, reversible, and evidence-gated.
- Rollout eligibility requires A/B eval evidence comparing community-disabled
  and community-enabled retrieval for the same project/corpus/query set.
- Rollout eligibility consumes P4 token-savings metrics and blocks activation
  when returned context, compression, saved chars, recall, rank, or lane-truth
  evidence regresses beyond the accepted gate.
- Per-project readiness gates account for explicit opt-in, fresh committed
  community state, minimum graph/community/source-observation size, coverage
  bounds, and absence of stale/rebuilding/failed/degraded state.
- Fallback gates prove missing, stale, rebuilding, failed, degraded, and
  enrichment-unavailable community states return usable baseline retrieval
  without global failure.
- Community-summary evidence remains a KG-lane sub-source; no `community` lane,
  fifth retrieval lane, GraphRAG lane, global answer synthesis, or new MCP tool
  is introduced.
- Direct KG and B2 multi-hop retrieval remain no worse than the
  community-disabled baseline under the rollout gate.
- Multi-harness support and P5 graph navigation v2 remain explicitly deferred,
  with P5 graph navigation v2 preserved as the next/deferred graph work after
  P3 rollout gating.
