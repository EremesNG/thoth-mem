# Repository Atlas: thoth

## Project Responsibility
Provides a persistent memory MCP server for coding agents. The system stores prompts, observations, and session summaries in SQLite, exposes them through MCP tools, and is optimized for durable cross-session recall with FTS-backed retrieval.

## System Entry Points
- `package.json` - package metadata, npm scripts, runtime floor, and CLI bin target.
- `src/index.ts` - CLI entrypoint that parses args, creates the server, attaches stdio transport, and manages shutdown.
- `src/cli.ts` - CLI command dispatch for search, save, timeline, context, stats, sync, and data management operations.
- `src/server.ts` - composition root that resolves config, instantiates the store, and registers MCP tools.
- `src/config.ts` - environment-driven runtime configuration and data directory resolution.
- `src/http-server.ts` - HTTP bridge server with REST API, route matching, and bridge ownership/takeover for port conflict resolution.
- `AGENTS.md` - repository instructions for coding agents, including commands and conventions.

## Repository Directory Map
| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `src/` | Application bootstrap layer that wires CLI startup, config resolution, server creation, and subsystem composition. | `src/codemap.md` |
| `src/store/` | SQLite persistence layer for sessions, prompts, observations, version history, FTS queries, deduplication, and stats. | `src/store/codemap.md` |
| `src/tools/` | MCP tool registration layer with profile-gated tool exposure and zod-validated handlers. | `src/tools/codemap.md` |
| `src/utils/` | Shared helper layer for privacy stripping, FTS sanitization, dedup hashing, formatting, and topic-key generation. | `src/utils/codemap.md` |
| `src/sync/` | Incremental data synchronization with compressed chunk export/import, mutation watermarks, and v1/v2 format handling. | `src/sync/codemap.md` |

## Architecture Patterns
- Composition root pattern in `src/server.ts`, with startup orchestration in `src/index.ts`.
- Store-centric architecture: tool handlers are thin adapters that delegate durable work to `Store`.
- Profile-gated tool registry in `src/tools/index.ts` separates `agent` and `admin` tool surfaces.
- SQLite schema bootstrap plus FTS5 trigger-backed indexing in `src/store/schema.ts`.
- Helper-driven sanitization and normalization pipeline in `src/utils/` before persistence or search.
- HTTP bridge pattern in `src/http-server.ts` with ownership takeover for port conflict resolution and graceful bridge delegation.
- CLI command dispatch in `src/cli.ts` with `withStore` lifecycle wrapper for database operations and automatic cleanup.
- Incremental sync via mutation watermarks and manifest-driven chunk tracking in `src/sync/` for efficient data export and import.

## Data & Control Flow

### MCP Server Path
1. A host launches the CLI via the package bin entry or `src/index.ts` during development.
2. `src/index.ts` parses `--tools=` and `--data-dir=` arguments, then calls `createServer()`.
3. `src/server.ts` resolves runtime settings from `src/config.ts`, ensures the data directory exists, and creates the SQLite-backed `Store`.
4. `registerTools()` installs MCP tools from `src/tools/` into the server according to active profiles.
5. Tool invocations validate inputs, delegate persistence/search/update operations to `Store`, and return MCP text responses.
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

## Root Asset Notes
- `package.json` defines the only supported scripts: `build`, `dev`, `test`, `test:watch`, and `prepublishOnly`.
- `tsconfig.json` enforces strict TypeScript compilation with Node16 ESM module semantics.
- `vitest.config.ts` limits automated test discovery to `tests/**/*.test.ts` with a 10 second timeout.
- `README.md` documents installation, MCP integration, and runtime configuration for end users.
- `src/version.ts` exports the package version for runtime identification and API responses.
- `src/http-openapi.ts` provides OpenAPI schema definitions for HTTP bridge REST API documentation.

## Navigation
- Start with `src/codemap.md` for bootstrap and runtime composition.
- Go to `src/store/codemap.md` for persistence, schema, and retrieval behavior.
- Go to `src/tools/codemap.md` for MCP tool registration and profile exposure.
- Go to `src/utils/codemap.md` for shared helper behavior used by the store and tools.
- Go to `src/sync/codemap.md` for incremental sync, chunk export/import, and mutation watermark tracking.
