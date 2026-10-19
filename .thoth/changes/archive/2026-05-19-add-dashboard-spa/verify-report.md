# Verification Report: Dashboard SPA for Memory Exploration

## Completeness

Verification refreshed on 2026-05-19 using the accelerated-pipeline reference artifacts:

- `openspec/changes/add-dashboard-spa/proposal.md`
- `openspec/changes/add-dashboard-spa/tasks.md`

The implementation completes the dashboard SPA, HTTP static serving integration, package scripts, tests, and documentation required by the proposal. The previously blocking dashboard client-router issue has been fixed: `dashboard/src/router.tsx` now pushes the full target URL to browser history while storing only the normalized pathname in router state, so query-string quick links such as `/search?project=...`, `/topic-keys?project=...`, and `/graph?project=...` preserve URL filters without breaking route matching.

The previously noted README warning is also fixed: the HTTP search example now uses `/observations/search`. Tasks in `tasks.md` are all marked complete and are consistent with the observed implementation and verification evidence.

## Build and Test Evidence

Executed verification commands:

- `npm test -- tests/http-server.test.ts` — passed, 27 tests / 1 file.
- `npm run dashboard:typecheck && npm run dashboard:build` — passed; dashboard TypeScript compiled and Vite produced `dist/dashboard/index.html` plus assets.
- `npm run build` — passed; root TypeScript compile plus dashboard build.
- `npm test` — passed, 43 test files / 380 tests.

Static inspection evidence:

- `dashboard/package.json`, `dashboard/vite.config.ts`, and `dashboard/src/**` define a Vite + React + TypeScript SPA with output configured to `../dist/dashboard`.
- `dashboard/src/api/client.ts` exposes only GET wrappers for `/stats`, `/context`, `/observations/search`, `/observations/:id`, `/timeline`, `/projects/{project}/summary`, `/projects/{project}/topic-keys`, and `/projects/{project}/graph`.
- `src/http-server.ts` preserves route matching before dashboard fallback, serves `/`, concrete assets, and known SPA paths, maps MIME types, rejects traversal paths, and returns a missing-build message.
- `tests/http-server.test.ts` covers root dashboard response, assets, missing assets, traversal rejection, SPA deep links, and preservation of docs/OpenAPI/API routes.
- `README.md` documents the local dashboard, build command, missing-build behavior, docs preservation, and read-only/local-first posture.
- `README.md` line 167 documents the search endpoint as `/observations/search?query=auth+pattern`.

## Compliance Matrix

| Proposal success criterion | Status | Evidence |
| --- | --- | --- |
| `http://localhost:7438/` serves the packaged dashboard when built assets are available. | Compliant | `src/http-server.ts` serves `index.html` at `/`; focused HTTP test covers root response; `npm run dashboard:build` produced `dist/dashboard/index.html`. |
| `/docs`, `/openapi.json`, and all existing REST APIs continue to resolve with current behavior and precedence. | Compliant | `ROUTES` are matched before `tryServeDashboard`; `npm test -- tests/http-server.test.ts` passed existing and new route-preservation tests. |
| Dashboard MVP supports read-only overview, project detail, search explorer, observation detail/timeline, topic-key browsing, and graph-lite table/list views. | Compliant | Screens and routes exist in `dashboard/src/main.tsx`; components implement the required views. Project-detail query-string quick links are route-safe because `navigate()` stores normalized pathname-only state while preserving the full browser URL. |
| Dashboard requests use existing HTTP APIs with explicit limits/pagination where supported and graceful empty/error/loading states. | Compliant with warning | API client uses existing endpoints and components include loading/empty/error states. Explicit limits/pagination are present. Warning: some defaults are UI-only and not centralized, but no dashboard-only APIs were added. |
| Static asset serving uses safe path handling, correct MIME types for common built assets, and does not allow directory traversal. | Compliant | `resolveDashboardFile`, `isPathContained`, MIME map, and traversal test evidence. |
| Package/build workflow can produce and include `dist/dashboard/` assets without requiring dashboard code during backend-only tests. | Compliant | Root scripts include `dashboard:build` and `dashboard:typecheck`; package `files` includes `dist`; focused backend tests pass independently. |
| No dashboard MVP path can create, edit, or delete memory data. | Compliant | Dashboard API client exports only GET/read wrappers; no mutation endpoint calls found in dashboard source. |

## Issues Found

### Blocking

None.

### Warnings

1. There is no dedicated automated dashboard router unit test for query-string client navigation. The fix is verified by static inspection and dashboard type/build checks; consider adding a lightweight router/component test in a future dashboard test harness.

## Verdict

**Pass with warning — ready for archive consideration.**

The backend serving, build workflow, static security checks, read-only API client, dashboard screens, README endpoint documentation, and prior router blocker all pass verification. The only remaining concern is test-depth, not functional compliance: query-string SPA routing has no dedicated automated frontend test yet.
