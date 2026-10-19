# Delta for Store

## ADDED Requirements
### Requirement: sqlite-vec MUST Be a Required Semantic Dependency
The store runtime MUST attempt to load sqlite-vec into the active better-sqlite3 connection and treat semantic lane availability as dependent on successful extension/table readiness.

#### Scenario: sqlite-vec load succeeds
- GIVEN a supported runtime with sqlite-vec installed
- WHEN store initializes semantic retrieval capabilities
- THEN sqlite-vec MUST be loaded against the active database connection

#### Scenario: sqlite-vec load fails
- GIVEN sqlite-vec cannot be loaded
- WHEN store initializes
- THEN semantic lanes MUST be marked degraded while lexical and graph/KG paths remain available

### Requirement: vec0 Virtual Tables MUST Store Sentence and Chunk Embeddings
The schema MUST include sqlite-vec `vec0` virtual tables for sentence embeddings and chunk embeddings with dimensions aligned to active embedding metadata.

#### Scenario: vec0 tables exist for both lanes
- GIVEN semantic schema migrations run
- WHEN table existence is verified
- THEN both sentence and chunk vec0 tables MUST exist for KNN queries

### Requirement: Deterministic Rowid Mapping and Lineage MUST Be Persisted
The store MUST persist deterministic mapping between logical sentence/chunk identities and vec0 `rowid`, including provenance lineage metadata.

#### Scenario: Rowid mapping is reproducible
- GIVEN the same source sentence/chunk lineage
- WHEN indexing runs repeatedly or after restart
- THEN the mapped rowid and lineage association MUST converge deterministically

### Requirement: Semantic Index Staleness MUST Be Detectable
The store MUST detect stale semantic indexes by comparing persisted index metadata hash with active embedding config hash.

#### Scenario: Hash mismatch marks stale
- GIVEN persisted semantic metadata hash differs from active hash
- WHEN staleness is evaluated
- THEN semantic index state MUST be marked stale and semantic lanes eligible for degraded behavior

### Requirement: Schema Evolution MUST Preserve Existing Lexical and Graph-lite Compatibility
Semantic/KG schema additions MUST preserve existing FTS5 and `observation_facts` functionality.

#### Scenario: Existing retrieval primitives remain functional
- GIVEN semantic and KG migrations have run
- WHEN lexical FTS5 and `observation_facts` retrieval are executed
- THEN they MUST remain functionally available

## MODIFIED Requirements

## REMOVED Requirements
