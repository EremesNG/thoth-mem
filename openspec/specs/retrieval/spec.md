# Retrieval

## Requirements

### Requirement: Core Retrieval MUST Be Lexical-First and Projection-Aware

The default path MUST rank FTS5/BM25 and structured SQLite candidates without requiring optional projections. Optional evidence MAY participate only when enabled, source-current, attributed, healthy, and admitted by the evaluation gate.

#### Scenario: Optional projection is absent

- **GIVEN** authoritative memory and no optional projection
- **WHEN** recall runs
- **THEN** lexical and structured results remain available and lane metadata reports the absence truthfully

### Requirement: FTS5 Lexical Retrieval MUST Sanitize Untrusted Queries

Retrieval MUST safely combine exact IDs or topic keys, phrase-capable BM25 search, and bounded prefix expansion without allowing punctuation-only input, code symbols, or FTS operators to fail global recall.

#### Scenario: Query contains FTS operators and punctuation

- **GIVEN** an untrusted code-oriented query
- **WHEN** recall normalizes it
- **THEN** the query produces deterministic bounded results or an empty result without an SQLite syntax failure

### Requirement: Recent Saves MUST Be Immediately Searchable by Core Retrieval

A confirmed save MUST be visible through authoritative lookup and FTS5 before success is returned.

#### Scenario: Recall immediately after save

- **GIVEN** a newly confirmed memory
- **WHEN** the same process recalls its exact topic or content
- **THEN** the memory is eligible without waiting for background work

### Requirement: Progressive Retrieval MUST Use Stable IDs and Bounded Escalation

Recall MUST begin with compact ranked items, context expansion MUST obey a caller-visible character budget, and full record content MUST require explicit `mem_get` escalation using stable IDs.

#### Scenario: Expand a compact result

- **GIVEN** a compact result with a stable memory ID
- **WHEN** the caller requests context and then a selected full record
- **THEN** each stage is source-attributed, bounded until `mem_get`, and refers to the same record

### Requirement: Current Recall MUST Prefer Valid Guidance Without Hiding History

Default current retrieval MUST prefer valid guidance over comparable superseded, retracted, or failed memory, while explicit historical retrieval MUST preserve linked lineage.

#### Scenario: Retrieve a superseded failure

- **GIVEN** a failed memory superseded by a successful correction
- **WHEN** current and history modes run
- **THEN** current mode prefers the correction and history mode can return both in lineage order

### Requirement: Project Briefing MUST Be Deterministic and Bounded

Project context MUST assemble a deterministic bounded briefing from durable decisions, conventions, project structure, unresolved outcomes, and recent handoffs without synthesizing unsupported facts.

#### Scenario: Brief a project with more evidence than the budget

- **GIVEN** a project whose current memories exceed the requested budget
- **WHEN** a briefing is generated
- **THEN** deterministic trimming and truncation metadata keep output within the budget

### Requirement: Core Retrieval MUST Remain Available When Optional Projections Degrade

Disabled, missing, stale, rebuilding, failed, or source-mismatched optional projections MUST NOT prevent core recall and MUST be represented with explicit bounded state.

#### Scenario: Optional lane fails during recall

- **GIVEN** a lexical control result and a failing optional lane
- **WHEN** recall executes
- **THEN** the lexical result remains non-empty and the optional lane is marked degraded

### Requirement: Retrieval MUST Report Payload and Escalation Measurements

Recall and context responses MUST report privacy-safe source, evidence, returned, truncated, budget, compression, full-fetch, and avoided-fetch measurements without claiming character estimates are exact model tokens.

#### Scenario: Compact recall finishes without full fetch

- **GIVEN** a correlated recall path finalized without `mem_get`
- **WHEN** telemetry is emitted
- **THEN** it records one avoided full fetch and the measured character basis explicitly
