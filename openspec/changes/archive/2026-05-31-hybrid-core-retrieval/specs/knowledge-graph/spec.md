# Delta for Knowledge Graph

## ADDED Requirements
### Requirement: Broad Memory Content MUST Be Extracted into Typed Knowledge Triples
Saved user prompts, observations, session-summary-like memory content, and conversation-like text MUST be processed into subject-relation-object triples with typed entities and typed relations.

#### Scenario: New memory content yields typed triples
- GIVEN new memory content is saved
- WHEN KG extraction runs
- THEN typed entities and typed relations MUST be persisted as triples

#### Scenario: Session-like content is included
- GIVEN session-summary-like or prompt-like content is saved through thoth-mem surfaces
- WHEN KG extraction runs
- THEN extraction MUST consider that content as eligible source material subject to privacy and content filters

### Requirement: Knowledge Graph Taxonomy MUST Be Broad Enough for Core Parity
The KG extractor MUST define a thoth-mem adapted taxonomy with at least 22 entity categories and at least 20 relation categories for broad subject-relation-object extraction.

#### Scenario: Taxonomy contains broad entity and relation coverage
- GIVEN the KG extraction taxonomy is initialized
- WHEN taxonomy metadata is inspected by tests or diagnostics
- THEN it MUST expose at least 22 entity categories and at least 20 relation categories

### Requirement: KG Records MUST Preserve Provenance and Confidence
Knowledge triples MUST include source linkage, extraction metadata, and confidence metadata for ranking/fusion.

#### Scenario: Triple includes source and confidence
- GIVEN a persisted triple
- WHEN retrieval/ranking reads KG evidence
- THEN source memory identity, extractor metadata, and confidence metadata MUST be available

### Requirement: KG Extraction MUST Be Idempotent and Update-Safe
KG extraction MUST converge safely across retries, restarts, and source-content updates without duplicating equivalent triples.

#### Scenario: Repeated extraction converges
- GIVEN the same source content is extracted more than once
- WHEN extraction results are persisted
- THEN equivalent triples MUST be upserted or deduplicated without duplicate ranking evidence

### Requirement: `observation_facts` MUST Remain Compatible as Graph-lite Fallback/Source
Existing graph-lite `observation_facts` behavior MUST remain compatible and may be used as fallback/source when broader KG extraction is unavailable or partial.

#### Scenario: Graph-lite remains queryable
- GIVEN broader KG extraction is degraded or incomplete
- WHEN graph retrieval is requested
- THEN `observation_facts`-backed graph-lite results MUST still be available

### Requirement: KG Evidence MUST Participate in Fused Retrieval Ranking
Graph/KG retrieval output MUST participate alongside sentence semantic, chunk semantic, and lexical FTS5 lanes in final ranking.

#### Scenario: KG contributes to fused ranked output
- GIVEN relevant KG evidence exists
- WHEN retrieval fusion executes
- THEN graph/KG evidence MUST be rankable and source-attributed in final output

## MODIFIED Requirements

## REMOVED Requirements
