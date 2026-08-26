# Feature Specification: Restore V2 memory Skill semantic boundaries

**Change ID**: `restore-v2-memory-skill-boundaries`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The V2 cutover reduced the distributed memory Skill to a six-line reminder and removed the explicit rule that root agents persist a durable handoff when meaningful work reaches a semantic boundary. A completed architectural review therefore remained only in transient conversation state until the user explicitly requested a save.<br>
**Impact**: OpenCode, Codex, and Claude Code agents retain the exact six-tool V2 surface but regain a concise, privacy-safe recipe for bounded recall, root-owned identity, durable `mem_save` handoffs, lifecycle truth, and confirmed reporting. The Skill body becomes one synchronized contract instead of four behaviorally unprotected copies.<br>
**Affected capabilities**: `harness-integration`, `packaging`

## User stories

### US1 - Resume prior project work boundedly (Priority: P1)

As a coding agent starting or resuming project work, I can recover the smallest useful durable context before expanding selected records so that prior decisions reduce repeated explanation without flooding the context window.

**Independent test**: The packaged Skill instructs `mem_recall(mode="compact")`, then `mode="context"`, then `mem_get` only for selected IDs, and distinguishes missing evidence from inference.

**Covers**: FR-001, FR-003, SC-002

**Acceptance scenarios**:

1. **Given** a request that may overlap prior project work, **When** the Skill is followed, **Then** recall begins compactly, expands only strong candidates, and fetches full content only when needed.
2. **Given** recall returns missing, stale, contradictory, or insufficient evidence, **When** the agent answers, **Then** it reports that limitation rather than inventing continuity.

### US2 - Persist a durable semantic boundary proactively (Priority: P1)

As a root coding agent that has completed meaningful work, I can recognize a reusable semantic boundary and save one concise project handoff before responding so that the next session receives the real state without requiring the user to ask for persistence explicitly.

**Independent test**: A regression test fails against the current terse Skill and passes only when the distributed Skill requires a pre-final boundary decision, identifies durable save categories, maps the handoff to current V2 `mem_save`, and requires confirmed persistence before reporting success.

**Covers**: FR-002, FR-003, FR-005, FR-006, FR-007, SC-001, SC-002, SC-005

**Acceptance scenarios**:

1. **Given** a root agent has completed an architectural decision, verified root cause, reusable convention, completed change, or continuation-critical state review, **When** the work reaches a useful semantic boundary, **Then** it saves one concise handoff containing goal, decisions, discoveries, completed work, next steps, and relevant files before the final response.
2. **Given** a turn contains only transient status, speculation, raw logs, generated prompts, or facts already fully represented by canonical artifacts, **When** the boundary decision is made, **Then** the Skill does not create noisy memory.
3. **Given** native lifecycle handling already confirmed the same semantic event, **When** the agent considers a manual save, **Then** it avoids duplicate persistence or uses a stable event identity so the write is idempotent.
4. **Given** session identity is verified, **When** a root-owned handoff is saved, **Then** the exact `root_session_key` and matching `harness` are supplied together; if identity is unavailable or delegated, no identity or lifecycle ownership is invented.
5. **Given** `mem_save` fails or remains indeterminate, **When** the agent reports the result, **Then** it states that memory was not confirmed and does not claim durable persistence.

### US3 - Ship one behaviorally consistent Skill (Priority: P1)

As a maintainer, I can update one canonical V2 memory recipe and deterministically synchronize it into every native host bundle so that OpenCode, Codex, and Claude Code cannot silently regress to different persistence behavior.

**Independent test**: The integration synchronization command converges all distributed `SKILL.md` copies to the canonical body, preserves host references, is idempotent, and package verification rejects stale or behaviorally incomplete copies.

**Covers**: FR-004, FR-005, FR-006, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** the canonical Skill changes, **When** integration assets are synchronized, **Then** the OpenCode, Codex, and Claude Code Skill bodies are byte-identical to the canonical body, every integration retains its own host reference, and the shared public Codex/Claude plugin retains byte-identical Codex and Claude references.
2. **Given** a distributed Skill omits semantic-boundary persistence, confirmation, identity ownership, or the progressive recall funnel, **When** package verification runs, **Then** it fails with a bounded contract error.
3. **Given** synchronization has already converged every Skill, **When** it runs again, **Then** it produces no content drift.

## Edge cases

- A durable decision may be saved without ending or finalizing the root session; `mem_session(finalize)` remains reserved for a real lifecycle event.
- A verified project with unavailable session identity may receive an explicitly project-scoped durable save without fabricated session attribution; the result must be reported as unattributed.
- Delegated agents may perform only explicitly authorized bounded reads or observations and never own root lifecycle, user intent, or root handoffs.
- Repeated saves for one evolving topic use a stable `topic_key`; a stable `event_key` prevents duplicate delivery of the same semantic event.
- Private blocks, secrets, full transcripts, unfiltered logs, assistant/tool traffic, and generated prompts are excluded from memory content.

## Functional requirements

- **FR-001 — Shared Skills MUST Route to One Host-Specific Lifecycle Contract**: `[MODIFIED harness-integration]` Packaged OpenCode, Codex, and Claude Skills MUST retain their distinct verified identity procedures, root/delegated ownership boundaries, and rejected identity substitutes; session-attributed V2 writes MUST pass the exact `root_session_key` together with its matching `harness`, and canonical and distributed Skill bodies and host references MUST remain synchronized.
- **FR-002 — Memory Skills MUST Persist Durable Semantic Boundaries**: `[ADDED harness-integration]` Before meaningful root work ends, the Skill MUST require one explicit boundary decision and MUST persist one concise `mem_save` handoff using `evidence.kind="handoff"` and `memory.kind="handoff"` when future sessions benefit from the completed goal, durable decisions, verified discoveries or failures, completed work, next steps, and relevant files, without waiting for an explicit user save request or a terminal hook.
- **FR-003 — V2 Tool Vocabulary MUST Remain Exact**: `[INTERNAL]` The recipe MUST describe only the current six V2 tools and their current contracts; semantic-boundary persistence MUST use `mem_save`, while `mem_session` MUST remain limited to the declared lifecycle operations.
- **FR-004 — Synchronize reference assets**: `[MODIFIED packaging]` The explicit integration synchronization command MUST copy the canonical Skill body into all three harness Skill roots, preserve the OpenCode reference in its native integration, copy the canonical Codex and Claude references into the shared public Codex/Claude plugin Skill, and leave every destination byte-stable on repeated execution.
- **FR-005 — Distributed Skill Behavior MUST Be Regression-Tested**: `[INTERNAL]` Focused tests MUST independently assert the progressive recall funnel, semantic-boundary trigger, durable/noise distinction, privacy exclusions, identity pairing, confirmation rule, final-response disclosure, and equality of every distributed Skill body.
- **FR-006 — Retired Product Surfaces MUST Stay Absent**: `[INTERNAL]` The restored recipe MUST NOT reintroduce retired navigation, administration, retrieval, transport, or compatibility workflows from the pre-V2 Skill.
- **FR-007 — Persistence Claims MUST Be Evidence-Backed**: `[INTERNAL]` Final responses MUST identify confirmed saved or recalled records and the project/session bounds used, or state plainly that persistence was unavailable, degraded, unattributed, or not confirmed.

The added FR-002 does not overlap the existing lifecycle-confirmation requirements: those govern hook/runtime state transitions after an operation is selected, while FR-002 adds the missing model-facing decision to recognize a completed semantic boundary and select one durable V2 handoff before the final response.

## Success criteria

- **SC-001** `[buildable]`: A focused RED test against the current Skill fails before implementation because the semantic-boundary persistence contract is absent.
- **SC-002** `[buildable]`: Every shipped Skill contains the progressive recall funnel, pre-final semantic-boundary decision, durable handoff fields, privacy exclusions, verified identity pairing, confirmed-save rule, and current V2 tool vocabulary.
- **SC-003** `[buildable]`: `integration:sync` deterministically produces byte-identical canonical Skill bodies for all four destinations—OpenCode, Codex, Claude Code, and the shared public plugin—without removing host references; an immediate second run leaves no diff.
- **SC-004** `[buildable]`: Focused integration/package tests, build, inventory verification, packed smoke, full tests, and diff hygiene pass without expanding the MCP surface or package dependencies.
- **SC-005** `[outcome]`: After the updated Skill is installed and the host is restarted, one fresh root task that completes a continuation-critical review persists one confirmed durable handoff before its final answer without the user explicitly requesting a save; until a real-host run is authorized, this remains an explicit residual risk rather than a fabricated PASS.

## Assumptions

- The current `plugin/skills/thoth-mem/SKILL.md` is the shared public Skill source and can become the canonical instruction body for all three harness copies.
- Host identity references remain separate and are loaded progressively only for the active harness.
- Static contract tests are appropriate for buildable instruction invariants; model compliance requires a separate real-host outcome check.

## Dependencies

- Existing six V2 MCP tools and host identity references.
- Existing integration synchronization, inventory verification, packed smoke, and native setup paths.

## Out of scope

- Restoring the pre-V2 Skill wholesale.
- Adding or changing MCP tools, SQLite schema, lifecycle operations, retrieval lanes, package dependencies, setup scope, or host identity algorithms.
- Installing the updated Skill into real host homes, restarting hosts, publishing npm, or claiming SC-005 without separate authorization and observed evidence.
- Reintroducing any retired product surface or backward-compatibility shim.
