# Pi native lifecycle and identity

Pi is a native `harness=pi` integration. A verified root session binds the exact
`root_session_id` supplied by Pi's session manager to the project resolved from
the current working directory. Apply privacy sanitation before deriving any
content-based identity or capture key.

The extension maps `session_start` to enrollment and bounded recovery, admitted
root `input` events to ordered capture, `session_before_compact` to a checkpoint,
successful `session_compact` to post-compaction guidance, and `session_shutdown`
to reload-safe close or idempotent finalization. Failed compaction and
`agent_settled` never finalize the root session. Recovery is accepted only when
the returned project and session identity match the local dispatch.

Pi 0.84.x exposes no native delegated-agent identity contract. The integration
must not infer root authority or community delegation semantics from extension
metadata, prompts, tool output, package sources, or third-party agent plugins.
Ambiguous, incomplete, or child-key-mismatched identity receives no root-only
capture or recovery authority.
