# Proposal: ArcRift-Style Vector Map Dashboard Redesign

## Intent

The current dashboard is useful for textual inspection but does not provide an immersive spatial interface for semantic memory exploration. This change introduces a full dashboard redesign, centered on a live point-cloud/vector map experience inspired by ArcRift, so users can navigate embeddings, nearest-neighbor relationships, KG/fact links, and memory scope dimensions (project, session, topic key) from one high-signal control surface.

## Scope

### In Scope

- Redesign the dashboard information architecture and visual system to prioritize a map-first workflow over list-first navigation.
- Replace the current Graph-Lite page model with an interactive vector-map surface that supports:
  - semantic points derived from memory entities/observations,
  - nearest-neighbor relationships,
  - KG/fact relation overlays,
  - focus pivots by project, session, observation type, topic key, and relation class.
- Define dashboard-facing API/contract additions required to provide map-ready data (positions/projections, neighbor edges, and scoped slices) while preserving existing endpoints for backward compatibility.
- Add multi-panel exploration UX around the map:
  - left controls/filters,
  - center live canvas/graph,
  - right contextual inspectors for selected nodes/edges and source memory evidence.
- Introduce interaction model requirements for zoom/pan, selection, neighborhood expansion, relation toggles, and detail drilldown.
- Define performance and scalability targets for large datasets (bounded payloads, progressive loading, and graceful degradation).
- Define acceptance boundaries for privacy-safe rendering (no accidental private-tag leakage through new views).

### Out of Scope

- Editing, deleting, or mutating memory records from the dashboard UI.
- Replacing core SQLite persistence semantics or changing existing memory taxonomy.
- Building cross-project remote collaboration, auth, or multi-user tenancy.
- Full ArcRift feature parity (e.g., graph editing workflows) when not needed for thoth-mem memory exploration.
- Replacing the entire HTTP server stack/framework.

## Approach

1. **Map-First Product Surface**
   - Shift routing and shell composition from page-per-query UX to a persistent exploration workspace.
   - Keep Overview/Search as supporting entry points but prioritize the vector map as the default destination.

2. **Data Contract Layer for Visualization**
   - Extend backend HTTP routes with scoped, typed responses for map nodes, neighbor edges, and semantic/KG overlays.
   - Reuse existing store primitives (`semantic_*`, `kg_*`, `observation_facts`) and add composition logic in route/service boundaries rather than duplicating persistence.

3. **Rendering and Interaction Model**
   - Implement a high-performance rendering path suitable for hundreds/thousands of nodes (canvas or hybrid canvas/SVG strategy decided in design phase).
   - Support interaction primitives: hover, select, pin, neighborhood expansion depth, relation filtering, and type/topic legend filtering.

4. **Contextual Explainability Panels**
   - Tie each selected visual element to traceable memory evidence (observation metadata, facts, timeline anchor, and topic-key context).
   - Ensure user can move from spatial exploration to exact memory provenance in one click path.

5. **Incremental Delivery and Safety**
   - Deliver behind deterministic route/component boundaries so fallback to the current non-map views remains possible during rollout.
   - Add focused verification for payload bounds, route stability, and UI behavior under empty/sparse/dense datasets.

## Affected Areas

- `dashboard/src/main.tsx` and layout/router structure for map-first IA.
- `dashboard/src/components/GraphLiteView.tsx` (replacement/major redesign into vector-map module).
- `dashboard/src/api/client.ts` typed contracts for new scoped map endpoints.
- `src/http-routes.ts` route-level handlers for map/neighbor/filter queries and payload shaping.
- `src/store/schema.ts` (read-path validation against existing semantic/KG tables; schema changes only if design proves strictly necessary).
- OpenSpec artifacts for this change: proposal, specs, design, tasks, and verification report.

## Risks

- **Performance risk on dense graphs**: naive rendering or oversized payloads can freeze the UI.
  - Mitigation: strict server-side limits, progressive fetch windows, and rendering strategy tuned for high node counts.
- **Contract drift risk**: map UI may depend on unstable backend payload shapes.
  - Mitigation: explicit typed response models and compatibility tests at API boundary.
- **Cognitive overload risk**: powerful map controls may reduce usability if unstructured.
  - Mitigation: opinionated defaults, staged controls, and clear inspector hierarchy.
- **Semantic trust risk**: nearest-neighbor and KG overlays may be misinterpreted as absolute truth.
  - Mitigation: explicit confidence/provenance indicators and direct links to source observations.
- **Regression risk to existing dashboard flows**: major redesign can break current routes and expectations.
  - Mitigation: route compatibility checks and phased migration plan with fallback views.

## Rollback Plan

1. Preserve existing non-map dashboard routes/components until the new map workspace passes verification.
2. Isolate new API routes/contracts so they can be disabled without affecting existing `/stats`, `/context`, `/search`, `/timeline`, and project views.
3. If map performance or correctness fails acceptance, revert default route to legacy exploration views and keep map endpoints behind non-default navigation.
4. Keep persistence/storage model untouched so rollback remains UI/API-layer only.

## Success Criteria

- Dashboard default experience is a stable ArcRift-like live vector map workspace for thoth-mem exploration.
- Users can filter and pivot map data by project, session, topic key, observation type, relation type, and semantic neighborhood depth.
- Selected nodes/edges expose explainable provenance (source memory context and KG/fact linkage) with drilldown paths.
- Dense datasets remain interactive under defined limits via progressive loading and bounded payloads.
- Existing core HTTP endpoints remain backward compatible and functional during/after rollout.
- No new dashboard interaction path mutates persistent memory data.
