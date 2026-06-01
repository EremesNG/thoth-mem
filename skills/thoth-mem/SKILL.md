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
| Save a session summary | `mem_session(action="summary")` or `mem_save(kind="session_summary")` |

Admin and operations work is intentionally outside the MCP tool surface. Use CLI, HTTP, or the dashboard for export/import, sync/sync-import, project migration/deletion, graph rebuilds, index rebuilds, status inspection, and operation traces.

## Start Protocol

At the beginning of a meaningful work session:

1. Call `mem_session(action="start", id="...", project="...", directory="...")`.
2. Call `mem_context(project="...", session_id="...")` for recent continuity. Add `recall_query="..."` when one targeted fused recall should appear inline with the context.
3. Call `mem_project(action="summary", project="...")` when project-level history matters.
4. If the task might overlap previous work, call `mem_recall(mode="compact", query="...", project="...")` before editing code or making architecture decisions.
5. Save significant real user intent with `mem_save(kind="prompt", content="...", session_id="...", project="...")`.

Only save real user prompts. Do not save generated subagent prompts, internal handoffs, raw transcripts, or tool scaffolding as user intent.

## Recall Protocol

Use recall as a widening funnel:

1. `mem_recall(mode="compact", query="...", project="...")` scans fused evidence cheaply.
2. `mem_recall(mode="context", query="...", project="...")` expands the strongest hits into retrieved text.
3. `mem_get(id=...)` fetches full content only for the final records that need exact detail.
4. `mem_get(id=..., include_timeline=true)` when chronology matters.

`mem_recall` is the primary retrieval tool. It may return semantic, lexical, and graph/KG evidence together, plus `pending` and `degraded_fallback` metadata. Pending or degraded semantic lanes are not failures; they mean the fallback lanes are carrying the recall.

Use `hyde=false` only when comparing raw query behavior or debugging recall drift. Use `debug=true` when you need lane order, semantic input sources, or evidence diagnostics for a retrieval bug.

Good recall queries include concrete file names, component names, error messages, architecture terms, migration names, topic keys, and user-facing feature names. Prefer two or three focused recalls over one broad vague query.

## Project Navigation

Use `mem_project` for project-level browsing:

- `mem_project(action="list")` lists known projects.
- `mem_project(action="summary", project="...")` gives recent scoped context.
- `mem_project(action="topics", project="...")` lists stable topic keys.
- `mem_project(action="topic", project="...", topic_key="...")` reads exact topic context.
- `mem_project(action="graph", project="...", limit=..., max_chars=...)` scans structured facts and relationships.

Use project navigation before broad recall when you are unsure of the project name, topic key, or decision area.

## Saving Memory

Call `mem_save(kind="observation")` after durable events:

- Architecture decisions or tradeoffs.
- Bug fixes, including root cause and verification.
- New patterns or conventions.
- Configuration changes or environment setup.
- Important discoveries, gotchas, or constraints.

Use this content shape:

```markdown
**What**: [concise description]
**Why**: [reasoning or problem that drove it]
**Where**: [files/paths affected]
**Learned**: [gotchas, edge cases - omit if none]
```

Use short searchable titles. Include concrete nouns such as module names, table names, endpoint names, commands, or bug symptoms.

Use `topic_key` when the memory belongs to an evolving topic that should update in place, for example `architecture/retrieval-engine`, `bugfix/sqlite-vec-loading`, or `config/embedding-provider`.

## Save Kinds

`mem_save` supports these memory kinds:

- `kind="observation"`: durable decision, bugfix, pattern, config, discovery, learning, or manual note. Requires `title`.
- `kind="prompt"`: significant real user request or intent. Requires `content`; include `session_id` and `project` when known.
- `kind="session_summary"`: continuity handoff. Include `session_id`, `project`, and the summary template below.
- `kind="passive_learnings"`: extracts bullets from a `## Key Learnings:` or `## Aprendizajes Clave:` section.

Do not save secrets, credentials, raw logs without a durable lesson, broad transcripts, or obvious facts already present in the repository.

## Session Summary

Before ending a meaningful session, call either:

- `mem_session(action="summary", id="...", project="...", content="...")`, or
- `mem_save(kind="session_summary", session_id="...", project="...", content="...")`.

Use this structure:

```markdown
## Goal
[One sentence: what were we building or working on]

## Instructions
[User preferences, constraints, or context discovered this session. Skip if nothing notable.]

## Discoveries
- [Technical finding, gotcha, or learning]

## Accomplished
- DONE [Completed task with key implementation details]
- TODO [Identified but not yet done, if any]

## Relevant Files
- path/to/file.ts - [what it does or what changed]
```

Keep summaries factual. Include verification results and known gaps when they matter.

## Example Workflows

### Resume a Feature

1. `mem_session(action="start", id="...", project="...", directory="...")`
2. `mem_context(project="...", session_id="...")`
3. `mem_project(action="summary", project="...")`
4. `mem_recall(mode="compact", query="feature-name architecture decision", project="...")`
5. `mem_recall(mode="context", query="feature-name architecture decision", project="...")` if compact hits need detail
6. `mem_get(id=<best-id>)` only for exact implementation details

### Investigate a Recurring Bug

1. `mem_recall(mode="compact", query="error message function-name failing test", project="...")`
2. `mem_recall(mode="compact", query="module-name gotcha root cause", project="...")` if the first recall is thin
3. `mem_get(id=<best-id>, include_timeline=true)` when chronology matters
4. After fixing, `mem_save(kind="observation", type="bugfix", title="...", content="...", project="...")`

### Preserve an Evolving Decision

1. `mem_project(action="topics", project="...")`
2. Pick or create a stable `topic_key`
3. `mem_save(kind="observation", type="decision", topic_key="...", title="...", content="...", project="...")`
4. Later sessions update the same topic key instead of creating scattered near-duplicates

## Quality Bar

Good thoth-mem usage should make the next session easier. A future agent should be able to answer:

- What changed?
- Why did it change?
- Where should I look?
- What should I avoid repeating?
- Which memories are authoritative versus exploratory?

When in doubt, recall compactly, expand only the best hits, fetch full content sparingly, and save the durable lesson.
