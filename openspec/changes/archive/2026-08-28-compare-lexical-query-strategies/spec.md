# Feature Specification: Compare Lexical Query Strategies

**Change ID**: `compare-lexical-query-strategies`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The official LongMemEval-S control returned at least one ranked result for only 62 of 470 eligible questions. The current FTS5 query requires every one of up to 12 normalized terms to match, so thoth-mem needs measured evidence for a less brittle local lexical strategy before adding semantic retrieval or changing the runtime default.<br>
**Impact**: Operators can compare deterministic SQLite/FTS5 query strategies over the same pinned corpus, query order, Top-20 candidate budget, 4,000-UTF-16-unit delivery budget, provenance mapping, and report contract. The six MCP tool names, SQLite source of truth, promoted-memory model, and zero-model/zero-network evaluation boundary remain unchanged.<br>
**Affected capabilities**: `retrieval`, `evals`

## User stories

### US1 - Define deterministic lexical candidates (Priority: P1)

As a memory-core maintainer, I can name and execute bounded lexical query strategies so that the current all-term control and less brittle candidates are reproducible rather than hidden behind one mutable query builder.

**Independent test**: Focused tests feed the same normalized natural-language and code-oriented queries to every declared strategy and assert stable, syntax-safe FTS5 expressions, bounded terms, and deterministic empty-query behavior.

**Covers**: FR-001, FR-002, FR-003, SC-001

**Acceptance scenarios**:

1. **Given** the current all-term prefix strategy, **When** it builds a query, **Then** it remains byte-for-byte compatible with the archived lexical control configuration.
2. **Given** a declared broader candidate strategy, **When** it builds a query from the same input, **Then** it uses only normalized query terms, remains bounded, and does not inspect answers, gold IDs, corpus labels, or model output.
3. **Given** punctuation-only, quoted, Unicode, operator-like, repeated, or overlong input, **When** any strategy normalizes it, **Then** it returns a deterministic safe expression or an empty result without exposing raw FTS5 syntax.

### US2 - Compare candidates under the official equal-budget contract (Priority: P1)

As a benchmark operator, I can run the control and lexical candidates against the prepared LongMemEval-S corpus so that quality and resource differences are attributable to query construction alone.

**Independent test**: A miniature offline fixture runs every declared strategy over identical records and fails if query order, corpus mapping, Top-K, delivery budget, provenance, exclusions, metrics, or zero-call counters diverge from the canonical contract.

**Covers**: FR-004, FR-005, FR-006, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** the pinned prepared corpus, **When** a comparison run starts, **Then** every strategy consumes the same 470 eligible questions in the same order and ingests the same ordered session occurrences into isolated SQLite databases.
2. **Given** control and candidate results, **When** the report is assembled, **Then** it records separate configuration hashes, per-question ranks, quality metrics, payload measurements, latency, memory, SQLite footprint, errors, and literal model/network-call counts for every strategy.
3. **Given** a missing, interrupted, unequal-budget, provenance-invalid, or schema-invalid lane, **When** comparison status is computed, **Then** the report is incomplete and cannot select a runtime default.

### US3 - Promote only evidence-backed runtime behavior (Priority: P2)

As a product maintainer, I can decide whether a lexical candidate should become the runtime default using predeclared gates so that a broader query does not trade empty results for unbounded noise.

**Independent test**: Promotion tests exercise winning, regressing, incomplete, and tied synthetic reports and assert that only a complete candidate satisfying every quality and resource gate can be selected; otherwise the current runtime strategy remains unchanged.

**Covers**: FR-007, FR-008, FR-009, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** a complete candidate whose RecallAny@20 improves by at least 5 absolute percentage points, whose NDCG@10 and fractional Recall@20 do not regress, whose p95 retrieval latency is at most twice the co-run control, and whose provenance/error/call counters remain clean, **When** promotion is assessed, **Then** it is eligible to become the deterministic runtime default.
2. **Given** a candidate that improves coverage but regresses NDCG@10 or fractional Recall@20, exceeds the resource gate, changes the corpus/budget contract, or has any error, **When** promotion is assessed, **Then** it is rejected with explicit reasons.
3. **Given** no eligible winner or a metric tie, **When** the change closes, **Then** the current all-term runtime behavior remains the default and the experiment still produces durable non-promoting evidence.

## Edge cases

- Queries containing only one usable term must not change meaning across equivalent all/any strategies.
- Repeated normalized terms must retain archived behavior in `all-prefix-v1`; candidate strategies may deduplicate them, but their configuration and query-plan hashes must make that difference explicit.
- Explicit quoted phrases must remain intact only when the strategy contract declares phrase preservation.
- Candidate runs must not overwrite the archived lexical baseline report or the pinned prepared corpus.
- Multiple candidate results with equal promotion metrics must fail closed instead of relying on declaration order.
- A broader strategy may return more than Top-20 internally only if truncation to the canonical positional Top-20 occurs before scoring and delivery evidence is recorded.

## Functional requirements

- **FR-001 — Lexical Query Strategies MUST Be Explicit and Deterministic**: `[INTERNAL]` The system MUST identify each lexical query strategy with a stable ID and configuration hash and MUST produce deterministic bounded FTS5 expressions from the same input.
- **FR-002 — FTS5 Lexical Retrieval MUST Sanitize Untrusted Queries**: `[MODIFIED retrieval]` Retrieval MUST safely combine exact IDs or topic keys with a selected deterministic lexical query strategy, including phrase-capable BM25 search and bounded prefix expansion, without allowing punctuation-only input, code symbols, repeated terms, overlong input, or FTS operators to fail global recall.
- **FR-003 — The Archived Lexical Control MUST Remain Reproducible**: `[INTERNAL]` The comparison implementation MUST preserve the current up-to-12-term all-prefix query construction as the named control and MUST test its compatibility before evaluating broader candidates.
- **FR-004 — Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline**: `[MODIFIED evals]` All evaluated lanes MUST retain the canonical equal-budget comparison contract. LongMemEval-S lexical query strategies MUST additionally share the pinned corpus, observed exclusions, query order, session granularity, ingestion mapping, Top-20 candidate budget, 4,000-UTF-16-unit delivery budget, scoring procedure, and zero-model/zero-network evaluation boundary so that query construction is the only intended variable.
- **FR-005 — Provenance MUST Be Verified Across Every Evaluated Lane**: `[MODIFIED evals]` Every evaluated lane MUST retain stable authoritative source IDs and evidence lineage. A lexical comparison report MUST additionally bind every strategy result to its stable strategy ID, configuration hash, query expressions or their deterministic hashes, occurrence-source mappings, generated memory/evidence IDs, and per-question ranked and delivered source IDs.
- **FR-006 — Lexical Comparison Reports MUST Be Complete and Non-Overwriting**: `[INTERNAL]` The runner MUST write a schema-validated comparison report atomically, MUST refuse to overwrite archived evidence or an existing output, and MUST mark interrupted or missing lanes incomplete.
- **FR-007 — Lexical Runtime Promotion MUST Fail Closed**: `[INTERNAL]` A lexical candidate MUST NOT replace the runtime default unless a complete same-run comparison demonstrates at least a 0.05 absolute RecallAny@20 gain, no regression in NDCG@10 or fractional Recall@20, p95 retrieval latency no greater than 2.0 times the control, aggregate SQLite bytes exactly equal to the co-run control, zero errors, zero model/network calls, and valid provenance. When control p95 latency is zero, an eligible candidate MUST also have zero p95 latency.
- **FR-008 — Core Retrieval MUST Be Lexical-First and Projection-Aware**: `[MODIFIED retrieval]` The default path MUST rank structured SQLite candidates and the evidence-admitted deterministic FTS5 strategy without requiring optional projections. Optional evidence MAY participate only when enabled, source-current, attributed, healthy, and admitted by the evaluation gate.
- **FR-009 — The Six-Tool and Local-Only Contracts MUST Remain Stable**: `[INTERNAL]` The change MUST NOT add an MCP tool, remote service, model call, embedding, vector extension, graph dependency, reranker, HTTP server, dashboard, or harness-specific retrieval behavior.

## Success criteria

- **SC-001** `[buildable]`: Focused query-strategy tests cover the archived control plus every candidate, including Unicode, phrases, punctuation/operators, repeated terms, overlong inputs, single terms, and empty normalized input, with no SQLite syntax failures.
- **SC-002** `[buildable]`: The miniature offline comparison fixture executes every strategy with identical corpus/query order, Top-20 and delivery budgets, provenance, metrics, and zero-call counters, and its report passes strict schema validation.
- **SC-003** `[buildable]`: Promotion-policy tests reject incomplete, unequal-budget, regressing, resource-exceeding, error-containing, provenance-invalid, and tied results and select only a unique fully eligible candidate.
- **SC-004** `[outcome]`: An explicitly authorized run over the already prepared official corpus completes every declared strategy for all 470 eligible questions with zero evaluation-time model/network calls and a schema-valid non-overwriting report.
- **SC-005** `[outcome]`: Runtime behavior changes only if one unique candidate satisfies every FR-007 gate; otherwise the archived all-term strategy remains the default with explicit rejection reasons.

## Assumptions

- The prepared LongMemEval-S file and archived control report remain available and unchanged under their existing gitignored/result boundaries.
- RecallAny@20 measures coverage, while NDCG@10 and fractional Recall@20 prevent a broad-query candidate from being promoted on coverage alone.
- A same-run latency ratio is more portable than an absolute millisecond threshold across supported local machines.
- The experiment may complete successfully without changing production retrieval when no candidate clears the gate.

## Dependencies

- Existing `MemoryService` SQLite/FTS5 retrieval path and query sanitizer.
- Existing pinned LongMemEval-S preparation, runner, report schema, and strict validator.
- Existing Node.js, better-sqlite3, Vitest, and package scripts; no new runtime dependency.

## Out of scope

- Dense, hybrid, vector, graph, entity, reranking, query generation by an LLM, or remote retrieval.
- Durable observation candidates, automated promotion/review workflows, retention execution, revocation cascades, or capability-policy enforcement.
- Adding `memory_sessions`, export, audit, deletion, or any other seventh MCP tool; future administrative behavior belongs behind existing workflow tools or the CLI under a separate specification.
- Changing session summaries, lifecycle capture, native harness adapters, schema revision, or the promoted-memory taxonomy.
