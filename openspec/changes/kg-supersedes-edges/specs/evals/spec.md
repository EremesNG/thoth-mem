# Delta for Evals

> Sub-change **B3** (`kg-supersedes-edges`). Adds a supersession-wins eval and a
> no-regression gate (existing retrieval, including B2 multi-hop, must not
> regress with supersession ON). The no-regression gate is the acceptance
> condition for defaulting `kgSupersedeEnabled` ON (the B2 precedent).
>
> **RE-SCOPED FIXTURE.** Supersession now fires on the ON-UPDATE DIFF, so the
> supersession-wins fixture is built by SAVING an observation under a `topic_key`
> and then RE-SAVING/UPDATING it under the same `topic_key` with a changed fact —
> NOT by pre-seeding two coexisting facts.

## ADDED Requirements

### Requirement: Evals MUST Validate That an Updated Fact Outranks the Fact It Replaced
The evaluation suite (`src/evals/retrieval.ts`) MUST include a supersession case
that, through the consolidated KG path, SAVES an observation under a `topic_key`
whose facts include `X`, then UPDATES/re-saves that observation under the same
`topic_key` so re-extraction replaces `X` with `Y` (driving the on-update diff
supersession). It MUST then assert that with the supersession flag ON the current
fact `Y`'s observation ranks ABOVE the superseded fact `X`'s evidence, and that
`X` is DEPRIORITIZED/FLAGGED but NOT deleted (it remains retrievable as history).
With the supersession flag OFF, the case MUST not raise and `X` MUST NOT be
specially deprioritized.

#### Scenario: Updated fact ranks above the fact it replaced with the flag on
- GIVEN an eval fixture that saves an observation with fact `X` under a `topic_key`
  and then updates it under the same `topic_key` to replace `X` with `Y`
- WHEN the retrieval eval runs with `kgSupersedeEnabled = true`
- THEN the current fact `Y`'s observation MUST rank above the superseded fact `X`
- AND `X` MUST still be present (flagged), not deleted

#### Scenario: Superseded fact is not specially deprioritized with the flag off
- GIVEN the same save-then-update fixture
- WHEN the retrieval eval runs with `kgSupersedeEnabled = false`
- THEN no supersession deprioritization MUST be applied and no error MUST be
  thrown

### Requirement: Eval Suite MUST Gate on No Retrieval Regression With Supersession Enabled
The existing retrieval-quality fixtures (including the B2 multi-hop cases) MUST
pass both with supersession OFF and ON; for each case, ON outcomes MUST be no
worse than OFF on pass/rank criteria. This no-regression gate is the acceptance
condition for defaulting `kgSupersedeEnabled` to ON. The B2 multi-hop eval cases
MUST be re-validated under supersession ON since B3 touches the shared write path
and the traversal path.

#### Scenario: Existing fixtures do not regress with supersession enabled
- GIVEN the existing retrieval fixtures, including the B2 multi-hop cases
- WHEN the suite runs once with `kgSupersedeEnabled = false` and once with `true`
- THEN all passing OFF cases MUST still pass ON and MUST NOT worsen in rank

#### Scenario: Regression flips the documented default
- GIVEN a failing case in the no-regression comparison
- WHEN acceptance is recorded
- THEN the documented `kgSupersedeEnabled` default MUST be flipped to OFF until
  weights/threshold are tuned

#### Scenario: B2 multi-hop cases are re-validated under supersession
- GIVEN the B2 shared-entity multi-hop recall fixtures
- WHEN the suite runs with `kgSupersedeEnabled = true`
- THEN those cases MUST still surface their expected multi-hop answers and MUST
  NOT regress versus supersession OFF

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-1 / FLAG-GATING (RESOLVED):** The eval gate uses the same discipline B2
  used for `kgMultiHopEnabled`: the no-regression comparison (OFF vs ON) is the
  acceptance condition for the default-ON setting of `kgSupersedeEnabled`.
- **Fixture builds supersession via on-update diff (RE-SCOPED):** The
  supersession fixture MUST create the superseded state by SAVING then
  UPDATING/re-saving the same observation (same `topic_key`) so the diff marks the
  replaced fact superseded. It MUST NOT rely on the removed cross-observation
  `topic_key` scan and MUST NOT pre-insert two coexisting same-`topic_key` facts.
- **Fixture seeding via the KG path:** Supersession fixtures MUST establish facts
  through the consolidated KG path (`kg_entities` + `kg_triples`), consistent with
  the B1/B2 eval-fixture convention; no fixture inserts into the retired
  `observation_facts` table.
- **Eval location (code-accurate):** The retrieval eval suite is
  `src/evals/retrieval.ts` (the same file carrying the B1 facts-source checks and
  the B2 multi-hop recall cases). The supersession case and the OFF/ON
  no-regression comparison are added there.
