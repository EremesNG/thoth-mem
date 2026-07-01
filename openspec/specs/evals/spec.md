# Delta for Evals

## ADDED Requirements
### Requirement: Evals MUST Validate sqlite-vec KNN Retrieval Defaults
Evaluation suites MUST validate that semantic retrieval uses sqlite-vec KNN semantics for sentence and chunk lanes and returns bounded top-k evidence using the configured defaults.

#### Scenario: Semantic lanes report KNN-bounded outputs
- GIVEN semantic indexes are available
- WHEN retrieval evals execute
- THEN reported evidence MUST confirm sentence top-k `100`, chunk top-k `20`, threshold `0.30`, and distance-to-score behavior unless explicitly reconfigured

### Requirement: Evals MUST Validate HyDE Dual Embedding Behavior
Evaluation suites MUST verify raw-query semantic retrieval remains active and HyDE answer embeddings contribute only when generation succeeds.

#### Scenario: HyDE success and failure are both measured
- GIVEN HyDE is enabled during evals
- WHEN generation succeeds or fails
- THEN eval output MUST distinguish raw-query-only retrieval from raw-plus-hypothetical-answer fused retrieval

### Requirement: Evals MUST Validate FTS5 Prefix Recall
Evaluation suites MUST verify lexical prefix matching behavior for eligible tokens and compare it against lexical-only baseline behavior.

#### Scenario: Prefix matching recalls variants
- GIVEN an eval query uses a token that has inflected or suffixed variants in the corpus
- WHEN lexical retrieval runs
- THEN FTS5 prefix matching MUST be measured as part of lexical and hybrid recall

### Requirement: Evals MUST Compare Hybrid Against Lexical Baseline
Evaluation suites MUST compare fused four-lane retrieval quality against lexical-only baseline.

#### Scenario: Hybrid and lexical baselines are measured
- GIVEN a stable evaluation corpus
- WHEN retrieval evals run
- THEN metrics MUST include both hybrid and lexical-only outcomes

### Requirement: Citation and Lineage MUST Be Verified Across Lanes
Evaluation outputs MUST verify source lineage and citations for sentence, chunk, lexical, and graph/KG evidence.

#### Scenario: Fused outputs retain source lineage
- GIVEN multi-lane fused results
- WHEN eval logic inspects outputs
- THEN each retained evidence item MUST include source-linkable lineage

### Requirement: Context Compression Quality MUST Be Measured
Evaluations MUST measure surgical sentence trimming and small-to-big promotion so mandatory trimming does not hide necessary parent context.

#### Scenario: Trimmed sentence and promoted parent metrics are reported
- GIVEN sentence evidence and parent promotion both appear in retrieval output
- WHEN eval scoring executes
- THEN metrics MUST report trimmed evidence quality and promoted-parent contribution separately

### Requirement: Degraded and Pending Semantic Fallback MUST Be Measured
Evals MUST include sqlite-vec load failure, vec table unavailability, stale/rebuilding index states, and post-save pending indexing states to verify lexical + graph/KG fallback quality.

#### Scenario: Semantic unavailable still yields useful fallback
- GIVEN semantic lanes are degraded or pending
- WHEN retrieval evals execute
- THEN fallback availability/quality metrics MUST be produced without global retrieval failure

### Requirement: Facts-Source Eval MUST Assert on `kg_triples`
The facts-source eval check (`factsSourceChecks`, `src/evals/retrieval.ts:699`,
computed at `:769`) MUST assert that graph-lane evidence is sourced from
`kg_triples` and MUST NOT require any `observation_facts`-sourced candidate. After
consolidation no candidate carries `source = 'observation_facts'`
(`src/evals/retrieval.ts:767`); the check MUST be redefined so it passes when the
KG-lane graph evidence (`source = 'kg_triples'`) is present and source-attributed,
without depending on a now-empty `observation_facts` candidate set.

#### Scenario: Facts-source check passes on KG-sourced evidence
- GIVEN graph-lane evidence is produced for an eval query
- WHEN the facts-source eval check evaluates the candidates
- THEN it MUST pass based on `kg_triples`-sourced, source-attributed candidates
- AND it MUST NOT require any `observation_facts`-sourced candidate

#### Scenario: Facts-source check does not regress on the removed source
- GIVEN consolidation is complete and no `observation_facts` source exists
- WHEN the retrieval eval suite runs
- THEN the facts-source check MUST NOT fail due to the absence of
  `observation_facts` candidates

### Requirement: Graph-Fact Eval Fixtures MUST Seed the Knowledge Graph
The eval fixtures that previously inserted directly into `observation_facts`
(`src/evals/retrieval.ts:676-684`, the `graph-lite` and `graph-rank` fixtures)
MUST instead establish their graph facts through the consolidated KG path
(`kg_entities`+`kg_triples`), so the graph lane has evidence to rank under the
single-source model. The fixtures MUST produce KG-lane graph evidence equivalent
in retrieval purpose to what they produced via `observation_facts`.

#### Scenario: Graph fixtures populate KG-lane evidence
- GIVEN the retrieval eval setup runs
- WHEN the `graph-lite` and `graph-rank` fixtures are established
- THEN their facts MUST be present as `kg_triples`+`kg_entities` (not
  `observation_facts`)
- AND the graph lane MUST be able to rank evidence for the corresponding eval
  cases

#### Scenario: No eval path inserts into observation_facts
- GIVEN the eval suite executes
- WHEN any graph-fact fixture or assertion runs
- THEN no INSERT into `observation_facts` MUST occur
- AND no eval assertion MUST filter on `source === 'observation_facts'`## MODIFIED Requirements

## REMOVED Requirements


## Assumptions
- **kg-quality eval unaffected:** `src/evals/kg-quality.ts` references neither
  `observation_facts` nor `kg_triples` by name (verified), so it requires no
  change under this consolidation.
- **Fixture relations:** The migrated fixtures use KG-native relations already
  (`graph-rank` uses `DEPENDS_ON`; `graph-lite` uses the free-form relation
  `supports`, `src/evals/retrieval.ts:676-684`), so seeding them into the KG does
  not depend on the legacy 7-relation labels. This is consistent with CL-4 in the
  knowledge-graph delta: the legacy-label parity (preserved by the adapter for
  consumer output) does not constrain the eval fixtures, which seed KG-native
  relations directly. The current check requires a non-empty `observation_facts`
  candidate set (`tripleCandidates.length > 0 && factCandidates.length > 0`,
  `src/evals/retrieval.ts:769`), which is why it MUST be redefined to pass on
  `kg_triples` evidence alone.

## ADDED Requirements (kg-multi-hop-recall, B2)

### Requirement: Evals MUST Validate Shared-Entity Multi-Hop Recall
The evaluation suite MUST include a multi-hop recall case whose answer is reachable ONLY via a shared entity and has no direct lexical/semantic overlap, using the consolidated KG path (`kg_entities` + `kg_triples`) through an allow-listed structural relation (for example `DEPENDS_ON`). The case MUST assert:
- with `kgMultiHopEnabled = true`, answer surfaces as `lane: 'kg'` / `source: 'kg_multi_hop'`;
- with `kgMultiHopEnabled = false`, answer does not surface via multi-hop and no error is thrown;
- excluded metadata relations are not followed as bridge edges.

#### Scenario: Multi-hop answer surfaces only with the flag on
- GIVEN an eval fixture where the answer shares a structural entity with a seed-matching observation and has no direct query overlap
- WHEN the retrieval eval runs with `kgMultiHopEnabled = true`
- THEN the answer observation MUST appear with `lane: 'kg'` and `source: 'kg_multi_hop'`

#### Scenario: Multi-hop answer does not surface with the flag off
- GIVEN the same fixture
- WHEN the retrieval eval runs with `kgMultiHopEnabled = false`
- THEN the answer observation MUST not be surfaced via multi-hop and no error is thrown

#### Scenario: Metadata relations do not bridge the answer
- GIVEN a distractor connected by excluded relations (`HAS_TOPIC`/`MENTIONS`)
- WHEN the multi-hop eval runs
- THEN the distractor MUST NOT be returned through multi-hop

### Requirement: Eval Suite MUST Gate on No Multi-Hop Regression Versus the Single-Hop Baseline
The existing retrieval-quality fixtures MUST pass both with multi-hop OFF and ON; for each case, ON outcomes MUST be no worse than OFF on pass/rank criteria. The gate is the acceptance condition for defaulting `kgMultiHopEnabled` to ON.

#### Scenario: Existing fixtures do not regress with multi-hop enabled
- GIVEN existing retrieval fixtures
- WHEN the suite runs once with `kgMultiHopEnabled = false` and once with `true`
- THEN all passing OFF cases MUST still pass ON and must not worsen in rank

#### Scenario: Regression flips the documented default
- GIVEN a failing case in the no-regression comparison
- WHEN acceptance is recorded
- THEN the documented default MUST be flipped to OFF until weights/filters are tuned


## ADDED Requirements (kg-supersedes-edges, B3)


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
