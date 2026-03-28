# Delta for Store

## ADDED Requirements
### Requirement: Topic Key MUST Be Search-Indexed
The system MUST index `topic_key` alongside existing observation search fields so topic metadata remains searchable with the same visibility rules as observations.

#### Scenario: Topic key is indexed for active observations
- GIVEN an active observation with a non-null `topic_key`
- WHEN observation search is executed
- THEN the observation SHALL be discoverable by topic-key search terms

#### Scenario: Index stays consistent after observation changes
- GIVEN an indexed observation whose `topic_key`, title, or content changes
- WHEN the change is persisted
- THEN subsequent searches MUST reflect the new values and MUST NOT return stale indexed values

### Requirement: Exact Topic Key Lookup MUST Be Deterministic
The system MUST support an exact `topic_key` lookup path that performs equality matching and MUST return only records whose stored topic key exactly matches the requested key.

#### Scenario: Exact key returns only exact matches
- GIVEN observations with similar topic keys (for example `architecture/auth` and `architecture/auth-v2`)
- WHEN an exact lookup for `architecture/auth` is requested
- THEN only `architecture/auth` matches MUST be returned

#### Scenario: Exact key bypasses tokenization edge cases
- GIVEN a topic key containing separators or tokens that are ambiguous under full-text tokenization
- WHEN exact lookup is requested for that key
- THEN the matching result MUST be based on exact equality semantics, not tokenized partial matching

### Requirement: Sync Chunk State MUST Be Persisted Idempotently
The system MUST persist sync chunk processing state in `sync_chunks` so imports and exports can identify already-seen chunks and avoid reprocessing.

#### Scenario: Duplicate chunk identity is skipped
- GIVEN a chunk previously recorded as processed
- WHEN the same chunk identity is encountered again
- THEN the system MUST skip reprocessing and record it as skipped

#### Scenario: Duplicate payload hash is skipped
- GIVEN a new chunk identifier whose content hash matches a previously processed chunk
- WHEN chunk deduplication is evaluated
- THEN the system SHOULD skip applying duplicate payload effects

### Requirement: Mutation Journal MUST Record Convergence Events
The system MUST persist create, update, and delete mutations in `sync_mutations` with stable ordering semantics suitable for incremental synchronization.

#### Scenario: Create and update produce journal entries
- GIVEN an observation or prompt that is created or updated
- WHEN persistence succeeds
- THEN a corresponding mutation record MUST be available for later incremental export

#### Scenario: Delete produces tombstone-eligible mutation
- GIVEN an observation or prompt that is deleted (including soft delete)
- WHEN persistence succeeds
- THEN a deletion mutation MUST be recorded so downstream sync can propagate a tombstone

### Requirement: Startup Migrations MUST Be Structured and Idempotent
The system MUST run migrations through explicit schema-aware helpers and repeated startup runs SHALL converge to the same schema state without error.

#### Scenario: Fresh database startup
- GIVEN a fresh database
- WHEN startup initialization runs
- THEN required tables, indexes, triggers, and sync state structures MUST exist

#### Scenario: Partially migrated database startup
- GIVEN a database missing only some required columns or sync tables
- WHEN startup initialization runs repeatedly
- THEN missing elements MUST be added without duplicating existing elements or failing the process

### Requirement: FTS Rebuild MUST Preserve Search Integrity
When schema evolution requires FTS rebuild, the system MUST rebuild indexes so searchable observation coverage remains complete for non-deleted records.

#### Scenario: Rebuild after topic-key index evolution
- GIVEN an existing dataset prior to an FTS schema change
- WHEN migration performs an FTS rebuild
- THEN all non-deleted observations MUST remain searchable and search-trigger synchronization MUST continue after rebuild

## MODIFIED Requirements

## REMOVED Requirements
