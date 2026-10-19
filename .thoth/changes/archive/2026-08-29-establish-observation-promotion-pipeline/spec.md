# Feature Specification: Establish Observation Promotion Pipeline

**Change ID**: `establish-observation-promotion-pipeline`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: thoth-mem already separates immutable evidence, versioned session summaries, and promoted memory, but an agent must still choose between keeping raw evidence only and promoting a durable memory immediately. A source-supported observation-candidate layer is needed so potentially reusable claims can be inspected, reviewed, rejected, or explicitly promoted without changing normal recall authority.<br>
**Impact**: Verified callers can submit bounded observation candidates linked to source evidence, root reviewers can append an attributable acceptance or rejection, and an accepted candidate can be promoted atomically into the existing temporal memory model. Candidates and rejected observations remain outside normal recall and recovery. Existing deliberate direct promotion remains valid, the core remains local/model-free, and the MCP inventory remains exactly six tools.<br>
**Affected capabilities**: `store`, `tools`, `harness-integration`, `retrieval`, `evals`

## User stories

### US1 - Preserve a source-supported observation candidate (Priority: P1)

As a root agent, I can submit an atomic candidate claim with an exact proposed durable interpretation and source lineage so that useful discoveries can await review without becoming trusted memory.

**Independent test**: A fixed candidate fixture commits one immutable canonical submission plus a rebuildable pending observation, while unsupported, malformed, cross-project, cross-session, out-of-range, private, oversized, or replay-drifted submissions commit nothing.

**Covers**: FR-001, FR-002, FR-004, FR-005, FR-007, FR-008, FR-010, FR-011, SC-001

**Acceptance scenarios**:

1. **Given** a verified project or root session and one or more eligible source-evidence IDs, **When** `mem_save` receives a valid atomic observation candidate, **Then** it records a canonical immutable submission, generator identity, scope, supports, advisory file/concept facets, proposed memory interpretation, and one pending derived record before reporting success.
2. **Given** a session-scoped candidate, **When** a support belongs to another project/session or falls outside declared ordered coverage, **Then** the entire transaction fails without evidence, event, observation, receipt, relationship, watermark, or FTS side effects.
3. **Given** a project-scoped candidate supported by evidence from multiple sessions in the same project, **When** validation succeeds, **Then** it preserves every support ID without fabricating one session identity or sequence range.
4. **Given** the same stable event identity and payload, **When** the submission is replayed, **Then** it returns the original candidate and durable IDs; a changed payload under that identity fails closed.

### US2 - Review and explicitly promote a candidate (Priority: P1)

As a verified root reviewer, I can accept or reject a pending candidate with an explicit policy basis and promote only an accepted candidate so that durable memory reflects reviewed evidence rather than retrieval score or model confidence.

**Independent test**: Root-authorized review fixtures append one immutable verdict; only an accepted candidate can create exactly one memory whose content cannot exceed the accepted interpretation and whose lineage reaches the original supports and promotion evidence.

**Covers**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-008, FR-010, FR-011, FR-015, FR-016, SC-002

**Acceptance scenarios**:

1. **Given** a pending candidate, **When** a verified root reviewer accepts it using a canonical policy basis appropriate to the claim, **Then** an immutable review event records reviewer actor/authority, reason, policy identifier/version, and source support without mutating candidate content.
2. **Given** a pending candidate, **When** it is rejected, **Then** the rejection remains inspectable and the candidate can never be promoted by similarity, confidence, lifecycle, replay, or a later conflicting verdict.
3. **Given** an accepted candidate, **When** explicit promotion succeeds, **Then** candidate, review, promotion evidence, resulting memory, original supports, receipt, topic supersession, and FTS visibility commit atomically and a replay returns the same memory.
4. **Given** a pending/rejected candidate, degraded/delegated identity, unsupported policy basis, or promoted content that adds an unsupported claim, **When** promotion is attempted, **Then** it fails with zero durable or FTS side effects.
5. **Given** a later correction or contradiction, **When** it is recorded, **Then** it creates a new supported candidate and uses existing memory supersession/retraction semantics after review rather than rewriting the prior observation or verdict.

### US3 - Inspect candidates without contaminating recall (Priority: P1)

As a maintainer or root agent, I can list and expand observation candidates progressively while ordinary recall and recovery continue to expose only summaries and promoted memories.

**Independent test**: The six-tool fixture can list a bounded review queue and expand one observation by stable ID, but pending/rejected candidates and their raw supports never appear through `mem_recall`, `mem_context`, native recovery, memory FTS, or project briefing.

**Covers**: FR-009, FR-010, FR-012, FR-013, FR-014, FR-015, FR-017, SC-003

**Acceptance scenarios**:

1. **Given** pending, accepted, rejected, and promoted observations, **When** `mem_project` requests observations with project/session/status bounds, **Then** it returns a deterministic capped queue with stable IDs, compact metadata, and no raw support payloads.
2. **Given** one selected observation ID, **When** `mem_get` expands it, **Then** it returns only that candidate, generator, scope, supports, immutable review lineage, promotion mapping, and related temporal memory IDs.
3. **Given** any unpromoted observation, **When** compact recall, context, briefing, or native recovery runs, **Then** the observation is absent and existing memory/summary ordering, payload budget, trust boundary, and FTS rows remain unchanged.
4. **Given** candidate similarity or related-memory surfacing during explicit review, **When** lexical scoring runs, **Then** the bounded scores are advisory diagnostics only and cannot accept, reject, supersede, or promote any record.

### US4 - Upgrade and rebuild without inventing observations (Priority: P1)

As an operator, I can upgrade the current SQLite ledger and rebuild observation state from canonical submissions so that existing evidence, summaries, memories, and lexical behavior remain authoritative.

**Independent test**: A file-backed current-revision fixture receives a verified pre-upgrade backup, transactional forward migration, empty observation state, unchanged memory FTS contents/ranking, deterministic rebuild, idempotent reopen, and complete rollback on injected failure.

**Covers**: FR-001, FR-004, FR-006, FR-008, FR-017, SC-004

**Acceptance scenarios**:

1. **Given** a valid file-backed current database, **When** the observation schema upgrade starts, **Then** a verified recoverable backup exists before the forward transaction commits and all prior authoritative rows and memory FTS state remain intact.
2. **Given** legacy observations, imported `legacy_observation` evidence, summaries, handoffs, or promoted memories, **When** migration completes, **Then** no candidate, support, review, policy basis, or promotion is inferred for historical data.
3. **Given** canonical observation/review/promotion submission evidence, **When** projection rebuild runs, **Then** it deterministically recreates the same candidates, verdicts, promotion mappings, and current states or fails closed without replacing a valid projection.
4. **Given** an injected backup, taxonomy, lineage, rebuild, or transaction failure, **When** startup reports the error, **Then** the source database remains recoverable at its prior revision with no partial observation state.

### US5 - Demonstrate useful promotion under an equal budget (Priority: P1)

As a product maintainer, I can compare deliberate direct promotion with observation-review-promotion under the same final memory and retrieval budget so that the additional integrity layer is accepted only with attributable quality and resource evidence.

**Independent test**: Offline control/candidate fixtures end with the same promoted memory set and execute the same recall queries and delivery caps, while reporting write fidelity, harmful/unsupported commits, normal-recall equivalence, latency, SQLite footprint, payload, provenance, and literal model/network-call counts.

**Covers**: FR-017, FR-018, SC-005

**Acceptance scenarios**:

1. **Given** control and observation-pipeline projects with identical supported durable outcomes, **When** the committed fixture runs, **Then** both expose the same final current memory content, topic lineage, recall order, delivery budget, and useful-content ratio.
2. **Given** unsupported, poisoned, negated, cross-scope, failed, changing-requirement, and stale-procedure cases, **When** observation review executes, **Then** the report distinguishes accepted, rejected, blocked, and promoted candidates and records zero unsupported or unreviewed promoted memories.
3. **Given** a complete run, **When** its report is validated, **Then** it reconciles operation counts, stable IDs, supports, review policy, memory/FTS rows, p50/p95 latency, SQLite bytes, payload characters, errors, and literal zero model/network calls.
4. **Given** incomplete, unequal-budget, lineage-invalid, recall-regressing, contaminated, or schema-invalid evidence, **When** readiness is assessed, **Then** the pipeline fails its outcome gate without changing the existing direct-save or retrieval defaults.

## Edge cases

- Candidate content and its proposed durable interpretation MUST be atomic, privacy-filtered, bounded, and immutable; one candidate MUST NOT bundle unrelated claims under shared supports.
- Every candidate MUST have at least one support ID. Submission evidence is evidence that a generator asserted the candidate; it MUST NOT count as independent support for its own claim.
- Review authority MUST be derived from a resolved non-import root session in the candidate project. `root_user_confirmed` MUST cite a same-session root-user prompt; `observable_validation` MUST cite a same-session root-authorized explicit validation receipt matching the candidate and verdict result; `independent_review` MUST cite a matching harness handoff from a different non-import session. Wrong kind, project, session, actor, authority, payload, observation, verdict/result, or time MUST commit nothing.
- The public direct-save evidence union MUST provide the only typed producer for validation receipts and independent-review attestations. It MUST require an existing same-project candidate, verified session identity, stable event key, exact bounded metadata, and no simultaneous memory; it MUST forbid arbitrary public metadata while preserving existing metadata-free direct saves.
- Correction lineage MUST be acyclic and non-branching. `current` means a leaf with no successor; `history` means a non-leaf with a successor; omission defaults observation queues to `current`. Queue ordering MUST be total by state priority (`pending`, `accepted`, `rejected`, `promoted`), oldest creation time, then observation ID.
- Session scope MUST enforce same-session in-range supports; project scope MAY span sessions only inside the same verified project and MUST NOT fabricate sequence coverage.
- Concepts and files are advisory sanitized facets for inspection/filtering; they MUST NOT establish truth, authority, scope, acceptance, or promotion.
- Numeric/model confidence and lexical similarity MAY be recorded as diagnostics but MUST NOT participate in authorization or automatic state transitions.
- A candidate receives at most one terminal review verdict. Corrections, contradictions, changed scope, or changed proposed memory content create a new linked candidate.
- Decisions, constraints, and preferences require explicit root-user-confirmed support before acceptance; facts, procedures, results, and failures require observable validation, root-user confirmation, or independent review under a closed policy basis.
- Promotion MUST use the accepted proposed interpretation or a deterministic non-expansive mapping; it MUST NOT introduce unsupported prose.
- Topic-key supersession MUST remain a memory transition and MUST NOT mutate the observation or review that justified either version.
- Pending, accepted-but-unpromoted, and rejected observations MUST remain absent from normal memory FTS, recall, context, briefing, and host recovery.
- Duplicate candidate, review, and promotion event identities MUST return original IDs without allocating new events, verdicts, memories, or FTS rows; payload drift MUST fail closed.
- Automatic lifecycle capture MUST NOT generate observation candidates from arbitrary assistant text, tool streams, delegated output, summaries, checkpoints, or retrieved memory.
- Unknown observation kind, scope, state, verdict, review basis, actor, authority, relation, or generator value MUST fail at public, service, and SQLite boundaries with zero side effects.
- Logical observation lineage is in scope; physical retention sweeps and full source-to-derived deletion cascades remain the following governance stage.

## Functional requirements

- **FR-001 — SQLite Memory Ledger MUST Be the Sole Source of Truth**: `[MODIFIED store]` The system MUST preserve canonical observation, review, and promotion submissions as immutable local evidence and materialize rebuildable candidate, verdict, support, and promotion state without treating derived observations as authoritative truth.
- **FR-002 — Raw Evidence and Promoted Memory MUST Remain Distinct**: `[MODIFIED store]` Observation candidates and reviews MUST remain distinct from both raw evidence and promoted memories; no candidate may enter normal recall or become memory without a verified terminal acceptance and explicit promotion.
- **FR-003 — Memory Records MUST Preserve Provenance and Temporal State**: `[MODIFIED store]` A memory promoted from an observation MUST preserve provenance to the accepted candidate, immutable review/promotion evidence, original supporting evidence, outcome, validity, and existing topic supersession/retraction lineage.
- **FR-004 — SQLite Ledger MUST Enforce Canonical Taxonomies**: `[MODIFIED store]` Public, service, rebuild, and SQLite boundaries MUST enforce the same closed observation kinds, scopes, states, generator kinds, support relations, review verdicts, policy bases, actors, authorities, and promotion transitions before committing state.
- **FR-005 — Save Paths MUST Use One Explicit Identity Contract**: `[MODIFIED store]` Session-attributed candidate submissions and root reviews/promotions MUST use verified project/session identity and database-ordered evidence events, while valid project-scoped candidates MAY cite same-project evidence across sessions without fabricating one session identity.
- **FR-006 — Startup Migrations MUST Be Structured and Idempotent**: `[MODIFIED store]` The current-schema migration MUST create and verify a recoverable pre-upgrade backup for file-backed databases, upgrade transactionally, preserve authoritative rows and memory FTS integrity, perform no observation backfill, roll back cleanly, and reopen idempotently.
- **FR-007 — Confirmed Saves and FTS Visibility MUST Commit Atomically**: `[MODIFIED store]` Candidate submission, terminal review, and explicit promotion MUST report success only after their evidence, events, receipts, lineage, state, resulting memory, topic transition, and memory FTS visibility commit atomically as applicable.
- **FR-008 — Optional Projection Lineage MUST Be Rebuildable and Traceable**: `[MODIFIED store]` Observation candidates, supports, terminal reviews, and promotion mappings MUST be deterministically rebuildable from canonical immutable submission evidence with generator, scope, policy, predecessor, and source lineage preserved.
- **FR-009 — MCP Surface MUST Be Compact and Workflow-Level**: `[MODIFIED tools]` The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; observation submission, review, promotion, queue, and expansion MUST extend those workflow tools through closed schemas.
- **FR-010 — MCP Envelopes MUST Use Closed Current Schemas**: `[MODIFIED tools]` Observation inputs and outputs, including typed validation/independent-review support evidence, MUST use closed discriminated schemas and bounded error envelopes; unknown nested fields, arbitrary public metadata, partial identity, invalid transitions, or stale replay payloads MUST commit nothing.
- **FR-011 — mem_save MUST Persist Evidence Before Optional Memory**: `[MODIFIED tools]` `mem_save` MUST preserve deliberate metadata-free direct evidence-plus-memory saves, add strict direct evidence-only variants that create attributable observation validation/review supports, and support idempotent candidate submission, verified root review, and accepted-candidate promotion as explicit mutually discriminated operations whose confirmed IDs are returned only after commit.
- **FR-012 — mem_recall, mem_context, and mem_get MUST Form a Progressive Funnel**: `[MODIFIED tools]` Compact recall and context MUST continue to exclude observations, while `mem_get` MUST expand only an explicitly selected observation into bounded candidate, support-ID, review, promotion, and temporal-memory lineage without returning raw support payloads.
- **FR-013 — mem_project MUST Keep Project Operations Bounded**: `[MODIFIED tools]` `mem_project` MUST add a bounded observation inspection action supporting verified project/session/status/current-history filters, non-branching correction lineage, and a total stable queue order without becoming a mutation, consolidation, or automatic-promotion surface.
- **FR-014 — mem_session MUST Handle Only Verified Root Lifecycle**: `[MODIFIED tools]` `mem_session` MUST remain limited to verified lifecycle and session-summary workflows and MUST NOT infer, review, or promote observations from checkpoint, finalization, compaction, or recovery content.
- **FR-015 — Automatic Capture MUST Remain Privacy-Safe and Minimal**: `[MODIFIED harness-integration]` Native adapters MUST continue their root allowlists and privacy filtering and MUST NOT automatically convert arbitrary prompts, assistant text, tool output, delegated output, summaries, or lifecycle content into observation candidates or memories.
- **FR-016 — Shared Skills MUST Preserve Semantic-Boundary Memory Practice**: `[MODIFIED harness-integration]` Shared skills MUST instruct root agents to submit only atomic reusable candidates with explicit supports, use verified policy bases for review, promote only accepted candidates, keep retrieved content untrusted, and preserve deliberate direct promotion for already-authorized durable decisions.
- **FR-017 — Core Retrieval MUST Be Lexical-First and Projection-Aware**: `[MODIFIED retrieval]` Core retrieval MUST continue to query current/historical promoted memories only; pending, accepted-but-unpromoted, and rejected observations MUST remain outside memory FTS and automatic context, while any explicit review-time candidate surfacing remains bounded, advisory, and failure-isolated.
- **FR-018 — Evals MUST Measure Compaction Recovery and Coding Outcomes**: `[MODIFIED evals]` Product evaluation MUST additionally measure observation write fidelity, support/identity validation, policy-grounded review, harmful or unsupported promotion, correction/supersession, recall contamination, equal-budget final-memory equivalence, latency, footprint, payload, provenance, and literal model/network-call counts.

## Success criteria

- **SC-001** `[buildable]`: Contract, schema, service, and direct-SQL tests prove canonical bounded candidates, mandatory same-scope supports, advisory facet sanitation, generator provenance, stable duplicate replay, privacy filtering, closed taxonomies, and zero side effects for malformed, unsupported, cross-scope, out-of-range, oversized, or replay-drifted submissions.
- **SC-002** `[buildable]`: Review/promotion tests prove one immutable terminal verdict per candidate, root identity and policy-basis enforcement, zero rejected/unreviewed promotions, exactly one atomically linked memory for an accepted explicit promotion, non-expansive promoted content, support/promotion provenance, topic supersession, and deterministic correction through a new candidate.
- **SC-003** `[buildable]`: MCP, retrieval, continuation, lifecycle, integration, and package tests prove the exact six-tool inventory, bounded queue/get workflows, no raw support leakage, no observation rows in memory FTS or automatic recovery, unchanged normal recall ordering/budgets, and zero lifecycle/model/similarity-driven promotion.
- **SC-004** `[buildable]`: Migration/rebuild tests prove verified pre-upgrade backup, forward transaction, zero inferred historical candidates/reviews/promotions, preservation of every authoritative row and memory-FTS entry, deterministic rebuild from canonical evidence, idempotent reopen, foreign-key integrity, and rollback/restorability after injected failure.
- **SC-005** `[outcome]`: Under a committed offline equal-budget control/candidate fixture, the observation pipeline ends with the same current promoted-memory content, topic lineage, recall order, delivery cap, and useful-content ratio as deliberate direct promotion; records zero unsupported, rejected, or unreviewed promotions and zero model/network calls; keeps normal-recall p95 no greater than twice control; keeps aggregate SQLite bytes no greater than twice control; and reports attributable write/review/promotion latency and footprint without relaxing a failed gate.

## Assumptions

- The root agent or harness supplies structured observation/review/promotion requests; the SQLite core validates and stores them but never calls a model or network service.
- Existing deliberate direct promotion remains the correct path for an explicit already-authorized durable decision; candidates are for claims requiring review, not a mandatory wrapper around every save.
- An observation is an atomic derived claim plus a proposed durable interpretation, not private chain of thought, transcript, arbitrary tool output, or a summary replacement.
- Review authorization and policy basis are structural gates, not proof of truth; recovered content remains untrusted data and sensitive actions remain enforced outside the model.
- The existing memory kind, outcome, topic, validity, supersession, retraction, FTS, and continuation contracts remain the final durable-memory authority.
- Quantitative outcome gates use isolated projects, identical final memory corpora, identical recall queries/budgets, and literal operation/call accounting.

## Dependencies

- Current SQLite ledger, ordered session events, immutable evidence, temporal memories, summary projection/rebuild pattern, verified migration backup, privacy filtering, exact six MCP tools, continuation selector, three native adapters, and committed offline benchmark/report infrastructure.
- Canonical promotion practice in the bundled thoth-mem skills and the accepted program boundary from `establish-ordered-session-summaries`.
- No external model, network service, vector store, graph store, daemon, or additional MCP tool.

## Out of scope

- Automatic extraction, compression, reflection, consolidation, or promotion by an LLM or heuristic.
- Capturing full transcripts, arbitrary tool streams, assistant reasoning, delegated-agent output, filesystem contents, or private chain of thought.
- Adding a seventh MCP tool, AgentMemory daemon/proxy/JSON fallback, Engram-style mutable observation upserts, graph/entity memory, vectors, embeddings, or reranking.
- Indexing observation candidates in normal memory FTS or injecting them into recall, context, briefing, or native recovery before promotion.
- Physical retention sweeps, source-to-derived deletion cascade, tombstones, legal-hold policy, and full revocation propagation; these remain in `enforce-memory-governance-and-retrieval-gates`.
- Inferred migration/backfill from legacy observations, existing evidence, session summaries, handoff memories, or promoted memories.
- Changing the active lexical query strategy, LongMemEval reports, retrieval default, or unrelated dirty benchmark/runtime work.
- Backward-compatible aliases, remote/cloud storage, dashboard, HTTP API, or a general policy engine.
