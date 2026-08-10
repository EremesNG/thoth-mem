# Implementation Plan: Immersive Neural Atlas

## Technical context

The canonical `/` route is a React 19 observatory coordinated by `dashboard/src/components/observatory/ObservatoryWorkspace.tsx`. The graph is rendered through `MapCanvas.tsx` and a lifecycle wrapper around `@cosmos.gl/graph` 3.4.x. Existing bounded `/viz` and `/observatory` APIs already supply the nodes, edges, scope, frontier, inspection, recall, timeline, ledger, and health data required by the approved concept.

The current experience fails at the product-composition and renderer-policy layers: the graph is a 610px card in a `3fr/1fr` grid; node sizes reach bubble scale; relationships are deliberately darkened; normal transitions end by pausing the simulation; selection opens a fixed Memory Lens and focuses a page anchor; instruments are controlled by tabs far above their rendered content. The approved reference in `openspec/changes/dashboard-immersive-neural-atlas/design/neural-atlas-concept.png` replaces that page stack with one immersive, viewport-bound Neural Atlas.

This change keeps backend, persistence, URL canonical values, memory identities, visualization caps, and Control Room behavior stable. It retains the existing local MIT Cosmos renderer because its current API already supports independent positions, clusters, visible links, camera fitting, low-alpha reheating, pause, and destruction. It adds a world-first layout adapter and restructures the observatory UI around a full-viewport graph with overlaid controls, a collapsible scope surface, and one co-located details/instrument dock.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change is confined to dashboard composition, renderer policy, tests, and routed dashboard documentation; no MCP tools or server registrations change.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Existing deterministic bounded graph/retrieval inputs remain authoritative, while the semantic navigator continues to provide safe degradation when WebGL presentation fails.
- **P3 — Harness-Agnostic Memory Contract**: PASS — World coordinates, community centers, camera state, and dock state are presentation adapters over existing identities and never enter persistence or host-specific contracts.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Current focus/balanced/wide visualization caps and instrument limits remain unchanged; no implementation path widens backend output.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — HTTP paths/payloads, MCP/CLI names, URL canonical scope/focus values, and taxonomy stay stable; the change replaces only internal dashboard composition and visual policy.

## Design

### Interaction and visual intent

Intent: the user enters a living memory field and remains spatially anchored while searching, filtering, following synapses, expanding a frontier, inspecting one memory, or switching analytical instruments. The graph is the workspace, not a visualization embedded inside a dashboard.

Palette: cosmic blue-black depth with starlight neutrals and restrained ion cyan, engram amber, violet, coral, and mint communities. Community color identifies neighborhoods; size conveys a tightly bounded connectivity hierarchy; focus uses a bright nucleus, halo, label, and stronger local links. No meaning relies on color alone.

Depth: a single deep-field canvas spans the usable app viewport. Community haze and a vignette sit behind real graph content. Glass controls and the inspector dock float over the field with low-emphasis borders and blur; they never become an opaque card wall.

Typography: retain the local interface type system. Use human labels and short action language in primary UI; reserve monospace identifiers and raw evidence for bounded technical disclosures.

Spacing: controls use the existing 4px base rhythm with 8/12px internals. The atlas deliberately avoids large vertical bands; its top bar, filter popover, control rail, and dock are compact overlays.

Signature: a world-first Neural Atlas — hundreds of small stellar memories joined by readable curved synapses, gently alive at rest, with one selected neighborhood glowing inside an uninterrupted field.

### Architecture

1. Keep `ObservatoryWorkspace.tsx` as the data/state coordinator, but replace its vertically stacked JSX with a viewport-bound workspace composition. It will own URL/history, scope, focused node, focus trail, active dock view, dock visibility, filter visibility, pause state, HTTP generations, and graph commands without owning renderer details.
2. Introduce `NeuralAtlasWorkspace.tsx` as the presentational composition boundary. It renders the full atlas stage, compact top bar, scope cues/filter trigger, map, persistent control rail, bounded status notices, and a single `AtlasDock`. This prevents `MemoryMapSurface` from growing into another monolith and gives browser tests one public spatial seam.
3. Refactor `MemoryMapSurface.tsx` into graph-stage content rather than a card. Remove its fixed `3fr/1fr` inspector grid and below-canvas semantic navigator. The Cosmos host always fills the atlas stage; status, frontier outcomes, controls, and fallback remain inside that boundary.
4. Add `AtlasDock.tsx` as one non-modal overlay/sheet. Its sticky local tab strip contains Overview, Related, Story, Changes, and Health; its body hosts the selected-memory content currently in `MemoryLens`, the current `InstrumentDock` views, and a semantic graph view. On desktop it overlays the canvas without changing the canvas rectangle. At narrow/coarse-pointer sizes it becomes a dismissible bottom sheet with bounded internal scroll.
5. Convert `MemoryLens.tsx` from a fixed `role=dialog` surface into reusable `MemoryOverview.tsx` content. Observation inspection remains asynchronous and generation-guarded; non-observation nodes continue using local private-safe details. No selection effect calls page-level `.focus()`; status is announced through an `aria-live` region, and explicit dock actions manage focus only when the user requests it.
6. Move the `surfaces` navigation from the top of `ObservatoryWorkspace` into `AtlasDock`. Recompose `InstrumentDock.tsx` as instrument content only, or split its four public views behind the dock's active tab. The tab strip stays sticky while only the dock body scrolls, so navigation and controlled content remain co-located.
7. Reuse `ObservatoryScopeBar.tsx` and `GuidedSelect.tsx` inside a collapsible `AtlasScopePanel`. Search and concise applied-scope tokens stay in the top bar; the six structured selectors open in a bounded popover/drawer and reserve no permanent atlas height. Canonical URL/API values and dependent-option normalization remain unchanged.
8. Add `neural-atlas-layout.ts`, a pure adapter that accepts stable IDs, seeds, communities, degrees, and visible edges and returns world positions, cluster centers, cluster strengths, and an explicit world extent. Community centers use stable-key ordering and a wide elliptical/spiral distribution weighted by community mass. Layout calculations never read DOM dimensions.
9. Extend `cosmos-graph-data.ts` to consume the world layout. Replace the current 9–34 unit point scale with a bounded stellar core scale, retain community color, strengthen relationship colors/widths, and expose cluster arrays plus extent diagnostics. Selection changes halo/outline/labels, not core size beyond the hard maximum.
10. Update `cosmos-graph-runtime.ts` to set `rescalePositions: false`, `scalePointsOnZoom: false`, point clusters, cluster centers, cluster strengths, and visible relationship opacity. Initial and explicit Fit use actual point positions; resize does not refit after manual navigation unless the pre-settle graph or active focus is unreachable. The runtime publishes camera/world diagnostics required by mounted tests.
11. Replace the unconditional `finishMotion() -> graph.pause()` policy with a bounded motion controller. Initial load and frontier expansion use purposeful one-shot energy; normal idle mode schedules a low-alpha reheat at a bounded interval; Pause, reduced motion, document invisibility, failure, and destroy stop simulation and clear that schedule. New data/focus generations cancel superseded transition work.
12. Preserve `MapCanvas.tsx` as the React/renderer facade. It keeps one asynchronously loaded runtime, retries WebGL failure, synchronizes pointer selection and semantic focus, and publishes safe overlay labels. Its effect cleanup remains the sole renderer-destruction boundary.
13. Keep `GraphNavigator.tsx` as the accessible functional graph. Surface it within the atlas dock/view controls and elevate it automatically on renderer failure. It must expose the same visible node IDs, focus, connected-neighbor actions, expansion, and command outcomes as the rich renderer.
14. Rewrite the observatory portion of `dashboard/src/styles/observatory.css` around an atlas-local layout: usable `100dvh` height after the app rail/mobile header, no page-level graph card, no permanent desktop inspector column, one overlay stacking context, container/viewport-responsive dock and filter surfaces, short-height handling, coarse-pointer targets, 200% text zoom, and zero horizontal document overflow.
15. Make the shell route-aware without changing other console pages: the root observatory main surface uses a viewport/overflow contract appropriate to the atlas, while operations, traces, and indexing retain normal document flow. The mobile navigation drawer keeps its existing inert/focus restoration behavior.
16. Continue every stored label, summary, provenance value, filter cue, instrument result, error, tooltip, and technical disclosure through `presentStoredText`, `sanitizeMapText`, or the existing safe presentation adapters before it reaches DOM or renderer arrays. Runtime assets and network calls remain local/same-origin.
17. Update `docs/agent/dashboard.md` only after implementation evidence confirms the durable ownership boundaries: world-first layout, Cosmos lifecycle, atlas dock, semantic fallback, and route-local viewport behavior.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001, FR-007 | Compose one viewport-bound Neural Atlas with persistent in-stage controls and route-local shell behavior. | `NeuralAtlasWorkspace.tsx`, `MemoryMapSurface.tsx`, `AppShell.tsx`, `observatory.css`, `shell.css` | Mounted rectangles and scroll checks at desktop/tablet/mobile/200%/short-height states. |
| FR-002, FR-003 | Derive stable world coordinates independent of DOM size; fit the camera to actual world positions and preserve manual camera on resize. | `neural-atlas-layout.ts`, `cosmos-graph-data.ts`, `cosmos-graph-runtime.ts` | Pure wide/tall/irregular extent tests plus mounted initial Fit/resize/manual-zoom checks. |
| FR-004, FR-005 | Use bounded stellar cores, halo-based focus, visible curved synapses, and perceptible greyed context. | `cosmos-graph-data.ts`, `cosmos-graph-runtime.ts`, `observatory.css` | Numeric adapter assertions, mounted screenshot/renderer diagnostics, and focus opacity checks. |
| FR-006, FR-015 | Add bounded low-alpha ambient reheat and stronger one-shot frontier entrance; stop motion for Pause/reduced/hidden/destroy. | `cosmos-graph-runtime.ts`, `MapCanvas.tsx`, `MemoryMapSurface.tsx` | One-second drift sampling, pause/reduced sampling, expansion transition, and timer lifecycle faults. |
| FR-008, FR-014 | Retain canonical focus/history/trail commands while preserving renderer camera and dock identity. | `ObservatoryWorkspace.tsx`, `context-store.ts`, `map-navigation.ts`, `MapCanvas.tsx` | URL/context/renderer/semantic/dock parity across pointer, keyboard, trail, popstate, pivot, and invalid focus. |
| FR-009, FR-010 | Replace the fixed Memory Lens with an in-atlas non-modal Overview and remove forced page focus. | `AtlasDock.tsx`, `MemoryOverview.tsx`, `ObservatoryWorkspace.tsx`, `observatory.css` | Nonzero-scroll selection, canvas-rect stability, explicit close, long content, and focus-owner tests. |
| FR-011, FR-012 | Put Related, Story, Changes, and Health tabs beside their active content inside one sticky dock. | `AtlasDock.tsx`, `InstrumentDock.tsx`, instrument views, `ObservatoryWorkspace.tsx` | Mounted four-tab lifecycle/retry/pivot tests with graph node/edge/camera continuity. |
| FR-013 | Place search, applied scope, and all six structured selectors in a collapsible atlas scope surface. | `AtlasScopePanel.tsx`, `ObservatoryScopeBar.tsx`, `GuidedSelect.tsx`, `ObservatoryWorkspace.tsx` | Mounted open/search/select/clear/collapse/dependent-option/request/URL tests and atlas-height measurements. |
| FR-016 | Use desktop overlay dock/filter surfaces and narrow/coarse-pointer bottom sheets/drawers. | `NeuralAtlasWorkspace.tsx`, `AtlasDock.tsx`, `AtlasScopePanel.tsx`, `observatory.css` | Required viewport, coarse-pointer, text-zoom, Escape, focus restoration, and overflow checks. |
| FR-017 | Keep one synchronized DOM semantic graph and make it primary on rich-renderer failure. | `GraphNavigator.tsx`, `MapCanvas.tsx`, `AtlasDock.tsx` | WebGL-disabled/context-loss/retry run with identical node/focus/neighbor behavior and one runtime. |
| FR-018 | Apply centralized private-safe presentation before DOM/renderer use and keep all resources local. | map adapters, Overview/dock/instrument components, `safe-presentation.ts` | Angle/bracket marker fixtures, DOM/canvas-adjacent/history/network scan, and external-request recording. |
| FR-019 | Bound HTTP, renderer, motion, resize, history, and overlay lifecycles by abort/generation ownership. | `ObservatoryWorkspace.tsx`, `MapCanvas.tsx`, `cosmos-graph-runtime.ts`, browser harness | Superseded request, repeated resize/focus/retry/route/unmount faults with zero late state or owned resources. |

### TDD seams

Implementation proceeds in vertical red → minimal green slices against production-facing seams:

1. `neural-atlas-layout.ts` pure input/output: deterministic identity, world extent independent of viewport, community placement, sparse/disconnected/dense/frontier cases.
2. `buildCosmosGraphData()` and runtime diagnostics: stellar size bounds, link visibility, community arrays, world positions, point/link identity, safe text, and motion policy.
3. Mounted `NeuralAtlasWorkspace` spatial contract in real Chrome: dominant non-square host, all controls in bounds, no permanent inspector column, zero document scroll jump, dock/tab locality, scope collapse, and responsive sheets.
4. Mounted graph interaction contract: pointer/keyboard commands, camera preservation, low bounded ambient motion, Pause, reduced motion, frontier expansion, and label geometry.
5. Mounted state parity: URL, context, renderer focus, semantic focus, Overview/dock identity, focus trail, browser history, invalid focus, and instrument pivots.
6. Capability/privacy/lifecycle contract: WebGL disabled/context lost/retry, private markers, stale HTTP/fallback completions, repeated resize/route/unmount, same-origin network, one renderer, and zero owned timers/processes/profiles.
7. Independent visual acceptance: at least four production screenshots compared with the approved concept and the five-item rubric in SC-017. Static markup or disconnected helper assertions do not satisfy mounted criteria.

## Optional support artifacts

- `research.md`: included because renderer replacement freedom, world-layout ownership, ambient-motion policy, and inspector composition are material technical risks.
- `design/neural-atlas-concept.png`: included as the user-approved visual target and screenshot-review reference.
- `data-model.md`: not needed; no persistence, graph identity, or HTTP response shape changes.
- `contracts/`: not needed; existing URL and HTTP contracts remain unchanged.
- `quickstart.md`: not needed; the existing dashboard commands and real-browser harness remain the execution path.

## Risks and migrations

- World-layout legibility: cluster anchors can over-separate communities or create empty bands. Mitigate with pure extent/community fixtures, deterministic seeds, screenshot review at all densities, and bounded tuning constants in one adapter. Rollback can restore direct seed positions without data migration.
- Ambient motion sickness/orientation: periodic reheating can be distracting or move targets. Mitigate with low alpha, an explicit pixel-per-second ceiling, automatic stop under Pause/reduced/hidden states, stable selected-node halo, and no decorative particle field.
- Cosmos API behavior: position transitions pause simulation and some fit calls can re-enable it. Centralize all calls in `cosmos-graph-runtime.ts`, explicitly restore the intended motion state after transitions, and cover every lifecycle branch with runtime snapshots/fault tests.
- Camera resize regression: `ResizeObserver` can accidentally override user navigation. Track first-fit/manual-camera state and refit only under the defined initial/unreachable-focus conditions; reproduce desktop-to-mobile resize after manual zoom.
- Overlay hit targets: inspector/filter/controls can mask useful graph regions. Use bounded widths, pointer-event isolation, close controls, responsive sheets, and mounted rectangle/hit-test coverage.
- Focus/accessibility regression: removing the dialog and forced anchor focus must not make changes silent. Keep explicit labeled controls, `aria-live` identity/status, semantic navigator parity, logical DOM order, Escape handling, and user-initiated focus restoration for drawers/sheets.
- Composition scope: extracting `NeuralAtlasWorkspace`, `AtlasDock`, and `MemoryOverview` touches several current components. Keep `ObservatoryWorkspace` as sole data coordinator and move presentation without changing request ownership or API contracts.
- Dependency freedom: no dependency change is planned because measured capability is already present. If implementation proves a blocker, renderer replacement requires updating `research.md`, the dependency/lockfile tasks, license/bundle evidence, and revalidating affected plan/tasks before continuing.
- There is no database, backend, URL, or persisted-state migration. Root route query values continue to round-trip; dock/filter visibility may remain ephemeral unless an existing canonical surface value represents it.
- Rollback is frontend-only: restore the prior observatory composition and renderer constants. No stored memory or server migration is involved.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — Every mapped component and test remains in the dashboard/docs surface; there is no tool, MCP, or server registration expansion.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — World layout is deterministic from bounded existing graph data, and the design retains a complete semantic graph path for WebGL degradation.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Community/layout/camera/dock state remains browser presentation state over canonical node identities; no renderer or host metadata crosses persistence/HTTP boundaries.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Current slice/frontier and instrument caps remain the only data-volume authority; viewport expansion does not widen retrieval.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The design preserves HTTP, URL canonical values, MCP/CLI names, taxonomy, graph IDs, and administrative semantics; no public deprecation or migration is introduced.
