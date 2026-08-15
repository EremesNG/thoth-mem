# Research: Bounded Semantic Zoom Navigation

## Problem observed in thoth-mem

The current three-level model is correct at Universe and Neighborhood but fails inside a large Community:

- `Store.getSemanticAtlasPage` materializes every assigned observation and every internal semantic edge for Community.
- `loadSemanticAtlas` follows Community continuation until the complete source graph is accumulated.
- `mergeSemanticAtlasPages` preserves the entire accumulated payload.
- `buildCosmosGraphData` forwards every visible edge and the renderer presents semantic links at high opacity.
- A normal Community has one parent community key, so layout preserves source seeds rather than creating meaningful internal regions.

The result is complete data but an unusable edge wall. The remedy is not another viewport fit adjustment; it is a distinct bounded Community projection and a level-aware relationship budget.

## ArcRift findings

Sources:

- [ArcRift graph documentation](https://github.com/Eshaan-Nair/ArcRift/blob/main/README.md#L444-L452)
- [ArcRift GraphView](https://github.com/Eshaan-Nair/ArcRift/blob/main/dashboard/src/components/GraphView.tsx)
- [ArcRift graph route](https://github.com/Eshaan-Nair/ArcRift/blob/main/backend/src/routes/graph.ts)
- [ArcRift SQLite graph](https://github.com/Eshaan-Nair/ArcRift/blob/main/backend/src/services/sqlite-graph.ts)

Useful patterns:

- Canvas rendering, degree-scaled points, force layout, hover/drag, min-degree filtering, and local labels.
- Selecting a node keeps the selected one-hop neighborhood vivid and strongly dims unrelated context.
- Relation labels appear only for the selected local trail.
- A continuous low-alpha force keeps the field alive.

Patterns not to copy:

- Community assignment is inconsistent: backend connected components and frontend randomized label propagation can disagree.
- The session graph path is unbounded and can still become a hairball.
- “Community” is primarily a color, not a stable navigable drill-down contract.
- Large degree-based radii and continuous wander are visual inspiration, not a scalability model.

## Graphify findings

Sources:

- [Graphify HTML exporter](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/exporters/html.py)
- [Graphify clustering](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/cluster.py)
- [Graphify graph semantics](https://github.com/Graphify-Labs/graphify/blob/v8/docs/how-it-works.md)
- [Graphify relation-legibility issue](https://github.com/Graphify-Labs/graphify/issues/2088)

Useful patterns:

- It explicitly separates the complete data graph from the visualization budget.
- Large graphs use a community meta-graph rather than attempting to render every identity.
- Deterministic Leiden/Louvain grouping includes resolution control, oversized-community splitting, optional hub exclusion, stable IDs, counts, and labels.
- Search, selected-node information, clickable neighbors, community counts, and community visibility controls provide progressive disclosure.
- Only high-degree labels render by default; other labels appear through hover/focus.
- Edge confidence and provenance affect style and opacity.

Patterns not to copy:

- A fixed 5,000-node cap is a guardrail, not the product navigation model.
- Community aggregation can hide bridge memories unless representative bridges and cross-region evidence remain explicit.
- ForceAtlas stabilization followed by fully disabled physics would conflict with the approved living-atlas motion contract.

## Design synthesis

1. Preserve Universe as the complete community meta-graph.
2. Subdivide only the selected parent Community into deterministic internal regions.
3. Keep complete membership and relationship counts on the server, but render a deterministic representative set.
4. Rank representatives using structural degree, cross-region bridge contribution, evidence strength, recency, and facet diversity.
5. Return region summaries and aggregate bridges separately from graph nodes so regions can become contours/labels rather than fake memory stars.
6. Use semantic zoom bands to reveal a sparse backbone and local relevant edges without fetching the full internal edge set.
7. Keep Neighborhood as the bounded complete local evidence surface.
8. Retain Raw as explicit diagnostics only.

## Dependency conclusion

- Keep `@cosmos.gl/graph`, Graphology, and deterministic Louvain already present.
- Add no runtime graph framework. Existing Cosmos zoom callbacks, per-link buffers, Web Worker preparation, and DOM overlay layers are sufficient.
- Implement region contours with a small internal deterministic screen-space hull/smoothing helper instead of adding a broad visualization dependency.

