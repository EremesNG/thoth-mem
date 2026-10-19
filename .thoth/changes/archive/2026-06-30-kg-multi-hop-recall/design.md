# Design: Entity-Anchored Multi-Hop KG Recall (B2)

> Scope: B2 only — additive, flag-gated, bounded multi-hop traversal of the
> consolidated `kg_triples` graph, fused as a lower-weighted **sub-source** of the
> existing `kg` lane. **No** B3 (temporal/`SUPERSEDES`), **no** community
> summaries, **no** schema migration, **no** MCP/HTTP/CLI surface change. All six
> CLs are resolved as in-spec Assumptions (CL-1 sub-source; CL-2 weight `0.7`;
> CL-3 decay `0.5`; CL-4 deterministic ceiling + coarse elapsed guard, no async
> timeout; CL-5 default ON gated by the no-regression eval; CL-6 18 structural
> follow / 8 metadata exclude). The constitution principles cited are **P1**
> compact surface, **P2** deterministic/safe-degrade, **P3** harness-agnostic
> additive contract, **P4** bounded recall.

## Technical Approach

The knowledge graph is already built (B1: `kg_triples` + `kg_entities` written
synchronously and deterministically on every save) but never traversed. Today
`queryKnowledgeLane` (`src/store/index.ts:2023`) scores a triple only by lexical
overlap between *query terms* and the triple's own subject/object/relation, keyed
by the observation it was `EXTRACTED_FROM` (`t.source_id`). It never follows an
edge from one observation's entity to a *different* observation.

B2 adds a second, distinct KG query — `queryKnowledgeMultiHopLane` — that, given
the **seed observation ids** (the top fused hits already produced by
`hybridRetrieve`), resolves those seeds' entities, walks 1–`kgMaxDepth` hops
bidirectionally across the **structural** relation allow-list using a
`WITH RECURSIVE` CTE, projects the reached edges back to their `source_id`
observations (excluding the seeds), and emits each as a `kg`-lane candidate with
a new `source: 'kg_multi_hop'` discriminant, depth-attenuated score, and a
human-readable bridge path. These candidates are re-fused through the existing
`fuseCandidates`, so multi-hop evidence can introduce **new** observations into
the ranked output (not merely enrich existing hits), de-duplicated by
`observationId` with direct evidence winning. The whole feature is gated by
`kgMultiHopEnabled`; when off, `hybridRetrieve` is byte-identical to today.

The traversal is pure SQL (no model, no remote call → **P2** deterministic) and
bounded by `kgMaxDepth` + `kgNeighborhoodLimit` + relation filtering, with a
coarse measured-elapsed guard for pathological graphs (→ **P4**). Multi-hop is
never load-bearing: the direct lanes always produce a complete result on their
own, and any traversal error or cost-ceiling hit degrades per-query to today's
single-hop behavior with a `degradedFallback` signal.

## Architecture Decisions

### Decision: Recursive-CTE traversal (pure SQL), not application-side BFS

**Choice**: Implement neighborhood expansion as a single `WITH RECURSIVE` CTE over
`kg_triples` executed by `better-sqlite3`, rather than issuing N per-hop queries
and assembling the frontier in TypeScript.

**Alternatives considered**:
- *Application-side BFS* — one indexed query per frontier entity per hop, merged
  in JS. Simpler to read, but issues O(frontier) prepared-statement round trips
  per hop and re-implements cycle/visited bookkeeping in JS.
- *Materialized adjacency / closure table* — precompute reachability. Rejected:
  it is a schema migration (B2 is explicitly no-migration) and a write-path cost
  for a read-time feature.

**Rationale**: The graph already has the single-column entity indexes the
recursion needs (`idx_kg_triples_subject`/`_object`). A recursive CTE keeps the
frontier, depth counter, visited-set, and relation filter in one statement the
SQLite planner optimizes end-to-end, and `EXPLAIN QUERY PLAN` confirms both
recursion directions are index-driven (see the EXPLAIN decision below). It is
deterministic (**P2**) and avoids per-hop round-trip overhead. The CTE shape is
load-bearing — see the EXPLAIN decision for why the **two-explicit-direction
UNION** form is required over the naive `OR`-join form.

### Decision: Multi-hop is a `kg` sub-source, fused with dedup-direct-wins + depth attenuation (CL-1, CL-2, CL-3)

**Choice**: Multi-hop candidates keep `lane: 'kg'` and are distinguished only by a
new additive `source: 'kg_multi_hop'` member of the `LaneCandidate.source` union.
They are fused through the **existing** `fuseCandidates`, de-duplicated by
`observationId` via the existing `byObservation` grouping, with the direct
candidate winning primary-evidence selection. Their effective contribution is
strictly below direct KG (`0.9`) at `kgMultiHopWeight ≈ 0.7`, and each candidate's
raw score is depth-attenuated `confidence * kgDepthDecay^(depth-1)`
(`kgDepthDecay = 0.5`: depth-1 full, depth-2 half).

**Alternatives considered**:
- *Fifth `RetrievalLane`* (CL-1 alternative / proposal C-2) — first-class lane with
  its own `DEFAULT_LANE_ORDER`/`DEFAULT_LANE_WEIGHTS` entry. Rejected: it edits the
  "Hybrid Retrieval MUST Fuse Four Lanes" contract (`retrieval/spec.md:4`) and the
  lane enums, for telemetry cleanliness B2 does not need.
- *Apply the `0.7` weight as a lane weight* — impossible without a distinct lane,
  since `laneWeights` is keyed by `RetrievalLane` and multi-hop shares `lane:'kg'`.

**Rationale**: Sub-source preserves the four-lane contract verbatim and models
multi-hop as what it is — graph evidence at a lower trust tier. Because
`fuseCandidates` weights a hit by `candidate.score * laneWeights[lane]`
(`ranking.ts:85`) and multi-hop shares the `kg` lane weight (`0.9`), the lower
effective weight is achieved by **pre-scaling the candidate score** at emission
time: `emittedScore = confidence * kgDepthDecay^(depth-1) * (kgMultiHopWeight /
DEFAULT_LANE_WEIGHTS.kg)`. This makes the lower weight an observable property of
the candidate, requires **zero** change to `fuseCandidates`/`resolveLaneWeights`,
and keeps the dedup/primary-selection logic (which already prefers higher weighted
score, then lane order, `compareCandidates` `ranking.ts:97-112`) automatically
choosing a direct hit over a multi-hop hit for the same observation. See the
"Score formula" note under File Changes for the exact expression and its
guarantees.

### Decision: Flag-gating with graceful per-query degrade (CL-5, D-3, D-5)

**Choice**: A single boolean `kgMultiHopEnabled` (default `true`, gated on the
no-regression eval) gates the entire feature at the `hybridRetrieve` call site:
when false, no traversal query is issued and no candidate is emitted. When true
but the traversal throws or exceeds the elapsed guard, the multi-hop re-fuse is
skipped, the complete direct-lane result is returned, and a `'kg_multi_hop'`
signal is appended to `degradedFallback` (mirroring the `degradedFallback.push`
at `src/store/index.ts:1773`).

**Alternatives considered**:
- *No flag, always on* — rejected; CL-5 requires the flag as the rollback switch
  and the eval gate decides the shipped default.
- *Global degrade (whole retrieval fails)* — rejected; violates "Retrieval MUST
  Degrade by Lane, Not Globally" (`retrieval/spec.md:77`) and **P2**.

**Rationale**: The flag is the test-covered rollback path (eval asserts flag-off
== pre-B2 baseline), mirroring B1's `graphFactsSource` config-toggle discipline.
Per-query degrade keeps a pathological graph from ever breaking basic recall.

### Decision: Cost ceiling, not async timeout (CL-4, D-1/D-2/D-3/D-4)

**Choice**: Bound traversal **deterministically** by `kgMaxDepth` (recursion depth
guard `depth < kgMaxDepth`), `kgNeighborhoodLimit` (cap on reached observations,
applied in SQL `LIMIT` after ordering by attenuated score and re-asserted in
code), the structural relation allow-list (prunes the frontier), and a visited-set
cycle guard. Treat `kgTraversalTimeoutMs` (default `50`) as a **coarse
measured-elapsed guard around** the (already-bounded) call, not a mid-query
interrupt.

**Alternatives considered**:
- *`setTimeout`-based async timeout* — impossible: `better-sqlite3` is
  synchronous, so a JS timer cannot interrupt a running statement; the event loop
  is blocked for the statement's duration.
- *`db.interrupt()` + progress handler* — a real hard interrupt, but it is
  cross-cutting connection state and unnecessary once the deterministic ceiling
  bounds the work. Noted as an **optional future** hard-interrupt (CL-4), not in
  B2.

**Rationale**: With depth ≤ 2, a relation-filtered frontier, and a 50-observation
cap, the work is predictably small; the elapsed guard exists only to catch a
pathological outlier and degrade it. This is the only mechanism actually
achievable on a synchronous driver, and the spec records it as the resolution.

### Decision (design-owed a): Knob home — dedicated `knowledgeGraph` config block

**Choice**: Put the six multi-hop knobs (`kgMultiHopEnabled`, `kgMaxDepth`,
`kgNeighborhoodLimit`, `kgMultiHopWeight`, `kgDepthDecay`, `kgTraversalTimeoutMs`)
**plus** the `kgRelationAllowList` in a **new dedicated `knowledgeGraph` config
block**, a sibling of `kgLlm`/`retrievalDefaults` on `ThothConfig` — **not** in
`RetrievalDefaults`.

**Alternatives considered**:
- *Add to `RetrievalDefaults`* (`src/config.ts:7-13`) — rejected. `RetrievalDefaults`
  is **duplicated verbatim** in `src/retrieval/sqlite-vec.ts:10`
  (`DEFAULT_RETRIEVAL_DEFAULTS` defined in both files; `resolveRetrievalDefaults`
  lives in `sqlite-vec.ts`). Every field added there must be mirrored in two
  places or the copies silently drift — the explicit "duplication trap" the
  proposal flags. These knobs are also not retrieval *tuning defaults*; they are
  KG-traversal governance.

**Rationale**: A dedicated block follows the existing precedent set by `kgLlm`
(a sibling KG-scoped block resolved by its own `resolveKgLlmConfig` and validated
as a sibling object in `config.schema.json:130`). It sidesteps the duplication
trap entirely (one home, one resolver), groups all KG-traversal knobs together,
and matches how `config.schema.json` already nests cohesive feature config. The
typed surface is `knowledgeGraph?: KnowledgeGraphConfig` on `ThothConfig`, resolved
by a new `resolveKnowledgeGraphConfig(persisted)` called from `getConfig`
alongside `resolveKgLlmConfig` (`src/config.ts:431`).

### Decision (design-owed b): Re-fuse placement — single combined fuse pass

**Choice**: After the primary `fuseCandidates(...).slice(0, fusedLimit)`
(`src/store/index.ts:1797`) produces the seed set, run the multi-hop traversal
seeded by `fused.map(hit => hit.observation.id)`, then perform **one combined
re-fuse**: `fuseCandidates(allObservations, [...coreCandidates,
...multiHopCandidates], fusionOptions).slice(0, fusedLimit)`. The existing
graph-**enrichment** pass (`:1800-1817`, `queryKnowledgeLane(... includeUnmatched:
true)` over the fused ids) runs as today on the re-fused set.

**Alternatives considered**:
- *Enrich-then-cap* — append multi-hop candidates only as `byLane.kg` evidence on
  already-fused hits (like the current enrichment loop), never re-ranking.
  Rejected: that cannot introduce **new** observations into the output, which the
  retrieval delta explicitly requires ("multi-hop evidence can introduce NEW
  observations into the final ranked output").

**Rationale**: A single combined `fuseCandidates` call reuses the existing,
test-covered fusion + dedup-by-observation + primary-selection logic unchanged,
naturally lets a strong multi-hop reach enter the top-`fusedLimit`, and keeps the
direct-wins guarantee because `compareCandidates` already prefers the higher
weighted score. The combined candidate list must also fetch observation rows for
the **newly reached** ids (the current `observations` map only contains
core-candidate ids, `:1783-1791`); the re-fuse step extends the id set and
re-queries `observations` for the union before fusing. The output stays bounded by
the same `.slice(0, fusedLimit)` and the downstream Change-A output caps.

> **Ordering subtlety (must hold):** seeds are chosen from the *primary* fuse
> (direct lanes only), so the seed set is identical whether or not multi-hop later
> runs — multi-hop never changes which observations seed the traversal, only what
> is added afterward. This keeps seeding deterministic and flag-independent.

### Decision (design-owed c): EXPLAIN QUERY PLAN — both directions index-driven; CTE shape is load-bearing

**Choice / documented result**: Verified empirically against the current schema
(`kg_triples` + the five existing indexes, `src/store/schema.ts:224-228`) on a
populated in-memory DB (2,000 entities / 8,000 mixed-relation triples / 2,500
observations) after `ANALYZE`. Both recursion directions and the projection are
index-driven, **provided the CTE is written as a UNION of two explicit
directions** (subject→object arm and object→subject arm), with `frontier`
driving each join (`FROM frontier f JOIN kg_triples t ON ...`):

```
-- forward arm  (t.subject_entity_id = f.entity_id)
RECURSIVE STEP → SEARCH t USING INDEX idx_kg_triples_subject (subject_entity_id=?)
-- backward arm (t.object_entity_id = f.entity_id)
RECURSIVE STEP → SEARCH t USING INDEX idx_kg_triples_object  (object_entity_id=?)
-- projection (reached entities → observations), both sides
SEARCH t USING INDEX idx_kg_triples_subject/_object (…=?)
SEARCH o USING INTEGER PRIMARY KEY (rowid=?)
```

**Load-bearing finding — avoid the `OR`-join shape.** The naive single-arm form
`JOIN kg_triples t ON (t.subject_entity_id = f.entity_id OR t.object_entity_id =
f.entity_id)` does **not** use the entity indexes — the planner collapses it to
`SEARCH t USING INDEX idx_kg_triples_relation` (driven by the relation `IN (...)`
filter) and otherwise scans. The two-direction UNION form is therefore required
for index-driven recursion; this is a concrete implementation constraint for
`sdd-apply`, not a stylistic preference.

**Seed-entity resolution caveat (documented, accepted).** Resolving seeds'
entities via `SELECT … FROM kg_triples WHERE source_id IN (?,…)` **SCANS**
`kg_triples` — there is **no** index on `source_id` in the current schema. This
matches the existing `queryKnowledgeLane`, which already filters on
`o.id IN (...)` joined through `t.source_id` with no source index, so B2
introduces no new scan pattern. The scan is bounded (one pass, K ≈ `fusedLimit`
≈ 20 seeds, runs **once** before recursion) and well within the cost ceiling.
Per the proposal/spec, an additive `CREATE INDEX IF NOT EXISTS
idx_kg_triples_source ON kg_triples(source_id)` is the **only** schema touch that
could ever arise and is recorded as a **possible future follow-up**, deliberately
**not taken** in B2 (scope: no schema migration). If a later benchmark on a large
graph shows the seed scan dominating, that additive index is the remedy.

> Reproduction (throwaway, not committed): the verification used a standalone
> `better-sqlite3` script mirroring the schema; it was deleted after capturing the
> plans above. `sdd-apply` SHOULD add an `EXPLAIN QUERY PLAN` assertion test (see
> Testing Strategy) so the index coverage is regression-guarded in-repo.

## Data Flow

```mermaid
sequenceDiagram
    participant Caller as mem_recall / mem_context
    participant HR as hybridRetrieve (store/index.ts:1697)
    participant Lanes as direct lanes (sentence/chunk/lexical/kg)
    participant Fuse as fuseCandidates (ranking.ts:45)
    participant MH as queryKnowledgeMultiHopLane (NEW)
    participant DB as kg_triples / kg_entities / observations

    Caller->>HR: query + filters + limit
    HR->>Lanes: run direct lanes (unchanged)
    Lanes-->>HR: coreCandidates
    HR->>Fuse: fuse(coreCandidates).slice(0, fusedLimit)
    Fuse-->>HR: fused = seed hits

    alt kgMultiHopEnabled == true
        HR->>MH: seeds = fused ids, filters, caps
        MH->>DB: resolve seed entities (source_id IN seeds)
        loop depth 1..kgMaxDepth (WITH RECURSIVE, UNION two directions)
            MH->>DB: expand subject->object via idx_kg_triples_subject
            MH->>DB: expand object->subject via idx_kg_triples_object
            Note over MH: visited-set cycle guard; relation allow-list filter
        end
        MH->>DB: project reached entities -> source_id observations<br/>(exclude seeds, deleted_at IS NULL, appendObservationFilters)
        DB-->>MH: reached rows (≤ kgNeighborhoodLimit, ordered by attenuated score)
        MH-->>HR: kg_multi_hop candidates (depth-attenuated, pre-scaled, bridge path)
        alt elapsed <= kgTraversalTimeoutMs and no error
            HR->>HR: fetch observation rows for newly reached ids
            HR->>Fuse: re-fuse([...coreCandidates, ...multiHop]).slice(0, fusedLimit)
            Fuse-->>HR: ranked output (dedup by obs, direct wins)
        else elapsed > guard OR traversal error  (DEGRADE)
            HR->>HR: drop multi-hop; keep direct fused result
            HR->>HR: degradedFallback.push('kg_multi_hop')
        end
    else kgMultiHopEnabled == false  (DEGRADE / rollback)
        Note over HR: no traversal query issued — byte-identical to pre-B2
    end

    HR->>HR: graph-enrichment pass (:1800-1817, unchanged)
    HR-->>Caller: results (bounded by fusedLimit + Change-A output caps)
```

## File Changes

### `src/store/index.ts` — new `queryKnowledgeMultiHopLane` + `hybridRetrieve` integration

- **New private method `queryKnowledgeMultiHopLane`** (place adjacent to
  `queryKnowledgeLane`, after `:2113`). Signature:
  ```ts
  private queryKnowledgeMultiHopLane(input: {
    seedObservationIds: number[];
    filters?: RetrievalCandidateFilters;
    maxDepth: number;            // kgMaxDepth
    neighborhoodLimit: number;   // kgNeighborhoodLimit
    relationAllowList: string[]; // resolved structural allow-list
    multiHopWeight: number;      // kgMultiHopWeight (for pre-scaling)
    depthDecay: number;          // kgDepthDecay
  }): LaneCandidate[]
  ```
  Behavior:
  1. Guard: `if (seedObservationIds.length === 0 || relationAllowList.length === 0
     || maxDepth < 1) return [];` (empty allow-list fails safe to *no* traversal,
     never to following metadata edges — config delta requirement).
  2. **Seed-entity resolution**: `SELECT DISTINCT subject_entity_id,
     object_entity_id FROM kg_triples WHERE source_id IN (…seeds…) AND source_type
     = 'observation'` → the seed frontier entity-id set.
  3. **`WITH RECURSIVE` CTE** (two-direction UNION form — see EXPLAIN decision)
     with columns `(entity_id, depth, path)`:
     - base case: one row per seed entity, `depth = 1`, `path = ',<id>,'`.
     - forward arm: `FROM frontier f JOIN kg_triples t ON t.subject_entity_id =
       f.entity_id WHERE f.depth < :maxDepth AND t.relation IN (…allowList…) AND
       f.path NOT LIKE '%,'||t.object_entity_id||',%'` → next `entity_id =
       t.object_entity_id`, `depth = f.depth + 1`.
     - backward arm: symmetric on `t.object_entity_id = f.entity_id` → next
       `entity_id = t.subject_entity_id`.
     - The `path NOT LIKE` predicate is the **visited-set cycle guard** (D-4);
       combined with `depth < :maxDepth` (D-1) recursion always terminates.
  4. **Projection**: join the reached entity-ids back to triples and observations
     to recover bridged observations and the bridging triple's
     `relation`/`confidence`/`provenance` and the seed/bridge entity
     `canonical_name`s for the bridge-path text. Apply
     `appendObservationFilters(sql, params, input.filters)` (alias `o`) exactly as
     the other lanes do, plus `o.deleted_at IS NULL`, `t.source_type =
     'observation'`, and **exclude seeds** (`AND t.source_id NOT IN (…seeds…)`).
     Order by attenuated score DESC and apply `LIMIT :neighborhoodLimit` in SQL
     (D-2); re-assert the cap in code after mapping.
  5. **Emit** one `LaneCandidate` per reached observation (keep the
     min-depth/highest-confidence bridge if reached multiple ways):
     ```ts
     {
       lane: 'kg',
       observationId,
       score: confidence * Math.pow(depthDecay, depth - 1)
              * (multiHopWeight / DEFAULT_LANE_WEIGHTS.kg),  // pre-scale, see note
       source: 'kg_multi_hop',
       text: bridgePath,            // "<seed entity> →(<relation>)→ <bridge entity>"
       kg: { provenance, confidence, sourceType: 'observation' },
     }
     ```
  > **Score formula note.** `fuseCandidates` multiplies by `laneWeights['kg']`
  > (`= 0.9`) at `ranking.ts:85`. Pre-scaling by `(multiHopWeight /
  > DEFAULT_LANE_WEIGHTS.kg)` makes the *post-weight* contribution equal
  > `confidence * depthDecay^(depth-1) * multiHopWeight`, i.e. effective weight
  > `0.7` vs direct KG `0.9` and below the `1.0` semantic/lexical lanes (CL-2),
  > with depth-2 strictly below depth-1 (CL-3). Because direct candidates keep
  > their own (higher) weighted score, `compareCandidates` selects the direct
  > candidate as primary for a shared observation automatically (dedup-direct-wins,
  > no special case).

- **`hybridRetrieve` wiring** (at `:1797-1817`):
  - Read the resolved knobs from `this.config.knowledgeGraph` once near the top.
  - After `const fused = fuseCandidates(...).slice(0, fusedLimit)` (`:1797`), add a
    flag-gated block (illustrative):
    ```ts
    let refused = fused;
    if (kg.kgMultiHopEnabled && fused.length > 0) {
      const startedAt = Date.now();
      try {
        const multiHop = this.queryKnowledgeMultiHopLane({
          seedObservationIds: fused.map((h) => h.observation.id),
          filters,
          maxDepth: kg.kgMaxDepth,
          neighborhoodLimit: kg.kgNeighborhoodLimit,
          relationAllowList: kg.kgRelationAllowList,
          multiHopWeight: kg.kgMultiHopWeight,
          depthDecay: kg.kgDepthDecay,
        });
        if (multiHop.length > 0 && (Date.now() - startedAt) <= kg.kgTraversalTimeoutMs) {
          const combined = [...coreCandidates, ...multiHop];
          const newIds = multiHop
            .map((c) => c.observationId)
            .filter((id) => !observations.has(id));
          if (newIds.length > 0) {
            const extraRows = this.db.prepare(
              `SELECT * FROM observations WHERE deleted_at IS NULL
               AND id IN (${newIds.map(() => '?').join(',')})`
            ).all(...newIds) as ObservationRow[];
            for (const row of extraRows) observations.set(row.id, row);
          }
          refused = fuseCandidates(observations, combined, fusionOptions).slice(0, fusedLimit);
        } else if (multiHop.length > 0) {
          degradedFallback.push('kg_multi_hop'); // bounded query still too slow
        }
      } catch {
        degradedFallback.push('kg_multi_hop'); // any traversal error → degrade
      }
    }
    ```
  - Replace the subsequent uses of `fused` (the enrichment loop `:1800-1849` and
    the returned `results: fused`) with `refused`. **When the flag is off,
    `refused === fused` and every downstream line is unchanged → byte-identical
    output (D-5).** The seed set for the (unchanged) enrichment pass becomes the
    re-fused ids, which is correct: enrichment annotates the final ranked hits.

### `src/retrieval/ranking.ts` — additive `source` member only

- Extend the `LaneCandidate.source` union (`:22`) with `'kg_multi_hop'`:
  ```ts
  source: 'raw_query' | 'hyde_answer' | 'lexical_prefix' | 'kg_triples'
        | 'kg_multi_hop' | 'observation_facts';
  ```
- **No other change.** `RetrievalLane` (`:3`), `DEFAULT_LANE_ORDER` (`:4`),
  `DEFAULT_LANE_WEIGHTS` (`:5`), `fuseCandidates` (`:45`), `compareCandidates`
  (`:97`), and `resolveLaneWeights` (`:141`) are **untouched** — CL-1 sub-source
  keeps the four-lane contract and the dedup/primary logic intact, and the lower
  weight is carried by the pre-scaled candidate score (above).

### `src/config.ts` + `config.schema.json` — dedicated `knowledgeGraph` block

- New type + default in `src/config.ts`:
  ```ts
  export interface KnowledgeGraphConfig {
    kgMultiHopEnabled: boolean;     // default true
    kgMaxDepth: number;             // default 2
    kgNeighborhoodLimit: number;    // default 50
    kgMultiHopWeight: number;       // default 0.7
    kgDepthDecay: number;           // default 0.5
    kgTraversalTimeoutMs: number;   // default 50
    kgRelationAllowList: string[];  // default = 18 structural relations
  }
  const DEFAULT_KG_RELATION_ALLOW_LIST = [
    'USES','DEPENDS_ON','BELONGS_TO','PART_OF','OWNS','CONFIGURES','IMPLEMENTS',
    'RUNS_IN','DEPLOYS_TO','CAUSES','FIXES','BLOCKS','UNBLOCKS','AFFECTS',
    'REFERENCES','AUTHENTICATES_WITH','PRECEDES','FOLLOWS',
  ];
  const DEFAULT_KNOWLEDGE_GRAPH_CONFIG: KnowledgeGraphConfig = {
    kgMultiHopEnabled: true, kgMaxDepth: 2, kgNeighborhoodLimit: 50,
    kgMultiHopWeight: 0.7, kgDepthDecay: 0.5, kgTraversalTimeoutMs: 50,
    kgRelationAllowList: DEFAULT_KG_RELATION_ALLOW_LIST,
  };
  ```
- Add `knowledgeGraph?: KnowledgeGraphConfig` to `ThothConfig` (`:46-64`) and
  `knowledgeGraph?: Partial<...>` to `PersistedConfig` (`:70-88`).
- New `resolveKnowledgeGraphConfig(persisted)` mirroring `resolveKgLlmConfig`,
  applying **env > persisted > default** for each knob using the existing
  `parseBoolean` (`:174`) / `parseNumber` (`:167`) helpers:
  | Knob | Env | Parser |
  | --- | --- | --- |
  | `kgMultiHopEnabled` | `THOTH_KG_MULTI_HOP_ENABLED` | `parseBoolean` |
  | `kgMaxDepth` | `THOTH_KG_MAX_DEPTH` | `parseNumber` |
  | `kgNeighborhoodLimit` | `THOTH_KG_NEIGHBORHOOD_LIMIT` | `parseNumber` |
  | `kgMultiHopWeight` | `THOTH_KG_MULTI_HOP_WEIGHT` | `parseNumber` |
  | `kgDepthDecay` | `THOTH_KG_DEPTH_DECAY` | `parseNumber` |
  | `kgTraversalTimeoutMs` | `THOTH_KG_TRAVERSAL_TIMEOUT_MS` | `parseNumber` |
  | `kgRelationAllowList` | `THOTH_KG_RELATION_ALLOW_LIST` | new delimited parser |
  - **Relation allow-list parsing** (new small helper, e.g.
    `parseRelationAllowList`): split a comma/whitespace-delimited env string,
    uppercase + trim, intersect with `KG_RELATION_TYPES` (import the existing set
    from `src/indexing/kg-extractor.ts`) to drop unknowns; **if the result is
    empty, fall back to the built-in structural default — never to the metadata
    set** (fail-safe; config delta "empty or invalid fails safe"). The persisted
    value is an array, intersected the same way.
  - Call `resolveKnowledgeGraphConfig(persisted)` from `getConfig` (`:431` area)
    and add `knowledgeGraph` to the returned object (`:435-454`).
- `config.schema.json`: add a sibling `knowledgeGraph` object (peer of `kgLlm`
  `:130`) with `additionalProperties:false` and typed/bounded fields:
  `kgMultiHopEnabled` boolean; `kgMaxDepth` integer `minimum:1`;
  `kgNeighborhoodLimit` integer `minimum:1`; `kgMultiHopWeight` number
  `minimum:0`; `kgDepthDecay` number `exclusiveMinimum:0,maximum:1`;
  `kgTraversalTimeoutMs` integer `minimum:0`; `kgRelationAllowList` array of
  strings (`enum` = the 26 `KG_RELATION_TYPES`, `uniqueItems:true`).

### `src/evals/retrieval.ts` — shared-entity recall case + no-regression gate

- **Multi-hop fixture**: add a fixture whose answer observation has **no** direct
  lexical/semantic overlap with the query, and a seed-matching observation that
  shares a structural entity with it. Seed the bridge via the existing
  `seedGraphFactTriple` helper (`:325`) — same `tripleHash`-keyed insert the
  `graph-lite`/`graph-rank` cases use (`:734-760`) — with a `DEPENDS_ON` triple
  whose subject entity also appears on a triple from the answer observation, so
  traversal follows it. **No** `observation_facts` insert (B1-consistent).
- **Depth-2 sub-case** (SHOULD): a second bridge one hop further, asserting its
  reached candidate scores below an otherwise-equal depth-1 reach.
- **Distractor**: an observation connected to the seed only by an excluded
  metadata relation (`HAS_TOPIC` or `MENTIONS`), asserting it is **not** surfaced
  as a multi-hop reach (allow-list applied).
- **Flag toggling**: the harness already builds a runtime and calls
  `hybridRetrieve` (`:668-723`). Run the multi-hop cases once with
  `kgMultiHopEnabled = true` and once with `false` (toggle via the store's
  resolved config / runtime input — no MCP/HTTP/CLI change). Assert: ON → answer
  surfaces with `lane:'kg'` / `source:'kg_multi_hop'`; OFF → answer not surfaced
  via multi-hop, no error.
- **No-regression gate** (CL-5): run the **existing** fixtures with the flag OFF
  (baseline) and ON, asserting per case that every OFF pass still passes ON and no
  expected observation drops to a worse rank ON than OFF (per-case criterion, not
  an aggregate). Surface this as the gate that decides the shipped default.

### `src/store/schema.ts` — **verify only, no DDL change**

No schema change. The five existing indexes
(`idx_kg_triples_subject`/`_object`/`_relation`/`_project`/`_topic`, `:224-228`)
plus the `kg_entities` PK and `observations` PK cover the traversal per the EXPLAIN
results. The optional additive `idx_kg_triples_source` is a documented future
follow-up only (see EXPLAIN decision), deliberately not taken here.

## Interfaces / Contracts

- **Public contract: unchanged.** No MCP tool, HTTP route, or CLI command added or
  changed (**P1/P3**). The compact six-tool surface is untouched.
- **Typed surface: one additive change** — `LaneCandidate.source` gains
  `'kg_multi_hop'` (additive union member; no consumer that switches on `source`
  breaks — they special-case only `'observation_facts'`).
- **Config surface: additive** — a new optional `knowledgeGraph` block + six
  `THOTH_KG_*` env vars + one relation-allow-list env var; absent config resolves
  to the documented defaults.
- **`hybridRetrieve` return type: unchanged** — still
  `{ defaults, laneOrder, degradedFallback, lexicalQuery, scoreFromDistance,
  semanticInputs, results, pending }`; `degradedFallback` may now contain the
  additional string `'kg_multi_hop'`.

## Testing Strategy

All tests use vitest + in-memory SQLite (`new Store(':memory:')`), run by
`pnpm test`.

1. **Traversal unit tests** (`tests/store/` — new file e.g.
   `kg-multi-hop.test.ts`), exercising `queryKnowledgeMultiHopLane` directly via a
   small seeded graph (reuse the `seedGraphFactTriple`-style insert):
   - 2-hop neighbor via a shared entity **is** surfaced; seed itself is **not**.
   - bidirectional reach: seed entity on the **object** side still reaches the
     subject-side neighbor.
   - excluded metadata relation (`HAS_TOPIC`/`MENTIONS`/`EXTRACTED_FROM`) does
     **not** extend the frontier.
   - cycle (`X →USES→ Y`, `Y →USES→ X`) terminates, no duplicate/infinite
     recursion, respects `kgMaxDepth`.
   - depth guard: a depth-3 observation is **not** returned at `kgMaxDepth = 2`.
   - neighborhood cap: a hub reaching > `kgNeighborhoodLimit` observations returns
     exactly the cap, top-scored.
   - `appendObservationFilters` honored (project/scope/topic_key/type/time window).
   - each reached observation carries `depth`, KG provenance/confidence, and a
     bridge-path `text`.
2. **Fusion/ranking tests** (extend `tests/store/index.test.ts` or a focused
   retrieval test):
   - multi-hop introduces a **new** observation into the fused output
     (`lane:'kg'`, `source:'kg_multi_hop'`).
   - **dedup-direct-wins**: an observation reached both directly and via multi-hop
     appears once, primary evidence is the direct candidate, and its rank is not
     lowered.
   - **depth-decay ordering**: equal-confidence depth-1 vs depth-2 reaches → depth-1
     ranks above depth-2; depth-1 effective score `= confidence * 0.7/0.9 * 0.9 =
     confidence * 0.7`, depth-2 `= confidence * 0.5 * 0.7`.
   - multi-hop effective contribution `< 0.9 * score` of an otherwise-equal direct
     KG hit.
3. **Degrade / flag-off** (retrieval test):
   - `kgMultiHopEnabled = false` → ranked output **byte-identical** to a run
     without the feature (snapshot/structural-equality assertion against the
     pre-B2 result for the same fixture), and **no** traversal query issued
     (assert via a spy/counter or by absence of `kg_multi_hop` candidates).
   - forced degrade (e.g. `kgTraversalTimeoutMs = 0` with a non-empty
     neighborhood) → complete direct result returned, `degradedFallback` contains
     `'kg_multi_hop'`, no throw.
   - empty neighborhood (no shared entities) → direct result unchanged, no error.
4. **Config tests** (extend `tests/config.test.ts`, mirroring the
   `graphFactsSource`/`kgLlm` cases at `:99`/`:202`):
   - defaults when unset everywhere (`kgMultiHopEnabled true`, `kgMaxDepth 2`,
     `kgNeighborhoodLimit 50`, `kgMultiHopWeight 0.7`, `kgDepthDecay 0.5`,
     `kgTraversalTimeoutMs 50`, allow-list = 18 structural).
   - env overrides win over persisted for each knob.
   - persisted used when env unset.
   - relation allow-list: env delimited list parsed/intersected; empty/invalid
     falls back to the structural default (never the metadata set).
   - `config.schema.json` validation accepts the `knowledgeGraph` block (extend
     the existing schema round-trip test).
5. **EXPLAIN QUERY PLAN coverage assertion** (in the traversal unit test, if
   feasible): run `EXPLAIN QUERY PLAN` on the recursive CTE and the projection
   against the in-memory schema and assert the output contains
   `idx_kg_triples_subject` and `idx_kg_triples_object` (and does **not** contain a
   bare `SCAN kg_triples` in the recursive step), regression-guarding the
   load-bearing CTE shape.
6. **Evals** (`src/evals/retrieval.ts`, run via the eval entrypoint /
   `eval:retrieval`): the shared-entity recall case and the no-regression gate
   above; confirm existing retrieval/KG eval fixtures still pass with the flag ON.

## Migration / Rollout

- **Versioning: MINOR.** Additive feature behind a default-safe, reversible flag;
  no public-contract break, no schema migration (**P3** additive).
- **Default ON, eval-gated (CL-5).** Ships enabled **iff** the no-regression eval
  is GREEN; if a regression is observed the documented default flips to `false`
  until weights/filters are tuned (the gate decides the shipped default, recorded
  in the evals delta).
- **Rollback = `kgMultiHopEnabled = false`** (config or
  `THOTH_KG_MULTI_HOP_ENABLED=false`) — restores exact pre-B2 single-hop behavior
  with no code revert, test-covered by the flag-off no-regression assertion
  (mirrors B1's `graphFactsSource` toggle discipline).
- **Auto-degrade** per-query on traversal error or elapsed-guard breach, signaled
  in `degradedFallback`, so a pathological graph never needs operator action.
- **Clean code revert** — no schema, no public surface; reverting the commit
  removes the traversal, the additive `source` member, and the `knowledgeGraph`
  block with no data migration.

## Open Questions

None blocking. All six CLs are resolved in-spec. Items intentionally deferred (not
B2 scope), recorded for `sdd-tasks` awareness:

- **Optional `idx_kg_triples_source`** — possible additive index if a large-graph
  benchmark shows the once-per-query seed-entity scan dominating. Not taken in B2
  (no-migration scope); documented as a future follow-up.
- **SQLite `db.interrupt()` / progress handler** — optional hard mid-query
  interrupt; unnecessary given the deterministic ceiling, deferred per CL-4.
- **B3 / Change C** — temporal/`SUPERSEDES` edges and community summaries remain
  out of scope.

## Constitution Check (self-review)

- **P1 (compact surface)** — PASS: no MCP tool added/removed; six-tool surface
  intact.
- **P2 (deterministic-first, safe degradation)** — PASS: traversal is pure SQL, no
  model/remote; flag-off and cost-bound paths degrade to the complete direct-lane
  result without hard failure.
- **P3 (harness-agnostic, additive contract)** — PASS: MINOR; only additive typed
  + config surface; no HTTP/CLI/schema change.
- **P4 (bounded recall)** — PASS: `kgMaxDepth` + `kgNeighborhoodLimit` + relation
  filtering bound traversal; output flows through the existing `fusedLimit` and
  Change-A output caps.
- **Delegate-first / read-only boundaries / governed persistence** — N/A to this
  retrieval-engine change; design persisted to OpenSpec files only.

No principle is violated; finalization is not blocked.
