# Proposal: Dashboard SPA for Memory Exploration

## Intent

Users cannot currently explore saved memories easily without knowing the MCP tools, CLI commands, or individual HTTP endpoints. After the agent-facing retrieval, MCP/resource, graph-lite, and evaluation work, the next priority is a local, read-only dashboard that makes existing memory data discoverable through a browser without changing the storage or retrieval model.

## Scope

### In Scope

- Add a packaged mini SPA using Vite, React, and TypeScript.
- Place frontend source under `dashboard/` and emit production assets into `dist/dashboard/`.
- Serve the dashboard from the existing custom Node HTTP server root (`http://localhost:7438/`).
- Preserve existing `/docs`, `/openapi.json`, and REST API behavior, including:
  - `/stats`
  - `/context`
  - `/observations/search`
  - `/observations/:id`
  - `/timeline`
  - `/projects/{project}/summary`
  - `/projects/{project}/graph`
  - `/projects/{project}/topic-keys`
- Deliver a read-only MVP for memory exploration:
  - Overview page with global stats and recent/relevant context entry points.
  - Project detail page using project summary data.
  - Search explorer for observations with filters and result limits.
  - Observation detail view with full content and adjacent timeline context.
  - Topic-key browser for exact-topic workflows and artifact-style recall.
  - Graph-lite table/list view for facts and relationships, not heavy visualization.
- Add dashboard build/package scripts and documentation needed for local use and release packaging.
- Keep privacy local-first: dashboard assets are served by the local HTTP bridge and should not require third-party services.
- Use pagination, explicit limits, and defensive empty/error states for data-heavy endpoints.

### Out of Scope

- Creating, editing, updating, or deleting memories from the dashboard.
- Authentication, authorization, multi-user sessions, or remote hosted dashboard mode.
- Spectacular graph visualization, force-directed graph canvases, or graph-heavy analytical UX.
- Vector retrieval, embeddings, semantic reranking, or new retrieval backends.
- Replacing the existing custom Node `node:http` server with a web framework.
- Changing SQLite schema or memory persistence semantics solely for dashboard needs.

## Approach

1. **Frontend app boundary**
   - Create a Vite + React + TypeScript app under `dashboard/`.
   - Keep the SPA independently organized from `src/` so frontend concerns do not leak into MCP/store internals.
   - Configure the production build to output static assets to `dist/dashboard/` for package/runtime serving.

2. **HTTP serving integration**
   - Extend the existing custom HTTP bridge so `/` serves the dashboard entry point when built assets exist.
   - Preserve route precedence by checking existing API routes, `/docs`, `/openapi.json`, and concrete static assets before applying SPA fallback routing.
   - Apply fallback routing only for dashboard navigation paths, after API/docs/openapi/static route checks have failed.
   - Serve static files with explicit MIME types, safe path normalization, and no directory traversal.

3. **Read-only API client**
   - Build a small typed client around the existing HTTP endpoints instead of inventing dashboard-only APIs in the MVP.
   - Normalize API error responses into user-friendly empty/error states.
   - Prefer bounded requests, explicit `limit` values, and pagination/offset controls where supported.

4. **MVP information architecture**
   - Overview: `/stats` plus links into project summaries, topic keys, and search.
   - Project detail: `/projects/{project}/summary`, topic-key entry points, and graph-lite facts.
   - Search explorer: `/observations/search` with query, project/type/topic-key filters where supported.
   - Observation detail: `/observations/:id` and `/timeline` for chronological context.
   - Topic-key browser: `/projects/{project}/topic-keys` with exact-key drilldown.
   - Graph-lite: `/projects/{project}/graph` rendered as filterable tables/lists of facts and relationships.

5. **Packaging and developer workflow**
   - Add scripts so repository release/build flow can build the dashboard before package publication.
   - Ensure built dashboard assets are included in the package while frontend source remains maintainable in the repo.
   - Keep development workflow separate enough that backend tests do not require a browser runtime.

## Affected Areas

- `dashboard/` — new Vite + React + TypeScript frontend source, routing, API client, and UI components.
- `dist/dashboard/` — generated dashboard static assets served by the HTTP bridge.
- `src/http-server.ts` — static asset serving, route precedence, MIME handling, and SPA fallback integration.
- `src/http-routes.ts` — preservation of existing manual REST route matching and handler behavior.
- `src/http-openapi.ts` — preservation of `/openapi.json` and `/docs` behavior; no dashboard-specific API contract unless later required.
- `package.json` / package metadata — dashboard build scripts and package inclusion rules.
- `tests/**` — route precedence, static serving, fallback behavior, and API preservation tests.

## Risks

- **Dependency and build-pipeline risk**: Vite/React adds frontend dependencies and another build step.
  - *Mitigation*: keep the SPA small, isolate frontend tooling under `dashboard/`, and wire scripts explicitly into existing package flow.
- **Route conflict risk**: SPA fallback could accidentally shadow `/docs`, `/openapi.json`, or REST APIs.
  - *Mitigation*: enforce route precedence tests and apply fallback only after API/docs/openapi/static checks.
- **Privacy risk**: a browser UI can expose private memory content more visibly than CLI/MCP output.
  - *Mitigation*: local-first serving only, no external telemetry/CDNs, clear read-only posture, and no remote auth assumptions in MVP.
- **API coupling risk**: frontend screens may become tightly coupled to current REST response shapes.
  - *Mitigation*: centralize API client types/adapters and keep UI components consuming normalized view models.
- **Static asset MIME/security risk**: manual file serving can introduce bad MIME types or path traversal bugs.
  - *Mitigation*: use explicit MIME maps, resolved-path containment checks, and tests for traversal attempts.
- **Packaging risk**: missing `dist/dashboard/` assets could produce a root route that fails after install.
  - *Mitigation*: include dashboard build in release gates and provide graceful root response when assets are absent in development.

## Rollback Plan

1. Keep all REST API, `/docs`, and `/openapi.json` routes independent of dashboard serving so disabling the dashboard does not affect existing clients.
2. Gate static dashboard serving on the presence of `dist/dashboard/index.html`; if assets are missing or broken, return a clear local message while APIs remain available.
3. If route conflicts appear, remove or disable only the root/static fallback logic and leave the existing manual route table intact.
4. If frontend dependencies disrupt package builds, temporarily exclude dashboard build from release scripts while preserving the OpenSpec artifacts for a corrected follow-up.

## Success Criteria

- `http://localhost:7438/` serves the packaged dashboard when built assets are available.
- `/docs`, `/openapi.json`, and all existing REST APIs continue to resolve with their current behavior and precedence.
- Dashboard MVP supports read-only overview, project detail, search explorer, observation detail/timeline, topic-key browsing, and graph-lite table/list views.
- Dashboard requests use existing HTTP APIs with explicit limits/pagination where supported and graceful empty/error/loading states.
- Static asset serving uses safe path handling, correct MIME types for common built assets, and does not allow directory traversal.
- Package/build workflow can produce and include `dist/dashboard/` assets without requiring dashboard code during backend-only tests.
- No dashboard MVP path can create, edit, or delete memory data.
