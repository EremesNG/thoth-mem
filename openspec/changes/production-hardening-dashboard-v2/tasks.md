# Tasks: Production Hardening and Dashboard V2

## Phase 1: Trace Foundation

- [x] 1.1 Add failing store tests for operation trace persistence and sanitization — `tests/store/operation-traces.test.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/operation-traces.test.ts`
  - Expected: Tests fail because trace schema/store helpers do not exist yet.

- [x] 1.2 Implement trace schema, sanitization utility, and store helpers — `src/store/schema.ts`, `src/store/index.ts`, `src/utils/trace-sanitize.ts`, `src/store/types.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/operation-traces.test.ts`
  - Expected: Trace persistence, listing, detail lookup, redaction, and truncation tests pass.

- [x] 1.3 Add failing MCP wrapper tests proving representative tools are traced — `tests/tools/trace-wrapper.test.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/trace-wrapper.test.ts`
  - Expected: Tests fail before tool registration tracing exists.

- [x] 1.4 Implement MCP tracing wrapper for all registered tools — `src/tools/tracing.ts`, `src/tools/*.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/trace-wrapper.test.ts tests/tools/registry.test.ts`
  - Expected: MCP calls create trace rows and registry behavior stays compatible.

## Phase 2: HTTP Operations and Indexing Contracts

- [x] 2.1 Add failing HTTP tests for trace endpoints, operation catalog, version, rebuild graph, and rebuild index — `tests/http-server.test.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/http-server.test.ts -t "operation traces|operation catalog|rebuild|version"`
  - Expected: Tests fail because routes are missing.

- [x] 2.2 Implement HTTP trace routes and operation catalog — `src/http-server.ts`, `src/http-routes.ts`, `src/http-openapi.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/http-server.test.ts -t "operation traces|operation catalog"`
  - Expected: Trace list/detail and operation catalog tests pass.

- [x] 2.3 Implement HTTP version, rebuild graph, rebuild index, and indexing status routes — `src/http-routes.ts`, `src/http-server.ts`, `src/http-openapi.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/http-server.test.ts -t "rebuild|version"`
  - Expected: CLI-equivalent route tests pass and OpenAPI includes the new operations.

- [x] 2.4 Extend indexing health with queue lag and job-kind metrics — `src/store/index.ts`, `src/store/types.ts`, `tests/store/visualization.test.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/visualization.test.ts tests/http-viz.test.ts`
  - Expected: Health responses expose stale/degraded lanes, coverage, queue counts, queue age, and recent errors.

## Phase 3: Dashboard V2 Data Layer

- [x] 3.1 Install Motion and add dashboard client tests for new endpoints — `dashboard/package.json`, `tests/dashboard/api-client.test.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/dashboard/api-client.test.ts`
  - Expected: Tests fail until the client exposes trace, operation, version, and rebuild calls.

- [x] 3.2 Implement Dashboard v2 API client types and request helpers — `dashboard/src/api/client.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/dashboard/api-client.test.ts`
  - Expected: Dashboard client tests pass with new endpoints.

## Phase 4: Dashboard V2 Interface

- [x] 4.1 Replace app shell, routes, and visual system from scratch — `dashboard/src/App.tsx`, `dashboard/src/index.css`, `dashboard/src/routes.ts`
  **Verification**:
  - Run: `pnpm --dir dashboard typecheck`
  - Expected: New shell typechecks and old obsolete routes no longer drive the experience.

- [x] 4.2 Build Command and Operations workspace — `dashboard/src/App.tsx`
  **Verification**:
  - Run: `pnpm --dir dashboard typecheck`
  - Expected: Operation catalog renders controls for read/write/admin/sync/indexing actions with safe response previews.

- [x] 4.3 Build Traces workspace — `dashboard/src/App.tsx`
  **Verification**:
  - Run: `pnpm --dir dashboard typecheck`
  - Expected: MCP/HTTP traces can be listed, filtered, and inspected with sanitized request/response payloads.

- [x] 4.4 Build Retrieval Lanes and Memory Graph workspace — `dashboard/src/App.tsx`
  **Verification**:
  - Run: `pnpm --dir dashboard typecheck`
  - Expected: Sentence vector, chunk vector, lexical FTS, and KG evidence are visible in recall and graph exploration.

- [x] 4.5 Build Indexing and Background workspace — `dashboard/src/App.tsx`
  **Verification**:
  - Run: `pnpm --dir dashboard typecheck`
  - Expected: Queue counts, stale/degraded lanes, coverage, recent errors, and rebuild controls render from live API contracts.

- [x] 4.6 Add Motion transitions and microinteractions — `dashboard/src/**`
  **Verification**:
  - Run: `pnpm --dir dashboard build`
  - Expected: Build passes and Motion is used for staged transitions and tactile controls.

## Phase 5: Hardening Evidence and Documentation

- [x] 5.1 Add deterministic hardening tests for trace visibility under provider/background failures — `tests/http-server.test.ts`, `tests/http-viz.test.ts`
  **Verification**:
  - Run: `pnpm exec vitest run tests/retrieval/remote-provider.test.ts tests/retrieval/hyde-generator.test.ts tests/indexing/kg-llm-generator.test.ts tests/http-server.test.ts`
  - Expected: Provider failures and background warnings remain visible through traces or health.

- [x] 5.2 Update README with Dashboard v2, trace logging, and operations console behavior — `README.md`
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Documentation changes do not break build and describe actual endpoints/scripts.

- [x] 5.3 Run full verification — all modules
  **Verification**:
  - Run: `pnpm run eval:retrieval`
  - Expected: Retrieval eval remains rank-1 gated.
  - Run: `pnpm run eval:kg`
  - Expected: KG quality eval passes.
  - Run: `pnpm run build`
  - Expected: TypeScript and dashboard production build pass.
  - Run: `pnpm test`
  - Expected: Full Vitest suite passes.

- [x] 5.4 Run browser visual QA for Dashboard v2 — local HTTP bridge and Browser/Playwright
  **Verification**:
  - Run: local server plus browser checks for desktop and mobile viewport
  - Expected: Dashboard renders nonblank, responsive, no incoherent overlap, key workspaces visible, and console has no blocking errors.
