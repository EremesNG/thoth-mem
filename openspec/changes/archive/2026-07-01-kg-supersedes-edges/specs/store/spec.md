# Delta for Store

> Sub-change **B3** (`kg-supersedes-edges`). Additive nullable supersession
> columns on `kg_triples`, a DIFF-based deterministic supersession write that
> replaces the blind delete+reinsert in the shared writer, and
> supersession-aware deprioritization in `queryKnowledgeLane`. History is
> preserved (constitution **P5**); flag-off output is byte-identical to pre-B3.
>
> **RE-SCOPED WRITE.** `persistKgExtraction` (`src/indexing/jobs.ts:502-556`)
> currently DELETEs an observation's triples by `source_id` (`:537`) and
> reinserts the freshly-extracted set on every re-extraction. That blind delete
> both makes cross-observation supersession detection impossible and violates
> **P5** at the graph layer. B3 replaces it with a DIFF-and-mark-superseded write.

## ADDED Requirements

### Requirement: `kg_triples` MUST Gain Nullable Supersession Columns via Additive Migration
The `kg_triples` table (`src/store/schema.ts:195-213`) MUST gain two additive,
NULLABLE columns: `superseded_by_triple_id` (INTEGER, nullable, referencing the
newer `kg_triples.id` that supersedes this row) and `superseded_at` (TEXT
timestamp, nullable). The columns MUST be added via the established
`addColumnIfMissing` pattern (`src/store/migrations.ts:103`) inside the LIVE
migration runner `runMigrationsWithSemantic` (`src/store/migrations.ts:213-217`),
mirroring `LEGACY_COLUMN_MIGRATIONS` (`src/store/migrations.ts:27-30`). NO
existing column MUST be altered or dropped, and no NOT NULL/DEFAULT constraint
that would rewrite existing rows MUST be introduced. The migration MUST be
IDEMPOTENT (safe to run on every startup; `addColumnIfMissing` no-ops when the
column already exists) and backward-compatible (existing rows have NULL
supersession columns, meaning "current/not superseded").

#### Scenario: Migration adds the columns when absent
- GIVEN a `kg_triples` table without the supersession columns
- WHEN `runMigrationsWithSemantic` runs
- THEN `superseded_by_triple_id` and `superseded_at` MUST be added as nullable
  columns
- AND existing rows MUST have NULL for both (treated as current)

#### Scenario: Migration is idempotent across restarts
- GIVEN the supersession columns already exist
- WHEN `runMigrationsWithSemantic` runs again
- THEN the column-add step MUST be a safe no-op and MUST NOT raise an error
- AND existing data MUST be unchanged

#### Scenario: Backward-compatible with pre-B3 rows
- GIVEN `kg_triples` rows written before B3
- WHEN graph reads run after the migration
- THEN those rows MUST behave as current (non-superseded) and MUST remain
  readable without error

### Requirement: The Deterministic Writer MUST Diff and Mark Superseded Instead of Delete-and-Reinsert
When the supersession feature flag is enabled, the shared deterministic writer
`persistKgExtraction` (`src/indexing/jobs.ts:502-556`, reached by the synchronous
`refreshGraphFacts` → `writeDeterministicKgFacts` path, `src/store/index.ts:1119-1126`,
call sites upsert `:1515`, save `:1545`, update `:1664`, and by the `extract_kg`
job and `rebuild-graph` at `:3416`) MUST NOT blindly delete the observation's
prior triples by `source_id` (`src/indexing/jobs.ts:537`). Instead it MUST DIFF
the observation's PRIOR stored triples against its NEWLY-EXTRACTED triples (for
the same `source_id`) and:

- For a prior triple ABSENT from or REPLACED in the new set, set `superseded_at`
  on that prior triple (and set `superseded_by_triple_id` to the replacing
  triple's id when a same-subject-and-relation/different-object replacement
  exists, else leave it NULL) and KEEP the row.
- For a triple present in BOTH sets, leave the current row unchanged (no
  duplicate insert, no supersede).
- For a triple NEW in the new set, insert it as a current triple.

The write MUST require no embedding model and no remote service (constitution
**P2**), MUST be performed synchronously so supersession is queryable immediately
after save returns, and MUST be idempotent and update-safe: re-extracting the
same observation with identical content MUST converge to the same triple set,
supersede nothing new, and accumulate no duplicate rows or markings (reusing the
per-observation `triple_hash`). The same diff write MUST apply in BOTH the
synchronous path and the `extract_kg`/`rebuild-graph` path (the writer is shared),
so the two paths stay consistent.

#### Scenario: Updating a fact supersedes the prior triple, queryable immediately
- GIVEN the flag is enabled and an observation whose stored facts include `X`
- WHEN the observation is updated so re-extraction replaces `X` with `Y`
  (same subject + relation, different object) and the save returns
- THEN the prior triple `X` MUST already carry `superseded_at` and a
  `superseded_by_triple_id` pointing at `Y`
- AND `Y` MUST be present as a current triple
- AND no background job completion MUST be required

#### Scenario: Prior triples are not deleted on re-extraction
- GIVEN the flag is enabled and an observation with stored triples
- WHEN the observation is re-extracted with a changed fact set
- THEN superseded prior triples MUST remain present in `kg_triples`
- AND the writer MUST NOT issue a blind delete-by-`source_id` of the prior
  triples

#### Scenario: Re-extracting identical content converges with no new supersession
- GIVEN an observation whose triples are already stored
- WHEN the same observation is re-extracted with byte-identical content
- THEN the stored triple set MUST be unchanged
- AND no triple MUST be newly marked superseded
- AND no duplicate row or marking MUST result

#### Scenario: Flag-off retains pre-B3 delete-and-reinsert behavior
- GIVEN the supersession feature flag is disabled
- WHEN an observation is saved, updated, upserted, or rebuilt
- THEN the writer MUST behave exactly as pre-B3 (delete the observation's prior
  triples by `source_id` and reinsert the extracted set)
- AND no supersession column MUST be set

### Requirement: `queryKnowledgeLane` MUST Deprioritize and Flag Superseded Triples, Not Drop Them
When the flag is enabled, `queryKnowledgeLane` (`src/store/index.ts:2074-2164`)
MUST deprioritize superseded triples (those with a non-NULL
`superseded_by_triple_id` OR a non-NULL `superseded_at`) so a current fact ranks
above its superseded version, and MUST FLAG the superseded candidate in its
evidence (constitution **P2**: secondary/degraded state signaled, never silently
dropped). Superseded triples MUST NOT be removed from the candidate set or
deleted; history MUST remain reachable. The deprioritization MUST be a
deterministic down-weight applied to the existing KG candidate scoring (the
`tripleCandidates` emission at `src/store/index.ts:2112-2130`). With the flag OFF,
`queryKnowledgeLane` MUST produce byte-identical candidates to pre-B3 (no
supersession column read affects scoring or shape).

#### Scenario: Current fact ranks above its superseded version
- GIVEN a superseded triple and the newer triple that supersedes it, both
  matching a query
- WHEN `queryKnowledgeLane` scores candidates
- THEN the current (non-superseded) triple MUST rank above the superseded one

#### Scenario: Superseded candidate is flagged, not dropped
- GIVEN a superseded triple matches a query
- WHEN `queryKnowledgeLane` emits candidates
- THEN the superseded candidate MUST still be emitted
- AND its evidence MUST carry a superseded marker indicating why it ranked lower

#### Scenario: Flag-off candidates are byte-identical to pre-B3
- GIVEN the supersession feature flag is disabled
- WHEN `queryKnowledgeLane` runs for any query
- THEN the emitted candidates (shape, scores, ordering) MUST be identical to
  pre-B3 behavior

### Requirement: Supersession Columns MUST NOT Enter the Portable Export/Import Format
The new supersession columns MUST remain internal-only and MUST NOT change the
portable sync/export format or its `version` (constitution **P2**). `exportData`
(`src/store/index.ts:3556`, `version: 1`) serializes only
`sessions`/`observations`/`prompts` and never `kg_triples`/`kg_entities`; it MUST
continue to do so, never serializing the supersession columns. The export
`version` MUST NOT change as a result of B3. Graph supersession state MUST remain
fully derivable on `rebuild-graph` (it is recomputed deterministically by
replaying the per-observation diff over `observations`).

#### Scenario: Export shape and version are unchanged by B3
- GIVEN B3 is applied
- WHEN `exportData` produces an export
- THEN the export MUST contain only `sessions`, `observations`, and `prompts`
- AND it MUST NOT contain `kg_triples` or any supersession column
- AND the export `version` MUST be unchanged

#### Scenario: Import is unaffected by the supersession columns
- GIVEN an export produced before or after B3
- WHEN `importData` (`src/store/index.ts:3595`) imports it
- THEN it MUST import `sessions`/`observations`/`prompts` exactly as before
- AND it MUST NOT require or reference the supersession columns

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-5 (RESOLVED — additive nullable columns on `kg_triples`):** Supersession
  is recorded with `superseded_by_triple_id` + `superseded_at` nullable columns
  on `kg_triples`, NOT a separate `kg_supersedes` table. Added via
  `addColumnIfMissing` in `runMigrationsWithSemantic` (`src/store/migrations.ts:213-217`,
  the same live runner and pattern B1 used for its drops). An optional supporting
  index on `superseded_by_triple_id` MAY be added (design decision) but is not
  required by this spec.
- **CL-6 (RESOLVED — deprioritize + flag, never delete):** Superseded triples are
  deprioritized and flagged in `queryKnowledgeLane`, never hidden or deleted, so
  history stays reachable (constitution **P5**). The current-state DEFAULT view
  is applied only at `mem_project action=graph` (see the tools delta), not in the
  recall lane.
- **Shared writer is `persistKgExtraction` (code-accurate, RE-SCOPED):** The
  proposal's `refreshObservationFacts` reference is stale; post-B1 the synchronous
  KG writer is `refreshGraphFacts` → `writeDeterministicKgFacts`
  (`src/store/index.ts:1119-1126`) → `persistKgExtraction`
  (`src/indexing/jobs.ts:502`). B3's diff write lives in `persistKgExtraction`,
  replacing the blind `DELETE ... WHERE source_id = ?` at `src/indexing/jobs.ts:537`.
  Because that writer is ALSO invoked by the `extract_kg` job and `rebuild-graph`
  (`src/store/index.ts:3416`), the diff applies to both paths from one place. The
  legacy `observation_facts` writer runs only under `graphFactsSource = 'legacy'`
  and is out of scope for supersession.
- **Live-runner placement (code-accurate, mirrors B1 CL-6):** The column-add MUST
  be in the LIVE runner `runMigrationsWithSemantic`, NOT in the inert
  `MIGRATIONS_SQL` array in `src/store/schema.ts` (re-exported only, no live
  runner). The `kg_triples` DDL in `schema.ts:195-213` MAY also declare the
  columns for fresh databases, but the additive `addColumnIfMissing` step is the
  mechanism that upgrades existing databases.
- **`triple_hash` UNIQUE collision on re-assert ([NEEDS CLARIFICATION] for
  design):** `triple_hash` is `TEXT NOT NULL UNIQUE` (`src/store/schema.ts:207`)
  and per-observation (`observation:${obs.id}:${tripleHash}`,
  `src/indexing/jobs.ts:552`). If a fact is superseded and then the SAME content
  is later re-asserted for that observation, the new insert produces the SAME
  `triple_hash` as the retained superseded row and collides on the UNIQUE
  constraint. RECOMMENDATION: on re-assert, REVIVE the existing superseded row
  (clear `superseded_at` / `superseded_by_triple_id`) rather than insert a
  duplicate. The existing `ON CONFLICT(triple_hash) DO UPDATE` (`:526-534`) gives
  a natural hook — extend it to also clear the supersession columns. Design owns
  the exact revive rule.
- **`superseded_by_triple_id` semantics (RESOLVED with recommendation):** A
  REPLACEMENT (a prior triple whose subject+relation match a new triple but whose
  object differs) sets `superseded_by_triple_id` to the replacing triple's id. A
  PURE REMOVAL (a prior triple with no replacement in the new set) sets
  `superseded_at` only and leaves `superseded_by_triple_id` NULL.
- **Storage growth (known tradeoff, RESOLVED — pruning deferred):** Triples now
  ACCUMULATE — superseded rows are retained (deprioritized) rather than deleted.
  This is the intended **P5** behavior. Pruning/compaction of long supersession
  chains is explicitly DEFERRED to Change C; B3 carries it as a known, bounded
  tradeoff.
- **Delete-path interaction:** `deleteKnowledgeArtifactsForObservation`
  (`src/store/index.ts:1148-1153`) still deletes an observation's `kg_triples` by
  `source_id` on hard delete; deleting a superseding observation's triples leaves
  dangling `superseded_by_triple_id` references. Readers MUST treat a superseded
  triple whose `superseded_by_triple_id` no longer resolves as still-superseded
  history (it MUST NOT error); cleanup of dangling references is a design decision
  and is not required to lose data.
