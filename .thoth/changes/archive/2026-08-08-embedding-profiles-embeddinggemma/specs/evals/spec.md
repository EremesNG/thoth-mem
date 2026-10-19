# Delta for Evals

## ADDED Requirements

### Requirement: Embedding Model Comparison MUST Be Reproducible
The repository MUST provide a runnable comparison of explicit Nomic, EmbeddingGemma, and Qwen3-Embedding-0.6B models over the same committed bilingual technical/code retrieval corpus using each model's resolved asymmetric profile.

#### Scenario: All model runs complete
- GIVEN explicit provider and model identifiers for all three candidates
- WHEN the benchmark runs
- THEN it MUST report Recall@1, Recall@5, MRR, quality score, latency, dimensions, vector norms, model bytes when supplied, request counts, model errors, and a stable corpus hash for every model

#### Scenario: One model is unavailable
- GIVEN any requested model cannot produce a valid complete run
- WHEN the benchmark finishes
- THEN the incomplete run and its error MUST remain in the report and the decision MUST fail closed

### Requirement: Default Candidate Gate MUST Be Deterministic
The gate MUST require all three complete runs and at least one candidate meeting Recall@1 `0.80`, Recall@5 `0.95`, and MRR `0.85` without regression against Nomic on any of the three metrics. Nomic MUST remain the relative comparator but MUST NOT be required to meet the candidates' absolute thresholds.

#### Scenario: Multiple candidates are eligible
- GIVEN EmbeddingGemma and Qwen3 both satisfy the gate
- WHEN a winner is selected
- THEN the system MUST compare arithmetic mean quality score, then MRR, Recall@1, Recall@5, and lexical profile ID in that order

#### Scenario: One candidate is ineligible
- GIVEN one complete candidate regresses and the other is complete and eligible
- WHEN the gate is evaluated
- THEN the ineligible candidate MUST remain reported and MUST NOT block the eligible candidate from winning

#### Scenario: Baseline misses an absolute threshold
- GIVEN Nomic is complete but misses an absolute candidate threshold and at least one candidate is complete, above every threshold, and no worse than Nomic
- WHEN the gate is evaluated
- THEN the eligible candidate MUST be allowed to win

### Requirement: Decision Evidence MUST Be Durable Before Exit
Every decision run MUST atomically write a versioned complete JSON report to the explicit output path before returning its final exit status and MUST render equivalent human-readable results.

#### Scenario: Gate rejects the candidates
- GIVEN report construction completes but the gate fails
- WHEN the command exits non-zero
- THEN the complete failure evidence MUST already exist at the output path

#### Scenario: Evidence persistence fails
- GIVEN the complete report cannot be written atomically
- WHEN the command determines its exit status
- THEN it MUST fail and MUST NOT authorize a product-default change

## MODIFIED Requirements

## REMOVED Requirements
