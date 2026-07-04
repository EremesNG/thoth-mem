# Tasks: Include Superseded HTTP History

## Scope
- Preserve existing behavior by default: only current facts are returned unless explicitly requested.
- Expose opt-in `include_superseded=true` on HTTP project graph and observatory ledger routes.
- Reuse existing store history support without schema or MCP registry changes.
- Validate OpenAPI docs and payload annotation for the optional `superseded` field.
- Focus on the following non-goals: no MCP tool changes, no schema migration, no multi-harness, no default include of superseded facts.

## Traceability Note
- All implementation tasks map to the proposal success criteria in:
  - `proposal/Project Graph History Opt-In`
  - `proposal/Observatory Ledger History Opt-In`
  - `proposal/OpenAPI Documentation`
  - `proposal/HTTP Behavior`.

## Phase 1: Implementation foundations

- [x] 1.1 Add `include_superseded` query parsing for project graph while preserving default current-only behavior (omitted/false-like values treated as false) in `src/http-routes.ts`.
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Project Graph History Opt-In`
  **Independent Test:** Requesting `/projects/{project}/graph` without `include_superseded` and with empty/invalid values returns only current facts (no historical entries).
  **Verification:**
  - Run: `pnpm test -- tests/http-server.test.ts -t "project graph"`
  - Expected: Assertions for default-current-only behavior pass and no historical rows appear for default/false-like values.

- [x] 1.2 Pass parsed `include_superseded` into Store graph retrieval and keep default-only behavior unchanged for existing clients in `src/http-routes.ts`.
  **[USN-2]** | Priority: P1
  **Spec:** `proposal/Project Graph History Opt-In`
  - Route `/projects/{project}/graph` should call `store.getObservationFacts({ project, topic_key, include_superseded })`.
  - Route-level default must remain `include_superseded=false` when query is absent or not exactly `true`.
  **Independent Test:** Querying `/projects/{project}/graph` with and without `include_superseded=true` flips inclusion of superseded facts while no query yields current-only results.
  **Verification:**
  - Run: `pnpm test -- tests/http-server.test.ts -t "/projects/{project}/graph|include_superseded"`
  - Expected: Default queries return only current facts; `include_superseded=true` includes tagged superseded fact objects when available.

- [x] 1.3 Extend graph route helper typing for `include_superseded` and preserve existing Store fact input compatibility in `src/http-routes.ts` and `src/store/types.ts`.
  **[USN-3]** | Priority: P2
  **Spec:** `proposal/Project Graph History Opt-In`
  **Independent Test:** Type and call sites accept optional `include_superseded` without breaking existing compile-time or runtime paths.
  **Verification:**
  - Run: `pnpm run build`
  - Expected: TypeScript build succeeds and existing callers still compile with the optional field.

- [x] 1.4 Add `include_superseded` propagation on observatory ledger detail route handler while preserving current-only default behavior in `src/http-routes.ts`.
  **[USN-4]** | Priority: P1
  **Spec:** `proposal/Observatory Ledger History Opt-In`
  **Independent Test:** `/observatory/ledger/{id}` defaults to current-only and only exposes historical facts when query equals `true`.
  **Verification:**
  - Run: `pnpm test -- tests/http-viz.test.ts -t "observatory ledger|include_superseded"`
  - Expected: Default route response is unchanged in current-only mode; opt-in adds superseded items.

- [x] 1.5 Pass flag to observatory ledger storage path in `src/store/index.ts` and formalize the optional input contract in `src/store/types.ts` if the ledger input is exported there.
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Observatory Ledger History Opt-In`
  - Ensure `handleObservatoryLedger` / `getObservatoryLedgerDetail` forwards include_superseded into `getObservationFacts({ observation_id, include_superseded })`.
  **Independent Test:** Ledger detail data source calls are fed `include_superseded` and return tagged superseded items only when true.
  **Verification:**
  - Run: `pnpm test -- tests/http-viz.test.ts -t "ledger detail|observation facts"`
  - Expected: Tests validate default false and explicit true behavior through the store call path.

- [x] 1.6 Update HTTP OpenAPI definitions for query parameter and response payload documentation in `src/http-openapi.ts`.
  **[USN-6]** | Priority: P1
  **Spec:** `proposal/OpenAPI Documentation`
  - Document optional `include_superseded` query parameter for `/projects/{project}/graph` and `/observatory/ledger/{id}`.
  - Ensure fact schemas indicate `superseded` is optional and present only when historical records are returned.
  **Independent Test:** OpenAPI schema inspection for both routes includes `include_superseded` and optional `superseded` on relevant fact objects.
  **Verification:**
  - Run: `pnpm test -- tests/http-server.test.ts -t "openapi|/projects/{project}/graph|/observatory/ledger/{id}"`
  - Expected: OpenAPI-related tests pass with matching parameter and schema assertions.

## Phase 2: Test execution (focused behavior)

- [x] 2.1 Add focused HTTP test for project graph default current-only behavior in `tests/http-server.test.ts`.
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Project Graph History Opt-In`
  - Add explicit assertions for `/projects/{project}/graph` when `include_superseded` is omitted (or false-like) returning only current facts.
  **Independent Test:** Missing/false-like query values never include `superseded` rows.
  **Verification:**
  - Run: `pnpm test -- tests/http-server.test.ts -t "project graph default current"`
  - Expected: Test passes and fixture confirms current-only output.

- [x] 2.2 Add focused HTTP test for project graph opt-in behavior in `tests/http-server.test.ts`.
  **[USN-8]** | Priority: P1
  **Spec:** `proposal/Project Graph History Opt-In`
  - Add request using `include_superseded=true` and assert tagged historical facts include `superseded: true` when applicable.
  **Independent Test:** Same route with opt-in includes historical fact records that are not present in default mode.
  **Verification:**
  - Run: `pnpm test -- tests/http-server.test.ts -t "project graph include_superseded"`
  - Expected: Opt-in call returns both current and historical facts; historical ones may include `superseded` markers.

- [x] 2.3 Add focused HTTP test for observatory ledger default current-only behavior in `tests/http-viz.test.ts`.
  **[USN-9]** | Priority: P1
  **Spec:** `proposal/Observatory Ledger History Opt-In`
  - Verify `/observatory/ledger/{id}` remains current-only unless opt-in flag is explicitly true.
  **Independent Test:** Default route has no superseded rows in response.
  **Verification:**
  - Run: `pnpm test -- tests/http-viz.test.ts -t "ledger default current"`
  - Expected: Observed fact list excludes superseded entries by default.

- [x] 2.4 Add focused HTTP test for observatory ledger opt-in behavior in `tests/http-viz.test.ts`.
  **[USN-10]** | Priority: P1
  **Spec:** `proposal/Observatory Ledger History Opt-In`
  - Verify `/observatory/ledger/{id}?include_superseded=true` includes historical facts with optional `superseded` marker.
  **Independent Test:** Opt-in route response includes additional historical items not returned by default mode.
  **Verification:**
  - Run: `pnpm test -- tests/http-viz.test.ts -t "ledger include_superseded"`
  - Expected: Superseded facts are included when flagged and absent when omitted.

- [x] 2.5 Add/extend OpenAPI behavior tests to validate schema + default/opt-in parameter semantics in `tests/http-server.test.ts`.
  **[USN-11]** | Priority: P1
  **Spec:** `proposal/OpenAPI Documentation`
  - Assert `/projects/{project}/graph` and `/observatory/ledger/{id}` docs include `include_superseded` and that `superseded` fact field remains optional.
  **Independent Test:** OpenAPI response schema test covers both endpoints and the conditional fact marker.
  **Verification:**
  - Run: `pnpm test -- tests/http-server.test.ts -t "openapi"`
  - Expected: OpenAPI schema assertions for both endpoints pass.

## Phase 3: Verification and close

- [x] 3.1 Regression check against existing visualization or related store tests (optional reference only) and focused suites.
  **[USN-12]** | Priority: P2
  **Spec:** `proposal/HTTP Behavior`
  - Re-run targeted regression-focused suites for API behavior only; do not add MCP or schema migration coverage in this change.
  **Independent Test:** `tests/store/visualization.test.ts` and any related route tests that define required fixtures remain stable when this change is included.
  **Verification:**
  - Run: `pnpm test -- tests/http-server.test.ts tests/http-viz.test.ts`
  - Expected: Focused HTTP/OpenAPI suites pass with no regressions to current-only defaults.

- [x] 3.2 Build check for all changed paths.
  **[USN-13]** | Priority: P1
  **Spec:** `proposal/Project Graph History Opt-In` `proposal/Observatory Ledger History Opt-In`
  - Validate type safety and module integrity after updates.
  **Independent Test:** `pnpm run build`.
  **Verification:**
  - Run: `pnpm run build`
  - Expected: `pnpm run build` succeeds with zero TypeScript errors.

- [x] 3.3 Full test verification gate.
  **[USN-14]** | Priority: P2
  **Spec:** `proposal/Project Graph History Opt-In` `proposal/Observatory Ledger History Opt-In`
  - Run full suite to ensure no behavioral regressions outside touched paths.
  **Independent Test:** `pnpm test`
  **Verification:**
  - Run: `pnpm test`
  - Expected: Entire suite passes.
