# Claude Code identity

Use this reference only in Claude Code. Lifecycle hooks may execute before MCP connects, so confirmed native identity and memory effects remain distinct facts.

## Resolve the root identity

Use the first confirmed source that applies:

1. Reuse a complete model-visible line shaped like `thoth-mem verified identity: root_session_id=<id>; project=<name>`. It contains the normalized identity already accepted by native lifecycle handling.
2. Code executing inside a Claude Code command hook uses the official payload `session_id` as the root session and `cwd` as project context. Root lifecycle events must not contain delegated-agent evidence.
3. Outside a hook, use only identity explicitly supplied by verified lifecycle context or the root runtime. Do not invent `CLAUDE_SESSION_ID` or another environment convention.

Use the verified project from the identity block when present; otherwise derive it from the repository/workspace represented by verified `cwd`.

## Map to V2 memory tools

- Pass the exact native root session as `root_session_key` and set `harness` to `claude` when saving session-attributed memory.
- Use the resolved repository identity as `project_key` and its display name as `project_name`.

Never substitute an agent/subagent ID, prompt/message/tool-call/hook-event ID, transcript path, or delegated session. If only delegated traffic or ambiguous nearby identifiers are visible, report degraded identity and do not invent continuity.
