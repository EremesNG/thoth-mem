# Research: Immersive Neural Atlas

## Decision summary

Retain `@cosmos.gl/graph` as the local WebGL2 renderer, keep its public types behind the existing map adapter, and change the layout and product composition around it. The visual failure is not a missing renderer capability: the current dashboard gives the graph a nearly square card, sends oversized point radii, deliberately fades links, opens details in a fixed page-level Lens, and pauses the simulation after every transition. Cosmos already exposes the primitives needed by the approved concept: independent world positions, point clusters and cluster centers, curved links, point/link style arrays, fit-by-position camera methods, drag/zoom, simulation start/reheat/pause, and bounded destruction.

The implementation will therefore use a hybrid world-first model:

- a pure deterministic atlas-layout adapter derives stable community centers and initial world coordinates without consulting the host width or height;
- Cosmos renders and simulates that world on the GPU, with low-strength cluster anchors preserving the organic wide constellation;
- camera fit reads the resulting world extent and adapts the viewport to it;
- a bounded low-alpha reheat supplies ambient drift in normal mode, while Pause and reduced motion fully stop it;
- React owns the accessible overlay controls, inspector, instruments, filters, and semantic graph parity.

No new runtime dependency is required. `d3-force` remains available if deterministic collision or seed relaxation is needed, but the first implementation should prefer Cosmos cluster forces because they keep position updates on the GPU and avoid a second continuous simulation loop.

## Evidence from the current implementation

- `MemoryMapSurface.tsx` places the graph and inspector in `.observatory-map-grid`, currently `3fr 1fr` with a 610px minimum height. At the 1080px breakpoint the inspector moves below the graph. This creates the square/card behavior visible in the user's screenshot and lets controls move outside the user's current document viewport.
- `cosmos-graph-data.ts` computes point sizes as `9 + min(25, sqrt(degree) * 6.5)`, before focus and neighbor multipliers. This is a bubble-chart scale rather than a stellar hierarchy.
- `cosmos-graph-runtime.ts` uses `linkOpacity: 0.62`, `linkGreyoutOpacity: 0.045`, darkens link colors toward the void, and then calls `graph.pause()` from `finishMotion()`. The renderer is intentionally made faint and static.
- `ObservatoryWorkspace.tsx` focuses `focusTargetRef` whenever surface or node focus changes. `MemoryLens` is a fixed page-level panel, and opening it changes the map grid. Those seams explain the reported scroll jump and loss of spatial context.
- The top-level `.observatory-tabs` live above scope controls and the map while `InstrumentDock` renders after the map. Navigation and controlled content are therefore separated by a potentially long document distance.

## Reference-product findings

### ArcRift

ArcRift's current graph view uses a dominant Canvas workspace, D3 force layout, curved relationships, pan/zoom/fit/drag, explicit pause, and a small wandering force that keeps the field alive. Its value is the interaction grammar: dense small points, visible local trails, one spatial field, and controls attached to that field. The Thoth implementation will not copy ArcRift source, assets, branding, or exact layout.

Primary evidence:

- https://github.com/Eshaan-Nair/ArcRift
- https://github.com/Eshaan-Nair/ArcRift/blob/main/dashboard/src/components/GraphView.tsx

### Graphify

Graphify combines graph search/community filtering, focus animation, a side information surface, and neighborhood exploration. It confirms that graph inspection and graph navigation should remain spatially adjacent. Its vis.js implementation stabilizes physics and then disables it, so it is less suitable than Cosmos for the requested bounded ambient motion.

Primary evidence:

- https://github.com/Graphify-Labs/graphify
- https://github.com/Graphify-Labs/graphify/blob/v8/graphify/exporters/html.py

## Renderer evaluation

| Option | Strengths | Costs and gaps | Decision |
| --- | --- | --- | --- |
| `@cosmos.gl/graph` 3.4.x | Already integrated; MIT; WebGL2 GPU simulation/rendering; curved links; clusters; direct positions/styles; camera fit; pause/reheat; bounded renderer lifecycle. | Requires us to own product UI, accessibility, world policy, and lifecycle. Those are already Thoth-owned contracts. | **Keep** as renderer. |
| Sigma.js + Graphology | MIT, mature WebGL renderer and rich graph state ecosystem. | Adds graphology and a second renderer integration; force layout/animation remains an additional concern; replacement would not address the current page composition by itself. | Reject for this change. |
| Custom D3 + Canvas2D | Maximum drawing control and matches ArcRift's broad approach. | Returns simulation, hit testing, high-DPI rendering, camera, and lifecycle ownership to application code; regresses the existing GPU capability/fallback seam. | Reject. |
| `@cosmograph/react` | Higher-level ready-made analysis UI. | Would fight the approved original Thoth composition, adds a much larger UI/data surface, and has historically carried a more restrictive license than the MIT renderer core. | Reject. |

Primary renderer evidence:

- https://github.com/cosmosgl/graph
- local declarations in `dashboard/node_modules/@cosmos.gl/graph/dist/config.d.ts` and `dist/index.d.ts`
- https://github.com/jacomyal/sigma.js

## World-first geometry

The graph world and the DOM viewport are separate coordinate systems.

1. Stable node IDs, existing `seed_x`/`seed_y`, detected community IDs, degree, and graph edges form the layout input.
2. Community centers are placed deterministically on a wide elliptical/spiral field. Their placement depends on community mass and stable keys, never on `clientWidth` or `clientHeight`.
3. Node seed positions are normalized around those centers with bounded collision/link forces. The world extent is retained as an explicit value for diagnostics and fit verification.
4. Cosmos receives world positions plus cluster IDs/centers and simulates at low strength. `rescalePositions` remains false so it cannot normalize the world into the host rectangle.
5. Initial and explicit Fit use the actual point positions with padding. Resize preserves a manually navigated camera; it refits only before first settled view or when the current focus would otherwise be unreachable.
6. The host itself fills the usable application viewport. Overlay panels never permanently subtract a desktop column from the canvas.

This model addresses the user's requirement directly: the canvas/camera presents the world; the world is not generated from a square card.

## Interaction composition

- The root observatory becomes one viewport-bound `NeuralAtlasWorkspace` after the persistent application rail.
- Search, scope summary, and a collapsible guided-filter panel live in the atlas top bar.
- Fit, zoom, reset, pause, traversal, expansion, details, and clear are grouped into compact persistent atlas controls.
- Selection opens an in-atlas `AtlasDock`, not a page-level dialog. On desktop it overlays the right edge without changing the canvas rectangle; on mobile it is a bounded bottom sheet.
- Related, Story, Changes, and Health tabs live in the same dock as their content. The dock header/tab strip remains sticky while only its body scrolls.
- The current Memory Lens content becomes the Overview/details view within that dock. Selecting a node does not call page-level focus or alter document scroll.
- `GraphNavigator` remains the accessible semantic graph and renderer-failure fallback. It can be opened from the dock/view controls rather than reserving page height below the canvas.

## Visual calibration

- Normal node cores target 3–8 CSS pixels at whole-atlas fit, with a hard 14px maximum. Hubs use a small bounded increase; focus uses halo, nucleus, contrast, and one label instead of a giant core.
- Semantic/fact links remain visibly traceable at rest, metadata links are quieter, and focused paths brighten strongly. Unrelated context is dimmed but not erased.
- The field uses blue-black depth, subtle community haze, restrained cyan/amber/violet/coral/mint signals, and no decorative particles that compete with real nodes.
- Ambient motion is low-energy and periodically reheated, with a measurable drift ceiling. Expansion receives a stronger one-shot reheat. Pause and reduced motion stop both.

## Accessibility, privacy, and lifecycle

- Every graph command retains a named button and keyboard equivalent; focus does not depend on pointer hit testing.
- Dock/sheet focus is user-controlled. Opening selection details announces the change without forced focus or scroll.
- The semantic navigator exposes the same visible/focused IDs and remains the complete fallback when WebGL2 fails.
- All labels, summaries, provenance, instrument content, errors, and technical details continue through private-safe presentation helpers before entering DOM or renderer arrays.
- Renderer instances, reheat timers, transition timers, animation frames, ResizeObservers, media listeners, and in-flight HTTP work are generation-guarded and released when superseded or unmounted.

## Rejected product structures

- A graph card with a fixed inspector column: it recreates the square-host failure.
- A taller scrolling dashboard: it leaves controls and tabs spatially detached.
- A fixed page-level modal/Lens: it causes focus/scroll/layout discontinuity.
- Permanent six-field filter rows: they consume the vertical space the graph needs.
- Continuous high-energy simulation: it harms orientation and violates reduced-motion expectations.
- Renderer replacement solely for visual styling: the current engine already exposes the required primitives and replacement adds risk without changing the product architecture.
