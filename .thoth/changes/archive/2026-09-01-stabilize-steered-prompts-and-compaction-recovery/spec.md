# Feature Specification: Stabilize Steered Prompt Capture and Compaction Recovery

**Change ID**: `stabilize-steered-prompts-and-compaction-recovery`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: A user message submitted while an agent is still working can reuse a turn-scoped native identifier and make the lifecycle hook fail. Separately, recovery after compaction can inject a current project handoff that has no relationship to the compacted conversation.<br>
**Impact**: OpenCode, Codex, and Claude Code capture distinct sanitized user messages without lifecycle-key payload collisions; exact retries remain idempotent. Post-compaction recovery becomes strictly session-scoped and abstains with verified identity only when the compacted session has no eligible summary. Normal start/resume recovery and explicit project context retain project-wide memory fallback.<br>
**Affected capabilities**: `harness-integration`, `retrieval`

## User stories

### US1 - Capture messages submitted during an active agent turn (Priority: P1)

As a user, I can send another message while an OpenCode, Codex, or Claude Code agent is still working without causing the memory hook to fail or losing a distinct instruction.

**Independent test**: Host-shaped adapter and lifecycle fixtures submit two different sanitized prompts under the same root session and, where applicable, the same native turn; both commit once, while an exact retry returns the original result as a duplicate.

**Covers**: FR-001, FR-002, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** two Codex `UserPromptSubmit` payloads with the same `turn_id` and different prompts, **When** both are normalized and captured, **Then** they receive different stable event keys, neither lifecycle call throws, and each produces one ordered root-prompt evidence event.
2. **Given** an official Claude Code `UserPromptSubmit` payload without a synthetic `event_id`, **When** it is normalized, **Then** capture succeeds using only documented native fields and a different sanitized prompt receives a different stable event key.
3. **Given** two OpenCode root-user messages admitted during the same active cycle, **When** the native plugin captures them, **Then** each uses its immutable native message ID and neither is collapsed into the other.
4. **Given** the same sanitized native prompt payload is retried, **When** lifecycle receives it again, **Then** it resolves to the same event key and returns the original receipt as a duplicate without appending evidence.

### US2 - Recover only the compacted conversation (Priority: P1)

As a user, I receive post-compaction memory only when it is attributable to the root session that was compacted, so unrelated project work cannot enter the resumed conversation.

**Independent test**: A project fixture contains an unrelated current handoff and a compacted root session. Post-compaction recovery returns that session's current summary when present and identity only when absent; it never selects the unrelated handoff.

**Covers**: FR-003, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** a compacted root session with a supported current checkpoint summary plus unrelated current project memories, **When** `guide_post_compact` runs, **Then** only the newest eligible summary from that exact project, harness, and root session is eligible for rendering.
2. **Given** a compacted root session with no eligible current summary and one or more current project handoffs from other sessions, **When** `guide_post_compact` runs, **Then** recovery renders verified identity only, returns empty selected record IDs, and reports `contextDelivered=false`.
3. **Given** a summary belonging to another root session or harness, **When** post-compaction recovery runs, **Then** that summary and every project memory remain absent.
4. **Given** a degraded or premature post-compaction event, **When** recovery is evaluated, **Then** existing fail-closed behavior remains unchanged and no memory is injected.

### US3 - Preserve intentional project-wide recovery (Priority: P2)

As a user, I can still resume a normal session or explicitly request project context and receive useful promoted project memory; tightening compaction does not disable the broader memory product.

**Independent test**: The same project handoff excluded from summary-less post-compaction recovery remains eligible through normal `recover`, `mem_context`, and project briefing under their existing deterministic budgets.

**Covers**: FR-004, SC-005

**Acceptance scenarios**:

1. **Given** no eligible same-session summary and a useful current project handoff, **When** ordinary start/resume `recover` runs, **Then** the existing project-wide deterministic fallback remains eligible.
2. **Given** the same project state, **When** `mem_context` or project briefing runs explicitly, **Then** current promoted memories remain available with the existing stable IDs, privacy boundary, and budget behavior.

## Edge cases

- Codex may reuse one `turn_id` for several steered prompts; `turn_id` is context for a key, not sufficient submission identity.
- Claude Code supplies no documented per-submission ID. Its deterministic sanitized-payload fingerprint distinguishes different text and deduplicates an exact repeat, but cannot distinguish an intentional byte-identical repeat from a host retry.
- Privacy filtering MUST run before any content-derived key so credential-only differences do not enter receipts or diagnostics.
- Empty or fully redacted prompts remain ineligible for root-prompt evidence under the existing capture allowlist.
- A valid same-session summary that cannot fit the host cap falls back to truthful identity-only delivery rather than project memory.
- Ordinary recovery after startup/resume is not post-compaction recovery even when the project contains compacted sessions from earlier conversations.

## Functional requirements

- **FR-001 — Lifecycle Events MUST Be Idempotent and Truthful**: `[MODIFIED harness-integration]` Stable capture keys MUST identify distinct sanitized root-user submissions rather than only their enclosing turn. A native immutable message ID MUST be used when available; otherwise a deterministic key MUST include the documented stable session/turn fields and the sanitized prompt fingerprint. Different sanitized prompts in one active turn MUST NOT reuse a lifecycle key, and an exact retry MUST remain idempotent.
- **FR-002 — Runtime Lifecycle MUST Preserve the Core Contract**: `[MODIFIED harness-integration]` OpenCode, Codex, and Claude lifecycle adapters MUST normalize only fields their supported native contracts actually provide, MUST accept Claude Code `UserPromptSubmit` without `event_id`, MUST preserve OpenCode's native per-message identity, and MUST apply shared privacy sanitation before content-derived identity.
- **FR-003 — Project Briefing MUST Be Deterministic and Bounded**: `[MODIFIED retrieval]` `guide_post_compact` MUST select only the newest eligible current summary for the exact verified project, harness, and root session. It MUST NOT fill remaining budget from project memories; when no eligible session summary can be delivered, it MUST abstain with verified identity only and truthful empty selection metadata.
- **FR-004 — Progressive Retrieval MUST Use Stable IDs and Bounded Escalation**: `[MODIFIED retrieval]` The post-compaction session-only selector MUST NOT change ordinary start/resume recovery, `mem_context`, or project briefing: those paths MUST retain their current deterministic project-memory eligibility, progressive stable IDs, privacy rules, and host caps.

## Success criteria

- **SC-001** `[buildable]`: All three adapter fixtures pass: Codex same-turn/different-prompt keys differ, Claude official payloads without `event_id` normalize, OpenCode distinct message IDs remain distinct, and every representable exact retry retains one key.
- **SC-002** `[buildable]`: Lifecycle tests prove two different mid-turn prompts append two ordered root-prompt evidence events without `Lifecycle event key was reused with a different payload`, while an exact retry appends zero additional evidence.
- **SC-003** `[buildable]`: All three OpenCode-, Codex-, and Claude-shaped post-compaction lifecycle fixtures select one same-session summary and select zero foreign summaries or project memories.
- **SC-004** `[buildable]`: One summary-less compacted-session regression fixture containing the reported unrelated-handoff shape returns identity only, zero selected summary/memory/record IDs, and `contextDelivered=false`.
- **SC-005** `[buildable]`: All existing normal recovery, context, continuation, MCP, packaged-runner, privacy, cap, and project-isolation tests pass, including one explicit assertion that project memory remains available outside post-compaction recovery.

## Assumptions

- Exact sanitized duplicate prompts without a native per-submission identifier are semantically safe to deduplicate because the host contract cannot distinguish an intentional repeat from retry delivery.
- Host compaction already carries its own conversation continuation; thoth-mem should add only attributable session state and should prefer abstention over unrelated project guidance.
- No schema migration or new public MCP tool is required.

## Dependencies

- Supported native hook contracts for OpenCode, Codex, and Claude Code.
- Existing ordered session summaries, lifecycle receipts, privacy sanitation, continuation renderer, and verified root-session identity.

## Out of scope

- Parsing unstable transcript formats to synthesize submission IDs or summaries.
- Generating summaries, embeddings, relevance judgments, or promoted memories inside the core or hook runner.
- Treating same-session raw prompt/checkpoint evidence as a fabricated summary or model-visible memory record.
- Changing explicit recall ranking, FTS strategy, project-wide briefing, schema revision, or the exact six-tool MCP inventory.
- Installing/reinstalling plugins, mutating real host homes, restarting harnesses, or claiming paid Claude model-consumption certification.
