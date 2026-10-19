# Delta for Tools

## ADDED Requirements
### Requirement: mem_recall MUST Support Exact Topic-Key Lookup
The `mem_recall` behavior MUST support exact `topic_key` retrieval intent and SHALL return deterministic exact-key matches when the request expresses exact topic-key lookup.

#### Scenario: Exact topic key recall returns deterministic match set
- GIVEN a stored observation with `topic_key` equal to `architecture/auth-model`
- WHEN a `mem_recall` request targets exact topic key `architecture/auth-model`
- THEN returned results MUST include that observation and MUST NOT include observations with non-equal topic keys

#### Scenario: Exact lookup coexists with existing filters
- GIVEN multiple observations share the same topic key across scopes or projects
- WHEN exact topic-key lookup is requested with additional scope/project/type filters via `mem_recall`
- THEN results MUST respect both exact key equality and provided filters

### Requirement: Exact Topic-Key Recall and Full-Text Recall Must Coexist
General search in `mem_recall` MUST keep full-text behavior for non-exact queries while still honoring exact topic-key lookup when `topic_key_exact` is provided.

#### Scenario: Non-exact query remains full-text
- GIVEN a natural-language search query that is not an exact topic-key lookup
- WHEN `mem_recall` executes without `topic_key_exact`
- THEN results MUST follow general full-text relevance behavior

### Requirement: Topic-Key Exactness Must Be Available Through HTTP Search
The HTTP search route MUST preserve deterministic topic-key exactness by passing explicit topic-key filters into `Store.searchObservations` so HTTP callers receive the same exact-match behavior as `mem_recall`.

#### Scenario: HTTP topic-key recall is deterministic
- GIVEN HTTP search is queried with `topic_key_exact=architecture/auth-model` and project/scope filters
- WHEN the route calls `search` on Store
- THEN the response MUST match Store exact-key semantics (exact key equality and matching filters)

### Requirement: Sync Import/Export Are CLI/HTTP-Only Surfaces
Sync export/import capabilities MUST be exposed only through CLI and HTTP (`src/sync/index.ts`, `sync`, `sync-import`, `/sync/export`, `/sync/import`) and MUST NOT be registered as MCP tools.

#### Scenario: Sync surfaces are not MCP tools
- GIVEN the MCP tool registry
- WHEN inspecting exposed tools
- THEN only the compact six MCP tools are present and sync capabilities are absent

### Requirement: Sync Import/Export Errors Must Be Explicit
CLI and HTTP sync operations MUST return explicit failure responses when sync artifacts are unreadable/corrupt or sync state transitions fail.

#### Scenario: Sync artifact import error is explicit
- GIVEN a corrupt sync artifact supplied to sync import
- WHEN the import operation runs
- THEN the operation MUST return an explicit error response rather than a silent success

## MODIFIED Requirements

## REMOVED Requirements
