# Evaluations

## Requirements

### Requirement: Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline

LongMemEval-S, LoCoMo, BEAM/PersonaMem, SDEBench, Agent Memory Benchmark, and any product fixture MUST compare BM25, dense, hybrid, and each additional module with the same dataset/version, query order, candidate Top-K, final context budget, reader/coding agent, scoring procedure, and resource/provenance reporting; incomparable or incomplete evidence MUST NOT promote complexity.

#### Scenario: US4 - Justify complexity with equal-budget outcomes 1

- **GIVEN** BM25 and an optional dense, hybrid, rerank, entity, graph, or consolidation lane
- **WHEN** they are compared
- **THEN** corpus, query order, Top-K, final token budget, reader/agent, scoring procedure, provenance, and resource envelope are equal or the comparison is rejected

#### Scenario: US4 - Justify complexity with equal-budget outcomes 2

- **GIVEN** an improved retrieval metric without recovered actionable fields or coding-task improvement
- **WHEN** promotion is assessed
- **THEN** the optional module remains disabled

#### Scenario: US4 - Justify complexity with equal-budget outcomes 3

- **GIVEN** no prepared external dataset
- **WHEN** the offline fixture runs
- **THEN** it validates schema and product regressions without claiming LongMemEval-S, LoCoMo, BEAM/PersonaMem, SDEBench, or Agent Memory Benchmark quality

### Requirement: External Metrics MUST Retain Their Published Meaning

MRR, Recall@1/5/10/20, NDCG@10, Hit@K, evidence recall, answer accuracy or F1, judge scores, and task success MUST remain separately labelled; Top-K MUST be reported as a retrieval budget rather than a score.

#### Scenario: Adapter receives Top-K answer accuracy

- **GIVEN** an upstream result measured after retrieving K items
- **WHEN** the adapter normalizes it
- **THEN** it records answer accuracy and Top-K budget without relabelling the value as Recall@K

### Requirement: Provenance MUST Be Verified Across Every Evaluated Lane

Every returned candidate MUST retain stable authoritative source IDs and evidence lineage; missing or untraceable provenance MUST fail the lane gate.

#### Scenario: Candidate result lacks a source ID

- **GIVEN** a relevant result without authoritative lineage
- **WHEN** evaluation validates provenance
- **THEN** the lane fails promotion regardless of its answer score

### Requirement: Reports MUST Include Quality and Resource Envelopes

Durable reports MUST include dataset/version and corpus hashes, configuration, quality metrics, p50/p95 latency, ingestion/index/startup time, peak memory, database/model bytes, injected context tokens, truncation, full-fetches, errors, and unavailable evidence.

#### Scenario: Resource evidence is incomplete

- **GIVEN** a candidate report missing required latency or footprint data
- **WHEN** promotion is evaluated
- **THEN** the report remains incomplete and the candidate stays disabled

### Requirement: The Committed Fixture MUST Not Claim External Quality

The offline fixture MUST validate adapter, budget, schema, and report contracts only. It MUST mark LongMemEval-S, LoCoMo, AMB BEAM/PersonaMem, and SDEBench unavailable until explicitly prepared reproducible runs exist.

#### Scenario: Run the default benchmark fixture

- **GIVEN** no external dataset preparation
- **WHEN** `benchmark:fixture` runs
- **THEN** it passes contract checks while making zero optional-module promotion claim

### Requirement: Optional Modules MUST Pass a Fail-Closed Promotion Gate

An optional module MAY become a default only when complete same-budget external evidence meets predeclared quality, token, latency, memory, footprint, and provenance thresholds. Incomplete, incomparable, or regressing evidence MUST leave it disabled.

#### Scenario: Dense retrieval improves one metric but exceeds resources

- **GIVEN** a dense candidate with better Recall@5 but a failed declared footprint or latency threshold
- **WHEN** promotion is decided
- **THEN** dense remains optional and disabled by default

### Requirement: Evals MUST Measure Compaction Recovery and Coding Outcomes

Product evaluation MUST include hidden actionable handoff fields, restart and post-compaction recovery, correction/history, irrelevant-query abstention, poisoned-memory rendering, project isolation, delegated-write rejection, injected characters/tokens, useful-content ratio, latency, full-fetch avoidance, and coding-task outcomes in addition to retrieval metrics.

#### Scenario: US4 - Justify complexity with equal-budget outcomes 1

- **GIVEN** BM25 and an optional dense, hybrid, rerank, entity, graph, or consolidation lane
- **WHEN** they are compared
- **THEN** corpus, query order, Top-K, final token budget, reader/agent, scoring procedure, provenance, and resource envelope are equal or the comparison is rejected

#### Scenario: US4 - Justify complexity with equal-budget outcomes 2

- **GIVEN** an improved retrieval metric without recovered actionable fields or coding-task improvement
- **WHEN** promotion is assessed
- **THEN** the optional module remains disabled

#### Scenario: US4 - Justify complexity with equal-budget outcomes 3

- **GIVEN** no prepared external dataset
- **WHEN** the offline fixture runs
- **THEN** it validates schema and product regressions without claiming LongMemEval-S, LoCoMo, BEAM/PersonaMem, SDEBench, or Agent Memory Benchmark quality
