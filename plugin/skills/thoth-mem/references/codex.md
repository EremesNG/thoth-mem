# Codex identity

Use this reference only in Codex.

## Resolve the root identity

Use the first confirmed source that applies:

1. Reuse a complete model-visible line shaped like `thoth-mem verified identity: root_session_id=<id>; project_key=<opaque-key>; project_name=<display-name>`. Copy the key verbatim; the name is persisted display metadata.
2. If no block is visible and shell access is available, read only `CODEX_THREAD_ID`: PowerShell `$env:CODEX_THREAD_ID`; POSIX `printenv CODEX_THREAD_ID`. A non-empty value is the current Codex task/thread ID in runtimes that expose it; this is verified current behavior, not a cross-version public guarantee.
3. If `list_threads` is available, use it only to cross-check one unambiguous active task with the same working directory and objective. Multiple plausible tasks are ambiguous.
4. Inside a Codex hook, the official stdin `session_id` plus `cwd` are authoritative. The root model must not claim access to a raw hook payload unless the verified identity block forwards it.

Derive the memory project from the current repository/workspace represented by verified context. Codex saved-project `projectId` is not the memory project or root session.

## Map to memory tools

- Pass the exact Codex task/thread ID as `root_session_key` and set `harness` to `codex` when saving session-attributed memory.
- Copy the verified `project_key` exactly and use the persisted `project_name`. Paths, basenames, remotes, branches, worktree names, and Codex project IDs are metadata, never identity.
- Use that same verified root session pair for the `mem_save` `observation_review`
  and `observation_promotion` branches. A project-scoped observation candidate
  may omit session attribution, but review and promotion may not.

Never substitute `turn_id`, an agent/subagent ID, message/tool-call ID, `POSH_SESSION_ID`, a visualization token, or Codex `projectId`. Do not dump the full environment. If the targeted source is empty or the current task is ambiguous, report degraded identity and do not invent continuity.
