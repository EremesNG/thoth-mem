---
name: thoth-mem
description: Use thoth-mem correctly as persistent memory for coding agents. Use this skill whenever starting or resuming work, recovering prior project context, searching memory, saving durable learnings, writing session summaries, or deciding whether to call mem_search, mem_context, mem_timeline, mem_get_observation, mem_save, mem_save_prompt, mem_session_start, or mem_session_summary. Strongly prefer this skill for any task involving memory recall, cross-session continuity, previous decisions, project history, or the 3-layer recall protocol.
---

# thoth-mem Usage

thoth-mem is a persistent memory MCP server for coding agents. Use it to recover context from previous sessions, avoid repeating old mistakes, and preserve decisions or discoveries that future agents should inherit.

The most important habit is to treat memory as a token-efficient index first, not as a dump of full notes. Start narrow, expand only the promising hits, and save only information that will matter later.

## Start-of-Session Protocol

At the beginning of a meaningful work session:

1. Call `mem_session_start` with a stable session ID, the project name, and the working directory.
2. Call `mem_context` for the current project to get recent sessions, prompts, observations, and memory stats.
3. If the task sounds related to previous work, use the 3-layer recall protocol before editing code or making architecture decisions.
4. Save the user's significant request with `mem_save_prompt` when it defines intent that future sessions should remember.

Use `mem_context` as the orientation pass. It is good for recent continuity, but it is not a replacement for targeted search when the task depends on a specific prior decision or bug.

## 3-Layer Recall Protocol

Use this protocol whenever you need past context beyond recent session orientation. It keeps recall cheap while still letting you reach full detail when needed.

### Layer 1: Search

Call `mem_search` first.

Use it to scan compact results: IDs, titles, types, projects, scopes, and optionally snippets. Start with compact mode unless the query is highly specific and snippets will materially help.

Good search patterns:

- Use domain terms from the current task: feature names, file names, function names, API names, bug symptoms, migration names, or decision topics.
- Filter by `project` when you know it.
- Filter by `type` when the intent is clear, such as `bugfix`, `decision`, `architecture`, `config`, `pattern`, `discovery`, `learning`, or `session_summary`.
- Use `topic_key_exact` when the user or prior context gives a stable topic key.
- Try 2-3 focused searches instead of one broad search when the first search is noisy.

Do not fetch full observations during broad exploration. First identify the few IDs that look promising.

### Layer 2: Explore

Call `mem_timeline` on promising observation IDs.

Use it to understand the surrounding session: what happened before, what changed afterward, and whether the search hit was part of a larger decision chain. This prevents over-trusting an isolated title or stale snippet.

Good exploration patterns:

- Start with the best 1-3 search results.
- Use the timeline to distinguish final decisions from earlier dead ends.
- Prefer observations whose neighboring entries confirm the same direction.
- If the timeline shows the topic moved elsewhere, search again using those newer names or topic keys.

### Layer 3: Fetch

Call `mem_get_observation` only for the full content you actually need.

Use it for the final 1-3 most relevant observations after search and timeline filtering. Fetching full content is appropriate when you need exact rationale, file paths, implementation details, gotchas, or a previous summary before acting.

If an observation is large and paginated, follow the returned `offset` instructions only until you have enough context to proceed.

## Recall Decision Guide

Use `mem_context` when:

- Starting a session.
- The user asks what happened recently.
- You need recent prompts, observations, and session summaries.

Use `mem_search` when:

- You need a specific past decision, bugfix, pattern, configuration, or gotcha.
- The current task might overlap with prior work.
- `mem_context` is too recent or too broad.

Use `mem_timeline` when:

- A search result looks relevant but may be incomplete.
- You need chronology or neighboring decisions.
- You want to avoid acting on a stale or superseded observation.

Use `mem_get_observation` when:

- You have selected a specific observation ID and need full content.
- You need exact implementation details, rationale, or file references.

## Saving Memory

Call `mem_save` proactively after durable learnings, not only at the end.

Save observations after:

- Architecture decisions or tradeoffs.
- Bug fixes, including what was wrong, why it happened, and how it was fixed.
- New patterns or conventions established.
- Configuration changes or environment setup.
- Important discoveries, gotchas, constraints, or debugging lessons.

Use this content shape:

```markdown
**What**: [concise description]
**Why**: [reasoning or problem that drove it]
**Where**: [files/paths affected]
**Learned**: [gotchas, edge cases - omit if none]
```

Write titles that are short and searchable. Include concrete nouns such as component names, tool names, table names, endpoint names, or bug symptoms.

Use `mem_suggest_topic_key` before `mem_save` when the memory belongs to an evolving topic that should be updated in place. Then pass the chosen `topic_key` to `mem_save`.

Good topic-key cases:

- Long-lived architecture decisions.
- A recurring bug or migration.
- Project setup conventions.
- A feature design that will evolve over multiple sessions.

Use normal deduplicated observations when the note is a standalone discovery or one-time event.

## Session Summary Protocol

Before ending a meaningful session, call `mem_session_summary`. This is the continuity handoff for the next agent.

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

Keep summaries factual and useful for resumption. Include test results or verification gaps when they matter.

## Passive Capture

Use `mem_capture_passive` when an output contains a `## Key Learnings:` or `## Aprendizajes Clave:` section. It extracts each listed item as a separate observation.

This is useful after retrospectives, debugging reports, or research summaries where the learnings are already structured.

## What Not To Save

Do not save:

- Obvious facts available in the repository.
- Raw logs unless they encode a durable lesson.
- Large pasted files or broad transcripts.
- Secrets, credentials, tokens, or private content.
- Every minor action in a session.

Prefer saving the reason a thing matters, where it applies, and how a future agent should use it.

## Example Workflows

### Resume a Feature

1. `mem_session_start`
2. `mem_context(project="...")`
3. `mem_search(query="feature-name architecture decision", project="...", type="decision")`
4. `mem_timeline(observation_id=<best-id>)`
5. `mem_get_observation(id=<final-id>)`
6. Continue the work using the recovered context.

### Investigate a Recurring Bug

1. `mem_search(query="error message function-name failing test", project="...", type="bugfix")`
2. `mem_search(query="module-name gotcha", project="...", type="discovery")` if the first search is thin.
3. `mem_timeline` around the most relevant result.
4. `mem_get_observation` for the final bugfix or discovery.
5. After fixing, `mem_save` the new root cause and verification.

### Preserve an Evolving Decision

1. `mem_suggest_topic_key(title="...")`
2. `mem_save` with `topic_key`, `type="decision"` or `type="architecture"`.
3. Later sessions update the same topic key instead of creating scattered near-duplicates.

## Quality Bar

Good thoth-mem usage should make the next session easier. A future agent should be able to answer:

- What changed?
- Why did it change?
- Where should I look?
- What should I avoid repeating?
- Which memories are authoritative versus exploratory?

When in doubt, recall broadly with compact search, explore chronology, fetch sparingly, and save the durable lesson.
