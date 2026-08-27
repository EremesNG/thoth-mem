# Feature Specification: Establish Ordered Session Summaries

**Change ID**: `establish-ordered-session-summaries`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: Session continuity currently depends on checkpoint evidence being promoted into a generic `handoff` memory. That preserves recovery, but it collapses source events, derived session state, and durable cross-session knowledge into one authority level. The product needs an ordered evidence ledger and versioned, source-supported session summaries so restart and compaction recovery remain concise without inventing promoted memory.<br>
**Impact**: Verified root events gain deterministic session order and trust metadata; externally generated checkpoint/final summaries become versioned non-authoritative projections whose material claims cite in-scope evidence; recovery prefers the newest eligible summary and falls back to existing current handoffs when no summary exists. The MCP server continues to expose exactly six tools, the core invokes no model, and existing current databases migrate forward without inferred historical summaries.<br>
**Affected capabilities**: `store`, `tools`, `harness-integration`, `retrieval`, `evals`

## Program boundary

This is the first of three independently verified changes governed by one confirmed architecture:

1. `establish-ordered-session-summaries` — ordered evidence, summary projections, lifecycle recovery, and forward migration.
2. `establish-observation-promotion-pipeline` — durable observations, evidence lineage, review states, and explicit promotion policy.
3. `enforce-memory-governance-and-retrieval-gates` — retention execution, revocation cascade, usage telemetry, and evidence-gated lexical query improvement.

Each change MUST remain independently useful and MUST stop or pivot if it fails an integrity gate or does not preserve measurable utility under an equal budget after one convergence round.

## User stories

### US1 - Record authoritative session events in deterministic order (Priority: P1)

As a harness, I can append verified root events with database-assigned session order and explicit trust metadata so that replay, coverage, idempotency, and later derivation do not depend on caller timing or transcript reconstruction.

**Independent test**: Concurrent and replayed lifecycle/save fixtures produce one monotonic sequence per committed event, preserve the original duplicate result, reject unknown trust taxonomy values, and never capture excluded assistant/tool/subagent/private traffic.

**Covers**: FR-001, FR-003, SC-001

**Acceptance scenarios**:

1. **Given** a verified root session with no prior events, **When** allowed root prompts and lifecycle checkpoints commit, **Then** each new evidence event receives the next database-assigned session sequence and canonical actor, authority, retention, and privacy metadata in the same transaction.
2. **Given** the same stable event key is replayed, **When** the write repeats, **Then** it returns the original evidence ID and session sequence without allocating a gap or duplicate event.
3. **Given** assistant reasoning, arbitrary tool streams, delegated-agent output, a private block, or an unverifiable caller, **When** automatic capture is considered, **Then** it remains excluded or fails closed without advancing the durable session sequence.
4. **Given** a project-only explicit save with no verified session, **When** it commits, **Then** it remains valid evidence without a fabricated session sequence or authority claim.

### US2 - Preserve a source-supported versioned session summary (Priority: P1)

As a root agent or harness, I can submit a structured checkpoint or final summary whose material claims cite ordered source evidence so that the core can validate, version, inspect, and reconstruct the derived view without running an LLM or treating the summary as primary truth.

**Independent test**: A caller-supplied summary fixture with objective, completed work, decisions, changed surfaces, checks, pending work, blockers, and next action persists one current version; a newer version supersedes it; invalid, cross-project, cross-session, out-of-range, or unsupported claims commit nothing.

**Covers**: FR-004, FR-006, FR-007, FR-008, FR-009, SC-002, SC-004

**Acceptance scenarios**:

1. **Given** a verified root session and ordered supporting evidence, **When** `mem_session` receives a valid structured checkpoint or final summary, **Then** it records the external generator, source coverage, atomic claims, support IDs, version lineage, and one immutable submission event before reporting success.
2. **Given** an existing current summary of the same session and summary kind, **When** a later valid version commits, **Then** the prior version becomes superseded, the newer version becomes current, and both remain inspectable with their source lineage.
3. **Given** a material claim with no support, support from another project/session, or support outside the declared sequence range, **When** validation runs, **Then** the entire summary transaction fails with no evidence, projection, receipt, or watermark side effect.
4. **Given** an unavailable model or generator, **When** ordinary save, recall, or recovery executes, **Then** the SQLite core remains available and never attempts a model or network call.

### US3 - Resume from the newest truthful session projection (Priority: P1)

As a coding agent, I can resume after restart or compaction from the newest current summary before generic project memory so that actionable session state survives within the host budget without being promoted into durable knowledge.

**Independent test**: The same session fixture recovered through OpenCode, Codex, Claude-shaped adapters, `mem_context`, and `mem_project action=briefing` selects the same summary, preserves all critical fields, labels it as untrusted historical data, stays within each host cap, and creates no handoff memory.

**Covers**: FR-002, FR-010, FR-011, FR-012, FR-013, SC-003, SC-005

**Acceptance scenarios**:

1. **Given** a current supported session summary and current promoted project memories, **When** start/resume or post-compaction recovery runs, **Then** the summary is considered first and remaining budget is filled only with eligible current memories under the shared deterministic selector.
2. **Given** no eligible summary after migration, **When** recovery runs, **Then** it falls back to the existing current handoff/memory policy without fabricating a summary or blocking the host prompt.
3. **Given** a selected summary, **When** host-visible context renders, **Then** it includes a stable summary ID for progressive expansion, preserves the actionable fields that fit, identifies all historical content as untrusted data, and does not expose raw support evidence by default.
4. **Given** a pre-compaction checkpoint after this change, **When** it is captured, **Then** checkpoint evidence and the supplied summary may commit idempotently but no `handoff` memory is automatically promoted.

### US4 - Upgrade the current ledger without inventing history (Priority: P1)

As an operator, I can open an existing current-schema database and receive a verified forward migration so that evidence and memories remain intact while the new pipeline starts only from attributable future events.

**Independent test**: A file-backed revision-3 fixture creates and verifies a pre-upgrade backup, migrates transactionally to the new revision, preserves all authoritative rows and FTS integrity, leaves observations/summaries empty, and reopens idempotently; an injected failure leaves the source database at revision 3 and the backup restorable.

**Covers**: FR-005, SC-001

**Acceptance scenarios**:

1. **Given** a valid file-backed revision-3 database, **When** startup first upgrades it, **Then** a verified pre-upgrade backup exists before the forward-only migration commits and all existing authoritative data remains valid.
2. **Given** existing checkpoint evidence and handoff memories, **When** migration completes, **Then** they remain unchanged and no observation, summary, sequence, actor, authority, retention, or privacy value is inferred for historical rows.
3. **Given** a migration failure before commit, **When** startup reports the error, **Then** the original database remains at revision 3, no partial new-schema state is visible, and the verified backup can restore the pre-upgrade bytes.
4. **Given** an in-memory or clean database, **When** schema initialization runs, **Then** it creates the current schema directly without requiring a filesystem backup.

## Edge cases

- Concurrent events for one session MUST receive unique monotonic sequences without trusting a caller-provided next value.
- A duplicate event or summary receipt MUST return the original durable IDs and MUST NOT consume another sequence or create another version.
- A summary range may cover allowed events that have gaps because excluded traffic never entered the ledger; range coverage MUST NOT imply a full transcript.
- Every material summary claim MUST have at least one support ID; one summary-level source list MUST NOT make unsupported claims appear grounded.
- Support IDs MUST resolve to the same project and root session and fall within the declared inclusive sequence range.
- A summary that exceeds storage, claim-count, or host-rendering limits MUST fail or be truthfully truncated at rendering; the stored structured record MUST NOT be silently clipped.
- An older checkpoint arriving after a newer current summary MUST NOT replace it solely because wall-clock delivery was late; declared coverage and durable ordering determine precedence.
- Existing handoff memories remain eligible fallback data after migration, but new checkpoints MUST NOT create them automatically.
- A degraded or delegated lifecycle caller MUST NOT submit a root-authoritative summary or receive another session's summary.
- Unknown actor, authority, privacy, retention, summary-kind, claim-kind, status, or generator values MUST fail at public, service, and SQLite boundaries with zero side effects.
- The summary submission event is evidence that a named generator asserted those claims; the summary projection itself remains derived and does not gain more authority than its sources.
- Model or network unavailability MUST NOT degrade ledger writes, lexical recall, project history, or fallback recovery.

## Functional requirements

- **FR-001 — SQLite Memory Ledger MUST Be the Sole Source of Truth**: `[MODIFIED store]` The system MUST extend the authoritative local ledger with database-ordered session evidence and immutable summary-submission events while keeping session summaries non-authoritative derived state whose content, version, coverage, generator, and support lineage can be reconstructed from the ledger.
- **FR-002 — Raw Evidence and Promoted Memory MUST Remain Distinct**: `[MODIFIED store]` Automatic capture MUST keep prompts/checkpoints as evidence, MUST represent supplied session summaries outside `memories`, and MUST NOT promote a handoff or any other memory merely because checkpoint, compaction, or finalization occurred.
- **FR-003 — Save Paths MUST Use One Explicit Identity Contract**: `[MODIFIED store]` Every verified session-attributed evidence write MUST receive an atomic database-assigned sequence plus canonical actor, authority, retention, and privacy classifications; project-only writes MUST remain valid without fabricated session identity or ordering.
- **FR-004 — Optional Projection Lineage MUST Be Rebuildable and Traceable**: `[MODIFIED store]` Session summary projections MUST preserve kind, current/superseded version state, inclusive source sequence coverage, immutable submission source, external generator descriptor, atomic material claims, per-claim support IDs, and deterministic source/version mappings without becoming authoritative truth.
- **FR-005 — Startup Migrations MUST Be Structured and Idempotent**: `[MODIFIED store]` The current-schema migration MUST upgrade revision 3 forward in one transaction, create and verify a recoverable pre-upgrade backup for file-backed databases before commit, preserve existing authoritative data and FTS integrity, perform no inferred summary/metadata backfill, and reopen idempotently at the new revision.
- **FR-006 — MCP Surface MUST Be Compact and Workflow-Level**: `[MODIFIED tools]` The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; summary submission, selection, inspection, and history MUST extend those workflow tools through closed current schemas rather than adding stage-specific tools.
- **FR-007 — mem_session MUST Handle Only Verified Root Lifecycle**: `[MODIFIED tools]` `mem_session` MUST allow an externally generated structured summary only on the declared verified checkpoint/final lifecycle boundary, validate its identity, ordering, coverage, generator, claims, and supports atomically with the lifecycle receipt, and remain idempotent by stable event identity.
- **FR-008 — mem_recall, mem_context, and mem_get MUST Form a Progressive Funnel**: `[MODIFIED tools]` Compact context and recovery MUST expose stable selected summary IDs without raw support payloads, and `mem_get` MUST expand an explicitly selected summary into its structured claims, coverage, generator, version lineage, and support IDs without returning unrelated records.
- **FR-009 — mem_project MUST Keep Project Operations Bounded**: `[MODIFIED tools]` Project operations MUST support bounded current and historical session-summary inspection within verified project/session scope while briefing continues to delegate to the shared continuation selector and no seventh tool or optional model/vector/graph dependency is introduced.
- **FR-010 — Runtime Lifecycle MUST Preserve the Core Contract**: `[MODIFIED harness-integration]` OpenCode, Codex, and Claude lifecycle adapters MUST normalize the same externally supplied summary contract, preserve root identity/privacy/idempotency semantics, invoke no summarization model in the core, and degrade without blocking the host when a valid summary is unavailable.
- **FR-011 — Model-Visible Recovery Context MUST Be Bounded and Source-Attributed**: `[MODIFIED harness-integration]` Native recovery MUST render the newest eligible current session summary as untrusted historical data with a stable expansion ID, preserve actionable summary fields under the host cap, omit raw supporting evidence by default, and report delivery/consumption truthfully.
- **FR-012 — Project Briefing MUST Be Deterministic and Bounded**: `[MODIFIED retrieval]` The shared continuation selector MUST consider the newest eligible current session summary before current promoted memories, use deterministic project/session/version precedence, retain existing handoff fallback when no summary exists, and never synthesize unsupported fields.
- **FR-013 — Evals MUST Measure Compaction Recovery and Coding Outcomes**: `[MODIFIED evals]` Product evaluation MUST additionally measure ordered-event idempotency, summary claim support coverage, rejection of unsupported/cross-scope claims, version precedence, no automatic memory promotion, three-host restart/post-compaction fidelity, equal-budget fallback, injected characters, and zero core model/network calls.

## Success criteria

- **SC-001** `[buildable]`: Focused schema/service tests prove atomic monotonic per-session ordering, duplicate stability, closed trust taxonomies, revision-3 backup verification, forward-only migration, no inferred backfill, rollback on injected failure, foreign-key integrity, and FTS preservation.
- **SC-002** `[buildable]`: Summary tests prove that valid checkpoint/final submissions persist immutable submission evidence plus one current structured projection; every material claim has same-project/same-session/in-range support; supersession/history are deterministic; malformed, unsupported, cross-scope, late-regressing, or oversized submissions produce zero side effects and zero model/network calls.
- **SC-003** `[buildable]`: Lifecycle, continuation, MCP, and native adapter tests prove all three hosts select the same latest summary before generic memory, remain within their caps, render untrusted-data boundaries and stable expansion IDs, omit raw supports by default, fall back to existing handoffs when necessary, and never auto-promote a new handoff memory.
- **SC-004** `[buildable]`: Server and package inventory tests prove the exact six-tool surface remains unchanged while closed schemas support summary submit/current/history/get workflows and reject unknown nested values without durable side effects.
- **SC-005** `[outcome]`: Under the committed equal-budget continuation fixtures, summary-based recovery preserves every previously required actionable handoff field with zero unsupported claims, zero cross-project/session leakage, zero automatic promoted memories, no host-cap regression, and no lower useful-content ratio than the archived handoff-memory baseline; failure after one convergence round pauses this stage.

## Assumptions

- The root agent or harness, not the SQLite core, produces the structured summary and identifies its generator; the core validates and stores but never calls a model.
- Material claims are objective, completed work, decisions, changed surfaces, checks/results, pending work, blockers, and next action. Presentation prose may be derived from those claims but is not the only durable representation.
- Existing revision-3 handoff memories remain valid fallback data and are not rewritten or reclassified by migration.
- Integrity, privacy, project/session isolation, and revocation readiness outrank retrieval coverage, latency, footprint, or convenience.
- Quantitative resource and non-inferiority gates are derived conservatively from committed/archived baselines and declared before outcome evaluation.

## Dependencies

- Existing SQLite revision-3 migration framework, sessions/evidence/receipts/watermark ledger, continuation selector, exact six MCP tools, and three native lifecycle adapters.
- Existing committed continuation, lifecycle, privacy, package, and benchmark fixtures.
- The confirmed architecture decisions from the Full-route discovery; no external model, network service, vector store, or new MCP tool is required.

## Out of scope

- Durable observation entities, observation review states, observation-to-evidence lineage, or promotion from observation to memory; these belong to `establish-observation-promotion-pipeline`.
- Retention sweeps, physical redaction/deletion, tombstones, full revocation cascade, memory-use telemetry, or policy/capability enforcement; these belong to `enforce-memory-governance-and-retrieval-gates`, with action authorization remaining in each harness.
- Lexical query relaxation, dense/hybrid retrieval, embeddings, reranking, graph/entity memory, consolidation, or any model call in the core. Lexical improvement belongs to the third change; dense/hybrid requires a later separate evidence gate.
- Automatic transcript, arbitrary tool stream, delegated-agent, filesystem, assistant-response, or private-reasoning capture.
- Inferred backfill of ordering, trust metadata, observations, or summaries for existing rows.
- Backward-compatible aliases, additional MCP tools, remote/cloud storage, dashboard, HTTP API, or a general harness policy engine.
