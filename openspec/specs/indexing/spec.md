# Delta for Indexing

## ADDED Requirements

### Requirement: Optional Projection Indexing MUST Be Asynchronous and Non-Blocking

Dense, entity, graph, reranking, summarization, and other optional projection work MUST run outside the authoritative save transaction and MUST NOT be required for save success or immediate core recall.

#### Scenario: US3 - Rely on a small offline core 1

- **GIVEN** a clean installation with no optional retrieval provider
- **WHEN** a memory is saved and immediately queried
- **THEN** lexical and structured retrieval returns it without waiting for background work

#### Scenario: US3 - Rely on a small offline core 2

- **GIVEN** an enabled optional projection that is missing, stale, or failing
- **WHEN** recall runs
- **THEN** the lexical core remains available and the response truthfully identifies the optional projection state

### Requirement: Chunk Vector Indexing SHOULD Precede Sentence Vector Indexing for the Same Source
When chunk and sentence indexing jobs are split for the same source content, the background workflow SHOULD process chunk vectors before sentence vectors so coarse semantic context becomes available before high-precision sentence recall. This ordering MUST NOT block save responsiveness.

#### Scenario: Background queue prioritizes chunk before sentence
- GIVEN chunk and sentence semantic jobs exist for the same source content
- WHEN the worker chooses executable jobs
- THEN chunk vector indexing SHOULD be attempted before sentence vector indexing for that source

### Requirement: Enabled Projections MUST Rebuild From Authoritative SQLite State

An enabled optional projection MUST detect source or configuration mismatch, mark itself non-current, and rebuild idempotently from authoritative SQLite records without mutating those records.

#### Scenario: US3 - Rely on a small offline core 1

- **GIVEN** a clean installation with no optional retrieval provider
- **WHEN** a memory is saved and immediately queried
- **THEN** lexical and structured retrieval returns it without waiting for background work

#### Scenario: US3 - Rely on a small offline core 2

- **GIVEN** an enabled optional projection that is missing, stale, or failing
- **WHEN** recall runs
- **THEN** the lexical core remains available and the response truthfully identifies the optional projection state

### Requirement: Jobs MUST Be Idempotent and Retryable

Optional projection jobs MUST use stable source identities and checkpoints so duplicate delivery, interruption, and restart converge without duplicate authoritative memory or false readiness.

#### Scenario: US3 - Rely on a small offline core 1

- **GIVEN** a clean installation with no optional retrieval provider
- **WHEN** a memory is saved and immediately queried
- **THEN** lexical and structured retrieval returns it without waiting for background work

#### Scenario: US3 - Rely on a small offline core 2

- **GIVEN** an enabled optional projection that is missing, stale, or failing
- **WHEN** recall runs
- **THEN** the lexical core remains available and the response truthfully identifies the optional projection state

### Requirement: `rebuild-graph` MUST Repoint to the Consolidated KG-Backed Path
The `rebuild-graph` operator entry points MUST rebuild the consolidated KG-backed
graph and MUST NOT reference the removed `observation_facts` table. This covers
the CLI `rebuild-graph` command (`src/cli.ts`, dispatch at `:700`, handler around
`:560-589`, which today calls `store.rebuildObservationFacts`), the store rebuild
method (`store.rebuildObservationFacts`, `src/store/index.ts:2998`), and the HTTP
`POST /graph/rebuild` operation (`src/http-server.ts:98`, handler in
`src/http-routes.ts`). The rebuild MUST serve as the operator-triggered backfill
mechanism for legacy observations (CL-2), reusing the existing rebuild job path
(`processRebuildJob` → `extract_kg`/deterministic KG write).

#### Scenario: CLI rebuild-graph rebuilds the knowledge graph
- GIVEN an operator runs `rebuild-graph` (optionally scoped to a project)
- WHEN the rebuild executes
- THEN it MUST repopulate deterministic `kg_entities`/`kg_triples` for the
  in-scope observations
- AND it MUST NOT reference or write `observation_facts`

#### Scenario: HTTP graph rebuild remains functional against the KG
- GIVEN `observation_facts` has been removed
- WHEN `POST /graph/rebuild` is invoked
- THEN it MUST rebuild the KG-backed graph successfully
- AND it MUST NOT reference the removed table

#### Scenario: Rebuild performs operator-triggered legacy backfill
- GIVEN legacy observations lack KG facts after upgrade
- WHEN the operator runs the rebuild (e.g. `rebuild-graph --all`)
- THEN the legacy observations MUST gain their deterministic KG facts
- AND repeated rebuilds MUST converge without duplicating triples## MODIFIED Requirements

## REMOVED Requirements


## MODIFIED Requirements

### Requirement: Optional Projection Consistency MUST Be Eventual and Explicit

Each enabled optional projection MAY converge after save but MUST publish a source watermark and readiness state; authoritative and FTS5 retrieval MUST be immediate.

#### Scenario: US3 - Rely on a small offline core 1

- **GIVEN** a clean installation with no optional retrieval provider
- **WHEN** a memory is saved and immediately queried
- **THEN** lexical and structured retrieval returns it without waiting for background work

#### Scenario: US3 - Rely on a small offline core 2

- **GIVEN** an enabled optional projection that is missing, stale, or failing
- **WHEN** recall runs
- **THEN** the lexical core remains available and the response truthfully identifies the optional projection state

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



# Delta for Community Summaries LazyGraphRAG

## ADDED Requirements

### Requirement: Community Rebuild MUST Be an Operator-Visible Admin Workflow
Community-summary rebuild MUST be available as an operator-visible admin workflow, analogous to graph rebuild/prune operations. It MUST support project scoping, full rebuild, dry-run or inspect mode where practical, bounded status output, and explicit success/failure/degraded reporting. It MUST NOT be exposed as an MCP tool.

#### Scenario: Project-scoped community rebuild
- GIVEN an operator requests community rebuild for a project
- WHEN the rebuild runs
- THEN only that project's eligible KG graph MUST be partitioned and summarized
- AND the operation MUST report counts and status

### Requirement: Community Rebuild MUST Use Existing KG as Input and Avoid Indexing-Time LLM Dependency
The indexing/rebuild workflow MUST consume the already consolidated KG as input and MUST produce deterministic extractive summaries without embeddings, remote services, or LLMs. Optional LLM enrichment MAY run as a separate additive step that cannot block the deterministic artifact commit.

#### Scenario: Rebuild completes without optional providers
- GIVEN embeddings and LLM providers are unavailable
- WHEN community rebuild runs
- THEN deterministic partitioning and extractive summaries MUST complete or record an explicit KG-empty/degraded state
- AND the rebuild MUST NOT fail solely because optional providers are absent

### Requirement: Community Rebuild MUST Track Staleness After KG Updates
The indexing/maintenance layer MUST make community-summary staleness detectable after KG-affecting changes, including observation save/update/upsert, KG rebuild, supersession marking, and pruning. Automatic rebuild MAY be deferred, but stale state MUST be visible to retrieval and admin inspection.

#### Scenario: Save marks community state stale
- GIVEN fresh community summaries exist for a project
- WHEN a save/update/upsert changes that project's KG
- THEN community summary state for the project MUST become stale or rebuilding before it is consumed as fresh

#### Scenario: Graph rebuild invalidates community summaries
- GIVEN graph rebuild repopulates KG rows for a project
- WHEN the graph rebuild commits
- THEN community summary freshness for that project MUST be invalidated or refreshed coherently

### Requirement: Community Rebuild Jobs MUST Be Idempotent and Retryable
Community rebuild jobs MUST be restart-safe and converge without duplicate artifacts. Interrupted or failed jobs MUST leave committed community summaries in a readable previous state and expose failure status for later retry.

#### Scenario: Interrupted community rebuild retries safely
- GIVEN a community rebuild is interrupted
- WHEN the rebuild is retried with the same KG inputs
- THEN the final committed artifacts MUST converge
- AND duplicate community artifacts MUST NOT accumulate

## Production Hardening Dashboard V2 Requirements

### Requirement: Indexing Health MUST Include Operator-Grade Queue Metrics
Indexing health MUST expose queue age, pending/running/done/failed counts by job kind, stale/degraded lane state, recent errors, and coverage ratios.

#### Scenario: Queue lag is visible
- GIVEN pending semantic jobs exist
- WHEN health is requested
- THEN the response MUST include pending counts and queue age or equivalent lag signal

### Requirement: Rebuild Operations MUST Be Available over HTTP
Graph rebuild and semantic rebuild operations MUST be triggerable and inspectable through HTTP endpoints for Dashboard v2.

#### Scenario: Graph rebuild through HTTP
- GIVEN existing observations need graph rebuild
- WHEN the dashboard calls rebuild graph for a project
- THEN graph jobs or rebuild results MUST be returned with affected count metadata

### Requirement: Background Worker Failures MUST Stay Visible
Background indexing and KG failures MUST remain visible after terminal failure through recent error telemetry and trace logs.

#### Scenario: Failed KG enrichment appears in health
- GIVEN optional KG LLM enrichment fails
- WHEN the dashboard requests health
- THEN the recent error list MUST include the failed job warning without blocking deterministic KG results

### Requirement: Title-aware semantic indexing

Chunk and sentence indexing MUST retain the source observation title as optional document metadata for profile formatting without altering persisted source content or lexical retrieval text.

#### Scenario: US3 - Benchmark-gated default decision 1

- **GIVEN** all three models are available
- **WHEN** the benchmark runs
- **THEN** each model receives identical queries/documents through its resolved profile and the report includes per-model quality and operational metrics

#### Scenario: US3 - Benchmark-gated default decision 2

- **GIVEN** all three runs are complete
- **WHEN** a candidate satisfies the absolute thresholds and is no worse than Nomic on Recall@1, Recall@5, and MRR
- **THEN** it becomes eligible and the deterministic quality score and tie-break order select the winning eligible candidate even when Nomic itself is below the candidate thresholds

#### Scenario: US3 - Benchmark-gated default decision 3

- **GIVEN** neither candidate is eligible, any model is unavailable, or benchmark execution/evidence persistence is incomplete
- **WHEN** the gate is evaluated
- **THEN** the gate fails closed and Nomic remains the shipped local default

#### Scenario: US3 - Benchmark-gated default decision 4

- **GIVEN** the effective default model or resolved preprocessing lineage changes
- **WHEN** semantic index state is reconciled
- **THEN** existing vectors are marked stale and an idempotent rebuild is enqueued

#### Scenario: US3 - Benchmark-gated default decision 5

- **GIVEN** a live benchmark finishes
- **WHEN** its human-readable report is rendered
- **THEN** the complete machine-readable report is also written to `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json` before the process exits
