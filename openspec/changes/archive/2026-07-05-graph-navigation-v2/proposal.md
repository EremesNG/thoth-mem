# Proposal: Graph Navigation V2

## Intent
Expose richer, bounded graph navigation for coding agents through the existing compact MCP surface. The change lets agents inspect ledger facts, neighborhoods, lineage, community summaries, and superseded history without adding MCP tools and without breaking the existing `mem_project(action="graph")` KG-ledger contract.

## Scope
### In Scope
- Add a backward-compatible navigation contract inside existing `mem_project action="graph"`.
- Preserve the current default graph output as the KG-backed ledger when no new navigation option is supplied.
- Add bounded navigation views for:
  - ledger: existing current-state KG fact ledger.
  - neighborhood: incremental graph neighborhood/frontier around a focus node.
  - lineage: scoped timeline/lineage of memories related to a project/topic/focus.
  - community: inspection/debugging view of existing community summary state and committed summaries.
  - superseded: explicit history-inclusive view of retained superseded facts.
- Reuse existing store primitives and HTTP observatory/community contracts where possible.
- Keep outputs agent-readable, bounded, and source-attributed.
- Keep superseded history opt-in; default output remains current-state.

### Deferred / Needs Discovery
- Multi-harness support and G3 harness parity remain deferred and MUST NOT be claimed by this change.
- MemoryIntegrationCore migration remains deferred and MUST NOT be claimed by this change.
- A future dashboard UX may consume the same observatory contracts, but this change plans MCP-compatible navigation behavior first.
- Rich GraphRAG global-answer synthesis remains deferred; community navigation is limited to inspection/debugging of existing summaries and state.

### Out of Scope
- Adding, removing, renaming, or splitting MCP tools.
- Replacing `mem_project action="graph"` with community visualization or global answer generation.
- Destructive schema rewrites, portable sync format changes, or editing `dist/`.
- Product implementation in this planning phase.

## Approach
Extend `mem_project` with optional graph-navigation inputs while leaving existing inputs and default behavior unchanged:

- `navigation` selects the view and defaults to `ledger`.
- `focus_node_id` and/or `observation_id` anchor neighborhood, lineage, ledger detail, and superseded-history views.
- `continuation`, `limit`, and `max_chars` preserve bounded progressive reads.
- `include_superseded` is honored only for explicit history-oriented views; omitted/default views stay current-state.

The implementation should route each view through existing store capabilities:

- ledger and superseded: `getObservationFacts` / `getObservatoryLedgerDetail`.
- neighborhood: `getObservatoryContext` + `getObservatoryMapFrontier` or `expandVisualizationNode`.
- lineage: `getObservatoryTimeline` and existing timeline ordering.
- community: `getCommunitySummaryState` and `getCommunitySummariesForRetrieval`; add a small store helper only if implementation discovers those state/retrieval readers cannot provide the required committed-summary inspection.

## Affected Areas
- `src/tools/mem-project.ts`: additive input schema and dispatch for graph navigation modes.
- `src/tools/project-views.ts`: bounded formatters for new graph navigation views.
- `src/store/types.ts`: exported input/output typing if shared structured helpers are added.
- `src/store/index.ts`: small helper additions only if existing primitives need an MCP-friendly wrapper.
- `src/http-routes.ts` and `src/http-openapi.ts`: only if existing observatory/community schemas need additive fields for parity.
- Tests in `tests/tools/mem-project.test.ts`, `tests/store/visualization.test.ts`, and `tests/http-viz.test.ts`.

## Risks
- Breaking default `mem_project action="graph"` output would violate the existing KG-ledger contract.
- Navigation modes can accidentally produce large graph dumps if limits and `max_chars` are not enforced at each formatter.
- Community summaries could be misread as GraphRAG global answers unless the view is explicitly framed as inspection/debugging.
- Superseded history may confuse agents if mixed into current-state output without an explicit opt-in marker.

## Rollback Plan
- Because the change is additive, rollback can remove or ignore the optional navigation inputs while preserving existing `action="graph"` dispatch.
- If a navigation mode misbehaves, disable that mode in the formatter/dispatch and keep default ledger behavior intact.
- No destructive schema migration is planned; existing data remains usable through current KG, observatory, and community readers.

## Success Criteria
- `mem_project action="graph"` without new options renders the same KG-ledger semantics and bounded `max_chars` behavior as today.
- No new MCP tool is registered; the six-tool compact surface remains unchanged.
- Each graph navigation view is bounded, source-attributed, and avoids full graph dumps.
- Superseded history is reachable only through explicit history-inclusive navigation and remains tagged.
- Community navigation inspects existing summary state/artifacts and does not claim global GraphRAG answers.
- Tests cover default compatibility, each new navigation view, output bounds, invalid inputs, and superseded opt-in behavior.
