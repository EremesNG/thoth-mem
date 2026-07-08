---
name: thoth-mem
description: Use thoth-mem correctly as persistent memory for coding agents with its compact MCP surface. Use this whenever starting or resuming work, recalling previous decisions or bugs, browsing project memory, saving durable learnings, recording user intent, or writing session summaries. Use the six MCP tools: mem_recall, mem_save, mem_context, mem_get, mem_project, and mem_session.
---

# thoth-mem Usage

thoth-mem is a persistent memory MCP server for coding agents. Use it to recover context from previous sessions, avoid repeating past mistakes, and preserve decisions or discoveries that future agents should inherit.

Use the MCP surface as a set of workflow-level tools:

| Workflow | Tool |
| --- | --- |
| Fused retrieval/search | `mem_recall` |
| Save any durable memory | `mem_save` |
| Start-of-session orientation | `mem_context` |
| Fetch exact full memory or timeline | `mem_get` |
| Project navigation and topic/graph views | `mem_project` |
| Session lifecycle | `mem_session` |

The active MCP surface has only these six tools. Do not call legacy split tools such as `mem_search`, `mem_get_observation`, `mem_timeline`, `mem_project_summary`, `mem_project_graph`, `mem_topic_keys`, `mem_session_start`, `mem_session_summary`, or `mem_save_prompt`.

Use this current mapping instead:

| Old intent | Current tool |
| --- | --- |
| Search/recall | `mem_recall` |
| Fetch one memory or timeline | `mem_get` |
| Project summary, graph, topics, topic context | `mem_project` |
| Start or summarize a session | `mem_session` |
| Save a prompt | `mem_save(kind="prompt")` |
| Save a session summary | `mem_save(kind="session_summary")` (root-owned) and/or `mem_session(action="summary")` |

Admin/export/import/sync/migration/rebuild/index/trace operations are intentionally outside MCP. Use CLI, HTTP, or dashboard flows for those operations.

## Stable identity and bootstrap guidance

- Prefer harness-provided stable `session_id` and `project` whenever available.
- If stable identity is unavailable, call out a persistence bootstrap limitation and continue with visible fallback metadata (for example `session="ephemeral"`, `project="unknown"`). Do not pretend session continuity is guaranteed.
- Subagents must never invent a session id or call `mem_session(action="start")`.

## Start protocol

1. Root calls `mem_session(action="start", id="...", project="...", directory="...")` when stable identity is available.
2. Root calls `mem_context(project="...", session_id="...")` for recent continuity. Add `recall_query="..."` only for inline context hints.
3. Root may call `mem_project(action="summary", project="...")` when broader project history matters.
4. If overlap is likely, root calls `mem_recall(mode="compact")` before architecture or implementation changes.
5. Root saves real user intent with `mem_save(kind="prompt", content="...", session_id="...", project="...")`.

Only save real user prompts. Do not save generated subagent prompts, handoff bodies, raw transcripts, or tool scaffolding as user intent.

## Recall protocol (mem_recall)

Use a widening funnel:

1. `mem_recall(mode="compact", query="...", project="...", limit=1-20, hyde=true, debug=false, ...)`
2. `mem_recall(mode="context", query="...", project="...", limit=1-20, ... )`
3. `mem_get(id=..., kind="observation"|"prompt")`
4. `mem_get(id=..., include_timeline=true, before=5, after=5)` when chronology matters.

`mem_recall` performs HyDE + fused recall by default (semantic + lexical + KG/graph). Set `hyde=false` only for raw query/debug comparisons.

- `debug=true` is for diagnostics and lane evidence tracing.
- `pending`/`degraded_fallback` in metadata is state/fallback behavior, not a hard failure.
- Graph enrichment and token/character measurement may appear in the recall metadata.

## mem_get details

- `kind` supports `observation` and `prompt`.
- Use `offset` and `max_length` for large memory items.
- Use `include_timeline=true` with numeric `before`/`after` counts (for example `before=5, after=5`) when chronological ordering is important.

## Project navigation (mem_project)

Supported actions:

- `mem_project(action="list")`
- `mem_project(action="summary", project="...")`
- `mem_project(action="topics", project="...")`
- `mem_project(action="topic", project="...", topic_key="...")`
- `mem_project(action="graph", project="...", navigation="...", limit=?, max_chars=?, focus_node_id=?, observation_id=?, continuation=?, include_superseded=?)`
- `mem_project(action="health", project="...")`

For `action="graph"`, supported `navigation` values include:
`ledger`, `neighborhood`, `lineage`, `community`, `superseded`.

Relation allowlist for graph edges:
`HAS_TYPE`, `IN_PROJECT`, `HAS_TOPIC_KEY`, `HAS_WHAT`, `HAS_WHY`, `HAS_WHERE`, `HAS_LEARNED`.

## Save protocol

Use `mem_save(kind="observation")` for durable events:
- architecture decisions and tradeoffs
- bug fixes, with root cause
- patterns, conventions, constraints, discoveries
- configuration changes
- non-obvious constraints

Use this content shape:

```markdown
**What**: [concise description]
**Why**: [reasoning or problem that drove it]
**Where**: [files/paths affected]
**Learned**: [gotchas, edge cases - omit if none]
```

Use short searchable titles and concrete nouns (modules, endpoints, commands, bug signatures).
Do not save secrets, credentials, raw logs without a durable lesson, broad transcripts, or obvious facts already present in the repository.

`mem_save` kinds in general:

- `kind="observation"`: durable decision, bugfix, pattern, config, discovery, learning.
- `kind="prompt"`: significant real user request or intent.
- `kind="session_summary"`: continuity handoff content when explicitly used by root.
- `kind="passive_learnings"`: extract from `## Key Learnings:` style sections.

`topic_key` is optional for general durable memories and required for evolving topics.

## Session operations (mem_session)

Allowed root actions:

- `mem_session(action="start")`
- `mem_session(action="checkpoint")`
- `mem_session(action="summary")`

`start` and `checkpoint/summary` are root-owned continuity operations.

Subagents must never call `mem_session` in subagent mode.

Before ending meaningful root work, call:

- `mem_session(action="summary", id="...", project="...", content="...")`
- or `mem_save(kind="session_summary", session_id="...", project="...", content="...")`

## Root/subagent ownership contract

- Root owns: `mem_session(action="start"|"checkpoint"|"summary")`, `mem_save(kind="prompt")`, and root continuity summaries.
- Read-only subagents (explorer/librarian/oracle) may call recall/fetch/context/project reads only with parent `session_id` and `project`.
- Write-capable subagents (deep/quick/designer) may call `mem_save(kind="observation")` only when explicitly delegated, and only in scope. Do not save prompts.
- Generated prompts, handoffs, and raw transcripts are never saved as user intent.

`mem_context` and `mem_project` are bounded context reads, not session ownership transfers.

## Quality bar

Good thoth-mem usage should let the next session quickly answer:
- What changed?
- Why it changed?
- Where to inspect?
- What should be avoided?
- Which memories are authoritative versus exploratory?

When uncertain, call compact recall first, expand only best candidates, then fetch full records sparsely.
