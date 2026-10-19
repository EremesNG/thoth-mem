# Delta for Tools

## ADDED Requirements

### Requirement: `mem_project action=graph` MUST Preserve Default Ledger Compatibility
The system MUST preserve existing `mem_project action="graph"` behavior when no graph-navigation option is provided. The default graph response MUST remain the KG-backed current-state ledger, MUST use the existing `project`, `topic_key`, `relation`, `limit`, and `max_chars` semantics, MUST keep the `max_chars` minimum of `200`, and MUST NOT accept the unbounded sentinel `0`.

#### Scenario: Omitted navigation keeps existing ledger
- GIVEN a caller invokes `mem_project` with `action="graph"` and no `navigation` value
- WHEN the tool renders the response
- THEN the response MUST render the existing KG-backed ledger semantics
- AND the response MUST NOT include community summaries, GraphRAG claims, or deferred-scope claims
- AND `max_chars` validation for graph output MUST remain unchanged

#### Scenario: Explicit ledger navigation matches default
- GIVEN a caller invokes `mem_project` with `action="graph"` and `navigation="ledger"`
- WHEN the same project, topic, relation, limit, and max_chars are used
- THEN the response MUST be semantically equivalent to the omitted-navigation ledger response

### Requirement: Graph Navigation MUST Be Additive Within the Existing `mem_project` Tool
The system MUST expose graph navigation through optional inputs on the existing `mem_project` tool and MUST NOT add, remove, rename, or split MCP tools. The registered MCP tool set MUST remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.

The optional graph-navigation inputs MUST be backward-compatible and bounded:
- `navigation`: one of `ledger`, `neighborhood`, `lineage`, `community`, or `superseded`; default `ledger`.
- `focus_node_id`: optional graph node identifier for neighborhood navigation.
- `observation_id`: optional observation identifier for ledger detail, lineage, or superseded history.
- `continuation`: optional opaque continuation token for progressive navigation.
- `include_superseded`: optional boolean that is honored only for explicit history-inclusive views.

#### Scenario: MCP registry remains compact
- GIVEN graph navigation v2 is implemented
- WHEN clients list MCP tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered
- AND no graph-navigation-specific MCP tool MUST appear

#### Scenario: Legacy callers remain valid
- GIVEN a legacy caller sends only existing `mem_project` graph fields
- WHEN the request is parsed
- THEN the request MUST remain valid
- AND the default ledger response MUST be returned

### Requirement: Neighborhood Navigation MUST Return a Bounded Frontier View
When `navigation="neighborhood"` is requested, `mem_project action="graph"` MUST return a bounded, agent-readable neighborhood/frontier view. The view MUST identify the focus node, added node identifiers, already-visible node identifiers when supplied by continuation/visible state, exhausted/frontier reason when known, and a bounded set of edge/fact evidence. The view MUST NOT return a full graph dump.

#### Scenario: Focused neighborhood returns frontier evidence
- GIVEN a project has KG facts and a valid focus node
- WHEN `mem_project` is called with `action="graph"` and `navigation="neighborhood"`
- THEN the response MUST include the focus node identity
- AND it MUST include bounded frontier evidence with node and edge counts
- AND it MUST include continuation or exhausted/frontier status when applicable

#### Scenario: Neighborhood output is bounded
- GIVEN a high-degree graph neighborhood
- WHEN the neighborhood view is requested with `limit` and `max_chars`
- THEN the response MUST enforce the item limit and character budget
- AND it MUST report omitted or continuation state rather than dumping all neighbors

### Requirement: Lineage Navigation MUST Return Scoped Timeline Evidence
When `navigation="lineage"` is requested, `mem_project action="graph"` MUST return scoped lineage/timeline evidence for the selected project and optional topic or observation focus. The response MUST be ordered deterministically by existing timeline semantics, MUST be bounded, and MUST preserve provenance fields needed to pivot to full content through existing IDs.

#### Scenario: Project lineage is deterministic and bounded
- GIVEN a project has multiple observations
- WHEN `navigation="lineage"` is requested with a limit
- THEN the response MUST return at most the requested bounded number of events
- AND events MUST include observation IDs, titles/previews, type, topic key, and timestamps
- AND full bodies MUST remain reachable through `mem_get`

#### Scenario: Focused lineage narrows scope
- GIVEN `topic_key` or `observation_id` is supplied with `navigation="lineage"`
- WHEN the lineage view is rendered
- THEN the response MUST narrow to the compatible topic/focus scope where supported
- AND it MUST report when no lineage events are found

### Requirement: Superseded Navigation MUST Be Explicit and Tagged
When `navigation="superseded"` or an equivalent explicit history-inclusive option is requested, `mem_project action="graph"` MUST make retained superseded facts reachable. The default ledger and neighborhood views MUST remain current-state unless superseded history is explicitly requested. Superseded facts MUST be visibly tagged as historical/superseded.

#### Scenario: Default ledger hides superseded facts
- GIVEN a project contains current and retained superseded facts
- WHEN `mem_project action="graph"` is called without history-inclusive navigation
- THEN current facts MUST be shown
- AND superseded facts MUST NOT be mixed into the default current-state ledger

#### Scenario: Superseded view includes tagged history
- GIVEN retained superseded facts exist for a project or observation
- WHEN `navigation="superseded"` is requested
- THEN superseded facts MUST be included when retained by the KG
- AND each superseded fact MUST be visibly tagged
- AND current facts MUST remain distinguishable from historical facts

### Requirement: Community Navigation MUST Inspect Existing Community State Only
When `navigation="community"` is requested, `mem_project action="graph"` MUST return a bounded inspection/debugging view of existing community summary state and committed summaries. It MUST NOT present community summaries as a global-answer GraphRAG surface, MUST NOT replace the KG ledger, and MUST NOT claim multi-harness support, G3 harness parity, or MemoryIntegrationCore migration.

#### Scenario: Community view reports summary state
- GIVEN community summaries are enabled or have existing state for a project
- WHEN `navigation="community"` is requested
- THEN the response MUST report bounded community state such as freshness, degraded status, community IDs, coverage counts, and summary previews
- AND it MUST direct callers to source observations or existing IDs for full detail

#### Scenario: Community view avoids deferred claims
- GIVEN a project has committed community summaries
- WHEN the community navigation view is rendered
- THEN the output MUST NOT claim GraphRAG global answers
- AND it MUST NOT claim multi-harness support, G3 harness parity, or MemoryIntegrationCore migration

## MODIFIED Requirements

### Requirement: MCP Surface MUST Be Compact and Workflow-Level
The MCP server MUST expose a compact set of workflow-level tools. Graph navigation v2 MUST NOT add, remove, rename, or split any tool; it MAY only add optional input fields and bounded output modes inside existing `mem_project action="graph"`. The registered set MUST remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.

#### Scenario: Compact MCP registry is unchanged by graph navigation v2
- GIVEN graph navigation v2 optional inputs are implemented
- WHEN clients list MCP tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered
- AND no graph-navigation-specific tool MUST appear

## REMOVED Requirements

None.

## Assumptions
- **Default compatibility:** Omitted `navigation` resolves to `ledger`; this is the compatibility default and is not a new behavior mode.
- **Input naming:** `navigation` is the preferred optional selector because `action` is already occupied by the existing workflow-level project action.
- **History visibility:** `include_superseded` remains false by default. `navigation="superseded"` is the clearest explicit opt-in for retained history.
- **Community boundary:** Community navigation is an inspection/debugging view over existing summaries and state; it is not a global-answer or visualization replacement.

## Handoff Hints
- Preserve the six-tool MCP registry exactly.
- Keep omitted `navigation` behavior compatible with the current `action="graph"` ledger.
- Enforce bounds and source attribution in every navigation view.
- Do not claim multi-harness support, G3 harness parity, MemoryIntegrationCore migration, or global GraphRAG synthesis.
