# Feature Specification: Preserve primary handoff recovery

**Change ID**: `preserve-primary-handoff-recovery`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: A fresh real-host OpenCode smoke proved automatic hook delivery and model consumption, but the newest handoff's first pending action was truncated because secondary memories shared the same 1,000-code-point continuation budget. A handoff that fits by itself must remain actionable when additional memories exist.<br>
**Impact**: The host-neutral continuation renderer will reserve a complete, individually fitting primary handoff before admitting secondary memories. The host cap, privacy boundary, provenance, SQLite selection order, and six-tool surface remain unchanged.<br>
**Affected capabilities**: `retrieval`, `harness-integration`, `evals`

## User stories

### US1 - Resume from the complete primary handoff (Priority: P1)

As a coding-agent user, I can restart a supported host and receive the complete newest actionable handoff when it fits the existing host budget, even when older memories compete for context.

**Independent test**: Render a newest current handoff containing hidden actionable fields together with multiple large secondary memories under the 1,000-code-point cap and verify that the handoff content is byte-for-byte present without an ellipsis.

**Covers**: FR-001, FR-002, FR-003, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a newest current handoff whose envelope, title, memory ID, and full content fit the host cap by themselves, plus older current memories, **When** native recovery renders the continuation capsule, **Then** the complete handoff survives before any remaining budget is allocated to secondary memories.
2. **Given** the same project state is recovered through different native hosts, **When** each adapter consumes the shared lifecycle result, **Then** each receives the same bounded primary-handoff content and selected memory IDs.

### US2 - Preserve bounded and truthful degradation (Priority: P1)

As a coding-agent user, I receive an explicit bounded fragment rather than fabricated completeness when the primary handoff cannot fit by itself.

**Independent test**: Render an oversized handoff under the fixed cap and verify deterministic ellipsis, intact metadata and memory ID, truthful measurements, and no evidence IDs.

**Covers**: FR-003, FR-004, SC-003

**Acceptance scenarios**:

1. **Given** a primary handoff that cannot fit by itself under the host cap, **When** continuation renders, **Then** existing deterministic truncation remains explicit and no completeness claim is introduced.
2. **Given** no eligible handoff, **When** continuation renders current guidance, **Then** the existing deterministic content-first selection policy remains available.

### US3 - Prove real-host actionable recovery (Priority: P2)

As a maintainer, I can distinguish hook activation from complete handoff fidelity using fresh Codex and OpenCode sessions without MCP, filesystem, shell, or inference.

**Independent test**: After installing and restarting Codex and OpenCode, a prompt that omits the hidden values returns every expected field exactly in both hosts and each inspected session contains no tool calls or tool parts.

**Covers**: FR-005, SC-004

**Acceptance scenarios**:

1. **Given** a hidden smoke handoff stored in the canonical SQLite database, **When** fresh Codex and OpenCode root sessions ask only from automatically injected context, **Then** marker, title, archive path, and first pending action are returned exactly in both hosts without tool use.

## Edge cases

- The newest handoff fits alone but leaves too little room for a secondary memory's fixed metadata and minimum useful content.
- The newest handoff exceeds the cap even without secondary memories.
- Multiple current handoffs exist; the existing deterministic newest-first ordering remains authoritative.
- Unicode content is measured by code points rather than UTF-16 code units.
- Unsafe control characters, recovery tags, evidence IDs, and memory-like text inside content remain sanitized or withheld.
- No useful memory survives selection, so recovery remains identity-only and does not claim context delivery.

## Functional requirements

- **FR-001 — Complete individually fitting primary handoff**: `[INTERNAL]` The continuation renderer MUST preserve the full content of the first eligible handoff when that handoff, its fixed metadata, and the recovery envelope fit within `MAX_HOST_OUTPUT_CODE_POINTS` by themselves; admitting secondary memories MUST NOT convert that primary handoff into a truncated fragment.
- **FR-002 — Remaining-budget secondary selection**: `[INTERNAL]` After reserving an individually fitting primary handoff, the renderer MUST admit at most the existing maximum number of secondary items using only the remaining budget and MUST reject candidates whose fixed metadata plus minimum useful content do not fit.
- **FR-003 — Existing safety envelope**: `[INTERNAL]` The change MUST preserve the 1,000-code-point host cap, deterministic order, complete memory IDs, trust-boundary text, evidence-ID withholding, project isolation, Unicode-safe measurement, and metadata-starvation abstention.
- **FR-004 — Truthful oversized degradation**: `[INTERNAL]` When the primary handoff cannot fit by itself, the renderer MUST retain deterministic explicit truncation and truthful measurements rather than claiming complete actionable recovery.
- **FR-005 — Host-consumption evidence**: `[INTERNAL]` Verification MUST distinguish hook execution, context delivery, and model consumption, and a real-host outcome PASS MUST require inspected fresh Codex and OpenCode sessions with exact hidden fields and no MCP, filesystem, shell, or other tool calls.

## Success criteria

- **SC-001** `[buildable]`: 100% of focused continuation fixtures with one individually fitting handoff and at least two competing large memories preserve the handoff's complete hidden actionable content without an ellipsis and keep total output at or below 1,000 code points.
- **SC-002** `[buildable]`: 100% of focused shared-lifecycle and OpenCode integration fixtures pass the complete primary handoff and selected IDs through the host-neutral recovery contract with exactly six MCP tools and zero host-adapter API changes.
- **SC-003** `[buildable]`: 100% of existing oversized-content, poisoning, evidence-withholding, identity-only, Unicode, deterministic replay, and useful-content-ratio fixtures pass with truthful rendering measurements.
- **SC-004** `[outcome]`: 100% of fresh real-host Codex and OpenCode smoke sessions for the seeded hidden handoff return marker, title, archive path, and complete first pending action exactly from automatic context, with zero tool calls or tool parts in the inspected sessions.

## Assumptions

- `MemoryService.context` already supplies current handoffs in deterministic newest-first order.
- Durable handoffs remain concise semantic-boundary records; a handoff larger than the complete host capsule is allowed to degrade explicitly.
- The existing 1,000-code-point cap is a product constraint and is not increased by this change.

## Dependencies

- Existing SQLite-first context selection, shared lifecycle recovery, continuation renderer, and native OpenCode adapter.
- User-operated Codex and OpenCode restarts are required only for the final real-host outcome smoke.

## Out of scope

- Increasing host context or token budgets.
- Parsing or synthesizing arbitrary handoff field names.
- Adding vector retrieval, reranking, graph traversal, consolidation, or another MCP tool.
- Database or public schema migration.
- Paid Claude Code model-use certification.
