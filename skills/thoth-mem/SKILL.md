---
name: thoth-mem
description: >
  Use thoth-mem whenever an agent needs persistent project memory: resume prior work,
  recall or save durable lessons, preserve root session continuity, handle compaction
  or finalization, or recover truthfully when semantic memory is degraded. Do not use
  it for generic SQLite work, setup, sync, migration, dashboard, or HTTP administration
  unless the task specifically concerns agent memory behavior.
---

# thoth-mem memory recipe

Use the six MCP tools deliberately: `mem_save`, `mem_recall`, `mem_context`,
`mem_get`, `mem_project`, and `mem_session`. Keep setup and administration
outside the MCP memory workflow.

## 1. Classify the intent

Choose the smallest workflow that fits:

- Resume or investigate earlier work: recall first.
- Preserve a reusable decision, root cause, convention, or discovery: save an observation.
- Inspect wider project history, topics, graph evidence, communities, or health: navigate the project.
- Start, checkpoint, or summarize continuity: use the root lifecycle workflow.
- For setup, sync, migration, rebuild, or dashboard operations, leave this recipe and use the authorized administrative surface.

## 2. Confirm identity and ownership

Resolve the stable root session ID before memory work, and use the current project
name. The root session ID is the harness's stable identifier for the root session,
regardless of the native field or runtime label that carries it. The project name
is simply the name of the project being worked on; when it is not already explicit,
derive it from the repository or workspace directory name.

Identify the active harness from explicit runtime context, native payload shape, or
available harness tools, then read exactly one identity reference for that active
harness before declaring stable identity unavailable:

- Codex: `references/codex.md`
- Claude Code: `references/claude-code.md`
- OpenCode: `references/opencode.md`

Do not load all harness references. A model-visible `thoth-mem verified identity`
block produced by confirmed native lifecycle handling is the primary shared identity
source. A selected harness reference may define a native identity tool that takes
precedence because it verifies the current caller's role and authorization. Such a
tool resolves identity only; it does not prove that lifecycle side effects occurred.

When calling `mem_session`, its `id` parameter receives the root session ID and its
`project` parameter receives the project name. When another memory tool exposes a
`session_id` parameter, pass the same root session ID. Keep the root session ID and
project name unchanged across turns and compactions; never substitute a turn,
message, prompt, agent, or tool-call identifier.

The root/orchestrator owns session lifecycle, real user-prompt capture, and
continuity summaries. Subagents must not start, checkpoint, summarize, or
finalize the root session. A subagent may use explicitly delegated
project/session scope for bounded reads or durable observations, but it must not:

- start, checkpoint, summarize, or finalize the root session;
- save prompts or generated handoffs as user intent;
- claim root continuity after an unconfirmed call.

If the stable root session ID is unavailable, state the limitation and continue
without claiming durable session continuity. Do not infer it from nearby identifiers
or invent a fallback session. Do not call the identity unavailable until the selected
harness reference's explicit checks have been exhausted.

## 3. Start or resume boundedly

For a new root session:

1. When native enrollment and prompt capture are confirmed, do not repeat the
   same start or prompt write manually.
2. If native enrollment is degraded or unsupported, call
   `mem_session(action="start", id="<root-session-id>", project="<project-name>")` with
   working context, and continue only after the result is confirmed.
3. If native prompt capture is degraded or unsupported, save only the real
   root-user request as prompt intent with `session_id="<root-session-id>"`, then
   confirm the write.
4. Read recent continuity with a bounded `mem_context` when it is useful.

For overlapping decisions or older work, use the recall funnel:

1. Call `mem_recall(mode="compact")` with project/session/topic/type/time filters
   and a small limit.
2. Call `mem_recall(mode="context")` only for the strongest candidates.
3. Call `mem_get` only for selected IDs. Set `kind`, `offset`, and
   `max_length`; request `include_timeline` with bounded `before`/`after`
   only when chronology changes the decision.

Separate recalled facts from inference. Report missing, stale, contradictory, or
insufficient evidence instead of expanding into an unbounded dump.

## 4. Save only durable, privacy-safe memory

Before `mem_save`, remove content inside `<private>...</private>` and exclude
credentials, complete transcripts, raw logs without a lesson, assistant/tool
traffic, and generated agent or subagent prompts. Generated prompts must not be
stored as user intent.

Save an observation when future work benefits from it. Prefer a stable
`topic_key` for facts that evolve, an accurate type, and compact content:

- **What** changed or was learned.
- **Why** it matters.
- **Where** it applies.
- **Learned** captures the non-obvious constraint or reusable lesson.

Use prompt storage only for real root-user intent. Use session-summary storage
only when the root owns that lifecycle result. Do not report persistence until
the call confirms success.

## 5. Navigate the project and graph

Use `mem_project` for bounded project lists, summaries, topics, one topic,
graph views, or health. Supply `project` whenever the selected action requires
it and use `limit`/`max_chars` instead of requesting the whole project.

To inspect committed graph communities, call:

```text
mem_project(
  action="graph",
  project="<project-name>",
  navigation="community",
  limit=5,
  max_chars=2000
)
```

Community navigation needs no focus node. It returns state, freshness, bounded
summaries, `community=<id>`, coverage, and source observation IDs such as
`obs:42`. Use a returned source ID or an observation ID from recall with
`mem_get(kind="observation", id=42)`. Use `focus_node_id="obs:42"` only when
switching to bounded `navigation="neighborhood"`.

Treat “no committed community summaries” and degraded community state as real
results. Do not invent a community or present inspection output as a synthesized
global answer.

## 6. Preserve lifecycle truth

Treat each capability as `supported`, `degraded`, or `unsupported`.

- Checkpoint only for a verified root compaction event.
- Treat a semantic session summary as agent-owned. Persist it when meaningful
  root work is actually complete, without waiting for a terminal hook.
- Persist that summary with `mem_session(action="summary", id="<root-session-id>",
  project="<project-name>", content="...")`.
- Advance lifecycle state only after confirmed MCP success, including confirmed
  `mem_session` success.
- Keep failed or indeterminate effects eligible for one bounded retry.
- If retry or fallback fails, report the degraded/unsupported state and the
  manual recovery path; never claim the effect occurred.
- Keep unrelated supported memory operations available when one capability is degraded.

Compaction is explicit and retry-safe: checkpoint only for a verified root
compaction event. A semantic session summary is agent-owned; a turn-scoped Stop
or process-exit callback does not prove semantic completion. A duplicate event
is suppressed by stable event identity; byte-identical same-session prompts
within the existing 30-second window may resolve to one canonical prompt row.
Keep manual recovery visible for every degraded or unsupported capability.

Before meaningful root work ends, decide whether the work has reached a useful
semantic boundary. If it has, persist one concise summary with the goal,
instructions, discoveries, completed work, next steps, and relevant files
through the root-owned lifecycle path.

## Final response

State what was recalled or saved, which root session ID, project name, and bounds
were used, and which results were confirmed. Distinguish durable evidence from
inference and say plainly when memory was unavailable, degraded, unsupported,
or not written.
