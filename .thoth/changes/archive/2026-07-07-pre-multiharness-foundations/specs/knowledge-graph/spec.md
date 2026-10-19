# Delta for Knowledge Graph

## ADDED Requirements
### Requirement: Community Health MUST Use a Stable Graph Freshness Basis
Community-summary health MUST be based on a stable graph freshness basis or graph signature that can determine whether committed community summaries match the current project KG state. The basis MUST account for eligible KG entities/triples, source observation coverage, supersession markings, and pruning effects relevant to community construction.

#### Scenario: Matching graph basis reports fresh
- GIVEN a committed community summary records a graph freshness basis
- AND the current project KG state matches that basis
- WHEN community health is computed
- THEN the community state MUST be eligible to report `fresh`

#### Scenario: Changed KG reports stale
- GIVEN committed community summaries were built for a prior graph basis
- AND eligible KG triples, entities, source observation coverage, supersession markings, or pruning state changes
- WHEN community health is computed
- THEN the community state MUST be `stale` or `rebuilding`
- AND stale summaries MUST NOT be reported as fresh evidence

### Requirement: Community Health Coverage MUST Be Bounded and Source-Attributed
The knowledge-graph/community layer MUST provide bounded coverage metadata for community health, including source observation coverage, eligible KG entity/triple coverage, community count or missing count, and summary bounds. Coverage metadata MUST be source-attributed by ids/counts/signatures and MUST NOT require raw source text.

#### Scenario: Coverage metadata is available
- GIVEN community summaries exist for a project
- WHEN community health metadata is read
- THEN source observation count, eligible entity/triple count, community count, and coverage percentages or ratios MUST be available where computable
- AND the metadata MUST identify the graph basis used

#### Scenario: Sparse or missing coverage is explicit
- GIVEN a project has too little KG/community coverage to trust community summaries
- WHEN community health metadata is read
- THEN sparse, missing, or degraded coverage MUST be explicitly reported
- AND retrieval or rollout consumers MUST be able to avoid treating the summaries as fresh evidence

### Requirement: Community Job State MUST Reflect Rebuild, Failure, and Degraded Conditions
The KG/community layer MUST retain enough latest job metadata for health readers to distinguish rebuilding, failed, degraded, missing, disabled, stale, and fresh states. A failed rebuild MUST leave the previous committed community artifacts readable but MUST NOT cause health readers to report them as fresh for the current graph basis.

#### Scenario: Failed rebuild leaves previous artifact readable but not fresh
- GIVEN a previous committed community summary exists
- AND a later rebuild fails for the current graph state
- WHEN community health is computed
- THEN latest job state MUST be `failed`
- AND the previous artifact MAY remain readable
- BUT it MUST NOT be reported as fresh for the current graph basis

#### Scenario: Rebuilding state is visible
- GIVEN a community rebuild is in progress or marked running
- WHEN community health is computed
- THEN the community state MUST be `rebuilding`
- AND health output MUST include bounded latest job metadata

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- The graph freshness basis may reuse existing community run metadata if it already detects KG/signature changes; otherwise design may add a bounded derived signature.
- Community health is a diagnostic/readiness view, not a new community construction algorithm and not a GraphRAG global-answer feature.

## Handoff Hints
- Design should locate the existing community run/artifact metadata first and add only the minimal freshness basis needed for reliable health.
- Verification should cover fresh, stale, rebuilding, failed, degraded, missing, and disabled states.
