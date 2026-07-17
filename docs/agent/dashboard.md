# Dashboard UI

## Responsibility

Owns the React/Vite operations console, browser routing/state, visualization and observatory surfaces, and the typed HTTP client. Server routes and response contracts remain owned by the surfaces route.

## Entry points and flow

- `dashboard/src/main.tsx`, `App.tsx`, `routes.ts`, `router.tsx`: application bootstrap and browser routing.
- `dashboard/src/api/client.ts`: typed HTTP client and client-side response shapes.
- `dashboard/src/components/`: overview, search, project/topic/observation views.
- `dashboard/src/components/map/` and `observatory/`: graph/map projection, state, rendering, filters, recall/timeline/health surfaces.
- `dashboard/src/index.css`: shared styling; `dashboard/vite.config.ts`: build integration.

The dashboard is served through the HTTP bridge at `/`; `/docs` remains the OpenAPI surface. Client changes that require a new or changed endpoint must treat [surfaces](surfaces.md) as an overlay and verify both sides of the contract.

## Invariants and hazards

- Preserve browser history/popstate behavior and URL decoding in the custom router.
- Keep client types aligned with actual HTTP payloads; do not infer a server contract from a component alone.
- Preserve safe rendering for stored content; inspect `SafeMarkdown.tsx` before changing markdown/content presentation.
- Map and observatory code separates state/projection/rendering; avoid unrelated visual rewrites during behavior fixes.
- No dashboard test script is declared. Do not invent one or claim browser/end-to-end coverage that is not present.

## Tests and verification

Use root Vitest suites in `tests/dashboard/` plus `tests/http-viz.test.ts` or `tests/http-server.test.ts` when contracts change. Run `pnpm run dashboard:typecheck`; use focused tests first, then the root build when TypeScript/build output changes. Visual behavior may require explicit browser QA, but no automated browser command is confirmed by current manifests.

## Escalate context

Load [surfaces](surfaces.md) for HTTP/OpenAPI changes, [persistence](persistence-retrieval.md) for query/recall semantics, and [engineering](engineering.md) for TypeScript conventions.

Evidence: `dashboard/package.json`, dashboard entrypoints/client/components, root tests, and HTTP source/tests.
