# Tasks: Bounded Retention for Superseded KG Triples (Change C1)

> **Scope**: C1 (`kg-superseded-pruning`) closes the B3 supersession lifecycle by
> pruning OLD superseded `kg_triples` rows while never touching current facts,
> keeping the `kgSupersededKeepN` most-recent superseded rows per slot as
> recoverable history. Builds on shipped+archived B1 (`graph-lite-consolidation`),
> B2 (`kg-multi-hop-recall`), and B3 (`kg-supersedes-edges`). All architecture
> forks are LOCKED in clarify (slot key, hook point, master-flag default, keep-N
> default+scope); this plan implements the design's 8 Architecture Decisions
> without re-opening them.
>
> **Core primitive**: a plain, shared function `runSupersededPrune(db, opts)`
> (no `db.transaction()` inside — better-sqlite3 does not support nested
> transactions) wrapped transactionally by `store.pruneSupersededTriples(...)`
> for the manual op, and called directly (inheriting the caller's open
> transaction) from inside `persistKgExtraction` for the automatic path. See
> design.md Decision 2 and Decision 3 for the load-bearing transaction-discipline
> proof.

## Traceability Note

Every task carries a `Spec:` tag tracing to:
- `knowledge-graph/spec.md` (C1 delta) — bounded-retention KG requirements
- `store/spec.md` (C1 delta) — `pruneSupersededTriples` / referential-safety requirements
- `config/spec.md` (C1 delta) — pruning-knob requirements
- `indexing/spec.md` (C1 delta, NEW domain) — `prune-graph` CLI/HTTP admin-op requirements
- `retrieval/spec.md` (C1 delta) — retrieval-unchanged / flag-off byte-identity requirements
- `tools/spec.md` (C1 delta) — MCP-surface-unchanged requirements
- `evals/spec.md` (C1 delta) — retention eval + no-regression gate requirements
- `design.md` — Architecture Decisions 1-8, File Changes, Data Flow, Testing Strategy

---

## Phase 1: Infrastructure

- [x] 1.1 Add three C1 config knobs to `KnowledgeGraphConfig`, defaults, and env resolver — `src/config.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `config/Pruning Knobs MUST Resolve Deterministically With Env Overrides`
  **Design anchor:** File Changes row `src/config.ts`; Decision 7 ("no new column; keep-N is query-driven"); Interfaces/Contracts — `KnowledgeGraphConfig` gains three fields
  - Extend `KnowledgeGraphConfig` interface (`:39-51`) with: `kgPruneEnabled: boolean`, `kgSupersededKeepN: number`, `kgPruneOrphanEntities: boolean`.
  - Extend `DEFAULT_KNOWLEDGE_GRAPH_CONFIG` (`:161-173`) with defaults: `true`, `10`, `true`.
  - In `resolveKnowledgeGraphConfig` (`:455-498`), add env resolution for `THOTH_KG_PRUNE_ENABLED`, `THOTH_KG_SUPERSEDED_KEEP_N`, `THOTH_KG_PRUNE_ORPHAN_ENTITIES` via `parseBoolean`/`parseNumber`, mirroring the B3 knob rows (`:463-466`, `:485-496`). Resolution order: env > persisted > default.
  - `PersistedConfig.knowledgeGraph` is already `Partial<KnowledgeGraphConfig>` (`:102`) so it auto-covers the new fields; no separate persisted-type edit needed.
  **Independent Test:** `resolveKnowledgeGraphConfig({})` returns `kgPruneEnabled: true`, `kgSupersededKeepN: 10`, `kgPruneOrphanEntities: true`; env vars override persisted; a persisted per-project `kgSupersededKeepN` overrides the global default; `kgSupersededKeepN: 0` resolves to `0` (no silent substitution).
  **Verification:**
  - Run: `pnpm test -- -t "config"`
  - Expected: Config tests pass; three knobs present with correct defaults; env override precedence validated; keep-N=0 resolves to 0.

- [x] 1.2 Document three C1 knobs in `config.schema.json` — `config.schema.json`
  **[USN-1]** | Priority: P1
  **Spec:** `config/config.schema.json MUST Document the Pruning Knobs`
  **Design anchor:** File Changes row `config.schema.json`
  - Under `knowledgeGraph.properties` (`:161-241`), add property entries for `kgPruneEnabled` (boolean), `kgSupersededKeepN` (integer, `minimum: 0`), `kgPruneOrphanEntities` (boolean), each with a description mirroring the B3 knob entries. Respect `additionalProperties: false`.
  **Independent Test:** A JSON config carrying all three C1 knobs under `knowledgeGraph` passes schema validation; a config setting an unrecognized `knowledgeGraph` property still fails validation (confirms the knobs were added as explicit properties, not by relaxing the schema).
  **Verification:**
  - Run: `pnpm test -- -t "config"`
  - Expected: Schema validation test passes for a config object carrying all three C1 knobs; unknown-property rejection still holds.

- [x] 1.3 Add additive composite index `idx_kg_triples_slot_superseded` (fresh-DB schema) — `src/store/schema.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `knowledge-graph/Bounded Retention MUST Keep Only the N Most-Recent Superseded Triples Per Slot`
  **Design anchor:** Decision 7 ("No new column; keep-N is query-driven; reuse the existing superseded index; add one composite index for the slot scan"); File Changes row `src/store/schema.ts`
  - In `SEMANTIC_METADATA_INDEXES_SQL` (`:218-232`, all `CREATE INDEX IF NOT EXISTS`), add: `CREATE INDEX IF NOT EXISTS idx_kg_triples_slot_superseded ON kg_triples(source_id, subject_entity_id, relation, superseded_at);`
  - No DDL/table/column change. The existing B3 index `idx_kg_triples_superseded` (`:231`) is untouched and continues to support the dangling-ref lookup.
  **Independent Test:** Fresh-DB `kg_triples` schema includes `idx_kg_triples_slot_superseded` covering `(source_id, subject_entity_id, relation, superseded_at)`.
  **Verification:**
  - Run: `pnpm test -- -t "schema"`
  - Expected: `tests/store/schema.test.ts` passes; fresh DB contains the new composite index; no column added to `kg_triples`.

- [x] 1.4 Idempotently ensure `idx_kg_triples_slot_superseded` on existing DBs — `src/store/migrations.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `knowledge-graph/Bounded Retention MUST Keep Only the N Most-Recent Superseded Triples Per Slot`
  **Design anchor:** Decision 7; File Changes row `src/store/migrations.ts`; Migration/Rollout "Forward migration"
  - Inside `runMigrationsWithSemantic` (mirroring how the B3 superseded index/columns are ensured), execute `CREATE INDEX IF NOT EXISTS idx_kg_triples_slot_superseded ON kg_triples(source_id, subject_entity_id, relation, superseded_at);` idempotently.
  - No `addColumnIfMissing` call — this task adds ONLY an index, no column.
  **Independent Test:** Run `runMigrationsWithSemantic` on a legacy DB missing the index; the index appears; repeat call is a no-op (no error, no duplicate).
  **Verification:**
  - Run: `pnpm test -- -t "migration"`
  - Expected: Index created when absent; migration is idempotent; existing DBs upgrade transparently with no destructive DDL.

---

## Phase 2: Implementation

- [x] 2.1 Add `PruneSupersededTriplesInput` / `PruneSupersededTriplesResult` types — `src/store/types.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `store/Store MUST Provide a Deterministic, Transactional pruneSupersededTriples Method`
  **Design anchor:** Decision 8 ("Counter / result shape mirrors `rebuildObservationFacts`"); File Changes row `src/store/types.ts` (after `RebuildObservationFactsResult` `:332-337`)
  - Add `export interface PruneSupersededTriplesInput { project?: string; dryRun?: boolean; }`.
  - Add `export interface PruneSupersededTriplesResult { project: string | null; dry_run: boolean; slots_scanned: number; triples_pruned: number; entities_pruned: number; dangling_refs_nulled: number; superseded_before: number; superseded_after: number; }` exactly per design Decision 8's shape.
  **Independent Test:** TypeScript compiles with both new interfaces exported; shape matches `RebuildObservationFactsResult`'s sibling pattern.
  **Verification:**
  - Run: `pnpm run build`
  - Expected: Zero TypeScript errors; both interfaces exported from `src/store/types.ts`.

- [x] 2.2 **CORE TASK** — Implement plain shared core `runSupersededPrune(db, opts)` — `src/store/index.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `store/Store MUST Provide a Deterministic, Transactional pruneSupersededTriples Method`; `knowledge-graph/Bounded Retention MUST Keep Only the N Most-Recent Superseded Triples Per Slot`; `store/Subset Prune MUST NULL Dangling Supersession Refs and Clean Orphaned Entities Transactionally`; `store/Dry-Run Mode MUST Report Would-Prune Counts Without Mutating`
  **Design anchor:** Decision 1 (windowed-rank SQL, `ROW_NUMBER() OVER (PARTITION BY source_id, subject_entity_id, relation ORDER BY superseded_at DESC, id DESC)`, `rn > N`); Decision 2 (ordered steps: select → count-before → dry-run-return → NULL dangling → delete → orphan-cleanup → count-after; batched `IN (...)` chunks ≤ 500); Decision 4 (dry-run shares the identical selection, SELECT-only, returns before mutation); Decision 5 (NULL BOTH `superseded_by_triple_id` AND `superseded_at` on survivors pointing at pruned rows, reusing `:1151-1158` idiom, BEFORE the delete); File Changes row `src/store/index.ts` (near `rebuildObservationFacts` `:3441-3506`)
  - Author `runSupersededPrune(db, opts: { keepN: number; project?: string; dryRun?: boolean; orphanCleanup: boolean; slotFilter?: { sourceId: string; pairs: Array<{ subjectEntityId: string; relation: string }> } })` as a **plain function with NO `db.transaction()` call inside it** — this is the load-bearing constraint from design Decision 2/3 (better-sqlite3 does not support nested transactions; the automatic path must inherit the caller's open transaction).
  - Step 1 (select): compute the prune set via Decision 1's parameterized windowed SQL, appending `AND t.project = ?` when `project` is scoped, or the `slotFilter`'s `AND t.source_id = ? AND t.subject_entity_id IN (...) AND t.relation IN (...)` narrowing when `slotFilter` is provided (mutually exclusive with `project` — automatic path always passes `slotFilter`, manual op always passes `project`/none).
  - Step 2 (count before): `COUNT(*)` of superseded rows in scope, mirroring `rebuildObservationFacts`' pre/post `COUNT(*)` probes (`:3469-3489`).
  - Step 3 (dry-run early return): if `dryRun`, compute would-prune / would-NULL / would-orphan counts via SELECT-only probes (Decision 4's three probe queries) and RETURN the `PruneSupersededTriplesResult` WITHOUT any `UPDATE`/`DELETE`.
  - Step 4 (NULL dangling refs): `UPDATE kg_triples SET superseded_by_triple_id = NULL, superseded_at = NULL WHERE superseded_by_triple_id IN (<prune ids>)` — B3's exact idiom from `:1151-1158`, applied to the prune set, chunked into batches of ≤ 500 ids.
  - Step 5 (delete): `DELETE FROM kg_triples WHERE id IN (<prune ids>)`, chunked ≤ 500.
  - Step 6 (orphan cleanup, gated by `opts.orphanCleanup`): delete `kg_entities` rows no longer referenced by any triple as subject OR object.
  - Step 7 (count after) and return the `PruneSupersededTriplesResult` populated with `slots_scanned`, `triples_pruned`, `entities_pruned`, `dangling_refs_nulled`, `superseded_before`, `superseded_after` (`= before - triples_pruned`).
  - Do NOT export `runSupersededPrune` on any public surface (module-internal only, per Interfaces/Contracts).
  **Independent Test:** Directly unit-testable with an in-memory SQLite `db` handle: seed a slot with N+k superseded rows, call `runSupersededPrune(db, {keepN: N, orphanCleanup: true})` inside a manually-opened `db.transaction()`, assert exactly k rows deleted and current rows untouched.
  **Verification:**
  - Run: `pnpm test -- -t "prune|runSupersededPrune"`
  - Expected: Windowed selection correctly ranks and selects rank>N; dry-run mutates nothing; NULL-before-delete ordering holds; batching does not error on large id sets.

- [x] 2.3 Implement transactional entry point `store.pruneSupersededTriples(input)` — `src/store/index.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `store/Store MUST Provide a Deterministic, Transactional pruneSupersededTriples Method`; `store/Prune Is All-Or-Nothing on Failure`
  **Design anchor:** Decision 2 ("`pruneSupersededTriples` wraps `runSupersededPrune` in `this.db.transaction(...)`"); Decision 3 (transaction discipline — manual op OWNS the txn, automatic path does NOT); Data Flow "Manual op — CLI / HTTP (transactional at the op boundary)"
  - Add `pruneSupersededTriples(input: PruneSupersededTriplesInput = {}): PruneSupersededTriplesResult` as a new public `Store` method near `rebuildObservationFacts` (`:3441-3506`).
  - Resolve `keepN`/`orphanCleanup` from `this.config.knowledgeGraph` (`kgSupersededKeepN`, `kgPruneOrphanEntities`).
  - Wrap the call: `return this.db.transaction(() => runSupersededPrune(this.db, { keepN, project: input.project, dryRun: input.dryRun, orphanCleanup }))();` — this is the ONLY place a `db.transaction()` wraps `runSupersededPrune` for the manual op.
  - When `kgSupersedeEnabled` is false (B3 flag), this method MUST still be callable and MUST report zero counts without erroring (no supersession state exists to bound) — do not special-case this in `pruneSupersededTriples` itself; it falls out naturally because there are no superseded rows to select.
  **Independent Test:** Calling `store.pruneSupersededTriples({dryRun: true})` then `store.pruneSupersededTriples({})` on the same fixture prunes exactly the dry-run-previewed rows; injecting a thrown error mid-transaction (e.g. via a corrupting statement) leaves the KG completely unchanged (all-or-nothing).
  **Verification:**
  - Run: `pnpm test -- -t "pruneSupersededTriples"`
  - Expected: Transactional all-or-nothing confirmed by failure-injection test; dry-run/real equivalence holds; project scope narrows correctly.

- [x] 2.4 Add `subject_entity_id` to the B3 prior-rows SELECT — `src/indexing/jobs.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `knowledge-graph/Automatic Incremental Enforcement MUST Maintain the Cap Gated by the Master Flag`
  **Design anchor:** Open Questions "`collectTouchedSlots` plumbing" (carried into tasks); File Changes row `src/indexing/jobs.ts` — "collect touched `(subject_entity_id, relation)` pairs from the B3 marking loop (`:616-624`)"
  - In the prior-rows SELECT inside `persistKgExtraction` (`:544-551`, currently `SELECT t.id, t.triple_hash, t.relation, se.canonical_name AS subject, oe.canonical_name AS object FROM kg_triples t JOIN kg_entities se ON se.id = t.subject_entity_id JOIN kg_entities oe ON oe.id = t.object_entity_id WHERE ...`), add `t.subject_entity_id` (and, if not already present, `t.object_entity_id`) to the selected columns so each `prior` row carries its own entity id without an extra query. The join to `kg_entities se` already exists; this is a column-list addition only.
  - This is a residual, additive SELECT-column change — no behavior change to the B3 diff logic itself.
  **Independent Test:** After the change, each `prior` row object has a `subject_entity_id` field populated directly from the query result (no separate lookup call needed).
  **Verification:**
  - Run: `pnpm test -- -t "supersed|persist"`
  - Expected: Existing B3 diff tests still pass unchanged (additive column, no logic change); `prior` rows carry `subject_entity_id`.

- [x] 2.5 **CORE TASK** — Wire automatic incremental enforcement into `persistKgExtraction` — `src/indexing/jobs.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `knowledge-graph/Automatic Incremental Enforcement MUST Maintain the Cap Gated by the Master Flag`; `knowledge-graph/Automatic Path Is Byte-Identical to Pre-C1 When the Master Flag Is Off`; `knowledge-graph/Automatic Path Is Inert When Supersession Is Off`; `config/Pruning Master Flag MUST Gate Only the Automatic Path and Compose With B3`
  **Design anchor:** Decision 3 (automatic enforcement location, both-flags gate, byte-identity proof, LLM double-write idempotency); Data Flow "Automatic path — save/update/upsert (both flags ON)"; File Changes row `src/indexing/jobs.ts` (end of flag-ON section, after `:643`)
  - At the END of the flag-ON section of `persistKgExtraction`, AFTER the B3 supersede-marking loop (`:609-624`) and after the optional content-pattern block (`:626-643`), add the both-flags-gated block:
    ```ts
    if (supersedeEnabled && knowledgeGraphConfig.kgPruneEnabled) {
      const touched = collectTouchedSlots(/* prior rows superseded in this write, using subject_entity_id from task 2.4 */);
      if (touched.length > 0) {
        runSupersededPrune(db, {
          keepN: knowledgeGraphConfig.kgSupersededKeepN,
          orphanCleanup: knowledgeGraphConfig.kgPruneOrphanEntities,
          slotFilter: { sourceId: obs.id, pairs: touched },
        });
      }
    }
    ```
  - `collectTouchedSlots` collects the DISTINCT `(subject_entity_id, relation)` pairs of the rows the B3 marking loop just superseded in THIS write (available from the `prior` rows matched in that loop, now carrying `subject_entity_id` per task 2.4).
  - **NO transaction wrapper** — call `runSupersededPrune` directly so it inherits the caller's already-open `db.transaction()` (from `saveObservation`/`updateObservation`/`upsert` at `index.ts:1536`/`:1511`/`:1632`). Import `runSupersededPrune` from the store module (or expose via `store`).
  - Verify the guard is a pure boolean short-circuit BEFORE any added statement: if `kgPruneEnabled === false`, the block never executes — no new SQL, transaction is exactly the pre-C1 shape. If `supersedeEnabled === false`, the pre-B3 blind delete+reinsert branch runs and nothing is ever superseded, so there is nothing to scope `touched` to.
  **Independent Test:** With both flags ON, repeatedly saving-then-updating one observation caps its slot's superseded count at `kgSupersededKeepN` after each write; with either flag OFF, no prune SQL executes (verifiable via a statement-count spy on the `db` handle).
  **Verification:**
  - Run: `pnpm test -- -t "prune|automatic|supersed"`
  - Expected: Steady-state cap holds after each write; flag-off issues zero extra statements; touched-slot scoping does not affect other observations' slots.

- [x] 2.6 Implement CLI `prune-graph` command — `src/cli.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `indexing/prune-graph MUST Be a CLI + HTTP Admin Op, Not an MCP Tool`; `indexing/prune-graph MUST Support Dry-Run Preview and Report Counts`; `indexing/prune-graph MUST Perform No Deletion When Supersession Is Disabled`
  **Design anchor:** Decision 8 (Markdown summary format); File Changes row `src/cli.ts` (usage banner `:34`, `handlePruneGraph` mirroring `handleRebuildGraph` `:560-588`, dispatch `:700-702`)
  - Add `prune-graph   Bound superseded graph history (keep-N)` to the usage banner (`:34`).
  - Add `async function handlePruneGraph(positionals: string[], globals: GlobalOptions): Promise<void>` mirroring `handleRebuildGraph` (`:560-588`): reuse its `--project <name>`/`--all` validation verbatim (fail with `'prune-graph requires --project <name> or --all'` when neither is given; `ensureNoExtraArgs(rest, 'prune-graph')`), and additionally accept a `--dry-run` boolean flag.
  - Call `store.pruneSupersededTriples({ project, dryRun })` and print a Markdown summary mirroring `handleRebuildGraph`'s block (`:581-587`): `## Graph Prune Complete` / `- **Scope:** …` / `- **Dry run:** …` / `- **Triples pruned:** …` / `- **Entities pruned:** …` / `- **Dangling refs NULLed:** …` / `- **Superseded before → after:** …`.
  - Add `case 'prune-graph': await handlePruneGraph(parsed.positionals, parsed.globals); break;` to the dispatch switch (`:700-702`).
  **Independent Test:** `prune-graph --project demo --dry-run` prints would-prune counts and mutates nothing; `prune-graph --all` (no dry-run) prints actual counts and mutates; `prune-graph` with neither `--project` nor `--all` fails with the expected error message.
  **Verification:**
  - Run: `pnpm test -- -t "cli|prune-graph"`
  - Expected: CLI dry-run vs real both report the count categories; missing scope flag fails as expected; output format mirrors `rebuild-graph`.

- [x] 2.7 Implement HTTP `POST /graph/prune` route — `src/http-routes.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `indexing/prune-graph MUST Be a CLI + HTTP Admin Op, Not an MCP Tool`; `indexing/prune-graph MUST Support Dry-Run Preview and Report Counts`
  **Design anchor:** File Changes row `src/http-routes.ts` (`OPERATION_CATALOG` entries near `:61`/`:71`, `handlePruneGraph` mirroring `:573-581`)
  - Add two `OPERATION_CATALOG` entries (`:54-73`): `{ id: 'prune-graph', origin: 'http', label: 'Prune graph', kind: 'indexing', method: 'POST', path: '/graph/prune', description: 'Bound superseded graph history to the N most-recent rows per slot.' }` (near `:61`) and `{ id: 'cli-prune-graph', origin: 'cli', label: 'prune-graph', kind: 'indexing', target: 'prune-graph', description: 'CLI equivalent for bounding superseded graph history.' }` (near `:71`).
  - Add `export async function handlePruneGraph(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse>` mirroring `handleRebuildGraph` (`:573-581`): read `project`/`dryRun` from the request body, call `store.pruneSupersededTriples({ project, dryRun })`, return the `PruneSupersededTriplesResult` as JSON.
  **Independent Test:** `POST /graph/prune` with `{dryRun: true}` returns would-prune counts with zero mutation; `POST /graph/prune` with `{project: 'demo'}` (no dryRun) actually prunes and returns actual counts.
  **Verification:**
  - Run: `pnpm test -- -t "http|graph.prune"`
  - Expected: Route registered in `OPERATION_CATALOG` under `kind: 'indexing'`; dry-run and real paths both return the correct count shape.

- [x] 2.8 Register the `/graph/prune` route and import the handler — `src/http-server.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `indexing/prune-graph MUST Be a CLI + HTTP Admin Op, Not an MCP Tool`
  **Design anchor:** File Changes row `src/http-server.ts` (imports `:39`, `ROUTES` `:98`)
  - Import `handlePruneGraph` alongside `handleRebuildGraph` (`:39`).
  - Add `{ method: 'POST', pattern: '/graph/prune', handler: handlePruneGraph }` to `ROUTES` (`:98`), immediately after the `/graph/rebuild` row.
  **Independent Test:** A live HTTP server started against the updated `ROUTES` table responds to `POST /graph/prune` (not 404).
  **Verification:**
  - Run: `pnpm test -- -t "http.server|routes"`
  - Expected: `/graph/prune` resolves to `handlePruneGraph`; existing routes (including `/graph/rebuild`) are unaffected.

- [x] 2.9 Document `/graph/prune` in the OpenAPI spec — `src/http-openapi.ts`
  **[USN-5]** | Priority: P2
  **Spec:** `indexing/prune-graph MUST Be a CLI + HTTP Admin Op, Not an MCP Tool`
  **Design anchor:** File Changes row `src/http-openapi.ts` (after `/graph/rebuild` `:191`)
  - Add a `/graph/prune` POST path entry mirroring `/graph/rebuild`'s (request body `{project?: string, dryRun?: boolean}`, response = `PruneSupersededTriplesResult` shape), placed immediately after the `/graph/rebuild` entry (`:191`).
  **Independent Test:** The generated/served OpenAPI document contains a `/graph/prune` POST path with the documented request/response schema.
  **Verification:**
  - Run: `pnpm test -- -t "openapi"`
  - Expected: OpenAPI doc includes `/graph/prune` in parity with `/graph/rebuild`'s documentation shape.

- [x] 2.10 Add keep-N retention eval case + OFF-vs-ON no-regression gate — `src/evals/retrieval.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `evals/Evals MUST Validate keep-N Retention Bounds Superseded Triples`; `evals/Eval Suite MUST Gate on No Retrieval Regression With Pruning Enabled`
  **Design anchor:** File Changes row `src/evals/retrieval.ts`; Migration/Rollout "Eval-gated default (tasks-level gate)"
  - **Retention case:** through the consolidated KG path (`saveObservation` + `writeDeterministicKgFacts`), repeatedly SAVE-then-UPDATE the SAME observation under one `topic_key` with a small `kgSupersededKeepN` (e.g. `1` or `2`) so the B3 on-update diff drives a slot to `N + k` superseded triples. Invoke `pruneSupersededTriples` (dry-run first, then real). Assert: (a) dry-run reports would-prune counts and mutates nothing; (b) the real prune removes exactly the previewed rows; (c) the slot retains at most `N` superseded triples (most-recent by `superseded_at` DESC, `id` DESC); (d) the current fact is NOT pruned and remains retrievable and correctly ranked.
  - **OFF-vs-ON no-regression gate:** run the existing eval suite once with `kgPruneEnabled=false` and once with `true`, over existing + B2 multi-hop + B3 supersession fixtures. Assert ON is no worse than OFF on all pass/rank criteria (0% regression is the acceptance condition for shipping `kgPruneEnabled` default ON — see Phase 4 task 4.4).
  - Seed all fixtures via the KG path (`kg_entities`+`kg_triples`), never `observation_facts`, per the established B1/B2/B3 fixture convention.
  **Independent Test:** Eval file is syntactically valid; retention case exercises the diff+prune path end-to-end; B2/B3 fixtures are included in the OFF-vs-ON comparison.
  **Verification:**
  - Run: `pnpm run eval:retrieval`
  - Expected: Retention case passes (keep-N bound holds, dry-run==real, current fact retrievable); OFF-vs-ON comparison runs and reports its regression percentage for Phase 4 to consume.

---

## Phase 3: Testing

- [x] 3.1 Write keep-N boundary tests (N+k, exactly N, N+1, keep-N=0) — `tests/store/kg-prune.test.ts` (new)
  **[USN-7]** | Priority: P1
  **Spec:** `knowledge-graph/A Slot With More Than N Superseded Triples Is Pruned to N`; `knowledge-graph/A Slot With Exactly N Superseded Triples Prunes Nothing`; `knowledge-graph/keep-N of Zero Prunes All Superseded but Keeps Current`
  **Design anchor:** Testing Strategy items 1, 2, 3; Decision 1 (windowed-rank properties)
  - **N+k:** slot with `N + k` superseded (`k > 0`) → exactly the N most-recent (by `superseded_at` DESC, `id` DESC) retained, older k pruned, all current retained.
  - **Exactly N:** prunes nothing. **N+1:** prunes exactly 1.
  - **keep-N = 0:** prunes ALL superseded in the slot, keeps ALL current.
  **Independent Test:** Each boundary case independently verifiable against the in-memory SQLite store directly after `runSupersededPrune`/`pruneSupersededTriples` returns.
  **Verification:**
  - Run: `pnpm test -- -t "prune.*boundary|keep.n"`
  - Expected: All four boundary cases pass; retained count matches N exactly at each boundary.

- [x] 3.2 Write tie-on-`superseded_at`, current-never-pruned, and determinism/idempotency tests
  **[USN-7]** | Priority: P1
  **Spec:** `knowledge-graph/Ties on superseded_at Are Broken Deterministically by id`; `knowledge-graph/Current Facts Are Never Pruned Regardless of Count`; `knowledge-graph/Pruning MUST Be Deterministic and Repeatable`
  **Design anchor:** Testing Strategy items 4, 5, 6, 7; Decision 1 ("Ties on `superseded_at`" scenario); Decision 6 (determinism & idempotent convergence)
  - **Tie on `superseded_at`:** two superseded rows in a slot sharing the same `superseded_at` at the boundary → partition deterministic by `id DESC`.
  - **Current never pruned:** even when current count vastly exceeds N.
  - **Determinism:** two identical DB snapshots + same N → identical prune set + counts.
  - **Idempotent convergence:** a second prune with no new supersession prunes nothing further.
  **Independent Test:** Each assertion runs against isolated fixtures; determinism test compares two independently-built identical snapshots.
  **Verification:**
  - Run: `pnpm test -- -t "prune.*(tie|determin|idempot|current)"`
  - Expected: Tie-break by id DESC confirmed; current rows never selected; identical snapshots yield identical prune sets; repeat prune is a no-op.

- [x] 3.3 Write all-or-nothing transactional failure test — `pruneSupersededTriples`
  **[USN-7]** | Priority: P1
  **Spec:** `store/Prune Is All-Or-Nothing on Failure`
  **Design anchor:** Testing Strategy item 8; Decision 2 ("`this.db.transaction(...)` gives the manual op all-or-nothing semantics")
  - Inject a failure mid-transaction (e.g. a corrupting statement or thrown error after the NULL step but before the delete completes) during a manual `pruneSupersededTriples` call. Assert: no `kg_triples` row, no `kg_entities` row, and no `superseded_by_triple_id` reference is changed — the KG is byte-identical to its pre-call state.
  **Independent Test:** Snapshot the DB before the call; compare a full dump after the injected failure; assert zero diff.
  **Verification:**
  - Run: `pnpm test -- -t "prune.*(all.or.nothing|transaction|failure)"`
  - Expected: Injected mid-transaction failure leaves the KG completely unchanged.

- [x] 3.4 Write project-scope and dry-run/real-equivalence tests
  **[USN-7]** | Priority: P1
  **Spec:** `store/Project Scope Bounds the Prune`; `store/Dry-Run Mode MUST Report Would-Prune Counts Without Mutating`; `store/Dry-Run Preview Matches the Real Prune Set`
  **Design anchor:** Testing Strategy items 9, 13; Decision 4 (dry-run shares the identical selection)
  - **Project scope:** superseded triples across multiple projects → `pruneSupersededTriples({project})` only makes that project's rows eligible; other projects' superseded rows remain untouched.
  - **Dry-run:** reports would-prune/would-orphan/would-NULL + before/after totals, mutates nothing; a following real run with no intervening change removes EXACTLY the previewed rows.
  **Independent Test:** Multi-project fixture confirms cross-project isolation; dry-run-then-real pair confirms row-for-row equivalence.
  **Verification:**
  - Run: `pnpm test -- -t "prune.*(project|dry.run)"`
  - Expected: Project scope isolates correctly; dry-run preview == real prune set exactly.

- [x] 3.5 Write dangling-ref-NULLing and orphan-cleanup on/off tests
  **[USN-7]** | Priority: P1
  **Spec:** `store/Subset Prune MUST NULL Dangling Supersession Refs and Clean Orphaned Entities Transactionally`; `store/Dangling Supersession Refs Are NULLed, Not Left Pointing at Deleted Rows`; `store/Orphaned Entities Are Removed When Cleanup Is Enabled`; `store/Entities Still Referenced by Surviving Triples Are Retained`; `store/Orphan Cleanup Disabled Leaves Entities but Still Prunes Triples`
  **Design anchor:** Testing Strategy items 10, 11; Decision 5 (NULL both columns, promoting the survivor back to current)
  - **Dangling-ref NULLing:** a survivor superseded BY a pruned row → its `superseded_by_triple_id` AND `superseded_at` are BOTH NULLed (survivor becomes current again); no survivor references a deleted id after prune.
  - **Orphan cleanup ON:** an entity referenced only by pruned rows is removed; an entity shared with a survivor is retained.
  - **Orphan cleanup OFF:** triples still pruned and refs still NULLed, but the orphaned entity row is left in place.
  **Independent Test:** Each of the three sub-cases (dangling-ref, orphan-on, orphan-off) independently constructible and assertable.
  **Verification:**
  - Run: `pnpm test -- -t "prune.*(dangling|orphan)"`
  - Expected: Dangling refs NULLed (both columns); orphan cleanup removes/retains entities correctly per the flag.

- [x] 3.6 Write delete-path non-interference test
  **[USN-7]** | Priority: P2
  **Spec:** `store/Prune Must Not Double-Clean With the Per-Observation Delete Path`; `store/Prune After Observation Delete Stays Consistent`
  **Design anchor:** Testing Strategy item 12
  - Hard-delete an observation (its `kg_triples` removed by `source_id`), leaving superseded rows in OTHER slots. Then run `pruneSupersededTriples`. Assert: no error, no dangling supersession references, no orphaned entities left after the prune completes.
  **Independent Test:** Sequential delete-then-prune on a fixture with cross-slot superseded rows; assert post-prune integrity.
  **Verification:**
  - Run: `pnpm test -- -t "prune.*delete|delete.*prune"`
  - Expected: No error; no dangling refs; no orphans after delete-then-prune sequence.

- [x] 3.7 Write automatic-path steady-state cap and slot-scoping tests — `tests/indexing/kg-prune-automatic.test.ts` (new) or extend `tests/indexing/jobs.test.ts`
  **[USN-8]** | Priority: P1
  **Spec:** `knowledge-graph/Cap Holds in Steady State With Both Flags On`; `knowledge-graph/Automatic Enforcement Is Scoped to the Slots the Write Touched`
  **Design anchor:** Testing Strategy items 14, 15; Decision 3 (scoped to touched slots only)
  - **Steady-state cap:** with both flags ON, repeatedly SAVE-then-UPDATE one observation so a slot would exceed N → after EACH write the slot holds at most N superseded triples; current unaffected.
  - **Scoped to touched slots:** observation A has an over-cap slot; writing observation B (touching only B's slots) leaves A's over-cap slot UNCHANGED.
  **Independent Test:** Repeated-write fixture asserts the cap after each individual write, not just at the end; cross-observation fixture confirms isolation.
  **Verification:**
  - Run: `pnpm test -- -t "automatic.*prune|prune.*automatic"`
  - Expected: Cap holds after every write in the sequence; B's write never touches A's slot.

- [x] 3.8 Write automatic flag-off byte-identical and supersede-off-inert tests
  **[USN-8]** | Priority: P1
  **Spec:** `knowledge-graph/Automatic Path Is Byte-Identical to Pre-C1 When the Master Flag Is Off`; `knowledge-graph/Automatic Path Is Inert When Supersession Is Off`; `config/Automatic Path Off Is Byte-Identical to Pre-C1`; `config/Automatic Path Is Inert When Supersession Is Disabled`
  **Design anchor:** Testing Strategy items 16, 17; Decision 3 byte-identity proof (both `kgPruneEnabled=false` and `kgSupersedeEnabled=false` branches)
  - **`kgPruneEnabled=false` (supersede ON):** write path issues NO prune SQL and DB state matches B3-only behavior; assert via a query-count/spy on the `db` handle that no extra statement runs (mirrors B3's flag-off test pattern).
  - **`kgSupersedeEnabled=false`, `kgPruneEnabled=true`:** no prune occurs (nothing is ever superseded), byte-identical to pre-C1.
  **Independent Test:** Both flag combinations independently testable with a statement-count assertion against the same base fixture.
  **Verification:**
  - Run: `pnpm test -- -t "prune.*flag.off|byte.identical"`
  - Expected: Zero extra SQL statements issued in both OFF combinations; DB state matches the pre-C1 (B3-only or pre-B3) baseline exactly.

- [x] 3.9 **CRITICAL TEST** — Write LLM double-write idempotency test
  **[USN-8]** | Priority: P1
  **Spec:** `knowledge-graph/Automatic Enforcement Is Scoped to the Slots the Write Touched`
  **Design anchor:** Testing Strategy item 18; Decision 3 "LLM double-write interaction" (the second `persistKgExtraction` call re-runs the identical windowed selection over the same already-capped slots and selects nothing)
  - Simulate the `used` LLM path in `processKgJob`: two `persistKgExtraction` calls for the same observation (deterministic write, then LLM-enriched write) with both flags ON and a slot already pushed over cap by the first call. Assert: the slot is capped ONCE by the first call's automatic prune; the SECOND call's automatic prune selects and prunes NOTHING (idempotent per slot); no over-prune occurs across the two calls.
  **Independent Test:** Two sequential `persistKgExtraction` calls on the same observation/slot; assert the prune-set size is zero on the second call.
  **Verification:**
  - Run: `pnpm test -- -t "llm.*prune|double.write.*prune"`
  - Expected: REQUIRED — second automatic-prune call in the double-write sequence prunes zero rows; no double-prune or over-prune.

- [x] 3.10 Write migration idempotency test — `tests/store/migration.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `knowledge-graph/Bounded Retention MUST Keep Only the N Most-Recent Superseded Triples Per Slot`
  **Design anchor:** File Changes row `src/store/migrations.ts`; Migration/Rollout "Forward migration"
  - Seed a legacy `kg_triples` table (post-B3, missing `idx_kg_triples_slot_superseded`) and run `runMigrationsWithSemantic`; the index appears. Re-run the migration; it is a no-op (idempotent, no error, no duplicate index).
  **Independent Test:** In-memory SQLite; create `kg_triples` per the B3 (pre-C1) schema; run migration twice; assert index exists after the first run and the second run does not error.
  **Verification:**
  - Run: `pnpm test -- -t "migration"`
  - Expected: Index created on first run; second run is a no-op; no destructive DDL, no down-migration needed.

- [x] 3.11 Write retrieval unaffected-by-pruning tests — `tests/store/retrieval.test.ts` or nearest recall suite
  **[USN-9]** | Priority: P1
  **Spec:** `retrieval/Retrieval Read Path MUST Be Unchanged by Pruning`; `retrieval/Retrieval Output Depends Only on Surviving Rows, Not on Pruning`; `retrieval/Current Facts Are Unaffected in Retrieval After Pruning`; `retrieval/B3 Deprioritization and B2 Multi-Hop Bounds Are Unchanged`
  **Design anchor:** Testing Strategy items 19, 20; retrieval delta "Pruning acts only on already-deprioritized rows"
  - **Output depends only on surviving rows:** two DBs identical except one has had old superseded triples pruned → ranked output over CURRENT + RETAINED-superseded rows is IDENTICAL between the two.
  - **Current-fact rank unchanged:** after pruning a slot's old superseded tail, the current fact still ranks and surfaces exactly as pre-prune.
  - Confirm B3 deprioritization and B2 multi-hop bounds (cycle-guard, `kgMaxDepth`, `kgNeighborhoodLimit`, allow-list, bidirectional expansion, elapsed-guard) are all still intact post-C1.
  **Independent Test:** Pruned-vs-unpruned paired fixture with identical surviving rows; assert byte-for-byte identical ranked output.
  **Verification:**
  - Run: `pnpm test -- -t "retrieval.*prune|prune.*retrieval"`
  - Expected: Identical output over surviving rows; current-fact rank unchanged; B2/B3 bounds unaffected.

- [x] 3.12 Write retrieval flag-off byte-identical test
  **[USN-9]** | Priority: P1
  **Spec:** `retrieval/Retrieval MUST Be Byte-Identical to Pre-C1 When the Master Flag Is Off`; `retrieval/Flag-Off Retrieval Is Byte-Identical to Pre-C1`
  **Design anchor:** Testing Strategy item 21; retrieval delta "trivial — retrieval reads no C1 knob — but asserted"
  - With `kgPruneEnabled=false`, assert `hybridRetrieve`'s fused output is identical to the pre-C1 baseline output over the same fixture (trivially true because retrieval never reads any C1 knob, but MUST be asserted per spec).
  **Independent Test:** Direct comparison of `hybridRetrieve` output with `kgPruneEnabled` unset/false vs. a pinned pre-C1 baseline fixture.
  **Verification:**
  - Run: `pnpm test -- -t "retrieval.*flag.off|hybridRetrieve"`
  - Expected: Fused output identical to pre-C1 baseline; no candidate shape/score/order difference.

- [x] 3.13 Write MCP registry unchanged and `mem_project action=graph` unaffected tests — `tests/tools/mem-project.test.ts` or nearest tool-registration suite
  **[USN-10]** | Priority: P1
  **Spec:** `tools/C1 MUST NOT Change the MCP Tool Surface`; `tools/MCP Registry Is Unchanged by C1`; `tools/mem_project action=graph Behavior Is Unaffected by Pruning`; `indexing/prune-graph Is Not Registered as an MCP Tool`
  **Design anchor:** Testing Strategy item 22, 23
  - Assert the registered MCP tool set remains exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, `mem_session` — no `prune`/`prune-graph` MCP tool appears.
  - Assert `mem_project action=graph`'s current-state ledger renders identically for current facts and retained history before and after a prune (pruning removes only deep-history rows the ledger already hid).
  **Independent Test:** Tool registry inspectable without executing any prune; ledger-render comparison pre/post prune on a fixture with bounded history.
  **Verification:**
  - Run: `pnpm test -- -t "tool|registry|mem_project"`
  - Expected: Exactly six tools registered; no pruning-specific tool; `action=graph` ledger unchanged by pruning.

- [x] 3.14 Write config resolution tests (env/persisted/default, keep-N=0, per-project override, schema accept/reject) — `tests/config.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `config/Pruning Knobs MUST Resolve Deterministically With Env Overrides`; `config/Environment Override Wins for a Pruning Knob`; `config/Persisted Value Is Used When Environment Is Unset`; `config/Built-in Defaults Apply When Unset Everywhere`; `config/keep-N Default Is Overridable Per Project`; `config/keep-N of Zero Is a Valid Configured Value`; `config/Schema Validates a Config Carrying Pruning Knobs`; `config/Schema Still Rejects Unknown knowledgeGraph Properties`
  **Design anchor:** Testing Strategy item 24
  - Env > persisted > default precedence for all three C1 knobs (`THOTH_KG_PRUNE_ENABLED`, `THOTH_KG_SUPERSEDED_KEEP_N`, `THOTH_KG_PRUNE_ORPHAN_ENTITIES`).
  - Defaults exactly: `true` / `10` / `true`.
  - `kgSupersededKeepN=0` resolves to `0`, not silently substituted.
  - A per-project persisted `kgSupersededKeepN` override resolves for that project; projects without an override resolve to the global default `10`.
  - `config.schema.json` validates a config carrying all three C1 knobs; rejects a config with an unrecognized `knowledgeGraph` property.
  **Independent Test:** Each precedence tier (env/persisted/default), the keep-N=0 case, the per-project override case, and both schema cases are independently runnable, all independent of the store.
  **Verification:**
  - Run: `pnpm test -- -t "config"`
  - Expected: All precedence, keep-N=0, per-project-override, and schema tests pass.

- [x] 3.15 Write CLI/HTTP dry-run-vs-real and no-op-when-supersession-off tests
  **[USN-5]** | Priority: P1
  **Spec:** `indexing/prune-graph MUST Support Dry-Run Preview and Report Counts`; `indexing/CLI Dry-Run Reports Would-Prune Counts Without Deleting`; `indexing/HTTP Dry-Run Reports Would-Prune Counts Without Deleting`; `indexing/Real Run Reports the Counts It Actually Changed`; `indexing/prune-graph MUST Perform No Deletion When Supersession Is Disabled`; `indexing/prune-graph Is a Safe No-Op When Supersession Is Off`
  **Design anchor:** Testing Strategy item 25
  - Both CLI and HTTP report the full count-category set (triples pruned, entities removed, dangling refs NULLed, before/after) for both dry-run and real invocations; dry-run mutates nothing; real mutates and reports actual counts.
  - With `kgSupersedeEnabled=false`, both CLI and HTTP `prune-graph` complete WITHOUT error and report ZERO triples pruned / zero entities removed / zero refs NULLed (safe no-op, not an error).
  **Independent Test:** CLI and HTTP each independently exercised for dry-run, real, and supersede-off no-op cases.
  **Verification:**
  - Run: `pnpm test -- -t "cli.*prune|http.*prune"`
  - Expected: Dry-run vs real reporting correct in both surfaces; supersede-off invocation is a zero-count no-op with no error.

- [x] 3.16 Write export/import parity test — `tests/store/export-import.test.ts`
  **[USN-11]** | Priority: P2
  **Spec:** `store/Pruning MUST NOT Enter the Portable Export/Import Format`; `store/Export Shape and Version Are Unchanged by C1`; `store/Import Is Unaffected by Pruning`
  **Design anchor:** Testing Strategy item 26
  - After applying C1 and running a prune, assert `exportData` still contains ONLY `sessions`/`observations`/`prompts`, contains NO `kg_triples`/`kg_entities`/pruning-related field, and `version` is unchanged.
  - Assert existing `tests/store/export-import.test.ts:81-132` (which assert kg columns are absent) still pass unmodified.
  **Independent Test:** Export an observation after a prune has run; parse the export JSON; assert no pruning-related key and unchanged `version`.
  **Verification:**
  - Run: `pnpm test -- -t "export|import"`
  - Expected: Export/import tests pass unmodified; no new pruning fields in the export payload; version unchanged.

---

## Phase 4: Verification and Close

- [x] 4.1 Full test suite green gate
  **[USN-12]** | Priority: P1
  **Spec:** all C1 requirements in scope (knowledge-graph, store, config, indexing, retrieval, tools, evals deltas)
  **Design anchor:** Testing Strategy "vitest + in-memory SQLite (`pnpm test`)"
  Run the full test suite and confirm zero failures across all new and existing tests, including every B1/B2/B3 regression suite.
  **Independent Test:** All prior passing tests still pass; all C1 tests (Phase 3) pass.
  **Verification:**
  - Run: `pnpm test`
  - Expected: All tests pass with zero failures; no pre-existing test regressed.

- [x] 4.2 Eval gate: keep-N retention case + OFF-vs-ON no-regression comparison
  **[USN-12]** | Priority: P1
  **Spec:** `evals/Evals MUST Validate keep-N Retention Bounds Superseded Triples`; `evals/Eval Suite MUST Gate on No Retrieval Regression With Pruning Enabled`
  **Design anchor:** Testing Strategy item 27; Migration/Rollout "Eval-gated default (tasks-level gate)"
  - Run `pnpm run eval:retrieval` (task 2.10's cases). Assert: (1) the keep-N retention case passes (bound holds, dry-run==real, current fact retrievable); (2) the OFF-vs-ON no-regression comparison over existing + B2 multi-hop + B3 supersession fixtures reports its regression percentage.
  - Record the regression result — it is the direct input to task 4.4's default-rollout decision.
  **Independent Test:** Eval run is a terminal `pnpm run eval:retrieval`; result is deterministic given the fixture set.
  **Verification:**
  - Run: `pnpm run eval:retrieval`
  - Expected: Retention case passes; OFF-vs-ON comparison completes and reports 0% regression (or documents any regression found for task 4.4 to act on).

- [x] 4.3 Build clean gate
  **[USN-12]** | Priority: P1
  **Spec:** all requirements in scope
  **Design anchor:** `openspec/config.yaml` `verify.build_command: 'pnpm run build'`
  Run the full TypeScript build; confirm zero errors.
  **Independent Test:** `pnpm run build` produces dist artifacts with no error.
  **Verification:**
  - Run: `pnpm run build`
  - Expected: Build succeeds with zero TypeScript errors; dist artifacts produced.

- [x] 4.4 Record shipped `kgPruneEnabled` default per the eval-gated rollout condition — `src/config.ts`, `openspec/changes/kg-superseded-pruning/checklists/requirements.md`
  **[USN-12]** | Priority: P1
  **Spec:** `config/The Shipped Master-Flag Default MUST Be Gated by the Eval No-Regression Gate`; `config/Default Ships ON When the Eval Gate Passes`; `config/Default Falls Back to OFF When the Eval Gate Regresses`
  **Design anchor:** Migration/Rollout "Eval-gated default (tasks-level gate)"; Decision 8 note on operator-facing consistency
  - After task 4.2's eval result:
    - If the OFF-vs-ON comparison reports 0% regression: CONFIRM `kgPruneEnabled` default remains `true` in `DEFAULT_KNOWLEDGE_GRAPH_CONFIG` (as set in task 1.1); document "shipped ON — 0% regression" in the checklist.
    - If the comparison reports ANY regression: SET `kgPruneEnabled` default to `false` in `DEFAULT_KNOWLEDGE_GRAPH_CONFIG`; document "shipped OFF pending regression fix" with the specific regressing case(s) in the checklist. The manual `prune-graph` op remains available regardless.
  - Confirm version bump label: **MINOR** (additive config knobs, one additive `IF NOT EXISTS` index, new flag-gated behavior, new CLI/HTTP admin op; no column change, no data-losing DDL, no public-contract break).
  - Update `openspec/changes/kg-superseded-pruning/checklists/requirements.md` with the final eval outcome and the shipped-default decision.
  **Independent Test:** Checklist file updated; `DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgPruneEnabled` matches the shipped decision; re-running `pnpm test` after any default flip still passes.
  **Verification:**
  - Run: `pnpm test && pnpm run build`
  - Expected: Suite green; build clean; checklist updated with shipped default, eval outcome, and MINOR version-bump confirmation.

- [x] 4.5 Confirm retrieval, export/import, and MCP surface remain byte-identical post-rollout
  **[USN-12]** | Priority: P1
  **Spec:** `retrieval/Retrieval Read Path MUST Be Unchanged by Pruning`; `store/Pruning MUST NOT Enter the Portable Export/Import Format`; `tools/C1 MUST NOT Change the MCP Tool Surface`
  **Design anchor:** File Changes row "read-only, NO change" (`queryKnowledgeLane`, multi-hop CTE, `getObservationFactsFromKg`, `deleteKnowledgeArtifactsForObservation`, `exportData`/`importData`); Constitution Check P1/P3
  Re-run the targeted regression suites confirming C1 introduced zero behavioral change to retrieval scoring, the export/import format, and the six-tool MCP registry, using whatever shipped default resulted from task 4.4.
  **Independent Test:** Phase 3 tasks 3.11, 3.12, 3.13, 3.16 all pass against the final shipped-default configuration.
  **Verification:**
  - Run: `pnpm test -- -t "retrieval|export|import|registry|mem_project"`
  - Expected: All targeted suites pass with the shipped default; zero divergence from pre-C1 retrieval output, export shape, or MCP tool count.

---

## Handoff Hints (Preserved from Design Phase — Preservation Constraints for Apply)

1. **`runSupersededPrune` is plain — NEVER wrap it in `db.transaction()` internally.** better-sqlite3 does not support nested transactions. The manual op (`pruneSupersededTriples`) is the ONLY caller that wraps it transactionally; the automatic path (inside `persistKgExtraction`) calls it directly, inheriting the caller's already-open transaction. This is THE single most important structural constraint in C1 (design Decision 3).
2. **Ordering inside the core is fixed:** select → count-before → (dry-run: return) → NULL dangling refs → delete prune set → orphan cleanup (gated) → count-after. NULLing BEFORE deleting keeps the invariant clean at every step and matches B3's own delete-path ordering.
3. **Slot key is `(source_id, subject_entity_id, relation)` — NEVER cross observations.** This matches B3's per-observation, same-subject-and-relation supersession-chain unit exactly. Do not collapse to `(subject_entity_id, relation)` or expand to include `object_entity_id`.
4. **Current rows (`superseded_at IS NULL AND superseded_by_triple_id IS NULL`) are structurally excluded from the selection query** — never filtered downstream. This is what makes "current never pruned" a structural property, not a policy choice that could regress.
5. **Both-flags gate is a pure boolean short-circuit BEFORE any added statement** in the automatic path. Do not read `kgPruneEnabled`/`kgSupersededKeepN`/`kgPruneOrphanEntities` or issue any query when the guard is false — this is what makes flag-off byte-identity provable by construction, not by testing alone.
6. **Batch `IN (...)` id lists to ≤ 500 per statement** for the NULL/DELETE steps, all within the ONE transaction (still all-or-nothing). SQLite's `SQLITE_MAX_VARIABLE_NUMBER` bounds a single statement; a first large backlog prune could otherwise exceed it.
7. **NULL BOTH `superseded_by_triple_id` AND `superseded_at`** on a survivor whose replacement was pruned — never NULL only one column. NULLing only the pointer while leaving `superseded_at` set would leave the row flagged superseded with no successor, itself becoming prune-eligible on a later run (an unintended cascade).
8. **`prune-graph` is CLI + HTTP ONLY — never register it as an MCP tool.** The registered MCP set stays exactly six tools (constitution P1). This mirrors the indexing delta's explicit requirement and the tools delta's counterpart assertion.
9. **Rebuild "just works":** because automatic enforcement lives inside `persistKgExtraction`, `rebuild-graph` automatically triggers keep-N enforcement per rebuilt observation when both flags are ON — no extra code is needed in `rebuildObservationFacts`. Note rebuild is NOT wrapped in a `db.transaction()`, so the automatic prune runs per-observation there, matching rebuild's existing non-atomic contract (this is acceptable and intentional, not a bug).
10. **Eval-gated default is the acceptance condition for `kgPruneEnabled` default `true`.** Do not hardcode `true` and skip task 4.2/4.4 — the shipped default MUST be recorded based on the actual OFF-vs-ON regression result, mirroring B3's own eval-gated precedent.
