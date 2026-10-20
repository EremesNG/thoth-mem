# Tools

## Requirements

### Requirement: MCP Surface MUST Be Compact and Workflow-Level

The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`, MUST publish concise server instructions that balance progressive recall with deliberate durable save/handoff behavior, and MUST publish a distinct action-oriented description for each tool; tool and field descriptions MUST state each operational constraint once in compact form without repeating a tool description inside a field description, the catalog schemas registered natively in Pi MUST omit the `$schema` marker, and the aggregate serialized size of the model-facing definitions on the MCP and Pi surfaces MUST be locked by budget tests so it grows only through a deliberate definition change; compacting descriptions MUST NOT alter input schemas or runtime validation.

#### Scenario: MCP Surface MUST Be Compact and Workflow-Level

- **GIVEN** the catalog
- **WHEN** an MCP client lists tools and a Pi session registers its tools
- **THEN** each surface stays within its pinned aggregate budget and every listed input schema is the one runtime validation enforces

### Requirement: MCP Envelopes MUST Use Closed Current Schemas

Every project-scoped MCP input contract MUST describe `project_key` as the exact opaque verified identity and `project_name`, where present, as creation/display metadata that never participates in identity equality; incomplete or unknown identity fields MUST retain zero-side-effect failure behavior. Project list inspection MUST return at most 256 exact aliases per project with total-count and truncation metadata while exact resolution remains unbounded by that inspection cap.

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 1

- **GIVEN** a verified Git project and root session
- **WHEN** native recovery renders
- **THEN** it exposes `root_session_id`, `project_key=git:<uuid>`, and the database-persisted `project_name` as separate bounded values

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 2

- **GIVEN** the OpenCode read-only identity helper before lifecycle adoption
- **WHEN** it verifies a root caller
- **THEN** its versioned result returns the exact UUID-backed key plus a non-authoritative `project_name_hint`; after lifecycle, the persisted name in the verified recovery block prevails

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 3

- **GIVEN** a save, recall, context, project, or session MCP call
- **WHEN** the agent maps verified identity
- **THEN** it copies the key verbatim, treats `project_name` as creation/display metadata only, and never substitutes the display name, current path, Git remote, branch, worktree name, host project ID, or recalled content for the key

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 4

- **GIVEN** a lifecycle child response with a changed/missing key or a name that is unsafe or inconsistent with its recovery header
- **WHEN** the host validates it
- **THEN** no unverified memory context is injected and the host continues with bounded degradation

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

`mem_project` MUST retain bounded observation inspection with verified project/session/status/current-history filters, non-branching correction lineage, and a total stable queue order without becoming a mutation, consolidation, or automatic-promotion surface; MUST add a read-only `timeline` action requiring the exact verified `project_key`; MUST keep the exact six-tool registry unchanged; and MUST return only promoted memories from that project in timeline results.

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

#### Scenario: US4 - Preserve bounded observation inspection 1

- **GIVEN** pending, accepted, rejected, and promoted observations
- **WHEN** `mem_project` requests observations with project/session/status bounds
- **THEN** it returns a deterministic capped queue with stable IDs, compact metadata, and no raw support payloads

#### Scenario: US4 - Preserve bounded observation inspection 2

- **GIVEN** one selected observation ID
- **WHEN** `mem_get` expands it
- **THEN** it returns only that candidate, generator, scope, supports, immutable review lineage, promotion mapping, and related temporal memory IDs

#### Scenario: US4 - Preserve bounded observation inspection 3

- **GIVEN** any unpromoted observation
- **WHEN** compact recall, context, briefing, or native recovery runs
- **THEN** the observation is absent and existing memory/summary ordering, payload budget, trust boundary, and FTS rows remain unchanged

#### Scenario: US4 - Preserve bounded observation inspection 4

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

Codex, OpenCode, and Claude Code integrations MUST propagate the same verified canonical UUID from local Git resolution to lifecycle persistence and documented MCP mapping, then use the child service's persisted display name for model-visible lifecycle identity without substituting path metadata.

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 1

- **GIVEN** a Git repository without a thoth-mem identity
- **WHEN** verified native identity resolves concurrently for the first time
- **THEN** exactly one fully written UUID marker is published atomically without replacement in the Git common directory and every caller returns `git:<uuid>`

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 2

- **GIVEN** a repository with an existing local UUID
- **WHEN** its working directory is moved from one path or drive to another
- **THEN** the UUID-backed project key remains unchanged and the new path is recorded as an alias

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 3

- **GIVEN** a repository folder renamed from `thoth-mem` to `thoth-memory`
- **WHEN** lifecycle resumes
- **THEN** the project key remains unchanged and its persisted display name changes only through the explicit rename CLI

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 4

- **GIVEN** a main worktree and linked worktrees such as `thoth-mem-imp-size`
- **WHEN** any worktree runs lifecycle, save, or recall
- **THEN** all use the same canonical project while their exact paths remain separately observable aliases

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 5

- **GIVEN** two independent clones of the same remote
- **WHEN** each resolves identity
- **THEN** each receives a different local UUID unless a future explicit linking operation is requested

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 1

- **GIVEN** a verified Git project and root session
- **WHEN** native recovery renders
- **THEN** it exposes `root_session_id`, `project_key=git:<uuid>`, and the database-persisted `project_name` as separate bounded values

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 2

- **GIVEN** the OpenCode read-only identity helper before lifecycle adoption
- **WHEN** it verifies a root caller
- **THEN** its versioned result returns the exact UUID-backed key plus a non-authoritative `project_name_hint`; after lifecycle, the persisted name in the verified recovery block prevails

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 3

- **GIVEN** a save, recall, context, project, or session MCP call
- **WHEN** the agent maps verified identity
- **THEN** it copies the key verbatim, treats `project_name` as creation/display metadata only, and never substitutes the display name, current path, Git remote, branch, worktree name, host project ID, or recalled content for the key

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 4

- **GIVEN** a lifecycle child response with a changed/missing key or a name that is unsafe or inconsistent with its recovery header
- **WHEN** the host validates it
- **THEN** no unverified memory context is injected and the host continues with bounded degradation

### Requirement: Generic MCP Connections MUST Receive an Unverified Connection Session

When an MCP client that does not identify as a supported native host calls a tool without a session pair, the server MUST attribute the call to one server-assigned `mcp` session per connection, MUST finalize that session with a derived summary when the transport closes and otherwise leave it to lazy derivation, and MUST use it as the current session for previous-session selection in `mem_context` without a pair; this session MUST NOT authorize observation review or promotion or lifecycle summary submission, and native clients MUST keep their existing attribution.

#### Scenario: Generic MCP Connections MUST Receive an Unverified Connection Session

- **GIVEN** a generic MCP client that saves two memories without a session pair and then closes stdin
- **WHEN** a later connection reads context
- **THEN** both saves belong to one `mcp` connection session with a derived summary shown as the previous-session summary, and an observation review attempted with that session's identity is rejected

### Requirement: mem_project Summaries MUST Return Oversized Records in Bounded Form

`mem_project action=summaries` MUST list summaries newest first within `budget_chars`; when a record does not fit the remaining budget, the response MUST include it in bounded form with its identifiers, version, status, coverage, and generator plus as many leading claims as fit, clipping the last included claim when necessary and marking the item truncated, and MUST then stop with `payload_truncated`, so a budget able to hold one record's metadata never yields an empty list while summaries exist; the full record MUST remain available through `mem_get`.

#### Scenario: mem_project Summaries MUST Return Oversized Records in Bounded Form

- **GIVEN** a project whose only summary serializes to 13,000 characters
- **WHEN** `mem_project action=summaries` runs with `budget_chars` 4000
- **THEN** it returns that summary's ID and metadata with leading claims within 4,000 characters, marks it truncated, and warns `payload_truncated`

### Requirement: Tool Results MUST Be Valid Bounded JSON

Every MCP tool result MUST carry text content that is valid JSON of at most 20,000 characters and equal to the serialization of its `structuredContent`; when the full envelope would exceed that cap, the server MUST shrink it deterministically by first clipping the longest string values (never object keys) and then dropping trailing elements of the largest arrays, preserving the schema, the envelope structure, and every string of at most 64 code points, and MUST add `payload_truncated` to the envelope warnings; every clip MUST strictly shorten its string so shrinking terminates; results that carry a continuation cursor MUST be sized against the complete envelope so that bounding never alters them; results that fit MUST remain unchanged; and no host bridge, including Pi, MUST cut tool text, replacing an over-limit text with a valid bounded notice instead.

#### Scenario: Tool Results MUST Be Valid Bounded JSON

- **GIVEN** a valid submitted session summary close to the submission limit whose expanded envelope exceeds 20,000 characters, and a Pi tool call
- **WHEN** `mem_get` expands it through MCP and through the Pi extension
- **THEN** both receive valid JSON within 20,000 characters with the summary ID, version, coverage, and leading claims, clipped claim text, and the `payload_truncated` warning

### Requirement: mem_get MUST Return the Selected Record Once

`mem_get` MUST return the selected record only in its record field; its lineage MUST be empty unless history is requested and then MUST list only the selected record's predecessors, newest first, while evidence lineage remains empty and `mem_project` history keeps listing the selected record followed by its predecessors.

#### Scenario: mem_get MUST Return the Selected Record Once

- **GIVEN** a memory corrected twice under one topic key
- **WHEN** `mem_get` expands the current version without and with history
- **THEN** the first response has an empty lineage and the second lists the two predecessors newest first, neither repeating the selected record

### Requirement: Memory Guidance MUST Name Proactive Recall, Save, and Closure Triggers

Server instructions, the relevant tool descriptions, and the shared Skill MUST direct unprompted recall before exploring non-trivial repository work, immediate saving of verified durable findings, and closure of completed recovered handoffs by saving their outcome under the same `topic_key`; server instructions and the Skill MUST exclude trivial or conversational turns; server instructions MUST remain at most 699 UTF-16 code units, the six tool descriptions MUST total at most 1653 UTF-16 code units, and the canonical Skill MUST remain below 7244 UTF-16 code units, with distributed Skill copies synchronized.

#### Scenario: Memory Guidance MUST Name Proactive Recall, Save, and Closure Triggers

- **GIVEN** the MCP server and packaged shared Skill
- **WHEN** an agent loads their memory guidance
- **THEN** it receives the task-start recall, verified-save, and same-key closure triggers within the stated text ceilings, with equivalent Skill guidance across supported distributions
