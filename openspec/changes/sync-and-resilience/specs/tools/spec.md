# Delta for Tools

## ADDED Requirements
### Requirement: mem_search MUST Support Exact Topic Key Lookup Intent
The `mem_search` behavior MUST support exact `topic_key` retrieval intent and SHALL return deterministic exact-key matches when the request expresses exact topic-key lookup.

#### Scenario: Exact topic key query returns deterministic match set
- GIVEN a stored observation with `topic_key` equal to `architecture/auth-model`
- WHEN a mem_search request targets exact topic key `architecture/auth-model`
- THEN returned results MUST include that observation and MUST NOT include observations with non-equal topic keys

#### Scenario: Exact lookup coexists with existing filters
- GIVEN multiple observations share the same topic key across scopes or projects
- WHEN exact topic key lookup is requested with additional scope/project/type filters
- THEN results MUST respect both exact key equality and provided filters

### Requirement: mem_search MUST Preserve Backward-Compatible General Search
The `mem_search` tool MUST preserve full-text behavior for non-exact queries and SHALL keep existing response-mode semantics.

#### Scenario: Non-exact query remains full-text
- GIVEN a natural-language search query that is not an exact topic-key lookup
- WHEN mem_search executes
- THEN results MUST follow general full-text relevance behavior

#### Scenario: Response mode behavior preserved
- GIVEN a valid query and mode selection (`compact` or `preview`)
- WHEN mem_search executes
- THEN output format MUST remain consistent with mode semantics

### Requirement: mem_sync_export MUST Use Incremental Sync Semantics
The `mem_sync_export` tool MUST use incremental export semantics and SHOULD not emit replay chunks when no new mutations exist.

#### Scenario: No-op incremental export
- GIVEN a previously exported sync state and no new changes
- WHEN mem_sync_export is invoked
- THEN the tool MUST report no new exportable chunk

#### Scenario: Incremental export with new changes
- GIVEN new sync-eligible mutations exist after the last export watermark
- WHEN mem_sync_export is invoked
- THEN the tool MUST export a new chunk representing only those new changes

### Requirement: mem_sync_import MUST Be Replay-Safe and Compatible
The `mem_sync_import` tool MUST provide idempotent import behavior across repeated runs and SHALL process both legacy and tombstone-capable chunk formats.

#### Scenario: Repeated import of same directory
- GIVEN a sync directory whose chunks were imported previously
- WHEN mem_sync_import is invoked again
- THEN duplicate effects MUST be skipped and summary output MUST reflect skipped items

#### Scenario: Mixed format import via tool
- GIVEN a sync directory containing both legacy chunks and incremental tombstone-aware chunks
- WHEN mem_sync_import is invoked
- THEN both formats MUST be accepted and processed in one run

### Requirement: Tool Error Handling MUST Remain Explicit
Tool handlers for search and sync SHALL return explicit error responses when input is invalid or sync artifacts are unreadable/corrupt.

#### Scenario: Invalid sync artifact
- GIVEN a sync directory containing unreadable or invalid chunk data
- WHEN mem_sync_import processes that artifact
- THEN the tool MUST return an error response rather than silently succeeding

## MODIFIED Requirements

## REMOVED Requirements
