# Delta for Knowledge Graph

> Change **C1** (`kg-superseded-pruning`) of Change C. Builds on shipped B3
> (`kg-supersedes-edges`), which replaced blind deletion of KG facts with
> supersede-not-delete: on re-extraction, removed/replaced triples are MARKED
> superseded (`superseded_by_triple_id`, `superseded_at`) and KEPT. B3 shipped the
> MARKING half of the lifecycle with NO retention mechanism, so superseded rows
> accumulate without bound, eroding the token-efficiency / bounded-recall goal
> (constitution **P4**). C1 closes the lifecycle by bounding that growth: it
> retains the N most-recent superseded triples per fact slot as recoverable
> history and prunes the older ones. CURRENT (non-superseded) facts are NEVER
> pruned.
>
> **P5 tension (disclosed).** B3's discipline is supersede-not-delete. C1
> intentionally DELETES old superseded rows, which sits in tension with that
> discipline. The framing is BOUNDED RETENTION that preserves the N most-recent
> supersession history, NOT a reversal of supersede-not-delete: current facts are
> never deleted and recent history is retained. The tension is explicit and is a
> candidate constitution-amendment note for a later phase.

## ADDED Requirements

### Requirement: Bounded Retention MUST Keep Only the N Most-Recent Superseded Triples Per Slot
The system MUST bound superseded-triple growth by a keep-N-most-recent-per-slot
retention policy. For each fact "slot", the system MUST retain only the
`kgSupersededKeepN` (see the config delta) most-recent SUPERSEDED triples and MUST
prune the older superseded triples in that slot. Recency MUST be ordered
DETERMINISTICALLY by `superseded_at` DESC, tie-broken by `id` DESC, so the same
database and the same `N` always yield the same retained set and the same prune
set (Success Criterion 5). CURRENT (non-superseded) triples — those with NULL
`superseded_at` AND NULL `superseded_by_triple_id` — MUST NEVER be pruned under any
trigger, regardless of how many exist in a slot. Pruning MUST require no embedding
model and no remote service (constitution **P2**).

A fact "slot" is the grouping key over which the keep-N window is counted. For C1
the slot MUST be `(source_id, subject_entity_id, relation)` — the per-slot window
is counted WITHIN a single observation's own triples, over each subject-entity +
relation pair, matching B3's per-observation, same-subject-and-relation
supersession-chain semantics. The slot MUST NOT cross observations: keep-N is
enforced independently per `source_id`, because B3 supersession is per-observation
per-slot and the writer's diff unit is the observation. See the resolved Decisions
below.

#### Scenario: A slot with more than N superseded triples is pruned to N
- GIVEN a slot with `N + k` superseded triples (`k > 0`) and any number of current
  triples
- WHEN retention is enforced for that slot with keep-N = `N`
- THEN exactly the `N` most-recent superseded triples (by `superseded_at` DESC,
  then `id` DESC) MUST be retained
- AND the older `k` superseded triples MUST be pruned
- AND every current (non-superseded) triple in the slot MUST remain

#### Scenario: A slot with exactly N superseded triples prunes nothing
- GIVEN a slot with exactly `N` superseded triples
- WHEN retention is enforced with keep-N = `N`
- THEN no triple MUST be pruned

#### Scenario: Current facts are never pruned regardless of count
- GIVEN a slot whose count of CURRENT (non-superseded) triples far exceeds `N`
- WHEN retention is enforced
- THEN no current triple MUST be pruned
- AND retention MUST act ONLY on superseded triples

#### Scenario: keep-N of zero prunes all superseded but keeps current
- GIVEN keep-N = `0` and a slot with superseded and current triples
- WHEN retention is enforced
- THEN every superseded triple in the slot MUST be pruned
- AND every current triple MUST remain

#### Scenario: Ties on superseded_at are broken deterministically by id
- GIVEN two superseded triples in a slot sharing the same `superseded_at` value at
  the keep-N boundary
- WHEN retention selects the retained set
- THEN the tie MUST be broken by `id` DESC so the retained/pruned partition is
  deterministic across repeated runs

### Requirement: Pruning MUST Be Deterministic and Repeatable
Pruning MUST be deterministic: the same database contents and the same
`kgSupersededKeepN` MUST always produce the same prune set (Success Criterion 5).
Re-running pruning after a prune with no intervening supersession MUST prune
nothing further (idempotent convergence). Pruning MUST NOT depend on wall-clock
time, iteration order, or any non-deterministic input.

#### Scenario: Repeated pruning converges
- GIVEN pruning has already run for a database with keep-N = `N`
- WHEN pruning runs again with the same `N` and no new supersession has occurred
- THEN no additional triple MUST be pruned

#### Scenario: Same inputs yield the same prune set
- GIVEN two identical database snapshots and the same `N`
- WHEN pruning computes the prune set for each
- THEN the two prune sets MUST be identical

### Requirement: Automatic Incremental Enforcement MUST Maintain the Cap Gated by the Master Flag
In addition to the manual op, the system MUST enforce the keep-N cap AUTOMATICALLY
during normal supersession so the cap is maintained in steady state without an
operator running the admin op. The automatic enforcement MUST run inside the shared
deterministic writer `persistKgExtraction` (`src/indexing/jobs.ts`), AFTER the B3
supersede-marking step, and MUST be scoped ONLY to the
`(source_id, subject_entity_id, relation)` slot(s) touched by the current write.
The automatic path MUST be gated so that the enforcement code path is entered ONLY
when the C1 master flag (`kgPruneEnabled`) is ON AND B3's `kgSupersedeEnabled` is
ON. When EITHER flag is OFF the enforcement path MUST NOT be entered, so the
supersession write path is byte-identical to pre-C1: no keep-N query, no prune, no
orphan cleanup, and no change to the write transaction shape. When both flags are
ON, after a supersession marking is written for an observation, the keep-N cap MUST
hold for the affected slot(s) (Success Criterion 1). The automatic enforcement MUST
reuse the same deterministic, transactional prune logic as the manual op (see the
store delta) so both triggers produce identical retention outcomes. (This clarify
pass pins the hook LOCATION and the gating PRINCIPLE; the exact implementation and
its byte-identical-when-disabled proof are detailed in design.)

#### Scenario: Cap holds in steady state with both flags on
- GIVEN `kgPruneEnabled` and `kgSupersedeEnabled` are both on and keep-N = `N`
- WHEN an observation is repeatedly updated so a slot would exceed `N` superseded
  triples
- THEN after each supersession write the slot MUST hold at most `N` superseded
  triples
- AND current facts MUST be unaffected

#### Scenario: Automatic enforcement is scoped to the slots the write touched
- GIVEN `kgPruneEnabled` and `kgSupersedeEnabled` are both on
- AND observation A owns superseded triples exceeding `N` in one of its slots
- WHEN a DIFFERENT observation B is written (touching only B's own slots) via the
  shared writer `persistKgExtraction`
- THEN the automatic enforcement MUST act only on the `(source_id,
  subject_entity_id, relation)` slots that observation B's write touched
- AND observation A's over-cap slot MUST be left unchanged by B's write

#### Scenario: Automatic path is byte-identical to pre-C1 when the master flag is off
- GIVEN `kgPruneEnabled` is off (B3 supersession may be on)
- WHEN an observation is saved, updated, upserted, or rebuilt
- THEN no incremental keep-N enforcement MUST run
- AND the supersession write path MUST issue no extra query and MUST preserve its
  pre-C1 transaction shape

#### Scenario: Automatic path is inert when supersession is off
- GIVEN `kgSupersedeEnabled` is off (so no rows are ever superseded)
- WHEN an observation is saved or rebuilt with `kgPruneEnabled` on
- THEN no automatic pruning MUST occur and behavior MUST be byte-identical to
  pre-C1

### Requirement: Pruning MUST NOT Delete Current Facts or Cross Unrelated Slots
Pruning MUST act only on superseded triples within the slot being bounded and MUST
NOT delete current facts, MUST NOT prune superseded triples belonging to a
different slot, and MUST NOT alter any triple's supersession markings on surviving
rows except as required by the referential-safety cleanup (see the store delta:
dangling `superseded_by_triple_id` refs pointing at pruned rows are NULLed). A
wrong slot key or off-by-one MUST NOT be able to delete more history than the
keep-N policy specifies.

#### Scenario: Pruning one slot does not touch another slot's history
- GIVEN two slots each holding more than `N` superseded triples
- WHEN retention is enforced for the first slot only (e.g. via the automatic path
  scoped to the affected slot)
- THEN only the first slot's excess superseded triples MUST be pruned
- AND the second slot's superseded triples MUST remain

#### Scenario: A surviving superseded row keeps its own markings
- GIVEN a retained superseded triple whose `superseded_by_triple_id` points at a
  triple that is NOT in the prune set
- WHEN pruning completes
- THEN that retained row's `superseded_at` and `superseded_by_triple_id` MUST be
  unchanged

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Builds on B3 supersession columns:** C1 reads the B3 supersession state
  (`superseded_at`, `superseded_by_triple_id` on `kg_triples`) to identify
  superseded rows; a row is CURRENT iff both are NULL. C1 adds no new columns to
  `kg_triples`; retention is query-driven (Success Criterion: no destructive DDL
  migration, no down-migration needed).
- **Recency ordering reuses B3's timestamp:** "Most-recent" superseded is ordered
  by `superseded_at` DESC then `id` DESC. `superseded_at` is the B3 marking
  timestamp; `id` is the monotonic `kg_triples` primary key, giving a total,
  deterministic order even when `superseded_at` ties.
- **Automatic-trigger determinism mirrors B3 flag-gating:** The automatic path is
  gated exactly like B3's write gating so flag-off is byte-identical. The primary
  signal that a slot may exceed the cap is a fresh supersession marking on the
  observation just written; the automatic path is scoped to the slot(s) that
  observation touched to keep steady-state batches small (the proposal's
  incremental-enforcement intent). The hook point is RESOLVED (see Decisions below):
  enforcement runs inside the shared writer `persistKgExtraction`
  (`src/indexing/jobs.ts`) after B3 supersede-marking, entered only when both flags
  are ON. The exact implementation and its byte-identical-when-disabled proof (a
  dedicated test, mirroring B3's guarantee) are detailed in design.
- **Reversibility limit (disclosed):** Rows pruned while the feature is ON are not
  recoverable from the KG; they can only be reconstructed by re-running
  `rebuild-graph` from source observations, which regenerates CURRENT facts, not
  historical superseded chains (this is inherent to bounded retention and is why
  the config delta's provisional default leans OFF).
- **Out of scope (from the proposal):** age/TTL-based pruning, confidence-threshold
  pruning, SQLite `VACUUM`/file-shrink, portable export/import format changes, any
  MCP tool surface change, and pruning CURRENT facts are all explicitly OUT OF
  SCOPE for C1.

## Decisions (resolved in clarify)
- **Fact "slot" definition (was: slot-key fork) — RESOLVED:** the slot is
  `(source_id, subject_entity_id, relation)`. keep-N is enforced per-observation
  (`source_id`) per subject-entity + relation pair and MUST NOT cross observations,
  because B3 supersession is per-observation per-slot and this matches the writer's
  diff unit. Encoded above in the slot-definition prose of the "Bounded Retention"
  requirement. (Not chosen: `(subject, relation, object)`, the coarser
  `(subject_entity_id, relation)` collapsing all objects across observations, or a
  pure per-source-observation key.)
- **Automatic-trigger hook point (was: hook-point + flag-off byte-identity fork) —
  RESOLVED:** enforcement runs INSIDE the shared deterministic writer
  `persistKgExtraction` (`src/indexing/jobs.ts`), AFTER the B3 supersede-marking
  step, scoped only to the slots the current write touched. The enforcement path is
  entered ONLY when `kgPruneEnabled` AND `kgSupersedeEnabled` are both ON; when
  either is OFF the path is not entered, giving byte-identical-to-pre-C1 behavior.
  Clarify pins the hook LOCATION and gating PRINCIPLE; design details the
  implementation and the dedicated byte-identical-when-disabled test.
