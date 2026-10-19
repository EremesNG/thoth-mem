# Delta for Evals

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

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions

- Evals can use small deterministic fixtures with hand-authored KG rows or source memories that build the KG through the consolidated path.
- Ranking thresholds and acceptable regression criteria are finalized in design/tasks, but the no-regression gate itself is required.

## handoffHints

- Design must define concrete eval fixtures for project scoping, fallback states, no fifth lane, and ranking no-regression.
