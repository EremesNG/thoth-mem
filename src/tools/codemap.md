# src/tools/

## Responsibility

Houses the compact MCP tool registry for the memory service. This directory turns Store-backed persistence, hybrid recall, project navigation, and session lifecycle capabilities into a small set of workflow-level callable tools.

## Design Patterns

Uses a one-file-per-tool convention: each registered `mem-*.ts` module exports a single `register...` function that calls `server.tool(...)` with a zod schema and a handler. `src/tools/index.ts` intentionally exposes only compact workflow tools instead of one tool per internal view.

Tool schemas are zod-backed, so input validation and descriptions live next to the tool handler. Most tools are thin adapters over Store methods rather than business-logic-heavy modules, which keeps the tool layer declarative and easy to audit.

## Data & Control Flow

1. The server bootstrap calls `registerTools(server, store)` from `src/tools/index.ts`.
2. `registerTools` iterates the compact `ALL_TOOLS` list.
3. Each selected module registers exactly one MCP tool via `server.tool(name, schema, handler)`.
4. Tool invocations validate input with zod, then delegate to the Store or related helpers for persistence, search, deletion, stats, or history queries.
5. Results are returned through the MCP response path; no tool keeps its own state beyond the request scope.

Representative flows include `mem_recall` running fused hybrid retrieval, `mem_save` writing observations/prompts/session summaries/passive learnings, `mem_get` fetching full records and timelines, `mem_project` navigating summaries/graph/topics, and `mem_session` managing session lifecycle.

## Integration Points

- Consumed by: server setup in `src/server.ts` / `src/index.ts` through `registerTools(...)`.
- Depends on: `McpServer` from the MCP SDK, `Store` from `src/store/index.ts`, and `zod` for schemas.
- Compact surface in: `src/tools/index.ts`.
- Representative tool modules: `mem-save.ts`, `mem-recall.ts`, `mem-context.ts`, `mem-get.ts`, `mem-project.ts`, `mem-session.ts`.
- Shared convention: tool modules stay narrowly scoped and delegate all durable work to the Store layer rather than duplicating persistence logic.
