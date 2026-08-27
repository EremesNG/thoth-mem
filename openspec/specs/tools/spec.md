# Tools

## Requirements

### Requirement: MCP Surface MUST Be Compact and Workflow-Level

The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; summary submission, selection, inspection, and history MUST extend those workflow tools through closed current schemas rather than adding stage-specific tools.

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

### Requirement: MCP Envelopes MUST Use Closed Current Schemas

All tool inputs and outputs MUST use closed validated schemas under `thoth-mem.mcp.<tool>` or `thoth-mem.mcp.error`; unknown nested taxonomy values and removed generation namespaces MUST fail without durable side effects.

#### Scenario: Save with an invalid nested value

- **GIVEN** an otherwise valid `mem_save` request with an unknown memory kind
- **WHEN** handler validation runs
- **THEN** it returns a bounded non-retryable error envelope and commits nothing

### Requirement: mem_save MUST Persist Evidence Before Optional Memory

`mem_save` MUST accept immutable evidence and MAY atomically promote a linked memory with topic, outcome, and supersession semantics while reporting confirmed IDs only after commit.

#### Scenario: Save evidence and a promoted convention

- **GIVEN** a valid project and save request
- **WHEN** `mem_save` succeeds
- **THEN** it reports the evidence and memory IDs, support link, project bounds, and duplicate truth

### Requirement: mem_recall, mem_context, and mem_get MUST Form a Progressive Funnel

Compact context and recovery MUST expose stable selected summary IDs without raw support payloads, and `mem_get` MUST expand an explicitly selected summary into its structured claims, coverage, generator, version lineage, and support IDs without returning unrelated records.

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

### Requirement: mem_project MUST Keep Project Operations Bounded

Project operations MUST support bounded current and historical session-summary inspection within verified project/session scope while briefing continues to delegate to the shared continuation selector and no seventh tool or optional model/vector/graph dependency is introduced.

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

### Requirement: mem_session MUST Handle Only Verified Root Lifecycle

`mem_session` MUST allow an externally generated structured summary only on the declared verified checkpoint/final lifecycle boundary, validate its identity, ordering, coverage, generator, claims, and supports atomically with the lifecycle receipt, and remain idempotent by stable event identity.

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

### Requirement: Tooling MUST Signal Optional Projection State Without Degrading Core

Tool responses MUST expose optional-lane readiness and warnings as bounded metadata while continuing to return authoritative results when optional components are unavailable.

#### Scenario: Projection is rebuilding

- **GIVEN** a rebuilding optional projection
- **WHEN** recall runs
- **THEN** the response reports the lane as pending and still returns core candidates

### Requirement: Native Integrations MUST Use the Documented Tool Contracts

Every native integration MUST consume the same closed six-tool request and response schemas under the current unversioned MCP namespace, and retired generation-qualified namespaces MUST NOT remain registered as aliases.

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
