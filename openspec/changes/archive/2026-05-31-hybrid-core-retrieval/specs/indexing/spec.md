# Delta for Indexing

## ADDED Requirements
### Requirement: Indexing MUST Run Asynchronously and Preserve Save Responsiveness
Chunk/sentence semantic indexing and KG extraction MUST execute in background jobs so save/ingest flows remain responsive.

#### Scenario: Save completes before deep indexing
- GIVEN a new observation is persisted
- WHEN semantic/KG indexing work is required
- THEN persistence MUST complete independently of background indexing completion

### Requirement: Post-Save Semantic Consistency MUST Be Eventual and Explicit
The system MUST treat semantic recall for newly saved or updated content as eventual until background indexing finishes, while immediately preserving primary persistence, FTS5-compatible text, and graph/KG-compatible source data.

#### Scenario: Save returns with semantic indexing pending
- GIVEN a save operation enqueues semantic indexing work
- WHEN the save response is returned
- THEN the system MUST NOT claim sentence/chunk semantic coverage is fresh until the relevant background jobs complete

#### Scenario: Retrieval can observe pending semantic coverage
- GIVEN semantic indexing is pending for a saved item
- WHEN retrieval checks index state
- THEN the system MUST expose pending/degraded semantic coverage so callers can distinguish eventual semantic recall from missing data

### Requirement: Chunk Vector Indexing SHOULD Precede Sentence Vector Indexing for the Same Source
When chunk and sentence indexing jobs are split for the same source content, the background workflow SHOULD process chunk vectors before sentence vectors so coarse semantic context becomes available before high-precision sentence recall. This ordering MUST NOT block save responsiveness.

#### Scenario: Background queue prioritizes chunk before sentence
- GIVEN chunk and sentence semantic jobs exist for the same source content
- WHEN the worker chooses executable jobs
- THEN chunk vector indexing SHOULD be attempted before sentence vector indexing for that source

### Requirement: Sentence and Chunk Vectors MUST Be Indexed into sqlite-vec
Background indexers MUST insert embeddings into sentence/chunk vec0 tables and maintain deterministic rowid mapping plus lineage metadata.

#### Scenario: Vector index write includes rowid + lineage
- GIVEN embeddings are produced for chunk/sentence units
- WHEN indexer persists them
- THEN vec0 rows MUST be inserted/upserted with deterministic rowid mapping and provenance lineage

### Requirement: Automatic Rebuild MUST Trigger on Embedding Config Hash Mismatch
When active embedding hash differs from persisted semantic index hash, a rebuild MUST be auto-enqueued.

#### Scenario: Hash mismatch enqueues rebuild
- GIVEN active hash and persisted hash differ
- WHEN staleness evaluation runs
- THEN rebuild MUST be enqueued idempotently

### Requirement: Jobs MUST Be Idempotent and Retryable
Indexing/rebuild jobs MUST be restart-safe and converge without duplicate side effects.

#### Scenario: Interrupted rebuild converges on retry
- GIVEN a rebuild job is interrupted
- WHEN processing resumes
- THEN final semantic/KG index state MUST converge deterministically

## MODIFIED Requirements

## REMOVED Requirements
