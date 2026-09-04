# Contract: equal-budget benchmark report v1

## Inputs

Every decision run records:

- dataset and runner names, versions, licenses/availability, and corpus/query hashes;
- candidate/profile IDs and full normalized configuration;
- fixed candidate K and final injected-token budget;
- fixed query order, reader/coding-agent model and settings, judge/scorer, seeds, timeouts, and retries;
- reference machine/runtime information.

## Metric namespaces

- `retrieval`: MRR, Recall@1, Recall@5, Hit@K/recall-any, precision, rank errors.
- `evidence`: evidence recall/precision and provenance coverage.
- `answer`: deterministic F1/exact match/accuracy and separately identified judge scores.
- `agent`: hidden-test/task success, tool errors, completion state.
- `resources`: p50/p95 latency, ingestion/index/startup time, peak memory, database/model bytes, injected tokens, returned/truncated payload, network/LLM calls.

Metrics keep their source definition. A report cannot alias Hit@K to classical Recall@K, evidence recall to answer recall, or Top-K answer accuracy to Recall@K.

## Comparability and promotion

A comparison is valid only when control and candidate share all declared budgets and scorer/agent conditions. Missing evidence is explicit and fails promotion.

Promotion requires the thresholds in the committed manifest, including:

- at least 5% relative improvement on one primary quality metric over lexical-only;
- no identified regression on another primary quality metric;
- preserved provenance coverage;
- compliance with token, p95 latency, peak-memory, model/package-footprint, and error ceilings.

The report records `promoted`, `rejected`, or `incomplete` plus machine-readable reasons. It never changes defaults by itself; a reviewed code/config change consumes a passing report.
