# Evaluations

## Requirements

### Requirement: Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline

Lexical, dense, hybrid, entity, graph, reranking, and query-expansion candidates MAY be compared only with the same corpus, query order, candidate limit, final context-token budget, reader or coding agent, and scoring procedure.

#### Scenario: Candidate receives a larger final budget

- **GIVEN** a candidate and lexical control with unequal final context budgets
- **WHEN** report validation runs
- **THEN** the comparison is marked incomparable and cannot promote the candidate

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

The suite MUST measure source-attributed recovery after context loss, injected tokens, compression, avoided/escalated full fetches, and hidden-test or equivalent coding-task success in addition to retrieval quality.

#### Scenario: Recall improves without task success

- **GIVEN** a candidate with better retrieval metrics but unchanged or worse hidden-task outcomes
- **WHEN** product value is assessed
- **THEN** retrieval improvement alone is insufficient to promote the module
