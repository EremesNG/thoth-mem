# Store

## Requirements

### Requirement: SQLite Memory Ledger MUST Be the Sole Source of Truth

The system MUST persist authoritative projects, sessions, immutable evidence, promoted memories, temporal state, lifecycle receipts, and source relationships in one local SQLite database. Optional projections MUST be disposable and derivable from that ledger.

#### Scenario: Start without optional modules

- **GIVEN** Node.js and SQLite with no embedding, graph, reranker, model, or remote service
- **WHEN** the memory service starts
- **THEN** authoritative save, recall, context, history, and lifecycle operations remain available

### Requirement: Raw Evidence and Promoted Memory MUST Remain Distinct

Captured evidence MUST be immutable, and each promoted memory MUST link to supporting evidence instead of replacing it with an untraceable assertion.

#### Scenario: Promote a decision

- **GIVEN** durable evidence and a promoted decision
- **WHEN** the transaction commits
- **THEN** both records retain stable identities and an explicit support link

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

Session-attributed writes MUST preserve a verified stable root-session key, harness, and project identity. Project-only writes MAY remain unattributed, but missing or delegated identity MUST NOT be presented as verified root continuity.

#### Scenario: Save from a delegated caller

- **GIVEN** a caller whose root authority cannot be verified
- **WHEN** it requests a root-session-attributed write
- **THEN** the write fails closed or remains explicitly project-only

### Requirement: Startup Migrations MUST Be Structured and Idempotent

Runtime MUST use `memory.sqlite` as the current default database, retain ordered numeric SQLite revisions for current-schema migration, and reject legacy databases without mutating or silently treating a transitional filename as authoritative.

#### Scenario: US2 - Treat the replacement architecture as the normal product base 1

- **GIVEN** a clean installation
- **WHEN** the MCP and native lifecycle paths execute
- **THEN** their public envelopes and commands use the current unversioned thoth-mem contract and persist to `memory.sqlite`

#### Scenario: US2 - Treat the replacement architecture as the normal product base 2

- **GIVEN** an invocation using a removed transitional command or namespace
- **WHEN** it reaches the current package
- **THEN** it fails explicitly instead of entering a compatibility shim

#### Scenario: US2 - Treat the replacement architecture as the normal product base 3

- **GIVEN** a legacy database selected for import
- **WHEN** the operator runs the current importer
- **THEN** `import-legacy` writes a distinct current database and preserves the source without describing the target as a replacement generation

#### Scenario: US3 - Preserve technical version truth without product-generation branding 1

- **GIVEN** an existing current database at an older internal SQLite revision
- **WHEN** startup migration runs
- **THEN** ordered idempotent migration still uses numeric revisions and preserves authoritative data

#### Scenario: US3 - Preserve technical version truth without product-generation branding 2

- **GIVEN** a native manifest or import report that needs a machine-readable format discriminator
- **WHEN** it is emitted
- **THEN** it may retain a numeric version field while its command, filename, namespace, and prose remain free of transitional generation labels

### Requirement: Confirmed Saves and FTS Visibility MUST Commit Atomically

A save MUST NOT report success until its authoritative rows, support relationships, lifecycle receipt when applicable, and FTS visibility commit together.

#### Scenario: Fail during FTS update

- **GIVEN** an injected failure before FTS commit
- **WHEN** a save transaction runs
- **THEN** the complete transaction rolls back and immediate recall returns no partial record

### Requirement: Optional Projection Lineage MUST Be Rebuildable and Traceable

An enabled optional projection MUST map deterministically to stable source IDs, record its configuration and source watermark, remain non-authoritative, and be safe to discard and rebuild.

#### Scenario: Projection source watermark is stale

- **GIVEN** projection state built from an older ledger watermark
- **WHEN** recall inspects lane readiness
- **THEN** the projection is marked non-current and cannot replace authoritative retrieval

### Requirement: Legacy Import MUST Preserve Source Data and Report Disposition

The supported importer MUST read a declared legacy source, write a distinct current target, ignore derived legacy indexes, preserve the source byte-for-byte, and report deterministic mapping, quarantine, skip, and failure counts.

#### Scenario: Legacy identity cannot be trusted

- **GIVEN** a source row with missing or placeholder identity
- **WHEN** import cannot map it safely
- **THEN** the row is quarantined or skipped with a bounded reason and no invented verified identity
