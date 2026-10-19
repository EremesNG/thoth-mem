# Delta for Store

## ADDED Requirements

### Requirement: Store MUST Persist Community Summaries as Derived Artifacts
The store MUST persist community partition and summary artifacts as derived state separate from source memories and KG source rows. Derived community artifacts MUST reference their project, community identifier, algorithm/version metadata, source KG coverage, source observation coverage, summary generator, freshness state, degraded/enrichment state, and creation/update timestamps.

#### Scenario: Derived artifact references source evidence
- GIVEN a community summary is persisted
- WHEN the artifact is inspected
- THEN it MUST identify the project, community id, algorithm/generator versions, source KG coverage, source observation coverage, and freshness state
- AND it MUST NOT replace or duplicate source observations as authoritative memory

### Requirement: Community Rebuild MUST Be Transactional, Idempotent, and Project-Scoped
Community rebuild for a project MUST be transactional at the project artifact set level: a successful rebuild replaces that project's previous community artifacts with a coherent new version, while a failed rebuild leaves the previous committed version readable and marks rebuild status explicitly. Re-running rebuild with identical KG inputs and configuration MUST converge without duplicate community artifacts.

#### Scenario: Failed rebuild leaves previous version readable
- GIVEN a project has an existing committed community-summary version
- WHEN a rebuild fails before commit
- THEN readers MUST continue to see the previous committed version
- AND the project community state MUST record the failed rebuild status

#### Scenario: Repeated rebuild converges
- GIVEN identical KG inputs and community configuration
- WHEN community rebuild runs twice
- THEN the second run MUST NOT create duplicate artifacts
- AND the committed project community version MUST remain equivalent

### Requirement: Community Storage MUST Preserve Portable Export and Import Stability
Community artifacts MUST NOT change the portable export/import format unless a later spec explicitly justifies a compatible format revision. Source observations, prompts, and sessions remain the portable data contract; community artifacts are rebuildable from imported source memories and KG rebuilds.

#### Scenario: Export remains source-memory focused
- GIVEN community summaries exist
- WHEN export produces the portable payload
- THEN the payload MUST remain compatible with the existing export/import contract
- AND it MUST NOT require serialized community artifacts for import correctness

#### Scenario: Import can rebuild communities later
- GIVEN an import created without community artifacts
- WHEN KG rebuild and community rebuild are run after import
- THEN community summaries MUST be reconstructable from the imported source memories

### Requirement: Community Artifact Rollback MUST Never Delete Source Memories
Disabling, dropping, or rebuilding community-summary artifacts MUST NOT delete source observations, prompts, sessions, `kg_entities`, or current `kg_triples`. Rollback MAY ignore, remove, or rebuild derived community rows/artifacts.

#### Scenario: Community feature rollback leaves sources intact
- GIVEN community summaries are disabled or dropped
- WHEN recall and KG reads continue
- THEN source memories and KG source rows MUST remain intact
- AND retrieval MUST be able to fall back to the pre-community four-lane behavior

### Requirement: Store Readers MUST Surface Missing or Stale Community State Explicitly
Store methods that provide community summaries to retrieval, project summaries, or admin inspection MUST distinguish fresh summaries from missing, stale, rebuilding, failed, disabled, and degraded summaries. Readers MUST NOT silently treat stale community text as fresh evidence.

#### Scenario: Stale summary is explicitly marked
- GIVEN a project's KG changed after community summaries were built
- WHEN a store reader returns community summary data
- THEN the returned metadata MUST indicate stale state
- AND consumers MUST be able to avoid ranking stale text as fresh KG evidence

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions

- Dedicated derived tables are the default design direction because they support project-scoped rebuild status, versioning, and inspection without changing portable export/import.
- The exact table names and method signatures are design decisions, but the artifact lifecycle and source-preservation guarantees are normative.

## handoffHints

- Design must define project-level transaction boundaries and stale/failure state transitions.
- Keep export/import unchanged unless a later explicit compatibility rationale is added.
