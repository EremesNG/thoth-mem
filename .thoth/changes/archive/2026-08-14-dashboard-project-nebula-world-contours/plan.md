# Implementation Plan: Camera-bound Project Nebula Contours

## Technical context

Project-hierarchy Universe already supplies a bounded page of constellation-core nodes with stable `owner_project_id`, plus `project_regions` and `project_bridges`. `MemoryMapSurface` adapts those project aggregates into the existing semantic-region overlay interface, while `cosmos-graph-data.ts` already groups Universe points by opaque project ownership and lays them out as `project-universe` clusters.

The defect is at the projection boundary. `CosmosGraphRuntime.publishOverlayLayout()` only emits region source points when the first node has semantic level `community`; project-owned Universe cores therefore emit no project region points. `buildSemanticRegionOverlays()` substitutes the viewport center for each empty region, creating coincident central contours while its collision fallback scatters project labels independently. Separately, `universeRegionOverlays()` paints boxed labels for individual constellation cores and `MapCanvas` paints a static decorative nebula field, so the initial hierarchy does not resemble the established organic Community view.

The correction remains inside the dashboard renderer. It will make project ownership an explicit internal region-grouping mode in prepared graph data, publish current screen positions and matching colors for those groups on every existing camera/simulation/resize overlay frame, omit empty-source semantic regions instead of fabricating a center point, and render project contours/labels through the established SVG cloud layer. Project Universe will suppress the unrelated static nebula field and the boxed core-label layer; constellation cores remain visible/selectable in Cosmos and fully named/actionable in `GraphNavigator` and hover presentation. No Store, HTTP, client DTO, URL, pagination, database, or migration surface changes.

Primary route: `docs/agent/dashboard.md`, with `docs/agent/engineering.md` and `docs/agent/testing.md` as overlays. Visual language follows the existing semantic-region contour implementation and the interface-design direction confirmed by the user: project envelope outside, constellation cores inside, one shared camera.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the plan changes only dashboard renderer preparation, overlays, CSS, and tests; it adds no MCP tool or registration.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — retrieval and semantic fallback paths are untouched; project contour geometry is deterministic from already returned bounded positions and remains usable without remote or embedding services.
- **P3 — Harness-Agnostic Memory Contract**: PASS — no persistence, sync, lifecycle-adapter, or harness-specific field enters the memory contract; the renderer consumes existing host-neutral visualization fields.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — recall modes, trimming, result limits, and output accounting are unchanged; the dashboard continues to paint one bounded project directory page.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — no MCP, HTTP, CLI, taxonomy, URL, or response shape changes; all new grouping/diagnostic fields are internal to the dashboard renderer.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Reuse the semantic-region SVG cloud grammar for project hierarchy. Draw one data-derived contour for each project with source cores; anchor only the responsive label subset to those contours. Suppress the static decorative nebula field and boxed constellation-core labels only for project Universe, retaining Cosmos cores, links, hover, and DOM names. | `dashboard/src/components/map/MapCanvas.tsx`, `dashboard/src/components/map/cosmos-graph-runtime.ts`, `dashboard/src/styles/observatory.css` | Real-browser project-Universe assertions for contour/label counts, absence of empty-source contours and decorative/core-label layers, and screenshots at required viewports. |
| FR-002 | Add an internal `regionKind` (`project`, `community`, or `null`) to prepared graph data. Derive `project` only for Universe data with opaque project ownership, keep `community` for the current region-aware level, and publish source points grouped by existing `pointCommunityKeys`. Preserve deterministic sparse/single-core padding, carry the group's core color into the envelope, and make initial and explicit project-Universe Fit use one deterministic viewport-aware gutter large enough for the maximum contour padding and required label height before republishing the overlay. | `dashboard/src/components/map/cosmos-graph-data.ts`, `dashboard/src/components/map/cosmos-graph-runtime.ts`, `dashboard/src/components/map/semantic-region-overlay.ts` | Pure graph-data/overlay tests cover grouping, containment, movement, determinism, and source colors/counts; real-browser assertions verify near-edge and single-core contour/label bounds after initial and explicit Fit at every required viewport. |
| FR-003 | Generalize `communityRegionPoints()` to semantic region-point publication governed by `regionKind`. Continue using `requestOverlayLayout()` on zoom, resize, simulation ticks, and data transitions; the existing `MapCanvas` lifecycle generation guard accepts only the active runtime callback. Empty-source regions are omitted, so no center fallback can persist before or after publication. | `dashboard/src/components/map/cosmos-graph-runtime.ts`, `dashboard/src/components/map/MapCanvas.tsx`, `dashboard/src/components/map/semantic-region-overlay.ts` | Browser geometry snapshots before/after zoom, pan, Fit, resize, and motion prove that contour/label bounds follow owned cores; existing generation and final-fit diagnostics prove no stale publication. |
| FR-004 | Make the filled cloud visually passive over the Cosmos canvas while retaining project activation on the contour boundary and painted label; keep the synchronized `GraphNavigator` as the full keyboard/renderer-fallback surface. Core activation continues through Cosmos/DOM without the envelope stealing the hit. | `dashboard/src/components/map/MapCanvas.tsx`, `dashboard/src/styles/observatory.css`, `dashboard/src/components/observatory/MemoryMapSurface.tsx` (contract verification only unless a narrow prop distinction is needed) | Accessibility browser test activates project label/contour and core separately with pointer, Enter, Space, and navigator paths; regression tests retain Community-region actions. |
| FR-005 | Publish deterministic overlay diagnostics on project `<g>` elements and the shell: region kind, source-point count, and screen-ready ownership. Reset layout on runtime replacement and keep the existing callback generation guard. Global Universe receives `regionKind=null`; Community retains `regionKind=community`. | `dashboard/src/components/map/cosmos-graph-data.ts`, `dashboard/src/components/map/cosmos-graph-runtime.ts`, `dashboard/src/components/map/MapCanvas.tsx` | Focused Vitest assertions read diagnostics rather than visual inference; global-Universe and Community regression cases verify unchanged grouping and no phantom overlays. |

### Geometry and presentation flow

1. `buildCosmosGraphData()` classifies the prepared dataset once: project-hierarchy Universe cores become `regionKind='project'`, Community representatives remain `regionKind='community'`, and every other level is `null`.
2. The runtime groups current Cosmos point positions by `pointCommunityKeys`, converts every finite position through `spaceToScreenPosition()`, attaches the first stable group color, and publishes the resulting project or community source groups through the existing generation-owned callback.
3. Initial and explicit project-Universe Fit use the same bounded viewport-aware gutter derived from contour padding plus required label height, then request a fresh overlay frame. The browser contract accepts the frame only when required near-edge and single-core contour/label bounds are inside the usable host; ordinary user pan remains free to move a nebula partially or fully offscreen.
4. `MapCanvas` joins region metadata to those current groups by opaque ID. Inputs with no finite source points are not converted into contours. Label priority is calculated from region metadata and viewport budget before collision placement, so hidden labels do not displace painted labels.
5. `buildSemanticRegionOverlays()` produces deterministic organic envelopes for finite inputs, including minimum-size single-core and padded collinear cases. Contour geometry remains associated with its source group; labels use only contour-adjacent candidates and may be suppressed when no collision-free candidate exists, with full naming preserved in `GraphNavigator`.
6. Project Universe paints the contour layer without the static `.cosmos-nebula-field` or boxed `data-role='region'` core labels. The Cosmos cores and within-project links remain the contained child nodes. Project bridges use the recomputed contour centers.
7. SVG fill remains non-interactive over core interiors. The contour boundary and painted project label invoke the existing `onActivateProject`; core selection continues to invoke the existing Constellation route. DOM navigation remains the authoritative complete keyboard and fallback equivalent.

### Verification sequence

1. Red tests first, before touching production renderer code: extend `tests/dashboard/cosmos-graph.test.ts` and `tests/dashboard/semantic-region-overlay.test.ts`; add project-Universe contour, camera, near-edge/single-core initial-Fit, explicit-Fit, and responsive-bound assertions to `tests/dashboard/semantic-atlas-browser.test.ts`; and add distinct hit/action coverage to `tests/dashboard/graph-accessibility.test.ts`.
2. Implement the smallest prepared-data, runtime projection/Fit, overlay, React, and CSS changes needed to satisfy those already-red focused contracts.
3. Run the two pure focused files, then the two affected browser test names/files.
4. Run `pnpm run dashboard:typecheck`, `pnpm exec vitest run tests/dashboard`, and `pnpm run build` as required for a dashboard TypeScript/visual change. Intentionally omit `tests/http-viz.test.ts` because Store/HTTP/OpenAPI contracts are unchanged, and record that boundary in verification.
5. Run real-browser QA through the repository harness at 1440×900, 1024×768, 360×800, 200% scale, coarse pointer, reduced motion, and GPU fallback/retry. Record local-only requests, overflow, contour/core containment, camera motion, and screenshots in verification evidence rather than adding generated assets to source unless the harness-owned evidence path is explicitly required.

## Optional support artifacts

- `research.md`: not needed; the failing projection boundary and existing reusable contour pipeline are directly evidenced in current code and focused tests.
- `data-model.md`: not needed; the change introduces only an internal renderer discriminator and ephemeral screen geometry, with no durable data or API model.
- `contracts/`: not needed; Store, HTTP, URL, pagination, and client response contracts are unchanged.
- `quickstart.md`: not needed; existing dashboard development and browser-harness commands cover the change.

## Risks and migrations

- **Risk — accidental global-Universe contours**: infer project grouping only when the semantic level is Universe and at least one prepared node has opaque project ownership; otherwise publish no region sources. Regression-test unqualified/global Universe.
- **Risk — overlay steals core interaction**: make the filled envelope pointer-transparent and constrain pointer activation to the contour boundary/painted label, while retaining the complete DOM navigator. Regression-test direct core activation.
- **Risk — label detachment under density**: place only the viewport-prioritized painted label subset, use contour-adjacent candidates, and suppress rather than globally scatter a label when collision-free attachment is unavailable.
- **Risk — color mismatch between contour and cores**: carry the actual prepared group's stable core color through the runtime callback instead of assigning contour colors by unrelated region-array index.
- **Risk — contour clipping or overgrowth**: test single, collinear, dense, near-edge, and resized inputs; replace the generic first-entry margin for project Universe with one deterministic viewport-aware contour/label gutter shared by initial and explicit Fit, and assert required bounds after both commands.
- **Risk — stale overlay from a prior page/runtime**: retain `MapCanvas` lifecycle generation checks, clear region layout before runtime creation, and verify project-page replacement removes every prior contour and label.
- **Migration**: none. The internal graph-data shape is regenerated in both inline and worker paths. Rollback is a source/test/CSS revert with no stored-state cleanup.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the concrete design is confined to existing dashboard modules and introduces no MCP surface.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — deterministic source positions, opaque ownership, and local contour math drive the result; renderer fallback retains the DOM hierarchy and no optional semantic service becomes load-bearing.
- **P3 — Harness-Agnostic Memory Contract**: PASS — the design adds only ephemeral dashboard `regionKind` and screen-layout diagnostics, never stored or adapter-specific memory fields.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — the existing 24-project/72-core page remains the sole working set and no lower-level data is fetched or expanded for contour rendering.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — all public routes, response fields, URLs, commands, and taxonomies remain byte-for-byte contract-compatible; no deprecation or migration is required.
