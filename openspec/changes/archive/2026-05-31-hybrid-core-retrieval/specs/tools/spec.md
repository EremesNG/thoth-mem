# Delta for Tools

## ADDED Requirements
### Requirement: Search and Recall Surfaces MUST Expose Four-Lane Fused Retrieval
MCP/CLI search-recall surfaces MUST expose fused ranked evidence combining sentence semantic, chunk semantic, lexical FTS5, and graph/KG lanes when available.

#### Scenario: Fused lane evidence is returned
- GIVEN all retrieval lanes are available
- WHEN search/recall is executed
- THEN output MUST include ranked fused evidence with lane attribution and lineage

### Requirement: Tooling MUST Signal Semantic Degraded or Pending States Explicitly
If sqlite-vec cannot load, vec tables are unavailable, semantic index is stale/rebuilding, or newly saved content has not completed background semantic indexing, tool surfaces MUST signal degraded/pending semantic lanes while still returning lexical + graph/KG output.

#### Scenario: Degraded semantic warning with successful fallback
- GIVEN semantic lanes are degraded
- WHEN search/recall executes
- THEN output MUST include explicit degraded-state signaling and usable fallback results

#### Scenario: Pending semantic coverage after save is visible
- GIVEN content has been saved but sentence/chunk background indexing is not complete
- WHEN search/recall output includes that content
- THEN the tool surface MUST be able to indicate pending semantic coverage rather than implying fresh vector recall

### Requirement: Manual Rebuild Surface MUST Be Available
The system MUST provide manual `thoth-mem rebuild-index` control for semantic/KG reindexing.

#### Scenario: Operator invokes rebuild-index
- GIVEN an operator requests rebuild
- WHEN rebuild command runs
- THEN rebuild MUST be initiated with observable status

### Requirement: Existing `mem_search` and `mem_context` Semantics MUST Remain Backward Compatible
Legacy callers of current lexical/context workflows MUST remain compatible; additional recall surfaces (for example `mem_recall`) MUST be additive.

#### Scenario: Legacy caller behavior remains valid
- GIVEN a client that only uses existing `mem_search` and `mem_context`
- WHEN hybrid retrieval features are introduced
- THEN client request contracts MUST remain backward compatible

## MODIFIED Requirements

## REMOVED Requirements
