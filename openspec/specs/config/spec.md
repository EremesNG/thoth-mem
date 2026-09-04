# Configuration

## Requirements

### Requirement: Runtime Data Directory Resolution MUST Be Deterministic

The runtime MUST resolve the data directory in this order: explicit command value, `THOTH_MEM_DATA_DIR`, validated provider configuration, then `~/.thoth-mem`.

#### Scenario: Explicit data directory wins

- **GIVEN** explicit, environment, and provider data directories
- **WHEN** runtime configuration resolves
- **THEN** the explicit absolute directory is selected and the source is reported as explicit

### Requirement: Provider Configuration MUST Fail Closed

Provider configuration MUST use a closed machine-readable schema, reject malformed or unknown state, and MUST NOT silently ignore an invalid runtime entry or data directory.

#### Scenario: Provider JSON is invalid

- **GIVEN** malformed provider configuration
- **WHEN** setup or runtime loads it
- **THEN** the operation fails with a bounded configuration diagnostic before opening a database

### Requirement: Provider Configuration Updates MUST Be Atomic and Scoped

Setup MAY update only owned `dataDir` and `runtimeEntry` fields, MUST preserve other valid provider fields, and MUST replace the file atomically.

#### Scenario: Persist local runtime provenance

- **GIVEN** valid provider configuration with recall and plugin fields
- **WHEN** local setup records a verified runtime entry
- **THEN** the entry changes atomically while all unrelated valid fields remain unchanged

### Requirement: Current Database Filename MUST Be Stable

The default database within the selected data directory MUST be `memory.sqlite`. Runtime MUST NOT guess, dual-read, or automatically move a differently named database.

#### Scenario: Start in a clean data directory

- **GIVEN** an empty selected data directory
- **WHEN** the service starts without an explicit database path
- **THEN** it creates or opens only `memory.sqlite`
