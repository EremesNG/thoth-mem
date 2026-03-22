# src/tools/

## Responsibility

Houses the MCP tool registry and the individual tool registrations for the memory service. This directory turns the Store-backed persistence/search capabilities into callable tools, with `src/tools/index.ts` acting as the profile-aware entry point and one file per tool keeping each registration focused.

## Design Patterns

Uses a one-file-per-tool convention: each `mem-*.ts` module exports a single `register...` function that calls `server.tool(...)` with a zod schema and a handler. `src/tools/index.ts` implements a small registry/factory pattern by collecting tool metadata in `ALL_TOOLS`, then filtering by `ToolProfile` (`agent` or `admin`) before registration.

Tool schemas are zod-backed, so input validation and descriptions live next to the tool handler. Most tools are thin adapters over Store methods rather than business-logic-heavy modules, which keeps the tool layer declarative and easy to audit.

## Data & Control Flow

1. The server bootstrap calls `registerTools(server, store, profiles)` from `src/tools/index.ts`.
2. `registerTools` filters `ALL_TOOLS` by the active profile set, so `agent` tools and `admin` tools are gated at registration time.
3. Each selected module registers exactly one MCP tool via `server.tool(name, schema, handler)`.
4. Tool invocations validate input with zod, then delegate to the Store or related helpers for persistence, search, deletion, stats, or history queries.
5. Results are returned through the MCP response path; no tool keeps its own state beyond the request scope.

Representative flows include `mem_save` writing observations, `mem_search` querying indexed memory, `mem_context` and `mem_get_observation` reading stored data, and admin-only tools like `mem_delete`, `mem_stats`, and `mem_timeline` exposing maintenance/reporting operations.

## Integration Points

- Consumed by: server setup in `src/server.ts` / `src/index.ts` through `registerTools(...)`.
- Depends on: `McpServer` from the MCP SDK, `Store` from `src/store/index.ts`, and `zod` for schemas.
- Profile-gated by: `ToolProfile` in `src/tools/index.ts`, which separates `agent` tools from `admin` tools.
- Representative tool modules: `mem-save.ts`, `mem-search.ts`, `mem-context.ts`, `mem-update.ts`, `mem-delete.ts`, `mem-stats.ts`, `mem-timeline.ts`.
- Shared convention: tool modules stay narrowly scoped and delegate all durable work to the Store layer rather than duplicating persistence logic.
