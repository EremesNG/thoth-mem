# Store

## Requirements

### Requirement: SQLite Memory Ledger MUST Be the Sole Source of Truth

The system MUST extend the authoritative local ledger with database-ordered session evidence and immutable summary-submission events while keeping session summaries non-authoritative derived state whose content, version, coverage, generator, and support lineage can be reconstructed from the ledger.

#### Scenario: US1 - Record authoritative session events in deterministic order 1

- **GIVEN** a verified root session with no prior events
- **WHEN** allowed root prompts and lifecycle checkpoints commit
- **THEN** each new evidence event receives the next database-assigned session sequence and canonical actor, authority, retention, and privacy metadata in the same transaction

#### Scenario: US1 - Record authoritative session events in deterministic order 2

- **GIVEN** the same stable event key is replayed
- **WHEN** the write repeats
- **THEN** it returns the original evidence ID and session sequence without allocating a gap or duplicate event

#### Scenario: US1 - Record authoritative session events in deterministic order 3

- **GIVEN** assistant reasoning, arbitrary tool streams, delegated-agent output, a private block, or an unverifiable caller
- **WHEN** automatic capture is considered
- **THEN** it remains excluded or fails closed without advancing the durable session sequence

#### Scenario: US1 - Record authoritative session events in deterministic order 4

- **GIVEN** a project-only explicit save with no verified session
- **WHEN** it commits
- **THEN** it remains valid evidence without a fabricated session sequence or authority claim

### Requirement: Raw Evidence and Promoted Memory MUST Remain Distinct

Automatic capture MUST keep prompts/checkpoints as evidence, MUST represent supplied session summaries outside `memories`, and MUST NOT promote a handoff or any other memory merely because checkpoint, compaction, or finalization occurred.

#### Scenario: US3 - Resume from the newest truthful session projection 1

- **GIVEN** a current supported session summary and current promoted project memories
- **WHEN** start/resume or post-compaction recovery runs
- **THEN** the summary is considered first and remaining budget is filled only with eligible current memories under the shared deterministic selector

#### Scenario: US3 - Resume from the newest truthful session projection 2

- **GIVEN** no eligible summary after migration
- **WHEN** recovery runs
- **THEN** it falls back to the existing current handoff/memory policy without fabricating a summary or blocking the host prompt

#### Scenario: US3 - Resume from the newest truthful session projection 3

- **GIVEN** a selected summary
- **WHEN** host-visible context renders
- **THEN** it includes a stable summary ID for progressive expansion, preserves the actionable fields that fit, identifies all historical content as untrusted data, and does not expose raw support evidence by default

#### Scenario: US3 - Resume from the newest truthful session projection 4

- **GIVEN** a pre-compaction checkpoint after this change
- **WHEN** it is captured
- **THEN** checkpoint evidence and the supplied summary may commit idempotently but no `handoff` memory is automatically promoted

### Requirement: Memory Records MUST Preserve Provenance and Temporal State

Memories MUST retain project/session provenance, creation time, validity, outcome, and supersession or retraction lineage so current guidance and historical mistakes remain distinguishable.

#### Scenario: Correct a failed decision

- **GIVEN** a current failed decision
- **WHEN** a correction supersedes it
- **THEN** the prior validity interval closes, the correction becomes current, and the original remains historically reachable

### Requirement: SQLite Ledger MUST Enforce Canonical Taxonomies

Service and SQLite write boundaries MUST enforce the same closed evidence kinds, memory kinds, outcomes, harnesses, statuses, and lifecycle operations before committing durable state.

#### Scenario: Reject an unknown memory kind

- **GIVEN** a save using a non-canonical kind
- **WHEN** it reaches a public, service, or direct-SQL boundary
- **THEN** it fails with zero evidence, memory, receipt, relationship, or FTS side effects

### Requirement: Save Paths MUST Use One Explicit Identity Contract

Every verified session-attributed evidence write MUST receive an atomic database-assigned sequence plus canonical actor, authority, retention, and privacy classifications; project-only writes MUST remain valid without fabricated session identity or ordering.

#### Scenario: US1 - Record authoritative session events in deterministic order 1

- **GIVEN** a verified root session with no prior events
- **WHEN** allowed root prompts and lifecycle checkpoints commit
- **THEN** each new evidence event receives the next database-assigned session sequence and canonical actor, authority, retention, and privacy metadata in the same transaction

#### Scenario: US1 - Record authoritative session events in deterministic order 2

- **GIVEN** the same stable event key is replayed
- **WHEN** the write repeats
- **THEN** it returns the original evidence ID and session sequence without allocating a gap or duplicate event

#### Scenario: US1 - Record authoritative session events in deterministic order 3

- **GIVEN** assistant reasoning, arbitrary tool streams, delegated-agent output, a private block, or an unverifiable caller
- **WHEN** automatic capture is considered
- **THEN** it remains excluded or fails closed without advancing the durable session sequence

#### Scenario: US1 - Record authoritative session events in deterministic order 4

- **GIVEN** a project-only explicit save with no verified session
- **WHEN** it commits
- **THEN** it remains valid evidence without a fabricated session sequence or authority claim

### Requirement: Startup Migrations MUST Be Structured and Idempotent

The current-schema migration MUST upgrade revision 3 forward in one transaction, create and verify a recoverable pre-upgrade backup for file-backed databases before commit, preserve existing authoritative data and FTS integrity, perform no inferred summary/metadata backfill, and reopen idempotently at the new revision.

#### Scenario: US4 - Upgrade the current ledger without inventing history 1

- **GIVEN** a valid file-backed revision-3 database
- **WHEN** startup first upgrades it
- **THEN** a verified pre-upgrade backup exists before the forward-only migration commits and all existing authoritative data remains valid

#### Scenario: US4 - Upgrade the current ledger without inventing history 2

- **GIVEN** existing checkpoint evidence and handoff memories
- **WHEN** migration completes
- **THEN** they remain unchanged and no observation, summary, sequence, actor, authority, retention, or privacy value is inferred for historical rows

#### Scenario: US4 - Upgrade the current ledger without inventing history 3

- **GIVEN** a migration failure before commit
- **WHEN** startup reports the error
- **THEN** the original database remains at revision 3, no partial new-schema state is visible, and the verified backup can restore the pre-upgrade bytes

#### Scenario: US4 - Upgrade the current ledger without inventing history 4

- **GIVEN** an in-memory or clean database
- **WHEN** schema initialization runs
- **THEN** it creates the current schema directly without requiring a filesystem backup

### Requirement: Confirmed Saves and FTS Visibility MUST Commit Atomically

A save MUST NOT report success until its authoritative rows, support relationships, lifecycle receipt when applicable, and FTS visibility commit together.

#### Scenario: Fail during FTS update

- **GIVEN** an injected failure before FTS commit
- **WHEN** a save transaction runs
- **THEN** the complete transaction rolls back and immediate recall returns no partial record

### Requirement: Optional Projection Lineage MUST Be Rebuildable and Traceable

Session summary projections MUST preserve kind, current/superseded version state, inclusive source sequence coverage, immutable submission source, external generator descriptor, atomic material claims, per-claim support IDs, and deterministic source/version mappings without becoming authoritative truth.

#### Scenario: US2 - Preserve a source-supported versioned session summary 1

- **GIVEN** a verified root session and ordered supporting evidence
- **WHEN** `mem_session` receives a valid structured checkpoint or final summary
- **THEN** it records the external generator, source coverage, atomic claims, support IDs, version lineage, and one immutable submission event before reporting success

#### Scenario: US2 - Preserve a source-supported versioned session summary 2

- **GIVEN** an existing current summary of the same session and summary kind
- **WHEN** a later valid version commits
- **THEN** the prior version becomes superseded, the newer version becomes current, and both remain inspectable with their source lineage

#### Scenario: US2 - Preserve a source-supported versioned session summary 3

- **GIVEN** a material claim with no support, support from another project/session, or support outside the declared sequence range
- **WHEN** validation runs
- **THEN** the entire summary transaction fails with no evidence, projection, receipt, or watermark side effect

#### Scenario: US2 - Preserve a source-supported versioned session summary 4

- **GIVEN** an unavailable model or generator
- **WHEN** ordinary save, recall, or recovery executes
- **THEN** the SQLite core remains available and never attempts a model or network call

### Requirement: Legacy Import MUST Preserve Source Data and Report Disposition

The supported importer MUST read a declared legacy source, write a distinct current target, ignore derived legacy indexes, preserve the source byte-for-byte, and report deterministic mapping, quarantine, skip, and failure counts.

#### Scenario: Legacy identity cannot be trusted

- **GIVEN** a source row with missing or placeholder identity
- **WHEN** import cannot map it safely
- **THEN** the row is quarantined or skipped with a bounded reason and no invented verified identity
