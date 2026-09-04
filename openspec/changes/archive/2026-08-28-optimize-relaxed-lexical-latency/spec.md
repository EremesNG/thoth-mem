# Feature Specification: Optimize Relaxed Lexical Latency

**Change ID**: `optimize-relaxed-lexical-latency`<br>
**Route**: Full<br>
**Status**: Verified

## Intent and scope

**Why**: The official LongMemEval-S comparison proved that relaxed lexical queries nearly eliminate empty retrieval and greatly improve ranking quality, but `any-prefix-v1` and `all-then-any-prefix-v1` exceed the predeclared two-times p95 latency gate. thoth-mem needs to remove verified unnecessary relaxed-query work without weakening its local SQLite authority, deterministic evidence lineage, or fail-closed promotion policy.<br>
**Impact**: Maintainers can attribute retrieval time to exact, strict lexical, relaxed lexical, and post-query work; optimize the dominant local FTS5 path; and re-evaluate the same candidates under the frozen official corpus, ordering, Top-20, delivery, provenance, quality, and resource contracts. The validated round-4 evidence selects `any-prefix-v1` as the unique eligible default.<br>
**Affected capabilities**: `retrieval`, `evals`

## User stories

### US1 - Attribute relaxed retrieval cost (Priority: P1)

As a memory-core maintainer, I can observe bounded per-stage retrieval measurements so that optimization targets the dominant work instead of changing shared or negligible code paths.

**Independent test**: A disposable offline fixture executes control, relaxed, and strict-then-relaxed plans and reconciles exact, per-stage lexical, merge/post-query, and total measurements without changing returned candidates or invoking a model or network.

**Covers**: FR-001, FR-004, FR-005, SC-001, SC-004

**Acceptance scenarios**:

1. **Given** the same project, memories, query, limit, and strategy, **When** diagnostic measurement is enabled, **Then** it identifies every executed plan stage in order and reports bounded latency and work indicators whose accounting reconciles with the total retrieval observation.
2. **Given** diagnostic measurement is disabled, **When** normal MCP recall runs, **Then** public response shape, candidate ordering, evidence lineage, payload budgets, telemetry semantics, and six-tool behavior remain unchanged.
3. **Given** an empty normalized query, an exact-only result, or a stage that cannot execute, **When** measurements are assembled, **Then** the omitted stage is explicit and no fabricated work or latency is reported.

### US2 - Reduce relaxed lexical work without quality drift (Priority: P1)

As a memory-core maintainer, I can execute a broader deterministic lexical strategy without redundant or unbounded work so that its measured coverage does not require unacceptable latency.

**Independent test**: Miniature SQLite fixtures compare the optimized path with the frozen pre-optimization behavior, proving byte-compatible control behavior, deterministic candidate behavior, bounded candidate work, valid provenance/deduplication/budgets, and the intended work reduction. Archived candidate rankings are rescored at the declared internal work cap before an official run, but only the frozen same-run promotion gates decide eligibility.

**Covers**: FR-002, FR-003, FR-005, FR-007, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** a relaxed strategy and a query whose broader stage is required, **When** recall executes, **Then** its versioned configuration applies a declared internal lexical-result cap no greater than the caller's requested limit, returns the corresponding deterministic BM25 prefix, and never represents the cap as a different public Top-K budget.
2. **Given** exact or strict results that overlap relaxed results, **When** stages are merged, **Then** precedence, deduplication, caller limit enforcement, source identity, snippet bounds, and evidence aggregation remain deterministic and exact authoritative matches are not discarded by the lexical cap.
3. **Given** a single term, phrase-like input, punctuation/operators, Unicode, repeated terms, or an overlong query, **When** optimized retrieval executes, **Then** query sanitization and stable plan hashes retain their declared meaning and SQLite produces no syntax failure.

### US3 - Promote only an officially faster relaxed candidate (Priority: P1)

As a product maintainer, I can rerun the official three-lane comparison after optimization so that the runtime default changes only when the measured candidate preserves quality and passes the existing latency gate.

**Independent test**: The prepared pinned LongMemEval-S corpus runs sequentially through the same three isolated lanes and produces a schema-valid, non-overwriting comparison report whose promotion decision is recomputed from complete equal-budget evidence.

**Covers**: FR-001, FR-004, FR-006, FR-007, SC-004, SC-005, SC-006

**Acceptance scenarios**:

1. **Given** the frozen corpus, exclusions, query order, ingestion mapping, budgets, and scoring, **When** the optimized comparison runs, **Then** query construction and its measured execution are the only intended lane differences and every diagnostic field reconciles with its lane and per-query evidence.
2. **Given** one unique relaxed candidate with at least the existing 0.05 absolute RecallAny@20 gain, no NDCG@10 or fractional Recall@20 regression, equal aggregate SQLite bytes, clean calls/errors/provenance, and p95 no greater than twice control, **When** promotion is assessed, **Then** that candidate becomes eligible to replace `all-prefix-v1`.
3. **Given** incomplete, incomparable, regressing, tied, or slower evidence, **When** validation or promotion runs, **Then** it fails closed with explicit reasons and the current runtime default does not change.

## Edge cases

- Single-term relaxed and strict expressions may be equivalent, but stage accounting and deduplication MUST remain deterministic.
- Exact matches may consume all, part, or none of the requested limit; an optimization MUST NOT assume a fixed remaining capacity.
- Strict and relaxed stages may return the same memory IDs at different ranks; precedence and deduplication MUST remain unchanged, while a declared strategy work cap MAY return fewer than the caller's maximum Top-K.
- Long memory rows can dominate payload and evidence work even when Top-K is fixed; diagnostics MUST distinguish executed query work from returned payload work without exposing private content.
- Project filtering, history mode, topic-key lookup, snippets, source references, and evidence aggregation MUST retain current semantics.
- Zero-duration timer samples and zero control p95 MUST remain valid and fail closed under the existing promotion boundary.
- Interrupted or concurrent official runs MUST clean temporary state and MUST NOT overwrite existing evidence.

## Functional requirements

- **FR-001 — Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline**: `[MODIFIED evals]` All evaluated lanes MUST retain the canonical equal-budget comparison contract. LongMemEval-S lexical query strategies MUST additionally share the pinned corpus, observed exclusions, query order, session granularity, ingestion mapping, Top-20 candidate budget, 4,000-UTF-16-unit delivery budget, scoring procedure, zero-model/zero-network evaluation boundary, diagnostic configuration, and timing boundaries so that optimized query execution is the only intended variable.
- **FR-002 — FTS5 Lexical Retrieval MUST Sanitize Untrusted Queries**: `[MODIFIED retrieval]` Retrieval MUST safely combine exact IDs or topic keys with a selected deterministic lexical query strategy, including phrase-capable BM25 search and bounded prefix expansion, without allowing punctuation-only input, code symbols, repeated terms, overlong input, FTS operators, or a latency optimization to fail global recall or change declared query-plan identity.
- **FR-003 — Optimized Relaxed Retrieval MUST Preserve Deterministic Results**: `[INTERNAL]` The control strategy MUST remain byte-compatible with its frozen query and result behavior. A relaxed strategy MAY declare a configuration-hashed lexical-result cap that returns fewer results than the caller's maximum limit, but it MUST preserve exact-first precedence, the BM25 order of every retained lexical result, source and evidence lineage, deduplication, deterministic bounded snippets, honest payload measurements, and caller limit enforcement for every supported query shape. The cap MUST be strategy-owned, reported, and independent of answers, gold IDs, corpus labels, or model output.
- **FR-004 — Reports MUST Include Quality and Resource Envelopes**: `[MODIFIED evals]` All durable reports MUST retain the canonical quality and resource envelope. A LongMemEval-S lexical comparison MUST additionally record strict, relaxed, merge/post-query, and total retrieval measurements with explicit units and privacy-safe work indicators sufficient to attribute candidate latency, while preserving the pinned source revision and digests, corpus/profile/configuration hashes, observed and excluded denominators, query order, per-question source ranks and metrics, question-type aggregates, ingestion/startup/memory/SQLite/text measurements, delivery/truncation, errors, and model/network-call counts.
- **FR-005 — Diagnostic Measurement MUST Be Bounded and Behavior-Neutral**: `[INTERNAL]` Diagnostic collection MUST be opt-in outside benchmark execution, MUST use a monotonic clock, MUST neither execute an otherwise skipped retrieval stage nor inspect private content, and MUST reconcile executed stages and returned-work counters without changing public MCP schemas or normal recall behavior.
- **FR-006 — Core Retrieval MUST Be Lexical-First and Projection-Aware**: `[MODIFIED retrieval]` The default path MUST rank structured SQLite candidates and the evidence-admitted deterministic FTS5 strategy without requiring optional projections. Optional evidence MAY participate only when enabled, source-current, attributed, healthy, and admitted by the evaluation gate. `any-prefix-v1` MUST be the default selected by the unique complete round-4 winner; any future default change MUST likewise require one unique complete same-run candidate satisfying every frozen quality, latency, footprint, error, call, and provenance promotion gate.
- **FR-007 — The Six-Tool and Local-Only Contracts MUST Remain Stable**: `[INTERNAL]` The change MUST NOT add an MCP tool, public strategy selector, remote service, model call, embedding, vector extension, graph dependency, reranker, HTTP server, dashboard, or benchmark-only production retrieval behavior.

## Success criteria

- **SC-001** `[buildable]`: A deterministic miniature fixture reports every executed exact/strict/relaxed/post-query stage, reconciles its work indicators and timing envelope, and proves diagnostics do not change candidates, provenance, limits, payloads, or public response shape.
- **SC-002** `[buildable]`: Focused compatibility tests cover control and both candidates across all declared exact-only, partially filled, fully filled, overlapping, empty, single-term, phrase-like, Unicode, operator-like, repeated, overlong, project-scoped, history, and limit-boundary inputs; they prove frozen control results, deterministic capped candidate prefixes, exact-result precedence, and honest limits/budgets.
- **SC-003** `[buildable]`: Focused optimization tests demonstrate at least one deterministic reduction in executed lexical stages or other root-cause work without relying on wall-clock thresholds in normal unit tests.
- **SC-004** `[buildable]`: Retrieval-lane and comparison validators reject missing, negative, non-finite, inconsistent, differently configured, or behavior-changing diagnostic evidence and recompute promotion instead of trusting persisted decisions.
- **SC-005** `[outcome]`: An explicitly authorized official comparison completes all three 470-question lanes with identical corpus/order/public Top-20 and delivery budgets/provenance, zero errors and model/network calls, and at least one relaxed candidate whose RecallAny@20 gains at least 0.05 absolute over its co-run control and whose fractional Recall@20 and NDCG@10 do not regress against that control. The report MUST also show deltas against the archived candidate as diagnostic context without turning those historical values into a replacement promotion gate.
- **SC-006** `[outcome]`: One unique relaxed candidate records p95 retrieval latency no greater than 2.0 times its co-run `all-prefix-v1` control and satisfies every existing promotion gate; only then does the runtime default change, otherwise verification remains unresolved rather than weakening the gate.

## Assumptions

- The prepared LongMemEval-S corpus and archived comparison remain available unchanged and can serve as the authoritative pre-optimization quality and configuration reference.
- Same-run ratios are the supported performance comparison; absolute milliseconds are diagnostic and host-specific.
- The dominant cost is the relaxed FTS5 `MATCH`/BM25/top-K path and its returned-row work; exact attribution within that bounded path is completed before selecting the implementation technique.
- The official corpus is executed only after focused correctness and miniature diagnostic evidence pass.

## Convergence refinement

The preserved first official round attributed the only candidate failure to latency: `any-prefix-v1` used twelve relaxed terms and ranked/hydrated ten rows per question. Its verified quality margin permits narrower, answer-independent convergence candidates. Round two version-hashed four terms/five rows but remained over the frozen p95 ceiling. Round three used the first three terms/two rows; hydration fell, but frequent leading question terms kept the relaxed query above the ceiling. The next candidate therefore selects the three longest sanitized terms from a bounded window, restores their original order, and retains the two-row cap. Control and adaptive plans remain unchanged. The archived report identity and its exact quality/footprint baselines are bound by `benchmarks/lexical-comparison-baseline.json`, and diagnostic validation reconciles lexical stage rows with ranking and hydration work.

## Dependencies

- Existing `MemoryService`, SQLite/FTS5 schema, deterministic query-plan registry, retrieval/comparison report validators, and LongMemEval-S runner.
- Existing Node.js monotonic performance clock, better-sqlite3, Vitest, and prepared offline corpus; no new runtime dependency.

## Out of scope

- Changing the frozen promotion thresholds, quality metrics, Top-K, delivery budget, corpus, exclusions, scoring, or provenance requirements to make a candidate pass.
- Dense, hybrid, vector, graph, entity, semantic, LLM-generated query, reranking, remote retrieval, or optional-projection work.
- Adding or renaming an MCP tool, exposing internal strategy or diagnostics through public tool inputs, or changing memory persistence/taxonomy/session-summary behavior.
- General SQLite schema migration, retention, revocation, export, audit, dashboard, server, or administrative workflow changes unless root-cause evidence proves a narrowly scoped retrieval index change essential and the canonical plan is re-reviewed before implementation.
