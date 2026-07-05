# Delta for Evals

## ADDED Requirements

### Requirement: Rollout Eligibility MUST Require Same-Corpus A/B Retrieval Evidence
The evaluation suite MUST compare community-summary read-path behavior disabled versus enabled on the same project, corpus, query set, and config budgets before a project is considered eligible for rollout. The A/B report MUST make the disabled baseline and enabled candidate outcomes distinguishable, MUST name the regression threshold used for each gate, and MUST block eligibility when the enabled run regresses beyond that named threshold.

#### Scenario: Disabled and enabled runs use the same corpus and queries
- GIVEN a stable project corpus and query set
- WHEN rollout eligibility evals execute
- THEN the suite MUST run a community-disabled baseline and a community-enabled candidate over the same corpus and queries
- AND the report MUST identify which metrics came from each run

#### Scenario: A/B regression blocks eligibility
- GIVEN the community-enabled run worsens a disabled-baseline passing query beyond the named regression threshold
- WHEN rollout eligibility is summarized
- THEN the project MUST NOT be marked eligible for community-summary read-path enrichment

### Requirement: P4 Token-Savings Metrics MUST Gate Rollout Eligibility
Rollout eligibility MUST consume the P4 token-savings envelope, including `full_chars`, `evidence_chars`, `returned_chars`, `saved_chars`, compression, recall quality, rank quality, lane truth, and community safety metrics where applicable. Eligibility MUST block when community-enabled retrieval increases returned/evidence context or worsens compression/saved chars beyond the named token-regression threshold without preserving recall and rank quality.

#### Scenario: Token-savings envelope is complete
- GIVEN rollout eligibility evals complete
- WHEN the report is produced
- THEN it MUST include full, evidence, and returned character counts
- AND it MUST include compression and saved-character metrics
- AND it MUST include recall/rank quality, lane-truth, and community-safety rates where applicable

#### Scenario: Token regression blocks rollout
- GIVEN community-enabled retrieval returns more context than the named token-regression threshold permits without preserving recall/rank quality at the named threshold
- WHEN eligibility is evaluated
- THEN rollout eligibility MUST fail for that project or gate

### Requirement: Readiness Gates MUST Cover Project State and Summary Bounds
Evaluation reporting MUST include per-project readiness gates for explicit opt-in, fresh committed community state, named minimum KG/community/source-observation coverage thresholds, summary bounds, source coverage bounds, and absence of stale, rebuilding, failed, degraded, or enrichment-unavailable state.

#### Scenario: Per-project readiness gate reports each input
- GIVEN rollout eligibility evals inspect a project
- WHEN readiness is reported
- THEN the report MUST show opt-in status, committed/fresh rebuild status, graph/community/source coverage, summary bounds, and degraded-state eligibility

#### Scenario: Sparse coverage blocks readiness
- GIVEN a project has explicit opt-in but graph, community, or source-observation coverage below the named minimum thresholds
- WHEN readiness is evaluated
- THEN the project MUST NOT pass rollout eligibility
- AND the report MUST identify coverage as the blocking gate

### Requirement: Fallback Gates MUST Prove Baseline Retrieval Remains Usable
Evaluation coverage MUST include disabled, missing, stale, rebuilding, failed, degraded, and enrichment-unavailable community states. For each state, when the disabled baseline has non-empty hits for the same corpus and query set, the fallback result MUST be non-empty, source-attributed, and free of global retrieval failure.

#### Scenario: Community-unavailable states preserve non-empty baseline hits
- GIVEN the disabled baseline has hits for a query
- WHEN evals run missing, stale, rebuilding, failed, degraded, and enrichment-unavailable community states
- THEN each state MUST return non-empty fallback retrieval
- AND each result MUST preserve source lineage

#### Scenario: Fallback failure blocks rollout
- GIVEN any unavailable community state yields an empty result for a query whose disabled baseline has hits
- WHEN rollout readiness is summarized
- THEN the fallback gate MUST fail
- AND the project MUST NOT be marked eligible

### Requirement: Lane and Ranking Regression Gates MUST Protect Existing KG Behavior
Evaluation coverage MUST assert no fifth lane, no community-specific retrieval lane, no new GraphRAG/global lane, direct KG no-regression, and B2 multi-hop no-regression. Community-summary evidence MUST be asserted as KG-lane sub-source evidence such as `kg_community_summary`.

#### Scenario: Eval asserts no fifth lane
- GIVEN community-summary evidence contributes during an enabled eval
- WHEN lane attribution is inspected
- THEN the evidence MUST be reported as `lane: 'kg'` with sub-source `kg_community_summary`
- AND no fifth lane MUST appear

#### Scenario: Direct KG and B2 multi-hop do not regress
- GIVEN direct KG and B2 multi-hop fixtures pass under the disabled baseline
- WHEN the same fixtures run with community summaries enabled
- THEN their recall and rank outcomes MUST be no worse than the named regression threshold

### Requirement: Rollout Evidence MUST Not Expand Deferred Scope
Rollout evals MUST NOT require or imply multi-harness support, G3 harness parity, MemoryIntegrationCore migration, or P5 graph navigation v2. These areas MUST remain deferred even when rollout evidence passes.

#### Scenario: Passing rollout evals do not imply deferred work is complete
- GIVEN all community read-path rollout eval gates pass for a project
- WHEN eligibility is reported
- THEN the report MAY mark that project eligible for this rollout gate
- AND it MUST NOT claim multi-harness support or P5 graph navigation v2 completion

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Regression thresholds are zero-regression for deterministic fixtures unless design identifies an existing readiness/eval signal that justifies a stricter or separately named tolerance for broader corpora.
- Any non-zero tolerance MUST be a named implementation constant with tests and report output; a vague "acceptable" or "material" regression cannot satisfy rollout eligibility.
- Minimum coverage and freshness thresholds MUST be finalized during design from existing readiness/eval evidence and exposed in the eval report as gate names plus observed values.
- Same-corpus A/B evidence is project-scoped; broader global default-on evidence remains outside this change.
- This spec treats rollout evidence as an eligibility gate, not as proof that the global default should be flipped ON.

## Handoff Hints
- Design should reuse the existing retrieval eval envelope and readiness scorecard rather than create a separate eval runner unless unavoidable.
- Design must define concrete named pass/fail thresholds for token savings, recall/rank quality, coverage, freshness, and community safety, and assert that reports include both threshold and observed value.
- Verification should include disabled-vs-enabled A/B evidence and fallback states with non-empty baseline hits.
