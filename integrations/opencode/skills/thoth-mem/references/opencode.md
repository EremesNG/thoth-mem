# OpenCode identity

Use this reference only in OpenCode. The six shared MCP tools remain unchanged; identity discovery is a separate read-only native plugin capability.

## Resolve the root identity

Call `thoth_mem_root_identity` with no arguments before attempting a weaker source. Accept only schema `thoth-mem.opencode.identity.v2`:

- A verified root result has equal `root_session_id` and `caller_session_id`, `caller_role: "root"`, an exact opaque `project_key`, a non-authoritative `project_name_hint`, and `authorization: "root_lifecycle"`.
- A verified delegated result has `caller_role: "delegated"` and `authorization: "none"`. Its root identity may scope explicitly delegated reads or observations, but the caller must not own root lifecycle operations.
- A degraded result has `authorization: "none"`, a bounded `reason`, and no `root_session_id`. Do not replace it with history or a nearby identifier.

The tool follows at most 16 validated `parentID` links with cycle detection. It performs no enrollment, prompt capture, memory dispatch, or persistence.

Only if the native tool is not registered, reuse a complete model-visible line shaped like `thoth-mem verified identity: root_session_id=<id>; project_key=<opaque-key>; project_name=<display-name>`. Inside the native plugin, root events use `properties.info.id`; transform and compaction inputs use `input.sessionID`; `parentID` proves delegated traffic. Do not invent an OpenCode environment variable.

## Map to memory tools

- Pass the exact verified root ID as `root_session_key` and set `harness` to `opencode` when saving session-attributed memory.
- Copy `project_key` verbatim. Use `project_name_hint` only before adoption; afterward prefer the persisted `project_name` from lifecycle/project output. Never derive the key from path, basename, remote, branch, worktree name, host ID, listings, or recall.
- Honor `authorization`; knowing the root ID never upgrades a delegated caller to root lifecycle ownership.
- Use the verified root pair for the `mem_save` `observation_review` and
  `observation_promotion` branches only when the caller is root with
  `authorization: "root_lifecycle"`. A project-scoped observation candidate may
  omit session attribution; a delegated or degraded caller must never review or
  promote by borrowing the root ID.

Never substitute an agent/subagent ID, message/part/tool-call/event ID, or child session. Unknown schema, malformed JSON, inconsistent authorization, ambiguous ancestry, or unprovable project identity is degraded.
