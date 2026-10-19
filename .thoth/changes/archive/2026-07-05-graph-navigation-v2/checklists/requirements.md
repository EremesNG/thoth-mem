# Requirements Checklist: Graph Navigation V2

## Domain: tools
- [x] Completeness: covers default ledger compatibility, additive MCP inputs, neighborhood, lineage, superseded history, community inspection, and compact registry preservation.
- [x] Clarity: defines `navigation` values, compatibility default, boundedness expectations, and deferred-scope claims to avoid.
- [x] Measurability: each requirement has observable output, registry, validation, limit, or history-tagging criteria.
- [x] Testability: scenarios can be covered with focused Vitest suites for `mem_project`, project graph formatting, superseded facts, and community annotations.

## Domain: visualization-api
- [x] Completeness: covers observatory primitive reuse, current-state ledger defaults, frontier state, and community inspection state.
- [x] Clarity: separates structured observatory contracts from MCP text formatting and avoids requiring new routes.
- [x] Measurability: requirements name concrete response state such as continuation, exhausted reason, tagged superseded facts, freshness/degraded state, and bounded summary previews.
- [x] Testability: scenarios map to existing `tests/http-viz.test.ts` and `tests/store/visualization.test.ts` patterns.
