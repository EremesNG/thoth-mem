# Delta for Retrieval

## ADDED Requirements

### Requirement: Community Evidence MUST Remain Inside the Existing KG Lane
Community summaries MAY contribute evidence to recall and project-summary context only as a sub-source of the existing `kg` lane. The retrieval lane set MUST remain exactly `sentence`, `chunk`, `lexical`, and `kg`; no fifth community, summary, global, or GraphRAG lane SHALL be introduced.

#### Scenario: Community summary appears as KG sub-source
- GIVEN fresh community summaries exist for a project
- WHEN `mem_recall` retrieves evidence relevant to a community
- THEN any community-summary evidence MUST carry `lane: 'kg'` with a community-specific sub-source or annotation
- AND the lane set MUST remain `sentence`, `chunk`, `lexical`, and `kg`

### Requirement: Community Evidence MUST Be Bounded and Rank-Safe
Community-summary evidence MUST be bounded by configured result and character budgets, MUST be source-attributed, and MUST NOT swamp direct KG or B2 multi-hop evidence. Direct KG evidence MUST remain primary over otherwise-equal community-summary evidence, and community evidence MUST be de-duplicated by observation/project context so it does not create repeated output for the same source cluster.

#### Scenario: Direct KG evidence outranks community evidence
- GIVEN a direct KG candidate and a community-summary candidate are otherwise equally relevant
- WHEN fused retrieval ranks results
- THEN the direct KG candidate MUST rank above the community-summary candidate

#### Scenario: Community evidence obeys output bounds
- GIVEN a query matches many community summaries
- WHEN recall output is assembled
- THEN community-summary text MUST be capped by configured budgets
- AND output MUST report boundedness or omitted community evidence

### Requirement: Retrieval MUST Degrade Gracefully When Community Summaries Are Unavailable
When community summaries are disabled, missing, stale, rebuilding, failed, or enrichment-degraded, retrieval MUST continue using the existing sentence, chunk, lexical, direct KG, and multi-hop KG behavior. Degraded community state MUST be signaled when relevant, and retrieval MUST NOT globally fail because community summaries are unavailable.

#### Scenario: Missing summaries fall back to existing retrieval
- GIVEN community summaries have not been built for a project
- WHEN recall runs
- THEN retrieval MUST return the existing four-lane baseline results
- AND it MUST NOT throw due to missing community artifacts

#### Scenario: Stale summaries are not ranked as fresh
- GIVEN community summaries are marked stale
- WHEN recall runs
- THEN stale community text MUST NOT be treated as fresh evidence
- AND degraded/stale state SHOULD be visible to callers when community evidence would otherwise have contributed

### Requirement: Community Summaries MUST Not Implement Full GraphRAG Global Answer Synthesis
Retrieval integration MUST NOT add full GraphRAG global answer synthesis, query-time subquery generation, or LLM-based query planning as part of this MVP. Community summaries may provide bounded evidence snippets, annotations, or project-summary context; answer synthesis remains the caller's responsibility.

#### Scenario: Query does not trigger subquery generation
- GIVEN community summaries are enabled
- WHEN a recall query is executed
- THEN the system MUST retrieve bounded evidence from existing lanes
- AND it MUST NOT generate query-time subqueries or a global synthesized answer

### Requirement: Project Summary and Recall Output MAY Annotate Community Evidence
`mem_recall` and project summary consumers MAY annotate output with community identifiers, summary freshness, source coverage, and degraded/enrichment state when community evidence contributes. Such annotations MUST be compact, bounded, and must not hide the source observations required for full-detail escalation through existing recall/get flows.

#### Scenario: Recall includes compact community annotation
- GIVEN a fresh community summary contributes to a recall result
- WHEN `mem_recall` renders the result
- THEN the output MAY include a compact community annotation with freshness and coverage metadata
- AND callers MUST still be able to escalate to source evidence through existing IDs or KG provenance

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions

- Community-summary evidence defaults to a lower KG sub-source weight than direct KG and B2 multi-hop unless evals prove a stronger value is safe.
- Community annotations are evidence metadata, not a replacement for source-linked observations.

## handoffHints

- Design must choose exact KG sub-source names, weights, and output annotations while preserving four lanes.
- Preserve no global-answer-synthesis and no query-time subquery generation.
