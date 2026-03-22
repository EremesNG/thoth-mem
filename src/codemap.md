# src/

## Responsibility
Bootstraps the Thoth MCP server, resolves runtime configuration, and wires the top-level process lifecycle. `index.ts` is the CLI entrypoint, `server.ts` assembles the server/store/tool graph, and `config.ts` owns environment-driven startup settings.

## Design Patterns
- Thin composition root: `createServer()` centralizes dependency construction before handing control to the MCP runtime.
- Configuration adapter: `getConfig()` maps env vars into a typed `ThothConfig` object with defaults and path resolution.
- Dependency injection by constructor/function arguments: profiles and data dir are passed into server setup rather than read globally.
- Process lifecycle hooks: SIGINT/SIGTERM close the store before exit.
- Subsystems are isolated behind directory codemaps in `src/store/`, `src/tools/`, and `src/utils/`.

## Data & Control Flow
1. `src/index.ts` parses CLI args from `process.argv`, recognizing `--tools=` and `--data-dir=`.
2. `main()` calls `createServer({ profiles, dataDir })` in `src/server.ts`.
3. `server.ts` loads config via `getConfig()`, overrides `dataDir`/`dbPath` when requested, then calls `resolveDataDir(config)` to ensure the data directory exists.
4. `Store` is instantiated with the resolved SQLite path and config, then `McpServer` is created.
5. `registerTools(server, store, profiles)` installs tool handlers into the MCP server.
6. `index.ts` attaches a `StdioServerTransport`, registers shutdown handlers, logs startup, and connects the server to stdio.

## Integration Points
- `@modelcontextprotocol/sdk/server/stdio.js` for stdio transport in `src/index.ts`.
- `@modelcontextprotocol/sdk/server/mcp.js` for `McpServer` creation in `src/server.ts`.
- `src/store/` for SQLite-backed persistence and observation/search state.
- `src/tools/` for MCP tool registration and profile-based tool exposure.
- `src/utils/` for shared helpers used by deeper layers.
- Environment variables consumed by `src/config.ts`: `THOTH_DATA_DIR`, `THOTH_MAX_CONTENT_LENGTH`, `THOTH_MAX_CONTEXT_RESULTS`, `THOTH_MAX_SEARCH_RESULTS`, `THOTH_DEDUPE_WINDOW_MINUTES`, `THOTH_PREVIEW_LENGTH`.
