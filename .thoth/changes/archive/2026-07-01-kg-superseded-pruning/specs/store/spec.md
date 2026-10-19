# Delta for Store

> Change **C1** (`kg-superseded-pruning`). Adds a deterministic, transactional
> store method `pruneSupersededTriples` that computes the keep-N prune set, NULLs
> dangling `superseded_by_triple_id` refs, deletes the prune set, cleans orphaned
> `kg_entities`, and returns before/after counts. Reused by BOTH the manual
> `prune-graph` op (see the indexing delta) and the automatic incremental path.
> No new `kg_triples` column is added (retention is query-driven). Flag-off and
> the portable export/import format are unchanged (constitution **P2**).
>
> **REFERENTIAL SAFETY.** The FK cascade is entity→triple, NOT triple→entity
> (`src/store/schema.ts:213-214`), so deleting a subset of triples does not
> auto-collect orphaned entities and can leave surviving rows'
> `superseded_by_triple_id` pointing at deleted rows. Both hazards MUST be handled
> IN THE SAME TRANSACTION, reusing B3's proven NULL-dangling idiom
> (`src/store/index.ts:1151-1158`).

## ADDED Requirements

### Requirement: Store MUST Provide a Deterministic, Transactional `pruneSupersededTriples` Method
The store MUST provide a method (working name `pruneSupersededTriples`) that
enforces the keep-N-most-recent-per-slot retention policy (see the knowledge-graph
delta) over superseded `kg_triples`. It MUST accept an optional `project` scope and
an optional `dryRun` flag, and it MUST return a before/after count summary. The
method MUST be DETERMINISTIC (same DB + same `kgSupersededKeepN` ⇒ same prune set;
Success Criterion 5) and TRANSACTIONAL (all-or-nothing; a failure MUST leave the
KG unchanged; Success Criterion 5). It MUST require no embedding model and no
remote service (constitution **P2**). It MUST compute the prune set by ranking each
slot's superseded triples by `superseded_at` DESC, `id` DESC and selecting rank
`> N` for pruning, and it MUST NOT select any current (non-superseded) triple.

#### Scenario: Prune enforces keep-N and returns counts
- GIVEN slots with more than `kgSupersededKeepN` superseded triples
- WHEN `pruneSupersededTriples` runs (not in dry-run)
- THEN each slot MUST be reduced to at most `kgSupersededKeepN` superseded triples
- AND the method MUST return a summary including superseded-triples pruned,
  entities removed, dangling refs NULLed, and before/after totals

#### Scenario: Prune is all-or-nothing on failure
- GIVEN a prune is in progress within its transaction
- WHEN an error occurs before the transaction commits
- THEN no triple, entity, or reference MUST be changed (the KG MUST be unchanged)

#### Scenario: Prune is deterministic for identical inputs
- GIVEN two identical database snapshots and the same `kgSupersededKeepN`
- WHEN `pruneSupersededTriples` runs against each
- THEN the pruned rows and the returned counts MUST be identical

#### Scenario: Project scope bounds the prune
- GIVEN superseded triples across multiple projects
- WHEN `pruneSupersededTriples` runs with a `project` scope
- THEN only superseded triples for that project MUST be eligible for pruning
- AND other projects' superseded triples MUST remain

### Requirement: Dry-Run Mode MUST Report Would-Prune Counts Without Mutating
`pruneSupersededTriples` MUST support a `dryRun` mode that computes ALL the counts
it WOULD produce (triples to prune, entities that would be orphaned and removed,
dangling refs that would be NULLed, and before/after totals) WITHOUT deleting,
NULLing, or otherwise mutating any row (Success Criterion 2). Dry-run MUST compute
the identical prune set that a real run would compute for the same inputs, so the
preview is trustworthy. After a dry-run, a subsequent identical real run MUST prune
exactly the previewed rows.

#### Scenario: Dry-run computes counts and mutates nothing
- GIVEN slots that exceed keep-N
- WHEN `pruneSupersededTriples` runs with `dryRun` enabled
- THEN it MUST return the would-prune counts (triples, entities, NULLed refs,
  before/after)
- AND no `kg_triples` row, `kg_entities` row, or `superseded_by_triple_id`
  reference MUST be changed

#### Scenario: Dry-run preview matches the real prune set
- GIVEN a fixed database state and `kgSupersededKeepN`
- WHEN a dry-run is followed by a real run with no intervening change
- THEN the real run MUST prune exactly the rows the dry-run reported

### Requirement: Subset Prune MUST NULL Dangling Supersession Refs and Clean Orphaned Entities Transactionally
Before deleting the prune set, `pruneSupersededTriples` MUST, IN THE SAME
TRANSACTION: (a) NULL any `superseded_by_triple_id` on SURVIVING `kg_triples` rows
that points at a row in the prune set (reusing the B3 NULL-dangling UPDATE idiom,
`src/store/index.ts:1151-1158`), so no surviving row references a deleted triple;
and (b) after the delete, remove any `kg_entities` row left with zero referencing
`kg_triples` (orphaned), because the FK cascade is entity→triple only
(`src/store/schema.ts:213-214`) and does not auto-collect orphaned entities. The
orphaned-entity cleanup MUST be gated by `kgPruneOrphanEntities` (see the config
delta); when disabled, triple pruning and dangling-ref NULLing still occur but
orphaned entity rows are left in place. After a prune with orphan cleanup enabled,
referential integrity MUST hold: no surviving row's `superseded_by_triple_id`
points at a deleted row, and no `kg_entities` row has zero referencing triples
(Success Criterion 3).

#### Scenario: Dangling supersession refs are NULLed, not left pointing at deleted rows
- GIVEN a surviving superseded triple whose `superseded_by_triple_id` points at a
  triple that is in the prune set
- WHEN the prune runs
- THEN that surviving row's `superseded_by_triple_id` MUST be NULLed in the same
  transaction as the delete
- AND no surviving row MUST reference a deleted triple after the prune

#### Scenario: Orphaned entities are removed when cleanup is enabled
- GIVEN a `kg_entities` row whose only referencing triples are all in the prune set
- WHEN the prune runs with `kgPruneOrphanEntities` enabled
- THEN that entity row MUST be removed after the delete
- AND no `kg_entities` row with zero referencing triples MUST remain

#### Scenario: Entities still referenced by surviving triples are retained
- GIVEN an entity referenced by both a pruned triple and a surviving triple
- WHEN the prune runs with orphan cleanup enabled
- THEN that entity MUST be retained (it still has a referencing triple)

#### Scenario: Orphan cleanup disabled leaves entities but still prunes triples
- GIVEN `kgPruneOrphanEntities` is disabled and a prune orphans some entities
- WHEN the prune runs
- THEN the excess superseded triples MUST still be pruned and dangling refs NULLed
- AND the orphaned entity rows MUST be left in place

### Requirement: Prune Must Not Double-Clean With the Per-Observation Delete Path
The prune path and the existing per-observation delete path
(`deleteKnowledgeArtifactsForObservation`, `src/store/index.ts:1148-1164`, and the
hard-delete transaction `:1594-1599`) MUST leave `kg_entities`/`kg_triples`
consistent and MUST NOT interfere with each other: a prune MUST NOT depend on or
corrupt an observation delete, and neither MUST leave dangling supersession
references or orphaned entities. Deleting an observation whose triples supersede
another observation's retained rows MUST NOT be broken by C1 (B3 already
guarantees readers treat an unresolved `superseded_by_triple_id` as still-
superseded history without error).

#### Scenario: Prune after observation delete stays consistent
- GIVEN an observation has been hard-deleted (its `kg_triples` removed by
  `source_id`) leaving some superseded rows in other slots
- WHEN `pruneSupersededTriples` subsequently runs
- THEN it MUST prune per keep-N without error
- AND it MUST NOT leave dangling supersession references or orphaned entities

### Requirement: Pruning MUST NOT Enter the Portable Export/Import Format
Pruning MUST remain internal-only and MUST NOT change the portable sync/export
format or its `version` (constitution **P2**; Success Criterion 6). `exportData`
(`src/store/index.ts:3626-3663`, `version: 1`) serializes only
`sessions`/`observations`/`prompts` and never `kg_triples`/`kg_entities`; it MUST
continue to do so. The export `version` MUST NOT change as a result of C1, and
`importData` behavior MUST be unaffected. Existing export-import tests
(`tests/store/export-import.test.ts:81-132`, which assert kg columns are absent)
MUST still pass.

#### Scenario: Export shape and version are unchanged by C1
- GIVEN C1 is applied
- WHEN `exportData` produces an export
- THEN the export MUST contain only `sessions`, `observations`, and `prompts`
- AND it MUST NOT contain `kg_triples`, `kg_entities`, or any pruning-related field
- AND the export `version` MUST be unchanged

#### Scenario: Import is unaffected by pruning
- GIVEN an export produced before or after C1
- WHEN `importData` imports it
- THEN it MUST import `sessions`/`observations`/`prompts` exactly as before
- AND it MUST NOT require or reference any pruning state

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Method naming (working name):** `pruneSupersededTriples` is a working name; the
  precise signature is a design decision. The spec requires only a deterministic,
  transactional method that accepts an optional `project` and `dryRun`, enforces
  keep-N, performs the referential-safety cleanup, and returns before/after counts.
- **Count pattern mirrors `rebuildObservationFacts`:** The before/after delta
  summary reuses the count idiom at `src/store/index.ts:3469-3497`
  (`rebuildObservationFacts`), so the operator-facing result shape is consistent
  with the existing rebuild op.
- **NULL-dangling idiom reuse (code-accurate):** The dangling-ref NULLing reuses
  B3's exact UPDATE idiom at `src/store/index.ts:1151-1158`; C1 applies it to the
  prune set (survivors pointing at pruned rows) rather than to a deleted
  observation's triples.
- **No DDL / no down-migration:** keep-N is query-driven; C1 adds no destructive
  DDL. Any supporting index to make the per-slot ranking scan efficient (assessed
  in design) is additive and non-destructive and MAY remain on rollback (Success
  Criterion / Rollback: no schema rollback needed).
- **Shared logic across both triggers:** The same `pruneSupersededTriples` logic
  backs both the manual `prune-graph` op (full or `--project` scope) and the
  automatic incremental path (scoped to affected slots), so both triggers produce
  identical, deterministic retention outcomes.
- **First-prune batch size (known tradeoff):** A first prune over a large
  accumulated B3 backlog may be a large transaction; batching/scoping is a design
  concern (`--project` scope and steady-state incremental enforcement keep later
  batches small). This spec requires transactional all-or-nothing correctness, not
  a specific batching strategy.
