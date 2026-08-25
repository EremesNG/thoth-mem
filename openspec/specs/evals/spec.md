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

### Requirement: Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline

Evaluation MUST compare lexical, dense, hybrid, entity, graph, reranking, and query-expansion candidates only when they use the same corpus, query order, candidate budget, final context-token budget, reader or coding agent, and scoring procedure.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline

### Requirement: Provenance MUST Be Verified Across Every Enabled Lane

Every evaluated result MUST retain stable source IDs and evidence lineage, and a lane MUST fail its gate when relevant output cannot be traced to authoritative SQLite evidence.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline

### Requirement: Bounded Progressive Context Quality MUST Be Measured

Evals MUST measure compact recall, context expansion, and full-fetch escalation at fixed budgets so a smaller payload is not credited when it removes evidence required for a correct answer or task.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline

### Requirement: Optional Projection Fallback MUST Be Measured

Evals MUST cover disabled, missing, stale, rebuilding, failed, and source-mismatched optional projections and MUST prove that the lexical baseline remains non-empty whenever its control run is non-empty.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline

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

## Delta from kg-superseded-pruning

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



# Delta for Community Summaries LazyGraphRAG

## ADDED Requirements

### Requirement: Evals MUST Validate Deterministic Community Construction and Summaries
Evaluation coverage MUST include deterministic community construction and extractive summary generation without embeddings, remote services, or LLMs. The eval MUST verify project scoping, stable output for identical inputs, bounded summary text, provenance coverage, and connected-components fallback behavior.

#### Scenario: Offline deterministic community eval passes
- GIVEN a stable KG fixture with multiple projects and connected components
- WHEN community construction and summary generation run with no optional providers
- THEN project-scoped communities MUST be deterministic
- AND summaries MUST be bounded, extractive, and source-attributed

### Requirement: Evals MUST Validate Community Retrieval No-Regression
Retrieval evals MUST compare community summaries disabled versus enabled and MUST require no unacceptable regression for existing retrieval fixtures, including direct KG, B2 multi-hop, B3 supersession, and C1 pruning cases. Community evidence MUST remain inside the KG lane during eval assertions.

#### Scenario: Existing retrieval does not regress with communities enabled
- GIVEN the existing retrieval fixture suite
- WHEN it runs with community summaries disabled and enabled
- THEN all passing disabled cases MUST still pass enabled
- AND direct KG and multi-hop rank expectations MUST NOT worsen beyond the documented gate

#### Scenario: Eval asserts no fifth lane
- GIVEN community evidence contributes in a retrieval eval
- WHEN lane attribution is inspected
- THEN community evidence MUST be reported as `kg` lane evidence
- AND no fifth lane MUST appear

### Requirement: Evals MUST Validate Degraded and Stale Community Behavior
Evaluation coverage MUST include missing, disabled, stale, rebuilding, failed, and optional-LLM-enrichment-failed community states. In each state, retrieval MUST fall back to the existing four-lane baseline without global failure and MUST signal degraded state when community evidence is relevant.

#### Scenario: Stale community summaries do not fail recall
- GIVEN community summaries are marked stale for a project
- WHEN recall evals run
- THEN baseline retrieval MUST still succeed
- AND stale community evidence MUST not be treated as fresh

#### Scenario: Optional enrichment failure preserves extractive baseline
- GIVEN LLM enrichment is enabled in an eval fixture
- WHEN enrichment fails
- THEN the deterministic extractive community summary MUST remain available
- AND the degraded enrichment state MUST be measurable

### Requirement: Evals MUST Gate Default Enablement and Ranking Weights
Any default-on decision for community-summary retrieval contribution or automatic rebuild behavior MUST be gated by eval evidence showing bounded output and no unacceptable regression against the baseline suite. If the gate fails, the documented default MUST be disabled or the community weight reduced until the regression is resolved.

#### Scenario: Regression prevents default-on retrieval contribution
- GIVEN community-enabled retrieval worsens an existing passing case beyond the accepted gate
- WHEN defaults are finalized
- THEN community-summary retrieval contribution MUST NOT ship enabled by default at that weight
- AND the fallback decision MUST be documented

## Production Hardening Dashboard V2 Requirements

### Requirement: Production Hardening MUST Include Trace and Operation Tests
The test suite MUST cover trace persistence, trace sanitization, trace querying, operation catalog contracts, and dashboard client request shapes.

#### Scenario: Trace tests prove every tool is wrapped
- GIVEN all MCP tools are registered
- WHEN tests invoke representative handlers
- THEN each invocation MUST create a trace row with expected metadata

### Requirement: Production Hardening MUST Include Realistic Failure Evidence
Tests or evals MUST cover provider failures, background job retries, stale states, and dashboard-facing degraded responses.

#### Scenario: Provider failure is visible to dashboard
- GIVEN a provider returns an HTTP or malformed response failure
- WHEN operation health is requested
- THEN the failure MUST be visible through trace or health telemetry

### Requirement: Dashboard Build and Browser QA MUST Gate Completion
Completion MUST include dashboard typecheck/build and browser verification across at least desktop and mobile viewport sizes.

#### Scenario: Dashboard renders nonblank
- GIVEN the local server serves dashboard assets
- WHEN browser QA opens the dashboard
- THEN the page MUST render the v2 console with no blank canvas and no obvious overlapping controls

# Delta for Community Read Path Rollout Gate

## ADDED Requirements

### Requirement: Rollout Eligibility MUST Require Same-Corpus A/B Retrieval Evidence
The evaluation suite MUST compare community-summary read-path behavior disabled versus enabled on the same project, corpus, query set, and config budgets before a project is considered eligible for rollout. The A/B report MUST make the disabled baseline and enabled candidate outcomes distinguishable, MUST name the regression threshold used for each gate, and MUST block eligibility when the enabled run regresses beyond that named threshold.

#### Scenario: Disabled and enabled runs use the same corpus and queries
- GIVEN a stable project corpus and query set
- WHEN rollout eligibility evals execute
- THEN the suite MUST run a community-disabled baseline and a community-enabled candidate over the same corpus and queries
- AND the report MUST identify which metrics came from each run

#### Scenario: A/B regression blocks eligibility
- GIVEN the community-enabled run worsens a disabled-baseline passing query beyond the named regression threshold
- WHEN rollout eligibility is summarized
- THEN the project MUST NOT be marked eligible for community-summary read-path enrichment

### Requirement: P4 Token-Savings Metrics MUST Gate Rollout Eligibility
Rollout eligibility MUST consume the P4 token-savings envelope, including `full_chars`, `evidence_chars`, `returned_chars`, `saved_chars`, compression, recall quality, rank quality, lane truth, and community safety metrics where applicable. Eligibility MUST block when community-enabled retrieval increases returned/evidence context or worsens compression/saved chars beyond the named token-regression threshold without preserving recall and rank quality.

#### Scenario: Token-savings envelope is complete
- GIVEN rollout eligibility evals complete
- WHEN the report is produced
- THEN it MUST include full, evidence, and returned character counts
- AND it MUST include compression and saved-character metrics
- AND it MUST include recall/rank quality, lane-truth, and community-safety rates where applicable

#### Scenario: Token regression blocks rollout
- GIVEN community-enabled retrieval returns more context than the named token-regression threshold permits without preserving recall/rank quality at the named threshold
- WHEN eligibility is evaluated
- THEN rollout eligibility MUST fail for that project or gate

### Requirement: Readiness Gates MUST Cover Project State and Summary Bounds
Evaluation reporting MUST include per-project readiness gates for explicit opt-in, fresh committed community state, named minimum KG/community/source-observation coverage thresholds, summary bounds, source coverage bounds, and absence of stale, rebuilding, failed, degraded, or enrichment-unavailable state.

#### Scenario: Per-project readiness gate reports each input
- GIVEN rollout eligibility evals inspect a project
- WHEN readiness is reported
- THEN the report MUST show opt-in status, committed/fresh rebuild status, graph/community/source coverage, summary bounds, and degraded-state eligibility

#### Scenario: Sparse coverage blocks readiness
- GIVEN a project has explicit opt-in but graph, community, or source-observation coverage below the named minimum thresholds
- WHEN readiness is evaluated
- THEN the project MUST NOT pass rollout eligibility
- AND the report MUST identify coverage as the blocking gate

### Requirement: Fallback Gates MUST Prove Baseline Retrieval Remains Usable
Evaluation coverage MUST include disabled, missing, stale, rebuilding, failed, degraded, and enrichment-unavailable community states. For each state, when the disabled baseline has non-empty hits for the same corpus and query set, the fallback result MUST be non-empty, source-attributed, and free of global retrieval failure.

#### Scenario: Community-unavailable states preserve non-empty baseline hits
- GIVEN the disabled baseline has hits for a query
- WHEN evals run missing, stale, rebuilding, failed, degraded, and enrichment-unavailable community states
- THEN each state MUST return non-empty fallback retrieval
- AND each result MUST preserve source lineage

#### Scenario: Fallback failure blocks rollout
- GIVEN any unavailable community state yields an empty result for a query whose disabled baseline has hits
- WHEN rollout readiness is summarized
- THEN the fallback gate MUST fail
- AND the project MUST NOT be marked eligible

### Requirement: Lane and Ranking Regression Gates MUST Protect Existing KG Behavior
Evaluation coverage MUST assert no fifth lane, no community-specific retrieval lane, no new GraphRAG/global lane, direct KG no-regression, and B2 multi-hop no-regression. Community-summary evidence MUST be asserted as KG-lane sub-source evidence such as `kg_community_summary`.

#### Scenario: Eval asserts no fifth lane
- GIVEN community-summary evidence contributes during an enabled eval
- WHEN lane attribution is inspected
- THEN the evidence MUST be reported as `lane: 'kg'` with sub-source `kg_community_summary`
- AND no fifth lane MUST appear

#### Scenario: Direct KG and B2 multi-hop do not regress
- GIVEN direct KG and B2 multi-hop fixtures pass under the disabled baseline
- WHEN the same fixtures run with community summaries enabled
- THEN their recall and rank outcomes MUST be no worse than the named regression threshold

### Requirement: Rollout Evidence MUST Not Expand Deferred Scope
Rollout evals MUST NOT require or imply multi-harness support, G3 harness parity, MemoryIntegrationCore migration, or P5 graph navigation v2. These areas MUST remain deferred even when rollout evidence passes.

#### Scenario: Passing rollout evals do not imply deferred work is complete
- GIVEN all community read-path rollout eval gates pass for a project
- WHEN eligibility is reported
- THEN the report MAY mark that project eligible for this rollout gate
- AND it MUST NOT claim multi-harness support or P5 graph navigation v2 completion

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Regression thresholds are zero-regression for deterministic fixtures unless design identifies an existing readiness/eval signal that justifies a stricter or separately named tolerance for broader corpora.
- Any non-zero tolerance MUST be a named implementation constant with tests and report output; a vague "acceptable" or "material" regression cannot satisfy rollout eligibility.
- Minimum coverage and freshness thresholds MUST be finalized during design from existing readiness/eval evidence and exposed in the eval report as gate names plus observed values.
- Same-corpus A/B evidence is project-scoped; broader global default-on evidence remains outside this change.
- This spec treats rollout evidence as an eligibility gate, not as proof that the global default should be flipped ON.

## Handoff Hints
- Design should reuse the existing retrieval eval envelope and readiness scorecard rather than create a separate eval runner unless unavoidable.
- Design must define concrete named pass/fail thresholds for token savings, recall/rank quality, coverage, freshness, and community safety, and assert that reports include both threshold and observed value.
- Verification should include disabled-vs-enabled A/B evidence and fallback states with non-empty baseline hits.

## Merged change: pre-multiharness-foundations (evals)

# Delta for Evals

## ADDED Requirements

### Requirement: Evals MUST Report Runtime Token-Savings Telemetry

Eval reports MUST distinguish source, evidence, returned, truncated, and injected model-token payloads and MUST compare them with answer or task quality under the same budget.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline

### Requirement: Evals MUST Measure mem_get Avoided and Escalated Paths

Evals MUST report compact/context paths that finish without full fetch separately from paths that require `mem_get`, and MUST not credit an avoided fetch when later escalation occurs for the same answer path.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline

### Requirement: Evals MUST Include Recall-After-Compaction Evidence

Evals MUST simulate context loss and report recovered source evidence, answer or task quality, injected payload, and full-fetch escalation for each compared retrieval configuration.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline

### Requirement: Reproducible durable model comparison

A runnable benchmark MUST compare Nomic, EmbeddingGemma, and Qwen3-Embedding-0.6B over the same committed multilingual, technical-memory, and code-retrieval cases and report Recall@1, Recall@5, MRR, per-model errors, dimensions, vector norms, latency, model bytes when available, corpus hash, and explicit gate/default status. Every decision run MUST persist the complete JSON report at `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json` before exit.

#### Scenario: US3 - Benchmark-gated default decision 1

- **GIVEN** all three models are available
- **WHEN** the benchmark runs
- **THEN** each model receives identical queries/documents through its resolved profile and the report includes per-model quality and operational metrics

#### Scenario: US3 - Benchmark-gated default decision 2

- **GIVEN** all three runs are complete
- **WHEN** a candidate satisfies the absolute thresholds and is no worse than Nomic on Recall@1, Recall@5, and MRR
- **THEN** it becomes eligible and the deterministic quality score and tie-break order select the winning eligible candidate even when Nomic itself is below the candidate thresholds

#### Scenario: US3 - Benchmark-gated default decision 3

- **GIVEN** neither candidate is eligible, any model is unavailable, or benchmark execution/evidence persistence is incomplete
- **WHEN** the gate is evaluated
- **THEN** the gate fails closed and Nomic remains the shipped local default

#### Scenario: US3 - Benchmark-gated default decision 4

- **GIVEN** the effective default model or resolved preprocessing lineage changes
- **WHEN** semantic index state is reconciled
- **THEN** existing vectors are marked stale and an idempotent rebuild is enqueued

#### Scenario: US3 - Benchmark-gated default decision 5

- **GIVEN** a live benchmark finishes
- **WHEN** its human-readable report is rendered
- **THEN** the complete machine-readable report is also written to `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json` before the process exits

### Requirement: Fail-closed quality gate and winner selection

The default-change gate MUST pass only when all three model runs and the durable report are complete. Each candidate MUST satisfy corpus thresholds and be no worse than Nomic on Recall@1, Recall@5, and MRR to be eligible; Nomic acts as the relative comparator and is not required to satisfy the candidates' absolute thresholds. Among eligible candidates, the highest arithmetic mean of those three metrics wins; exact-score ties MUST resolve by higher MRR, then Recall@1, then Recall@5, then lexical profile ID. Unavailable or incomplete evidence MUST fail the gate.

#### Scenario: US3 - Benchmark-gated default decision 1

- **GIVEN** all three models are available
- **WHEN** the benchmark runs
- **THEN** each model receives identical queries/documents through its resolved profile and the report includes per-model quality and operational metrics

#### Scenario: US3 - Benchmark-gated default decision 2

- **GIVEN** all three runs are complete
- **WHEN** a candidate satisfies the absolute thresholds and is no worse than Nomic on Recall@1, Recall@5, and MRR
- **THEN** it becomes eligible and the deterministic quality score and tie-break order select the winning eligible candidate even when Nomic itself is below the candidate thresholds

#### Scenario: US3 - Benchmark-gated default decision 3

- **GIVEN** neither candidate is eligible, any model is unavailable, or benchmark execution/evidence persistence is incomplete
- **WHEN** the gate is evaluated
- **THEN** the gate fails closed and Nomic remains the shipped local default

#### Scenario: US3 - Benchmark-gated default decision 4

- **GIVEN** the effective default model or resolved preprocessing lineage changes
- **WHEN** semantic index state is reconciled
- **THEN** existing vectors are marked stale and an idempotent rebuild is enqueued

#### Scenario: US3 - Benchmark-gated default decision 5

- **GIVEN** a live benchmark finishes
- **WHEN** its human-readable report is rendered
- **THEN** the complete machine-readable report is also written to `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json` before the process exits

### Requirement: External Benchmark Metrics MUST Retain Their Published Meaning

Benchmark adapters MUST keep retrieval metrics such as MRR, Recall@1, Recall@5, and Hit@K separate from evidence recall, answer F1 or accuracy, judge scores, and agent task outcomes, and MUST label Top-K as a retrieval budget rather than a score.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline

### Requirement: Benchmark Reports MUST Include Quality and Resource Envelopes

Durable reports MUST include dataset/version and corpus hashes, candidate configuration, quality metrics, p50/p95 query latency, ingestion/index time, startup time, peak memory, database and model bytes, injected context tokens, truncation, errors, and unavailable evidence.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline

### Requirement: Optional Lanes MUST Pass a Fail-Closed Promotion Gate

A candidate MAY become a default only when a complete same-budget report meets predeclared quality, token, latency, memory, footprint, and provenance thresholds; incomplete, incomparable, or regressing evidence MUST leave it disabled by default.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline

### Requirement: Coding-Agent Evaluation MUST Measure Hidden-Test Outcomes

The benchmark suite MUST include coding tasks whose success is measured by hidden-test or equivalent task outcomes in addition to retrieval and answer metrics, so improved recall alone cannot establish product value.

#### Scenario: US6 - Promote complexity only with reproducible evidence 1

- **GIVEN** two retrieval candidates
- **WHEN** they are benchmarked
- **THEN** they receive the same corpus, query order, candidate limit, final context-token budget, reader or agent, and scoring procedure

#### Scenario: US6 - Promote complexity only with reproducible evidence 2

- **GIVEN** an optional candidate that fails the declared quality/resource promotion gate or has incomplete evidence
- **WHEN** defaults are selected
- **THEN** the candidate remains off by default and the lexical core remains the product baseline
