# src/

## Responsibility
Bootstraps the Thoth MCP server, resolves runtime configuration, and wires the top-level process lifecycle. `index.ts` is the MCP stdio entrypoint, `cli.ts` dispatches public CLI commands and the package-internal integration-event route, `integration/` owns native lifecycle execution, `setup/` owns managed harness installation, `http-server.ts` and `http-routes.ts` provide the REST API bridge, and `server.ts` assembles the server/store/tool graph.

## Design Patterns
- Thin composition root: `createServer()` centralizes dependency construction before handing control to the MCP runtime.
- Configuration adapter: `getConfig()` maps env vars into a typed `ThothConfig` object with defaults and path resolution.
- Dependency injection by constructor/function arguments: data dir and config are passed into server setup rather than read globally.
- Process lifecycle hooks: SIGINT/SIGTERM close the store before exit.
- CLI command dispatch: `runCli()` parses arguments and routes to command handlers (search, save, timeline, context, stats, export, import, sync, migrate-project, version, help) via a `withStore` lifecycle wrapper.
- HTTP bridge with ownership/takeover: `createHttpBridge()` attempts to bind to a port; if occupied, it takes over the existing bridge via a handshake protocol.
- OpenAPI spec generation: `getOpenApiSpec(port)` dynamically builds an OpenAPI 3.0 document describing the REST API routes and schemas.
- Capability evidence is resolved before adapter selection by `src/integration/runtime/capability-evidence.ts`; adapters accept resolver-produced evidence only.
- `MemoryIntegrationCore` confirms six-tool effects before producing bounded `HostOutputDirective`; hook and integration commands preserve it.
- OpenCode privately prepares/confirms `protocolRequest`, mutates `output.system`/`output.context`, awaits the structured log, then confirms; Codex and Claude use verified native stdout.
- Compaction recovery uses checkpoint reservation, consume, and TTL. `emitted_via_verified_channel` proves channel emission; `modelConsumption` remains unproven.
- Setup covers all three hosts. Public `claude-code` maps to private runtime/inventory `claude`; `claude-code-cli.ts` and `ClaudeCodeSetupStrategy` own Claude setup evidence.
- Static checks and a hermetic packed-runtime verifier protect release assets; live smoke is opt-in only. The six-tool and no-auto-start boundaries remain unchanged.
- Subsystems are isolated behind directory codemaps in `src/store/`, `src/tools/`, `src/utils/`, and `src/sync/`; native `src/integration/` and `src/setup/` modules are mapped below.

## Data & Control Flow

### MCP Stdio Path (index.ts)
1. `src/index.ts` parses CLI args from `process.argv`, recognizing `--tools=` as ignored compatibility input and `--data-dir=`.
2. `main()` calls `createServer({ dataDir })` in `src/server.ts`.
3. `server.ts` loads config via `getConfig()`, overrides `dataDir`/`dbPath` when requested, then calls `resolveDataDir(config)` to ensure the data directory exists.
4. `Store` is instantiated with the resolved SQLite path and config, then `McpServer` is created.
5. `registerTools(server, store)` installs compact tool handlers into the MCP server.
6. `index.ts` attaches a `StdioServerTransport`, registers shutdown handlers, logs startup, and connects the server to stdio.

### CLI Command Path (cli.ts)
1. `runCli()` parses `process.argv` and dispatches to command handlers (search, save, timeline, context, stats, export, import, sync, setup, package-internal integration events, migrate-project, version, help).
2. Most commands use `withStore()` to acquire a Store instance, execute the command, and close the store on completion.
3. Command handlers delegate to Store methods, sync operations, and formatters to produce output.
4. `version.ts` provides `VERSION` constant and `getVersion()` for the version command.

### Native Integration Event Path (cli.ts, integration/)
    1. `src/cli.ts` routes bounded package-internal event input to `src/integration/runtime/integration-event-command.ts`.
    2. `src/integration/runtime/hook-command.ts` validates the protocol, resolves capability evidence before adapter selection, and fails closed on unknown/mismatched claims.
    3. Adapters normalize only resolver-backed evidence; lifecycle confirms six-tool effects and produces bounded `HostOutputDirective` data.
    4. Hook/integration commands preserve the directive. OpenCode mutates `output.system`/`output.context`, awaits the structured log, and confirms; Codex/Claude render verified native stdout.
    5. Checkpoint reservation/consume/TTL gates compaction recovery. Local `emitted_via_verified_channel` is separate from unproven model consumption.

### Managed Harness Setup Path (cli.ts, setup/)
    1. `src/cli.ts` exposes setup for `opencode`, `codex`, and public `claude-code`, with global/project scope, plan, force, rollback, and JSON controls.
    2. `src/setup/paths.ts` resolves bounded targets; public `claude-code` translates to private runtime/inventory identity `claude`.
    3. `src/setup/codex-cli.ts` and `src/setup/claude-code-cli.ts` provide bounded host-manager evidence. `src/setup/engine.ts` selects one immutable strategy, including `ClaudeCodeSetupStrategy`, before mutation.
    4. Preflight no-ops return before locking. Receipt-backed mutations checkpoint external outcomes, preserve later edits, and rollback only owned state.
    5. Live setup/smoke is opt-in only; no automated path starts a server, uses credentials, or edits external repositories.

### HTTP Bridge Path (http-server.ts, http-routes.ts)
1. `createHttpBridge()` attempts to bind to a configured port; if occupied, it performs a takeover handshake with the existing bridge.
2. Incoming HTTP requests are matched to routes via `matchRoute()` and dispatched to handler functions in `http-routes.ts`.
3. Route handlers validate inputs, call Store and sync methods, and return JSON responses.
4. `http-openapi.ts` generates an OpenAPI 3.0 spec describing all routes, schemas, and responses.

## Integration Points
- `@modelcontextprotocol/sdk/server/stdio.js` for stdio transport in `src/index.ts`.
- `@modelcontextprotocol/sdk/server/mcp.js` for `McpServer` creation in `src/server.ts`.
- `src/store/` for SQLite-backed persistence and observation/search state.
- `src/tools/` for compact MCP tool registration.
- `src/sync/` for multi-project sync operations used by CLI and HTTP routes.
- `src/integration/` for native lifecycle normalization and confirmed six-tool memory effects.
- `src/setup/` for opt-in OpenCode/Codex strategy selection, setup, verification, migration recovery, idempotency, and rollback.
- `src/utils/` for shared helpers used by deeper layers.
- `src/cli.ts` imports Store, sync functions, config, and formatters; exports `runCli`, `isCliError`, `VERSION`.
- `src/http-server.ts` and `src/http-routes.ts` provide REST API handlers; `http-openapi.ts` generates OpenAPI specs.
- `src/version.ts` provides runtime version from `package.json` with fallback path resolution.
- Environment variables consumed by `src/config.ts`: `THOTH_DATA_DIR`, `THOTH_MAX_CONTENT_LENGTH`, `THOTH_MAX_CONTEXT_RESULTS`, `THOTH_MAX_SEARCH_RESULTS`, `THOTH_DEDUPE_WINDOW_MINUTES`, `THOTH_PREVIEW_LENGTH`.

## Native Integration Modules

| Module | Responsibility |
| --- | --- |
| `src/integration/core/types.ts` | Normalized event, capability, effect, result, and state contracts. |
| `src/integration/core/protocol.ts` | Canonical six-tool lifecycle and recovery guidance shared with packaged instructions. |
| `src/integration/core/lifecycle.ts` | Pure lifecycle planning plus confirmed-success effect execution and identity handling. |
| `src/integration/core/sanitizer.ts` | Root-user prompt ownership, privacy stripping, and bounded capture. |
| `src/integration/core/memory-port.ts` | Six-tool-only memory port contract. |
| `src/integration/core/mcp-memory-port.ts` | Linked in-process MCP implementation of the memory port. |
| `src/integration/core/state-store.ts` | HMAC event identity, bounded locking, atomic state, and restart recovery. |
| `src/integration/adapters/shared.ts` | Shared adapter validation and normalized capability helpers. |
| `src/integration/adapters/opencode.ts` | OpenCode native event and capability normalization. |
| `src/integration/adapters/codex.ts` | Codex evidence-backed event and capability normalization. |
| `src/integration/adapters/claude-code.ts` | Claude Code lifecycle hook normalization and sub-agent exclusion. |
| `src/integration/runtime/capability-evidence.ts` | Sole fail-closed capability resolver; mints resolver-backed evidence before adapters. |
| `src/integration/runtime/host-output.ts` | Bounded `HostOutputDirective` validation and transport metadata. |
| `src/integration/runtime/hook-command.ts` | JSON validation, capability ingress, adapter dispatch, and directive preservation. |
| `src/integration/runtime/integration-event-command.ts` | Production route composition and directive preservation through integration commands. |

## Managed Setup Modules

| Module | Responsibility |
| --- | --- |
| `src/setup/types.ts` | Setup request/result contracts plus Codex strategy, capability, ownership, and evidence types. |
| `src/setup/engine.ts` | Inspect/plan/apply/verify orchestration, pre-lock no-op checks, dual migration, V2 checkpoints, recovery, and strategy-bounded rollback. |
| `src/setup/paths.ts` | Platform-specific global/project targets with manager-observed and legacy-owned Codex locations kept distinct. |
| `src/setup/managed-config.ts` | Ownership-aware JSONC edits and validated TOML marker blocks. |
| `src/setup/filesystem.ts` | Contained backup-first atomic writes, removal/restoration, stable entry snapshots, hashing, and verification. |
| `src/setup/receipt.ts` | Durable HMAC Receipt V1/V2 decoding, creation, validation, checkpoints, manager evidence, and recovery metadata. |
| `src/setup/codex-cli.ts` | Tested-version/scoped grammar classification, immutable strategy evidence, bounded execution, and verification. |
| `src/setup/claude-code-cli.ts` | Injected Claude manager probing and command execution evidence. |
| `src/setup/transaction-lock.ts` | Canonical-target locking, stale-lock recovery, and ownership-safe release. |
| `src/setup/harnesses/opencode.ts` | OpenCode config/plugin asset planning and verification. |
| `src/setup/harnesses/codex.ts` | Legacy-only Codex managed-fragment planning, exact capture/restore, and filesystem verification. |
| `src/setup/harnesses/claude-code.ts` | `ClaudeCodeSetupStrategy` planning, ownership-gated mutation, verification, rollback, and later-edit preservation. |
