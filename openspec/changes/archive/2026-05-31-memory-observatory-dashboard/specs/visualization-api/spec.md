# Delta for Visualization API

## ADDED Requirements
### Requirement: Visualization API MUST Provide an Observatory Query Model
The dashboard-facing API MUST provide a unified observatory query model that supports Recall Workspace, Memory Map, Timeline, Knowledge Ledger, and Health & Indexing surfaces under shared scope controls.

#### Scenario: Shared scope can drive multiple surfaces
- GIVEN the dashboard requests observatory data with project/session/topic/time scope
- WHEN surface-specific reads are performed
- THEN each surface response MUST be derivable under that same scoped context without requiring scope reinterpretation

#### Scenario: Surface-specific responses remain compatible
- GIVEN the same scoped observatory context
- WHEN the dashboard requests map, timeline, ledger, and health payloads
- THEN responses MUST be shape-compatible for coordinated client state and cross-surface pivots

### Requirement: Visualization API MUST Preserve Pivot Context Tokens
Pivot-capable responses MUST include stable context tokens or equivalent bounded references that allow dashboard pivots between recall, map, timeline, and ledger without losing active scope and focus.

#### Scenario: Recall result includes pivot context for map and ledger
- GIVEN a recall-oriented dashboard response under active filters
- WHEN results are returned
- THEN each pivotable result MUST include context sufficient to open related map neighborhood and provenance ledger views with the same scope

#### Scenario: Timeline and map selections carry compatible context
- GIVEN a timeline event or map entity is selected
- WHEN the dashboard requests a pivot into another observatory surface
- THEN API contracts MUST preserve focus identity and active scope boundaries through the pivot

### Requirement: Visualization API MUST Expose Frontier Traversal Semantics for Depth and Expand
Neighbor expansion and depth traversal operations MUST return frontier semantics that distinguish newly added entities, already-visible entities, and exhausted frontiers.

#### Scenario: Expansion identifies newly added entities
- GIVEN a selected entity with a partially rendered neighborhood
- WHEN expansion is requested
- THEN the API MUST return incremental frontier additions and identify which additions are newly introduced in that step

#### Scenario: Expansion identifies exhausted frontier
- GIVEN no unseen neighbors remain within bounded traversal constraints
- WHEN expansion is requested
- THEN the API MUST return an explicit exhausted-frontier outcome instead of repeating prior results as if new

### Requirement: Visualization API MUST Return Provenance-Rich, Structured Memory Semantics
Dashboard-facing payloads for observatory views MUST expose observation type, What/Why/Where/Learned fields when available, topic keys, session/project identities, vector/graph evidence attribution, and provenance references needed for explanation.

#### Scenario: Ledger-capable payload includes structured fields
- GIVEN a dashboard request for observation-level or fact-level detail
- WHEN detail payload is returned
- THEN structured What/Why/Where/Learned fields and provenance references MUST be included when present in source data

#### Scenario: Evidence attribution remains explicit
- GIVEN retrieval or relationship evidence is returned to dashboard surfaces
- WHEN payloads are inspected
- THEN lane/relationship provenance metadata MUST identify the evidence source class needed for user explanation

## MODIFIED Requirements
### Requirement: Visualization API MUST Support Filtered and Pivoted Retrieval Across Observatory Surfaces
The API MUST support filtered and pivoted retrieval by project, session, topic key, observation type, relation type/class, semantic neighborhood depth, and text query where applicable, and MUST preserve scope continuity across observatory surface pivots.

#### Scenario: Scoped retrieval remains stable across pivots
- GIVEN a request with project, session, topic, and time filters
- WHEN a pivot chain crosses multiple observatory surfaces
- THEN each follow-up response MUST preserve compatible scope semantics unless an explicit user scope change is requested

#### Scenario: Query-constrained candidates remain pivotable
- GIVEN a request includes text query plus structured filters
- WHEN candidates are returned
- THEN those candidates MUST carry sufficient scoped references to pivot into map/timeline/ledger views without scope loss

### Requirement: Visualization API MUST Provide Neighbor Expansion Contracts with Incremental Frontier State
The API MUST provide neighbor expansion operations that accept a selected entity and bounded traversal depth and MUST return additional elements with explicit frontier state rather than opaque repeated subgraphs.

#### Scenario: Deterministic expansion includes frontier classification
- GIVEN repeated expansion requests with the same scope and unchanged data
- WHEN expansion executes
- THEN expansion results MUST remain deterministic and include frontier classification for added/already-visible/exhausted outcomes

#### Scenario: Expansion remains bounded while signaling continuation
- GIVEN a traversal step exceeds configured bounds
- WHEN the API returns that step result
- THEN the response MUST enforce bounds and signal continuation/frontier status compatible with progressive exploration

## REMOVED Requirements
