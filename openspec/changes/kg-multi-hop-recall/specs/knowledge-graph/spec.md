# Delta for Knowledge Graph

## ADDED Requirements

### Requirement: Entity-Anchored Multi-Hop Traversal MUST Surface Observations Reachable Through Shared Entities
The system MUST provide an entity-anchored multi-hop traversal over the
consolidated knowledge graph (`kg_triples` joined to `kg_entities`) that, given a
set of seed observation ids, returns the OTHER observations reachable within a
bounded number of hops across shared entities. Traversal MUST:

- Resolve each seed observation's entities — the `kg_entities` referenced by the
  `kg_triples` whose `source_id` is a seed observation
  (`subject_entity_id`/`object_entity_id`).
- Expand via a `WITH RECURSIVE` CTE over `kg_triples`, following edges from a
  frontier entity to adjacent entities BIDIRECTIONALLY (subject→object and
  object→subject), from depth `1` up to `kgMaxDepth` (default `2`) hops.
- Project the reached edges back to their `source_id` observations
  (`source_type = 'observation'`, joined `observations.deleted_at IS NULL`),
  EXCLUDING the seed observation ids themselves, and apply the same observation
  filters (`project`/`scope`/`session_id`/`topic_key`/`type`/`time_from`/
  `time_to`) the other retrieval lanes apply.

Traversal MUST be deterministic — pure SQL over the persisted graph, requiring no
embedding model and no remote service (constitution **P2**) — and bounded
(constitution **P4**, see "Multi-Hop Traversal MUST Be Bounded"). It builds on
"`kg_triples` MUST Be the Single Source of Graph-Derived Facts" and "KG Evidence
MUST Participate in Fused Retrieval Ranking"; it adds no new entity or relation
types.

#### Scenario: Two-hop neighbor is surfaced via a shared entity
- GIVEN a seed observation A whose entity `auth-service` is also the subject of a
  triple `auth-service →(DEPENDS_ON)→ token-store` extracted from a DIFFERENT
  observation B, and B has no direct lexical or semantic overlap with the query
- WHEN entity-anchored traversal runs seeded by A within `kgMaxDepth` hops
- THEN observation B MUST be returned as a reached (multi-hop) observation
- AND seed observation A MUST NOT be returned among the reached observations

#### Scenario: Traversal is bidirectional across the edge direction
- GIVEN a triple `payments →(DEPENDS_ON)→ ledger` where `ledger` is a seed
  observation's entity (appearing on the OBJECT side) and `payments` is the
  subject of a triple from another observation
- WHEN traversal expands from the seed entity `ledger`
- THEN it MUST follow the edge from the object side to the subject entity
  `payments` and reach that observation, not only edges where the seed entity is
  the subject

#### Scenario: Depth is recorded so closer evidence is distinguishable
- GIVEN an observation reachable in exactly one hop and another reachable only in
  two hops from the same seed
- WHEN traversal returns reached observations
- THEN each reached observation MUST carry the hop `depth` at which it was first
  reached (`1` for direct-neighbor, `2` for two-hop)

### Requirement: Multi-Hop Traversal MUST Follow Only the Configured Structural Relation Allow-List
Traversal MUST follow only the relations in a configurable STRUCTURAL allow-list
and MUST NOT traverse metadata/synthetic/low-signal relations. By default the
allow-list contains the 18 structural relations
(`USES`, `DEPENDS_ON`, `BELONGS_TO`, `PART_OF`, `OWNS`, `CONFIGURES`,
`IMPLEMENTS`, `RUNS_IN`, `DEPLOYS_TO`, `CAUSES`, `FIXES`, `BLOCKS`, `UNBLOCKS`,
`AFFECTS`, `REFERENCES`, `AUTHENTICATES_WITH`, `PRECEDES`, `FOLLOWS`) and EXCLUDES
the 8 metadata/synthetic relations
(`HAS_WHAT`, `HAS_WHY`, `HAS_WHERE`, `HAS_LEARNED`, `HAS_TOPIC`, `HAS_SCOPE`,
`MENTIONS`, `EXTRACTED_FROM`). The set is expressed as an allow-list (fail-safe to
fewer edges), and the CTE MUST filter the recursion step by it so excluded
relations never extend the frontier. The default allow-list ∪ exclude-list MUST
cover exactly the 26 `KG_RELATION_TYPES` (`src/indexing/kg-extractor.ts:11-15`).

#### Scenario: Structural relation extends the frontier
- GIVEN a seed entity connected to another entity by a `DEPENDS_ON` triple
- WHEN traversal expands and `DEPENDS_ON` is in the active allow-list
- THEN the adjacent entity MUST be reached and its source observation projected

#### Scenario: Metadata relation does not extend the frontier
- GIVEN a seed entity connected to other observations only by excluded relations
  (`HAS_WHAT`/`HAS_TOPIC`/`HAS_SCOPE`/`MENTIONS`/`EXTRACTED_FROM`)
- WHEN traversal expands
- THEN those edges MUST NOT be followed and MUST NOT contribute reached
  observations, so high-degree metadata hubs cannot manufacture neighbors

#### Scenario: Allow-list is configurable without code change
- GIVEN the relation allow-list is reconfigured (per the config delta) to remove a
  relation that is in the default set
- WHEN traversal runs
- THEN edges of the removed relation MUST NOT be followed, matching the configured
  allow-list rather than the hard-coded default

### Requirement: Multi-Hop Traversal MUST Be Cycle-Guarded and Bounded
The traversal MUST terminate and MUST NOT explode the result set regardless of
graph shape. It MUST:

- Carry a `depth < kgMaxDepth` guard in the recursive CTE so recursion stops at
  the configured depth (default `2`).
- Track a visited set of entity ids (e.g. a delimited path string or a visited
  CTE) so cycles in the graph cannot cause unbounded recursion independent of the
  depth guard.
- Cap the number of reached observations at `kgNeighborhoodLimit` (default `50`),
  applied in SQL (`LIMIT`) and/or in code after ordering by attenuated score, so a
  high-degree hub entity cannot fan the neighborhood out without bound.

#### Scenario: Cycle does not loop
- GIVEN a cyclic subgraph (e.g. `X →(USES)→ Y`, `Y →(USES)→ X`) reachable from a
  seed entity
- WHEN traversal expands across that cycle
- THEN traversal MUST terminate without revisiting an already-visited entity and
  MUST NOT recurse beyond `kgMaxDepth`

#### Scenario: Depth guard stops expansion at the configured depth
- GIVEN `kgMaxDepth = 2` and an observation reachable only at depth `3`
- WHEN traversal runs
- THEN that depth-3 observation MUST NOT be returned

#### Scenario: Neighborhood cap bounds a hub
- GIVEN a hub entity whose structural edges reach more than `kgNeighborhoodLimit`
  distinct observations
- WHEN traversal runs with `kgNeighborhoodLimit = 50`
- THEN at most `50` reached observations MUST be returned, selected by attenuated
  score order, and the traversal MUST NOT return the full unbounded set

### Requirement: Multi-Hop Evidence MUST Carry KG Provenance, Confidence, and a Bridge Path
Each reached observation MUST be emitted as graph evidence that is DISTINCT from
direct (`source_id`-keyed) KG facts. The evidence MUST carry KG provenance and
confidence drawn from the bridging triple(s) and a human-readable bridge-path text
for evidence display (e.g. `"<seed entity> →(<relation>)→ <bridge entity>"`).
Direct KG facts MUST keep their existing direct discriminant unchanged; multi-hop
evidence MUST be separately identifiable as multi-hop (see the retrieval delta's
`kg_multi_hop` source).

#### Scenario: Reached observation carries bridge-path evidence
- GIVEN observation B reached from seed A via `A.entity →(DEPENDS_ON)→ B.entity`
- WHEN the multi-hop evidence for B is produced
- THEN it MUST include KG provenance and confidence from the bridging triple
- AND it MUST include a bridge-path text naming the seed entity, the relation, and
  the bridge entity

#### Scenario: Multi-hop evidence is distinguishable from direct KG facts
- GIVEN the same observation is reached both as a direct `source_id`-keyed KG fact
  and via multi-hop traversal
- WHEN both pieces of evidence are emitted
- THEN the direct fact MUST retain its direct discriminant
- AND the multi-hop evidence MUST be separately identifiable as multi-hop, not
  relabeled as a direct fact

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-1 (RESOLVED — kg SUB-SOURCE, not a fifth lane):** Multi-hop evidence keeps
  `lane: 'kg'` and is distinguished by a new `source` discriminant
  (`'kg_multi_hop'`, see the retrieval delta). This preserves the retrieval
  spec's "Hybrid Retrieval MUST Fuse Four Lanes" requirement verbatim. The
  fifth-lane alternative (extend `RetrievalLane`/`DEFAULT_LANE_ORDER`/weights) is
  explicitly NOT adopted.
- **CL-6 (RESOLVED — structural allow-list, 18 follow / 8 exclude):** Traversal
  follows the 18 structural relations and excludes the 8 metadata/synthetic
  relations, enumerated above against the actual `KG_RELATION_TYPES`
  (`src/indexing/kg-extractor.ts:11-15`). `REFERENCES` is on the FOLLOW side and
  `MENTIONS` on the EXCLUDE side (lower-confidence). The split is expressed as a
  configurable allow-list (fail-safe to fewer edges).
- **Relation-enum reconciliation (code-grounded):** `IN_PROJECT`, `HAS_TYPE`, and
  `HAS_TOPIC_KEY` named in the orchestrator's CL-6 prose are NOT members of
  `KG_RELATION_TYPES`; they are SYNTHESIZED by the B1 `getObservationFactsFromKg`
  adapter from observation columns and are never stored as `kg_triples` rows, so
  there is nothing to exclude for them in the traversal. The real excluded
  metadata relations are `HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED`/
  `HAS_TOPIC`/`HAS_SCOPE`/`MENTIONS`/`EXTRACTED_FROM` (8), and the 18 follow + 8
  exclude partition the full 26-relation enum exactly.
- **Seed source (forward reference):** Seed observation ids are the top fused hits
  produced by `hybridRetrieve` after its primary fuse; the seeding contract is
  specified in the retrieval delta. This delta specifies traversal behavior given
  seeds, independent of how seeds are chosen.
- **No schema migration:** Traversal reads only existing tables/indexes
  (`kg_triples`, `kg_entities`, and `idx_kg_triples_subject`/`_object`/
  `_relation`/`_project`, `src/store/schema.ts:224-227`). It adds no table,
  column, or index. Index coverage for both recursion directions is confirmed at
  design via `EXPLAIN QUERY PLAN`; an additive `CREATE INDEX IF NOT EXISTS` is the
  only schema touch that could ever arise and is a possible design follow-up, not
  a planned change.
