# Implementation Plan: Project Nebula Atlas Navigation

## Technical context

The current Store builds one global `SemanticAtlasProjection`: eligible observation-to-observation evidence is partitioned into communities, Universe returns those community nodes, and a project is only an opaque facet applied before projection. A community node therefore has `project: null` and may report `project_count > 1`. The dashboard models only `universe | community | neighborhood`, treats Universe nodes as constellations, and serializes no project parent in its semantic location.

The new dashboard path must preserve the public unqualified atlas while adding an explicitly negotiated project hierarchy. The Store remains the durable behavior owner; HTTP validates and documents the additive negotiation; the dashboard always requests the project hierarchy. No SQLite schema, migration, background job, MCP tool, CLI command, remote service, or new package is required.

The camera defect is confirmed in `buildCosmosGraphData` and `CosmosGraphRuntime.setData`: every semantic replacement except Neighborhood advertises position preservation, and runtime suppresses fit even when Universe is replaced by an unrelated Community dataset. The graph library exposes `getZoomLevel`, `screenToSpacePosition`, and `setZoomTransformByPointPositions`, which are sufficient for an ephemeral location-scoped camera snapshot without accessing private renderer internals. The current semantic loader also follows and merges every continuation by default; that behavior is valid for the global compatibility path but would defeat a bounded project directory by painting prior Universe pages together.

Affected ownership surfaces:

- Store projection and identities: `src/store/semantic-atlas.ts`, a focused new `src/store/project-atlas.ts`, `src/store/index.ts`, `src/store/types.ts`, and existing region helpers.
- Public HTTP/OpenAPI: `src/http-routes.ts`, `src/http-openapi.ts`, and `tests/http-viz.test.ts`.
- Typed client and loading: `dashboard/src/api/client.ts`, `dashboard/src/components/map/map-state.ts`, `dashboard/src/components/observatory/semantic-atlas-loader.ts`, and loader/client tests.
- Navigation state and orchestration: `context-store.ts`, `ObservatoryWorkspace.tsx`, `MemoryMapSurface.tsx`, `GraphNavigator.tsx`, and navigation/accessibility tests.
- Geometry, overlays, renderer, and camera: `neural-atlas-layout.ts`, `semantic-region-overlay.ts`, `cosmos-graph-data.ts`, `cosmos-graph-worker.ts`, `cosmos-graph-runtime.ts`, `MapCanvas.tsx`, and their focused tests/browser harness.
- Durable agent context: `docs/agent/dashboard.md`, `docs/agent/surfaces.md`, and `docs/agent/persistence-retrieval.md` only where the implemented contract changes their routed guidance.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the change adds no MCP tool or registration and remains inside Store, HTTP, and dashboard surfaces.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — project grouping and constellation partitioning use deterministic KG evidence with an explicit unclustered fallback; no embeddings, LLM, or remote service becomes load-bearing.
- **P3 — Harness-Agnostic Memory Contract**: PASS — the hierarchy is derived from host-neutral observation project values and graph evidence; it introduces no harness-specific field, schema, or lifecycle behavior.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — MCP recall is untouched, while the atlas adds stricter visual budgets and exact omission metadata rather than unbounded output.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — `hierarchy=project` and `level=project` are additive; omission retains the current global Universe/Community contract, pagination, and errors.

## Design

### 1. Additive hierarchy negotiation

Add `AtlasHierarchy = 'global' | 'project'` and a request field `hierarchy?: AtlasHierarchy`; omission resolves to `global`. Add `project` to `AtlasLevel`, but accept it only when `hierarchy=project`. Add opaque `project_id` to hierarchy requests and `owner_project_id` to project-owned community/observation nodes. Keep `project_token` as a separate facet. Resolve both server-side and reject a conflict instead of intersecting them silently.

The default dashboard semantic loader sends `hierarchy=project` for Universe, Project, Constellation, and Neighborhood. Raw continues through `/viz/graph`. Existing callers that omit hierarchy continue through the unchanged global projection path.

### 2. Project-owned projection

Keep `buildSemanticAtlasProjection` as the compatibility projection and reuse its observation nodes, global eligible evidence links, presentation evidence, supporting evidence, facet catalog, and coverage accounting. Introduce `src/store/project-atlas.ts` for the new pure hierarchy projection:

1. Assign every observation to one canonical parent key: normalized non-empty project value or a domain sentinel for Unassigned.
2. Derive one opaque project-nebula ID per parent with the existing collision-resistant identity helper and a new domain tag.
3. Partition each parent's observation IDs independently using the existing deterministic observation projection and community-bounding rules. Project metadata defines the boundary but is never a clustering edge or node.
4. Derive project-owned constellation IDs from hierarchy algorithm version, opaque parent ID, and the complete sorted member set.
5. Aggregate eligible evidence whose endpoints share a parent into constellation edges; aggregate cross-parent evidence into project bridges. Never duplicate or assign a cross-project edge to a child constellation.
6. Build deterministic private-safe project presentations from the facet catalog; use one fixed Unassigned presentation when no usable canonical project exists.
7. Select Universe project regions deterministically by source membership, bridge contribution, and stable ID. Allocate the 150 constellation-core budget round-robin so every visible project receives one representative core before any project receives another.

The project hierarchy is cached lazily beside the existing scope/revision projection. Its cache and response fingerprints include hierarchy version, hierarchy mode, scope, project, level, community, region, focus, and presentation. It does not create persistent tables.

### 3. Response and accounting model

Add `SemanticAtlasProjectRegion` and `SemanticAtlasProjectBridge` arrays without overloading Community regions:

- A project region contains opaque ID, safe label/summary, exact memory and constellation counts, visible/omitted constellation counts, visible core IDs, deterministic seed, and `unassigned`.
- A project bridge contains opaque endpoints, weight, evidence count, relationship class/direction/confidence, representative child edges, and bounded provenance.
- Navigation adds project identity plus exact source/visible/omitted project, constellation, memory, and relationship counts for the active level.

Universe project hierarchy returns no observation nodes. Project returns only project-owned community nodes. Constellation and Neighborhood reuse existing observation/supporting node shapes with `owner_project_id` populated and validated. Existing `regions` and `region_bridges` remain Constellation-specific.

Project hierarchy paging is a visual directory, not a background accumulator. At project-hierarchy Universe, `page_size` counts project regions and is clamped to 150; the dashboard requests 24 projects and the Store allocates up to three fair representative cores per requested project, capped at 72 for the dashboard page and 150 by the public contract. At Project, `page_size` counts constellation aggregates and remains capped at 150. `semantic-atlas-loader.ts` gains an explicit single-page mode for project-hierarchy Universe and Project, while the unqualified global path retains automatic accumulation. `map-state.ts` replaces the prior page working set in single-page mode and continues to merge only accumulation-mode responses.

The opaque response continuation becomes the next semantic page cursor. Selecting Next commits a new page-scoped location and paints only the returned page; Previous uses the location trail's prior cursor. Direct URLs can restore a current opaque cursor, and a stale cursor follows existing typed generation recovery. A deterministic 181-project browser fixture proves that no page exceeds 24 regions/72 cores and that the last project remains reachable without auto-drain.

### 4. HTTP and OpenAPI boundary

`src/http-routes.ts` validates the request matrix documented in `contracts/project-nebula-api.md`, rejects raw project values, and maps typed project/hierarchy errors. `src/http-openapi.ts` mirrors the new enums, schemas, counts, ownership fields, paging semantics, negotiation rules, and recovery levels. Unknown hierarchy/level combinations fail rather than falling through to global behavior.

The semantic recall/pivot boundary participates in the same negotiation. A dashboard recall/pivot request declares `hierarchy=project`; the Store resolves the selected observation against the revision-bound project projection and returns `project_id` plus the project-owned `community_id`. The pivot token binds that hierarchy and owner tuple. Omitted hierarchy retains the global pivot behavior with `project_id=null`. HTTP and the client only transport these opaque fields; neither derives project ownership from a safe label or facet token.

The Store performs canonical resolution and ownership validation transactionally. HTTP remains thin and never recreates partitioning, privacy, or identity rules.

### 5. Semantic navigation state

Extend `ObservatoryLocation` and `ObservatoryState` with `projectId` and `pageCursor`. Canonical locations become:

- Universe: no project, community, region, or focus; optional opaque project-page cursor.
- Project: project plus optional opaque constellation-page cursor.
- Constellation: project + community + optional region.
- Neighborhood: project + community + focus.

URL state uses opaque `project`, `community`, `cursor`, `region`, and `focus` values plus existing opaque facet tokens. The location trail still caps at 24 entries and deduplicates the complete tuple, including page cursor. Next commits the response continuation as a new page location; Previous restores the prior page location instead of reconstructing or reversing a server cursor. Search pivots send project-hierarchy negotiation and commit the server-resolved owning project and community atomically. Stale project recovery returns to Universe; stale community returns to its current Project when known; stale region returns to Constellation overview.

`ObservatoryWorkspace` distinguishes activation targets: a project-region contour/label commits Project, a Universe constellation core commits Constellation directly, a Project constellation commits Constellation, a region stays inside Constellation, and an observation commits Neighborhood. It also owns single-page loader mode and translates Universe/Project continuation into bounded Next/Previous actions surfaced by `GraphNavigator`; it never merges two visual-directory pages.

### 6. Project-nebula geometry and expression

The existing dark Neural Observatory remains the visual system. The signature is nested spatial ownership rather than a new theme:

- Universe: organic project contours, safe project labels, exact memory/constellation counts, contained constellation cores, subdued intra-project structure, and sparse project bridges.
- Project: the current organic Universe-like community network, but scoped to one project and labelled as constellations rather than files or individual memories.
- Constellation: current region contours and bounded representative stars.
- Neighborhood: current local evidence.

Generalize the existing point-derived contour helper so it can produce project contours and Community region contours from separate typed inputs. Do not create fake Cosmos nodes for project regions or bridges. Add DOM-backed project groups to `GraphNavigator`; every project action and contained constellation action has a distinct button and accessible name. Responsive label prioritization follows current region behavior, while the complete bounded hierarchy remains in DOM navigation.

`buildNeuralAtlasLayout` gains a Project level and a project-nebula Universe layout. Project centers use project-bridge topology plus deterministic isolated placement; contained constellation cores use local project-owned topology around the center. Project level uses the current aggregate-network layout for its constellation nodes. All output remains in the positive 4096-unit Cosmos world.

### 7. Location-scoped camera lifecycle

Carry a `layoutIdentity`/semantic-location key from `ObservatoryWorkspace` through `MapCanvas`, worker requests, and `CosmosGraphData`. It includes hierarchy, level, project, community, bounded-page cursor, region-independent owner, scope fingerprint, and geometry generation where membership changed. Region focus remains a same-location replacement so its stable anchors and camera can be preserved; changing the page cursor is a new semantic location and receives its own frame.

Replace the broad `semanticLevel !== 'neighborhood'` policy with explicit transition classification:

- New location: never reuse parent positions or parent camera. Mark one pending semantic frame and apply it only after the complete dataset and contour inputs are committed.
- Same location with shared stable points: preserve positions and a valid user camera; do not fit.
- Same location with no shared extent, invalid snapshot, or membership-changing geometry identity: discard preservation and frame once.
- History restoration: restore a finite snapshot `{centerX, centerY, zoom, layoutIdentity, worldExtent}` using `screenToSpacePosition` and `setZoomTransformByPointPositions`; if validation fails, frame once.

Semantic `setData` no longer performs an early fit followed by another final fit. `completeDataset` owns the one first-entry frame, sets `finalFitSettled`, and publishes overlays/renderer commit afterward. The frame uses point positions plus deterministic padding sufficient for project/region contours. Reduced motion snaps with duration zero. Raw retains its current lifecycle.

### 8. TDD, lifecycle, and documentation

Implementation begins with failing Store identity/ownership tests, then HTTP contract tests, navigation state tests, pure layout/camera policy tests, and finally mounted browser tests. Every behavior-changing slice follows the installed `tdd` skill. After implementation, run `simplify` without changing behavior before independent verification.

Owned requests, workers, timers, animation frames, overlays, observers, and renderer commits remain generation guarded. Documentation is updated only after behavior is proven.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add project-center topology with locally contained constellation cores and organic contours. | `neural-atlas-layout.ts`, `semantic-region-overlay.ts`, `cosmos-graph-data.ts` | Pure layout/overlay tests and mounted geometry assertions. |
| FR-002 | Build exact project parent and project-owned constellation membership before level responses. | `project-atlas.ts`, `semantic-atlas.ts`, `src/store/index.ts` | Store fixture sums and zero root observation nodes. |
| FR-003 | Add project and page cursor to canonical semantic location; make Store/HTTP/client pivots return the opaque owning project and project-owned constellation. | `src/store/types.ts`, `src/store/index.ts`, `src/http-routes.ts`, `src/http-openapi.ts`, `dashboard/src/api/client.ts`, `context-store.ts`, `ObservatoryWorkspace.tsx` | Store/HTTP pivot ownership, navigation parse/serialize, page history, and atomic publication tests. |
| FR-004 | Classify camera transitions by semantic location and make `completeDataset` the sole semantic first-entry fit owner. | `cosmos-graph-runtime.ts`, `MapCanvas.tsx`, `cosmos-graph-data.ts` | Pure runtime tests plus browser comparison against explicit Fit. |
| FR-005 | Render nested project/constellation DOM controls with pointer/keyboard parity and fallback. | `GraphNavigator.tsx`, `MemoryMapSurface.tsx`, `MapCanvas.tsx` | `graph-accessibility.test.ts` and WebGL fallback browser tests. |
| FR-006 | Source root labels only from safe project presentation and render project contours/counts. | `project-atlas.ts`, presentation adapters, project overlay UI | Privacy fixtures, label-source assertions, screenshot review. |
| FR-007 | Add project bridges and Project constellation bridges while retaining lower-level tiers. | Store project aggregation, client adapters, runtime styling | Relationship-tier Store/HTTP/runtime tests. |
| FR-008 | Extend exact level-local source/visible/omitted counters. | Store response types, `MemoryMapSurface.tsx`, navigator/dock | Cross-layer count equality tests. |
| FR-009 | Separate `project_id` navigation from `project_token` scope and reject conflicts. | Store resolver, HTTP request, client state | Conflict, opaque URL, duplicate-label tests. |
| FR-010 | Partition eligible evidence independently per project and aggregate cross-project evidence upward. | `project-atlas.ts`, shared semantic partition helpers | Mixed-project evidence fixtures and permutation tests. |
| FR-011 | Add deterministic Unassigned parent and unclustered child fallback. | `project-atlas.ts`, identity/presentation helpers | Null/private project and missing-KG fixtures. |
| FR-012 | Negotiate bounded project hierarchy, make Universe continuation a single replaceable 24-project/72-core dashboard page, and retain unqualified global accumulation. | Store request/response, HTTP/OpenAPI, `map-state.ts`, dashboard loader/workspace/navigator | Compatibility, single-page loader, and 181-project reachability tests. |
| FR-013 | Implement Project-level read, continuation, counts, and typed recovery. | Store, `src/http-routes.ts`, OpenAPI, client loader | Project page/continuation/stale/conflict tests. |
| FR-014 | Validate project ownership for hierarchy Community while retaining unqualified Community. | Store selection, request types, HTTP/OpenAPI | Wrong-parent rejection and compatibility tests. |
| FR-015 | Include hierarchy/location in every generation and publication guard. | Store cache/fingerprint, loader generations, renderer worker/runtime | Rapid supersession, stale response, cleanup tests. |
| FR-016 | Domain-separate project, project-community, bridges, and location identities. | visualization identity helpers, `project-atlas.ts` | Collision, order, restart, and safe-label permutation tests. |

## Optional support artifacts

- `research.md`: Not needed; explorer findings and confirmed current behavior are distilled in Technical context and the design decisions above.
- `data-model.md`: Created because project ownership, additive global/project modes, counts, identity derivation, and ephemeral camera state are cross-surface invariants.
- `contracts/`: Created because the request matrix, additive compatibility, response fields, and typed recovery change a public HTTP boundary.
- `quickstart.md`: Not needed; existing dashboard/test commands remain authoritative and no setup or operator workflow changes.

## Risks and migrations

- **Public contract drift**: adding a level can accidentally change unqualified reads. Mitigation: branch on explicit `hierarchy=project`, retain global fixtures, and verify OpenAPI/client parity. Rollback: stop dashboard negotiation and remove only additive fields/path.
- **Mixed-project ownership errors**: reusing global community IDs would make parentage false. Mitigation: domain-separated project-owned IDs from complete member sets and explicit wrong-parent rejection.
- **Universe crowding or hidden omissions**: many projects and cores can recreate a hairball, while stopping at one page can strand omitted projects. Mitigation: a 24-project/72-core dashboard page, fair core allocation, sparse bridges, exact omissions, explicit Next/Previous controls backed by opaque cursor history, no page merging, and a 181-project browser reachability fixture.
- **Projection cost**: partitioning every project independently may amplify work. Mitigation: reuse one evidence projection, group once, lazy revision-bound cache, pure deterministic algorithms, and 6,000-memory performance/browser probes.
- **Camera race or double fit**: dataset, overlay, and completion callbacks can arrive in different frames. Mitigation: one generation-bound pending-frame owner, exact layout identity, one finalization path, and explicit fit-count diagnostics in tests.
- **Invalid camera restoration**: a snapshot may not intersect changed geometry. Mitigation: validate finiteness, identity, zoom bounds, and world intersection before restore; otherwise deterministic fit.
- **Privacy leakage**: canonical project values could escape through IDs, errors, labels, or URL. Mitigation: opaque domain-separated IDs, central safe presentation, fixed Unassigned fallback, and end-to-end private-marker probes.
- **Accessibility regression**: painted nested contours may lack an equivalent hierarchy. Mitigation: project-group DOM buttons, contained constellation buttons, focus-visible states, live-region updates, and keyboard/browser verification.
- **Migration**: none. No SQLite, sync, package, config, or persistent camera migration is introduced.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the completed design changes no MCP registration and keeps navigation on existing Store/HTTP/dashboard ownership boundaries.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — all project and constellation membership, labels, fallback, IDs, and layout seeds are deterministic; missing KG becomes explicit unclustered coverage.
- **P3 — Harness-Agnostic Memory Contract**: PASS — canonical observation projects and graph evidence remain host-neutral, and no harness adapter or lifecycle payload enters the hierarchy.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — MCP recall remains unchanged; every new atlas level has explicit project/core/constellation bounds, continuation, and omission accounting.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — the plan makes the project hierarchy opt-in at `/viz/atlas`, keeps omitted hierarchy behavior global, and adds compatibility tests before dashboard adoption.
