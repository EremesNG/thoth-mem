# Delta for Indexing

> Change **C1** (`kg-superseded-pruning`). Adds a manual `prune-graph` admin
> operation as a SIBLING of the existing `rebuild-graph` op: a CLI command and an
> HTTP `POST /graph/prune` route, both delegating to the shared store method
> `pruneSupersededTriples` (see the store delta). Following the admin-ops-are-not-
> MCP boundary (constitution **P1**; documented at `src/evals/retrieval.ts:284-286`),
> `prune-graph` MUST NOT be exposed as an MCP tool. It MUST support a dry-run
> preview and report before/after counts.

## ADDED Requirements

### Requirement: `prune-graph` MUST Be a CLI + HTTP Admin Op, Not an MCP Tool
The system MUST expose a `prune-graph` admin operation that bounds superseded KG
triples per the keep-N policy (see the knowledge-graph and store deltas), mirroring
the existing `rebuild-graph` operator entry points. It MUST be available as:
- a CLI command (`src/cli.ts`, mirroring `handleRebuildGraph` at `:569-588`, usage
  at `:34`, dispatch at `:700`) that accepts `--project`/`--all` scoping and a
  `--dry-run` flag; and
- an HTTP `POST /graph/prune` route (a new `OPERATION_CATALOG` entry mirroring the
  `rebuild-graph` http entry at `src/http-routes.ts:61` and cli entry at `:71`,
  plus a `handlePruneGraph` handler mirroring `handleRebuildGraph` at
  `src/http-routes.ts:573-581`) that reads `project` and a `dryRun` flag from the
  request body.

`prune-graph` MUST delegate to the shared `pruneSupersededTriples` store method so
its behavior is identical to the automatic path's underlying logic. It MUST NOT be
added to the MCP tool surface; the registered MCP set MUST remain exactly the six
workflow-level tools (constitution **P1**; Success Criterion 7 — see the tools
delta).

#### Scenario: CLI prune-graph bounds superseded triples
- GIVEN an operator runs `prune-graph` (optionally scoped with `--project`/`--all`)
- WHEN the command executes without `--dry-run`
- THEN it MUST enforce the keep-N retention over the in-scope superseded triples
- AND it MUST print a summary of the delta (superseded pruned, entities removed,
  dangling refs NULLed, before/after totals)

#### Scenario: HTTP POST /graph/prune bounds superseded triples
- GIVEN a client issues `POST /graph/prune` with an optional `project` in the body
- WHEN the operation executes without `dryRun`
- THEN it MUST enforce keep-N retention for the in-scope superseded triples
- AND it MUST return a before/after count summary

#### Scenario: prune-graph is not registered as an MCP tool
- GIVEN the MCP server registers tools
- WHEN clients list available tools
- THEN no `prune-graph`/`prune` MCP tool MUST appear
- AND the registered set MUST remain exactly `mem_save`, `mem_recall`,
  `mem_context`, `mem_get`, `mem_project`, and `mem_session`

### Requirement: `prune-graph` MUST Support Dry-Run Preview and Report Counts
Both the CLI `--dry-run` flag and the HTTP `dryRun` body flag MUST invoke the
store method's dry-run mode (see the store delta), reporting the counts the
operation WOULD delete (triples, entities, NULLed refs) and the before/after
totals WITHOUT mutating anything (Success Criterion 2). A non-dry-run invocation
MUST perform the prune transactionally and report the same count categories for
what it actually changed.

#### Scenario: CLI dry-run reports would-prune counts without deleting
- GIVEN accumulated superseded triples exceeding keep-N
- WHEN an operator runs `prune-graph --dry-run`
- THEN the printed summary MUST report the would-prune counts (triples, entities,
  NULLed refs, before/after)
- AND no `kg_triples`/`kg_entities` row MUST be deleted and no reference MUST be
  NULLed

#### Scenario: HTTP dry-run reports would-prune counts without deleting
- GIVEN `POST /graph/prune` is called with `dryRun` true
- WHEN the operation runs
- THEN the response MUST report the would-prune counts and before/after totals
- AND no row MUST be mutated

#### Scenario: Real run reports the counts it actually changed
- GIVEN a non-dry-run `prune-graph` invocation over slots exceeding keep-N
- WHEN the prune completes
- THEN the reported counts MUST reflect the rows actually pruned, the entities
  actually removed, and the references actually NULLed

### Requirement: `prune-graph` MUST Perform No Deletion When Supersession Is Disabled
Because C1 only bounds rows that the B3 supersession lifecycle creates,
`prune-graph` MUST perform no deletion when B3's `kgSupersedeEnabled` is off (there
is no supersession state to bound). The op MUST remain invocable in that state and
MUST report zero would-prune/pruned counts rather than erroring, so an operator can
safely run it (including dry-run) regardless of flag state.

#### Scenario: prune-graph is a safe no-op when supersession is off
- GIVEN `kgSupersedeEnabled` is off (no rows are superseded)
- WHEN an operator runs `prune-graph` (dry-run or real)
- THEN it MUST complete without error
- AND it MUST report zero triples pruned, zero entities removed, and zero refs
  NULLed

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Admin-op parity with `rebuild-graph`:** `prune-graph` reuses the established
  `rebuild-graph` admin-op shape end-to-end (CLI command + HTTP route +
  `OPERATION_CATALOG` entries), so operators get a consistent surface. The exact
  command/route naming (`prune-graph`, `POST /graph/prune`) is a working name;
  design owns final naming, but the CLI+HTTP-not-MCP placement is required.
- **Delegation to the store method:** The CLI/HTTP handlers are thin adapters over
  `pruneSupersededTriples` (see the store delta); all determinism, transactional
  safety, and referential-safety cleanup live in the store method, not in the
  handlers.
- **Manual op is available regardless of `kgPruneEnabled`:** `kgPruneEnabled` gates
  only the AUTOMATIC path (see the config and knowledge-graph deltas). The manual
  `prune-graph` op is an explicit operator action and remains available for
  inspection/dry-run and for one-shot cleanup even when the automatic path is off;
  it still performs no deletion when `kgSupersedeEnabled` is off.
