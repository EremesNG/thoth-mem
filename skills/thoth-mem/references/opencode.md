# OpenCode identity

Use this reference only when the active harness is OpenCode. Keep the common memory
workflow and lifecycle ownership rules in the parent `SKILL.md`.

## Resolve the root identity

When the native tool is available, call `thoth_mem_root_identity` with no arguments
before attempting weaker recovery. It returns a JSON string with schema
`thoth-mem.opencode.identity.v1`. The plugin uses a fixed 16-session ancestry bound
with cycle detection, so recovery is bounded and fails closed.

Accept only these versioned outcomes:

- A verified root result has `status: "verified"`, equal `root_session_id` and
  `caller_session_id` values, `caller_role: "root"`, a non-empty `project`, and
  `authorization: "root_lifecycle"`. Use its root ID and project. The authorization
  lets the caller follow the parent skill's root-owned lifecycle rules, but does not
  prove that enrollment, prompt capture, or another lifecycle effect already occurred.
- A verified delegated result has `caller_role: "delegated"` and
  `authorization: "none"`. Its root ID and project may scope explicitly delegated
  bounded reads or durable observations, but the caller must not start, checkpoint,
  summarize, or finalize the root session, save prompts, or claim root continuity.
- A `status: "degraded"` result has `authorization: "none"`, a diagnostic `reason`,
  and no `root_session_id`. Preserve the reason and report identity recovery as
  degraded. Do not override it with history, nearby identifiers, or another weaker
  source.

Treat an unknown schema, malformed JSON, missing field, or inconsistent role and
authorization combination as degraded. The identity tool is read-only and separate
from the six thoth-mem MCP tools; calling it does not dispatch memory lifecycle work.

Only when `thoth_mem_root_identity` is not registered may you use the first confirmed
fallback that applies:

1. Reuse a model-visible line shaped like
   `thoth-mem verified identity: root_session_id=<id>; project=<name>`. It contains
   the normalized identity already used by confirmed native lifecycle effects. It
   does not grant a delegated caller root lifecycle ownership.
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
- Honor the identity result's `authorization`; knowing the root ID never upgrades a
  delegated caller into the root lifecycle owner.

Never substitute an agent or subagent ID, message or part ID, tool-call ID, event ID,
or delegated child session. If native fields disagree, `parentID` marks the event as
delegated, or the root cannot be proven, report identity recovery as degraded and do
not invent continuity.
