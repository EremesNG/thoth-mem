# Implementation Plan: Continuous Full Neural Atlas

## Technical context

The current behavior crosses dashboard, renderer, and HTTP/store boundaries:

- `dashboard/src/components/map/cosmos-graph-runtime.ts` finishes each motion phase with `graph.stop()`, starts near the simulation floor, and reheats it from a 1,800 ms interval. Each low-alpha run cools before the next interval, producing the reported move/stop cadence. Repeated low-energy forces also pull the deterministic world toward a smaller central shape over time.
- `dashboard/src/components/observatory/ObservatoryWorkspace.tsx` requests only 60/140, 120/360, or 220/520 node/edge caps according to Field of view and presents continuation as a manual frontier. `VizSliceRequest.cursor` already reaches `src/store/index.ts`, but `getVisualizationSlice` does not consume it, so the current dashboard cannot drain the complete scope.
- `dashboard/src/components/GuidedSelect.tsx` mounts `.guided-select-popover` under the selector root. The atlas filter body scrolls with `overflow: auto`, so z-index cannot let the listbox escape its clipping ancestor.
- The installed `@cosmos.gl/graph` 3.4.0 API is sufficient: it supports GPU simulation, stable point/link arrays, pinned points, partial configuration, simulation lifecycle callbacks, zoom interaction provenance, and renderer destruction. No renderer or dependency replacement is justified before measured implementation evidence says otherwise.
- Public behavior must preserve current visualization slice/frontier routes, URL/history and focus parity, semantic fallback, private-safe presentation, reduced motion, WebGL recovery, and local-only delivery. The new complete-graph API is additive.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change touches dashboard and an additive HTTP visualization read only; it registers no MCP tool and leaves the six-tool surface unchanged.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Graph pagination reads existing current facts deterministically and preserves explicit semantic health plus the non-WebGL semantic navigator.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The new page contract uses ordinary HTTP scope/cursor values and existing visualization identities, with no host-specific field or lifecycle semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — MCP recall is unchanged; complete visualization uses bounded HTTP pages and progressive client assembly rather than an unbounded response.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — Existing `/viz/slice`, `/viz/expand`, observatory routes, query names, and response contracts remain; `/viz/graph` is additive and documented in OpenAPI.

## Design

### Product and interface intent

- **Human and task**: A developer or operator opens the observatory after agents have accumulated memory and needs to perceive the whole knowledge field, find communities, and follow relationships without thinking in internal IDs or pagination mechanics.
- **Desired feel**: Dense like a neural instrument, calm like a slowly breathing organism, and spatially trustworthy. Motion communicates life but never demands attention; completeness is visible without turning the interface into an admin data dump.
- **Domain**: neurons, synapses, constellations, memory traces, communities, recall orbits, focus trails, and living current-state memory.
- **Color world**: vacuum blue-black, ion cyan, synaptic amber, memory coral, nebula violet, phosphor mint, and graphite starlight. The change retains the established palette because it belongs to the product world and already distinguishes communities.
- **Signature**: one complete living constellation that progressively resolves into full density while remaining continuously calm. The count and spatial field converge together; no separate “load more” workflow interrupts exploration.
- **Defaults rejected**: capped dashboard sample → complete cursor-drained scope; timer-based animation pulses → one continuous low-energy simulation; absolutely positioned child menu → visual-viewport top layer.
- **System choices**: Preserve the current sharp technical typography, 4 px spacing rhythm, borders/surface shifts for depth, dark inset controls, and existing elevation tokens. The selector top layer is exactly one surface level above its trigger panel and introduces no new decorative palette or shadow language.

### 1. Add a deterministic complete-graph page contract

Add `GET /viz/graph` as a current-state, read-only visualization endpoint with the existing project/session/topic/type/relation/query scope parameters plus an opaque `cursor`. Each cursor encodes version, scope fingerprint, a deterministic graph-generation fingerprint, and the last fact key so pages use stable keyset traversal rather than mutable offsets. The generation fingerprint hashes the ordered canonical visualization source signatures for the scope, including source lane, stable row identity, graph-relevant fields, and current/deleted/superseded state; insertion, deletion, update, or supersession therefore changes the generation.

`Store.getVisualizationGraphPage` will:

1. open one consistent read transaction for generation validation and page assembly;
2. compute the current scope fingerprint and either create a first-page cursor or compare it with the continuation generation;
3. reject a stale generation before returning any mixed page, using the typed `VIZ_GRAPH_GENERATION_STALE` HTTP 409 contract;
4. read at most 250 ordered current fact rows after the validated cursor;
5. build every node and edge endpoint required by those rows, keeping each response bounded to a known worst case;
6. return the existing `VizSliceResponse` shape with `truncated` equal to whether another page exists and `continuation` equal to the next opaque cursor or `null`;
7. preserve stable IDs and deterministic order for both legacy and KG-backed fact sources.

Shared project/session/topic nodes may repeat between pages by design; the client owns identity merging. Every edge returned by one page includes both endpoints in that page, so partial semantic rendering never sees dangling identities. Invalid, replayed-under-another-scope, malformed, or generation-stale cursors fail explicitly. `src/http-routes.ts` owns handler validation and response mapping; `src/http-server.ts` owns the corresponding import and URL dispatch, so the additive path is reachable in the real bridge. Existing bounded `/viz/slice` and `/viz/expand` behavior remains available for local frontier operations and compatibility.

Affected public interfaces are `VizGraphPageRequest`, `VizSliceResponse`, `Store.getVisualizationGraphPage`, `handleVizGraph`, the `src/http-server.ts` route table, the OpenAPI path, and `api.getVizGraphPage`.

### 2. Introduce one abortable full-atlas loading state machine

Move initial graph acquisition behind a focused helper in `dashboard/src/components/observatory/full-atlas-loader.ts`. One scope generation owns one `AbortController` and advances through `initial -> streaming -> complete` or `partial-error`. It will:

- request `/viz/graph` until `continuation` is `null`, including pages that deduplicate to zero new identities;
- merge nodes and edges by stable ID and publish coalesced progressive updates;
- yield to the browser between page preparation/commits with `scheduler.yield()` when available and a zero-delay task fallback otherwise;
- retain useful earlier pages on a later failure and allow Retry from the failed cursor;
- on `VIZ_GRAPH_GENERATION_STALE`, discard the mixed accumulator and automatically restart at `cursor=null` at most twice for the active scope generation; a third invalidation enters a bounded partial-error state whose explicit Retry starts a new loader generation and restart budget;
- abort and invalidate all callbacks on scope change, route replacement, retry generation, or unmount.

`ObservatoryWorkspace` will stop selecting HTTP caps from Field of view. Field of view remains a presentation/camera preference only. `MemoryMapSurface` will show current counts and a concise `Loading full atlas`/`Complete atlas` state, remove the initial `Reveal more` action, and keep already loaded nodes interactive. Explicit selected-node exploration remains available but merges into the same stable graph rather than acting as the primary completion mechanism.

The first page may fit automatically. The runtime performs one final whole-atlas fit only if no user-driven zoom, pan, focus camera, or explicit viewport command occurred while pages arrived. Otherwise the user's camera wins.

### 3. Replace cadence reheats with one continuous bounded Cosmos lifecycle

`CosmosGraphRuntime` will remove `ambientTimer` and periodic `setInterval` reheats. A normal visible dataset enters one long-lived low-alpha Cosmos simulation with a slow decay budget; data/focus transitions pause or adjust that same lifecycle and resume it once, without calling `stop()` between ambient windows. Simulation callbacks record start/end/pause/unpause diagnostics for mounted continuity assertions.

To prevent the field from shrinking over time:

- `CosmosGraphData` derives a deterministic highest-degree anchor for each community;
- the runtime pins those anchors at the world layout's community centers while unpinned memories retain subtle force movement;
- expansion preserves current positions for existing IDs and assigns deterministic community/frontier positions only to new IDs;
- progressive dataset changes do not replay focus travel when the focused ID did not change;
- final fit uses the stable complete extent, not a square host normalization.

Pause, reduced motion, `document.hidden`, context loss, failed status, supersession, and destroy all pause/stop the simulation and cancel renderer-owned work. Resume starts one allowed simulation. Dense mode retains every point and link but may reduce curve segments, arrow detail, hover sampling frequency, or overlay-label work at measured thresholds; it may not thin identity arrays.

### 4. Promote every guided selector to a viewport-aware top layer

`GuidedSelect` will render its listbox with `createPortal` under `document.body`. Where supported, a manual native Popover promotes it to the browser top layer; the same portal uses fixed positioning as the bounded fallback. A small `guided-select-position.ts` helper computes logical start alignment from the trigger rectangle, flips above when needed, clamps to an 8 px visual-viewport margin, and bounds list height.

Position updates are coalesced to animation frames and respond to trigger/listbox resize, capture-phase ancestor scroll, window scroll/resize, and `visualViewport` resize/scroll. Closing removes every listener/observer/frame, hides the native popover when used, and unmounts the portal.

Outside-pointer and blur logic treat the trigger root and portaled listbox as one interaction region. Search, active option, Enter, Escape, clear, light dismissal, focus return, ARIA ownership, canonical value commits, loading/empty messages, and private-safe labels remain unchanged. Shared implementation automatically fixes the atlas and every Control Room route.

### 5. Keep full-density preparation and semantic navigation responsive

Large graph preparation remains deterministic and local. Page size plus yielding prevents one network/merge loop from monopolizing the main thread. `GraphNavigator` will pre-index relation summaries in O(nodes + edges) instead of searching all edges for every semantic row. Cosmos data preparation retains linear passes and can coalesce multiple pages into one animation-frame commit.

The mounted large-fixture gate measures long tasks and representative control latency. If the first implementation exceeds the declared 200 ms merge-task or 250 ms interaction bounds, move pure graph-data preparation to a local Worker before relaxing any completeness criterion. This is an implementation contingency, not permission to discard nodes or links.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Remove interval reheats and run one guarded low-alpha Cosmos lifecycle. | `dashboard/src/components/map/cosmos-graph-runtime.ts`; `CosmosRuntimeSnapshot` | Mounted tick-gap/start-count/Pause/Resume/hidden/context-loss tests. |
| FR-002 | Pin deterministic community anchors, preserve existing positions, and use bounded transition emphasis. | `dashboard/src/components/map/cosmos-graph-data.ts`; `dashboard/src/components/map/neural-atlas-layout.ts`; `dashboard/src/components/map/cosmos-graph-runtime.ts` | Unit anchor/layout tests plus 10-second buildable and 5-minute outcome soak. |
| FR-003 | Replace capped initial slice with automatic complete-scope loader and streaming/complete presentation. | `dashboard/src/components/observatory/ObservatoryWorkspace.tsx`; `dashboard/src/components/observatory/full-atlas-loader.ts`; `dashboard/src/components/observatory/MemoryMapSurface.tsx`; `dashboard/src/components/observatory/ResourceStateNotice.tsx` | Real-browser multi-page fixture reaches exact final counts with no reveal action. |
| FR-004 | Add generation-validated scope-bound keyset pages through additive `/viz/graph`, reject mutation-stale cursors, and register the real server dispatch. | `src/store/types.ts`; `src/store/index.ts`; `src/http-routes.ts`; `src/http-server.ts`; `src/http-openapi.ts`; `dashboard/src/api/client.ts` | Store mutation/retraction, real HTTP dispatch, OpenAPI, and typed-client stale-cursor contract tests. |
| FR-005 | Merge every page and frontier response by stable identity while retaining partial/error/complete states. | `dashboard/src/components/map/map-state.ts`; `dashboard/src/components/observatory/full-atlas-loader.ts`; `dashboard/src/components/observatory/observatory-utils.ts` | Duplicate, empty-new-identity, retry, supersession, and dangling-endpoint tests. |
| FR-006 | Preserve current positions/camera across pages and perform a final fit only before user camera interaction. | `dashboard/src/components/map/cosmos-graph-runtime.ts`; `dashboard/src/components/map/MapCanvas.tsx`; `dashboard/src/components/observatory/ObservatoryWorkspace.tsx` | Mounted camera/focus geometry before, during, and after complete loading. |
| FR-007 | Keep metadata-only values while moving listbox DOM outside clipping ancestors. | `dashboard/src/components/GuidedSelect.tsx`; `dashboard/src/components/guided-select-position.ts` | Canonical URL/API commits plus portal ownership and clipping checks. |
| FR-008 | Keep the compact filter panel fixed while selectors escape it without canvas reflow. | `dashboard/src/components/observatory/AtlasScopePanel.tsx`; `dashboard/src/styles/observatory.css` | Atlas dimensions/focus/camera unchanged during selector open/reposition/close. |
| FR-009 | Use native top layer when available and a fixed portal fallback with visual-viewport collision handling. | `dashboard/src/components/GuidedSelect.tsx`; `dashboard/src/components/guided-select-position.ts`; `dashboard/src/styles/controls.css` | Desktop/tablet/mobile/short/200% geometry, hit testing, and keyboard/a11y matrix. |
| FR-010 | Give graph paging, positioning, and simulation one explicit owner and bounded cleanup. | Loader, selector, `MapCanvas`, `CosmosGraphRuntime`, browser harness | Supersession/failure/unmount tests and post-run process/profile/port scan. |
| FR-011 | Retain all GPU identities, adapt only rendering quality, yield page commits, and remove semantic O(N×E) lookup. | `dashboard/src/components/map/cosmos-graph-runtime.ts`; `dashboard/src/components/map/cosmos-graph-data.ts`; `dashboard/src/components/map/GraphNavigator.tsx`; loader | 2,565-node/5,414-edge Chrome test with long-task and command-latency metrics. |
| FR-012 | Reuse safe presentation and same-origin fetch for every new count, page, portal, diagnostic, and fallback path. | `dashboard/src/components/safe-presentation.ts`; API client; observatory/selector presentation | Private-marker and external-request assertions across rich and fallback states. |

## Optional support artifacts

- `research.md`: Not needed; the installed Cosmos 3.4.0 declarations/runtime behavior, current Store pagination seam, and mounted UI tests provide direct repository evidence recorded above.
- `data-model.md`: Not needed; no SQLite schema or durable memory entity changes.
- `contracts/`: Not needed; the additive HTTP contract is small, is fully specified in this plan, and `src/http-openapi.ts` remains its executable authority.
- `quickstart.md`: Not needed; existing dashboard commands and browser harness remain the verification workflow.

## Risks and migrations

- **Large graph CPU/GPU cost**: Bound each server page, yield between commits, coalesce React updates, keep linear data preparation, index semantic summaries, and adapt only visual quality. The 2,565/5,414 mounted fixture is a release gate. Worker offload is the contingency if measured tasks exceed bounds.
- **Power use from continuous simulation**: Use very low energy, one lifecycle, and immediate suspension for Pause, reduced motion, hidden documents, renderer failure, inactive routes, and unmount. Rollback is restoring a fully static post-settle mode, not periodic pulses.
- **Graph mutation during pagination**: Each page validates a deterministic scope-generation fingerprint and reads its page inside the same Store transaction. Any inserted, deleted, updated, or superseded source invalidates the cursor with `VIZ_GRAPH_GENERATION_STALE`; the loader discards the mixed accumulator and automatically restarts at most twice. Repeated churn degrades to an explicit partial-error/Retry instead of looping or claiming completeness.
- **Camera interruption during streaming**: Track user-driven camera activity and suppress automatic final fit once the user acts. Rollback can disable final auto-fit without affecting completeness.
- **Portal focus/outside-click regressions**: Model trigger and portal as one region, retain the combobox input as the active keyboard owner, and verify every close path and viewport state against mounted Chrome.
- **Popover compatibility**: Feature-detect native Popover; fixed portaled positioning is the supported fallback. No new dependency is required.
- **Public API stability**: `/viz/graph` is additive and OpenAPI-documented; existing slice/frontier routes are unchanged. There is no persistence migration. Rollback can return the dashboard to `/viz/slice` while leaving the additive route harmlessly available.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design adds no MCP registration and confines complete graph delivery to the existing dashboard/HTTP boundary.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Keyset ordering plus transactionally validated graph-generation fingerprints prevent mixed snapshots; bounded automatic restart and explicit partial-error/Retry handle mutation churn while semantic degradation and the DOM navigator remain usable.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Scope-bound graph pages are plain local HTTP data derived from the host-neutral Store and work identically for every dashboard consumer.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall contracts remain untouched; graph completeness is assembled from pages capped at 250 fact rows with explicit continuation and browser yielding.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The plan preserves every named route and shape in use, adds one documented read endpoint, and requires store/HTTP/client/OpenAPI contract tests before implementation completes.
