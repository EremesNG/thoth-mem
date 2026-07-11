# Delta for Retrieval

## ADDED Requirements

### Requirement: Community Read-Path Activation MUST Remain Explicit and Reversible
The system MUST keep `communitySummaries.readPath.enabled` globally default OFF. A project MUST NOT receive community-summary read-path enrichment unless an operator has made an explicit opt-in through the existing env or persisted config path and the project satisfies the rollout eligibility gates. Clearing `THOTH_COMMUNITY_READ_PATH_ENABLED` or persisted `communitySummaries.readPath.enabled` MUST return the project to the community-disabled baseline without deleting community metadata.

#### Scenario: Global default stays disabled
- GIVEN no env or persisted config opt-in is present
- WHEN retrieval resolves community-summary read-path participation
- THEN `communitySummaries.readPath.enabled` MUST resolve to false
- AND no community-summary evidence MUST be queried for read-path enrichment

#### Scenario: Opt-in is reversible
- GIVEN a project has explicit community read-path opt-in and passes eligibility
- WHEN the operator clears the env or persisted opt-in
- THEN retrieval MUST stop using community-summary enrichment for that project
- AND existing sentence, chunk, lexical, direct KG, and multi-hop KG baseline retrieval MUST continue

### Requirement: Project Eligibility MUST Require Fresh Committed Community State
A project MUST be eligible for community-summary read-path enrichment only when the project has a fresh committed community rebuild state, graph/community/source-observation coverage that meets named rollout threshold constants, bounded summaries, and no stale, rebuilding, failed, degraded, or enrichment-unavailable state that would make community evidence unreliable. Eligibility MUST be evaluated per project and MUST NOT be inferred from global config alone; passing one project MUST NOT enable enrichment for another project.

#### Scenario: Fresh committed state permits eligibility
- GIVEN a project has explicit opt-in, a committed community rebuild for the current graph state, minimum KG/community/source-observation coverage, and bounded summaries
- WHEN eligibility is evaluated for that project
- THEN the project MAY be considered eligible for community-summary read-path enrichment

#### Scenario: Stale or rebuilding state blocks eligibility
- GIVEN a project has explicit opt-in but its community state is stale or rebuilding
- WHEN eligibility is evaluated for that project
- THEN the project MUST be treated as ineligible for community-summary read-path enrichment
- AND retrieval MUST use the community-disabled baseline

#### Scenario: Failed or degraded state blocks eligibility
- GIVEN a project has explicit opt-in but its latest community rebuild failed, is degraded, or depends on unavailable enrichment
- WHEN eligibility is evaluated for that project
- THEN the project MUST be treated as ineligible for community-summary read-path enrichment
- AND the degraded condition SHOULD be signaled where community evidence would otherwise have contributed

### Requirement: Community Evidence MUST Remain a KG-Lane Sub-Source
Community-summary evidence MUST remain inside the existing `kg` retrieval lane with a community-specific sub-source such as `kg_community_summary`. The lane set MUST remain `sentence`, `chunk`, `lexical`, and `kg`; the system SHALL NOT introduce a fifth community, summary, GraphRAG, or global-answer lane for this rollout gate. Direct KG and B2 multi-hop evidence MUST remain rank-safe versus otherwise-equal community-summary evidence.

#### Scenario: Eligible community evidence is KG sub-source evidence
- GIVEN a project is opted in and eligible for community-summary enrichment
- WHEN `mem_recall` retrieves community-summary evidence
- THEN that evidence MUST carry `lane: 'kg'` and source/sub-source `kg_community_summary`
- AND no `community` lane or fifth retrieval lane MUST appear

#### Scenario: Direct KG remains rank-safe
- GIVEN direct KG evidence and community-summary evidence are otherwise equally relevant
- WHEN fused retrieval ranks the candidates
- THEN direct KG evidence MUST rank above community-summary evidence

#### Scenario: B2 multi-hop remains no worse
- GIVEN B2 multi-hop evidence is expected to surface for a query under the community-disabled baseline
- WHEN community-summary enrichment is enabled for an eligible project
- THEN the multi-hop answer MUST still surface no worse than the disabled baseline according to the rollout gate

### Requirement: Community Fallback MUST Preserve Non-Empty Baseline Retrieval
When community summaries are disabled, missing, stale, rebuilding, failed, degraded, or enrichment-unavailable, retrieval MUST fall back to the existing baseline lanes without global failure. If the same project, corpus, query, and retrieval budgets have non-empty source-attributed baseline hits with community enrichment disabled, the fallback result MUST remain non-empty with at least one source-attributed baseline-lane hit and MUST preserve usable baseline lineage.

#### Scenario: Missing summaries fall back to baseline hits
- GIVEN community summaries are missing for a project and the community-disabled baseline has hits for the query
- WHEN retrieval runs with community read-path opt-in present
- THEN retrieval MUST return non-empty baseline results
- AND it MUST NOT fail because summaries are missing

#### Scenario: Stale or failed summaries fall back to baseline hits
- GIVEN community summaries are stale or failed and the community-disabled baseline has hits for the query
- WHEN retrieval runs
- THEN retrieval MUST return non-empty baseline results
- AND stale or failed community summaries MUST NOT be ranked as fresh evidence

#### Scenario: Enrichment-unavailable state falls back to deterministic summaries or baseline
- GIVEN optional enrichment is unavailable or degraded
- WHEN retrieval runs
- THEN deterministic extractive community summaries MAY be used only if the project remains eligible
- AND otherwise retrieval MUST return the non-empty community-disabled baseline when baseline hits exist

### Requirement: Community Read Path MUST Stay Bounded and Non-Synthesizing
Community-summary read-path enrichment MUST remain bounded by configured community count, summary character, evidence-per-community, and source-observation limits. The rollout gate MUST NOT add full GraphRAG global answer synthesis, query-time subquery generation, LLM query planning, or P5 graph navigation v2 behavior.

#### Scenario: Community evidence obeys configured bounds
- GIVEN an eligible project has many matching community summaries
- WHEN retrieval assembles output
- THEN returned community-summary evidence MUST obey configured count and character budgets
- AND omitted or bounded community evidence SHOULD be observable through compact metadata

#### Scenario: Retrieval does not synthesize global answers
- GIVEN community-summary read-path enrichment is enabled for an eligible project
- WHEN a recall query executes
- THEN the system MUST return bounded evidence through existing retrieval lanes
- AND it MUST NOT generate a global synthesized answer or query-time subqueries

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Minimum graph/community/source-observation coverage thresholds are treated as named design-time implementation constants and matching test fixtures/eval thresholds rather than new config fields unless design proves persisted per-project decisions are necessary.
- The concrete coverage constants MUST be derived during design from existing readiness/eval fixtures and any available real-project evidence; if that evidence is sparse, design MUST choose conservative constants and document why they adequately protect opt-in rollout only.
- "Fresh committed community state" means the latest completed community rebuild matches the current project graph signature or equivalent existing freshness marker and is not stale, rebuilding, failed, degraded, or dependent on unavailable enrichment.
- Baseline non-empty fallback comparisons are scoped to the same project, corpus, query, and retrieval budgets used by the disabled baseline; fallback is not required to invent results when that disabled baseline is itself empty.
- This change specifies rollout eligibility behavior only; multi-harness support, G3 harness parity, MemoryIntegrationCore migration, and P5 graph navigation v2 remain deferred and out of scope.

## Handoff Hints
- Preserve global default OFF and reversible opt-in in design.
- Keep community evidence as `kg_community_summary` inside the KG lane; do not add a lane or MCP surface.
- Design must choose concrete named minimum coverage thresholds, implement regression/fallback tests against them, and decide whether eligibility is computed on demand or represented as a stored per-project decision.
