# Tasks: Dashboard SPA for Memory Exploration

> Accelerated pipeline note: this task plan derives from `proposal.md`; no separate spec/design artifact is expected. Keep implementation read-only and do not add dashboard create/edit/delete memory flows.

## Phase 1: Frontend Scaffold and Package Boundary

- [x] 1.1 Create the Vite React TypeScript app boundary — `dashboard/`
  - Create `dashboard/package.json` or equivalent frontend workspace metadata, `dashboard/index.html`, `dashboard/src/`, `dashboard/tsconfig*.json`, and Vite config.
  - Configure Vite production output to `../dist/dashboard/` and keep generated assets out of source edits.
  - Use local bundled assets only; do not add CDN or telemetry dependencies.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts -t "serves health, OpenAPI, and Swagger docs"`
  - Expected: Existing HTTP docs/OpenAPI behavior still passes before backend integration changes.

- [x] 1.2 Add root package scripts and package inclusion for dashboard assets — `package.json`
  - Add explicit `dashboard:build` and `dashboard:typecheck` scripts and wire release packaging so `dist/dashboard/` can be produced and included with `dist`.
  - Keep backend-only test workflow independent of browser/runtime test requirements.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts -t "serves health, OpenAPI, and Swagger docs"`
  - Expected: Existing backend tests remain runnable after script/package metadata changes.

- [x] 1.3 Add minimal dashboard app shell and routing primitives — `dashboard/src/`
  - Create app layout, client-side route definitions, shared state components, and navigation for overview, project detail, search, observation detail, topic keys, and graph-lite.
  - Ensure direct navigation paths are compatible with a later SPA fallback served by the Node HTTP bridge.
  **Verification**:
  - Run: `npm run dashboard:typecheck && npm run dashboard:build`
  - Expected: Dashboard TypeScript and Vite production build complete and write files under `dist/dashboard/`.

## Phase 2: Typed Read-Only API Client

- [x] 2.1 Implement typed fetch infrastructure — `dashboard/src/api/`
  - Add common request helpers, URL/query serialization, JSON parsing, abort/error handling, and normalized dashboard error objects.
  - Represent loading, empty, and error outcomes without throwing through React components.
  **Verification**:
  - Run: `npm run dashboard:typecheck && npm run dashboard:build`
  - Expected: API helpers typecheck and bundle without dashboard-only backend assumptions.

- [x] 2.2 Add typed wrappers for existing read endpoints — `dashboard/src/api/`
  - Cover `GET /stats`, `GET /context`, `GET /observations/search`, `GET /observations/:id`, `GET /timeline`, `GET /projects/{project}/summary`, `GET /projects/{project}/topic-keys`, and `GET /projects/{project}/graph`.
  - Use explicit `limit`, `max_chars`, `before`, `after`, `mode`, and filter query params where supported.
  - Do not call mutation endpoints from the dashboard client.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts -t "serves project view tools through HTTP endpoints"`
  - Expected: Existing project summary, topic-key, and graph endpoint contracts still match client expectations.

## Phase 3: Dashboard Screens and UX States

- [x] 3.1 Build overview screen — `dashboard/src/`
  - Display `/stats` totals, project links, recent context entry points from `/context`, and clear empty states when memory is empty.
  - Include privacy/local-first badges that explain content is served by the local HTTP bridge.
  **Verification**:
  - Run: `npm run dashboard:typecheck && npm run dashboard:build`
  - Expected: Overview route compiles and renders typed stats/context data paths.

- [x] 3.2 Build project detail screen — `dashboard/src/`
  - Use `/projects/{project}/summary` as the primary project view, with links to search, topic keys, and graph-lite for the same project.
  - Preserve markdown/text payloads safely as text or sanitized rendering; do not execute embedded content.
  **Verification**:
  - Run: `npm run dashboard:typecheck && npm run dashboard:build`
  - Expected: Project route handles encoded project names and summary empty/error states.

- [x] 3.3 Build search explorer — `dashboard/src/`
  - Add query, project, type, scope, topic-key exact, mode, and limit controls for `/observations/search`.
  - Render compact/preview response variants and provide result links to observation detail.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts -t "search mode via HTTP"`
  - Expected: Existing compact, preview, and exact topic-key search HTTP contracts remain compatible.

- [x] 3.4 Build observation detail and timeline screen — `dashboard/src/`
  - Fetch `/observations/:id` with content pagination controls and `/timeline` with bounded before/after values.
  - Show full metadata, privacy badges, revision indicators, timeline neighbors, and copy-agent-context actions.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts -t "supports observation CRUD, search, and paginated retrieval"`
  - Expected: Observation retrieval and pagination contracts remain stable for dashboard consumption.

- [x] 3.5 Build topic-key browser — `dashboard/src/`
  - List `/projects/{project}/topic-keys`, support exact-key drilldown with `topic_key`, `limit`, and `max_chars`, and expose copy-agent-context for exact-key recall.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts -t "serves project view tools through HTTP endpoints"`
  - Expected: Topic-key list and exact context payloads are available through existing HTTP endpoints.

- [x] 3.6 Build graph-lite table/list view — `dashboard/src/`
  - Render `/projects/{project}/graph` as filterable table/list facts with project, topic-key, relation, limit, and max-chars controls.
  - Keep graph-lite textual/tabular; do not introduce force-directed canvases or heavy graph visualization.
  **Verification**:
  - Run: `npm run dashboard:typecheck && npm run dashboard:build`
  - Expected: Graph-lite route compiles and keeps bounded request controls.

## Phase 4: HTTP Static Serving Integration

- [x] 4.1 Add safe dashboard static file serving helpers — `src/http-server.ts`
  - Resolve dashboard assets from `dist/dashboard/`, enforce path containment, reject directory traversal, and map common Vite asset MIME types explicitly.
  - Return a clear local message at `/` when `dist/dashboard/index.html` is absent while leaving APIs available.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts -t "returns structured errors for bad routes, bad JSON, invalid input, and missing observations"`
  - Expected: Existing error responses remain structured while static serving helpers are introduced.

- [x] 4.2 Integrate route precedence and SPA fallback — `src/http-server.ts`
  - Match existing REST routes, `/docs`, and `/openapi.json` before static assets or SPA fallback.
  - Serve `/` as `dist/dashboard/index.html`, serve concrete assets, and apply SPA fallback only after API/docs/openapi/static route checks fail.
  - Prevent fallback from shadowing unknown API-like paths.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts`
  - Expected: HTTP bridge tests pass, including new route precedence, static asset, SPA fallback, and traversal cases.

- [x] 4.3 Add focused static-serving and route-conflict tests — `tests/http-server.test.ts`
  - Cover root dashboard response with built assets, missing-assets root behavior, asset MIME types, path traversal rejection, SPA deep-link fallback, and non-conflict with `/docs`, `/openapi.json`, `/stats`, `/context`, `/observations/search`, `/observations/:id`, `/timeline`, project summary, topic-key, and graph endpoints.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts`
  - Expected: Tests prove dashboard fallback never changes existing REST/OpenAPI/docs route behavior.

## Phase 5: Documentation and Release Notes

- [x] 5.1 Update user documentation only where HTTP/dashboard behavior is already documented — `README.md`
  - If README still documents the HTTP server without dashboard root behavior, add concise local dashboard usage, build/release notes, `/docs` preservation, and read-only/privacy caveats.
  - Do not create broad docs rewrites unrelated to the HTTP server/dashboard.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts -t "serves health, OpenAPI, and Swagger docs"`
  - Expected: Documentation-only changes do not affect HTTP API behavior.

- [x] 5.2 Verify package output conventions — `package.json`, `dashboard/`, `dist/dashboard/`
  - Confirm generated dashboard assets are included through existing package `files` behavior and that source remains maintainable in `dashboard/`.
  - Keep `dist/` generated; do not hand-edit compiled dashboard assets.
  **Verification**:
  - Run: `npm run dashboard:typecheck && npm run dashboard:build`
  - Expected: `dist/dashboard/index.html` and Vite assets are produced by the script, not manual edits.

## Phase 6: Guardrails and Final Verification

- [x] 6.1 Enforce read-only dashboard MVP guardrails — `dashboard/src/`
  - Audit dashboard routes and API client exports to ensure no create, update, delete, prompt-save, import/export, sync, migration, auth, multi-user, vector retrieval, or new SQLite/schema behavior is introduced.
  **Verification**:
  - Run: `npm run dashboard:typecheck && npm run dashboard:build`
  - Expected: Dashboard build contains only read-only API usage and no mutation flows.

- [x] 6.2 Run targeted backend verification for HTTP behavior — `tests/http-server.test.ts`
  - Execute the focused HTTP bridge suite after static serving integration; do not require a full repository build unless package or TypeScript changes in the implementation demand it.
  **Verification**:
  - Run: `npm test -- tests/http-server.test.ts`
  - Expected: Static serving, SPA fallback, OpenAPI/docs preservation, and REST API tests pass together.

- [x] 6.3 Run TypeScript/package verification only when demanded by implementation changes — `package.json`, `src/http-server.ts`, `dashboard/`
  - If root TypeScript source or package scripts/files were changed, run root TypeScript verification; otherwise keep verification focused.
  **Verification**:
  - Run: `npm run build`
  - Expected: Required only after root TypeScript/package changes; TypeScript compiles without errors and dashboard assets are not hand-edited.
