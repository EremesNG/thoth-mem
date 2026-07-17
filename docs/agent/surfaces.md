# MCP, CLI, and HTTP surfaces

## Responsibility

Owns process startup/shutdown, MCP registration and schemas, CLI parsing/output/exit behavior, HTTP routing/error mapping, OpenAPI, and operation tracing at public boundaries. Durable data behavior belongs to persistence/retrieval.

## Entry points

- `src/index.ts` and `src/server.ts`: stdio process, config/store composition, transport, and cleanup.
- `src/tools/index.ts` plus `src/tools/mem-*.ts`: six-tool MCP surface and zod-backed handlers.
- `src/cli.ts`: public commands, setup dispatch, and package-internal integration event ingress.
- `src/http-server.ts`, `src/http-routes.ts`, `src/http-openapi.ts`: HTTP bridge, takeover, routes, JSON contracts, and docs.
- `src/tools/tracing.ts` and trace store behavior: sanitized operation evidence.

## Invariants and hazards

- The compact MCP surface is exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; internal/admin capabilities stay in CLI/HTTP unless the task explicitly changes this contract.
- Tool modules remain thin, validate inputs locally, and delegate durable behavior.
- Preserve CLI stdout/stderr and exit semantics, HTTP status/error bodies, request validation, and OpenAPI agreement when public behavior changes.
- Close Store/process resources on normal and signal shutdown paths.
- Trace request/response data must remain sanitized and bounded.

## Tests and verification

- MCP: `tests/tools/`, especially `registry.test.ts` for registration changes.
- CLI/process: `tests/cli.test.ts`, `tests/index.test.ts`.
- HTTP/OpenAPI/dashboard contracts: `tests/http-server.test.ts`, `tests/http-viz.test.ts`, and relevant `tests/dashboard/` files.
- Run focused tests first. Tool registration changes require build plus full tests; public TypeScript/export changes require build. See [testing](testing.md).

## Escalate context

Load [persistence](persistence-retrieval.md) for Store/retrieval semantics, [dashboard](dashboard.md) for client consumption, or [native lifecycle](native-lifecycle.md) for package-internal event behavior.

Evidence: `src/tools/index.ts`, `src/cli.ts`, `src/http-routes.ts`, `src/http-server.ts`, `src/http-openapi.ts`, and matching tests.
