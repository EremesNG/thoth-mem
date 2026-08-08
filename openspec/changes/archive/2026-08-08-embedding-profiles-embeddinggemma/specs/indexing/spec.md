# Delta for Indexing

## ADDED Requirements

### Requirement: Semantic Indexing MUST Carry Titles as Ephemeral Metadata
Chunk and sentence embedding inputs MUST carry the source observation title as optional document metadata without changing persisted chunk content, sentence content, or lexical text.

#### Scenario: Observation has a title
- GIVEN an observation with a non-empty title is indexed
- WHEN chunk and sentence embedding inputs are created
- THEN each document input MUST include the title for profile formatting while stored source text remains unchanged

#### Scenario: Observation has no usable title
- GIVEN an observation has a missing or empty title
- WHEN semantic inputs are created
- THEN indexing MUST omit title metadata and allow the selected profile to apply its deterministic no-title behavior

### Requirement: Indexing MUST Reject Invalid Embedding Batches Atomically
Provider and vector-validation errors during semantic indexing MUST propagate to the established retry path, and no partial vector batch may be committed.

#### Scenario: Embedding validation fails
- GIVEN one vector in an indexing batch violates count, dimension, finiteness, or non-zero constraints
- WHEN the semantic job runs
- THEN the job MUST fail for retry and MUST NOT persist a partial batch

## MODIFIED Requirements

## REMOVED Requirements
