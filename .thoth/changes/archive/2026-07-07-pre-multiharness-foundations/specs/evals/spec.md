# Delta for Evals

## ADDED Requirements
### Requirement: Evals MUST Report Runtime Token-Savings Telemetry
Retrieval eval reporting MUST include average payload per tool, full/evidence/returned sizes, saved size, compression ratio, exact-or-estimated token counts, and whether token counts are exact or estimated. The report MUST make the metric basis explicit and MUST preserve existing recall/rank quality gates.

#### Scenario: Token-savings report includes payload averages
- GIVEN retrieval evals run over the standard fixture corpus
- WHEN the report is produced
- THEN it MUST include average payload per relevant tool or tool class
- AND it MUST include full, evidence, and returned sizes with saved-size/compression metrics

#### Scenario: Token metric basis is explicit
- GIVEN evals cannot use an exact tokenizer
- WHEN token-savings metrics are reported
- THEN the report MUST identify token counts as deterministic estimates
- AND exact-token fields MUST NOT be populated or labeled as exact

### Requirement: Evals MUST Measure mem_get Avoided and Escalated Paths
Evals MUST include scenarios where compact/context recall is sufficient without full fetch and scenarios where full `mem_get` escalation remains necessary. Reports MUST include avoided and escalated counts and MUST verify that avoided counts are not credited when a full fetch is required later in the same answer path.

#### Scenario: Avoided path is counted
- GIVEN an eval case is answered from compact or context evidence without full fetch
- WHEN the token-savings envelope is computed
- THEN the `mem_get` avoided count MUST increase
- AND recall quality metrics MUST still pass

#### Scenario: Escalated path is counted
- GIVEN an eval case requires full observation content after compact/context recall
- WHEN the token-savings envelope is computed
- THEN the `mem_get` escalated count MUST increase
- AND the same case MUST NOT also increase the avoided count

### Requirement: Evals MUST Include Recall-After-Compaction Evidence
Evals MUST simulate or fixture a compaction-like state where only compact handoff/context remains, then verify that the recall funnel recovers relevant source material. The eval report MUST include recovered-evidence quality, payload savings, and any full-fetch escalation.

#### Scenario: Recall after compaction recovers evidence
- GIVEN only compact summary/context is available for an eval scenario
- WHEN compact recall and context expansion run
- THEN the expected source material MUST be recovered with source attribution
- AND the report MUST include returned/evidence/full size metrics

#### Scenario: Compaction recovery failure is visible
- GIVEN the recall funnel cannot recover expected evidence after compaction
- WHEN the eval report is produced
- THEN the failure MUST be visible as a failed quality gate or scenario
- AND it MUST NOT be hidden inside aggregate compression metrics

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Existing retrieval eval gates remain authoritative for recall/rank quality; token savings do not pass a run that breaks retrieval correctness.
- Exact tokenizer support is optional and portable estimates are acceptable when clearly labeled.

## Handoff Hints
- Design should extend `RetrievalTokenSavingsMetricsEnvelope` rather than create an unrelated report format unless the existing shape cannot express per-tool and escalation metrics.
- Verification should run focused retrieval eval tests plus the broader build/test gate in later phases.
