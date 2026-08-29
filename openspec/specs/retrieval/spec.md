# Retrieval

## Requirements

### Requirement: Core Retrieval MUST Be Lexical-First and Projection-Aware

Core retrieval MUST continue to query current/historical promoted memories only; pending, accepted-but-unpromoted, and rejected observations MUST remain outside memory FTS and automatic context, while any explicit review-time candidate surfacing remains bounded, advisory, and failure-isolated.

#### Scenario: US3 - Inspect candidates without contaminating recall 1

- **GIVEN** pending, accepted, rejected, and promoted observations
- **WHEN** `mem_project` requests observations with project/session/status bounds
- **THEN** it returns a deterministic capped queue with stable IDs, compact metadata, and no raw support payloads

#### Scenario: US3 - Inspect candidates without contaminating recall 2

- **GIVEN** one selected observation ID
- **WHEN** `mem_get` expands it
- **THEN** it returns only that candidate, generator, scope, supports, immutable review lineage, promotion mapping, and related temporal memory IDs

#### Scenario: US3 - Inspect candidates without contaminating recall 3

- **GIVEN** any unpromoted observation
- **WHEN** compact recall, context, briefing, or native recovery runs
- **THEN** the observation is absent and existing memory/summary ordering, payload budget, trust boundary, and FTS rows remain unchanged

#### Scenario: US3 - Inspect candidates without contaminating recall 4

- **GIVEN** candidate similarity or related-memory surfacing during explicit review
- **WHEN** lexical scoring runs
- **THEN** the bounded scores are advisory diagnostics only and cannot accept, reject, supersede, or promote any record

#### Scenario: US4 - Upgrade and rebuild without inventing observations 1

- **GIVEN** a valid file-backed current database
- **WHEN** the observation schema upgrade starts
- **THEN** a verified recoverable backup exists before the forward transaction commits and all prior authoritative rows and memory FTS state remain intact

#### Scenario: US4 - Upgrade and rebuild without inventing observations 2

- **GIVEN** legacy observations, imported `legacy_observation` evidence, summaries, handoffs, or promoted memories
- **WHEN** migration completes
- **THEN** no candidate, support, review, policy basis, or promotion is inferred for historical data

#### Scenario: US4 - Upgrade and rebuild without inventing observations 3

- **GIVEN** canonical observation/review/promotion submission evidence
- **WHEN** projection rebuild runs
- **THEN** it deterministically recreates the same candidates, verdicts, promotion mappings, and current states or fails closed without replacing a valid projection

#### Scenario: US4 - Upgrade and rebuild without inventing observations 4

- **GIVEN** an injected backup, taxonomy, lineage, rebuild, or transaction failure
- **WHEN** startup reports the error
- **THEN** the source database remains recoverable at its prior revision with no partial observation state

#### Scenario: US5 - Demonstrate useful promotion under an equal budget 1

- **GIVEN** control and observation-pipeline projects with identical supported durable outcomes
- **WHEN** the committed fixture runs
- **THEN** both expose the same final current memory content, topic lineage, recall order, delivery budget, and useful-content ratio

#### Scenario: US5 - Demonstrate useful promotion under an equal budget 2

- **GIVEN** unsupported, poisoned, negated, cross-scope, failed, changing-requirement, and stale-procedure cases
- **WHEN** observation review executes
- **THEN** the report distinguishes accepted, rejected, blocked, and promoted candidates and records zero unsupported or unreviewed promoted memories

#### Scenario: US5 - Demonstrate useful promotion under an equal budget 3

- **GIVEN** a complete run
- **WHEN** its report is validated
- **THEN** it reconciles operation counts, stable IDs, supports, review policy, memory/FTS rows, p50/p95 latency, SQLite bytes, payload characters, errors, and literal zero model/network calls

#### Scenario: US5 - Demonstrate useful promotion under an equal budget 4

- **GIVEN** incomplete, unequal-budget, lineage-invalid, recall-regressing, contaminated, or schema-invalid evidence
- **WHEN** readiness is assessed
- **THEN** the pipeline fails its outcome gate without changing the existing direct-save or retrieval defaults

### Requirement: FTS5 Lexical Retrieval MUST Sanitize Untrusted Queries

Retrieval MUST safely combine exact IDs or topic keys with a selected deterministic lexical query strategy, including phrase-capable BM25 search, bounded prefix expansion, and declared stable rank fusion, without allowing punctuation-only input, code symbols, repeated terms, overlong input, FTS operators, or a Top-5 optimization to fail global recall or change declared query-plan identity.

#### Scenario: US1 - Retrieve a useful local Top-5 without vector state 1

- **GIVEN** a query with more than five eligible lexical memories
- **WHEN** the E0 candidate runs with a caller limit of at least five
- **THEN** it selects the same three longest sanitized terms as the current default, admits at most five lexical rows, and returns a deterministic fused order

#### Scenario: US1 - Retrieve a useful local Top-5 without vector state 2

- **GIVEN** exact, strict, or relaxed candidates that overlap
- **WHEN** the result lists are fused
- **THEN** exact authoritative matches remain first, memory IDs are deduplicated, rank ties use declared stable rules, and the caller limit is never exceeded

#### Scenario: US1 - Retrieve a useful local Top-5 without vector state 3

- **GIVEN** a limit below five, punctuation-only input, Unicode, repeated terms, FTS operators, phrase-like input, or an empty normalized query
- **WHEN** recall runs
- **THEN** the candidate remains bounded, syntax-safe, deterministic, and honest about skipped stages and work; an empty normalized query retains the existing null-plan contract with null configuration/plan hashes

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
