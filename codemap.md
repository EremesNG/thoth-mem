# Repository Atlas: thoth

## Project Responsibility
Provides a persistent memory MCP server for coding agents. The system stores prompts, observations, and session summaries in SQLite, exposes them through MCP tools, and supports opt-in native lifecycle integration for OpenCode, Codex, and Claude Code without changing the six-tool MCP surface.

## System Entry Points
- `package.json` - package metadata, pnpm scripts, runtime floor, and CLI bin target.
- `src/index.ts` - CLI entrypoint that parses args, creates the server, attaches stdio transport, and manages shutdown.
- `src/cli.ts` - CLI command dispatch for search, save, timeline, context, stats, sync, and data management operations.
- `src/server.ts` - composition root that resolves config, instantiates the store, and registers MCP tools.
- `src/config.ts` - environment-driven runtime configuration and data directory resolution.
- `src/http-server.ts` - HTTP bridge server with REST API, route matching, and bridge ownership/takeover for port conflict resolution.
- `src/integration/runtime/integration-event-command.ts` - package-internal integration-event entry point that validates hook input and runs the host-neutral lifecycle core.
- `src/setup/engine.ts` - managed OpenCode/Codex setup strategy planner, executor, verifier, V2 receipt recovery, migration, idempotency, and rollback coordinator.
- `integrations/inventory.json` - canonical package-relative inventory for every native harness runtime asset.
- `AGENTS.md` - repository instructions for coding agents, including commands and conventions.

## Repository Directory Map
| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `src/` | Application bootstrap layer that wires CLI startup, config resolution, server creation, and subsystem composition. | `src/codemap.md` |
| `src/store/` | SQLite persistence layer for sessions, prompts, observations, version history, FTS queries, deduplication, and stats. | `src/store/codemap.md` |
| `src/tools/` | Compact MCP tool registration layer with zod-validated workflow handlers. | `src/tools/codemap.md` |
| `src/utils/` | Shared helper layer for privacy stripping, FTS sanitization, dedup hashing, formatting, and topic-key generation. | `src/utils/codemap.md` |
| `src/sync/` | Incremental data synchronization with compressed chunk export/import, mutation watermarks, and v1/v2 format handling. | `src/sync/codemap.md` |
| `src/integration/` | Host-neutral lifecycle core, harness adapters, privacy/state controls, and package-internal hook execution. | `src/codemap.md` |
| `src/setup/` | Scope resolution, managed config merges, atomic filesystem transactions, receipts/rollback, and Codex capability probing. | `src/codemap.md` |
| `integrations/` | Published OpenCode, Codex, Claude Code, and shared Node-runner assets governed by the canonical inventory. | This map |
| `.agents/plugins/` | Codex marketplace discovery descriptor published with the package. | This map |
| `.claude-plugin/` | Claude Code repository marketplace descriptor published with the package. | This map |
| `scripts/` | Build orchestration plus native asset synchronization and read-only package verification. | This map |

## Architecture Patterns
- Composition root pattern in `src/server.ts`, with startup orchestration in `src/index.ts`.
- Store-centric architecture: tool handlers are thin adapters that delegate durable work to `Store`.
- Compact tool registry in `src/tools/index.ts` exposes workflow-level MCP tools and keeps admin/sync operations in CLI/HTTP.
- SQLite schema bootstrap plus FTS5 trigger-backed indexing in `src/store/schema.ts`.
- Helper-driven sanitization and normalization pipeline in `src/utils/` before persistence or search.
- HTTP bridge pattern in `src/http-server.ts` with ownership takeover for port conflict resolution and graceful bridge delegation.
- CLI command dispatch in `src/cli.ts` with `withStore` lifecycle wrapper for database operations and automatic cleanup.
- Incremental sync via mutation watermarks and manifest-driven chunk tracking in `src/sync/` for efficient data export and import.
- Capability-evidence resolution in `src/integration/runtime/capability-evidence.ts` runs before adapter selection; adapters consume resolver-produced evidence rather than infer support from assets, paths, or exit codes.
- Host-neutral lifecycle planning produces bounded `HostOutputDirective` data only after confirmed memory effects; hook and integration commands preserve it through ingress.
- OpenCode uses private prepare/confirm: `protocolRequest` mutates existing `output.system`/`output.context`, awaits the structured log, then confirms; Codex and Claude render verified native stdout.
- Compaction recovery is gated by bounded checkpoint reservation/consume/TTL; `emitted_via_verified_channel` proves local emission only, while `modelConsumption` remains unproven.
- Setup covers OpenCode, Codex, and Claude Code. Public `claude-code` maps to private runtime/inventory `claude`, with `claude-code-cli.ts` and `ClaudeCodeSetupStrategy` kept separate from public routing.
- Packaging uses a hermetic packed-runtime verifier plus static checks; live host smoke is opt-in only. Preserve the six-tool surface, no-auto-start behavior, and no formal Engram references.

## Data & Control Flow

### MCP Server Path
1. A host launches the CLI via the package bin entry or `src/index.ts` during development.
2. `src/index.ts` parses `--tools=` and `--data-dir=` arguments, then calls `createServer()`.
3. `src/server.ts` resolves runtime settings from `src/config.ts`, ensures the data directory exists, and creates the SQLite-backed `Store`.
4. `registerTools()` installs the compact MCP tools from `src/tools/`.
5. Tool invocations validate inputs, delegate persistence/recall/session/project operations to `Store`, and return MCP text responses.
6. `Store` coordinates schema setup, privacy stripping, deduplication, topic-key upserts, FTS queries, and markdown/context rendering with support from `src/utils/`.

### CLI Command Path
1. `src/cli.ts` parses command-line arguments and identifies the target operation (search, save, timeline, context, stats, sync, etc.).
2. `withStore` lifecycle wrapper creates a `Store` instance, executes the command handler, and ensures cleanup on completion.
3. Command handlers invoke `Store` methods for data operations and format results as JSON or markdown output.
4. Store operations may trigger sync operations via `src/sync/` for incremental export/import with mutation watermarks.

### HTTP Bridge Path
1. `src/http-server.ts` creates an HTTP bridge and attempts to bind to the configured port.
2. On port conflict, the bridge attempts ownership takeover of an existing bridge via handshake protocol.
3. Incoming HTTP requests are matched against routes in `src/http-routes.ts`.
4. Route handlers delegate to `Store` operations and return JSON responses via the HTTP bridge.
5. Sync operations may be triggered via HTTP endpoints for incremental data export and import.

### Native Integration Event Path
    1. A published OpenCode, Codex, or Claude Code asset receives a verified native lifecycle event; the portable runner forwards bounded JSON to the package-internal route in `src/cli.ts`.
    2. `src/integration/runtime/hook-command.ts` validates the envelope and resolves capability evidence before selecting an adapter.
    3. `src/integration/runtime/integration-event-command.ts` composes the data directory, linked six-tool `MemoryPort`, state store, lifecycle core, and root identity.
    4. `src/integration/core/lifecycle.ts` confirms memory effects before producing a bounded `HostOutputDirective`; hook/integration commands preserve it without exposing raw persisted content.
    5. OpenCode privately prepares then confirms `protocolRequest`: it mutates `output.system` and `output.context`, awaits the structured log, and records verified local emission. Codex/Claude runners render verified native stdout.
    6. Compaction uses checkpoint reservation/consume/TTL gating. `emitted_via_verified_channel` is distinct from unproven `modelConsumption`; failures remain explicit and retryable.

### Managed Setup Path
    1. `src/cli.ts` accepts setup for all three hosts: `opencode`, `codex`, and public `claude-code`, with scope, plan, force, rollback, and output controls.
    2. `src/setup/paths.ts` confines global or explicit project targets; planners inspect only owned locations. `claude-code` translates internally to private runtime/inventory identity `claude`.
    3. `src/setup/codex-cli.ts` classifies Codex grammar; `src/setup/claude-code-cli.ts` probes Claude manager capabilities. `src/setup/engine.ts` selects one immutable strategy, including `ClaudeCodeSetupStrategy`, before mutation.
    4. Read-only preflight returns verified no-ops before locking. Mutations use ownership-bounded receipts, checkpoint external outcomes, preserve later edits, and provide manual guidance when manager evidence is unavailable.
    5. Live setup/smoke is opt-in only; automated release verification uses isolated packed assets and never starts a server, uses credentials, or edits external repositories.

## Native Package Inventory

`integrations/inventory.json` is the sole executable authority for these published assets; this map records their responsibilities for navigation:

| Canonical path | Responsibility |
| --- | --- |
| `integrations/opencode/plugin.mjs` | OpenCode native event adapter entry. |
| `integrations/opencode/memory-protocol.md` | Packaged OpenCode memory workflow guidance. |
| `integrations/shared/hook-runner.mjs` | Canonical portable Node runner source. |
| `.agents/plugins/marketplace.json` | Codex marketplace discovery descriptor. |
| `integrations/codex/.codex-plugin/plugin.json` | Codex plugin manifest. |
| `integrations/codex/.mcp.json` | Codex MCP server descriptor. |
| `integrations/codex/hooks/hooks.json` | Codex lifecycle hook declaration. |
| `integrations/codex/runners/hook-runner.mjs` | Verified Codex runner copy. |
| `integrations/codex/skills/thoth-mem/SKILL.md` | Codex packaged memory skill. |
| `.claude-plugin/marketplace.json` | Claude Code repository marketplace descriptor. |
| `integrations/claude-code/.claude-plugin/plugin.json` | Claude Code plugin manifest. |
| `integrations/claude-code/.mcp.json` | Claude Code MCP server descriptor. |
| `integrations/claude-code/hooks/hooks.json` | Claude Code lifecycle hook declaration. |
| `integrations/claude-code/runners/hook-runner.mjs` | Verified Claude Code runner copy. |
| `integrations/claude-code/skills/thoth-mem/SKILL.md` | Claude Code packaged memory skill. |

## Integration Release Flow

1. `scripts/sync-integration-assets.mjs` synchronizes package versions and canonical runner copies; it is the explicit mutating preparation step.
2. `scripts/verify-integration-package.mjs` performs read-only inventory, manifest, version, lexical/realpath containment, and package-file checks.
3. `scripts/build.mjs` produces the existing Node bundle and invokes the integration verifier; stale native assets fail the build gate instead of being repaired silently.
4. The verifier performs static inventory/containment checks and a hermetic packed-runtime probe for inventory-selected native assets in isolated temporary homes with bounded timeouts and sanitized environment.
5. Package publication and packed-install tests consume the tarball file list and `integrations/inventory.json`, keeping source checkout paths out of runtime verification. Live host smoke is opt-in only.

## Root Asset Notes
- `package.json` defines runtime, test, build, native integration sync/verify, version, and release scripts.
- `tsconfig.json` enforces strict TypeScript compilation with Node16 ESM module semantics.
- `vitest.config.ts` limits automated test discovery to `tests/**/*.test.ts` with a 10 second timeout.
- `README.md` documents installation, MCP integration, and runtime configuration for end users.
- `src/version.ts` exports the package version for runtime identification and API responses.
- `src/http-openapi.ts` provides OpenAPI schema definitions for HTTP bridge REST API documentation.

## Navigation
- Start with `src/codemap.md` for bootstrap and runtime composition.
- Go to `src/store/codemap.md` for persistence, schema, and retrieval behavior.
- Go to `src/tools/codemap.md` for compact MCP tool registration.
- Go to `src/utils/codemap.md` for shared helper behavior used by the store and tools.
- Go to `src/sync/codemap.md` for incremental sync, chunk export/import, and mutation watermark tracking.
- Stay in this map for native asset inventory and release-flow ownership; use `src/codemap.md` for integration/setup source modules.
