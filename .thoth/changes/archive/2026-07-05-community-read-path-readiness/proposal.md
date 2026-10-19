# Proposal: Community Read Path Readiness

## Intent

Prepare a safe, measurable path to broader community-summary retrieval without
token-cost regression. This accelerated SDD slice follows P4
`token-savings-metrics`, which shipped the canonical retrieval eval measurement
envelope and left community-summary safety explicitly default-off/no-fifth-lane
(`IMPROVEMENT_ROADMAP.md:429-435`).

This slice is readiness/eval-gated only. It does **not** flip
`communitySummaries.readPath.enabled` to ON by default, does not broaden runtime
rollout, and does not add a new retrieval lane or MCP tool.

## Scope

The accepted scope is "Readiness eval-gated": harden and define the eval,
reporting, documentation, and test gates needed to decide a later default-on or
broader rollout. The current product behavior remains conservative:
community-summary metadata may be rebuilt, but retrieval/context read-path use
stays opt-in (`README.md:533`, `src/config.ts:306-320`,
`config.schema.json:265-272`).

### In Scope

- Define readiness gates that consume P4 token-savings metrics, including
  aggregate saved/returned context fields, recall/rank quality, lane truth, and
  community safety rates (`src/evals/retrieval.ts:48-87`).
- Preserve and test the runtime default:
  `communitySummaries.readPath.enabled === false` unless explicitly enabled by
  env or persisted config (`src/config.ts:948-955`,
  `tests/config.test.ts:370-439`).
- Require readiness reporting for community-summary safety rates already exposed
  by the retrieval eval: default-off, disabled/enabled no-regression, fallback,
  no-fifth-lane, direct-KG no-regression, multi-hop no-regression, summary
  bounds, coverage bounds, and enrichment-unavailable fallback
  (`src/evals/retrieval.ts:831-840`, `tests/evals/retrieval.test.ts:408-422`).
- Keep community-summary retrieval inside the existing KG lane as
  `source: 'kg_community_summary'`, preserving the four-lane contract
  (`sentence`, `kg`, `chunk`, `lexical`) with no community/fifth lane
  (`openspec/specs/retrieval/spec.md:353-359`,
  `tests/evals/retrieval.test.ts:64-93`).
- Confirm stale, missing, rebuilding, failed, degraded, and enrichment-failed
  community states fall back to the existing four-lane baseline without global
  retrieval failure (`openspec/specs/retrieval/spec.md:375-388`,
  `openspec/specs/evals/spec.md:371-384`).
- Confirm output bounds remain enforced by configured budgets:
  `summaryMaxChars`, `maxRetrievalCommunities`, evidence counts, and source
  observation coverage (`README.md:569-580`,
  `config.schema.json:286-332`).
- Document the future decision gate for any later default-on or broader rollout:
  the change may recommend readiness status, but runtime defaults remain OFF in
  this slice.

### Deferred / Needs Discovery

- Broader default-on rollout criteria after this readiness slice, including the
  exact required number of project corpora, fixture breadth, or real-world run
  history needed before changing defaults.
- Per-project or operator-scoped rollout policy, if future evidence suggests a
  global default is too coarse.
- Dashboard/report UX for presenting readiness history across multiple runs.
- Whether the community weight (`kgCommunityWeight`, currently default `0.45`)
  should be tuned before any later default-on decision
  (`src/config.ts:319-320`).

### Out of Scope

- Flipping `communitySummaries.readPath.enabled` default to ON.
- Enabling community-summary retrieval by default through docs, schema,
  persisted config backfill, env defaults, tests, or runtime behavior.
- Introducing a fifth retrieval lane, a community-specific MCP lane/tool, a
  parallel GraphRAG lane, or any change to the compact MCP tool registry.
- Multi-harness/G3 work and MemoryIntegrationCore migration.
- Reworking the community summary construction algorithm, storage schema,
  export/import behavior, or maintenance/admin surfaces.
- Per-project rollout configuration in this slice.

## Approach

Use the proposal success criteria as the acceptance reference for accelerated
`sdd-tasks`. The implementation plan should be additive and should focus on
readiness evidence:

1. Audit the current retrieval eval summary/report output and tests to ensure
   the P4 token-savings envelope is sufficient for a future community-read-path
   decision.
2. Add or tighten focused tests around readiness gates only where gaps exist,
   preserving existing runtime behavior and defaults.
3. Make reporting explicit enough that a reviewer can tell whether community
   retrieval is ready, blocked, or needs more corpus data before default-on.
4. Keep all community evidence as KG-lane evidence from
   `queryCommunitySummaryLane`; it should continue returning `[]` when the read
   path is disabled or no project filter is present (`src/store/index.ts:4118-4127`).
5. Treat stale/degraded community state as a readiness input and fallback case,
   not as a reason to fail baseline retrieval (`src/store/index.ts:2668-2698`,
   `src/store/index.ts:4131-4145`).

Rejected/deferred alternatives:

- **Docs-only readiness:** rejected because default-on decisions need executable
  eval/report gates, not only prose.
- **Per-project rollout config now:** deferred until readiness evidence shows
  whether a scoped rollout is necessary.
- **Global default-on now:** rejected because this slice is explicitly
  eval-gated readiness and must preserve the default-off behavior.

## Affected Areas

- `src/evals/retrieval.ts`: readiness/reporting metrics for token savings,
  community safety, fallback, and no-regression gates.
- `tests/evals/retrieval.test.ts`: focused assertions for the readiness
  contract and metrics envelope.
- `tests/config.test.ts`: preservation of community-summary default-off config
  and env/persisted override precedence.
- `tests/store/community-summaries.test.ts`: KG-lane/no-fifth-lane, output
  bounds, stale/degraded fallback, and direct retrieval integration coverage.
- `tests/tools/mem-recall.test.ts`: compact/context output annotations that
  must remain KG-lane, bounded, and backward-compatible.
- `README.md` or roadmap wording only if needed to describe readiness gates
  without implying runtime default-on.

## Risks

- Token-cost regression risk: community summaries can become extra context
  unless readiness checks bind returned/evidence chars and compression metrics
  to the P4 envelope.
- Ranking regression risk: community summaries could swamp direct KG or B2
  multi-hop evidence if readiness checks do not preserve direct-KG priority and
  no-regression rates.
- Safety signal drift: reporting could show rates without making the default-off
  decision obvious to maintainers.
- False readiness risk: a small deterministic fixture set may pass while
  project-specific corpora still need broader validation.
- Scope creep risk: readiness work could accidentally become rollout work by
  changing config defaults, docs defaults, or lane behavior.

## Rollback Plan

- Revert readiness-report/test additions and keep existing P4 metrics output as
  the baseline.
- If any tightened readiness gate proves flaky, disable only the new gate/report
  assertion while preserving current retrieval runtime behavior.
- Keep `communitySummaries.readPath.enabled` default OFF throughout; rollback
  must not require migrating user data or changing stored community summaries.
- If community-enabled readiness evidence regresses, document the failed gate
  and continue to ignore community summaries in the default read path.

## Success Criteria

- P4 token-savings metrics remain present and backward-compatible, including
  `token_savings_metrics` aggregate fields for `full_chars`, `evidence_chars`,
  `returned_chars`, `saved_chars`, compression, recall/rank quality, lane truth,
  and community safety rates.
- Community readiness reporting makes pass/fail status clear for:
  default-off, disabled no-regression, enabled no-regression, fallback,
  no-fifth-lane, direct KG no-regression, multi-hop no-regression, summary
  bounds, coverage bounds, and enrichment-unavailable fallback.
- `communitySummaries.readPath.enabled` remains default `false` in runtime
  config, schema, README/env docs, and config tests; explicit env or persisted
  opt-in behavior remains available.
- Missing, stale, rebuilding, failed, degraded, and enrichment-unavailable
  community states fall back to the existing four-lane baseline without global
  retrieval failure and with degraded state visible when relevant.
- Community-summary output stays bounded by `maxRetrievalCommunities`,
  `summaryMaxChars`, `maxEvidencePerCommunity`, and `sourceObservationLimit`.
- Community evidence remains a KG sub-source (`lane: 'kg'`,
  `source: 'kg_community_summary'`); no `community` lane, fifth lane, new MCP
  tool, or GraphRAG lane is introduced.
- Direct KG and B2 multi-hop evidence remain no worse than the community-disabled
  baseline under the documented readiness gate.
- The final result produces a readiness basis for a future rollout decision
  without changing production defaults in this slice.
