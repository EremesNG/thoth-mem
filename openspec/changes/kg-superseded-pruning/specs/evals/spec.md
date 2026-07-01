# Delta for Evals

> Change **C1** (`kg-superseded-pruning`). Adds a keep-N retention eval case and a
> no-regression gate: pruning ON vs OFF MUST NOT worsen recall/rank on the existing
> retrieval fixtures, including the B2 multi-hop cases and the B3 supersession
> case. The no-regression gate is the acceptance condition for any decision to
> default `kgPruneEnabled` ON (the B2/B3 precedent). Fixtures seed the KG through
> the consolidated path (`kg_entities` + `kg_triples`) and build superseded state
> via the B3 on-update diff (SAVE-then-UPDATE the same observation), never by
> pre-seeding coexisting facts or inserting into the retired `observation_facts`.

## ADDED Requirements

### Requirement: Evals MUST Validate keep-N Retention Bounds Superseded Triples
The evaluation suite (`src/evals/retrieval.ts`) MUST include a retention case that,
through the consolidated KG path, drives a fact slot to hold MORE than
`kgSupersededKeepN` superseded triples (by repeatedly SAVING then UPDATING/re-
saving the same observation under one `topic_key` so the B3 on-update diff marks
successive replaced facts superseded), then invokes pruning (the store method or
the `prune-graph` op) and asserts that:
- the slot retains at most `kgSupersededKeepN` superseded triples (the N
  most-recent by `superseded_at` DESC, `id` DESC);
- CURRENT (non-superseded) facts are NOT pruned; and
- the current fact remains retrievable and correctly ranked after pruning.
The case MUST also exercise dry-run: a dry-run before the real prune MUST report
would-prune counts and mutate nothing, and the subsequent real prune MUST remove
exactly the previewed rows.

#### Scenario: keep-N retention leaves at most N superseded per slot
- GIVEN a slot driven to `N + k` superseded triples via save-then-update on one
  observation (`k > 0`)
- WHEN pruning runs with keep-N = `N`
- THEN the slot MUST retain exactly the `N` most-recent superseded triples
- AND the older `k` superseded triples MUST be gone
- AND the current fact MUST remain and MUST still be retrievable

#### Scenario: Dry-run preview matches the real prune in the eval
- GIVEN the same over-cap slot state
- WHEN a dry-run runs and then a real prune runs with no intervening change
- THEN the dry-run MUST report the would-prune counts without mutating
- AND the real prune MUST remove exactly the rows the dry-run reported

### Requirement: Eval Suite MUST Gate on No Retrieval Regression With Pruning Enabled
The existing retrieval-quality fixtures (including the B2 multi-hop cases and the
B3 supersession case) MUST pass both with pruning OFF and pruning ON; for each
case, ON outcomes MUST be no worse than OFF on pass/rank criteria. This
no-regression gate is the acceptance condition for any decision to default
`kgPruneEnabled` to ON. Because pruning removes only superseded (already-
deprioritized) rows, current-fact recall and rank MUST NOT regress.

#### Scenario: Existing fixtures do not regress with pruning enabled
- GIVEN the existing retrieval fixtures, including the B2 multi-hop and B3
  supersession cases
- WHEN the suite runs once with `kgPruneEnabled = false` and once with `true`
- THEN all passing OFF cases MUST still pass ON and MUST NOT worsen in rank

#### Scenario: Regression informs the documented default
- GIVEN a failing case in the no-regression comparison
- WHEN acceptance is recorded
- THEN the documented `kgPruneEnabled` default MUST NOT be flipped ON until the
  regression is resolved (the conservative provisional default remains OFF)

#### Scenario: B2 multi-hop and B3 supersession cases are re-validated under pruning
- GIVEN the B2 shared-entity multi-hop fixtures and the B3 supersession-wins case
- WHEN the suite runs with `kgPruneEnabled = true`
- THEN those cases MUST still surface their expected answers and MUST NOT regress
  versus pruning OFF

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **No-regression gate mirrors B2/B3:** The OFF-vs-ON comparison reuses the
  discipline B2 used for `kgMultiHopEnabled` and B3 for `kgSupersedeEnabled`. Since
  C1's provisional default is OFF (data-deleting; see the config delta), the gate is
  the evidence an operator/clarify decision would use to consider flipping the
  automatic default ON later.
- **Fixture builds superseded state via on-update diff (B3-consistent):** The
  retention fixture MUST create superseded rows by SAVING then UPDATING/re-saving
  the same observation (same `topic_key`) so the B3 diff marks replaced facts
  superseded. It MUST NOT pre-insert coexisting facts and MUST NOT rely on any
  removed cross-observation scan.
- **Fixture seeds via the KG path:** Retention fixtures establish facts through the
  consolidated KG path (`kg_entities` + `kg_triples`), consistent with the B1/B2/B3
  eval-fixture convention; no fixture inserts into the retired `observation_facts`
  table.
- **Eval location (code-accurate):** The retrieval eval suite is
  `src/evals/retrieval.ts` (the same file carrying the B1 facts-source checks, the
  B2 multi-hop cases, and the B3 supersession case). The retention case and the
  OFF/ON no-regression comparison are added there.
- **keep-N in the eval:** The retention case sets `kgSupersededKeepN` to a small
  value (e.g. `1` or `2`) so a few update cycles reliably exceed the cap, making the
  prune outcome deterministic and easy to assert.
