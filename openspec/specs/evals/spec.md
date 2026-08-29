# Evaluations

## Requirements

### Requirement: Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline

The immutable four-lane LongMemEval-S evidence MUST remain valid and unchanged, while runtime lexical-default decisions MUST compare embeddings-free candidates against the common-subset agentmemory BM25-only reference and the frozen thoth-mem latency, footprint, provenance, and zero-call contracts. A historical decision produced by the former hybrid-parity policy MUST remain attributable to that policy and MUST NOT prevent a later explicit lexical-only product decision.

#### Scenario: US2 - Compare lexical systems against lexical evidence 1

- **GIVEN** agentmemory's published LongMemEval-S results
- **WHEN** thoth-mem states lexical parity
- **THEN** it compares against BM25-only (`86.2%` published; `409/470 = 87.021%` on the common subset), not BM25+Vector

#### Scenario: US2 - Compare lexical systems against lexical evidence 2

- **GIVEN** the immutable E0 report with `419/470`, p95 `2.0552 ms`, equal SQLite bytes, and zero errors/calls
- **WHEN** the lexical default decision is evaluated
- **THEN** E0 is accepted without mutating that report's historical `retain_default` field or weakening its original validator

#### Scenario: US2 - Compare lexical systems against lexical evidence 3

- **GIVEN** a future proposal to add embeddings
- **WHEN** its acceptance target is defined
- **THEN** agentmemory BM25+Vector `95.2%` is the relevant comparison and requires a new SDD with explicit latency and footprint budgets

### Requirement: External Metrics MUST Retain Their Published Meaning

Reports and documentation MUST distinguish agentmemory BM25-only (`86.2%` RecallAny@5 over 500; recomputed `409/470` on the common subset) from BM25+Vector (`95.2%` over 500; `447/470` on the common subset), MUST state that the published retrieval benchmark uses embeddings but no LLM in the retrieval loop, and MUST reserve the hybrid figure for a future semantic phase rather than a current lexical promotion gate.

#### Scenario: US2 - Compare lexical systems against lexical evidence 1

- **GIVEN** agentmemory's published LongMemEval-S results
- **WHEN** thoth-mem states lexical parity
- **THEN** it compares against BM25-only (`86.2%` published; `409/470 = 87.021%` on the common subset), not BM25+Vector

#### Scenario: US2 - Compare lexical systems against lexical evidence 2

- **GIVEN** the immutable E0 report with `419/470`, p95 `2.0552 ms`, equal SQLite bytes, and zero errors/calls
- **WHEN** the lexical default decision is evaluated
- **THEN** E0 is accepted without mutating that report's historical `retain_default` field or weakening its original validator

#### Scenario: US2 - Compare lexical systems against lexical evidence 3

- **GIVEN** a future proposal to add embeddings
- **WHEN** its acceptance target is defined
- **THEN** agentmemory BM25+Vector `95.2%` is the relevant comparison and requires a new SDD with explicit latency and footprint budgets

### Requirement: Provenance MUST Be Verified Across Every Evaluated Lane

Every evaluated lane MUST retain stable authoritative source IDs and evidence lineage. A lexical comparison report MUST additionally bind every strategy result to its stable strategy ID, configuration hash, query expressions or their deterministic hashes, occurrence-source mappings, generated memory/evidence IDs, and per-question ranked and delivered source IDs.

#### Scenario: US2 - Compare candidates under the official equal-budget contract 1

- **GIVEN** the pinned prepared corpus
- **WHEN** a comparison run starts
- **THEN** every strategy consumes the same 470 eligible questions in the same order and ingests the same ordered session occurrences into isolated SQLite databases

#### Scenario: US2 - Compare candidates under the official equal-budget contract 2

- **GIVEN** control and candidate results
- **WHEN** the report is assembled
- **THEN** it records separate configuration hashes, per-question ranks, quality metrics, payload measurements, latency, memory, SQLite footprint, errors, and literal model/network-call counts for every strategy

#### Scenario: US2 - Compare candidates under the official equal-budget contract 3

- **GIVEN** a missing, interrupted, unequal-budget, provenance-invalid, or schema-invalid lane
- **WHEN** comparison status is computed
- **THEN** the report is incomplete and cannot select a runtime default

### Requirement: Reports MUST Include Quality and Resource Envelopes

All durable reports MUST retain the canonical quality and resource envelope. A LongMemEval-S lexical comparison MUST additionally record strict, relaxed, merge/post-query, and total retrieval measurements with explicit units and privacy-safe work indicators sufficient to attribute candidate latency, while preserving the pinned source revision and digests, corpus/profile/configuration hashes, observed and excluded denominators, query order, per-question source ranks and metrics, question-type aggregates, ingestion/startup/memory/SQLite/text measurements, delivery/truncation, errors, and model/network-call counts.

#### Scenario: US1 - Attribute relaxed retrieval cost 1

- **GIVEN** the same project, memories, query, limit, and strategy
- **WHEN** diagnostic measurement is enabled
- **THEN** it identifies every executed plan stage in order and reports bounded latency and work indicators whose accounting reconciles with the total retrieval observation

#### Scenario: US1 - Attribute relaxed retrieval cost 2

- **GIVEN** diagnostic measurement is disabled
- **WHEN** normal MCP recall runs
- **THEN** public response shape, candidate ordering, evidence lineage, payload budgets, telemetry semantics, and six-tool behavior remain unchanged

#### Scenario: US1 - Attribute relaxed retrieval cost 3

- **GIVEN** an empty normalized query, an exact-only result, or a stage that cannot execute
- **WHEN** measurements are assembled
- **THEN** the omitted stage is explicit and no fabricated work or latency is reported

#### Scenario: US3 - Promote only an officially faster relaxed candidate 1

- **GIVEN** the frozen corpus, exclusions, query order, ingestion mapping, budgets, and scoring
- **WHEN** the optimized comparison runs
- **THEN** query construction and its measured execution are the only intended lane differences and every diagnostic field reconciles with its lane and per-query evidence

#### Scenario: US3 - Promote only an officially faster relaxed candidate 2

- **GIVEN** one unique relaxed candidate with at least the existing 0.05 absolute RecallAny@20 gain, no NDCG@10 or fractional Recall@20 regression, equal aggregate SQLite bytes, clean calls/errors/provenance, and p95 no greater than twice control
- **WHEN** promotion is assessed
- **THEN** that candidate becomes eligible to replace `all-prefix-v1`

#### Scenario: US3 - Promote only an officially faster relaxed candidate 3

- **GIVEN** incomplete, incomparable, regressing, tied, or slower evidence
- **WHEN** validation or promotion runs
- **THEN** it fails closed with explicit reasons and the current runtime default does not change

### Requirement: The Committed Fixture MUST Not Claim External Quality

The existing committed fixture MUST stay offline and mark LongMemEval-S unavailable unless a separately prepared, schema-valid report from the pinned dataset completes; incomplete, unequal-budget, provenance-invalid, or interrupted evidence MUST NOT promote optional complexity.

#### Scenario: US3 - Produce an auditable quality and resource report 1

- **GIVEN** multiple gold sessions
- **WHEN** metrics are computed at K=1, 5, 10, and 20
- **THEN** `recall_any`, fractional `recall`, and `recall_all` remain distinct and MRR uses the first gold rank while NDCG@10 uses binary relevance

#### Scenario: US3 - Produce an auditable quality and resource report 2

- **GIVEN** ranked Top-20 candidates
- **WHEN** the fixed delivery budget of 4,000 UTF-16 code units under the product's 1,000-token estimate is applied
- **THEN** ranking quality and delivered-context quality are reported separately rather than relabelling a budgeted delivery result as raw Recall@K

#### Scenario: US3 - Produce an auditable quality and resource report 3

- **GIVEN** a completed run
- **WHEN** its report is persisted
- **THEN** it includes per-question ranks and source IDs, aggregates by question type, dataset/configuration hashes, query order, exclusions, p50/p95 latency and ingestion time, SQLite and memory footprint, characters and estimated tokens, errors, and zero model/network calls during evaluation

#### Scenario: US3 - Produce an auditable quality and resource report 4

- **GIVEN** missing provenance, a different dataset hash, an unequal budget, incomplete resources, or a schema-invalid report
- **WHEN** promotion is assessed
- **THEN** the lane fails closed and cannot justify an optional module

### Requirement: Optional Modules MUST Pass a Fail-Closed Promotion Gate

An optional module MAY become a default only when complete same-budget external evidence meets predeclared quality, token, latency, memory, footprint, and provenance thresholds. Incomplete, incomparable, or regressing evidence MUST leave it disabled.

#### Scenario: Dense retrieval improves one metric but exceeds resources

- **GIVEN** a dense candidate with better Recall@5 but a failed declared footprint or latency threshold
- **WHEN** promotion is decided
- **THEN** dense remains optional and disabled by default

### Requirement: Evals MUST Measure Compaction Recovery and Coding Outcomes

Product evaluation MUST additionally measure observation write fidelity, support/identity validation, policy-grounded review, harmful or unsupported promotion, correction/supersession, recall contamination, equal-budget final-memory equivalence, latency, footprint, payload, provenance, and literal model/network-call counts.

#### Scenario: US5 - Demonstrate useful promotion under an equal budget 1

- **GIVEN** control and observation-pipeline projects with identical supported durable outcomes
- **WHEN** the committed fixture runs
- **THEN** both expose the same final current memory content, topic lineage, recall order, delivery budget, and useful-content ratio

#### Scenario: US5 - Demonstrate useful promotion under an equal budget 2

- **GIVEN** unsupported, poisoned, negated, cross-scope, failed, changing-requirement, and stale-procedure cases
- **WHEN** observation review executes
- **THEN** the report distinguishes accepted, rejected, blocked, and promoted candidates and records zero unsupported or unreviewed promoted memories

#### Scenario: US5 - Demonstrate useful promotion under an equal budget 3

- **GIVEN** a complete run
- **WHEN** its report is validated
- **THEN** it reconciles operation counts, stable IDs, supports, review policy, memory/FTS rows, p50/p95 latency, SQLite bytes, payload characters, errors, and literal zero model/network calls

#### Scenario: US5 - Demonstrate useful promotion under an equal budget 4

- **GIVEN** incomplete, unequal-budget, lineage-invalid, recall-regressing, contaminated, or schema-invalid evidence
- **WHEN** readiness is assessed
- **THEN** the pipeline fails its outcome gate without changing the existing direct-save or retrieval defaults
