# Proposal: Production Hardening and Dashboard V2

## Intent

Move thoth-mem from feature-complete retrieval parity into production-grade operation. The new work MUST harden the retrieval/indexing system with durable observability, expose every MCP call and response as traceable operational evidence, modernize the HTTP surface, and replace the existing dashboard with a v2 console built from the current four-lane memory engine: sentence vector, chunk vector, lexical FTS, and knowledge graph.

## Scope

### In Scope

- Persist sanitized, bounded trace records for every MCP tool invocation and response.
- Trace dashboard-triggered HTTP operations with the same operational model where practical.
- Add dashboard-facing endpoints for trace browsing, indexing/job health, version, rebuild graph, rebuild index, and CLI-equivalent operations that are not already covered.
- Replace the dashboard user experience from the root React app downward with a new production console.
- Use the local skills `frontend-design`, `interface-design`, and `make-interfaces-feel-better` to make a modern, agile, minimal, operator-focused interface.
- Add the `motion` package and use `motion/react` for staged screen transitions and tactile microinteractions.
- Keep existing useful API contracts where they still represent current engine capabilities.
- Add TDD coverage for trace persistence, HTTP contracts, dashboard client contracts, and operation health.
- Add production hardening evidence for provider failures, background indexing, stale jobs, and eval gates.

### Deferred / Needs Discovery

- Long-running real-provider soak tests may need to be implemented as deterministic local harnesses unless real Ollama/LM Studio services are available during verification.
- Browser visual QA requires a running local HTTP bridge and built dashboard assets.

### Out of Scope

- Remote/cloud dashboard hosting.
- Authentication, multi-user tenancy, or exposing the local dashboard beyond localhost.
- Editing generated `dist/` files directly.
- Modifying user-owned skill installation files under `.agents/skills/`.

## Approach

1. Add durable trace storage with sanitization, truncation metadata, duration, origin, status, request summary, response summary, and error details.
2. Wrap MCP tool registration through a shared tracing helper so every current and future tool gets traced consistently.
3. Add HTTP routes for traces, operation catalog, version, rebuild graph, rebuild index, and unified health/operation status.
4. Rebuild the dashboard as an operator console with five primary areas: Command, Retrieval Lanes, Traces, Indexing, and Memory Graph.
5. Install and use Motion for staged UI transitions, hover/tap affordances, and view changes.
6. Verify with focused tests first, then build, full tests, and browser visual QA.

## Affected Areas

- `src/store/schema.ts`
- `src/store/index.ts`
- `src/tools/index.ts`
- `src/tools/*.ts`
- `src/http-server.ts`
- `src/http-routes.ts`
- `src/http-openapi.ts`
- `src/cli.ts`
- `dashboard/package.json`
- `dashboard/src/**`
- `tests/store/**`
- `tests/tools/**`
- `tests/http-*.test.ts`
- `tests/dashboard/**`
- `README.md`

## Risks

- Trace payloads can accidentally expose secrets if not sanitized before persistence.
- Tracing every MCP call can add overhead or recursively trace internal memory saves if the implementation is not bounded.
- Rebuilding the dashboard wholesale can break deep links or dashboard asset serving.
- Operation endpoints that mutate state must be explicit and safe to run from localhost only.
- Provider and soak tests can become flaky if they depend on real external services.

## Rollback Plan

- Trace persistence is additive; rollback by disabling tracing at the registration layer and leaving old data inert.
- Dashboard v2 can be rolled back by reverting dashboard source files and preserving backend trace endpoints.
- New HTTP endpoints can be removed without changing existing MCP tool behavior.
- Schema additions must be idempotent and safe on startup; rollback should not require destructive migration.

## Success Criteria

- Every MCP tool call writes a durable trace row containing origin, target, timing, status, sanitized request, and sanitized response/error.
- The dashboard can display trace rows and inspect individual trace details.
- The dashboard exposes indexing/job health, stale/degraded state, queue counts, recent errors, and coverage ratios.
- The dashboard provides controls equivalent to current CLI and HTTP operations, including version, search, save, context, timeline, stats, sync, migration/delete, rebuild graph, and rebuild index.
- Dashboard v2 is visually and structurally distinct from the old dashboard and uses Motion.
- HTTP/OpenAPI docs match implemented routes.
- Focused tests, `pnpm run build`, and `pnpm test` pass.
- Visual browser QA confirms the dashboard renders nonblank, responsive, and usable.
