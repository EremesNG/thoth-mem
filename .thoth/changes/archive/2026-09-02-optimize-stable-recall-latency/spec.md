# Feature Specification: Optimize Stable Recall Latency

**Change ID**: `optimize-stable-recall-latency`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The corpus-independent stable ranking improves LongMemEval-S retrieval quality and protects recall across legacy imports, but its original p95 latency was 13.0459 ms. Optimization reduced that result below 10 ms with exact output parity. Two independent reviews exposed locale-sensitive shortcuts that required convergence; the final implementation guards ASCII folding and retains the historically significant second normalization for non-ASCII field tokens. The corrected build measured 9.3504 ms. The contemporaneous RRF controls remain much faster, but primary-source comparisons with other persistent agent-memory systems show that the resulting sub-10-ms local tail is competitive and that a fixed 2x RRF ratio overstates user-visible risk.<br>
**Impact**: Stable recall will retain its exact strategy identity, candidate eligibility, cohort precedence, ordered results, scores, diagnostics, public response, and import guarantees while meeting an absolute 10-ms LongMemEval-S p95 budget. The same-build RRF ratio remains reported as an optimization diagnostic rather than a promotion blocker. No database migration, public API change, native addon, real-home access, or ranking-policy change is allowed.<br>
**Affected capabilities**: `retrieval`

## User stories

### US1 - Preserve stable ranking while reducing latency (Priority: P1)

As an agent using normal recall, I receive the same ordered stable results with substantially lower query latency so imported-memory safety does not impose an excessive retrieval cost.

**Independent test**: Compare every complete ordered `ranked_session_ids` and delivery list from the optimized stable lane against the immutable pre-optimization LongMemEval-S report, then co-run optimized stable and RRF over the same pinned corpus and environment.

**Covers**: FR-001, FR-002, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** the 470-question pre-optimization stable report, **When** the optimized lane runs over the identical pinned corpus and budgets, **Then** every complete ordered ranking and all aggregate quality metrics are byte-equivalent to the baseline.
2. **Given** optimized stable and RRF lanes on the same build and corpus, **When** retrieval latency is measured sequentially, **Then** stable p95 is no greater than 10 ms and the stable/RRF ratio is recorded as diagnostic evidence.
3. **Given** long candidate content and repeated strict/relaxed matches, **When** stable scoring runs, **Then** each candidate receives the same finite score without redundant query compilation or semantically duplicate normalization work.

### US2 - Retain import and retrieval contracts (Priority: P1)

As an operator, I can optimize recall without weakening cohort isolation, exact lookup, query sanitation, or the evidence that made legacy import safe.

**Independent test**: Run the stable scorer, retrieval/import regression, and import-ranking benchmark suites before and after optimization and compare their exact ordering and identity assertions.

**Covers**: FR-001, FR-003, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** native and imported cohorts, **When** stable recall executes, **Then** exact ID/topic precedence and oldest-cohort-first protected capacity remain unchanged.
2. **Given** Unicode, repeated terms, prefixes, phrases, empty fields, punctuation-only queries, and deterministic ties, **When** the optimized scorer is evaluated, **Then** its score and resulting order equal the pre-optimization implementation.
3. **Given** the archived strategy IDs and exact six-tool MCP contract, **When** repository verification runs, **Then** neither public surface nor archived strategy behavior changes.

### US3 - Produce trustworthy performance evidence (Priority: P2)

As the maintainer, I can distinguish algorithmic improvement from benchmark noise through immutable, same-input reports and stage-level evidence.

**Independent test**: Validate new create-only LongMemEval-S reports, hashes, dataset identity, query order, mappings, zero-call counters, per-query outputs, and p50/p95 samples before assessing the gate.

**Covers**: FR-004, SC-005

**Acceptance scenarios**:

1. **Given** a previously unused output path, **When** an evaluation lane completes, **Then** it publishes one validated immutable report and refuses overwrite.
2. **Given** the stable and RRF reports, **When** comparison runs, **Then** corpus, conditions, mappings, query order, runtime build, and zero external-call claims reconcile exactly.
3. **Given** a failed absolute latency or ranking-identity gate, **When** results are reported, **Then** the change remains unapproved and historical evidence is not overwritten or reinterpreted.

## Edge cases

- Query terms and candidate fields containing Unicode normalization variants, locale-sensitive characters, repeated prefixes, or empty text MUST retain exact scoring semantics.
- One memory may match both strict and relaxed stages; optimization MUST NOT change either stage rank, RRF input, tie break, or diagnostic row count.
- Exact matches may consume all caller capacity and skip lexical stages exactly as before.
- Imported-cohort traversal may stop after capacity is full; optimization MUST NOT score or admit later cohorts earlier.
- Performance evidence is environment-sensitive; stable and control MUST run sequentially on the same build and prepared corpus. Stable p95 MUST remain at or below the absolute 10-ms gate, while the RRF ratio remains diagnostic.
- Existing evaluation files are immutable inputs; failed or successful reruns MUST use fresh paths.

## Functional requirements

- **FR-001 — FTS5 Lexical Retrieval MUST Sanitize Untrusted Queries**: `[MODIFIED retrieval]` Stable-ranking optimization MUST preserve the complete ordered candidate and delivered result sequences, fixed score semantics, exact precedence, cohort precedence, query sanitation, limits, plan/config identity, deterministic ties, and diagnostic accounting for identical inputs.
- **FR-002 — Stable Lexical Ranking Latency Budget**: `[ADDED retrieval]` On the pinned 470-question LongMemEval-S corpus, an optimized stable lane and the archived RRF strategy MUST run sequentially through the same current build, conditions, and mappings. Stable retrieval p95 MUST be no greater than 10 ms while preserving the pre-optimization stable ordered output for every question; contemporaneous RRF p95 and the stable/RRF ratio MUST be reported as diagnostic evidence.
- **FR-003 — Bounded Stable Scoring Work**: `[INTERNAL]` Stable scoring MUST avoid demonstrably redundant normalization, tokenization, and query compilation within one recall while preserving locale-sensitive repeated normalization where it changes frozen semantics. It MUST remain deterministic, bounded, synchronous, corpus-independent, and free of model, network, vector, graph, or mutable database-derived scoring inputs.
- **FR-004 — Immutable Performance Evidence**: `[INTERNAL]` Evaluation MUST validate strategy/config identity, corpus and query hashes, complete mappings, per-query ranks, quality aggregates, raw latency samples, p50/p95 recomputation, SQLite footprint, errors, and literal zero model/network/LLM calls before a gate result is accepted.

## Success criteria

- **SC-001** `[buildable]`: Optimized stable scoring matches the pre-optimization scorer for deterministic unit/property fixtures covering Unicode, prefixes, phrases, repeated terms, long content, empty fields, and ties, and all 470 LongMemEval-S `ranked_session_ids` plus delivered lists exactly match report SHA-256 `7c52da902418bcdf6c89f5c55713631ca406d95a0ae76d78406e5f928e873fda`.
- **SC-002** `[outcome]`: In a fresh sequential same-build co-run, optimized stable retrieval p95 is at most 10 ms. The fully locale-corrected build measured stable 9.3504 ms versus RRF 1.6164 ms (5.7847x diagnostic ratio), improving 28.3% from the immutable 13.0459-ms stable baseline and passing the absolute budget.
- **SC-003** `[buildable]`: Focused scorer/retrieval/import tests and `benchmark:import-ranking` preserve strategy/config/plan hashes, 17/17 protected Top-K lists, zero inversions, exact/capacity behavior, and valid diagnostics.
- **SC-004** `[buildable]`: Build, full Vitest, integration verification/smoke, package checks, exact six-tool audit, and diff hygiene pass without schema revision, public contract, or unrelated artifact changes.
- **SC-005** `[outcome]`: Fresh stable and RRF evaluation reports validate with identical dataset, conditions, mappings, and query order, zero errors, zero external calls, equal SQLite bytes, and an explicit PASS only when SC-001 and the absolute SC-002 budget both hold; the RRF ratio remains visible but non-blocking.

## Assumptions

- The observed relaxed-stage p95 of approximately 11.59 ms dominates the 13.05 ms stable total, while exact and post-query stages are not the primary bottleneck.
- Candidate text size correlates with slow stable queries, and the current scorer normalizes candidate fields twice and recompiles the same query for each SQLite scalar invocation; profiling must confirm the contribution before implementation.
- The RRF lane remains the contemporaneous diagnostic performance control, not the desired ranking output or the promotion threshold.

## Dependencies

- Current revision-9 `MemoryService.recall`, `stableLexicalRank`, SQLite FTS5 eligibility, immutable LongMemEval-S corpus/cache, and the two validated pre-optimization reports.
- Installed TDD and simplify skills, followed by a fresh Oracle plan review if selected and mandatory fresh Oracle final verification.

## Out of scope

- Changing stable ranking weights, score formula, candidate eligibility, strict/relaxed query construction, cohort ordering, caller budgets, or public tools.
- Adding schema columns, migrations, precomputed persistent indexes, embeddings, models, network calls, native addons/extensions, or optional retrieval projections unless profiling disproves all bounded in-memory options and the user selects a new scope.
- Re-importing or mutating `~/.thoth/thoth.db`, performing cutover, overwriting historical reports, or optimizing unrelated retrieval strategies.
