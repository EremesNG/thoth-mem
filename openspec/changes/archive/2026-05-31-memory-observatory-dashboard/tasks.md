# Tasks: Memory Observatory Dashboard

## Phase 1: Backend Store and Contract Foundations
- [x] 1.1 Define observatory domain types for context, pivot tokens, frontier state, lane evidence, ledger payloads, timeline windows, and health snapshots in `src/store/types.ts`.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript compiles with new observatory type exports and no type regressions.

- [x] 1.2 Implement scoped observatory read-model methods in `src/store/index.ts` for context resolution, recall lanes (`lexical`, `sentence-vector`, `chunk-vector`, `fact-kg`), frontier traversal, timeline windows, ledger detail, and health/index readiness while preserving read-only behavior.
  **Verification**:
  - Run: `pnpm test -- tests/store/visualization.test.ts`
  - Expected: Visualization/store tests pass and validate deterministic frontier semantics (`added`, `already_visible`, `exhausted`, `continuation`).

- [x] 1.3 Enforce local-first and privacy-safe response shaping in observatory store outputs, including private-tag-safe previews and provenance references without exposing disallowed private content.
  **Verification**:
  - Run: `pnpm test -- tests/utils/privacy.test.ts`
  - Expected: Privacy safeguards remain enforced for rendered/returned content.

## Phase 2: HTTP and API Contracts
- [x] 2.1 Add `/observatory/*` HTTP handlers in `src/http-routes.ts` for context, recall, pivot, map frontier, ledger detail, timeline, and health with read-only request handling.
  **Verification**:
  - Run: `pnpm test -- tests/http-viz.test.ts`
  - Expected: HTTP visualization tests pass with observatory route coverage and no mutation endpoints introduced.

- [x] 2.2 Extend OpenAPI contracts in `src/http-openapi.ts` to document context tokens, pivot tokens, frontier outcomes, lane evidence payloads, and degraded/stale health semantics.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build succeeds with updated HTTP/OpenAPI typing and schema references.

- [x] 2.3 Add invalid/expired pivot-token and bounded-frontier continuation handling in API responses so cross-surface pivots preserve scope or fail explicitly.
  **Verification**:
  - Run: `pnpm test -- tests/http-viz.test.ts`
  - Expected: Tests confirm deterministic error handling and continuation signaling for bounded traversal.

## Phase 3: Dashboard State and API Client
- [x] 3.1 Implement `dashboard/src/components/observatory/context-store.ts` as shared source of truth for project/session/topic/time/query/lane/focus/frontier state and context-preserving pivot updates.
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Dashboard typecheck passes with strongly typed shared observatory state.

- [x] 3.2 Implement `dashboard/src/components/observatory/pivot-token.ts` for encode/decode/validate helpers and compatibility-safe parsing from API payloads.
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Token helpers compile and integrate with observatory state/client contracts.

- [x] 3.3 Update `dashboard/src/api/client.ts` with observatory endpoints and typed lane/frontier/ledger/timeline/health payload clients while retaining `/viz/*` legacy fallback calls.
  **Verification**:
  - Run: `pnpm test -- tests/dashboard/api-client.test.ts`
  - Expected: API client tests pass with observatory payload compatibility and legacy fallback support.

## Phase 4: Observatory Surfaces and Interaction Semantics
- [x] 4.1 Add `dashboard/src/components/observatory/ObservatoryWorkspace.tsx` to compose Recall Workspace, Memory Map, Timeline, Knowledge Ledger, and Health/Indexing surfaces in one coordinated workspace.
  **Verification**:
  - Run: `pnpm test -- tests/dashboard/map-workspace.test.ts`
  - Expected: Workspace tests pass with multi-surface coordination and non-reset shared scope behavior.

- [x] 4.2 Add `dashboard/src/components/observatory/RecallWorkspace.tsx` with explicit lane evidence groups, provenance affordances, and pivot actions to map/timeline/ledger while preserving scope.
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Recall lane/evidence UI compiles with typed pivot payloads and context bindings.

- [x] 4.3 Add `dashboard/src/components/observatory/MemoryMapSurface.tsx` and adapt `dashboard/src/components/map/*` utilities for true depth/frontier semantics, incremental neighbor expansion, and context-preserving map pivots.
  **Verification**:
  - Run: `pnpm test -- tests/dashboard/map-routing.test.ts`
  - Expected: Map routing tests pass with deterministic depth/expand behavior and preserved context tokens.

- [x] 4.4 Add `dashboard/src/components/observatory/TimelineSurface.tsx` with scoped window navigation and continuation-aware playback that pivots to ledger/map without losing active context.
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Timeline surface compiles with scoped window and pivot token contracts.

- [x] 4.5 Add `dashboard/src/components/observatory/KnowledgeLedgerSurface.tsx` rendering What/Why/Where/Learned, fact triples, provenance/source chains, and confidence context for explanation.
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Ledger surface compiles with structured semantic payload typing and provenance fields.

- [x] 4.6 Add `dashboard/src/components/observatory/HealthIndexingSurface.tsx` to display lane/index readiness, degraded/stale states, and user-visible impact hints across observatory surfaces.
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Health/indexing surface compiles with capability/degradation payload contracts.

- [x] 4.7 Enforce organic motion and accessibility constraints across observatory panels (`prefers-reduced-motion`, keyboard pivot traversal/focus management, bounded transitions, non-idle continuous motion).
  **Verification**:
  - Run: `pnpm run dashboard:build`
  - Expected: Dashboard builds successfully with accessibility/motion-safe UI integration.

## Phase 5: Routing, Legacy Adapters, and Compatibility
- [x] 5.1 Switch default dashboard route to observatory workspace in `dashboard/src/App.tsx`, `dashboard/src/routes.ts`, and `dashboard/src/router.tsx` while preserving query/state token continuity.
  **Verification**:
  - Run: `pnpm test -- tests/dashboard/map-routing.test.ts`
  - Expected: Routing tests pass with `/` resolving to observatory and deep-link continuity retained.

- [x] 5.2 Convert legacy views (`dashboard/src/components/Layout.tsx`, `Overview.tsx`, `SearchExplorer.tsx`, `GraphLiteView.tsx`) into lightweight adapters/redirects that open observatory pivots without context loss.
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Legacy compatibility components compile and route into observatory adapters.

- [x] 5.3 Keep backward-compatible `/viz/*` behavior during rollout while ensuring observatory-first UX remains canonical.
  **Verification**:
  - Run: `pnpm test -- tests/http-viz.test.ts`
  - Expected: Existing visualization API regression tests still pass alongside new observatory contracts.

## Phase 6: Test Expansion, Build Gates, and Visual QA
- [x] 6.1 Add or extend dashboard integration tests under `tests/dashboard/*` for pivot chains (`recall -> map -> timeline -> ledger -> recall`), shared context persistence, reduced-motion behavior, and keyboard accessibility flows.
  **Verification**:
  - Run: `pnpm test -- tests/dashboard/map-workspace.test.ts`
  - Expected: Dashboard workspace tests validate cross-surface pivots and accessibility-sensitive behavior.

- [x] 6.2 Extend store/API tests in `tests/store/visualization.test.ts` and `tests/http-viz.test.ts` for lane payload attribution, frontier classification determinism, continuation bounds, and ledger/timeline/health payload correctness.
  **Verification**:
  - Run: `pnpm test -- tests/store/visualization.test.ts`
  - Expected: Store visualization tests confirm deterministic frontier and semantics-rich payload behavior.

- [x] 6.3 Run release gate checks for observatory rollout readiness across dashboard and server packages.
  **Verification**:
  - Run: `pnpm run dashboard:typecheck`
  - Expected: Dashboard TypeScript checks pass.
  - Run: `pnpm run dashboard:build`
  - Expected: Dashboard production build succeeds.
  - Run: `pnpm run build`
  - Expected: Root TypeScript + dashboard composite build succeeds.
  - Run: `pnpm test`
  - Expected: Full test suite passes with observatory changes and no regressions.
