# Tasks: Entity-Anchored Multi-Hop KG Recall (B2)

> **Scope**: B2 only — additive, flag-gated multi-hop traversal of `kg_triples`.
> No B3 (temporal/SUPERSEDES), no community summaries, no schema migration,
> no MCP/HTTP/CLI surface change, no new `RetrievalLane`.
>
> **Persistence mode**: `openspec` (repo files only).

## Traceability Map

| Task group | Spec requirement / design anchor |
| --- | --- |
| Phase 1 (config) | `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking`; Design §Config block; CL-2, CL-5, CL-6 |
| Phase 1 (source union) | Design §ranking.ts — additive `source` member only |
| Phase 2 (traversal function) | Design §queryKnowledgeMultiHopLane; EXPLAIN decision; CL-3, CL-4, CL-6 |
| Phase 2 (hybridRetrieve wiring) | Design §hybridRetrieve wiring; CL-1, CL-2, CL-3, CL-5; `retrieval/Hybrid Retrieval MUST Fuse Four Lanes` |
| Phase 3 (unit tests) | Design §Testing Strategy 1, 2, 3, 5 |
| Phase 3 (config tests) | Design §Testing Strategy 4 |
| Phase 3 (evals) | Design §Testing Strategy 6; `evals/Facts-Source Eval MUST Assert on kg_triples` |
| Phase 4 (verification) | Design §Migration/Rollout; `config.yaml` verify block |

---

## Phase 1: Infrastructure

- [ ] 1.1 Add `KnowledgeGraphConfig` interface and defaults to `src/config.ts` — `src/config.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking`
  Add `KnowledgeGraphConfig` interface with fields: `kgMultiHopEnabled: boolean`,
  `kgMaxDepth: number`, `kgNeighborhoodLimit: number`, `kgMultiHopWeight: number`,
  `kgDepthDecay: number`, `kgTraversalTimeoutMs: number`, `kgRelationAllowList: string[]`.
  Add `DEFAULT_KG_RELATION_ALLOW_LIST` (18 structural relations: USES, DEPENDS_ON,
  BELONGS_TO, PART_OF, OWNS, CONFIGURES, IMPLEMENTS, RUNS_IN, DEPLOYS_TO, CAUSES,
  FIXES, BLOCKS, UNBLOCKS, AFFECTS, REFERENCES, AUTHENTICATES_WITH, PRECEDES, FOLLOWS).
  Add `DEFAULT_KNOWLEDGE_GRAPH_CONFIG` constant with: `kgMultiHopEnabled: true`,
  `kgMaxDepth: 2`, `kgNeighborhoodLimit: 50`, `kgMultiHopWeight: 0.7`,
  `kgDepthDecay: 0.5`, `kgTraversalTimeoutMs: 50`,
  `kgRelationAllowList: DEFAULT_KG_RELATION_ALLOW_LIST`.
  Add `knowledgeGraph?: KnowledgeGraphConfig` to `ThothConfig` (line ~46).
  Add `knowledgeGraph?: Partial<KnowledgeGraphConfig>` to `PersistedConfig` (line ~70).
  **Independent Test:** TypeScript compilation of `src/config.ts` passes with no errors.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: No TypeScript errors in `src/config.ts`

- [ ] 1.2 Implement `resolveKnowledgeGraphConfig` resolver in `src/config.ts` — `src/config.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking`
  Mirror the pattern of `resolveKgLlmConfig` (line ~350). Apply env > persisted > default
  for each knob using existing `parseBoolean`/`parseNumber` helpers:
  - `THOTH_KG_MULTI_HOP_ENABLED` → `parseBoolean`
  - `THOTH_KG_MAX_DEPTH` → `parseNumber`
  - `THOTH_KG_NEIGHBORHOOD_LIMIT` → `parseNumber`
  - `THOTH_KG_MULTI_HOP_WEIGHT` → `parseNumber`
  - `THOTH_KG_DEPTH_DECAY` → `parseNumber`
  - `THOTH_KG_TRAVERSAL_TIMEOUT_MS` → `parseNumber`
  - `THOTH_KG_RELATION_ALLOW_LIST` → new `parseRelationAllowList` helper:
    split comma/whitespace-delimited env string, uppercase + trim, intersect with
    `KG_RELATION_TYPES` (imported from `src/indexing/kg-extractor.ts`);
    **if result is empty, fall back to `DEFAULT_KG_RELATION_ALLOW_LIST` — never
    to the metadata set** (fail-safe for empty/invalid allow-list).
    Apply same intersection logic to the persisted array value.
  Wire `resolveKnowledgeGraphConfig(persisted)` into `getConfig` (line ~431)
  alongside `resolveKgLlmConfig`, and add `knowledgeGraph` to the returned object.
  **Independent Test:** Run the config unit tests — defaults and env-override cases
  for `kgLlm` continue to pass (no regression), and the module compiles cleanly.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: `src/config.ts` compiles; `resolveKnowledgeGraphConfig` is exported

- [ ] 1.3 Add `knowledgeGraph` block to `config.schema.json` — `config.schema.json`
  **[USN-1]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking`
  Add a sibling `knowledgeGraph` object (peer of `kgLlm` at line ~130) with
  `additionalProperties: false` and typed/bounded fields:
  - `kgMultiHopEnabled`: `boolean`
  - `kgMaxDepth`: `integer`, `minimum: 1`
  - `kgNeighborhoodLimit`: `integer`, `minimum: 1`
  - `kgMultiHopWeight`: `number`, `minimum: 0`
  - `kgDepthDecay`: `number`, `exclusiveMinimum: 0, maximum: 1`
  - `kgTraversalTimeoutMs`: `integer`, `minimum: 0`
  - `kgRelationAllowList`: `array` of `string`, `enum` = the 26 `KG_RELATION_TYPES`,
    `uniqueItems: true`
  **Independent Test:** Existing schema round-trip test in `tests/config.test.ts`
  still passes; the new block validates without errors when a valid `knowledgeGraph`
  object is supplied.
  **Verification**:
  - Run: `pnpm test -- -t "config"`
  - Expected: All config tests pass; schema validation tests do not error

- [ ] 1.4 Add `'kg_multi_hop'` to `LaneCandidate.source` union — `src/retrieval/ranking.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking`
  Extend line ~22 of `src/retrieval/ranking.ts`:
  ```ts
  source: 'raw_query' | 'hyde_answer' | 'lexical_prefix' | 'kg_triples'
        | 'kg_multi_hop' | 'observation_facts';
  ```
  No other change to `ranking.ts`. `RetrievalLane`, `DEFAULT_LANE_ORDER`,
  `DEFAULT_LANE_WEIGHTS`, `fuseCandidates`, `compareCandidates`, and
  `resolveLaneWeights` are untouched (four-lane contract preserved, CL-1).
  **Independent Test:** `src/retrieval/ranking.ts` compiles; existing ranking
  unit tests pass unchanged.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: No TypeScript errors; `'kg_multi_hop'` is an accepted `source` value

---

## Phase 2: Implementation

- [ ] 2.1 Implement `queryKnowledgeMultiHopLane` private method — `src/store/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking` #2-hop neighbor surfaced
  Place adjacent to `queryKnowledgeLane` (after line ~2113). Signature:
  ```ts
  private queryKnowledgeMultiHopLane(input: {
    seedObservationIds: number[];
    filters?: RetrievalCandidateFilters;
    maxDepth: number;
    neighborhoodLimit: number;
    relationAllowList: string[];
    multiHopWeight: number;
    depthDecay: number;
  }): LaneCandidate[]
  ```
  Implementation requirements (in order):
  1. **Guard**: return `[]` immediately if `seedObservationIds.length === 0 ||
     relationAllowList.length === 0 || maxDepth < 1`. Empty allow-list MUST fail
     safe to no traversal, never to following metadata edges.
  2. **Seed-entity resolution**: `SELECT DISTINCT subject_entity_id,
     object_entity_id FROM kg_triples WHERE source_id IN (…seeds…) AND
     source_type = 'observation'` — collects the frontier entity-id set. This
     scan is bounded (one pass, K ≈ fusedLimit seeds) and acceptable (no
     `source_id` index exists; documented accepted caveat in design).
  3. **`WITH RECURSIVE` CTE — CRITICAL TWO-DIRECTION UNION SHAPE** (MUST NOT
     use OR-join form):
     - Base case: one row per seed entity, `depth = 1`, `path = ',<id>,'`.
     - Forward arm: `FROM frontier f JOIN kg_triples t ON
       t.subject_entity_id = f.entity_id WHERE f.depth < :maxDepth AND
       t.relation IN (…allowList…) AND f.path NOT LIKE
       '%,'||t.object_entity_id||',%'` → next entity = `t.object_entity_id`,
       depth + 1. Uses `idx_kg_triples_subject`.
     - Backward arm: symmetric on `t.object_entity_id = f.entity_id` →
       next entity = `t.subject_entity_id`. Uses `idx_kg_triples_object`.
     - The `path NOT LIKE` predicate is the visited-set cycle guard; combined
       with `depth < :maxDepth` it guarantees termination.
     - **The OR-join form (`ON (t.subject_entity_id = f.entity_id OR
       t.object_entity_id = f.entity_id)`) is FORBIDDEN** — it collapses both
       entity indexes to a scan (per design EXPLAIN decision).
  4. **Projection**: join reached entity-ids back to triples and observations
     to recover bridged `source_id` observations. Apply
     `appendObservationFilters(sql, params, input.filters)` (alias `o`) as
     other lanes do. Also apply: `o.deleted_at IS NULL`,
     `t.source_type = 'observation'`, exclude seeds
     (`AND t.source_id NOT IN (…seeds…)`). Order by attenuated score DESC,
     apply `LIMIT :neighborhoodLimit` in SQL. Re-assert the cap in code.
  5. **Emit** one `LaneCandidate` per reached observation (keep min-depth /
     highest-confidence bridge if reached multiple ways):
     ```ts
     {
       lane: 'kg',
       observationId,
       score: confidence * Math.pow(depthDecay, depth - 1)
              * (multiHopWeight / DEFAULT_LANE_WEIGHTS.kg),
       source: 'kg_multi_hop',
       text: bridgePath,  // "<seed entity> →(<relation>)→ <bridge entity>"
       kg: { provenance, confidence, sourceType: 'observation' },
     }
     ```
  **Independent Test:** Import `queryKnowledgeMultiHopLane` via a Store instance
  in a standalone test; run with an empty allow-list and confirm it returns `[]`.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: No TypeScript errors in `src/store/index.ts`

- [ ] 2.2 Wire multi-hop into `hybridRetrieve` with flag-gate and degrade path — `src/store/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking` #multi-hop introduces new observation
  At lines ~1797-1817, after `const fused = fuseCandidates(...).slice(0, fusedLimit)`:
  1. Read resolved knobs once: `const kg = this.config.knowledgeGraph`.
  2. Initialize `let refused = fused`.
  3. Flag-gated block: `if (kg.kgMultiHopEnabled && fused.length > 0) { … }`.
     Inside the block:
     a. Record `const startedAt = Date.now()`.
     b. Call `this.queryKnowledgeMultiHopLane({ seedObservationIds: fused.map(h =>
        h.observation.id), filters, maxDepth: kg.kgMaxDepth, neighborhoodLimit:
        kg.kgNeighborhoodLimit, relationAllowList: kg.kgRelationAllowList,
        multiHopWeight: kg.kgMultiHopWeight, depthDecay: kg.kgDepthDecay })`.
     c. Elapsed guard: `if (multiHop.length > 0 && (Date.now() - startedAt) <=
        kg.kgTraversalTimeoutMs)`:
        - **CRITICAL re-fuse row-map extension** (easy-to-miss): collect
          `newIds = multiHop.map(c => c.observationId).filter(id => !observations.has(id))`.
          If `newIds.length > 0`, query `observations` for those ids and populate
          the `observations` Map with the returned rows BEFORE calling
          `fuseCandidates` — the fuser requires every referenced observationId to
          already exist in the map.
        - Combined re-fuse: `refused = fuseCandidates(observations,
          [...coreCandidates, ...multiHop], fusionOptions).slice(0, fusedLimit)`.
     d. Else (elapsed exceeded): `degradedFallback.push('kg_multi_hop')`.
     e. Catch block: `degradedFallback.push('kg_multi_hop')` on any error — no throw.
  4. Replace subsequent references of `fused` (enrichment pass ~1800-1849 and
     returned `results`) with `refused`.
  5. When flag is off: `refused === fused` — no traversal query issued, output
     byte-identical to pre-B2 (D-5).
  **Independent Test:** With `kgMultiHopEnabled = false`, run `hybridRetrieve` on
  any query and assert the ranked result is identical to the pre-wiring baseline
  (snapshot or structural equality).
  **Verification**:
  - Run: `pnpm run build`
  - Expected: No TypeScript errors; `hybridRetrieve` return type unchanged

- [ ] 2.3 Verify `src/store/schema.ts` — no DDL change required — `src/store/schema.ts`
  **[USN-2]** | Priority: P2
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking`
  Confirm that the five existing indexes (`idx_kg_triples_subject`, `idx_kg_triples_object`,
  `idx_kg_triples_relation`, `idx_kg_triples_project`, `idx_kg_triples_topic`)
  at lines ~224-228 are present. No DDL change. The optional additive
  `idx_kg_triples_source` is a documented future follow-up; do NOT add it in B2.
  The legacy `observation_facts` branch in `queryKnowledgeLane` (~2081,
  `graphFactsSource === 'legacy'`) is untouched.
  **Independent Test:** Schema tests in `tests/store/schema.test.ts` pass unmodified.
  **Verification**:
  - Run: `pnpm test -- -t "schema"`
  - Expected: All schema tests pass; no new DDL

- [ ] 2.4 Add shared-entity recall fixture and no-regression gate to evals — `src/evals/retrieval.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `evals/Facts-Source Eval MUST Assert on kg_triples` #Graph fixtures populate KG-lane evidence
  Using the existing `seedGraphFactTriple` helper (line ~325) and the
  `tripleHash`-keyed insert pattern (lines ~734-760):
  1. **Multi-hop fixture**: add a fixture whose answer observation has no direct
     lexical/semantic overlap with the query. Seed a `DEPENDS_ON` bridge triple
     whose subject entity also appears on a triple from the answer observation.
     No `observation_facts` insert. Fixture key: `'kg-multi-hop'`.
  2. **Depth-2 sub-case** (SHOULD): add a second bridge one hop further; assert
     its reached candidate scores below an otherwise-equal depth-1 reach.
  3. **Distractor**: an observation connected to the seed only by an excluded
     metadata relation (`HAS_TOPIC` or `MENTIONS`); assert it does NOT appear as
     a multi-hop reach.
  4. **Flag-toggle eval cases**: run multi-hop fixtures with `kgMultiHopEnabled = true`
     (assert answer surfaces with `lane: 'kg'`, `source: 'kg_multi_hop'`) and
     `kgMultiHopEnabled = false` (assert answer not surfaced via multi-hop, no error).
  5. **No-regression gate (CL-5)**: run ALL existing fixtures with flag OFF (baseline)
     and ON; assert per-case that every OFF pass still passes ON and no expected
     observation drops to a worse rank ON than OFF. This gate decides the shipped
     default — if regression is detected, flip `kgMultiHopEnabled` default to `false`
     in `DEFAULT_KNOWLEDGE_GRAPH_CONFIG` and record a follow-up to tune weight/filters.
  **Independent Test:** Run the eval entrypoint with only the new multi-hop fixture
  enabled; confirm it exits without error and reports the expected observation.
  **Verification**:
  - Run: `pnpm run eval:retrieval`
  - Expected: Multi-hop ON does not regress the single-hop baseline; all existing
    eval cases still pass; new multi-hop case surfaces expected observation

---

## Phase 3: Testing

- [ ] 3.1 Author traversal unit tests — `tests/store/kg-multi-hop.test.ts` (new file)
  **[USN-3]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking` #bidirectional; #cycle guard; #depth guard
  Create `tests/store/kg-multi-hop.test.ts` using `new Store(':memory:')` and the
  `seedGraphFactTriple`-style insert. Required test cases:
  - **2-hop neighbor surfaced**: an observation reached by following two structural
    hops from a seed IS returned; the seed observation itself is NOT in the result.
  - **Bidirectional**: seed entity on the object side still reaches the
    subject-side neighbor (backward arm works).
  - **Metadata relation excluded**: `HAS_TOPIC`, `MENTIONS`, `EXTRACTED_FROM` do NOT
    extend the frontier (allow-list applied).
  - **Cycle guard**: graph with `X →USES→ Y`, `Y →USES→ X` terminates; no infinite
    recursion; `kgMaxDepth` is respected.
  - **Depth guard**: a depth-3 observation is NOT returned when `kgMaxDepth = 2`.
  - **Neighborhood cap**: a hub reaching > `kgNeighborhoodLimit` observations returns
    exactly the cap, top-scored (SQL LIMIT + code re-assert).
  - **`appendObservationFilters` honored**: project/scope/topic_key/type/time window
    filters exclude matching observations.
  - **Bridge-path and provenance**: each reached observation carries `depth`, KG
    `provenance`/`confidence`, and a non-empty bridge-path `text`.
  **Independent Test:** Run only this file: `pnpm test tests/store/kg-multi-hop.test.ts`.
  **Verification**:
  - Run: `pnpm test tests/store/kg-multi-hop.test.ts`
  - Expected: All traversal unit tests pass

- [ ] 3.2 REQUIRED — EXPLAIN QUERY PLAN index-coverage assertion — `tests/store/kg-multi-hop.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking` — design EXPLAIN decision (load-bearing CTE shape)
  In `tests/store/kg-multi-hop.test.ts`, add an EXPLAIN assertion test that:
  1. Builds an in-memory Store with seed entities and at least one structural triple.
  2. Runs `EXPLAIN QUERY PLAN <the WITH RECURSIVE CTE>` directly on the Store's
     `db` connection using the same SQL string the production code uses.
  3. **Asserts** the plan output text CONTAINS `idx_kg_triples_subject` AND
     `idx_kg_triples_object`.
  4. **Asserts** the recursive step does NOT contain a bare `SCAN kg_triples`
     (i.e. the OR-join shape has not crept in).
  This test is mandatory, not optional — it regression-guards the load-bearing
  two-direction UNION CTE shape against accidental reversion to the OR-join form.
  **Independent Test:** Run only this test case; it should pass when the CTE
  uses the correct two-direction UNION form.
  **Verification**:
  - Run: `pnpm test tests/store/kg-multi-hop.test.ts`
  - Expected: EXPLAIN plan assertions pass; `idx_kg_triples_subject` and
    `idx_kg_triples_object` both appear; no bare `SCAN kg_triples` in recursive step

- [ ] 3.3 Author fusion/ranking integration tests — extend `tests/store/index.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking` #dedup-direct-wins; #depth-decay ordering
  Extend `tests/store/index.test.ts` (or a focused `tests/store/kg-multi-hop-fusion.test.ts`)
  with these integration cases via `hybridRetrieve`:
  - **New observation surfaced**: multi-hop introduces an observation that is NOT
    in the direct-lane output; result contains it with `lane: 'kg'`,
    `source: 'kg_multi_hop'`.
  - **Dedup-direct-wins**: an observation reached both directly (any lane) and via
    multi-hop appears exactly once in the output; primary evidence is the direct
    candidate; rank is not lowered vs direct-only run.
  - **Depth-decay ordering**: equal-confidence depth-1 vs depth-2 reach → depth-1
    ranks above depth-2. Verify: depth-1 effective score = `confidence * 0.7`;
    depth-2 effective score = `confidence * 0.5 * 0.7`.
  - **Multi-hop weight < direct KG**: a multi-hop hit scores strictly below an
    otherwise-equal direct `kg_triples` hit (`effective weight 0.7 < 0.9`).
  **Independent Test:** Run the new test cases in isolation; the existing
  `index.test.ts` cases are unaffected.
  **Verification**:
  - Run: `pnpm test tests/store/index.test.ts`
  - Expected: All existing tests pass; new fusion/ranking cases pass

- [ ] 3.4 Author degrade and flag-off tests — extend `tests/store/index.test.ts` (or new focused file)
  **[USN-3]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking` #flag-off byte-identical; #forced timeout signals kg_multi_hop
  Required cases via `hybridRetrieve`:
  - **Flag-off byte-identical**: `kgMultiHopEnabled = false` → ranked output is
    structurally identical to a run without the feature; assert NO traversal query
    issued (spy on `queryKnowledgeMultiHopLane` or assert absence of
    `kg_multi_hop` candidates in any internal capture).
  - **Forced timeout degrades gracefully**: set `kgTraversalTimeoutMs = 0` with a
    non-empty neighborhood → complete direct result is returned (no throw);
    `degradedFallback` contains `'kg_multi_hop'`.
  - **Empty neighborhood**: no shared entities between seeds and any other
    observation → direct result unchanged; no error; `refused === fused`.
  **Independent Test:** Run the degrade cases in isolation with a spy or a
  counter that confirms no second SQL query was issued when the flag is off.
  **Verification**:
  - Run: `pnpm test -- -t "kg_multi_hop|degrade|flag"`
  - Expected: All three degrade cases pass; no throw observed

- [ ] 3.5 Author config unit tests — extend `tests/config.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `knowledge-graph/KG Evidence MUST Participate in Fused Retrieval Ranking` — design §Config tests
  Mirror the `graphFactsSource`/`kgLlm` patterns (lines ~99/~202 in `tests/config.test.ts`).
  Required cases:
  - **Defaults**: all seven knobs resolve to documented defaults when no env and no
    persisted config (`kgMultiHopEnabled: true`, `kgMaxDepth: 2`,
    `kgNeighborhoodLimit: 50`, `kgMultiHopWeight: 0.7`, `kgDepthDecay: 0.5`,
    `kgTraversalTimeoutMs: 50`, `kgRelationAllowList` = 18 structural relations).
  - **Env overrides persisted**: each of the seven `THOTH_KG_*` env vars wins over
    a conflicting persisted value.
  - **Persisted used when env unset**: persisted block values are applied when
    the corresponding env var is absent.
  - **Allow-list parsing**: env `THOTH_KG_RELATION_ALLOW_LIST` comma-delimited is
    parsed, uppercased, intersected with `KG_RELATION_TYPES`.
  - **Allow-list fail-safe**: empty string or all-unknown values → falls back to
    structural default (never the metadata set).
  - **Schema validation**: a valid `knowledgeGraph` block round-trips through
    `config.schema.json` validation without errors (extend existing schema round-trip
    test).
  **Independent Test:** Run only config tests; no other module needed.
  **Verification**:
  - Run: `pnpm test tests/config.test.ts`
  - Expected: All existing config tests pass; new `knowledgeGraph` cases pass

---

## Phase 4: Verification and Close

- [ ] 4.1 Run full test suite and confirm no regression — all modules
  **[USN-4]** | Priority: P1
  **Spec:** All requirements above (full-suite gate)
  Run the complete test suite. All pre-existing tests MUST pass unchanged.
  New B2 tests MUST pass. Legacy `observation_facts` branch in `queryKnowledgeLane`
  (~2081) is untouched — its existing tests continue to pass.
  **Independent Test:** Each individual test file passes on its own before this
  full-suite run.
  **Verification**:
  - Run: `pnpm test`
  - Expected: All tests pass; zero failures; no unexpected skips

- [ ] 4.2 Run eval:retrieval no-regression gate and record shipped default — `src/evals/retrieval.ts`, `src/config.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `evals/Facts-Source Eval MUST Assert on kg_triples` #no-regression gate; Design CL-5
  Run `pnpm run eval:retrieval` with `kgMultiHopEnabled = true` (the B2 default).
  Compare per-case results against the flag-OFF baseline:
  - If NO regression (every OFF pass still passes ON; no observation ranks worse ON
    than OFF): shipped default remains `kgMultiHopEnabled: true`. Record GREEN in
    this task.
  - If ANY regression detected: flip `DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgMultiHopEnabled`
    to `false` in `src/config.ts`, record the regressing case(s) in a follow-up
    comment, and note "default flipped to OFF pending weight/filter tuning".
  **Independent Test:** `pnpm run eval:retrieval` exits 0 in both configurations.
  **Verification**:
  - Run: `pnpm run eval:retrieval`
  - Expected: Multi-hop ON does not regress single-hop baseline; eval exits 0;
    shipped default recorded in this checklist

- [ ] 4.3 Build artifact — all modules
  **[USN-4]** | Priority: P1
  **Spec:** Design §Migration/Rollout — MINOR additive
  Confirm the final build is clean with no TypeScript errors across all changed
  and untouched modules. Confirm `hybridRetrieve` return type is unchanged.
  Confirm no MCP tool, HTTP route, or CLI command was added or modified.
  **Independent Test:** Build produces no errors after all prior tasks are complete.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Zero TypeScript errors; build artifacts produced successfully

- [ ] 4.4 Update change checklist — `openspec/changes/kg-multi-hop-recall/checklists/requirements.md`
  **[USN-4]** | Priority: P2
  **Spec:** `config.yaml` archive rules
  Mark all B2 checklist items as complete. Record the shipped default decision
  from task 4.2. Note that `idx_kg_triples_source` and `db.interrupt()` are
  documented future follow-ups (not B2 scope). Confirm all six CL items
  (CL-1 through CL-6) are resolved as recorded in the design.
  **Independent Test:** Checklist file exists and is consistent with task outcomes.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Tests still pass after checklist update (no accidental code change)
