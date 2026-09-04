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

Stable-ranking optimization MUST preserve the complete ordered candidate and delivered result sequences, fixed score semantics, exact precedence, cohort precedence, query sanitation, limits, plan/config identity, deterministic ties, and diagnostic accounting for identical inputs.

#### Scenario: US1 - Preserve stable ranking while reducing latency 1

- **GIVEN** the 470-question pre-optimization stable report
- **WHEN** the optimized lane runs over the identical pinned corpus and budgets
- **THEN** every complete ordered ranking and all aggregate quality metrics are byte-equivalent to the baseline

#### Scenario: US1 - Preserve stable ranking while reducing latency 2

- **GIVEN** optimized stable and RRF lanes on the same build and corpus
- **WHEN** retrieval latency is measured sequentially
- **THEN** stable p95 is no greater than 10 ms and the stable/RRF ratio is recorded as diagnostic evidence

#### Scenario: US1 - Preserve stable ranking while reducing latency 3

- **GIVEN** long candidate content and repeated strict/relaxed matches
- **WHEN** stable scoring runs
- **THEN** each candidate receives the same finite score without redundant query compilation or semantically duplicate normalization work

#### Scenario: US2 - Retain import and retrieval contracts 1

- **GIVEN** native and imported cohorts
- **WHEN** stable recall executes
- **THEN** exact ID/topic precedence and oldest-cohort-first protected capacity remain unchanged

#### Scenario: US2 - Retain import and retrieval contracts 2

- **GIVEN** Unicode, repeated terms, prefixes, phrases, empty fields, punctuation-only queries, and deterministic ties
- **WHEN** the optimized scorer is evaluated
- **THEN** its score and resulting order equal the pre-optimization implementation

#### Scenario: US2 - Retain import and retrieval contracts 3

- **GIVEN** the archived strategy IDs and exact six-tool MCP contract
- **WHEN** repository verification runs
- **THEN** neither public surface nor archived strategy behavior changes

### Requirement: Recent Saves MUST Be Immediately Searchable by Core Retrieval

A confirmed save MUST be visible through authoritative lookup and FTS5 before success is returned.

#### Scenario: Recall immediately after save

- **GIVEN** a newly confirmed memory
- **WHEN** the same process recalls its exact topic or content
- **THEN** the memory is eligible without waiting for background work

### Requirement: Progressive Retrieval MUST Use Stable IDs and Bounded Escalation

Ordinary start/resume recovery, `mem_context`, and project briefing MUST retain deterministic project-memory eligibility, progressive stable IDs, privacy rules, and host caps. Timeline retrieval MUST use deterministic keyset order by `validFrom` descending then `id` ascending, MUST include current, superseded, retracted, and historical promoted memories by default, MUST support optional inclusive `since`/`until` validity bounds plus an opaque continuation cursor, and MUST enforce item and character budgets with truthful continuation metadata.

#### Scenario: US1 - Browse project memory chronologically 1

- **GIVEN** a project containing promoted memories in every supported temporal status
- **WHEN** an agent requests `mem_project` with `action=timeline`
- **THEN** it receives compact entries ordered by `validFrom` descending and `id` ascending for equal timestamps

#### Scenario: US1 - Browse project memory chronologically 2

- **GIVEN** memories belonging to another project
- **WHEN** the timeline is requested with one exact verified `project_key`
- **THEN** no foreign title, snippet, identifier, or temporal metadata is returned

#### Scenario: US1 - Browse project memory chronologically 3

- **GIVEN** an unknown project key, invalid time bound, malformed cursor, or incompatible cursor boundary
- **WHEN** the timeline is requested
- **THEN** the service returns an empty result for the unknown project or a bounded safe validation error for invalid input without writes

#### Scenario: US2 - Traverse a large timeline progressively 1

- **GIVEN** more eligible memories than fit in one response
- **WHEN** the agent follows `nextCursor`
- **THEN** each eligible memory appears once in the same total order and the response truthfully reports whether more entries remain

#### Scenario: US2 - Traverse a large timeline progressively 2

- **GIVEN** optional inclusive `since` and `until` bounds
- **WHEN** the agent requests the timeline
- **THEN** only promoted memories whose `validFrom` falls inside the valid range are eligible

#### Scenario: US2 - Traverse a large timeline progressively 3

- **GIVEN** a compact timeline entry
- **WHEN** the agent needs provenance or full content
- **THEN** it uses the stable memory ID with `mem_get`; the timeline itself exposes no evidence IDs, raw support payloads, summaries, observations, or session events

#### Scenario: US5 - Preserve intentional project-wide recovery 1

- **GIVEN** no eligible same-session summary and a useful current project handoff
- **WHEN** ordinary start/resume `recover` runs
- **THEN** the existing project-wide deterministic fallback remains eligible

#### Scenario: US5 - Preserve intentional project-wide recovery 2

- **GIVEN** the same project state
- **WHEN** `mem_context` or project briefing runs explicitly
- **THEN** current promoted memories remain available with the existing stable IDs, privacy boundary, and budget behavior

### Requirement: Current Recall MUST Prefer Valid Guidance Without Hiding History

Default current retrieval MUST prefer valid guidance over comparable superseded, retracted, or failed memory, while explicit historical retrieval MUST preserve linked lineage.

#### Scenario: Retrieve a superseded failure

- **GIVEN** a failed memory superseded by a successful correction
- **WHEN** current and history modes run
- **THEN** current mode prefers the correction and history mode can return both in lineage order

### Requirement: Project Briefing MUST Be Deterministic and Bounded

`guide_post_compact` MUST select only the newest eligible current summary for the exact verified project, harness, and root session. It MUST NOT fill remaining budget from project memories; when no eligible session summary can be delivered, it MUST abstain with verified identity only and truthful empty selection metadata.

#### Scenario: US2 - Recover only the compacted conversation 1

- **GIVEN** a compacted root session with a supported current checkpoint summary plus unrelated current project memories
- **WHEN** `guide_post_compact` runs
- **THEN** only the newest eligible summary from that exact project, harness, and root session is eligible for rendering

#### Scenario: US2 - Recover only the compacted conversation 2

- **GIVEN** a compacted root session with no eligible current summary and one or more current project handoffs from other sessions
- **WHEN** `guide_post_compact` runs
- **THEN** recovery renders verified identity only, returns empty selected record IDs, and reports `contextDelivered=false`

#### Scenario: US2 - Recover only the compacted conversation 3

- **GIVEN** a summary belonging to another root session or harness
- **WHEN** post-compaction recovery runs
- **THEN** that summary and every project memory remain absent

#### Scenario: US2 - Recover only the compacted conversation 4

- **GIVEN** a degraded or premature post-compaction event
- **WHEN** recovery is evaluated
- **THEN** existing fail-closed behavior remains unchanged and no memory is injected

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

### Requirement: Stable Lexical Ranking Latency Budget

On the pinned 470-question LongMemEval-S corpus, an optimized stable lane and the archived RRF strategy MUST run sequentially through the same current build, conditions, and mappings. Stable retrieval p95 MUST be no greater than 10 ms while preserving the pre-optimization stable ordered output for every question; contemporaneous RRF p95 and the stable/RRF ratio MUST be reported as diagnostic evidence.

#### Scenario: US1 - Preserve stable ranking while reducing latency 1

- **GIVEN** the 470-question pre-optimization stable report
- **WHEN** the optimized lane runs over the identical pinned corpus and budgets
- **THEN** every complete ordered ranking and all aggregate quality metrics are byte-equivalent to the baseline

#### Scenario: US1 - Preserve stable ranking while reducing latency 2

- **GIVEN** optimized stable and RRF lanes on the same build and corpus
- **WHEN** retrieval latency is measured sequentially
- **THEN** stable p95 is no greater than 10 ms and the stable/RRF ratio is recorded as diagnostic evidence

#### Scenario: US1 - Preserve stable ranking while reducing latency 3

- **GIVEN** long candidate content and repeated strict/relaxed matches
- **WHEN** stable scoring runs
- **THEN** each candidate receives the same finite score without redundant query compilation or semantically duplicate normalization work
