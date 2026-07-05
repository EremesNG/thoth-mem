# Proposal: Agent Operational Health

## Intent
Expose operational health to coding agents through the existing compact MCP
surface so agents can diagnose degraded recall, stale indexes, pending jobs, and
legacy graph drift without leaving the six-tool contract. The first Point 6
slice focuses on adding a health action to `mem_project` (or an equivalent
shape inside that existing tool) and making the current `observation_facts`
legacy drift visible and non-fatal.

This change uses OpenSpec-only persistence. No thoth-mem SDD artifact save is
expected for this proposal.

From: agents must infer operational state from HTTP-only endpoints, local test
output, or failing MCP calls.

To: agents can request bounded operational health from the existing
`mem_project` tool and see semantic, visualization, job, coverage, recent-error,
and legacy-drift states in one compact MCP response.

Reason: this session observed runtime MCP `mem_recall` failure with
`no such table: observation_facts` even though local targeted tests passed. Agent
workflows need a compact, durable diagnostic surface for this class of drift.

Impact: the compact six-tool MCP registry remains unchanged, while
`mem_project` gains an operational-health path and KG legacy drift becomes
observable instead of crashing agent recall paths.

## Scope

### In Scope
- Add a durable plan for `mem_project(action="health")` or an equivalent action
  within the existing `mem_project` tool.
- Keep the registered MCP tool set exactly `mem_save`, `mem_recall`,
  `mem_context`, `mem_get`, `mem_project`, and `mem_session`.
- Reuse existing Store and HTTP health signals where appropriate, including:
  semantic index state/progress, visualization health, indexing/job counts,
  coverage ratios, recent errors, and stale/degraded/pending states.
- Include health output that helps coding agents distinguish:
  fresh vs stale semantic coverage,
  pending vs failed background work,
  available vs degraded visualization/KG state,
  and legacy schema drift.
- Add a defensive legacy-drift requirement: default KG read paths must not
  require `observation_facts`; if an explicit legacy mode or config points at a
  missing legacy table, health must report that drift and read paths must fail
  gracefully or degrade instead of crashing agents.
- Cover the currently observed runtime failure mode:
  MCP `mem_recall` reports `no such table: observation_facts`.
- Keep implementation evidence tied to existing anchors:
  `src/tools/mem-project.ts`, Store health helpers in `src/store/index.ts`,
  HTTP health routes in `src/http-routes.ts`, OpenAPI health entries in
  `src/http-openapi.ts`, and relevant MCP/store/HTTP tests.

### Deferred / Needs Discovery
- Exact response formatting for the health action, including whether the output
  is text-only, structured JSON-like text, or a compact sectioned report.
- Exact Store method shape for consolidating operational health across semantic,
  visualization, jobs, coverage, errors, and KG drift.
- The minimum recent-error source needed for MCP health parity with existing
  HTTP observability without creating unbounded output.
- Whether OpenAPI needs an explicit note that HTTP health and MCP health are
  sibling diagnostic surfaces rather than identical contracts.
- Whether existing runtime configuration exposes a legacy graph source flag that
  should be surfaced directly in health.

### Out of Scope
- Adding, removing, renaming, or splitting MCP tools.
- Adding a seventh MCP tool for health.
- Multi-harness, G3, MIG, or cross-harness orchestration health.
- Roadmap edits.
- New spec or design artifacts for this accelerated slice.
- New admin actions such as MCP rebuild, prune, repair, or migration commands.
- Reintroducing `observation_facts` as a default graph-fact source.
- Automatic destructive migration or data cleanup.

## Approach
Implement health as a new action or equivalent branch inside `mem_project`,
preserving the compact workflow-level MCP surface. The health branch should be
bounded and agent-readable, with explicit status categories such as `ok`,
`pending`, `stale`, `degraded`, and `error`.

The health implementation should reuse existing Store and HTTP-backed concepts
rather than inventing a parallel diagnostics model. Candidate inputs include
`getSemanticIndexState`, `getSemanticIndexProgress`,
`getVisualizationHealth`, indexing job counts, coverage ratios, and recent
error summaries already exposed by HTTP health/status routes.

Legacy drift should be diagnosed defensively. Default KG-backed recall, graph,
ledger, visualization, and project views should not require the removed
`observation_facts` table. If a caller or configuration explicitly selects a
legacy path and the table is missing, the system should expose a degraded legacy
state through health and return empty-but-valid or graceful degraded results
where possible. Hard database exceptions from missing `observation_facts` should
not escape as runtime MCP crashes for ordinary agent recall.

The proposal intentionally stays light on implementation mechanics. The next
accelerated phase (`sdd-tasks`) should turn the success criteria below into
focused implementation and verification tasks.

## Affected Areas
- `src/tools/mem-project.ts`: input schema expands the existing action enum or
  equivalent dispatch to include operational health behavior.
- `src/tools/project-views.ts`: likely formatting home for a compact
  project-health report if existing project view patterns apply.
- `src/store/index.ts`: health aggregation and defensive KG/legacy drift checks
  may reuse or compose existing Store health helpers and legacy table-detection
  methods.
- `src/http-routes.ts` and `src/http-openapi.ts`: existing health/status routes
  are evidence sources and may need parity notes or shared helper extraction if
  duplication would otherwise grow.
- `src/indexing/*`: job state, semantic progress, and KG degradation signals may
  supply health inputs but should not gain new MCP admin behavior.
- `tests/tools/mem-project.test.ts`: cover the new health action and unchanged
  six-tool registry expectations where applicable.
- `tests/tools/mem-recall.test.ts`: cover graceful behavior when default KG paths
  encounter legacy drift.
- `tests/store/kg-facts-cutover.test.ts`: cover missing `observation_facts`
  behavior and default KG-backed paths.
- `tests/http-server.test.ts` and `tests/http-viz.test.ts`: remain reference
  coverage for existing health signals; add focused parity tests only if shared
  health logic changes their behavior.

## Risks
- Health output could become too broad and recreate unbounded context problems
  unless it is compact by default.
- Sharing logic between HTTP and MCP health surfaces could accidentally change
  existing HTTP response contracts.
- Legacy-drift handling could hide real schema bugs if all database errors are
  swallowed too broadly; handling should be specific to known legacy table drift
  and should still report degraded/error state.
- Adding `action="health"` changes the `mem_project` schema and must preserve
  existing `list`, `summary`, `graph`, `topics`, and `topic` behavior.
- Runtime stores may differ from local test stores, so tests should simulate a
  database where `observation_facts` is absent while legacy references remain.

## Rollback Plan
- Remove the `mem_project` health action/branch from the schema and handler.
- Remove or disable any shared health aggregation helper added for MCP health.
- Keep or separately evaluate defensive fixes that prevent missing
  `observation_facts` from crashing default KG-backed read paths; those fixes
  may be safer to retain because they preserve the already-specified KG cutover
  behavior.
- If the health branch causes compatibility issues, restore the prior
  `mem_project` action enum and rerun focused MCP tests plus build.
- No data migration rollback should be needed because this slice should not
  perform destructive schema changes or write new persistent health tables.

## Success Criteria
- `mem_project` accepts an operational health action or equivalent request
  without adding any new MCP tool.
- The MCP registry remains exactly six tools:
  `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and
  `mem_session`.
- Health output includes semantic index state and progress, including pending,
  stale, degraded, or rebuilding state when present.
- Health output includes visualization/KG health sufficient to tell whether
  graph-derived views are available, empty, stale, or degraded.
- Health output includes indexing/job counts or equivalent queue metrics,
  including pending/running/failed state and recent error summaries where
  available.
- Health output includes coverage or freshness indicators for semantic and KG
  lanes when those signals are available.
- Default KG-backed read paths used by `mem_recall` and `mem_project
  action=graph` do not require `observation_facts` to exist.
- If an explicit legacy path/config points at missing `observation_facts`,
  health reports a degraded legacy-drift state naming the missing table.
- Missing `observation_facts` does not crash ordinary MCP agent recall; the
  operation succeeds with graceful degraded output or returns a controlled MCP
  error that explains the legacy drift without an uncaught SQLite exception.
- Existing `mem_project` actions (`list`, `summary`, `graph`, `topics`,
  `topic`) keep their current behavior and output-budget semantics.
- Existing HTTP health/status routes continue to pass their current tests.
- Focused verification passes for `mem_project`, `mem_recall`, and KG cutover
  coverage, including a test reproducing the observed missing-table drift.
