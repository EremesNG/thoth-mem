# Tools

## Requirements

### Requirement: MCP Surface MUST Be Compact and Workflow-Level

The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; observation submission, review, promotion, queue, and expansion MUST extend those workflow tools through closed schemas.

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

### Requirement: MCP Envelopes MUST Use Closed Current Schemas

Observation inputs and outputs, including typed validation/independent-review support evidence, MUST use closed discriminated schemas and bounded error envelopes; unknown nested fields, arbitrary public metadata, partial identity, invalid transitions, or stale replay payloads MUST commit nothing.

#### Scenario: US1 - Preserve a source-supported observation candidate 1

- **GIVEN** a verified project or root session and one or more eligible source-evidence IDs
- **WHEN** `mem_save` receives a valid atomic observation candidate
- **THEN** it records a canonical immutable submission, generator identity, scope, supports, advisory file/concept facets, proposed memory interpretation, and one pending derived record before reporting success

#### Scenario: US1 - Preserve a source-supported observation candidate 2

- **GIVEN** a session-scoped candidate
- **WHEN** a support belongs to another project/session or falls outside declared ordered coverage
- **THEN** the entire transaction fails without evidence, event, observation, receipt, relationship, watermark, or FTS side effects

#### Scenario: US1 - Preserve a source-supported observation candidate 3

- **GIVEN** a project-scoped candidate supported by evidence from multiple sessions in the same project
- **WHEN** validation succeeds
- **THEN** it preserves every support ID without fabricating one session identity or sequence range

#### Scenario: US1 - Preserve a source-supported observation candidate 4

- **GIVEN** the same stable event identity and payload
- **WHEN** the submission is replayed
- **THEN** it returns the original candidate and durable IDs; a changed payload under that identity fails closed

#### Scenario: US2 - Review and explicitly promote a candidate 1

- **GIVEN** a pending candidate
- **WHEN** a verified root reviewer accepts it using a canonical policy basis appropriate to the claim
- **THEN** an immutable review event records reviewer actor/authority, reason, policy identifier/version, and source support without mutating candidate content

#### Scenario: US2 - Review and explicitly promote a candidate 2

- **GIVEN** a pending candidate
- **WHEN** it is rejected
- **THEN** the rejection remains inspectable and the candidate can never be promoted by similarity, confidence, lifecycle, replay, or a later conflicting verdict

#### Scenario: US2 - Review and explicitly promote a candidate 3

- **GIVEN** an accepted candidate
- **WHEN** explicit promotion succeeds
- **THEN** candidate, review, promotion evidence, resulting memory, original supports, receipt, topic supersession, and FTS visibility commit atomically and a replay returns the same memory

#### Scenario: US2 - Review and explicitly promote a candidate 4

- **GIVEN** a pending/rejected candidate, degraded/delegated identity, unsupported policy basis, or promoted content that adds an unsupported claim
- **WHEN** promotion is attempted
- **THEN** it fails with zero durable or FTS side effects

#### Scenario: US2 - Review and explicitly promote a candidate 5

- **GIVEN** a later correction or contradiction
- **WHEN** it is recorded
- **THEN** it creates a new supported candidate and uses existing memory supersession/retraction semantics after review rather than rewriting the prior observation or verdict

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

### Requirement: mem_save MUST Persist Evidence Before Optional Memory

`mem_save` MUST preserve deliberate metadata-free direct evidence-plus-memory saves, add strict direct evidence-only variants that create attributable observation validation/review supports, and support idempotent candidate submission, verified root review, and accepted-candidate promotion as explicit mutually discriminated operations whose confirmed IDs are returned only after commit.

#### Scenario: US1 - Preserve a source-supported observation candidate 1

- **GIVEN** a verified project or root session and one or more eligible source-evidence IDs
- **WHEN** `mem_save` receives a valid atomic observation candidate
- **THEN** it records a canonical immutable submission, generator identity, scope, supports, advisory file/concept facets, proposed memory interpretation, and one pending derived record before reporting success

#### Scenario: US1 - Preserve a source-supported observation candidate 2

- **GIVEN** a session-scoped candidate
- **WHEN** a support belongs to another project/session or falls outside declared ordered coverage
- **THEN** the entire transaction fails without evidence, event, observation, receipt, relationship, watermark, or FTS side effects

#### Scenario: US1 - Preserve a source-supported observation candidate 3

- **GIVEN** a project-scoped candidate supported by evidence from multiple sessions in the same project
- **WHEN** validation succeeds
- **THEN** it preserves every support ID without fabricating one session identity or sequence range

#### Scenario: US1 - Preserve a source-supported observation candidate 4

- **GIVEN** the same stable event identity and payload
- **WHEN** the submission is replayed
- **THEN** it returns the original candidate and durable IDs; a changed payload under that identity fails closed

#### Scenario: US2 - Review and explicitly promote a candidate 1

- **GIVEN** a pending candidate
- **WHEN** a verified root reviewer accepts it using a canonical policy basis appropriate to the claim
- **THEN** an immutable review event records reviewer actor/authority, reason, policy identifier/version, and source support without mutating candidate content

#### Scenario: US2 - Review and explicitly promote a candidate 2

- **GIVEN** a pending candidate
- **WHEN** it is rejected
- **THEN** the rejection remains inspectable and the candidate can never be promoted by similarity, confidence, lifecycle, replay, or a later conflicting verdict

#### Scenario: US2 - Review and explicitly promote a candidate 3

- **GIVEN** an accepted candidate
- **WHEN** explicit promotion succeeds
- **THEN** candidate, review, promotion evidence, resulting memory, original supports, receipt, topic supersession, and FTS visibility commit atomically and a replay returns the same memory

#### Scenario: US2 - Review and explicitly promote a candidate 4

- **GIVEN** a pending/rejected candidate, degraded/delegated identity, unsupported policy basis, or promoted content that adds an unsupported claim
- **WHEN** promotion is attempted
- **THEN** it fails with zero durable or FTS side effects

#### Scenario: US2 - Review and explicitly promote a candidate 5

- **GIVEN** a later correction or contradiction
- **WHEN** it is recorded
- **THEN** it creates a new supported candidate and uses existing memory supersession/retraction semantics after review rather than rewriting the prior observation or verdict

### Requirement: mem_recall, mem_context, and mem_get MUST Form a Progressive Funnel

Compact recall and context MUST continue to exclude observations, while `mem_get` MUST expand only an explicitly selected observation into bounded candidate, support-ID, review, promotion, and temporal-memory lineage without returning raw support payloads.

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

### Requirement: mem_project MUST Keep Project Operations Bounded

`mem_project` MUST add a bounded observation inspection action supporting verified project/session/status/current-history filters, non-branching correction lineage, and a total stable queue order without becoming a mutation, consolidation, or automatic-promotion surface.

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

### Requirement: mem_session MUST Handle Only Verified Root Lifecycle

`mem_session` MUST remain limited to verified lifecycle and session-summary workflows and MUST NOT infer, review, or promote observations from checkpoint, finalization, compaction, or recovery content.

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
