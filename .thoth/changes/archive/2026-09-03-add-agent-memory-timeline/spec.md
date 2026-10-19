# Feature Specification: Agent Memory Timeline

**Change ID**: `add-agent-memory-timeline`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Agents can search for relevant memories and expand one known lineage, but they cannot browse how promoted project memory evolved over time without first knowing a query or record ID.<br>
**Impact**: Add a bounded, read-only promoted-memory timeline to `mem_project` while preserving the exact six-tool MCP surface, progressive disclosure, project isolation, and existing recall/context behavior. Update the canonical and packaged `thoth-mem` Skills so agents know when and how to use the new timeline.<br>
**Affected capabilities**: `tools`, `retrieval`, `harness-integration`, `packaging`

## User stories

### US1 - Browse project memory chronologically (Priority: P1)

As a coding agent, I can list promoted memories in deterministic reverse-validity order so that I can understand how project knowledge changed without inventing a lexical query.

**Independent test**: Populate two projects with current, superseded, retracted, and imported historical memories, request one project's timeline, and verify deterministic project-isolated ordering and status coverage.

**Covers**: FR-001, FR-002, FR-004, FR-007, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a project containing promoted memories in every supported temporal status, **When** an agent requests `mem_project` with `action=timeline`, **Then** it receives compact entries ordered by `validFrom` descending and `id` ascending for equal timestamps.
2. **Given** memories belonging to another project, **When** the timeline is requested with one exact verified `project_key`, **Then** no foreign title, snippet, identifier, or temporal metadata is returned.
3. **Given** an unknown project key, invalid time bound, malformed cursor, or incompatible cursor boundary, **When** the timeline is requested, **Then** the service returns an empty result for the unknown project or a bounded safe validation error for invalid input without writes.

### US2 - Traverse a large timeline progressively (Priority: P1)

As a coding agent, I can page backward through bounded compact entries and expand only selected IDs so that chronological exploration stays within context and privacy limits.

**Independent test**: Request a timeline whose rows exceed both the item limit and character budget, follow returned cursors, and verify complete duplicate-free traversal followed by `mem_get` expansion of one selected memory.

**Covers**: FR-002, FR-003, FR-004, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** more eligible memories than fit in one response, **When** the agent follows `nextCursor`, **Then** each eligible memory appears once in the same total order and the response truthfully reports whether more entries remain.
2. **Given** optional inclusive `since` and `until` bounds, **When** the agent requests the timeline, **Then** only promoted memories whose `validFrom` falls inside the valid range are eligible.
3. **Given** a compact timeline entry, **When** the agent needs provenance or full content, **Then** it uses the stable memory ID with `mem_get`; the timeline itself exposes no evidence IDs, raw support payloads, summaries, observations, or session events.

### US3 - Teach every packaged agent to use the timeline (Priority: P1)

As a plugin user, I receive the same concise timeline guidance in every supported host so that Codex, OpenCode, and Claude Code agents can discover chronological exploration without losing the existing recall/save/handoff workflow.

**Independent test**: Validate the canonical Skill and every packaged host copy, then run package verification to confirm semantic parity and the unchanged six-tool inventory.

**Covers**: FR-005, FR-006, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** the canonical `thoth-mem` Skill, **When** an agent needs chronological project context rather than relevance-ranked recall, **Then** the guidance directs it to bounded `mem_project action=timeline` exploration and subsequent `mem_get` expansion of selected IDs.
2. **Given** the OpenCode, Codex, and Claude Code plugin bundles, **When** packaging verification compares their Skills, **Then** all copies contain equivalent timeline guidance and retain the established identity, privacy, save, and handoff rules.
3. **Given** the timeline action is added, **When** MCP and packed integration tests enumerate tools, **Then** the server still exposes exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.

### US4 - Preserve bounded observation inspection (Priority: P1)

As a coding agent, I retain the existing bounded observation inspection and explicit expansion behavior while timeline browsing is added to `mem_project`.

**Independent test**: Run the existing observation inspection and retrieval suites alongside the timeline tests.

**Covers**: FR-001, FR-007, SC-005

**Acceptance scenarios**:

1. **Given** pending, accepted, rejected, and promoted observations, **When** `mem_project` requests observations with project/session/status bounds, **Then** it returns a deterministic capped queue with stable IDs, compact metadata, and no raw support payloads.
2. **Given** one selected observation ID, **When** `mem_get` expands it, **Then** it returns only that candidate, generator, scope, supports, immutable review lineage, promotion mapping, and related temporal memory IDs.
3. **Given** any unpromoted observation, **When** compact recall, context, briefing, or native recovery runs, **Then** the observation is absent and existing memory/summary ordering, payload budget, trust boundary, and FTS rows remain unchanged.
4. **Given** candidate similarity or related-memory surfacing during explicit review, **When** lexical scoring runs, **Then** the bounded scores are advisory diagnostics only and cannot accept, reject, supersede, or promote any record.

### US5 - Preserve intentional project-wide recovery (Priority: P1)

As a coding agent, I retain deterministic project-wide recovery and explicit context behavior while timeline retrieval is added as a separate path.

**Independent test**: Run existing lifecycle, context, and briefing tests alongside the timeline tests.

**Covers**: FR-002, FR-007, SC-005

**Acceptance scenarios**:

1. **Given** no eligible same-session summary and a useful current project handoff, **When** ordinary start/resume `recover` runs, **Then** the existing project-wide deterministic fallback remains eligible.
2. **Given** the same project state, **When** `mem_context` or project briefing runs explicitly, **Then** current promoted memories remain available with the existing stable IDs, privacy boundary, and budget behavior.

### US6 - Preserve semantic-boundary memory cadence (Priority: P1)

As a plugin user, I retain the established recall, save, handoff, identity, privacy, confirmation, and observation-review guidance alongside the new timeline workflow.

**Independent test**: Run the existing canonical and packaged Skill semantic assertions together with the timeline guidance assertions.

**Covers**: FR-005, FR-007, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** prior project work may affect a task, **When** the agent selects workflows from the Skill description and common path, **Then** it is prompted to start with bounded compact recall and expand only selected evidence.
2. **Given** a verified reusable decision, root cause, discovery, convention, or completed change, **When** the agent reaches that semantic boundary, **Then** the common path directs a deliberate confirmed `mem_save` without requiring the user to say “remember this”.
3. **Given** meaningful work ends with continuation-critical state, **When** the agent prepares its final response, **Then** it saves one concise handoff with the established actionable fields if future work benefits.
4. **Given** work is transient, speculative, already canonical, private, delegated, or explicitly excluded by the user, **When** the agent evaluates persistence, **Then** it does not create a promoted memory or invent attribution.
5. **Given** a reusable claim lacks direct authority, **When** policy review is actually needed, **Then** the Skill loads the conditional observation-review reference and preserves candidate, review, and promotion requirements without burdening ordinary recall or direct authorized saves.

### US7 - Preserve disposable packed verification (Priority: P1)

As a maintainer, I retain the full disposable packed verification workflow while adding cross-host timeline guidance assertions.

**Independent test**: Run integration verification and packed smoke against disposable homes for every supported host.

**Covers**: FR-006, FR-007, SC-005

**Acceptance scenarios**:

1. **Given** a freshly built tarball and disposable homes, **When** integration smoke runs, **Then** OpenCode, Codex, and Claude inventories and lifecycle fixtures pass with exactly six MCP tools.

## Edge cases

- Multiple memories can share the same `validFrom`; the stable ID tie-breaker must produce a total order across pages.
- Imported historical memories may be backdated relative to ingestion and must be placed by semantic `validFrom`, not insertion order.
- Superseded, retracted, and historical rows remain inspectable; the default timeline does not silently collapse them into current-only results.
- A memory title or content can exceed one timeline entry's display allowance; compact rendering must clip safely without splitting Unicode code points or leaking filtered private content.
- A time range with `since` later than `until`, a cursor that is not the service's supported opaque format, or unsupported timeline-only input must fail safely.
- Concurrent backdated inserts can appear in a later fresh traversal; cursors describe a live deterministic keyset traversal and do not claim snapshot isolation.

## Functional requirements

- **FR-001 — mem_project MUST Keep Project Operations Bounded**: `[MODIFIED tools]` `mem_project` MUST retain bounded observation inspection with verified project/session/status/current-history filters, non-branching correction lineage, and a total stable queue order without becoming a mutation, consolidation, or automatic-promotion surface; MUST add a read-only `timeline` action requiring the exact verified `project_key`; MUST keep the exact six-tool registry unchanged; and MUST return only promoted memories from that project in timeline results.
- **FR-002 — Progressive Retrieval MUST Use Stable IDs and Bounded Escalation**: `[MODIFIED retrieval]` Ordinary start/resume recovery, `mem_context`, and project briefing MUST retain deterministic project-memory eligibility, progressive stable IDs, privacy rules, and host caps. Timeline retrieval MUST use deterministic keyset order by `validFrom` descending then `id` ascending, MUST include current, superseded, retracted, and historical promoted memories by default, MUST support optional inclusive `since`/`until` validity bounds plus an opaque continuation cursor, and MUST enforce item and character budgets with truthful continuation metadata.
- **FR-003 — Compact timeline disclosure**: `[INTERNAL]` Each timeline item MUST expose only a safely bounded title/snippet and the memory's stable ID, kind, topic key, outcome, status, validity interval, and predecessor ID; full content and provenance MUST remain behind explicit `mem_get` expansion.
- **FR-004 — Timeline validation and isolation**: `[INTERNAL]` Timeline input parsing and service queries MUST reject malformed bounds/cursors without mutation, return an empty bounded result for an unknown project, and prevent cross-project data from influencing items or continuation.
- **FR-005 — Shared Skills MUST Preserve Semantic-Boundary Memory Practice**: `[MODIFIED harness-integration]` The shared Skill MUST front-load recall, save, and handoff applicability in its discovery description; MUST provide a concise default cadence for pre-action recall, durable in-task saves, and pre-final continuation handoffs; and MUST preserve verified identity, privacy, confirmation, root ownership, noise exclusion, and exact-key requirements. The canonical shared Skill and every supported host/plugin copy MUST also add concise routing for chronological exploration using `mem_project action=timeline` followed by selective `mem_get` without displacing those practices.
- **FR-006 — Packed Verification MUST Exercise Every Host in Disposable State**: `[MODIFIED packaging]` Release verification MUST continue to import the native OpenCode entry, execute the CLI, validate public/local setup planning, synchronize Skills, cold-start MCP, and execute lifecycle runners for all three hosts without reading or mutating real user homes. It MUST also assert equivalent timeline guidance across OpenCode, Codex, and Claude Code Skills while continuing to prove an exact six-tool MCP inventory in disposable state.
- **FR-007 — Existing retrieval behavior remains stable**: `[INTERNAL]` The timeline MUST NOT change `mem_recall` ranking, FTS membership, `mem_context`, project briefing, lifecycle recovery, observation queues, summary selection, persistence semantics, or automatic capture.

## Success criteria

- **SC-001** `[buildable]`: Focused core tests prove exact project isolation and the expected total order for all 6 fixture categories: current, superseded, retracted, historical, tied-timestamp, and backdated imported memories.
- **SC-002** `[buildable]`: Focused pagination tests traverse every eligible fixture memory exactly once across limit- and budget-truncated pages, with valid `nextCursor`/continuation metadata and no out-of-range rows.
- **SC-003** `[buildable]`: MCP tests prove timeline responses contain zero evidence IDs, raw supports, summaries, observations, or session events, and prove a returned ID expands through the existing `mem_get` path.
- **SC-004** `[buildable]`: Skill and integration tests prove the canonical, OpenCode, Codex, and Claude Code instructions all teach the bounded timeline-to-`mem_get` workflow and preserve existing safety/identity cadence.
- **SC-005** `[buildable]`: Build, relevant focused suites, full tests, integration/package verification, and the SDD validator pass while `ALL_TOOLS` remains length six.

## Assumptions

- The user accepted the promoted-memory-only timeline recommended during analysis and explicitly added plugin Skill guidance to scope.
- `validFrom` is the semantic time for both native and imported memories; `createdAt` and ingestion order are not the primary timeline axis.
- The first implementation may query the authoritative `memories` table directly; a new table, projection, or schema index is justified only by measured query evidence.
- Timeline output follows the existing public convention of snake_case input fields and camelCase structured record fields.

## Dependencies

- Existing authoritative `memories` temporal fields and project identity resolution.
- Existing `mem_get` memory expansion and privacy sanitization behavior.
- Canonical integration inventory and packed Skill verification for OpenCode, Codex, and Claude Code.

## Out of scope

- A raw evidence, root-prompt, tool-call, lifecycle, or session-event activity log.
- Mixing session summaries or observation candidates/reviews into the promoted-memory timeline.
- A seventh MCP tool, CLI timeline command, HTTP route, dashboard, graph/vector projection, model call, or network dependency.
- Snapshot-isolated traversal across concurrent backdated writes.
- Schema/index changes without a demonstrated performance need.
