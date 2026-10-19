# Contract: native plugin lifecycle v2

## Package invariant

OpenCode, Codex, and Claude Code each receive a host-native plugin bundle containing:

- lifecycle hook declarations or native event handlers;
- one registration/setup path for the shared six-tool MCP server;
- the thoth-mem Skill and exactly the host reference it needs;
- a portable Node runner/adapter when the host executes command hooks;
- capability/version metadata and managed-install receipt data.

No bundle implements its own memory model or accesses SQLite directly.

## Host-neutral operations

Adapters can emit only these lifecycle intents:

- `session.enroll`
- `session.recover`
- `prompt.capture_root`
- `session.checkpoint_pre_compact`
- `session.guide_post_compact`
- `session.finalize`

Each intent carries verified harness, stable project/root-session identity, native event key when available, privacy-safe bounded content, and capability evidence. Host payloads stop at the adapter boundary.

## Automatic capture boundary

- Root-user prompts can be captured once after privacy filtering and identity verification.
- Checkpoints/handoffs are captured only when produced through the explicit lifecycle contract.
- Arbitrary assistant output, tool calls, terminal commands, file reads, and subagent streams are not automatically stored.
- Skills instruct agents to call `mem_save` explicitly for durable decisions, discoveries, failures, conventions, and project structure.

## Ordering and confirmation

- State advances only after the shared core confirms the operation.
- Duplicate event delivery is idempotent through lifecycle receipts.
- Pre-compact checkpoint confirmation precedes post-compact guidance.
- A hook that runs before MCP is connected can invoke the packaged command/core entry point; it cannot report MCP delivery or model consumption unless the host provides evidence.
- Unsupported or unverified capabilities return bounded `degraded` results while explicit MCP tools remain usable.

## Skills

The shared Skill defines the memory workflow and privacy/identity rules. Each plugin includes a short host reference describing verified events, injection semantics, setup scope, and degraded behavior. The Skill must not instruct a host to use an event or context-injection mechanism that its capability map has not verified.

