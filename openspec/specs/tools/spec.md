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

## ADDED Requirements (kg-supersedes-edges, B3)


> Sub-change **B3** (`kg-supersedes-edges`). `mem_project action=graph` defaults
> to a current-state view (superseded facts hidden by default but still
> reachable/flagged), gated by the supersession flag. No MCP tool is
> added/removed/renamed (constitution **P1**); flag-off output is byte-identical
> to pre-B3 / B1.

## ADDED Requirements

### Requirement: `mem_project action=graph` MUST Default to a Current-State View With History Reachable
When the supersession flag is enabled, `mem_project action=graph` (rendered by
`formatProjectGraph`, `src/tools/project-views.ts:31-70`, which reads
`store.getObservationFacts({ project, topic_key })`) MUST default to a
CURRENT-STATE ledger: facts whose underlying triple is superseded MUST be hidden
from or visibly flagged in the default ledger so the view reflects current truth.
Superseded history MUST remain REACHABLE (constitution **P5**): the rendering MUST
NOT delete superseded facts, and superseded facts MUST be derivable through a
history-inclusive path (for example an explicit option/parameter or the
underlying KG read), not lost. This is the one intentional, flag-gated default
behavior change in B3; with the flag OFF the ledger MUST be byte-identical to the
pre-B3 (B1) output. The `max_chars` minimum-of-`200` budget for `action=graph`
(it does NOT accept the unbounded sentinel `0`) MUST be unchanged.

#### Scenario: Default graph view shows current truth
- GIVEN a project with superseded and current facts and the flag enabled
- WHEN `mem_project action=graph` renders the default ledger
- THEN superseded facts MUST be hidden or visibly flagged
- AND current facts MUST be shown

#### Scenario: Superseded history remains reachable
- GIVEN superseded facts exist for a project
- WHEN history is requested through the history-inclusive path
- THEN the superseded facts MUST still be retrievable
- AND they MUST NOT have been deleted

#### Scenario: Flag-off ledger is byte-identical to pre-B3
- GIVEN the supersession flag is disabled
- WHEN `mem_project action=graph` renders for any project/scope
- THEN the rendered ledger MUST be byte-for-byte identical to the pre-B3 (B1)
  output, including each fact line's `subject -- relation --> object`

#### Scenario: action=graph output budget is unchanged
- GIVEN a project whose graph ledger is large
- WHEN `mem_project action=graph` renders with the default or an explicit
  `max_chars`
- THEN the `max_chars` minimum of `200` MUST still apply
- AND `action=graph` MUST NOT accept the unbounded sentinel `0`

### Requirement: B3 MUST NOT Change the MCP Tool Surface
B3 MUST NOT add, remove, rename, or split any MCP tool; it only changes behavior
WITHIN the existing tools (the `mem_project action=graph` default view, and the
`mem_recall` superseded annotation behavior described in the retrieval delta).
The registered set MUST remain exactly `mem_save`, `mem_recall`, `mem_context`,
`mem_get`, `mem_project`, and `mem_session` (constitution **P1**).

#### Scenario: MCP registry is unchanged by B3
- GIVEN B3 is applied
- WHEN clients list available tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`,
  and `mem_session` MUST be registered
- AND no supersession-specific tool MUST appear in the registry

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-6 (RESOLVED — current-state default for graph only):** The current-state
  DEFAULT (hide-or-flag superseded) applies to `mem_project action=graph` only.
  `mem_recall` and the multi-hop frontier DEPRIORITIZE+flag (keep reachable)
  rather than hide (see the retrieval delta). History stays reachable everywhere
  (constitution **P5**).
- **Parity is conditional on the flag (B1 contract preserved):** B1 kept
  `action=graph` byte-for-byte. B3 INTENTIONALLY changes the default view, but
  only when `kgSupersedeEnabled` is on; flag-off restores the exact B1 output.
  This mirrors the B1/B2 flag-gated reversibility discipline and is the only
  observable behavior change in B3.
- **`mem_recall` annotation (cross-reference):** The `mem_recall` superseded
  annotation/deprioritization is specified in the retrieval delta
  (`queryKnowledgeLane` flag + fusion deprioritization). This tools delta covers
  only the `action=graph` default-view change and the unchanged tool surface.
- **Visualization vocabulary (non-breaking):** The supersession relation may
  appear in the relation vocabulary exposed by visualization/relation listings
  without breaking the existing relation set; this is additive and parity-safe.

## Delta from kg-superseded-pruning

# Delta for Tools

> Change **C1** (`kg-superseded-pruning`). C1 adds the `prune-graph` admin op on
> the CLI + HTTP surfaces ONLY (see the indexing delta); it adds NO MCP tool and
> changes NO existing MCP tool behavior. The registered MCP surface stays exactly
> six workflow-level tools (constitution **P1**), honoring the
> admin-ops-are-not-MCP boundary (`src/evals/retrieval.ts:284-286`).

## ADDED Requirements

### Requirement: C1 MUST NOT Change the MCP Tool Surface
C1 MUST NOT add, remove, rename, or split any MCP tool. `prune-graph` is an admin
op exposed on the CLI and HTTP surfaces only and MUST NOT be registered as an MCP
tool (constitution **P1**; Success Criterion 7). C1 also MUST NOT change the
observable behavior of any existing MCP tool: in particular, `mem_project
action=graph`, `mem_recall`, and `mem_context` MUST behave exactly as they did
after B3 — pruning only removes deep-history superseded rows that these surfaces do
not present as current truth. The registered set MUST remain exactly `mem_save`,
`mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.

#### Scenario: MCP registry is unchanged by C1
- GIVEN C1 is applied
- WHEN clients list available tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`,
  and `mem_session` MUST be registered
- AND no pruning-specific MCP tool MUST appear in the registry

#### Scenario: mem_project action=graph behavior is unaffected by pruning
- GIVEN a project whose superseded history has been bounded by pruning
- WHEN `mem_project action=graph` renders the ledger for that project
- THEN its current-state default view (from B3) MUST render exactly as it did
  after B3 for the current facts and retained history
- AND pruning MUST NOT change the rendered current-truth ledger

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Admin op, not MCP (constitution P1):** `prune-graph` deliberately follows the
  `rebuild-graph` precedent: admin/sync operations live on the CLI and HTTP API,
  not on the compact MCP surface. The MCP registry assertion here is the tools-side
  counterpart of the indexing delta's CLI+HTTP requirement.
- **No `action=graph` default change in C1:** B3 introduced the current-state
  default for `action=graph`; C1 makes no further change to that view. Pruning
  removes only deep superseded history that the current-state view already hid, so
  the default ledger is unchanged.
- **History-reachability caveat (disclosed):** B3 guaranteed superseded history is
  reachable through a history-inclusive path. C1 bounds that history to the N most-
  recent superseded rows per slot; a history-inclusive read after pruning returns
  the RETAINED window, not the full pre-prune chain. This is the intended bounded-
  retention behavior (see the knowledge-graph delta's disclosed reversibility
  limit) and is not an MCP surface change.



# Delta for Community Summaries LazyGraphRAG

## ADDED Requirements

### Requirement: Community Summaries MUST NOT Change the MCP Registry
This change MUST NOT add, remove, rename, or split any MCP tool. The registered MCP surface MUST remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`. Community rebuild and inspection controls are admin operations and SHALL NOT be registered as MCP tools.

#### Scenario: MCP registry remains six tools
- GIVEN community summaries are implemented
- WHEN clients list MCP tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered
- AND no community-specific MCP tool MUST appear

### Requirement: Community Admin Operations MUST Be CLI and HTTP Only
The system MUST expose community-summary rebuild and inspection operations only through CLI and HTTP admin surfaces, following the existing `rebuild-graph` and `prune-graph` boundary. Admin surfaces MUST support project scoping, observable status, and inspection of freshness/degraded state.

#### Scenario: CLI rebuilds community summaries
- GIVEN an operator invokes the community-summary rebuild command for a project
- WHEN the command completes
- THEN it MUST report rebuild status and relevant counts
- AND it MUST NOT require an MCP tool invocation

#### Scenario: HTTP inspects community summary state
- GIVEN community summaries exist or are stale for a project
- WHEN an HTTP admin inspection route is requested
- THEN it MUST return bounded community metadata including freshness/degraded state
- AND it MUST not expose secrets or unbounded source content

### Requirement: Existing Tool Outputs MAY Consume Community Evidence Without Contract Expansion
Existing `mem_recall` and `mem_project action=summary` outputs MAY include compact community-summary annotations or evidence when retrieval supplies them, but the tool input/output contract MUST remain backward-compatible and bounded. `mem_project action=graph` MUST remain KG-backed and MUST NOT become a community graph visualization surface.

#### Scenario: mem_recall annotates community evidence without new tool
- GIVEN retrieval returns community-summary evidence in the KG lane
- WHEN `mem_recall` renders results
- THEN the result MAY include compact community metadata
- AND no new tool, action, or required client flow MUST be introduced

#### Scenario: action=graph remains KG fact ledger
- GIVEN community summaries exist for a project
- WHEN `mem_project action=graph` is requested
- THEN it MUST continue to render the KG-backed graph ledger semantics
- AND it MUST NOT replace the ledger with community-summary reports
## Sync and Resilience Requirements

### Requirement: mem_recall MUST Support Exact Topic-Key Lookup
The `mem_recall` behavior MUST support exact `topic_key` retrieval intent and SHALL return deterministic exact-key matches when the request expresses exact topic-key lookup.

#### Scenario: Exact topic key recall returns deterministic match set
- GIVEN a stored observation with `topic_key` equal to `architecture/auth-model`
- WHEN a `mem_recall` request targets exact topic key `architecture/auth-model`
- THEN returned results MUST include that observation and MUST NOT include observations with non-equal topic keys

#### Scenario: Exact lookup coexists with existing filters
- GIVEN multiple observations share the same topic key across scopes or projects
- WHEN exact topic-key lookup is requested with additional scope/project/type filters via `mem_recall`
- THEN results MUST respect both exact key equality and provided filters

### Requirement: Exact Topic-Key Recall and Full-Text Recall Must Coexist
General search in `mem_recall` MUST keep full-text behavior for non-exact queries while still honoring exact topic-key lookup when `topic_key_exact` is provided.

#### Scenario: Non-exact query remains full-text
- GIVEN a natural-language search query that is not an exact topic-key lookup
- WHEN `mem_recall` executes without `topic_key_exact`
- THEN results MUST follow general full-text relevance behavior

### Requirement: Topic-Key Exactness Must Be Available Through HTTP Search
The HTTP search route MUST preserve deterministic topic-key exactness by passing explicit topic-key filters into `Store.searchObservations` so HTTP callers receive the same exact-match behavior as `mem_recall`.

#### Scenario: HTTP topic-key recall is deterministic
- GIVEN HTTP search is queried with `topic_key_exact=architecture/auth-model` and project/scope filters
- WHEN the route calls `search` on Store
- THEN the response MUST match Store exact-key semantics (exact key equality and matching filters)

### Requirement: Sync Import/Export Are CLI/HTTP-Only Surfaces
Sync export/import capabilities MUST be exposed only through CLI and HTTP (`src/sync/index.ts`, `sync`, `sync-import`, `/sync/export`, `/sync/import`) and MUST NOT be registered as MCP tools.

#### Scenario: Sync surfaces are not MCP tools
- GIVEN the MCP tool registry
- WHEN inspecting exposed tools
- THEN only the compact six MCP tools are present and sync capabilities are absent

### Requirement: Sync Import/Export Errors Must Be Explicit
CLI and HTTP sync operations MUST return explicit failure responses when sync artifacts are unreadable/corrupt or sync state transitions fail.

#### Scenario: Sync artifact import error is explicit
- GIVEN a corrupt sync artifact supplied to sync import
- WHEN the import operation runs
- THEN the operation MUST return an explicit error response rather than a silent success


## Merge: stable-memory-identity-bootstrap/tools

# Delta for Tools

## ADDED Requirements
### Requirement: MCP Session and Save Tools MUST Preserve Explicit Identity
The existing `mem_session` and `mem_save` tools MUST preserve caller-provided `session_id` and `project` values when persisting sessions, prompts, session summaries, or observations. The tools MUST NOT replace explicit identity with compatibility placeholders such as `manual-save-*` or `unknown` when a non-empty caller-provided value is available.

#### Scenario: Explicit session start identity is preserved
- GIVEN a caller invokes `mem_session` with `action=start`, an explicit session id, and an explicit project
- WHEN the tool persists the session
- THEN the stored session MUST use the supplied session id
- AND the stored session MUST use the supplied project
- AND no compatibility fallback identity MUST be reported for that call

#### Scenario: Explicit save identity is preserved
- GIVEN a caller invokes `mem_save` for a prompt, session summary, or observation with explicit session id and project values
- WHEN the tool persists the record
- THEN the persisted record MUST remain associated with those explicit values where the target record type supports them
- AND the tool MUST NOT synthesize `manual-save-*` or `unknown` for the explicit values

### Requirement: Compatibility Fallback Identity MUST Be Observable and Deterministic
When `mem_session` or `mem_save` must retain backward-compatible behavior for missing identity, the tool response MUST make the fallback visible and MUST use deterministic placeholder values. Fallback visibility MUST identify which identity field was degraded and what placeholder value was used, without requiring a new MCP tool or changing the compact tool registry.

#### Scenario: Missing session uses visible fallback
- GIVEN a caller invokes `mem_save` for a prompt or session summary without a session id
- WHEN compatibility behavior creates or uses a fallback session id
- THEN the fallback session id MUST be deterministic for the same effective project and save category
- AND the response MUST report that fallback session identity was used
- AND the response MUST include the fallback session id

#### Scenario: Missing project uses visible degraded project
- GIVEN a caller invokes `mem_save` without a project where the persistence path requires or benefits from project identity
- WHEN compatibility behavior persists the record under a placeholder or null project
- THEN the response MUST report the project identity as missing or degraded
- AND any placeholder project value MUST be deterministic and query-stable

### Requirement: HTTP Save and Session Routes MUST Mirror MCP Identity Semantics
HTTP routes that mirror session and save behavior MUST preserve explicit identity and report deterministic fallback identity with semantics equivalent to `mem_session` and `mem_save`. HTTP response shape MAY use HTTP-appropriate JSON fields, but the observable identity outcome MUST match the MCP tool result for the same inputs.

#### Scenario: HTTP preserves explicit identity like MCP
- GIVEN equivalent save or session requests are made through MCP and HTTP with explicit session id and project
- WHEN both requests persist records
- THEN both surfaces MUST preserve the explicit identity
- AND neither surface MUST report fallback identity

#### Scenario: HTTP reports fallback identity like MCP
- GIVEN equivalent save or session requests are made through MCP and HTTP with missing identity
- WHEN compatibility fallback identity is used
- THEN both surfaces MUST report fallback use for the same missing fields
- AND both surfaces MUST expose deterministic placeholder values or degraded-state metadata

### Requirement: Identity Bootstrap MUST NOT Expand the Compact MCP Tool Surface
This change MUST NOT add, remove, rename, or split MCP tools. The registered MCP surface MUST remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; identity fallback reporting MUST be implemented within existing tool responses and handlers.

#### Scenario: MCP registry remains six tools
- GIVEN stable identity bootstrap behavior is implemented
- WHEN clients list available MCP tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered
- AND no identity-bootstrap-specific MCP tool MUST appear

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Compatibility fallbacks remain for callers that omit identity, but their use is visible and deterministic rather than silent.
- Fallback reporting may be expressed as human-readable MCP text and structured HTTP JSON, provided both surfaces expose the same degraded identity facts.
- A caller-provided identity is explicit only when the submitted value is non-empty after existing input normalization/validation; blank or absent values follow missing-identity compatibility behavior.
- The same degraded identity facts are: the affected field (`session_id` or `project`), whether the value was omitted or synthesized, and the placeholder/null value used when one is persisted.
- Existing historical records with placeholder identity are not rewritten by tool calls in this change.

## Handoff Hints
- Preserve the six-tool registry unchanged in design and tasks.
- Design should choose a reusable fallback-reporting shape shared by MCP and HTTP without adding tools.
- Tests should cover explicit identity, missing session id, missing project, and HTTP/MCP parity.

