---
name: thoth-mem
description: Use thoth-mem as persistent memory through its compact six-tool MCP surface while preserving root ownership, privacy, stable identity, and truthful lifecycle outcomes.
---

# thoth-mem Usage

Use exactly these six MCP tools:

- `mem_recall`
- `mem_save`
- `mem_context`
- `mem_get`
- `mem_project`
- `mem_session`

Administrative, setup, sync, and harness operations stay outside MCP.

| Workflow | Tool |
| --- | --- |
| Fused retrieval | `mem_recall` |
| Durable observations, prompts, and summaries | `mem_save` |
| Bounded recent continuity | `mem_context` |
| Exact record or timeline fetch | `mem_get` |
| Project, topic, graph, and health navigation | `mem_project` |
| Root session start, checkpoint, and summary | `mem_session` |

## Ownership, privacy, and identity

The root/orchestrator owns session lifecycle, prompt capture, and continuity summaries. Subagents must not start, checkpoint, or summarize the root session and must not save prompts.

Save only real root-user intent. Generated prompts must not be saved as user intent. Exclude assistant, tool, subagent, handoff, and scaffolding traffic, and remove content inside `<private>` tags before persistence.

Use stable `session_id` and `project` identity on supported operations. When either is unavailable, expose the limitation and do not invent a fallback session that claims durable continuity.

## Root start protocol

1. Start the root memory session with its stable identity and working directory.
2. Load bounded recent continuity for that same project and session.
3. Read a project summary only when broader history matters.
4. Use compact recall before architecture or implementation work that may overlap earlier decisions.
5. Save only the actual user request as prompt intent.

## Recall and save flow

Use the bounded recall funnel:

1. `mem_recall(mode="compact")` scans candidate evidence.
2. `mem_recall(mode="context")` expands only the strongest hits.
3. `mem_get(id=...)` fetches only selected full records; request a bounded timeline only when chronology matters.

Use `mem_context` for recent continuity and `mem_project` for project summaries, topics, graph views, and health. Use `mem_save` for durable observations, real root-user prompts, and root-owned summaries. Durable observations should state **What**, **Why**, **Where**, and any non-obvious **Learned** detail.

Recall is fused by default. Keep limits bounded, use exact project/session/topic filters when available, and expand only the strongest candidates. Fetch a timeline only when chronology changes the decision.

Project navigation supports lists, summaries, topics, one topic, graph views, and health. Keep graph navigation bounded and follow returned continuation data rather than requesting an unbounded project dump.

Save decisions, architecture, bug fixes with root cause, patterns, configuration changes, discoveries, and non-obvious learnings. Use a stable topic key for evolving facts. Do not save credentials, raw logs without a durable lesson, whole transcripts, or obvious facts already present in the repository.

## Lifecycle truth

Capability states are `supported`, `degraded`, and `unsupported`. Advance lifecycle state only after confirmed MCP success; a failed or indeterminate call stays retryable.

Compaction is explicit and retry-safe: checkpoint only for a verified root compaction event, and leave failure eligible for retry. Finalization is explicit and retry-safe: summarize only for a verified root terminal event and never infer completion from partial state.

A duplicate event is suppressed using stable event identity. Distinct intentional events remain separate lifecycle effects, while byte-identical same-session prompts inside the existing 30-second window may resolve to one canonical prompt row. Event identity must not change that storage rule.

Manual recovery stays visible for every degraded or unsupported capability. One unavailable capability must not disable unrelated supported memory operations.

Before meaningful root work ends, persist one root-owned summary containing the goal, instructions, discoveries, completed work, next steps, and relevant files. Do not claim it was saved unless the memory call was confirmed.
