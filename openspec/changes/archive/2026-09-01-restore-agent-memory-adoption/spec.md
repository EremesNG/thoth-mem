# Feature Specification: Restore agent memory adoption

**Change ID**: `restore-agent-memory-adoption`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Agents now invoke thoth-mem much less often than the legacy product, so durable decisions, verified failures, discoveries, and continuation handoffs are frequently lost even though persistence and recovery remain functional.<br>
**Impact**: The shared MCP discovery metadata and packaged Skill will make bounded recall and deliberate durable persistence salient at the moments where they add value, while preserving the exact six-tool surface, verified identity, privacy filtering, explicit observation review, and noise controls.<br>
**Affected capabilities**: `tools`, `harness-integration`

## User stories

### US1 - Discover the right memory operation (Priority: P1)

As a coding agent, I can distinguish recall, save, context, inspection, project, and lifecycle operations from the MCP discovery surface so that I select thoth-mem without requiring prior knowledge of its implementation.

**Independent test**: Start the MCP server through the public SDK seam, list its tools and server instructions, and verify six distinct action-oriented descriptions plus balanced recall/save/handoff guidance.

**Covers**: FR-001, FR-003, SC-001

**Acceptance scenarios**:

1. **Given** the MCP server is started, **When** a client inspects server instructions, **Then** it sees bounded progressive recall and deliberate durable save/handoff guidance rather than a recall-only funnel.
2. **Given** the exact six tools are listed, **When** a client compares their descriptions, **Then** each description names its distinct workflow purpose and `mem_save` explicitly covers durable decisions, discoveries, failures, conventions, and handoffs.
3. **Given** the discovery metadata changes, **When** existing MCP contract tests run, **Then** the tool names, input schemas, outputs, and persistence behavior remain unchanged.

### US2 - Recall and preserve meaningful project state (Priority: P1)

As a root coding agent, I can load one concise memory recipe that prompts recall before prior context matters and prompts a confirmed save at durable semantic boundaries so that future sessions receive useful continuity without accumulating transient noise.

**Independent test**: Read the installed Skill as a host would and verify its frontmatter and default cadence cover pre-action recall, in-task durable saves, and pre-final continuation handoffs, while conditional observation review, identity, privacy, and confirmation safeguards remain intact.

**Covers**: FR-002, FR-004, FR-005, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** prior project work may affect a task, **When** the agent selects workflows from the Skill description and common path, **Then** it is prompted to start with bounded compact recall and expand only selected evidence.
2. **Given** a verified reusable decision, root cause, discovery, convention, or completed change, **When** the agent reaches that semantic boundary, **Then** the common path directs a deliberate confirmed `mem_save` without requiring the user to say “remember this”.
3. **Given** meaningful work ends with continuation-critical state, **When** the agent prepares its final response, **Then** it saves one concise handoff with the established actionable fields if future work benefits.
4. **Given** work is transient, speculative, already canonical, private, delegated, or explicitly excluded by the user, **When** the agent evaluates persistence, **Then** it does not create a promoted memory or invent attribution.
5. **Given** a reusable claim lacks direct authority, **When** policy review is actually needed, **Then** the Skill loads the conditional observation-review reference and preserves candidate, review, and promotion requirements without burdening ordinary recall or direct authorized saves.

### US3 - Detect adoption regressions before release (Priority: P2)

As a maintainer, I can verify discovery metadata and shared Skill behavior through stable public seams so that packaging-only success cannot conceal another drop in agent memory use.

**Independent test**: Run focused tests that inspect MCP list-tools metadata, server instructions, canonical/distributed Skill equality, positive/negative workflow triggers, and conditional-reference routing.

**Covers**: FR-005, FR-006, SC-001, SC-002, SC-003, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** a tool description becomes generic or recall-only, **When** focused MCP tests run, **Then** they fail on the public discovery contract.
2. **Given** the Skill loses an early recall/save/handoff trigger or its noise boundary, **When** focused package tests run, **Then** they fail independently of file-presence and byte-equality checks.
3. **Given** the canonical Skill is synchronized, **When** package verification runs, **Then** all shipped bodies remain byte-identical and every host-specific identity reference remains correctly owned.
4. **Given** a controlled real-host evaluation is authorized later, **When** positive and negative adoption prompts run, **Then** actual skill/tool selection is reported as observed evidence rather than inferred from static wording.

## Edge cases

- The new cues must not turn every response, file edit, successful command, or already-documented fact into a memory.
- Explicit user instructions not to persist information override proactive save cues.
- A project-only durable save may proceed without fabricated session attribution; lifecycle and root handoffs still require verified root ownership.
- A failed or indeterminate write remains eligible for bounded recovery but must not be reported as persisted.
- Advanced observation review remains available for uncertain reusable claims but must not become the default path for user-authorized decisions or directly verified outcomes.
- Server and tool descriptions must remain concise enough for clients that truncate discovery metadata; recall and save cues therefore appear early.

## Functional requirements

- **FR-001 — MCP Surface MUST Be Compact and Workflow-Level**: `[MODIFIED tools]` The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`, MUST publish concise server instructions that balance progressive recall with deliberate durable save/handoff behavior, and MUST publish a distinct action-oriented description for each tool without changing its schema or runtime semantics.
- **FR-002 — Shared Skills MUST Preserve Semantic-Boundary Memory Practice**: `[MODIFIED harness-integration]` The shared Skill MUST front-load recall, save, and handoff applicability in its discovery description; MUST provide a concise default cadence for pre-action recall, durable in-task saves, and pre-final continuation handoffs; and MUST preserve verified identity, privacy, confirmation, root ownership, noise exclusion, and exact-key requirements.
- **FR-003 — MCP Discovery MUST Make Durable Writes Salient**: `[INTERNAL]` Server and `mem_save` discovery metadata MUST explicitly name durable decisions, discoveries, failures, conventions, and continuation handoffs, while recall metadata MUST retain the compact-to-context-to-selected-get funnel and lifecycle metadata MUST remain restricted to verified root events.
- **FR-004 — Advanced Observation Review MUST Be Conditional**: `[INTERNAL]` The complete uncertain-claim candidate/review/promotion policy MUST move behind a Skill reference that is loaded only when a reusable claim lacks direct authority; the default Skill path MUST still state when direct evidence-plus-memory promotion is valid and MUST NOT weaken any support, review, promotion, identity, or trust boundary.
- **FR-005 — Shared Skill Distribution MUST Stay Deterministic**: `[INTERNAL]` `plugin/skills/thoth-mem/SKILL.md` MUST remain the canonical body, synchronization MUST produce byte-identical OpenCode, Codex, and Claude Code copies, and every conditional or identity reference MUST appear in the package locations needed by each host without introducing stale copies.
- **FR-006 — Adoption Contracts MUST Be Tested at Public Seams**: `[INTERNAL]` Focused tests MUST inspect MCP initialization/list-tools metadata and installed Skill files through public outputs, MUST cover positive recall/save/handoff cues and negative noise/privacy/delegation cases, and MUST fail when packaging remains intact but discovery behavior regresses.

## Success criteria

- **SC-001** `[buildable]`: Public MCP inspection returns exactly `6/6` tools with `6/6` distinct non-generic purpose descriptions; server instructions contain both bounded-recall and durable-save/handoff guidance; all existing tool schema and behavior assertions pass.
- **SC-002** `[buildable]`: All `4/4` shipped Skill bodies are byte-identical; each discovery description includes recall, save, and handoff applicability before exclusions; each common path contains independently asserted recall, durable-save, handoff, noise, identity, privacy, and confirmed-result rules.
- **SC-003** `[buildable]`: All `3/3` host bundles package a reachable conditional observation-review reference, and the canonical `SKILL.md` entrypoint is shorter in characters than its pre-change baseline while retaining every asserted common-path invariant.
- **SC-004** `[buildable]`: Every required focused Vitest, build, full-test, integration verification/smoke, benchmark fixture, prepublish, and diff-hygiene command exits `0`; the tool count remains `6`, and schema, dependency, and host-home diffs remain `0`.
- **SC-005** `[outcome]`: In a later authorized fresh-host behavioral evaluation, `3/3` positive resume/durable-save/continuation-handoff cases select the appropriate thoth-mem workflow and `2/2` transient/no-persist controls create zero durable writes; until observed, this remains an explicit residual risk.

## Assumptions

- The observed drop is caused primarily by model-facing discovery and workflow friction, because current persistence, recovery, packed delivery, and Skill synchronization already pass their existing contracts.
- Hosts may truncate Skill or MCP descriptions, so decisive recall/save/handoff terms must appear early.
- Static tests can prove shipped discovery contracts but cannot prove model compliance; real-host outcome evidence remains separate.

## Dependencies

- Existing six-tool MCP server, `MemoryService`, host identity references, distribution synchronization, packed verification, and observation-review policy.
- Installed local `tdd`, `simplify`, `thoth-sdd`, `plan-reviewer`, and `thoth-archive` contracts.

## Out of scope

- Adding MCP tools, changing tool schemas, SQLite schema, retrieval ranking, lifecycle event semantics, privacy filtering, or observation authority policy.
- Automatic saving after every turn or tool call, passive transcript capture, or persistence of assistant/subagent reasoning.
- Installing into real host homes, restarting hosts, publishing a release, or claiming model-consumption success without separate authorization and observed evidence.
- Restoring legacy administration, graph, HTTP, dashboard, embedding, or compatibility surfaces.
