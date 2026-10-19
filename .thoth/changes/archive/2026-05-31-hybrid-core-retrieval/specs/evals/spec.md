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

## MODIFIED Requirements

## REMOVED Requirements
