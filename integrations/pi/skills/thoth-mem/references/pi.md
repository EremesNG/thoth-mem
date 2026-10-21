# Pi native lifecycle and identity

Pi is a native `harness=pi` integration. A verified root session binds the exact
`root_session_id` supplied by Pi's session manager to the project resolved from
the current working directory. Apply privacy sanitation before deriving any
content-based identity or capture key.

The extension maps `session_start` to enrollment and bounded recovery, admitted
root `input` events to ordered capture, `session_before_compact` to a checkpoint,
successful `session_compact` to post-compaction guidance, and `session_shutdown`
to reload-safe close or idempotent finalization. On the first root prompt after
startup, resume, new, fork, or successful compaction, `before_agent_start` returns
one persisted hidden message (`thoth-mem-recovery`, `display: false`),
never per prompt or in the system prompt. Reload delivers only if the active
branch has no recovery message after its latest compaction. If memory is
unavailable, deliver the locally verified identity-only block first, then retry
on later root prompts until one verified recovery block is delivered; at most
two blocks per boundary. Invalid local identity delivers nothing. Failed
compaction and `agent_settled` never finalize the root session. Recovery is
accepted only when the returned project and session identity match the local
dispatch.
The extension alone calls `mem_session`; it is not a model-visible Pi tool.

Pi's tested `1.0.1` SDK baseline exposes no native delegated-agent identity
contract. The integration must not infer root authority or community delegation
semantics from extension metadata, prompts, tool output, package sources, or
third-party agent plugins. Ambiguous, incomplete, or child-key-mismatched
identity receives no root-only capture or recovery authority.

A delegated child may use the `project_key` passed by the root, copied verbatim,
for project-scoped reads: `mem_recall`, `mem_context` in project mode,
`mem_project`, and `mem_get`. Its saves are project-only: omit `root_session_key` and `harness`,
report them as unattributed and never claim session continuity.
Children never call `mem_session`, review or promote observations, or use the root session key.
