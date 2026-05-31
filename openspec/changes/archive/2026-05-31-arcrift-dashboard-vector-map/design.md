# Design: ArcRift-Style Vector Map Dashboard Redesign

## Technical Approach

This change replaces the current list-first dashboard posture with a map-first exploration workspace while preserving existing endpoints and read-only guarantees. The implementation will introduce a dedicated visualization API surface (`/viz/*`) and a new dashboard map module that renders a live point-cloud with semantic, KG, and metadata overlays.

The design is intentionally product-forward:

- Default route moves to map workspace (`/`) with left filter rail, central map canvas, right inspector.
- Existing Overview/Search/Topic/Graph-Lite remain reachable as secondary views for compatibility.
- Vector map rendering uses Canvas + D3 interaction primitives for scale and fluidity.
- Backend returns bounded, typed slices with continuation cursor and explicit state (`empty|sparse|dense`, `ready|pending|degraded|rebuilding`).

## Architecture Decisions

### Decision: Canvas-first renderer with D3 interaction (not SVG-only)
**Choice**: Use HTML Canvas for node/edge drawing plus D3 modules (`d3-zoom`, `d3-force`, `d3-quadtree`, `d3-scale`) for camera, stabilization, hit-testing assist, and clustering utilities.
**Alternatives considered**:
- SVG graph rendering (too expensive with >1k edges/nodes and frequent updates).
- WebGL stack (Pixi/Sigma/Deck) (powerful but heavy dependency jump and larger maintenance footprint).
- Keep Graph-Lite table only (fails map-first spec intent).
**Rationale**: Canvas gives deterministic performance for progressive dense slices and keeps dependency surface moderate in a Vite+React app. D3 modules are battle-tested for graph interactions without forcing full D3 DOM rendering.

### Decision: New visualization API namespace (`/viz`) with additive contracts
**Choice**: Add endpoints under `/viz` and keep current `/projects/{project}/graph` behavior unchanged.
**Alternatives considered**:
- Mutate `/projects/{project}/graph` into map payloads (high breaking risk).
- Reuse `/search`+`/timeline` composition client-side only (under-specified for bounded slices and health states).
**Rationale**: Additive contracts isolate risk, preserve existing clients, and enable staged rollout.

### Decision: Server-computed deterministic projection seed + client local refinement
**Choice**: Server returns deterministic 2D seed coordinates per node (hash+semantic basis blend), client runs bounded force relaxation for local legibility.
**Alternatives considered**:
- Persist true UMAP/t-SNE projection in schema now (premature and migration-heavy).
- Pure client projection from embeddings (payload too large; not all nodes expose vectors directly).
- Pure random/hash layout only (stable but semantically weak).
**Rationale**: Delivers immediate map UX without schema migration; keeps future upgrade path to persisted projections.

### Decision: Read-path only store expansion; no schema migration in this change
**Choice**: Add store query methods over existing tables (`observations`, `semantic_*`, `observation_facts`, `kg_*`) and reuse current sanitization (`stripPrivateTags`) on map-facing labels/snippets.
**Alternatives considered**:
- Add projection table now.
- Add denormalized dashboard materialized views.
**Rationale**: Spec requires read-only behavior and bounded rollout risk. Existing schema already contains enough semantic/KG primitives for first map generation.

## Data Flow

1. Dashboard boots map workspace at `/` and requests `GET /viz/slice`.
2. API validates filters and limits, queries store composition methods, returns nodes, edges, cursor, health, and state hints.
3. Map renderer draws current slice on canvas; left rail updates filters; right inspector remains empty until selection.
4. Selecting node/edge triggers `GET /viz/inspect/node/:id` or `GET /viz/inspect/edge/:id`.
5. Expanding neighbors calls `POST /viz/expand` with anchor and depth; client merges incremental payload deterministically.
6. Health badge polls `GET /viz/health` (or piggybacks `slice`) for pending/degraded/rebuilding flags.

## File Changes

Created:
- `openspec/changes/arcrift-dashboard-vector-map/design.md`

Planned modifications:
- `dashboard/package.json` (add D3 modules: `d3-zoom`, `d3-force`, `d3-quadtree`, `d3-scale`; optional `d3-color`).
- `dashboard/src/main.tsx` (route defaults and map-first composition).
- `dashboard/src/router.tsx` (optional support for query-preserving route transitions and fallback redirect).
- `dashboard/src/components/Layout.tsx` (nav labels/order to map-first IA).
- `dashboard/src/components/GraphLiteView.tsx` (demote to legacy view, no longer primary surface).
- `dashboard/src/components/map/MapWorkspace.tsx`
- `dashboard/src/components/map/MapCanvas.tsx`
- `dashboard/src/components/map/MapFiltersPanel.tsx`
- `dashboard/src/components/map/MapInspectorPanel.tsx`
- `dashboard/src/components/map/map-types.ts`
- `dashboard/src/components/map/map-state.ts`
- `dashboard/src/components/map/map-projection.ts`
- `dashboard/src/components/map/map-renderer.ts`
- `dashboard/src/api/client.ts` (new typed contracts + client methods).
- `dashboard/src/index.css` (workspace grid, dense-state overlays, inspector panels, motion states).
- `src/http-routes.ts` (`/viz/slice`, `/viz/expand`, `/viz/inspect/node/:id`, `/viz/inspect/edge/:id`, `/viz/filters`, `/viz/health`).
- `src/http-openapi.ts` (schemas/paths for visualization API).
- `src/store/types.ts` (visualization DTO/query input interfaces).
- `src/store/index.ts` (new read-only query methods for slices/neighbors/inspector/health).

No deletions planned.

## Interfaces / Contracts

### Dashboard-side models (TypeScript)

```ts
export type VizNodeKind = 'observation' | 'fact' | 'session' | 'project' | 'topic';
export type VizEdgeKind = 'semantic_neighbor' | 'kg_relation' | 'has_type' | 'in_project' | 'has_topic_key' | 'fact_overlay';

export interface VizSliceRequest {
  project?: string;
  session_id?: string;
  topic_key?: string;
  observation_type?: ObservationType;
  relation?: string;
  query?: string;
  depth?: number; // 0..3
  limit_nodes?: number; // default 300, hard max 1200
  limit_edges?: number; // default 900, hard max 3600
  cursor?: string;
}

export interface VizNode {
  id: string;
  kind: VizNodeKind;
  label: string; // sanitized
  project: string | null;
  session_id: string | null;
  topic_key: string | null;
  observation_id?: number;
  fact_id?: number;
  score?: number;
  x: number; // deterministic seed in [-1, 1]
  y: number; // deterministic seed in [-1, 1]
  pending_semantic?: boolean;
}

export interface VizEdge {
  id: string;
  kind: VizEdgeKind;
  source: string;
  target: string;
  weight?: number;
  relation?: string;
  confidence?: number;
}

export interface VizSliceResponse {
  nodes: VizNode[];
  edges: VizEdge[];
  state: 'empty' | 'sparse' | 'dense';
  continuation: { has_more: boolean; cursor?: string };
  truncation: { node_cap_hit: boolean; edge_cap_hit: boolean };
  health: {
    semantic: 'ready' | 'pending' | 'degraded' | 'rebuilding';
    pending_jobs: number;
    degraded_reason?: string;
  };
  meta: {
    request_hash: string;
    elapsed_ms: number;
    filters_applied: Record<string, string | number | boolean>;
  };
}

export interface VizNeighborExpandRequest {
  anchor_node_id: string;
  depth: number; // 1..2 per call
  limit_nodes?: number;
  limit_edges?: number;
  request_hash?: string;
}

export interface VizInspectNodeResponse {
  node: VizNode;
  provenance: {
    observation_id?: number;
    fact_ids: number[];
    timeline_anchor?: number;
    source_type?: string;
    source_sync_id?: string | null;
  };
  snippets: Array<{ kind: 'title' | 'summary' | 'fact'; text: string }>;
  links: Array<{ rel: 'observation' | 'timeline' | 'topic' | 'project'; href: string }>;
}

export interface VizInspectEdgeResponse {
  edge: VizEdge;
  provenance: {
    relation_class: string;
    triple_id?: number;
    fact_id?: number;
    confidence?: number;
  };
  links: Array<{ rel: 'source' | 'target' | 'timeline'; href: string }>;
}
```

### HTTP Endpoints

- `GET /viz/slice`: bounded initial/progressive slice response.
- `POST /viz/expand`: neighbor expansion from selected anchor.
- `GET /viz/inspect/node/{node_id}`: inspector/provenance payload for selected node.
- `GET /viz/inspect/edge/{edge_id}`: inspector/provenance payload for selected edge.
- `GET /viz/filters`: available projects/sessions/topic-keys/types/relations counts.
- `GET /viz/health`: semantic/index status summary for badges and degraded handling.

All endpoints are read-only and must sanitize map-facing textual fields.

### Store Read Methods (planned)

- `getVisualizationSlice(input: VizSliceInput): VizSliceData`
- `expandVisualizationNeighbors(input: VizExpandInput): VizSliceData`
- `getVisualizationNodeInspector(nodeId: string): VizNodeInspector | null`
- `getVisualizationEdgeInspector(edgeId: string): VizEdgeInspector | null`
- `getVisualizationFilterMetadata(input: VizFilterInput): VizFilterMetadata`
- `getVisualizationHealth(input?: { project?: string }): VizHealth`

Composition sources:
- semantic proximity: `semantic_sentences`, `semantic_chunks`, `semantic_vector_rowids` plus stable per-observation grouping.
- relation overlays: `observation_facts` and `kg_triples` + `kg_entities`.
- metadata pivots: `observations` (`project`, `session_id`, `topic_key`, `type`).

## Projection Strategy

Current schema does not store durable 2D projections; this design uses deterministic seeds:

1. Build node feature token: `project|session_id|topic_key|observation_id|kind`.
2. Hash token with stable 64-bit function and map to polar coordinates for base `(x,y)`.
3. If semantic scores exist, blend radial distance with normalized score (higher similarity closer to active focus).
4. Client performs capped force relaxation (e.g., 60 ticks max, alpha min threshold) for collision reduction.
5. For unchanged request hash + cursor sequence, coordinates remain deterministic across refreshes.

Future upgrade path: add optional persisted projection lane/table (`semantic_projection_2d`) without changing dashboard contract fields.

## Performance / Payload Limits

Server hard limits:
- `limit_nodes` max `1200` per response.
- `limit_edges` max `3600` per response.
- Inspector snippets max `8` items and `1200` combined chars.
- Query timeout target: `< 250ms` p95 for default slice in medium datasets.

Client behavior:
- Initial draw targets `<= 16ms` frame budget with batched canvas redraw.
- Progressive loading when dense; show "Load more" or auto-window continuation.
- Edge thinning when zoomed out (render top-N weighted edges only at low zoom).

Degraded/pending semantics:
- If semantic lane `pending` or `degraded`, map still renders metadata + KG/fact overlays.
- Health badge communicates state and reason; no hard failure unless all lanes empty and query invalid.

## Privacy and Read-Only Guarantees

- All map labels/tooltips/snippets use sanitized text (private-tag removal) before response emission.
- No mutation affordances in map UI and no write endpoints added.
- Inspector drilldown links point to existing read-only routes (`/memory/:id`, `/timeline`).

## Testing Strategy

Backend tests:
- New route tests for `/viz/slice`, `/viz/expand`, `/viz/inspect/*`, `/viz/filters`, `/viz/health`.
- Bound enforcement tests (`limit_nodes`, `limit_edges`, invalid depth/cursor).
- Determinism test: same request + unchanged DB => same node IDs/order and stable seed coords.
- Privacy test: private-tagged content never appears in map-facing fields.
- Degraded semantic test: semantic off/pending still returns non-semantic overlays and explicit state.

Frontend tests:
- API client contract normalization tests for viz payloads.
- Workspace route/default tests (`/` opens map workspace).
- Interaction tests: zoom/pan selection, neighbor expand merge, inspector populate, empty/sparse/dense state cards.

Visual QA:
- Desktop (>=1280px) and mobile (<=768px) workspace behavior.
- Dense dataset stress pass and low-data empty-state messaging.
- Verify no label overflow in inspector and no sidebar regression.

## Migration / Rollout

- No DB migration required for v1 map experience.
- Rollout behind dashboard default-route switch with legacy Graph-Lite retained.
- If stability/perf issues appear, rollback by restoring `/` to Overview and keeping map under `/graph` or `/map` flag route.
- OpenAPI expands additively; existing clients remain compatible.

## Open Questions

1. Should default map scope auto-select the most recently active project or remain global when multiple projects exist?
2. Should neighbor expansion depth >2 ever be allowed in one request, or always force stepwise expansion for responsiveness?
3. Do we want optional WebGL renderer fallback for very high node counts (>10k) in a later phase?
4. Should provenance include raw KG triple IDs in UI by default, or only in advanced inspector mode?
