# Codex identity

Use this reference only when the active harness is Codex. Keep the common memory
workflow and lifecycle ownership rules in the parent `SKILL.md`.

## Resolve the root identity

Use the first confirmed source that applies:

1. Reuse a model-visible line shaped like
   `thoth-mem verified identity: root_session_id=<id>; project=<name>`. It contains
   the same normalized identity already used by confirmed native lifecycle effects.
2. When the root agent has shell access and no verified block is visible, read only
   `CODEX_THREAD_ID` (`$env:CODEX_THREAD_ID` in PowerShell or
   `printenv CODEX_THREAD_ID` in a POSIX shell). A non-empty value is the current
   Codex task/thread ID in runtimes that expose it. This is verified current-runtime
   recovery behavior, not a public cross-version environment contract.
3. When the Codex `list_threads` capability is available, use it only to cross-check
   the candidate against one unambiguous current thread with the same working
   directory and task. Multiple plausible threads are ambiguity, not permission to
   guess.
4. Code executing inside a Codex command hook receives official `session_id` and
   `cwd` fields on stdin. The hook payload is authoritative inside that hook, but do
   not pretend the root model can see raw hook input unless a verified identity block
   forwarded it.

Use the verified `project` from the identity block when present. Otherwise use the
name of the current Codex project, repository, or workspace directory. A Codex saved
project `projectId` such as `local-...` is routing metadata, not the thoth-mem project
name.

## Map to memory tools

- Pass the exact root task/thread ID as `mem_session.id`.
- Pass that same value as `session_id` to every other memory tool that accepts it.
- Pass the resolved project name as `project`; for `mem_session(action="start")`,
  pass the working directory separately as `directory` when needed.

Never substitute `turn_id`, an agent or subagent ID, a message ID, a tool-call ID,
`POSH_SESSION_ID`, a visualization directory token, or Codex `projectId`. Do not dump
the full environment merely to find one variable. If the explicit checks remain
empty or ambiguous, report identity recovery as degraded and do not invent a session.
