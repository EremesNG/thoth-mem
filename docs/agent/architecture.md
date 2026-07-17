# Shared architecture

Use this document for cross-domain changes or when local ownership is unclear. Verify material claims against current runtime entrypoints, registrations/imports, manifests, and tests.

## System shape

- `src/index.ts` and `src/server.ts` compose the stdio MCP process, configuration, SQLite `Store`, and compact tool registry.
- `src/cli.ts` owns public command dispatch and the package-internal integration-event route.
- `src/http-server.ts`, `src/http-routes.ts`, and `src/http-openapi.ts` expose the REST/dashboard bridge.
- The store is the durable core. Retrieval, indexing, graph, maintenance, and sync behavior build around it rather than living in surface handlers.
- `src/integration/` owns host-neutral lifecycle decisions and host adapters; `integrations/` contains published host assets.
- `src/setup/` owns bounded setup planning/mutation/verification/rollback. `integrations/inventory.json` owns the published native asset list.
- `dashboard/` is a separate React/Vite workspace that consumes HTTP contracts and is bundled by the root build.

## Principal flows

### MCP and memory

1. `src/index.ts` parses process options and calls `createServer()`.
2. `src/server.ts` resolves configuration, creates `Store`, and calls `registerTools()`.
3. `src/tools/index.ts` registers exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.
4. Tool adapters validate inputs and delegate durable behavior to the store/retrieval layers.

### CLI and HTTP

- `src/cli.ts` uses store-scoped command handlers and cleanup wrappers for data/admin operations; setup and integration events cross into their owning domains.
- HTTP requests are matched and validated in `src/http-routes.ts`; handlers call Store, retrieval, indexing, maintenance, or sync behavior and return JSON. OpenAPI is generated separately.

### Native lifecycle and managed delivery

- Published host assets send bounded native events into the package-internal route. Capability evidence is resolved before adapter selection; confirmed memory effects precede host output.
- Managed setup determines a bounded target and immutable strategy before mutation. Receipts and ownership checks limit recovery and rollback.
- Asset synchronization is explicit; verification checks inventory/package/runtime consistency. Live host smoke is not part of normal automated gates.

## Dependency and ownership rules

- Surface handlers may depend on Store/retrieval behavior; durable persistence rules must not be reimplemented in handlers.
- Dashboard types can mirror HTTP contracts, but an HTTP contract change remains surfaces-primary.
- Native lifecycle behavior and installation ownership are separate: `src/integration/` owns event semantics; `src/setup/` and inventory/scripts own installation and delivery.
- Generated `dist/` is output, never a source of edits.

## Evidence and uncertainty

Verified from `src/tools/index.ts`, `src/cli.ts`, `src/http-routes.ts`, `src/integration/`, `src/setup/`, manifests, current tests, and CI. Recheck current symbols and tests before changing behavior.
