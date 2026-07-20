# OpenCode identity

Use this reference only when the active harness is OpenCode. Keep the common memory
workflow and lifecycle ownership rules in the parent `SKILL.md`.

## Resolve the root identity

Use the first confirmed source that applies:

1. Reuse a model-visible line shaped like
   `thoth-mem verified identity: root_session_id=<id>; project=<name>`. It contains
   the normalized identity already used by confirmed native lifecycle effects.
2. Inside the native OpenCode plugin, root session events carry the stable ID as
   `properties.info.id`; transform and compaction inputs carry it as
   `input.sessionID`. A root user message is accepted only when its message and input
   session IDs agree with that root ID.
3. Resolve project context from the native plugin's explicit project value or its
   worktree/directory context. Outside the plugin, use only identity already supplied
   by verified lifecycle context; do not invent an OpenCode environment variable.

Treat `parentID` or an equivalent parent-session field as delegated evidence. A
delegated event must not own root lifecycle even if it also contains a plausible
session identifier.

## Map to memory tools

- Pass the exact root session ID as `mem_session.id`.
- Pass that same value as `session_id` to every other memory tool that accepts it.
- Pass the resolved project/workspace name as `project`; pass the verified directory
  separately as `mem_session.directory` when a degraded manual start is required.

Never substitute an agent or subagent ID, message or part ID, tool-call ID, event ID,
or delegated child session. If native fields disagree, `parentID` marks the event as
delegated, or the root cannot be proven, report identity recovery as degraded and do
not invent continuity.
