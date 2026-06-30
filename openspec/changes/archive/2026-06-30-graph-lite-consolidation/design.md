# Design: Graph-Lite Consolidation (B1)

> Sub-change **B1** of Change B. Makes `kg_triples` (+ `kg_entities`) the single
> source of graph-derived facts and retires the redundant `observation_facts`
> precursor. **Scope is B1 only**: byte-for-byte parity of the legacy 7-relation
> `ObservationFact` projection, no B2 multi-hop, no B3 temporal/supersedes, no
> `/graph` endpoint removal, no richer-relation surfacing.

## Technical Approach

The legacy `observation_facts` table is a deterministic, synchronously-written
precursor whose 7 relations are a lossy subset of the rich KG. We consolidate
onto `kg_triples`+`kg_entities` while keeping every observable output identical,
in this order:

1. **Adapter (A):** add `getObservationFactsFromKg` — a hybrid-source builder
   that returns the legacy `ObservationFact[]` shape from the KG (content
   relations) plus synthesized metadata rows (from `observations` columns).
2. **Reader migration (B):** redirect `getObservationFacts` to the adapter so
   indirect readers inherit it; migrate the 4 direct `observation_facts` SQL
   sites.
3. **Synchronous deterministic write (CL-1):** extract a no-LLM helper from the
   inline logic in `processKgJob` and call it on save/update/upsert so graph
   facts are queryable immediately, matching the retired synchronous writer.
4. **Backfill (CL-2):** operator-triggered via repointed `rebuild-graph --all`;
   readers degrade gracefully (empty-but-valid) until it runs.
5. **Stop legacy writes (D):** remove the 3 `refreshObservationFacts` calls and
   the delete-path reference.
6. **Drop table (E):** idempotent `DROP TABLE/INDEX IF EXISTS`, ordered LAST.

A config flag `graphFactsSource` (`legacy` | `kg`) guards the cutover for
reversibility without a code revert.

## Architecture Decisions

### Decision: Hybrid-source adapter (content from KG, metadata synthesized, subject = title)

**Choice.** `getObservationFactsFromKg` emits two unioned row groups per in-scope
observation:
- **4 content relations** (`HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED`) from
  `kg_triples ⋈ kg_entities` (object side) ⋈ `observations` (for `type` and the
  `deleted_at IS NULL` guard), filtered to `source_type = 'observation'` and to
  those 4 relations. `object ← kg_entities.canonical_name`,
  `relation ← kg_triples.relation`, `created_at ← kg_triples.created_at`,
  `id ← kg_triples.id`.
- **3 metadata relations** (`HAS_TYPE` always; `IN_PROJECT` when `project` set;
  `HAS_TOPIC_KEY` when `topic_key` set) **synthesized directly from the
  `observations` row**, reproducing `buildObservationFacts`
  (`src/store/index.ts:1059-1066`) exactly. These are NOT read from `kg_triples`.
- For **both** groups, `subject ← observations.title` (every row), matching the
  legacy builder which set `subject = observation.title` for every fact
  (`replaceObservationFacts`, `src/store/index.ts:1081`).

**Alternatives considered.**
- *(a)* Remap `kg_triples.relation` to legacy labels and read all 7 relations
  from the KG. Rejected: the KG's metadata-native labels are `BELONGS_TO`
  (project, conf 0.86) and `HAS_TOPIC` (topic_key, conf 0.84) — see
  `kg-extractor.ts:438-443` — and there is no KG-native `HAS_TYPE` at all. A
  remap layer would be lossy and fragile.
- *(b)* Accept KG-native subject (`kg_entities.canonical_name`, derived from
  `subjectHint = topic_key ?? title`, `jobs.ts:431`) and migrate consumers.
  Rejected: `mem_project action=graph` renders `${fact.subject} -- ${relation}
  --> ${object}` (`project-views.ts:38`), so changing `subject` changes
  observable output — violates the B1 parity contract (CL-4).

**Rationale.** The two relation groups have **different, independently-derivable
sources**, so byte-for-byte parity is achievable without relation remapping:
the 4 content relations already come from the same `STRUCTURED_SECTION_RELATIONS`
section parser the legacy builder used (`kg-extractor.ts:105-110` vs.
`extractStructuredFacts`), and the 3 metadata relations were never real graph
edges — the legacy builder always synthesized them from observation columns. The
adapter therefore reproduces the legacy builder's exact output by synthesizing
metadata locally and taking only content relations from the KG. `subject = title`
preserves the rendered ledger line.

> **Parity risk surfaced (must be handled in implementation, not deferred):** the
> KG section parser caps each section object at **500 chars**
> (`extractStructuredSections`, `kg-extractor.ts:194`,
> `object.slice(0, 500)`), whereas the legacy `extractStructuredFacts`
> (`store/index.ts:1032-1036`) stores the section value **uncapped**. For section
> content > 500 chars the KG object is a truncated prefix of the legacy object,
> breaking byte-for-byte parity. The deterministic synchronous-write helper (next
> decision) **owns this** and MUST reuse the legacy `extractStructuredFacts`
> verbatim semantics for section objects (no 500-cap) so the persisted
> `kg_entities.canonical_name` equals the legacy object string. See Open
> Questions OQ-1.

### Decision: Single source of truth via synchronous deterministic write extracted from `processKgJob`

**Choice.** Extract the deterministic entity-upsert + triple insert/replace block
that currently lives **inline** in `processKgJob`
(`src/indexing/jobs.ts:462-513`) into a reusable, exported, no-LLM helper
(working name `writeDeterministicKgFacts(store, observationId)` in
`src/indexing/jobs.ts`). Call it **synchronously** in `saveObservation`
(create + upsert branches) and `updateObservation`, beside the existing
`planSemanticJobsForObservation` call. `processKgJob` then calls the same helper
for the deterministic pass and keeps the optional LLM enrichment branch
(`jobs.ts:444-460`).

**Alternatives considered.**
- Duplicate the deterministic write logic in the store. Rejected: two copies of
  the entity-key/`triple_hash` logic drift; the spec explicitly requires reuse.
- Accept eventual graph facts (rely on the `extract_kg` job only). Rejected by
  CL-1: regresses the immediate availability the synchronous `observation_facts`
  writer provided.

**Rationale.** The deterministic extractor `extractKnowledgeTriples`
(`kg-extractor.ts:364`) already runs **first** in `processKgJob`
(`jobs.ts:441`) before any optional LLM step, and the persist block is already
idempotent: it `DELETE`s the observation's triples by `source_id` then re-inserts
with `ON CONFLICT(triple_hash) DO UPDATE` (`jobs.ts:484-513`). Factoring exactly
that block yields a no-model, idempotent, update-safe write reusable by both
save and the job. Provenance/confidence/extractor-version metadata are written
identically, so synchronously-written triples are indistinguishable from
background-written ones (knowledge-graph delta "KG Records MUST Preserve
Provenance").

> **Helper shape (concrete):** the helper takes `(store, observationId)`, loads
> the observation row (same `SELECT` as `jobs.ts:420`), runs
> `extractKnowledgeTriples` with the deterministic input (no `llmTriples`), and
> performs the taxonomy upsert + `DELETE`-by-`source_id` + entity-upsert +
> triple-insert loop (`jobs.ts:462-513`). `processKgJob` calls it for the
> deterministic pass, then, only when `strategy.llmFallback === 'recommended'`
> and an extractor is configured, re-runs `extractKnowledgeTriples` with
> `llmTriples` and re-persists (enrichment). The synchronous save path passes
> NO extractor, so it never invokes an LLM (constitution **P2**).

### Decision: Operator-triggered backfill + graceful degrade (not auto-startup)

**Choice.** Backfill of legacy already-saved observations is operator-triggered
via the repointed `rebuild-graph --all` CLI command (documented upgrade step),
not an automatic startup migration. The KG-backed readers degrade gracefully:
observations with no KG facts yet contribute zero rows; no read raises.

**Alternatives considered.** Auto-run backfill at startup. Rejected by CL-2:
heavy and risks long startup on large DBs; the synchronous write already covers
all *new* writes, so only legacy rows need the one-time pass.

**Rationale.** The adapter's reads are plain `LEFT`/`INNER` joins that naturally
return fewer rows when KG facts are absent — no special-casing needed. Operator
control keeps startup cheap and matches the existing `rebuild-graph` operator
ergonomics. Idempotency of the deterministic write (dedupe by `triple_hash`)
makes repeated/partial backfill safe.

### Decision: Flag-guarded cutover (`graphFactsSource`) for reversibility

**Choice.** Add a config field `graphFactsSource: 'legacy' | 'kg'` (mirrors the
existing enum/boolean config style, e.g. `httpDisabled` `config.ts:57`,
`kgLlm` `config.ts:61`). It gates BOTH (a) the reader source inside
`getObservationFacts`/`queryKnowledgeLane`/relation-listing/`getVisualizationRows`
and (b) write behavior (when `legacy`, re-enable `refreshObservationFacts` and
suppress the synchronous KG write's role as sole writer). Default ships as `kg`
(consolidated) per the locked contract, with `legacy` available for rollback.

**Alternatives considered.** Code-revert-only rollback. Rejected: the spec and
the repo's established sentinel/flag rollback discipline require a config-level
switch so operators can revert without redeploying.

**Rationale.** Reversibility is required while the table still exists (store
delta "Flag-guarded cutover enables rollback without code revert"). The flag is
read once where the source branches; it does not leak into the adapter's SQL.

## Data Flow

### (a) Observation save -> synchronous deterministic KG write -> immediate adapter read

```mermaid
sequenceDiagram
    participant Caller
    participant Store as Store.saveObservation
    participant Helper as writeDeterministicKgFacts
    participant Extractor as extractKnowledgeTriples (no LLM)
    participant DB as SQLite (kg_entities/kg_triples)
    participant Job as extract_kg (background, optional)

    Caller->>Store: saveObservation(input)
    Store->>DB: INSERT observation (primary persist + FTS)
    Store->>Helper: writeDeterministicKgFacts(store, obsId)   %% replaces refreshObservationFacts
    Helper->>Extractor: extract(content, project, topicKey)   %% deterministic only
    Extractor-->>Helper: triples (sections uncapped, see OQ-1)
    Helper->>DB: DELETE kg_triples WHERE source_id=obsId
    Helper->>DB: upsert kg_entities + INSERT kg_triples ON CONFLICT(triple_hash)
    Store->>Store: planSemanticJobsForObservation (enqueues extract_kg + semantic)
    Store-->>Caller: SaveResult  %% graph facts already queryable

    Note over Caller,DB: Immediately after save:
    Caller->>Store: getObservationFacts({observation_id})
    Store->>DB: adapter query (content rows) + synthesize metadata rows
    DB-->>Store: ObservationFact[] (7 relations, subject=title)
    Store-->>Caller: facts (no background completion required)

    Job-->>DB: (later, optional) LLM enrichment only; failure-isolated
```

### (b) Migration / cutover order (with graceful-degrade-pre-backfill branch)

```mermaid
sequenceDiagram
    participant Op as Operator
    participant CLI as rebuild-graph --all
    participant Store
    participant Cfg as config.graphFactsSource
    participant Mig as runMigrationsWithSemantic

    Note over Store: Step 1 (A+B) adapter + readers land (additive; both stores exist)
    Note over Cfg: Step 2 cutover flag -> 'kg' (readers use adapter; sync write active)

    alt backfill not yet run (legacy rows)
        Store->>Store: adapter read returns empty-but-valid for legacy obs
        Store-->>Op: recall/graph/ledger still succeed (no crash)
    end

    Op->>CLI: rebuild-graph --all        %% Step 3 backfill
    CLI->>Store: rebuildObservationFacts({project?})
    Store->>Store: writeDeterministicKgFacts per in-scope observation
    Note over Store: legacy rows now covered; dedup by triple_hash

    Note over Store: Step 4 (D) remove refreshObservationFacts calls + delete-path ref
    Note over Mig: Step 5 (E) DROP TABLE/INDEX IF EXISTS observation_facts (LAST, idempotent)
```

## File Changes

> Anchors verified against the working tree. Where the proposal's line refs
> drifted, the corrected anchor is given.

### `src/store/index.ts`
- **NEW `getObservationFactsFromKg(input: ObservationFactsInput): ObservationFact[]`.**
  Hybrid query (content rows from `kg_triples ⋈ kg_entities ⋈ observations`,
  filtered `source_type='observation'`, `deleted_at IS NULL`, relation IN the 4
  content relations) UNION synthesized metadata rows built in TS from the joined
  `observations` row (reuse `buildObservationFacts` logic). `subject = title` for
  all rows. Honor `observation_id`/`project`/`topic_key` filters with the legacy
  meaning. **Deterministic ORDER** (e.g. `observation_id`, then a stable group
  ordinal: metadata `HAS_TYPE`,`IN_PROJECT`,`HAS_TOPIC_KEY` then content rows by
  `kg_triples.id`) so output is stable across calls.
- **`getObservationFacts` (`:2969-2996`)** — redirect to the adapter, gated by
  `graphFactsSource` (`kg` -> adapter; `legacy` -> existing
  `observation_facts` query). Indirect readers
  (`getObservatoryLedgerDetail` `:2503`, `formatProjectGraph`, HTTP
  `getProjectGraphFacts`) inherit it unchanged.
- **`queryKnowledgeLane` (`:2002-2088`)** — remove the `factCandidates`
  `observation_facts` branch (`:2060-2087`); the `tripleCandidates` branch
  (`:2040-2058`, already `source:'kg_triples'`) becomes the sole KG-lane source.
  Under `graphFactsSource='legacy'`, retain the fallback branch.
- **Ranking tiebreaker (`:1785-1789`)** — drop
  `a.source === 'observation_facts' ? -1 : 1`; reduce to score-then-
  `observationId`.
- **Relation-distinct listing (`:2666-2673`)** — source DISTINCT relations from
  the adapter's projection (a KG-backed `ObservationFact` view) so it still
  exposes the FULL vocabulary: 4 content relations + synthesized
  `IN_PROJECT`/`HAS_TYPE`/`HAS_TOPIC_KEY`. MUST NOT collapse to KG-native labels.
  (Lives in the visualization-filters options provider; method-name note in
  store delta Assumptions — target is this read regardless of name.)
- **`getVisualizationRows` (`:2683-2722`)** — source `f.relation, f.object` edges
  from the KG-backed adapter/projection instead of `observation_facts`; preserve
  the same row columns the downstream `buildVisualizationEdges` consumes
  (`o.id, session_id, title, type, project, topic_key, content, relation, object`).
- **Remove the 3 `refreshObservationFacts` calls:** upsert path (`:1483`),
  create path (`:1513`), `updateObservation` (`:1632`). Replace each with the
  synchronous deterministic KG write (call `writeDeterministicKgFacts`). Under
  `graphFactsSource='legacy'`, keep `refreshObservationFacts`.
- **`deleteKnowledgeArtifactsForObservation` (`:1118-1121`)** — keep the
  `kg_triples` delete by `source_id`; drop the `observation_facts` delete once
  the table is gone (guard so pre-drop/legacy still cleans it).
- **`rebuildObservationFacts` (`:2998-3029`)** — repoint to rebuild the KG-backed
  graph: iterate in-scope observations and call `writeDeterministicKgFacts` per
  observation instead of `replaceObservationFacts`. Keep the `{project?}` input;
  return a meaningful result (repurpose `facts_deleted`/`facts_created` to triple
  counts or rename in the result type — see OQ-2). This is the operator backfill.
- **`replaceObservationFacts`/`buildObservationFacts` (`:1059-1096`)** — keep
  `buildObservationFacts` (reused by the adapter's metadata synthesis);
  `replaceObservationFacts`/`refreshObservationFacts` retained only for the
  `legacy` flag path, removed when the table is dropped.

### `src/indexing/jobs.ts`
- **NEW exported `writeDeterministicKgFacts(store, observationId)`** — factor the
  deterministic block (`:462-513`: taxonomy upsert, `DELETE` by `source_id`,
  entity upsert, triple insert) into a no-LLM helper. **Reuse legacy section
  semantics (no 500-cap, OQ-1).**
- **`processKgJob` (`:418-515`)** — call the helper for the deterministic pass;
  retain the optional LLM enrichment branch (`:444-460`) with failure isolation
  (`try/catch` already present, `:456-460`).

### `src/indexing/kg-extractor.ts`
- **`extractStructuredSections` (`:185-214`)** — align section-object semantics
  with the legacy `extractStructuredFacts` for parity: remove/relax the
  `object.slice(0, 500)` cap (`:194`) on the deterministic path used by the
  synchronous write, OR introduce a parity-preserving section extraction the
  helper uses. (OQ-1 — least-risk option is to drop the 500-cap for section
  relations so `canonical_name` matches the legacy object byte-for-byte.)

### `src/retrieval/ranking.ts`
- **`LaneCandidate.source` (`:21`)** — the `'observation_facts'` member becomes
  unused under `kg`. Keep the union member (still produced under `legacy`) but
  ensure no `kg`-path code emits it; optionally annotate as legacy-only.

### `src/store/schema.ts`
- Remove the `observation_facts` table DDL (`:280-292`) and its 3 indexes
  (`:350-352`) from `SCHEMA_SQL` so fresh DBs never create it.

### `src/store/migrations.ts` (the REAL migration runner)
- **In `runMigrationsWithSemantic` (`:213`), inside the transaction, ordered
  LAST**, add idempotent drops:
  `db.exec('DROP INDEX IF EXISTS idx_observation_facts_observation')`,
  `..._project`, `..._topic`, then
  `db.exec('DROP TABLE IF EXISTS observation_facts')`.
  > **Discrepancy resolved (vs. spec CL-6):** the spec/proposal say to append to
  > `MIGRATIONS_SQL` (`schema.ts:368`), but that array is **not consumed by any
  > runner** (only re-exported; the live runner is `runMigrationsWithSemantic`
  > using `LEGACY_COLUMN_MIGRATIONS`). The DDL-drop intent (idempotent
  > `IF EXISTS`, final-step ordering) is honored by placing the drops in the
  > real runner. See OQ-3.

### `src/config.ts`
- Add `graphFactsSource?: 'legacy' | 'kg'` to the config type (`~:50-62`) and
  default it (`kg`) in the resolver; allow override via persisted config / env
  (mirror `httpDisabled`/`kgLlm` handling around `:420-432`). Update
  `config.schema.json` accordingly.

### `src/cli.ts`
- **`handleRebuildGraph` (`:560-589`)** — no signature change; it already calls
  `store.rebuildObservationFacts({ project })` which is repointed. Adjust the
  printed summary labels if the result fields are renamed (OQ-2). `--all`/
  `--project` semantics unchanged; dispatch (`:700`) unchanged.

### `src/http-routes.ts`
- **`getProjectGraphFacts` (`:307-311`)** — inherits the adapter via
  `getObservationFacts`; `relation` filter still applies. **`/graph` endpoint
  behavior preserved.** HTTP `POST /graph/rebuild` inherits the repointed
  `rebuildObservationFacts`.

### `src/evals/retrieval.ts`
- **Fixtures `graph-lite`/`graph-rank` (`:674-685`)** — replace the two
  `INSERT INTO observation_facts` statements with KG seeding (insert
  `kg_entities` + `kg_triples`, `source_type='observation'`), preserving each
  fixture's retrieval purpose (the fixtures use KG-native relations `supports`/
  `DEPENDS_ON` already, so no legacy-label dependency).
- **`factsSourceChecks` (`:769`, computed via `:765-767`)** — redefine: pass when
  `tripleCandidates.length > 0` (and source-attributed); drop the
  `factCandidates.length > 0` requirement and the
  `source === 'observation_facts'` filter (`:767`).

### `src/store/types.ts`
- `ObservationFact` (`:92-102`) — **unchanged** (the adapter's return type).
  `RebuildObservationFactsResult` may change field names if OQ-2 renames.

## Interfaces / Contracts

- **`getObservationFactsFromKg(input: ObservationFactsInput): ObservationFact[]`**
  — same input/output contract as `getObservationFacts`. Returns the 7-relation
  set per the parity rules above. Deterministic order.
- **`writeDeterministicKgFacts(store: Store, observationId: number): void`**
  (export from `jobs.ts`) — no-LLM, idempotent, update-safe deterministic KG
  write for one observation. Used by save/update/upsert, the rebuild loop, and
  the deterministic pass of `processKgJob`.
- **`config.graphFactsSource: 'legacy' | 'kg'`** — cutover/rollback switch.
- **Preserved contracts:** `ObservationFact` shape; MCP six-tool surface;
  `GET /projects/{project}/graph`; `POST /graph/rebuild`; CLI `rebuild-graph`;
  export/import `version: 1` (serializes only sessions/observations/prompts —
  `exportData` `:3156`, `importData` `:3195`, never touches graph tables).

## Testing Strategy

vitest, in-memory SQLite, `pnpm test`.

1. **Adapter byte-for-byte parity.** Seed observations covering all 4 content
   sections + `type`/`project`/`topic_key`; run the legacy
   `replaceObservationFacts` path AND the KG path; assert
   `getObservationFactsFromKg` output equals the pre-consolidation
   `getObservationFacts` output: same `subject`(=title), same 7 relations, same
   `object` values, same per-observation coverage, same order. **Include a
   >500-char section fixture** to lock the OQ-1 cap fix.
2. **Filter + exclusion semantics.** `observation_id`/`project`/`topic_key`
   filters; soft-deleted observation excluded; non-`observation` `source_type`
   excluded.
3. **Each migrated reader.** `queryKnowledgeLane` emits only `kg_triples`
   candidates (no `observation_facts` source); ranking tiebreaker resolves by
   `observationId`; relation-distinct listing exposes full vocabulary incl.
   synthesized metadata relations; `getVisualizationRows` edges come from KG;
   `getObservatoryLedgerDetail`/`formatProjectGraph`/HTTP project graph render
   identically.
4. **Synchronous availability.** Immediately after `saveObservation` (no job
   run), `getObservationFacts({observation_id})` returns the deterministic facts;
   assert no LLM/embedding invoked.
5. **Idempotency/update-safety.** Re-save and re-rebuild converge (no duplicate
   triples, dedup by `triple_hash`); background `extract_kg` after sync write
   adds no duplicate equivalent triples.
6. **Graceful degrade pre-backfill.** Insert an observation row directly (no KG
   facts), assert adapter returns empty-but-valid and `mem_project action=graph`
   / recall succeed without error.
7. **rebuild-graph repoint.** CLI/`rebuildObservationFacts`/HTTP rebuild populate
   `kg_triples`/`kg_entities` and never write `observation_facts`; repeated runs
   converge.
8. **Migration + rollback.** Drop step is idempotent across repeated
   `runMigrationsWithSemantic` (extend `tests/store/migration.test.ts`); flag
   `legacy` restores `observation_facts` reads + writer; post-drop rollback =
   re-add idempotent DDL + rebuild repopulates with no data loss.
9. **Evals.** `factsSourceChecks` passes on `kg_triples` evidence alone; no eval
   path inserts into `observation_facts` or filters
   `source === 'observation_facts'`.
10. **Export/import unchanged.** `exportData` contains only
    sessions/observations/prompts with unchanged `version`; round-trip
    unaffected.

## Migration / Rollout

- **Versioning: MINOR** (CL-5). Internal destructive table drop with a
  reconstructable, operator-triggered deterministic backfill and NO
  public-contract breakage (`/graph`, export `version`, MCP tools, CLI names all
  preserved). Final label confirmed at release.
- **Ordering:** adapter+readers (additive) -> flag to `kg` -> `rebuild-graph
  --all` backfill (verify coverage parity) -> stop legacy writes -> `DROP` table
  LAST.
- **Rollback (staged):** before drop, set `graphFactsSource='legacy'` (reads from
  `observation_facts`, writer re-enabled) — no code revert. After drop, re-add
  idempotent `CREATE TABLE/INDEX IF NOT EXISTS` DDL + run `rebuild-graph` (a
  SQLite backup before E is the belt-and-suspenders path).
- **Upgrade doc:** `rebuild-graph --all` is a required post-upgrade step to
  backfill legacy observations; until run, graph reads for legacy rows are empty
  but valid.

## Open Questions

- **OQ-1 (parity-critical, recommend resolve in `sdd-tasks`):** the KG section
  parser caps section objects at 500 chars (`kg-extractor.ts:194`); legacy is
  uncapped. **Recommended:** drop the 500-cap on the deterministic section path
  so `kg_entities.canonical_name` matches the legacy object byte-for-byte. If the
  cap must stay (e.g. entity-size hygiene), the parity contract for >500-char
  sections must be explicitly relaxed in the spec — but that contradicts the
  locked "byte-for-byte" requirement, so removing the cap is the design's
  recommendation.
- **OQ-2 (minor):** `RebuildObservationFactsResult` fields
  (`facts_deleted`/`facts_created`) describe legacy facts. Repointed rebuild
  writes triples — rename to triple-centric fields (and update the CLI summary
  `cli.ts:581-587`) or keep names as generic counts. Recommend keep the field
  names (generic "facts" == graph facts) to avoid a result-shape change.
- **OQ-3 (resolved here, flagged for reviewer):** spec CL-6 names
  `MIGRATIONS_SQL` (`schema.ts:368`) as the drop site, but that array is inert
  (no runner consumes it). The drop is placed in the live runner
  `runMigrationsWithSemantic` (`migrations.ts:213`), preserving the
  idempotent-`IF EXISTS` + final-ordering intent. Confirm this substitution is
  acceptable (it must be — the spec's mechanism does not exist in this tree).
