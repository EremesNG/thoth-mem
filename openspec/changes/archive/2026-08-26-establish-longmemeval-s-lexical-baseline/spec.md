# Feature Specification: Establish LongMemEval-S Lexical Baseline

**Change ID**: `establish-longmemeval-s-lexical-baseline`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The product needs external retrieval evidence before optional dense, hybrid, reranking, entity, graph, or consolidation modules can be justified. The committed fixture proves contracts only and cannot establish retrieval quality.<br>
**Impact**: Operators can prepare one pinned LongMemEval-S dataset and run a deterministic, retrieval-only SQLite FTS5/BM25 baseline with auditable quality, provenance, equal-budget context, and resource reporting. The runtime retrieval path remains lexical-only and no optional module is introduced.<br>
**Affected capabilities**: `evals`

## User stories

### US1 - Prepare an immutable external corpus (Priority: P1)

As a benchmark operator, I can prepare the official cleaned LongMemEval-S file with a pinned source revision and digest so that every accepted run evaluates the same corpus without committing the dataset to the package.

**Independent test**: A fixture representing the pinned dataset contract is accepted only when its identity, schema, ordered session IDs, and SHA-256 match; altered or ambiguous input is rejected before evaluation.

**Covers**: FR-001, FR-002, SC-001

**Acceptance scenarios**:

1. **Given** the official cleaned LongMemEval-S file at the pinned revision, **When** preparation verifies it, **Then** the prepared manifest records the immutable source, SHA-256, record count, and corpus hash without modifying the source data.
2. **Given** a file with the wrong digest, missing gold session IDs, misaligned session arrays, or reordered identifiers, **When** preparation runs, **Then** it fails before creating an available benchmark lane or report.
3. **Given** no prepared external dataset, **When** the committed fixture runs, **Then** it remains offline and continues to report LongMemEval-S as unavailable.

### US2 - Measure the lexical product baseline (Priority: P1)

As a product maintainer, I can run LongMemEval-S through the real SQLite FTS5/BM25 retrieval path so that lexical quality is known before any optional projection is considered.

**Independent test**: A deterministic multi-gold mini-corpus is ingested per question in original order, retrieved at the declared Top-K, and produces the expected ranks without an LLM, answer generation, query expansion, or cross-question leakage.

**Covers**: FR-003, FR-004, FR-005, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** one eligible LongMemEval-S question, **When** the lexical lane runs, **Then** it creates an isolated SQLite database, ingests each ordered session occurrence exactly once as one role-labelled full-dialogue retrieval unit, and maps every returned memory ID through a deterministic occurrence source ID to its authoritative `haystack_session_id` and session index.
2. **Given** the question text and its gold `answer_session_ids`, **When** retrieval executes, **Then** only the question and indexed session corpus influence ranking; the answer, `has_answer` flags, oracle corpus, and gold IDs are unavailable to the ranker.
3. **Given** one of the 30 `_abs` abstention records, **When** the run is assembled, **Then** it is excluded with that recorded reason; every non-abstention record must instead have nonempty `answer_session_ids` resolving to ingested sessions or preparation fails.
4. **Given** future candidate lanes, **When** they are compared with this baseline, **Then** they must reuse the same prepared corpus, query order, session granularity, candidate Top-20, final 1,000-token estimated context budget, and scoring contract.

### US3 - Produce an auditable quality and resource report (Priority: P1)

As an architecture decision maker, I can inspect distinct retrieval and delivery metrics plus resource costs so that a strong-looking number cannot hide incomplete evidence or a larger budget.

**Independent test**: A known ranked result set with multiple gold sessions produces separately labelled any-hit, fractional recall, all-gold recall, reciprocal rank, NDCG, context-delivery, provenance, latency, and footprint fields that validate against the report schema.

**Covers**: FR-006, FR-007, FR-008, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** multiple gold sessions, **When** metrics are computed at K=1, 5, 10, and 20, **Then** `recall_any`, fractional `recall`, and `recall_all` remain distinct and MRR uses the first gold rank while NDCG@10 uses binary relevance.
2. **Given** ranked Top-20 candidates, **When** the fixed delivery budget of 4,000 UTF-16 code units under the product's 1,000-token estimate is applied, **Then** ranking quality and delivered-context quality are reported separately rather than relabelling a budgeted delivery result as raw Recall@K.
3. **Given** a completed run, **When** its report is persisted, **Then** it includes per-question ranks and source IDs, aggregates by question type, dataset/configuration hashes, query order, exclusions, p50/p95 latency and ingestion time, SQLite and memory footprint, characters and estimated tokens, errors, and zero model/network calls during evaluation.
4. **Given** missing provenance, a different dataset hash, an unequal budget, incomplete resources, or a schema-invalid report, **When** promotion is assessed, **Then** the lane fails closed and cannot justify an optional module.

## Edge cases

- A question may have multiple gold sessions; every metric defines whether it measures any, a fraction, or all golds.
- The official cleaned corpus may repeat a `haystack_session_id` within one question. Each occurrence remains an independent Top-K position with a unique deterministic source ID; its original session ID remains the evaluator label for recall and MRR, while binary NDCG treats every relevant occurrence as a relevant corpus position.
- An official turn may contain an empty content string. The role and string type remain required, but the occurrence is preserved verbatim instead of being dropped or rejected.
- Session arrays and `haystack_session_ids` may be malformed or unequal in length, or a non-abstention gold ID may not resolve to an ingested session; preparation rejects the record instead of guessing alignment or changing the denominator.
- The cleaned dataset contains heterogeneous answer values; the runner treats `answer` as opaque evaluation-excluded data.
- LongMemEval documentation uses approximate session counts; reports use observed counts and denominators rather than assuming 40, 48, 50, or 470 records.
- FTS5 may return fewer than 20 candidates for a strict sanitized query; missing ranks contribute zero without synthetic candidates.
- Equal BM25 names do not imply equivalent tokenization: the lane is labelled as thoth-mem SQLite FTS5/BM25 and does not claim numerical parity with the official `rank_bm25` baseline.
- Timing and memory samples can be noisy; their measurement boundaries and aggregation method must be pinned in the report configuration.
- Interrupted runs must not leave a partial report that appears complete.

## Functional requirements

- **FR-001 — Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline**: `[MODIFIED evals]` All evaluated lanes MUST retain the canonical equal-budget comparison contract. The LongMemEval-S lexical baseline MUST additionally consume the official cleaned raw JSON at a pinned immutable revision and SHA-256, preserve original corpus and session order, exclude answer/oracle/gold-label data from ranking, make no model calls, and distinguish dataset preparation from offline evaluation.
- **FR-002 — Prepared Dataset Identity MUST Fail Closed**: `[INTERNAL]` Preparation MUST validate the pinned digest, expected dataset identity, required record fields and types, aligned session arrays, unique question IDs, stable ordered session occurrences, observed counts, and for every non-`_abs` record a nonempty unique `answer_session_ids` set whose IDs all resolve to at least one ingested haystack occurrence before marking the lane available; repeated haystack session IDs and string-typed empty turn content MUST be preserved rather than rejected or collapsed, and prepared raw data MUST remain outside the published package and committed repository.
- **FR-003 — Lexical Baseline MUST Use the Product Retrieval Path**: `[INTERNAL]` Each eligible question MUST run in an isolated database through the authoritative `MemoryService` SQLite FTS5/BM25 path, with one role-labelled full-dialogue memory per ordered haystack session and no dense, hybrid, reranking, entity, graph, consolidation, query-expansion, or LLM component.
- **FR-004 — Provenance MUST Be Verified Across Every Evaluated Lane**: `[MODIFIED evals]` Every evaluated lane MUST retain stable authoritative source IDs and evidence lineage. For LongMemEval-S, every ingested and returned occurrence MUST additionally retain a deterministic auditable mapping between one unique occurrence source ID, its session index, the generated memory/evidence IDs, `question_id`, base `haystack_session_id`, and the evaluator-only `answer_session_ids`; missing, duplicate occurrence-source, or untraceable mappings MUST fail the lane, while repeated base session IDs remain valid.
- **FR-005 — Equal Retrieval and Delivery Budgets MUST Be Separate**: `[INTERNAL]` The runner MUST rank with candidate Top-K=20 and MUST separately measure delivery under 4,000 UTF-16 code units, the fixed current product estimate for 1,000 tokens, so that future lanes reuse both budgets without conflating ranking and context packing.
- **FR-006 — External Metrics MUST Retain Their Published Meaning**: `[MODIFIED evals]` All external metrics MUST retain their published labels and Top-K MUST remain a positional budget. For LongMemEval-S at K=1, 5, 10, and 20, reports MUST separately label any-gold hit/`recall_any`, fractional Recall@K, and all-gold/`recall_all` over distinct gold session IDs; they MUST also report first-gold MRR over candidate positions and occurrence-level binary-relevance NDCG@10 without deduplicating repeated session IDs or relabelling Top-K as a score.
- **FR-007 — Reports MUST Include Quality and Resource Envelopes**: `[MODIFIED evals]` All durable reports MUST retain the canonical quality and resource envelope. A LongMemEval-S report MUST additionally include the pinned source revision and digests, corpus/profile/configuration hashes, observed and excluded denominators, query order, per-question source ranks and metrics, question-type aggregates, p50/p95 retrieval and ingestion latency, startup time, peak or explicitly bounded memory measurement, SQLite bytes, characters and estimated tokens, delivery/truncation, errors, and model/network-call counts.
- **FR-008 — The Committed Fixture MUST Not Claim External Quality**: `[MODIFIED evals]` The existing committed fixture MUST stay offline and mark LongMemEval-S unavailable unless a separately prepared, schema-valid report from the pinned dataset completes; incomplete, unequal-budget, provenance-invalid, or interrupted evidence MUST NOT promote optional complexity.

## Success criteria

- **SC-001** `[buildable]`: Preparation tests accept the pinned-contract fixture including repeated haystack session IDs and empty string turn content, and reject wrong digests, malformed/misaligned sessions, duplicate question or gold identifiers, non-abstention records with empty or unresolved gold session IDs, and data outside the declared cleaned-S profile without making network calls.
- **SC-002** `[buildable]`: Deterministic runner tests prove per-question database isolation, preserved session order, exact-once ingestion, answer/gold-label exclusion from ranking, stable provenance mapping, and zero model calls.
- **SC-003** `[buildable]`: The lexical lane retrieves up to 20 ranked product candidates and applies the separate 1,000-estimated-token delivery budget while all optional retrieval modules remain disabled.
- **SC-004** `[buildable]`: Report tests validate exact multi-gold any/fraction/all metrics at K=1/5/10/20, first-gold MRR, binary NDCG@10, question-type aggregates, exclusions, p50/p95 resources, provenance, budget separation, and fail-closed completeness.
- **SC-005** `[outcome]`: An explicitly authorized run over the pinned official cleaned LongMemEval-S file completes offline after preparation and produces a schema-valid report with the observed denominator, full provenance, zero evaluation-time model/network calls, and no optional-module promotion claim.

## Assumptions

- The pinned official cleaned dataset is `longmemeval_s_cleaned.json` at Hugging Face commit `98d7416c24c778c2fee6e6f3006e7a073259d48f`, published SHA-256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`.
- Session-level full-dialogue text with explicit roles is the product-realistic retrieval unit and matches the local AgentMemory reference protocol; it is deliberately labelled separately from the official user-only, space-tokenized `rank_bm25` runner.
- The session-level eligibility convention excludes only the 30 `_abs` abstention questions. Every other record is scored from nonempty `answer_session_ids`; assistant-evidence types remain eligible, and `has_answer` never controls eligibility or ranking.
- The current product token basis remains `estimated_chars_div_4` over JavaScript string length, so 1,000 estimated tokens equals a 4,000-UTF-16-code-unit delivery budget unless the canonical token contract changes in a separate SDD.

## Dependencies

- Official LongMemEval repository and cleaned Hugging Face dataset identity for preparation metadata.
- Existing `MemoryService`, FTS5 schema/query sanitizer, benchmark manifest/report schema, and benchmark test suites.
- Explicit user authorization before downloading the external dataset into a gitignored local cache or executing the full external run.

## Out of scope

- Dense embeddings, hybrid retrieval, reranking, entities, graph, consolidation, query expansion, answer generation, reader evaluation, or an LLM judge.
- Reproducing the official `rank_bm25` implementation or claiming direct numerical comparability with its published results.
- LoCoMo, AMB BEAM/PersonaMem, SDEBench, or Claude Code paid-host certification.
- Publishing packages, changing product runtime defaults, or promoting any optional module.
