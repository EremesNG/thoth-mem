# Native lifecycle integrations

## Responsibility

Owns host-neutral session/prompt/compaction lifecycle effects, capability-evidence resolution, adapters, bounded host output, and portable native event delivery for OpenCode, Codex, and Claude Code. Installation ownership and packaging belong to managed delivery.

## Entry points and flow

- `src/integration/runtime/integration-event-command.ts` and `hook-command.ts`: validate ingress and resolve capability evidence before adapter selection.
- `src/integration/core/lifecycle.ts`, `memory-port.ts`, `mcp-memory-port.ts`, `state-store.ts`: plan/confirm memory effects and lifecycle state.
- `src/integration/adapters/`: host-specific normalization/output behavior.
- `integrations/opencode/plugin.mjs` and `plugin/` runner/hook assets: published native entrypoints governed by inventory.

A verified native event is normalized through resolver-backed evidence, mapped to the host-neutral lifecycle core, and allowed to produce bounded output only after confirmed memory effects. Each adapter translates its verified native root-session identity field into host-neutral `sessionId`; lifecycle effects map that value to the MCP tool's `id` or `session_id` parameter. Project identity is the current project name, normally derived from the repository or workspace directory name. OpenCode projects exact root `session.created` and trusted `chat.message` payloads into confirmed normal side effects, while its system/compaction output mutation remains a separate prepare/confirm protocol. Codex and Claude invoke the same shared packaged runner with host-specific hook arguments to render verified native stdout.

## Invariants and hazards

- Never infer capability support from an asset path, claimed event, or exit code alone; adapters consume resolver-produced evidence.
- Memory effects must be confirmed before output directives claim success. Failures remain visible and retryable.
- Confirmed native enrollment and root-prompt capture must not be repeated manually; degraded or unsupported effects retain an explicit manual fallback.
- Native identity field names remain adapter-owned. Agents reason about the stable root session ID, not a literal host field name, and pass that ID through the MCP parameter required by each tool.
- Compaction recovery is gated by bounded checkpoint reservation, consumption, and TTL.
- Semantic session summaries are agent-owned. Native `Stop` and `SessionEnd` callbacks do not authorize or trigger a root summary.
- `emitted_via_verified_channel` proves local emission only; do not claim model consumption.
- Preserve bounded/redacted ingress and output. Do not expose raw persisted content through lifecycle output.
- Preserve the six-tool memory-port boundary and no-auto-start behavior.

## Tests and verification

Start with `tests/integration/lifecycle.test.ts`, `capability-evidence.test.ts`, `hook-command.test.ts`, `opencode-runtime.test.ts`, `native-hook-output.test.ts`, adapter/runtime delivery suites, and `tests/fixtures/integration/`. Add packaging tests only when published assets or their layout change.

## Escalate context

Load [managed delivery](managed-delivery.md) for setup, inventory, runner copies, or package layout; load [persistence](persistence-retrieval.md) when memory effect semantics change.

Evidence: current `src/integration/` entrypoints/imports, published `integrations/` assets, and `tests/integration/`.
