# Delta for Tools

> Sub-change B1 of Change B. The `mem_project action=graph` ledger and any
> graph-fact consumers are now `kg_triples`-backed, with their contract and
> output shape PRESERVED (constitution **P3** parity). The compact six-tool MCP
> surface is unchanged (constitution **P1**).

## MODIFIED Requirements

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

## ADDED Requirements

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
  an error

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
