# Proposal: Entity-Anchored Multi-Hop KG Recall

> **Sub-change B2 of the Change B (graph evolution) program.** The program is
> sequenced B1 → B2 → B3:
> - **B1 (DONE, archived `2026-06-30-graph-lite-consolidation`)** — Graph-lite
>   consolidation: `kg_triples` (+`kg_entities`) is now the **single** source of
>   graph facts; `observation_facts` is gone; `getObservationFactsFromKg` adapter
>   exists; a deterministic `kg_triples` write happens **synchronously** on save.
> - **B2 (this change)** — Entity-anchored multi-hop recall: traverse the
>   already-built graph (`WITH RECURSIVE` over `kg_triples`/`kg_entities`, 1–2
>   hops) to surface observations that share entities with a seed hit, fused as a
>   new, lower-weighted retrieval source behind a feature flag.
> - **B3 (FUTURE)** — Bi-temporal / supersedes edges
>   (`SUPERSEDES`/`CONTRADICTS`/`REPLACES`, point-in-time queries). Referenced
>   only; OUT OF SCOPE here.
> - **Change C (FUTURE)** — Community summaries (Leiden / LazyGraphRAG) and
>   consolidation/decay. Referenced only; OUT OF SCOPE here.
>
> B2 builds directly on B1's clean foundation: a single, deterministically-written
> triple store with the entity-id indexes traversal needs.

## Intent

The knowledge graph is **built but not traversed**. Per the validated discovery
finding (`review/thoth-mem/graph-gap`, REV3): thoth-mem has a rich taxonomy
(`kg_entities` + `kg_triples`; 27 entity types, 26 relations) populated
deterministically on every save, **but it is used only as a flat, post-fusion
enrichment lane** — there is no multi-hop traversal and no neighborhood
expansion. Today `queryKnowledgeLane` (`src/store/index.ts:2023-2113`) joins
`kg_triples` to `kg_entities` and scores a triple **only** by lexical overlap
between the *query terms* and the triple's own subject/object/relation names,
keyed by the observation the triple was `EXTRACTED_FROM` (`t.source_id`). It
never follows an edge from one observation's entity to a *different*
observation. The graph's structural value — "B was caused by the same root
component as A", "these three observations all touch the same service" — is
inert.

This is the single biggest unexploited opportunity identified in the review and
the explicit motivation for sequencing B1 first: B1 removed the parallel
`observation_facts` store precisely so traversal would have **one** edge set to
walk.

**What B2 adds:** from the entities of a strong seed hit (the top fused
results), expand 1–2 hops across shared entities via `kg_triples` using a
`WITH RECURSIVE` CTE, collect the `source_id` observations reachable through
those edges, and fuse them as a **new, distinctly-sourced, lower-weighted**
retrieval signal. Multi-hop evidence is structurally relevant but noisier than a
direct lexical/semantic/KG match, so it earns a lower lane weight and (proposed)
depth attenuation, and it is fully bounded and feature-flagged so the current
behavior is the guaranteed fallback.

This honors the product mission (exploit the graph that is built) while
respecting constitution **P2** (deterministic-first, safe degradation — the CTE
is pure SQL, no model required) and **P4** (bounded, token-efficient recall —
hard neighborhood + depth + timeout caps, results still flow through the
Change A output caps downstream).

## Scope

> Scope is authoritative and encoded faithfully below. The single objective is to
> make the existing graph **traversable** as an additive, bounded, flag-gated
> retrieval signal — with **zero** change to the public contract and a guaranteed
> fall-back to today's single-hop behavior.

### In Scope

#### A. Multi-hop traversal query over `kg_triples`

- **A-1. Add a recursive neighborhood traversal** (working name
  `queryKnowledgeMultiHopLane`) in `src/store/index.ts`, adjacent to
  `queryKnowledgeLane` (`:2023`). Given a set of **seed observation ids** (the
  top fused hits) it MUST:
  1. Resolve the seed observations' entities — the `kg_entities` referenced by
     `kg_triples` whose `source_id` is a seed observation
     (`subject_entity_id`/`object_entity_id`).
  2. Expand via a `WITH RECURSIVE` CTE over `kg_triples`: from a frontier entity,
     follow edges to adjacent entities (subject↔object, **bidirectional**),
     tracking `depth` and a visited set, up to `kgMaxDepth` (default `2`).
  3. Project the reached edges back to their `source_id` observations
     (`source_type = 'observation'`, `deleted_at IS NULL`), **excluding the seed
     observation ids themselves** (those are already in the fused set), and apply
     the same `appendObservationFilters` (`project`/`scope`/`session_id`/
     `topic_key`/`type`/`time_from`/`time_to`) used by the other lanes.
- **A-2. Emit a distinctly-sourced candidate.** Each reached observation
  produces a `LaneCandidate` whose `source` is a **new** discriminant
  `'kg_multi_hop'` (see C-1), carrying `kg` provenance/confidence and a
  bridge-path text (e.g. `"<seed entity> →(<relation>)→ <bridge entity>"`) for
  evidence display. **Direct (1-hop / `source_id`-keyed) KG candidates keep
  `source: 'kg_triples'` unchanged.**
- **A-3. Score with depth attenuation.** Base the candidate score on the
  bridging triples' `confidence`, multiplied by a per-hop attenuation factor so
  depth-2 evidence scores strictly below depth-1 (proposed
  `confidence * kgDepthDecay^(depth-1)`, `kgDepthDecay ≈ 0.5`; see CL-2/CL-3).

#### B. Integrate as a bounded retrieval signal in fusion

- **B-1. Wire into `hybridRetrieve`** (`src/store/index.ts:1697-...`). After the
  primary `fuseCandidates(...).slice(0, fusedLimit)` step (`:1797`) produces the
  ranked seed set — and **alongside** the existing graph-enrichment pass
  (`:1800-1817`) — run `queryKnowledgeMultiHopLane` seeded by
  `fused.map(hit => hit.observation.id)`, then **re-fuse** so multi-hop
  candidates can introduce *new* observations into the result set (not only
  enrich existing hits). The exact placement (single re-fuse vs. enrich-then-cap)
  is a design decision; the requirement is that multi-hop observations can appear
  in the final ranked output, bounded by the same `fusedLimit`/output caps.
- **B-2. Fuse via `fuseCandidates`** (`src/retrieval/ranking.ts:45`) with the
  multi-hop source de-duplicated against direct hits **by `observationId`** (the
  existing `byObservation` grouping). When the same observation is reached both
  directly and via multi-hop, the direct candidate MUST win the primary-evidence
  selection (the multi-hop candidate is additive enrichment, never a downgrade).
- **B-3. Multi-hop is a SOURCE of the existing `kg` lane, not a 5th lane**
  (proposed default — see CL-1). It keeps `lane: 'kg'` so the spec's "Hybrid
  Retrieval MUST Fuse Four Lanes" requirement
  (`openspec/specs/retrieval/spec.md:4`) is preserved unchanged, but uses a
  **lower effective weight than direct KG**. Mechanism: weight the multi-hop
  candidate's contribution below direct-KG (direct `kg = 0.9`; propose multi-hop
  effective `~0.7`) via either a source-aware weight or a pre-scaled candidate
  score (design decides; the observable requirement is the lower weight).

#### C. Ranking / type surface

- **C-1. Extend the `LaneCandidate.source` union** (`src/retrieval/ranking.ts:22`)
  with `'kg_multi_hop'`. This is additive to a TypeScript union; no consumer
  that switches on `source` breaks (they currently special-case only
  `'observation_facts'`, which B1 already neutralized).
- **C-2. If CL-1 resolves to "fifth lane"** instead of B-3's "kg sub-source",
  then additionally extend `RetrievalLane` (`ranking.ts:3`), `DEFAULT_LANE_ORDER`
  (`:4`), `DEFAULT_LANE_WEIGHTS` (`:5`), and `resolveLaneWeights` (`:141`) with a
  `kg_multi_hop` lane at weight `~0.7`. **Recommended default is B-3 (sub-source),
  so C-2 is the documented alternative, not the planned path.**

#### D. Budgets, guards, and graceful degradation

- **D-1. Depth cap.** `kgMaxDepth` (default `2`) bounds CTE recursion; the CTE
  MUST carry a `depth < kgMaxDepth` guard.
- **D-2. Neighborhood cap.** `kgNeighborhoodLimit` (default `50`) bounds the
  number of reached observations (and SHOULD bound intermediate frontier size) so
  a hub entity cannot explode the result set. Applied in-SQL (`LIMIT`) and/or
  in-code after ordering by attenuated score.
- **D-3. Per-query traversal timeout.** A traversal budget (default `~50ms`)
  bounds wall-clock cost. On timeout the traversal MUST **degrade to the current
  behavior** (return no multi-hop candidates; the direct lanes already produced a
  complete result) and MUST signal the degradation in `degradedFallback`
  (mirroring the existing semantic-degrade signaling at
  `src/store/index.ts:1773`). **Implementation note for design:** `better-sqlite3`
  is synchronous, so a JS timer cannot interrupt a running statement;
  enforcement options to evaluate at design time include
  `db.prepare(...).bind(...)` with a SQLite progress handler / `interrupt()`,
  pre-bounding via `kgNeighborhoodLimit` + `kgMaxDepth` (deterministic cost
  ceiling), and/or measuring elapsed time around the call and skipping the
  re-fuse if exceeded. CL-4 records the chosen mechanism.
- **D-4. Cycle guard.** The CTE MUST track a visited set (visited entity ids,
  e.g. a delimited path string or a `UNION` over a visited CTE) so cycles in the
  graph cannot cause infinite recursion independent of the depth cap.
- **D-5. Feature flag.** A config flag (working name `kgMultiHopEnabled`)
  gates the entire feature. When disabled, `hybridRetrieve` runs **exactly** as
  today (no traversal query issued, no candidates emitted, identical ranking).
  This is the rollback switch (see Rollback Plan). **Default value is
  [NEEDS CLARIFICATION] — see CL-5.**

#### E. Config knobs

- **E-1. Add the traversal knobs to config** (`src/config.ts` +
  `config.schema.json`): `kgMultiHopEnabled` (boolean), `kgMaxDepth` (default
  `2`), `kgNeighborhoodLimit` (default `50`), `kgTraversalTimeoutMs` (default
  `50`), and `kgDepthDecay` (default `0.5`), plus the relation-filter setting
  from CL-6. Follow the **existing resolution pattern**: a typed block resolved
  in `getConfig` with env overrides (`THOTH_KG_MULTI_HOP_ENABLED`,
  `THOTH_KG_MAX_DEPTH`, `THOTH_KG_NEIGHBORHOOD_LIMIT`,
  `THOTH_KG_TRAVERSAL_TIMEOUT_MS`, `THOTH_KG_DEPTH_DECAY`) parsed via the existing
  `parseBoolean`/`parseNumber` helpers, mirroring how `graphFactsSource`
  (`src/config.ts:446`) and the `retrievalDefaults`/`kgLlm` blocks resolve. These
  knobs live most naturally either inside `RetrievalDefaults`
  (`src/config.ts:7-13`, **duplicated** in `src/retrieval/sqlite-vec.ts:10`) or in
  a new dedicated `knowledgeGraph` config block (design decides; **note the
  `RetrievalDefaults` duplication so both copies stay in sync**, as B1 did).

#### F. Evals

- **F-1. Add a multi-hop retrieval eval** (`src/evals/retrieval.ts`) with a
  fixture where the **answer observation is reachable only via a shared entity**
  (no direct lexical/semantic overlap with the query), asserting it surfaces with
  multi-hop **enabled** and does **not** surface (no regression / no error) with
  multi-hop **disabled**. Confirm enabling multi-hop does not regress the existing
  retrieval-quality fixtures.

### Out of Scope

- **B3 — bi-temporal / supersedes edges.** `SUPERSEDES`/`CONTRADICTS`/`REPLACES`
  relation types, point-in-time queries, and any time-travel traversal. B2
  traverses the **current** edge set only. (`observation_versions` already
  exists; B3 will build on it.) Future change.
- **Change C — community summaries** (Leiden / LazyGraphRAG) and
  consolidation/decay/reflection. Future change.
- **Graph-lite consolidation.** Done in B1; `kg_triples` is already the single
  source. Not re-opened.
- **Any `/graph` endpoint change.** No new/changed HTTP routes; multi-hop is a
  retrieval-internal signal surfaced through existing `mem_recall` evidence only.
  (The legacy `GET /projects/{project}/graph` deprecation remains owned by
  `production-hardening-dashboard-v2`.)
- **New entity or relation types.** B2 traverses the existing 26 relations /
  27 entity types; it adds none. (Relation **filtering** for traversal is in
  scope — CL-6 — but adds no new types.)
- **Adding or removing any MCP tool.** The compact six-tool surface
  (constitution **P1**) is unchanged.
- **Changing the sync/export portable format.** B2 reads the graph only; it
  writes no new tables and changes no serialized format.

## Approach

1. **Traversal query first (A).** Land `queryKnowledgeMultiHopLane` with the
   `WITH RECURSIVE` CTE + cycle guard + depth/neighborhood caps, unit-tested
   against fixtures with known 1-hop and 2-hop bridges, **before** wiring it into
   fusion. Verify the existing
   `idx_kg_triples_subject`/`_object`/`_relation`/`_project` indexes
   (`src/store/schema.ts:224-227`) drive the recursion (no full scans) via
   `EXPLAIN QUERY PLAN` — see Performance below.
2. **Fuse behind the flag (B + D-5).** Wire into `hybridRetrieve` so the feature
   is inert when `kgMultiHopEnabled` is false (A/B-compare against the current
   ranking is then a config toggle). Re-use `fuseCandidates` dedup-by-observation.
3. **Config + env (E).** Add knobs following the `graphFactsSource`/`kgLlm`
   resolution + env-override pattern; keep the `RetrievalDefaults` duplication in
   sync if that is where they land.
4. **Degradation + timeout (D-3).** Implement the chosen timeout mechanism
   (CL-4) and the `degradedFallback` signaling, asserting that a forced
   timeout/disable returns the identical result set to today.
5. **Evals (F).** Add the shared-entity recall eval and confirm no regression on
   existing fixtures.
6. **Relation filtering (CL-6).** Apply the default relation allow/deny set in
   the CTE so structural edges drive traversal and metadata/`HAS_*` edges do not
   manufacture noise.

## Affected Areas

| Module | Files | Nature |
| --- | --- | --- |
| store | `src/store/index.ts` — new `queryKnowledgeMultiHopLane` (adjacent to `queryKnowledgeLane` `:2023-2113`); wire into `hybridRetrieve` (`:1697`, after fuse `:1797`, alongside enrichment `:1800-1817`); `degradedFallback` signaling (`:1773`); re-use `appendObservationFilters` | add traversal query + fusion integration |
| retrieval (ranking) | `src/retrieval/ranking.ts` — `LaneCandidate.source` union (`:22`) add `'kg_multi_hop'`; multi-hop weighting in `fuseCandidates`/`resolveLaneWeights`; **(only if CL-1 → 5th lane)** `RetrievalLane` `:3`, `DEFAULT_LANE_ORDER` `:4`, `DEFAULT_LANE_WEIGHTS` `:5`, `resolveLaneWeights` `:141` | additive source/lane + weight |
| retrieval (defaults) | `src/retrieval/sqlite-vec.ts` — `DEFAULT_RETRIEVAL_DEFAULTS` (`:10`) + `resolveRetrievalDefaults` (`:39`) **if** knobs live in `RetrievalDefaults` (duplicated with `src/config.ts:95`) | keep duplicated defaults in sync |
| config | `src/config.ts` — `RetrievalDefaults`/new block (`:7-13`), `getConfig` resolution (`:426-455`), env parsing (`parseBoolean`/`parseNumber` `:167-180`); `config.schema.json` | add `kgMultiHopEnabled`, `kgMaxDepth`, `kgNeighborhoodLimit`, `kgTraversalTimeoutMs`, `kgDepthDecay`, relation-filter + env overrides |
| schema (verify only) | `src/store/schema.ts` — `idx_kg_triples_subject`/`_object`/`_relation`/`_project` (`:224-227`) | **no DDL change**; verify index coverage for the CTE |
| evals | `src/evals/retrieval.ts` | add shared-entity multi-hop recall fixture + no-regression check |

> **No schema migration.** B2 adds **no** tables, columns, or indexes — it walks
> the edges B1 already writes, using indexes that already exist. (If `EXPLAIN`
> reveals a missing composite index for the recursion, adding an **additive**
> `CREATE INDEX IF NOT EXISTS` is the only schema touch — flagged as a possible
> design follow-up, not a planned destructive change.)

### Affected OpenSpec specs

> Delta specs are authored in the `sdd-spec` phase; this proposal records the
> mapping (per config rule "Identify affected modules/packages"). B1's deltas are
> already merged into these baseline specs.

- `openspec/specs/knowledge-graph/spec.md` — **ADDED:** entity-anchored
  multi-hop traversal over `kg_triples`/`kg_entities` (bidirectional, 1–2 hops,
  cycle-guarded, neighborhood-capped); reachable observations contribute KG
  evidence distinct from direct (`source_id`-keyed) KG facts; traversal MUST be
  deterministic (pure SQL, no model — **P2**) and bounded (**P4**). Relation
  filtering for traversal (CL-6). Builds on the existing "`kg_triples` MUST Be
  the Single Source of Graph-Derived Facts" (`:57`) and "KG Evidence MUST
  Participate in Fused Retrieval Ranking" (`:49`) requirements.
- `openspec/specs/retrieval/spec.md` — **ADDED:** multi-hop KG evidence MUST fuse
  as a lower-weighted source than direct KG, de-duplicated by observation, with
  depth attenuation; traversal MUST degrade to direct (single-hop) behavior on
  timeout/disable with explicit degraded-state signaling. **PRESERVED (not
  modified):** "Hybrid Retrieval MUST Fuse Four Lanes" (`:4`) and "Retrieval MUST
  Degrade by Lane, Not Globally" (`:77`) — multi-hop is additive under the `kg`
  lane and never load-bearing for basic recall.
- `openspec/specs/config/spec.md` — **ADDED:** deterministic resolution +
  env-override for `kgMultiHopEnabled`, `kgMaxDepth`, `kgNeighborhoodLimit`,
  `kgTraversalTimeoutMs`, `kgDepthDecay`, and the relation-filter setting,
  mirroring the existing "Embedding Configuration Resolution MUST Be
  Deterministic" (`:4`) and context-budget resolution patterns.
- `openspec/specs/store/spec.md` — **ADDED (if traversal is specified as a store
  capability):** `hybridRetrieve` MUST optionally include flag-gated multi-hop
  candidates bounded by the configured caps. (May be folded into the retrieval
  spec delta; design decides placement.)
- `openspec/specs/evals/spec.md` — **ADDED:** a multi-hop retrieval eval asserts
  shared-entity reachability with the flag on and no regression / no error with
  the flag off.

## Performance

- **Cost model.** A bidirectional 1–2 hop CTE seeded by ~K seed observations
  (K = `fusedLimit`, default ~20) touches, per hop, the edges incident to the
  current frontier of entities. With `idx_kg_triples_subject` and
  `idx_kg_triples_object` (`src/store/schema.ts:224-225`) each frontier-entity
  expansion is an index range scan, not a table scan; `idx_kg_triples_project`
  (`:227`) supports the project filter on projection. Cost is bounded by
  `kgMaxDepth` (2) × frontier size, and **hard-capped** by
  `kgNeighborhoodLimit` (50) so a high-degree "hub" entity (e.g. a popular
  `service`/`project` entity) cannot fan out unboundedly. Relation filtering
  (CL-6) further prunes the frontier by excluding low-signal `HAS_*`/`MENTIONS`
  edges that would otherwise dominate a hub's degree.
- **Index coverage — to confirm at design/apply.** Verify via
  `EXPLAIN QUERY PLAN` that both recursion directions use the subject/object
  indexes and that the seed-entity resolution and final `source_id` projection
  are index-driven. If a composite (e.g. `(subject_entity_id, relation)` or
  `(object_entity_id, relation)`) measurably helps once relation filtering is in
  the recursive step, add it as an **additive** index (the only potential schema
  touch).
- **Interaction with existing bounds.** Multi-hop candidates flow through the
  same `fuseCandidates(...).slice(0, fusedLimit)` cap (`src/store/index.ts:1797`)
  and the Change A output caps (`maxContextChars`, previews-by-default) downstream
  — so even a fully-populated 50-observation neighborhood cannot enlarge the
  returned payload beyond the existing `mem_recall`/`mem_context` budgets
  (constitution **P4**). The neighborhood cap protects **traversal** cost; the
  output caps protect **response** size; they compose.

## Breaking-Change Surface and Deprecation Strategy

Per constitution **P3** (harness-agnostic contract; additive/backward-compatible
migrations), **P5** (deprecation discipline), and the config rule "Warn before
merging destructive deltas":

- **Additive, behind a flag — no public-contract breakage.** B2 adds **no** MCP
  tool, **no** HTTP route, **no** CLI command, **no** observation type, and **no**
  schema migration. The MCP/HTTP/CLI surfaces are byte-identical. The only typed
  surface change is the **additive** `LaneCandidate.source` union member
  `'kg_multi_hop'` (and, only under CL-1's alternative, an additive
  `RetrievalLane` value) — both internal to the retrieval engine.
- **Behavior change is gated and reversible.** When `kgMultiHopEnabled` is off,
  retrieval output is identical to today's. When on, the change is purely
  additive ranking signal (new observations may appear / existing hits gain
  enrichment), never a removal of existing results.
- **Semver.** Additive feature behind a default-safe flag ⇒ **MINOR**
  (P3: additive). Confirm the flag default at clarify (CL-5); a default-off flag
  makes the MINOR strictly opt-in, a default-on flag changes ranking by default
  (still additive, still MINOR, but warrants the heavier eval gate in F-1).

## Rollback Plan

- **Primary rollback = the feature flag (D-5).** Set `kgMultiHopEnabled = false`
  (config or `THOTH_KG_MULTI_HOP_ENABLED=false`) to restore **exact** current
  single-hop behavior with no code revert — the same config-toggle rollback
  discipline B1 used for `graphFactsSource` and Change A used for the
  unbounded-sentinel cap. When disabled, no traversal query is issued.
- **Graceful auto-degrade (D-3).** On traversal timeout (or any traversal error),
  the engine drops multi-hop candidates for that query and returns the complete
  direct-lane result, signaling the degrade in `degradedFallback`. A pathological
  graph therefore degrades **per-query** to current behavior without operator
  action — consistent with the spec's "Retrieval MUST Degrade by Lane, Not
  Globally" (`openspec/specs/retrieval/spec.md:77`) and constitution **P2**.
- **No-regression guarantee (F-1).** The eval asserts that with the flag off the
  ranked output matches the pre-B2 baseline for the existing fixtures, so the
  rollback path is test-covered, not merely asserted.
- **Code revert is clean.** Because B2 adds no schema and no public surface,
  reverting the commit removes the traversal query, the additive `source` member,
  and the config knobs with no data migration and no consumer breakage.

## Conflict Notes and Coordination

- **B1 (archived) — foundation, no conflict.** B2 depends on B1's consolidated
  `kg_triples` (single edge set) and its synchronous deterministic write-on-save
  (so freshly-saved observations are immediately traversable, consistent with the
  knowledge-graph spec's "Graph Facts MUST Be Written Synchronously and
  Deterministically on Save" `:84`). No B1 code is reopened.
- **`production-hardening-dashboard-v2` (in-flight) — no conflict.** B2 touches
  **no** HTTP route and **no** dashboard client. The legacy `/graph` endpoint and
  its deprecation stay entirely with that change.
- **`sync-and-resilience` (in-flight) — no conflict.** B2 adds **no** migration
  and changes **no** export/import format (verified: B2 reads the graph only). No
  migration-helper sequencing dependency.
- **No other in-flight change** modifies `queryKnowledgeLane`, `fuseCandidates`,
  the `LaneCandidate` type, or the KG config — verified against the working tree
  (the only other multi-hop references are this program's own B1/`sync-and-
  resilience` design docs, not code).

## [NEEDS CLARIFICATION]

> Per config `clarification.max_markers_per_spec: 3` (enforced **per delta spec
> file**, not per proposal). The clarify phase resolves these before/within
> `sdd-spec`; each carries a recommended default. CL-1/CL-6 → knowledge-graph &
> retrieval specs; CL-2/CL-3/CL-4 → retrieval/store spec; CL-5 → config spec —
> distributed so no single spec file exceeds the cap.

- **CL-1 — Multi-hop as a `kg` **sub-source** vs. a **fifth lane**.** Should
  multi-hop candidates keep `lane: 'kg'` (distinguished only by
  `source: 'kg_multi_hop'` and a lower effective weight), or become a first-class
  fifth `RetrievalLane`? **Recommended default: keep it under the `kg` lane
  (sub-source).** This preserves the "MUST Fuse Four Lanes" requirement
  (`retrieval/spec.md:4`) verbatim, keeps `DEFAULT_LANE_ORDER`/weights stable, and
  models multi-hop as what it is — graph evidence at a lower trust tier. The
  fifth-lane alternative is cleaner for independent lane weighting/telemetry but
  edits the four-lane contract and the lane enums (C-2). Mark for explicit
  confirmation because it changes the spec surface.

- **CL-2 — Multi-hop effective weight.** Direct KG is `0.9`
  (`ranking.ts:9`); sentence/chunk/lexical are `1.0`. **Recommended default:
  `~0.7`** for multi-hop (noisier than direct KG, clearly below it, well below the
  semantic/lexical lanes). Range to confirm: `0.7–0.8`. (If CL-1 → fifth lane,
  this is the new lane's `DEFAULT_LANE_WEIGHTS` entry; if sub-source, it is the
  scaling applied to the `kg_multi_hop` candidate.)

- **CL-3 — Depth attenuation factor (`kgDepthDecay`).** Should a depth-2
  candidate score strictly below an otherwise-equal depth-1 candidate, and by how
  much? **Recommended default: yes, attenuate by `kgDepthDecay = 0.5` per hop**
  (`score = confidence * 0.5^(depth-1)`), so depth-1 = full, depth-2 = half. This
  makes "closer in the graph = more relevant" explicit and keeps depth-2 evidence
  from competing with depth-1. Confirm the factor (0.5 vs. e.g. 0.6).

- **CL-4 — Traversal timeout enforcement mechanism.** `better-sqlite3` is
  **synchronous**, so a JS `setTimeout` cannot interrupt a running statement.
  **Recommended default: rely primarily on the deterministic cost ceiling**
  (`kgMaxDepth` + `kgNeighborhoodLimit` + relation filtering bound the work
  predictably), and treat `kgTraversalTimeoutMs` (default `50`) as a
  measured-elapsed **guard around** the traversal call: if the bounded query
  nonetheless exceeds it, skip the multi-hop re-fuse and signal `degradedFallback`
  for that query. Evaluate SQLite `interrupt()`/progress-handler as a hard
  interrupt at design if the bounded ceiling proves insufficient on large graphs.

- **CL-5 — Feature-flag default (`kgMultiHopEnabled` on or off).** Should
  multi-hop ship **enabled** or **disabled** by default? **Recommended default:
  ship ENABLED** (the feature's purpose is to exploit the graph by default, it is
  bounded and auto-degrading, and constitution **P2/P4** safety holds), **gated on
  the F-1 no-regression eval passing GREEN**. The conservative alternative is
  default-off (strictly opt-in, zero default ranking change) for one release, then
  flip on. Mark for explicit decision because it sets whether B2 changes default
  retrieval behavior.

- **CL-6 — Relation-type filtering for traversal (which of the 26 relations to
  follow).** Following **all** 26 relations would traverse the metadata/synthetic
  edges — `HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED` (the B1-synthesized
  observation→metadata edges), plus `HAS_TOPIC`/`HAS_SCOPE`/`MENTIONS`/
  `EXTRACTED_FROM` — which connect an observation to its own attributes and create
  high-degree, low-signal hubs (e.g. every observation in a project sharing a
  `HAS_SCOPE` value), manufacturing noise rather than meaning. **Recommended
  default: traverse a curated STRUCTURAL allow-set and EXCLUDE the metadata set.**
  - **Follow (structural / semantic, 18):** `USES`, `DEPENDS_ON`, `BELONGS_TO`,
    `PART_OF`, `OWNS`, `CONFIGURES`, `IMPLEMENTS`, `RUNS_IN`, `DEPLOYS_TO`,
    `CAUSES`, `FIXES`, `BLOCKS`, `UNBLOCKS`, `AFFECTS`, `REFERENCES`,
    `AUTHENTICATES_WITH`, `PRECEDES`, `FOLLOWS`.
  - **Exclude (metadata / synthetic / low-signal, 8):** `HAS_WHAT`, `HAS_WHY`,
    `HAS_WHERE`, `HAS_LEARNED`, `HAS_TOPIC`, `HAS_SCOPE`, `MENTIONS`,
    `EXTRACTED_FROM`.

    Make the allow-set **configurable** (E-1 relation-filter setting) so it can be
    tuned without code change. Confirm the exact split — in particular whether
    `REFERENCES`/`MENTIONS` belong on the same side (proposed: `REFERENCES`
    follows, `MENTIONS` excluded as lower-confidence) — and whether the filter is
    expressed as an allow-list (recommended, fail-safe to fewer edges) or a
    deny-list.

## Success Criteria

- `queryKnowledgeMultiHopLane` returns, for seed observations, the observations
  reachable within `kgMaxDepth` hops across the **configured** (CL-6) relations,
  bidirectionally, excluding the seeds, cycle-guarded, and capped at
  `kgNeighborhoodLimit`.
- With `kgMultiHopEnabled` ON, an observation that shares an entity with a seed
  hit **but has no direct lexical/semantic overlap with the query** is surfaced
  in fused results, sourced `kg_multi_hop`, weighted below direct KG, with
  depth-2 evidence scoring below depth-1.
- With `kgMultiHopEnabled` OFF (or on traversal timeout), `hybridRetrieve`
  returns results **identical to the pre-B2 baseline** for the existing fixtures,
  with timeout signaled in `degradedFallback` — no regression, no hard failure
  (constitution **P2**; `retrieval/spec.md:77`).
- The "Hybrid Retrieval MUST Fuse Four Lanes" (`retrieval/spec.md:4`) requirement
  remains satisfied (multi-hop is additive under `kg`, per CL-1 default).
- `EXPLAIN QUERY PLAN` confirms the recursion and projection are index-driven
  (`idx_kg_triples_subject`/`_object`/`_project`); no full-table scan of
  `kg_triples` in the traversal.
- Returned payload size remains within the Change A output caps regardless of
  neighborhood size (constitution **P4**).
- The traversal knobs resolve deterministically from config + env overrides
  (mirroring `graphFactsSource`/embedding resolution), with the
  `RetrievalDefaults` duplication (if used) kept in sync.
- No MCP tool / HTTP route / CLI command / schema migration is added or changed
  (constitution **P1/P3/P5**).
- `pnpm run build` and `pnpm test` pass; the new multi-hop eval and the existing
  retrieval/KG evals pass.

## Future Changes (program context)

- **B3 — Bi-temporal / supersedes edges** (`SUPERSEDES`/`CONTRADICTS`/`REPLACES`,
  point-in-time / time-travel traversal building on B2's traversal + the existing
  `observation_versions`). Depends on B1+B2. Separate proposal; OUT OF SCOPE here.
- **Change C — Community summaries** (Leiden / LazyGraphRAG, external lib) and
  consolidation/decay/reflection. Separate proposal; OUT OF SCOPE here.
