# Delta for Sync

## ADDED Requirements
### Requirement: Sync Export MUST Preserve Stable Identity Fields
Sync export MUST preserve explicit session and project identity for exported sessions, prompts, observations, mutations, and chunk metadata where those fields are part of the portable contract. Export MUST NOT replace present explicit identity with placeholders and MUST NOT omit identity needed for downstream project/session-scoped recall.

#### Scenario: Export carries explicit identity
- GIVEN stored sessions, prompts, and observations have explicit session and project identity
- WHEN sync export produces a chunk
- THEN the exported data MUST include the explicit identity fields supported by the sync format
- AND the export MUST NOT substitute `manual-save-*` or `unknown` for present identity

#### Scenario: Export preserves nullable project compatibility
- GIVEN a prompt or observation has a null project under the existing schema
- WHEN sync export serializes the record
- THEN the export MUST represent that null or absent project compatibly
- AND it MUST NOT invent a stable project value that was not present in the source record

### Requirement: Sync Import MUST Report Missing or Degraded Identity Explicitly
Sync import MUST remain backward-compatible with legacy chunks that omit session or project identity, but it MUST report missing or degraded identity explicitly. Import output MUST distinguish preserved explicit identity from deterministic compatibility fallback identity.

#### Scenario: Legacy chunk import reports identity degradation
- GIVEN a legacy sync chunk omits project identity for imported records
- WHEN sync import processes the chunk
- THEN import MUST remain successful when the chunk is otherwise valid
- AND the result MUST report that project identity was missing or degraded
- AND any placeholder project used by storage MUST be deterministic

#### Scenario: Explicit imported identity is not warned
- GIVEN a sync chunk includes explicit session and project identity for all records that need it
- WHEN sync import processes the chunk
- THEN the imported records MUST preserve that identity
- AND the result MUST NOT report degraded identity for those fields

### Requirement: Sync Import MUST Remain Idempotent With Identity Fallbacks
Identity fallback handling during sync import MUST preserve existing idempotency guarantees. Replaying the same chunk or an equivalent payload MUST NOT create duplicate sessions, prompts, observations, or divergent placeholder identities solely because identity was missing.

#### Scenario: Replayed legacy chunk uses the same fallback identity
- GIVEN a legacy chunk with missing identity has already been imported
- WHEN the same chunk is imported again
- THEN the importer MUST skip or converge idempotently according to the existing chunk rules
- AND any fallback identity involved MUST match the first import

#### Scenario: Equivalent payload does not create divergent placeholders
- GIVEN two equivalent chunks omit the same identity fields
- WHEN sync import deduplication treats them as equivalent content
- THEN fallback identity handling MUST NOT create divergent session or project placeholders

### Requirement: CLI Sync Directory Default MUST Remain Stable and Identity Warnings MUST Be Explicit
The CLI sync and sync-import default directory behavior SHOULD remain the existing `process.cwd()/.thoth-sync` compatibility default for this change. When that default is used, CLI output MUST make the target sync directory explicit so operators can see when sync artifacts may be separate from the resolved data directory/project identity; documentation MAY also describe the compatibility default.

#### Scenario: Default sync directory is shown
- GIVEN an operator runs CLI sync without an explicit sync directory
- WHEN the command resolves the compatibility default
- THEN the command output MUST identify the resolved sync directory
- AND it SHOULD warn or document that the default is based on the current working directory

#### Scenario: Explicit sync directory remains supported
- GIVEN an operator supplies an explicit sync directory
- WHEN CLI sync or sync-import runs
- THEN the command MUST use the supplied directory
- AND it MUST NOT replace it with a data-dir-derived path

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- The CLI sync directory default remains unchanged for backward compatibility; the observable improvement is explicit resolved-directory output and warning/documentation rather than moving artifacts.
- Sync format compatibility is preserved for legacy chunks with missing identity.
- Missing identity is reported as degraded import/export metadata; existing chunk processing order and idempotency rules remain unchanged.
- Sync degradation reporting includes enough structured result data or CLI text for callers/tests to identify the affected field, whether the original value was absent/null/placeholder, and any fallback value persisted.

## Handoff Hints
- Design should specify the exact sync result fields or CLI text used for identity degradation and resolved-directory reporting.
- Tests should cover explicit identity export/import, legacy missing identity import, replay idempotency with fallbacks, and CLI default directory visibility.
