# Delta for Indexing

## ADDED Requirements
### Requirement: Indexing MUST Run Asynchronously and Preserve Save Responsiveness
Chunk/sentence semantic indexing and KG extraction MUST execute in background jobs so save/ingest flows remain responsive.

#### Scenario: Save completes before deep indexing
- GIVEN a new observation is persisted
- WHEN semantic/KG indexing work is required
- THEN persistence MUST complete independently of background indexing completion

### Requirement: Post-Save Semantic Consistency MUST Be Eventual and Explicit
The system MUST treat semantic recall for newly saved or updated content as eventual until background indexing finishes, while immediately preserving primary persistence, FTS5-compatible text, and graph/KG-compatible source data.

#### Scenario: Save returns with semantic indexing pending
- GIVEN a save operation enqueues semantic indexing work
- WHEN the save response is returned
- THEN the system MUST NOT claim sentence/chunk semantic coverage is fresh until the relevant background jobs complete

#### Scenario: Retrieval can observe pending semantic coverage
- GIVEN semantic indexing is pending for a saved item
- WHEN retrieval checks index state
- THEN the system MUST expose pending/degraded semantic coverage so callers can distinguish eventual semantic recall from missing data

### Requirement: Chunk Vector Indexing SHOULD Precede Sentence Vector Indexing for the Same Source
When chunk and sentence indexing jobs are split for the same source content, the background workflow SHOULD process chunk vectors before sentence vectors so coarse semantic context becomes available before high-precision sentence recall. This ordering MUST NOT block save responsiveness.

#### Scenario: Background queue prioritizes chunk before sentence
- GIVEN chunk and sentence semantic jobs exist for the same source content
- WHEN the worker chooses executable jobs
- THEN chunk vector indexing SHOULD be attempted before sentence vector indexing for that source

### Requirement: Sentence and Chunk Vectors MUST Be Indexed into sqlite-vec
Background indexers MUST insert embeddings into sentence/chunk vec0 tables and maintain deterministic rowid mapping plus lineage metadata.

#### Scenario: Vector index write includes rowid + lineage
- GIVEN embeddings are produced for chunk/sentence units
- WHEN indexer persists them
- THEN vec0 rows MUST be inserted/upserted with deterministic rowid mapping and provenance lineage

### Requirement: Automatic Rebuild MUST Trigger on Embedding Config Hash Mismatch
When active embedding hash differs from persisted semantic index hash, a rebuild MUST be auto-enqueued.

#### Scenario: Hash mismatch enqueues rebuild
- GIVEN active hash and persisted hash differ
- WHEN staleness evaluation runs
- THEN rebuild MUST be enqueued idempotently

### Requirement: Jobs MUST Be Idempotent and Retryable
Indexing/rebuild jobs MUST be restart-safe and converge without duplicate side effects.

#### Scenario: Interrupted rebuild converges on retry
- GIVEN a rebuild job is interrupted
- WHEN processing resumes
- THEN final semantic/KG index state MUST converge deterministically

### Requirement: Deterministic KG Facts MUST Be Written Synchronously on Save
The indexing/extraction path MUST perform a SYNCHRONOUS, deterministic
KG-fact write on observation save/update/upsert, reusing the deterministic
extractor (`extractKnowledgeTriples`, `src/indexing/kg-extractor.ts:364`) that
already runs first in `processKgJob` (`src/indexing/jobs.ts:441`). This write MUST
persist `kg_entities`/`kg_triples` for the saved observation before the save
returns, MUST NOT require an embedding model or remote service (constitution
**P2**), and MUST be idempotent and update-safe (replace prior deterministic
triples for the observation; deduplicate by `triple_hash`). This preserves the
immediate graph-fact availability previously provided by the synchronous
`observation_facts` writer.

> Implementation note (non-normative): the deterministic entity-upsert + triple
> insert/replace logic currently lives inline in `processKgJob`
> (`src/indexing/jobs.ts:462-513`). Delivering a synchronous write that the save
> path can call will require factoring that deterministic write into a reusable,
> no-LLM helper shared by save and the background job. The design phase owns this
> factoring.

#### Scenario: Save synchronously persists deterministic KG facts
- GIVEN a new or updated observation whose content yields deterministic triples
- WHEN the save/update/upsert operation returns
- THEN the deterministic `kg_entities`/`kg_triples` for that observation MUST
  already be persisted
- AND this MUST occur without invoking any LLM or remote embedding service

#### Scenario: Synchronous write is idempotent on re-save
- GIVEN an observation already written synchronously
- WHEN it is saved again
- THEN its deterministic triples MUST be replaced/deduplicated (by `triple_hash`)
  rather than duplicated

### Requirement: `extract_kg` Background Job MUST Be Retained for Optional LLM Enrichment
The `extract_kg` background job MUST be retained, but its role is OPTIONAL LLM
enrichment on top of the synchronously written deterministic facts, not the
primary source of graph-fact availability. The deterministic extractor MUST
continue to run first in the job (`src/indexing/jobs.ts:441`), and LLM enrichment
MUST remain conditional (only when recommended and an extractor is configured) and
non-blocking to save. Enrichment failure MUST NOT remove or invalidate the
deterministic facts.

#### Scenario: Background job enriches without being required
- GIVEN deterministic facts were written synchronously on save
- WHEN the `extract_kg` job later runs
- THEN it MUST only add/upgrade triples (LLM enrichment) for that observation
- AND deterministic graph-fact availability MUST NOT depend on the job completing

#### Scenario: Enrichment failure preserves deterministic facts
- GIVEN the synchronous deterministic facts exist for an observation
- WHEN LLM enrichment in the background job fails
- THEN the deterministic facts MUST remain persisted and queryable

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
### Requirement: Post-Save Semantic Consistency MUST Be Eventual and Explicit
The system MUST treat SEMANTIC recall (sentence/chunk vectors) for newly saved or
updated content as eventual until background indexing finishes. Graph/KG facts,
however, MUST NOT be eventual on save: the deterministic KG write is synchronous
(see "Deterministic KG Facts MUST Be Written Synchronously on Save"), so
graph-fact availability is immediate while semantic-vector coverage remains
eventual. Primary persistence and FTS5-compatible text MUST continue to be
immediately preserved.

#### Scenario: Save returns with semantic indexing pending but graph facts present
- GIVEN a save enqueues semantic (sentence/chunk) indexing work
- WHEN the save response is returned
- THEN the system MUST NOT claim sentence/chunk semantic coverage is fresh until
  the relevant background jobs complete
- AND the observation's deterministic graph facts MUST already be present
  (written synchronously)

#### Scenario: Retrieval can observe pending semantic coverage
- GIVEN semantic indexing is pending for a saved item
- WHEN retrieval checks index state
- THEN the system MUST expose pending/degraded semantic coverage so callers can
  distinguish eventual semantic recall from missing data

## Assumptions
- **CL-1 (RESOLVED):** Graph facts become synchronous-on-save via the
  deterministic extractor; the `extract_kg` job is enrichment-only. The "eventual
  graph facts" alternative is not adopted.
- **CL-2 (RESOLVED):** Backfill is operator-triggered through the repointed
  `rebuild-graph` path, not an automatic startup migration; readers degrade
  gracefully until it runs (see the knowledge-graph and store deltas).
- **Reused rebuild path:** `processRebuildJob` (`src/indexing/jobs.ts:359-416`)
  already enqueues `extract_kg` per observation and `processKgJob` writes KG facts
  deterministically first; the consolidated rebuild reuses this rather than
  inventing a new path.

## Delta from kg-superseded-pruning

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


