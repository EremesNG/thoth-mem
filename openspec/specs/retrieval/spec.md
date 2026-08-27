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

Briefing and compact recall MUST expose stable memory IDs; context expansion MUST remain bounded; and full content, evidence IDs, and lineage MUST require explicit selection through `mem_get` or history. Raw evidence MUST NOT enter automatic recovery.

#### Scenario: US2 - Resume from actionable context 1

- **GIVEN** a current handoff containing an objective, completed work, first pending action, blockers, archive path, and key checks
- **WHEN** session-start or post-compaction recovery runs
- **THEN** the newest current handoff is considered before generic project guidance and the hidden pending action survives rendering

#### Scenario: US2 - Resume from actionable context 2

- **GIVEN** more candidate memories than fit the host cap
- **WHEN** the continuation capsule is assembled
- **THEN** it selects fewer useful items instead of allocating trivial fragments across every candidate

#### Scenario: US2 - Resume from actionable context 3

- **GIVEN** a selected memory with provenance
- **WHEN** host-visible context renders
- **THEN** it contains a complete memory ID for `mem_get`, omits evidence IDs, identifies the content as untrusted data, and never truncates fixed metadata into a fabricated reference

#### Scenario: US2 - Resume from actionable context 4

- **GIVEN** no useful eligible memory or a degraded lifecycle child
- **WHEN** recovery runs
- **THEN** the host prompt continues with verified identity only or no block, bounded diagnostics, and no claim that the model consumed memory

#### Scenario: US3 - Explore memory progressively 1

- **GIVEN** a project with a current handoff and multiple durable memories
- **WHEN** `mem_context` and `mem_project action=briefing` run under the same budget
- **THEN** both use the same deterministic continuation policy and expose compatible stable memory IDs

#### Scenario: US3 - Explore memory progressively 2

- **GIVEN** a specific coding question
- **WHEN** compact recall returns candidate IDs and the agent expands one candidate
- **THEN** only the selected context/full-record path pays the additional content cost

#### Scenario: US3 - Explore memory progressively 3

- **GIVEN** similarly named memories in another project or historical superseded guidance
- **WHEN** current project retrieval runs
- **THEN** foreign records remain absent and historical records appear only through explicit history retrieval

### Requirement: Current Recall MUST Prefer Valid Guidance Without Hiding History

Default current retrieval MUST prefer valid guidance over comparable superseded, retracted, or failed memory, while explicit historical retrieval MUST preserve linked lineage.

#### Scenario: Retrieve a superseded failure

- **GIVEN** a failed memory superseded by a successful correction
- **WHEN** current and history modes run
- **THEN** current mode prefers the correction and history mode can return both in lineage order

### Requirement: Project Briefing MUST Be Deterministic and Bounded

The shared continuation selector MUST consider the newest eligible current session summary before current promoted memories, use deterministic project/session/version precedence, retain existing handoff fallback when no summary exists, and never synthesize unsupported fields.

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
