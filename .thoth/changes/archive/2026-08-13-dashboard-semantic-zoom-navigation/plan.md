# Implementation Plan: Bounded Semantic Zoom Navigation

## Technical context

`GET /viz/atlas` already supplies deterministic Universe, complete Community pagination, and bounded Neighborhood. The Store builds one cached scope projection from current observations and eligible structural KG evidence. The dashboard converts atlas pages into `VizNode`/`VizEdge`, auto-drains every Community cursor, prepares Cosmos buffers in a worker, and atomically publishes URL/context/renderer state after a render commit. Universe has a dedicated topology layout and label overlay; Community currently passes every member and internal edge through a single-community natural-seed layout.

This change adds an additive `presentation=semantic-zoom` Community projection while preserving unqualified public Community pagination. The semantic-zoom response carries exact complete source totals plus bounded representatives, deterministic internal regions, region bridges, omission counts, relation/provenance metadata, and optional focused-region state. The dashboard always requests this projection, never auto-drains complete Community pages, and renders region geometry/relationship tiers over the existing full-viewport Cosmos canvas. No SQLite migration, MCP tool, CLI command, remote dependency, embedding rebuild, or external service is involved.

Primary implementation surfaces:

- Projection and public types: `src/store/semantic-atlas.ts`, new `src/store/semantic-atlas-regions.ts`, `src/store/types.ts`, `src/store/index.ts`.
- HTTP contract: `src/http-routes.ts`, `src/http-openapi.ts`; dispatcher remains the existing `/viz/atlas` registration in `src/http-server.ts`.
- Client/state: `dashboard/src/api/client.ts`, `semantic-atlas-loader.ts`, `context-store.ts`, `ObservatoryWorkspace.tsx`, `map-state.ts`, `map-types.ts`.
- GPU/semantic view: `cosmos-graph-data.ts`, `cosmos-graph-worker.ts`, `neural-atlas-layout.ts`, `cosmos-graph-runtime.ts`, `MapCanvas.tsx`, new `semantic-region-overlay.ts`, `GraphNavigator.tsx`, `MemoryMapSurface.tsx`, new `RegionOverview.tsx`, `AtlasDock.tsx`, `AtlasDiagnostics.tsx`, and observatory styles.
- Verification: Store, HTTP, client, state/loader/layout/data, real-browser dense atlas, accessibility/privacy/fallback/lifecycle, root build and full tests.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design changes only Store, HTTP, OpenAPI, and dashboard surfaces; it adds zero MCP tools and preserves all six registered workflow tools.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Region partitioning uses the existing deterministic structural KG projection and local fallback; embeddings, LLMs, and remote services remain optional and non-load-bearing.
- **P3 — Harness-Agnostic Memory Contract**: PASS — No observation schema, taxonomy, sync, MCP, CLI, or harness-specific payload changes occur; the projection is a local read model over existing current observations and KG evidence.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall behavior is untouched; the new visualization contract independently adopts bounded progressive output rather than widening retrieval limits.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — `GET /viz/atlas` remains registered and unqualified Community pagination remains complete; semantic zoom is negotiated through additive query/response fields and typed additive errors.

## Design

### 1. Partition one Community into deterministic semantic regions

Add `buildSemanticAtlasCommunityView` in `src/store/semantic-atlas-regions.ts`. It consumes one parent `AtlasCommunityProjection`, the existing eligible `AtlasEvidenceLink[]`, observation nodes/source observations, structural presentation evidence, and facet catalog. It must not query SQLite or duplicate privacy handling.

The helper will:

1. Restrict the weighted observation projection to parent membership.
2. Reapply deterministic high-degree hub exclusion.
3. Run ordered Louvain with `randomWalk: false` and size-derived resolution.
4. Topology-split oversized regions recursively, then affinity-merge weak small regions to a maximum of 12.
5. Assign hubs and isolates deterministically so every parent member appears exactly once.
6. Derive region identity from `semantic-region-v1` plus the complete sorted member ID set.
7. Produce private-safe distinguishing concepts/names, excluding evidence whose frequency crosses the existing global-evidence cutoff; disambiguate duplicate names with stable ordinal suffixes.
8. Rank representatives with an algorithm-versioned composite of structural importance, bridge contribution, evidence quality, recency, and diversity gain, and publish a bounded private-safe `{node_id, reason, signals, rank}` explanation separate from observation content.
9. Produce a region aggregate graph, representative maximum-spanning backbones, strongest cross-region bridges, and high-relevance representative edges within one inclusive budget where `edges.length + region_bridges.length <= 450`.

Region working-set generation is pure/deterministic and independently unit-testable. The parent projection continues to own top-level Community membership.

### 2. Negotiate bounded Community projection through the existing route

Extend `SemanticAtlasPageRequest` with `presentation?: 'complete' | 'semantic-zoom'` and `region_id?: string`. Extend response types with `presentation`, `regions`, `region_bridges`, and exact source/visible/represented accounting in `navigation`. Prepared observation-endpoint edges carry tier, relationship class, direction, confidence band, evidence count, and at most five bounded provenance entries. Region bridges carry equivalent aggregate semantics but retain region endpoints and are painted by the overlay rather than converted into fake Cosmos nodes.

`Store.getSemanticAtlasPage` behavior:

- Universe and Neighborhood keep their current membership semantics and return empty region arrays.
- Community with omitted/`complete` presentation keeps the current deterministic pagination contract.
- Community with `semantic-zoom` returns one complete bounded working set: `continuation=null`; `truncated` truthfully indicates omitted source identities; node arrays obey the 180 cap and `edges + region_bridges` obey one inclusive 450 cap; source, represented-source, and visible-identity counts remain distinct.
- `region_id` produces a replacement working set biased to that region while still including bounded bridge/context representatives. It is bound to scope, generation, parent Community, region ID, and algorithm version.
- Invalid presentation combinations return `VIZ_ATLAS_PRESENTATION_INVALID`; obsolete/wrong-parent regions return `VIZ_ATLAS_REGION_GONE` with Community recovery.

The existing transaction continues to validate source revision, opaque facets, scope, location, and generation before response assembly. Cache region partitions/working sets inside the existing bounded projection cache entry or a sibling four-entry LRU keyed by projection generation + Community + region.

### 3. Replace dashboard Community auto-drain with atomic working-set publication

`semanticAtlasRequestForState` always sends `presentation=semantic-zoom` at Community and includes `region_id` when present. `loadSemanticAtlas` treats semantic-zoom Community like bounded Neighborhood: one usable response is complete for presentation even when omission metadata is nonzero. It does not follow a complete-Community cursor and does not reuse the old resume accumulator for semantic zoom.

Extend `ObservatoryState` and `ObservatoryLocation` with `regionId`. Parse/serialize `region` only at Community, include it in history trails/cache keys, and clear it when entering Universe or Neighborhood. Region activation goes through the same staged `state`/`presentedState` pipeline used by level transitions. URL, breadcrumb, graph, semantic navigator, dock, and camera publish only after matching renderer commit. Typed gone recovery returns to the current parent Community overview.

Focused-region replacement preserves positions for unchanged representative IDs via the existing `preserveNeuralAtlasPositions` seam. It retains camera state by treating a same-level/same-generation region replacement as semantic focus rather than a new global fit.

### 4. Represent regions as contours and labels, not peer memory nodes

Keep `nodes` as observation memories. Carry each observation's `region_id` into the dashboard `VizNode` adapter and worker. Map region IDs to Cosmos community keys so `buildNeuralAtlasLayout` uses multi-region constellation anchors for Community.

Add a pure `semantic-region-overlay.ts` helper that receives screen-space representative positions grouped by region and returns:

- a deterministic padded convex hull for three or more distinct points;
- a bounded ellipse fallback for one/two/coincident representatives;
- a smoothed closed SVG path;
- label anchor, priority, bounding box, color, and focused/subdued state.

`cosmos-graph-runtime.ts` publishes region overlay geometry together with current camera zoom through a new callback. `MapCanvas.tsx` renders a pointer-enabled SVG contour layer below labels and above Cosmos. The layer is recreated only with the existing renderer lifecycle and contains no raw data. DOM buttons in `GraphNavigator` remain the canonical semantic fallback.

### 5. Introduce camera-band relationship presentation without network churn

Cosmos `onZoom` already supplies a D3 zoom transform. Add a hysteretic band state:

- overview below 1.35;
- exploration enters at 1.55 and exits below 1.35;
- focused-region is explicit region state rather than a zoom threshold;
- Neighborhood remains its own level.

Prepare all bounded Community relationships once. Observation-endpoint edges are classified as `representative-backbone` or `representative-semantic`; region-anchor overlay bridges are `region-aggregate`. All expose class, direction, confidence, evidence count, and bounded provenance. `CosmosGraphRuntime` switches observation-link colors/widths/alpha and highlighted sets by band while the overlay switches aggregate bridges, without rebuilding node buffers or starting another network request. Overview draws aggregate bridges/backbone only; exploration reveals representative semantic links; focus highlights local bridges; Neighborhood retains current complete bounded local edges.

The callback reports band changes to React for copy/legend/diagnostics only; it is generation-guarded and does not feed layout or trigger a request.

### 6. Region inspection, legend, and semantic fallback

Add `RegionOverview.tsx` as the `map` dock body when a Community region is focused. It renders only response-provided private-safe summaries: exact member count, concepts/facets/time range, representative memories, strongest bridges, focus/clear actions, and bounded technical disclosure.

`MemoryOverview` continues to own observation detail. `GraphNavigator` groups Community representatives under all region entries using the response-provided reason/signals/rank, exposes region activation separately from memory activation, virtualizes only the bounded representative list, and no longer claims the complete Community member list is painted.

`MemoryMapSurface` updates counts and breadcrumbs to show source/visible/region totals, provides the co-located compact relationship legend, and retains every existing camera control. The legend changes renderer styling/edge inclusion inside the already prepared budget without renderer remount. WebGL fallback exposes identical regions, representatives, counts, focus, and Retry through DOM.

### 7. Preserve privacy, accessibility, responsive geometry, and lifecycle

All region labels, concepts, summaries, provenance, errors, and diagnostic text pass the existing Store `safeText` and dashboard `presentStoredText` boundaries. Opaque facet/region IDs, not canonical values, enter URLs and requests. No external network dependency is added.

The SVG contour layer is `aria-hidden`; its pointer targets mirror DOM region buttons, while accessible names/counts live in the navigator/dock. Pointer, Enter/Space, graph keyboard commands, reduced motion, Pause-before-ready, live WebGL loss, Retry, and history remain covered by real Chrome.

Region observers/callbacks/animation frames live under `MapCanvas`/`CosmosGraphRuntime` ownership and are canceled on replacement, failure, supersession, and destroy. Responsive overlay positioning continues to use `visualViewport` and must never resize the world/canvas.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Keep topology-derived unconstrained Universe layout; test weak/isolate placement and aspect invariance | `dashboard/src/components/map/neural-atlas-layout.ts` | Pure permutation/occupancy tests + mounted 6k Universe metrics |
| FR-002 | Preserve complete source assignment while bounding rendered identities per level | `src/store/index.ts`, `src/store/types.ts` | Store exact-count tests and normal-route request audit |
| FR-003 | Stable private-safe major constellation labels in overlays/navigator | `dashboard/src/components/map/cosmos-graph-runtime.ts`, `GraphNavigator.tsx` | Screenshot/geometry/privacy assertions |
| FR-004 | Add `presentation=semantic-zoom` bounded Community response while preserving complete default | `src/store/index.ts`, `src/store/types.ts` | Store + real HTTP dual-contract tests |
| FR-005 | Deterministic internal region partition with bounds/splitting | `src/store/semantic-atlas-regions.ts` | Pure dense/sparse/oversized/permutation tests |
| FR-006 | Full-member-set region IDs and distinguishing safe names | `src/store/semantic-atlas-regions.ts` | Identity/restart/private-equivalent label tests |
| FR-007 | Deterministic representative composite ranking and reasons | `src/store/semantic-atlas-regions.ts` | Ranking/bridge/diversity/permutation tests |
| FR-008 | Source/visible/omitted/region accounting in API and UI | `src/store/types.ts`, `MemoryMapSurface.tsx` | HTTP schema + mounted count assertions |
| FR-009 | Region-anchor layout and contour geometry | `neural-atlas-layout.ts`, `semantic-region-overlay.ts` | Pure hull/layout tests + dense screenshots |
| FR-010 | Prepare relationship tiers and switch them by level/camera band | `cosmos-graph-data.ts`, `cosmos-graph-runtime.ts` | Pure tier tests + mounted zoom-band counts |
| FR-011 | Dashboard stops after one semantic-zoom Community response | `semantic-atlas-loader.ts`, `ObservatoryWorkspace.tsx` | Loader request-count test + mounted network audit |
| FR-012 | Add `region` to location/history with atomic renderer commit | `context-store.ts`, `ObservatoryWorkspace.tsx` | URL/Back/Forward/deep-link real-browser tests |
| FR-013 | Generation-bound focused-region replacement preserving positions/camera | `src/store/index.ts`, `ObservatoryWorkspace.tsx` | stale/wrong-region tests + ≤2 px mounted metrics |
| FR-014 | Region-specific map dock | `RegionOverview.tsx`, `AtlasDock.tsx` | Mounted content/actions/scroll-hit tests |
| FR-015 | Add relation class/direction/confidence/provenance to edges/bridges | `src/store/types.ts`, `semantic-atlas-regions.ts` | Store/HTTP/OpenAPI field assertions |
| FR-016 | Compact local legend changes prepared styling without remount | `MemoryMapSurface.tsx`, `MapCanvas.tsx` | Mounted renderer identity/filter tests |
| FR-017 | Keep guarded Raw route and avoid semantic fallback to Raw | `ObservatoryWorkspace.tsx` | Normal-route/guard/failure request tests |
| FR-018 | DOM-backed region/memory parity | `GraphNavigator.tsx`, `RegionOverview.tsx` | Pointer/Enter/Space/keyboard real-browser tests |
| FR-019 | Central private-safe Store/dashboard presentation | `semantic-atlas-regions.ts`, `map-state.ts` | Angle/bracket leak probes across DOM/URL/network |
| FR-020 | Abort/generation/observer/frame/renderer ownership | `ObservatoryWorkspace.tsx`, `cosmos-graph-runtime.ts` | Delayed race + lifecycle fault/cleanup tests |
| FR-021 | Additive public negotiation, free internal dashboard replacement | `src/http-routes.ts`, `src/http-openapi.ts`, `dashboard/src/api/client.ts` | Existing complete HTTP tests + new semantic-zoom tests |

## Optional support artifacts

- `research.md`: Required to separate reusable ArcRift interaction patterns from Graphify scalability patterns and avoid copying their limitations.
- `data-model.md`: Required because region identity, partition, working-set accounting, ranking, cache, and state transitions cross Store/API/dashboard boundaries.
- `contracts/semantic-zoom-api.md`: Required because `/viz/atlas` gains additive public request/response/error semantics while preserving unqualified Community pagination.
- `design.md`: Required to bind implementation to the approved visual concept and define contours, zoom bands, relationship grammar, dock, accessibility, and responsive behavior.
- `quickstart.md`: Not needed; this is an in-place dashboard behavior change with no operator setup or migration.

## Risks and migrations

- **Region instability**: Small data changes can alter a partition. Mitigate with sorted deterministic inputs, fixed algorithm options/version, full-member-set IDs, generation-bound responses, typed gone recovery, and permutation/restart tests.
- **Region naming collapse**: Global evidence can name every region identically. Exclude high-frequency evidence, score evidence by regional distinctiveness, disambiguate duplicates, and use stable human fallbacks.
- **Representative bias**: Pure degree ranking hides recent or small subregions. Use round-robin region quotas plus bridge, recency, evidence, and diversity components; publish private-safe reasons.
- **Contour cost/jitter**: Recomputing SVG hulls every simulation tick can cause churn. Throttle through the existing overlay animation frame, use screen-space points already sampled by Cosmos, preserve stable region anchors, and skip identical geometry.
- **Zoom flicker**: Band thresholds can oscillate. Use 1.55/1.35 hysteresis and change only link buffers/config, never fetch or refit on band transitions.
- **Camera reset during region replacement**: Dataset changes can trigger fit. Treat same-level focused-region replacement as an anchored replacement, preserve unchanged positions, and suppress global fit when the user camera is active.
- **Public compatibility**: Replacing default Community semantics would violate P5. Keep unqualified `presentation=complete`, make semantic zoom additive, and test both contracts through the real dispatcher/OpenAPI/client.
- **Performance**: Region assembly and contour preparation can create long tasks. Cache Store working sets, cap 180/450, prepare graph data in the existing Worker, yield DOM grouping, and enforce <200 ms long-task evidence in real Chrome.
- **Migration**: None. All new data is derived/read-only and cached in process; no SQLite row, KG fact, observation, embedding, sync record, or community summary is rewritten.
- **Rollback**: Stop sending `presentation=semantic-zoom`, remove additive fields/UI, and restore the current complete Community client. Source data and public complete Community pagination remain intact.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The complete design touches no MCP registration or schema and adds zero tools.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Ordered local Louvain, deterministic topology splitting, safe labels, and unclustered fallback work without embeddings, LLMs, or remote services and expose degraded coverage explicitly.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The design is a derived Store/HTTP/dashboard read model with no harness field, lifecycle adapter, storage taxonomy, sync, or write-path coupling.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Existing recall caps/metrics remain unchanged, and the visualization follows the same bounded progressive principle through exact source accounting plus a capped working set.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — `/viz/atlas` remains, complete Community pagination remains the omitted/`complete` behavior, semantic zoom is additive, typed errors are additive, and all dispatcher/OpenAPI/client compatibility seams are explicitly tested.
