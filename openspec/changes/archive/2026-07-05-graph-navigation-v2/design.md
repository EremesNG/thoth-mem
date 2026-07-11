# Design: Graph Navigation V2

## Technical Approach
Implement graph navigation v2 as an additive extension to existing `mem_project action="graph"`. The default path remains the current `formatProjectGraph(store, project, options)` KG-ledger formatter. New optional graph-navigation inputs route to bounded text formatters that reuse existing store primitives for observatory context, frontier expansion, ledger detail, timeline, and community summaries.

No new MCP tool is introduced. No full graph dump is introduced. Superseded facts remain hidden by default and become visible only through explicit history-inclusive navigation.

## Architecture Decisions
### Decision: Use optional `navigation` inside `mem_project action="graph"`
**Choice**: Add optional `navigation` values `ledger`, `neighborhood`, `lineage`, `community`, and `superseded`.

**Alternatives considered**: Add a new MCP tool; add new top-level `mem_project` actions; overload `relation`; use HTTP-only observatory routes.

**Rationale**: The existing OpenSpec and constitution require a compact six-tool MCP surface. `action` already chooses the project workflow, while `navigation` can select sub-modes without breaking legacy callers.

### Decision: Omitted navigation remains the current KG ledger
**Choice**: Treat absent `navigation` as `ledger` and keep existing ledger semantics, including `topic_key`, `relation`, `limit`, `max_chars`, and current-state supersession filtering.

**Alternatives considered**: Make neighborhood the new graph default; include community summaries in graph output by default.

**Rationale**: The current `tools` spec requires `mem_project action=graph` to remain a KG-backed ledger and existing tests assert it does not become a community or deferred-scope surface.

### Decision: Reuse observatory/store primitives instead of parallel readers
**Choice**: Format new views from existing store methods:
- `getObservationFacts` and `getObservatoryLedgerDetail` for ledger/superseded detail.
- `getObservatoryContext`, `getObservatoryMapFrontier`, and `expandVisualizationNode` for neighborhoods.
- `getObservatoryTimeline` for lineage.
- `getCommunitySummaryState` and `getCommunitySummariesForRetrieval` for community inspection; add a small store helper only if implementation discovers those state/retrieval readers are insufficient for the bounded committed-summary view.

**Alternatives considered**: Query `kg_triples` directly in tool formatters; create a new graph navigation service layer immediately.

**Rationale**: The store already centralizes graph, observatory, supersession, and community behavior. Reusing it minimizes duplicated SQL and keeps HTTP/dashboard parity possible.

### Decision: Text output is progressive and bounded
**Choice**: Every formatter enforces `limit` and `max_chars`, reports counts/continuation/omission where applicable, and points to existing IDs for full details.

**Alternatives considered**: Return JSON from the MCP tool; render complete graph neighborhoods.

**Rationale**: Existing MCP tool outputs are text-oriented and bounded. Full graph dumps would violate token-efficiency expectations and make agent navigation harder.

## Data Flow
```text
MCP client
  -> mem_project({ action: "graph", project, navigation?, ...bounds })
    -> MEM_PROJECT_INPUT_SCHEMA validates additive optional fields
    -> graph dispatch:
       - no navigation / ledger -> formatProjectGraph -> Store.getObservationFacts
       - superseded -> history formatter -> Store.getObservationFacts(include_superseded=true)
       - neighborhood -> context/frontier formatter -> Store.getObservatoryContext + Store.getObservatoryMapFrontier
       - lineage -> timeline formatter -> Store.getObservatoryContext + Store.getObservatoryTimeline
       - community -> community formatter -> Store.getCommunitySummaryState + Store.getCommunitySummariesForRetrieval
    -> text output trimmed to max_chars with source IDs and continuation/omission metadata
```

## File Changes
### Planned implementation files
- `src/tools/mem-project.ts`: extend `MEM_PROJECT_INPUT_SHAPE` with optional `navigation`, `focus_node_id`, `observation_id`, `continuation`, and `include_superseded`; dispatch graph navigation modes.
- `src/tools/project-views.ts`: add bounded formatters for neighborhood, lineage, community, and superseded views; keep existing `formatProjectGraph` default path stable.
- `src/store/types.ts`: add shared type aliases only if needed for exported formatter inputs; avoid unnecessary public types.
- `src/store/index.ts`: add small wrapper helpers only if existing observatory/community methods cannot be reused directly.
- `src/http-openapi.ts`: add schema documentation only if additive observatory fields are introduced during implementation.
- `src/http-routes.ts`: no route changes expected; touch only if implementation discovers a parity gap.

### Planned tests
- `tests/tools/mem-project.test.ts`: schema validation, compact registry, default ledger compatibility, each navigation mode, output bounds, deferred-claim exclusions.
- `tests/store/visualization.test.ts`: store-level current/superseded, frontier, lineage, and community primitives used by text formatters.
- `tests/http-viz.test.ts`: existing observatory route compatibility if any HTTP/OpenAPI schema field changes.

## Interfaces / Contracts
### MCP input additions
```ts
navigation?: 'ledger' | 'neighborhood' | 'lineage' | 'community' | 'superseded';
focus_node_id?: string;
observation_id?: number;
continuation?: string;
include_superseded?: boolean;
```

Rules:
- The additions apply only to `action="graph"` unless a future spec says otherwise.
- `navigation` defaults to `ledger`.
- `max_chars` for graph navigation keeps the existing minimum of `200`; `0` remains invalid for graph.
- `include_superseded` does not change default ledger output unless paired with explicit history-inclusive navigation, with `navigation="superseded"` preferred.
- Invalid focus identifiers or expired/invalid continuation tokens return the existing MCP error shape with safe text.

### Output conventions
- Start each response with a stable heading naming the view and project.
- Include filters/focus/bounds in a compact metadata block.
- Render item lines with source IDs, relation/type/topic/timestamp where relevant.
- Report omitted counts, continuation, or exhausted/no-neighbor/no-history state.
- Trim to `max_chars` and include a truncation marker when possible.

## Testing Strategy
Run focused tests first:
- `pnpm test -- tests/tools/mem-project.test.ts`
- `pnpm test -- tests/store/visualization.test.ts`
- `pnpm test -- tests/http-viz.test.ts` if HTTP/OpenAPI contracts change

Run broader verification for public contract and TypeScript changes:
- `pnpm run build`
- `pnpm test`

Key edge cases:
- Legacy `action="graph"` call with no new fields.
- `max_chars` below 200 or equal to 0 for graph navigation.
- Empty project, missing focus node, invalid continuation token.
- High-degree graph with small limit.
- Superseded facts present but default output current-only.
- Community summaries disabled, missing, stale, degraded, or committed.

## Migration / Rollout
This is an additive public-contract extension:
- No database migration is expected.
- Existing MCP clients continue to call `mem_project action="graph"` unchanged.
- New clients can opt into navigation modes gradually.
- Rollback is safe by removing or ignoring optional navigation inputs while keeping default ledger behavior.

## Constitution Check
- P1 Compact MCP Surface: satisfied. No new MCP tool is planned; the six-tool registry remains unchanged.
- P2 Deterministic-First Retrieval With Safe Degradation: satisfied. Navigation reuses deterministic KG/lexical/store readers and does not require embeddings or remote services.
- P3 Harness-Agnostic Memory Contract: satisfied within this change. Inputs are plain MCP-compatible fields; multi-harness parity itself remains deferred and unclaimed.
- P4 Token-Efficient, Bounded Recall Outputs: satisfied. Every navigation view is bounded and progressive, with full details reachable through existing IDs/tools.
- P5 Stable Public Contract With Explicit Deprecation Discipline: satisfied. Default `action="graph"` behavior remains compatible; new behavior is opt-in and additive.

No constitution violation detected.

## Open Questions
- Whether `focus_node_id` alone is sufficient for all neighborhood use cases, or whether a future tasks phase should add a convenience `observation_id` to `obs:{id}` conversion for neighborhood views.
- Whether lineage should remain observation-timeline based for MVP or later include KG supersession chain metadata beyond retained fact history.
- Whether implementation should add structured helper methods in `Store` or keep all formatting orchestration inside `project-views.ts`.
