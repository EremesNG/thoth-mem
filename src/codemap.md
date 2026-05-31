# src/

## Responsibility
Bootstraps the Thoth MCP server, resolves runtime configuration, and wires the top-level process lifecycle. `index.ts` is the MCP stdio entrypoint, `cli.ts` is the CLI command dispatcher, `http-server.ts` and `http-routes.ts` provide a REST API bridge, `server.ts` assembles the server/store/tool graph, and `config.ts` owns environment-driven startup settings.

## Design Patterns
- Thin composition root: `createServer()` centralizes dependency construction before handing control to the MCP runtime.
- Configuration adapter: `getConfig()` maps env vars into a typed `ThothConfig` object with defaults and path resolution.
- Dependency injection by constructor/function arguments: data dir and config are passed into server setup rather than read globally.
- Process lifecycle hooks: SIGINT/SIGTERM close the store before exit.
- CLI command dispatch: `runCli()` parses arguments and routes to command handlers (search, save, timeline, context, stats, export, import, sync, migrate-project, version, help) via a `withStore` lifecycle wrapper.
- HTTP bridge with ownership/takeover: `createHttpBridge()` attempts to bind to a port; if occupied, it takes over the existing bridge via a handshake protocol.
- OpenAPI spec generation: `getOpenApiSpec(port)` dynamically builds an OpenAPI 3.0 document describing the REST API routes and schemas.
- Subsystems are isolated behind directory codemaps in `src/store/`, `src/tools/`, `src/utils/`, and `src/sync/`.

## Data & Control Flow

### MCP Stdio Path (index.ts)
1. `src/index.ts` parses CLI args from `process.argv`, recognizing `--tools=` as ignored compatibility input and `--data-dir=`.
2. `main()` calls `createServer({ dataDir })` in `src/server.ts`.
3. `server.ts` loads config via `getConfig()`, overrides `dataDir`/`dbPath` when requested, then calls `resolveDataDir(config)` to ensure the data directory exists.
4. `Store` is instantiated with the resolved SQLite path and config, then `McpServer` is created.
5. `registerTools(server, store)` installs compact tool handlers into the MCP server.
6. `index.ts` attaches a `StdioServerTransport`, registers shutdown handlers, logs startup, and connects the server to stdio.

### CLI Command Path (cli.ts)
1. `runCli()` parses `process.argv` and dispatches to command handlers (search, save, timeline, context, stats, export, import, sync, migrate-project, version, help).
2. Most commands use `withStore()` to acquire a Store instance, execute the command, and close the store on completion.
3. Command handlers delegate to Store methods, sync operations, and formatters to produce output.
4. `version.ts` provides `VERSION` constant and `getVersion()` for the version command.

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
- `src/utils/` for shared helpers used by deeper layers.
- `src/cli.ts` imports Store, sync functions, config, and formatters; exports `runCli`, `isCliError`, `VERSION`.
- `src/http-server.ts` and `src/http-routes.ts` provide REST API handlers; `http-openapi.ts` generates OpenAPI specs.
- `src/version.ts` provides runtime version from `package.json` with fallback path resolution.
- Environment variables consumed by `src/config.ts`: `THOTH_DATA_DIR`, `THOTH_MAX_CONTENT_LENGTH`, `THOTH_MAX_CONTEXT_RESULTS`, `THOTH_MAX_SEARCH_RESULTS`, `THOTH_DEDUPE_WINDOW_MINUTES`, `THOTH_PREVIEW_LENGTH`.
