# Delta for Store

## ADDED Requirements

### Requirement: Store MUST Provide a Flag-Gated Multi-Hop Knowledge Lane in hybridRetrieve
The store MUST provide a multi-hop knowledge traversal query (working name
`queryKnowledgeMultiHopLane`) adjacent to `queryKnowledgeLane`
(`src/store/index.ts:2023`) and MUST integrate it into `hybridRetrieve`
(`src/store/index.ts:1697`) behind the `kgMultiHopEnabled` flag. The query MUST
accept a set of seed observation ids plus the same `RetrievalCandidateFilters`
the other lanes receive, and MUST return `kg`-lane candidates sourced
`kg_multi_hop` for the observations reachable from the seeds per the
knowledge-graph delta (bidirectional `WITH RECURSIVE` over `kg_triples`, structural
allow-list, cycle-guarded, neighborhood-capped, seeds excluded, deleted/non-
observation rows excluded). Integration MUST:

- Seed traversal from the primary fused result set
  (`fused.map(hit => hit.observation.id)` after
  `fuseCandidates(...).slice(0, fusedLimit)`, `src/store/index.ts:1797`), run
  alongside the existing graph-enrichment pass (`:1800-1817`).
- Allow multi-hop candidates to introduce NEW observations into the final ranked
  output (re-fused through `fuseCandidates`), bounded by the same `fusedLimit` and
  the downstream output caps.
- When `kgMultiHopEnabled` is false, issue NO traversal query and leave
  `hybridRetrieve` behavior byte-identical to today.

#### Scenario: Flag on issues the traversal and can add observations
- GIVEN `kgMultiHopEnabled` is true and a query whose top fused hits have
  structural neighbors
- WHEN `hybridRetrieve` runs
- THEN `queryKnowledgeMultiHopLane` MUST be invoked seeded by the fused hit ids
- AND reachable non-seed observations MAY appear in the final ranked output as
  `kg`/`kg_multi_hop`, bounded by `fusedLimit`

#### Scenario: Flag off issues no traversal query
- GIVEN `kgMultiHopEnabled` is false
- WHEN `hybridRetrieve` runs
- THEN no multi-hop traversal query MUST be issued
- AND the ranked output MUST be identical to the pre-change single-hop baseline
  for the same inputs

#### Scenario: Multi-hop candidates carry the kg lane and multi-hop source
- GIVEN traversal reaches a non-seed observation
- WHEN its candidate is emitted from `queryKnowledgeMultiHopLane`
- THEN the candidate MUST have `lane: 'kg'` and `source: 'kg_multi_hop'` and carry
  KG provenance/confidence and a bridge-path text

### Requirement: Multi-Hop Traversal Cost MUST Be Bounded With Coarse Elapsed Degrade
The traversal MUST be bounded by a deterministic cost ceiling and MUST degrade
without hard-failure when that ceiling is exceeded. Because the store's
`better-sqlite3` connection is SYNCHRONOUS, the bound MUST be enforced primarily by
the deterministic ceiling (`kgMaxDepth` + `kgNeighborhoodLimit` + the structural
relation allow-list), NOT by a mid-query async timeout. A coarse measured-elapsed
guard (`kgTraversalTimeoutMs`, default `50`) MUST be checked between hops and/or
around the traversal call: if the bounded traversal nonetheless exceeds it, the
store MUST skip the multi-hop re-fuse for that query, return the complete direct-
lane result, and append a multi-hop degrade signal to `degradedFallback` (mirroring
the semantic-degrade signaling at `src/store/index.ts:1773`). Any traversal error
MUST degrade the same way rather than failing the surrounding retrieval.

#### Scenario: Deterministic ceiling bounds traversal work
- GIVEN a large graph with high-degree hubs reachable from the seeds
- WHEN traversal runs
- THEN the number of reached observations MUST be capped at `kgNeighborhoodLimit`
  and recursion MUST stop at `kgMaxDepth`, so traversal work is bounded
  independent of graph size

#### Scenario: Elapsed guard degrades to the direct result and signals it
- GIVEN traversal exceeds `kgTraversalTimeoutMs` for a query (or raises an error)
- WHEN `hybridRetrieve` completes
- THEN the multi-hop re-fuse MUST be skipped, the complete direct-lane ranked
  result MUST be returned, and `degradedFallback` MUST include a multi-hop degrade
  signal
- AND retrieval MUST NOT hard-fail

#### Scenario: Returned payload stays within existing output caps
- GIVEN a fully populated `kgNeighborhoodLimit`-sized neighborhood
- WHEN `hybridRetrieve` returns and downstream rendering applies the existing
  output caps (e.g. `mem_recall`/`mem_context` budgets)
- THEN the returned payload size MUST remain within those caps regardless of
  neighborhood size (constitution **P4**)

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-4 (RESOLVED — deterministic ceiling + coarse elapsed guard):** No
  achievable per-query async timeout exists for synchronous `better-sqlite3`;
  `kgTraversalTimeoutMs` is a measured-elapsed guard around the bounded traversal,
  and the deterministic cost ceiling is the primary bound. `db.interrupt()` /
  progress-handler is an OPTIONAL future hard-interrupt, not required here.
- **No schema migration (verified):** `queryKnowledgeMultiHopLane` reads only
  existing tables (`kg_triples`, `kg_entities`, `observations`) and existing
  indexes (`idx_kg_triples_subject`/`_object`/`_relation`/`_project`,
  `src/store/schema.ts:224-227`). It writes nothing, adds no table/column/index,
  and does not change the portable export/import format. `EXPLAIN QUERY PLAN`
  confirms both recursion directions and the `source_id` projection are
  index-driven at design; an additive `CREATE INDEX IF NOT EXISTS` is the only
  schema touch that could arise (possible design follow-up, not planned).
- **Filter reuse (code-grounded):** Traversal MUST reuse `appendObservationFilters`
  (the same helper `queryKnowledgeLane` uses, `src/store/index.ts:2052`) so the
  multi-hop projection honors `project`/`scope`/`session_id`/`topic_key`/`type`/
  `time_from`/`time_to` with identical semantics to the other lanes.
- **Placement (design decision):** Whether the re-fuse is a single combined
  `fuseCandidates` call or an enrich-then-cap step is a design decision; the
  observable requirement is that multi-hop observations can appear in the final
  ranked output bounded by `fusedLimit` and the output caps. This requirement may
  alternatively be folded into the retrieval delta if design finds that cleaner;
  it is placed here because the traversal query and its bounding are store
  capabilities.
