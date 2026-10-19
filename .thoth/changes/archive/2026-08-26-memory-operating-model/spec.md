# Feature Specification: Memory operating model

**Change ID**: `memory-operating-model`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: thoth-mem already persists evidence and promoted memory, but automatic recovery currently behaves like a metadata-heavy generic listing. A real OpenCode restart proved the hook executed and used the canonical database while failing to expose the hidden pending action. The product needs one explicit operating model for what is captured, what is promoted, and what is injected so persistent memory actually reduces re-explanation and context cost.<br>
**Impact**: Define and implement a two-layer capture/promotion policy, a deterministic project continuation capsule shared by OpenCode, Codex, Claude Code, `mem_context`, and `mem_project briefing`, content-first bounded rendering, progressive source lookup, and security/evaluation regressions. The exact six-tool MCP surface, current taxonomy, SQLite schema authority, and lexical-first baseline remain unchanged.<br>
**Affected capabilities**: `store`, `retrieval`, `harness-integration`, `tools`, `evals`

## User stories

### US1 - Preserve evidence without promoting noise (Priority: P1)

As a coding-agent user, I can rely on thoth-mem to preserve verified root interactions and durable lessons without recording every tool or delegated stream as future guidance.

**Independent test**: Drive root, delegated, private, tool-like, retry, checkpoint, and explicit-save lifecycle fixtures against a disposable SQLite database and inspect evidence, memory, relationship, receipt, and FTS rows.

**Covers**: FR-001, FR-002, FR-003, FR-004, FR-010, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a verified root user prompt, **When** a native capture hook runs, **Then** one idempotent privacy-filtered evidence record is committed and no promoted memory is invented.
2. **Given** an explicit durable decision, corrected failure, convention, project structure fact, preference, or handoff with supporting evidence, **When** the root agent saves at a semantic boundary, **Then** one typed memory is linked to evidence and its current/history semantics remain explicit.
3. **Given** assistant traffic, arbitrary tool input/output, delegated-agent output, a private block, or an unverifiable caller, **When** native capture is considered, **Then** it is excluded or fails closed without being presented as verified root memory.
4. **Given** a bounded host-provided pre-compaction continuation payload, **When** checkpoint capture runs, **Then** immutable checkpoint evidence and at most one source-linked current session handoff are committed without invoking an additional model.

### US2 - Resume from actionable context (Priority: P1)

As a coding agent resuming a project or recovering from compaction, I can receive the current objective and first pending action automatically so that I can continue without asking the user to repeat them.

**Independent test**: Seed a hidden handoff plus competing decisions, conventions, failures, and project-structure memories, run lifecycle recovery for all three hosts under the 1,000-code-point cap, and assert the hidden actionable markers and progressive memory references in the rendered block.

**Covers**: FR-005, FR-006, FR-007, FR-010, SC-003, SC-004, SC-007

**Acceptance scenarios**:

1. **Given** a current handoff containing an objective, completed work, first pending action, blockers, archive path, and key checks, **When** session-start or post-compaction recovery runs, **Then** the newest current handoff is considered before generic project guidance and the hidden pending action survives rendering.
2. **Given** more candidate memories than fit the host cap, **When** the continuation capsule is assembled, **Then** it selects fewer useful items instead of allocating trivial fragments across every candidate.
3. **Given** a selected memory with provenance, **When** host-visible context renders, **Then** it contains a complete memory ID for `mem_get`, omits evidence IDs, identifies the content as untrusted data, and never truncates fixed metadata into a fabricated reference.
4. **Given** no useful eligible memory or a degraded lifecycle child, **When** recovery runs, **Then** the host prompt continues with verified identity only or no block, bounded diagnostics, and no claim that the model consumed memory.

### US3 - Explore memory progressively (Priority: P1)

As a coding agent, I can start from one bounded project briefing, search compactly, and fetch only selected detail and lineage so that memory exploration costs no more context than the task needs.

**Independent test**: Exercise `mem_context`, `mem_project briefing`, compact/context `mem_recall`, `mem_get`, and history against the same project and character budgets, then prove stable identities, selection parity, attribution, bounds, and cross-project isolation.

**Covers**: FR-005, FR-007, FR-008, FR-009, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** a project with a current handoff and multiple durable memories, **When** `mem_context` and `mem_project action=briefing` run under the same budget, **Then** both use the same deterministic continuation policy and expose compatible stable memory IDs.
2. **Given** a specific coding question, **When** compact recall returns candidate IDs and the agent expands one candidate, **Then** only the selected context/full-record path pays the additional content cost.
3. **Given** similarly named memories in another project or historical superseded guidance, **When** current project retrieval runs, **Then** foreign records remain absent and historical records appear only through explicit history retrieval.

### US4 - Justify complexity with equal-budget outcomes (Priority: P2)

As a maintainer, I can compare the deterministic baseline with optional retrieval or consolidation modules under one fixed budget so that no new architecture is promoted by incomparable fixtures or vendor claims.

**Independent test**: Validate the committed offline benchmark contract and product-specific continuity corpus, including metric labels, equal Top-K/final budget, provenance, injected context, abstention, compaction recovery, and coding outcome fields.

**Covers**: FR-011, FR-012, SC-006, SC-008

**Acceptance scenarios**:

1. **Given** BM25 and an optional dense, hybrid, rerank, entity, graph, or consolidation lane, **When** they are compared, **Then** corpus, query order, Top-K, final token budget, reader/agent, scoring procedure, provenance, and resource envelope are equal or the comparison is rejected.
2. **Given** an improved retrieval metric without recovered actionable fields or coding-task improvement, **When** promotion is assessed, **Then** the optional module remains disabled.
3. **Given** no prepared external dataset, **When** the offline fixture runs, **Then** it validates schema and product regressions without claiming LongMemEval-S, LoCoMo, BEAM/PersonaMem, SDEBench, or Agent Memory Benchmark quality.

## Edge cases

- The newest handoff may be empty after privacy filtering, superseded, retracted, or too large for the remaining host budget; recovery must skip or trim it without emitting a title-only success.
- A short complete memory may be useful even when it is below the normal per-item content floor; the floor applies only when truncating longer source content.
- Unicode surrogate pairs, combining characters, control characters, newlines, and UUID-like text must not bypass code-point caps or corrupt delimiters/references.
- A memory body may contain instruction-like text because coding projects discuss prompt injection; deterministic rendering must mark it as data and preserve meaning rather than claim regex keyword deletion is a complete defense.
- Replayed root prompts, checkpoints, session starts, and post-compaction events must not duplicate evidence, promoted handoffs, or lifecycle receipts.
- A checkpoint from one session may be useful project history but must not supersede a newer explicit project handoff with a different topic identity.
- Branch/worktree/file/commit metadata may help future filtering but must not silently fragment or replace the verified project boundary.
- Current Codex and Claude native hosts expose different hook envelopes; selection and trust semantics must remain host-neutral even when the wrapper format differs.
- Real Claude model consumption cannot be certified in the current environment; packed/native contract evidence must remain distinct from that unavailable outcome.

## Functional requirements

- **FR-001 — Raw Evidence and Promoted Memory MUST Remain Distinct**: `[MODIFIED store]` Automatic lifecycle capture MUST append immutable source-attributed evidence only; promoted memories MUST remain separately typed, linked to supporting evidence, and limited to facts that materially change future coding work. Root prompts MUST NOT become promoted memory merely because they were captured.
- **FR-002 — Automatic Capture MUST Remain Privacy-Safe and Minimal**: `[MODIFIED harness-integration]` Native integrations MAY automatically capture only verified non-synthetic root prompts, bounded pre-compaction checkpoints, authoritative handoff/finalization payloads, and lifecycle receipts. They MUST NOT automatically persist assistant reasoning, arbitrary tool streams or filesystem content, delegated/subagent output, secrets, complete transcripts, or explicit private blocks. Explicit private blocks and deterministically recognizable credential forms MUST be removed or replaced before persisted content and idempotency hashes are derived.
- **FR-003 — Shared Skills MUST Preserve Semantic-Boundary Memory Practice**: `[MODIFIED harness-integration]` The shared Skill MUST define the durable promotion test, the content required for each current memory kind, explicit failure/outcome preservation, topic supersession, privacy exclusions, progressive recall, and a root-owned handoff containing objective, completed work, first pending action, blockers, and key files/checks.
- **FR-004 — Save Paths MUST Use One Explicit Identity Contract**: `[MODIFIED store]` Durable writes and lifecycle receipts MUST scope by verified project identity and, when session-attributed, harness plus verified root-session key; topic keys MUST identify evolving memory lineage. Branch, worktree, file, and commit data MAY be metadata but MUST NOT partition the authoritative project ledger by default.
- **FR-005 — Project Briefing MUST Be Deterministic and Bounded**: `[MODIFIED retrieval]` `mem_context`, `mem_project action=briefing`, and native recovery MUST use one host-neutral continuation policy that prioritizes the newest eligible current handoff, then current relevant decisions/conventions, failed or mixed lessons, and project structure. Selection MUST be deterministic, project-scoped, source-attributed, content-first, and bounded without synthesizing unsupported facts.
- **FR-006 — Model-Visible Recovery Context MUST Be Bounded and Source-Attributed**: `[MODIFIED harness-integration]` Confirmed recovery MUST inject at most one tagged block within the host cap, preserve complete fixed metadata, allocate non-trivial useful content before optional headings/metadata, include only complete selected memory IDs for progressive fetch, omit supporting evidence IDs even when they appear inside selected title/content data, and delimit recovered memory as untrusted data that cannot override current system, developer, or user instructions. A metadata-heavy candidate MUST be omitted when abundant source content exists but the complete metadata would make the 50% useful-content threshold impossible.
- **FR-007 — Progressive Retrieval MUST Use Stable IDs and Bounded Escalation**: `[MODIFIED retrieval]` Briefing and compact recall MUST expose stable memory IDs; context expansion MUST remain bounded; and full content, evidence IDs, and lineage MUST require explicit selection through `mem_get` or history. Raw evidence MUST NOT enter automatic recovery.
- **FR-008 — mem_recall, mem_context, and mem_get MUST Form a Progressive Funnel**: `[MODIFIED tools]` `mem_context` MUST expose the same continuation selection used by native recovery, `mem_recall` MUST remain query-specific and compact-first, and `mem_get` MUST return only the selected full record and provenance without widening the six-tool surface.
- **FR-009 — mem_project MUST Keep Project Operations Bounded**: `[MODIFIED tools]` `mem_project action=briefing` MUST delegate to the shared continuation selector, `history` MUST preserve explicit temporal lineage, and neither action MAY require or expose a graph/vector projection or add another MCP tool.
- **FR-010 — Lifecycle Events MUST Be Idempotent and Truthful**: `[MODIFIED harness-integration]` Stable event keys MUST make capture, checkpoint promotion, start recovery, and post-compaction recovery idempotent across retry/restart. Results MUST report hook execution, memory confirmation, context delivery, and model consumption separately; delivery MUST be false when only identity or an unusable empty capsule is produced.
- **FR-011 — Evals MUST Measure Compaction Recovery and Coding Outcomes**: `[MODIFIED evals]` Product evaluation MUST include hidden actionable handoff fields, restart and post-compaction recovery, correction/history, irrelevant-query abstention, poisoned-memory rendering, project isolation, delegated-write rejection, injected characters/tokens, useful-content ratio, latency, full-fetch avoidance, and coding-task outcomes in addition to retrieval metrics.
- **FR-012 — Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline**: `[MODIFIED evals]` LongMemEval-S, LoCoMo, BEAM/PersonaMem, SDEBench, Agent Memory Benchmark, and any product fixture MUST compare BM25, dense, hybrid, and each additional module with the same dataset/version, query order, candidate Top-K, final context budget, reader/coding agent, scoring procedure, and resource/provenance reporting; incomparable or incomplete evidence MUST NOT promote complexity.

## Success criteria

- **SC-001** `[buildable]`: 100% of automatic-capture tests persist only the declared root lifecycle allowlist, with zero assistant, arbitrary-tool, delegated/subagent, secret, transcript, or private-block rows and zero invented promoted memories.
- **SC-002** `[buildable]`: 100% of replay fixtures for root prompt, checkpoint, start/recover, and post-compaction event keys produce one authoritative state change and truthful duplicate/capability results.
- **SC-003** `[buildable]`: Every OpenCode, Codex, and Claude recovery fixture remains at or below 1,000 Unicode code points, contains complete delimiters and fixed metadata, includes the hidden handoff objective/archive path/first pending action when the seeded handoff fits, exposes complete selected memory IDs, and exposes zero evidence IDs.
- **SC-004** `[buildable]`: When eligible source content is large enough to use the recovery budget, at least 50% of the model-visible recovery payload after the verified-identity line consists of selected memory content, and no selected truncated item receives less than the configured useful-content floor; otherwise the candidate is omitted.
- **SC-005** `[buildable]`: 100% of focused `mem_context`, `mem_project briefing`, native recovery, compact/context recall, `mem_get`, history, project-isolation, current/history, and provenance tests pass through the exact six-tool contract with deterministic results under repeated execution.
- **SC-006** `[buildable]`: The offline benchmark contract reports separate retrieval, answer, coding, budget, provenance, abstention, latency, and resource fields; rejects unequal final budgets or metric relabeling; and makes zero external-quality claim without prepared datasets.
- **SC-007** `[outcome]`: 100% of fresh real-host OpenCode and Codex restart prompts recover a seeded hidden first pending action without an MCP call in the prompt, while hook execution, storage confirmation, context delivery, and observed model consumption are recorded separately. Claude real-model consumption remains explicitly unavailable until access exists.
- **SC-008** `[outcome]`: Zero dense, hybrid, graph, entity, reranking, or LLM-consolidation modules become default until an equal-budget run improves predeclared retrieval and coding-continuity outcomes without violating latency, footprint, privacy, provenance, or deterministic-fallback gates.

## Assumptions

- The canonical memory taxonomy remains `decision`, `convention`, `architecture`, `discovery`, `failure`, `project_structure`, `handoff`, and `preference`; no generic observation or session-summary kind is required.
- A host-provided bounded pre-compaction continuation payload may be promoted as the current session handoff without an extra thoth-mem model call; provenance and topic identity must distinguish it from an explicit project handoff.
- The current 1,000-code-point native host cap is a shared packaging constraint for this change. A later measured change may revise it without changing the progressive-disclosure principle.
- SQLite/FTS5, temporal lineage, and the exact six MCP tools are stable foundations; this change refines selection, rendering, lifecycle truth, Skills, and evaluation rather than replacing the database.
- Backward compatibility for retired behavior is not required, but the current database must remain migration-safe and authoritative.

## Dependencies

- Existing `src/memory-core`, lifecycle adapters, OpenCode Bun-to-Node boundary, Codex/Claude public runner, shared Skills, exact six-tool registry, packed integration verification, and offline benchmark fixture.
- First-party research captured in `report-source.md`; no network service, embedding model, paid Claude execution, or publication is required for buildable criteria.

## Out of scope

- Capturing arbitrary tool traffic, assistant reasoning, subagent streams, full transcripts, repository contents, or ambient credentials.
- Adding a memory kind, MCP tool, HTTP endpoint, dashboard, observatory, graph viewer, sync service, or background daemon.
- Making embeddings, vectors, entities, graph traversal, reranking, query expansion, DLP/classifier services, or an LLM required for save, promotion, recovery, or basic recall.
- Automatic destructive retention, compaction, or expiry of the existing evidence ledger.
- Implementing fuzzy semantic duplicate merging or revision counters before workload evidence justifies them.
- Publishing a package, mutating real host installations during repository verification, or claiming paid Claude model certification.
- Migrating the legacy pre-reset database; that remains a separate one-way importer concern.
