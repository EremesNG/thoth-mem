# Tools

## Requirements

### Requirement: MCP Surface MUST Be Compact and Workflow-Level

The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`, with unversioned descriptions and envelopes and without reintroducing retired admin, graph, setup, migration, or diagnostic tools.

#### Scenario: US1 - Read one truthful canonical product contract 1

- **GIVEN** the active canonical specification tree
- **WHEN** a maintainer inspects its capabilities
- **THEN** it contains only the CLI, configuration, evaluation, native-harness, packaging, retrieval, store, and tool contracts implemented or deliberately gated by the current product

#### Scenario: US1 - Read one truthful canonical product contract 2

- **GIVEN** the retired V1 surfaces
- **WHEN** the canonical tree and OpenSpec context are searched
- **THEN** dashboard, HTTP, graph/KG, vector/embedding, HyDE, sync, observatory, and passive-capture requirements are absent except where a retained requirement explicitly prohibits or gates them

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

`mem_recall` MUST support compact and context modes, `mem_context` MUST provide a bounded project briefing, and `mem_get` MUST fetch only a selected full record or lineage.

#### Scenario: Recall progressively

- **GIVEN** durable relevant memory
- **WHEN** a client performs compact recall, context expansion, and one selected get
- **THEN** earlier stages remain bounded and only the selected final fetch returns full content

### Requirement: mem_project MUST Keep Project Operations Bounded

`mem_project` MUST support listing, briefing, and history over the authoritative ledger without requiring a graph projection.

#### Scenario: Request project history

- **GIVEN** a project with current and superseded memories
- **WHEN** `mem_project action=history` runs
- **THEN** it returns a deterministic bounded ledger history with stable IDs and temporal status

### Requirement: mem_session MUST Handle Only Verified Root Lifecycle

`mem_session` MUST accept only the declared root lifecycle operations with verified project, root-session, harness, and event identity. Ordinary response finalization MUST NOT be fabricated as a lifecycle event.

#### Scenario: Replay a lifecycle event

- **GIVEN** a confirmed lifecycle event with a stable event key
- **WHEN** the same event is submitted again
- **THEN** the operation is idempotent and does not duplicate evidence or receipts

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
