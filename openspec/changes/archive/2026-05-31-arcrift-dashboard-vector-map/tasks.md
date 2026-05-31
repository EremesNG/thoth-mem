# Tasks: ArcRift-Style Vector Map Dashboard Redesign

## Phase 1: Contracts and Backend Read Models (deep-owned)
- [x] 1.1 Add visualization DTO/query contracts and state enums in store/domain types — `src/store/types.ts`
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript build succeeds with exported visualization DTO types and no type errors.

- [x] 1.2 Implement read-only visualization store slice/expand/inspect/filter/health methods with bounded limits and deterministic projection seeds — `src/store/index.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/visualization.test.ts`
  - Expected: New store visualization tests pass for bounded payloads, deterministic projection, and state encoding.

- [x] 1.3 Enforce map-facing sanitization and read-only semantics in store return shaping (including snippets/labels) — `src/store/index.ts`, `src/utils/privacy.ts`, `src/utils/sanitize.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/visualization.test.ts -t "privacy"`
  - Expected: Privacy assertions pass and visualization read models exclude disallowed private-tag content.

- [x] 1.4 Add store-level tests for deterministic projection stability and degraded/pending semantic behavior — `tests/store/visualization.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/store/visualization.test.ts`
  - Expected: Same input yields stable node IDs/order/seed coordinates; pending/degraded semantic lanes return usable non-semantic overlays with explicit health state.

## Phase 2: Visualization HTTP API and OpenAPI (deep-owned)
- [x] 2.1 Add `/viz/slice`, `/viz/expand`, `/viz/inspect/node/:id`, `/viz/inspect/edge/:id`, `/viz/filters`, `/viz/health` routes with strict input bounds and typed responses — `src/http-routes.ts`
  **Verification**:
  - Run: `pnpm test -- tests/http-server.test.ts`
  - Expected: Visualization route tests pass for bounded payloads, filter pivoting, continuation metadata, and inspector payload completeness.

- [x] 2.2 Guarantee `POST /viz/expand` is read-only (non-mutating) while returning incremental neighbors — `src/http-routes.ts`, `src/store/index.ts`
  **Verification**:
  - Run: `pnpm test -- tests/http-server.test.ts -t "viz expand read-only"`
  - Expected: Test confirms no create/update/delete side effects (record counts unchanged before/after) and expansion payload returns deterministic additions.

- [x] 2.3 Publish additive visualization schemas and path docs in OpenAPI — `src/http-openapi.ts`
  **Verification**:
  - Run: `pnpm test -- tests/http-server.test.ts -t "openapi"`
  - Expected: OpenAPI schema tests pass with documented viz endpoints, request bounds, state enums, and health semantics.

- [x] 2.4 Add API-level tests for privacy sanitization, empty/sparse/dense state signaling, and degraded/pending semantics — `tests/http-server.test.ts` (or split `tests/http-viz.test.ts`)
  **Verification**:
  - Run: `pnpm test -- tests/http-server.test.ts`
  - Expected: Viz API tests verify sanitized fields, explicit `empty|sparse|dense` states, and `ready|pending|degraded|rebuilding` health handling.

## Phase 3: Dashboard API Client and Route IA (quick/deep-owned)
- [x] 3.1 Extend dashboard API client contracts and methods for viz endpoints and inspector payloads — `dashboard/src/api/client.ts`
  **Verification**:
  - Run: `pnpm test -- tests/dashboard/api-client.test.ts`
  - Expected: API client tests pass for request/response normalization, bounded params, continuation metadata, and typed inspector parsing.

- [x] 3.2 Switch dashboard default route to map workspace and preserve legacy Graph-Lite/overview reachability — `dashboard/src/main.tsx`, `dashboard/src/router.tsx`, `dashboard/src/components/Layout.tsx`, `dashboard/src/components/GraphLiteView.tsx`
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Dashboard route/layout compiles with map-first default and legacy routes still addressable.

- [x] 3.3 Add route/layout behavior tests for map-first entry and backward-compatible navigation paths — `tests/dashboard/map-routing.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/dashboard/map-routing.test.ts`
  - Expected: Tests confirm `/` loads map workspace by default and legacy destinations remain accessible.

## Phase 4: Map Workspace and Rendering UX (designer-owned)
- [x] 4.1 Create map module scaffolding and shared map state/types — `dashboard/src/components/map/MapWorkspace.tsx`, `dashboard/src/components/map/map-types.ts`, `dashboard/src/components/map/map-state.ts`
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: New map module compiles with typed slice/selection/filter state and no unresolved imports.

- [x] 4.2 Add Canvas/D3 dashboard dependencies and refresh the lockfile before renderer imports — `dashboard/package.json`, `pnpm-lock.yaml`
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Dashboard dependency graph resolves with `d3-zoom`, `d3-force`, `d3-quadtree`, and `d3-scale` available to TypeScript, and the lockfile reflects the package changes.

- [x] 4.3 Implement canvas renderer with deterministic seed projection refinement, zoom/pan, and dense edge-thinning behavior — `dashboard/src/components/map/MapCanvas.tsx`, `dashboard/src/components/map/map-renderer.ts`, `dashboard/src/components/map/map-projection.ts`
  **Verification**:
  - Run: `pnpm --dir dashboard build`
  - Expected: Dashboard build succeeds and renderer path supports bounded draw behavior without build-time errors.

- [x] 4.4 Build filter rail and pivot controls (project/session/topic/type/relation/query/depth) with progressive loading hooks — `dashboard/src/components/map/MapFiltersPanel.tsx`, `dashboard/src/components/map/MapWorkspace.tsx`
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Filter controls compile and wire to viz slice requests with bounded depth and continuation flow.

- [x] 4.5 Build inspector panel for node/edge provenance with sanitized snippets and drilldown links — `dashboard/src/components/map/MapInspectorPanel.tsx`, `dashboard/src/components/map/MapWorkspace.tsx`
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Inspector compiles with node/edge provenance models and does not require mutation affordances.

- [x] 4.6 Apply map-first layout/styling and responsive dense/empty/sparse states across desktop/mobile — `dashboard/src/index.css`, `dashboard/src/components/Layout.tsx`, `dashboard/src/components/map/MapWorkspace.tsx`
  **Verification**:
  - Run: `pnpm --dir dashboard build`
  - Expected: Dashboard assets build successfully with responsive workspace CSS and no broken imports.

## Phase 5: End-to-End Verification and Regression Coverage (deep + designer-owned)
- [x] 5.1 Add backend regression tests for bounded payload caps, continuation cursor behavior, deterministic projection, and read-only guarantees — `tests/http-server.test.ts`, `tests/store/visualization.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/http-server.test.ts tests/store/visualization.test.ts`
  - Expected: Tests pass for caps (`limit_nodes<=1200`, `limit_edges<=3600`), deterministic stable responses, and non-mutating viz operations.

- [x] 5.2 Add frontend behavior tests for empty/sparse/dense states, selection/inspect flow, and neighbor expansion merge — `tests/dashboard/map-workspace.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/dashboard/map-workspace.test.ts`
  - Expected: Tests pass for explicit UI states, inspector population, and deterministic neighbor merge behavior.

- [x] 5.3 Add privacy-focused UI/API tests to ensure map labels/tooltips/inspector summaries never leak private-tag content — `tests/dashboard/map-workspace.test.ts`, `tests/http-server.test.ts`
  **Verification**:
  - Run: `pnpm test -- tests/dashboard/map-workspace.test.ts tests/http-server.test.ts`
  - Expected: Assertions confirm private-tag segments are stripped from all map-facing payload/UI surfaces.

- [x] 5.4 Run full repository verification (root + dashboard) after integrating all layers — repository-wide
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Root TypeScript build and dashboard production build both succeed.
  - Run: `pnpm test`
  - Expected: Full Vitest suite passes with new visualization and dashboard tests.

## Phase 6: Rollout, Visual QA, and Rollback Readiness (designer + deep-owned)
- [x] 6.1 Execute visual QA checklist for desktop/mobile map workspace and dense-state usability — `dashboard/src/components/map/*`, `dashboard/src/index.css`
  **Verification**:
  - Run: `pnpm --dir dashboard build`
  - Expected: Build succeeds and manual QA confirms usable empty/sparse/dense states, inspector legibility, and no route regressions on desktop and mobile breakpoints.

- [x] 6.2 Validate additive rollout safety and rollback switches (default-route flip without API/client breakage) — `dashboard/src/main.tsx`, `dashboard/src/router.tsx`, `src/http-routes.ts`, `src/http-openapi.ts`
  **Verification**:
  - Run: `pnpm test -- tests/http-server.test.ts tests/dashboard/map-routing.test.ts`
  - Expected: Additive `/viz` contracts pass while legacy routes remain functional when default route is reverted.

- [x] 6.3 Confirm release checklist for read-only guarantees and non-mutating `POST /viz/expand` before enabling as default — release gate
  **Verification**:
  - Run: `pnpm test -- tests/http-server.test.ts -t "read-only"`
  - Expected: Final gate confirms all viz endpoints are read-only and `POST /viz/expand` does not mutate stored memory.
