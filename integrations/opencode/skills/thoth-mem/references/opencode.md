# OpenCode identity

Use this reference only in OpenCode. The six shared MCP tools remain unchanged; identity discovery is a separate read-only native plugin capability.

## Resolve the root identity

Call `thoth_mem_root_identity` with no arguments before attempting a weaker source. Accept only schema `thoth-mem.opencode.identity.v1`:

- A verified root result has equal `root_session_id` and `caller_session_id`, `caller_role: "root"`, a non-empty `project`, and `authorization: "root_lifecycle"`.
- A verified delegated result has `caller_role: "delegated"` and `authorization: "none"`. Its root identity may scope explicitly delegated reads or observations, but the caller must not own root lifecycle operations.
- A degraded result has `authorization: "none"`, a bounded `reason`, and no `root_session_id`. Do not replace it with history or a nearby identifier.

The tool follows at most 16 validated `parentID` links with cycle detection. It performs no enrollment, prompt capture, memory dispatch, or persistence.

Only if the native tool is not registered, reuse a complete model-visible line shaped like `thoth-mem verified identity: root_session_id=<id>; project=<name>`. Inside the native plugin, root events use `properties.info.id`; transform and compaction inputs use `input.sessionID`; `parentID` proves delegated traffic. Do not invent an OpenCode environment variable.

## Map to V2 memory tools

- Pass the exact verified root ID as `root_session_key` and set `harness` to `opencode` when saving session-attributed memory.
- Use the resolved workspace identity as `project_key` and its display name as `project_name`.
- Honor `authorization`; knowing the root ID never upgrades a delegated caller to root lifecycle ownership.

Never substitute an agent/subagent ID, message/part/tool-call/event ID, or child session. Unknown schema, malformed JSON, inconsistent authorization, ambiguous ancestry, or unprovable project identity is degraded.
