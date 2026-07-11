# Tasks: Graph-Lite Consolidation (B1)

> **Scope**: B1 only — byte-for-byte parity consolidation of `observation_facts`
> onto `kg_triples`+`kg_entities`. No B2 multi-hop, no B3 temporal/supersedes,
> no `/graph` endpoint removal, no richer-relation surfacing.
>
> **Persistence mode**: `openspec` (repo files only; no thoth-mem writes).
>
> **Verify commands**: `pnpm test` | `pnpm run build`
>
> **OQ resolutions baked in**:
> - OQ-1 (parity-critical): Remove the 500-char section cap in
>   `extractStructuredSections` (`kg-extractor.ts:194`) for byte-for-byte
>   parity with legacy uncapped `extractStructuredFacts`.
> - OQ-2 (minor): Keep `RebuildObservationFactsResult` field names
>   (`facts_deleted`/`facts_created`) — they now count triples.
> - OQ-3: Place DROP in the LIVE runner `runMigrationsWithSemantic`
>   (`migrations.ts:213`), NOT the inert `MIGRATIONS_SQL` array; idempotent
>   `DROP TABLE/INDEX IF EXISTS`, ordered last.

---

## Traceability Map

| Task group | Spec requirements |
|---|---|
| 1.x Config flag | store/Flag-guarded cutover; knowledge-graph/Flag-guarded cutover |
| 2.x No-LLM helper + cap fix | indexing/Deterministic KG Facts MUST Be Written Synchronously on Save; knowledge-graph/KG Records MUST Preserve Provenance; OQ-1 |
| 3.x Adapter | store/Store MUST Provide a KG-Backed ObservationFact Adapter; store/KG-Backed Adapter MUST Preserve ObservationFact Consumer Parity |
| 4.x Schema | store/observation_facts Table and Indexes MUST Be Removed (REMOVED req); store/Schema Evolution MUST Preserve Existing Lexical Compatibility |
| 5.x Reader migration | store/getObservationFacts MUST Be Backed by the KG Adapter; store/All Direct observation_facts Readers MUST Be Migrated; knowledge-graph/kg_triples MUST Be the Single Source |
| 6.x Sync write on save | knowledge-graph/Graph Facts MUST Be Written Synchronously and Deterministically on Save; indexing/Deterministic KG Facts MUST Be Written Synchronously |
| 7.x Stop legacy writes | store/Synchronous observation_facts Writer MUST Be Removed |
| 8.x Rebuild repoint | store/Rebuild Plumbing MUST Rebuild the KG-Backed Graph; indexing/rebuild-graph MUST Repoint |
| 9.x Migration DROP | store/observation_facts Table MUST Be Removed; OQ-3 |
| 10.x Evals | evals/Facts-Source Eval MUST Assert on kg_triples; evals/Graph-Fact Eval Fixtures MUST Seed the Knowledge Graph |
| 11.x Testing | All spec scenarios (parity, filter, readers, sync availability, idempotency, graceful degrade, rebuild, migration, evals, export) |
| 11.11 Legacy test migration | tests/store/schema.test.ts, tests/store/graph-lite.test.ts, tests/store/index.test.ts, tests/store/visualization.test.ts, tests/http-viz.test.ts, tests/cli.test.ts — retire/migrate all live observation_facts references |
| 12.x Verification | verify rules: `pnpm test` + `pnpm run build` |

---

## Phase 1: Infrastructure

### 1.1 Add `graphFactsSource` config field and JSON schema — `src/config.ts`, `config.schema.json`

- [x] 1.1 Add `graphFactsSource?: 'legacy' | 'kg'` to the config type
  (`src/config.ts` around `:50-62`) and resolver (default `'kg'`), mirroring
  the `httpDisabled`/`kgLlm` env-override pattern (~`:420-432`). Update
  `config.schema.json` with the matching enum property.

  **[USN-1]** | Priority: P1
  **Spec:** `store/Flag-guarded cutover enables rollback without code revert`
  **Independent Test:** TypeScript compilation passes with the new field; the
  default value is `'kg'` when no override is provided.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build succeeds; `graphFactsSource` resolves to `'kg'` by default
    with no type errors

### 1.2 Extract `writeDeterministicKgFacts` helper from `processKgJob` — `src/indexing/jobs.ts`

- [x] 1.2 Factor the deterministic block currently inline in `processKgJob`
  (`src/indexing/jobs.ts:462-513`: taxonomy upsert, `DELETE kg_triples WHERE
  source_id=obsId`, entity upsert, triple `ON CONFLICT(triple_hash) DO UPDATE`)
  into an exported no-LLM helper `writeDeterministicKgFacts(store,
  observationId): void`. The helper loads the observation row (same `SELECT` as
  `:420`), calls `extractKnowledgeTriples` with no `llmTriples`, and performs
  the persist block. `processKgJob` calls the helper for its deterministic pass
  and retains the optional LLM enrichment branch (`:444-460`, `try/catch`
  preserved). The save path will pass NO extractor so no LLM is invoked
  (constitution **P2**).

  **[USN-1]** | Priority: P1
  **Spec:** `indexing/Deterministic KG Facts MUST Be Written Synchronously on Save`; `indexing/extract_kg Background Job MUST Be Retained for Optional LLM Enrichment`
  **Independent Test:** `processKgJob` continues to pass existing tests after
  refactor; the helper is importable from `src/indexing/jobs.ts`.
  **Verification**:
  - Run: `pnpm test`
  - Expected: All pre-existing KG/job tests pass; no duplicate-triple errors

### 1.3 Remove 500-char section cap in `extractStructuredSections` (OQ-1) — `src/indexing/kg-extractor.ts`

- [x] 1.3 In `extractStructuredSections` (`src/indexing/kg-extractor.ts:185-214`),
  remove or relax the `object.slice(0, 500)` cap at `:194` so section-content
  objects are stored uncapped, matching the legacy `extractStructuredFacts`
  semantics (`src/store/index.ts:1032-1036`). This applies to BOTH the
  synchronous `writeDeterministicKgFacts` call path and the background
  `extract_kg` job (same shared helper). Result: `kg_entities.canonical_name`
  will equal the legacy `observation_facts.object` byte-for-byte for sections
  longer than 500 chars.

  **[USN-1]** | Priority: P1
  **Spec:** `knowledge-graph/KG-Backed Adapter MUST Preserve ObservationFact Consumer Parity` — parity-critical OQ-1 resolution; `store/Content-section relations match the legacy reader`
  **Independent Test:** A >500-char section content round-trips through
  `extractStructuredSections` and is stored uncapped in `kg_entities`.
  **Verification**:
  - Run: `pnpm test`
  - Expected: No existing extractor tests regress; a manual assertion on a
    >500-char section confirms uncapped storage

---

## Phase 2: Implementation

### 2.1 Implement `getObservationFactsFromKg` adapter — `src/store/index.ts`

- [x] 2.1 Add `getObservationFactsFromKg(input: ObservationFactsInput):
  ObservationFact[]` to `src/store/index.ts`. The method emits two unioned row
  groups per in-scope observation (not soft-deleted):
  - **Content rows**: `kg_triples ⋈ kg_entities ⋈ observations` filtered to
    `source_type = 'observation'` and relation IN
    (`HAS_WHAT`,`HAS_WHY`,`HAS_WHERE`,`HAS_LEARNED`).
    Mapping: `subject ← observations.title`, `observation_id ←
    kg_triples.source_id`, `relation ← kg_triples.relation`, `object ←
    kg_entities.canonical_name` (object entity), `created_at ←
    kg_triples.created_at`, `id ← kg_triples.id`, `project`/`topic_key`/`type`
    from `observations`.
  - **Synthesized metadata rows** (built in TS from the `observations` row,
    NOT from `kg_triples`): `HAS_TYPE` always; `IN_PROJECT` when `project` set;
    `HAS_TOPIC_KEY` when `topic_key` set. Reuse `buildObservationFacts`
    (`:1059-1066`) logic for synthesis. Stable synthetic `id` and `created_at ←
    observations.created_at`.
  - For all rows: `subject ← observations.title` (CL-3/CL-4 parity).
  - Deterministic order: by `observation_id` then stable group ordinal
    (metadata `HAS_TYPE`, `IN_PROJECT`, `HAS_TOPIC_KEY` first; then content
    rows by `kg_triples.id`).
  - Honor `observation_id`/`project`/`topic_key` filter inputs with legacy
    semantics.

  **[USN-2]** | Priority: P1
  **Spec:** `store/Store MUST Provide a KG-Backed ObservationFact Adapter`; `store/KG-Backed Adapter MUST Preserve ObservationFact Consumer Parity`; `knowledge-graph/Graph facts are served only from the knowledge graph`
  **Independent Test:** Call `getObservationFactsFromKg` against a seeded
  in-memory DB; verify 7 relations (3 metadata + 4 content), `subject=title`,
  deterministic order.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript compiles with no type errors in the new adapter method

### 2.2 Redirect `getObservationFacts` to the adapter — `src/store/index.ts`

- [x] 2.2 In `getObservationFacts` (`src/store/index.ts:2969-2996`), add a branch
  gated on `config.graphFactsSource`:
  - `'kg'` (default) → return `this.getObservationFactsFromKg(input)`
  - `'legacy'` → retain the existing `observation_facts` SQL query

  Indirect readers (`getObservatoryLedgerDetail` `:2503`, `formatProjectGraph`,
  HTTP `getProjectGraphFacts`) inherit the KG source with no change to their
  own code.

  **[USN-2]** | Priority: P1
  **Spec:** `store/getObservationFacts MUST Be Backed by the KG Adapter`; `store/Indirect readers inherit the KG source unchanged`
  **Independent Test:** Call `getObservationFacts` with `graphFactsSource='kg'`;
  confirm it delegates to the adapter. With `'legacy'`, confirm it queries
  `observation_facts`.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: No type errors; existing callers compile unchanged

### 2.3 Migrate `queryKnowledgeLane` — remove `factCandidates` branch — `src/store/index.ts`

- [x] 2.3 In `queryKnowledgeLane` (`src/store/index.ts:2002-2088`): under
  `graphFactsSource='kg'`, remove the `factCandidates` `observation_facts`
  branch (`:2060-2087`); the `tripleCandidates` branch (`:2040-2058`,
  `source:'kg_triples'`) becomes the sole KG-lane source. Under
  `graphFactsSource='legacy'`, retain the fallback branch.

  **[USN-2]** | Priority: P1
  **Spec:** `store/Knowledge-lane fallback branch is removed`; `knowledge-graph/Knowledge lane has a single graph source`
  **Independent Test:** Query with `graphFactsSource='kg'`; assert no candidate
  carries `source='observation_facts'`.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Compiles without error; `'observation_facts'` string absent from
    the `'kg'` code path

### 2.4 Remove ranking tiebreaker `observation_facts` special-case — `src/retrieval/ranking.ts`, `src/store/index.ts`

- [x] 2.4 Drop the `a.source === 'observation_facts' ? -1 : 1` tiebreaker
  (`src/store/index.ts:1785-1789`) under `graphFactsSource='kg'`; reduce to
  score-then-`observationId`. Annotate `LaneCandidate.source`
  (`src/retrieval/ranking.ts:21`) `'observation_facts'` member as legacy-only
  (kept for `'legacy'` flag path, never emitted on the `'kg'` path).

  **[USN-2]** | Priority: P1
  **Spec:** `store/Ranking tiebreaker no longer references observation_facts`; `store/All Direct observation_facts Readers MUST Be Migrated`
  **Independent Test:** Two candidates with equal score resolve by `observationId`
  descending, no `observation_facts` branch taken.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: No type errors; `'observation_facts'` tiebreaker absent from
    the `'kg'` path

### 2.5 Migrate relation-distinct listing and `getVisualizationRows` — `src/store/index.ts`

- [x] 2.5 Under `graphFactsSource='kg'`:
  - **Relation-distinct listing** (`:2666-2673`, visualization-filters options
    provider): source DISTINCT relations from the adapter's projection (call
    `getObservationFactsFromKg` or an equivalent SQL view over it) so it still
    exposes the FULL vocabulary: 4 content relations + synthesized
    `IN_PROJECT`/`HAS_TYPE`/`HAS_TOPIC_KEY`. MUST NOT collapse to KG-native
    labels.
  - **`getVisualizationRows`** (`:2683-2722`): source `f.relation, f.object`
    edges from the KG-backed adapter/projection; preserve the same row columns
    `buildVisualizationEdges` consumes (`o.id, session_id, title, type,
    project, topic_key, content, relation, object`). Under `'legacy'`, retain
    existing queries.

  **[USN-2]** | Priority: P1
  **Spec:** `store/Relation listing and visualization edges come from the KG`; `store/All Direct observation_facts Readers MUST Be Migrated`
  **Independent Test:** Relation listing returns 7 distinct relations (4 content
  + 3 metadata); `getVisualizationRows` returns same row shape.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Compiles; relation listing and visualization rows include all 7
    legacy relation labels

### 2.6 Remove schema DDL for `observation_facts` table and indexes — `src/store/schema.ts`

- [x] 2.6 Remove the `observation_facts` table DDL (`:280-292`) and its 3 indexes
  (`idx_observation_facts_observation`/`_project`/`_topic`, `:350-352`) from
  `SCHEMA_SQL` in `src/store/schema.ts` so fresh databases never create the
  table.

  **[USN-2]** | Priority: P1
  **Spec:** `store/observation_facts Table and Indexes MUST Be Removed (REMOVED req)`; `store/Schema Evolution MUST Preserve Existing Lexical Compatibility`
  **Independent Test:** A fresh in-memory DB initialized from `SCHEMA_SQL` has
  no `observation_facts` table.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: No compile errors; `observation_facts` string absent from
    `SCHEMA_SQL` after removal

### 2.7 Replace synchronous `refreshObservationFacts` calls with `writeDeterministicKgFacts` — `src/store/index.ts`

- [x] 2.7 In `saveObservation` (`:1483` upsert path and `:1513` create path) and
  `updateObservation` (`:1632`): under `graphFactsSource='kg'`, replace each
  `refreshObservationFacts(...)` call with `writeDeterministicKgFacts(this,
  observationId)` (imported from `src/indexing/jobs.ts`). Under
  `graphFactsSource='legacy'`, keep `refreshObservationFacts`. The call is
  made synchronously, before `saveObservation` returns, alongside the existing
  `planSemanticJobsForObservation` call. No LLM is invoked (constitution
  **P2**).

  **[USN-2]** | Priority: P1
  **Spec:** `knowledge-graph/Graph facts are queryable immediately after save`; `indexing/Save synchronously persists deterministic KG facts`; `store/Save no longer writes observation_facts`
  **Independent Test:** After a save with `graphFactsSource='kg'`, query
  `kg_triples` for the observation — rows exist before any job runs.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Save-path tests pass; no `refreshObservationFacts` called on
    the `'kg'` path

### 2.8 Guard delete-path to stop referencing `observation_facts` — `src/store/index.ts`

- [x] 2.8 In `deleteKnowledgeArtifactsForObservation` (`:1118-1121`): keep the
  `kg_triples` delete by `source_id`. Under `graphFactsSource='kg'` (or when
  the table is confirmed absent), remove / guard the `observation_facts` delete.
  Pre-drop / `'legacy'` path still cleans `observation_facts`.

  **[USN-2]** | Priority: P1
  **Spec:** `store/Delete path cleans KG facts and not the dropped table`
  **Independent Test:** Delete an observation; confirm `kg_triples` rows removed
  for that `source_id`; no SQL error about missing `observation_facts`.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Delete tests pass; `deleteKnowledgeArtifactsForObservation` does
    not reference `observation_facts` on the `'kg'` path

### 2.9 Repoint `rebuildObservationFacts` to rebuild the KG — `src/store/index.ts`, `src/cli.ts`

- [x] 2.9 In `rebuildObservationFacts` (`src/store/index.ts:2998-3029`): under
  `graphFactsSource='kg'`, iterate in-scope observations and call
  `writeDeterministicKgFacts(this, obs.id)` per observation instead of
  `replaceObservationFacts`. Keep the `{project?}` filter; return
  `RebuildObservationFactsResult` with `facts_deleted`/`facts_created` now
  counting triples written/cleared (OQ-2: keep field names). Under `'legacy'`,
  retain existing behavior. In `src/cli.ts` `handleRebuildGraph` (`:560-589`),
  adjust printed summary labels if needed but keep field names as-is per OQ-2.
  HTTP `POST /graph/rebuild` inherits this via the existing call chain.

  **[USN-2]** | Priority: P1
  **Spec:** `store/Rebuild Plumbing MUST Rebuild the KG-Backed Graph`; `indexing/rebuild-graph MUST Repoint to the Consolidated KG-Backed Path`; `store/Rebuild repopulates the knowledge graph`
  **Independent Test:** Call `rebuildObservationFacts({})` against a DB with
  existing observations; confirm `kg_triples` rows created, no
  `observation_facts` writes.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Rebuild tests pass; `kg_triples` populated for in-scope
    observations; `facts_created` count > 0 for non-empty observation sets

### 2.10 Add idempotent DROP to `runMigrationsWithSemantic` (OQ-3) — `src/store/migrations.ts`

- [x] 2.10 In `runMigrationsWithSemantic` (`src/store/migrations.ts:213`), inside
  the transaction, ordered LAST, add idempotent drops:
  ```sql
  DROP INDEX IF EXISTS idx_observation_facts_observation;
  DROP INDEX IF EXISTS idx_observation_facts_project;
  DROP INDEX IF EXISTS idx_observation_facts_topic;
  DROP TABLE IF EXISTS observation_facts;
  ```
  These MUST NOT be placed in the inert `MIGRATIONS_SQL` array in `schema.ts`
  (that array has no live runner). OQ-3: the drops are placed in the LIVE
  runner only.

  **[USN-2]** | Priority: P1
  **Spec:** `store/Drop step is idempotent across restarts`; `store/Drop executes only after prerequisites are verified`; OQ-3
  **Independent Test:** Run `runMigrationsWithSemantic` twice on an existing DB
  that had `observation_facts`; second run is a no-op without error.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Migration tests pass; `observation_facts` absent after migration
    runs; repeated migration runs complete without SQL errors

### 2.11 Migrate eval fixtures and `factsSourceChecks` — `src/evals/retrieval.ts`

- [x] 2.11 In `src/evals/retrieval.ts`:
  - **Fixtures** (`graph-lite`/`graph-rank`, `:674-685`): replace the two
    `INSERT INTO observation_facts` statements with KG seeding (`INSERT INTO
    kg_entities` + `INSERT INTO kg_triples`, `source_type='observation'`),
    preserving each fixture's retrieval purpose. Relations stay KG-native
    (`supports`, `DEPENDS_ON` — already used, no legacy-label dependency).
  - **`factsSourceChecks`** (`:769`, computed `:765-767`): redefine to pass
    when `tripleCandidates.length > 0` and source-attributed; remove the
    `factCandidates.length > 0` requirement and the `source ===
    'observation_facts'` filter (`:767`).

  **[USN-2]** | Priority: P1
  **Spec:** `evals/Facts-Source Eval MUST Assert on kg_triples`; `evals/Graph-Fact Eval Fixtures MUST Seed the Knowledge Graph`
  **Independent Test:** Run the retrieval eval (or its test harness); confirm
  `factsSourceChecks` passes on KG evidence alone; no `INSERT INTO
  observation_facts` remains.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Eval tests pass; no reference to `observation_facts` in fixture
    setup or assertions

---

## Phase 3: Testing

### 3.1 Adapter byte-for-byte parity tests — `tests/store/context.test.ts` or new `tests/store/kg-adapter.test.ts`

- [x] 3.1 Write unit tests for `getObservationFactsFromKg`:
  - Seed observations covering all 4 content sections + `type`/`project`/
    `topic_key`; run both the legacy `replaceObservationFacts` path AND the
    adapter; assert `getObservationFactsFromKg` output equals the legacy
    reader's output: same `subject` (= title), same 7 relations, same `object`
    values, same per-observation coverage, same deterministic order.
  - **Include a >500-char section fixture** (OQ-1): assert the adapter returns
    the full uncapped string as `object`, matching the legacy
    `extractStructuredFacts` result.
  - Assert `subject = observation.title` for every row (CL-3/CL-4).

  **[USN-3]** | Priority: P1
  **Spec:** `store/Content-section relations match the legacy reader`; `store/Adapter output ordering is deterministic`; OQ-1 parity test
  **Independent Test:** Tests run in isolation against an in-memory SQLite DB
  seeded for this suite only.
  **Verification**:
  - Run: `pnpm test -- tests/store/kg-adapter`
  - Expected: All parity assertions pass; >500-char section object equals
    legacy output byte-for-byte

### 3.2 Adapter filter and exclusion tests — same file as 3.1

- [x] 3.2 Write tests for:
  - `observation_id`/`project`/`topic_key` filters return only matching rows
    with legacy filter semantics.
  - Soft-deleted observation (`deleted_at` set) is excluded.
  - Triple with `source_type != 'observation'` is excluded.
  - Observation with no `project`/`topic_key` emits only `HAS_TYPE` metadata
    row (no `IN_PROJECT`/`HAS_TOPIC_KEY`).

  **[USN-3]** | Priority: P1
  **Spec:** `store/Adapter honors the same filters as the legacy reader`; `store/Adapter excludes deleted observations and non-observation sources`; `store/Metadata-derived relations match the legacy labels exactly`
  **Independent Test:** Each filter case can be verified independently by
  seeding a minimal fixture and asserting row count/content.
  **Verification**:
  - Run: `pnpm test -- tests/store/kg-adapter`
  - Expected: All filter and exclusion assertions pass

### 3.3 Migrated reader tests — `tests/store/context.test.ts`, `tests/tools/mem-project.test.ts`, existing reader tests

- [x] 3.3 Extend or add tests for each migrated reader under
  `graphFactsSource='kg'`:
  - `queryKnowledgeLane`: emits only `kg_triples` candidates; no candidate
    carries `source='observation_facts'`.
  - Ranking tiebreaker: two candidates with equal score resolve by
    `observationId`; no `'observation_facts'` source involved.
  - Relation-distinct listing: returns the full 7-relation vocabulary (4
    content + 3 synthesized metadata) when the adapter has data; MUST NOT
    collapse to KG-native-only labels.
  - `getVisualizationRows`: returns `relation`/`object` edges sourced from the
    adapter; same row columns consumed by `buildVisualizationEdges`.
  - `getObservatoryLedgerDetail` / `formatProjectGraph` / HTTP project graph:
    each renders identically whether source is KG or (pre-removal) legacy for
    the same observation data.

  **[USN-3]** | Priority: P1
  **Spec:** `store/Knowledge-lane fallback branch is removed`; `store/Ranking tiebreaker no longer references observation_facts`; `store/Relation listing and visualization edges come from the KG`; `store/Indirect readers inherit the KG source unchanged`; `tools/mem_project action=graph MUST Be KG-Backed and Behavior-Preserving`
  **Independent Test:** Each reader test seeds its own in-memory DB and asserts
  the specific behavior in isolation.
  **Verification**:
  - Run: `pnpm test`
  - Expected: All reader tests pass; `source='observation_facts'` never
    produced on `'kg'` path

### 3.4 Synchronous availability test — `tests/store/context.test.ts` or new file

- [x] 3.4 Test: after `saveObservation` returns (with NO job runner invoked),
  `getObservationFacts({observation_id})` returns the expected deterministic
  facts immediately. Assert:
  - At least one `HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED` row is present
    if the content has the corresponding section.
  - `HAS_TYPE` metadata row is present.
  - No LLM/embedding model was called (verify no embedding job was invoked or
    mock confirms no remote call).

  **[USN-3]** | Priority: P1
  **Spec:** `knowledge-graph/Graph facts are queryable immediately after save`; `indexing/Save synchronously persists deterministic KG facts`
  **Independent Test:** Runs in an isolated in-memory DB with the job runner
  disabled/unstarted.
  **Verification**:
  - Run: `pnpm test`
  - Expected: `getObservationFacts` returns non-empty facts immediately after
    save without any background job completion

### 3.5 Idempotency and update-safety tests — same suite

- [x] 3.5 Test:
  - Re-save the same observation: `kg_triples` count for that `source_id` MUST
    NOT grow on second save (converges to same triple count).
  - Run `writeDeterministicKgFacts` then `processKgJob` for the same
    observation: no duplicate equivalent triples (deduplicated by
    `triple_hash`).
  - Update observation content: stale triples replaced, not accumulated.

  **[USN-3]** | Priority: P1
  **Spec:** `knowledge-graph/Re-saving an observation does not duplicate triples`; `knowledge-graph/Synchronous and background paths converge for one observation`; `indexing/Synchronous write is idempotent on re-save`
  **Independent Test:** Each sub-case seeds a fresh in-memory DB and counts
  triples before/after to assert convergence.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Triple count does not grow on idempotency scenarios; no unique
    constraint violations

### 3.6 Graceful degrade pre-backfill test — same suite

- [x] 3.6 Test: insert an observation row directly (bypassing `saveObservation`,
  so no KG content triples exist). Assert:
  - `getObservationFactsFromKg` returns only synthesized metadata rows for the
    observation (for example `HAS_TYPE`, plus `IN_PROJECT`/`HAS_TOPIC_KEY` when
    present), and no content-section rows.
  - `mem_project action=graph` renders an empty-or-metadata-only valid ledger
    (no crash).
  - `queryKnowledgeLane` succeeds and returns zero graph candidates for content
    terms that are absent from KG triples (no error).

  **[USN-3]** | Priority: P1
  **Spec:** `knowledge-graph/Reader returns empty-but-valid output pre-backfill`; `tools/Project graph degrades gracefully before backfill`
  **Independent Test:** Insert raw observation row, then call each reader — no
  exceptions, empty-not-null returns.
  **Verification**:
  - Run: `pnpm test`
  - Expected: All three graceful-degrade assertions pass with no thrown errors

### 3.7 Rebuild repoint tests — `tests/store/context.test.ts` or CLI test

- [x] 3.7 Test `rebuildObservationFacts` and the CLI `rebuild-graph` path:
  - After rebuild, `kg_triples`/`kg_entities` populated for each in-scope
    observation; `observation_facts` table NOT written.
  - Repeated rebuild converges: no duplicate triples (`triple_hash` dedup).
  - `facts_created` > 0 for non-empty sets; field names unchanged (OQ-2).
  - HTTP `POST /graph/rebuild` also completes without error referencing
    `observation_facts`.

  **[USN-3]** | Priority: P1
  **Spec:** `store/Rebuild repopulates the knowledge graph`; `store/Rebuild does not reference the dropped table`; `indexing/Rebuild performs operator-triggered legacy backfill`; OQ-2
  **Independent Test:** Each scenario runs in an isolated in-memory DB.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Rebuild tests pass; `facts_created` field present; `kg_triples`
    rows created for covered observations

### 3.8 Migration idempotency and flag-rollback tests — `tests/store/context.test.ts` (migration section)

- [x] 3.8 Extend `tests/store/context.test.ts` (or migration-specific test file) to
  cover:
  - `runMigrationsWithSemantic` on a DB that had `observation_facts`: table and
    indexes are absent after migration.
  - Repeated `runMigrationsWithSemantic`: no SQL error (idempotent `IF EXISTS`).
  - `graphFactsSource='legacy'` path: `getObservationFacts` queries
    `observation_facts`; `refreshObservationFacts` is called on save; reads
    succeed when the table is still present.
  - Post-drop rollback simulation: re-add `CREATE TABLE IF NOT EXISTS
    observation_facts` DDL, run `rebuildObservationFacts`, confirm table
    repopulatable from observations.

  **[USN-3]** | Priority: P1
  **Spec:** `store/Drop step is idempotent across restarts`; `store/Flag-guarded cutover enables rollback without code revert`; `store/Post-drop rollback restores a derivable table`; OQ-3
  **Independent Test:** Each scenario uses a distinct in-memory DB; legacy path
  tests operate on a DB that still has the `observation_facts` table DDL.
  **Verification**:
  - Run: `pnpm test`
  - Expected: All migration and rollback assertions pass without SQL errors

### 3.9 Evals `kg_triples` and fixture tests — `tests/` eval harness

- [x] 3.9 Test that:
  - `factsSourceChecks` passes on `kg_triples` evidence alone (no
    `observation_facts` source required).
  - No eval path inserts into `observation_facts` or filters `source ===
    'observation_facts'`.
  - Graph-lane candidates from the `graph-lite`/`graph-rank` fixtures are
    KG-sourced (`source='kg_triples'`).

  **[USN-3]** | Priority: P1
  **Spec:** `evals/Facts-source check passes on KG-sourced evidence`; `evals/No eval path inserts into observation_facts`; `evals/Graph fixtures populate KG-lane evidence`
  **Independent Test:** Run the retrieval eval suite; inspect candidate sources.
  **Verification**:
  - Run: `pnpm test`
  - Expected: `factsSourceChecks` passes; no `observation_facts`-related
    failures in eval output

### 3.10 Export/import unchanged test — `tests/store/context.test.ts`

- [x] 3.10 Assert:
  - `exportData` output contains only `sessions`/`observations`/`prompts`;
    `version` unchanged.
  - `importData` round-trip succeeds and produces no reference to
    `observation_facts` or `kg_triples`.

  **[USN-3]** | Priority: P2
  **Spec:** `store/Export shape is unchanged after removal`; `store/Import round-trip is unaffected by the removal`
  **Independent Test:** Run export → import in an in-memory DB; diff the export
  shape against the expected schema.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Export version unchanged; no `observation_facts` key in export
    payload

### 3.11 Migrate and retire legacy test suite references to `observation_facts` — multiple test files

- [x] 3.11 Update every pre-existing test file that references `observation_facts`
  so none operates on the dropped table under the default `graphFactsSource='kg'`
  path. Per-file actions:

  - **`tests/store/schema.test.ts` (~:43, :78-80):** Change assertions that
    require the `observation_facts` TABLE and its 3 indexes
    (`idx_observation_facts_observation`, `idx_observation_facts_project`,
    `idx_observation_facts_topic`) to EXIST → assert their ABSENCE after schema
    initialization (a fresh DB under the new `SCHEMA_SQL` must not contain them).
    These become intentional-absence assertions; they are the ONLY place in the
    test suite where `observation_facts` may be named after this task completes.

  - **`tests/store/graph-lite.test.ts` (whole file, e.g. ~:165-184, :205-212):**
    PORT behavioral assertions onto the consolidated path:
    - Replace every `INSERT INTO observation_facts` / `DELETE FROM
      observation_facts` seed with `saveObservation(...)` + call to
      `writeDeterministicKgFacts(store, observationId)` so the KG lane holds the
      same data.
    - Keep the same relation/object assertions — exercise them via
      `getObservationFactsFromKg` (the adapter) and assert identical outputs
      (byte-for-byte parity with the legacy reader results).
    - Remove any direct DDL references to the legacy table or its indexes.
    - Rollback and migration-flag behavior belongs in the dedicated migration/
      rollback suite (task 3.8), not here.

  - **`tests/store/index.test.ts` (~:900, :1150-1197):** Update assertions of the
    form `evidence.primary.source === 'observation_facts'` → `=== 'kg_triples'`
    (the consolidated lane source). Confirm surrounding assertions still hold
    (candidate content, score ordering, etc.).

  - **`tests/store/visualization.test.ts` (~:91-95, :143, :223, :251),
    `tests/http-viz.test.ts` (~:55), `tests/cli.test.ts` (~:73):** Reseed graph
    data via `saveObservation` + `writeDeterministicKgFacts` (or direct
    `kg_triples`/`kg_entities` inserts) instead of `INSERT INTO observation_facts`
    / `DELETE FROM observation_facts`. Assertions on rendered output, HTTP
    responses, and CLI output remain unchanged — only the seed mechanism changes.

  - **Catch-all:** After completing the per-file actions above, run:
    ```
    grep -r "observation_facts" tests/
    ```
    and confirm ZERO remaining matches except for intentional-absence assertions in
    `tests/store/schema.test.ts` and explicit legacy/rollback fixtures that create
    the table under `graphFactsSource='legacy'`. Any default-path hit is a missed
    migration and MUST be resolved before Phase 4.

  **[USN-3]** | Priority: P1
  **Spec:** store delta — table removal / adapter parity (task 2.6 removes DDL,
  task 2.10 adds DROP migration, task 2.1 provides the adapter); this task makes
  pre-existing tests consistent with those removals.
  **Independent Test:** Each named test file compiles and its suite passes against
  a DB initialized under `graphFactsSource='kg'` (default) with no
  `observation_facts` table present.
  **Verification**:
  - Run: `pnpm test`
  - Expected: The named suites pass with no default-path `observation_facts`
    references; `grep -r "observation_facts" tests/` returns only
    intentional-absence assertions in `tests/store/schema.test.ts` and explicit
    legacy/rollback fixtures.

---

## Phase 4: Verification and Close

### 4.1 Full test suite and build pass

- [x] 4.1 Run the full test suite and build to confirm all phases are integrated
  and passing. Update the phase 1-3 task checkboxes to `[x]` as each is
  verified. No regressions in any pre-existing test.

  **[USN-4]** | Priority: P1
  **Spec:** All spec scenarios; verify rules `test_command: pnpm test`, `build_command: pnpm run build`
  **Independent Test:** N/A — this is the integration gate.
  **Verification**:
  - Run: `pnpm test && pnpm run build`
  - Expected: All tests pass (zero failures); build produces output artifacts
    with no TypeScript errors

---

## Execution Order

Infrastructure (Phase 1) runs first and is ordered by dependency: config flag
(1.1) must precede any gated branch; the no-LLM helper extraction (1.2) must
precede its call sites (2.7, 2.9); the cap removal (1.3) must precede parity
tests (3.1). Implementation (Phase 2) is strictly sequenced — adapter (2.1)
before its redirect (2.2), reader migrations (2.3-2.5) after the adapter,
schema DDL removal (2.6) before migration DROP (2.10), sync write (2.7) before
legacy-write removal (2.8), rebuild repoint (2.9) before DROP (2.10), evals
last (2.11). Testing (Phase 3) runs after corresponding implementation tasks
with the ordering: parity (3.1) → filters (3.2) → readers (3.3) → sync
availability (3.4) → idempotency (3.5) → graceful degrade (3.6) → rebuild
(3.7) → migration/rollback (3.8) → evals (3.9) → export/import (3.10) →
legacy test migration (3.11).
Verification (Phase 4, task 4.1) is the gate that closes the change. Task 3.11
MUST complete before 4.1 — it is the prerequisite that makes the "no regressions"
gate satisfiable.

Migration ordering within Phase 2 follows the design's required sequence:
backfill helper ready (1.2) → adapter live (2.1) → readers migrated (2.2-2.5)
→ schema DDL cleaned (2.6) → sync write enabled (2.7) → delete path guarded
(2.8) → rebuild repointed (2.9) → DROP migration placed last (2.10) → evals
(2.11).
