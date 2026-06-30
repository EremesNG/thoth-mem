# Tools

## Requirements

### Requirement: MCP Surface MUST Be Compact and Workflow-Level
The MCP server MUST expose a compact set of workflow-level tools rather than one tool per internal table, view, or legacy retrieval step. This change modifies the *output behavior* of the existing `mem_context` and `mem_project` tools only; it MUST NOT add, remove, rename, or split any tool. The registered set MUST remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.

#### Scenario: Compact MCP registry is exposed
- GIVEN the MCP server registers tools
- WHEN clients list available tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered

#### Scenario: Legacy granular tools are not registered
- GIVEN the MCP server registers tools
- WHEN clients list available tools
- THEN legacy granular tools such as `mem_search`, `mem_get_observation`, `mem_timeline`, `mem_project_summary`, `mem_project_graph`, `mem_topic_keys`, `mem_session_start`, `mem_session_summary`, `mem_save_prompt`, and admin/sync tools MUST NOT be registered

#### Scenario: Bounded-output change does not alter the registry
- GIVEN the bounded-output behavior is introduced for `mem_context` and `mem_project action=summary`
- WHEN clients list available tools
- THEN the registered tool set MUST be unchanged from the compact six-tool surface
- AND no new bounding-specific tool MUST appear in the registry

### Requirement: Recall Surface MUST Expose Four-Lane Fused Retrieval
`mem_recall` MUST expose fused ranked evidence combining sentence semantic, chunk semantic, lexical FTS5, and graph/KG lanes when available.

#### Scenario: Fused lane evidence is returned
- GIVEN retrieval lanes are available
- WHEN `mem_recall` is executed
- THEN output MUST include ranked fused evidence with lane attribution and lineage-oriented metadata

### Requirement: Tooling MUST Signal Semantic Degraded or Pending States Explicitly
If sqlite-vec cannot load, vec tables are unavailable, semantic index is stale/rebuilding, or newly saved content has not completed background semantic indexing, `mem_recall` MUST signal degraded/pending semantic lanes while still returning lexical + graph/KG output.

#### Scenario: Degraded semantic warning with successful fallback
- GIVEN semantic lanes are degraded
- WHEN `mem_recall` executes
- THEN output MUST include explicit degraded-state signaling and usable fallback results

#### Scenario: Pending semantic coverage after save is visible
- GIVEN content has been saved but sentence/chunk background indexing is not complete
- WHEN `mem_recall` output includes that content
- THEN the tool surface MUST be able to indicate pending semantic coverage rather than implying fresh vector recall

### Requirement: Manual Rebuild Surface MUST Remain CLI-Controlled
The system MUST provide manual `thoth-mem rebuild-index` control for semantic/KG reindexing through CLI, not through the compact MCP tool surface.

#### Scenario: Operator invokes rebuild-index
- GIVEN an operator requests rebuild
- WHEN the CLI rebuild command runs
- THEN rebuild MUST be initiated with observable status

### Requirement: Context And Summary Responses MUST Be Bounded By A Configurable Character Budget
`mem_context` and `mem_project` with `action=summary` MUST bound their rendered
response to a configurable total-character budget (working name
`maxContextChars`, resolved per the config spec). The bound MUST be enforced
before the response is returned, and the response MUST report the boundedness
explicitly (for example, shown/omitted observation counts and/or an explicit
truncation marker), consistent with constitution P4 ("measured, not claimed").
The previously observed unbounded dumps (`mem_context` ~104K characters;
`mem_project action=summary` ~74K characters) MUST NOT recur for the same store
state under the default budget.

#### Scenario: Large memory store yields bounded context output
- GIVEN a memory store whose recent observations would render to far more than
  the configured `maxContextChars` (reproducing the observed ~104K
  `mem_context` dump)
- WHEN `mem_context` is executed with the default budget
- THEN the returned response length MUST be less than or equal to the configured
  `maxContextChars`
- AND the response MUST report how much content was shown versus omitted

#### Scenario: Large memory store yields bounded project summary output
- GIVEN a memory store whose recent observations would render to far more than
  the configured `maxContextChars` (reproducing the observed ~74K
  `mem_project action=summary` dump)
- WHEN `mem_project` is executed with `action=summary` under the default budget
- THEN the returned response length MUST be less than or equal to the configured
  `maxContextChars`
- AND the response MUST report how much content was shown versus omitted

### Requirement: Context And Summary Responses MUST Render Previews By Default With Full Content Via mem_get
The recent-observation blocks in `mem_context` and `mem_project action=summary`
responses MUST render a bounded preview of each observation's content by default
rather than the full `obs.content`. Full observation content MUST remain
available through `mem_get` (the single-record full-fetch tier of the P4 recall
funnel). The response MUST direct callers to `mem_get` for full bodies, mirroring
the existing "Use `mem_get` with an ID for full content." escalation footer used
by search-result rendering.

#### Scenario: Preview-by-default then escalate to mem_get
- GIVEN an observation whose content is longer than the preview length
- WHEN `mem_context` (or `mem_project action=summary`) renders that observation
- THEN the rendered block MUST contain only a bounded preview of the content, not
  the full body
- AND the response MUST include a pointer instructing the caller to use `mem_get`
  with the observation ID for the full content
- AND fetching that observation ID via `mem_get` MUST return the full,
  untruncated content

### Requirement: Context And Summary Budget MUST Be Overridable Per Call
`mem_context` and `mem_project action=summary` MUST accept an optional per-call
budget parameter that overrides the configured default `maxContextChars` for that
invocation only. When the override is absent, the configured default MUST apply.
A per-call override MUST NOT mutate persisted configuration. The per-call value
MUST accept the unbounded sentinel `0` (disabling the bound for that invocation
only), consistent with the configured sentinel semantics.

#### Scenario: Per-call budget override is honored
- GIVEN a configured default `maxContextChars`
- WHEN `mem_context` is called with an explicit per-call budget different from the
  default
- THEN the response MUST be bounded by the per-call budget for that invocation
- AND a subsequent call without an override MUST again be bounded by the
  configured default

### Requirement: Context And Summary Output MUST Support An Explicit Unbounded Mode
`mem_context` and `mem_project action=summary` MUST support the explicit,
documented sentinel value `0` ("no output cap") that disables the output bound
(restoring full-dump behavior) for rollback and debugging. The unbounded mode
MUST be reachable through the resolved configuration (and through the per-call
override below) and MUST be selectable only by an explicit `0`, never as the
default. **Note**: the unbounded sentinel `0` applies to `action=summary` only; `action=graph` and `action=topic` retain a minimum of `200` for `max_chars` and do NOT accept the sentinel.

#### Scenario: Unbounded sentinel restores full output
- GIVEN the unbounded sentinel `0` is configured for the output budget
- WHEN `mem_context` (or `mem_project action=summary`) renders a large store
- THEN the response MUST NOT be truncated by `maxContextChars`
- AND the default (non-sentinel) configuration MUST still enforce the bound

### Requirement: Output Bound MUST Be Applied At The Shared getContext Layer
The output bound for context/summary responses MUST be enforced at the shared
`Store.getContext` rendering layer rather than independently per caller, so that
every surface backed by `getContext` inherits the bound consistently. This
includes the MCP `mem_context` tool, the MCP `mem_project action=summary` tool,
the HTTP project-summary surface
(`handleProjectSummary`, `src/http-routes.ts:1032`), and the CLI project-summary
surface (`src/cli.ts:380`). No per-surface re-implementation of the bound is
permitted.

#### Scenario: HTTP and CLI summary inherit the shared bound
- GIVEN the output bound is enforced inside the shared `getContext` layer
- WHEN the HTTP `/projects/{project}/summary` surface renders a large store
- THEN its payload MUST be bounded by `maxContextChars` without any HTTP-specific
  bounding code
- AND WHEN the CLI project-summary command renders the same store
- THEN its output MUST be bounded by `maxContextChars` without any CLI-specific
  bounding code

### Requirement: `mem_project action=graph` MUST Be KG-Backed and Behavior-Preserving
`mem_project` with `action=graph` (rendered by `formatProjectGraph`,
`src/tools/project-views.ts:31-37`, which calls
`store.getObservationFacts({ project, topic_key })`) MUST source its facts from
the consolidated KG-backed adapter, and its rendered ledger output MUST be
behavior-preserving: for the same observations and the same `project`/`topic_key`
scope, the rendered ledger MUST be byte-for-byte equivalent to the
pre-consolidation output, including each fact line's `subject`, `relation`, and
`object` (`${fact.subject} -- ${fact.relation} --> ${fact.object}`,
`src/tools/project-views.ts:38`) across BOTH the content relations and the
synthesized `IN_PROJECT`/`HAS_TYPE`/`HAS_TOPIC_KEY` metadata relations (CL-4).
The output character-budget behavior for `action=graph` (the `max_chars` minimum
of `200`, which does NOT accept the unbounded sentinel `0`) MUST be unchanged.

#### Scenario: Project graph ledger renders from the knowledge graph
- GIVEN observations with deterministic KG facts for a project
- WHEN `mem_project action=graph` renders the ledger for that project (optionally
  scoped by topic_key)
- THEN the facts MUST be sourced from `kg_triples`+`kg_entities` via the adapter
- AND the rendered ledger MUST be equivalent to the pre-consolidation output for
  the same observations and scope

#### Scenario: Project graph output budget is preserved
- GIVEN a project whose graph ledger is large
- WHEN `mem_project action=graph` renders with the default or an explicit
  `max_chars`
- THEN the `max_chars` minimum of `200` MUST still apply
- AND `action=graph` MUST NOT accept the unbounded sentinel `0`

#### Scenario: Project graph degrades gracefully before backfill
- GIVEN a project whose observations have not yet been backfilled into the KG
- WHEN `mem_project action=graph` is requested for that project
- THEN it MUST render an empty-but-valid ledger (no graph rows) without raising
  an error## MODIFIED Requirements
### Requirement: MCP Surface MUST Be Compact and Workflow-Level
The MCP server MUST expose a compact set of workflow-level tools. This change does
NOT add, remove, rename, or split any tool: it only repoints the data source
behind `mem_project action=graph` (and the ledger/timeline views) from the retired
`observation_facts` store to the consolidated `kg_triples`+`kg_entities` source.
The registered set MUST remain exactly `mem_save`, `mem_recall`, `mem_context`,
`mem_get`, `mem_project`, and `mem_session`.

#### Scenario: Compact MCP registry is unchanged by the consolidation
- GIVEN the graph-fact source is repointed to `kg_triples`
- WHEN clients list available tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`,
  and `mem_session` MUST be registered
- AND no graph-consolidation-specific tool MUST appear in the registry

## Assumptions
- **Behavior parity scope (CL-4):** "Behavior-preserving" for `action=graph` is
  full output parity — the rendered ledger MUST be byte-for-byte equivalent to
  the pre-consolidation output for the same observations and scope. This covers
  the four content-section relations
  (`HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED`), the three metadata-derived
  relations (`IN_PROJECT`/`HAS_TYPE`/`HAS_TOPIC_KEY`), the rendered `subject`
  (= observation title, see CL-3), and the set of contributing observations. The
  KG-RELATION-PARITY decision is RESOLVED in the knowledge-graph delta (CL-4):
  legacy labels are preserved via the hybrid-source adapter, so there is no
  remaining label difference to reconcile across surfaces.