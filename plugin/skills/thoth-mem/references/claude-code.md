# Claude Code identity

Use this reference only when the active harness is Claude Code. Keep the common
memory workflow and lifecycle ownership rules in the parent `SKILL.md`.

## Resolve the root identity

Use the first confirmed source that applies:

1. Reuse a model-visible line shaped like
   `thoth-mem verified identity: root_session_id=<id>; project=<name>`. It contains
   the normalized identity already used by confirmed native lifecycle effects.
2. Code executing inside a Claude Code command hook uses the native hook payload's
   `session_id` as the root session ID and `cwd` as working context. Root lifecycle
   events must not contain delegated-agent evidence.
3. Outside a hook, use only identity explicitly supplied by verified lifecycle
   context or by the root runtime. Do not invent `CLAUDE_SESSION_ID` or another
   environment-variable convention that the harness has not actually exposed.

Use the verified `project` from the identity block when present. Otherwise derive
the project name from the current repository or workspace directory represented by
the verified `cwd`.

## Map to memory tools

- Pass the exact root `session_id` as `mem_session.id`.
- Pass that same value as `session_id` to every other memory tool that accepts it.
- Pass the resolved repository or workspace name as `project`; pass `cwd` separately
  as `mem_session.directory` when starting a degraded manual lifecycle.

Never substitute an agent or subagent ID, prompt ID, message ID, tool-call ID,
transcript path, hook event ID, or delegated session. If only delegated traffic or
ambiguous nearby identifiers are visible, report identity recovery as degraded and
do not invent root continuity.
