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
