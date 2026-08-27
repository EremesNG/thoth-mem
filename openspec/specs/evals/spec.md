# Evaluations

## Requirements

### Requirement: Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline

All evaluated lanes MUST retain the canonical equal-budget comparison contract. The LongMemEval-S lexical baseline MUST additionally consume the official cleaned raw JSON at a pinned immutable revision and SHA-256, preserve original corpus and session order, exclude answer/oracle/gold-label data from ranking, make no model calls, and distinguish dataset preparation from offline evaluation.

#### Scenario: US1 - Prepare an immutable external corpus 1

- **GIVEN** the official cleaned LongMemEval-S file at the pinned revision
- **WHEN** preparation verifies it
- **THEN** the prepared manifest records the immutable source, SHA-256, record count, and corpus hash without modifying the source data

#### Scenario: US1 - Prepare an immutable external corpus 2

- **GIVEN** a file with the wrong digest, missing gold session IDs, misaligned session arrays, or reordered identifiers
- **WHEN** preparation runs
- **THEN** it fails before creating an available benchmark lane or report

#### Scenario: US1 - Prepare an immutable external corpus 3

- **GIVEN** no prepared external dataset
- **WHEN** the committed fixture runs
- **THEN** it remains offline and continues to report LongMemEval-S as unavailable

### Requirement: External Metrics MUST Retain Their Published Meaning

All external metrics MUST retain their published labels and Top-K MUST remain a positional budget. For LongMemEval-S at K=1, 5, 10, and 20, reports MUST separately label any-gold hit/`recall_any`, fractional Recall@K, and all-gold/`recall_all` over distinct gold session IDs; they MUST also report first-gold MRR over candidate positions and occurrence-level binary-relevance NDCG@10 without deduplicating repeated session IDs or relabelling Top-K as a score.

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

### Requirement: Provenance MUST Be Verified Across Every Evaluated Lane

Every evaluated lane MUST retain stable authoritative source IDs and evidence lineage. For LongMemEval-S, every ingested and returned occurrence MUST additionally retain a deterministic auditable mapping between one unique occurrence source ID, its session index, the generated memory/evidence IDs, `question_id`, base `haystack_session_id`, and the evaluator-only `answer_session_ids`; missing, duplicate occurrence-source, or untraceable mappings MUST fail the lane, while repeated base session IDs remain valid.

#### Scenario: US2 - Measure the lexical product baseline 1

- **GIVEN** one eligible LongMemEval-S question
- **WHEN** the lexical lane runs
- **THEN** it creates an isolated SQLite database, ingests each ordered session occurrence exactly once as one role-labelled full-dialogue retrieval unit, and maps every returned memory ID through a deterministic occurrence source ID to its authoritative `haystack_session_id` and session index

#### Scenario: US2 - Measure the lexical product baseline 2

- **GIVEN** the question text and its gold `answer_session_ids`
- **WHEN** retrieval executes
- **THEN** only the question and indexed session corpus influence ranking; the answer, `has_answer` flags, oracle corpus, and gold IDs are unavailable to the ranker

#### Scenario: US2 - Measure the lexical product baseline 3

- **GIVEN** one of the 30 `_abs` abstention records
- **WHEN** the run is assembled
- **THEN** it is excluded with that recorded reason; every non-abstention record must instead have nonempty `answer_session_ids` resolving to ingested sessions or preparation fails

#### Scenario: US2 - Measure the lexical product baseline 4

- **GIVEN** future candidate lanes
- **WHEN** they are compared with this baseline
- **THEN** they must reuse the same prepared corpus, query order, session granularity, candidate Top-20, final 1,000-token estimated context budget, and scoring contract

### Requirement: Reports MUST Include Quality and Resource Envelopes

All durable reports MUST retain the canonical quality and resource envelope. A LongMemEval-S report MUST additionally include the pinned source revision and digests, corpus/profile/configuration hashes, observed and excluded denominators, query order, per-question source ranks and metrics, question-type aggregates, p50/p95 retrieval and ingestion latency, startup time, peak or explicitly bounded memory measurement, SQLite bytes, characters and estimated tokens, delivery/truncation, errors, and model/network-call counts.

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

Product evaluation MUST additionally measure ordered-event idempotency, summary claim support coverage, rejection of unsupported/cross-scope claims, version precedence, no automatic memory promotion, three-host restart/post-compaction fidelity, equal-budget fallback, injected characters, and zero core model/network calls.

#### Scenario: US3 - Resume from the newest truthful session projection 1

- **GIVEN** a current supported session summary and current promoted project memories
- **WHEN** start/resume or post-compaction recovery runs
- **THEN** the summary is considered first and remaining budget is filled only with eligible current memories under the shared deterministic selector

#### Scenario: US3 - Resume from the newest truthful session projection 2

- **GIVEN** no eligible summary after migration
- **WHEN** recovery runs
- **THEN** it falls back to the existing current handoff/memory policy without fabricating a summary or blocking the host prompt

#### Scenario: US3 - Resume from the newest truthful session projection 3

- **GIVEN** a selected summary
- **WHEN** host-visible context renders
- **THEN** it includes a stable summary ID for progressive expansion, preserves the actionable fields that fit, identifies all historical content as untrusted data, and does not expose raw support evidence by default

#### Scenario: US3 - Resume from the newest truthful session projection 4

- **GIVEN** a pre-compaction checkpoint after this change
- **WHEN** it is captured
- **THEN** checkpoint evidence and the supplied summary may commit idempotently but no `handoff` memory is automatically promoted
