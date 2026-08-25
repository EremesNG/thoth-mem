# MCP and CLI surfaces

The model-visible registry is exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`. `src/tools/index.ts` owns v2 validation and structured envelopes; `src/server.ts` constructs one `MemoryService`; `src/index.ts` owns stdio lifetime; `src/cli.ts` exposes only scoped setup, lifecycle runner, and one-way import operations.

There is no v1 schema negotiation, graph action, HTTP route, dashboard, model provider, or hidden Store fallback. Errors use bounded safe messages. Structured JSON is authoritative and text is a bounded rendering.
