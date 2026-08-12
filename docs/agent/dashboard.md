# Dashboard UI — Neural Observatory

## Responsibility

Owns the React/Vite operations console, browser routing/state, visualization and observatory surfaces, and the typed HTTP client. Server routes and response contracts remain owned by the surfaces route.

## Entry points and flow

- `dashboard/src/main.tsx`, `App.tsx`, `routes.ts`, `router.tsx`: thin application bootstrap and normalized pathname/search routing. `/` is the canonical graph observatory; `/console/graph` is its reloadable alias.
- `dashboard/src/api/client.ts`: typed HTTP client and client-side response shapes.
- `dashboard/src/components/AppShell.tsx`: responsive command rail/drawer and one-step Observatory/Control Room navigation.
- `dashboard/src/components/map/neural-atlas-layout.ts`, `cosmos-graph-data.ts`, and `cosmos-graph-runtime.ts`: the viewport-independent world layout, pure GPU adapter, and sole cosmos.gl lifecycle. The approved visual grammar is an ArcRift-inspired organic neural field—3–8px stellar cores, deterministic community constellations, visible curved synapses, local focus labels, and subdued but retained context—without copying ArcRift code, layout, or branding. World coordinates are translated into cosmos.gl's positive 4096-unit space before simulation; the camera fits the resulting extent instead of reshaping the world to the host.
- `dashboard/src/components/map/MapCanvas.tsx`, `GraphNavigator.tsx`, and `observatory/MemoryMapSurface.tsx`: renderer facade, indexed DOM-backed semantic navigation, progressive dataset coordination, viewport commands, and the preserved non-GPU exploration path.
- `dashboard/src/components/observatory/semantic-atlas-loader.ts`: abortable `/viz/atlas` pagination for the default Universe, Community, and Neighborhood levels, with generation-bound accumulation, typed stale/gone recovery, and stable semantic identities.
- `dashboard/src/components/observatory/full-atlas-loader.ts`: the same bounded lifecycle for the explicit Raw diagnostic projection. Raw is never loaded by the default atlas and remains guarded by the 5,000-entity rich-render limit.
- `dashboard/src/components/GuidedSelect.tsx`, `guided-select-position.ts`, `observatory/AtlasScopePanel.tsx`, and `observatory/ObservatoryScopeBar.tsx`: the shared searchable selector, visual-viewport-aware document portal/top layer, and on-demand atlas filter overlay. Project changes invalidate and reload dependent session/topic/type/relation choices before graph requests resume. Semantic cue search is the only unrestricted observatory filter text field.
- `dashboard/src/components/dashboard-presentation.ts` and `safe-presentation.ts`: centralized human labels, collision-safe option presentation, bounded technical disclosure, and mandatory private-text removal.
- `dashboard/src/components/observatory/ObservatoryWorkspace.tsx`, `NeuralAtlasWorkspace.tsx`, `AtlasDock.tsx`, and `MemoryOverview.tsx`: graph coordination, the viewport-dominant atlas shell, non-modal selected-memory details, and the co-located Related/Story/Changes/Health instruments. Desktop details overlay the canvas without changing it; narrow screens use a bounded bottom sheet with internal scrolling.
- `dashboard/src/components/control-room/`: operations, traces, indexing and confirmed state-changing commands at `/console/operations`, `/console/traces`, and `/console/indexing`.
- `dashboard/src/components/safe-presentation.ts`: mandatory stored-text and bounded-result presentation boundary. Both `<private>` and `[private]` blocks must be removed before rendering.
- `dashboard/src/index.css` imports `styles/shell.css`, `styles/observatory.css`, `styles/control-room.css`, and the shared `styles/controls.css`; all fonts and assets remain local.

The dashboard is served through the HTTP bridge at `/`; `/docs` remains the OpenAPI surface. Client changes that require a new or changed endpoint must treat [surfaces](surfaces.md) as an overlay and verify both sides of the contract.

## Invariants and hazards

- Preserve browser history/popstate behavior and URL decoding in the custom router.
- Keep client types aligned with actual HTTP payloads; do not infer a server contract from a component alone.
- All stored labels, snippets, trace bodies and command results must use the central safe-presentation adapter. Raw private-marked text is never a permissible fallback.
- `ObservatoryWorkspace` is the sole graph coordinator and `MapCanvas` is the sole canvas/zoom lifecycle. Dataset replacement and unmount must abort requests and detach observers/listeners.
- The atlas route owns the usable viewport and must not introduce document scrolling. Header, scope panel, dock, notices, and controls are overlays; opening or switching them must not resize the canvas or reset its camera.
- Narrow-screen overlays follow `window.visualViewport` rather than the layout viewport so page scale, pinch position, and 200% use keep the header, controls, dock, and local tabs hit-testable. This positioning must never feed back into the graph's world layout or trigger an involuntary camera fit.
- Normal motion is one guarded continuous low-alpha simulation after the initial settle; it must never use periodic stop/reheat timers. Pause, reduced motion, hidden documents, renderer failure, supersession, and destroy stop the simulation, while progressive pages preserve stable positions, focus, and user camera state.
- `ObservatoryState.focusNodeId` is the single source of truth for node focus; only edge selection remains separate. Initial URLs, popstate, token pivots, node pivots, traversal, trail restoration, clear, and invalid-focus recovery must keep URL, context, GPU focus, semantic navigation, and Overview identity aligned.
- A restored non-map `activeSurface` implies a visible atlas dock on initial load and popstate; otherwise a canonical instrument deep link can load data that the user cannot see.
- cosmos.gl is dynamically imported only after a WebGL2 capability check. A failed or lost graphics context must keep current scope, selection, `GraphNavigator`, and instruments usable; Retry remounts one renderer instance and restores the same focus.
- Focus and neighbor labels are prioritized in screen space: focus is always shown, lower-priority neighbor labels may be omitted when no collision-free placement exists, and layout is recomputed after simulation, camera, or host-size changes.
- Structured scope controls commit only values returned by filter metadata (plus the explicit unfiltered choice). Search text inside a combobox is never a committed API/URL value. Metadata requests are abortable and generation guarded; stale project-dependent results cannot restore cleared choices.
- Guided listboxes render through the shared document portal/native top layer and are positioned from `window.visualViewport`. Trigger and portal jointly own outside-pointer, blur, keyboard, resize, scroll, and cleanup behavior; opening a listbox must not alter atlas geometry.
- User-facing copy names goals and outcomes first. Canonical node IDs, relation tokens, trace evidence, lane identifiers, and operation details belong inside bounded technical disclosure unless required for the task itself.
- Canvas interaction always has a keyboard command and DOM-backed semantic equivalent. Preserve focus-visible, controlled live regions, narrow-screen sheets/drawer and reduced-motion behavior.
- `/viz/atlas` is the default semantic navigation contract. Universe renders 30–150 weighted community aggregates for sufficiently large scopes; Community renders only the selected community's observations; Neighborhood renders one or two relevant hops plus bounded supporting evidence, never more than 300 nodes. Project, session, topic, type, and relation remain facets/provenance rather than force-bearing peers.
- Atlas IDs and facet values are full collision-checked opaque hashes of canonical internal tuples. Public URLs, requests, labels, snippets, counters, and technical disclosure never serialize raw canonical facet values or private-marked text. Active-level counters describe the identities and relationships actually returned, while the header reports truthful memory, project, and constellation totals.
- `/viz/graph` is the explicit Raw diagnostic path. It uses deterministic keyset pages and a transactionally validated scope-generation cursor; stale generations return typed `409 VIZ_GRAPH_GENERATION_STALE`. The client discards invalidated accumulators, automatically restarts at most twice, then exposes one bounded Retry. Raw projection retains complete corrected heterogeneous identities, but scopes above 5,000 entities show a bounded refusal instead of mounting a rich hairball.
- Community detection uses only configured structural KG relations in a weighted memory-to-memory projection. Metadata relations and high-frequency entities are excluded before pair generation; every current observation is assigned exactly once, missing KG remains visible as deterministic unclustered coverage, and oversized groups are split to the navigation bounds. Fresh committed summaries may enrich labels but never own membership.
- Field of view changes only presentation/camera detail and never the fetched semantic identity set. Universe shows aggregate links, Community shows relevant memory links, and Neighborhood shows the returned local evidence classes.
- Create observation, graph rebuild and index rebuild require explicit confirmation and a pending lock.
- No dashboard package test script is declared. Root Vitest owns dashboard tests, including the in-repository real-Chrome harness; every harness run must close CDP, Chrome, Vite, HTTP bridge, SQLite store, ports, and temporary profiles under bounded cleanup.

## Tests and verification

Use root Vitest suites in `tests/dashboard/` plus `tests/http-viz.test.ts` when visualization contracts are exercised. Run `pnpm run dashboard:typecheck`, `pnpm exec vitest run tests/dashboard`, `pnpm exec vitest run tests/http-viz.test.ts`, then `pnpm run build`. Visual changes require real-browser QA at 1440×900, 1024×768, and 360×800, 200% page scale, coarse pointer, reduced motion, GPU-disabled fallback/retry, local-only networking, and zero horizontal page overflow. Record whether the invoked Vitest browser harness or another explicit browser tool supplied the evidence.

## Escalate context

Load [surfaces](surfaces.md) for HTTP/OpenAPI changes, [persistence](persistence-retrieval.md) for query/recall semantics, and [engineering](engineering.md) for TypeScript conventions.

Evidence: `dashboard/package.json`, dashboard entrypoints/client/components, root tests, and HTTP source/tests.
