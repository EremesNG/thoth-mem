# OpenCode identity

Use this reference only in OpenCode V2 (≥2.2.6). Native tools are `mem_save`,
`mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `thoth_mem_root_identity`.
The plugin alone calls `mem_session` through its owned Node MCP child; it is not
model-visible. No host MCP server is registered. The packaged Skill is registered
through `ctx.skill`, not copied into configuration.

## Resolve the root identity

Call `thoth_mem_root_identity` with no arguments before attempting a weaker source. Accept only schema `thoth-mem.opencode.identity.v2`:

- A verified root result has equal `root_session_id` and `caller_session_id`, `caller_role: "root"`, an exact opaque `project_key`, a non-authoritative `project_name_hint`, and `authorization: "root_lifecycle"`.
- A verified delegated result has `caller_role: "delegated"` and `authorization: "none"`. Its root identity may scope explicitly delegated reads or observations, but the caller must not own root lifecycle operations.
- A degraded result has `authorization: "none"`, a bounded `reason`, and no `root_session_id`. Do not replace it with history or a nearby identifier.

The tool follows at most 16 validated `parentID` links with cycle detection. It performs no enrollment, prompt capture, memory dispatch, or persistence.

Only if the native tool is not registered, reuse a complete model-visible line shaped like `thoth-mem verified identity: root_session_id=<id>; project_key=<opaque-key>; project_name=<display-name>`. Inside the native plugin, V2 events use `data.sessionID`; prompt and compaction hooks use `event.sessionID`; `parentID` proves delegated traffic. Do not invent an OpenCode environment variable.

## Recovery delivery

The first root `prompt` hook awaits the keyed session instruction entry
`thoth-mem-recovery` before the host freezes its instruction baseline. Delivery
state in `ctx.storage` prevents rewrites on restart, resume, later prompts, or
compaction. The host carries the entry into later compaction epochs. Prompt text
is never changed; no context or system transform is used. Delegated or
unverifiable sessions receive nothing.

If memory is unavailable, deliver the locally verified identity-only block first,
then retry on later root prompts until one verified entry replaces it once (at
most two writes per root session). The host appends that replacement as an
instruction update rather than rewriting its frozen baseline. Invalid local
identity delivers nothing. Root deletion finalizes once and removes delivery
state. Children never call `mem_session` or own root recovery delivery.

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
