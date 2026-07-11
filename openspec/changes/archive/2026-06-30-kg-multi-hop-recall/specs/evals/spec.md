# Delta for Evals

## ADDED Requirements

### Requirement: Evals MUST Validate Shared-Entity Multi-Hop Recall
The evaluation suite (`src/evals/retrieval.ts`) MUST include a multi-hop recall
case whose ANSWER observation is reachable ONLY via a shared entity — it MUST have
no direct lexical or semantic overlap with the query — established through the
consolidated KG path (`kg_entities`+`kg_triples`, via a structural relation in the
default allow-list, e.g. `DEPENDS_ON`). The case MUST assert that the answer
observation surfaces in fused results when `kgMultiHopEnabled` is ON and is
attributed to the multi-hop sub-source (`lane: 'kg'`, `source: 'kg_multi_hop'`),
and MUST assert that with `kgMultiHopEnabled` OFF the same observation does NOT
surface via multi-hop and the query produces no error. Depth attenuation SHOULD be
exercised so a depth-2 reach scores below an otherwise-equal depth-1 reach.

#### Scenario: Multi-hop answer surfaces only with the flag on
- GIVEN an eval fixture where the answer observation shares a structural entity
  with a seed-matching observation but has no direct query overlap
- WHEN the retrieval eval runs with `kgMultiHopEnabled = true`
- THEN the answer observation MUST appear in fused results attributed to
  `lane: 'kg'` / `source: 'kg_multi_hop'`

#### Scenario: Multi-hop answer does not surface with the flag off
- GIVEN the same multi-hop fixture
- WHEN the retrieval eval runs with `kgMultiHopEnabled = false`
- THEN the answer observation MUST NOT be surfaced via multi-hop
- AND the query MUST complete without error

#### Scenario: Excluded metadata relations do not bridge the answer
- GIVEN a distractor observation connected to the seed only by an excluded
  metadata relation (e.g. `HAS_TOPIC`/`MENTIONS`)
- WHEN the multi-hop eval runs with the flag on
- THEN the distractor MUST NOT be surfaced as a multi-hop reach, confirming the
  structural allow-list is applied

### Requirement: Eval Suite MUST Gate on No Multi-Hop Regression vs the Single-Hop Baseline
The retrieval eval suite MUST include an explicit NO-REGRESSION gate (the CL-5
acceptance criterion): running the existing retrieval-quality fixtures with
`kgMultiHopEnabled` ON MUST NOT regress the results obtained with multi-hop OFF
(the pre-change single-hop baseline). Concretely, for each existing eval case the
multi-hop-ON outcome MUST be no worse than the multi-hop-OFF baseline on the
case's pass criterion (expected observation still recalled at no worse rank;
no existing pass becomes a fail). This gate is the condition under which
`kgMultiHopEnabled` ships defaulted ON; if the gate is RED, the default flips to
OFF until weights/filters are tuned.

#### Scenario: Existing fixtures do not regress with multi-hop enabled
- GIVEN the existing retrieval-quality eval fixtures
- WHEN the suite runs once with `kgMultiHopEnabled = false` and once with
  `kgMultiHopEnabled = true`
- THEN every case that passes in the OFF baseline MUST still pass in the ON run
- AND no expected observation MUST drop to a worse rank in the ON run than in the
  OFF baseline

#### Scenario: Regression flips the documented default
- GIVEN the no-regression gate is evaluated and a regression is observed with
  multi-hop ON
- WHEN the acceptance decision is recorded
- THEN the documented `kgMultiHopEnabled` default MUST be OFF until the regression
  is resolved (the gate, not the eval mechanics, decides the shipped default)

#### Scenario: Disabled multi-hop reproduces the baseline exactly
- GIVEN `kgMultiHopEnabled = false`
- WHEN the retrieval eval suite runs
- THEN the fused outputs MUST equal the pre-change single-hop baseline for the
  existing fixtures (no multi-hop candidates present)

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-5 (RESOLVED — eval is the acceptance gate):** The no-regression gate is the
  GATE for shipping `kgMultiHopEnabled` defaulted ON. Default ON is conditional on
  this gate passing GREEN; a regression flips the documented default to OFF.
- **Fixture seeding (code-grounded):** The multi-hop fixture seeds its bridge via
  `kg_entities`+`kg_triples` using the same KG-seeding mechanism the existing
  `graph-lite`/`graph-rank` fixtures use (`tripleHash`-keyed inserts,
  `src/evals/retrieval.ts:734-759`), with a structural allow-list relation
  (e.g. `DEPENDS_ON`) so traversal follows it. No INSERT into `observation_facts`
  is introduced (consistent with B1).
- **Flag toggling in evals (code-grounded):** The eval harness already constructs
  a retrieval runtime and calls `hybridRetrieve` (`src/evals/retrieval.ts:668-723`);
  the multi-hop cases toggle `kgMultiHopEnabled` (via config or the runtime input)
  to compare ON vs OFF, requiring no MCP/HTTP/CLI surface change.
- **Comparison basis:** "No regression" is evaluated per existing case on its own
  pass criterion (recall of the expected observation at no worse rank), not as a
  single aggregate score, so a localized ranking shift on one case is caught
  rather than averaged away.
