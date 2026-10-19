# Design: Bounded Retention for Superseded KG Triples (C1)

> Change **C1** (`kg-superseded-pruning`) of Change C. Builds on shipped + archived
> **B3** (`kg-supersedes-edges`: `superseded_by_triple_id` / `superseded_at` marking
> over `kg_triples`), **B2** (`kg-multi-hop-recall`), and **B1**
> (`graph-lite-consolidation`: `kg_triples` is the single graph-fact source). B3
> shipped the MARKING half of the supersession lifecycle with NO reclamation half;
> superseded rows accumulate without bound, eroding the token-efficiency /
> bounded-recall goal (constitution **P4**). C1 closes the lifecycle by pruning OLD
> superseded triples while NEVER touching current facts, keeping the N most-recent
> superseded rows per slot as recoverable history.
>
> **All architecture forks are LOCKED** (resolved in clarify; see each delta's
> `## Decisions`): slot = `(source_id, subject_entity_id, relation)`; automatic
> hook = inside `persistKgExtraction` after B3 marking, both-flags-gated; core =
> transactional `store.pruneSupersededTriples`; manual op = CLI `prune-graph` + HTTP
> `POST /graph/prune` (NOT an MCP tool); knobs `kgPruneEnabled` (default `true`,
> eval-gated), `kgSupersededKeepN` (default `10`), `kgPruneOrphanEntities` (default
> `true`). This design ELABORATES those decisions with code-accurate anchors,
> pseudocode, and proofs; it does not re-open them.
>
> **P5 framing (disclosed, not amended here).** C1 DELETES superseded rows, in
> tension with B3's supersede-not-delete discipline. Framing: BOUNDED RETENTION that
> preserves the N most-recent history — current facts are never deleted; recent
> supersession history is retained. See "Constitution Check" for why no amendment is
> forced now and where a note is flagged for a later phase.

## Technical Approach

C1 adds one deterministic, model-free retention primitive and wires it to two
triggers, reusing B3's proven idioms end-to-end.

**The primitive.** A new store method `pruneSupersededTriples({ project?, dryRun? })`
computes, per slot `(source_id, subject_entity_id, relation)`, the SUPERSEDED
triples ranked by `superseded_at DESC, id DESC` and marks rank `> kgSupersededKeepN`
for pruning. CURRENT triples (both supersession columns NULL) are structurally
excluded from selection and can never enter the prune set. Before deleting the prune
set it NULLs any surviving row's `superseded_by_triple_id` that points at a pruned
row (B3's exact idiom, `src/store/index.ts:1151-1158`), deletes the prune set, then
deletes `kg_entities` orphaned by the delete (FK cascade is entity→triple only —
`src/store/schema.ts:213-214` — so triple deletion does NOT auto-collect entities).
It returns a before/after count summary shaped like `rebuildObservationFacts`
(`src/store/index.ts:3458-3505`).

**Two triggers, one core.**

1. **Manual op** — CLI `prune-graph` (`--project`/`--all`/`--dry-run`) and HTTP
   `POST /graph/prune`, each a thin adapter mirroring `rebuild-graph`
   (`src/cli.ts:560-588` / `:700-702`; `src/http-routes.ts:61,71,573-581`;
   `src/http-server.ts:98`). `kind: 'indexing'`. Delegates to
   `pruneSupersededTriples`. Applies the transaction wrapper at the op boundary.
2. **Automatic incremental enforcement** — inside the shared writer
   `persistKgExtraction` (`src/indexing/jobs.ts:503-644`), AFTER the B3
   supersede-marking loop (`:609-624`), scoped ONLY to the slots the current write
   just superseded. Entered ONLY when `kgPruneEnabled` AND `kgSupersedeEnabled` are
   both true. When either is off the enforcement block is not entered — no new SQL,
   no transaction-shape change — so the write path is byte-identical to pre-C1.

**Transaction discipline (load-bearing constraint).** `persistKgExtraction` already
runs INSIDE the caller's `db.transaction()` on the sync save/upsert/update paths
(`src/store/index.ts:1536`, `:1511/:1527`, `:1632/:1680` → `refreshGraphFacts`
`:1119-1126` → `writeDeterministicKgFacts` `:484-501` → `persistKgExtraction`).
`better-sqlite3` does NOT support nested transactions — calling `db.transaction()`
again inside an open transaction throws. Therefore the shared retention LOGIC is
authored as a plain function (`runSupersededPrune`, no `db.transaction()` inside),
and the transaction is applied ONLY at the manual-op entry point
(`pruneSupersededTriples` wraps `runSupersededPrune` in `this.db.transaction(...)`).
The automatic path calls `runSupersededPrune` directly (no wrapper), inheriting the
caller's already-open transaction so it stays all-or-nothing with the surrounding
write. This is the single most important structural decision in C1 and is elaborated
in Decision 3.

Retrieval (`queryKnowledgeLane`, the multi-hop CTE, fusion), the portable
export/import format, and the 6-tool MCP surface are all UNCHANGED; pruned rows
simply stop appearing.

## Architecture Decisions

### Decision 1: Slot = `(source_id, subject_entity_id, relation)`; prune-selection by windowed rank

**Choice:** The keep-N window is counted over the slot key
`(source_id, subject_entity_id, relation)` — per-observation, per subject-entity +
relation pair — matching B3's per-observation, same-subject-and-relation supersession
chain (B3 marks a prior row superseded when a NEW triple has the same subject +
relation, different object, for the SAME `source_id`; `src/indexing/jobs.ts:616-624`).
Selection ranks each slot's SUPERSEDED rows by `superseded_at DESC, id DESC` and
takes rank `> N`. CURRENT rows (both columns NULL) are excluded by the `WHERE`
clause, so they are never counted and never selected.

Prune-selection SQL (parameterized, no interpolation — the `?` is bound to
`kgSupersededKeepN`; an optional `project` predicate is appended when scoped):

```sql
-- prune-eligible superseded triples: rank > N within each slot
WITH ranked AS (
  SELECT
    t.id,
    t.subject_entity_id,
    t.object_entity_id,
    ROW_NUMBER() OVER (
      PARTITION BY t.source_id, t.subject_entity_id, t.relation
      ORDER BY t.superseded_at DESC, t.id DESC
    ) AS rn
  FROM kg_triples t
  WHERE t.source_type = 'observation'
    AND (t.superseded_at IS NOT NULL OR t.superseded_by_triple_id IS NOT NULL)
    -- AND t.project = ?            -- appended only when a project scope is given
)
SELECT id, subject_entity_id, object_entity_id
FROM ranked
WHERE rn > ?;                       -- ? bound to kgSupersededKeepN
```

Properties: `ROW_NUMBER()` over the slot partition with the deterministic
`superseded_at DESC, id DESC` order gives a total order even on `superseded_at` ties
(the `id DESC` tiebreak, satisfying the knowledge-graph "Ties on superseded_at"
scenario). `rn > N` selects exactly the older-than-N-most-recent superseded rows.
`keep-N = 0` selects ALL superseded rows in the slot (rank starts at 1, so `1 > 0`),
matching the "keep-N of zero prunes all superseded but keeps current" scenario.
Current rows are absent from `ranked` entirely, so "current facts never pruned" holds
structurally, not by a downstream filter.

**Automatic path uses the SAME selection, narrowed to touched slots.** After B3
marking, the writer holds the exact set of prior rows it just superseded (`prior.id`,
plus their `subject_entity_id`/`relation`). Rather than re-derive slots, the automatic
path runs the identical windowed selection with an added
`AND t.source_id = ? AND t.subject_entity_id IN (…) AND t.relation IN (…)` narrowing
(or, equivalently, iterates the distinct touched `(subject_entity_id, relation)` pairs
for the fixed `source_id`). The ranking, ordering, and `rn > N` predicate are byte-for-byte
the shared logic; only the candidate-slot filter differs. This guarantees both triggers
produce identical retention outcomes for the same slot (store delta: "Shared logic across
both triggers").

**Alternatives considered:**
- *`(subject_entity_id, relation)` collapsing all objects across observations.* Rejected
  in clarify: would cross observations and count a different history unit than B3's
  per-`source_id` diff produces; keep-N would delete another observation's superseded
  chain. Contradicts "slot MUST NOT cross observations".
- *`(subject, relation, object)`.* Rejected: object is the axis that VARIES across a
  supersession chain (X→Y→Z share subject+relation, differ by object); partitioning by
  object would put each historical value in its own slot of size 1, making keep-N a
  no-op.
- *A correlated `NOT IN (… LIMIT N)` subquery instead of `ROW_NUMBER()`.* Rejected:
  SQLite subqueries with `LIMIT` per group are awkward and slower; `ROW_NUMBER()` is
  supported (SQLite ≥ 3.25, well below the project's baseline) and expresses the window
  directly.

**Rationale:** The slot key is exactly B3's supersession-chain unit, so keep-N bounds
the history B3 actually creates; the windowed rank is deterministic, parameterized, and
computes current-never-pruned as a structural property.

### Decision 2: Core is a plain function `runSupersededPrune`; `pruneSupersededTriples` wraps it transactionally; ordering NULL→delete→orphan

**Choice:** Factor the retention work into a plain function
`runSupersededPrune(db, { keepN, project?, dryRun?, orphanCleanup, slotFilter? })` that
performs, IN ORDER:

1. **Select** the prune set via Decision 1's windowed SQL (with `slotFilter` narrowing
   for the automatic path; full scope for the manual op).
2. **Count before** (`COUNT(*)` of all superseded rows in scope, and total triples) —
   mirroring `rebuildObservationFacts`' pre/post `COUNT(*)` probes
   (`src/store/index.ts:3469-3489`).
3. If `dryRun`: compute would-orphan entities and would-NULL refs by SELECT only, then
   RETURN counts WITHOUT any mutation (Decision 4).
4. **NULL dangling refs**: `UPDATE kg_triples SET superseded_by_triple_id = NULL,
   superseded_at = NULL WHERE superseded_by_triple_id IN (<prune ids>)` — B3's exact
   idiom (`src/store/index.ts:1151-1158`), applied to the prune set. (Note: this NULLs
   BOTH columns on a survivor whose replacement was pruned, so the survivor becomes
   CURRENT again — see Decision 5 for why this is the correct, history-preserving
   choice.)
5. **Delete** the prune set: `DELETE FROM kg_triples WHERE id IN (<prune ids>)`.
6. **Orphan cleanup** (gated by `orphanCleanup` = `kgPruneOrphanEntities`): delete
   `kg_entities` no longer referenced by ANY triple as subject OR object.
7. **Count after** and return the summary.

`store.pruneSupersededTriples(input)` is the MANUAL-op entry point: it resolves
`keepN`/`orphanCleanup` from `this.config.knowledgeGraph`, then runs
`this.db.transaction(() => runSupersededPrune(this.db, …))()`. The transaction gives
the manual op all-or-nothing semantics (store scenario "Prune is all-or-nothing on
failure"). `dryRun` still runs inside the transaction but performs no writes; because a
better-sqlite3 transaction that makes no changes commits nothing observable, dry-run is
a safe no-op.

Batch/large-store note: `IN (<prune ids>)` is materialized from the selection result.
For a first prune over a large accumulated backlog the prune set can be large; SQLite's
default `SQLITE_MAX_VARIABLE_NUMBER` (32766 on modern builds) bounds a single `IN
(…)`. The design CHUNKS the id list into batches of ≤ 500 for the NULL/DELETE steps
(all within the one transaction, so still all-or-nothing), keeping each statement well
under the parameter limit. Steady-state automatic enforcement touches only the slots of
one write, so its batches are tiny; the `--project` scope lets an operator bound the
first manual prune.

**Alternatives considered:**
- *Open a `db.transaction()` inside `runSupersededPrune` and call it from both triggers.*
  REJECTED — the automatic path already runs inside the caller's transaction; a nested
  `db.transaction()` throws in better-sqlite3. Verified: `refreshGraphFacts`
  (`:1119-1126`) is invoked inside `this.db.transaction()` on save/upsert/update
  (`:1536`, `:1527`, `:1680`).
- *Guard with `db.inTransaction` and conditionally wrap.* REJECTED as unnecessarily
  clever: separating the plain core from the wrapping entry point is clearer, keeps the
  automatic path's semantics explicit (it is part of the write txn), and avoids a
  runtime branch on transaction state.
- *Delete first, then NULL survivors, then orphan-clean.* REJECTED: deleting first would
  briefly leave a survivor pointing at a deleted id inside the txn; NULLing BEFORE the
  delete keeps the invariant clean at every step and matches B3's delete-path ordering
  (`deleteKnowledgeArtifactsForObservation` NULLs at `:1151-1158` before deleting at
  `:1160`).

**Rationale:** One shared logic path → identical outcomes for both triggers (store
delta requirement); the plain-core/wrapped-entry split is the only shape that keeps the
manual op all-or-nothing AND lets the automatic path join the surrounding write txn
without nesting.

### Decision 3: Automatic enforcement inside `persistKgExtraction`, after B3 marking, both-flags-gated; byte-identical when off

**Choice:** Insert the automatic enforcement block at the END of the flag-ON section of
`persistKgExtraction`, AFTER the B3 supersede-marking loop
(`src/indexing/jobs.ts:609-624`) and after the optional content-pattern block
(`:626-643`). It reads `kgPruneEnabled` from `store.config.knowledgeGraph` and is
entered only when BOTH `supersedeEnabled` (already in scope, `:506`) AND `kgPruneEnabled`
are true. It collects the distinct `(subject_entity_id, relation)` pairs of the rows it
just superseded (available from the `prior` rows matched in the marking loop) and calls
`runSupersededPrune(db, { keepN, orphanCleanup, slotFilter: { sourceId: obs.id, pairs } })`
— NO transaction wrapper (it inherits the caller's).

Shape (sketch, appended after `:643`):

```ts
// C1: automatic incremental keep-N enforcement (both flags ON only)
if (supersedeEnabled && knowledgeGraphConfig.kgPruneEnabled) {
  const touched = collectTouchedSlots(/* prior rows superseded in this write */);
  if (touched.length > 0) {
    runSupersededPrune(db, {
      keepN: knowledgeGraphConfig.kgSupersededKeepN,
      orphanCleanup: knowledgeGraphConfig.kgPruneOrphanEntities,
      slotFilter: { sourceId: obs.id, pairs: touched },
    });
  }
}
```

**Flag-off byte-identity PROOF (automatic path).** The enforcement block is guarded by
`supersedeEnabled && kgPruneEnabled`.
- If `kgPruneEnabled === false`: the `if` is false → the block never executes. No new
  `SELECT`/`UPDATE`/`DELETE` is issued; the transaction contains exactly the pre-C1
  statements. The rest of `persistKgExtraction` is untouched by C1 (C1 adds ONLY this
  trailing block plus reads of two config fields that don't exist on the hot path when
  the block is skipped). Therefore the write path is byte-identical to pre-C1 (which,
  when `supersedeEnabled` is true, is exactly B3). Satisfies knowledge-graph "Automatic
  path is byte-identical to pre-C1 when the master flag is off" and config "Automatic
  path off is byte-identical to pre-C1".
- If `supersedeEnabled === false`: the `if` is false regardless of `kgPruneEnabled`, AND
  the writer took the pre-B3 blind delete+reinsert branch (`:564-566`, `:605-607`) so no
  rows are ever superseded — nothing to prune. Byte-identical to pre-C1. Satisfies
  "Automatic path is inert when supersession is off".
- If both true but the write superseded nothing (`touched.length === 0`, e.g. a
  first-ever extract or an idempotent re-extract): the block computes an empty slot set
  and issues NO prune SQL. Steady-state rebuilds and no-op saves add zero query cost.

Because the guard is a pure boolean short-circuit BEFORE any added statement, "no extra
query on the hot supersession path when disabled" is guaranteed by construction (the
same discipline B3 used for its own flag; knowledge-graph delta "Automatic-trigger
determinism mirrors B3 flag-gating").

**LLM double-write interaction.** `processKgJob` calls `persistKgExtraction` up to twice
when the LLM path is `used` (`src/indexing/jobs.ts:452` deterministic, `:473`
LLM-enriched). The automatic prune runs at the end of EACH call, but it is idempotent
per slot (Decision 6): the second call re-runs the identical windowed selection over the
same slots and, since the first call already capped them to N, selects nothing. No
double-prune, no over-prune. (This is consistent with B3's own requirement that the
enriched write diff against `deterministic ∪ llm` so it does not mass-supersede;
`archive/.../design.md` Decision "extract_kg LLM double-write".)

**Alternatives considered:**
- *A post-write sweep in `src/store/index.ts` after `writeDeterministicKgFacts` returns.*
  Rejected: it would run outside the writer's slot knowledge (must re-derive touched
  slots), and on the sync path it would sit inside the same caller txn anyway — same
  constraint, less cohesion. Clarify LOCKED the hook inside `persistKgExtraction`.
- *Enforce for ALL of the observation's slots, not just touched ones.* Rejected: a write
  that supersedes slot A must not pay to re-scan slot B of the same observation that was
  untouched; scoping to touched slots keeps steady-state batches minimal (knowledge-graph
  "scoped to the slots the write touched") and is sufficient because only a fresh
  supersession can push a slot over N.

**Rationale:** Co-locating enforcement with marking is the only site where the touched
slots are known for free; the both-flags short-circuit makes flag-off provably
zero-cost; idempotency makes the double-write harmless.

### Decision 4: Dry-run — identical selection, zero mutation

**Choice:** `dryRun` uses the SAME windowed selection (Decision 1) and the SAME orphan /
dangling-ref computations as a real run, but performs them as SELECT-only probes and
returns before the mutating steps:

- would-prune triples = `COUNT` of the prune-set selection.
- would-NULL refs = `COUNT(*) FROM kg_triples WHERE superseded_by_triple_id IN (<prune
  ids>)` (survivors pointing at pruned rows).
- would-orphan entities = entities referenced ONLY by prune-set rows: `SELECT COUNT(*)
  FROM kg_entities e WHERE NOT EXISTS (SELECT 1 FROM kg_triples t WHERE (t.subject_entity_id
  = e.id OR t.object_entity_id = e.id) AND t.id NOT IN (<prune ids>))` restricted to
  entities that ARE referenced by some prune-set row. (Only meaningful when
  `kgPruneOrphanEntities` is on; when off, would-orphan is reported as 0 to match the real
  run's behavior.)
- before/after totals: `after = before - would-prune`.

Because dry-run computes the prune set with the identical query and no row is mutated, a
subsequent real run over the unchanged DB selects exactly the same ids (Decision 6
determinism) → "Dry-run preview matches the real prune set" and eval "Dry-run preview
matches the real prune in the eval" hold. Dry-run mutates nothing: it returns before
step 4 of `runSupersededPrune`, so no `UPDATE`/`DELETE` executes (store "Dry-run computes
counts and mutates nothing").

**Rationale:** Sharing the exact selection query between preview and execution is what
makes the preview trustworthy; the risk register's top item (data deletion) is mitigated
by a preview that cannot diverge from the real run.

### Decision 5: Dangling-ref handling — NULL survivors pointing at pruned rows (reuse B3 idiom), readers already tolerate transient dangling refs

**Choice:** When a pruned row is the TARGET of a surviving row's
`superseded_by_triple_id` (i.e. a survivor was superseded BY a row we are pruning), NULL
that survivor's `superseded_by_triple_id` AND `superseded_at` in the same transaction
BEFORE the delete, via B3's exact UPDATE idiom (`src/store/index.ts:1151-1158`). This
promotes the orphaned survivor back to CURRENT (both columns NULL), which is the correct
history-preserving outcome: its replacement no longer exists in the KG, so it is once
again the most-recent known fact for that slot.

Readers never JOIN on `superseded_by_triple_id`; B3 established that retrieval and the
graph view test supersession purely as `superseded_at IS NOT NULL OR
superseded_by_triple_id IS NOT NULL` (`archive/.../design.md` Decision "Deprioritize-and-flag";
`getObservationFactsFromKg` predicate at `src/store/index.ts:3472-3489`,
`:3430-3433`). Therefore even a TRANSIENT dangling ref (were one to exist mid-transaction)
is harmless — no reader errors, no history is lost. NULLing both columns is deliberate:
NULLing only the `_by_triple_id` while leaving `superseded_at` set would keep the row
flagged superseded with no successor, which would then itself become prune-eligible on a
later run — an unintended cascade. Clearing both makes the survivor current and stable.

**Alternatives considered:**
- *Point the survivor at the pruned row's own `superseded_by_triple_id` (re-link up the
  chain).* Rejected: over-engineered; C1 keeps only the N most-recent superseded rows, so
  re-linking into a pruned chain has no reader that consumes it, and it complicates
  determinism.
- *Leave the dangling ref (readers tolerate it).* Rejected: while readers tolerate it,
  Success Criterion 3 and the store spec REQUIRE "no surviving row's
  `superseded_by_triple_id` points at a deleted row" after a prune. Explicit NULLing
  satisfies the integrity invariant that tests assert.

**Rationale:** Reuses B3's proven, tested idiom; upgrades the orphaned survivor to a
correct current state; satisfies the post-prune referential-integrity criterion
deterministically.

### Decision 6: Determinism, idempotent convergence, and rebuild interaction

**Choice — determinism & idempotency.** The prune set is a pure function of
(DB contents, `kgSupersededKeepN`, optional scope): the windowed order
`superseded_at DESC, id DESC` is total (Decision 1), and no wall-clock, RNG, or iteration
order enters. Two identical snapshots yield identical prune sets (knowledge-graph "Same
inputs yield the same prune set"; store "Prune is deterministic for identical inputs").
Re-running with no intervening supersession prunes nothing: after a prune each slot holds
≤ N superseded rows, so `rn > N` selects none (knowledge-graph "Repeated pruning
converges"; store idempotency).

**Choice — rebuild interaction (RECOMMENDED: yes, when both flags on).** `rebuild-graph`
(`rebuildObservationFacts`, `src/store/index.ts:3441-3506`) iterates in-scope observations
and calls `writeDeterministicKgFacts(this, observation.id)` per observation (`:3479`).
Because the automatic enforcement lives INSIDE `persistKgExtraction`, rebuild AUTOMATICALLY
triggers keep-N enforcement per rebuilt observation's touched slots when both flags are on
— no extra code in `rebuildObservationFacts` is required. This is the desired behavior:
rebuild converges the KG to (current facts + at most N superseded per slot).

IMPORTANT transaction note: rebuild calls `writeDeterministicKgFacts` DIRECTLY (not via
`refreshGraphFacts`), and `rebuildObservationFacts` is NOT wrapped in a `db.transaction()`
(verified — the loop at `:3461-3498` runs statements directly). So during rebuild the
automatic prune runs OUTSIDE any surrounding transaction, one observation at a time. That
is acceptable: each `runSupersededPrune` call is a small, self-consistent sequence
(NULL→delete→orphan) over one observation's touched slots; a failure mid-rebuild leaves
earlier observations pruned and later ones not, exactly as pre-C1 rebuild already leaves
earlier observations re-extracted and later ones not (rebuild was never atomic across
observations). The MANUAL `prune-graph` op remains fully transactional; only the rebuild
side effect is per-observation, matching rebuild's existing non-atomic contract.

**Steady-state convergence proof (no over-pruning / no oscillation).** Consider a slot at
steady state (stored triples already equal the deterministic extraction):
- Re-extraction of that observation produces the SAME triple set → B3 diff supersedes
  NOTHING (removed-set empty; `archive/.../design.md` edge case "Identical re-extract") →
  `touched` is empty → automatic prune issues no SQL. The slot is unchanged.
- If the slot already held exactly N superseded rows from prior churn, a no-op
  re-extraction does not add an (N+1)-th, so nothing is pruned. Running rebuild twice in a
  row yields identical KG state (idempotent).
- Oscillation is impossible because pruning only ever DELETES superseded rows and the B3
  diff only CREATES a superseded row when a genuine replacement occurs; a rebuild with no
  content change creates none, so the (create, prune) pair cannot ping-pong. The fixed
  point is: current facts intact, ≤ N superseded per slot, and re-running changes nothing.

**Rationale:** Placing enforcement in the shared writer makes rebuild "just work" and
converge; the per-observation (non-atomic) rebuild side effect matches rebuild's existing
semantics, while the manual op stays atomic where atomicity is expected.

### Decision 7: No new column; keep-N is query-driven; reuse the existing superseded index; add one composite index for the slot scan

**Choice:** C1 adds NO column to `kg_triples` (retention is computed by the windowed
query; knowledge-graph "Builds on B3 supersession columns"). The existing B3 index
`idx_kg_triples_superseded ON kg_triples(superseded_by_triple_id)`
(`src/store/schema.ts:231`) already supports the dangling-ref lookup (`WHERE
superseded_by_triple_id IN (…)`). To make the per-slot windowed scan efficient, C1 adds
ONE additive, non-destructive index:

```sql
CREATE INDEX IF NOT EXISTS idx_kg_triples_slot_superseded
  ON kg_triples(source_id, subject_entity_id, relation, superseded_at);
```

This covers the `PARTITION BY source_id, subject_entity_id, relation ORDER BY
superseded_at` access pattern of Decision 1. It is added to `SEMANTIC_METADATA_INDEXES_SQL`
(`src/store/schema.ts:218-232`, all `CREATE INDEX IF NOT EXISTS`) for fresh DBs AND created
idempotently in the live migration runner (`runMigrationsWithSemantic`, mirroring B3's
optional index) so existing DBs gain it. Because it is `IF NOT EXISTS` and additive, it
needs no down-migration and MAY remain on rollback (store "No DDL / no down-migration").

**Alternatives considered:**
- *No new index (rely on `idx_kg_triples_project`/`_subject`).* Rejected: neither covers
  the composite partition+order; the window would fall back to a scan+sort per prune. The
  additive index is cheap insurance for the first large prune.
- *A partial index `WHERE superseded_at IS NOT NULL`.* Considered; deferred as a tasks-time
  optimization. The full composite index is simpler and correct; a partial variant can be
  substituted if profiling shows benefit (not required by any spec).

**Rationale:** Query-driven retention keeps the migration purely additive (constitution
**P3**); one composite index makes the core scan index-friendly without any destructive
DDL.

### Decision 8: Counter / result shape mirrors `rebuildObservationFacts`

**Choice:** `pruneSupersededTriples` (and `runSupersededPrune`) return a summary object,
reported verbatim by both triggers, shaped after `RebuildObservationFactsResult`
(`src/store/types.ts:332-337`):

```ts
export interface PruneSupersededTriplesResult {
  project: string | null;        // scope echoed back (null = all)
  dry_run: boolean;              // true when no mutation was performed
  slots_scanned: number;         // distinct slots examined
  triples_pruned: number;        // superseded rows deleted (would-delete in dry-run)
  entities_pruned: number;       // orphaned kg_entities removed (0 if cleanup off)
  dangling_refs_nulled: number;  // survivor superseded_by_triple_id refs NULLed
  superseded_before: number;     // superseded rows in scope before
  superseded_after: number;      // superseded rows in scope after (before - triples_pruned)
}
```

CLI `prune-graph` prints a Markdown block mirroring `handleRebuildGraph`
(`src/cli.ts:581-587`): `## Graph Prune Complete` / `- **Scope:** …` / `- **Dry run:**
…` / `- **Triples pruned:** …` / `- **Entities pruned:** …` / `- **Dangling refs
NULLed:** …` / `- **Superseded before → after:** …`. HTTP returns the object as JSON
(like `handleRebuildGraph` at `src/http-routes.ts:575-580`).

**Rationale:** Operator-facing consistency with the sibling rebuild op; the counts map
one-to-one to the spec's required categories (triples pruned, entities removed, dangling
refs NULLed, before/after totals) across store, indexing, and eval deltas.

## Data Flow

### Automatic path — save/update/upsert (both flags ON)

```text
saveObservation | updateObservation | upsert
  → this.db.transaction(():                                  [index.ts:1536 / :1511 / :1632]
       INSERT observation_versions(prior)                    [:1500 / :1633]
       UPDATE observations (same row, same source_id)
       refreshGraphFacts(obs)                                [:1119-1126]
         └─ writeDeterministicKgFacts(store, obs.id)         [jobs.ts:484-501]
              └─ persistKgExtraction(store, obs, extraction) [jobs.ts:503]
                   (B3) insert new triples (ON CONFLICT revive), mark removed/replaced
                        prior rows superseded                [jobs.ts:577-624]
                   (C1) if supersedeEnabled && kgPruneEnabled:
                          touched := distinct (subject_entity_id, relation) just superseded
                          runSupersededPrune(db, {keepN, orphanCleanup,
                                                  slotFilter:{sourceId:obs.id, pairs:touched}})
                            → SELECT prune set (rn > N) over touched slots  [Decision 1]
                            → NULL survivors' superseded_by refs → DELETE prune set
                            → (orphanCleanup) DELETE orphaned kg_entities
                   else: no C1 SQL (byte-identical to pre-C1)
     )()                                                     ← whole thing all-or-nothing
```

### Manual op — CLI / HTTP (transactional at the op boundary)

```text
CLI  prune-graph [--project P | --all] [--dry-run]           [cli.ts, mirror :560-588]
HTTP POST /graph/prune { project?, dryRun? }                 [http-routes.ts, mirror :573-581]
  → store.pruneSupersededTriples({ project?, dryRun? })
       → this.db.transaction(() =>                            ← manual op owns the txn
            runSupersededPrune(this.db, { keepN, orphanCleanup, project?, dryRun? }))()
            (dryRun → SELECT-only, return before any UPDATE/DELETE)
  → print/return PruneSupersededTriplesResult                [Decision 8]
```

### Rebuild — per-observation enforcement (both flags ON), non-atomic across observations

```text
rebuild-graph → rebuildObservationFacts({project?})          [index.ts:3441-3506]
  for each in-scope observation (NOT wrapped in a txn):       [:3461]
    writeDeterministicKgFacts(this, obs.id)                   [:3479]
      └─ persistKgExtraction → (B3 marking) → (C1 automatic prune of touched slots)
  steady-state: identical re-extract supersedes nothing → prune issues no SQL (converges)
```

### Retrieval / export — UNCHANGED

```text
hybridRetrieve → queryKnowledgeLane (B3 deprioritize + flag), multi-hop CTE (B2 bounds),
                 fuseCandidates  → reads NO C1 knob; pruned rows simply absent
exportData(version:1) → sessions/observations/prompts only; never kg_triples/kg_entities
```

### Sequence diagram (Mermaid)

```mermaid
sequenceDiagram
    participant Caller
    participant Store as Store.save/update
    participant Writer as persistKgExtraction
    participant Prune as runSupersededPrune
    participant DB as kg_triples / kg_entities

    Caller->>Store: save/update obs O (topic_key; same source_id)
    Store->>Store: BEGIN db.transaction()
    Store->>Writer: refreshGraphFacts(O) → writeDeterministicKgFacts(O.id)
    Writer->>DB: insert new triples (ON CONFLICT revive)
    Writer->>DB: (B3) UPDATE removed/replaced prior rows → superseded
    alt kgPruneEnabled && kgSupersedeEnabled
        Writer->>Prune: runSupersededPrune(slotFilter = touched slots of O)
        Prune->>DB: SELECT prune set (ROW_NUMBER rn > N, superseded only)
        Prune->>DB: NULL survivors' superseded_by refs pointing at prune set
        Prune->>DB: DELETE prune set
        opt kgPruneOrphanEntities
            Prune->>DB: DELETE kg_entities orphaned by the delete
        end
        Note over Prune,DB: current rows never selected; ≤ N superseded per slot after
    else either flag OFF
        Note over Writer,DB: no C1 SQL — write path byte-identical to pre-C1
    end
    Store->>Store: COMMIT (all-or-nothing incl. the prune)

    Note over Caller,DB: MANUAL op path (owns its own txn)
    Caller->>Store: prune-graph --dry-run  (CLI/HTTP)
    Store->>Prune: db.transaction(runSupersededPrune(dryRun=true))
    Prune->>DB: SELECT-only (compute would-prune/would-orphan/would-NULL)
    Prune-->>Caller: counts; ZERO mutation
    Caller->>Store: prune-graph  (real)
    Store->>Prune: db.transaction(runSupersededPrune)
    Prune->>DB: NULL → DELETE → orphan-clean (same selection as dry-run)
    Prune-->>Caller: PruneSupersededTriplesResult (actual counts)
```

## File Changes

Anchors are CURRENT (post-B3) line numbers verified in this repo state.

| File | Function / anchor | Change |
| --- | --- | --- |
| `src/store/index.ts` | NEW `pruneSupersededTriples` + NEW module-level `runSupersededPrune` (near `rebuildObservationFacts` `:3441-3506`) | Add the plain core `runSupersededPrune(db, opts)` (windowed selection Decision 1, NULL→delete→orphan Decision 2, dry-run Decision 4, batched id chunks) and the transactional entry `pruneSupersededTriples({project?, dryRun?})` that resolves knobs from `this.config.knowledgeGraph` and wraps the core in `this.db.transaction(...)`. Returns `PruneSupersededTriplesResult`. Reuse the NULL idiom from `:1151-1158` and the count idiom from `:3469-3489`. |
| `src/store/types.ts` | after `RebuildObservationFactsResult` (`:332-337`) | Add `PruneSupersededTriplesInput { project?: string; dryRun?: boolean }` and `PruneSupersededTriplesResult` (Decision 8). |
| `src/indexing/jobs.ts` | `persistKgExtraction` end of flag-ON section, after `:643` | Add the both-flags-gated automatic enforcement block (Decision 3): collect touched `(subject_entity_id, relation)` pairs from the B3 marking loop (`:616-624`), call `runSupersededPrune(db, {keepN, orphanCleanup, slotFilter})` with NO txn wrapper. Read `kgPruneEnabled`/`kgSupersededKeepN`/`kgPruneOrphanEntities` from `knowledgeGraphConfig` (already in scope, `:505`). Import `runSupersededPrune` from the store module (or expose via `store`). |
| `src/config.ts` | `KnowledgeGraphConfig` (`:39-51`), `DEFAULT_KNOWLEDGE_GRAPH_CONFIG` (`:161-173`), `resolveKnowledgeGraphConfig` (`:455-498`); `PersistedConfig.knowledgeGraph` is `Partial<KnowledgeGraphConfig>` (`:102`, auto-covers new fields) | Add 3 knobs + defaults (`kgPruneEnabled=true`, `kgSupersededKeepN=10`, `kgPruneOrphanEntities=true`); resolve env (`THOTH_KG_PRUNE_ENABLED`, `THOTH_KG_SUPERSEDED_KEEP_N`, `THOTH_KG_PRUNE_ORPHAN_ENTITIES`) > persisted > default via `parseBoolean`/`parseNumber`, exactly mirroring the B3 knob rows (`:463-466`, `:485-496`). |
| `config.schema.json` | `knowledgeGraph.properties` (`:161-241`, `additionalProperties:false`) | Document the 3 knobs: `kgPruneEnabled` (boolean), `kgSupersededKeepN` (integer, `minimum: 0`), `kgPruneOrphanEntities` (boolean), each with a description mirroring the B3 knob entries (`:186-204`). |
| `src/store/schema.ts` | `SEMANTIC_METADATA_INDEXES_SQL` (`:218-232`) | Add `CREATE INDEX IF NOT EXISTS idx_kg_triples_slot_superseded ON kg_triples(source_id, subject_entity_id, relation, superseded_at);` (Decision 7). No DDL/table change. |
| `src/store/migrations.ts` | live runner `runMigrationsWithSemantic` (B3 index precedent) | Idempotently ensure `idx_kg_triples_slot_superseded` on existing DBs (additive; mirror how the B3 superseded index / columns are ensured). |
| `src/cli.ts` | usage banner (`:34`), NEW `handlePruneGraph` (mirror `handleRebuildGraph` `:560-588`), dispatch (`:700-702`) | Add `prune-graph   Bound superseded graph history (keep-N)` to usage; add `handlePruneGraph(positionals, globals)` accepting `--project`/`--all`/`--dry-run` (reuse `handleRebuildGraph`'s project/all validation verbatim); dispatch `case 'prune-graph'`. Print the Markdown summary (Decision 8). |
| `src/http-routes.ts` | `OPERATION_CATALOG` (`:54-73`; add http entry near `:61` + cli entry near `:71`), NEW `handlePruneGraph` (mirror `:573-581`) | Add catalog entries `{ id:'prune-graph', origin:'http', kind:'indexing', method:'POST', path:'/graph/prune', … }` and `{ id:'cli-prune-graph', origin:'cli', kind:'indexing', target:'prune-graph', … }`. Add `handlePruneGraph(store, request)` reading `project`/`dryRun` from the body → `store.pruneSupersededTriples(...)`. |
| `src/http-server.ts` | imports (`:39`), `ROUTES` (`:98`) | Import `handlePruneGraph`; add `{ method:'POST', pattern:'/graph/prune', handler: handlePruneGraph }` after the `/graph/rebuild` row. |
| `src/http-openapi.ts` | after `/graph/rebuild` (`:191`) | Add a `/graph/prune` POST path entry mirroring rebuild's (request body `{project?, dryRun?}`, response = prune result), so the OpenAPI doc stays in parity. |
| `src/evals/retrieval.ts` | suite (B1/B2/B3 fixtures live here; admin-op-not-MCP note `:284-286`) | Add the keep-N retention case (SAVE-then-UPDATE to exceed a small `kgSupersededKeepN`, then dry-run == real prune, assert ≤ N superseded + current retained + still retrievable) and the OFF-vs-ON no-regression comparison over existing + B2 + B3 fixtures (Decision: eval-gated default). |
| `src/store/index.ts` (read-only, NO change) | `queryKnowledgeLane` (~`:2107`/`:2139`), multi-hop CTE (~`:2279`), `getObservationFactsFromKg` (`:3293-3438`), `deleteKnowledgeArtifactsForObservation` (`:1148-1164`), `exportData`/`importData` (`:3626-3663`) | Called out to CONFIRM no change: retrieval reads no C1 knob; the delete path already NULLs dangling refs (B3); export omits KG. Retrieval/tools/store deltas require these to stay byte-identical. |

## Interfaces / Contracts

- **`KnowledgeGraphConfig`** gains (design-final field names):
  `kgPruneEnabled: boolean` (default `true`, eval-gated), `kgSupersededKeepN: number`
  (default `10`, non-negative integer, global default overridable per-project via
  persisted config), `kgPruneOrphanEntities: boolean` (default `true`). Env keys:
  `THOTH_KG_PRUNE_ENABLED`, `THOTH_KG_SUPERSEDED_KEEP_N`,
  `THOTH_KG_PRUNE_ORPHAN_ENTITIES`.
- **`Store.pruneSupersededTriples(input: PruneSupersededTriplesInput):
  PruneSupersededTriplesResult`** — new public store method (manual-op entry, wraps the
  core in a transaction). Synchronous (no model/remote; constitution **P2**).
- **`runSupersededPrune(db, opts)`** — internal shared core (plain, no transaction
  wrapper); called by `pruneSupersededTriples` (wrapped) and by `persistKgExtraction`
  (inheriting the caller's txn). Not exported on any public surface.
- **CLI `prune-graph`** (`--project`/`--all`/`--dry-run`) and **HTTP `POST
  /graph/prune`** (`{ project?, dryRun? }`) — new admin op, `kind: 'indexing'`, NOT an
  MCP tool (constitution **P1**).
- **Unchanged contracts:** the six MCP tools (P1); `exportData` `version: 1` and its
  `sessions`/`observations`/`prompts`-only shape (never `kg_triples`/`kg_entities`);
  the four-lane set `sentence|chunk|lexical|kg`; all B3 knobs/weights and B2 bounds;
  `mem_project action=graph` current-state view; `kg_triples` schema (no new column).

## Testing Strategy

vitest + in-memory SQLite (`pnpm test`); eval gate via `pnpm test` on
`src/evals/retrieval.ts`. Headline: prove keep-N correctness at the boundaries, prove
flag-off byte-identity for BOTH the automatic and read paths, prove dry-run == real,
prove referential integrity + determinism/idempotency, and gate default-ON on the
OFF-vs-ON no-regression eval.

Store / knowledge-graph (`tests/store/…`):
1. **keep-N boundary**: slot with N+k superseded → exactly the N most-recent (by
   `superseded_at DESC, id DESC`) retained, older k pruned, all current retained.
2. **Exactly N** prunes nothing; **N+1** prunes exactly 1.
3. **keep-N = 0** prunes all superseded, keeps all current.
4. **Tie on `superseded_at`** at the boundary → partition deterministic by `id DESC`.
5. **Current never pruned** even when current count ≫ N.
6. **Determinism**: two identical snapshots → identical prune set + counts.
7. **Idempotent convergence**: second prune with no new supersession prunes nothing.
8. **All-or-nothing**: inject a failure mid-transaction (manual op) → KG unchanged.
9. **Project scope**: only the scoped project's superseded rows are eligible.
10. **Dangling-ref NULLing**: survivor superseded BY a pruned row → its
    `superseded_by_triple_id` AND `superseded_at` NULLed (becomes current); no survivor
    references a deleted id after prune.
11. **Orphan cleanup ON**: entity referenced only by pruned rows removed; entity shared
    with a survivor retained. **Orphan cleanup OFF**: triples still pruned + refs NULLed,
    orphan entity left in place.
12. **Delete-path non-interference**: hard-delete an observation, then prune → no error,
    no dangling refs, no orphans (store "Prune after observation delete stays consistent").
13. **Dry-run**: reports would-prune/would-orphan/would-NULL + before/after, mutates
    nothing; a following real run removes exactly the previewed rows.

Automatic path / flag-off (`tests/store/…`, `tests/indexing/…`):
14. **Steady-state cap (both flags ON)**: repeatedly SAVE-then-UPDATE one observation so
    a slot would exceed N → after each write the slot holds ≤ N superseded; current
    unaffected.
15. **Scoped to touched slots**: obs A over-cap in one slot; writing obs B leaves A's
    slot unchanged.
16. **Automatic flag-off byte-identical**: `kgPruneEnabled=false` (supersede on) → write
    path issues no prune SQL and DB state matches B3-only; assert via a query-count/spy
    that no extra statement runs (mirrors B3's flag-off test).
17. **Inert when supersede off**: `kgSupersedeEnabled=false`, `kgPruneEnabled=true` → no
    prune, byte-identical to pre-C1.
18. **LLM double-write**: simulate `used` path (two `persistKgExtraction` calls) → slot
    capped once, second call prunes nothing (idempotent), no over-prune.

Retrieval / tools (`tests/…retrieval`, `tests/…visualization`):
19. **Output depends only on surviving rows**: pruned vs unpruned DB (differ only in old
    superseded tail) → identical ranked output over current + retained rows.
20. **Current-fact rank unchanged** after pruning its slot's old superseded rows.
21. **Retrieval flag-off byte-identical**: `kgPruneEnabled=false` → `hybridRetrieve`
    fused output identical to pre-C1 (trivial — retrieval reads no C1 knob — but asserted).
22. **MCP registry unchanged**: exactly the six tools; no `prune`/`prune-graph` MCP tool.
23. **`mem_project action=graph`** current-state ledger unchanged by pruning.

Config / CLI / HTTP (`tests/config.test.ts`, CLI/HTTP tests):
24. **Config resolution**: env > persisted > default for all 3 knobs; defaults exactly
    `true/10/true`; **keep-N=0** resolves to `0` (no silent substitution);
    **per-project** persisted keep-N override resolves; schema validates a config with the
    knobs and rejects an unknown `knowledgeGraph` property.
25. **CLI/HTTP dry-run vs real**: both report the count categories; dry-run mutates
    nothing; real mutates; **no-op when `kgSupersedeEnabled` off** (zero counts, no error).

Export / eval:
26. **Export/import parity**: `version` unchanged, no KG columns, import unaffected
    (existing `tests/store/export-import.test.ts:81-132` still pass).
27. **Eval retention case + no-regression gate** (`src/evals/retrieval.ts`): keep-N case
    (small N, SAVE-then-UPDATE) leaves ≤ N superseded + current retrievable, dry-run ==
    real; OFF-vs-ON over existing + B2 multi-hop + B3 supersession fixtures shows ON no
    worse than OFF on pass/rank — the documented condition for shipping `kgPruneEnabled`
    default ON (else fall back to `false` and document).

## Migration / Rollout

- **Versioning: MINOR.** Additive config knobs, one additive `IF NOT EXISTS` index, new
  flag-gated behavior, a new CLI/HTTP admin op; no column change, no data-losing DDL, no
  public-contract break (constitution **P1/P3**; the P3 "destructive migrations require
  MAJOR" clause targets contract-breaking/data-losing SCHEMA migrations — C1's row
  deletion is a governed retention behavior, not a schema migration). *Note: C1 does
  delete data at runtime; the eval gate + dry-run + default rationale below are the
  controls, and the P5 note is flagged for a later constitution phase.*
- **Eval-gated default (tasks-level gate).** Ship `kgPruneEnabled` default **`true`**
  ONLY if the eval no-regression gate passes: run `src/evals/retrieval.ts` with
  `kgPruneEnabled=false` then `=true` over existing + B2 multi-hop + B3 supersession
  fixtures; require 0% regression (ON no worse than OFF on pass/rank). If ANY case
  regresses, ship default **`false`** and DOCUMENT the fallback (config delta "Default
  falls back to OFF when the eval gate regresses"). This mirrors B3's shipped-default
  discipline. The manual `prune-graph` op is available regardless.
- **Rollback (no code revert).** Set `kgPruneEnabled=false` (env/persisted) → the
  automatic path is byte-identical to pre-C1 (Decision 3 proof); no migration. The
  additive index is ignorable/droppable and MAY remain. Already-pruned rows are not
  recoverable from the KG (bounded-retention reversibility limit; knowledge-graph
  Assumptions) — reconstructable only by `rebuild-graph` from source observations, which
  regenerates CURRENT facts, not historical superseded chains. This limit is the reason
  dry-run + the eval gate front-load validation.
- **Forward migration.** `idx_kg_triples_slot_superseded` is created idempotently on
  startup (fresh-DB DDL + live runner); no-op once present; existing DBs upgrade
  transparently.
- **New `indexing` spec domain.** C1 introduces `specs/indexing/spec.md`, which did not
  exist pre-C1; on archive it becomes a NEW baseline spec (the CLI/HTTP admin-op contract
  for `prune-graph`). `sdd-archive` must create it rather than merge into an existing
  baseline.

## Constitution Check (self-review)

- **P1 — Compact MCP surface:** `prune-graph` is CLI + HTTP only; NO MCP tool added
  (tools/indexing deltas; `handlePruneGraph` never registered in the MCP tool set).
  Registry stays exactly six. PASS.
- **P2 — Deterministic-first, safe degradation:** the prune is deterministic and
  model-free (windowed rank over stored rows; no embedding/remote); retrieval fallback
  paths are untouched. PASS.
- **P3 — Harness-agnostic contract:** no schema column added; the one index is additive
  `IF NOT EXISTS`; export format + `version` unchanged; HTTP exposes the same op as the
  CLI (P3 "HTTP MUST expose the same operations"). PASS.
- **P4 — Token-efficient bounded recall:** C1 directly SERVES P4 by bounding
  superseded-row growth that inflates scan cost. PASS.
- **P5 — Stable public contract / deprecation discipline:** C1 ADDS a CLI command and an
  HTTP route (additive to the public contract); it renames/removes nothing. The
  supersede-not-delete SPIRIT (the P5 tension the deltas disclose) is a KG-lifecycle
  concern, not a public-contract element; bounded retention preserving the N most-recent
  history is not a public-contract break. No amendment is FORCED by C1. RECOMMENDATION
  (flag, do not amend here): record a PATCH-level constitution note that "bounded
  retention of superseded KG history is permitted and is not a reversal of
  supersede-not-delete," so future changes have explicit cover — to be handled by
  `sdd-constitution` in a later phase, not in this design.

No principle is violated; finalization is not blocked.

## Open Questions

None blocking (all clarify forks resolved; decisions LOCKED). Carry to `sdd-tasks`:

- **`collectTouchedSlots` plumbing.** The B3 marking loop (`jobs.ts:616-624`) matches
  `prior` rows but does not currently retain their `subject_entity_id` (it resolves
  subject/object by NAME). Cleanest: capture `subject_entity_id` on the superseded
  `prior` rows (add it to the prior SELECT at `:544-551`, already joins entities) so the
  automatic path has slot keys without an extra query. Confirm in apply.
- **Batch chunk size (500).** Chosen conservatively under
  `SQLITE_MAX_VARIABLE_NUMBER`; a first large prune could tune this. Not spec-load-bearing.
- **Partial index variant.** `idx_kg_triples_slot_superseded` could be `WHERE
  superseded_at IS NOT NULL` if profiling favors it; the full composite is the safe
  default.
- **P5 constitution note.** Whether to land the PATCH note above now (separate
  `sdd-constitution` run) or defer to Change C archive. Recommendation: defer; flagged,
  not blocking.
