# Delta for Indexing

> Sub-change B1 of Change B. Adds the synchronous deterministic KG write-on-save
> (CL-1), retains the `extract_kg` job for optional LLM enrichment, and repoints
> the `rebuild-graph` path to the consolidated KG-backed rebuild.

## ADDED Requirements

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
- AND repeated rebuilds MUST converge without duplicating triples

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
