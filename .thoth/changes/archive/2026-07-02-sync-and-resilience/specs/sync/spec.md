# Delta for Sync

## ADDED Requirements
### Requirement: Export MUST Be Incremental
The sync exporter MUST produce delta-only chunks containing only new sync-eligible changes since the last successful export watermark for the selected scope.

#### Scenario: No new mutations yields no replay chunk
- GIVEN a completed export watermark and no new sync-eligible mutations
- WHEN export is requested again
- THEN no new data chunk MUST be produced for replayed historical data

#### Scenario: New mutations produce a delta chunk
- GIVEN prior exports exist and additional create/update/delete mutations were persisted afterwards
- WHEN export is requested
- THEN the generated chunk MUST include only those new mutations

### Requirement: Import MUST Be Idempotent Across Chunk Replays
The sync importer MUST treat repeated chunk deliveries as idempotent and SHALL avoid reapplying effects for already-processed payloads.

#### Scenario: Re-importing the same chunk id
- GIVEN a chunk that has already been successfully imported
- WHEN the same chunk id is encountered again
- THEN the importer MUST skip reapplying it and report it as skipped

#### Scenario: Re-importing equivalent content under different ids
- GIVEN a chunk with a new id but payload equivalent to a previously imported chunk
- WHEN importer deduplication runs
- THEN duplicate effects SHOULD be skipped using content-hash identity

### Requirement: Sync Format MUST Propagate Deletions
The sync format MUST support tombstones so deletes converge across nodes without requiring full snapshot replacement.

#### Scenario: Observation delete converges remotely
- GIVEN a record deleted on source node
- WHEN an incremental chunk containing the corresponding tombstone is imported on target node
- THEN the target node MUST reflect the delete state for the matching sync identity

#### Scenario: Tombstone replay remains safe
- GIVEN a tombstone already applied on a target node
- WHEN the same tombstone is imported again
- THEN the importer MUST leave state unchanged and remain successful

### Requirement: Import MUST Be Backward Compatible
The importer MUST accept legacy sync chunks that do not include tombstones or mutation envelopes.

#### Scenario: Legacy chunk import
- GIVEN an older chunk format containing sessions, observations, and prompts without tombstones
- WHEN the importer processes the chunk
- THEN data MUST be imported successfully under legacy semantics

#### Scenario: Mixed legacy and incremental repositories
- GIVEN a sync directory containing both legacy and newer incremental chunks
- WHEN import runs in processing order
- THEN the importer MUST successfully process both formats in one run

### Requirement: Processing Order MUST Be Deterministic
Chunk processing order MUST be deterministic so repeated imports of the same directory state produce convergent results.

#### Scenario: Manifest-driven ordering
- GIVEN a manifest that defines chunk order
- WHEN import is executed
- THEN chunks SHALL be processed according to manifest order

#### Scenario: No manifest fallback ordering
- GIVEN no manifest metadata is available
- WHEN import discovers chunk files directly
- THEN importer MUST apply a deterministic fallback ordering

## MODIFIED Requirements

## REMOVED Requirements
