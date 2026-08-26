---
name: thoth-mem
description: Use SQLite-first persistent project memory to resume prior work, recall decisions and failures, or preserve a durable handoff for another coding-agent session.
---

# thoth-mem memory recipe

Use only the six MCP tools: `mem_save`, `mem_recall`, `mem_context`,
`mem_get`, `mem_project`, and `mem_session`.

## Choose the smallest workflow

- Resume or investigate prior project work: recall progressively.
- Preserve a reusable decision, verified failure, convention, discovery, or handoff: save durable evidence.
- Request a bounded project briefing or history: use the project tool.
- Handle an actual root lifecycle event: use the session tool.

## Recall progressively

1. Start with `mem_recall` in compact mode and a small limit.
2. Expand only strong candidates in context mode; use `mem_context` only when a bounded project-wide briefing is useful.
3. Fetch full content only for selected IDs with `mem_get`.

Treat missing, stale, contradictory, or insufficient memory as a limitation;
never invent continuity.

## Preserve identity and ownership

Before a session-attributed write or lifecycle operation, load exactly one identity
reference for the active host: `references/opencode.md`, `references/codex.md`,
or `references/claude-code.md`. The root agent owns lifecycle and handoffs;
delegated agents stay within explicitly authorized scope.

Use the verified project as `project_key` and `project_name`. For a
session-attributed write, pass the verified `root_session_key` together with its
matching `harness`. Never invent these values or substitute a child, message,
turn, prompt, or tool-call identifier. If only the project is verified, a
project-only save is allowed, but report it as unattributed and without claiming
session continuity.

## Persist durable semantic boundaries

Before the final response, explicitly decide whether the work reached a useful
semantic boundary and whether future sessions benefit from a durable handoff.
Examples are user-approved architecture or product direction, a verified root
cause or failure, a reusable convention, a completed change, and
continuation-critical state.

When the boundary is durable, save one concise handoff with `mem_save`:

- `evidence.kind="handoff"` with compact supporting evidence;
- `memory.kind="handoff"` with the goal, decisions, discoveries, completed work,
  next steps, and relevant files;
- a stable `topic_key`, plus a stable `event_key` when the same event may replay.

Do not create memory for transient status, speculation, raw logs, or facts
already fully represented by canonical artifacts. Remove `<private>...</private>`
blocks and exclude secrets, full transcripts, assistant/tool traffic, and
generated prompts. Avoid a duplicate manual write when native lifecycle handling
already confirmed the same event.

Do not report persistence until the result confirms the saved evidence and
memory. A failed or indeterminate write remains not confirmed. Do not call
`mem_session` merely because a response is ending; reserve it for an actual
lifecycle event.

## Report confirmed memory truth

In the final response, state the confirmed recalled or saved record IDs, project,
and session bounds. Otherwise say plainly that memory was unavailable, degraded,
unattributed, or not confirmed.
